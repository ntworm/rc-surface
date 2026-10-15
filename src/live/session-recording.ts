// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {SESSION_REC} from '../osc-tokens.js';
import type {OSCTransport} from './osc-transport.js';
import type {CommandExecutionContext} from './catalog/types.js';
import {RECORDING_CONFIRM_MS,RECORDING_FRESH_MS} from './recording-transport.js';

interface Identified {handle:{id:string|number|bigint}}
interface Slot extends Identified {clip: (Identified & {name:string}) | null}
interface Track extends Identified {name:string;clipSlots?:readonly Slot[]}
export interface SessionSong {tracks:readonly Track[];scenes?:readonly (Identified & {name:string})[]}
interface Ref {index:number;id:string;name:string}
interface Target {track:Ref;slotId:string}
interface Owned {target:Target;track:Track;slot:Slot;clipId:string|null;sent:boolean}
interface Owner {song:SessionSong;scene:Ref;context:CommandExecutionContext;targets:Owned[];stopping:boolean}
interface Observation {value:number|boolean;at:number;revision:number}
const id=(item:Identified)=>String(item.handle.id);
function fail(code:string):never {throw Error('REC:'+code);}
function exact(value:unknown,keys:string[]):value is Record<string,unknown> {
  return Boolean(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key)));
}
function ref(value:unknown):Ref {
  if(!exact(value,['index','id','name']) || !Number.isInteger(value['index']) || Number(value['index'])<0 || typeof value['id']!=='string' || !value['id'] || typeof value['name']!=='string')fail('IDENTITY');
  return value as unknown as Ref;
}

/** Empty Session slots only. Shares the REC coordinator's operation/STOP slot;
 * owns no transport, global preference, arm state or timer-based recording. */
