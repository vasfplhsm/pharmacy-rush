export class RateLimit {
  private entries=new Map<string,{count:number;reset:number}>();
  constructor(private limit:number,private windowMs:number){}
  accept(key:string,now=Date.now()):boolean {
    let row=this.entries.get(key);
    if(!row||row.reset<=now){row={count:0,reset:now+this.windowMs};this.entries.set(key,row);}
    if(this.entries.size>2000) for(const[k,v]of this.entries)if(v.reset<=now)this.entries.delete(k);
    row.count++;
    return row.count<=this.limit;
  }
  remove(key:string){this.entries.delete(key);}
}
export function displayName(value:unknown):string {
  return (typeof value==='string'?value:'Pharmacist').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'Pharmacist';
}
