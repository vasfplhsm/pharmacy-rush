import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { Client, type Room } from '@colyseus/sdk';
import { canStand, COLORS, type GameView } from '@pharmacy/shared';

const PORT = 2679;
const endpoint = `ws://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type TestRoom = Room<any, GameView>;
let processHandle: ChildProcess;
let serverOutput = '';
const rooms = new Set<TestRoom>();

async function until(predicate: () => boolean, description: string, timeout = 4000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${description}. Server output:\n${serverOutput.slice(-5000)}`);
}

async function connect(client: Client, code?: string, name = 'Player', color = COLORS[0]): Promise<TestRoom> {
  const room = code
    ? await client.join<GameView>('pharmacy', { code, name, color })
    : await client.create<GameView>('pharmacy', { name, color });
  // Feedback is expected for intentionally rejected actions; consume it without SDK warnings.
  room.onMessage('feedback', () => {});
  rooms.add(room);
  await until(() => !!room.state?.players?.get(room.sessionId), 'initial authoritative state');
  return room;
}

beforeAll(async () => {
  processHandle = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), SERVER_TEST_MODE: '1', ROUND_DURATION_SECONDS: '300' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout?.on('data', chunk => { serverOutput += String(chunk); });
  processHandle.stderr?.on('data', chunk => { serverOutput += String(chunk); });
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) return;
    } catch { /* The child is still starting. */ }
    if (processHandle.exitCode !== null) throw new Error(`Test server exited: ${serverOutput}`);
    await sleep(100);
  }
  throw new Error(`Test server did not start: ${serverOutput}`);
}, 20000);

afterAll(async () => {
  await Promise.all([...rooms].map(async room => {
    room.reconnection.enabled = false;
    if (room.connection?.isOpen) {
      try { await room.leave(); } catch { /* Already disconnected by this test. */ }
    }
  }));
  if (processHandle && processHandle.exitCode === null) {
    const exited = new Promise<void>(resolve => processHandle.once('exit', () => resolve()));
    processHandle.kill('SIGTERM');
    await Promise.race([exited, sleep(2000)]);
    if (processHandle.exitCode === null) processHandle.kill('SIGKILL');
  }
});

