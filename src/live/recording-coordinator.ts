// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLIP, GET, REC_LOOP, REC_PREFLIGHT, REC_PREROLL } from '../osc-tokens.js';
import type { CommandExecutionContext } from './catalog/types.js';
import type { OSCTransport } from './osc-transport.js';
import { RECORDING_CONFIRM_MS, RECORDING_FRESH_MS } from './recording-transport.js';

interface Track { name: string; handle: { id: string | number | bigint }; arm: boolean }
interface Cue { name: string; time: number; handle: { id: string | number | bigint } }
interface Song {
  tracks: readonly Track[]; cuePoints: readonly Cue[];
  createCuePoint(time: number): Promise<Cue>; deleteCuePoint(cue: Cue): Promise<void>;
}
interface TrackRef { index: number; id: string; name: string }
interface MarkerRef { name: string; time: number }
interface MarkerRange { start: MarkerRef; end: MarkerRef | null; loop: boolean }
interface Observed { value: unknown; at: number; revision: number }
interface Operation { name: string; abort: AbortController; context?: CommandExecutionContext }
interface LoopExpectation { key: 'loop' | 'loopStart' | 'loopLength' | 'punchIn'; value: number | boolean; getter: string; deadline: number; code?: string }
interface PreRoll {
  operation: Operation; song: Song; track: TrackRef; range: MarkerRange; bars: number;
  start: number; numerator: number; denominator: number; phase: 'preparing' | 'running' | 'complete';
  originalClick: boolean; originalLoopStart: number; clickOwned: boolean; punchOwned: boolean; loopStartOwned: boolean;
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
  private lastAttempt: { id: string; track: TrackRef; point: number; stopped: boolean; mark: 'good' | 'review' | null } | null = null;
  private operation: Operation | null = null;
  private starting: { token: string; promise: Promise<ReturnType<RecordingCoordinator['snapshot']>> } | null = null;
  private stopping: Promise<ReturnType<RecordingCoordinator['snapshot']>> | null = null;
  private refreshing: Promise<ReturnType<RecordingCoordinator['snapshot']>> | null = null;
  private revision = 0;
  private observed = new Map<string, Observed>();
  private song: Song | null = null;
  private range: MarkerRange | null = null;
  private armedByRecorder: TrackRef | null = null;
  private preRoll: PreRoll | null = null;
  private preRollRequested = false;
  private preRollError: string | null = null;
  private cueGeneration = 0;

  constructor(private readonly osc: OSCTransport, private readonly getSong: () => Song) {
    super();
    osc.on('recording-observation', this.observe);
    osc.on('link-lost', this.lost);
  }

