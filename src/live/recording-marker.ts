// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { RECORDING_CONFIRM_MS, RECORDING_FRESH_MS } from './recording-transport.js';
import type { CommandExecutionContext } from './catalog/types.js';
import type { OSCTransport } from './osc-transport.js';

/** The Live cue point this service owns. The SDK's CuePoint exposes a name,
 * a time and an opaque handle; nothing else is read or written. */
export interface MarkerCue {
  name: string;
  time: number;
  handle: { id: string | number | bigint };
}
/** The parts of the Live Song this service uses. */
export interface MarkerSong {
  cuePoints: readonly MarkerCue[];
  createCuePoint(time: number): Promise<MarkerCue>;
}
export interface MarkerResult {
  name: string;
  time: number;
  existing: boolean;
  observedAt: number;
}
interface MarkerOperation {
  abort: AbortController;
  context: CommandExecutionContext;
  scope: string;
  song: MarkerSong;
}
const MARKER_PREFIX = 'Mark ';
const MARKER_LIMIT = 1000;
/** Two cue times closer than this are the same marker position. */
const MARKER_MATCH = 0.001;

function fail(code: string): never { throw Error('REC:' + code); }

/**
 * One tap, one Arrangement cue.
 *
 * The service owns its own single-flight latch: it never takes the REC
 * coordinator's operation slot and never uses the transport-wide lane, so a
 * marker can be dropped while REC keeps running. The position comes from a
 * fresh OSC observation only. UDP carries no request id, so that observation
 * proves a position, never the exact tap moment; the observation time is
 * reported instead of claiming a causality the link cannot prove.
 */
export class RecordingMarker {
  private operation: MarkerOperation | null = null;

  constructor(
    private readonly osc: OSCTransport,
    private readonly getSong: () => MarkerSong,
    private readonly getScope: () => string,
  ) {
    this.osc.on('link-lost', this.lost);
  }

  private readonly lost = () => {
    this.operation?.abort.abort(Error('REC:CONNECTION'));
  };

  public dispose(): void {
    this.lost();
    this.osc.off('link-lost', this.lost);
  }

  /** Retire a pending marker. An SDK call already issued may still complete,
   * but it can never rename a cue or report success afterwards. */
  public cancel(): void {
    this.operation?.abort.abort(Error('REC:MARKER_CANCELED'));
  }

  public async create(scope: unknown, context?: CommandExecutionContext): Promise<MarkerResult> {
    const { requested, execution } = this.validateInvocation(scope, context);
    this.validateOperational(requested);
    const operation: MarkerOperation = { abort: new AbortController(), context: execution, scope: requested, song: this.getSong() };
    this.operation = operation;
    try {
      const position = await this.observePosition(operation);
      this.revalidate(operation);
      this.requireCoherentTransport();
      return await this.write(operation, position.value, position.observedAt);
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }

  private validateInvocation(scope: unknown, context?: CommandExecutionContext): { requested: string; execution: CommandExecutionContext } {
    if (typeof scope !== 'string' || !scope) fail('ARGUMENTS');
    if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) fail('SESSION');
    return { requested: scope, execution: context };
  }

  private validateOperational(requested: string): void {
    if (this.operation) fail('BUSY');
    if (requested !== this.getScope()) fail('SCOPE');
    if (!this.osc.state.available || !this.osc.state.connected) fail('CONNECTION');
  }

  /** A new observation only. The cached position is never reused, not even a
   * millisecond old, and the request is bounded by the confirm window. */
  private async observePosition(operation: MarkerOperation): Promise<{ value: number; observedAt: number }> {
    const position = await this.readPosition(operation);
    this.revalidate(operation);
    if (!Number.isFinite(position.value) || position.value < 0) fail('POSITION');
    return position;
  }

  private async readPosition(operation: MarkerOperation): Promise<{ value: number; observedAt: number }> {
    try {
      return await this.osc.recording.readPosition(operation.abort.signal);
    } catch (error) {
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      if (error instanceof Error && error.message.includes('not observed')) fail('MARKER_TIMEOUT');
      throw error;
    }
  }

  /** The tap is only placed on a known transport: play and record state must
   * both be freshly observed, and they must describe one moment. A stale
   * report beside a fresh one proves nothing. */
  private requireCoherentTransport(): void {
    const state = this.osc.recording.snapshot();
    const playing = state.isPlaying;
    const record = state.recordMode;
    if (!playing.fresh || !record.fresh) fail('STALE');
    if (playing.observedAt === null || record.observedAt === null) fail('STALE');
    if (Math.abs(playing.observedAt - record.observedAt) > RECORDING_FRESH_MS) fail('INCOHERENT');
  }

  private revalidate(operation: MarkerOperation): void {
    if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    if (!operation.context.isCurrent()) fail('SESSION');
    if (this.getSong() !== operation.song) fail('IDENTITY');
    if (this.getScope() !== operation.scope) fail('SCOPE');
    if (!this.osc.state.available || !this.osc.state.connected) fail('CONNECTION');
  }

