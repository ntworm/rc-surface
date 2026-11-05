// Copyright Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source:https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('./modules/recording-arrangement-model.js', import.meta.url), 'utf8');

function loadNamespace() {
  const context = vm.createContext({});
  vm.runInContext(SOURCE, context, { filename: 'recording-arrangement-model.js' });
  return context.RcRecordingArrangement;
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function flush() {
  return new Promise((resolve) => { setImmediate(resolve); });
}

function range(count) {
  return Array.from({ length: count }, (unused, index) => index);
}

function clipAt(index) {
  return { index, id: 'clip-' + index, name: 'Clip ' + index, startTime: 0, endTime: 64 };
}

function catalog(track, offset, clips, next) {
  return { scope: 'rec', track: { ...track }, clips, page: { offset, next } };
}

function defaultBehaviour(overrides) {
  return {
    arrangement(track, offset) {
      return Promise.resolve(catalog(track, offset, [], null));
    },
    waveform(track, clip, startTime, endTime) {
      return Promise.resolve({
        scope: 'rec', track: { ...track }, clip: { ...clip },
        startTime, endTime, peaks: [0.5]
      });
    },
    ...overrides
  };
}

function clippedBehaviour(overrides) {
  return defaultBehaviour({
    arrangement(track, offset) {
      return Promise.resolve(catalog(track, offset, [clipAt(0)], null));
    },
    ...overrides
  });
}

function createStubReads(behaviour) {
  const calls = [];
  return {
    calls,
    arrangementCalls() { return calls.filter((call) => call.kind === 'arrangement'); },
    waveformCalls() { return calls.filter((call) => call.kind === 'waveform'); },
    readArrangement(track, offset) {
      calls.push({ kind: 'arrangement', track: { ...track }, offset });
      return behaviour.arrangement(track, offset);
    },
    readWaveform(track, clip, startTime, endTime) {
      calls.push({ kind: 'waveform', track: { ...track }, clip: { ...clip }, startTime, endTime });
      return behaviour.waveform(track, clip, startTime, endTime);
    },
    cancel() { calls.push({ kind: 'cancel' }); }
  };
}

function baseView() {
  const stopped = { value: false, fresh: true, observedAt: 1 };
  return {
    connected: true, role: 'rec', connectionEpoch: 7,
    fresh: true, busy: false, writable: true,
    state: {
      scope: 'session',
      tracks: [],
      transport: { connected: true, isPlaying: { ...stopped }, recordMode: { ...stopped } },
      attemptActive: false
    }
  };
}

async function setup(behaviour, options) {
  const config = options || {};
  const view = baseView();
  const track = { index: 0, id: 'a', name: 'A' };
  const reads = createStubReads(behaviour);
  const changes = { count: 0 };
  const model = loadNamespace().createRowsModel({
    reads,
    getView: () => view,
    onChange: () => { changes.count += 1; }
  });
  if (config.load !== false) {
    model.update(view, [track], false);
    await model.load(track);
  }
  return { model, reads, changes, view, track };
}

test('the shared namespace exposes the rows model factory', () => {
  const namespace = loadNamespace();
  assert.equal(typeof namespace.createRowsModel, 'function');
  const model = namespace.createRowsModel({ reads: createStubReads(defaultBehaviour()) });
  const api = ['update', 'row', 'load', 'refresh', 'more', 'back', 'waveform', 'peaksFor', 'extent', 'cancel'];
  api.forEach((name) => { assert.equal(typeof model[name], 'function'); });
});

test('automatic catalog loads stop at four in flight and eight per entry', async () => {
  const gates = [];
  const behaviour = defaultBehaviour({
    arrangement(track, offset) {
      const gate = deferred();
      gates.push({ gate, track, offset });
      return gate.promise;
    }
  });
  const { model, reads, view } = await setup(behaviour, { load: false });
  const tracks = range(12).map((index) => ({ index, id: 't' + index, name: 'T' + index }));
  const release = () => gates.splice(0).forEach((entry) => {
    entry.gate.resolve(catalog(entry.track, entry.offset, [clipAt(0)], null));
  });

  model.update(view, tracks, true);
  assert.equal(reads.arrangementCalls().length, 4);
  release();
  await flush();
  model.update(view, tracks, true);
  assert.equal(reads.arrangementCalls().length, 8);
  release();
  await flush();
  model.update(view, tracks, true);
  assert.equal(reads.arrangementCalls().length, 8);
  assert.equal(model.row(tracks[11]).status, 'idle');

  const pending = model.load(tracks[11]);
  release();
  await pending;
  assert.equal(model.row(tracks[11]).status, 'ready');
});

test('a failed automatic load is not retried by a later update', async () => {
  const behaviour = defaultBehaviour({
    arrangement() {
      const err = new Error('catalog failed');
      err.code = 'REC_TIMEOUT';
      return Promise.reject(err);
    }
  });
  const { model, reads, view, track } = await setup(behaviour, { load: false });

  model.update(view, [track], true);
  await flush();
  assert.equal(model.row(track).status, 'error');
  assert.equal(model.row(track).error.code, 'REC_TIMEOUT');
  model.update(view, [track], true);
  await flush();
  assert.equal(reads.arrangementCalls().length, 1);
  await model.load(track);
  assert.equal(reads.arrangementCalls().length, 2);
});

test('only the supplied visible tracks are loaded', async () => {
  const { model, reads, view, track } = await setup(defaultBehaviour(), { load: false });
  view.state.tracks = [track, { index: 1, id: 'hidden', name: 'H' }];
  model.update(view, [track], true);
  await flush();
  assert.equal(reads.arrangementCalls().length, 1);
  assert.equal(model.row({ index: 1, id: 'hidden', name: 'H' }).status, 'idle');
});

test('manual paging uses offset zero, the next offset and offset minus sixty four', async () => {
  const behaviour = defaultBehaviour({
    arrangement(track, offset) {
      return Promise.resolve(catalog(track, offset, [clipAt(0)], offset === 0 ? 64 : null));
    }
  });
  const { model, reads, view, track } = await setup(behaviour, { load: false });
  const offsets = () => reads.arrangementCalls().map((call) => call.offset).join(',');

  model.update(view, [track], false);
  assert.equal(model.row(track).status, 'idle');
  await model.load(track);
  assert.equal(offsets(), '0');
  assert.equal(model.row(track).page.offset, 0);
  await model.more(track);
  assert.equal(offsets(), '0,64');
  assert.equal(model.row(track).page.offset, 64);
  await model.back(track);
  assert.equal(offsets(), '0,64,0');
  await model.refresh(track);
  assert.equal(offsets(), '0,64,0,0');
});

test('more is a no-op when the catalog page has no next offset', async () => {
  const { model, reads, track } = await setup(defaultBehaviour());
  const before = reads.arrangementCalls().length;
  await model.more(track);
  assert.equal(reads.arrangementCalls().length, before);
  assert.equal(model.row(track).page.offset, 0);
  assert.equal(model.row(track).status, 'empty');
});

test('a row snapshot carries one native page with an explicit status', async () => {
  const clips = range(64).map((index) => ({
    index, id: 'c' + index, name: 'C' + index, startTime: index * 4, endTime: index * 4 + 4
  }));
  const behaviour = defaultBehaviour({
    arrangement(track, offset) {
      return Promise.resolve(catalog(track, offset, clips, 64));
    }
  });
  const { model, track } = await setup(behaviour);
  const snapshot = model.row(track);
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.clips.length, 64);
  assert.deepEqual(snapshot.page, { offset: 0, next: 64 });
  assert.deepEqual(snapshot.track, { index: 0, id: 'a', name: 'A' });
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.waveformBusy, false);
  assert.equal(model.extent(), 256);
  snapshot.clips[0].name = 'changed';
  snapshot.page.offset = 99;
  const again = model.row(track);
  assert.equal(again.clips[0].name, 'C0');
  assert.equal(again.page.offset, 0);
});