  private readonly lost = () => {
    this.cueGeneration++;
    this.operation?.abort.abort(Error('REC:CONNECTION'));
    this.operation = null;
    this.preparedToken = null; this.observed.clear();
    if (this.preRoll) { this.preRoll = null; this.preRollError = 'REC:CONNECTION'; }
    this.preRollRequested = false;
  };
  public dispose(): void {
    this.lost(); this.osc.off('recording-observation', this.observe); this.osc.off('link-lost', this.lost);
  }
  private currentSong(): Song {
    const song = this.getSong();
    if (this.song !== song) {
      this.cueGeneration++;
      this.song = song; this.selected = null; this.point = null; this.preparedToken = null;
      this.lastAttempt = null; this.observed.clear();
      this.range = null; this.armedByRecorder = null;
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
  public snapshot() {
    const song = this.currentSong();
    return {
      transport: this.osc.recording.snapshot(), pending: this.operation?.name === 'read' ? null : this.operation?.name ?? null,
      // Observed conservative preflight is bounded; capture/take preservation
      // and count-in are not exposed by these APIs.
      captureVerified: false, preflightComplete: false,
      selected: this.selected, point: this.point, preparedToken: this.preparedToken, range: this.range,
      loopRegion: {start: this.value('loopStart'), length: this.value('loopLength')},
      safety: Object.fromEntries(flags.map(key => [key, this.value(key)])),
      tracks: song.tracks.map((track, index) => ({ index, id: String(track.handle.id), name: track.name,
        arm: this.value('arm:' + index), canArm: this.value('canArm:' + index), monitor: this.value('monitor:' + index) })),
      locators: song.cuePoints.filter(cue => Number.isFinite(cue.time) && cue.time >= 0).map(cue => ({ name: cue.name, time: cue.time })),
      meter: { numerator: this.value('numerator'), denominator: this.value('denominator') },
      lastAttempt: this.lastAttempt,
      preRoll: this.preRoll ? {bars:this.preRoll.bars, phase:this.preRoll.phase, start:this.preRoll.start, point:this.preRoll.range.start.time} : null,
      ...(this.preRollError ? {error:this.preRollError} : {}),
    };
  }
  private requireContext(context?: CommandExecutionContext): void {
    if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) fail('SESSION');
  }
  private check(operation: Operation): void {
    if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    if (operation !== this.operation) fail('STOPPED');
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
  private idle(context?: CommandExecutionContext): void {
    this.requireContext(context); this.interruptRead(); if (this.operation) fail('BUSY');
    if (this.preRoll) fail('PRE_ROLL_STATE');
  }
  private interruptRead(): void {
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
    const start = this.marker(value.start), end = value.end === null ? null : this.marker(value.end);
    if (value.loop && (!end || end.time <= start.time)) fail('LOOP_RANGE');
    return {start, end, loop: value.loop};
  }
  private async jumpMarker(operation: Operation, marker: MarkerRef): Promise<void> {
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
    if (this.operation?.name === 'read' && this.refreshing) return this.refreshing;
    if (this.operation) return this.snapshot();
    const promise = this.run('read', undefined, operation => this.read(operation));
    this.refreshing = promise;
    try { return await promise; } finally { if (this.refreshing === promise) this.refreshing = null; }
  }
  private async run(name: string, context: CommandExecutionContext | undefined, body: (op: Operation) => Promise<void>) {
    if (context) this.requireContext(context);
    if (name !== 'read') this.interruptRead();
    if (this.operation) fail('BUSY');
    if (this.preRoll && !['read','stop','click'].includes(name)) fail('PRE_ROLL_STATE');
    const operation: Operation = { name, abort: new AbortController(), ...(context ? { context } : {}) };
    this.operation = operation;
    try { this.check(operation); await body(operation); this.check(operation); }
    catch (error) {
      if (name !== 'read') this.preparedToken = null;
      if (name === 'record' && this.preRoll?.operation === operation) await this.failPreRoll(this.preRoll, error);
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
      key = flags.find(flag => REC_PREFLIGHT[flag] === address); value = observedBoolean(args[0]?.value);
    } else if (args.length === 2 && Number.isInteger(args[0]?.value) && Number(args[0]?.value) >= 0) {
      const field = address === REC_PREFLIGHT.trackArm ? 'arm' : address === REC_PREFLIGHT.trackCanArm ? 'canArm' : address === REC_PREFLIGHT.trackMonitor ? 'monitor' : null;
      const raw = args[1]?.value;
      if (field === 'monitor' ? raw === 0 || raw === 1 || raw === 2 : field !== null && observedBoolean(raw) !== null) {
        key = field + ':' + args[0]?.value; value = field === 'monitor' ? raw : observedBoolean(raw);
      }
    }
    if (key !== undefined) { this.observed.set(key, { value, at, revision: ++this.revision }); this.emit('observation'); }
  };
  private async read(operation: Operation, expected?: LoopExpectation): Promise<void> {
    this.check(operation);
    const song = this.currentSong();
    if (song.tracks.length > 256) fail('TRACK_LIMIT');
    const packets: [string, number?][] = flags.map(key => [REC_PREFLIGHT[key]]);
    packets.push([CLIP.getTrackNames], [REC_PREFLIGHT.signatureNumerator], [REC_PREFLIGHT.signatureDenominator]);
    const keys: string[] = [...flags, 'names', 'numerator', 'denominator'];
    for (let i = 0; i < song.tracks.length; i++) {
      packets.push([REC_PREFLIGHT.trackArm, i], [REC_PREFLIGHT.trackCanArm, i]);
      keys.push('arm:' + i, 'canArm:' + i);
    }
    if (this.selected) { packets.push([REC_PREFLIGHT.trackMonitor, this.selected.index]); keys.push('monitor:' + this.selected.index); }
    if (this.range?.loop || this.preRollRequested || this.preRoll) { packets.push([REC_LOOP.getStart], [REC_LOOP.getLength]); keys.push('loopStart', 'loopLength'); }
    if (this.preRollRequested || this.preRoll) { packets.push([GET.tempo]); keys.push('tempo'); }
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
      const observed = () => {
        try {
          this.check(operation);
          if (expected && Date.now() >= expected.deadline) { finish(mismatch()); return; }
          if (keys.every(key => (this.observed.get(key)?.revision ?? 0) > revision && this.value(key) !== null)) {
            if (expected) { this.preflight(false, false, expected.key); this.markerRange(this.range!); }
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
      try { for (const [address, index] of packets) this.osc.send(address, index === undefined ? [] : [{ type: 'integer', value: index }]); }
      catch (error) { finish(error); }
      if (expected && !done) retry = setTimeout(poll, Math.min(100, expected.deadline - Date.now()));
    });
    await Promise.all([evidence, this.osc.recording.readState()]);
    this.check(operation);
  }
  private preflight(armed: boolean, checkLoop = true, confirming?: string): void {
    this.identity();
    const transport = this.osc.recording.snapshot();
    if (!transport.isPlaying.fresh || !transport.recordMode.fresh) fail('UNKNOWN');
    if (transport.isPlaying.value || transport.recordMode.value) fail('NOT_STOPPED');
    this.conditions(armed, checkLoop, confirming);
  }
  private conditions(armed: boolean, checkLoop = true, confirming?: string): void {
    for (const key of flags) {
      const value = this.value(key); if (value === null) fail('UNKNOWN');
      if ((key === 'loop' && !checkLoop) || key === confirming) continue;
      const expected = key === 'loop' && this.range?.loop === true || key === 'punchIn' && this.preRoll?.punchOwned === true;
      if (value !== expected) fail(key.toUpperCase());
    }
    if (checkLoop && this.range?.loop && (Math.abs(Number(this.value('loopStart')) - this.range.start.time) >= .001
      || Math.abs(Number(this.value('loopLength')) - (this.range.end!.time - this.range.start.time)) >= .001
      || this.value('loopStart') === null || this.value('loopLength') === null)) fail('LOOP_RANGE');
    const selected = this.selected!;
    if (this.value('canArm:' + selected.index) !== true) fail('NOT_ARMABLE');
    if (armed && this.value('arm:' + selected.index) !== true) fail('TRACK_NOT_ARMED');
    if (this.currentSong().tracks.some((_, index) => index !== selected.index && this.value('arm:' + index) !== false)) fail('OTHER_ARMED');
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
  public async record(track: TrackRef, requested: MarkerRange, context?: CommandExecutionContext, preRollBars = 0) {
    this.idle(context); this.currentSong();
    const range = this.markerRange(requested);
    if (![0,1,2,4].includes(preRollBars)) fail('PRE_ROLL_RANGE');
    if (!track || Object.keys(track).length !== 3 || !Number.isInteger(track.index) || track.index < 0 || typeof track.id !== 'string' || typeof track.name !== 'string') fail('IDENTITY');
    const candidate = this.currentSong().tracks[track.index];
    if (!candidate || String(candidate.handle.id) !== track.id || candidate.name !== track.name) fail('IDENTITY');
    this.preparedToken = null; this.preRollError = null;
    return this.run('record', context, async operation => {
      this.range = range; this.point = range.start.time; this.preRollRequested = preRollBars > 0;
      await this.read(operation); this.stopped();
      this.selected = {...track};
      await this.read(operation); this.preflight(false, false); this.markerRange(range);
      if (preRollBars) {
        const numerator = Number(this.value('numerator')), denominator = Number(this.value('denominator'));
        const start = range.start.time - preRollBars * numerator * 4 / denominator;
        if (!Number.isFinite(start) || start < 0 || ![1,2,4,8,16,32].includes(denominator)) fail('PRE_ROLL_RANGE');
        const transport = this.osc.recording.snapshot();
        if (!transport.metronome.fresh || transport.metronome.value === null || this.value('tempo') === null || this.value('loopStart') === null) fail('UNKNOWN');
        this.preRoll = {operation, song:this.currentSong(), track:{...track}, range, bars:preRollBars, start, numerator, denominator,
          phase:'preparing', originalClick:transport.metronome.value, originalLoopStart:Number(this.value('loopStart')),
          clickOwned:false, punchOwned:false, loopStartOwned:false, cue:null, cueCreating:null, cueDeleting:null,
          cueOriginals:[], cueCleanup:false, generation:this.cueGeneration};
      }
      // The chosen Loop setting is explicit. Never silently clear Punch,
      // Session Record, other armed tracks, or Back to Arrangement.
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
      if (range.loop) {
        await confirm(REC_LOOP.setLength, range.end!.time - range.start.time, 'loopLength', range.end!.time - range.start.time);
        await confirm(REC_LOOP.setStart, range.start.time, 'loopStart', range.start.time);
        await confirm(REC_LOOP.setEnabled, 1, 'loop', true);
      }
      this.check(operation); this.preflight(false); this.markerRange(range);
      if (this.preRoll) { await this.startPreRoll(this.preRoll); return; }
      this.armedByRecorder = {...track}; this.identity().arm = true;
      await this.read(operation); this.preflight(true);
      await this.jumpMarker(operation, range.start);
      await this.read(operation); this.preflight(true); this.markerRange(range);
      if (Math.abs((this.osc.recording.snapshot().songTimeBeats.value ?? -1) - range.start.time) >= .001) fail('POSITION_CHANGED');
      await this.osc.recording.startRecording(() => {this.check(operation); this.identity(); this.conditions(true); this.markerRange(range);});
      this.lastAttempt = {id:randomUUID(),track:{...track},point:range.start.time,stopped:false,mark:null};
    }).finally(() => {this.preRollRequested = false;});
  }
  private ownPreRoll(owner: PreRoll, operation = owner.operation): void {
    this.check(operation);
    if (this.preRoll !== owner || this.currentSong() !== owner.song) fail('IDENTITY');
    const track = owner.song.tracks[owner.track.index];
    if (!track || String(track.handle.id) !== owner.track.id || track.name !== owner.track.name) fail('IDENTITY');
    const names = this.value('names');
    if (!Array.isArray(names) || owner.song.tracks.some((item,index) => names[index] !== item.name)) fail('IDENTITY');
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
      this.ownPreRoll(owner); this.identity(owner.track); this.conditions(false); this.markerRange(owner.range);
    });
    if (!owner.range.loop && Math.abs(Number(this.value('loopStart')) - owner.range.start.time) >= .001) {
      owner.loopStartOwned = true;
      await this.setPreRollProperty(owner, REC_LOOP.setStart, owner.range.start.time, 'loopStart');
    }
    owner.punchOwned = true;
    await this.setPreRollProperty(owner, REC_PREROLL.setPunchIn, 1, 'punchIn');
    if (!owner.originalClick) {
      owner.clickOwned = true;
      await this.osc.recording.setMetronome(true);
    }
    this.ownPreRoll(owner); this.preflight(false); this.markerRange(owner.range);
    this.armedByRecorder = {...owner.track}; this.identity(owner.track).arm = true;
    await this.read(operation); this.preflight(true);
    const guard = () => {
      this.ownPreRoll(owner); this.identity(owner.track); this.conditions(true); this.markerRange(owner.range);
      if (this.value('numerator') !== owner.numerator || this.value('denominator') !== owner.denominator
        || Math.abs(Number(this.value('loopStart'))-owner.range.start.time) >= .001) fail('PRE_ROLL_STATE');
    };
    await this.osc.recording.startPreRoll(owner.start, guard, () => {
      const tempo = this.value('tempo'); return typeof tempo === 'number' ? tempo : null;
    });
    guard();
    await this.osc.recording.punchRecording(owner.range.start.time, guard);
    owner.phase = 'running';
    this.lastAttempt = {id:randomUUID(),track:{...owner.track},point:owner.range.start.time,stopped:false,mark:null};
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
        this.ownPreRoll(owner); this.identity(owner.track); this.conditions(true); this.markerRange(owner.range);
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
          owner.phase = 'complete'; return;
        }
        previous = position; previousAt = now;
      }
    } finally {
      if (this.operation === owner.operation && owner.phase === 'complete') this.operation = null;
    }
  }
  private async restorePreRoll(owner: PreRoll, operation: Operation): Promise<void> {
    await this.clearPreRollCue(owner,operation.context);
    this.ownPreRoll(owner, operation); await this.read(operation); this.ownPreRoll(owner, operation); this.stopped();
    let failure: unknown;
    const attempt = async (restore: () => Promise<void>) => {try {await restore();} catch (error) {failure ??= error;}};
    if (owner.clickOwned && this.osc.recording.snapshot().metronome.value === true) await attempt(async () => {
      this.ownPreRoll(owner, operation); await this.osc.recording.setMetronome(owner.originalClick); owner.clickOwned = false;
    });
    if (owner.punchOwned && this.value('punchIn') === true) await attempt(async () => {
      // Expected state changes before confirmation so subsequent preflight
      // observes the restored OFF value rather than this workflow's ON.
      owner.punchOwned = false;
      await this.setPreRollProperty(owner, REC_PREROLL.setPunchIn, 0, 'punchIn', operation);
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
    if (!owner.clickOwned && !owner.punchOwned && !owner.loopStartOwned && !this.armedByRecorder && !owner.cue && !owner.cueCreating) {
      this.preRoll = null; this.preRollError = message; return;
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
    if (this.operation?.name === 'stop' && this.stopping) return this.stopping;
    const preRoll = this.preRoll;
    this.operation?.abort.abort(Error('REC:STOPPED')); this.operation = null; this.preparedToken = null;
    const promise = this.run('stop', context, async operation => {
      await this.osc.recording.stopRecording();
      // A newly loaded Set cannot inherit this recorder's track ownership.
      const song = this.currentSong();
      let cleanupError: unknown;
      if (preRoll && this.preRoll === preRoll) {
        try { await this.restorePreRoll(preRoll, operation); }
        catch (error) {cleanupError = error;}
        finally { if (this.preRoll === preRoll) this.preRoll = null; }
      }
      if (this.lastAttempt) this.lastAttempt.stopped = true;
      const ref = this.armedByRecorder;
      if (ref) {
        this.check(operation);
        const track = song.tracks[ref.index];
        if (!track || String(track.handle.id) !== ref.id || track.name !== ref.name) fail('IDENTITY');
        this.stopped(); track.arm = false;
        await this.read(operation);
        if (this.value('arm:' + ref.index) !== false) fail('ARM_UNCONFIRMED');
        this.armedByRecorder = null;
      }
      if (cleanupError) throw cleanupError;
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
