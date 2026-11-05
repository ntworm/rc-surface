// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingCue } from '../src/live/recording-cue.ts';

function mockParam(id, name, min, max, value, writes = [], opts = {}) {
  return {
    handle: id !== null ? { id } : undefined,
    name,
    min,
    max,
    async getValue() {
      writes.push('param.getValue:' + id);
      if (opts.fail) throw new Error('getValue failed');
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      return typeof value === 'function' ? value() : value;
    },
    async setValue(val) {
      writes.push('param.setValue:' + id + ':' + val);
    },
  };
}

function mockTrack(id, name, sends = [], writes = []) {
  return {
    handle: { id },
    name,
    mixer: {
      sends,
      volume: {
        min: 0, max: 1,
        async getValue() { writes.push('volume.getValue'); return 0.5; },
        async setValue(val) { writes.push('volume.setValue:' + val); },
      },
      panning: {
        min: -1, max: 1,
        async getValue() { writes.push('panning.getValue'); return 0; },
        async setValue(val) { writes.push('panning.setValue:' + val); },
      },
    },
  };
}

function mockReturn(id, name, writes = []) {
  return {
    handle: { id },
    name,
    mixer: {
      volume: { async setValue(v) { writes.push('returnVolume:' + v); } },
    },
  };
}

function service(song, scope = 'scope-token') {
  return new RecordingCue(() => song, () => scope);
}

/** A send parameter whose read stays pending until the test releases it, so
 * a topology change can be made while the read is still in flight. */
function deferredParam(id, name, min, max, writes) {
  let entered;
  let release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const param = {
    handle: { id },
    name,
    min,
    max,
    async getValue() {
      writes.push('param.getValue:' + id);
      entered();
      await gate;
      return 0.5;
    },
    async setValue(val) { writes.push('param.setValue:' + id + ':' + val); },
  };
  return { param, entered: enteredPromise, release: () => release() };
}

/** A fresh fixture for every deferred read case: two Returns, a full page of
 * sixteen tracks with one pending send, and one track beyond that page. */
function deferredFixture() {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes), mockReturn('r-1', 'Delay', writes)];
  const send = deferredParam('p-0', 'Rev', 0, 1, writes);
  const other = mockParam('p-1', 'Rev 2', 0, 1, 0.5, writes);
  const pageTrack = mockTrack('t-0', 'Page Track', [send.param, other], writes);
  const filler = Array.from({ length: 15 }, (_, i) => mockTrack('t-' + (i + 1), 'Filler ' + (i + 1), [other], writes));
  const offTrack = mockTrack('t-16', 'Off Track', [other], writes);
  const song = { tracks: [pageTrack, ...filler, offTrack], returnTracks: returns };
  return {
    writes,
    song,
    returns,
    pageTrack,
    offTrack,
    offIndex: 16,
    other,
    sendParam: send.param,
    scope: 'scope-token',
    selected: { index: 0, id: 'r-0', name: 'Reverb' },
    entered: send.entered,
    release: send.release,
  };
}

test('null Return track returns metadata only, tracks[] and no getValue calls', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes), mockReturn('r-1', 'Delay', writes)];
  const p0 = mockParam('p-0', 'Reverb', 0, 1, 0.5, writes);
  const p1 = mockParam('p-1', 'Delay', 0, 1, 0.8, writes);
  const tracks = [mockTrack('t-0', 'Audio 1', [p0, p1], writes)];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const res = await cue.getState({ scope: 'scope-token', returnTrack: null, offset: 0 });
  assert.equal(res.scope, 'scope-token');
  assert.deepEqual(res.returns, [
    { index: 0, id: 'r-0', name: 'Reverb' },
    { index: 1, id: 'r-1', name: 'Delay' },
  ]);
  assert.equal(res.returnTrack, null);
  assert.deepEqual(res.tracks, []);
  assert.equal(res.nextOffset, null);
  assert.equal(res.writeEnabled, false);
  assert.deepEqual(writes, [], 'no getValue or write calls are made when returnTrack is null');
});

