import {describe,it,expect} from 'vitest';
import {GameSimulation} from '../apps/server/src/simulation/GameSimulation';
import {GameState} from '../apps/server/src/state/GameState';
import {reserveCode,releaseCode,CODE_ALPHABET} from '../apps/server/src/services/roomCodes';
import {displayName,RateLimit} from '../apps/server/src/validation/limits';
import {STATIONS,canStand,movePosition,parseContents} from '@pharmacy/shared';
function game(count=1,duration=300){const state=new GameState();state.seed=435;const sim=new GameSimulation(state,duration);for(let i=0;i<count;i++){sim.addPlayer(`p${i}`,`Player${i}`);sim.ready(`p${i}`,true);}sim.start('p0');return sim;}
function at(sim:GameSimulation,id:string,station:string){const s=STATIONS.find(s=>s.id===station)!;const p=sim.state.players.get(id)!;p.x=s.x+s.w/2;p.y=s.y+s.h+38;}
function action(sim:GameSimulation,station:string,id='p0'){at(sim,id,station);sim.interact(id,station);}
function fill(sim:GameSimulation,requirements?:Record<string,number>){
  const order=Array.from(sim.state.orders.values())[0];if(requirements)order.requirements=JSON.stringify(requirements);
  action(sim,'screen');const tray=sim.state.items.get(sim.state.players.get('p0')!.carrying)!;action(sim,'fill');
  for(const[product,quantity]of Object.entries(parseContents(order.requirements))){for(let i=0;i<quantity!;i++){action(sim,`shelf-${product}`);action(sim,'fill');}}
  action(sim,'fill');return {order,tray};
}
describe('secure room identity and lobby rules',()=>{
  it('reserves unique six-character unambiguous room codes',()=>{const codes=Array.from({length:1500},()=>reserveCode());expect(new Set(codes).size).toBe(1500);for(const c of codes){expect(c).toHaveLength(6);expect([...c].every(v=>CODE_ALPHABET.includes(v))).toBe(true);releaseCode(c);}});
  it('limits capacity, allocates unique colors, and requires host/readiness',()=>{
    const sim=new GameSimulation();for(let i=0;i<4;i++)sim.addPlayer(`p${i}`,`Name${i}`);
    expect(()=>sim.addPlayer('fifth','Five')).toThrow('full');expect(new Set([...sim.state.players.values()].map(p=>p.color)).size).toBe(4);
    expect(()=>sim.start('p1')).toThrow('host');expect(()=>sim.start('p0')).toThrow('ready');
    for(const p of sim.connected())sim.ready(p.id,true);sim.start('p0');expect(sim.state.phase).toBe('playing');expect(()=>sim.addPlayer('late','Late')).toThrow('already started');
  });
  it('transfers host on disconnect, retains identity for reconnect and removes expired players',()=>{
    const sim=game(2);const player=sim.state.players.get('p0');sim.disconnect('p0');expect(sim.state.hostId).toBe('p1');expect(player!.connected).toBe(false);sim.reconnect('p0');expect(sim.state.players.get('p0')).toBe(player);expect(player!.connected).toBe(true);expect(sim.state.hostId).toBe('p1');sim.removePlayer('p1');expect(sim.state.hostId).toBe('p0');expect(sim.state.players.size).toBe(1);
  });
  it('limits attempts and bounds display names without interpreting markup',()=>{
    const rate=new RateLimit(2,100);expect(rate.accept('a',0)).toBe(true);expect(rate.accept('a',20)).toBe(true);expect(rate.accept('a',30)).toBe(false);expect(rate.accept('a',101)).toBe(true);
    expect(displayName('  A\u0000B  ')).toBe('AB');expect(displayName('x'.repeat(40))).toHaveLength(16);expect(displayName(null)).toBe('Pharmacist');
  });
});
describe('authoritative movement and ownership',()=>{
  it('prevents walking through counters and world boundaries, including dash substeps',()=>{
    const s=STATIONS.find(s=>s.id==='spare')!;let p={x:s.x+s.w/2,y:s.y+s.h+18};p=movePosition(p.x,p.y,0,-1,.1,430);expect(p.y).toBeGreaterThanOrEqual(s.y+s.h+17);expect(canStand(p.x,p.y)).toBe(true);
    p=movePosition(60,300,-1,0,1);expect(p.x).toBeGreaterThanOrEqual(59);expect(canStand(p.x,p.y)).toBe(true);
  });
  it('rejects nonfinite and out-of-range intents, bounds speed and stops stale inputs',()=>{
    const sim=game();const p=sim.state.players.get('p0')!;const x=p.x;sim.move('p0',{x:Infinity,y:0,seq:1});sim.tick(.1);expect(p.x).toBe(x);sim.move('p0',{x:99,y:0,seq:2});sim.tick(.1);expect(p.x).toBe(x);sim.move('p0',{x:1,y:1,seq:3});sim.tick(.1);expect(Math.hypot(p.x-x,p.y-520)).toBeCloseTo(20);for(let i=0;i<6;i++)sim.tick(.1);const stopped=p.x;sim.tick(.1);expect(p.x).toBe(stopped);
  });
  it('enforces station range and exclusive floor item ownership',()=>{
    const sim=game(2);expect(()=>sim.interact('p0','screen')).toThrow('closer');action(sim,'screen');const p=sim.state.players.get('p0')!,q=sim.state.players.get('p1')!,item=sim.state.items.get(p.carrying)!;
    sim.drop('p0');q.x=p.x;q.y=p.y;sim.interact('p1');expect(()=>sim.interact('p0')).toThrow();expect(item.owner).toBe('p1');expect(q.carrying).toBe(item.id);expect(p.carrying).not.toBe(item.id);
  });
  it('releases a disconnected player’s carried object at a valid location',()=>{const sim=game(2);action(sim,'screen');const p=sim.state.players.get('p0')!,item=sim.state.items.get(p.carrying)!;sim.disconnect('p0');expect(p.carrying).toBe('');expect(item.owner).toBe('');expect(item.stationId).toBe('');expect(canStand(item.x,item.y)).toBe(true);});
});
describe('complete fictional order workflow',()=>{
  it('requires screening, packages, labels and checks; awards125 only once',()=>{
    const sim=game();const {order,tray}=fill(sim,{mint:1});expect(tray.stage).toBe('filled');expect(order.status).toBe('filled');action(sim,'label');expect(tray.stage).toBe('labeled');action(sim,'check');expect(tray.stage).toBe('checked');action(sim,'dispense');expect(sim.state.score).toBe(125);expect(sim.state.completed).toBe(1);expect(sim.state.orders.has(order.id)).toBe(false);expect(()=>action(sim,'dispense')).toThrow('Carry');expect(sim.state.completed).toBe(1);
  });
  it('rejects wrong packages atomically and allows returning a wrong package',()=>{
    const sim=game();const o=[...sim.state.orders.values()][0];o.requirements='{"mint":1}';action(sim,'screen');action(sim,'fill');action(sim,'shelf-coral');const p=sim.state.players.get('p0')!,pack=p.carrying;action(sim,'fill');expect(p.carrying).toBe(pack);expect(sim.state.mistakes).toBe(1);expect(sim.state.score).toBe(0);expect(sim.state.items.get(o.trayId)!.contents).toBe('{}');action(sim,'shelf-coral');expect(p.carrying).toBe('');expect(sim.state.items.has(pack)).toBe(false);
  });
  it('completes double product and quantity combinations',()=>{
    const sim=game();const {tray}=fill(sim,{mint:2,blue:1});expect(tray.contents).toBe('{"mint":2,"blue":1}');action(sim,'label');action(sim,'check');action(sim,'dispense');expect(sim.state.completed).toBe(1);
  });
  it('requires another teammate to check a multiplayer tray, with an atomic handoff',()=>{
    const sim=game(2);const {tray}=fill(sim,{mint:1});action(sim,'label');expect(()=>action(sim,'check')).toThrow('another teammate');action(sim,'spare');action(sim,'spare','p1');action(sim,'check','p1');expect(tray.stage).toBe('checked');action(sim,'dispense','p1');expect(sim.state.score).toBe(125);
  });
  it('penalizes incorrect dispensing without completing; no negative score',()=>{
    const sim=game();action(sim,'screen');const id=sim.state.players.get('p0')!.carrying;action(sim,'dispense');expect(sim.state.score).toBe(0);expect(sim.state.mistakes).toBe(1);expect(sim.state.completed).toBe(0);expect(sim.state.items.has(id)).toBe(true);
  });
  it('awards100 for expired orders and blocks all interactions at round end',()=>{
    const sim=game(1,1);const {order}=fill(sim,{mint:1});order.deadline=-1;action(sim,'label');action(sim,'check');action(sim,'dispense');expect(sim.state.score).toBe(100);for(let i=0;i<11;i++)sim.tick(.1);expect(sim.state.phase).toBe('results');expect(sim.state.remaining).toBe(0);const size=sim.state.items.size;action(sim,'screen');expect(sim.state.items.size).toBe(size);expect(()=>sim.replay('fake')).toThrow('host');sim.replay('p0');expect(sim.state.phase).toBe('playing');expect(sim.state.score).toBe(0);expect(sim.state.completed).toBe(0);
  });
  it('keeps the first minute easy, then creates seeded rush, jam and double events',()=>{
    const sim=game();for(let i=0;i<599;i++)sim.tick(.1);expect(sim.state.event).toBe('');for(let i=0;i<2;i++)sim.tick(.1);expect(sim.state.event).toBe('rush');for(let i=0;i<350;i++)sim.tick(.1);expect(sim.state.event).toBe('jam');for(let i=0;i<350;i++)sim.tick(.1);expect(sim.state.event).toBe('double');expect([...sim.state.orders.values()].some(o=>Object.keys(parseContents(o.requirements)).length===2)).toBe(true);
  });
});
