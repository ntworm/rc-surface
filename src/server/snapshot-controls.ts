// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of the
// License at https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * snapshot-controls.ts — the control list a realtime client no longer repeats.
 *
 * A phone that negotiated the realtime control stream sends its controls in
 * frames, so the visual snapshot carries the whole list only as a keyframe.
 * The host keeps the list instead: a keyframe seeds it and every control of a
 * frame updates one entry. That is what the panel and the admin show.
 */

import { CACHE_MAX_ENTRIES } from "./ws-bounds.js";

/** One control as it travels on the wire: a scalar, an XY pair, or a loss. */
export interface SnapshotControl {
  name: string;
  value?: number;
  x?: number;
  y?: number;
  lost?: boolean;
  [field: string]: unknown;
}

/** The control list of one client: control name to the whole control. */
export type ControlCache = Map<string, SnapshotControl>;

/** A fresh, empty control list. One per client, and it dies with it. */
export function createControlCache(): ControlCache {
  return new Map<string, SnapshotControl>();
}

function isControl(value: unknown): value is SnapshotControl {
  if (!value || typeof value !== "object") return false;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.length > 0;
}

function copyControl(control: SnapshotControl): SnapshotControl {
  return { ...control };
}

/** Drop the oldest entries until the list fits the cache bound. */
function evictOldest(cache: ControlCache): void {
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    cache.delete(oldest.value);
  }
}

/**
 * Replace the list with the controls of a keyframe.
 *
 * A keyframe is the whole truth about the client's controls, so what came
 * before it is dropped rather than merged into it.
 */
export function seedFromSnapshot(cache: ControlCache, controls: unknown[]): void {
  cache.clear();
  for (const control of controls) {
    if (!isControl(control)) continue;
    cache.set(control.name, copyControl(control));
  }
  evictOldest(cache);
}

/** Update one control of the list from a control frame. */
export function recordFrameControl(cache: ControlCache, control: unknown): void {
  if (!isControl(control)) return;
  cache.set(control.name, copyControl(control));
  evictOldest(cache);
}

/**
 * The control list as the panel and the admin see it.
 *
 * A new array every time, holding copies of the controls: a view that writes
 * into the list it was handed cannot change what the next reader sees.
 */
export function buildControls(cache: ControlCache): SnapshotControl[] {
  const controls: SnapshotControl[] = [];
  for (const control of cache.values()) controls.push(copyControl(control));
  return controls;
}