test('selected Return reads only chosen send and computes candidate status and normalized value', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes), mockReturn('r-1', 'Delay', writes)];
  const p0A = mockParam('p-0a', 'Send A', 0, 1, 0.25, writes);
  const p0B = mockParam('p-0b', 'Send B', -10, 10, 0, writes);
  const p1A = mockParam('p-1a', 'Send A', 0, 1, 0.5, writes);
  const p1B = mockParam('p-1b', 'Send B', 0, 100, 75, writes);
  const tracks = [
    mockTrack('t-0', 'Vocals', [p0A, p0B], writes),
    mockTrack('t-1', 'Guitar', [p1A, p1B], writes),
  ];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const selected = { index: 1, id: 'r-1', name: 'Delay' };
  const res = await cue.getState({ scope: 'scope-token', returnTrack: selected, offset: 0 });
  assert.equal(res.scope, 'scope-token');
  assert.deepEqual(res.returnTrack, selected);
  assert.equal(res.tracks.length, 2);
  assert.deepEqual(res.tracks[0], {
    track: { index: 0, id: 't-0', name: 'Vocals' },
    sendIndex: 1,
    parameterId: 'p-0b',
    parameterName: 'Send B',
    min: -10,
    max: 10,
    value: 0,
    normalized: 0.5,
    status: 'candidate',
  });
  assert.deepEqual(res.tracks[1], {
    track: { index: 1, id: 't-1', name: 'Guitar' },
    sendIndex: 1,
    parameterId: 'p-1b',
    parameterName: 'Send B',
    min: 0,
    max: 100,
    value: 75,
    normalized: 0.75,
    status: 'candidate',
  });
  assert.deepEqual(writes, ['param.getValue:p-0b', 'param.getValue:p-1b'], 'only selected send was read');
});

test('unavailable status on send count mismatch, missing send, unusable handle, and duplicate handles', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes), mockReturn('r-1', 'Delay', writes)];
  const pValid = mockParam('p-0', 'Reverb', 0, 1, 0.5, writes);
  const pNoHandle = mockParam(null, 'Delay', 0, 1, 0.5, writes);
  const pDupe = mockParam('dup-id', 'Send', 0, 1, 0.5, writes);
  const tracks = [
    mockTrack('t-0', 'Mismatch Track', [pValid], writes),
    mockTrack('t-1', 'Missing Send', [], writes),
    mockTrack('t-2', 'No Handle', [pValid, pNoHandle], writes),
    mockTrack('t-3', 'Dupe Handle', [pDupe, pDupe], writes),
  ];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const res = await cue.getState({ scope: 'scope-token', returnTrack: { index: 1, id: 'r-1', name: 'Delay' }, offset: 0 });
  assert.equal(res.tracks.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.equal(res.tracks[i].status, 'unavailable', 'track ' + i + ' should be unavailable');
    assert.equal(res.tracks[i].value, null);
    assert.equal(res.tracks[i].normalized, null);
  }
});

test('invalid ranges and out-of-range values mark row unavailable', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes)];
  const pInverted = mockParam('p-inv', 'Rev', 10, 0, 5, writes);
  const pNaN = mockParam('p-nan', 'Rev', 0, Number.NaN, 5, writes);
  const pTooHigh = mockParam('p-hi', 'Rev', 0, 1, 1.5, writes);
  const pTooLow = mockParam('p-lo', 'Rev', 0, 1, -0.2, writes);
  const tracks = [
    mockTrack('t-0', 'Inv', [pInverted], writes),
    mockTrack('t-1', 'NaN', [pNaN], writes),
    mockTrack('t-2', 'High', [pTooHigh], writes),
    mockTrack('t-3', 'Low', [pTooLow], writes),
  ];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const res = await cue.getState({ scope: 'scope-token', returnTrack: { index: 0, id: 'r-0', name: 'Reverb' }, offset: 0 });
  for (let i = 0; i < 4; i++) {
    assert.equal(res.tracks[i].status, 'unavailable', 'track ' + i + ' should be unavailable');
    assert.equal(res.tracks[i].value, null);
    assert.equal(res.tracks[i].normalized, null);
  }
});

