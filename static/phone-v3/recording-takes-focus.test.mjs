// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The take focus adapter.
//
// The tests use a stub client and a small fake DOM. They never talk to
// Live: they check what the phone sends, what it keeps and what it
// refuses. Nothing here plays a sound and nothing here names a take.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const TAKES_SOURCE = readFileSync(new URL('./modules/recording-takes.js', import.meta.url), 'utf8');
const FOCUS_SOURCE = readFileSync(new URL('./modules/recording-takes-focus.js', import.meta.url), 'utf8');

const TRACKS = [
  { index: 0, id: 'track-0', name: 'Kick' },
  { index:  1, id: 'track-1', name: 'Snare' },
  { index:  2, id: 'group-2', name: 'Drums', isGroup: true },
];

const LANES = [
  {
    index: 0, id: 'lane-0', name: 'Lane 1',
    clips: [
      { index: 0, id: 'clip-0', name: 'Take 1', startTime: 0, endTime: 4, mark: 'good', reference: 'ref-0' },
      { index: 1, id: 'clip-1', name: 'Take 2', startTime: 4, endTime: 8, mark: null, reference: 'ref-1' },
    ],
  },
  {
    index: 1, id: 'lane-1', name: 'Lane 2',
    clips: [
      { index: 0, id: 'clip-2', name: 'Take 3', startTime: 2, endTime: 6, mark: null, reference: 'ref-2' },
    ],
  },
];

const IDS = [
  'rec-takes', 'rec-takes-track', 'rec-takes-reload', 'rec-takes-status',
  'rec-takes-list', 'rec-takes-target', 'rec-take-good', 'rec-take-review',
  'rec-take-clear', 'rec-takes-back', 'rec-takes-next', 'rec-takes-page',
];

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.dataset = {};
    this.attributes = {};
    this.handlers = {};
    this.children = [];
    this.value = '';
    this.disabled = false;
  }

  appendChild(node) { this.children.push(node); return node; }

  replaceChildren(...nodes) { this.children = nodes; }

  setAttribute(name, value) { this.attributes[name] = value; }

  addEventListener(name, handler) {
    this.handlers[name] = [...(this.handlers[name] || []), handler];
  }

  click() {
    for (const handler of this.handlers.click || []) handler({ type: 'click' });
  }
}

function fakeDoc() {
  const elements = new Map(IDS.map(id => [id, new FakeNode('div')]));
  return {
    elements,
    createElement: tag => new FakeNode(tag),
    getElementById: id => elements.get(id) || null,
  };
}

class StubClient {
  constructor(view) {
    this.current = view;
    this.commands = [];
    this.cancelled = 0;
  }

  view() { return this.current; }

  setView(view) { this.current = view; }

  cancelData() { this.cancelled += 1; }

  command(name, request) {
    const entry = { name, request, resolve: null, reject: null };
    const promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    this.commands.push(entry);
    return promise;
  }

  names() { return this.commands.map(command => command.name); }

  last() { return this.commands[this.commands.length - 1]; }
}

function makeView(overrides) {
  const view = {
    connectionEpoch: 1, role: 'note', noteWritable: true, noteBusy: false,
    state: { scope: 'session', tracks: TRACKS, meter: { numerator: 4, denominator: 4 } },
  };
  return { ...view, ...(overrides || {}) };
}

function loadModules() {
  globalThis.RcSurfaceI18n = { t: key => key, getLocale: () => 'en' };
  runInThisContext(FOCUS_SOURCE, { filename: 'recording-takes-focus.js' });
  runInThisContext(TAKES_SOURCE, { filename: 'recording-takes.js' });
}

