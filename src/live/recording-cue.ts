// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

export const CUE_PAGE_SIZE = 16;
export const CUE_MAX_RETURNS = 64;
export const CUE_READ_TIMEOUT_MS = 2000;

const REQUEST_KEYS = ['scope', 'returnTrack', 'offset'] as const;
const RETURN_KEYS = ['index', 'id', 'name'] as const;

export interface CueHandle {
  readonly id: string | number | bigint;
}

export interface CueDeviceParameter {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly handle?: CueHandle;
  getValue(): Promise<number>;
  setValue?(value: number): Promise<void>;
}

export interface CueMixer {
  readonly sends?: readonly CueDeviceParameter[];
  readonly volume?: CueDeviceParameter;
  readonly panning?: CueDeviceParameter;
}

export interface CueTrack {
  readonly name: string;
  readonly handle: CueHandle;
  readonly mixer?: CueMixer;
}

export interface CueSong {
  readonly tracks: readonly CueTrack[];
  readonly returnTracks: readonly CueTrack[];
}

export interface CueTrackRef {
  readonly index: number;
  readonly id: string;
  readonly name: string;
}

export interface CueRequest {
  readonly scope: string;
  readonly returnTrack: CueTrackRef | null;
  readonly offset: number;
}

export interface CueTrackRow {
  readonly track: CueTrackRef;
  readonly sendIndex: number;
  readonly parameterId: string | null;
  readonly parameterName: string | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly value: number | null;
  readonly normalized: number | null;
  readonly status: 'candidate' | 'unavailable';
}

export interface CueStateView {
  readonly scope: string;
  readonly returns: readonly CueTrackRef[];
  readonly returnTrack: CueTrackRef | null;
  readonly tracks: readonly CueTrackRow[];
  readonly nextOffset: number | null;
  readonly writeEnabled: false;
}

interface CapturedTrack {
  readonly index: number;
  readonly track: CueTrack;
  readonly id: string;
  readonly name: string;
}

interface CapturedParam {
  readonly param: CueDeviceParameter | undefined;
  readonly id: string | null;
  readonly name: string | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly eligible: boolean;
}

interface CapturedPageTrack {
  readonly trackIndex: number;
  readonly track: CueTrack;
  readonly id: string;
  readonly name: string;
  readonly sendCount: number;
  readonly handleCount: number;
  readonly param: CapturedParam;
}

interface TopologySnapshot {
  readonly scope: string;
  readonly song: CueSong;
  readonly returns: readonly CapturedTrack[];
  readonly selectedReturnRef: CueTrackRef;
  readonly selectedReturn: CueTrack;
  readonly tracks: readonly CapturedTrack[];
  readonly page: readonly CapturedPageTrack[];
}

interface ReadOutcome {
  readonly status: 'candidate' | 'unavailable';
  readonly value: number | null;
  readonly normalized: number | null;
}

