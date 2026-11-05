// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const MODEL = readFileSync(new URL('./modules/recording-arrangement-model.js', import.meta.url), 'utf8');
const UI = readFileSync(new URL('./modules/recording-arrangement.js', import.meta.url), 'utf8');

function loadContext(options) {
  const config = options || {}, context = vm.createContext({setTimeout, clearTimeout, Date});
  const map = config.i18n; if (map) context.RcSurfaceI18n = { t(name) { return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : name; } };
  vm.runInContext(MODEL, context, { filename: 'recording-arrangement-model.js' });
  vm.runInContext(UI, context, { filename: 'recording-arrangement.js' });
  return context;
}

async function flush() { for (let index = 0; index < 2; index += 1) await new Promise((resolve) => { setTimeout(resolve, 0); }); }

function element(tag) {
  return {
    tagName: tag, className: '', textContent: '', style: {}, dataset: {}, children: [],
    parentNode: null, hidden: false, disabled: false, tabIndex: -1, listeners: new Map(), attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; },
    querySelector(selector) {
      const want = String(selector).replace('.', '');
      const walk = (node) => node.children.reduce((hit, child) => hit || (String(child.className).split(' ').includes(want) ? child : walk(child)), null);
      return walk(this);
    }
  };
}

function clipAt(index, start, end, name) { return { index, id: 'clip-' + index, name: name || 'Clip ' + index, startTime: start, endTime: end }; }

function view() {
  const stopped = { value: false, fresh: true, observedAt: 1 };
  const state = { scope: 'song', tracks: [], transport: { connected: true, isPlaying: { ...stopped }, recordMode: { ...stopped } }, attemptActive: false };
  return { connected: true, role: 'controller', connectionEpoch: 7, fresh: true, busy: false, writable: true, state };
}

function harness(options) {
  const config = options || {};
  const context = loadContext(config);
  const namespace = context.RcRecordingArrangement;
  const calls = { arrangement: [], waveform: [], cancel: 0 }, pending = { arrangement: [], waveform: [] };
  let clips = config.clips || [clipAt(0, 8, 24)];
  const reads = {
    readArrangement(track, offset) {
      calls.arrangement.push({ track, offset });
      const result = { scope: 'rec', track, clips, page: { offset, next: null } };
      if (config.failArrangement) return Promise.reject(new Error(config.failArrangement));
      if (config.deferArrangement) return new Promise((resolve) => { pending.arrangement.push(() => resolve(result)); });
      return Promise.resolve(result);
    },
    readWaveform(track, clip, startTime, endTime) {
      calls.waveform.push({ track, clip, startTime, endTime });
      const result = { scope: 'rec', track, clip, startTime, endTime, peaks: config.peaks || [0.5, 1] };
      if (config.deferWaveform) return new Promise((resolve) => { pending.waveform.push(() => resolve(result)); });
      return Promise.resolve(result);
    },
    cancel() { calls.cancel += 1; }
  };
  const current = view();
  const client = { arrangement: reads, view: () => current };
  const doc = { createElement: (tag) => element(tag) };
  const geometry = { start: 0, end: 64, trackWidth: 640, trackLeft: 48, scrollLeft: 0 };
  const cards = new Map();
  const track = { index: 0, id: 'a', name: 'A' }, group = { index: 1, id: 'g', name: 'Group' };
  cards.set('a', { card: makeCard(false), lane: makeLane(), track });
  cards.set('g', { card: makeCard(true), lane: makeLane(), track: group });
  let paints = 0;
  let rows = null;
  // The harness mirrors the page: a repaint of the model keeps the pause
  // of the row, so a paused row never reads behind the pause.
  let paused = false;
  const onChange = () => { paints += 1; rows.update(current, cards, { active: true, paused }); };
  const api = namespace.setupRows({ client, doc, getGeometry: () => geometry, onChange });
  rows = { ...api, update: (view, nextCards, update) => { paused = Boolean(update && update.paused); api.update(view, nextCards, update); } };
  return { rows, cards, calls, current, doc, geometry, paints: () => paints,
    setClips: (next) => { clips = next; },
    resolveWaveform: () => { pending.waveform.forEach((resolve) => resolve()); pending.waveform = []; } };
}