test('identity and world changes retire the cached row', async () => {
  const { model, view, track } = await setup(clippedBehaviour());
  assert.equal(model.row(track).status, 'ready');
  model.update(view, [{ index: 0, id: 'a', name: 'B' }], false);
  assert.equal(model.row({ index: 0, id: 'a', name: 'B' }).status, 'idle');
  assert.equal(model.row({ index: 0, id: 'a', name: 'B' }).clips.length, 0);
  model.update(view, [{ index: 3, id: 'a', name: 'B' }], false);
  assert.equal(model.row({ index: 3, id: 'a', name: 'B' }).status, 'idle');
  const other = { ...view, connectionEpoch: 8 };
  model.update(other, [{ index: 3, id: 'a', name: 'B' }], false);
  assert.equal(model.row({ index: 3, id: 'a', name: 'B' }).status, 'idle');
  const live = { ...other, role: 'live' };
  model.update(live, [{ index: 3, id: 'a', name: 'B' }], false);
  assert.equal(model.row({ index: 3, id: 'a', name: 'B' }).status, 'idle');
});

test('a late catalog completion after cancel does not revive the row', async () => {
  const gate = deferred();
  const behaviour = defaultBehaviour({ arrangement: () => gate.promise });
  const { model, reads, view, track } = await setup(behaviour, { load: false });
  model.update(view, [track], true);
  await flush();
  assert.equal(reads.arrangementCalls().length, 1);
  model.cancel();
  gate.resolve(catalog(track, 0, [clipAt(0)], null));
  await flush();
  assert.equal(model.row(track).status, 'idle');
  assert.equal(model.row(track).clips.length, 0);
  assert.equal(reads.calls.filter((call) => call.kind === 'cancel').length, 1);
});

