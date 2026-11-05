// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RecordingMarker } from '../src/live/recording-marker.ts';
import { CMD, GET, REC, RESPONSE } from '../src/osc-tokens.ts';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
/** Every write the REC stack owns: transport, arm, loop, punch, record mode. */
const transportWrites = sent => sent.filter(([address]) => address.includes('/set/') || Object.values(CMD).includes(address));

/** The fake Live SDK behind the Song: its cue list, its name counter and the
 * create behaviour the test selects. */
function createSdk() {
  const cues = [];
  let sequence = 0;
  const sdk = {
    cues,
    mode: 'ok',
    release: null,
    /** The counter the fake SDK names its cues with. */
    next: () => ++sequence,
    count: () => sequence,
    addCue(time) {
      const id = sdk.next();
      const cue = { name: 'Cue ' + id, time, handle: { id: 'cue-' + id } };
      cues.push(cue);
      return cue;
    },
  };
  return sdk;
}

/** The SDK creates the cue and a second one with the same handle. */
function createDuplicateHandle(sdk, time) {
  const cue = sdk.addCue(time);
  sdk.cues.push({ name: 'Foreign', time, handle: { id: cue.handle.id } });
  return Promise.resolve(cue);
}

/** The SDK creates the cue and then drops it from the Song. */
function createDisappearing(sdk, time) {
  const cue = sdk.addCue(time);
  sdk.cues.length = 0;
  return Promise.resolve(cue);
}

/** The SDK reflects the new name only from the third read on. */
function createDelayedName(sdk, time) {
  const id = sdk.next();
  const actual = 'Cue ' + id;
  let confirmed = actual;
  let reads = 0;
  const cue = {
    get name() { return ++reads >= 3 ? confirmed : actual; },
    set name(value) { confirmed = value; },
    time,
    handle: { id: 'cue-' + id },
  };
  sdk.cues.push(cue);
  return Promise.resolve(cue);
}

/** The SDK never reflects the new name: every read shows another name. */
function createUnreflectedName(sdk, time) {
  const cue = {
    get name() { return 'Cue ' + sdk.next(); },
    set name(_value) {},
    time,
    handle: { id: 'cue-' + sdk.count() },
  };
  sdk.cues.push(cue);
  return Promise.resolve(cue);
}

/** One create call per test mode: the marker must survive every one. */
function createCuePoint(sdk, time) {
  const mode = sdk.mode;
  if (mode === 'reject') return Promise.reject(new Error('sdk rejected'));
  if (mode === 'rejectAfterApply') { sdk.addCue(time); return Promise.reject(new Error('sdk applied then rejected')); }
  if (mode === 'slow') return new Promise(resolve => { sdk.release = () => resolve(sdk.addCue(time)); });
  if (mode === 'duplicateHandle') return createDuplicateHandle(sdk, time);
  if (mode === 'disappear') return createDisappearing(sdk, time);
  if (mode === 'delayedName') return createDelayedName(sdk, time);
  if (mode === 'timeoutName') return createUnreflectedName(sdk, time);
  return Promise.resolve(sdk.addCue(time));
}

/** The Song the marker sees: the cue list and one SDK create call. */
function createSong(sdk) {
  return {
    tracks: [],
    get cuePoints() { return sdk.cues; },
    createCuePoint(time) { return createCuePoint(sdk, time); },
  };
}

function fixture(t) {
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  const sent = [];
  const state = { position: 8, playing: false, record: false, respond: true };
  const sdk = createSdk();
  let song = createSong(sdk);
  let generation = 0;
  const instance = 'marker-instance';
  const getScope = () => instance + ':' + generation;
  osc.send = (address, args = []) => {
    sent.push([address, args]);
    if (address === GET.currentSongTime && state.respond) {
      queueMicrotask(() => osc.handleIncoming({ oscType: 'message', address: RESPONSE.currentSongTime, args: [{ value: state.position }] }));
    }
  };
  const push = (address, value) => osc.handleIncoming({ oscType: 'message', address, args: [{ value }] });
  const marker = new RecordingMarker(osc, () => song, getScope);
  let current = true;
  const context = { clientId: 'phone-a', isCurrent: () => current };
  t.after(() => { marker.dispose(); osc.dispose(); });
  return {
    osc, marker, sent, state, cues: sdk.cues, push, context,
    scope: getScope,
    seed(playing = false, record = false) {
      state.playing = playing; state.record = record;
      push(RESPONSE.isPlaying, playing ? 1 : 0);
      push(REC.getRecordMode, record ? 1 : 0);
    },
    replaceSong() { song = { ...song, tracks: [] }; generation++; },
    retireScope() { generation++; },
    retire() { current = false; },
    releaseCreate() { sdk.release?.(); },
    setCreateMode(mode) { sdk.mode = mode; },
  };
}

