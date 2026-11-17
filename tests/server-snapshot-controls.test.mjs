// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of the
// License at https://polyformproject.org/licenses/noncommercial/1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildControls,
  createControlCache,
  recordFrameControl,
  seedFromSnapshot,
} from '../src/server/snapshot-controls.ts';
import { CACHE_MAX_ENTRIES } from '../src/server/ws-bounds.ts';

test('a keyframe seeds the list and a frame updates the entry it names', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [
    { name: 'pad-1', value: 1, lost: false },
    { name: 'xy-1', x: 0.2, y: 0.9 },
  ]);
  assert.deepEqual(buildControls(cache), [
    { name: 'pad-1', value: 1, lost: false },
    { name: 'xy-1', x: 0.2, y: 0.9 },
  ]);

  recordFrameControl(cache, { name: 'pad-1', value: 0.5 });
  recordFrameControl(cache, { name: 'xy-1', x: 0.3, y: 0.4 });
  const built = buildControls(cache);
  assert.deepEqual(built[0], { name: 'pad-1', value: 0.5 }, 'a scalar control keeps its shape');
  assert.deepEqual(built[1], { name: 'xy-1', x: 0.3, y: 0.4 }, 'an XY control keeps its shape');
  assert.equal(built[1].value, undefined, 'a frame never turns an XY control into a scalar');
});

test('a keyframe replaces the list instead of merging into it', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [{ name: 'pad-1', value: 1 }]);
  seedFromSnapshot(cache, [{ name: 'pad-2', value: 1 }]);
  assert.deepEqual(buildControls(cache), [{ name: 'pad-2', value: 1 }]);
});

test('every build hands out a new array a reader cannot write into', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [{ name: 'pad-1', value: 1 }]);
  const first = buildControls(cache);
  const second = buildControls(cache);
  assert.notEqual(first, second, 'every build is a new array');

  first[0].value = 99;
  first.push({ name: 'pad-2', value: 1 });
  assert.deepEqual(buildControls(cache), [{ name: 'pad-1', value: 1 }],
    'a write into the built list cannot leak into the next build');
});

test('the list is bounded and the oldest entry is the one that goes', () => {
  const cache = createControlCache();
  for (let i = 0; i < CACHE_MAX_ENTRIES + 1; i += 1) {
    recordFrameControl(cache, { name: `fader-${i}`, value: 0.5 });
  }
  const built = buildControls(cache);
  assert.equal(built.length, CACHE_MAX_ENTRIES);
  assert.equal(built[0].name, 'fader-1', 'the oldest entry was evicted');
  assert.equal(built.at(-1).name, `fader-${CACHE_MAX_ENTRIES}`);
});

test('a malformed control never enters the list', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [null, { value: 1 }, { name: 'pad-1', value: 1 }]);
  recordFrameControl(cache, undefined);
  recordFrameControl(cache, { name: '', value: 1 });
  assert.deepEqual(buildControls(cache), [{ name: 'pad-1', value: 1 }]);
});

test('every client gets a list of its own', () => {
  const first = createControlCache();
  const second = createControlCache();
  seedFromSnapshot(first, [{ name: 'pad-1', value: 1 }]);
  assert.deepEqual(buildControls(second), [], 'a fresh list knows nothing of the other client');
  assert.equal(buildControls(first).length, 1);
});