test('errors and timeouts in getValue result in unavailable status without throwing', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes)];
  const pFailing = mockParam('p-err', 'Rev', 0, 1, 0.5, writes, { fail: true });
  const pTimeout = mockParam('p-timeout', 'Rev', 0, 1, 0.5, writes, { delayMs: 2500 });
  const tracks = [mockTrack('t-0', 'Fail', [pFailing], writes), mockTrack('t-1', 'Timeout', [pTimeout], writes)];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const res = await cue.getState({ scope: 'scope-token', returnTrack: { index: 0, id: 'r-0', name: 'Reverb' }, offset: 0 });
  assert.equal(res.tracks.length, 2);
  assert.equal(res.tracks[0].status, 'unavailable');
  assert.equal(res.tracks[0].value, null);
  assert.equal(res.tracks[1].status, 'unavailable');
  assert.equal(res.tracks[1].value, null);
});

test('duplicate return track names with distinct IDs are safe and distinguishable', async () => {
  const writes = [];
  const returns = [mockReturn('r-0', 'Reverb', writes), mockReturn('r-1', 'Reverb', writes)];
  const p0 = mockParam('p-0', 'Rev 1', 0, 1, 0.3, writes);
  const p1 = mockParam('p-1', 'Rev 2', 0, 1, 0.7, writes);
  const tracks = [mockTrack('t-0', 'Track', [p0, p1], writes)];
  const song = { tracks, returnTracks: returns };
  const cue = service(song);

  const res = await cue.getState({ scope: 'scope-token', returnTrack: { index: 1, id: 'r-1', name: 'Reverb' }, offset: 0 });
  assert.equal(res.returns.length, 2);
  assert.deepEqual(res.returnTrack, { index: 1, id: 'r-1', name: 'Reverb' });
  assert.equal(res.tracks[0].parameterId, 'p-1');
  assert.equal(res.tracks[0].value, 0.7);
  assert.equal(res.tracks[0].status, 'candidate');
});

test('Return inventory exceeding 64 fails with explicit CUE_LIMIT', async () => {
  const returns65 = Array.from({ length: 65 }, (_, i) => mockReturn('r-' + i, 'Ret ' + i));
  const cue65 = service({ tracks: [], returnTracks: returns65 });
  await assert.rejects(() => cue65.getState({ scope: 'scope-token', returnTrack: null, offset: 0 }), /REC:CUE_LIMIT/);

  const returns64 = Array.from({ length: 64 }, (_, i) => mockReturn('r-' + i, 'Ret ' + i));
  const cue64 = service({ tracks: [], returnTracks: returns64 });
  const res = await cue64.getState({ scope: 'scope-token', returnTrack: null, offset: 0 });
  assert.equal(res.returns.length, 64);
});

test('paging covers tracks 16 at a time and exhaustive paging covers all tracks exactly once', async () => {
  const returns = [mockReturn('r-0', 'Reverb')];
  const tracks = Array.from({ length: 35 }, (_, i) => {
    const p = mockParam('p-' + i, 'Send ' + i, 0, 100, i);
    return mockTrack('t-' + i, 'Track ' + i, [p]);
  });
  const song = { tracks, returnTracks: returns };
  const cue = service(song);
  const sel = { index: 0, id: 'r-0', name: 'Reverb' };

  const seen = [];
  let nextOffset = 0;
  for (let page = 0; page < 10; page++) {
    const res = await cue.getState({ scope: 'scope-token', returnTrack: sel, offset: nextOffset });
    for (const r of res.tracks) seen.push(r.track.index);
    if (res.nextOffset === null) break;
    nextOffset = res.nextOffset;
  }
  assert.equal(seen.length, 35);
  assert.deepEqual(seen, Array.from({ length: 35 }, (_, i) => i));
});

test('empty tracks allows offset 0 and rejects out of range offset', async () => {
  const cueEmpty = service({ tracks: [], returnTracks: [mockReturn('r-0', 'Rev')] });
  const emptyRes = await cueEmpty.getState({ scope: 'scope-token', returnTrack: null, offset: 0 });
  assert.deepEqual(emptyRes.tracks, []);
  assert.equal(emptyRes.nextOffset, null);
  await assert.rejects(() => cueEmpty.getState({ scope: 'scope-token', returnTrack: null, offset: 1 }), /REC:ARGUMENTS/);

  const cue5 = service({
    tracks: Array.from({ length: 5 }, (_, i) => mockTrack('t-' + i, 'T' + i)),
    returnTracks: [mockReturn('r-0', 'Rev')],
  });
  await assert.rejects(() => cue5.getState({ scope: 'scope-token', returnTrack: null, offset: 5 }), /REC:ARGUMENTS/);
  await assert.rejects(() => cue5.getState({ scope: 'scope-token', returnTrack: null, offset: -1 }), /REC:ARGUMENTS/);
});