async function ready(options, setup) {
  const h = harness(options);
  if (setup) setup(h);
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  return h;
}

function makeCard(group) { const card = element('article'); card.dataset.group = group ? 'true' : 'false'; card.getBoundingClientRect = () => ({ top: 0, bottom: 60, left: 0, right: 800 }); return card; }
function makeLane() { const lane = element('div'); lane.getBoundingClientRect = () => ({ top: 0, bottom: 60, left: 200, right: 800, width: 600 }); return lane; }

function clipNodes(lane) { const container = lane.querySelector('.rec-track-clips'); return container ? container.children : []; }

function barOf(lane) { return lane.querySelector('.rec-arrangement-bar'); }

function buttonOf(lane, className) { const bar = barOf(lane); return bar ? bar.children.find((child) => child.className === className) : null; }

function countByClass(node, className) { return node.children.filter((child) => String(child.className).split(' ').includes(className)).length; }

test('the row attests the exact source clip of the current world', async () => {
  const h = await ready();
  const track = h.cards.get('a').track;
  const clip = { index: 0, id: 'clip-0', name: 'Clip 0', startTime: 8, endTime: 24 };
  assert.equal(h.rows.hasSource(track, clip), true, 'the exact clip is the one of the cache');
  assert.equal(h.rows.hasSource(track, { ...clip, name: 'Renamed' }), false, 'a renamed clip is another clip');
  assert.equal(h.rows.hasSource(track, { ...clip, startTime: 9 }), false, 'a moved clip is another clip');
  assert.equal(h.rows.hasSource(track, { ...clip, endTime: 25 }), false, 'a longer clip is another clip');
  assert.equal(h.rows.hasSource(track, { index: 1, id: 'clip-1', name: 'Clip 1', startTime: 8, endTime: 24 }), false, 'another clip is not the source');
  assert.equal(h.rows.hasSource({ ...track, id: 'other' }, clip), false, 'another track owns no clip');
  assert.equal(h.rows.hasSource(track, null), false, 'no clip is no source');
});

test('the source follows the catalog that was read again and the world that owns it', async () => {
  const h = await ready();
  const track = h.cards.get('a').track;
  const clip = { index: 0, id: 'clip-0', name: 'Clip 0', startTime: 8, endTime: 24 };
  const reads = h.calls.arrangement.length;
  h.setClips([clipAt(0, 10, 30, 'Renamed')]);
  buttonOf(h.cards.get('a').lane, 'rec-arrangement-refresh').listeners.get('click')();
  await flush();
  assert.equal(h.calls.arrangement.length, reads + 1, 'the refresh is the read that changes the answer');
  assert.equal(h.rows.hasSource(track, clip), false, 'the changed metadata is another clip');
  assert.equal(h.rows.hasSource(track, { index: 0, id: 'clip-0', name: 'Renamed', startTime: 10, endTime: 30 }), true);
  h.setClips([clipAt(0, 8, 24, 'Other World')]);
  h.current.connectionEpoch = 13;
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(h.rows.hasSource(track, clip), false, 'the source of the old world is retired');
  assert.equal(h.rows.hasSource(track, { ...clip, name: 'Other World' }), true, 'the row answers for its own world');
});

test('a paused row keeps its cached source and reads no catalog again', async () => {
  const h = await ready();
  const track = h.cards.get('a').track;
  const clip = { index: 0, id: 'clip-0', name: 'Clip 0', startTime: 8, endTime: 24 };
  const reads = h.calls.arrangement.length;
  h.rows.update(h.current, h.cards, { active: true, paused: true });
  await flush();
  assert.equal(h.calls.arrangement.length, reads, 'a paused row reads no catalog');
  assert.equal(h.rows.hasSource(track, clip), true, 'the cached source survives the pause');
});

