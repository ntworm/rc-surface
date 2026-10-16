// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLIP, GET, REC, REC_LOOP, REC_PREFLIGHT, REC_PREROLL,REC_RETURN,REC_CAPTURE } from '../osc-tokens.js';
import type { CommandExecutionContext } from './catalog/types.js';
import type { OSCTransport } from './osc-transport.js';
import { RECORDING_CONFIRM_MS, RECORDING_FRESH_MS } from './recording-transport.js';
import {SessionRecording,type SessionSong} from './session-recording.js';
import {ArrangementCapture} from './arrangement-capture.js';

interface VolumeParameter { min:number; max:number; defaultValue:number; getValue():Promise<number>; setValue(value:number):Promise<void> }
interface Track { name: string; handle: { id: string | number | bigint }; arm: boolean; solo: boolean; mute: boolean; mixer?: {volume?:VolumeParameter} }
interface Cue { name: string; time: number; handle: { id: string | number | bigint } }
interface Song {
  tracks: readonly Track[]; cuePoints: readonly Cue[];
  createCuePoint(time: number): Promise<Cue>; deleteCuePoint(cue: Cue): Promise<void>;
  scenes?:NonNullable<SessionSong['scenes']>;
}
interface TrackRef { index: number; id: string; name: string }
interface MarkerRef { name: string; time: number }
type StartRef=MarkerRef|{source:'cursor';time:number};
interface MarkerRange { start: StartRef; end: MarkerRef | null; loop: boolean }
interface CaptureOwner {
  song:Song;generation:number;tracks:TrackRef[];range:MarkerRange;total:number|null;
  originalPunchOut:boolean;expectedPunchOut:boolean;ownedPunchOut:boolean;loopExpected:boolean;
  abort:AbortController;active:boolean;loopPending:boolean;controller?:ArrangementCapture;
}
interface Observed { value: unknown; at: number; revision: number }
interface Operation { name: string; abort: AbortController; context?: CommandExecutionContext }
interface LoopExpectation { key: 'loop' | 'loopStart' | 'loopLength' | 'punchIn' | 'punchOut'; value: number | boolean; getter: string; deadline: number; code?: string }
interface PunchOwner {
  song: Song; generation: number; original: boolean; desired: boolean; expected: boolean;
  owned: boolean; phase: 'baseline' | 'configuring' | 'active' | 'restoring';
}
interface PreRoll {
  operation: Operation; song: Song; tracks: TrackRef[]; range: MarkerRange; bars: number;
  start: number; numerator: number; denominator: number; phase: 'preparing' | 'running' | 'complete';
  originalClick: boolean; originalLoopStart: number; clickOwned: boolean; loopStartOwned: boolean;
  cue: {object:Cue; id:string; time:number; owned:boolean} | null;
  cueCreating: Promise<void> | null; cueDeleting: Promise<void> | null;
  cueOriginals: {id:string; name:string; time:number}[]; cueCleanup: boolean; generation: number;
  cleanupContext?: CommandExecutionContext | undefined;
}
const flags = ['loop', 'punchIn', 'punchOut', 'overdub', 'backToArranger', 'sessionRecord'] as const;
function fail(code: string): never { throw Error('REC:' + code); }
// AbletonOSC keeps Python booleans as OSC T/F; older reports may use 0/1.
function observedBoolean(value: unknown): boolean | null {
  return value === true || value === 1 ? true : value === false || value === 0 ? false : null;
}

/** Session-local workflow metadata, never a representation of Live take lanes.
 * All writes share the existing OSC connection/SDK. UDP observations cannot
 * establish a command ACK or guarantee the host's audio/take preservation. */
export class RecordingCoordinator extends EventEmitter {
  private selected: TrackRef | null = null;
  private point: number | null = null;
  private preparedToken: string | null = null;
  private lastAttempt: { id: string; track: TrackRef; tracks?: TrackRef[]; point: number; stopped: boolean; mark: 'good' | 'review' | null } | null = null;
  private operation: Operation | null = null;
  private starting: { token: string; promise: Promise<ReturnType<RecordingCoordinator['snapshot']>> } | null = null;
  private stopping: Promise<ReturnType<RecordingCoordinator['snapshot']>> | null = null;
  private refreshing: Promise<ReturnType<RecordingCoordinator['snapshot']>> | null = null;
  private displayRead: Operation | null = null;
  private revision = 0;
  private observed = new Map<string, Observed>();
  private song: Song | null = null;
  private range: MarkerRange | null = null;
  private armedByRecorder: TrackRef[] = [];
  private cohort: TrackRef[] | null = null;
  private strictCohort = false;
  private punch: PunchOwner | null = null;
  private trackMutation: Operation | null = null;
  private preRoll: PreRoll | null = null;
  private preRollRequested = false;
  private preRollError: string | null = null;
  private cueGeneration = 0;
  private readonly session:SessionRecording;
  private readonly volumes=new Map<Track,{value:number;defaultValue:number|null;at:number}>();
  private capture:CaptureOwner|null=null;

  constructor(private readonly osc: OSCTransport, private readonly getSong: () => Song) {
    super();
    this.session=new SessionRecording(osc,getSong);
    osc.on('recording-observation', this.observe);
    osc.on('link-lost', this.lost);
  }

