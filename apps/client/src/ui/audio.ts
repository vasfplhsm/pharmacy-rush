export class Sound {
  muted=localStorage.getItem('pharmacy-muted')==='true';
  private context?:AudioContext;
  unlock(){if(!this.context)this.context=new AudioContext();void this.context.resume();}
  toggle(){this.muted=!this.muted;localStorage.setItem('pharmacy-muted',String(this.muted));if(!this.muted){this.unlock();this.play('success');}}
  play(kind='tap'){
    if(this.muted||!this.context)return;
    const ctx=this.context,at=ctx.currentTime;
    const notes=kind==='success'?[523,659,784]:kind==='error'?[180,140]:kind==='countdown'?[660]:[420];
    notes.forEach((hz,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0.0001,at+i*.065);gain.gain.exponentialRampToValueAtTime(.045,at+i*.065+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+i*.065+.17);osc.connect(gain);gain.connect(ctx.destination);osc.start(at+i*.065);osc.stop(at+i*.065+.18);});
  }
}
