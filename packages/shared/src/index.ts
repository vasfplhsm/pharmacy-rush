export const VERSION = '0.1.0';
export const ROUND_SECONDS = 300;
export const SPEED = 200;
export const PLAYER_RADIUS = 17;
export const INTERACT_RANGE = 112;
export const COLORS = ['#37ad9b', '#f27b75', '#eeb84c', '#7a96db'];
export const PRODUCTS = [
  { id: 'mint', name: 'Mintora Pack', color: '#47bca2', symbol: '◆' },
  { id: 'coral', name: 'Coralia Pack', color: '#ed827a', symbol: '♥' },
  { id: 'sun', name: 'Sunberry Pack', color: '#efbb54', symbol: '★' },
  { id: 'blue', name: 'Blueleaf Pack', color: '#7c9edc', symbol: '●' },
] as const;
export type ProductId = typeof PRODUCTS[number]['id'];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Station extends Rect { id: string; name: string; kind: string; product?: ProductId; color: string; step?: string }
export const WORLD = { width: 1280, height: 720, bounds: { x: 42, y: 90, w: 1196, h: 586 } };
export const STATIONS: Station[] = [
  {id:'screen',name:'Screen orders',kind:'screen',x:116,y:150,w:158,h:66,color:'#44ad9b',step:'01'},
  ...PRODUCTS.map((p,i)=>({id:`shelf-${p.id}`,name:p.name,kind:'shelf',product:p.id,x:346+i*138,y:150,w:106,h:66,color:p.color})),
  {id:'fill',name:'Fill tray',kind:'fill',x:998,y:150,w:166,h:66,color:'#e9ae52',step:'02'},
  {id:'label',name:'Print label',kind:'label',x:998,y:330,w:166,h:66,color:'#7a9bd2',step:'03'},
  {id:'check',name:'Final check',kind:'check',x:998,y:510,w:166,h:66,color:'#b69bd0',step:'04'},
  {id:'dispense',name:'Dispense',kind:'dispense',x:116,y:510,w:180,h:66,color:'#ee8b7c',step:'05'},
  {id:'spare',name:'Shared counter',kind:'counter',x:550,y:378,w:158,h:62,color:'#c8b291'},
];
export const SOLIDS: Rect[] = STATIONS;
export function canStand(x:number,y:number):boolean {
  const b = WORLD.bounds, r = PLAYER_RADIUS;
  return Number.isFinite(x)&&Number.isFinite(y)&&x>=b.x+r&&x<=b.x+b.w-r&&y>=b.y+r&&y<=b.y+b.h-r&& !SOLIDS.some(s=>x>s.x-r&&x<s.x+s.w+r&&y>s.y-r&&y<s.y+s.h+r);
}
export function movePosition(x:number,y:number,dx:number,dy:number,dt:number,speed=SPEED):{x:number;y:number} {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)) return {x,y};
  const len=Math.max(1,Math.hypot(dx,dy)); dx/=len;dy/=len;
  const steps=Math.max(1,Math.ceil(speed*dt/8));
  for(let i=0;i<steps;i++){ const nx=x+dx*speed*dt/steps,ny=y+dy*speed*dt/steps;if(canStand(nx,y))x=nx;if(canStand(x,ny))y=ny; }
  return {x,y};
}
export function stationDistance(x:number,y:number,s:Rect):number {return Math.hypot(x-Math.max(s.x,Math.min(x,s.x+s.w)),y-Math.max(s.y,Math.min(y,s.y+s.h)));}
export interface PlayerView { id:string; name:string; color:string; x:number; y:number; facing:string; ready:boolean; connected:boolean; carrying:string; lastSeq:number; dashReadyAt:number }
export interface OrderView { id:string; patient:string; requirements:string; createdAt:number; deadline:number; status:string; trayId:string }
export interface ItemView { id:string; kind:string; product:string; orderId:string; stage:string; contents:string; owner:string; x:number; y:number; stationId:string; filledBy:string }
export interface GameView { code:string; hostId:string; phase:string; players:Map<string,PlayerView>; orders:Map<string,OrderView>; items:Map<string,ItemView>; score:number; completed:number; mistakes:number; remaining:number; elapsed:number; notice:string; event:string; eventUntil:number; seed:number }
export type Requirements = Partial<Record<ProductId, number>>;
export function parseContents(text:string):Requirements {try {return JSON.parse(text);}catch{return {};}}
export function matches(a:Requirements,b:Requirements):boolean {return PRODUCTS.every(p=>(a[p.id]||0)===(b[p.id]||0));}