  private readonly lost = () => {
    this.displayRead?.abort.abort(Error('REC:CONNECTION'));this.displayRead=null;
    this.retireCapture();
    this.session.reset();
    this.cueGeneration++;
    this.operation?.abort.abort(Error('REC:CONNECTION'));
    this.operation = null;
    this.trackMutation?.abort.abort(Error('REC:CONNECTION')); this.trackMutation = null; this.punch = null;
    this.preparedToken = null; this.observed.clear(); this.volumes.clear();
    if (this.preRoll) { this.preRoll = null; this.preRollError = 'REC:CONNECTION'; }
    this.preRollRequested = false;
  };
  public dispose(): void {
    this.lost();this.session.dispose(); this.osc.off('recording-observation', this.observe); this.osc.off('link-lost', this.lost);
  }
  private currentSong(): Song {
    const song = this.getSong();
    if (this.song !== song) {
      this.displayRead?.abort.abort(Error('REC:IDENTITY'));this.displayRead=null;
      this.retireCapture();this.capture=null;
      this.session.reset();
      this.cueGeneration++;
      this.song = song; this.selected = null; this.point = null; this.preparedToken = null;
      this.lastAttempt = null; this.observed.clear(); this.volumes.clear();
      this.range = null; this.armedByRecorder = []; this.cohort = null; this.strictCohort = false; this.punch = null;
      this.trackMutation?.abort.abort(Error('REC:IDENTITY')); this.trackMutation = null;
      if (this.preRoll) {
        this.preRoll.operation.abort.abort(Error('REC:IDENTITY'));
        if (this.operation === this.preRoll.operation) this.operation = null;
      }
      this.preRoll = null; this.preRollRequested = false; this.preRollError = null;
    }
    return song;
  }
  private value(key: string): unknown {
    const field = this.observed.get(key), now = Date.now();
    return this.osc.state.connected && this.osc.state.available && field && now >= field.at && now - field.at <= RECORDING_FRESH_MS ? field.value : null;
  }
  /** Observed ARM; a non-armable group has no ARM value and is never an input. */
  private armed(index: number): unknown {
    const arm = this.value('arm:' + index);
    return arm === null && this.value('canArm:' + index) === false ? false : arm;
  }
  private trackVolume(track:Track) {
    const cached=this.volumes.get(track),now=Date.now();
    return this.osc.state.connected && this.osc.state.available && cached && now>=cached.at && now-cached.at<=RECORDING_FRESH_MS
      ? cached : null;
  }
  private async volumeResult<T>(operation:Operation,request:()=>Promise<T>):Promise<T> {
    this.check(operation);
    return new Promise<T>((resolve,reject)=>{
      const finish=(error:unknown,value?:T)=>{clearTimeout(timer);operation.abort.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value as T);};
      const abort=()=>finish(operation.abort.signal.reason);
      const timer=setTimeout(()=>finish(Error('REC:VOLUME_UNKNOWN')),RECORDING_CONFIRM_MS);
      operation.abort.signal.addEventListener('abort',abort,{once:true});
      try {request().then(value=>finish(null,value),error=>finish(error));}catch(error){finish(error);}
    });
  }
  private async readVolume(operation:Operation,song:Song,track:Track):Promise<void> {
    this.volumes.delete(track);
    const parameter=track.mixer?.volume;
    if(!parameter || typeof parameter.getValue!=='function' || typeof parameter.setValue!=='function')return;
    const {min,max,defaultValue}=parameter;
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return;
    const value=await this.volumeResult(operation,()=>parameter.getValue());
    this.check(operation);
    if(this.getSong()!==song || !song.tracks.includes(track))fail('IDENTITY');
    if(!Number.isFinite(value)||value<min||value>max)return;
    this.volumes.set(track,{value:(value-min)/(max-min),defaultValue:Number.isFinite(defaultValue)&&defaultValue>=min&&defaultValue<=max?(defaultValue-min)/(max-min):null,at:Date.now()});
  }
  private async readVolumes(operation:Operation):Promise<void> {
    const song=this.currentSong();
    await Promise.all(song.tracks.map(async track=>{
      try {await this.readVolume(operation,song,track);}catch {this.volumes.delete(track);}
    }));
    this.check(operation);
  }
  public snapshot() {
    const song = this.currentSong();
    return {
      transport: this.osc.recording.snapshot(), pending: this.operation?.name === 'read' ? null : this.operation?.name ?? null,
      // Observed conservative preflight is bounded; capture/take preservation
      // and count-in are not exposed by these APIs.
      captureVerified: false, preflightComplete: false,
      selected: this.selected, point: this.point, preparedToken: this.preparedToken, range: this.range,
      cohort: this.cohort, trackPending: this.trackMutation?.name ?? null,
      attemptActive: Boolean(this.preRoll || this.punch || this.armedByRecorder.length || this.session.active),
      session:this.session.snapshot(),
      loopRegion: {start: this.value('loopStart'), length: this.value('loopLength')},
      safety: Object.fromEntries(flags.map(key => [key, this.value(key)])),
      tracks: song.tracks.map((track, index) => ({ index, id: String(track.handle.id), name: track.name,
        arm: this.value('arm:' + index), solo: this.value('solo:' + index), mute: this.value('mute:' + index),
        canArm: this.value('canArm:' + index), monitor: this.value('monitor:' + index),
        volume: this.trackVolume(track)?.value ?? null, volumeDefault:this.trackVolume(track)?.defaultValue ?? null })),
      locators: song.cuePoints.filter(cue => Number.isFinite(cue.time) && cue.time >= 0).map(cue => ({ name: cue.name, time: cue.time })).sort((a,b)=>a.time-b.time),
      meter: { numerator: this.value('numerator'), denominator: this.value('denominator') },tempo:this.value('tempo'),
      lastAttempt: this.lastAttempt,
      capture:this.capture?.controller?.snapshot()??null,
      preRoll: this.preRoll ? {bars:this.preRoll.bars, phase:this.preRoll.phase, start:this.preRoll.start, point:this.preRoll.range.start.time} : null,
      ...(this.preRollError ? {error:this.preRollError} : {}),
    };
  }
  private requireContext(context?: CommandExecutionContext): void {
    if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) fail('SESSION');
  }
  private check(operation: Operation): void {
    if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    if (operation !== this.operation && operation !== this.trackMutation && operation !== this.displayRead) fail('STOPPED');
    if (operation.context) this.requireContext(operation.context);
    if (operation.name !== 'stop' && (!this.osc.state.available || !this.osc.state.connected)) fail('CONNECTION');
  }
  private identity(expected?: TrackRef): Track {
    const ref = this.selected, tracks = this.currentSong().tracks;
    if (!ref || this.selected !== ref) fail('TRACK_REQUIRED');
    if (expected && (ref.index !== expected.index || ref.id !== expected.id || ref.name !== expected.name)) fail('IDENTITY');
    const track = tracks[ref.index];
    if (!track || String(track.handle.id) !== ref.id || track.name !== ref.name) fail('IDENTITY');
    const names = this.value('names');
    if (!Array.isArray(names) || names.length !== tracks.length || tracks.some((item, i) => item.name !== names[i])) fail('IDENTITY');
    return track;
  }
  private trackRef(value: TrackRef): TrackRef {
    if (!value || Object.keys(value).length !== 3 || !Number.isInteger(value.index) || value.index < 0 || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') fail('IDENTITY');
    return {index:value.index,id:value.id,name:value.name};
  }
  private refs(value: TrackRef | TrackRef[]): TrackRef[] {
    const refs = (Array.isArray(value) ? value : [value]).map(ref => this.trackRef(ref));
    if (!refs.length || refs.length > 256) fail('NO_ARMED');
    if (refs.some((ref,index) => index > 0 && ref.index <= refs[index-1]!.index) || new Set(refs.map(ref => ref.id)).size !== refs.length) fail('IDENTITY');
    return refs;
  }
  private identities(refs: readonly TrackRef[]): void {
    const song = this.currentSong(), names = this.value('names');
    if (!Array.isArray(names) || names.length !== song.tracks.length || song.tracks.some((track,index) => track.name !== names[index])) fail('IDENTITY');
    for (const ref of refs) {
      const track = song.tracks[ref.index];
      if (!track || String(track.handle.id) !== ref.id || track.name !== ref.name || song.tracks.filter(item => String(item.handle.id) === ref.id).length !== 1) fail('IDENTITY');
    }
  }
  private activeTracks(): TrackRef[] { return this.cohort ?? (this.selected ? [this.selected] : []); }
  private idle(context?: CommandExecutionContext): void {
    this.requireContext(context); this.interruptRead(); if (this.operation || this.trackMutation) fail('BUSY');
    if (this.preRoll) fail('PRE_ROLL_STATE');
    if(this.session.active)fail('STOP_REQUIRED');
  }
  private interruptRead(): void {
    this.displayRead?.abort.abort(Error('REC:READ_SUPERSEDED'));this.displayRead=null;
    if (this.operation?.name !== 'read') return;
    const operation = this.operation;
    this.operation = null;
    operation.abort.abort(Error('REC:READ_SUPERSEDED'));
    this.osc.recording.cancelRead();
  }
  private stopped(): void {
    const state = this.osc.recording.snapshot();
    if (!state.recordMode.fresh || !state.isPlaying.fresh) fail('UNKNOWN');
    if (state.recordMode.value !== false || state.isPlaying.value !== false) fail('NOT_STOPPED');
  }
  public selectTrack(ref: TrackRef, context?: CommandExecutionContext) {
    this.idle(context); this.currentSong(); this.stopped();
    if (!ref || !Number.isInteger(ref.index) || typeof ref.id !== 'string' || typeof ref.name !== 'string') fail('IDENTITY');
    this.selected = { index: ref.index, id: ref.id, name: ref.name }; this.preparedToken = null;
    this.cohort=null;this.strictCohort=false;
    this.identity(); return this.snapshot();
  }
  public setPoint(beats: number, context?: CommandExecutionContext) {
    this.idle(context); this.stopped();
    if (!Number.isFinite(beats) || beats < 0 || beats > 10_000_000) fail('POSITION');
    this.point = beats; this.range = null; this.preparedToken = null; return this.snapshot();
  }
  private marker(value: MarkerRef): MarkerRef {
    if (!value || Object.keys(value).length !== 2 || typeof value.name !== 'string' || !Number.isFinite(value.time) || value.time < 0 || value.time > 10_000_000
      || !this.currentSong().cuePoints.some(cue => cue.name === value.name && cue.time === value.time)) fail('MARKER_CHANGED');
    return {name: value.name, time: value.time};
  }
  private markerRange(value: MarkerRange): MarkerRange {
    if (!value || Object.keys(value).length !== 3 || typeof value.loop !== 'boolean') fail('ARGUMENTS');
    const start=this.startRef(value.start),end=value.end===null?null:this.marker(value.end);
    if ((end && end.time<=start.time)||(value.loop&&!end)) fail('LOOP_RANGE');
    return {start, end, loop: value.loop};
  }
  private startRef(value:StartRef):StartRef {
    if(value&&'source' in value){
      if(Object.keys(value).length!==2||value.source!=='cursor'||!Number.isFinite(value.time)||value.time<0||value.time>10_000_000)fail('POSITION');
      return {source:'cursor',time:value.time};
    }
    return this.marker(value as MarkerRef);
  }
  private async jumpMarker(operation: Operation, marker: StartRef): Promise<void> {
    if('source' in marker){
      const owner:PreRoll={operation,song:this.currentSong(),tracks:this.activeTracks().map(ref=>({...ref})),range:this.range!,bars:0,start:marker.time,
        numerator:Number(this.value('numerator')),denominator:Number(this.value('denominator')),phase:'preparing',
        originalClick:this.osc.recording.snapshot().metronome.value===true,originalLoopStart:Number(this.value('loopStart')),
        clickOwned:false,loopStartOwned:false,cue:null,cueCreating:null,cueDeleting:null,cueOriginals:[],cueCleanup:false,generation:this.cueGeneration};
      this.preRoll=owner;
      await this.positionPreRoll(owner,()=>{this.ownPreRoll(owner);this.startRef(marker);});
      if(this.preRoll===owner)this.preRoll=null;
      return;
    }
    const song = this.currentSong(), point = this.marker(marker);
    const index = song.cuePoints.findIndex(cue => cue.name === point.name && cue.time === point.time);
    await this.osc.recording.jumpToMarker(index, point.time, () => {
      this.check(operation);
      if (this.currentSong() !== song || song.cuePoints[index]?.name !== point.name || song.cuePoints[index]?.time !== point.time) fail('MARKER_CHANGED');
      if (this.selected) this.identity();
    });
  }
  public chooseLocator(direction: 'previous' | 'next', context?: CommandExecutionContext) {
    this.idle(context);
    if (direction !== 'previous' && direction !== 'next') fail('POSITION');
    const from = this.point ?? this.osc.recording.snapshot().songTimeBeats.value ?? 0;
    const cues = this.snapshot().locators.map(cue => cue.time).sort((a,b) => a-b);
    const next = direction === 'next' ? cues.find(time => time > from + .001) : cues.findLast(time => time < from - .001);
    if (next === undefined) fail('NO_LOCATOR');
    return this.setPoint(next, context);
  }
  public async refresh() {
    this.currentSong();
    if (this.refreshing) return this.refreshing;
    if (this.trackMutation) return this.snapshot();
    if (this.operation && this.operation.name!=='record') return this.snapshot();
    // A committed pre-roll/start may still own the write coordinator. Observe
    // cards and native volume separately without taking the transport lock.
    const promise = this.operation ? this.refreshBusyDisplay() : this.run('read', undefined, async operation => {
      await this.readDisplayAndVolumes(operation);
      if(this.session.active||this.value('backToArranger')===true)await this.session.refresh(()=>this.check(operation),operation.abort.signal);
    });
    this.refreshing = promise;
    try { return await promise; } finally { if (this.refreshing === promise) this.refreshing = null; }
  }
  private async readDisplayAndVolumes(operation:Operation):Promise<void> {
    // An unrelated OSC timeout must not skip the native SDK read. Wait for
    // both readers before releasing their guard, including the failure path.
    const results=await Promise.allSettled([this.readDisplay(operation),this.readVolumes(operation)]);
    this.check(operation);
    for(const result of results)if(result.status==='rejected')throw result.reason;
  }
  private async refreshBusyDisplay() {
    const operation:Operation={name:'display-read',abort:new AbortController()};this.displayRead=operation;
    try {
      this.check(operation);
      for(const address of [GET.currentSongTime,GET.metronome,GET.tempo])this.osc.send(address);
      for(let index=0;index<this.currentSong().tracks.length;index++)for(const address of [REC_PREFLIGHT.trackSolo,REC_PREFLIGHT.trackMute])this.osc.send(address,[{type:'integer',value:index}]);
      const results=await Promise.allSettled([this.readArms(operation),this.readVolumes(operation)]);
      this.check(operation);
      for(const result of results)if(result.status==='rejected')throw result.reason;
      return this.snapshot();
    }finally{if(this.displayRead===operation)this.displayRead=null;}
  }
  public async refreshSession(offset:unknown) {
    this.currentSong();this.session.window(offset);
    if(this.operation || this.trackMutation)return this.snapshot();
    return this.run('read',undefined,async operation=>{await this.readDisplayAndVolumes(operation);await this.session.refresh(()=>this.check(operation),operation.abort.signal);});
  }
  public async recordSession(request:unknown,context?:CommandExecutionContext) {
    this.idle(context);if(this.punch || this.armedByRecorder.length)fail('STOP_REQUIRED');
    return this.run('sessionRecord',context,async operation=>{
      const song=this.currentSong();await this.read(operation);
      const check=()=>{this.check(operation);if(this.getSong()!==song)fail('IDENTITY');};
      const preflight=(refs:TrackRef[])=>{
        check();this.identities(refs);
        const transport=this.osc.recording.snapshot();
        if(!transport.recordMode.fresh || transport.recordMode.value!==false)fail('SESSION_CONFLICT');
        if(this.value('sessionRecord')!==false)fail('SESSION_CONFLICT');
        for(const ref of refs)if(this.value('arm:'+ref.index)!==true || this.value('canArm:'+ref.index)!==true)fail('TRACK_NOT_ARMED');
        if(song.tracks.some((_,index)=>this.armed(index)!==refs.some(ref=>ref.index===index)))fail('OTHER_ARMED');
      };
      const prepared=await this.session.record(request,context!,check,operation.abort.signal,preflight);
      const refs=prepared.owner.targets.map(target=>target.target.track);
      await this.read(operation,undefined,refs);
      const numerator=Number(this.value('numerator')),denominator=Number(this.value('denominator'));
      if(!Number.isInteger(numerator)||numerator<1||![1,2,4,8,16,32].includes(denominator))fail('UNKNOWN');
      const finalCheck=()=>{preflight(refs);if(this.value('numerator')!==numerator||this.value('denominator')!==denominator)fail('SESSION_CONFLICT');for(const ref of refs)if(![0,1,2].includes(Number(this.value('monitor:'+ref.index)))||this.value('monitor:'+ref.index)===null)fail('UNKNOWN');};
      finalCheck();
      await this.session.fire(prepared,prepared.bars*numerator*4/denominator,check,operation.abort.signal,finalCheck);
    });
  }
  public async stopSession(context?:CommandExecutionContext) {
    this.requireContext(context);
    if(this.preRoll || this.punch || this.armedByRecorder.length || this.operation && !['read','sessionRecord','stop'].includes(this.operation.name))fail('BUSY');
    this.trackMutation?.abort.abort(Error('REC:STOPPED'));this.trackMutation=null;
    this.operation?.abort.abort(Error('REC:STOPPED'));this.operation=null;this.preparedToken=null;
    return this.run('stop',context,operation=>this.session.stop(()=>this.check(operation),operation.abort.signal));
  }
  public async returnToArrangement(context?:CommandExecutionContext) {
    this.requireContext(context);if(this.preRoll||this.punch||this.armedByRecorder.length)fail('STOP_REQUIRED');
    return this.run('return',context,async operation=>{
      const song=this.currentSong();
      const guard=()=>{this.check(operation);if(this.getSong()!==song)fail('IDENTITY');};
      const safe=()=>{
        guard();const transport=this.osc.recording.snapshot();
        if(!transport.recordMode.fresh||transport.recordMode.value!==false||!transport.isPlaying.fresh||this.value('sessionRecord')!==false)fail('SESSION_CONFLICT');
        if(this.session.active||!this.session.allIdle())fail('SESSION_CONFLICT');
      };
      await this.read(operation);await this.session.refresh(guard,operation.abort.signal);safe();
      if(this.value('backToArranger')===false)return;
      if(this.value('backToArranger')!==true)fail('UNKNOWN');
      this.osc.send(REC_RETURN.setBackToArranger,[{type:'integer',value:0}]);
      const deadline=Date.now()+RECORDING_CONFIRM_MS;
      while(true) {
        await this.read(operation);await this.session.refresh(guard,operation.abort.signal);safe();
        if(this.value('backToArranger')===false)return;
        if(Date.now()>=deadline)fail('RETURN_UNCONFIRMED');
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(timer);reject(operation.abort.signal.reason);};
          const timer=setTimeout(()=>{operation.abort.signal.removeEventListener('abort',abort);resolve();},100);
          operation.abort.signal.addEventListener('abort',abort,{once:true});
          if(operation.abort.signal.aborted)abort();
        });
      }
    });
  }
  private async run(name: string, context: CommandExecutionContext | undefined, body: (op: Operation) => Promise<void>) {
    if (context) this.requireContext(context);
    if (name !== 'read') this.interruptRead();
    if (this.operation || (this.trackMutation && name !== 'stop')) fail('BUSY');
    if (this.preRoll && !['read','stop','click'].includes(name)) fail('PRE_ROLL_STATE');
    if(this.session.active && !['read','stop','click','return'].includes(name))fail('STOP_REQUIRED');
    const operation: Operation = { name, abort: new AbortController(), ...(context ? { context } : {}) };
    this.operation = operation;
    try { this.check(operation); await body(operation); this.check(operation); }
    catch (error) {
      if (name !== 'read') this.preparedToken = null;
      if (name === 'record') {
        if (this.preRoll?.operation === operation) await this.failPreRoll(this.preRoll, error);
        else if (this.punch && (this.punch.owned || this.armedByRecorder.length>0 || this.capture?.ownedPunchOut) && this.operation === operation && operation.context?.isCurrent() && this.getSong() === this.punch.song && this.osc.state.available && this.osc.state.connected) {
          try {await this.stop(operation.context);} catch { /* STOP reports its own cleanup failure; retain the original action error. */ }
        } else if(this.punch?.phase==='baseline') this.punch=null;
      }
      throw error;
    }
    finally {
      if (this.operation === operation && !(this.preRoll?.operation === operation && this.preRoll.phase === 'running')) this.operation = null;
    }
    return this.snapshot();
  }
  private readonly observe = ({ address, args, at }: { address: string; args: { value?: unknown }[]; at: number }) => {
    let key: string | undefined, value: unknown;
    if (address === CLIP.getTrackNames && args.every(arg => typeof arg.value === 'string')) { key = 'names'; value = args.map(arg => arg.value); }
    else if (address === GET.tempo && args.length === 1 && typeof args[0]?.value === 'number' && Number.isFinite(args[0].value) && args[0].value >= 20 && args[0].value <= 999) {
      key = 'tempo'; value = args[0].value;
    }
    else if (args.length === 1 && (address === REC_LOOP.getStart || address === REC_LOOP.getLength)) {
      const raw = args[0]?.value;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw >= (address === REC_LOOP.getLength ? .001 : 0) && raw <= 10_000_000) {
        key = address === REC_LOOP.getStart ? 'loopStart' : 'loopLength'; value = raw;
      }
    }
    else if (args.length === 1 && (address === REC_PREFLIGHT.signatureNumerator || address === REC_PREFLIGHT.signatureDenominator)) {
      const raw = args[0]?.value;
      if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 99) {
        key = address === REC_PREFLIGHT.signatureNumerator ? 'numerator' : 'denominator'; value = raw;
      }
    }
    else if (args.length === 1 && observedBoolean(args[0]?.value) !== null) {
      key = address === GET.isPlaying ? 'isPlaying' : address === REC.getRecordMode ? 'recordMode' : flags.find(flag => REC_PREFLIGHT[flag] === address); value = observedBoolean(args[0]?.value);
    } else if (args.length === 2 && Number.isInteger(args[0]?.value) && Number(args[0]?.value) >= 0) {
      const field = address === REC_PREFLIGHT.trackArm ? 'arm' : address === REC_PREFLIGHT.trackSolo ? 'solo' : address === REC_PREFLIGHT.trackMute ? 'mute'
        : address === REC_PREFLIGHT.trackCanArm ? 'canArm' : address === REC_PREFLIGHT.trackMonitor ? 'monitor' : null;
      const raw = args[1]?.value;
      if (field === 'monitor' ? raw === 0 || raw === 1 || raw === 2 : field !== null && observedBoolean(raw) !== null) {
        key = field + ':' + args[0]?.value; value = field === 'monitor' ? raw : observedBoolean(raw);
      }
    }
    if (key !== undefined) {
      if (key === 'punchIn' && this.punch?.phase === 'active' && value !== this.punch.expected) this.punch.owned = false;
      if(key==='punchOut'&&this.capture?.active&&value!==this.capture.expectedPunchOut)this.capture.ownedPunchOut=false;
      this.observed.set(key, { value, at, revision: ++this.revision }); this.emit('observation');
      const capture=this.capture;
      // Once native pre-roll is accepted, every OFF edge retires its plan.
      // A following ON cannot lend this old plan authority over a new take.
      if(capture&&!capture.controller&&this.preRoll?.phase==='running'
        &&(key==='isPlaying'||key==='recordMode')&&value===false)this.retireCapture();
      if(capture?.active&&capture.controller&&(
        key==='loop'&&!capture.loopPending&&value!==capture.loopExpected
        ||key==='punchOut'&&value!==capture.expectedPunchOut
        ||key==='loopStart'&&Math.abs(Number(value)-capture.range.start.time)>=.001
        ||key==='loopLength'&&capture.range.end&&Math.abs(Number(value)-(capture.range.end.time-capture.range.start.time))>=.001))capture.controller.invalidate();
    }
  };
  /** Card ARM confirmation excludes recording-only state, but observes every
   * armable input so MULTI cannot hide a host-side exclusive-arm side effect. */
  private readArms(operation: Operation, song = this.currentSong(), expectedArms?: Map<number, boolean>): Promise<void> {
    this.check(operation);if(song.tracks.length>256)fail('TRACK_LIMIT');
    const refs=song.tracks.map((track,index)=>({index,id:String(track.handle.id),name:track.name}));
    const revision=this.revision;
    const packets:[key:string,address:string,index?:number][]=[['names',CLIP.getTrackNames],['isPlaying',GET.isPlaying],['recordMode',REC.getRecordMode],
      ...refs.map(ref=>['canArm:'+ref.index,REC_PREFLIGHT.trackCanArm,ref.index] as [string,string,number])];
    const armRetries = new Map<number, number>();
    return new Promise<void>((resolve,reject)=>{
      let done=false,armsRequested=false,retry:ReturnType<typeof setTimeout>|undefined;
      const guard=()=>{this.check(operation);if(this.getSong()!==song)fail('IDENTITY');};
      const fresh=(key:string)=>{
        if((this.observed.get(key)?.revision??0)<=revision || this.value(key)===null) return false;
        if(expectedArms && key.startsWith('arm:')){
          const trkIdx=Number(key.slice(4));
          if(expectedArms.has(trkIdx) && this.value(key)!==expectedArms.get(trkIdx)){
            const count=(armRetries.get(trkIdx)??0);
            if(count < 2){
              armRetries.set(trkIdx, count + 1);
              guard();
              this.osc.send(REC_PREFLIGHT.trackArm, [{type:'integer', value:trkIdx}]);
              return false;
            }
          }
        }
        return true;
      };
      const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);this.off('observation',changed);operation.abort.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
      const abort=()=>finish(operation.abort.signal.reason);
      const sendMissing=()=>{for(const [key,address,index] of packets){if(done)break;if(fresh(key))continue;guard();this.osc.send(address,index===undefined?[]:[{type:'integer',value:index}]);}};
      const changed=()=>{
        try {
          guard();
          if(!armsRequested&&refs.every(ref=>fresh('canArm:'+ref.index))){
            armsRequested=true;
            for(const ref of refs)if(this.value('canArm:'+ref.index)===true)packets.push(['arm:'+ref.index,REC_PREFLIGHT.trackArm,ref.index]);
            sendMissing();
          }
          if(armsRequested&&packets.every(([key])=>fresh(key))){this.identities(refs);finish();}
        } catch(error){finish(error);}
      };
      const poll=()=>{try{guard();if(fresh('names'))this.identities(refs);sendMissing();if(!done)retry=setTimeout(poll,100);}catch(error){finish(error);}};
      const timer=setTimeout(()=>finish(Error('REC:UNKNOWN')),RECORDING_CONFIRM_MS);
      this.on('observation',changed);operation.abort.signal.addEventListener('abort',abort,{once:true});poll();
    });
  }
  /** A failed passive full read must not strand card state behind an unrelated
   * meter/Loop/click timeout. Recover only fresh card evidence, retaining the
   * original failure; recording actions still use the full reader below. */
  private async readDisplay(operation:Operation):Promise<void> {
    const song=this.currentSong();
    try {await this.read(operation);}
    catch(error){
      this.check(operation);if(this.getSong()!==song)fail('IDENTITY');
      if(!(error instanceof Error)||!['REC:UNKNOWN','Requested recording state was not observed within 2000 ms'].includes(error.message))throw error;
      await this.readArms(operation,song);throw error;
    }
  }
  private async read(operation: Operation, expected?: LoopExpectation, monitorRefs?:TrackRef[]): Promise<void> {
    this.check(operation);
    const song = this.currentSong();
    if (song.tracks.length > 256) fail('TRACK_LIMIT');
    const markerRead=operation.name==='position';
    const packets: [string, number?][] = markerRead?[]:flags.map(key => [REC_PREFLIGHT[key]]);
    const keys: string[] = markerRead?[]:[...flags];
    if(!markerRead || this.selected){packets.push([CLIP.getTrackNames]);keys.push('names');}
    if(!markerRead){packets.push([REC_PREFLIGHT.signatureNumerator],[REC_PREFLIGHT.signatureDenominator]);keys.push('numerator','denominator');}
    for (let i = 0; !markerRead && i < song.tracks.length; i++) {
      packets.push([REC_PREFLIGHT.trackArm, i], [REC_PREFLIGHT.trackCanArm, i]);
      keys.push('arm:' + i, 'canArm:' + i);
      for (const field of ['solo','mute'] as const) if (operation.name === 'read' || this.value(field+':'+i) === null) {
        packets.push([field === 'solo' ? REC_PREFLIGHT.trackSolo : REC_PREFLIGHT.trackMute,i]); keys.push(field+':'+i);
      }
    }
    for (const ref of markerRead?(this.selected?[this.selected]:[]):monitorRefs??this.activeTracks()) {packets.push([REC_PREFLIGHT.trackMonitor,ref.index]);keys.push('monitor:'+ref.index);}
    if (!markerRead && (this.range?.loop || this.range?.end || this.capture || this.preRollRequested || this.preRoll)) { packets.push([REC_LOOP.getStart], [REC_LOOP.getLength]); keys.push('loopStart', 'loopLength'); }
    // Tempo feeds the phone's cursor interpolation on every read, but only a
    // pre-roll depends on it: a silent tempo reply must not stall unrelated
    // reads (Session, Arrangement return, ARM) until the evidence deadline.
    if (!markerRead) { packets.push([GET.tempo]); if (this.preRollRequested || this.preRoll) keys.push('tempo'); }
    const revision = this.revision;
    const evidence = new Promise<void>((resolve, reject) => {
      let done = false, retry: ReturnType<typeof setTimeout> | undefined;
      const mismatch = () => Error(`REC:${expected!.code || 'LOOP_UNCONFIRMED'} (${expected!.key} expected=${expected!.value} observed=${this.value(expected!.key)})`);
      const matches = () => {
        if (!expected) return true;
        const actual = this.value(expected.key);
        return typeof expected.value === 'number' ? typeof actual === 'number' && Math.abs(actual - expected.value) < .001 : actual === expected.value;
      };
      const finish = (error?: unknown) => {
        if (done) return; done = true;
        clearTimeout(timer); clearTimeout(retry); this.off('observation', observed); operation.abort.signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(operation.abort.signal.reason);
      const fresh = (key: string) => (this.observed.get(key)?.revision ?? 0) > revision && this.value(key) !== null;
      // Live raises on a group's Track.arm and AbletonOSC answers nil; a fresh
      // can_be_armed=false is that track's complete ARM evidence.
      const satisfied = (key: string) => fresh(key) || key.startsWith('arm:') && fresh('canArm:' + key.slice(4)) && this.value('canArm:' + key.slice(4)) === false;
      const observed = () => {
        try {
          this.check(operation);
          if (expected && Date.now() >= expected.deadline) { finish(mismatch()); return; }
          if (keys.every(satisfied)) {
            if (expected && operation.name !== 'stop') { this.preflight(false, false, expected.key); this.markerRange(this.range!); }
            if (matches()) finish();
          }
        }
        catch (error) { finish(error); }
      };
      const poll = () => {
        if (done || !expected) return;
        try {
          this.check(operation);
          if (Date.now() >= expected.deadline) { finish(mismatch()); return; }
          this.osc.send(expected.getter);
          if (!done) retry = setTimeout(poll, Math.min(100, expected.deadline - Date.now()));
        } catch (error) { finish(error); }
      };
      const timer = setTimeout(() => finish(expected && !matches() ? mismatch() : Error('REC:UNKNOWN')),
        expected ? Math.max(0, expected.deadline - Date.now()) : RECORDING_CONFIRM_MS);
      this.on('observation', observed); operation.abort.signal.addEventListener('abort', abort, { once: true });
      try { if(!keys.length)finish();for (const [address, index] of packets) this.osc.send(address, index === undefined ? [] : [{ type: 'integer', value: index }]); }
      catch (error) { finish(error); }
      if (expected && !done) retry = setTimeout(poll, Math.min(100, expected.deadline - Date.now()));
    });
    await Promise.all([evidence, this.osc.recording.readState()]);
    this.check(operation);
  }
  private preflight(armed: boolean, checkLoop = true, confirming?: string): void {
    if (this.cohort) this.identities(this.cohort); else this.identity();
    const transport = this.osc.recording.snapshot();
    if (!transport.isPlaying.fresh || !transport.recordMode.fresh) fail('UNKNOWN');
    if (transport.isPlaying.value || transport.recordMode.value) fail('NOT_STOPPED');
    this.conditions(armed, checkLoop, confirming);
  }
  private conditions(armed: boolean, checkLoop = true, confirming?: string): void {
    for (const key of flags) {
      const value = this.value(key); if (value === null) fail('UNKNOWN');
      if ((key === 'loop' && !checkLoop) || key === confirming) continue;
      const expected=key==='punchIn'?this.punch?.expected??false:key==='punchOut'?this.capture?.expectedPunchOut??false:key==='loop'?(this.capture?.loopExpected??this.range?.loop===true):false;
      if (value !== expected) fail(key.toUpperCase());
    }
    if (checkLoop && (this.range?.loop || this.capture&&this.range?.end) && (Math.abs(Number(this.value('loopStart')) - this.range!.start.time) >= .001
      || Math.abs(Number(this.value('loopLength')) - (this.range.end!.time - this.range.start.time)) >= .001
      || this.value('loopStart') === null || this.value('loopLength') === null)) fail('LOOP_RANGE');
    const refs = this.activeTracks();
    for (const ref of refs) {
      if (this.value('canArm:' + ref.index) !== true) fail('NOT_ARMABLE');
      if ((armed || this.strictCohort) && this.value('arm:' + ref.index) !== true) fail('TRACK_NOT_ARMED');
      if (this.cohort && (this.value('monitor:'+ref.index) === null || ![0,1,2].includes(Number(this.value('monitor:'+ref.index))))) fail('UNKNOWN');
    }
    if (this.currentSong().tracks.some((_, index) => !refs.some(ref => ref.index === index) && this.armed(index) !== false)) fail('OTHER_ARMED');
    if (this.point === null) fail('POSITION');
  }
  public async arm(enabled: boolean, expected: TrackRef, context?: CommandExecutionContext) {
    this.requireContext(context); if (typeof enabled !== 'boolean') fail('ARM_VALUE');
    if (!expected || Object.keys(expected).length !== 3 || !Number.isInteger(expected.index) || expected.index < 0 || typeof expected.id !== 'string' || typeof expected.name !== 'string') fail('IDENTITY');
    this.identity(expected);
    this.preparedToken = null;
    return this.run('arm', context, async operation => {
      await this.read(operation); this.identity(expected);
      const state = this.osc.recording.snapshot();
      if (!state.recordMode.fresh || state.recordMode.value !== false || !state.isPlaying.fresh || state.isPlaying.value !== false) fail('NOT_STOPPED');
      if (this.value('canArm:' + this.selected!.index) !== true) fail('NOT_ARMABLE');
      this.check(operation); this.identity(expected).arm = enabled;
      await this.read(operation); this.identity(expected);
      if (this.value('arm:' + this.selected!.index) !== enabled) fail('ARM_UNCONFIRMED');
    });
  }
  public async trackControl(expected: TrackRef, property: 'arm' | 'solo' | 'mute', enabled: boolean, armMode: 'multi' | 'exclusive' = 'multi', context?: CommandExecutionContext) {
    this.requireContext(context); const ref = this.trackRef(expected);
    if (!['arm','solo','mute'].includes(property) || typeof enabled !== 'boolean' || !['multi','exclusive'].includes(armMode)) fail('ARGUMENTS');
    if (this.trackMutation || ['stop','rename'].includes(this.operation?.name ?? '')) fail('BUSY');
    if (property === 'arm') {
      this.idle(context);
      return this.run('tracks',context,async operation => {
        const song=this.currentSong();
        await this.readArms(operation,song); this.identities([ref]); this.stopped();
        if (this.armedByRecorder.length) fail('STOP_REQUIRED');
        if (this.value('canArm:'+ref.index) !== true) fail('NOT_ARMABLE');
        const arms=()=>song.tracks.map((_,index)=>this.value('canArm:'+index)===false?false:this.value('arm:'+index));
        const before=arms();
        const identities = song.tracks.map((track,index)=>({index,id:String(track.handle.id),name:track.name}));
        if (before.some(value => typeof value !== 'boolean')) fail('UNKNOWN');
        const desired = before.map((value,index) => index === ref.index ? enabled : armMode === 'exclusive' && enabled ? false : value);
        const changedArms = new Map<number, boolean>();
        for (let index=0;index<song.tracks.length;index++) if (before[index] !== desired[index]) {
          this.check(operation); this.identities(identities); if (this.getSong() !== song) fail('IDENTITY'); this.stopped();
          // A native arm setter can affect peers before applying/throwing.
          // Auxiliary snapshots must not resurrect any pre-write ARM value.
          for(const affected of identities)this.observed.delete('arm:'+affected.index);
          song.tracks[index]!.arm = desired[index] as boolean;
          changedArms.set(index, desired[index] as boolean);
        }
        await this.readArms(operation,song,changedArms); this.identities(identities); this.stopped();
        const actual=arms();
        if (actual[ref.index] !== enabled) fail('ARM_UNCONFIRMED');
        if (desired.some((value,index) => actual[index] !== value)) fail('ARM_COLLATERAL_DISARM');
        this.preparedToken = null;
      });
    }
    // Solo/mute use their own single mutation slot. Their GET confirmation
    // never starts/cancels a transport read or replaces the pre-roll owner.
    const operation: Operation = {name:'track-'+property,abort:new AbortController(),...(context?{context}:{})};
    const song = this.currentSong(); this.trackMutation = operation;
    const key=property+':'+ref.index, getter=property === 'solo'?REC_PREFLIGHT.trackSolo:REC_PREFLIGHT.trackMute;
    const observe = (desired?: boolean) => new Promise<void>((resolve,reject) => {
      const revision=this.revision;let done=false,retry:ReturnType<typeof setTimeout>|undefined;
      const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);this.off('observation',changed);operation.abort.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
      const guard=()=>{this.check(operation);if(this.getSong()!==song)fail('IDENTITY');};
      const abort=()=>finish(operation.abort.signal.reason);
      const changed=()=>{try {guard();if((this.observed.get(key)?.revision??0)>revision && (this.observed.get('names')?.revision??0)>revision && typeof this.value(key)==='boolean') {this.identities([ref]);if(desired===undefined||this.value(key)===desired)finish();}}catch(error){finish(error);}};
      const poll=()=>{if(done)return;try{guard();this.osc.send(CLIP.getTrackNames);this.osc.send(getter,[{type:'integer',value:ref.index}]);if(!done)retry=setTimeout(poll,100);}catch(error){finish(error);}};
      const timer=setTimeout(()=>finish(Error('REC:TRACK_UNCONFIRMED')),RECORDING_CONFIRM_MS);
      this.on('observation',changed);operation.abort.signal.addEventListener('abort',abort,{once:true});poll();
    });
    try {
      await observe();this.check(operation);this.identities([ref]);
      song.tracks[ref.index]![property]=enabled;
      await observe(enabled);this.check(operation);
    } finally {if(this.trackMutation===operation)this.trackMutation=null;}
    return this.snapshot();
  }
  public async renameTrack(expected: TrackRef, value: unknown, context?: CommandExecutionContext) {
    this.requireContext(context);const ref=this.trackRef(expected);
    if(typeof value!=='string' || !value.trim() || value.trim().length>128 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) fail('NAME');
    const name=value.trim();this.idle(context);
    const idle=()=>{if(this.preRoll || this.punch || this.armedByRecorder.length)fail('STOP_REQUIRED');};
    idle();
    return this.run('rename',context,async operation=>{
      const song=this.currentSong();
      await this.read(operation);if(this.getSong()!==song)fail('IDENTITY');this.identities([ref]);this.stopped();idle();
      const track=song.tracks[ref.index]!;
      this.check(operation);if(this.getSong()!==song)fail('IDENTITY');
      if(name===ref.name)return;
      // Track.name is the SDK's transactional setter; never rename via an
      // invented OSC endpoint or replay an unconfirmed name after reconnect.
      const selected=this.selected;
      // The setter may apply before throwing or confirmation may fail. Retire
      // old names first; only fresh confirmation may restore the selection.
      if(selected?.index===ref.index && selected.id===ref.id)this.selected=null;
      this.cohort=null;this.strictCohort=false;
      track.name=name;this.preparedToken=null;
      await new Promise<void>((resolve,reject)=>{
        let done=false,retry:ReturnType<typeof setTimeout>|undefined;
        const revision=this.revision;
        const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);this.off('observation',changed);operation.abort.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
        const abort=()=>finish(operation.abort.signal.reason);
        const guard=()=>{
          this.check(operation);
          const current=this.getSong();
          if(current!==song || current.tracks[ref.index]!==track || String(track.handle.id)!==ref.id
            || current.tracks.filter(item=>String(item.handle.id)===ref.id).length!==1
            || ![ref.name,name].includes(track.name))fail('IDENTITY');
        };
        const changed=()=>{
          try {
            guard();if((this.observed.get('names')?.revision??0)<=revision)return;
            const names=this.value('names');
            if(!Array.isArray(names) || names.length!==song.tracks.length)return;
            if(![ref.name,name].includes(names[ref.index]))fail('IDENTITY');
            if(names[ref.index]===name && track.name===name)finish();
          } catch(error){finish(error);}
        };
        const poll=()=>{if(done)return;try {guard();this.osc.send(CLIP.getTrackNames);if(!done)retry=setTimeout(poll,100);}catch(error){finish(error);}};
        const timer=setTimeout(()=>finish(Error('REC:RENAME_UNCONFIRMED')),RECORDING_CONFIRM_MS);
        this.on('observation',changed);operation.abort.signal.addEventListener('abort',abort,{once:true});poll();
      });
      this.check(operation);
      if(this.getSong()!==song || song.tracks[ref.index]!==track)fail('IDENTITY');
      this.identities([{...ref,name}]);
      if(selected?.index===ref.index && selected.id===ref.id && this.selected===null)this.selected={...ref,name};
    });
  }
  public async setVolume(expected: TrackRef, volume: number, context?: CommandExecutionContext) {
    this.requireContext(context);
    const ref = this.trackRef(expected);
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) fail('ARGUMENTS');
    if (this.trackMutation || ['stop','rename'].includes(this.operation?.name ?? '')) fail('BUSY');
    this.interruptRead();
    const song = this.currentSong();
    const track = song.tracks[ref.index];
    if (!track || String(track.handle.id) !== ref.id || track.name !== ref.name) fail('IDENTITY');
    const parameter=track.mixer?.volume;
    if(!parameter || typeof parameter.getValue!=='function' || typeof parameter.setValue!=='function')fail('VOLUME_UNKNOWN');
    const {min,max}=parameter;
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)fail('VOLUME_UNKNOWN');
    const operation:Operation={name:'track-volume',abort:new AbortController(),...(context?{context}:{})};
    this.trackMutation=operation;
    try {
      this.check(operation);
      if(this.getSong()!==song || song.tracks[ref.index]!==track || track.name!==ref.name)fail('IDENTITY');
      if(song.tracks.filter(item=>String(item.handle.id)===ref.id).length!==1)fail('IDENTITY');
      this.volumes.delete(track);
      await this.volumeResult(operation,()=>parameter.setValue(min+volume*(max-min)));
      this.check(operation);
      if(this.getSong()!==song || song.tracks[ref.index]!==track || track.name!==ref.name)fail('IDENTITY');
      await this.readVolume(operation,song,track);
      const actual=this.trackVolume(track)?.value;
      if(actual===undefined || Math.abs(actual-volume)>0.002)fail('VOLUME_UNCONFIRMED');
    } catch(error) {this.volumes.delete(track);throw error;}
    finally {if(this.trackMutation===operation)this.trackMutation=null;}
    return this.snapshot();
  }
  private punchContext(owner: PunchOwner, operation: Operation): void {
    this.check(operation);
    if (owner !== this.punch || owner.song !== this.getSong() || owner.generation !== this.cueGeneration) fail('IDENTITY');
    if (!this.osc.state.available || !this.osc.state.connected) fail('CONNECTION');
  }
  private async configurePunch(operation: Operation): Promise<void> {
    const owner = this.punch!; this.punchContext(owner,operation); this.stopped();
    if (this.value('punchIn') !== owner.desired) {
      owner.phase='configuring';owner.expected=owner.desired;owner.owned=true;
      this.osc.send(REC_PREROLL.setPunchIn,[{type:'integer',value:owner.desired?1:0}]);
      await this.read(operation,{key:'punchIn',value:owner.desired,getter:REC_PREFLIGHT.punchIn,deadline:Date.now()+RECORDING_CONFIRM_MS,code:'PUNCH_UNCONFIRMED'});
    }
    this.punchContext(owner,operation);owner.expected=owner.desired;owner.phase='active';
  }
  private async restorePunch(operation: Operation): Promise<void> {
    const owner=this.punch;if(!owner)return;
    this.punchContext(owner,operation);await this.read(operation);this.punchContext(owner,operation);this.stopped();
    if (owner.owned && this.value('punchIn')===owner.desired) {
      owner.phase='restoring';owner.expected=owner.original;
      this.osc.send(REC_PREROLL.setPunchIn,[{type:'integer',value:owner.original?1:0}]);
      await this.read(operation,{key:'punchIn',value:owner.original,getter:REC_PREFLIGHT.punchIn,deadline:Date.now()+RECORDING_CONFIRM_MS,code:'PUNCH_UNCONFIRMED'});
    }
  }
  public async prepare(context?: CommandExecutionContext) {
    this.requireContext(context); this.preparedToken = null;
    return this.run('prepare', context, async operation => {
      await this.read(operation); this.preflight(true); this.check(operation);
      await this.osc.recording.seek(this.point!);
      await this.read(operation); this.preflight(true);
      if (Math.abs((this.osc.recording.snapshot().songTimeBeats.value ?? -1) - this.point!) >= .001) fail('POSITION_CHANGED');
      this.preparedToken = randomUUID();
    });
  }
  /** One explicit REC action owns arm, region confirmation, seek and start. */
  public async record(track: TrackRef | TrackRef[], requested: MarkerRange, context?: CommandExecutionContext, preRollBars = 0, passes?:number|null) {
    this.idle(context); this.currentSong();
    if(this.punch || this.armedByRecorder.length || this.capture?.ownedPunchOut) fail('STOP_REQUIRED');
    const range = this.markerRange(requested);
    if(passes!==undefined && (passes!==null&&(!Number.isInteger(passes)||passes<1||passes>10) || !range.end&&passes!==null || range.end&&range.loop!==(passes!==1)))fail('PASSAGES');
    if (![0,1,2,4].includes(preRollBars)) fail('PRE_ROLL_RANGE');
    const refs=this.refs(track),song=this.currentSong(),strict=Array.isArray(track);
    for(const ref of refs){const candidate=song.tracks[ref.index];if(!candidate||String(candidate.handle.id)!==ref.id||candidate.name!==ref.name)fail('IDENTITY');}
    this.preparedToken = null; this.preRollError = null;
    return this.run('record', context, async operation => {
      this.range = range; this.point = range.start.time; this.preRollRequested = preRollBars > 0;
      this.cohort=refs.map(ref=>({...ref}));this.strictCohort=strict;this.selected={...refs[0]!};
      await this.read(operation); this.stopped();
      if(this.getSong()!==song)fail('IDENTITY');this.identities(refs);
      this.retireCapture();this.capture=null;
      if(passes!==undefined){
        const punchOut=this.value('punchOut');if(typeof punchOut!=='boolean')fail('UNKNOWN');
        this.capture={song,generation:this.cueGeneration,tracks:refs.map(ref=>({...ref})),range,total:passes,
          originalPunchOut:punchOut,expectedPunchOut:punchOut,ownedPunchOut:false,loopExpected:range.loop,abort:new AbortController(),active:false,loopPending:false};
      }
      const original=this.value('punchIn');if(typeof original!=='boolean')fail('UNKNOWN');
      this.punch={song,generation:this.cueGeneration,original,desired:preRollBars>0,expected:original,owned:false,phase:'baseline'};
      await this.read(operation); this.preflight(false, false); this.markerRange(range);
      if (preRollBars) {
        const numerator = Number(this.value('numerator')), denominator = Number(this.value('denominator'));
        const start = range.start.time - preRollBars * numerator * 4 / denominator;
        if (!Number.isFinite(start) || start < 0 || ![1,2,4,8,16,32].includes(denominator)) fail('PRE_ROLL_RANGE');
        const transport = this.osc.recording.snapshot();
        if (!transport.metronome.fresh || transport.metronome.value === null || this.value('tempo') === null || this.value('loopStart') === null) fail('UNKNOWN');
        this.preRoll = {operation, song:this.currentSong(), tracks:refs.map(ref=>({...ref})), range, bars:preRollBars, start, numerator, denominator,
          phase:'preparing', originalClick:transport.metronome.value, originalLoopStart:Number(this.value('loopStart')),
          clickOwned:false, loopStartOwned:false, cue:null, cueCreating:null, cueDeleting:null,
          cueOriginals:[], cueCleanup:false, generation:this.cueGeneration};
      }
      // Only Loop and the explicitly owned Punch In state are configured.
      // Anonymous GET replies may still describe an earlier poll. Wait for
      // matching evidence using GETs only; all loop writes share one budget.
      const loopDeadline = Date.now() + RECORDING_CONFIRM_MS;
      const loopGetters = {loop: REC_PREFLIGHT.loop, loopStart: REC_LOOP.getStart, loopLength: REC_LOOP.getLength};
      const confirm = async (address: string, value: number, key: 'loop' | 'loopStart' | 'loopLength', expected: number | boolean) => {
        this.check(operation); this.identity(); this.stopped(); this.markerRange(range);
        if (Date.now() >= loopDeadline) fail(`LOOP_UNCONFIRMED (${key} expected=${expected} observed=${this.value(key)})`);
        this.osc.send(address, [{type: address === REC_LOOP.setEnabled ? 'integer' : 'float', value}]);
        await this.read(operation, {key, value: expected, getter: loopGetters[key], deadline: loopDeadline}); this.preflight(false, false);
      };
      if (this.value('loop') !== false) await confirm(REC_LOOP.setEnabled, 0, 'loop', false);
      if (range.loop || this.capture&&range.end) {
        await confirm(REC_LOOP.setLength, range.end!.time - range.start.time, 'loopLength', range.end!.time - range.start.time);
        await confirm(REC_LOOP.setStart, range.start.time, 'loopStart', range.start.time);
        if(range.loop)await confirm(REC_LOOP.setEnabled, 1, 'loop', true);
      }
      if(this.capture){
        const owner=this.capture,desired=Boolean(range.end);owner.expectedPunchOut=desired;
        if(this.value('punchOut')!==desired){
          owner.ownedPunchOut=true;this.osc.send(REC_CAPTURE.setPunchOut,[{type:'integer',value:desired?1:0}]);
          await this.read(operation,{key:'punchOut',value:desired,getter:REC_PREFLIGHT.punchOut,deadline:Date.now()+RECORDING_CONFIRM_MS,code:'PUNCH_UNCONFIRMED'});
        }
      }
      this.check(operation); this.preflight(false); this.markerRange(range);
      if (this.preRoll) { await this.startPreRoll(this.preRoll); return; }
      await this.configurePunch(operation);
      this.armedByRecorder = refs.map(ref=>({...ref}));
      if(!strict) this.identity().arm = true;
      await this.read(operation); this.preflight(true);
      await this.jumpMarker(operation, range.start);
      await this.read(operation); this.preflight(true); this.markerRange(range);
      if (Math.abs((this.osc.recording.snapshot().songTimeBeats.value ?? -1) - range.start.time) >= .001) fail('POSITION_CHANGED');
      await this.osc.recording.startRecording(() => {this.check(operation); this.identities(refs); this.conditions(true); this.markerRange(range);});
      this.lastAttempt = {id:randomUUID(),track:{...refs[0]!},tracks:refs.map(ref=>({...ref})),point:range.start.time,stopped:false,mark:null};
      this.activateCapture();
    }).finally(() => {this.preRollRequested = false;});
  }
  private retireCapture(){
    if(!this.capture)return;
    // Retain cleanup ownership and progress, but let display polling resume
    // once STOP has retired the plan, including when native cleanup fails.
    this.capture.active=false;
    this.capture.controller?.cancel();
    this.capture.abort.abort(Error('REC:STOPPED'));
  }
  private captureGuard(owner:CaptureOwner){
    if(this.capture!==owner||this.getSong()!==owner.song||this.cueGeneration!==owner.generation)fail('IDENTITY');
    if(!this.osc.state.available||!this.osc.state.connected)fail('CONNECTION');
    this.identities(owner.tracks);this.markerRange(owner.range);
    for(let index=0;index<owner.song.tracks.length;index++){
      const expected=owner.tracks.some(ref=>ref.index===index),capability=this.value('canArm:'+index);
      if(capability===false&&!expected)continue;
      if(capability!==true||this.armed(index)!==expected||owner.song.tracks[index]!.arm!==expected)fail('CAPTURE_CHANGED');
    }
    if(this.value('loop')===null||!owner.loopPending&&this.value('loop')!==owner.loopExpected)fail('CAPTURE_CHANGED');
    if(owner.range.end&&(Math.abs(Number(this.value('loopStart'))-owner.range.start.time)>=.001
      ||Math.abs(Number(this.value('loopLength'))-(owner.range.end.time-owner.range.start.time))>=.001
      ||this.value('loopStart')===null||this.value('loopLength')===null||this.value('punchOut')!==true))fail('CAPTURE_CHANGED');
  }
  private async finishCaptureLoop(owner:CaptureOwner){
    this.captureGuard(owner);if(owner.abort.signal.aborted)throw owner.abort.signal.reason;
    const revision=this.revision;
    owner.loopPending=true;
    this.osc.send(REC_LOOP.setEnabled,[{type:'integer',value:0}]);
    await new Promise<void>((resolve,reject)=>{
      let done=false,retry:ReturnType<typeof setTimeout>|undefined;
      const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);this.off('observation',changed);owner.abort.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
      const abort=()=>finish(owner.abort.signal.reason);
      const changed=()=>{try{this.captureGuard(owner);if((this.observed.get('loop')?.revision??0)>revision&&this.value('loop')===false)finish();}catch(error){finish(error);}};
      const poll=()=>{if(done)return;try{this.captureGuard(owner);this.osc.send(REC_PREFLIGHT.loop);if(!done)retry=setTimeout(poll,100);}catch(error){finish(error);}};
      this.on('observation',changed);owner.abort.signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>finish(Error('REC:LOOP_UNCONFIRMED')),RECORDING_CONFIRM_MS);poll();changed();
    });
    this.captureGuard(owner);owner.loopExpected=false;owner.loopPending=false;
  }
  private activateCapture(){
    const owner=this.capture;if(!owner||owner.abort.signal.aborted)return;owner.active=true;
    if(!owner.range.end||owner.controller)return;
    this.captureGuard(owner);
    // Authority for this already committed native plan belongs to the host.
    // Its token, Set, region and cohort guards remain valid without a phone
    // socket. STOP, replacement or link loss permanently retire the token.
    const context=this.captureContext(owner);
    owner.controller=new ArrangementCapture(this.osc,owner.range.start.time,owner.range.end.time,owner.total,{
      guard:()=>this.captureGuard(owner),pollTracks:()=>{
        for(let index=0;index<owner.song.tracks.length;index++){
          this.osc.send(REC_PREFLIGHT.trackCanArm,[{type:'integer',value:index}]);
          if(this.value('canArm:'+index)!==false)this.osc.send(REC_PREFLIGHT.trackArm,[{type:'integer',value:index}]);
        }
      },disableLoop:()=>this.finishCaptureLoop(owner),stop:()=>this.stop(context),
    });
  }
  private captureContext(owner:CaptureOwner):CommandExecutionContext {
    return {clientId:'capture-plan',isCurrent:()=>this.capture===owner&&this.getSong()===owner.song&&this.cueGeneration===owner.generation};
  }
  private async restoreCapture(operation:Operation){
    const owner=this.capture;if(!owner?.ownedPunchOut)return;
    this.check(operation);if(this.getSong()!==owner.song||owner.generation!==this.cueGeneration)fail('IDENTITY');
    await this.read(operation);this.check(operation);this.stopped();this.identities(owner.tracks);
    if(this.value('punchOut')===owner.expectedPunchOut){
      owner.expectedPunchOut=owner.originalPunchOut;
      this.osc.send(REC_CAPTURE.setPunchOut,[{type:'integer',value:owner.originalPunchOut?1:0}]);
      await this.read(operation,{key:'punchOut',value:owner.originalPunchOut,getter:REC_PREFLIGHT.punchOut,deadline:Date.now()+RECORDING_CONFIRM_MS,code:'PUNCH_UNCONFIRMED'});
    }
    owner.ownedPunchOut=false;
  }
  private ownPreRoll(owner: PreRoll, operation = owner.operation): void {
    this.check(operation);
    if (this.preRoll !== owner || this.currentSong() !== owner.song) fail('IDENTITY');
    this.identities(owner.tracks);
  }
  private async setPreRollProperty(owner: PreRoll, address: string, value: number, key: 'punchIn' | 'loopStart', operation = owner.operation): Promise<void> {
    this.ownPreRoll(owner, operation); this.stopped();
    this.osc.send(address, [{type:key === 'punchIn' ? 'integer' : 'float', value}]);
    await this.read(operation, {key, value:key === 'punchIn' ? value === 1 : value,
      getter:key === 'punchIn' ? REC_PREFLIGHT.punchIn : REC_LOOP.getStart, deadline:Date.now()+RECORDING_CONFIRM_MS, code:'PRE_ROLL_STATE'});
    this.ownPreRoll(owner, operation);
  }
  private cueContext(owner: PreRoll, context = owner.cleanupContext ?? owner.operation.context): void {
    this.requireContext(context);
    if (owner.generation !== this.cueGeneration || this.getSong() !== owner.song) fail('IDENTITY');
    if (!this.osc.state.available || !this.osc.state.connected) fail('CONNECTION');
  }
  private async cueDeadline(promise: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([promise,new Promise<never>((_,reject) => {timer=setTimeout(() => reject(Error('REC:PRE_ROLL_LOCATOR')),RECORDING_CONFIRM_MS);})]);
    } finally {clearTimeout(timer);}
  }
  private async clearPreRollCue(owner: PreRoll, context = owner.operation.context): Promise<void> {
    owner.cueCleanup = true; owner.cleanupContext = context;
    if (owner.cueCreating) await this.cueDeadline(owner.cueCreating);
    const ref = owner.cue;
    if (!ref?.owned) return;
    this.cueContext(owner,context);
    if (!owner.cueDeleting) {
      const current = owner.song.cuePoints.find(cue => String(cue.handle.id) === ref.id);
      if (!current || current.time !== ref.time) fail('PRE_ROLL_LOCATOR');
      // Only the SDK handle returned by this attempt is eligible. Never
      // toggle/delete by time, index or name, and never retry this write.
      let deletion: Promise<void>;
      try {deletion = owner.song.deleteCuePoint(ref.object);} catch (error) {deletion = Promise.reject(error);}
      owner.cueDeleting = deletion.then(() => {
        if (this.getSong() !== owner.song) fail('IDENTITY');
        if (owner.song.cuePoints.some(cue => String(cue.handle.id) === ref.id)
          || owner.cueOriginals.some(original => !owner.song.cuePoints.some(cue => String(cue.handle.id) === original.id && cue.name === original.name && cue.time === original.time))) fail('PRE_ROLL_LOCATOR');
        owner.cue = null;
      });
    }
    await this.cueDeadline(owner.cueDeleting);
  }
  private async positionPreRoll(owner: PreRoll, guard: () => void): Promise<void> {
    guard(); this.stopped();
    const song = owner.song;
    owner.cueOriginals = song.cuePoints.map(cue => ({id:String(cue.handle.id),name:cue.name,time:cue.time}));
    const existing = song.cuePoints.find(cue => cue.time === owner.start);
    if (existing) owner.cue = {object:existing,id:String(existing.handle.id),time:existing.time,owned:false};
    else {
      owner.cueCreating = song.createCuePoint(owner.start).then(cue => {
        const id = String(cue.handle.id);
        if (owner.cueOriginals.some(original => original.id === id)) fail('PRE_ROLL_LOCATOR');
        owner.cue = {object:cue,id,time:cue.time,owned:true};
        // A bounded STOP/failure may finish before the SDK creation callback.
        // Clean that exact late resource once only if the original session,
        // Song and link are still valid. Loss permanently retires the owner.
        if (owner.cueCleanup) void this.clearPreRollCue(owner,owner.cleanupContext).catch(() => {});
      });
      await this.cueDeadline(owner.cueCreating);
      guard(); this.stopped();
      if (owner.cue!.time !== owner.start) fail('PRE_ROLL_LOCATOR');
      owner.cue!.object.name = 'RC pre-roll';
    }
    const ref = owner.cue!;
    const cueGuard = () => {
      guard();
      const current = song.cuePoints.findIndex(cue => String(cue.handle.id) === ref.id && cue.time === ref.time);
      if (current < 0 || current !== index) fail('PRE_ROLL_LOCATOR');
    };
    const index = song.cuePoints.findIndex(cue => String(cue.handle.id) === ref.id);
    cueGuard();
    await this.osc.recording.jumpToMarker(index,owner.start,cueGuard);
    guard(); this.stopped();
    await this.clearPreRollCue(owner);
    guard(); this.stopped();
  }
  private async startPreRoll(owner: PreRoll): Promise<void> {
    const operation = owner.operation;
    this.ownPreRoll(owner); this.preflight(false); this.markerRange(owner.range);
    await this.positionPreRoll(owner,() => {
      this.ownPreRoll(owner); this.conditions(false); this.markerRange(owner.range);
    });
    if (!owner.range.loop && Math.abs(Number(this.value('loopStart')) - owner.range.start.time) >= .001) {
      owner.loopStartOwned = true;
      await this.setPreRollProperty(owner, REC_LOOP.setStart, owner.range.start.time, 'loopStart');
    }
    await this.configurePunch(operation);
    if (!owner.originalClick) {
      owner.clickOwned = true;
      await this.osc.recording.setMetronome(true);
    }
    this.ownPreRoll(owner); this.preflight(false); this.markerRange(owner.range);
    this.armedByRecorder = owner.tracks.map(ref=>({...ref}));
    if(!this.strictCohort) this.identity(owner.tracks[0]).arm = true;
    await this.read(operation); this.preflight(true);
    const guard = () => {
      this.ownPreRoll(owner); this.conditions(true); this.markerRange(owner.range);
      if (this.value('numerator') !== owner.numerator || this.value('denominator') !== owner.denominator
        || Math.abs(Number(this.value('loopStart'))-owner.range.start.time) >= .001) fail('PRE_ROLL_STATE');
    };
    await this.osc.recording.startPreRoll(owner.start, guard, () => {
      const tempo = this.value('tempo'); return typeof tempo === 'number' ? tempo : null;
    });
    guard();
    await this.osc.recording.punchRecording(owner.range.start.time, guard);
    owner.phase = 'running';
    if(this.capture){
      const capture=this.capture,context=this.captureContext(capture);
      owner.operation.context={...context,isCurrent:()=>!capture.abort.signal.aborted&&context.isCurrent()};
    }
    this.lastAttempt = {id:randomUUID(),track:{...owner.tracks[0]!},tracks:owner.tracks.map(ref=>({...ref})),point:owner.range.start.time,stopped:false,mark:null};
    // Return the command now. Its lifecycle remains owned on the host so STOP
    // can preempt immediately and a four-bar lead-in has no client timeout.
    void this.monitorPreRoll(owner).catch(error => this.failPreRoll(owner, error));
  }
  private pausePreRoll(owner: PreRoll): Promise<void> {
    return new Promise((resolve,reject) => {
      const signal = owner.operation.abort.signal;
      const abort = () => {clearTimeout(timer); reject(signal.reason);};
      const timer = setTimeout(() => {signal.removeEventListener('abort',abort); resolve();},100);
      if (signal.aborted) {abort(); return;}
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  private async monitorPreRoll(owner: PreRoll): Promise<void> {
    let previous = this.osc.recording.snapshot().songTimeBeats.value ?? owner.start;
    let previousAt = Date.now(), progressedAt = previousAt;
    // Tempo may change during the lead-in. Live's minimum supported 20 BPM
    // gives a finite outer bound; capture itself is always native Punch In.
    const deadline = previousAt + (owner.range.start.time-owner.start)*3000 + RECORDING_CONFIRM_MS;
    try {
      for (;;) {
        await this.pausePreRoll(owner); await this.read(owner.operation);
        this.ownPreRoll(owner); this.conditions(true); this.markerRange(owner.range);
        const transport = this.osc.recording.snapshot(), now = Date.now(), position = transport.songTimeBeats.value;
        if (!transport.songTimeBeats.fresh || !transport.isPlaying.fresh || !transport.recordMode.fresh
          || transport.isPlaying.value !== true || transport.recordMode.value !== true || position === null
          || this.value('numerator') !== owner.numerator || this.value('denominator') !== owner.denominator
          || Math.abs(Number(this.value('loopStart'))-owner.range.start.time) >= .001) fail('PRE_ROLL_STATE');
        const tempo = Number(this.value('tempo'));
        if (!Number.isFinite(tempo) || position < previous-.001 || position-previous > (now-previousAt)*tempo/60000+.5) fail('PRE_ROLL_SEEK');
        if (position > previous+.001) progressedAt = now;
        if (now-progressedAt >= RECORDING_FRESH_MS || now > deadline) fail('PRE_ROLL_CLOCK');
        if (position >= owner.range.start.time) {
          if (owner.clickOwned) {
            this.ownPreRoll(owner); await this.osc.recording.setMetronome(owner.originalClick);
            owner.clickOwned = false;
          }
          owner.phase = 'complete';this.activateCapture(); return;
        }
        previous = position; previousAt = now;
      }
    } finally {
      if (this.operation === owner.operation && owner.phase === 'complete') this.operation = null;
    }
  }
  private async restorePreRoll(owner: PreRoll, operation: Operation): Promise<void> {
    await this.clearPreRollCue(owner,operation.context);
    this.check(operation);if(this.preRoll!==owner||this.getSong()!==owner.song)fail('IDENTITY');
    await this.read(operation); this.ownPreRoll(owner, operation); this.stopped();
    let failure: unknown;
    const attempt = async (restore: () => Promise<void>) => {try {await restore();} catch (error) {failure ??= error;}};
    if (owner.clickOwned && this.osc.recording.snapshot().metronome.value === true) await attempt(async () => {
      this.ownPreRoll(owner, operation); await this.osc.recording.setMetronome(owner.originalClick); owner.clickOwned = false;
    });
    if (owner.loopStartOwned && this.value('loop') === false && Math.abs(Number(this.value('loopStart'))-owner.range.start.time) < .001) await attempt(async () => {
      owner.loopStartOwned = false;
      await this.setPreRollProperty(owner, REC_LOOP.setStart, owner.originalLoopStart, 'loopStart', operation);
    });
    if (failure) throw failure;
  }
  private async failPreRoll(owner: PreRoll, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'REC:PRE_ROLL_STATE';
    if (this.preRoll !== owner) return;
    // STOP now owns cleanup. An interrupted start/monitor must not discard
    // its ownership while the priority stop is awaiting fresh evidence.
    if (this.operation?.name === 'stop') return;
    if(this.capture?.abort.signal.aborted&&this.getSong()===owner.song){
      // Retain native resource baselines for an explicit STOP, without
      // stopping or restoring properties over an external replacement take.
      if(this.operation===owner.operation)this.operation=null;
      this.preRollError=message;return;
    }
    if (!owner.clickOwned && !this.punch?.owned && !this.capture?.ownedPunchOut && !owner.loopStartOwned && !this.armedByRecorder.length && !owner.cue && !owner.cueCreating) {
      this.preRoll = null; this.punch=null;this.preRollError = message; return;
    }
    if (this.operation === owner.operation && owner.operation.context?.isCurrent()
      && this.getSong() === owner.song && this.osc.state.available && this.osc.state.connected) {
      try { await this.stop(owner.operation.context); }
      catch (cleanup) {this.preRollError = message+'; '+(cleanup instanceof Error ? cleanup.message : 'REC:PRE_ROLL_STATE'); return;}
    } else {this.preRoll = null; if (this.operation === owner.operation) this.operation = null;}
    this.preRollError = message;
  }
  /** A timeline marker positions normal header playback; it never starts it. */
  public async seekMarker(marker: MarkerRef, context?: CommandExecutionContext) {
    this.idle(context);
    const point = this.marker(marker);
    return this.run('position', context, async operation => {
      await this.read(operation); this.stopped(); this.check(operation); this.marker(point);
      const selected = this.selected;
      if (selected && this.value('monitor:' + selected.index) === 0) fail('MONITOR_IN');
      await this.jumpMarker(operation, point); this.check(operation);
    });
  }
  public async start(token: string, context?: CommandExecutionContext) {
    this.requireContext(context);
    if (this.starting?.token === token) return this.starting.promise;
    if (!token || token !== this.preparedToken) fail('PREPARE_REQUIRED');
    this.preparedToken = null;
    const promise = this.run('start', context, async operation => {
      await this.read(operation); this.preflight(true);
      if (Math.abs((this.osc.recording.snapshot().songTimeBeats.value ?? -1) - this.point!) >= .001) fail('POSITION_CHANGED');
      await this.osc.recording.startRecording(() => { this.check(operation); this.identity(); });
      this.lastAttempt = { id: randomUUID(), track: { ...this.selected! }, point: this.point!, stopped: false, mark: null };
    });
    this.starting = { token, promise };
    try { return await promise; } finally { if (this.starting?.promise === promise) this.starting = null; }
  }
  public async stop(context?: CommandExecutionContext) {
    this.requireContext(context);
    this.retireCapture();
    if(this.session.active || this.operation?.name==='sessionRecord')return this.stopSession(context);
    if (this.operation?.name === 'stop' && this.stopping) return this.stopping;
    const preRoll = this.preRoll;
    this.trackMutation?.abort.abort(Error('REC:STOPPED'));this.trackMutation=null;
    this.displayRead?.abort.abort(Error('REC:STOPPED'));this.displayRead=null;
    this.operation?.abort.abort(Error('REC:STOPPED')); this.operation = null; this.preparedToken = null;
    const promise = this.run('stop', context, async operation => {
      await this.osc.recording.stopRecording();
      // A newly loaded Set cannot inherit this recorder's track ownership.
      this.currentSong();
      let cleanupError: unknown;
      if (preRoll && this.preRoll === preRoll) {
        try { await this.restorePreRoll(preRoll, operation); }
        catch (error) {cleanupError = error;}
        finally { if (this.preRoll === preRoll) this.preRoll = null; }
      }
      if(this.punch) {
        try {await this.restorePunch(operation);} catch(error) {cleanupError??=error;} finally {this.punch=null;}
      }
      try{await this.restoreCapture(operation);}catch(error){cleanupError??=error;}
      if (this.lastAttempt) this.lastAttempt.stopped = true;
      this.armedByRecorder = [];
      if (cleanupError) throw cleanupError;
      this.cohort=null;this.strictCohort=false;this.preRollError=null;
    });
    this.stopping = promise;
    try { return await promise; } finally { if (this.stopping === promise) this.stopping = null; }
  }
  public async audition(disarm: boolean, context?: CommandExecutionContext) {
    this.requireContext(context); if (typeof disarm !== 'boolean') fail('ARGUMENTS'); this.preparedToken = null;
    return this.run('audition', context, async operation => {
      await this.read(operation); this.preflight(false);
      const index = this.selected!.index, monitor = this.value('monitor:' + index);
      if (monitor === null) fail('UNKNOWN'); if (monitor === 0) fail('MONITOR_IN');
      if (this.value('arm:' + index) !== false) {
        if (disarm !== true) fail('DISARM_REQUIRED');
        this.check(operation); this.identity().arm = false;
        await this.read(operation); this.preflight(false);
        if (this.value('arm:' + index) !== false) fail('ARM_UNCONFIRMED');
      }
      this.check(operation); await this.osc.recording.seek(this.point!);
      this.check(operation); await this.osc.recording.startPlayback(() => { this.check(operation); this.identity(); });
    });
  }
  public async click(enabled: boolean, context?: CommandExecutionContext) {
    this.requireContext(context);
    return this.run('click', context, async operation => { this.check(operation); await this.osc.recording.setMetronome(enabled); });
  }
  public mark(mark: 'good' | 'review', context?: CommandExecutionContext) {
    this.idle(context); if (!this.lastAttempt?.stopped || !['good', 'review'].includes(mark)) fail('NO_ATTEMPT');
    this.lastAttempt.mark = mark; return this.snapshot();
  }
}
