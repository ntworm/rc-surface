// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type {OSCTransport} from './osc-transport.js';
import {GET,REC,REC_LOOP,REC_PREFLIGHT,CLIP} from '../osc-tokens.js';

export interface CaptureProgress {phase:'recording'|'stopping'|'complete'|'cancelled'|'unconfirmed';pass:number;total:number|null;error?:string}
interface Hooks {
  guard:()=>void;
  pollTracks:()=>void;
  disableLoop:()=>Promise<void>;
  stop:()=>Promise<unknown>;
}

/** An already accepted host-side recording plan, never a queued phone command.
 * Native Punch Out owns the sample boundary. Observed song position counts
 * wraps; the last pass disables Loop before that boundary. No browser clock
 * predicts a boundary, and no owner survives link/Set/track replacement. */
export class ArrangementCapture {
  private progress:CaptureProgress;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private retired=false;
  private previous:number;
  private previousAt:number|null=null;
  private loop:boolean;
  private changingLoop=false;
  private lastPoll=0;
  constructor(private readonly osc:OSCTransport,private readonly start:number,private readonly end:number,
    total:number|null,private readonly hooks:Hooks) {
    const initial=osc.recording.snapshot().songTimeBeats;
    this.progress={phase:'recording',pass:1,total};this.previous=initial.value??start;this.previousAt=initial.observedAt??Date.now();this.loop=total!==1;
    osc.recording.on('update',this.changed);
    this.schedule();
  }
  public snapshot(){return {...this.progress};}
  public cancel(){this.retired=true;clearTimeout(this.timer??undefined);this.timer=null;this.osc.recording.off('update',this.changed);if(this.progress.phase==='recording')this.progress.phase='cancelled';}
  private schedule(){if(this.retired)return;this.timer=setTimeout(()=>{this.poll();this.schedule();},100);this.timer.unref?.();}
  private poll(){
    if(this.retired)return;
    try {
      this.hooks.guard();
      this.osc.send(GET.currentSongTime);
      if(Date.now()-this.lastPoll>=500){
        this.lastPoll=Date.now();
        this.hooks.pollTracks();
        for(const address of [GET.isPlaying,REC.getRecordMode,GET.tempo,CLIP.getTrackNames,REC_PREFLIGHT.loop,REC_PREFLIGHT.punchOut,REC_LOOP.getStart,REC_LOOP.getLength])this.osc.send(address);
      }
      this.observe();
    }catch(error){this.fail(error);}
  }
  private readonly changed=()=>{
    const state=this.osc.recording.snapshot();
    // Observe every OFF edge before deferring position work: an external
    // stop/start in one turn must not revive this plan on its latest snapshot.
    if(state.isPlaying.fresh&&state.isPlaying.value===false||state.recordMode.fresh&&state.recordMode.value===false){this.cancel();return;}
    queueMicrotask(()=>this.observe());
  };
  public invalidate(){this.fail(Error('REC:CAPTURE_CHANGED'));}
  private observe(){
    if(this.retired||this.progress.phase!=='recording')return;
    try {
      this.hooks.guard();
      const state=this.osc.recording.snapshot(),time=state.songTimeBeats;
      if(!time.fresh||!state.isPlaying.fresh||!state.recordMode.fresh)throw Error('REC:CAPTURE_UNKNOWN');
      if(state.isPlaying.value!==true||state.recordMode.value!==true){this.cancel();return;}
      if(time.value===null||time.observedAt===null||time.observedAt===this.previousAt)return;
      const position=time.value,now=time.observedAt,length=this.end-this.start;
      if(position<this.start-.001)throw Error('REC:CAPTURE_CHANGED');
      if(position<this.previous-.001){
        const span=this.end-this.previous+position-this.start;
        if(!this.loop||this.changingLoop||this.previous<this.start+length/2||position>this.start+length/2)throw Error('REC:CAPTURE_CHANGED');
        this.checkAdvance(span,now,length);
        this.progress.pass++;
        if(this.progress.total!==null&&this.progress.pass>=this.progress.total){
          this.changingLoop=true;
          void this.hooks.disableLoop().then(()=>{if(!this.retired){this.loop=false;this.changingLoop=false;}}).catch(error=>this.fail(error));
        }
      }else {
        this.checkAdvance(position-this.previous,now,length);
        if(position>=this.end-.001&&!this.loop){
          if(this.changingLoop||this.progress.total===null||this.progress.pass!==this.progress.total)throw Error('REC:CAPTURE_CHANGED');
          this.progress.phase='stopping';
          void this.hooks.stop().then(()=>{this.progress.phase='complete';this.cancel();}).catch(error=>{
            this.progress.phase='unconfirmed';this.progress.error=error instanceof Error?error.message:'REC:CAPTURE_UNKNOWN';this.cancel();
          });
        }
        if(this.loop&&position>this.end+.5)throw Error('REC:CAPTURE_CHANGED');
      }
      this.previous=position;this.previousAt=now;
    }catch(error){this.fail(error);}
  }
  private checkAdvance(distance:number,now:number,length:number){
    if(this.previousAt===null)return;
    const elapsed=now-this.previousAt,tempo=this.osc.state.tempo;
    if(elapsed<0||!Number.isFinite(tempo)||tempo<20||elapsed*tempo/60000>=length
      ||distance>elapsed*tempo/60000+.5)throw Error('REC:CAPTURE_UNKNOWN');
  }
  private fail(error:unknown){
    if(this.retired)return;
    this.progress.phase='unconfirmed';this.progress.error=error instanceof Error?error.message:'REC:CAPTURE_UNKNOWN';
    this.cancel();
    // Ambiguous observations never claim completion or infer skipped passes.
    // Best-effort priority STOP is permitted only while the same native owner
    // still passes its identity/region guard. Loss/replacement sends nothing.
    try{this.hooks.guard();void this.hooks.stop().catch(()=>{});}catch{/* Retired ownership cannot stop another recording. */}
  }
}
