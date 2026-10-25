import {test,expect,type Page} from '@playwright/test';
import {STATIONS,canStand,stationDistance,INTERACT_RANGE} from '../../packages/shared/src/index';

type Snap={phase:string;code:string;score:number;remaining:number;hostId:string;sessionId:string;players:any[];orders:any[];items:any[]};
async function snap(page:Page):Promise<Snap>{
 return page.evaluate(()=>{const p=(window as any).__pharmacy;const s=p?.state;if(!s?.players)return {phase:'connecting',players:[],orders:[],items:[]} as any;return {phase:s.phase,code:s.code,score:s.score,remaining:s.remaining,hostId:s.hostId,sessionId:p.sessionId,players:Array.from(s.players.values()).map((v:any)=>({...v.toJSON()})),orders:Array.from(s.orders.values()).map((v:any)=>({...v.toJSON()})),items:Array.from(s.items.values()).map((v:any)=>({...v.toJSON()}))};});
}
async function pos(page:Page){const s=await snap(page);return s.players.find(p=>p.id===s.sessionId);}
// A* uses exactly the collision geometry used by the client and server. All movement
// goes through real keyboard events, never a position or score mutation.
function route(x:number,y:number,tx:number,ty:number):{x:number;y:number}[]{
 const size=24;const start={x:Math.round(x/size),y:Math.round(y/size)},end={x:Math.round(tx/size),y:Math.round(ty/size)};
 const key=(n:{x:number;y:number})=>`${n.x},${n.y}`;const open=[start],prev=new Map<string,string>(),cost=new Map([[key(start),0]]),nodes=new Map([[key(start),start]]);let found='';
 while(open.length){open.sort((a,b)=>(cost.get(key(a))!+Math.hypot(a.x-end.x,a.y-end.y))-(cost.get(key(b))!+Math.hypot(b.x-end.x,b.y-end.y)));const n=open.shift()!,k=key(n);if(n.x===end.x&&n.y===end.y){found=k;break;}
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const t={x:n.x+dx,y:n.y+dy},tk=key(t);if(![[0,0],[18,0],[-18,0],[0,18],[0,-18]].every(([ox,oy])=>canStand(t.x*size+ox,t.y*size+oy)))continue;const c=cost.get(k)!+1;if(c<(cost.get(tk)??Infinity)){prev.set(tk,k);cost.set(tk,c);nodes.set(tk,t);if(!open.some(q=>key(q)===tk))open.push(t);}}
 }
 if(!found)throw new Error('No route');const path:{x:number;y:number}[]=[];for(let k=found;k!==key(start);k=prev.get(k)!){const n=nodes.get(k)!;path.unshift({x:n.x*size,y:n.y*size});}
 // Keep corners only, reducing keyboard transitions.
 return path.filter((p,i)=>i===0||i===path.length-1||(p.x-path[i-1].x)!==(path[i+1].x-p.x)||(p.y-path[i-1].y)!==(path[i+1].y-p.y));
}
async function walk(page:Page,tx:number,ty:number){
 await page.bringToFront();const from=await pos(page); const points=route(from.x,from.y,tx,ty);
 for(const point of points){
  const until=Date.now()+7000;let held='';
  while(Date.now()<until){const p=await pos(page),dx=point.x-p.x,dy=point.y-p.y;if(Math.hypot(dx,dy)<12)break;
   const key=Math.abs(dx)>Math.abs(dy)?(dx>0?'d':'a'):(dy>0?'s':'w');
   if(held!==key){if(held)await page.keyboard.up(held);await page.keyboard.down(key);held=key;}
   await page.waitForTimeout(35);
  }if(held)await page.keyboard.up(held);
  const p=await pos(page);if(Math.hypot(p.x-point.x,p.y-point.y)>=25){console.log('ROUTE FAILURE',{from,point,p,points,phase:(await snap(page)).phase});await page.screenshot({path:'test-results/route-failure.png',fullPage:true});}expect(Math.hypot(p.x-point.x,p.y-point.y),'keyboard route waypoint').toBeLessThan(25);
 }
}
async function station(page:Page,id:string){const s=STATIONS.find(s=>s.id===id)!;let x=s.x+s.w/2,y=s.y+s.h+54;if(id==='label'||id==='check'){x=s.x-66;y=s.y+s.h/2;}await walk(page,x,y);const p=await pos(page);expect(stationDistance(p.x,p.y,s)).toBeLessThan(INTERACT_RANGE);}
async function interact(page:Page){await page.bringToFront();await page.keyboard.press('e');await page.waitForTimeout(240);}

