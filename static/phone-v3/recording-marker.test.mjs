// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const requestsSource = fs.readFileSync(new URL('./modules/recording-requests.js', import.meta.url), 'utf8');
const rangeSource = fs.readFileSync(new URL('./modules/recording-range-selection.js', import.meta.url), 'utf8');
const recordingSource = fs.readFileSync(new URL('./modules/recording.js', import.meta.url), 'utf8');

function wireJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function setupTest(t, options = {}) {
  const context = vm.createContext({ setTimeout, clearTimeout, Date });
  vm.runInContext(requestsSource, context);
  vm.runInContext(recordingSource, context);
  const calls = [];
  const client = context.RcRecording.createClient({
    timeoutMs: options.timeoutMs ?? 20,
    send: (cmd, args, cb) => calls.push({ cmd, args, cb }),
  });
  const rawCommand = client.command;
  client.command = (name, args) => {
    const pending = rawCommand(name, args);
    pending.catch(() => {});
    return pending;
  };
  t.after(() => client.session(false));
  return { client, calls, context };
}

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

function mockSnapshot(overrides = {}) {
  return {
    scope: 'scope-abc',
    transport: {
      connected: true,
      isPlaying: field(false),
      recordMode: field(false),
      songTimeBeats: field(0),
      metronome: field(false),
    },
    tracks: [{ index: 0, id: 't0', name: 'Trk', arm: true, canArm: true, solo: false, mute: false }],
    locators: [{ name: 'A', time: 0 }],
    meter: { numerator: 4, denominator: 4 },
    ...overrides,
  };
}

async function seedState(client, calls, snap) {
  const read = client.command('getRecordingState');
  calls.at(-1).cb({ ok: true, result: snap });
  await read;
}

test('recordingRecord pending -> marker callback first -> recordingRecord callback second', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot({
    transport: { connected: true, isPlaying: field(true), recordMode: field(true), songTimeBeats: field(0), metronome: field(false) },
  });
  await seedState(client, calls, snap);

  const recordPromise = client.command('recordingRecord', {});
  const recordCall = calls.at(-1);
  assert.equal(client.view().busy, true);
  assert.equal(client.view().pendingCommand, 'recordingRecord');

  await assert.rejects(client.command('recordingSelectTrack', { index: 0, id: 't0', name: 'Trk' }), /BUSY/);

  const markerPromise = client.command('recordingCreateMarker');
  const markerCall = calls.at(-1);
  assert.equal(markerCall.cmd, 'recordingCreateMarker');
  assert.deepEqual(wireJson(markerCall.args), { scope: 'scope-abc' });
  assert.deepEqual(Object.keys(markerCall.args), ['scope']);
  assert.equal(markerCall.args.scope, 'scope-abc');
  assert.equal(client.view().markerBusy, true);

  await assert.rejects(client.command('recordingCreateMarker'), /BUSY/);
  await assert.rejects(client.command('recordingSelectTrack', { index: 0, id: 't0', name: 'Trk' }), /BUSY/);

  markerCall.cb({ ok: true, result: { ...snap, markerResult: { name: 'Mark 1', time: 10, existing: false, observedAt: 1234 } } });
  const markerRes = await markerPromise;
  assert.equal(markerRes.name, 'Mark 1');

  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult.name, 'Mark 1');
  assert.equal(client.view().busy, true);
  assert.equal(client.view().pendingCommand, 'recordingRecord');
  await assert.rejects(client.command('recordingSelectTrack', { index: 0, id: 't0', name: 'Trk' }), /BUSY/);

  recordCall.cb({ ok: true, result: { ...snap, capture: { phase: 'complete' } } });
  await recordPromise;

  assert.equal(client.view().busy, false);
  assert.equal(client.view().pendingCommand, null);
  assert.equal(client.view().state.capture.phase, 'complete');
  assert.equal(client.view().markerResult.name, 'Mark 1');
});

test('recordingRecord pending -> recordingRecord callback first -> marker callback second never replaces transport', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot({
    transport: { connected: true, isPlaying: field(true), recordMode: field(true), songTimeBeats: field(0), metronome: field(false) },
  });
  await seedState(client, calls, snap);

  const recordPromise = client.command('recordingRecord', {});
  const recordCall = calls.at(-1);

  const markerPromise = client.command('recordingCreateMarker');
  const markerCall = calls.at(-1);

  const freshSnap = {
    ...snap,
    transport: { connected: true, isPlaying: field(true), recordMode: field(true), songTimeBeats: field(99), metronome: field(false) },
  };
  recordCall.cb({ ok: true, result: freshSnap });
  await recordPromise;

  assert.equal(client.view().busy, false);
  assert.equal(client.view().state.transport.songTimeBeats.value, 99);
  assert.equal(client.view().markerBusy, true);

  const olderSnap = {
    ...snap,
    transport: { connected: true, isPlaying: field(false), recordMode: field(false), songTimeBeats: field(10), metronome: field(false) },
  };
  markerCall.cb({ ok: true, result: { ...olderSnap, markerResult: { name: 'Mark 2', time: 12, existing: true, observedAt: 5678 } } });
  const res = await markerPromise;

  assert.equal(res.name, 'Mark 2');
  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult.name, 'Mark 2');
  assert.equal(client.view().state.transport.songTimeBeats.value, 99);
});

