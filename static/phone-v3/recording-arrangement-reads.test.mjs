/*
 * Copyright © 2026 Gabriel Worm
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Source: https://github.com/ntworm/rc-surface
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'modules', 'recording-arrangement-reads.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadModule() {
  const root = {};
  const sandbox = { window: root, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'recording-arrangement-reads.js' });
  return root.RcRecordingArrangement;
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the read to reject');
}

function makeView() {
  return {
    connected: true,
    role: 'controller',
    busy: false,
    fresh: true,
    connectionEpoch: 5,
    writable: true,
    state: {
      scope: 'scope-1',
      tracks: [
        { index: 0, id: '101', name: 'Drums', isGroup: false, groupId: null },
        { index: 1, id: '102', name: 'Bass', isGroup: false, groupId: null }
      ],
      transport: {
        connected: true,
        isPlaying: { value: false, fresh: true, observedAt: 1000 },
        recordMode: { value: false, fresh: true, observedAt: 1000 }
      },
      attemptActive: false
    }
  };
}

function makeHarness(options) {
  const opts = options || {};
  const calls = [];
  const notifications = [];
  const view = makeView();
  const send = (name, args, finish) => {
    calls.push({ name, args, finish });
  };
  const reads = loadModule().createReads({
    send,
    getView: () => view,
    notify: (event) => notifications.push(event),
    timeoutMs: opts.timeoutMs === undefined ? 12000 : opts.timeoutMs
  });
  return { reads, calls, notifications, view };
}

const DRUMS = { index: 0, id: '101', name: 'Drums' };
const arrangementResult = () => ({
  scope: 'scope-1',
  track: { index: 0, id: '101', name: 'Drums' },
  clips: [
    { index: 0, id: '900', name: 'Clip A', startTime: 0, endTime: 4 },
    { index: 1, id: '901', name: 'Clip B', startTime: 4, endTime: 8 }
  ],
  page: { offset: 0, next: 2 }
});
const waveformClip = () => ({ index: 0, id: '900', name: 'Clip A', startTime: 0, endTime: 8 });
const waveformResult = () => ({
  scope: 'scope-1',
  track: { index: 0, id: '101', name: 'Drums' },
  clip: waveformClip(),
  startTime: 0,
  endTime: 4,
  peaks: [0, 0.25, 1]
});

test('catalog read sends the exact payload and copies plain validated data', async () => {
  const h = makeHarness();
  const promise = h.reads.readArrangement(DRUMS);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'getRecordingArrangement');
  assert.deepEqual(plain(h.calls[0].args), { scope: 'scope-1', track: DRUMS, offset: 0 });
  const response = arrangementResult();
  h.calls[0].finish({ ok: true, result: response });
  const result = await promise;
  assert.deepEqual(plain(result), arrangementResult());
  assert.notEqual(result.clips, response.clips);
  assert.notEqual(result.clips[0], response.clips[0]);
  assert.notEqual(result.track, response.track);
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].status, 'ok');
  assert.equal(h.notifications[0].kind, 'arrangement');
});

test('catalog read honours the requested offset', async () => {
  const h = makeHarness();
  const promise = h.reads.readArrangement({ index: 1, id: '102', name: 'Bass' }, 64);
  assert.deepEqual(plain(h.calls[0].args), { scope: 'scope-1', track: { index: 1, id: '102', name: 'Bass' }, offset: 64 });
  const response = arrangementResult();
  response.track = { index: 1, id: '102', name: 'Bass' };
  response.clips = [{ index: 64, id: '900', name: 'Clip A', startTime: 0, endTime: 4 }];
  response.page = { offset: 64, next: null };
  h.calls[0].finish({ ok: true, result: response });
  const result = await promise;
  assert.deepEqual(plain(result.page), { offset: 64, next: null });
  assert.equal(result.clips.length, 1);
});

test('catalog read refuses unknown, extra and malformed responses', async () => {
  const cases = [
    (result) => { result.extra = true; }, (result) => { result.track.extra = true; },
    (result) => { delete result.page.next; }, (result) => { result.page.next = 'two'; },
    (result) => { result.page.offset = 1; }, (result) => { result.clips[0].index = 5; },
    (result) => { result.clips[1].id = '900'; }, (result) => { result.clips[0].name = 'x'.repeat(257); },
    (result) => { result.clips[0].startTime = -1; }, (result) => { result.clips[0].endTime = 0; },
    (result) => { result.clips[0].startTime = 'zero'; }, (result) => { result.clips = {}; }
  ];
  for (const mutate of cases) {
    const h = makeHarness();
    const promise = h.reads.readArrangement(DRUMS);
    const response = arrangementResult();
    mutate(response);
    h.calls[0].finish({ ok: true, result: response });
    const error = await rejection(promise);
    assert.ok(error.code === 'REC_PROTOCOL' || error.code === 'REC_MISMATCH', 'unexpected code ' + error.code);
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].status, 'error');
  }
});

test('catalog read refuses a mismatched scope or track echo', async () => {
  const scopeHarness = makeHarness();
  const scopePromise = scopeHarness.reads.readArrangement(DRUMS);
  const scopeResponse = arrangementResult();
  scopeResponse.scope = 'scope-2';
  scopeHarness.calls[0].finish({ ok: true, result: scopeResponse });
  const scopeError = await rejection(scopePromise);
  assert.equal(scopeError.code, 'REC_MISMATCH');
  const trackHarness = makeHarness();
  const trackPromise = trackHarness.reads.readArrangement(DRUMS);
  const trackResponse = arrangementResult();
  trackResponse.track.name = 'Other';
  trackHarness.calls[0].finish({ ok: true, result: trackResponse });
  const trackError = await rejection(trackPromise);
  assert.equal(trackError.code, 'REC_MISMATCH');
});

test('catalog read enforces page size, unique ids and next bounds', async () => {
  const bigHarness = makeHarness();
  const bigPromise = bigHarness.reads.readArrangement(DRUMS);
  const bigResponse = arrangementResult();
  bigResponse.clips = [];
  for (let i = 0; i < 65; i += 1) {
    bigResponse.clips.push({ index: i, id: String(1000 + i), name: 'Clip ' + i, startTime: 0, endTime: 1 });
  }
  bigHarness.calls[0].finish({ ok: true, result: bigResponse });
  const bigError = await rejection(bigPromise);
  assert.equal(bigError.code, 'REC_PROTOCOL');
  const nextHarness = makeHarness();
  const nextPromise = nextHarness.reads.readArrangement(DRUMS);
  const nextResponse = arrangementResult();
  nextResponse.page.next = 5;
  nextHarness.calls[0].finish({ ok: true, result: nextResponse });
  const nextError = await rejection(nextPromise);
  assert.equal(nextError.code, 'REC_PROTOCOL');
  const zeroHarness = makeHarness();
  const zeroPromise = zeroHarness.reads.readArrangement(DRUMS);
  const zeroResponse = arrangementResult();
  zeroResponse.page.next = 0;
  zeroHarness.calls[0].finish({ ok: true, result: zeroResponse });
  const zeroError = await rejection(zeroPromise);
  assert.equal(zeroError.code, 'REC_PROTOCOL');
});

test('catalog read rejects a disconnected link, a missing scope and foreign tracks', async () => {
  const h = makeHarness();
  h.view.connected = false;
  const disconnected = await rejection(h.reads.readArrangement(DRUMS));
  assert.equal(disconnected.code, 'REC_DISCONNECTED');
  assert.equal(h.calls.length, 0);
  h.view.connected = true;
  h.view.state.scope = '';
  const scopeError = await rejection(h.reads.readArrangement(DRUMS));
  assert.equal(scopeError.code, 'REC_SCOPE_MISSING');
  h.view.state.scope = 'scope-1';
  const foreign = await rejection(h.reads.readArrangement({ index: 7, id: '999', name: 'Ghost' }));
  assert.equal(foreign.code, 'REC_TRACK_FOREIGN');
  const renamed = await rejection(h.reads.readArrangement({ index: 0, id: '101', name: 'Other' }));
  assert.equal(renamed.code, 'REC_TRACK_RENAMED');
  const reordered = await rejection(h.reads.readArrangement({ index: 0, id: '102', name: 'Bass' }));
  assert.equal(reordered.code, 'REC_TRACK_REORDERED');
});

test('catalog read refuses a response that arrives after the world changed', async () => {
  const epochs = makeHarness();
  const epochPromise = epochs.reads.readArrangement(DRUMS);
  epochs.view.connectionEpoch = 6;
  epochs.calls[0].finish({ ok: true, result: arrangementResult() });
  const epochError = await rejection(epochPromise);
  assert.equal(epochError.code, 'REC_CANCELLED');
  assert.equal(epochs.notifications.length, 0);
  const scopes = makeHarness();
  const scopePromise = scopes.reads.readArrangement(DRUMS);
  scopes.view.state.scope = 'scope-2';
  scopes.calls[0].finish({ ok: true, result: arrangementResult() });
  const scopeError = await rejection(scopePromise);
  assert.equal(scopeError.code, 'REC_CANCELLED');
  const roles = makeHarness();
  const rolePromise = roles.reads.readArrangement(DRUMS);
  roles.view.role = 'guest';
  roles.calls[0].finish({ ok: true, result: arrangementResult() });
  const roleError = await rejection(rolePromise);
  assert.equal(roleError.code, 'REC_CANCELLED');
  const drops = makeHarness();
  const dropPromise = drops.reads.readArrangement(DRUMS);
  drops.view.connected = false;
  drops.calls[0].finish({ ok: true, result: arrangementResult() });
  const dropError = await rejection(dropPromise);
  assert.equal(dropError.code, 'REC_CANCELLED');
});

test('catalog read refuses a track that was renamed or reordered in the meantime', async () => {
  const renamed = makeHarness();
  const renamedPromise = renamed.reads.readArrangement(DRUMS);
  renamed.view.state.tracks[0].name = 'Drums 2';
  renamed.calls[0].finish({ ok: true, result: arrangementResult() });
  const renamedError = await rejection(renamedPromise);
  assert.equal(renamedError.code, 'REC_MISMATCH');
  const reordered = makeHarness();
  const reorderedPromise = reordered.reads.readArrangement(DRUMS);
  const tracks = reordered.view.state.tracks;
  reordered.view.state.tracks = [tracks[1], tracks[0]];
  reordered.view.state.tracks[0].index = 0;
  reordered.view.state.tracks[1].index = 1;
  reordered.calls[0].finish({ ok: true, result: arrangementResult() });
  const reorderedError = await rejection(reorderedPromise);
  assert.equal(reorderedError.code, 'REC_MISMATCH');
});

test('local cancel rejects pending reads and ignores the late callback', async () => {
  const h = makeHarness();
  const promise = h.reads.readArrangement(DRUMS);
  h.reads.cancel();
  const error = await rejection(promise);
  assert.equal(error.code, 'REC_CANCELLED');
  assert.equal(error.reason, 'cancel');
  h.calls[0].finish({ ok: true, result: arrangementResult() });
  assert.equal(h.notifications.length, 0);
});

test('sync retires pending reads when the world changes', async () => {
  const h = makeHarness();
  const promise = h.reads.readArrangement(DRUMS);
  h.view.connectionEpoch = 6;
  const session = h.reads.sync(h.view);
  assert.deepEqual(plain(session), { connectionEpoch: 6, scope: 'scope-1', role: 'controller' });
  const error = await rejection(promise);
  assert.equal(error.code, 'REC_CANCELLED');
  assert.equal(error.reason, 'session');
  const stop = makeHarness();
  const stopPromise = stop.reads.readArrangement(DRUMS);
  stop.view.state.transport.isPlaying = { value: true, fresh: true, observedAt: 2000 };
  stop.reads.sync(stop.view);
  const stopError = await rejection(stopPromise);
  assert.equal(stopError.code, 'REC_CANCELLED');
  assert.equal(stopError.reason, 'world');
});

test('reads time out and ignore the late callback', async () => {
  const h = makeHarness({ timeoutMs: 20 });
  const promise = h.reads.readArrangement(DRUMS);
  const error = await rejection(promise);
  assert.equal(error.code, 'REC_TIMEOUT');
  h.calls[0].finish({ ok: true, result: arrangementResult() });
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].status, 'error');
  assert.equal(h.notifications[0].code, 'REC_TIMEOUT');
});

test('pending catalog reads are capped at eight and waveform reads at one', async () => {
  const h = makeHarness();
  const pending = [];
  for (let i = 0; i < 8; i += 1) pending.push(h.reads.readArrangement(DRUMS));
  assert.equal(h.calls.length, 8);
  const overflow = await rejection(h.reads.readArrangement(DRUMS));
  assert.equal(overflow.code, 'REC_BUSY');
  assert.equal(h.calls.length, 8);
  const waveform = h.reads.readWaveform(DRUMS, waveformClip(), 0, 4);
  assert.equal(h.calls.length, 9);
  const second = await rejection(h.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
  assert.equal(second.code, 'REC_BUSY');
  h.calls.slice(0, 8).forEach((call) => call.finish({ ok: true, result: arrangementResult() }));
  await Promise.all(pending);
  h.calls[8].finish({ ok: true, result: waveformResult() });
  const peaks = await waveform;
  assert.equal(peaks.peaks.length, 3);
});

test('waveform reads require a connected, fresh and stopped transport', async () => {
  const playing = makeHarness();
  playing.view.state.transport.isPlaying = { value: true, fresh: true, observedAt: 1000 };
  const playingError = await rejection(playing.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
  assert.equal(playingError.code, 'REC_TRANSPORT_PLAYING');
  assert.equal(playing.calls.length, 0);
  const stale = makeHarness();
  stale.view.state.transport.isPlaying = { value: false, fresh: false, observedAt: 1000 };
  const staleError = await rejection(stale.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
  assert.equal(staleError.code, 'REC_TRANSPORT_UNFRESH');
  const bare = makeHarness();
  bare.view.state.transport.isPlaying = false;
  const bareError = await rejection(bare.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
  assert.equal(bareError.code, 'REC_TRANSPORT_UNFRESH');
  const attempt = makeHarness();
  attempt.view.state.attemptActive = true;
  const attemptError = await rejection(attempt.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
  assert.equal(attemptError.code, 'REC_ATTEMPT_ACTIVE');
});

test('waveform read sends the exact payload and copies the peaks', async () => {
  const h = makeHarness();
  const promise = h.reads.readWaveform(DRUMS, waveformClip(), 0, 4);
  assert.equal(h.calls[0].name, 'getRecordingWaveform');
  assert.deepEqual(plain(h.calls[0].args), {
    scope: 'scope-1', track: DRUMS, clip: waveformClip(), startTime: 0, endTime: 4
  });
  const response = waveformResult();
  h.calls[0].finish({ ok: true, result: response });
  const result = await promise;
  assert.deepEqual(plain(result), waveformResult());
  assert.notEqual(result.peaks, response.peaks);
});

test('waveform read validates the clip range and the amplitudes', async () => {
  const outside = makeHarness();
  const outsideError = await rejection(outside.reads.readWaveform(DRUMS, waveformClip(), 0, 9));
  assert.equal(outsideError.code, 'REC_BAD_REQUEST');
  const tooLong = makeHarness();
  const longError = await rejection(tooLong.reads.readWaveform(DRUMS, waveformClip(), 0, 129));
  assert.equal(longError.code, 'REC_BAD_REQUEST');
  const empty = await rejection(makeHarness().reads.readWaveform(DRUMS, waveformClip(), 4, 4));
  assert.equal(empty.code, 'REC_BAD_REQUEST');
  const badPeaks = [null, [], [0, 1.5], [0, -0.1], ['loud'], new Array(513).fill(0.5)];
  for (const peaks of badPeaks) {
    const h = makeHarness();
    const promise = h.reads.readWaveform(DRUMS, waveformClip(), 0, 4);
    const response = waveformResult();
    response.peaks = peaks;
    h.calls[0].finish({ ok: true, result: response });
    const error = await rejection(promise);
    assert.equal(error.code, 'REC_PROTOCOL');
  }
});

test('reads never mutate the view, the REC state or the busy flags', async () => {
  const h = makeHarness();
  const before = JSON.stringify(h.view);
  const promise = h.reads.readArrangement(DRUMS);
  h.calls[0].finish({ ok: true, result: arrangementResult() });
  await promise;
  assert.equal(JSON.stringify(h.view), before);
  assert.equal(h.view.busy, false);
  assert.equal(h.view.receivedAt, undefined);
  assert.equal(h.view.error, undefined);
  assert.equal(h.view.state.receivedAt, undefined);
  assert.equal(h.view.state.error, undefined);
  assert.equal(h.calls.length, 1);
});

test('waveform reads require a fresh and stopped record mode', async () => {
  const cases = [
    [{ value: true, fresh: true }, 'REC_TRANSPORT_PLAYING'],
    [{ value: false, fresh: false }, 'REC_TRANSPORT_UNFRESH'],
    [false, 'REC_TRANSPORT_UNFRESH'], [undefined, 'REC_TRANSPORT_UNFRESH']
  ];
  for (const [recordMode, code] of cases) {
    const h = makeHarness();
    if (recordMode === undefined) delete h.view.state.transport.recordMode;
    else h.view.state.transport.recordMode = recordMode;
    const error = await rejection(h.reads.readWaveform(DRUMS, waveformClip(), 0, 4));
    assert.equal(error.code, code, JSON.stringify(recordMode));
    assert.equal(h.calls.length, 0);
  }
  const ok = makeHarness();
  ok.view.state.transport.recordMode = { value: false, fresh: true };
  const promise = ok.reads.readWaveform(DRUMS, waveformClip(), 0, 4);
  assert.equal(ok.calls.length, 1);
  ok.calls[0].finish({ ok: true, result: waveformResult() });
  assert.equal((await promise).peaks.length, 3);
});

test('a pending waveform is retired once record mode starts or goes stale', async () => {
  for (const recordMode of [{ value: true, fresh: true }, { value: false, fresh: false }]) {
    const h = makeHarness();
    const promise = h.reads.readWaveform(DRUMS, waveformClip(), 0, 4);
    h.view.state.transport.recordMode = recordMode;
    h.calls[0].finish({ ok: true, result: waveformResult() });
    const error = await rejection(promise);
    assert.equal(error.code, 'REC_CANCELLED');
    assert.equal(h.notifications.length, 0);
  }
});

test('session cancels every pending read and ignores late callbacks', async () => {
  const h = makeHarness();
  const first = h.reads.readArrangement(DRUMS);
  const second = h.reads.readArrangement(DRUMS);
  const info = h.reads.session();
  assert.deepEqual(plain(info), { connectionEpoch: 5, scope: 'scope-1', role: 'controller' });
  assert.equal((await rejection(first)).code, 'REC_CANCELLED');
  assert.equal((await rejection(second)).code, 'REC_CANCELLED');
  h.calls[0].finish({ ok: true, result: arrangementResult() });
  h.calls[1].finish({ ok: true, result: { scope: 'scope-1' } });
  assert.equal(h.notifications.length, 0);
});

test('malformed replies reject promptly and never throw', async () => {
  const replies = [
    {}, { ok: true }, { ok: true, result: null }, { ok: true, result: 'nope' }, { ok: true, result: [] },
    { ok: true, result: { scope: 'scope-1', track: {}, clips: [], page: {}, extra: 1 } }
  ];
  for (const reply of replies) {
    const h = makeHarness();
    const promise = h.reads.readArrangement(DRUMS);
    h.calls[0].finish(reply);
    const error = await rejection(promise);
    assert.equal(error.code, 'REC_PROTOCOL', JSON.stringify(reply));
  }
  const failed = makeHarness();
  const failedPromise = failed.reads.readArrangement(DRUMS);
  failed.calls[0].finish({ ok: false });
  assert.equal((await rejection(failedPromise)).code, 'REC_FAILED');
});

test('track and clip refs must be exact', async () => {
  const tracks = [{ index: 0 }, { index: 0, id: null, name: 'Drums' }, { index: 0, id: 101, name: 'Drums' },
    { index: 0, id: '101', name: null }, { index: 0, id: '101', name: 'Drums', extra: 1 }];
  for (const ref of tracks) {
    const h = makeHarness();
    const error = await rejection(h.reads.readArrangement(ref));
    assert.equal(error.code, 'REC_BAD_REQUEST', JSON.stringify(ref));
    assert.equal(h.calls.length, 0);
  }
  const clips = [{ index: 0, id: '900', name: 'Clip A', startTime: 0, endTime: 8, extra: 1 },
    { index: 0, id: 900, name: 'Clip A', startTime: 0, endTime: 8 },
    { index: 0, id: '900', name: 'Clip A', startTime: 4, endTime: 4 }];
  for (const clip of clips) {
    const h = makeHarness();
    const error = await rejection(h.reads.readWaveform(DRUMS, clip, 0, 4));
    assert.equal(error.code, 'REC_BAD_REQUEST', JSON.stringify(clip));
    assert.equal(h.calls.length, 0);
  }
});

test('arrangement offsets reject invalid values and default to zero', async () => {
  for (const offset of [null, 1.5, -1, 4096]) {
    const h = makeHarness();
    const error = await rejection(h.reads.readArrangement(DRUMS, offset));
    assert.equal(error.code, 'REC_BAD_REQUEST', String(offset));
    assert.equal(h.calls.length, 0);
  }
  const h = makeHarness();
  const promise = h.reads.readArrangement(DRUMS);
  assert.equal(h.calls[0].args.offset, 0);
  h.calls[0].finish({ ok: true, result: arrangementResult() });
  await promise;
});

test('reads reject when the realm has no timers', async () => {
  const root = {};
  const sandbox = { window: root };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'recording-arrangement-reads.js' });
  const calls = [];
  const reads = root.RcRecordingArrangement.createReads({
    send: (name) => calls.push(name), getView: () => makeView()
  });
  const error = await rejection(reads.readArrangement(DRUMS));
  assert.equal(error.code, 'REC_TIMEOUT');
  assert.equal(calls.length, 0);
});