test('four browsers play an authoritative order, share score and finish the shift',async({browser})=>{
 const contexts=await Promise.all(Array.from({length:4},()=>browser.newContext({viewport:{width:1440,height:1000}})));const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const errors:string[]=[];pages.forEach(p=>p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);}));
 try{
  for(let i=0;i<4;i++)await pages[i].goto('/');
  await pages[0].getByTestId('menu-create').click();await pages[0].getByTestId('player-name').fill('Pharmacist 1');await pages[0].getByTestId('join-submit').click();await expect(pages[0].getByTestId('room-code')).toBeVisible();
  const code=(await pages[0].getByTestId('room-code').innerText()).trim();expect(code).toMatch(/^[A-Z2-9]{6}$/);
  for(let i=1;i<4;i++){await pages[i].getByTestId('menu-join').click();await pages[i].getByTestId('player-name').fill(`Pharmacist ${i+1}`);await pages[i].getByTestId('join-code').fill(code);await pages[i].getByTestId('join-submit').click();}
  for(const p of pages)await expect.poll(async()=> (await snap(p)).players.length).toBe(4);
  for(const p of pages)await p.getByTestId('ready').click();await expect(pages[0].getByTestId('start')).toBeEnabled();await pages[0].getByTestId('start').click();
  for(const p of pages)await expect.poll(async()=> (await snap(p)).phase).toBe('playing');
  await pages[0].bringToFront();const before=await pos(pages[0]);await pages[0].keyboard.down('a');await pages[0].waitForTimeout(320);await pages[0].keyboard.up('a');
  await expect.poll(async()=> (await snap(pages[1])).players.find(p=>p.id===before.id).x).toBeLessThan(before.x-15);
  const order=(await snap(pages[0])).orders.find(o=>o.status==='queued');expect(order).toBeTruthy();
  await station(pages[0],'screen');await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).not.toBe('');
  await station(pages[0],'fill');await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).toBe('');
  for(const [product,quantity] of Object.entries(JSON.parse(order.requirements))){for(let i=0;i<(quantity as number);i++){
   await station(pages[0],`shelf-${product}`);await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).not.toBe('');
   await station(pages[0],'fill');await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).toBe('');
  }}
  await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).not.toBe('');
  await station(pages[0],'label');await interact(pages[0]);
  await expect.poll(async()=> (await snap(pages[0])).orders.find(o=>o.id===order.id)?.status).toBe('labeled');
  // Put a tray on the shared counter. Two real clients race for one stable item.
  await station(pages[0],'spare');await interact(pages[0]);await expect.poll(async()=> (await pos(pages[0])).carrying).toBe('');
  await station(pages[1],'spare');await Promise.all([interact(pages[0]),interact(pages[1])]);
  let a=await pos(pages[0]),b=await pos(pages[1]);expect([a,b].filter(p=>p.carrying).length).toBe(1);
  if(a.carrying){await interact(pages[0]);await interact(pages[1]);}
  await expect.poll(async()=> (await pos(pages[1])).carrying).not.toBe('');
  await station(pages[1],'check');await interact(pages[1]);await expect.poll(async()=> (await snap(pages[1])).orders.find(o=>o.id===order.id)?.status).toBe('checked');
  await station(pages[1],'dispense');await interact(pages[1]);
  for(const p of pages)await expect.poll(async()=> (await snap(p)).score).toBe(125);
  await pages[0].screenshot({path:'test-results/pharmacy-playing.png',fullPage:true});
  for(const p of pages)await expect.poll(async()=> (await snap(p)).phase,{timeout:95000}).toBe('results');
  for(const p of pages){await expect(p.getByTestId('results')).toBeVisible();expect((await snap(p)).score).toBe(125);}
  expect(errors).toEqual([]);
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('menu help, refresh recovery, settings and landscape touch controls work',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});const page=await context.newPage();
 try{
  await page.goto('/');await page.getByRole('button',{name:/how to play/i}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByTestId('menu-play').click();await page.getByTestId('player-name').fill('Touch tester');await page.getByTestId('join-submit').click();await expect.poll(async()=> (await snap(page)).phase).toBe('playing');
  await expect(page.locator('canvas')).toBeVisible();await expect(page.getByRole('button',{name:'INTERACT',exact:true})).toBeVisible();
  const before=await pos(page),pad=page.getByRole('application',{name:'Movement joystick'}),box=(await pad.boundingBox())!;
  await page.mouse.move(box.x+54,box.y+54);await page.mouse.down();await page.mouse.move(box.x+85,box.y+54);await page.waitForTimeout(500);await page.mouse.up();
  await expect.poll(async()=> (await pos(page)).x).toBeGreaterThan(before.x+15);
  const identity=(await snap(page)).sessionId;await page.reload({waitUntil:'domcontentloaded'});await expect.poll(async()=> (await snap(page)).phase).toBe('playing');expect((await snap(page)).sessionId).toBe(identity);expect((await snap(page)).players.length).toBe(1);
  await page.locator('#pause').click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:/Back to it/}).click();
  const afterSettings=await pos(page);await page.keyboard.down('d');await page.waitForTimeout(300);await page.keyboard.up('d');await expect.poll(async()=> (await pos(page)).x).toBeGreaterThan(afterSettings.x+10);
  await page.screenshot({path:'test-results/pharmacy-mobile.png'});
 }catch(e){await page.screenshot({path:'test-results/touch-failure.png'});throw e;}finally{await context.close();}
});
