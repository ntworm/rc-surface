// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingTakeNotes } from '../src/live/recording-take-notes.ts';

/** Every write the fake host would accept is recorded instead of performed. */
function hostClip(id, name, startTime = 0, endTime = 4, writes = []) {
  let currentName = name;
  let start = startTime;
  let end = endTime;
  return {
    get name() { return currentName; },
    set name(value) { writes.push('clip.name'); currentName = value; },
    get startTime() { return start; },
    set startTime(value) { writes.push('clip.startTime'); start = value; },
    get endTime() { return end; },
    set endTime(value) { writes.push('clip.endTime'); end = value; },
    handle: { id },
  };
}

function hostLane(id, name, clips = [], writes = []) {
  let currentName = name;
  return {
    get name() { return currentName; },
    set name(value) { writes.push('lane.name'); currentName = value; },
    handle: { id },
    clips,
    createMidiClip() { writes.push('lane.createMidiClip'); throw new Error('write'); },
  };
}

function hostTrack(takeLanes = [], options = {}, writes = []) {
  let currentName = options.name ?? 'Input';
  return {
    get name() { return currentName; },
    set name(value) { writes.push('track.name'); currentName = value; },
    handle: { id: options.id ?? 'track-1' },
    takeLanes,
    get arm() { return false; },
    set arm(value) { writes.push('track.arm'); },
    createTakeLane() { writes.push('track.createTakeLane'); throw new Error('write'); },
  };
}

const TRACK = { index: 0, id: 'track-1', name: 'Input' };
const request = (overrides = {}) => ({ scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0, ...overrides });

function service(song, scope = 'scope-1') {
  return new RecordingTakeNotes(() => song, () => scope);
}

test('the take lanes and clips of one track are listed in native order', () => {
  const writes = [];
  const laneA = hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'Take 1', 0, 4, writes)], writes);
  const laneB = hostLane('lane-2', 'Lane 2', [], writes);
  const song = { tracks: [hostTrack([laneA, laneB], {}, writes)] };
  const view = service(song).list(request());
  const clip = view.lanes[0].clips[0];
  assert.equal(typeof clip.reference, 'string');
  assert.ok(clip.reference.length > 0, 'every clip carries a nonempty reference');
  const { reference, ...rest } = clip;
  assert.deepEqual(rest, { index: 0, id: 'clip-1', name: 'Take 1', startTime: 0, endTime: 4, mark: null });
  assert.deepEqual({ ...view, lanes: view.lanes.map(lane => ({ ...lane, clips: lane.clips.map(item => ({ ...item, reference: '' })) })) }, {
    scope: 'scope-1',
    track: { index: 0, id: 'track-1', name: 'Input' },
    lanes: [
      { index: 0, id: 'lane-1', name: 'Lane 1', clips: [{ index: 0, id: 'clip-1', name: 'Take 1', startTime: 0, endTime: 4, mark: null, reference: '' }] },
      { index: 1, id: 'lane-2', name: 'Lane 2', clips: [] },
    ],
    page: { laneOffset: 0, clipOffset: 0, next: null },
  });
  assert.deepEqual(writes, [], 'listing writes nothing to the host');
});

test('a track without take lanes lists nothing at all', () => {
  const song = { tracks: [hostTrack([])] };
  const view = service(song).list(request());
  assert.deepEqual(view.lanes, []);
  assert.deepEqual(view.page, { laneOffset: 0, clipOffset: 0, next: null });
});

test('two clips with one name and different handles stay two clips', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [
    hostClip('clip-1', 'Take 1', 0, 4, writes),
    hostClip('clip-2', 'Take 1', 8, 12, writes),
  ], writes);
  const song = { tracks: [hostTrack([lane], {}, writes)] };
  const view = service(song).list(request());
  assert.equal(view.lanes.length, 1);
  assert.deepEqual(view.lanes[0].clips.map(clip => [clip.index, clip.id, clip.startTime]), [
    [0, 'clip-1', 0], [1, 'clip-2', 8],
  ]);
});