test('a paused row retires the source and the actions of a changed world', async () => {
  const changes = [['epoch', (current) => { current.connectionEpoch = 21; }], ['scope', (current) => { current.state.scope = 'clip'; }]];
  for (const [label, change] of changes) {
    const h = await ready();
    const track = h.cards.get('a').track;
    const clip = { index: 0, id: 'clip-0', name: 'Clip 0', startTime: 8, endTime: 24 };
    const lane = h.cards.get('a').lane;
    const reads = h.calls.arrangement.length;
    change(h.current);
    h.rows.update(h.current, h.cards, { active: true, paused: true });
    assert.equal(h.rows.hasSource(track, clip), false, label + ' retires the source');
    assert.equal(countByClass(lane, 'rec-arrangement-bar'), 0, label + ' retires the actions');
    await flush();
    assert.equal(h.calls.arrangement.length, reads, label + ' reads no catalog');
  }
});

test('the arrangement UI exposes its seam and augments the shared namespace', () => {
  const namespace = loadContext().RcRecordingArrangement;
  assert.equal(typeof namespace.setupRows, 'function');
  assert.equal(typeof namespace.createRowsModel, 'function');
  assert.equal(typeof namespace.createReads, 'undefined', 'the UI never replaces the frozen reads');
  const h = harness();
  ['update', 'geometryChanged', 'extent', 'setFocusHandler', 'hasSource', 'cancel'].forEach((name) => {
    assert.equal(typeof h.rows[name], 'function', name);
  });
});

test('only the visible ordinary tracks are read and the real clips are painted', async () => {
  const h = await ready();
  assert.equal(h.calls.arrangement.length, 1, 'a group owns no catalog read');
  assert.equal(h.calls.arrangement[0].track.id, 'a');
  const lane = h.cards.get('a').lane;
  const clips = clipNodes(lane);
  assert.equal(clips.length, 1);
  const container = lane.querySelector('.rec-track-clips');
  assert.equal(container.style.left, '48px', 'the lane follows the measured origin');
  assert.equal(container.style.width, '640px');
  const name = clips[0].querySelector('.rec-arrangement-clip-name');
  assert.equal(name.textContent, 'Clip 0', 'the clip keeps its exact name');
  assert.equal(clips[0].style.left, '80px', 'the clip follows the measured axis');
  assert.equal(clips[0].style.width, '160px', 'the clip uses its native interval');
  assert.equal(clips[0].getAttribute('role'), 'button');
});

test('a clip click reaches the take focus seam with the exact track and clip', async () => {
  const h = await ready();
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  const clip = clipNodes(h.cards.get('a').lane)[0];
  clip.listeners.get('click')();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].track.id, 'a');
  assert.equal(focus[0].clip.name, 'Clip 0');
  // The keyboard reaches the same seam.
  clip.listeners.get('keydown')({ key: 'Enter', preventDefault() {} });
  assert.equal(focus.length, 2);
});

test('an empty ordinary row offers the take seam with no clip', async () => {
  const h = await ready({ clips: [] });
  const lane = h.cards.get('a').lane;
  assert.equal(clipNodes(lane).length, 0);
  const takes = buttonOf(lane, 'rec-arrangement-takes');
  assert.ok(takes, 'the empty row keeps a take action');
  assert.equal(takes.hidden, false);
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  takes.listeners.get('click')();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].track.id, 'a');
  assert.equal(focus[0].clip, null);
});

test('the row actions reach the bounded model and never another channel', async () => {
  const h = await ready();
  const lane = h.cards.get('a').lane;
  const before = h.calls.arrangement.length;
  buttonOf(lane, 'rec-arrangement-refresh').listeners.get('click')();
  await flush();
  assert.equal(h.calls.arrangement.length, before + 1, 'a refresh is one catalog read');
  assert.equal(h.calls.arrangement.at(-1).offset, 0);
});

