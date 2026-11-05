// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Guarded naming of one take-lane clip.
//
// A take lane holds clips as SDK objects with no chronological inference.
// Marking a clip GOOD or REVIEW is a name change and nothing else: '[RC:GOOD] '
// or '[RC:REVIEW] ' is written into the clip's own name, so the mark travels
// with the take.
//
// The service is deliberately narrow. It touches exactly one clip, exactly
// once, and only its name. It never selects a track, never renames a lane,
// never starts or stops the transport, never touches ARM, loop or punch and
// never deletes or mutes material.
//
// Every write is guarded: the addressed chain must still be the same live
// objects, the scope must still be the current Song generation, the session
// must still be current, no REC attempt may run and the transport must be
// freshly observed as stopped. A failure after the setter may leave the name
// applied: the outcome is then unknown, never retried and never rolled back.
import { RECORDING_CONFIRM_MS } from './recording-transport.js';
import { TAKE_GOOD_PREFIX, TAKE_REVIEW_PREFIX, takeMarkFor, type TakeMark } from './recording-take-notes.js';
import type { TakeNotesIdentity } from './recording-take-identity.js';
import type { CommandExecutionContext } from './catalog/types.js';

/** The parts of one take-lane clip this service reads and writes. */
export interface MarkClip {
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly handle: { readonly id: string | number | bigint };
}
export interface MarkLane {
  readonly name: string;
  readonly handle: { readonly id: string | number | bigint };
  readonly clips: readonly MarkClip[];
}
export interface MarkTrack {
  readonly name: string;
  readonly handle: { readonly id: string | number | bigint };
  readonly takeLanes: readonly MarkLane[];
}
export interface MarkSong {
  readonly tracks: readonly MarkTrack[];
}
/** The two transport observations this service needs. */
export interface MarkTransportState {
  readonly recordMode: { readonly value: boolean | null; readonly fresh: boolean };
  readonly isPlaying: { readonly value: boolean | null; readonly fresh: boolean };
}
export interface MarkRef { index: number; id: string; name: string }
export interface MarkClipRef extends MarkRef { startTime: number; endTime: number; reference: string }
export interface MarkResult {
  scope: string;
  track: MarkRef;
  lane: MarkRef;
  clip: MarkClipRef & { mark: TakeMark };
}

interface MarkOperation {
  abort: AbortController;
  context: CommandExecutionContext;
  scope: string;
  song: MarkSong;
  deadline: number;
}
interface Resolved {
  scope: string;
  track: MarkTrack;
  lane: MarkLane;
  clip: MarkClip;
  trackIndex: number;
  laneIndex: number;
  clipIndex: number;
  trackId: string;
  laneId: string;
  clipId: string;
  trackName: string;
  laneName: string;
  name: string;
  startTime: number;
  endTime: number;
  reference: string;
}
interface NamePlan { name: string; changed: boolean }
/** The SDK's Clip has a writable name; the read-only catalog keeps its own
 * view of it readonly. Only this service assigns it. */
interface WritableClip {
  name: string;
}

const GOOD_PREFIX = TAKE_GOOD_PREFIX;
const REVIEW_PREFIX = TAKE_REVIEW_PREFIX;
/** The application limit for one clip name. It is ours, not the SDK's. */
const NAME_MAX = 1024;
/** Control characters never belong in a name this service composes. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function fail(code: string): never { throw Error('REC:' + code); }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
/** The mark is the one exact value the command accepts. */
function isMark(value: unknown): value is TakeMark {
  return value === null || value === 'good' || value === 'review';
}

/**
 * One guarded name write on one addressed take-lane clip.
 *
 * The service owns its own single-flight latch: it never takes the REC
 * coordinator's operation slot and never uses the transport-wide write lane,
 * so a take can be marked while the rest of the surface keeps working.
 */
export class RecordingTakeMarking {
  private operation: MarkOperation | null = null;

  constructor(
    private readonly getSong: () => MarkSong,
    private readonly getScope: () => string,
    private readonly identities: TakeNotesIdentity,
    private readonly readTransport: (signal?: AbortSignal) => Promise<MarkTransportState>,
    private readonly isAttemptActive: () => boolean,
    private readonly confirmMs: number = RECORDING_CONFIRM_MS,
  ) {}

  /** Retire a pending mark. A write that was already issued may still land,
   * but it can never write twice and never reports success afterwards. */
  public cancel(): void {
    const operation = this.operation;
    if (!operation) return;
    this.operation = null;
    operation.abort.abort(Error('REC:MARK_CANCELED'));
  }