function fail(code: string): never {
  throw Error('REC:' + code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Only a non-empty string, a finite number or a bigint identifies an object.
 * NaN and Infinity never identify anything. */
function safeHandleId(object: { readonly handle?: CueHandle } | null | undefined): string | null {
  const raw = object?.handle?.id;
  if (typeof raw === 'string') return raw.length > 0 ? raw : null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;
  if (typeof raw === 'bigint') return String(raw);
  return null;
}

function handleId(object: { readonly handle?: CueHandle } | null | undefined): string {
  const id = safeHandleId(object);
  if (id === null) fail('IDENTITY');
  return id;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function paramNameOrNull(param: CueDeviceParameter | undefined): string | null {
  return param && typeof param.name === 'string' ? param.name : null;
}

function countMatchingHandles(sends: readonly CueDeviceParameter[], targetId: string | null): number {
  if (targetId === null) return 0;
  let count = 0;
  for (const send of sends) {
    if (safeHandleId(send) === targetId) count++;
  }
  return count;
}

function isReadableParam(
  param: CueDeviceParameter | undefined,
  id: string | null,
  name: string | null
): boolean {
  if (!param || !id || !name) return false;
  return typeof param.getValue === 'function';
}

function hasValidRange(min: number | null, max: number | null): boolean {
  return min !== null && max !== null && min < max;
}

/** Captures the selected send parameter by object, identity and range. It is
 * eligible only when it is readable, has a usable range and is the single
 * send with that handle, so a duplicate handle never reads. */
function captureParam(
  param: CueDeviceParameter | undefined,
  sends: readonly CueDeviceParameter[],
  sendCountMatches: boolean
): CapturedParam {
  const id = safeHandleId(param);
  const name = paramNameOrNull(param);
  const min = finiteNumberOrNull(param?.min);
  const max = finiteNumberOrNull(param?.max);
  const eligible =
    sendCountMatches &&
    isReadableParam(param, id, name) &&
    hasValidRange(min, max) &&
    countMatchingHandles(sends, id) === 1;
  return { param, id, name, min, max, eligible };
}

function withTimeout(action: () => Promise<number>, timeoutMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('TIMEOUT'))), timeoutMs);
    try {
      action().then(
        val => finish(() => resolve(val)),
        err => finish(() => reject(err))
      );
    } catch (err) {
      finish(() => reject(err));
    }
  });
}

function evaluateReadValue(value: unknown, min: number, max: number): ReadOutcome {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return { status: 'unavailable', value: null, normalized: null };
  }
  const raw = (value - min) / (max - min);
  if (!Number.isFinite(raw)) return { status: 'unavailable', value: null, normalized: null };
  return { status: 'candidate', value, normalized: Math.max(0, Math.min(1, raw)) };
}

async function readSendParam(
  param: CueDeviceParameter,
  min: number,
  max: number,
  timeoutMs: number,
  checkTopology: () => void
): Promise<ReadOutcome> {
  checkTopology();
  let value: number;
  try {
    value = await withTimeout(() => param.getValue(), timeoutMs);
  } catch {
    checkTopology();
    return { status: 'unavailable', value: null, normalized: null };
  }
  checkTopology();
  return evaluateReadValue(value, min, max);
}

export class RecordingCue {
  constructor(
    private readonly getSong: () => CueSong,
    private readonly getScope: () => string
  ) {}

  public async getState(request: unknown): Promise<CueStateView> {
    const args = this.parseRequest(request);
    const scope = this.getScope();
    if (args.scope !== scope) fail('SCOPE');

    const song = this.getSong();
    const capturedReturns = this.captureReturns(song.returnTracks);
    const capturedTracks = this.captureTracks(song.tracks, args.offset);
    const returnsView = capturedReturns.map(r => ({ index: r.index, id: r.id, name: r.name }));

    if (args.returnTrack === null) {
      return { scope, returns: returnsView, returnTrack: null, tracks: [], nextOffset: null, writeEnabled: false };
    }

    const returnRef = args.returnTrack;
    const selectedReturn = this.resolveReturn(song.returnTracks, returnRef);
    const sendIndex = returnRef.index;
    const pageSlice = capturedTracks.slice(args.offset, args.offset + CUE_PAGE_SIZE);
    const nextOffset =
      args.offset + pageSlice.length < capturedTracks.length ? args.offset + pageSlice.length : null;
    const pageInfo = this.capturePage(pageSlice, sendIndex, capturedReturns.length);
    const snapshot: TopologySnapshot = {
      scope,
      song,
      returns: capturedReturns,
      selectedReturnRef: returnRef,
      selectedReturn,
      tracks: capturedTracks,
      page: pageInfo,
    };
    const checkTopology = () => this.assertTopology(snapshot);

    checkTopology();
    const rows = await this.readRows(pageInfo, sendIndex, checkTopology);
    checkTopology();

    return {
      scope,
      returns: returnsView,
      returnTrack: { index: returnRef.index, id: returnRef.id, name: returnRef.name },
      tracks: rows,
      nextOffset,
      writeEnabled: false,
    };
  }