test('STOP while marker pending cancels immediately and late callback cannot report success', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot();
  await seedState(client, calls, snap);

  const markerPromise = client.command('recordingCreateMarker');
  const markerCall = calls.at(-1);

  const stopPromise = client.command('recordingStop');
  const stopCall = calls.at(-1);
  assert.equal(stopCall.cmd, 'recordingStop');

  await assert.rejects(markerPromise, /REC:(MARKER_CANCELED|SESSION)/);
  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:UNKNOWN');

  stopCall.cb({ ok: true, result: { ...snap, stopped: true } });
  await stopPromise;

  markerCall.cb({ ok: true, result: { ...snap, markerResult: { name: 'Late Marker', time: 4, existing: false, observedAt: 9999 } } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:UNKNOWN');
});

test('timeout while marker pending fails without replay', async t => {
  const { client, calls } = setupTest(t, { timeoutMs: 10 });
  client.session(true, 'controller');
  await seedState(client, calls, mockSnapshot());

  const markerPromise = client.command('recordingCreateMarker');
  assert.equal(calls.length, 2);

  await assert.rejects(markerPromise, /UNKNOWN/);
  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:UNKNOWN');
  assert.equal(calls.length, 2, 'no queued retry');
});

test('disconnect and reconnect fail pending marker without replay', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot();
  await seedState(client, calls, snap);

  const markerPromise = client.command('recordingCreateMarker');
  const markerCall = calls.at(-1);

  client.session(false);
  client.session(true, 'controller');

  await assert.rejects(markerPromise, /REC:(SESSION|MARKER_CANCELED)/);
  markerCall.cb({ ok: true, result: { ...snap, markerResult: { name: 'Late', time: 5, existing: false, observedAt: 1 } } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:SESSION');
  assert.equal(calls.filter(c => c.cmd === 'recordingCreateMarker').length, 1);
});

test('role loss and scope change while marker pending fail and late reply cannot clobber newer latch', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot();
  await seedState(client, calls, snap);

  const m1 = client.command('recordingCreateMarker');
  const m1Call = calls.at(-1);
  client.session(true, 'viewer');
  await assert.rejects(m1, /REC:(SESSION|MARKER_CANCELED)/);
  m1Call.cb({ ok: true, result: { ...snap, markerResult: { name: 'Late', time: 5, existing: false, observedAt: 1 } } });
  assert.equal(client.view().markerResult, null);

  client.session(true, 'controller');
  await seedState(client, calls, snap);

  const m2 = client.command('recordingCreateMarker');
  const m2Call = calls.at(-1);
  const newSnap = { ...snap, scope: 'new-scope-xyz' };
  await seedState(client, calls, newSnap);

  await assert.rejects(m2, /SESSION/);
  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:SESSION');

  const m3 = client.command('recordingCreateMarker');
  const m3Call = calls.at(-1);
  assert.equal(client.view().markerBusy, true);

  m2Call.cb({ ok: true, result: { ...snap, markerResult: { name: 'Old Scope', time: 1, existing: false, observedAt: 1 } } });
  assert.equal(client.view().markerBusy, true, 'late reply from retired m2 cannot clear m3 latch');
  assert.equal(client.view().markerResult, null);

  m3Call.cb({ ok: true, result: { ...newSnap, markerResult: { name: 'New Scope Mark', time: 8, existing: false, observedAt: 2 } } });
  await m3;
  assert.equal(client.view().markerBusy, false);
  assert.equal(client.view().markerResult.name, 'New Scope Mark');
});

test('viewer denied, unknown/non-boolean state denied, mismatched scope denied, and latch duplicate rejected', async t => {
  const { client, calls, context } = setupTest(t);
  client.session(true, 'viewer');
  await assert.rejects(client.command('recordingCreateMarker'), /SESSION/);
  assert.equal(calls.length, 0);

  client.session(true, 'controller');
  await assert.rejects(client.command('recordingCreateMarker'), /UNKNOWN/);
  assert.equal(calls.length, 0);

  const snapNoScope = mockSnapshot();
  delete snapNoScope.scope;
  await seedState(client, calls, snapNoScope);
  await assert.rejects(client.command('recordingCreateMarker'), /UNKNOWN/);

  const snapStale = mockSnapshot({
    transport: { connected: true, isPlaying: { value: false, fresh: false }, recordMode: field(false), songTimeBeats: field(0), metronome: field(false) },
  });
  await seedState(client, calls, snapStale);
  await assert.rejects(client.command('recordingCreateMarker'), /UNKNOWN/);

  const snapNonBoolean = mockSnapshot({
    transport: { connected: true, isPlaying: { value: null, fresh: true }, recordMode: { value: 1, fresh: true }, songTimeBeats: field(0), metronome: field(false) },
  });
  await seedState(client, calls, snapNonBoolean);
  assert.equal(context.RcRecordingRequests.canAddMarker(client.view()), false);
  await assert.rejects(client.command('recordingCreateMarker'), /UNKNOWN/);

  const snapGood = mockSnapshot();
  await seedState(client, calls, snapGood);
  await assert.rejects(client.command('recordingCreateMarker', { scope: 'mismatch-scope' }), /SESSION/);
  assert.equal(calls.filter(c => c.cmd === 'recordingCreateMarker').length, 0);

  const p1 = client.command('recordingCreateMarker');
  await assert.rejects(client.command('recordingCreateMarker'), /BUSY/);
  calls.at(-1).cb({ ok: true, result: { ...snapGood, markerResult: { name: 'M1', time: 0, existing: false, observedAt: 1 } } });
  await p1;
});

test('successful first marker -> second canceled, failed, or scope-retired clears old success without replay', async t => {
  const { client, calls } = setupTest(t);
  client.session(true, 'controller');
  const snap = mockSnapshot();
  await seedState(client, calls, snap);

  const m1 = client.command('recordingCreateMarker');
  calls.at(-1).cb({ ok: true, result: { ...snap, markerResult: { name: 'Mark 1', time: 4, existing: false, observedAt: 10 } } });
  await m1;
  assert.equal(client.view().markerResult.name, 'Mark 1');

  const m2 = client.command('recordingCreateMarker');
  const m2Call = calls.at(-1);
  assert.equal(client.view().markerResult, null, 'starting second marker clears prior markerResult');
  assert.equal(client.view().markerBusy, true);

  const stop = client.command('recordingStop');
  calls.at(-1).cb({ ok: true, result: snap });
  await stop;
  await assert.rejects(m2, /MARKER_CANCELED/);
  m2Call.cb({ ok: true, result: { ...snap, markerResult: { name: 'Late 2', time: 8, existing: false, observedAt: 11 } } });
  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:UNKNOWN');

  const m3 = client.command('recordingCreateMarker');
  calls.at(-1).cb({ ok: true, result: { ...snap, markerResult: { name: 'Mark 3', time: 8, existing: true, observedAt: 12 } } });
  await m3;
  assert.equal(client.view().markerResult.name, 'Mark 3');

  const m4 = client.command('recordingCreateMarker');
  calls.at(-1).cb({ ok: false, error: 'REC:UNKNOWN' });
  await assert.rejects(m4, /UNKNOWN/);
  assert.equal(client.view().markerResult, null);
  assert.equal(client.view().markerError, 'REC:UNKNOWN');
  assert.equal(client.view().error, null, 'main REC error untouched by marker failure');
  assert.equal(calls.filter(c => c.cmd === 'recordingCreateMarker').length, 4, 'no replay');
});

function setupDomHarness(t) {
  const nodes = new Map(), events = new Map(), sent = [];
  let generated = 0;
  const node = id => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: '', textContent: '', disabled: id === 'rec-add-marker', hidden: false, dataset: {}, style: {},
        children: [], listeners: new Map(),
        setAttribute(name, val) { this[name] = val; },
        addEventListener(name, fn) { this.listeners.set(name, fn); },
        replaceChildren(...ch) { this.children = ch; },
        appendChild(ch) { this.children.push(ch); },
      });
    }
    return nodes.get(id);
  };
  const doc = {
    readyState: 'loading', body: { dataset: { page: 'recording' } }, hidden: false,
    getElementById: node, createElement: () => node('gen-' + (++generated)), addEventListener() {},
  };
  const context = vm.createContext({
    document: doc, Date, setTimeout: () => 1, clearTimeout() {},
    addEventListener: (name, fn) => events.set(name, fn),
    RcSurfaceI18n: { t: (key, params) => (params?.name ? `${key}:${params.name}` : key) },
    sendPhoneCommand: (cmd, args, cb) => sent.push({ cmd, args, cb }),
  });
  vm.runInContext(requestsSource, context);
  vm.runInContext(rangeSource, context);
  vm.runInContext(recordingSource, context);
  const client = context.RcRecording.setup();
  t.after(() => client.session(false));
  return { node, events, sent, client };
}

test('the page owns no marker action and never issues a marker command', async t => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  // The approved direction removed the marker action of the toolbar: the
  // marker is created in Live and the page only reads the catalog of the
  // Set. The status and the result of a marker request are gone with it.
  assert.doesNotMatch(html, /id="rec-add-marker"/, 'the toolbar owns no marker action');
  assert.doesNotMatch(html, /id="rec-marker-status"/, 'the marker status has no action to report');
  assert.doesNotMatch(html, /id="rec-marker-result"/, 'the marker result has no action to report');

  const { events, sent } = setupDomHarness(t);
  const snap = mockSnapshot({ session: { songId: 's1', scenes: [], rows: [], owned: [] } });
  events.get('ableton-rc:phone-client-id')({ detail: { role: 'controller' } });
  sent.at(-1).cb({ ok: true, result: snap });
  await new Promise(resolve => setImmediate(resolve));
  events.get('ableton-rc:page-change')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.filter(call => call.cmd === 'recordingCreateMarker').length, 0,
    'the page never issues a marker command on its own');
});