  /** Mark exactly one addressed clip and report the clip as it now is. */
  public async mark(request: unknown, context?: CommandExecutionContext): Promise<MarkResult> {
    if (this.operation) fail('BUSY');
    const args = this.parseRequest(request);
    const execution = this.requireExecution(context);
    const operation: MarkOperation = {
      abort: new AbortController(),
      context: execution,
      scope: args.scope,
      song: this.getSong(),
      deadline: Date.now() + this.confirmMs,
    };
    this.operation = operation;
    try {
      const target = this.resolve(operation, args);
      await this.requireStopped(operation);
      this.revalidate(operation, target);
      const plan = this.plan(target.name, args.mark);
      if (!plan.changed) return this.result(target, target.name);
      await this.write(operation, target, plan);
      return this.result(target, plan.name);
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }

  private parseRequest(request: unknown): {
    scope: string; track: MarkRef; lane: MarkRef; clip: MarkClipRef; mark: TakeMark;
  } {
    if (!isPlainObject(request)) fail('ARGUMENTS');
    if (!exactKeys(request, ['scope', 'track', 'lane', 'clip', 'mark'])) fail('ARGUMENTS');
    const scope = request['scope'];
    if (typeof scope !== 'string' || !scope) fail('ARGUMENTS');
    const mark = request['mark'];
    if (!isMark(mark)) fail('ARGUMENTS');
    return {
      scope,
      track: this.ref(request['track']),
      lane: this.ref(request['lane']),
      clip: this.clipRef(request['clip']),
      mark,
    };
  }

  private ref(value: unknown): MarkRef {
    if (!isPlainObject(value)) fail('ARGUMENTS');
    if (!exactKeys(value, ['index', 'id', 'name'])) fail('ARGUMENTS');
    const index = value['index'];
    const id = value['id'];
    const name = value['name'];
    if (!Number.isSafeInteger(index) || (index as number) < 0) fail('ARGUMENTS');
    if (typeof id !== 'string' || !id) fail('ARGUMENTS');
    if (typeof name !== 'string') fail('ARGUMENTS');
    return { index: index as number, id, name };
  }

  private clipRef(value: unknown): MarkClipRef {
    if (!isPlainObject(value)) fail('ARGUMENTS');
    if (!exactKeys(value, ['index', 'id', 'name', 'startTime', 'endTime', 'reference'])) fail('ARGUMENTS');
    const base = this.ref({ index: value['index'], id: value['id'], name: value['name'] });
    const startTime = this.clipTime(value['startTime'], 0);
    const endTime = this.clipTime(value['endTime'], startTime);
    const reference = value['reference'];
    if (typeof reference !== 'string' || !reference) fail('ARGUMENTS');
    return { ...base, startTime, endTime, reference };
  }

  private clipTime(value: unknown, min: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min) fail('ARGUMENTS');
    return value;
  }

