// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dataSource = fs.readFileSync(new URL('./modules/recording-data.js', import.meta.url), 'utf8');
const recordingSource = fs.readFileSync(new URL('./modules/recording.js', import.meta.url), 'utf8');

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

function snapshot(overrides = {}) {
  return {
    scope: 'scope-1',
    transport: {
      connected: true,
      isPlaying: field(false),
      recordMode: field(false),
      songTimeBeats: field(0),
      metronome: field(false),
    },
    tracks: [{ index: 0, id: 't0', name: 'Trk', arm: false, canArm: true, solo: false, mute: false }],
    locators: [],
    meter: { numerator: 4, denominator: 4 },
    pending: null,
    attemptActive: false,
    preRoll: null,
    session: { songId: 's1', scenes: [], rows: [], owned: [], active: false },
    ...overrides,
  };
}

function catalog(overrides = {}) {
  return {
    scope: 'scope-1',
    track: { index: 0, id: 't0', name: 'Trk' },
    lanes: [{
      index: 0,
      id: 'l0',
      name: 'Lane 1',
      clips: [{
        index: 0, id: 'c0', name: 'Take 1', startTime: 0, endTime: 16,
        mark: null, reference: 'scope-1#o1.o2.o3',
      }],
    }],
    page: { laneOffset: 0, clipOffset: 0, next: null },
    ...overrides,
  };
}

const TRACK = { index: 0, id: 't0', name: 'Trk' };
const LANE = { index: 0, id: 'l0', name: 'Lane 1' };
const CLIP = {
  index: 0, id: 'c0', name: 'Take 1', startTime: 0, endTime: 16,
  reference: 'scope-1#o1.o2.o3',
};

function noteArgs(overrides = {}) {
  return {
    scope: 'scope-1',
    track: { ...TRACK },
    lane: { ...LANE },
    clip: { ...CLIP },
    mark: 'good',
    ...overrides,
  };
}

function setup(t, options = {}) {
  const context = vm.createContext({ setTimeout, clearTimeout, Date });
  vm.runInContext(dataSource, context);
  vm.runInContext(recordingSource, context);
  const calls = [];
  const renders = [];
  const client = context.RcRecording.createClient({
    timeoutMs: options.timeoutMs ?? 50,
    send: (cmd, args, cb) => calls.push({ cmd, args, cb }),
    render: view => renders.push(view),
  });
  const rawCommand = client.command;
  client.command = (name, args) => {
    const pending = rawCommand(name, args);
    pending.catch(() => {});
    return pending;
  };
  t.after(() => client.session(false));
  return { client, calls, renders, context };
}

/** The data client alone, with a world the test can change under a read. */
function dataClient(holder, options = {}) {
  const context = vm.createContext({ setTimeout, clearTimeout, Date });
  vm.runInContext(dataSource, context);
  const replies = [];
  const client = context.RcRecordingData.createDataClient({
    timeoutMs: options.timeoutMs ?? 50,
    send: (cmd, args, cb) => replies.push(cb),
    getView: () => holder.value,
  });
  return { client, replies };
}

function dataView(overrides = {}) {
  return {
    connected: true,
    role: 'viewer',
    connectionEpoch: 7,
    fresh: true,
    state: { scope: 'scope-1', tracks: [{ index: 0, id: 't0', name: 'Trk' }] },
    ...overrides,
  };
}

async function seed(client, calls, result) {
  const read = client.command('getRecordingState');
  calls.at(-1).cb({ ok: true, result });
  await read;
}

function wire(value) {
  return JSON.parse(JSON.stringify(value));
}

