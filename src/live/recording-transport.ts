// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { EventEmitter } from 'node:events';
import { CMD, GET, REC, REC_PREROLL, RESPONSE } from '../osc-tokens.js';

export const RECORDING_FRESH_MS = 2000;
export const RECORDING_CONFIRM_MS = 2000;

interface RecordingValues {
  recordMode: boolean;
  isPlaying: boolean;
  songTimeBeats: number;
  metronome: boolean;
}
type Field = keyof RecordingValues;
export interface RecordingObservation<T> {
  value: T | null;
  observedAt: number | null;
  fresh: boolean;
}
export type RecordingTransportState = {
  [K in Field]: RecordingObservation<RecordingValues[K]>;
} & { connected: boolean; pending: string | null; preflightComplete: false };

interface RecordingLink {
  send: (address: string, args?: Array<{ type: string; value: number }>) => void;
  isConnected: () => boolean;
}
interface Observation<T> { value: T | null; observedAt: number | null; revision: number }
const empty = <T>(): Observation<T> => ({ value: null, observedAt: null, revision: 0 });
const getters: Record<Field, string> = {
  recordMode: REC.getRecordMode, isPlaying: GET.isPlaying,
  songTimeBeats: GET.currentSongTime, metronome: GET.metronome,
};
interface Operation { name: string; abort: AbortController }
interface PreRollProgress { start: number; startedAt: number; position: number; observedAt: number; tempo: () => number | null }
type Packet = [address: string, args?: Array<{ type: string; value: number }>];

/**
 * Uses the owning OSCTransport connection; never opens a socket. Observations
 * are independent of its legacy optimistic play/stop cache. UDP getters have
 * no request IDs: a matching observation is state evidence, not a delivery ACK.
 * Track/arm, routing, punch/loop/overdub and Set preflight belong to a later
 * coordinator. recordMode + isPlaying does not prove actual sample capture.
 */
export class RecordingTransport extends EventEmitter {
  private active = false;
  private revision = 0;
  private operation: Operation | null = null;
  private preRollProgress: PreRollProgress | null = null;
  private readonly observations = {
    recordMode: empty<boolean>(), isPlaying: empty<boolean>(),
    songTimeBeats: empty<number>(), metronome: empty<boolean>(),
  };

  constructor(private readonly link: RecordingLink) { super(); }

  public snapshot(now = Date.now()): RecordingTransportState {
    const field = <T>(observation: Observation<T>): RecordingObservation<T> => ({
      value: observation.value, observedAt: observation.observedAt,
      fresh: this.link.isConnected() && observation.observedAt !== null
        && now >= observation.observedAt && now - observation.observedAt <= RECORDING_FRESH_MS,
    });
    return {
      connected: this.link.isConnected(), pending: this.operation?.name ?? null, preflightComplete: false,
      recordMode: field(this.observations.recordMode), isPlaying: field(this.observations.isPlaying),
      songTimeBeats: field(this.observations.songTimeBeats), metronome: field(this.observations.metronome),
    };
  }

  /** Read-only recovery. Activate only when REC is used; never replay a write. */
  public requestState(): void {
    this.active = true;
    this.registerListeners();
    for (const address of Object.values(getters)) this.link.send(address);
  }

  public registerListeners(): void {
    if (this.active) this.link.send(REC.listenRecordMode);
  }

  public pollTick(now = Date.now()): void {
    if (!this.active || !this.link.isConnected()) return;
    const state = this.snapshot(now);
    for (const field of Object.keys(getters) as Field[]) {
      if (!state[field].fresh) this.link.send(getters[field]);
    }
  }