  private parseRequest(request: unknown): CueRequest {
    if (!isPlainObject(request) || !exactKeys(request, REQUEST_KEYS)) fail('ARGUMENTS');
    const { scope, returnTrack, offset } = request;
    if (typeof scope !== 'string' || !scope) fail('ARGUMENTS');
    if (!Number.isSafeInteger(offset) || (offset as number) < 0) fail('ARGUMENTS');
    return {
      scope,
      returnTrack: this.parseReturnTrack(returnTrack),
      offset: offset as number,
    };
  }

  private parseReturnTrack(value: unknown): CueTrackRef | null {
    if (value === null) return null;
    if (!isPlainObject(value) || !exactKeys(value, RETURN_KEYS)) fail('ARGUMENTS');
    const { index, id, name } = value;
    if (!Number.isSafeInteger(index) || (index as number) < 0) fail('ARGUMENTS');
    if (typeof id !== 'string' || !id) fail('ARGUMENTS');
    if (typeof name !== 'string') fail('ARGUMENTS');
    return { index: index as number, id, name };
  }

  private captureReturns(returns: readonly CueTrack[]): CapturedTrack[] {
    if (!Array.isArray(returns)) fail('IDENTITY');
    if (returns.length > CUE_MAX_RETURNS) fail('CUE_LIMIT');
    return this.snapshotTrackList(returns);
  }

  private captureTracks(tracks: readonly CueTrack[], offset: number): CapturedTrack[] {
    if (!Array.isArray(tracks)) fail('IDENTITY');
    const captured = this.snapshotTrackList(tracks);
    if (captured.length === 0 ? offset !== 0 : offset >= captured.length) {
      fail('ARGUMENTS');
    }
    return captured;
  }

