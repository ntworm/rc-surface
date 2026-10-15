// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLIP, REC_LOOP, REC_PREFLIGHT } from '../osc-tokens.js';
import type { CommandExecutionContext } from './catalog/types.js';
import type { OSCTransport } from './osc-transport.js';
import { RECORDING_FRESH_MS } from './recording-transport.js';

interface Track { name: string; handle: { id: string | number | bigint }; arm: boolean }
interface Song { tracks: readonly Track[]; cuePoints: readonly { name: string; time: number }[] }
interface TrackRef { index: number; id: string; name: string }
interface MarkerRef { name: string; time: number }
interface MarkerRange { start: MarkerRef; end: MarkerRef | null; loop: boolean }
interface Observed { value: unknown; at: number; revision: number }
interface Operation { name: string; abort: AbortController; context?: CommandExecutionContext }
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

  constructor(private readonly osc: OSCTransport, private readonly getSong: () => Song) {
    super();
    osc.on('recording-observation', this.observe);
    osc.on('link-lost', this.lost);
  }

  private readonly lost = () => {
    this.operation?.abort.abort(Error('REC:CONNECTION'));
    this.preparedToken = null; this.observed.clear();
  };
  public dispose(): void {
    this.lost(); this.osc.off('recording-observation', this.observe); this.osc.off('link-lost', this.lost);
  }
  private currentSong(): Song {
    const song = this.getSong();
    if (this.song !== song) {
      this.song = song; this.selected = null; this.point = null; this.preparedToken = null;
      this.lastAttempt = null; this.observed.clear();
      this.range = null; this.armedByRecorder = null;
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
  private identity(): Track {
    const ref = this.selected, tracks = this.currentSong().tracks;
    if (!ref || this.selected !== ref) fail('TRACK_REQUIRED');
    const track = tracks[ref.index];
    if (!track || String(track.handle.id) !== ref.id || track.name !== ref.name) fail('IDENTITY');
    const names = this.value('names');
    if (!Array.isArray(names) || names.length !== tracks.length || tracks.some((item, i) => item.name !== names[i])) fail('IDENTITY');
    return track;
  }
  private idle(context?: CommandExecutionContext): void {
    this.requireContext(context); this.interruptRead(); if (this.operation) fail('BUSY');
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
    const operation: Operation = { name, abort: new AbortController(), ...(context ? { context } : {}) };
    this.operation = operation;
    try { this.check(operation); await body(operation); this.check(operation); }
    catch (error) { if (name !== 'read') this.preparedToken = null; throw error; }
    finally { if (this.operation === operation) this.operation = null; }
    return this.snapshot();
  }
  private readonly observe = ({ address, args, at }: { address: string; args: { value?: unknown }[]; at: number }) => {
    let key: string | undefined, value: unknown;
    if (address === CLIP.getTrackNames && args.every(arg => typeof arg.value === 'string')) { key = 'names'; value = args.map(arg => arg.value); }
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
  private async read(operation: Operation): Promise<void> {
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
    if (this.range?.loop) { packets.push([REC_LOOP.getStart], [REC_LOOP.getLength]); keys.push('loopStart', 'loopLength'); }
    const revision = this.revision;
    const evidence = new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => { clearTimeout(timer); this.off('observation', observed); operation.abort.signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
      const abort = () => finish(operation.abort.signal.reason);
      const observed = () => {
        try { this.check(operation); if (keys.every(key => (this.observed.get(key)?.revision ?? 0) > revision && this.value(key) !== null)) finish(); }
        catch (error) { finish(error); }
      };
      const timer = setTimeout(() => finish(Error('REC:UNKNOWN')), 2000);
      this.on('observation', observed); operation.abort.signal.addEventListener('abort', abort, { once: true });
      try { for (const [address, index] of packets) this.osc.send(address, index === undefined ? [] : [{ type: 'integer', value: index }]); }
      catch (error) { finish(error); }
    });
    await Promise.all([evidence, this.osc.recording.readState()]);
    this.check(operation);
  }
  private preflight(armed: boolean, checkLoop = true): void {
    this.identity();
    const transport = this.osc.recording.snapshot();
    if (!transport.isPlaying.fresh || !transport.recordMode.fresh) fail('UNKNOWN');
    if (transport.isPlaying.value || transport.recordMode.value) fail('NOT_STOPPED');
    this.conditions(armed, checkLoop);
  }
  private conditions(armed: boolean, checkLoop = true): void {
    for (const key of flags) {
      const value = this.value(key); if (value === null) fail('UNKNOWN');
      if (key === 'loop' && !checkLoop) continue;
      const expected = key === 'loop' && this.range?.loop === true;
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
  public async arm(enabled: boolean, context?: CommandExecutionContext) {
    this.requireContext(context); if (typeof enabled !== 'boolean') fail('ARM_VALUE');
    this.preparedToken = null;
    return this.run('arm', context, async operation => {
      await this.read(operation); this.identity();
      const state = this.osc.recording.snapshot();
      if (!state.recordMode.fresh || state.recordMode.value !== false || !state.isPlaying.fresh || state.isPlaying.value !== false) fail('NOT_STOPPED');
      if (this.value('canArm:' + this.selected!.index) !== true) fail('NOT_ARMABLE');
      this.check(operation); this.identity().arm = enabled;
      await this.read(operation); this.identity();
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
  public async record(track: TrackRef, requested: MarkerRange, context?: CommandExecutionContext) {
    this.idle(context); this.currentSong();
    const range = this.markerRange(requested);
    if (!track || Object.keys(track).length !== 3 || !Number.isInteger(track.index) || track.index < 0 || typeof track.id !== 'string' || typeof track.name !== 'string') fail('IDENTITY');
    const candidate = this.currentSong().tracks[track.index];
    if (!candidate || String(candidate.handle.id) !== track.id || candidate.name !== track.name) fail('IDENTITY');
    this.preparedToken = null;
    return this.run('record', context, async operation => {
      this.range = range; this.point = range.start.time;
      await this.read(operation); this.stopped();
      this.selected = {...track};
      await this.read(operation); this.preflight(false, false); this.markerRange(range);
      // The chosen Loop setting is explicit. Never silently clear Punch,
      // Session Record, other armed tracks, or Back to Arrangement.
      const confirm = async (address: string, value: number, key: string, expected: unknown) => {
        this.check(operation); this.identity(); this.stopped(); this.markerRange(range);
        this.osc.send(address, [{type: address === REC_LOOP.setEnabled ? 'integer' : 'float', value}]);
        await this.read(operation); this.preflight(false, false);
        const actual = this.value(key);
        if (typeof expected === 'number' ? typeof actual !== 'number' || Math.abs(actual - expected) >= .001 : actual !== expected) fail('LOOP_UNCONFIRMED');
      };
      if (this.value('loop') !== false) await confirm(REC_LOOP.setEnabled, 0, 'loop', false);
      if (range.loop) {
        await confirm(REC_LOOP.setLength, range.end!.time - range.start.time, 'loopLength', range.end!.time - range.start.time);
        await confirm(REC_LOOP.setStart, range.start.time, 'loopStart', range.start.time);
        await confirm(REC_LOOP.setEnabled, 1, 'loop', true);
      }
      this.check(operation); this.preflight(false); this.markerRange(range);
      this.armedByRecorder = {...track}; this.identity().arm = true;
      await this.read(operation); this.preflight(true);
      await this.osc.recording.seek(range.start.time);
      await this.read(operation); this.preflight(true); this.markerRange(range);
      if (Math.abs((this.osc.recording.snapshot().songTimeBeats.value ?? -1) - range.start.time) >= .001) fail('POSITION_CHANGED');
      await this.osc.recording.startRecording(() => {this.check(operation); this.identity(); this.conditions(true); this.markerRange(range);});
      this.lastAttempt = {id:randomUUID(),track:{...track},point:range.start.time,stopped:false,mark:null};
    });
  }
  /** A timeline marker positions normal header playback; it never starts it. */
  public async seekMarker(marker: MarkerRef, context?: CommandExecutionContext) {
    this.idle(context);
    const point = this.marker(marker);
    return this.run('position', context, async operation => {
      await this.read(operation); this.stopped(); this.check(operation); this.marker(point);
      const selected = this.selected;
      if (selected && this.value('monitor:' + selected.index) === 0) fail('MONITOR_IN');
      await this.osc.recording.seek(point.time); this.check(operation);
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
    this.operation?.abort.abort(Error('REC:STOPPED')); this.operation = null; this.preparedToken = null;
    const promise = this.run('stop', context, async operation => {
      await this.osc.recording.stopRecording();
      // A newly loaded Set cannot inherit this recorder's track ownership.
      const song = this.currentSong();
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