test('at most thirty two track rows stay cached', async () => {
  const { model, view } = await setup(clippedBehaviour(), { load: false });
  const tracks = range(40).map((index) => ({ index, id: 't' + index, name: 'T' + index }));
  for (const track of tracks) {
    model.update(view, [track], false);
    await model.load(track);
  }
  assert.equal(tracks.filter((track) => model.row(track).status === 'ready').length, 32);
});

test('at most sixteen waveform intervals stay cached', async () => {
  const { model, track } = await setup(clippedBehaviour());
  for (let index = 0; index < 20; index += 1) {
    await model.waveform(track, clipAt(0), index, index + 4);
  }
  assert.equal(model.peaksFor(track, clipAt(0)).length, 16);
});

test('waveform previews need a connected, fresh and stopped transport', async () => {
  const { model, reads, view, track } = await setup(clippedBehaviour());
  const clip = clipAt(0);
  view.connected = false;
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.connected = true;
  view.fresh = false;
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.fresh = true;
  view.state.transport.isPlaying = { value: true, fresh: true, observedAt: 2 };
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.state.transport.isPlaying = { value: false, fresh: false, observedAt: 2 };
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.state.transport.isPlaying = { value: false, fresh: true, observedAt: 2 };
  view.state.transport.recordMode = { value: true, fresh: true, observedAt: 2 };
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.state.transport.recordMode = { value: false, fresh: true, observedAt: 2 };
  view.state.attemptActive = true;
  assert.equal(await model.waveform(track, clip, 0, 8), null);
  view.state.attemptActive = false;
  assert.equal(reads.waveformCalls().length, 0);
  const interval = await model.waveform(track, clip, 0, 8);
  assert.equal(reads.waveformCalls().length, 1);
  assert.deepEqual(interval.peaks, [0.5]);
  assert.deepEqual(model.peaksFor(track, clip), [interval]);
  assert.equal(await model.waveform(track, clip, 0, 129), null);
  assert.equal(await model.waveform(track, clip, 0, 65), null);
  assert.equal(await model.waveform(track, clipAt(9), 0, 8), null);
  assert.equal(reads.waveformCalls().length, 1);
});

test('a failed preview keeps the native clip row and page visible', async () => {
  const behaviour = clippedBehaviour({
    waveform() {
      const err = new Error('preview failed');
      err.code = 'REC_TIMEOUT';
      return Promise.reject(err);
    }
  });
  const { model, track } = await setup(behaviour);
  const before = model.row(track);
  assert.equal(await model.waveform(track, clipAt(0), 0, 8), null);
  const after = model.row(track);
  assert.equal(after.status, 'ready');
  assert.equal(after.clips.length, before.clips.length);
  assert.equal(after.page.offset, 0);
  assert.equal(after.waveformBusy, false);
  assert.deepEqual(model.peaksFor(track, clipAt(0)), []);
});

