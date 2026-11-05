// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import type {
  AudioClip as SdkAudioClip,
  AudioTrack as SdkAudioTrack,
  Song as SdkSong,
} from '@ableton-extensions/sdk';
import type { RecordingObservation, RecordingTransportState } from './recording-transport.js';
import { computePeaks, parseWav, type WavAudio } from './recording-waveform-wav.js';
import {
  captureTempRoot,
  isOwnTempRoot,
  isPathUnchanged,
  locateOwnFile,
  openNodeFile,
  openSafely,
  readBoundedFile,
  realpathOf,
  removeOwnRenderedFile,
  verifyOpenedFile,
  type WaveformFileHandle,
  type WaveformFileLocation,
} from './recording-waveform-file.js';

/**
 * The bounded Arrangement waveform service.
 *
 * It renders one exact interval of one Arrangement audio clip through the
 * host's own pre-FX renderer, reads the WAV the host wrote into the extension
 * temp directory and returns at most 512 real amplitudes. It never touches
 * the transport, never takes the operation slot, never returns a path and
 * never falls back to another file.
 *
 * The whole operation runs under one deadline and one single flight latch.
 */

type SdkVersion = '1.0.0';

export type WaveformAudioTrack = SdkAudioTrack<SdkVersion>;
export type WaveformAudioClip = SdkAudioClip<SdkVersion>;
export type WaveformSong = SdkSong<SdkVersion>;

export interface WaveformTrackRef {
  index: number;
  id: string;
  name: string;
}

export interface WaveformClipRef {
  index: number;
  id: string;
  name: string;
  startTime: number;
  endTime: number;
}

export interface RecordingWaveformRequest {
  scope: string;
  track: WaveformTrackRef;
  clip: WaveformClipRef;
  startTime: number;
  endTime: number;
}

export interface RecordingWaveformResult {
  scope: string;
  track: WaveformTrackRef;
  clip: WaveformClipRef;
  startTime: number;
  endTime: number;
  peaks: number[];
}

export interface RecordingWaveformContext {
  isCurrent(): boolean;
}

export interface RecordingWaveformDeps {
  getSong: () => WaveformSong;
  getScope: () => string;
  getTransport: (signal?: AbortSignal) => Promise<RecordingTransportState>;
  getAttemptActive: () => boolean;
  /** The extension's own temp directory. */
  getTempDirectory: () => string | undefined;
  /** The host's pre-FX renderer. It resolves to a WAV inside the temp root. */
  render: (track: WaveformAudioTrack, startTime: number, endTime: number) => Promise<string>;
  /** The runtime proof that a track is a real SDK audio track. */
  isAudioTrack: (value: unknown) => value is WaveformAudioTrack;
  /** The runtime proof that a clip is a real SDK audio clip. */
  isAudioClip: (value: unknown) => value is WaveformAudioClip;
  /** The deadline of the whole operation, in milliseconds. */
  deadlineMs?: number;
  /** The file opener. It exists so the open and validate race can be tested. */
  openFile?: (path: string) => Promise<WaveformFileHandle>;
  /** The file remover. It exists so the own cleanup can be tested. */
  removeFile?: (path: string) => Promise<void>;
}

const MAX_INTERVAL_BEATS = 128;
const MAX_PEAKS = 512;
const MAX_TRACKS = 256;
const MAX_CLIPS = 4096;
const DEFAULT_DEADLINE_MS = 30_000;
const TRACK_KEYS = ['index', 'id', 'name'];
const CLIP_KEYS = ['index', 'id', 'name', 'startTime', 'endTime'];
const REQUEST_KEYS = ['scope', 'track', 'clip', 'startTime', 'endTime'];

interface WaveformIdentity {
  request: RecordingWaveformRequest;
  song: WaveformSong;
  track: WaveformAudioTrack;
  clip: WaveformAudioClip;
}