test('a handle that appears twice is an ambiguous identity, never a guess', () => {
  const writes = [];
  const ambiguousClip = hostLane('lane-1', 'Lane 1', [
    hostClip('clip-1', 'Take 1', 0, 4, writes),
    hostClip('clip-1', 'Take 2', 8, 12, writes),
  ], writes);
  const song = { tracks: [hostTrack([ambiguousClip], {}, writes)] };
  assert.throws(() => service(song).list(request()), /REC:IDENTITY/);
  const ambiguousLane = hostLane('lane-1', 'Lane 1', [], writes);
  const twinLane = hostLane('lane-1', 'Lane 2', [], writes);
  const twoLanes = { tracks: [hostTrack([ambiguousLane, twinLane], {}, writes)] };
  assert.throws(() => service(twoLanes).list(request()), /REC:IDENTITY/);
  const twinTrack = { tracks: [hostTrack([], {}, writes), hostTrack([], { id: 'track-1' }, writes)] };
  assert.throws(() => service(twinTrack).list(request()), /REC:IDENTITY/);
});

test('a track that was reordered, replaced or renamed is not the addressed track', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'Take 1', 0, 4, writes)], writes);
  const other = hostTrack([lane], { id: 'track-2', name: 'Other' }, writes);
  const song = { tracks: [other, hostTrack([], { id: 'track-3', name: 'Third' }, writes)] };
  assert.throws(() => service(song).list(request()), /REC:IDENTITY/, 'the addressed id is gone');
  const renamed = { tracks: [hostTrack([lane], { name: 'Renamed' }, writes)] };
  assert.throws(() => service(renamed).list(request()), /REC:IDENTITY/, 'the addressed name is gone');
  const replaced = { tracks: [hostTrack([], { id: 'track-9', name: 'Input' }, writes)] };
  assert.throws(() => service(replaced).list(request()), /REC:IDENTITY/, 'the addressed object is gone');
});

test('a Song that changes under the request is refused before anything is returned', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'Take 1', 0, 4, writes)], writes);
  const first = { tracks: [hostTrack([lane], {}, writes)] };
  const second = { tracks: [hostTrack([lane], {}, writes)] };
  let reads = 0;
  const swapping = new RecordingTakeNotes(() => (reads++ === 0 ? first : second), () => 'scope-1');
  assert.throws(() => swapping.list(request()), /REC:IDENTITY/);
});

test('a new Song or a new link generation retires the scope', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [], writes);
  const song = { tracks: [hostTrack([lane], {}, writes)] };
  assert.throws(() => service(song).list(request({ scope: 'scope-0' })), /REC:SCOPE/);
  let scopes = 0;
  const rotating = new RecordingTakeNotes(() => song, () => (scopes++ === 0 ? 'scope-1' : 'scope-2'));
  assert.throws(() => rotating.list(request()), /REC:SCOPE/);
});

test('a malformed request or a negative offset is refused', () => {
  const writes = [];
  const song = { tracks: [hostTrack([], {}, writes)] };
  const list = service(song);
  const bad = [
    request({ laneOffset: -1 }), request({ laneOffset: 1.5 }), request({ laneOffset: '0' }),
    request({ clipOffset: -1 }), request({ clipOffset: Number.MAX_SAFE_INTEGER + 2 }),
    request({ scope: 7 }), request({ scope: '' }),
    { scope: 'scope-1', track: { ...TRACK }, laneOffset: 0 },
    { ...request(), extra: true },
    request({ track: { index: 0, id: 'track-1', name: 'Input', extra: true } }),
    request({ track: { index: -1, id: 'track-1', name: 'Input' } }),
    request({ track: { index: 0, id: '', name: 'Input' } }),
    request({ track: { index: 0, id: 'track-1' } }),
    'not-a-request',
  ];
  for (const args of bad) assert.throws(() => list.list(args), /REC:ARGUMENTS/, JSON.stringify(args));
});

test('an offset that addresses nothing is refused, never clamped', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'Take 1', 0, 4, writes)], writes);
  const song = { tracks: [hostTrack([lane], {}, writes)] };
  const list = service(song);
  assert.throws(() => list.list(request({ laneOffset: 2 })), /REC:TAKE_RANGE/);
  assert.throws(() => list.list(request({ laneOffset: 1 })), /REC:TAKE_RANGE/);
  assert.throws(() => list.list(request({ clipOffset: 1 })), /REC:TAKE_RANGE/);
  assert.throws(() => list.list(request({ clipOffset: 5 })), /REC:TAKE_RANGE/);
});

