// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLIP, REC_PREFLIGHT } from '../osc-tokens.js';
import type { CommandExecutionContext } from './catalog/types.js';
import type { OSCTransport } from './osc-transport.js';
import { RECORDING_FRESH_MS } from './recording-transport.js';

interface Track { name: string; handle: { id: string | number | bigint }; arm: boolean }
interface Song { tracks: readonly Track[]; cuePoints: readonly { name: string; time: number }[] }
interface TrackRef { index: number; id: string; name: string }
interface Observed { value: unknown; at: number; revision: number }
interface Operation { name: string; abort: AbortController; context?: CommandExecutionContext }
const flags = ['loop', 'punchIn', 'punchOut', 'overdub', 'backToArranger', 'sessionRecord'] as const;
function fail(code: string): never { throw Error('REC:' + code); }

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
  private revision = 0;
  private observed = new Map<string, Observed>();
  private song: Song | null = null;

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
      transport: this.osc.recording.snapshot(), pending: this.operation?.name ?? null,
      // Observed conservative preflight is bounded; capture/take preservation
      // and count-in are not exposed by these APIs.
      captureVerified: false, preflightComplete: false,
      selected: this.selected, point: this.point, preparedToken: this.preparedToken,
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
    this.requireContext(context); if (this.operation) fail('BUSY');
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
    this.point = beats; this.preparedToken = null; return this.snapshot();
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
    if (this.operation) return this.snapshot();
    return this.run('read', undefined, operation => this.read(operation));
  }
  private async run(name: string, context: CommandExecutionContext | undefined, body: (op: Operation) => Promise<void>) {
    if (context) this.requireContext(context);
    if (this.operation) fail('BUSY');
    const operation: Operation = { name, abort: new AbortController(), ...(context ? { context } : {}) };
    this.operation = operation;
    try { this.check(operation); await body(operation); this.check(operation); }
    catch (error) { this.preparedToken = null; throw error; }
    finally { if (this.operation === operation) this.operation = null; }
    return this.snapshot();
  }
  private readonly observe = ({ address, args, at }: { address: string; args: { value?: unknown }[]; at: number }) => {
    let key: string | undefined, value: unknown;
    if (address === CLIP.getTrackNames && args.every(arg => typeof arg.value === 'string')) { key = 'names'; value = args.map(arg => arg.value); }
    else if (args.length === 1 && (address === REC_PREFLIGHT.signatureNumerator || address === REC_PREFLIGHT.signatureDenominator)) {
      const raw = args[0]?.value;
      if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 99) {
        key = address === REC_PREFLIGHT.signatureNumerator ? 'numerator' : 'denominator'; value = raw;
      }
    }
    else if (args.length === 1 && (args[0]?.value === 0 || args[0]?.value === 1)) {
      key = flags.find(flag => REC_PREFLIGHT[flag] === address); value = args[0]?.value === 1;
    } else if (args.length === 2 && Number.isInteger(args[0]?.value) && Number(args[0]?.value) >= 0) {
      const field = address === REC_PREFLIGHT.trackArm ? 'arm' : address === REC_PREFLIGHT.trackCanArm ? 'canArm' : address === REC_PREFLIGHT.trackMonitor ? 'monitor' : null;
      const raw = args[1]?.value;
      if (field && (raw === 0 || raw === 1 || (field === 'monitor' && raw === 2))) { key = field + ':' + args[0]?.value; value = field === 'monitor' ? raw : raw === 1; }
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
    const revision = this.revision;
    for (const key of keys) this.observed.delete(key);
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
  private preflight(armed: boolean): void {
    this.identity();
    const transport = this.osc.recording.snapshot();
    if (!transport.isPlaying.fresh || !transport.recordMode.fresh) fail('UNKNOWN');
    if (transport.isPlaying.value || transport.recordMode.value) fail('NOT_STOPPED');
    for (const key of flags) { const value = this.value(key); if (value === null) fail('UNKNOWN'); if (value !== false) fail(key.toUpperCase()); }
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
    const promise = this.run('stop', context, async () => { await this.osc.recording.stopRecording(); if (this.lastAttempt) this.lastAttempt.stopped = true; });
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