  /** Copies every track of the list with its index, object, id and name so a
   * later mutation of the live list cannot silently change the capture. */
  private snapshotTrackList(tracks: readonly CueTrack[]): CapturedTrack[] {
    const ids = new Set<string>();
    const result: CapturedTrack[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track || typeof track.name !== 'string') fail('IDENTITY');
      const id = handleId(track);
      if (ids.has(id)) fail('IDENTITY');
      ids.add(id);
      result.push({ index: i, track, id, name: track.name });
    }
    return result;
  }

  /** Resolves the requested Return by index, id and name against the live
   * list and keeps the exact object for later identity checks. */
  private resolveReturn(returns: readonly CueTrack[], ref: CueTrackRef): CueTrack {
    const target = returns[ref.index];
    if (!target || handleId(target) !== ref.id || target.name !== ref.name) fail('IDENTITY');
    return target;
  }

  private capturePage(
    pageTracks: readonly CapturedTrack[],
    sendIndex: number,
    returnCount: number
  ): CapturedPageTrack[] {
    return pageTracks.map(entry => this.capturePageTrack(entry, sendIndex, returnCount));
  }

  private capturePageTrack(
    entry: CapturedTrack,
    sendIndex: number,
    returnCount: number
  ): CapturedPageTrack {
    const rawSends = entry.track.mixer?.sends;
    const sendArray = Array.isArray(rawSends) ? rawSends : [];
    const sendCount = Array.isArray(rawSends) ? rawSends.length : -1;
    const sendParam = sendCount >= 0 ? sendArray[sendIndex] : undefined;
    const param = captureParam(sendParam, sendArray, sendCount === returnCount);
    return {
      trackIndex: entry.index,
      track: entry.track,
      id: entry.id,
      name: entry.name,
      sendCount,
      handleCount: countMatchingHandles(sendArray, param.id),
      param,
    };
  }

  /** Revalidates the whole capture: scope, song, every Return, every track
   * and the selected send parameter of the current page. */
  private assertTopology(snapshot: TopologySnapshot): void {
    if (this.getScope() !== snapshot.scope) fail('SCOPE');
    const song = this.getSong();
    if (!song || song !== snapshot.song) fail('IDENTITY');
    const { returns, selectedReturnRef, selectedReturn } = snapshot;
    this.assertReturnTopology(song.returnTracks, returns, selectedReturnRef, selectedReturn);
    this.assertTrackList(song.tracks, snapshot.tracks);
    this.assertPageSends(snapshot.page, snapshot.selectedReturnRef.index, snapshot.returns.length);
  }

  private assertReturnTopology(
    returns: readonly CueTrack[],
    expected: readonly CapturedTrack[],
    selectedRef: CueTrackRef,
    selectedTrack: CueTrack
  ): void {
    if (!Array.isArray(returns) || returns.length !== expected.length) fail('IDENTITY');
    for (let i = 0; i < expected.length; i++) {
      this.assertCapturedTrack(returns[i], expected[i]!);
    }
    this.assertCapturedTrack(returns[selectedRef.index], {
      index: selectedRef.index,
      track: selectedTrack,
      id: selectedRef.id,
      name: selectedRef.name,
    });
  }

  private assertTrackList(tracks: readonly CueTrack[], expected: readonly CapturedTrack[]): void {
    if (!Array.isArray(tracks) || tracks.length !== expected.length) fail('IDENTITY');
    for (let i = 0; i < expected.length; i++) {
      this.assertCapturedTrack(tracks[i], expected[i]!);
    }
  }

  private assertCapturedTrack(current: CueTrack | undefined, expected: CapturedTrack): void {
    if (!current || current !== expected.track) fail('IDENTITY');
    if (handleId(current) !== expected.id || current.name !== expected.name) fail('IDENTITY');
  }

  private assertPageSends(
    page: readonly CapturedPageTrack[],
    sendIndex: number,
    returnCount: number
  ): void {
    for (const item of page) {
      this.assertPageTrackSend(item, sendIndex, returnCount);
    }
  }

  private assertPageTrackSend(
    item: CapturedPageTrack,
    sendIndex: number,
    returnCount: number
  ): void {
    const rawSends = item.track.mixer?.sends;
    const sendArray = Array.isArray(rawSends) ? rawSends : [];
    const sendCount = Array.isArray(rawSends) ? rawSends.length : -1;
    if (sendCount !== item.sendCount) fail('IDENTITY');
    const curSend = sendCount >= 0 ? sendArray[sendIndex] : undefined;
    const curParam = captureParam(curSend, sendArray, sendCount === returnCount);
    this.assertSameParam(curParam, item.param);
    if (countMatchingHandles(sendArray, item.param.id) !== item.handleCount) fail('IDENTITY');
  }

  /** The selected parameter must be the same object with the same identity,
   * name and range, and must still be usable after the pending read. */
  private assertSameParam(current: CapturedParam, expected: CapturedParam): void {
    if (current.param !== expected.param) fail('IDENTITY');
    if (current.id !== expected.id) fail('IDENTITY');
    if (current.name !== expected.name) fail('IDENTITY');
    if (current.min !== expected.min) fail('IDENTITY');
    if (current.max !== expected.max) fail('IDENTITY');
    if (current.eligible !== expected.eligible) fail('IDENTITY');
  }

  private async readRows(
    pageInfo: readonly CapturedPageTrack[],
    sendIndex: number,
    checkTopology: () => void
  ): Promise<CueTrackRow[]> {
    return Promise.all(pageInfo.map(item => this.readRow(item, sendIndex, checkTopology)));
  }

  private async readRow(
    item: CapturedPageTrack,
    sendIndex: number,
    checkTopology: () => void
  ): Promise<CueTrackRow> {
    checkTopology();
    const param = item.param;
    const base = {
      track: { index: item.trackIndex, id: item.id, name: item.name },
      sendIndex,
      parameterId: param.id,
      parameterName: param.name,
      min: param.min,
      max: param.max,
    };
    if (!param.eligible || !param.param || param.min === null || param.max === null) {
      return { ...base, value: null, normalized: null, status: 'unavailable' };
    }
    const read = await readSendParam(param.param, param.min, param.max, CUE_READ_TIMEOUT_MS, checkTopology);
    return { ...base, value: read.value, normalized: read.normalized, status: read.status };
  }
}