test('the supplied REC view is never mutated', async () => {
  const { model, view, track } = await setup(clippedBehaviour(), { load: false });
  const before = JSON.stringify(view);
  model.update(view, [track], true);
  await flush();
  await model.load(track);
  await model.waveform(track, clipAt(0), 0, 8);
  assert.equal(JSON.stringify(view), before);
});

test('a renamed or moved clip never revives the peaks of its former self', async () => {
  let current = clipAt(0);
  const behaviour = defaultBehaviour({
    arrangement(track, offset) {
      return Promise.resolve(catalog(track, offset, [current], null));
    }
  });
  const { model, reads, track } = await setup(behaviour);
  const interval = await model.waveform(track, current, 0, 8);
  assert.deepEqual(interval.peaks, [0.5]);
  assert.deepEqual(model.peaksFor(track, current), [interval]);
  const cached = await model.waveform(track, current, 0, 8);
  assert.deepEqual(cached, interval, 'the same clip reads its preview from the cache');
  assert.equal(reads.waveformCalls().length, 1, 'a cache hit never asks again');
  // The host renamed the clip: the same id and index, a different clip.
  current = { ...current, name: 'Renamed clip' };
  await model.refresh(track);
  assert.deepEqual(model.peaksFor(track, current), [], 'a renamed clip keeps no peaks');
  // The host moved the clip.
  current = { ...current, startTime: 16, endTime: 80 };
  await model.refresh(track);
  assert.deepEqual(model.peaksFor(track, current), [], 'a moved clip keeps no peaks');
  const fresh = await model.waveform(track, current, 16, 24);
  assert.deepEqual(fresh.peaks, [0.5]);
  assert.equal(reads.waveformCalls().length, 2, 'the moved clip reads its own preview');
});

test('every catalog request shares the bound of four in flight', async () => {
  const gates = [];
  const behaviour = defaultBehaviour({
    arrangement(track, offset) {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    }
  });
  const { model, reads, view } = await setup(behaviour, { load: false });
  const tracks = range(6).map((index) => ({ index, id: 't' + index, name: 'T' + index }));
  model.update(view, tracks, true);
  await flush();
  assert.equal(reads.arrangementCalls().length, 4);
  const refused = await model.load(tracks[4]);
  assert.equal(refused, null, 'a manual load never exceeds the bound');
  assert.equal(reads.arrangementCalls().length, 4);
  gates.splice(0).forEach((gate) => gate.resolve(catalog(tracks[0], 0, [clipAt(0)], null)));
  await flush();
  const pending = model.load(tracks[4]);
  assert.equal(reads.arrangementCalls().length, 5, 'a manual load runs once a slot is free');
  gates.splice(0).forEach((gate) => gate.resolve(catalog(tracks[4], 0, [clipAt(0)], null)));
  await pending;
  assert.equal(model.row(tracks[4]).status, 'ready');
});

test('a cache of busy rows refuses a new row instead of growing', async () => {
  const gates = [];
  const behaviour = clippedBehaviour({
    waveform() {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    }
  });
  const { model, reads, view } = await setup(behaviour, { load: false });
  const tracks = range(32).map((index) => ({ index, id: 't' + index, name: 'T' + index }));
  for (const track of tracks) {
    model.update(view, [track], false);
    await model.load(track);
  }
  // Every row owns a pending preview, so no row can be dropped.
  for (const track of tracks) model.waveform(track, clipAt(0), 0, 8);
  await flush();
  const extra = { index: 99, id: 'extra', name: 'Extra' };
  model.update(view, [extra], false);
  const before = reads.arrangementCalls().length;
  assert.equal(await model.load(extra), null, 'a refused row never reads');
  assert.equal(reads.arrangementCalls().length, before);
  gates.splice(0).forEach((gate) => gate.resolve({ scope: 'rec', track: clipAt(0), startTime: 0, endTime: 8, peaks: [0.5] }));
  await flush();
  const admitted = await model.load(extra);
  assert.ok(admitted, 'a free row is admitted again');
});

test('onChange fires only when local data changes', async () => {
  const { model, changes, view, track } = await setup(clippedBehaviour(), { load: false });
  model.update(view, [track], true);
  assert.equal(changes.count, 0);
  await flush();
  assert.equal(changes.count, 1);
  await model.waveform(track, clipAt(0), 0, 8);
  assert.equal(changes.count, 2);
});
