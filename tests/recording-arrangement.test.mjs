// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingArrangement, ARRANGEMENT_PAGE_MAX_CLIPS } from '../src/live/recording-arrangement.ts';

const clip = (id, name, startTime = 0, endTime = 4) => ({ name, startTime, endTime, handle: { id } });
const hostTrack = (id, name, arrangementClips) => ({
  name, handle: { id }, ...(arrangementClips === undefined ? {} : { arrangementClips }),
});
const TRACK = { index: 0, id: 'track-1', name: 'Input' };
const request = (overrides = {}) => ({ scope: 'scope-1', track: { ...TRACK }, offset: 0, ...overrides });
const service = (song, scope = 'scope-1') => new RecordingArrangement(() => song, () => scope);

test('the Arrangement clips of one track are listed in native order', () => {
  const song = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'Intro'), clip('c2', 'Verse', 8, 12)])] };
  const view = service(song).list(request());
  assert.deepEqual(view, {
    scope: 'scope-1',
    track: { index: 0, id: 'track-1', name: 'Input' },
    clips: [
      { index: 0, id: 'c1', name: 'Intro', startTime: 0, endTime: 4 },
      { index: 1, id: 'c2', name: 'Verse', startTime: 8, endTime: 12 },
    ],
    page: { offset: 0, next: null },
  });
});

test('one page holds at most 64 clips and names the next one', () => {
  const many = Array.from({ length: 130 }, (_, at) => clip('c' + at, 'Clip ' + at, at, at + 1));
  const song = { tracks: [hostTrack('track-1', 'Input', many)] };
  const first = service(song).list(request());
  assert.equal(first.clips.length, ARRANGEMENT_PAGE_MAX_CLIPS);
  assert.deepEqual(first.page, { offset: 0, next: 64 });
  const second = service(song).list(request({ offset: 64 }));
  assert.equal(second.clips.length, 64);
  assert.deepEqual(second.page, { offset: 64, next: 128 });
  const last = service(song).list(request({ offset: 128 }));
  assert.equal(last.clips.length, 2);
  assert.deepEqual(last.page, { offset: 128, next: null });
  assert.equal(last.clips[0].index, 128, 'a clip keeps its own index in the track');
});

test('an old fixture without Arrangement clips lists nothing at all', () => {
  const view = service({ tracks: [hostTrack('track-1', 'Input')] }).list(request());
  assert.deepEqual(view.clips, []);
  assert.deepEqual(view.page, { offset: 0, next: null });
});

test('a stale scope, an unknown track and a wrong request are refused', () => {
  const song = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'Intro')])] };
  assert.throws(() => service(song, 'scope-2').list(request()), /REC:SCOPE/);
  assert.throws(() => service(song).list(request({ scope: 'scope-2' })), /REC:SCOPE/);
  assert.throws(() => service(song).list(request({ offset: 1 })), /REC:ARGUMENTS/);
  assert.throws(() => service(song).list(request({ offset: -1 })), /REC:ARGUMENTS/);
  assert.throws(() => service(song).list(request({ offset: '0' })), /REC:ARGUMENTS/);
  assert.throws(() => service(song).list({ ...request(), extra: true }), /REC:ARGUMENTS/);
  assert.throws(() => service(song).list({ scope: 'scope-1', track: TRACK }), /REC:ARGUMENTS/);
});

test('a track that was reordered, replaced or renamed is not the addressed track', () => {
  const song = { tracks: [hostTrack('track-2', 'Other', []), hostTrack('track-1', 'Input', [clip('c1', 'Intro')])] };
  assert.throws(() => service(song).list(request()), /REC:IDENTITY/);
  const renamed = { tracks: [hostTrack('track-1', 'Renamed', [clip('c1', 'Intro')])] };
  assert.throws(() => service(renamed).list(request()), /REC:IDENTITY/);
  const twin = { tracks: [hostTrack('track-1', 'Input', []), hostTrack('track-1', 'Input', [])] };
  assert.throws(() => service(twin).list(request()), /REC:IDENTITY/);
});

test('an ambiguous clip or an impossible span is never listed', () => {
  const twice = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'A'), clip('c1', 'B')])] };
  assert.throws(() => service(twice).list(request()), /REC:IDENTITY/);
  const empty = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'A', 4, 4)])] };
  assert.throws(() => service(empty).list(request()), /REC:IDENTITY/);
  const backwards = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'A', 8, 4)])] };
  assert.throws(() => service(backwards).list(request()), /REC:IDENTITY/);
  const negative = { tracks: [hostTrack('track-1', 'Input', [clip('c1', 'A', -1, 4)])] };
  assert.throws(() => service(negative).list(request()), /REC:IDENTITY/);
});

test('a track with more clips than the limit fails instead of lying', () => {
  const many = Array.from({ length: 4097 }, (_, at) => clip('c' + at, 'Clip ' + at, at, at + 1));
  const song = { tracks: [hostTrack('track-1', 'Input', many)] };
  assert.throws(() => service(song).list(request()), /REC:LIMIT/);
});

test('listing reads the host and writes nothing to it', () => {
  const writes = [];
  const watched = { name: 'Input', handle: { id: 'track-1' }, arrangementClips: [clip('c1', 'Intro')] };
  Object.defineProperty(watched, 'name', { get: () => 'Input', set: value => writes.push(value), configurable: true });
  const view = service({ tracks: [watched] }).list(request());
  assert.equal(view.clips.length, 1);
  assert.deepEqual(writes, []);
});
