import { Client, type Room } from '@colyseus/sdk';
import type { GameView } from '@pharmacy/shared';
export type GameRoom = Room<any, GameView>;
export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting';
const TOKEN_KEY = 'pharmacy-rush-reconnection';
export class Connection {
  readonly client: Client;
  room?: GameRoom;
  status: ConnectionStatus = 'offline';
  onState: (state:GameView)=>void = ()=>{};
  onStatus: (status:ConnectionStatus, message?:string)=>void = ()=>{};
  onFeedback: (text:string,kind:string)=>void = ()=>{};
  private leaving = false;
  constructor() {
    const endpoint = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:2567`;
    this.client = new Client(endpoint);
  }
  get state():GameView|undefined { return this.room?.state; }
  get sessionId():string { return this.room?.sessionId || ''; }
  setStatus(status:ConnectionStatus,message?:string){this.status=status;this.onStatus(status,message);}
  async connect(mode:'create'|'join'|'solo',name:string,color:string,code='') {
    this.leaving=false; this.setStatus('connecting');
    try {
      const options={name:name.trim().slice(0,16)||'Pharmacist',color,...(mode==='join'?{code:code.trim().toUpperCase()}:{})};
      const room:GameRoom=mode==='join' ? await this.client.join<GameView>('pharmacy',options) : await this.client.create<GameView>('pharmacy',options);
      this.bind(room);
      if(mode==='solo'){
        let started=false;
        const go=(state:GameView)=>{if(!started&&state.players?.get(room.sessionId)){started=true;room.send('ready',true);setTimeout(()=>room.send('start'),100);room.onStateChange.remove(go);}};
        room.onStateChange(go); if(room.state?.players)go(room.state);
      }
    } catch(error){this.setStatus('offline',friendlyError(error)); throw error;}
  }
  private bind(room:GameRoom) {
    this.room=room;this.leaving=false;
    room.reconnection.maxRetries=12;room.reconnection.minDelay=250;room.reconnection.maxDelay=1400;room.reconnection.minUptime=0;
    this.remember();this.setStatus('connected');
    room.onStateChange(state=>this.onState(state));
    room.onMessage('feedback',(data:{text:string;kind:string})=>this.onFeedback(data.text,data.kind));
    room.onError((_code,message)=>this.onFeedback(message||'The server could not perform that action.','error'));
    room.onDrop(()=>{if(!this.leaving)this.setStatus('reconnecting','Connection interrupted. Rejoining your shift…');});
    room.onReconnect(()=>{this.remember();this.setStatus('connected');this.onFeedback('Back with your team!','success');});
    room.onLeave(()=>{
      if(this.room!==room)return;
      this.room=undefined;sessionStorage.removeItem(TOKEN_KEY);
      this.setStatus('offline',this.leaving?undefined:'Your room connection ended. If the server restarted, create a new room.');
    });
    if(room.state?.players)this.onState(room.state);
  }
  private remember(){if(this.room)sessionStorage.setItem(TOKEN_KEY,this.room.reconnectionToken);}
  async restore():Promise<boolean> {
    const token=sessionStorage.getItem(TOKEN_KEY);if(!token)return false;
    this.setStatus('reconnecting','Rejoining your shift…');
    try {this.bind(await this.client.reconnect<GameView>(token));return true;}
    catch {sessionStorage.removeItem(TOKEN_KEY);this.setStatus('offline','Your previous shift has ended. Start a fresh room.');return false;}
  }
  send(type:string,data?:unknown){if(this.status==='connected')this.room?.send(type,data);}
  async leave(){
    this.leaving=true;sessionStorage.removeItem(TOKEN_KEY);
    const room=this.room;this.room=undefined;
    if(room){room.reconnection.enabled=false;await room.leave().catch(()=>{});room.removeAllListeners();}
    this.setStatus('offline');
  }
}
export function friendlyError(error:unknown):string {
  const raw=error instanceof Error?error.message:String(error);
  if(/no rooms|not found|no room|not available|seat reservation expired/i.test(raw))return 'Room unavailable. Check the six-letter code; it may be full, in a match, or closed.';
  if(/fetch|network|failed to connect|timeout|websocket/i.test(raw))return 'Cannot reach the game server. Check that both development services are running.';
  return raw.length<220?raw:'Could not connect to this room. Please try again.';
}