test('no preview is read on its own and the explicit action paints the real amplitudes', async () => {
  const h = await ready();
  assert.equal(h.calls.waveform.length, 0, 'a poll never reads a preview');
  const clip = clipNodes(h.cards.get('a').lane)[0];
  const wave = clip.querySelector('.rec-arrangement-clip-wave');
  wave.listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.length, 1);
  assert.equal(h.calls.waveform[0].startTime, 8);
  assert.equal(h.calls.waveform[0].endTime, 24);
  const peaks = clip.querySelector('.rec-arrangement-peaks');
  assert.ok(peaks, 'the returned interval is painted');
  assert.equal(peaks.style.left, '0px', 'the peaks start at the start of the clip');
  assert.equal(peaks.style.width, '160px');
  const bars = peaks.children;
  assert.equal(bars.length, 2);
  assert.equal(bars[0].style.height, '50%');
  assert.equal(bars[1].style.height, '100%');
});

test('a long clip asks for the visible part only and reports the limit', async () => {
  const h = await ready({ clips: [clipAt(0, 0, 4096)] }, (row) => { row.geometry.end = 4096; });
  const clip = clipNodes(h.cards.get('a').lane)[0];
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.length, 0, 'a clip longer than the bound is never stretched');
  const status = barOf(h.cards.get('a').lane).querySelector('.rec-arrangement-status');
  assert.match(status.textContent, /rec\.arrangementPreviewLimit/);
});

test('the arrangement rows retire with the world and the cancel of the coordinator', async () => {
  const h = await ready();
  h.rows.cancel();
  await flush();
  assert.equal(h.calls.cancel, 1, 'the cancel travels through the frozen reads');
  const reads = h.calls.arrangement.length;
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(h.calls.arrangement.length, reads, 'a cancelled entry reads nothing again');
});

test('a new world rebuilds the row and leaves a single widget on the lane', async () => {
  const h = await ready();
  const lane = h.cards.get('a').lane;
  assert.equal(countByClass(lane, 'rec-arrangement-bar'), 1);
  h.current.connectionEpoch = 8;
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(countByClass(lane, 'rec-arrangement-bar'), 1, 'the row of the old world is gone');
  assert.equal(countByClass(lane, 'rec-track-clips'), 1);
  assert.equal(clipNodes(lane).length, 1, 'the clips of the new world are painted');
});

test('a recreated card moves the widgets to the new lane', async () => {
  const h = await ready();
  const oldLane = h.cards.get('a').lane;
  const track = h.cards.get('a').track;
  const lane = makeLane();
  h.cards.set('a', { card: makeCard(false), lane, track });
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(countByClass(oldLane, 'rec-arrangement-bar'), 0, 'the old lane keeps no widget');
  assert.equal(countByClass(oldLane, 'rec-track-clips'), 0);
  assert.equal(countByClass(lane, 'rec-arrangement-bar'), 1, 'the widgets follow the new lane');
  assert.equal(countByClass(lane, 'rec-track-clips'), 1);
});

test('a reordered track keeps a single row on its lane', async () => {
  const h = await ready();
  const lane = h.cards.get('a').lane;
  const track = h.cards.get('a').track;
  h.cards.set('a', { card: makeCard(false), lane, track: { ...track, index: 5 } });
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(countByClass(lane, 'rec-arrangement-bar'), 1, 'the row of the old order is gone');
});

test('the activation and the preview follow the current clip metadata', async () => {
  const h = await ready();
  h.setClips([clipAt(0, 10, 30, 'Renamed')]);
  buttonOf(h.cards.get('a').lane, 'rec-arrangement-refresh').listeners.get('click')();
  await flush();
  const lane = h.cards.get('a').lane;
  const clip = clipNodes(lane)[0];
  assert.equal(clip.querySelector('.rec-arrangement-clip-name').textContent, 'Renamed');
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  clip.listeners.get('click')();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].clip.name, 'Renamed', 'the seam receives the current clip');
  assert.equal(focus[0].clip.startTime, 10);
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.at(-1).startTime, 10, 'the preview asks for the current range');
  assert.equal(h.calls.waveform.at(-1).endTime, 30);
});

