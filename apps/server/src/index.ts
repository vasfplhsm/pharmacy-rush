import {Server} from '@colyseus/core';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {PharmacyRoom} from './rooms/PharmacyRoom.js';
const server=new Server({
  transport:new WebSocketTransport({maxPayload:4096,pingInterval:3000,pingMaxRetries:2}),
  greet:false,
  express:app=>{
    app.get('/health',(_req,res)=>res.json({ok:true,game:'Pharmacy Rush',version:'0.1.0'}));
    // The production build and multiplayer server share one HTTP/WebSocket origin.
    // This path works from both src/index.ts and the bundled dist/index.js.
    const clientDist=fileURLToPath(new URL('../../client/dist/',import.meta.url));
    app.use(express.static(clientDist));
  },
});
server.define('pharmacy',PharmacyRoom).filterBy(['code']);
const port=Number(process.env.PORT)||2567;
await server.listen(port,'0.0.0.0');
console.log(`Pharmacy Rush authoritative server listening on port ${port}`);
