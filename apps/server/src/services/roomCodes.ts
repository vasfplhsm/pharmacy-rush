import {randomInt} from 'node:crypto';
export const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const occupied=new Set<string>();
export function reserveCode():string {
  for(let tries=0;tries<100;tries++){
    const code=Array.from({length:6},()=>CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if(!occupied.has(code)){occupied.add(code);return code;}
  }
  throw new Error('Unable to create a room code. Please try again.');
}
export function releaseCode(code:string){occupied.delete(code);}