interface WaveformJob {
  cancelled: boolean;
  expired: boolean;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | undefined;
  waiters: Array<() => void>;
  scope: string;
  identity: WaveformIdentity;
  context: RecordingWaveformContext | undefined;
}

/** The one file this execution owns. */
interface OwnedWaveformFile {
  root: string;
  rootReal: string;
  location: WaveformFileLocation | undefined;
  canRemove: boolean;
}

type Outcome = { ok: true; value: RecordingWaveformResult } | { ok: false; code: string };

function fail(code: string): never {
  throw new Error(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateIndexAndId(value: Record<string, unknown>): { index: number; id: string } {
  const { index, id } = value;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) fail('REC:ARGUMENTS');
  if (typeof id !== 'string' || !id) fail('REC:ARGUMENTS');
  return { index, id };
}

function validateTrackRef(value: unknown): WaveformTrackRef {
  if (!isObject(value) || !hasExactKeys(value, TRACK_KEYS)) fail('REC:ARGUMENTS');
  const { index, id } = validateIndexAndId(value);
  const name = value['name'];
  if (typeof name !== 'string') fail('REC:ARGUMENTS');
  return { index, id, name };
}

function validateClipRef(value: unknown): WaveformClipRef {
  if (!isObject(value) || !hasExactKeys(value, CLIP_KEYS)) fail('REC:ARGUMENTS');
  const { index, id } = validateIndexAndId(value);
  const { name, startTime, endTime } = value;
  if (typeof name !== 'string') fail('REC:ARGUMENTS');
  if (!isFiniteNumber(startTime)) fail('REC:ARGUMENTS');
  if (!isFiniteNumber(endTime) || endTime <= startTime) fail('REC:ARGUMENTS');
  return { index, id, name, startTime, endTime };
}

export function validateWaveformRequest(request: unknown): RecordingWaveformRequest {
  if (!isObject(request)) fail('REC:ARGUMENTS');
  if (!hasExactKeys(request, REQUEST_KEYS)) fail('REC:ARGUMENTS');
  const scope = request['scope'];
  const startTime = request['startTime'];
  const endTime = request['endTime'];
  if (typeof scope !== 'string' || !scope) fail('REC:ARGUMENTS');
  if (!isFiniteNumber(startTime)) fail('REC:ARGUMENTS');
  if (!isFiniteNumber(endTime) || endTime <= startTime) fail('REC:ARGUMENTS');
  return {
    scope,
    track: validateTrackRef(request['track']),
    clip: validateClipRef(request['clip']),
    startTime,
    endTime,
  };
}

/** The stable identity of a host object: the SDK handle id. */
function handleId(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const handle = value['handle'];
  if (!isObject(handle)) return undefined;
  const id = handle['id'];
  if (typeof id === 'string') return id ? id : undefined;
  if (typeof id === 'number') return Number.isFinite(id) ? String(id) : undefined;
  if (typeof id === 'bigint') return String(id);
  return undefined;
}

function countHandle(items: readonly unknown[], id: string): number {
  let count = 0;
  for (const item of items) {
    if (handleId(item) === id) count += 1;
    if (count > 1) return count;
  }
  return count;
}

/** The name and the exact interval of the clip must be the requested ones. */
function sameClip(clip: WaveformAudioClip, ref: WaveformClipRef): boolean {
  if (clip.name !== ref.name) return false;
  return clip.startTime === ref.startTime && clip.endTime === ref.endTime;
}

/** One stopped observation. A bare boolean is never a proof. */
function isStoppedObservation(observation: RecordingObservation<boolean> | undefined): boolean {
  if (!isObject(observation)) return false;
  if (observation['fresh'] !== true) return false;
  if (observation['value'] !== false) return false;
  return isFiniteNumber(observation['observedAt']);
}

/** A service error carries its own code. Anything else is a host error. */
function isServiceError(error: unknown): boolean {
  return error instanceof Error && /^REC:[A-Z_]+$/.test(error.message);
}

export class RecordingWaveform {
  private readonly deps: RecordingWaveformDeps;
  private readonly deadlineMs: number;
  private readonly openFile: (path: string) => Promise<WaveformFileHandle>;
  private job: WaveformJob | null = null;

  constructor(deps: RecordingWaveformDeps) {
    this.deps = deps;
    this.deadlineMs = typeof deps.deadlineMs === 'number' && deps.deadlineMs > 0
      ? deps.deadlineMs
      : DEFAULT_DEADLINE_MS;
    this.openFile = deps.openFile ?? openNodeFile;
  }

  /** Retire the running job. The caller returns at once. */
  cancel(): void {
    const job = this.job;
    if (!job) return;
    job.cancelled = true;
    job.controller.abort();
    for (const waiter of job.waiters) waiter();
  }

  async get(request: unknown, context?: RecordingWaveformContext): Promise<RecordingWaveformResult> {
    const req = validateWaveformRequest(request);
    this.requireCurrent(context);
    if (this.job) fail('REC:WAVEFORM_BUSY');
    const scope = this.currentScope();
    if (scope !== req.scope) fail('REC:WAVEFORM_SCOPE');
    const identity = this.resolveIdentity(req);
    const job: WaveformJob = {
      cancelled: false, expired: false, controller: new AbortController(),
      timer: undefined, waiters: [], scope, identity, context,
    };
    this.job = job;
    const deadline = this.startDeadline(job);
    const settled: Promise<Outcome> = this.execute(job, req).then(
      value => ({ ok: true, value }),
      error => ({ ok: false, code: isServiceError(error) ? error.message : 'REC:WAVEFORM_FAILED' }),
    );
    let holdLatch = false;
    try {
      const outcome = await this.race(job, settled, deadline);
      if (!outcome.ok) {
        // The latch stays until the host job settles: a late render cannot overlap.
        holdLatch = true;
        void settled.then(() => {
          if (this.job === job) this.job = null;
        });
        fail(outcome.code);
      }
      return outcome.value;
    } finally {
      if (!holdLatch && this.job === job) this.job = null;
    }
  }

  private async execute(job: WaveformJob, req: RecordingWaveformRequest): Promise<RecordingWaveformResult> {
    const root = captureTempRoot(this.deps.getTempDirectory());
    if (!root) fail('REC:WAVEFORM_TEMP');
    const rootReal = await realpathOf(root);
    if (!rootReal) fail('REC:WAVEFORM_TEMP');
    this.revalidate(job);
    await this.requireStopped(job);
    const path = await this.renderWaveform(job, job.identity.track, req);
    const location = await locateOwnFile(root, rootReal, path);
    const owned: OwnedWaveformFile = { root, rootReal, location, canRemove: location !== undefined };
    let peaks: number[];
    try {
      this.revalidate(job);
      await this.requireStopped(job);
      peaks = await this.readRenderedFile(job, owned);
    } finally {
      await this.cleanupOwnedFile(owned);
    }
    this.revalidate(job);
    await this.requireStopped(job);
    return { scope: req.scope, track: req.track, clip: req.clip, startTime: req.startTime, endTime: req.endTime, peaks };
  }

  private startDeadline(job: WaveformJob): Promise<Outcome> {
    return new Promise((done) => {
      job.timer = setTimeout(() => {
        job.expired = true;
        done({ ok: false, code: 'REC:WAVEFORM_TIMEOUT' });
      }, this.deadlineMs);
      const pending = job.timer as unknown as { unref?: () => void };
      if (typeof pending.unref === 'function') pending.unref();
    });
  }

  private async race(job: WaveformJob, settled: Promise<Outcome>, deadline: Promise<Outcome>): Promise<Outcome> {
    const cancelled = new Promise<Outcome>((done) => {
      job.waiters.push(() => done({ ok: false, code: 'REC:WAVEFORM_CANCELLED' }));
    });
    try {
      return await Promise.race([settled, deadline, cancelled]);
    } finally {
      if (job.timer !== undefined) {
        clearTimeout(job.timer);
        job.timer = undefined;
      }
      job.waiters.length = 0;
    }
  }

  /** The world must still be the one the request was made in. */
  private revalidate(job: WaveformJob): void {
    this.assertLive(job);
    this.requireCurrent(job.context);
    if (this.currentScope() !== job.scope) fail('REC:WAVEFORM_SCOPE');
    if (this.deps.getAttemptActive()) fail('REC:WAVEFORM_ACTIVE');
    this.assertSameIdentity(job.identity);
  }

  /** A cancelled or an expired job never continues. */
  private assertLive(job: WaveformJob): void {
    if (job.cancelled) fail('REC:WAVEFORM_CANCELLED');
    if (job.expired) fail('REC:WAVEFORM_TIMEOUT');
  }

  private assertSameIdentity(identity: WaveformIdentity): void {
    const again = this.resolveIdentity(identity.request);
    if (again.song !== identity.song) fail('REC:WAVEFORM_IDENTITY');
    if (again.track !== identity.track) fail('REC:WAVEFORM_IDENTITY');
    if (again.clip !== identity.clip) fail('REC:WAVEFORM_IDENTITY');
  }

  private async requireStopped(job: WaveformJob): Promise<void> {
    this.revalidate(job);
    const state = await this.readTransport(job);
    if (!isObject(state) || state['connected'] !== true) fail('REC:WAVEFORM_TRANSPORT');
    if (!isStoppedObservation(state['isPlaying'] as RecordingObservation<boolean> | undefined)) fail('REC:WAVEFORM_PLAYING');
    if (!isStoppedObservation(state['recordMode'] as RecordingObservation<boolean> | undefined)) fail('REC:WAVEFORM_RECORDING');
    this.revalidate(job);
  }

  private async readTransport(job: WaveformJob): Promise<RecordingTransportState> {
    try {
      return await this.deps.getTransport(job.controller.signal);
    } catch {
      fail(job.cancelled ? 'REC:WAVEFORM_CANCELLED' : 'REC:WAVEFORM_TRANSPORT');
    }
  }

  private async renderWaveform(job: WaveformJob, track: WaveformAudioTrack, req: RecordingWaveformRequest): Promise<string> {
    this.assertLive(job);
    try {
      const path = await this.deps.render(track, req.startTime, req.endTime);
      if (typeof path !== 'string' || !path) fail('REC:WAVEFORM_FILE');
      return path;
    } catch (error) {
      if (isServiceError(error)) throw error;
      fail(job.cancelled ? 'REC:WAVEFORM_CANCELLED' : 'REC:WAVEFORM_RENDER');
    }
  }

  /** The rendered file of this job, and only of this job. */
  private async readRenderedFile(job: WaveformJob, owned: OwnedWaveformFile): Promise<number[]> {
    const location = owned.location;
    if (!location) fail('REC:WAVEFORM_FILE');
    this.revalidate(job);
    if (!await isOwnTempRoot(owned.root, owned.rootReal, this.deps.getTempDirectory())) fail('REC:WAVEFORM_TEMP');
    this.revalidate(job);
    const handle = await openSafely(this.openFile, location.filePath);
    if (!handle) fail('REC:WAVEFORM_FILE');
    owned.canRemove = false;
    try {
      const verdict = await verifyOpenedFile(handle, location.info);
      if (!verdict.ok) fail(verdict.reason === 'size' ? 'REC:WAVEFORM_SIZE' : 'REC:WAVEFORM_FILE');
      this.revalidate(job);
      if (!await isPathUnchanged(location)) fail('REC:WAVEFORM_FILE');
      this.revalidate(job);
      const bytes = await readBoundedFile(handle, verdict.size, () => this.revalidate(job));
      if (!bytes) fail('REC:WAVEFORM_FILE');
      return computePeaks(this.parseAudio(bytes), MAX_PEAKS);
    } finally {
      await handle.close().then(() => { owned.canRemove = true; }, () => undefined);
    }
  }

  /** The best effort cleanup of the own rendered file. */
  private async cleanupOwnedFile(owned: OwnedWaveformFile): Promise<void> {
    const location = owned.location;
    if (!owned.canRemove || !location) return;
    const temp = () => this.deps.getTempDirectory();
    const removal = removeOwnRenderedFile(owned.root, owned.rootReal, location, temp, this.deps.removeFile);
    await removal.catch(() => undefined);
  }

  private parseAudio(bytes: Buffer): WavAudio {
    try {
      return parseWav(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    } catch {
      fail('REC:WAVEFORM_PARSE');
    }
  }

  private currentSong(): WaveformSong {
    try {
      return this.deps.getSong();
    } catch {
      fail('REC:WAVEFORM_FAILED');
    }
  }

  private currentScope(): string {
    try {
      const scope = this.deps.getScope();
      return typeof scope === 'string' ? scope : '';
    } catch {
      return '';
    }
  }

  private resolveIdentity(req: RecordingWaveformRequest): WaveformIdentity {
    const song = this.currentSong();
    const track = this.resolveTrack(req, song);
    const clip = this.resolveClip(req, track);
    this.assertInterval(req, clip);
    return { request: req, song, track, clip };
  }

  /** The track of the request must be the exact track of the Song. */
  private resolveTrack(req: RecordingWaveformRequest, song: WaveformSong): WaveformAudioTrack {
    const tracks = song.tracks;
    if (!Array.isArray(tracks) || tracks.length > MAX_TRACKS) fail('REC:WAVEFORM_TRACK');
    const track = tracks[req.track.index];
    if (!track) fail('REC:WAVEFORM_TRACK');
    if (!this.deps.isAudioTrack(track)) fail('REC:WAVEFORM_TRACK');
    const trackId = handleId(track);
    if (trackId === undefined || trackId !== req.track.id) fail('REC:WAVEFORM_IDENTITY');
    if (countHandle(tracks, trackId) !== 1) fail('REC:WAVEFORM_IDENTITY');
    if (track.name !== req.track.name) fail('REC:WAVEFORM_IDENTITY');
    return track;
  }

  /** The clip of the request must be the exact clip of the track. */
  private resolveClip(req: RecordingWaveformRequest, track: WaveformAudioTrack): WaveformAudioClip {
    const clips = track.arrangementClips;
    if (!Array.isArray(clips) || clips.length > MAX_CLIPS) fail('REC:WAVEFORM_CLIP');
    const clip = clips[req.clip.index];
    if (!clip) fail('REC:WAVEFORM_CLIP');
    if (!this.deps.isAudioClip(clip)) fail('REC:WAVEFORM_CLIP');
    const clipId = handleId(clip);
    if (clipId === undefined || clipId !== req.clip.id) fail('REC:WAVEFORM_IDENTITY');
    if (countHandle(clips, clipId) !== 1) fail('REC:WAVEFORM_IDENTITY');
    if (!sameClip(clip, req.clip)) fail('REC:WAVEFORM_IDENTITY');
    return clip;
  }

  /** The requested interval must be finite, ordered and inside the clip. */
  private assertInterval(req: RecordingWaveformRequest, clip: WaveformAudioClip): void {
    if (req.endTime - req.startTime > MAX_INTERVAL_BEATS) fail('REC:WAVEFORM_INTERVAL');
    if (req.startTime < clip.startTime) fail('REC:WAVEFORM_INTERVAL');
    if (req.endTime > clip.endTime) fail('REC:WAVEFORM_INTERVAL');
  }

  private requireCurrent(context?: RecordingWaveformContext): void {
    if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) {
      fail('REC:WAVEFORM_CONTEXT');
    }
  }
}