test('data read forwards the exact catalog arguments and never becomes an observation', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'viewer');
  await seed(client, calls, snapshot());

  const request = { scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 };
  const reading = client.command('getRecordingTakes', request);
  const call = calls.at(-1);
  assert.equal(call.cmd, 'getRecordingTakes');
  assert.deepEqual(wire(call.args), request);
  assert.deepEqual(Object.keys(call.args), ['scope', 'track', 'laneOffset', 'clipOffset']);
  assert.deepEqual(Object.keys(call.args.track), ['index', 'id', 'name']);

  call.cb({ ok: true, result: catalog() });
  const result = await reading;
  assert.equal(result.lanes[0].clips[0].name, 'Take 1');

  const view = client.view();
  assert.equal(view.busy, false, 'a data read never takes the coordinator slot');
  assert.equal(view.pendingCommand, null);
  assert.equal(view.state.scope, 'scope-1');
  assert.equal(view.state.tracks[0].name, 'Trk', 'the coordinator snapshot survives the data reply');
  assert.equal(view.state.lanes, undefined, 'the catalog never lands in the coordinator state');
});

test('a data write needs a writable role, a known stopped transport and an idle REC', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'viewer');
  await seed(client, calls, snapshot());
  await assert.rejects(client.command('recordingMarkTake', noteArgs()), /SESSION/);
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 0, 'a viewer writes nothing');

  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const cases = [
    ['unknown state', snapshot({ transport: { connected: false, isPlaying: field(false), recordMode: field(false) } }), /UNKNOWN/],
    ['stale transport', snapshot({ transport: { connected: true, isPlaying: { value: false, fresh: false }, recordMode: field(false) } }), /UNKNOWN/],
    ['playing', snapshot({ transport: { connected: true, isPlaying: field(true), recordMode: field(false) } }), /NOT_STOPPED/],
    ['recording', snapshot({ transport: { connected: true, isPlaying: field(false), recordMode: field(true) } }), /NOT_STOPPED/],
    ['active attempt', snapshot({ attemptActive: true }), /STOP_REQUIRED/],
    ['pre-roll', snapshot({ preRoll: { bars: 2, phase: 'running' } }), /STOP_REQUIRED/],
    ['session attempt', snapshot({ session: { songId: 's1', scenes: [], rows: [], owned: [], active: true } }), /STOP_REQUIRED/],
    ['pending main work', snapshot({ pending: 'record' }), /STOP_REQUIRED/],
  ];
  for (const [label, state, expected] of cases) {
    await seed(client, calls, state);
    await assert.rejects(client.command('recordingMarkTake', noteArgs()), expected, label);
  }
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 0, 'no denied write is ever sent');

  const busy = client.command('recordingRecord', {});
  assert.equal(client.view().busy, true);
  await assert.rejects(client.command('recordingMarkTake', noteArgs()), /STOP_REQUIRED/);
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 0);
  calls.at(-1).cb({ ok: true, result: snapshot() });
  await busy;
});

test('a note needs an explicit clip reference and sends exactly what it was given', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());

  const withoutReference = noteArgs();
  delete withoutReference.clip.reference;
  await assert.rejects(client.command('recordingMarkTake', withoutReference), /ARGUMENTS/);
  const unknownMark = noteArgs({ mark: 'maybe' });
  await assert.rejects(client.command('recordingMarkTake', unknownMark), /ARGUMENTS/);
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 0);

  const writing = client.command('recordingMarkTake', noteArgs());
  const call = calls.at(-1);
  assert.equal(call.cmd, 'recordingMarkTake');
  assert.deepEqual(Object.keys(call.args), ['scope', 'track', 'lane', 'clip', 'mark']);
  assert.deepEqual(Object.keys(call.args.clip), ['index', 'id', 'name', 'startTime', 'endTime', 'reference']);
  assert.deepEqual(wire(call.args), noteArgs());

  call.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  const result = await writing;
  assert.equal(result.clip.mark, 'good');
  assert.equal(client.view().state.scope, 'scope-1', 'the note never replaces the coordinator state');
});

test('a clear mark is an exact null and never a guess', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const writing = client.command('recordingMarkTake', noteArgs({ mark: null }));
  const call = calls.at(-1);
  assert.equal(call.args.mark, null);
  assert.equal(Object.hasOwn(call.args, 'mark'), true);
  call.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: null } } });
  await writing;
});