test('REC marker drops one named cue from a fresh position during REC and never writes the transport', async t => {
  const f = fixture(t);
  f.seed(true, true);
  f.push(RESPONSE.currentSongTime, 8);
  const before = f.sent.length;
  const result = await f.marker.create(f.scope(), f.context);
  assert.equal(result.existing, false);
  assert.equal(result.name, 'Mark 1');
  assert.equal(result.time, 8);
  assert.equal(typeof result.observedAt, 'number');
  assert.equal(f.cues.length, 1);
  assert.equal(f.cues[0].name, 'Mark 1');
  assert.equal(f.cues[0].time, 8);
  assert.deepEqual(transportWrites(f.sent.slice(before)), []);
  assert.equal(f.sent.filter(([address]) => address === GET.currentSongTime).length, 1, 'exactly one position request');
});

for (const [label, playing, record] of [['play', true, false], ['stopped', false, false]]) {
  test('REC marker works while ' + label + ' without touching arm, loop, punch or transport', async t => {
    const f = fixture(t);
    f.seed(playing, record);
    const before = f.sent.length;
    const result = await f.marker.create(f.scope(), f.context);
    assert.equal(result.name, 'Mark 1');
    assert.equal(result.time, 8);
    assert.deepEqual(transportWrites(f.sent.slice(before)), []);
    assert.equal(f.cues.length, 1);
  });
}

test('REC marker never uses a cached position and waits for a new reply', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.push(RESPONSE.currentSongTime, 8);
  f.state.respond = false;
  let done = false;
  const pending = f.marker.create(f.scope(), f.context).then(value => { done = true; return value; });
  await flush();
  assert.equal(done, false, 'a cached position never confirms a new request');
  f.push(RESPONSE.currentSongTime, 9);
  const result = await pending;
  assert.equal(result.time, 9, 'the marker uses the new observation, never the cached one');
  assert.equal(f.cues[0].time, 9);
});

test('REC marker times out before the SDK when no position reply arrives', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /MARKER_TIMEOUT|not observed/);
  await flush();
  t.mock.timers.tick(2001);
  await rejected;
  assert.equal(f.cues.length, 0, 'a timeout never creates a cue');
});

test('REC marker rejects a stale transport observation instead of guessing', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t);
  f.seed(false, false);
  t.mock.timers.tick(2001);
  await assert.rejects(f.marker.create(f.scope(), f.context), /STALE/);
  assert.equal(f.cues.length, 0);
});

test('REC marker rejects an unknown transport state before it observes a position', async t => {
  const f = fixture(t);
  await assert.rejects(f.marker.create(f.scope(), f.context), /STALE/);
  assert.equal(f.cues.length, 0);
  assert.deepEqual(transportWrites(f.sent), []);
});

test('REC marker rejects invalid arguments, a foreign scope and a missing or stale context', async t => {
  const f = fixture(t);
  f.seed(false, false);
  await assert.rejects(f.marker.create('', f.context), /ARGUMENTS/);
  await assert.rejects(f.marker.create(42, f.context), /ARGUMENTS/);
  await assert.rejects(f.marker.create('other-instance:0', f.context), /SCOPE/);
  await assert.rejects(f.marker.create(f.scope()), /SESSION/);
  f.retire();
  await assert.rejects(f.marker.create(f.scope(), f.context), /SESSION/);
  assert.equal(f.cues.length, 0);
});

test('REC marker keeps one operation at a time', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const pending = f.marker.create(f.scope(), f.context);
  await assert.rejects(f.marker.create(f.scope(), f.context), /BUSY/);
  f.state.respond = true;
  f.push(RESPONSE.currentSongTime, 8);
  await pending;
});

test('REC marker abandons a replaced Song before it creates anything', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /IDENTITY/);
  await flush();
  f.replaceSong();
  f.push(RESPONSE.currentSongTime, 9);
  await rejected;
  assert.equal(f.cues.length, 0, 'a replaced Song never receives a cue');
});

test('REC marker abandons a retired scope before it creates anything', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /SCOPE/);
  await flush();
  f.retireScope();
  f.push(RESPONSE.currentSongTime, 9);
  await rejected;
  assert.equal(f.cues.length, 0);
});

test('REC marker abandons a lost link and a retired session before it creates anything', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const linked = f.marker.create(f.scope(), f.context);
  const linkRejected = assert.rejects(linked, /CONNECTION/);
  await flush();
  f.osc.state.connected = false;
  f.osc.emit('link-lost');
  await linkRejected;
  assert.equal(f.cues.length, 0);

  f.osc.state.connected = true;
  const session = f.marker.create(f.scope(), f.context);
  const sessionRejected = assert.rejects(session, /SESSION/);
  await flush();
  f.retire();
  f.push(RESPONSE.currentSongTime, 9);
  await sessionRejected;
  assert.equal(f.cues.length, 0);
});

test('REC marker reports an existing cue at the same position without renaming or creating', async t => {
  const f = fixture(t);
  f.cues.push({ name: 'Verse', time: 8.0005, handle: { id: 'cue-verse' } });
  f.seed(false, false);
  const before = f.sent.length;
  const result = await f.marker.create(f.scope(), f.context);
  assert.equal(result.existing, true);
  assert.equal(result.name, 'Verse');
  assert.equal(result.time, 8.0005);
  assert.equal(f.cues.length, 1);
  assert.equal(f.cues[0].name, 'Verse');
  assert.deepEqual(transportWrites(f.sent.slice(before)), []);
});

