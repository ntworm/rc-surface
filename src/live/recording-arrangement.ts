// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The Arrangement clips of one track.
//
// Live keeps the clips of the Arrangement on the track itself. This service
// lists them in the order Live reports them: it never sorts them into a
// chronology of its own, never reads a file and never looks at the clip
// slots of the Session grid.
//
// One page holds at most 64 clips. Every clip carries its index, its handle
// id and its name, so a later write can name exactly one clip. The service
// writes nothing and never touches a transport.
export interface ArrangementHandle { readonly id: string | number | bigint }

export interface ArrangementClip {
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly handle: ArrangementHandle;
}

export interface ArrangementTrack {
  readonly name: string;
  readonly handle: ArrangementHandle;
  /** Absent only in an old structural fixture; the real SDK always has it. */
  readonly arrangementClips?: readonly ArrangementClip[] | null;
}

export interface ArrangementSong { readonly tracks: readonly ArrangementTrack[] }

/** One exact track address: the index locates it, the id and name authorize. */
export interface ArrangementTrackRef { index: number; id: string; name: string }

export interface ArrangementRequest { scope: string; track: ArrangementTrackRef; offset: number }

export interface ArrangementClipView {
  index: number;
  id: string;
  name: string;
  startTime: number;
  endTime: number;
}

export interface ArrangementView {
  scope: string;
  track: ArrangementTrackRef;
  clips: ArrangementClipView[];
  page: { offset: number; next: number | null };
}

const REQUEST_KEYS = ['scope', 'track', 'offset'] as const;
const TRACK_KEYS = ['index', 'id', 'name'] as const;
/** One page holds at most this many clips. */
export const ARRANGEMENT_PAGE_MAX_CLIPS = 64;
/** One track never lists more than this many clips. */
export const ARRANGEMENT_MAX_CLIPS = 4096;
/** A name is bounded, so a hostile Set cannot flood the phone. */
const ARRANGEMENT_MAX_NAME = 256;

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
function handleId(object: { readonly handle?: ArrangementHandle } | null | undefined): string {
  const raw = object?.handle?.id;
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'bigint') fail('IDENTITY');
  const id = String(raw);
  if (!id) fail('IDENTITY');
  return id;
}

/**
 * The Arrangement catalog of one track.
 *
 * The Song and the scope are injected, so the service reads whatever the
 * coordinator currently sees and never reaches for a transport or a host
 * property of its own.
 */
export class RecordingArrangement {
  constructor(
    private readonly getSong: () => ArrangementSong,
    private readonly getScope: () => string,
  ) {}

  /**
   * One bounded page of the addressed track's Arrangement clips.
   *
   * The scope must be the current runtime generation, the track must be the
   * exact track Live shows at that index, and every returned item is copied
   * out of the host's objects as plain JSON.
   */
  public list(request: unknown): ArrangementView {
    const args = this.parseRequest(request);
    const scope = this.getScope();
    if (args.scope !== scope) fail('SCOPE');
    const song = this.getSong();
    const track = this.resolveTrack(song, args.track);
    const clips = this.arrangementClips(track);
    if (clips.length > ARRANGEMENT_MAX_CLIPS) fail('LIMIT');
    this.requireUniqueHandles(clips);
    this.requireRange(clips.length, args.offset);
    const views = this.page(clips, args.offset);
    this.revalidate(song, scope, track, args.track, clips, views);
    return {
      scope,
      track: { index: args.track.index, id: args.track.id, name: args.track.name },
      clips: views,
      page: { offset: args.offset, next: this.nextOffset(clips.length, args.offset, views.length) },
    };
  }

  private parseRequest(request: unknown): ArrangementRequest {
    if (!isPlainObject(request) || !exactKeys(request, REQUEST_KEYS)) fail('ARGUMENTS');
    const scope = request['scope'];
    if (typeof scope !== 'string' || !scope) fail('ARGUMENTS');
    const offset = request['offset'];
    if (!Number.isSafeInteger(offset) || (offset as number) < 0) fail('ARGUMENTS');
    if ((offset as number) > ARRANGEMENT_MAX_CLIPS) fail('ARGUMENTS');
    return { scope, track: this.trackRef(request['track']), offset: offset as number };
  }