describe('real Colyseus server and SDK clients', () => {
  let players: TestRoom[];
  let code: string;

  it('joins four distinct sessions using a six-character public code, and rejects a fifth', async () => {
    const host = await connect(new Client(endpoint), undefined, 'Host');
    code = host.state.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(code).not.toBe(host.roomId);
    await expect(new Client(endpoint).joinById(host.roomId,{name:'Code-less intruder'})).rejects.toThrow(/code/i);
    players = [host];
    for (let i = 1; i < 4; i++) {
      players.push(await connect(new Client(endpoint), code, `Player ${i + 1}`, COLORS[i]));
    }
    await until(() => players.every(room => room.state.players.size === 4), 'four players visible to every client');
    expect(new Set(players.map(room => room.sessionId)).size).toBe(4);
    expect(new Set([...host.state.players.values()].map(player => player.color)).size).toBe(4);
    expect(host.state.hostId).toBe(host.sessionId);
    await expect(new Client(endpoint).join('pharmacy', { code, name: 'Fifth' })).rejects.toThrow();
    expect(host.state.players.size).toBe(4);
  }, 12000);

  it('rejects host spoofing and start requests before all connected players are ready', async () => {
    const [host, guest] = players;
    host.send('start');
    await sleep(150);
    expect(host.state.phase).toBe('lobby');
    players.forEach(room => room.send('ready', true));
    await until(() => [...host.state.players.values()].every(player => player.ready), 'all players ready');
    guest.send('start', { hostId: host.sessionId });
    await sleep(150);
    expect(host.state.phase).toBe('lobby');
  });

  it('transfers host immediately on a drop, then restores the same player using its reconnection token', async () => {
    const oldHost = players[0];
    const oldSession = oldHost.sessionId;
    const token = oldHost.reconnectionToken;
    oldHost.reconnection.enabled = false;
    oldHost.connection.close(4010, 'Integration test simulated transport interruption');
    await until(() => players[1].state.hostId !== oldSession && !players[1].state.players.get(oldSession)?.connected, 'host transfer and disconnect state');
    expect(players[1].state.players.size).toBe(4);
    const restored = await new Client(endpoint).reconnect<GameView>(token);
    rooms.add(restored);
    restored.onMessage('feedback', () => {});
    players[0] = restored;
    await until(() => !!restored.state?.players?.get(oldSession)?.connected, 'restored identity');
    expect(restored.sessionId).toBe(oldSession);
    expect(restored.state.players.size).toBe(4);
    expect([...restored.state.players.values()].filter(player => player.id === oldSession)).toHaveLength(1);
    expect(restored.state.hostId).not.toBe(oldSession);
  }, 10000);

  it('starts a 300-second authoritative round and rejects new entrants into the match', async () => {
    players.forEach(room => room.send('ready', true));
    const hostId = players[1].state.hostId;
    const host = players.find(room => room.sessionId === hostId)!;
    await until(() => [...host.state.players.values()].every(player => player.ready), 'reconnected player ready');
    host.send('start');
    await until(() => players.every(room => room.state.phase === 'playing'), 'all clients entering the round');
    expect(host.state.remaining).toBeGreaterThan(298);
    expect(host.state.remaining).toBeLessThanOrEqual(300);
    expect(host.state.orders.size).toBeGreaterThan(0);
    await expect(new Client(endpoint).join('pharmacy', { code, name: 'Late player' })).rejects.toThrow();
    expect(host.state.players.size).toBe(4);
  }, 8000);

  it('rejects distant station interaction and coordinate/score forgery', async () => {
    const room = players[0];
    const initialPlayer = room.state.players.get(room.sessionId)!;
    const initial = { x: initialPlayer.x, y: initialPlayer.y };
    room.send('interact', { stationId: 'screen' });
    room.send('move', { x: NaN, y: Infinity, seq: 1 });
    room.send('move', { x: 100000, y: -100000, seq: 2, position: { x: 160, y: 260 }, score: 99999 });
    await sleep(250);
    const after = room.state.players.get(room.sessionId)!;
    expect(room.state.items.size).toBe(0);
    expect(after.carrying).toBe('');
    expect(room.state.score).toBe(0);
    expect(Math.hypot(after.x - initial.x, after.y - initial.y)).toBeLessThan(70);
    expect(canStand(after.x, after.y)).toBe(true);
  });

  it('synchronizes bounded movement, stops stale input, and collides with station solids', async () => {
    const mover = players[2];
    const id = mover.sessionId;
    const start = { x: mover.state.players.get(id)!.x, y: mover.state.players.get(id)!.y };
    let seq = 100;
    const begin = Date.now();
    while (Date.now() - begin < 2000) {
      mover.send('move', { x: 0, y: -1, seq: seq++ });
      await sleep(50);
    }
    mover.send('move', { x: 0, y: 0, seq: seq++ });
    await until(() => players.every(room => Math.abs(room.state.players.get(id)!.y - mover.state.players.get(id)!.y) < 1), 'synchronized movement');
    const after = mover.state.players.get(id)!;
    expect(after.y).toBeLessThan(start.y - 40);
    expect(Math.hypot(after.x - start.x, after.y - start.y)).toBeLessThanOrEqual(430);
    expect(canStand(after.x, after.y)).toBe(true);
    // The shared middle counter blocks this upward path (spawn x568).
    expect(after.y).toBeGreaterThanOrEqual(457 - 1);
    mover.send('move', { x: -1, y: 0, seq: seq++ });
    await sleep(700);
    const stopped = { x: mover.state.players.get(id)!.x, y: mover.state.players.get(id)!.y };
    await sleep(500);
    const stale = mover.state.players.get(id)!;
    expect(Math.hypot(stale.x - stopped.x, stale.y - stopped.y)).toBeLessThan(1);
  }, 7000);

  it('rejects an invented client score command without awarding points or stopping the other clients', async () => {
    const attacker = players[0];
    attacker.reconnection.enabled = false;
    attacker.send('score', { score: 99999 });
    await until(() => !attacker.connection.isOpen, 'server rejection of an unregistered score command');
    await until(() => !players[1].state.players.get(attacker.sessionId)?.connected, 'rejected client marked disconnected');
    expect(players[1].state.score).toBe(0);
    expect(players[1].state.phase).toBe('playing');
    expect(players[1].connection.isOpen).toBe(true);
  });
});
