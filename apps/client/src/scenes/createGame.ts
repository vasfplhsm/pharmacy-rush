import Phaser from 'phaser';
import { WORLD, STATIONS, PRODUCTS, INTERACT_RANGE, SPEED, movePosition, stationDistance, parseContents, type GameView, type PlayerView, type ItemView, type Station } from '@pharmacy/shared';

export interface GameBridge {
  getState: () => GameView | undefined;
  getSessionId: () => string;
  send: (type: string, data?: unknown) => void;
  onHint: (text: string) => void;
  isReducedMotion: () => boolean;
  onEscape: () => void;
}
const TEAL = 0x184e49;
const INK = '#244f49';
const font = '"Trebuchet MS", Arial, sans-serif';
const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
interface Avatar { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Container; eyes: Phaser.GameObjects.Graphics; legs: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; carry?: Phaser.GameObjects.Container; carrying: string; lastX: number; lastY: number }

/** Original art is drawn locally with Phaser Graphics. No remote assets are used. */
export function createGame(container: HTMLElement, bridge: GameBridge): { destroy: () => void } {
  const previousPosition = container.style.position;
  container.style.position = 'relative';
  container.style.touchAction = 'none';
  const keys = new Set<string>();
  let joyX = 0, joyY = 0, dash = false, seq = 0, disposed = false;
  let predictedDashUntil = 0, lastDashAt = -10000;
  let nearest: Station | undefined;
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || !!document.querySelector('dialog[open]');
  const sendAction = (action: string) => {
    if (bridge.getState()?.phase !== 'playing' || typing()) return;
    // Let the authoritative server prioritize nearby floor objects before stations.
    if (action === 'interact') bridge.send('interact', {});
    else bridge.send(action);
  };
  const readIntent = () => {
    let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joyX;
    let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + joyY;
    if (bridge.getState()?.phase !== 'playing' || typing() || document.hidden) x = y = 0;
    const length = Math.max(1, Math.hypot(x, y));
    return { x: x / length, y: y / length };
  };
  // Networking must not depend on render FPS. Low-powered devices and background
  // tabs can throttle requestAnimationFrame while the authoritative server runs.
  function sendMove() {
    if (disposed || bridge.getState()?.phase !== 'playing') return;
    const { x, y } = readIntent();
    const state = bridge.getState(), player = state?.players.get(bridge.getSessionId());
    const now = performance.now();
    if (dash && Math.hypot(x, y) > 0 && player && state && player.dashReadyAt <= state.elapsed && now - lastDashAt >= 3000) {
      lastDashAt = now; predictedDashUntil = now + 170;
    }
    bridge.send('move', { x, y, seq: ++seq, dash });
    dash = false;
  }
  const stop = () => { keys.clear(); joyX = joyY = 0; dash = false; bridge.send('move', { x: 0, y: 0, seq: ++seq, dash: false }); };
  const keyDown = (event: KeyboardEvent) => {
    if (typing()) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyE') sendAction('interact');
    if (event.code === 'KeyQ') sendAction('drop');
    if (event.code === 'Space') dash = true;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) sendMove();
    if (event.code === 'Escape') { stop(); bridge.onEscape(); }
  };
  const keyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) sendMove();
  };
  const visibility = () => { if (document.hidden) stop(); };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', visibility);
  const focus = () => { if (typing()) stop(); };
  document.addEventListener('focusin', focus);
  const inputTimer = window.setInterval(sendMove, 50);

  // DOM touch controls remain comfortably sized even when the canvas scales down.
  const touch = document.createElement('div');
  touch.className = 'pharmacy-touch-controls';
  touch.setAttribute('aria-label', 'Touch game controls');
  touch.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;display:none';
  const pad = document.createElement('div');
  pad.setAttribute('role', 'application'); pad.setAttribute('aria-label', 'Movement joystick');
  pad.style.cssText = 'position:absolute;left:18px;bottom:15px;width:108px;height:108px;border-radius:50%;background:#e9f5e6bb;border:3px solid #23594b66;pointer-events:auto;touch-action:none;box-shadow:0 3px 12px #164d4826';
  const thumb = document.createElement('div');
  thumb.style.cssText = 'position:absolute;left:32px;top:32px;width:38px;height:38px;border:3px solid #fff9;border-radius:50%;background:#3b9a88;box-shadow:0 2px 0 #174d49';
  pad.append(thumb); touch.append(pad);
  let pointer = -1;
  const setJoy = (event: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    let x = (event.clientX - r.left - r.width / 2) / 36;
    let y = (event.clientY - r.top - r.height / 2) / 36;
    const length = Math.max(1, Math.hypot(x, y)); x /= length; y /= length;
    joyX = x; joyY = y; thumb.style.transform = `translate(${x * 29}px,${y * 29}px)`;
  };
  pad.onpointerdown = e => { e.preventDefault(); pointer = e.pointerId; pad.setPointerCapture(pointer); setJoy(e); };
  pad.onpointermove = e => { if (e.pointerId === pointer) setJoy(e); };
  const endJoy = () => { pointer = -1; joyX = joyY = 0; thumb.style.transform = ''; };
  pad.onpointerup = endJoy; pad.onpointercancel = endJoy; pad.onlostpointercapture = endJoy;
  const controls = document.createElement('div');
  controls.style.cssText = 'position:absolute;right:16px;bottom:16px;display:flex;align-items:end;gap:9px;pointer-events:auto';
  for (const [label, action, large] of [['DROP', 'drop', false], ['DASH', 'dash', false], ['INTERACT', 'interact', true]] as const) {
    const button = document.createElement('button');
    button.textContent = label; button.setAttribute('aria-label', label);
    button.style.cssText = `touch-action:none;border:3px solid #fff9;border-radius:50%;width:${large ? 86 : 58}px;height:${large ? 86 : 58}px;font:bold ${large ? 12 : 10}px ${font};color:#fff;background:${large ? '#df786a' : '#28786a'};box-shadow:0 4px 0 #164d48;cursor:pointer`;
    button.onpointerdown = e => { e.preventDefault(); if (action === 'dash') { dash = true; sendMove(); } else sendAction(action); };
    controls.append(button);
  }
  touch.append(controls); container.append(touch);
  const updateTouch = () => { touch.style.display = (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches) ? 'block' : 'none'; };
  updateTouch(); window.addEventListener('resize', updateTouch);

  class PharmacyScene extends Phaser.Scene {
    private avatars = new Map<string, Avatar>();
    private objects = new Map<string, { root: Phaser.GameObjects.Container; signature: string }>();
    private stationGlow!: Phaser.GameObjects.Graphics;
    private jamText!: Phaser.GameObjects.Text;
    private queueText!: Phaser.GameObjects.Text;
    private local = { x: 0, y: 0, initialized: false };
    private previousScore = 0;
    private lastHint = '';
    private particles: { circle: Phaser.GameObjects.Arc; vx: number; vy: number; life: number }[] = [];
    constructor() { super('pharmacy'); }
    private label(x: number, y: number, text: string, size = 16, fill = INK, bold = false) {
      return this.add.text(x, y, text, { fontFamily: font, fontSize: `${size}px`, color: fill, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(.5);
    }
    create() {
      this.cameras.main.setBackgroundColor('#f8efd9');
      this.drawWorld();
      this.stationGlow = this.add.graphics().setDepth(2);
      this.jamText = this.label(1080, 280, '', 17, '#c36351', true).setDepth(5);
      this.queueText = this.label(1080, 56, 'READY FOR A GOOD SHIFT', 12, '#e2efd9', true);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.particles = []; });
    }
    private drawWorld() {
      const g = this.add.graphics();
      // Rounded outer frame, bevelled walls, and a warm checkerboard tile floor.
      g.fillStyle(0xc6d6b6); g.fillRoundedRect(18, 70, 1244, 624, 18);
      g.fillStyle(0xeff0d7); g.fillRect(42, 90, 1196, 586);
      for (let row = 0; row < 12; row++) for (let col = 0; col < 24; col++) {
        const x = 42 + col * 50, y = 90 + row * 50;
        g.fillStyle((row + col) % 2 ? 0xe8eed6 : 0xf1f1df); g.fillRect(x, y, Math.min(49, 1238 - x), Math.min(49, 676 - y));
      }
      g.fillStyle(0x356f5c); g.fillRoundedRect(24, 18, 1232, 76, 14);
      g.fillStyle(0x1f5449); g.fillRect(42, 82, 1196, 12);
      g.fillStyle(0x9dbf9e); g.fillRect(27, 95, 15, 580); g.fillRect(1238, 95, 15, 580);
      g.fillStyle(0x91ac8a); g.fillRect(42, 676, 1196, 12);
      // Front door and dashed circulation route.
      g.fillStyle(0x609981); g.fillRoundedRect(382, 670, 220, 21, 5);
      this.label(491, 705, 'STAFF ENTRANCE', 10, '#6d8e72', true);
      g.lineStyle(3, 0xcbd8b6, .8);
      for (let x = 332; x < 956; x += 35) g.lineBetween(x, 290, x + 14, 290);
      for (let y = 304; y < 603; y += 35) g.lineBetween(920, y, 920, y + 14);
      for (let x = 333; x < 902; x += 35) g.lineBetween(x, 616, x + 14, 616);
      this.label(640, 61, 'FARMASI PESAKIT LUAR', 23, '#f7efcd', true);
      this.label(640, 36, 'HOSPITAL SERI MANJUNG  •  MORNING SHIFT', 10, '#c1dcc0', true);
      // Original pharmacy crest.
      g.fillStyle(0xf5edcd); g.fillRoundedRect(58, 32, 40, 40, 11);
      g.fillStyle(0x4c927d); g.fillRect(73, 40, 10, 24); g.fillRect(66, 47, 24, 10);
      this.label(177, 51, 'FPL / HSM', 19, '#f8efd7', true);
      g.fillStyle(0x153f39); g.fillRoundedRect(963, 31, 233, 45, 7);
      this.label(1080, 41, 'QUEUE DISPLAY', 9, '#8ccbb0', true);
      // A waiting nook off the work route, with tiny patient portraits.
      g.fillStyle(0xe0e9ce); g.fillRoundedRect(73, 300, 242, 147, 16);
      this.label(194, 321, 'WAITING LOUNGE', 11, '#6a957a', true);
      for (let i = 0; i < 3; i++) {
        const x = 120 + i * 71;
        g.fillStyle(0xb6cda4); g.fillRoundedRect(x - 20, 377, 40, 37, 6);
        g.fillStyle([0xf2b59b, 0x80bba8, 0xd7b278][i]); g.fillRoundedRect(x - 13, 367, 26, 32, 8);
        g.fillStyle([0xf4c6a1, 0xc9906d, 0xe3ac84][i]); g.fillCircle(x, 355, 12);
        g.fillStyle(0x5f5949); g.fillRoundedRect(x - 12, 342, 24, 11, 6);
        g.fillStyle(0x385344); g.fillCircle(x - 4, 355, 1.3); g.fillCircle(x + 4, 355, 1.3);
      }
      this.label(192, 431, 'Tiny patients. Big appreciation.', 10, '#819879');
      this.plant(g, 83, 635); this.plant(g, 1197, 632); this.plant(g, 1202, 121);
      // Framed shift encouragement.
      g.fillStyle(0xb4cfb0); g.fillRoundedRect(491, 476, 279, 72, 10);
      g.fillStyle(0xf6f0d9); g.fillRoundedRect(497, 482, 267, 60, 7);
      this.label(630, 503, 'A little teamwork goes a long way.', 15, '#62917c', true);
      this.label(630, 525, 'SCREEN  →  FILL  →  LABEL  →  CHECK  →  DISPENSE', 9, '#91a485', true);
      STATIONS.forEach(s => this.drawStation(g, s));
      // Bake hundreds of original vector details once; only moving actors redraw.
      g.generateTexture('pharmacy-floor', WORLD.width, WORLD.height);
      this.add.image(0, 0, 'pharmacy-floor').setOrigin(0).setDepth(-10);
      g.destroy();
    }
    private plant(g: Phaser.GameObjects.Graphics, x: number, y: number) {
      g.fillStyle(0xbea482); g.fillRoundedRect(x - 12, y - 4, 24, 22, 5);
      g.fillStyle(0x4a9272); g.fillEllipse(x - 7, y - 12, 13, 26); g.fillEllipse(x + 8, y - 12, 13, 26); g.fillEllipse(x, y - 20, 13, 30);
      g.fillStyle(0x75b18b); g.fillEllipse(x, y - 22, 6, 19);
    }
    private drawStation(g: Phaser.GameObjects.Graphics, s: Station) {
      const c = color(s.color);
      g.fillStyle(0x426b54, .15); g.fillRoundedRect(s.x - 3, s.y + 9, s.w + 6, s.h + 9, 10);
      g.fillStyle(0x81967c); g.fillRoundedRect(s.x, s.y + 7, s.w, s.h, 8);
      g.fillStyle(c); g.fillRoundedRect(s.x, s.y, s.w, s.h, 8);
      g.fillStyle(0xfff7dc, .8); g.fillRoundedRect(s.x + 5, s.y + 5, s.w - 10, s.h - 15, 5);
      g.fillStyle(c); g.fillRect(s.x + 7, s.y + s.h - 11, s.w - 14, 4);
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (s.kind === 'shelf') {
        for (let j = 0; j < 6; j++) {
          const px = s.x + 13 + j % 3 * 28, py = s.y + 11 + Math.floor(j / 3) * 22;
          g.fillStyle(c); g.fillRoundedRect(px, py, 23, 18, 3);
          g.fillStyle(0xffffff, .8); g.fillRect(px + 5, py + 4, 13, 4); g.fillRect(px + 10, py + 10, 4, 4);
        }
      } else if (s.kind === 'screen') {
        g.fillStyle(0x4d796b); g.fillRoundedRect(cx - 35, cy - 21, 62, 34, 4);
        g.fillStyle(0xc9ead6); g.fillRect(cx - 30, cy - 16, 52, 23);
        g.fillStyle(0x6dad96); g.fillRect(cx - 25, cy - 10, 28, 3); g.fillRect(cx - 25, cy - 3, 38, 3);
        g.fillStyle(0x4d796b); g.fillRect(cx - 10, cy + 12, 12, 9); g.fillRect(cx - 22, cy + 20, 36, 4);
        g.fillStyle(0xffffff); g.fillRect(cx + 35, cy - 8, 19, 25); g.lineStyle(2, c); g.lineBetween(cx + 39, cy, cx + 49, cy); g.lineBetween(cx + 39, cy + 6, cx + 49, cy + 6);
      } else if (s.kind === 'label') {
        g.fillStyle(0x557b80); g.fillRoundedRect(cx - 31, cy - 11, 62, 32, 5);
        g.fillStyle(0xb4ced0); g.fillRoundedRect(cx - 25, cy - 16, 50, 18, 3);
        g.fillStyle(0xffffff); g.fillRect(cx - 19, cy - 28, 38, 25);
        g.fillStyle(0x75978e); for (let i = 0; i < 6; i++) g.fillRect(cx - 14 + i * 5, cy - 20, 2, 13);
        g.fillStyle(0xa5e0b0); g.fillCircle(cx + 20, cy + 7, 3);
      } else if (s.kind === 'check') {
        g.lineStyle(6, 0x6c6d87); g.strokeCircle(cx - 6, cy - 5, 15); g.lineBetween(cx + 7, cy + 8, cx + 24, cy + 23);
        g.lineStyle(2, 0xbad3d4); g.lineBetween(cx - 15, cy - 10, cx - 6, cy - 16);
        g.fillStyle(0xffffff); g.fillRect(cx - 51, cy - 15, 20, 32); this.label(cx - 41, cy + 1, '✓', 19, '#83a78f', true);
      } else if (s.kind === 'dispense') {
        g.fillStyle(0xefbca0); g.fillRoundedRect(cx - 38, cy - 21, 76, 44, 6);
        g.fillStyle(0xfdf7e4); g.fillRoundedRect(cx - 33, cy - 16, 66, 34, 4);
        g.fillStyle(c); g.fillRect(cx - 4, cy - 9, 8, 22); g.fillRect(cx - 11, cy - 2, 22, 8);
      } else if (s.kind === 'fill') {
        g.fillStyle(0xd1bc91); g.fillRoundedRect(cx - 45, cy - 19, 90, 38, 5);
        g.fillStyle(0xf8edcc); g.fillRoundedRect(cx - 39, cy - 14, 78, 27, 3);
        this.label(cx, cy - 1, 'TRAY BAY', 11, '#b89a64', true);
      } else {
        g.fillStyle(0xd4c6a5); for (let i = 0; i < 3; i++) g.fillRoundedRect(s.x + 13 + i * 46, s.y + 13, 39, 30, 4);
      }
      if (s.step) {
        g.fillStyle(0x244e46); g.fillCircle(s.x + 9, s.y - 8, 15);
        this.label(s.x + 9, s.y - 8, s.step, 12, '#fff4d9', true);
      }
      this.label(cx, s.y + s.h + 28, s.name.toUpperCase(), s.kind === 'shelf' ? 11 : 13, s.kind === 'shelf' ? '#60836c' : '#456e59', true);
    }
    private makeAvatar(p: PlayerView) {
      const root = this.add.container(p.x, p.y);
      const shadow = this.add.ellipse(0, 13, 39, 15, 0x284f3b, .18);
      const body = this.add.container(0, 0);
      const g = this.add.graphics();
      g.fillStyle(0x265c54); g.fillRoundedRect(-14, -1, 28, 29, 6);
      g.fillStyle(0xfff7de); g.fillRoundedRect(-17, -5, 34, 30, 7);
      g.fillStyle(color(p.color)); g.fillRect(-9, -4, 18, 30);
      g.fillStyle(0xfff9e8); g.fillTriangle(-12, -5, -2, -1, -7, 11); g.fillTriangle(12, -5, 2, -1, 7, 11);
      g.fillStyle(0xe8ddbf); g.fillRoundedRect(7, 10, 7, 7, 1);
      g.fillStyle(0xe3ad86); g.fillCircle(-18, 14, 4); g.fillCircle(18, 14, 4);
      g.fillStyle(0xf3c49a); g.fillRoundedRect(-13, -29, 26, 29, 10);
      g.fillStyle(0x5c4a3e); g.fillRoundedRect(-14, -32, 28, 14, 7);
      g.fillStyle(0xf5f5de); g.fillRoundedRect(-15, -34, 30, 10, 4);
      g.fillStyle(color(p.color)); g.fillRect(-12, -30, 24, 4);
      const eyes = this.add.graphics();
      const legs = this.add.graphics();
      body.add([legs, g, eyes]);
      const label = this.add.text(0, -48, p.name, {fontFamily:font,fontSize:'13px',fontStyle:'bold',color:'#244f49',backgroundColor:'#fff8e8',padding:{x:8,y:4}}).setOrigin(.5);
      root.add([shadow, body, label]);
      if (p.id === bridge.getSessionId()) {
        const marker = this.add.triangle(0, -68, 0, 0, 10, 0, 5, 7, 0xf0a65c).setOrigin(.5);
        root.add(marker);
      }
      const avatar: Avatar = {root,body,eyes,legs,label,carrying:'',lastX:p.x,lastY:p.y};
      this.avatars.set(p.id, avatar);
      return avatar;
    }
    private makeItem(item: ItemView, carried = false) {
      const root = this.add.container(0, 0);
      const g = this.add.graphics(); root.add(g);
      if (item.kind === 'package') {
        const product = PRODUCTS.find(p => p.id === item.product) || PRODUCTS[0];
        g.fillStyle(0x37604b,.2); g.fillEllipse(0,14,29,10);
        g.fillStyle(color(product.color)); g.fillRoundedRect(-14,-14,28,29,4);
        g.fillStyle(0xfff9e9); g.fillRoundedRect(-10,-8,20,13,2);
        const symbol = this.add.text(0,-2,product.symbol,{fontFamily:font,fontSize:'14px',color:product.color}).setOrigin(.5); root.add(symbol);
        g.fillStyle(0xffffff,.35); g.fillRect(-12,-12,24,3);
      } else {
        g.fillStyle(0x37604b,.17);g.fillEllipse(0,13,48,13);
        g.fillStyle(0x9dad92);g.fillRoundedRect(-26,-14,52,30,5);
        g.fillStyle(0xfaf4d8);g.fillRoundedRect(-23,-14,46,24,4);
        const contents = parseContents(item.contents);
        let n = 0;
        PRODUCTS.forEach(p => {for(let i=0;i<(contents[p.id]||0);i++){g.fillStyle(color(p.color));g.fillRoundedRect(-18+(n%4)*10,-8+Math.floor(n/4)*10,8,9,2);n++;}});
        if(item.stage === 'labeled' || item.stage === 'checked') {g.fillStyle(0xffffff);g.fillRect(9,-12,12,16);g.lineStyle(1,0x718b7c);for(let i=0;i<3;i++)g.lineBetween(11,-9+i*3,18,-9+i*3);}
        if(item.stage === 'checked') {const tick=this.add.text(17,-19,'✓',{fontFamily:font,fontSize:'20px',fontStyle:'bold',color:'#2c8d65'}).setOrigin(.5);root.add(tick);}
        if(!carried) {const id=this.add.text(0,24,item.orderId.replace('order-','#'),{fontFamily:font,fontSize:'10px',fontStyle:'bold',color:'#4f705a',backgroundColor:'#fff7db',padding:{x:3,y:2}}).setOrigin(.5);root.add(id);}
      }
      if(carried) root.setScale(.8);
      return root;
    }
    private burst(x:number,y:number,fill=0xe8b953) {
      if(bridge.isReducedMotion())return;
      for(let i=0;i<10;i++) {const a=i*Math.PI/5;const circle=this.add.circle(x,y,3+(i%2),fill).setDepth(1000);this.particles.push({circle,vx:Math.cos(a)*80,vy:Math.sin(a)*80-40,life:.6});}
    }
    update(time: number, delta: number) {
      if(disposed)return;
      const state=bridge.getState();if(!state)return;
      const dt=Math.min(delta/1000,.05), localPlayer=state.players.get(bridge.getSessionId());
      const {x:dx,y:dy}=readIntent();
      if(localPlayer){
        if(!this.local.initialized){this.local={x:localPlayer.x,y:localPlayer.y,initialized:true};}
        const distance=Phaser.Math.Distance.Between(this.local.x,this.local.y,localPlayer.x,localPlayer.y);
        // Inputs are predicted immediately, then eased toward authoritative positions.
        const smoothing=distance>110?1:(dx||dy?Math.min(1,dt*5):Math.min(1,dt*14));
        this.local.x+=(localPlayer.x-this.local.x)*smoothing;this.local.y+=(localPlayer.y-this.local.y)*smoothing;
        const pos=movePosition(this.local.x,this.local.y,dx,dy,dt,performance.now()<predictedDashUntil?430:SPEED);
        this.local.x=pos.x;this.local.y=pos.y;
        nearest=STATIONS.filter(s=>stationDistance(this.local.x,this.local.y,s)<=INTERACT_RANGE).sort((a,b)=>stationDistance(this.local.x,this.local.y,a)-stationDistance(this.local.x,this.local.y,b))[0];
        this.stationGlow.clear();
        if(nearest&&state.phase==='playing'){
          this.stationGlow.lineStyle(3,0xf2ba59,bridge.isReducedMotion()?.9:.65+Math.sin(time*.006)*.25);
          this.stationGlow.strokeRoundedRect(nearest.x-6,nearest.y-6,nearest.w+12,nearest.h+12,11);
        }
        const held=state.items.get(localPlayer.carrying);
        const floorItem=!localPlayer.carrying?Array.from(state.items.values()).find(i=>!i.owner&&!i.stationId&&Math.hypot(i.x-this.local.x,i.y-this.local.y)<=58):undefined;
        let hint=nearest?`E · ${nearest.name}`:'WASD / arrows to move · E to pick up';
        if(nearest?.kind==='fill') hint=held?.kind==='package'?'E · Add pack to tray':held?'E · Place tray in filling bay':'E · Retrieve tray from filling bay';
        if(nearest?.kind==='shelf') hint=held?'E · Return unused pack':'E · Collect '+nearest.name;
        if(nearest?.kind==='check')hint='E · Check tray (teammate checks in co-op)';
        if(floorItem)hint='E · Pick up '+(floorItem.kind==='package'?(PRODUCTS.find(p=>p.id===floorItem.product)?.name||'pack'):'order tray');
        if(localPlayer.carrying)hint+='  ·  Q drop';
        if(hint!==this.lastHint){bridge.onHint(hint);this.lastHint=hint;}
      }
      state.players.forEach(p=>{
        let a=this.avatars.get(p.id);if(!a)a=this.makeAvatar(p);
        const isLocal=p.id===bridge.getSessionId();
        const tx=isLocal?this.local.x:p.x,ty=isLocal?this.local.y:p.y;
        if(isLocal)a.root.setPosition(tx,ty);else a.root.setPosition(Phaser.Math.Linear(a.root.x,tx,Math.min(1,dt*14)),Phaser.Math.Linear(a.root.y,ty,Math.min(1,dt*14)));
        a.root.setDepth(a.root.y+30);a.root.setAlpha(p.connected?1:.4);
        const moving=Math.abs(a.root.x-a.lastX)+Math.abs(a.root.y-a.lastY)>.15;
        const bob=bridge.isReducedMotion()?0:(moving?Math.sin(time*.018)*1.8:Math.sin(time*.002)*.6);
        a.body.y=bob;a.legs.clear().fillStyle(0x305b53);
        const stride=moving&&!bridge.isReducedMotion()?Math.sin(time*.018)*3:0;
        a.legs.fillRoundedRect(-11,21+stride,9,9,3);a.legs.fillRoundedRect(3,21-stride,9,9,3);
        a.eyes.clear().fillStyle(0x3d4940);
        if(p.facing!=='up'){const look=p.facing==='left'?-3:p.facing==='right'?3:0;a.eyes.fillCircle(-5+look,-14,1.8);a.eyes.fillCircle(5+look,-14,1.8);a.eyes.lineStyle(1,0xb87e68);a.eyes.lineBetween(-2+look,-7,2+look,-7);}
        a.label.setText(p.name+(p.connected?'':' · reconnecting'));
        const item=state.items.get(p.carrying);const signature=item?`${item.id}:${item.stage}:${item.contents}`:'';
        if(a.carrying!==signature){
          a.carry?.destroy();a.carry=undefined;
          if(item){a.carry=this.makeItem(item,true);a.carry.setPosition(23,3);a.root.add(a.carry);this.burst(a.root.x+20,a.root.y,0xb7d8b3);}
          a.carrying=signature;
        }
        a.lastX=a.root.x;a.lastY=a.root.y;
      });
      for(const [id,a] of this.avatars)if(!state.players.has(id)){a.root.destroy();this.avatars.delete(id);}
      state.items.forEach(item=>{
        if(item.owner){const old=this.objects.get(item.id);if(old){old.root.destroy();this.objects.delete(item.id);}return;}
        const signature=`${item.kind}:${item.product}:${item.stage}:${item.contents}`;
        let entry=this.objects.get(item.id);
        if(!entry||entry.signature!==signature){entry?.root.destroy();entry={root:this.makeItem(item),signature};this.objects.set(item.id,entry);}
        let x=item.x,y=item.y;
        const station=STATIONS.find(s=>s.id===item.stationId);
        if(station){x=station.x+station.w/2;y=station.y+station.h/2;}
        entry.root.setPosition(x,y).setDepth(y+50);
      });
      for(const [id,entry] of this.objects)if(!state.items.has(id)){entry.root.destroy();this.objects.delete(id);}
      if(state.score>this.previousScore){this.burst(205,535);if(!bridge.isReducedMotion())this.cameras.main.shake(100,.0015);}
      this.previousScore=state.score;
      const queued=Array.from(state.orders.values()).filter(o=>o.status==='queued').length;
      this.queueText.setText(`${queued} WAITING   •   ${state.completed} SERVED`);
      const jammed=state.event.toLowerCase().includes('jam')&&state.eventUntil>state.elapsed;
      this.jamText.setText(jammed?`PAPER PARTY!  ${Math.ceil(state.eventUntil-state.elapsed)}s`:'');
      if(jammed&&!bridge.isReducedMotion())this.jamText.rotation=Math.sin(time*.012)*.025;
      this.particles=this.particles.filter(p=>{p.life-=dt;if(p.life<=0){p.circle.destroy();return false;}p.vy+=150*dt;p.circle.x+=p.vx*dt;p.circle.y+=p.vy*dt;p.circle.setAlpha(Math.min(1,p.life*2));return true;});
    }
  }
  const game=new Phaser.Game({type:Phaser.CANVAS,parent:container,width:WORLD.width,height:WORLD.height,backgroundColor:'#f8efd9',antialias:true,roundPixels:true,scene:[PharmacyScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{powerPreference:'low-power'},audio:{noAudio:true}});
  return {destroy:()=>{
    if(disposed)return;stop();disposed=true;window.clearInterval(inputTimer);game.destroy(true);touch.remove();container.style.position=previousPosition;
    window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',focus);window.removeEventListener('resize',updateTouch);
  }};
}