  private async write(operation: MarkerOperation, time: number, observedAt: number): Promise<MarkerResult> {
    this.revalidate(operation);
    const existing = this.existingCue(operation.song, time);
    if (existing) return { name: existing.name, time: existing.time, existing: true, observedAt };
    const created = await this.createCue(operation, time);
    this.revalidate(operation);
    this.validateCreatedCue(created, time);
    const target = this.findUniqueCue(operation.song, created, time);
    const name = this.freeName(operation.song, target);
    this.rename(operation, target, name);
    this.revalidate(operation);
    const verified = await this.confirmCue(operation, target, name, time);
    return { name: verified.name, time: verified.time, existing: false, observedAt };
  }

  /** An existing cue at this position is the marker: it is reported, never
   * renamed and never removed. */
  private existingCue(song: MarkerSong, time: number): MarkerCue | undefined {
    return song.cuePoints.find(cue => Number.isFinite(cue.time) && Math.abs(cue.time - time) <= MARKER_MATCH);
  }

  private validateCreatedCue(cue: MarkerCue, time: number): void {
    if (!cue || !Number.isFinite(cue.time) || Math.abs(cue.time - time) > MARKER_MATCH) {
      fail('MARKER_UNKNOWN');
    }
  }

  private getCueId(cue: MarkerCue): string {
    const raw = cue?.handle?.id;
    if (raw === undefined || raw === null || raw === '') fail('MARKER_UNKNOWN');
    return String(raw);
  }

  /** Validate returned handle is usable and occurs exactly once in current Song. */
  private findUniqueCue(song: MarkerSong, cue: MarkerCue, time: number): MarkerCue {
    const id = this.getCueId(cue);
    const matches = song.cuePoints.filter(item => item?.handle && String(item.handle.id) === id);
    if (matches.length !== 1) fail('MARKER_UNKNOWN');
    const target = matches[0];
    if (!target) fail('MARKER_UNKNOWN');
    if (!Number.isFinite(target.time) || Math.abs(target.time - time) > MARKER_MATCH) fail('MARKER_UNKNOWN');
    return target;
  }

  /** The lowest free Mark N. The inventory is read again before the name is
   * written, so a name taken in the meantime is never reused. */
  private freeName(song: MarkerSong, excludeCue?: MarkerCue): string {
    const excludeId = excludeCue?.handle?.id !== undefined && excludeCue.handle.id !== null ? String(excludeCue.handle.id) : null;
    const names = new Set(
      song.cuePoints
        .filter(cue => cue !== excludeCue && (excludeId === null || String(cue?.handle?.id) !== excludeId))
        .map(cue => cue.name)
    );
    let index = 1;
    while (index <= MARKER_LIMIT && names.has(MARKER_PREFIX + index)) index++;
    if (index > MARKER_LIMIT) fail('MARKER_NAME');
    return MARKER_PREFIX + index;
  }

  /** Exactly one create call. A rejected or timed out creation may already
   * have applied in Live: the result is unknown, never cleaned up, never
   * replayed. */
  private async createCue(operation: MarkerOperation, time: number): Promise<MarkerCue> {
    const pending = this.requestCue(operation, time);
    try { return await this.settle(operation, pending); }
    catch {
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      throw Error('REC:MARKER_UNKNOWN');
    }
  }

  private requestCue(operation: MarkerOperation, time: number): Promise<MarkerCue> {
    try { return operation.song.createCuePoint(time); }
    catch { throw Error('REC:MARKER_UNKNOWN'); }
  }

  private settle<T>(operation: MarkerOperation, promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (error?: unknown, value?: T) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        operation.abort.signal.removeEventListener('abort', cancelled);
        if (error !== undefined) reject(error); else resolve(value as T);
      };
      const cancelled = () => finish(operation.abort.signal.reason);
      const timer = setTimeout(() => finish(Error('REC:MARKER_UNKNOWN')), RECORDING_CONFIRM_MS);
      operation.abort.signal.addEventListener('abort', cancelled, { once: true });
      promise.then(value => finish(undefined, value), error => finish(error));
    });
  }

  /** Only the cue this attempt created is renamed, and only while the
   * identity, the scope and the context still hold. */
  private rename(operation: MarkerOperation, cue: MarkerCue, name: string): void {
    this.revalidate(operation);
    try { cue.name = name; }
    catch { throw Error('REC:MARKER_UNKNOWN'); }
  }

  /** Bounded polling read to confirm cue name reflection in current Song. */
  private confirmCue(operation: MarkerOperation, cue: MarkerCue, name: string, time: number): Promise<MarkerCue> {
    return new Promise<MarkerCue>((resolve, reject) => {
      let done = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (error?: unknown, value?: MarkerCue) => {
        if (done) return;
        done = true;
        clearTimeout(pollTimer);
        clearTimeout(timeoutTimer);
        operation.abort.signal.removeEventListener('abort', onAbort);
        if (error !== undefined) reject(error);
        else resolve(value as MarkerCue);
      };

      const onAbort = () => finish(operation.abort.signal.reason);
      // The timer is armed before the listener, so an already aborted signal
      // still finds an initialised handle to clear.
      const timeoutTimer = setTimeout(() => finish(Error('REC:MARKER_UNKNOWN')), RECORDING_CONFIRM_MS);
      operation.abort.signal.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (done) return;
        try {
          this.revalidate(operation);
          const present = this.findUniqueCue(operation.song, cue, time);
          if (present.name === name) {
            finish(undefined, present);
            return;
          }
          pollTimer = setTimeout(check, 25);
        } catch (error) {
          finish(error);
        }
      };

      check();
    });
  }
}