test('a page holds at most 32 lanes and 64 clips', () => {
  const writes = [];
  const lanes = [];
  for (let index = 0; index < 40; index++) lanes.push(hostLane('lane-' + index, 'Lane ' + index, [], writes));
  const song = { tracks: [hostTrack(lanes, {}, writes)] };
  const view = service(song).list(request());
  assert.equal(view.lanes.length, 32);
  assert.deepEqual(view.page.next, { laneOffset: 32, clipOffset: 0 });
  const dense = hostLane('lane-1', 'Lane 1', Array.from({ length: 100 }, (_, index) => hostClip('clip-' + index, 'Take ' + index, index, index + 1, writes)), writes);
  const denseSong = { tracks: [hostTrack([dense], {}, writes)] };
  const denseView = service(denseSong).list(request());
  assert.equal(denseView.lanes.length, 1);
  assert.equal(denseView.lanes[0].clips.length, 64);
  assert.deepEqual(denseView.page.next, { laneOffset: 0, clipOffset: 64 });
});

test('a lane with more than 64 clips continues in the same lane', () => {
  const writes = [];
  const clips = Array.from({ length: 100 }, (_, index) => hostClip('clip-' + index, 'Take ' + index, index, index + 1, writes));
  const song = { tracks: [hostTrack([hostLane('lane-1', 'Lane 1', clips, writes)], {}, writes)] };
  const view = service(song).list(request());
  assert.deepEqual(view.page.next, { laneOffset: 0, clipOffset: 64 });
  const rest = service(song).list(request({ laneOffset: 0, clipOffset: 64 }));
  assert.equal(rest.lanes[0].clips.length, 36);
  assert.equal(rest.lanes[0].clips[0].index, 64);
  assert.deepEqual(rest.page.next, null);
});

test('exhaustive paging covers every lane and every clip exactly once', () => {
  const writes = [];
  const lanes = [
    hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'A', 0, 4, writes), hostClip('clip-2', 'B', 8, 12, writes)], writes),
    hostLane('lane-2', 'Lane 2', [], writes),
    hostLane('lane-3', 'Lane 3', Array.from({ length: 70 }, (_, index) => hostClip('clip-3-' + index, 'C' + index, index, index + 1, writes)), writes),
    hostLane('lane-4', 'Lane 4', [hostClip('clip-4', 'D', 0, 4, writes)], writes),
  ];
  const song = { tracks: [hostTrack(lanes, {}, writes)] };
  const notes = service(song);
  const seenLanes = [];
  const seenClips = [];
  let cursor = { laneOffset: 0, clipOffset: 0 };
  for (let page = 0; page < 20; page++) {
    const view = notes.list(request(cursor));
    for (const lane of view.lanes) {
      seenLanes.push(lane.index);
      for (const clip of lane.clips) seenClips.push(lane.index + ':' + clip.index);
    }
    if (!view.page.next) break;
    cursor = view.page.next;
  }
  assert.deepEqual([...new Set(seenLanes)].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.equal(new Set(seenClips).size, seenClips.length, 'no clip is listed twice');
  assert.equal(seenClips.length, 73);
  assert.ok(seenClips.includes('0:0') && seenClips.includes('2:69') && seenClips.includes('3:0'));
});

test('a mark comes from one exact leading prefix and from nothing else', () => {
  const writes = [];
  const names = ['[RC:GOOD] Take 1', '[RC:REVIEW] Take 2', '[rc:good] Take 3', 'Take [RC:GOOD] 4', '[RC:GOOD] ', '[RC:GOOD] [RC:REVIEW] 5'];
  const lane = hostLane('lane-1', 'Lane 1', names.map((name, index) => hostClip('clip-' + index, name, index, index + 1, writes)), writes);
  const song = { tracks: [hostTrack([lane], {}, writes)] };
  const view = service(song).list(request());
  assert.deepEqual(view.lanes[0].clips.map(clip => clip.mark), ['good', 'review', null, null, 'good', 'good']);
});