test('a priority STOP retires the pending note and a late reply cannot report success', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());

  const writing = client.command('recordingMarkTake', noteArgs());
  const call = calls.at(-1);
  const rejected = assert.rejects(writing, /REC:(NOTE_CANCELED|SESSION)/);

  const stop = client.command('recordingStop');
  assert.equal(calls.at(-1).cmd, 'recordingStop');
  await rejected;

  call.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null, 'a retired note never reports success');
  assert.equal(client.view().state.scope, 'scope-1');

  calls.at(-1).cb({ ok: true, result: snapshot() });
  await stop;
  assert.equal(calls.filter(entry => entry.cmd === 'recordingMarkTake').length, 1, 'no replay');
});

test('a session, a role, a scope or a track change retires the pending note', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());

  const bySession = client.command('recordingMarkTake', noteArgs());
  const sessionCall = calls.at(-1);
  const sessionRejected = assert.rejects(bySession, /REC:(SESSION|NOTE_CANCELED)/);
  client.session(false);
  await sessionRejected;
  sessionCall.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null);

  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const byRole = client.command('recordingMarkTake', noteArgs());
  const roleCall = calls.at(-1);
  const roleRejected = assert.rejects(byRole, /REC:(SESSION|NOTE_CANCELED)/);
  client.session(true, 'viewer');
  await roleRejected;
  roleCall.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null);

  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const byScope = client.command('recordingMarkTake', noteArgs());
  const scopeCall = calls.at(-1);
  const scopeRejected = assert.rejects(byScope, /SESSION/);
  await seed(client, calls, snapshot({ scope: 'scope-2' }));
  await scopeRejected;
  scopeCall.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null);

  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const byTrack = client.command('recordingMarkTake', noteArgs());
  const trackCall = calls.at(-1);
  const trackRejected = assert.rejects(byTrack, /SESSION/);
  await seed(client, calls, snapshot({ tracks: [{ index: 0, id: 't0', name: 'Renamed', arm: false, canArm: true, solo: false, mute: false }] }));
  await trackRejected;
  trackCall.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null);
  assert.equal(calls.filter(entry => entry.cmd === 'recordingMarkTake').length, 4, 'no replay');
});

test('one note at a time, and a timeout never replays the write', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());

  const writing = client.command('recordingMarkTake', noteArgs());
  await assert.rejects(client.command('recordingMarkTake', noteArgs()), /BUSY/);
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 1);
  calls.at(-1).cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await writing;
});

test('a timed out note fails once and is never sent again', async t => {
  const { client, calls } = setup(t, { timeoutMs: 10 });
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  await assert.rejects(client.command('recordingMarkTake', noteArgs()), /UNKNOWN/);
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 1, 'no queued retry');
  assert.equal(client.view().noteBusy, false);
});

test('a rejected catalog read reports the reason and sends nothing twice', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const reading = client.command('getRecordingTakes', { scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 });
  calls.at(-1).cb({ ok: false, error: 'REC:TAKE_RANGE' });
  await assert.rejects(reading, /TAKE_RANGE/);
  assert.equal(calls.filter(call => call.cmd === 'getRecordingTakes').length, 1);
});

test('a catalog read needs the current scope and never writes', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  await assert.rejects(
    client.command('getRecordingTakes', { scope: 'other-scope', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 }),
    /SESSION/,
  );
  assert.equal(calls.filter(call => call.cmd === 'getRecordingTakes').length, 0);
});

test('the reserved CUE route reads without a write and without an interface', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'viewer');
  await seed(client, calls, snapshot());
  const reading = client.command('getRecordingCueState', { scope: 'scope-1', returnTrack: null, offset: 0 });
  const call = calls.at(-1);
  assert.equal(call.cmd, 'getRecordingCueState');
  assert.deepEqual(wire(call.args), { scope: 'scope-1', returnTrack: null, offset: 0 });
  call.cb({ ok: true, result: { scope: 'scope-1', returns: [], returnTrack: null, tracks: [] } });
  const result = await reading;
  assert.equal(result.scope, 'scope-1');
  assert.equal(client.view().state.tracks[0].name, 'Trk', 'the CUE read never becomes an observation');
});