test('REC marker chooses the lowest free Mark N name and keeps the cue it created', async t => {
  const f = fixture(t);
  f.cues.push({ name: 'Mark 1', time: 0, handle: { id: 'a' } }, { name: 'Mark 3', time: 2, handle: { id: 'b' } });
  f.seed(false, false);
  const result = await f.marker.create(f.scope(), f.context);
  assert.equal(result.existing, false);
  assert.equal(result.name, 'Mark 2');
  assert.equal(f.cues.length, 3);
  assert.equal(f.cues[2].name, 'Mark 2');
  assert.equal(f.cues[0].name, 'Mark 1', 'an existing cue is never renamed');
  assert.equal(f.cues[1].name, 'Mark 3');
});

test('REC marker reports an unknown result when the SDK rejects after it applied', async t => {
  const f = fixture(t);
  f.setCreateMode('rejectAfterApply');
  f.seed(false, false);
  await assert.rejects(f.marker.create(f.scope(), f.context), /MARKER_UNKNOWN/);
  assert.equal(f.cues.length, 1, 'an unknown result is never cleaned up');
  assert.equal(f.cues[0].name, 'Cue 1', 'an unknown result is never renamed');
});

test('REC marker reports an unknown result when the SDK call fails outright', async t => {
  const f = fixture(t);
  f.setCreateMode('reject');
  f.seed(false, false);
  await assert.rejects(f.marker.create(f.scope(), f.context), /MARKER_UNKNOWN/);
  assert.equal(f.cues.length, 0);
});

test('REC marker cancel retires a slow SDK call and never renames the cue afterwards', async t => {
  const f = fixture(t);
  f.setCreateMode('slow');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /MARKER_CANCELED/);
  await flush();
  f.marker.cancel();
  await rejected;
  f.releaseCreate();
  await flush();
  assert.equal(f.cues.length, 1, 'the issued SDK call may still complete');
  assert.equal(f.cues[0].name, 'Cue 1', 'a late completion never renames the cue');
});

test('REC marker cancel before the create never creates a cue at all', async t => {
  const f = fixture(t);
  f.seed(false, false);
  f.state.respond = false;
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /MARKER_CANCELED/);
  await flush();
  f.marker.cancel();
  f.state.respond = true;
  f.push(RESPONSE.currentSongTime, 9);
  await rejected;
  assert.equal(f.cues.length, 0, 'a cancelled marker never creates a cue');
});

test('REC marker recomputes lowest free name when a collision appears while creation awaits', async t => {
  const f = fixture(t);
  f.setCreateMode('slow');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  await flush();
  f.cues.push({ name: 'Mark 1', time: 10, handle: { id: 'ext-mark-1' } });
  f.releaseCreate();
  const result = await pending;
  assert.equal(result.existing, false);
  assert.equal(result.name, 'Mark 2', 'chooses next free Mark N when Mark 1 became occupied');
  assert.equal(f.cues[0].name, 'Mark 1', 'external cue is never renamed');
  assert.equal(f.cues[1].name, 'Mark 2');
});

test('REC marker rejects unknown when returned handle is ambiguous or duplicate in current Song', async t => {
  const f = fixture(t);
  f.setCreateMode('duplicateHandle');
  f.seed(true, true);
  await assert.rejects(f.marker.create(f.scope(), f.context), /MARKER_UNKNOWN/);
});

test('REC marker rejects unknown when created cue disappears from Song before rename', async t => {
  const f = fixture(t);
  f.setCreateMode('disappear');
  f.seed(true, true);
  await assert.rejects(f.marker.create(f.scope(), f.context), /MARKER_UNKNOWN/);
});

test('REC marker confirms cue name across delayed asynchronous SDK reflection', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t);
  f.setCreateMode('delayedName');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  await flush();
  t.mock.timers.tick(25);
  await flush();
  t.mock.timers.tick(25);
  const result = await pending;
  assert.equal(result.name, 'Mark 1');
  assert.equal(result.existing, false);
});

test('REC marker confirmation times out when SDK name reflection never completes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t);
  f.setCreateMode('timeoutName');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /MARKER_UNKNOWN/);
  await flush();
  t.mock.timers.tick(2001);
  await rejected;
});

test('REC marker retirement after create before naming prevents rename and reports error', async t => {
  const f = fixture(t);
  f.setCreateMode('slow');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  await flush();
  f.retire();
  f.releaseCreate();
  await assert.rejects(pending, /SESSION/);
  assert.equal(f.cues.length, 1);
  assert.equal(f.cues[0].name, 'Cue 1', 'cue is not renamed when retired before naming');
});

test('REC marker cancellation during confirmation terminates polling and never reports success', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const f = fixture(t);
  f.setCreateMode('delayedName');
  f.seed(true, true);
  const pending = f.marker.create(f.scope(), f.context);
  const rejected = assert.rejects(pending, /MARKER_CANCELED/);
  await flush();
  f.marker.cancel();
  await rejected;
});
