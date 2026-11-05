// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Read-only catalog of Live's take lanes and the clips inside them.
//
// A client asks for one track and receives one bounded page: at most 32 lanes
// and 64 clips in total, in the order Live reports them. Every item carries
// its index (which locates it) and its handle id (which authorizes it), so a
// later write can name exactly one clip without ever trusting a name alone.
//
// Nothing here writes. No clip is created, renamed or deleted, no lane is
// created, no transport or arm state is touched and no audio file is read.
// Listing is therefore safe while Live plays or records, and it needs no OSC
// link at all: the SDK's own object graph is the only source.
//
// The service never polls. A catalog exists only because a client asked for
// one, so the normal REC state read stays exactly as cheap as it was.
//
// Every clip also carries a reference: an opaque token of the exact object
// chain that leads to it. A handle, a name and a time can all be reused, so
// the reference is what a later write proves its clip with. It is minted in
// this process only and is shared with the marking service.

import { TakeNotesIdentity } from './recording-take-identity.js';

/** The opaque SDK handle. Its id is a host number, never a durable Set id. */
export interface TakeNotesHandle {
  readonly id: string | number | bigint;
}

export interface TakeNotesClip {
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly handle: TakeNotesHandle;
}

export interface TakeNotesLane {
  readonly name: string;
  readonly handle: TakeNotesHandle;
  readonly clips: readonly TakeNotesClip[];
}

export interface TakeNotesTrack {
  readonly name: string;
  readonly handle: TakeNotesHandle;
  readonly takeLanes: readonly TakeNotesLane[];
}

export interface TakeNotesSong {
  readonly tracks: readonly TakeNotesTrack[];
}

/** One exact track address: the index locates it, the id and name authorize. */
export interface TakeNotesTrackRef {
  index: number;
  id: string;
  name: string;
}

export interface TakeNotesRequest {
  scope: string;
  track: TakeNotesTrackRef;
  laneOffset: number;
  clipOffset: number;
}

/** The only two marks a clip name may carry. Nothing else is inferred. */
export type TakeMark = 'good' | 'review' | null;

export interface TakeNotesClipView {
  index: number;
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  mark: TakeMark;
  /** The opaque token of the object chain this clip was read from. */
  reference: string;
}

export interface TakeNotesLaneView {
  index: number;
  id: string;
  name: string;
  clips: TakeNotesClipView[];
}

export interface TakeNotesCursor {
  laneOffset: number;
  clipOffset: number;
}

export interface TakeNotesPage extends TakeNotesCursor {
  next: TakeNotesCursor | null;
}

export interface TakeNotesView {
  scope: string;
  track: TakeNotesTrackRef;
  lanes: TakeNotesLaneView[];
  page: TakeNotesPage;
}

const REQUEST_KEYS = ['scope', 'track', 'laneOffset', 'clipOffset'] as const;
const TRACK_KEYS = ['index', 'id', 'name'] as const;
/** One page holds at most this many lanes and this many clips in total. */
export const TAKE_PAGE_MAX_LANES = 32;
export const TAKE_PAGE_MAX_CLIPS = 64;
/** One exact leading prefix carries the mark. Two prefixes carry one mark. */
export const TAKE_GOOD_PREFIX = '[RC:GOOD] ';
export const TAKE_REVIEW_PREFIX = '[RC:REVIEW] ';

interface ClipSnapshot {
  index: number;
  clip: TakeNotesClip;
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  mark: TakeMark;
}

interface LaneSnapshot {
  index: number;
  lane: TakeNotesLane;
  id: string;
  name: string;
  clips: ClipSnapshot[];
}

interface PageSnapshot {
  laneOffset: number;
  clipOffset: number;
  next: TakeNotesCursor | null;
  lanes: LaneSnapshot[];
}

