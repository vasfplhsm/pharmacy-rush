import {COLORS, STATIONS, PRODUCTS, ROUND_SECONDS, INTERACT_RANGE, movePosition, stationDistance, matches, parseContents, type Requirements, type ProductId, type Station} from '@pharmacy/shared';
import {GameState,PlayerState,OrderState,ItemState} from '../state/GameState.js';
export class RuleError extends Error {}
interface Intent {x:number;y:number;seq:number;at:number;dashUntil:number}
export interface Feedback {text:string;kind:'success'|'error'|'info'}
export const SCORE={correct:100,onTime:25,mistake:75,stars:[500,1000,1500]};
export class GameSimulation {
  private nextId=0;
  private rng:number;
  private clock=0;
  private nextOrderAt=0;
  private nextEventAt=60;
  private eventIndex=0;
  private intents=new Map<string,Intent>();
  constructor(public state=new GameState(),private duration=ROUND_SECONDS,private notify:(id:string,feedback:Feedback)=>void=()=>{}){this.rng=state.seed||1;state.remaining=duration;}
  private random(){this.rng^=this.rng<<13;this.rng^=this.rng>>>17;this.rng^=this.rng<<5;return (this.rng>>>0)/4294967296;}
  connected(){return Array.from(this.state.players.values()).filter(p=>p.connected);}
  addPlayer(id:string,name:string,color?:string){
    if(this.state.phase!=='lobby')throw new RuleError('This shift has already started. Join a lobby for the next shift.');
    if(this.state.players.size>=4)throw new RuleError('This room is full (4 players).');
    const p=new PlayerState();p.id=id;p.name=name;
    const used=new Set(Array.from(this.state.players.values()).map(v=>v.color));
    p.color=COLORS.includes(color||'')&&!used.has(color!)?color!:COLORS.find(c=>!used.has(c))!;
    p.x=440+this.state.players.size*64;p.y=520;
    this.state.players.set(id,p);if(!this.state.hostId)this.state.hostId=id;
    return p;
  }
  disconnect(id:string){const p=this.state.players.get(id);if(!p)return;p.connected=false;p.ready=false;this.drop(id);this.intents.delete(id);this.transferHost();}
  reconnect(id:string){const p=this.player(id);p.connected=true;if(!this.state.hostId)this.state.hostId=id;}
  removePlayer(id:string){this.disconnect(id);this.state.players.delete(id);this.transferHost();}
  private transferHost(){if(!this.state.players.get(this.state.hostId)?.connected)this.state.hostId=this.connected()[0]?.id||'';}
  private player(id:string){const p=this.state.players.get(id);if(!p)throw new RuleError('Player is no longer in this room.');return p;}
  ready(id:string,value?:boolean){const p=this.player(id);if(this.state.phase!=='lobby')return;p.ready=typeof value==='boolean'?value:!p.ready;}
  color(id:string,color:unknown){const p=this.player(id);if(this.state.phase!=='lobby'||typeof color!=='string'||!COLORS.includes(color))return;if(Array.from(this.state.players.values()).some(o=>o.id!==id&&o.color===color))throw new RuleError('That apron color is already taken.');p.color=color;}
  start(id:string){
    if(this.state.phase!=='lobby')throw new RuleError('A shift is already in progress.');
    if(this.state.hostId!==id)throw new RuleError('Only the current host can start the shift.');
    if(!this.connected().length||!this.connected().every(p=>p.ready))throw new RuleError('Everyone must be ready before the shift starts.');
    this.resetRound();this.state.phase='playing';this.state.notice='Morning Shift · screen your first order!';this.spawnOrder();
    this.nextOrderAt=14;
  }
  lobby(id:string){if(this.state.hostId!==id)throw new RuleError('Only the host can return the team to the lobby.');if(this.state.phase!=='results')throw new RuleError('Finish this shift first.');this.state.phase='lobby';for(const p of this.state.players.values()){p.ready=false;p.carrying='';}this.state.items.clear();this.state.orders.clear();this.state.event='';this.state.remaining=this.duration;this.state.elapsed=0;this.state.notice='Ready for another shift?';}
  replay(id:string){this.lobby(id);for(const p of this.connected())p.ready=true;this.start(id);}
  private resetRound(){this.state.score=0;this.state.completed=0;this.state.mistakes=0;this.state.remaining=this.duration;this.state.elapsed=0;this.state.items.clear();this.state.orders.clear();this.state.event='';this.state.eventUntil=0;this.clock=0;this.nextEventAt=60;this.eventIndex=0;this.nextOrderAt=0;this.intents.clear();let i=0;for(const p of this.state.players.values()){p.carrying='';p.x=440+i++*64;p.y=520;p.dashReadyAt=0;p.lastSeq=0;}}
  move(id:string,data:unknown){
    if(this.state.phase!=='playing'||!data||typeof data!=='object')return;
    const p=this.state.players.get(id);if(!p?.connected)return;
    const d=data as Record<string,unknown>;
    if(typeof d.x!=='number'||typeof d.y!=='number'||!Number.isFinite(d.x)||!Number.isFinite(d.y)||Math.abs(d.x)>1||Math.abs(d.y)>1||!Number.isSafeInteger(d.seq)||Number(d.seq)<0)return;
    const seq=Number(d.seq),prior=this.intents.get(id);if(prior&&seq<=prior.seq)return;
    let dashUntil=prior?.dashUntil||0;
    if(d.dash===true&&this.clock>=p.dashReadyAt&&Math.hypot(d.x,d.y)>0){dashUntil=this.clock+.17;p.dashReadyAt=this.clock+3;}
    this.intents.set(id,{x:d.x,y:d.y,seq,at:this.clock,dashUntil});
  }
  tick(dt:number){
    if(this.state.phase!=='playing')return;
    dt=Math.max(0,Math.min(.1,dt));this.clock=Math.min(this.duration,this.clock+dt);this.state.elapsed=this.clock;this.state.remaining=Math.max(0,Math.ceil(this.duration-this.clock));
    if(this.clock>=this.duration){this.state.phase='results';this.state.notice='Shift complete! Thank you, team.';this.state.event='';this.intents.clear();return;}
    for(const p of this.connected()){
      const i=this.intents.get(p.id);if(!i||this.clock-i.at>.25)continue;
      const pos=movePosition(p.x,p.y,i.x,i.y,dt,this.clock<i.dashUntil?430:200);p.x=pos.x;p.y=pos.y;p.lastSeq=i.seq;
      if(i.x||i.y)p.facing=Math.abs(i.x)>Math.abs(i.y)?(i.x>0?'right':'left'):(i.y>0?'down':'up');
      const item=this.state.items.get(p.carrying);if(item){item.x=p.x;item.y=p.y;}
    }
    if(this.state.event&&this.clock>=this.state.eventUntil){this.state.event='';this.state.notice='Back to the usual bustle.';}
    if(this.clock>=this.nextEventAt){this.triggerEvent();this.nextEventAt+=35;}
    const count=this.connected().length||1;
    if(this.clock>=this.nextOrderAt){if(this.state.orders.size<Math.min(6,2+count))this.spawnOrder(this.clock>=60&&this.random()<.4);this.nextOrderAt=this.clock+(this.state.event==='rush'?Math.max(7,14-count):Math.max(13,25-count*3));}
  }
  private triggerEvent(){
    const events=['rush','jam','double'];const event=events[this.eventIndex++%events.length];this.state.event=event;this.state.eventUntil=this.clock+(event==='rush'?18:10);
    this.state.notice=event==='rush'?'Rush Hour! A few extra friends in the queue.':event==='jam'?'Printer Jam! The label printer needs 10 seconds.':'Double Order! Two colorful products, one careful check.';
    if(event==='double'&&this.state.orders.size<6)this.spawnOrder(true);
    if(event==='rush'&&this.state.orders.size<Math.min(6,2+(this.connected().length||1)))this.spawnOrder();
  }
  spawnOrder(double=false){
    const o=new OrderState();o.id=`O${++this.nextId}`;o.patient=`Guest ${String(this.nextId).padStart(3,'0')}`;o.createdAt=this.clock;
    const count=this.connected().length||1;o.deadline=this.clock+Math.max(80,150-count*12);
    const first=Math.floor(this.random()*PRODUCTS.length);const req:Requirements={[PRODUCTS[first].id]:this.clock>=60&&this.random()<.35?2:1};
    if(double)req[PRODUCTS[(first+1+Math.floor(this.random()*3))%4].id]=1;
    o.requirements=JSON.stringify(req);this.state.orders.set(o.id,o);return o;
  }
  private say(id:string,text:string,kind:Feedback['kind']='info'){this.notify(id,{text,kind});}
  private carry(p:PlayerState,item:ItemState){if(item.owner)throw new RuleError('Someone already picked that up.');item.owner=p.id;item.stationId='';item.x=p.x;item.y=p.y;p.carrying=item.id;}
  private release(p:PlayerState,item:ItemState,station?:Station){item.owner='';item.x=station?station.x+station.w/2:p.x;item.y=station?station.y+station.h/2:p.y;item.stationId=station?.id||'';p.carrying='';}
  drop(id:string){const p=this.state.players.get(id);if(!p)return;const item=this.state.items.get(p.carrying);if(item)this.release(p,item);else p.carrying='';}
  interact(id:string,stationId?:unknown){
    if(this.state.phase!=='playing')return;
    const p=this.player(id);if(!p.connected)return;
    let station:Station|undefined;
    if(typeof stationId==='string'){
      station=STATIONS.find(s=>s.id===stationId);if(!station||stationDistance(p.x,p.y,station)>INTERACT_RANGE)throw new RuleError('Move closer to that station.');
    }else{
      const ground=Array.from(this.state.items.values()).filter(i=>!i.owner&&!i.stationId&&Math.hypot(i.x-p.x,i.y-p.y)<58).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
      if(!p.carrying&&ground[0]){this.carry(p,ground[0]);this.say(id,'Picked up item.');return;}
      station=STATIONS.filter(s=>stationDistance(p.x,p.y,s)<=INTERACT_RANGE).sort((a,b)=>stationDistance(p.x,p.y,a)-stationDistance(p.x,p.y,b))[0];
      if(!station)throw new RuleError('Move close to a workstation or dropped item.');
    }
    const item=this.state.items.get(p.carrying);
    const placed=Array.from(this.state.items.values()).find(i=>i.stationId===station!.id&&!i.owner);
    switch(station.kind){
      case 'screen':{
        if(item)throw new RuleError('Your hands are full. Put your item down first.');
        const order=Array.from(this.state.orders.values()).find(o=>o.status==='queued');if(!order)throw new RuleError('All current orders have been screened. Help with a tray!');
        const tray=new ItemState();tray.id=`T${++this.nextId}`;tray.orderId=order.id;this.state.items.set(tray.id,tray);this.carry(p,tray);order.trayId=tray.id;order.status='screened';this.say(id,`${order.patient}: take the tray to Fill, then collect its packages.`,'success');break;
      }
      case 'shelf':{
        if(item){if(item.kind==='package'){this.state.items.delete(item.id);p.carrying='';this.say(id,'Package returned to the shelf.');break;}throw new RuleError('Put your tray on the Fill station before collecting packages.');}
        const pack=new ItemState();pack.id=`P${++this.nextId}`;pack.kind='package';pack.product=station.product!;this.state.items.set(pack.id,pack);this.carry(p,pack);this.say(id,`Take ${PRODUCTS.find(v=>v.id===pack.product)?.name} to the tray on Fill.`);break;
      }
      case 'fill':{
        if(!item){if(!placed)throw new RuleError('Place a screened tray here first, then add its packages.');const order=this.state.orders.get(placed.orderId);if(order&&matches(parseContents(placed.contents),parseContents(order.requirements))){placed.stage='filled';order.status='filled';placed.filledBy=p.id;}this.carry(p,placed);this.say(id,placed.stage==='filled'?'Tray filled! Take it to Print label.':'Tray picked up. Still missing packages.');break;}
        if(item.kind==='tray'){
          if(placed)throw new RuleError('Fill is occupied. Pick up its tray or use the shared counter.');
          if(item.stage!=='screened'&&item.stage!=='filled')throw new RuleError('This tray has already passed filling. Continue to its next station.');
          this.release(p,item,station);const order=this.state.orders.get(item.orderId);if(order)order.status='filling';this.say(id,'Tray placed. Collect the required packages from the shelves.');break;
        }
        if(!placed||placed.kind!=='tray')throw new RuleError('Place a screened tray on Fill before adding packages.');
        const order=this.state.orders.get(placed.orderId);if(!order)throw new RuleError('That order is no longer active.');
        const contents=parseContents(placed.contents),requirements=parseContents(order.requirements),product=item.product as ProductId;
        if((contents[product]||0)>=(requirements[product]||0)){this.state.mistakes++;this.state.score=Math.max(0,this.state.score-SCORE.mistake);this.say(id,'Wrong package or quantity! −75. Return it to a shelf; the tray is unchanged.','error');break;}
        contents[product]=(contents[product]||0)+1;placed.contents=JSON.stringify(contents);placed.filledBy=p.id;this.state.items.delete(item.id);p.carrying='';
        if(matches(contents,requirements)){placed.stage='filled';order.status='filled';this.say(id,'Perfect match! Press E again to retrieve the filled tray.','success');}else this.say(id,'Package added. Collect the next package.','success');break;
      }
      case 'label':{
        if(this.state.event==='jam'&&this.clock<this.state.eventUntil)throw new RuleError(`Printer jam! Try again in ${Math.ceil(this.state.eventUntil-this.clock)} seconds.`);
        if(!item||item.kind!=='tray')throw new RuleError('Carry a filled tray here to attach its matching label.');
        const order=this.state.orders.get(item.orderId);if(!order||item.stage!=='filled'||!matches(parseContents(item.contents),parseContents(order.requirements)))throw new RuleError('Fill the correct packages before printing a label.');
        item.stage='labeled';order.status='labeled';this.say(id,'Label attached! Take this tray to Final check.','success');break;
      }
      case 'check':{
        if(!item||item.kind!=='tray')throw new RuleError('Bring a labeled tray for the final check.');
        const order=this.state.orders.get(item.orderId);if(!order||item.stage!=='labeled'||!matches(parseContents(item.contents),parseContents(order.requirements)))throw new RuleError('Check failed. Match all packages and attach the label first.');
        if(this.connected().length>1&&item.filledBy===p.id)throw new RuleError('Team check: pass this tray to another teammate (Q or shared counter). Solo checks are allowed.');
        item.stage='checked';order.status='checked';this.say(id,'Final check passed! Deliver at Dispense.','success');break;
      }
      case 'dispense':{
        if(!item)throw new RuleError('Carry a checked tray to dispense.');
        const order=this.state.orders.get(item.orderId);
        if(item.kind!=='tray'||!order||item.stage!=='checked'||!matches(parseContents(item.contents),parseContents(order.requirements))){this.state.mistakes++;this.state.score=Math.max(0,this.state.score-SCORE.mistake);this.say(id,'Not ready! −75. Complete filling, label, and final check first.','error');break;}
        const points=SCORE.correct+(this.clock<=order.deadline?SCORE.onTime:0);this.state.score+=points;this.state.completed++;this.state.orders.delete(order.id);this.state.items.delete(item.id);p.carrying='';this.state.notice=`${order.patient} served! +${points} · lovely teamwork.`;this.say(id,`Order complete! +${points}`,'success');if(!this.state.orders.size)this.spawnOrder();break;
      }
      case 'counter':{
        if(item){if(placed)throw new RuleError('This shared counter is occupied.');this.release(p,item,station);this.say(id,'Item placed on the shared counter.');}
        else if(placed){this.carry(p,placed);this.say(id,'Item picked up.');}else throw new RuleError('Place a carried item here for a teammate.');break;
      }
    }
  }
}
