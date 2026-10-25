import {schema,t,type SchemaType} from '@colyseus/schema';
/** Current schema v5 builders work in both source (tsx) and bundled production. */
export const PlayerState=schema({
  id:t.string(),name:t.string(),color:t.string(),x:t.number().default(440),y:t.number().default(520),
  facing:t.string().default('down'),ready:t.boolean(),connected:t.boolean().default(true),carrying:t.string(),lastSeq:t.number(),dashReadyAt:t.number(),
},'PlayerState');
export type PlayerState=SchemaType<typeof PlayerState>;
export const OrderState=schema({
  id:t.string(),patient:t.string(),requirements:t.string().default('{}'),createdAt:t.number(),deadline:t.number(),status:t.string().default('queued'),trayId:t.string(),
},'OrderState');
export type OrderState=SchemaType<typeof OrderState>;
export const ItemState=schema({
  id:t.string(),kind:t.string().default('tray'),product:t.string(),orderId:t.string(),stage:t.string().default('screened'),contents:t.string().default('{}'),
  owner:t.string(),x:t.number(),y:t.number(),stationId:t.string(),filledBy:t.string(),
},'ItemState');
export type ItemState=SchemaType<typeof ItemState>;
export const GameState=schema({
  code:t.string(),hostId:t.string(),phase:t.string().default('lobby'),players:t.map(PlayerState),orders:t.map(OrderState),items:t.map(ItemState),
  score:t.number(),completed:t.number(),mistakes:t.number(),remaining:t.number().default(300),elapsed:t.number(),
  notice:t.string().default('Welcome to Morning Shift!'),event:t.string(),eventUntil:t.number(),seed:t.number().default(1),
},'GameState');
export type GameState=SchemaType<typeof GameState>;
