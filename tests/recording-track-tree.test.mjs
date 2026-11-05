// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readTrackTree, trackDescendants } from '../src/live/recording-track-tree.ts';

/** One track as Live reports it: a name, a handle and an optional parent. */
const track = (id, name, groupTrack) => ({ name, handle: { id }, ...(groupTrack === undefined ? {} : { groupTrack }) });

test('the hierarchy is inverted from the parent every track names', () => {
  const group = track('g1', 'Group');
  const inner = track('g2', 'Inner', group);
  const leaf = track('t1', 'Leaf', inner);
  const loose = track('t2', 'Loose');
  const tree = readTrackTree({ tracks: [group, inner, leaf, loose] });
  assert.equal(tree.valid, true);
  assert.equal(tree.issue, null);
  assert.deepEqual(tree.tracks.map(entry => [entry.index, entry.id, entry.groupId, entry.isGroup]), [
    [0, 'g1', null, true],
    [1, 'g2', 'g1', true],
    [2, 't1', 'g2', false],
    [3, 't2', null, false],
  ]);
});

test('the descendants of a group are transitive and keep the tree order', () => {
  const group = track('g1', 'Group');
  const inner = track('g2', 'Inner', group);
  const leaf = track('t1', 'Leaf', inner);
  const tree = readTrackTree({ tracks: [group, inner, leaf, track('t2', 'Loose')] });
  assert.deepEqual(trackDescendants(tree, 'g1'), ['g2', 't1']);
  assert.deepEqual(trackDescendants(tree, 'g2'), ['t1']);
  assert.deepEqual(trackDescendants(tree, 't2'), []);
});

test('only a referenced parent is a group, never an arm flag or a name', () => {
  const tree = readTrackTree({ tracks: [track('t1', 'Input'), track('t2', 'Input')] });
  assert.deepEqual(tree.tracks.map(entry => [entry.groupId, entry.isGroup]), [[null, false], [null, false]]);
});

test('an old fixture without a group field is an ungrouped track', () => {
  const song = { tracks: [{ name: 'Guitar', handle: { id: '11' } }, { name: 'Bass', handle: { id: '22' } }] };
  const tree = readTrackTree(song);
  assert.equal(tree.valid, true);
  assert.deepEqual(tree.tracks.map(entry => [entry.groupId, entry.isGroup]), [[null, false], [null, false]]);
});

test('a missing or duplicated handle leaves the whole tree unknown', () => {
  assert.equal(readTrackTree({ tracks: [{ name: 'No handle' }] }).issue, 'MISSING_HANDLE');
  assert.equal(readTrackTree({ tracks: [track('a', 'A'), track('a', 'B')] }).issue, 'DUPLICATE_HANDLE');
  const unknown = readTrackTree({ tracks: [track('a', 'A', track('x', 'Foreign'))] });
  assert.equal(unknown.issue, 'FOREIGN_PARENT');
  assert.equal(unknown.valid, false);
  assert.deepEqual(unknown.tracks, [], 'an unknown tree reports no hierarchy at all');
});

test('a parent chain that never ends is a cycle', () => {
  const a = track('a', 'A');
  const b = track('b', 'B', a);
  const c = track('c', 'C', b);
  a.groupTrack = c;
  assert.equal(readTrackTree({ tracks: [a, b, c] }).issue, 'CYCLE');
  const self = track('s', 'Self');
  self.groupTrack = self;
  assert.equal(readTrackTree({ tracks: [self] }).issue, 'CYCLE');
});

test('the tree never changes the Song it read', () => {
  const group = track('g1', 'Group');
  const song = { tracks: [group, track('t1', 'Leaf', group)] };
  const before = JSON.stringify(song);
  const tree = readTrackTree(song);
  trackDescendants(tree, 'g1');
  assert.equal(JSON.stringify(song), before);
});