test('a name is plain data, whatever it looks like', () => {
  const writes = [];
  const hostile = '[RC:GOOD] <img src=x onerror="alert(1)"></script><script>alert(2)</script>';
  const lane = hostLane('lane-1', '<b>lane</b>', [hostClip('clip-1', hostile, 0, 4, writes)], writes);
  const song = { tracks: [hostTrack([lane], { name: '<i>track</i>' }, writes)] };
  const view = service(song).list(request({ track: { index: 0, id: 'track-1', name: '<i>track</i>' } }));
  assert.equal(view.lanes[0].name, '<b>lane</b>');
  assert.equal(view.lanes[0].clips[0].name, hostile);
  assert.equal(view.lanes[0].clips[0].mark, 'good');
  assert.deepEqual(JSON.parse(JSON.stringify(view)).lanes[0].clips[0].name, hostile);
});

test('the answer is plain JSON and carries no bigint handle', () => {
  const writes = [];
  const lane = hostLane(7n, 'Lane 1', [hostClip(11n, 'Take 1', 0, 4, writes)], writes);
  const song = { tracks: [hostTrack([lane], { id: 5n }, writes)] };
  const view = service(song).list(request({ track: { index: 0, id: '5', name: 'Input' } }));
  assert.equal(view.track.id, '5');
  assert.equal(view.lanes[0].id, '7');
  assert.equal(view.lanes[0].clips[0].id, '11');
  const json = JSON.stringify(view);
  assert.ok(json.includes('"id":"5"') && json.includes('"id":"11"'));
});

test('a clip with broken geometry or a non-string name is refused', () => {
  const writes = [];
  const broken = hostClip('clip-1', 'Take 1', 0, 4, writes);
  broken.startTime = Number.NaN;
  const song = { tracks: [hostTrack([hostLane('lane-1', 'Lane 1', [broken], writes)], {}, writes)] };
  assert.throws(() => service(song).list(request()), /REC:IDENTITY/);
  const backwards = hostClip('clip-2', 'Take 2', 8, 4, writes);
  const second = { tracks: [hostTrack([hostLane('lane-1', 'Lane 1', [backwards], writes)], {}, writes)] };
  assert.throws(() => service(second).list(request()), /REC:IDENTITY/);
  const negative = hostClip('clip-3', 'Take 3', -1, 4, writes);
  const third = { tracks: [hostTrack([hostLane('lane-1', 'Lane 1', [negative], writes)], {}, writes)] };
  assert.throws(() => service(third).list(request()), /REC:IDENTITY/);
});

test('listing never touches the host, even while the transport runs', () => {
  const writes = [];
  const lane = hostLane('lane-1', 'Lane 1', [hostClip('clip-1', 'Take 1', 0, 4, writes)], writes);
  const track = hostTrack([lane], {}, writes);
  const song = { tracks: [track] };
  const notes = service(song);
  notes.list(request());
  notes.list(request({ laneOffset: 0, clipOffset: 0 }));
  assert.deepEqual(writes, []);
});

test('the reference of one chain is stable and a replaced object earns a new one', () => {
  const writes = [];
  const clip = hostClip('clip-1', 'Take 1', 0, 4, writes);
  const lane = hostLane('lane-1', 'Lane 1', [clip], writes);
  const track = hostTrack([lane], {}, writes);
  const song = { tracks: [track] };
  const notes = service(song);
  const first = notes.list(request()).lanes[0].clips[0].reference;
  assert.equal(notes.list(request()).lanes[0].clips[0].reference, first, 'the same chain answers with the same reference');
  // A replaced clip that reuses the handle, the name and the span is a
  // different clip and must never inherit the reference of the old one.
  const replaced = hostClip('clip-1', 'Take 1', 0, 4, writes);
  lane.clips[0] = replaced;
  const second = notes.list(request()).lanes[0].clips[0].reference;
  assert.notEqual(second, first, 'a replaced clip earns a new reference');
  // The same objects under another scope are another chain as well.
  const other = service(song, 'scope-2').list(request({ scope: 'scope-2' })).lanes[0].clips[0].reference;
  assert.notEqual(other, second, 'another scope is another chain');
});