test('a late preview after a cancel never reaches the row', async () => {
  const h = await ready({ deferWaveform: true });
  const lane = h.cards.get('a').lane;
  const clip = clipNodes(lane)[0];
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.length, 1);
  h.rows.cancel();
  await flush();
  h.resolveWaveform();
  await flush();
  const status = barOf(lane).querySelector('.rec-arrangement-status');
  assert.doesNotMatch(status.textContent, /arrangementPreviewRange|arrangementPreviewUnavailable/);
  assert.equal(countByClass(clip, 'rec-arrangement-peaks'), 0, 'the cancel retires the peaks');
});

test('a late preview of a retired world never reaches the row', async () => {
  const h = await ready({ deferWaveform: true });
  const lane = h.cards.get('a').lane;
  const clip = clipNodes(lane)[0];
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  h.current.connectionEpoch = 9;
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  h.resolveWaveform();
  await flush();
  const status = barOf(lane).querySelector('.rec-arrangement-status');
  assert.doesNotMatch(status.textContent, /arrangementPreviewRange|arrangementPreviewUnavailable/);
});

test('the peaks keep a constant count over many repaints', async () => {
  const h = await ready();
  const clip = clipNodes(h.cards.get('a').lane)[0];
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(countByClass(clip, 'rec-arrangement-peaks'), 1);
  for (let index = 0; index < 5; index += 1) {
    h.rows.update(h.current, h.cards, { active: true });
    await flush();
  }
  assert.equal(countByClass(clip, 'rec-arrangement-peaks'), 1, 'the DOM does not grow while the row polls');
  assert.equal(clip.querySelector('.rec-arrangement-peaks').children.length, 2);
});

test('the preview paints four beats into the clip and the silence stays zero', async () => {
  const h = await ready({ clips: [clipAt(32, 32, 64)], peaks: [0, 0.5] }, (row) => {
    row.geometry.scrollLeft = 408; row.geometry.trackLeft = -360; // the visual origin, the scroll is inside
  });
  const lane = h.cards.get('a').lane;
  const clip = clipNodes(lane)[0];
  clip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.length, 1);
  assert.equal(h.calls.waveform[0].startTime, 36, 'the preview starts four beats into the clip');
  const peaks = clip.querySelector('.rec-arrangement-peaks');
  assert.equal(peaks.style.left, '40px', 'four beats into the clip');
  assert.equal(peaks.style.width, '280px', 'the width is the real interval');
  assert.equal(peaks.children[0].style.height, '0%', 'a silence stays a silence');
  assert.equal(peaks.children[1].style.height, '50%');
});

test('the nested wave button never opens the take focus', async () => {
  const h = await ready();
  const clip = clipNodes(h.cards.get('a').lane)[0];
  const wave = clip.querySelector('.rec-arrangement-clip-wave');
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  clip.listeners.get('keydown')({ key: 'Enter', target: wave, preventDefault() {} });
  assert.equal(focus.length, 0, 'the keyboard of the wave button stays inside the wave');
  clip.listeners.get('click')({ target: wave });
  assert.equal(focus.length, 0, 'the pointer of the wave button stays inside the wave');
  clip.listeners.get('keydown')({ key: 'Enter', target: clip, preventDefault() {} });
  assert.equal(focus.length, 1, 'the clip itself opens the take focus');
});

test('the take action is offered for every ordinary row state', async () => {
  const offered = async (options) => {
    const h = await ready(options);
    return buttonOf(h.cards.get('a').lane, 'rec-arrangement-takes');
  };
  assert.equal((await offered()).hidden, false, 'a ready row keeps it');
  assert.equal((await offered({ clips: [] })).hidden, false, 'an empty row keeps it');
  assert.equal((await offered({ failArrangement: 'REC 0' })).hidden, false, 'a failed row keeps it');
  assert.equal((await offered({ deferArrangement: true })).hidden, false, 'a loading row keeps it');
  const group = await ready();
  assert.equal(group.cards.get('g').lane.children.length, 0, 'a group owns no row and no take action');
});