  /** Called with received OSC packets, including repeated unchanged reports. */
  public observe(address: string, args: Array<{ value?: unknown }>, now: number): void {
    if (args.length !== 1) return;
    const value = args[0]?.value;
    if (address === RESPONSE.currentSongTime) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        this.observations.songTimeBeats = { value, observedAt: now, revision: ++this.revision };
      } else return;
    } else {
      const field = address === REC.getRecordMode ? 'recordMode'
        : address === RESPONSE.isPlaying ? 'isPlaying'
        : address === RESPONSE.metronome ? 'metronome' : null;
      if (field === null || (value !== true && value !== false && value !== 0 && value !== 1)) return;
      this.observations[field] = { value: value === true || value === 1, observedAt: now, revision: ++this.revision };
    }
    this.emit('observation');
    this.emit('update', this.snapshot(now));
  }

  public invalidate(): void {
    this.operation?.abort.abort(new Error('AbletonOSC lost before recording state was observed'));
    this.preRollProgress = null;
    this.observations.recordMode = empty(); this.observations.isPlaying = empty();
    this.observations.songTimeBeats = empty(); this.observations.metronome = empty();
    this.emit('update', this.snapshot());
  }

  public dispose(): void { this.active = false; this.invalidate(); }

  public sendFailed(address: string, error: Error): void {
    if ([...Object.values(REC), ...Object.values(REC_PREROLL), ...Object.values(getters), CMD.startPlaying, CMD.stopPlaying, CMD.cuePointJump].includes(address)) {
      this.operation?.abort.abort(error);
    }
  }

  public async readState(): Promise<RecordingTransportState> {
    return this.run('read', async operation => {
      this.requireConnection();
      await this.wait(operation, Object.keys(getters) as Field[], () => true, () => this.requestState(), false);
      return this.snapshot();
    });
  }

  /** A user action may supersede a passive read, never another write. */
  public cancelRead(): void {
    if (this.operation?.name !== 'read') return;
    const operation = this.operation;
    this.operation = null;
    operation.abort.abort(Error('REC:READ_SUPERSEDED'));
  }

  public async seek(beats: number): Promise<RecordingTransportState> {
    if (typeof beats !== 'number' || !Number.isFinite(beats) || beats < 0) throw new Error('Position must be finite non-negative beats');
    return this.run('seek', async operation => {
      this.requireStopped();
      await this.wait(operation, ['songTimeBeats'], state => Math.abs((state.songTimeBeats.value ?? -1) - beats) < 0.001,
        () => this.sendBatch([[REC.setSongTime, [{ type: 'float', value: beats }]], [GET.currentSongTime]]));
      this.requireStopped();
      return this.snapshot();
    });
  }

  /** A real locator jump also moves Live's persistent playback start. Merely
   * setting current_song_time can read back correctly yet Play starts elsewhere. */
  public async jumpToMarker(index: number, beats: number, guard: () => void = () => {}): Promise<RecordingTransportState> {
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(beats) || beats < 0) throw new Error('Marker index and position must be non-negative finite values');
    return this.run('marker', async operation => {
      this.requireStopped();
      await this.wait(operation, ['songTimeBeats', 'isPlaying', 'recordMode'], state =>
        Math.abs((state.songTimeBeats.value ?? -1) - beats) < .001 && state.isPlaying.value === false && state.recordMode.value === false, () => {
          guard();
          this.sendBatch([[CMD.cuePointJump, [{type: 'integer', value: index}]], [GET.currentSongTime], [GET.isPlaying], [REC.getRecordMode]]);
        });
      guard(); this.requireStopped();
      return this.snapshot();
    });
  }

  public async setMetronome(enabled: boolean): Promise<RecordingTransportState> {
    if (typeof enabled !== 'boolean') throw new Error('Metronome must be boolean');
    return this.run('metronome', async operation => {
      this.requireConnection();
      await this.wait(operation, ['metronome'], state => state.metronome.value === enabled,
        () => this.sendBatch([[REC.setMetronome, [{ type: 'integer', value: enabled ? 1 : 0 }]], [GET.metronome]]));
      return this.snapshot();
    });
  }

  public async startRecording(guard: () => void = () => {}): Promise<RecordingTransportState> {
    return this.run('start', async operation => {
      guard();
      this.requireStopped();
      await this.wait(operation, ['recordMode'], state => state.recordMode.value === true,
        () => this.sendBatch([[REC.setRecordMode, [{ type: 'integer', value: 1 }]], [REC.getRecordMode]]));
      // Live's Start Playback with Record preference may already have started
      // playback. Obtain another observation before deciding to send start.
      await this.wait(operation, ['isPlaying'], () => true, () => this.link.send(GET.isPlaying));
      guard();
      const state = this.snapshot();
      if (!state.recordMode.fresh || state.recordMode.value !== true) throw new Error('Record mode changed during start');
      if (state.isPlaying.value !== true) {
        await this.wait(operation, ['recordMode', 'isPlaying'], next => next.recordMode.value === true && next.isPlaying.value === true,
          () => this.sendBatch([[CMD.startPlaying], [REC.getRecordMode], [GET.isPlaying]]));
      }
      return this.snapshot();
    });
  }

  /** The coordinator has positioned the native insert marker using a cue jump
   * and removed its temporary cue before this record-OFF start. */
  public async startPreRoll(beats: number, guard: () => void = () => {}, tempo?: () => number | null): Promise<RecordingTransportState> {
    if (!Number.isFinite(beats) || beats < 0) throw Error('REC:PRE_ROLL_RANGE');
    return this.run('pre-roll', async operation => {
      guard(); this.requireStopped();
      const position = this.snapshot().songTimeBeats;
      if (!position.fresh || position.value === null || Math.abs(position.value-beats) >= .001) throw Error('REC:PRE_ROLL_SEEK');
      await this.wait(operation, ['songTimeBeats','isPlaying','recordMode'], state =>
        state.recordMode.value === false && state.isPlaying.value === true && (tempo !== undefined || (state.songTimeBeats.value ?? -1) >= beats),
        () => {
          guard();
          // Anchor to the native start send, before any confirmation latency.
          const at = Date.now();
          this.preRollProgress = tempo ? {start:beats, startedAt:at, position:beats, observedAt:at, tempo} : null;
          this.sendBatch([[CMD.startPlaying], [GET.currentSongTime], [GET.isPlaying], [REC.getRecordMode]]);
        });
      this.checkPreRollProgress(this.snapshot());
      guard(); return this.snapshot();
    });
  }

  private checkPreRollProgress(state: RecordingTransportState): void {
    const baseline = this.preRollProgress;
    if (!baseline) return;
    const position = state.songTimeBeats.value, at = state.songTimeBeats.observedAt, tempo = baseline.tempo();
    if (!state.songTimeBeats.fresh || position === null || at === null || tempo === null || !Number.isFinite(tempo) || tempo <= 0) throw Error('REC:PRE_ROLL_STATE');
    // Keep both the native-start bound and the preceding observation. The
    // fixed half-beat tolerance covers OSC/report jitter without accepting a
    // shortened bar or a backward seek before Record ON.
    if (at < baseline.observedAt || position < baseline.position-.001
      || position-baseline.start > (at-baseline.startedAt)*tempo/60000+.5
      || position-baseline.position > (at-baseline.observedAt)*tempo/60000+.5) throw Error('REC:PRE_ROLL_SEEK');
    baseline.position = position; baseline.observedAt = at;
  }

  /** Playback is already running before enabling record. Native Punch In,
   * rather than a JS timer, decides where sample capture begins. */
  public async punchRecording(before: number, guard: () => void = () => {}): Promise<RecordingTransportState> {
    return this.run('punch', async operation => {
      guard(); this.requireConnection();
      await this.wait(operation, ['songTimeBeats','isPlaying','recordMode'], () => true,
        () => this.sendBatch([[GET.currentSongTime], [GET.isPlaying], [REC.getRecordMode]]), false);
      guard();
      const state = this.snapshot();
      if (!state.songTimeBeats.fresh || !state.isPlaying.fresh || !state.recordMode.fresh
        || state.isPlaying.value !== true || state.recordMode.value !== false) throw Error('REC:PRE_ROLL_STATE');
      if ((state.songTimeBeats.value ?? Infinity) >= before) throw Error('REC:PRE_ROLL_PASSED');
      this.checkPreRollProgress(state);
      await this.wait(operation, ['recordMode','isPlaying'], next => next.recordMode.value === true && next.isPlaying.value === true,
        () => {guard(); this.sendBatch([[REC.setRecordMode, [{type:'integer',value:1}]], [REC.getRecordMode], [GET.isPlaying]]);});
      guard(); return this.snapshot();
    });
  }

  /** Explicit audition playback, with fresh record-off evidence. */
  public async startPlayback(guard: () => void = () => {}): Promise<RecordingTransportState> {
    return this.run('playback', async operation => {
      guard(); this.requireStopped();
      await this.wait(operation, ['recordMode', 'isPlaying'], state => state.recordMode.value === false && state.isPlaying.value === true,
        () => this.sendBatch([[CMD.startPlaying], [REC.getRecordMode], [GET.isPlaying]]));
      guard();
      return this.snapshot();
    });
  }

  /** STOP preempts waits and pending preparation. Neither write waits for the
   * other's confirmation; unknown state is allowed. No toggle, seek or retry. */
  public async stopRecording(): Promise<RecordingTransportState> {
    this.operation?.abort.abort(new Error('Recording operation superseded by stop'));
    this.preRollProgress = null;
    return this.run('stop', async operation => {
      await this.wait(operation, ['isPlaying', 'recordMode'], state => state.isPlaying.value === false && state.recordMode.value === false,
        () => this.sendBatch([[CMD.stopPlaying], [REC.setRecordMode, [{ type: 'integer', value: 0 }]], [GET.isPlaying], [REC.getRecordMode]]));
      return this.snapshot();
    }, true);
  }

  private requireConnection(): void {
    if (!this.link.isConnected()) throw new Error('AbletonOSC is not connected');
  }

  private requireStopped(): void {
    const state = this.snapshot();
    if (!state.recordMode.fresh || state.recordMode.value !== false || !state.isPlaying.fresh || state.isPlaying.value !== false) {
      throw new Error('REC preparation requires observed stopped transport with record mode disabled');
    }
  }

  private async run(name: string, body: (operation: Operation) => Promise<RecordingTransportState>, replace = false): Promise<RecordingTransportState> {
    if (this.operation && !replace) throw new Error('A recording transport operation is pending');
    const operation = { name, abort: new AbortController() };
    this.operation = operation;
    try {
      await body(operation);
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    }
    finally {
      if (this.operation === operation) { this.operation = null; this.emit('update', this.snapshot()); }
    }
    return this.snapshot();
  }

  private sendBatch(packets: Packet[]): void {
    let failure: unknown;
    for (const [address, args] of packets) {
      try { this.link.send(address, args); }
      catch (error) { failure ??= error; }
    }
    if (failure !== undefined) throw failure;
  }

  private wait(operation: Operation, fields: Field[], matches: (state: RecordingTransportState) => boolean, send: () => void, invalidate = true): Promise<void> {
    if (this.operation !== operation || operation.abort.signal.aborted) return Promise.reject(operation.abort.signal.reason);
    const revision = this.revision;
    // The last pre-request value cannot describe the result of a new write or
    // resync. Keep it unknown until another valid packet supplies evidence.
    for (const field of invalidate ? fields : []) {
      this.observations[field].value = null;
      this.observations[field].observedAt = null;
    }
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.off('observation', observed);
        operation.abort.signal.removeEventListener('abort', cancelled);
        if (error !== undefined) reject(error); else resolve();
      };
      const cancelled = () => finish(operation.abort.signal.reason);
      const observed = () => {
        if (this.operation !== operation || operation.abort.signal.aborted) return;
        const state = this.snapshot();
        if (fields.every(field => this.observations[field].revision > revision && state[field].fresh) && matches(state)) finish();
      };
      const timer = setTimeout(() => finish(new Error('Requested recording state was not observed within 2000 ms')), RECORDING_CONFIRM_MS);
      this.on('observation', observed);
      operation.abort.signal.addEventListener('abort', cancelled, { once: true });
      try { send(); } catch (error) { finish(error); }
      this.emit('update', this.snapshot());
    });
  }
}