function harness(options) {
  const source = options || {};
  const doc = fakeDoc();
  const client = new StubClient(makeView(source.view));
  const list = globalThis.RcRecordingTakes.setup({ client, doc });
  return { list, client, doc };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function catalog(track) {
  return {
    scope: 'session',
    track: { index: track.index, id: track.id, name: track.name },
    lanes: LANES,
    page: { laneOffset: 0, clipOffset: 0, next: null },
  };
}

async function focused(options) {
  const source = options || {};
  const made = harness(source);
  made.list.openFocus({ track: TRACKS[0], range: source.range || null });
  made.client.last().resolve(catalog(TRACKS[0]));
  await flush();
  return made;
}

loadModules();

test('the focus reads only the first page of the exact track', async () => {
  const { list, client } = harness();
  assert.equal(list.openFocus({ track: TRACKS[0], range: null }), true);
  assert.deepEqual(client.names(), ['getRecordingTakes']);
  assert.deepEqual(client.last().request, {
    scope: 'session',
    track: { index: 0, id: 'track-0', name: 'Kick' },
    laneOffset: 0,
    clipOffset: 0,
  });
  const state = list.focusState();
  assert.deepEqual(state.track, { index: 0, id: 'track-0', name: 'Kick' });
  assert.equal(state.range, null);
  assert.equal(state.inspectionRange, null);
  assert.equal(state.selection, null);
  state.track.name = 'Changed';
  assert.equal(list.focusState().track.name, 'Kick');
});

test('the focus refuses a track Live does not show', () => {
  const { list, client } = harness();
  const wrong = [
    { index: 9, id: 'ghost', name: 'Ghost' },
    { index: 0, id: 'track-0', name: 'Renamed' },
    { index: 0, id: 'other', name: 'Kick' },
    TRACKS[2],
    null,
  ];
  for (const track of wrong) assert.equal(list.openFocus({ track, range: null }), false);
  assert.deepEqual(client.names(), []);
});

test('the focus refuses a range that is not finite, nonnegative and ordered', () => {
  const { list, client } = harness();
  const wrong = [
    { startTime: 4, endTime: 2 },
    { startTime: 2, endTime: 2 },
    { startTime: -1, endTime: 2 },
    { startTime: 0, endTime: Infinity },
    { startTime: 'a', endTime: 2 },
  ];
  for (const range of wrong) assert.equal(list.openFocus({ track: TRACKS[0], range }), false);
  assert.deepEqual(client.names(), []);
});

test('the visible lanes keep the native order and only the clips of the range', async () => {
  const { list } = await focused({ range: { startTime: 1, endTime: 3 } });
  const lanes = list.visibleLanes();
  assert.deepEqual(lanes.map(lane => lane.id), ['lane-0', 'lane-1']);
  assert.deepEqual(lanes.map(lane => lane.name), ['Lane 1', 'Lane 2']);
  assert.deepEqual(lanes[0].clips.map(clip => clip.reference), ['ref-0']);
  assert.deepEqual(lanes[1].clips.map(clip => clip.reference), ['ref-2']);
});

test('a phrase stays inside the source range and the range stays fixed', async () => {
  const { list } = await focused({ range: { startTime: 0, endTime: 8 } });
  assert.equal(list.setInspectionRange({ startTime: 1, endTime: 2 }), true);
  assert.deepEqual(list.focusState().inspectionRange, { startTime: 1, endTime: 2 });
  assert.equal(list.setInspectionRange({ startTime: 7, endTime: 9 }), false);
  assert.equal(list.setInspectionRange({ startTime: 3, endTime: 3 }), false);
  assert.deepEqual(list.focusState().inspectionRange, { startTime: 1, endTime: 2 });
  assert.deepEqual(list.focusState().range, { startTime: 0, endTime: 8 });
  assert.equal(list.setInspectionRange(null), true);
  assert.equal(list.focusState().inspectionRange, null);
});

test('a focus on the whole track needs a chosen clip before a phrase', async () => {
  const { list } = await focused();
  assert.equal(list.setInspectionRange({ startTime: 1, endTime: 2 }), false);
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  assert.equal(list.setInspectionRange({ startTime: 1, endTime: 2 }), true);
  assert.equal(list.setInspectionRange({ startTime: 2, endTime: 9 }), false);
});

test('a choice sends nothing', async () => {
  const { list, client } = await focused();
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  assert.deepEqual(client.names(), ['getRecordingTakes']);
  assert.equal(list.focusState().selection.clip.reference, 'ref-0');
});

test('a choice is refused while a page is pending', async () => {
  const { list, doc } = await focused();
  list.reload();
  assert.equal(list.pending, true);
  doc.getElementById('rec-takes-list').children[1].click();
  assert.equal(list.focusState().selection, null);
});

test('a choice is refused when the clip is not in the catalog', async () => {
  const { list } = await focused();
  list.choose(
    { index: 0, id: 'lane-0', name: 'Lane 1' },
    { index: 9, id: 'clip-9', name: 'Ghost', startTime: 0, endTime: 1, reference: 'ref-9' },
  );
  assert.equal(list.focusState().selection, null);
});

test('a changed clip retires the pending note', async () => {
  const { list, client } = await focused();
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  list.mark('good');
  const mark = client.last();
  list.choose(lanes[0], lanes[0].clips[1]);
  assert.ok(client.cancelled >= 1);
  mark.resolve({ clip: { name: 'Take 1' } });
  await flush();
  assert.equal(list.focusState().selection.clip.reference, 'ref-1');
  assert.notEqual(list.status && list.status.key, 'takesMarked');
});

test('a changed phrase retires the pending note', async () => {
  const { list, client } = await focused({ range: { startTime: 0, endTime: 8 } });
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  list.mark('good');
  const mark = client.last();
  list.setInspectionRange({ startTime: 1, endTime: 2 });
  assert.ok(client.cancelled >= 1);
  mark.resolve({ clip: { name: 'Take 1' } });
  await flush();
  assert.notEqual(list.status && list.status.key, 'takesMarked');
  assert.equal(list.focusState().selection.clip.reference, 'ref-0');
});

test('a mark names the whole clip and never the phrase', async () => {
  const { list, client } = await focused({ range: { startTime: 0, endTime: 8 } });
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  list.setInspectionRange({ startTime: 1, endTime: 2 });
  list.mark('good');
  assert.equal(client.last().name, 'recordingMarkTake');
  assert.deepEqual(client.last().request, {
    scope: 'session',
    track: { index: 0, id: 'track-0', name: 'Kick' },
    lane: { index: 0, id: 'lane-0', name: 'Lane 1' },
    clip: { index: 0, id: 'clip-0', name: 'Take 1', startTime: 0, endTime: 4, reference: 'ref-0' },
    mark: 'good',
  });
});

test('a confirmed mark rereads the page and clears the selection', async () => {
  const { list, client } = await focused();
  const lanes = list.visibleLanes();
  list.choose(lanes[0], lanes[0].clips[0]);
  list.mark('good');
  const before = client.commands.length;
  client.last().resolve({ clip: { name: 'Take 1' } });
  await flush();
  assert.equal(list.focusState().selection, null);
  assert.equal(list.status.key, 'takesMarked');
  assert.equal(client.commands.length, before + 1);
  assert.equal(client.last().name, 'getRecordingTakes');
});

test('closing the focus retires the pending read', async () => {
  const { list, client } = harness();
  list.openFocus({ track: TRACKS[0], range: null });
  const read = client.last();
  list.closeFocus();
  assert.equal(list.focusState(), null);
  read.resolve(catalog(TRACKS[0]));
  await flush();
  assert.equal(list.focusState(), null);
  assert.equal(list.catalog, null);
  assert.equal(client.names().length, 1);
});

test('a new scope closes the focus without reading again', async () => {
  const { list, client } = await focused();
  client.setView(makeView({ state: { scope: 'other', tracks: TRACKS, meter: null } }));
  list.render();
  assert.equal(list.focusState(), null);
  assert.equal(client.names().filter(name => name === 'getRecordingTakes').length, 1);
});

test('a renamed track closes the focus without reading again', async () => {
  const { list, client } = await focused();
  const renamed = [{ index: 0, id: 'track-0', name: 'Renamed' }];
  client.setView(makeView({ state: { scope: 'session', tracks: renamed, meter: null } }));
  list.render();
  assert.equal(list.focusState(), null);
  assert.equal(client.names().filter(name => name === 'getRecordingTakes').length, 1);
});

test('without the helper the old list stays and the focus refuses', async () => {
  const helper = globalThis.RcRecordingTakesFocus;
  delete globalThis.RcRecordingTakesFocus;
  try {
    const { list, client, doc } = harness();
    assert.equal(list.openFocus({ track: TRACKS[0], range: null }), false);
    assert.deepEqual(client.names(), []);
    doc.getElementById('rec-takes-track').value = '0';
    list.chooseTrack();
    assert.deepEqual(client.names(), ['getRecordingTakes']);
    client.last().resolve(catalog(TRACKS[0]));
    await flush();
    assert.deepEqual(list.visibleLanes().map(lane => lane.id), ['lane-0', 'lane-1']);
  } finally {
    globalThis.RcRecordingTakesFocus = helper;
  }
});

test('the observer is told the copied local state', async () => {
  const { list, client } = harness();
  const seen = [];
  list.setOnRender(state => seen.push(state));
  list.openFocus({ track: TRACKS[0], range: null });
  client.last().resolve(catalog(TRACKS[0]));
  await flush();
  assert.ok(seen.length > 0);
  const last = seen[seen.length - 1];
  assert.deepEqual(last.track, { index: 0, id: 'track-0', name: 'Kick' });
  assert.equal(last.selection, null);
});

test('an observer that renders again does not loop', () => {
  const { list } = harness();
  let calls = 0;
  list.setOnRender(() => {
    calls += 1;
    list.render();
  });
  list.render();
  assert.equal(calls, 1);
});