function fail(code: string): never {
  throw Error('REC:' + code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The request carries exactly these keys: no more, no less. */
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** A usable handle id: a plain string of the host's own, never empty. */
function handleId(object: { readonly handle?: TakeNotesHandle } | null | undefined): string {
  const raw = object?.handle?.id;
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'bigint') fail('IDENTITY');
  const id = String(raw);
  if (!id) fail('IDENTITY');
  return id;
}

/** The mark is the one exact leading prefix, and nothing else. */
export function takeMarkFor(name: string): TakeMark {
  if (name.startsWith(TAKE_GOOD_PREFIX)) return 'good';
  if (name.startsWith(TAKE_REVIEW_PREFIX)) return 'review';
  return null;
}

/**
 * The take-lane catalog of one track.
 *
 * The Song and the scope are injected, so the service reads whatever the
 * coordinator currently sees and never reaches for a transport or a host
 * property of its own.
 */
export class RecordingTakeNotes {
  /** The object-identity helper of this service. The marking service shares
   * it, so a reference it hands out is the one a write is checked against. */
  public readonly identities = new TakeNotesIdentity();

  constructor(
    private readonly getSong: () => TakeNotesSong,
    private readonly getScope: () => string,
  ) {}

  /**
   * One bounded page of the addressed track's take lanes.
   *
   * The scope must be the current runtime generation, the track must be the
   * exact track Live currently shows at that index, and every returned item
   * is copied out of the host's objects as plain JSON.
   */
  public list(request: unknown): TakeNotesView {
    const args = this.parseRequest(request);
    const scope = this.getScope();
    if (args.scope !== scope) fail('SCOPE');
    const song = this.getSong();
    const track = this.resolveTrack(song, args.track);
    const lanes = [...track.takeLanes];
    this.requireUniqueLaneHandles(lanes);
    this.requireRange(lanes, args);
    const page = this.walk(lanes, args.laneOffset, args.clipOffset);
    this.revalidate(song, scope, track, args.track, lanes, page);
    return this.view(scope, args.track, track, page);
  }

  private parseRequest(request: unknown): TakeNotesRequest {
    if (!isPlainObject(request)) fail('ARGUMENTS');
    if (!exactKeys(request, REQUEST_KEYS)) fail('ARGUMENTS');
    const scope = request['scope'];
    if (typeof scope !== 'string' || !scope) fail('ARGUMENTS');
    return {
      scope,
      track: this.trackRef(request['track']),
      laneOffset: this.offset(request['laneOffset']),
      clipOffset: this.offset(request['clipOffset']),
    };
  }

  private trackRef(value: unknown): TakeNotesTrackRef {
    if (!isPlainObject(value)) fail('ARGUMENTS');
    if (!exactKeys(value, TRACK_KEYS)) fail('ARGUMENTS');
    const index = value['index'];
    const id = value['id'];
    const name = value['name'];
    if (!Number.isSafeInteger(index) || (index as number) < 0) fail('ARGUMENTS');
    if (typeof id !== 'string' || !id) fail('ARGUMENTS');
    if (typeof name !== 'string') fail('ARGUMENTS');
    return { index: index as number, id, name };
  }

  private offset(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) fail('ARGUMENTS');
    return value as number;
  }

  /** The addressed track is the one at that index with that id and name. */
  private resolveTrack(song: TakeNotesSong, ref: TakeNotesTrackRef): TakeNotesTrack {
    const track = song.tracks[ref.index];
    if (!track) fail('IDENTITY');
    const id = handleId(track);
    if (id !== ref.id || track.name !== ref.name) fail('IDENTITY');
    if (song.tracks.filter(item => handleId(item) === id).length !== 1) fail('IDENTITY');
    return track;
  }

  /** Two lanes of one track may never share a handle. */
  private requireUniqueLaneHandles(lanes: readonly TakeNotesLane[]): void {
    const seen = new Set<string>();
    for (const lane of lanes) {
      const id = handleId(lane);
      if (seen.has(id)) fail('IDENTITY');
      seen.add(id);
    }
  }

  /** An offset that addresses nothing is refused, never silently clamped. */
  private requireRange(lanes: readonly TakeNotesLane[], args: TakeNotesRequest): void {
    if (args.laneOffset > lanes.length) fail('TAKE_RANGE');
    if (args.laneOffset === lanes.length) {
      if (lanes.length > 0) fail('TAKE_RANGE');
      if (args.clipOffset > 0) fail('TAKE_RANGE');
      return;
    }
    const clips = lanes[args.laneOffset]!.clips;
    const beyond = clips.length === 0 ? args.clipOffset > 0 : args.clipOffset >= clips.length;
    if (beyond) fail('TAKE_RANGE');
  }

  /**
   * Walk the lanes in the order Live reports them.
   *
   * The clip offset applies to the first lane only. A page holds at most 32
   * lanes and 64 clips; whatever is left over is named by the next cursor,
   * which always points at the first unconsumed clip or lane.
   */
  private walk(lanes: readonly TakeNotesLane[], laneOffset: number, clipOffset: number): PageSnapshot {
    const out: LaneSnapshot[] = [];
    let laneIndex = laneOffset;
    let clipIndex = clipOffset;
    let budget = TAKE_PAGE_MAX_CLIPS;
    let next: TakeNotesCursor | null = null;
    for (;;) {
      if (laneIndex >= lanes.length) break;
      if (out.length >= TAKE_PAGE_MAX_LANES) {
        next = { laneOffset: laneIndex, clipOffset: clipIndex };
        break;
      }
      const lane = lanes[laneIndex]!;
      const clips = lane.clips;
      const remaining = clips.length - clipIndex;
      if (remaining > 0 && budget <= 0) {
        next = { laneOffset: laneIndex, clipOffset: clipIndex };
        break;
      }
      const take = Math.min(remaining, budget);
      out.push(this.laneSnapshot(laneIndex, lane, clips, clipIndex, take));
      budget -= take;
      clipIndex += take;
      if (clipIndex < clips.length) {
        next = { laneOffset: laneIndex, clipOffset: clipIndex };
        break;
      }
      laneIndex += 1;
      clipIndex = 0;
    }
    return { laneOffset, clipOffset, next, lanes: out };
  }

  private laneSnapshot(
    index: number,
    lane: TakeNotesLane,
    clips: readonly TakeNotesClip[],
    from: number,
    take: number,
  ): LaneSnapshot {
    const id = handleId(lane);
    const name = lane.name;
    if (typeof name !== 'string') fail('IDENTITY');
    this.requireUniqueClipHandles(clips);
    const views: ClipSnapshot[] = [];
    for (let offset = from; offset < from + take; offset++) {
      const clip = clips[offset];
      if (!clip) fail('IDENTITY');
      views.push(this.clipSnapshot(offset, clip));
    }
    return { index, lane, id, name, clips: views };
  }

  /** Two clips of one lane may never share a handle. */
  private requireUniqueClipHandles(clips: readonly TakeNotesClip[]): void {
    const seen = new Set<string>();
    for (const clip of clips) {
      const id = handleId(clip);
      if (seen.has(id)) fail('IDENTITY');
      seen.add(id);
    }
  }

  private clipSnapshot(index: number, clip: TakeNotesClip): ClipSnapshot {
    const name = clip.name;
    if (typeof name !== 'string') fail('IDENTITY');
    const startTime = clip.startTime;
    const endTime = clip.endTime;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) fail('IDENTITY');
    if (startTime < 0 || endTime < startTime) fail('IDENTITY');
    return { index, clip, id: handleId(clip), name, startTime, endTime, mark: takeMarkFor(name) };
  }

  /** The Song, the scope and every addressed identity still hold. */
  private revalidate(
    song: TakeNotesSong,
    scope: string,
    track: TakeNotesTrack,
    ref: TakeNotesTrackRef,
    lanes: readonly TakeNotesLane[],
    page: PageSnapshot,
  ): void {
    if (this.getSong() !== song) fail('IDENTITY');
    if (this.getScope() !== scope) fail('SCOPE');
    this.revalidateTrack(song, track, ref);
    this.revalidateLanes(track, lanes, page);
  }

  private revalidateTrack(song: TakeNotesSong, track: TakeNotesTrack, ref: TakeNotesTrackRef): void {
    const current = song.tracks[ref.index];
    if (!current || current !== track) fail('IDENTITY');
    if (handleId(current) !== ref.id) fail('IDENTITY');
    if (current.name !== ref.name) fail('IDENTITY');
  }

  private revalidateLanes(track: TakeNotesTrack, lanes: readonly TakeNotesLane[], page: PageSnapshot): void {
    const current = track.takeLanes;
    if (current.length !== lanes.length) fail('IDENTITY');
    for (const lane of page.lanes) this.revalidateLane(current, lane);
  }

  private revalidateLane(lanes: readonly TakeNotesLane[], snapshot: LaneSnapshot): void {
    const live = lanes[snapshot.index];
    if (!live || live !== snapshot.lane) fail('IDENTITY');
    if (handleId(live) !== snapshot.id) fail('IDENTITY');
    if (live.name !== snapshot.name) fail('IDENTITY');
    for (const clip of snapshot.clips) this.revalidateClip(live, clip);
  }

  private revalidateClip(lane: TakeNotesLane, snapshot: ClipSnapshot): void {
    const live = lane.clips[snapshot.index];
    if (!live || live !== snapshot.clip) fail('IDENTITY');
    if (handleId(live) !== snapshot.id) fail('IDENTITY');
    if (live.name !== snapshot.name) fail('IDENTITY');
    if (live.startTime !== snapshot.startTime) fail('IDENTITY');
    if (live.endTime !== snapshot.endTime) fail('IDENTITY');
  }

  /** The page as plain JSON: no host object, no bigint, no function. */
  private view(scope: string, ref: TakeNotesTrackRef, track: TakeNotesTrack, page: PageSnapshot): TakeNotesView {
    return {
      scope,
      track: { index: ref.index, id: ref.id, name: ref.name },
      lanes: page.lanes.map(lane => ({
        index: lane.index,
        id: lane.id,
        name: lane.name,
        clips: lane.clips.map(clip => ({
          index: clip.index,
          id: clip.id,
          name: clip.name,
          startTime: clip.startTime,
          endTime: clip.endTime,
          mark: clip.mark,
          reference: this.identities.reference(scope, track, lane.lane, clip.clip),
        })),
      })),
      page: {
        laneOffset: page.laneOffset,
        clipOffset: page.clipOffset,
        next: page.next ? { laneOffset: page.next.laneOffset, clipOffset: page.next.clipOffset } : null,
      },
    };
  }
}