  private requireExecution(context?: CommandExecutionContext): CommandExecutionContext {
    if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) fail('SESSION');
    return context;
  }

  /** The index locates, the handle, the name, the span and the reference
   * authorize. A clip is never found by its name alone. */
  private resolve(operation: MarkOperation, args: {
    scope: string; track: MarkRef; lane: MarkRef; clip: MarkClipRef;
  }): Resolved {
    if (!operation.context.isCurrent()) fail('SESSION');
    if (args.scope !== this.getScope()) fail('SCOPE');
    const song = operation.song;
    const track = this.unique(song.tracks, args.track.index, args.track.id, args.track.name);
    const lane = this.unique(track.takeLanes, args.lane.index, args.lane.id, args.lane.name);
    const clip = this.unique(lane.clips, args.clip.index, args.clip.id, args.clip.name);
    if (clip.startTime !== args.clip.startTime || clip.endTime !== args.clip.endTime) fail('IDENTITY');
    const reference = this.identities.reference(args.scope, track, lane, clip);
    if (reference !== args.clip.reference) fail('IDENTITY');
    return {
      scope: args.scope, track, lane, clip,
      trackIndex: args.track.index, laneIndex: args.lane.index, clipIndex: args.clip.index,
      trackId: args.track.id, laneId: args.lane.id, clipId: args.clip.id,
      trackName: args.track.name, laneName: args.lane.name,
      name: clip.name, startTime: clip.startTime, endTime: clip.endTime, reference,
    };
  }

  /** The item at that index must carry that handle and that name, and its
   * handle must occur exactly once in the collection. */
  private unique<T extends { readonly name: string; readonly handle: { readonly id: string | number | bigint } }>(
    items: readonly T[], index: number, id: string, name: string,
  ): T {
    const item = items[index];
    if (!item) fail('IDENTITY');
    if (this.handleId(item) !== id || item.name !== name) fail('IDENTITY');
    this.requireUniqueHandle(items, id);
    return item;
  }

  private requireUniqueHandle<T extends { readonly handle: { readonly id: string | number | bigint } }>(
    items: readonly T[], id: string,
  ): void {
    if (items.filter(other => this.handleId(other) === id).length !== 1) fail('IDENTITY');
  }

  private handleId(object: { readonly handle?: { readonly id: string | number | bigint } } | null | undefined): string {
    const raw = object?.handle?.id;
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'bigint') fail('IDENTITY');
    const id = String(raw);
    if (!id) fail('IDENTITY');
    return id;
  }

  /** The name this mark implies. One known prefix is stripped and the rest
   * is preserved byte for byte; a second prefix, a control character or an
   * empty base is refused instead of guessing the original name. The refusal
   * is REC:TAKE_NAME: a clip name is not a track name. */
  private plan(current: string, mark: TakeMark): NamePlan {
    const base = this.strip(current);
    if (base === null) fail('TAKE_NAME');
    if (CONTROL.test(base)) fail('TAKE_NAME');
    if (!base) fail('TAKE_NAME');
    if (current.length > NAME_MAX) fail('TAKE_NAME');
    const name = mark === null ? base : (mark === 'good' ? GOOD_PREFIX : REVIEW_PREFIX) + base;
    if (name.length > NAME_MAX) fail('TAKE_NAME');
    return { name, changed: name !== current };
  }

  /** The name without its one leading prefix, or null when a second prefix
   * follows it. */
  private strip(current: string): string | null {
    const prefix = current.startsWith(GOOD_PREFIX) ? GOOD_PREFIX : current.startsWith(REVIEW_PREFIX) ? REVIEW_PREFIX : '';
    const base = prefix ? current.slice(prefix.length) : current;
    if (base.startsWith(GOOD_PREFIX) || base.startsWith(REVIEW_PREFIX)) return null;
    return base;
  }

  /** The write itself: one guarded check, one setter call, one confirmation. */
  private async write(operation: MarkOperation, target: Resolved, plan: NamePlan): Promise<void> {
    this.revalidate(operation, target);
    await this.requireStopped(operation);
    this.revalidate(operation, target);
    if (target.clip.name !== target.name) fail('IDENTITY');
    this.assign(target.clip, plan.name);
    await this.confirm(operation, target, plan.name);
  }

  /** The SDK's Clip has a writable name; the read-only catalog keeps its own
   * view of it readonly. Only this one assignment is ever made. */
  private assign(clip: MarkClip, name: string): void {
    try {
      (clip as WritableClip).name = name;
    } catch {
      // The setter may have applied the name before it threw.
      fail('UNKNOWN');
    }
  }

  /** The chain, the scope, the session and the attempt must all still hold. */
  private revalidate(operation: MarkOperation, target: Resolved, desiredName?: string): void {
    if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    if (!operation.context.isCurrent()) fail('SESSION');
    if (this.getScope() !== operation.scope) fail('SCOPE');
    const song = this.getSong();
    if (song !== operation.song) fail('IDENTITY');
    this.revalidateChain(song, target, desiredName);
    if (this.isAttemptActive()) fail('STOP_REQUIRED');
  }

  /** The very same objects must still be at the very same places. */
  private revalidateChain(song: MarkSong, target: Resolved, desiredName?: string): void {
    this.revalidateTrack(song, target);
    this.revalidateLane(target);
    this.revalidateClip(target, desiredName);
  }

  private revalidateTrack(song: MarkSong, target: Resolved): void {
    const track = song.tracks[target.trackIndex];
    if (!track || track !== target.track) fail('IDENTITY');
    if (this.handleId(track) !== target.trackId || track.name !== target.trackName) fail('IDENTITY');
    this.requireUniqueHandle(song.tracks, target.trackId);
  }

  private revalidateLane(target: Resolved): void {
    const lane = target.track.takeLanes[target.laneIndex];
    if (!lane || lane !== target.lane) fail('IDENTITY');
    if (this.handleId(lane) !== target.laneId || lane.name !== target.laneName) fail('IDENTITY');
    this.requireUniqueHandle(target.track.takeLanes, target.laneId);
  }

  private revalidateClip(target: Resolved, desiredName?: string): void {
    const clip = target.lane.clips[target.clipIndex];
    if (!clip || clip !== target.clip) fail('IDENTITY');
    if (this.handleId(clip) !== target.clipId) fail('IDENTITY');
    this.requireUniqueHandle(target.lane.clips, target.clipId);
    this.requireClipSpanAndName(clip, target, desiredName);
    if (this.identities.reference(target.scope, target.track, target.lane, clip) !== target.reference) fail('IDENTITY');
  }

  private requireClipSpanAndName(clip: MarkClip, target: Resolved, desiredName?: string): void {
    if (clip.startTime !== target.startTime || clip.endTime !== target.endTime) fail('IDENTITY');
    const validName = clip.name === target.name || (desiredName !== undefined && clip.name === desiredName);
    if (!validName) fail('IDENTITY');
  }

  /** A fresh observation of the transport: not playing, not recording. */
  private async requireStopped(operation: MarkOperation): Promise<void> {
    const state = await this.observeTransport(operation);
    if (!state.recordMode.fresh || !state.isPlaying.fresh) fail('UNKNOWN');
    if (state.recordMode.value !== false || state.isPlaying.value !== false) fail('NOT_STOPPED');
  }

  private async requireStoppedAfter(operation: MarkOperation): Promise<void> {
    try {
      await this.requireStopped(operation);
    } catch {
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      fail('UNKNOWN');
    }
  }

  private async observeTransport(operation: MarkOperation): Promise<MarkTransportState> {
    this.requireActiveWindow(operation);
    try {
      const read = (async () => this.readTransport(operation.abort.signal))();
      const state = await this.withDeadline(read, operation.deadline, operation.abort.signal);
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      return state;
    } catch (error) {
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      if (error instanceof Error && error.message.startsWith('REC:')) throw error;
      fail('UNKNOWN');
    }
  }

  private requireActiveWindow(operation: MarkOperation): void {
    if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
    if (Date.now() >= operation.deadline) fail('UNKNOWN');
  }

  /** A late reply can never decide the outcome: the deadline ends the wait. */
  private withDeadline<T>(promise: Promise<T>, deadline: number, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // The timer is armed once, late in the flow, so it lives in a holder
      // that is fixed when the promise is created.
      const timer: { id?: ReturnType<typeof setTimeout> } = {};
      const cleanup = () => {
        clearTimeout(timer.id);
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason);
      };
      promise.then(
        value => {
          cleanup();
          resolve(value);
        },
        error => {
          cleanup();
          reject(error);
        },
      );
      if (signal.aborted) {
        onAbort();
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        cleanup();
        reject(Error('REC:UNKNOWN'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      timer.id = setTimeout(() => {
        cleanup();
        reject(Error('REC:UNKNOWN'));
      }, remaining);
    });
  }

  /** The name must reflect within the confirm window. A delayed reflection is
   * fine; a name that is neither the old nor the new one is a conflict. */
  private async confirm(operation: MarkOperation, target: Resolved, name: string): Promise<void> {
    for (;;) {
      this.revalidateAfter(operation, target, name);
      const current = target.clip.name;
      if (current === name) {
        await this.requireStoppedAfter(operation);
        this.revalidateAfter(operation, target, name);
        if (target.clip.name !== name) fail('UNKNOWN');
        return;
      }
      if (current !== target.name) fail('UNKNOWN');
      if (Date.now() >= operation.deadline) fail('UNKNOWN');
      await this.pause(operation, 25);
    }
  }

  /** After the write the outcome is only ever unknown, never a second try. */
  private revalidateAfter(operation: MarkOperation, target: Resolved, desiredName: string): void {
    try {
      this.revalidate(operation, target, desiredName);
    } catch {
      if (operation.abort.signal.aborted) throw operation.abort.signal.reason;
      fail('UNKNOWN');
    }
  }

  private pause(operation: MarkOperation, ms: number): Promise<void> {
    const remaining = Math.max(0, operation.deadline - Date.now());
    const waitMs = Math.min(ms, remaining);
    return new Promise<void>((resolve, reject) => {
      const signal = operation.abort.signal;
      const cancelled = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancelled); resolve(); }, waitMs);
      signal.addEventListener('abort', cancelled, { once: true });
      if (signal.aborted) cancelled();
    });
  }

  /** The clip as it now is: the same clip, the same chain, the same mark. */
  private result(target: Resolved, name: string): MarkResult {
    return {
      scope: target.scope,
      track: { index: target.trackIndex, id: target.trackId, name: target.trackName },
      lane: { index: target.laneIndex, id: target.laneId, name: target.laneName },
      clip: {
        index: target.clipIndex, id: target.clipId, name,
        startTime: target.startTime, endTime: target.endTime,
        mark: takeMarkFor(name), reference: target.reference,
      },
    };
  }
}
