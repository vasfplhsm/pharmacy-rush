import {Room, ServerError, type Client, type AuthContext} from '@colyseus/core';
import {randomInt} from 'node:crypto';
import {GameState} from '../state/GameState.js';
import {GameSimulation,RuleError} from '../simulation/GameSimulation.js';
import {reserveCode,releaseCode} from '../services/roomCodes.js';
import {RateLimit,displayName} from '../validation/limits.js';
const authAttempts=new RateLimit(40,60_000);
interface JoinOptions {name?:string;color?:string;code?:string}
export class PharmacyRoom extends Room<{state:GameState;metadata:{code:string}}> {
  maxClients=4;
  simulation!:GameSimulation;
  private actions=new RateLimit(8,1000);
  private moves=new RateLimit(35,1000);
  static async onAuth(_token:string,options:JoinOptions,context:AuthContext){
    if(!authAttempts.accept(context.ip||'local'))throw new ServerError(429,'Too many room attempts. Please wait a minute.');
    if(options.code!==undefined&&(typeof options.code!=='string'||! /^[A-HJ-NP-Z2-9]{6}$/.test(options.code)))throw new ServerError(400,'Enter a six-character room code.');
    return true;
  }
  async onCreate(){
    const state=new GameState();state.code=reserveCode();state.seed=randomInt(1,2147483647);this.setState(state);
    await this.setMetadata({code:state.code});
    const configured=process.env.SERVER_TEST_MODE==='1'?Number(process.env.ROUND_DURATION_SECONDS):300;
    const duration=Number.isFinite(configured)&&configured>0?Math.max(1,Math.min(300,configured)):300;
    this.simulation=new GameSimulation(state,duration,(id,message)=>this.clients.find(c=>c.sessionId===id)?.send('feedback',message));
    this.setPatchRate(50);this.setSimulationInterval(dt=>this.simulation.tick(dt/1000),50);
    this.onMessage('move',(client,data)=>{if(this.moves.accept(client.sessionId))this.simulation.move(client.sessionId,data);});
    this.onMessage('ready',(client,data)=>this.action(client,()=>this.simulation.ready(client.sessionId,data)));
    this.onMessage('color',(client,data)=>this.action(client,()=>this.simulation.color(client.sessionId,data)));
    this.onMessage('start',client=>this.action(client,()=>{this.simulation.start(client.sessionId);void this.lock();}));
    this.onMessage('interact',(client,data)=>this.action(client,()=>this.simulation.interact(client.sessionId,data?.stationId)));
    this.onMessage('drop',client=>this.action(client,()=>{if(this.state.phase==='playing')this.simulation.drop(client.sessionId);}));
    this.onMessage('replay',client=>this.action(client,()=>this.simulation.replay(client.sessionId)));
    this.onMessage('lobby',client=>this.action(client,()=>{this.simulation.lobby(client.sessionId);void this.unlock();}));
  }
  private action(client:Client,fn:()=>void){
    if(!this.actions.accept(client.sessionId))return;
    try{fn();}catch(error){if(error instanceof RuleError)client.send('feedback',{text:error.message,kind:'error'});else throw error;}
  }
  onJoin(client:Client,options:JoinOptions){
    if(this.state.players.size>0 && options.code!==this.state.code)throw new ServerError(403,'A valid room code is required to join this private lobby.');
    try{this.simulation.addPlayer(client.sessionId,displayName(options.name),options.color);}catch(error){throw new ServerError(400,error instanceof Error?error.message:'Unable to join this room.');}
  }
  async onDrop(client:Client){
    this.simulation.disconnect(client.sessionId);
    try{await this.allowReconnection(client,15);}catch{/* onLeave removes the expired player. */}
  }
  onReconnect(client:Client){this.simulation.reconnect(client.sessionId);}
  onLeave(client:Client){this.simulation.removePlayer(client.sessionId);this.actions.remove(client.sessionId);this.moves.remove(client.sessionId);}
  onDispose(){releaseCode(this.state.code);}
}