  private trackRef(value: unknown): ArrangementTrackRef {
    if (!isPlainObject(value) || !exactKeys(value, TRACK_KEYS)) fail('ARGUMENTS');
    const index = value['index'];
    const id = value['id'];
    const name = value['name'];
    if (!Number.isSafeInteger(index) || (index as number) < 0) fail('ARGUMENTS');
    if (typeof id !== 'string' || !id) fail('ARGUMENTS');
    if (typeof name !== 'string') fail('ARGUMENTS');
    return { index: index as number, id, name };
  }

  /** The addressed track is the one at that index with that id and name. */
  private resolveTrack(song: ArrangementSong, ref: ArrangementTrackRef): ArrangementTrack {
    const tracks = song.tracks;
    const track = tracks[ref.index];
    if (!track) fail('IDENTITY');
    if (handleId(track) !== ref.id || track.name !== ref.name) fail('IDENTITY');
    if (tracks.filter(item => handleId(item) === ref.id).length !== 1) fail('IDENTITY');
    return track;
  }

  /** The clips Live reports for this track, in Live's own order. */
  private arrangementClips(track: ArrangementTrack): readonly ArrangementClip[] {
    const raw = track.arrangementClips;
    if (raw === undefined) return [];
    if (raw === null) fail('IDENTITY');
    return raw;
  }

  /** Two clips of one track may never share a handle. */
  private requireUniqueHandles(clips: readonly ArrangementClip[]): void {
    const seen = new Set<string>();
    for (const clip of clips) {
      const id = handleId(clip);
      if (seen.has(id)) fail('IDENTITY');
      seen.add(id);
    }
  }

  /** An offset that addresses nothing is refused, never silently clamped. */
  private requireRange(count: number, offset: number): void {
    if (count === 0) {
      if (offset !== 0) fail('ARGUMENTS');
      return;
    }
    if (offset >= count) fail('ARGUMENTS');
  }

  private page(clips: readonly ArrangementClip[], offset: number): ArrangementClipView[] {
    const views: ArrangementClipView[] = [];
    const end = Math.min(clips.length, offset + ARRANGEMENT_PAGE_MAX_CLIPS);
    for (let at = offset; at < end; at++) {
      const clip = clips[at];
      if (!clip) fail('IDENTITY');
      views.push(this.clipView(at, clip));
    }
    return views;
  }

  private clipView(index: number, clip: ArrangementClip): ArrangementClipView {
    const name = clip.name;
    if (typeof name !== 'string' || name.length > ARRANGEMENT_MAX_NAME) fail('IDENTITY');
    const startTime = clip.startTime;
    const endTime = clip.endTime;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) fail('IDENTITY');
    if (startTime < 0 || endTime <= startTime) fail('IDENTITY');
    return { index, id: handleId(clip), name, startTime, endTime };
  }

  private nextOffset(count: number, offset: number, taken: number): number | null {
    const next = offset + taken;
    return next < count ? next : null;
  }

  /** The Song, the scope and every addressed identity still hold. */
  private revalidate(
    song: ArrangementSong,
    scope: string,
    track: ArrangementTrack,
    ref: ArrangementTrackRef,
    clips: readonly ArrangementClip[],
    views: readonly ArrangementClipView[],
  ): void {
    if (this.getSong() !== song) fail('IDENTITY');
    if (this.getScope() !== scope) fail('SCOPE');
    const current = song.tracks[ref.index];
    if (!current || current !== track) fail('IDENTITY');
    if (handleId(current) !== ref.id || current.name !== ref.name) fail('IDENTITY');
    const live = this.arrangementClips(current);
    if (live.length !== clips.length) fail('IDENTITY');
    for (const view of views) this.revalidateClip(live, clips, view);
  }

  /** One clip is still the very clip that was read. */
  private revalidateClip(live: readonly ArrangementClip[], clips: readonly ArrangementClip[], view: ArrangementClipView): void {
    const clip = live[view.index];
    if (!clip || clip !== clips[view.index]) fail('IDENTITY');
    if (handleId(clip) !== view.id || clip.name !== view.name) fail('IDENTITY');
    if (clip.startTime !== view.startTime || clip.endTime !== view.endTime) fail('IDENTITY');
  }
}