export class SessionRecording extends EventEmitter {
  private song:SessionSong|null=null;
  private token=randomUUID();
  private observed=new Map<string,Observation>();
  private revision=0;
  private owner:Owner|null=null;
  private offset=0;
  constructor(private readonly osc:OSCTransport,private readonly getSong:()=>SessionSong) {
    super();osc.on('session-recording-observation',this.observe);
  }
  public reset(){this.owner=null;this.observed.clear();this.song=null;this.token=randomUUID();}
  public dispose(){this.reset();this.osc.off('session-recording-observation',this.observe);}
  private current() {
    const song=this.getSong();
    if(this.song!==song){this.reset();this.song=song;this.offset=0;}
    if(this.owner && !this.owner.context.isCurrent())this.owner=null;
    return song;
  }
  public get active(){this.current();return this.owner!==null;}
  private value(key:string) {
    const entry=this.observed.get(key),now=Date.now();
    return this.osc.state.connected && this.osc.state.available && entry && now>=entry.at && now-entry.at<=RECORDING_FRESH_MS?entry.value:null;
  }
  private readonly observe=({address,args,at}:{address:string;args:{value?:unknown}[];at:number})=>{
    const property=Object.entries(SESSION_REC).find(([,value])=>value===address)?.[0];
    const track=args[0]?.value,slot=args[1]?.value,raw=args.at(-1)?.value;
    if(!property || !Number.isInteger(track) || Number(track)<0)return;
    const indexed=['firedSlot','playingSlot'].includes(property);
    if(args.length!==(indexed?2:3) || !indexed && (!Number.isInteger(slot)||Number(slot)<0))return;
    const value=indexed?Number.isInteger(raw)&&Number(raw)>=-2?Number(raw):null:raw===true||raw===1?true:raw===false||raw===0?false:null;
    if(value===null)return;
    const owner=this.owner,now=Date.now();
    // A foreign launch permanently retires this attempt's target, even if a
    // later sample in the same GET batch returns to its former clip.
    if(indexed && typeof value==='number' && value>=0 && owner && value!==owner.scene.index
      && now>=at && now-at<=RECORDING_FRESH_MS && contextCurrent(owner,this.getSong(),this.osc)) {
      for(const target of owner.targets)if(target.sent && target.target.track.index===track)target.sent=false;
    }
    this.observed.set(property+':'+track+(indexed?'':':'+slot),{value,at,revision:++this.revision});this.emit('observation');
  };
  private state(track:number,scene:number) {
    const fired=this.value('firedSlot:'+track),playing=this.value('playingSlot:'+track);
    if(fired===null || playing===null)return 'unknown';
    if(fired===-1 && (playing===-1 || playing===-2))return 'stopped';
    if(fired===-2 || fired===scene || this.value('triggered:'+track+':'+scene)===true)return 'queued';
    if(playing===scene){const recording=this.value('recording:'+track+':'+scene),active=this.value('playing:'+track+':'+scene);return recording===true?'recording':recording===false&&active===true?'playing':'unknown';}
    return 'stopped';
  }
  public snapshot() {
    const song=this.current(),scenes=song.scenes??[];
    return {songId:this.token,offset:this.offset,totalScenes:scenes.length,active:!!this.owner,stopping:this.owner?.stopping??false,
      scenes:scenes.slice(this.offset,this.offset+8).map((scene,index)=>({index:index+this.offset,id:id(scene),name:scene.name})),
      rows:song.tracks.map((track,index)=>({track:{index,id:id(track),name:track.name},ready:this.idle(index),slots:(track.clipSlots??[]).slice(this.offset,this.offset+8).map((slot,scene)=>({index:scene+this.offset,id:id(slot),clip:slot.clip?{id:id(slot.clip),name:slot.clip.name}:null,state:this.state(index,scene+this.offset)}))})),
      owned:this.owner?.targets.filter(target=>target.sent).map(target=>({track:target.target.track,scene:this.owner!.scene.index,state:this.state(target.target.track.index,this.owner!.scene.index)}))??[]};
  }
  public window(offset:unknown) {
    const song=this.current();
    if(!Number.isInteger(offset)||Number(offset)<0||Number(offset)>=Math.max(1,song.scenes?.length??0)||Number(offset)%8!==0)fail('ARGUMENTS');
    this.offset=Number(offset);
  }
  private idle(track:number) {
    const fired=this.value('firedSlot:'+track),playing=this.value('playingSlot:'+track);
    if(fired!==-1)return false;
    // -2 is Track's settled Clip Stop index; fired=-2 is still a queued stop.
    if(playing===-1 || playing===-2)return true;
    return typeof playing==='number' && playing>=0 && Boolean(this.current().tracks[track]?.clipSlots?.[playing]?.clip)
      && this.value('hasClip:'+track+':'+playing)===true && this.value('triggered:'+track+':'+playing)===false
      && this.value('recording:'+track+':'+playing)===false && this.value('playing:'+track+':'+playing)===false;
  }
  private settled(target:Owned,scene:number) {
    const track=target.target.track.index;
    if(!target.clipId && !this.owner?.stopping)return false;
    if(this.value('firedSlot:'+track)===-1 && [ -1,-2 ].includes(Number(this.value('playingSlot:'+track))))return true;
    if(!this.idle(track) || this.value('triggered:'+track+':'+scene)!==false)return false;
    return target.slot.clip?this.value('hasClip:'+track+':'+scene)===true && this.value('recording:'+track+':'+scene)===false && this.value('playing:'+track+':'+scene)===false
      :this.value('hasClip:'+track+':'+scene)===false;
  }
  public allIdle(){return this.current().tracks.every((_,index)=>this.idle(index));}
  private async read(keys:[string,number,number?][],guard:()=>void,signal:AbortSignal,timeout=RECORDING_CONFIRM_MS) {
    guard();if(signal.aborted)throw signal.reason;
    const unique=[...new Map(keys.map(item=>[item.join(':'),item])).values()],revision=this.revision;
    if(!unique.length)return;
    await new Promise<void>((resolve,reject)=>{
      let done=false,retry:ReturnType<typeof setTimeout>|undefined;
      const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);this.off('observation',changed);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
      const abort=()=>finish(signal.reason);
      const changed=()=>{try{guard();if(unique.every(item=>(this.observed.get(item.join(':'))?.revision??0)>revision&&this.value(item.join(':'))!==null))finish();}catch(error){finish(error);}};
      const poll=()=>{try{guard();for(const [property,track,slot] of unique){if(done)break;this.osc.send(SESSION_REC[property as keyof typeof SESSION_REC],[{type:'integer',value:track},...(slot===undefined?[]:[{type:'integer' as const,value:slot}])]);}if(!done)retry=setTimeout(poll,100);}catch(error){finish(error);}};
      const timer=setTimeout(()=>finish(Error('REC:SESSION_UNKNOWN')),timeout);
      this.on('observation',changed);signal.addEventListener('abort',abort,{once:true});poll();
    });
    guard();
  }
  private indices(song:SessionSong):[string,number][] {return song.tracks.flatMap((_,index)=>[['firedSlot',index],['playingSlot',index]] as [string,number][]);}
  private async pause(signal:AbortSignal) {
    if(signal.aborted)throw signal.reason;
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(signal.reason);};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},50);
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  public async refresh(guard:()=>void,signal:AbortSignal,deadline?:number,bind=true) {
    const song=this.current();if(song.tracks.length>256 || (song.scenes?.length??0)>4096)fail('TRACK_LIMIT');
    const remaining=()=>deadline===undefined?RECORDING_CONFIRM_MS:Math.max(1,deadline-Date.now());
    await this.read(this.indices(song),()=>{guard();if(this.current()!==song)fail('IDENTITY');},signal,remaining());
    const keys:[string,number,number?][]=[];
    song.tracks.forEach((track,index)=>{
      const playing=this.value('playingSlot:'+index),fired=this.value('firedSlot:'+index);
      for(const scene of new Set([playing,fired]))if(typeof scene==='number' && scene>=0 && track.clipSlots?.[scene]?.clip)keys.push(['recording',index,scene],['playing',index,scene],['hasClip',index,scene],['triggered',index,scene]);
    });
    for(const target of this.owner?.targets??[])if(target.sent) {
      const index=target.target.track.index,scene=this.owner!.scene.index;
      if(this.value('firedSlot:'+index)===-1 && [-1,-2].includes(Number(this.value('playingSlot:'+index))))continue;
      keys.push(['hasClip',index,scene],['triggered',index,scene]);
      if(target.slot.clip && this.value('playingSlot:'+index)===scene)keys.push(['recording',index,scene],['playing',index,scene]);
    }
    await this.read(keys,()=>{guard();if(this.current()!==song)fail('IDENTITY');},signal,remaining());
    for(const target of this.owner?.targets??[])if(target.sent) {
      try{this.identity(this.owner!,target);}catch{target.sent=false;continue;}
      const index=target.target.track.index,scene=this.owner!.scene.index;
      const playing=this.value('playingSlot:'+index),fired=this.value('firedSlot:'+index);
      if(typeof playing==='number'&&playing>=0&&playing!==scene || typeof fired==='number'&&fired>=0&&fired!==scene){target.sent=false;continue;}
      if(target.clipId && (!target.slot.clip || id(target.slot.clip)!==target.clipId)){target.sent=false;continue;}
      if(this.settled(target,scene)){target.sent=false;continue;}
      if(bind && !target.clipId && target.slot.clip && this.value('hasClip:'+index+':'+scene)===true && this.value('playingSlot:'+index)===scene && this.value('recording:'+index+':'+scene)===true)target.clipId=id(target.slot.clip);
    }
    if(this.owner?.targets.every(target=>!target.sent))this.owner=null;
  }
  private identity(owner:Owner,target:Owned) {
    const song=this.current(),ref=target.target.track,track=song.tracks[ref.index],scene=song.scenes?.[owner.scene.index];
    if(song!==owner.song || !scene || id(scene)!==owner.scene.id || scene.name!==owner.scene.name || song.scenes?.filter(item=>id(item)===owner.scene.id).length!==1
      || track!==target.track || id(track)!==ref.id || track.name!==ref.name || song.tracks.filter(item=>id(item)===ref.id).length!==1
      || track.clipSlots?.[owner.scene.index]!==target.slot || id(target.slot)!==target.target.slotId || track.clipSlots.filter(item=>id(item)===target.target.slotId).length!==1)fail('IDENTITY');
    return target.slot;
  }
  public async record(request:unknown,context:CommandExecutionContext,guard:()=>void,signal:AbortSignal,preflight:(refs:Ref[])=>void) {
    if(!exact(request,['songId','scene','targets','bars','quantization']) || ![1,2,4,8,16].includes(Number(request['bars'])) || typeof request['bars']!=='number' || typeof request['quantization']!=='string' || !['global','none','bar','beat'].includes(request['quantization']))fail('ARGUMENTS');
    const song=this.current();if(this.owner)fail('STOP_REQUIRED');
    if(song.tracks.length>256 || (song.scenes?.length??0)>4096)fail('TRACK_LIMIT');
    if(request['songId']!==this.token || !Array.isArray(request['targets']) || !request['targets'].length || request['targets'].length>256)fail('IDENTITY');
    const scene=ref(request['scene']),targets=request['targets'].map(value=>{
      if(!exact(value,['track','slotId']) || typeof value['slotId']!=='string' || !value['slotId'])fail('IDENTITY');
      const track=ref(value['track']),object=song.tracks[track.index],slot=object?.clipSlots?.[scene.index];
      if(!object||!slot)fail('IDENTITY');return {target:{track,slotId:value['slotId']},track:object,slot,clipId:null,sent:false} as Owned;
    });
    if(targets.some((target,index)=>index>0&&target.target.track.index<=targets[index-1]!.target.track.index)||new Set(targets.map(target=>target.target.track.id)).size!==targets.length)fail('IDENTITY');
    const owner:Owner={song,scene,context,targets,stopping:false};
    const check=()=>{guard();if(!context.isCurrent())fail('SESSION');for(const target of targets)this.identity(owner,target);};
    check();preflight(targets.map(target=>target.target.track));
    const keys:[string,number,number?][]=this.indices(song);
    for(const target of targets)keys.push(['hasClip',target.target.track.index,scene.index],['triggered',target.target.track.index,scene.index]);
    await this.read(keys,check,signal);await this.refresh(check,signal);check();preflight(targets.map(target=>target.target.track));
    for(const target of targets) {
      const index=target.target.track.index;
      if(target.slot.clip || this.value('hasClip:'+index+':'+scene.index)!==false)fail('SLOT_NOT_EMPTY');
      if(this.value('triggered:'+index+':'+scene.index)!==false || !this.idle(index))fail('SESSION_CONFLICT');
    }
    return {owner,bars:request['bars'],quantization:request['quantization'],check};
  }
  public async fire(prepared:Awaited<ReturnType<SessionRecording['record']>>,beats:number,guard:()=>void,signal:AbortSignal,beforeFire:()=>void) {
    const {owner,check}=prepared;
    this.owner=owner;
    try {
      for(const target of owner.targets) {
        check();guard();beforeFire();if(this.owner!==owner)fail('STOPPED');
        for(const candidate of owner.targets)if(!candidate.sent) {
          const index=candidate.target.track.index;
          if(candidate.slot.clip || this.value('hasClip:'+index+':'+owner.scene.index)!==false)fail('SLOT_NOT_EMPTY');
          if(this.value('triggered:'+index+':'+owner.scene.index)!==false || !this.idle(index))fail('SESSION_CONFLICT');
        }
        target.sent=true;
        this.osc.recordEmptyClipSlot(target.target.track.index,owner.scene.index,beats,prepared.quantization==='global'?'global':prepared.quantization==='none'?0:prepared.quantization==='bar'?4:7);
      }
      // Native fire may become queued on a later Live callback. Only GETs are
      // retried; elapsed time never starts or confirms a recording.
      const deadline=Date.now()+RECORDING_CONFIRM_MS;
      for(;;) {
        await this.refresh(check,signal);check();
        const confirmed=owner.targets.every(target=>target.sent&&(target.clipId || this.value('firedSlot:'+target.target.track.index)===owner.scene.index && this.value('hasClip:'+target.target.track.index+':'+owner.scene.index)===false && this.value('triggered:'+target.target.track.index+':'+owner.scene.index)===true));
        if(confirmed)break;
        if(owner.targets.some(target=>!target.sent || target.slot.clip && this.value('playingSlot:'+target.target.track.index)===owner.scene.index && (this.value('recording:'+target.target.track.index+':'+owner.scene.index)===false || this.value('hasClip:'+target.target.track.index+':'+owner.scene.index)===false)) || Date.now()>=deadline)fail('SESSION_UNCONFIRMED');
        await this.pause(signal);
      }
    } catch(error) {
      // STOP/cancellation owns cleanup when it interrupted this operation.
      if(!signal.aborted && contextCurrent(owner,this.getSong(),this.osc))try{await this.refresh(guard,signal);await this.stop(guard,signal);}catch{/* Keep remaining ownership for explicit STOP. */}
      throw error;
    }
  }
  public async stop(guard:()=>void,signal:AbortSignal) {
    const owner=this.owner;if(!owner)return;
    if(!contextCurrent(owner,this.getSong(),this.osc)){this.reset();return;}
    owner.stopping=true;
    const deadline=Date.now()+RECORDING_CONFIRM_MS;
    const check=()=>{guard();if(!contextCurrent(owner,this.getSong(),this.osc))fail('SESSION');};
    for(const target of owner.targets)if(target.sent)try{this.identity(owner,target);}catch{target.sent=false;}
    await this.refresh(check,signal,deadline,false);
    for(const target of owner.targets.filter(target=>target.sent)) {
      check();
      if(this.owner!==owner || !target.sent)continue;
      try {this.identity(owner,target);}catch{target.sent=false;continue;}
      if(Date.now()>=deadline)fail('SESSION_STOP_PENDING');
      const index=target.target.track.index;
      await this.read([['firedSlot',index],['playingSlot',index],['hasClip',index,owner.scene.index],['triggered',index,owner.scene.index]],check,signal,Math.max(1,deadline-Date.now()));
      if(this.owner!==owner || !target.sent)continue;
      try{this.identity(owner,target);}catch{target.sent=false;continue;}
      const playing=this.value('playingSlot:'+index),fired=this.value('firedSlot:'+index);
      if((typeof playing==='number'&&playing>=0&&playing!==owner.scene.index)||(typeof fired==='number'&&fired>=0&&fired!==owner.scene.index)) {target.sent=false;continue;}
      if(this.settled(target,owner.scene.index)){target.sent=false;continue;}
      if(playing!==owner.scene.index && fired!==owner.scene.index)continue;
      if(target.clipId && (!target.slot.clip || id(target.slot.clip)!==target.clipId)){target.sent=false;continue;}
      if(target.clipId && this.value('hasClip:'+index+':'+owner.scene.index)!==true)continue;
      // Until SDK identifies the created clip, only a still-empty queued slot
      // can be stopped safely. Never adopt an unrelated replacement at STOP.
      if(!target.clipId && (target.slot.clip || this.value('hasClip:'+index+':'+owner.scene.index)!==false || this.value('triggered:'+index+':'+owner.scene.index)!==true))continue;
      if(this.owner!==owner || !target.sent)continue;
      this.osc.stopTrackClips(index);
    }
    await this.refresh(check,signal,deadline,false);
    for(const target of owner.targets)if(target.sent) {
      if(this.settled(target,owner.scene.index))target.sent=false;
    }
    if(owner.targets.every(target=>!target.sent)){if(this.owner===owner)this.owner=null;}
    else fail('SESSION_STOP_PENDING');
  }
}
function contextCurrent(owner:Owner,song:SessionSong,osc:OSCTransport){return owner.context.isCurrent()&&owner.song===song&&osc.state.connected&&osc.state.available;}