test('a clip name is painted as text and the status stays localized', async () => {
  const name = '<img src=x onerror="alert(1)">';
  const h = await ready({
    clips: [clipAt(0, 8, 24, name)],
    i18n: { 'rec.arrangementError': 'Catalog unavailable' }
  });
  const clip = clipNodes(h.cards.get('a').lane)[0];
  const label = clip.querySelector('.rec-arrangement-clip-name');
  assert.equal(label.textContent, name, 'the name is text');
  assert.equal(label.children.length, 0, 'the name is never markup');
});

test('the row never paints a raw error message', async () => {
  const h = await ready({
    failArrangement: 'REC 0 /private/track/path',
    i18n: { 'rec.arrangementError': 'Catalog unavailable' }
  });
  const status = barOf(h.cards.get('a').lane).querySelector('.rec-arrangement-status');
  assert.match(status.textContent, /Catalog unavailable/, 'the generic text is localized');
  assert.doesNotMatch(status.textContent, /REC 0/);
  assert.doesNotMatch(status.textContent, /private/);
});

test('a legacy canvas container is replaced by a real visible row', async () => {
  const legacy = element('canvas');
  legacy.className = 'rec-track-clips'; legacy.setAttribute('aria-hidden', 'true');
  const h = await ready(null, (row) => { row.cards.get('a').lane.appendChild(legacy); });
  const lane = h.cards.get('a').lane;
  const container = lane.querySelector('.rec-track-clips');
  assert.notEqual(container, legacy, 'the legacy canvas is never reused');
  assert.equal(String(container.tagName).toUpperCase(), 'DIV', 'the row is a real container');
  assert.equal(container.getAttribute('aria-hidden'), undefined, 'the row is never hidden');
  assert.equal(legacy.parentNode, null, 'the legacy canvas leaves the lane');
  const clip = container.children[0];
  assert.equal(clip.className, 'rec-arrangement-clip', 'the clip sits in the real container');
  assert.equal(clip.querySelector('.rec-arrangement-clip-name').textContent, 'Clip 0', 'the name is in the row');
  assert.ok(clip.querySelector('.rec-arrangement-clip-wave'), 'the wave button is in the row');
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  assert.equal(lane.querySelector('.rec-track-clips'), container, 'the real row survives the next poll');
});

test('a retired row refuses every action of the new world', async () => {
  const h = await ready();
  const oldClip = clipNodes(h.cards.get('a').lane)[0];
  const oldTakes = buttonOf(h.cards.get('a').lane, 'rec-arrangement-takes');
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  h.current.connectionEpoch = 12;
  h.rows.update(h.current, h.cards, { active: true });
  await flush();
  oldClip.listeners.get('click')();
  oldTakes.listeners.get('click')();
  assert.equal(focus.length, 0, 'a retired row opens no focus');
  oldClip.querySelector('.rec-arrangement-clip-wave').listeners.get('click')({ stopPropagation() {} });
  await flush();
  assert.equal(h.calls.waveform.length, 0, 'a retired row reads no preview');
});

test('a long visit keeps the newest row actionable and the rows bounded', async () => {
  const h = await ready();
  const focus = [];
  h.rows.setFocusHandler((selection) => { focus.push(selection); });
  for (let index = 0; index < 36; index += 1) {
    const card = makeCard(false);
    const lane = makeLane();
    h.cards.set('t' + index, { card, lane, track: { index: index + 2, id: 't' + index, name: 'T' + index } });
    h.rows.update(h.current, h.cards, { active: true });
    await flush();
    card.getBoundingClientRect = () => ({ top: 5000, bottom: 5060, left: 0, right: 800 });
  }
  const takes = buttonOf(h.cards.get('t35').lane, 'rec-arrangement-takes');
  assert.ok(takes, 'the newest row keeps its actions');
  takes.listeners.get('click')();
  assert.equal(focus.length, 1, 'the newest row is still actionable');
  assert.equal(focus[0].track.id, 't35', 'the newest row acts on its own track');
  assert.equal(countByClass(h.cards.get('t0').lane, 'rec-arrangement-bar'), 0, 'the oldest row leaves the bound');
});
