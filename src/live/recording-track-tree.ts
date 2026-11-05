// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The group hierarchy Live already has.
//
// Live's group track is a parent, not a label: a track knows its own parent
// and nothing knows its children, so the tree is inverted here, once, from
// the tracks of the current Song.
//
// Identity is the only link. A parent is the in-song object - or the unique
// handle of one - that a track names. A name, a position or an arm flag
// never establishes a relationship: a track that cannot be armed is not
// thereby a group.
//
// A missing or duplicated handle, a parent that is not in this Song and a
// parent chain that never ends all leave the whole tree unknown, because
// half a hierarchy would arm the wrong tracks. Nothing here writes, and
// nothing here reads a transport.
export interface TrackTreeHandle { readonly id: string | number | bigint }

export interface TrackTreeTrack {
  readonly name: string;
  readonly handle: TrackTreeHandle;
  readonly groupTrack?: TrackTreeTrack | null;
}

export interface TrackTreeSong { readonly tracks: readonly TrackTreeTrack[] }

/** Why the hierarchy of a Song cannot be trusted. */
export type TrackTreeIssue = 'MISSING_HANDLE' | 'DUPLICATE_HANDLE' | 'FOREIGN_PARENT' | 'CYCLE';

export interface TrackTreeEntry {
  readonly index: number;
  readonly id: string;
  /** The handle of the parent group, or null when the track has no parent. */
  readonly groupId: string | null;
  /** True when other tracks name this track as their parent. */
  readonly isGroup: boolean;
}

export interface TrackTree {
  readonly valid: boolean;
  readonly issue: TrackTreeIssue | null;
  readonly tracks: readonly TrackTreeEntry[];
  /** The direct children of every group, in track order. */
  readonly children: ReadonlyMap<string, readonly string[]>;
}

/** The deepest parent chain and the widest closure one tree may describe. */
const TREE_LIMIT = 256;

interface TrackIds {
  ids: string[];
  byId: Map<string, number>;
  issue: TrackTreeIssue | null;
}

interface TrackParents {
  indexes: Map<number, number>;
  issue: TrackTreeIssue | null;
}

function handleId(track: TrackTreeTrack | null | undefined): string | null {
  const raw = track?.handle?.id;
  if (typeof raw === 'string') return raw.length > 0 ? raw : null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;
  if (typeof raw === 'bigint') return String(raw);
  return null;
}

/** An unknown tree reports no hierarchy at all. */
function unknownTree(issue: TrackTreeIssue): TrackTree {
  return { valid: false, issue, tracks: [], children: new Map() };
}

/** Every track of a Song needs one usable handle, and no two may share it. */
function trackIds(tracks: readonly TrackTreeTrack[]): TrackIds {
  const ids: string[] = [];
  const byId = new Map<string, number>();
  for (let at = 0; at < tracks.length; at++) {
    const id = handleId(tracks[at]);
    if (id === null) return { ids, byId, issue: 'MISSING_HANDLE' };
    if (byId.has(id)) return { ids, byId, issue: 'DUPLICATE_HANDLE' };
    byId.set(id, ids.length);
    ids.push(id);
  }
  return { ids, byId, issue: null };
}

/**
 * The parent of every track, by identity.
 *
 * The parent is the in-song object a track names, or the one track of this
 * Song that carries its handle. A parent that is neither belongs to another
 * Set and leaves the tree unknown.
 */
function trackParents(tracks: readonly TrackTreeTrack[], byId: Map<string, number>): TrackParents {
  const objects = new Map<object, number>();
  for (let at = 0; at < tracks.length; at++) objects.set(tracks[at]!, at);
  const indexes = new Map<number, number>();
  for (let at = 0; at < tracks.length; at++) {
    const parent = tracks[at]!.groupTrack;
    if (parent === undefined || parent === null) continue;
    let resolved = objects.get(parent);
    if (resolved === undefined) {
      const id = handleId(parent);
      if (id === null) return { indexes, issue: 'MISSING_HANDLE' };
      resolved = byId.get(id);
      if (resolved === undefined) return { indexes, issue: 'FOREIGN_PARENT' };
    }
    indexes.set(at, resolved);
  }
  return { indexes, issue: null };
}

/** A parent chain that never reaches a root is a cycle, however long it is. */
function hasCycle(parents: ReadonlyMap<number, number>, count: number): boolean {
  for (let at = 0; at < count; at++) {
    const path = new Set<number>();
    let current: number | undefined = at;
    for (let step = 0; step < TREE_LIMIT && current !== undefined; step++) {
      if (path.has(current)) return true;
      path.add(current);
      current = parents.get(current);
    }
    if (current !== undefined) return true;
  }
  return false;
}

/** The direct children of every group, and the groups themselves. */
function childMap(ids: readonly string[], parents: ReadonlyMap<number, number>): { children: Map<string, string[]>; groups: Set<string> } {
  const children = new Map<string, string[]>();
  const groups = new Set<string>();
  for (const [child, parent] of parents) {
    const parentId = ids[parent]!;
    groups.add(parentId);
    const list = children.get(parentId) ?? [];
    list.push(ids[child]!);
    children.set(parentId, list);
  }
  return { children, groups };
}

/** One entry per track: its parent group, and whether it is a group itself. */
function treeEntries(ids: readonly string[], parents: ReadonlyMap<number, number>, groups: ReadonlySet<string>): TrackTreeEntry[] {
  return ids.map((id, at) => ({
    index: at,
    id,
    groupId: parents.has(at) ? ids[parents.get(at)!]! : null,
    isGroup: groups.has(id),
  }));
}

/**
 * The hierarchy of one Song, read from the tracks themselves.
 *
 * A track without a usable handle, two tracks with one handle, a parent
 * that is not in this Song and a parent chain that never ends all leave the
 * tree unknown instead of half known.
 */
export function readTrackTree(song: TrackTreeSong): TrackTree {
  const tracks = song?.tracks ?? [];
  const { ids, byId, issue } = trackIds(tracks);
  if (issue) return unknownTree(issue);
  const parents = trackParents(tracks, byId);
  if (parents.issue) return unknownTree(parents.issue);
  if (hasCycle(parents.indexes, tracks.length)) return unknownTree('CYCLE');
  const { children, groups } = childMap(ids, parents.indexes);
  return { valid: true, issue: null, tracks: treeEntries(ids, parents.indexes, groups), children };
}

/**
 * Every track below one group, nested groups included.
 *
 * The closure is transitive, so a group inside a group is reached too, and it
 * is bounded: a visited set and a step cap keep a malformed tree from
 * running forever. The order is the tree's own order.
 */
export function trackDescendants(tree: TrackTree, groupId: string): string[] {
  const out: string[] = [];
  const visited = new Set<string>([groupId]);
  let frontier: string[] = [groupId];
  for (let step = 0; step < TREE_LIMIT && frontier.length > 0; step++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of tree.children.get(id) ?? []) {
        if (visited.has(child) || out.length >= TREE_LIMIT) continue;
        visited.add(child);
        out.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return out;
}