test('malformed schema, scope, returnTrack, and offset are rejected', async () => {
  const song = { tracks: [mockTrack('t-0', 'T')], returnTracks: [mockReturn('r-0', 'R')] };
  const cue = service(song);
  const base = { scope: 'scope-token', returnTrack: null, offset: 0 };

  await assert.rejects(() => cue.getState({ ...base, extra: true }), /REC:ARGUMENTS/);
  await assert.rejects(() => cue.getState({ scope: 'wrong', returnTrack: null, offset: 0 }), /REC:SCOPE/);
  await assert.rejects(() => cue.getState({ ...base, offset: '0' }), /REC:ARGUMENTS/);
  await assert.rejects(() => cue.getState({ ...base, offset: 1.5 }), /REC:ARGUMENTS/);
  await assert.rejects(() => cue.getState({ ...base, returnTrack: { index: 0, id: '' } }), /REC:ARGUMENTS/);
  await assert.rejects(() => cue.getState({ ...base, returnTrack: { index: 5, id: 'r-5', name: 'R5' } }), /REC:IDENTITY/);
  await assert.rejects(() => cue.getState({ ...base, returnTrack: { index: 0, id: 'wrong-id', name: 'R' } }), /REC:IDENTITY/);
});

const deferredCases = [
  {
    name: 'the scope changes during the pending read',
    expected: /REC:SCOPE/,
    mutate: fx => { fx.scope = 'scope-changed'; },
  },
  {
    name: 'the selected Return is renamed',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.returns[0].name = 'Renamed'; },
  },
  {
    name: 'the selected Return object is replaced',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.returns[0] = mockReturn('r-0', 'Reverb', fx.writes); },
  },
  {
    name: 'the selected Return handle changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.returns[0].handle.id = 'r-other'; },
  },
  {
    name: 'the Return order changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.returns.reverse(); },
  },
  {
    name: 'the page track object is replaced',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.song.tracks[0] = mockTrack('t-0', 'Page Track', [fx.sendParam, fx.other], fx.writes); },
  },
  {
    name: 'the page track is renamed',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.pageTrack.name = 'Renamed Page'; },
  },
  {
    name: 'an off-page track is inserted',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.song.tracks.splice(fx.offIndex, 0, mockTrack('t-99', 'Inserted', [], fx.writes)); },
  },
  {
    name: 'an off-page track is removed',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.song.tracks.pop(); },
  },
  {
    name: 'an off-page track is renamed',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.offTrack.name = 'Renamed Off'; },
  },
  {
    name: 'an off-page track object is replaced',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.song.tracks[fx.offIndex] = mockTrack('t-16', 'Off Track', [fx.other], fx.writes); },
  },
  {
    name: 'the track order changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.song.tracks.reverse(); },
  },
  {
    name: 'the selected send object is replaced',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.pageTrack.mixer.sends[0] = mockParam('p-0', 'Rev', 0, 1, 0.5, fx.writes); },
  },
  {
    name: 'the selected send name changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.sendParam.name = 'Renamed Send'; },
  },
  {
    name: 'the selected send handle changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.sendParam.handle.id = 'p-other'; },
  },
  {
    name: 'the selected send range changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.sendParam.max = 2; },
  },
  {
    name: 'the selected send count changes',
    expected: /REC:IDENTITY/,
    mutate: fx => { fx.pageTrack.mixer.sends.push(mockParam('p-9', 'Extra', 0, 1, 0.5, fx.writes)); },
  },
];

for (const testCase of deferredCases) {
  test('a pending cue read rejects when ' + testCase.name, async () => {
    const fx = deferredFixture();
    const cue = new RecordingCue(() => fx.song, () => fx.scope);
    const pending = cue.getState({ scope: 'scope-token', returnTrack: fx.selected, offset: 0 });

    await fx.entered;
    testCase.mutate(fx);
    fx.release();

    await assert.rejects(() => pending, testCase.expected);
    assert.deepEqual(
      fx.writes,
      ['param.getValue:p-0'],
      'only the selected send was read and no setter was called'
    );
  });
}