test('the CUE route accepts only its own exact request', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'viewer');
  await seed(client, calls, snapshot());
  const refused = [
    { scope: 'scope-1', returnTrack: null },
    { scope: 'scope-1', returnTrack: null, offset: 0, extra: true },
    { scope: 'scope-1', returnTrack: { index: 0, id: 't0' }, offset: 0 },
    { scope: 'scope-1', returnTrack: null, offset: -1 },
    { scope: '', returnTrack: null, offset: 0 },
  ];
  for (const args of refused) {
    await assert.rejects(client.command('getRecordingCueState', args), /ARGUMENTS/);
  }
  assert.equal(calls.filter(call => call.cmd === 'getRecordingCueState').length, 0);
});

test('a read reply is refused when the world it was asked in no longer holds', async t => {
  const holder = { value: dataView() };
  const { client, replies } = dataClient(holder);
  const request = { scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 };
  const renamed = { scope: 'scope-1', tracks: [{ index: 0, id: 't0', name: 'Renamed' }] };
  const worlds = [
    ['a new connection', dataView({ connectionEpoch: 8 })],
    ['another role', dataView({ role: 'controller' })],
    ['another scope', dataView({ state: { scope: 'scope-2', tracks: [{ index: 0, id: 't0', name: 'Trk' }] } })],
    ['another track', dataView({ state: renamed })],
  ];
  for (const [label, world] of worlds) {
    holder.value = dataView();
    const reading = client.command('getRecordingTakes', request);
    holder.value = world;
    replies.pop()({ ok: true, result: catalog() });
    await assert.rejects(reading, /SESSION/, label);
  }
});

test('a read reply for another track never answers the question that was asked', async t => {
  const holder = { value: dataView() };
  const { client, replies } = dataClient(holder);
  const reading = client.command('getRecordingTakes', { scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 });
  replies.pop()({ ok: true, result: catalog({ track: { index: 1, id: 't9', name: 'Other' } }) });
  await assert.rejects(reading, /SESSION/);
});

test('a note reply after Live moved on never reports success', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const writing = client.command('recordingMarkTake', noteArgs());
  const call = calls.at(-1);
  await seed(client, calls, snapshot({
    transport: { connected: true, isPlaying: field(true), recordMode: field(false) },
  }));
  call.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await assert.rejects(writing, /SESSION/);
  assert.equal(client.view().noteResult, null, 'an unconfirmed mark is never a confirmed one');
});

test('a locally retired note never reports success and is never replayed', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const writing = client.command('recordingMarkTake', noteArgs());
  const call = calls.at(-1);
  const rejected = assert.rejects(writing, /REC:(NOTE_CANCELED|SESSION)/);
  assert.equal(client.cancelData(), true, 'the caller retires the note it no longer wants');
  await rejected;
  call.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult, null);
  assert.equal(calls.filter(entry => entry.cmd === 'recordingMarkTake').length, 1, 'no replay');
});

test('the note paints its busy state at once and releases it when it ends', async t => {
  const { client, calls, renders } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const before = renders.length;
  const writing = client.command('recordingMarkTake', noteArgs());
  assert.ok(renders.length > before, 'the note start repaints the page at once');
  assert.equal(client.view().noteBusy, true);
  calls.at(-1).cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await writing;
  assert.equal(client.view().noteBusy, false);
});

test('a cancelled note leaves the path free for a new attempt', async t => {
  const { client, calls } = setup(t);
  client.session(true, 'controller');
  await seed(client, calls, snapshot());
  const first = client.command('recordingMarkTake', noteArgs());
  const firstCall = calls.at(-1);
  const rejected = assert.rejects(first, /REC:(NOTE_CANCELED|SESSION)/);
  client.cancelData();
  await rejected;

  const second = client.command('recordingMarkTake', noteArgs());
  assert.equal(calls.filter(call => call.cmd === 'recordingMarkTake').length, 2, 'a new attempt is a new write');
  calls.at(-1).cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'good' } } });
  await second;
  assert.equal(client.view().noteResult.clip.mark, 'good');

  firstCall.cb({ ok: true, result: { scope: 'scope-1', clip: { ...CLIP, mark: 'review' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.view().noteResult.clip.mark, 'good', 'a retired reply never replaces the new result');
});
