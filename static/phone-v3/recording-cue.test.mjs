// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const recordingSource = fs.readFileSync(new URL('./modules/recording.js', import.meta.url), 'utf8');
const rangeSource = fs.readFileSync(new URL('./modules/recording-range-selection.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

/** The REC page lost the local MIX/CUE switch and the Return diagnostic. */
test('the REC page carries no CUE switch, no Return selector and no diagnostic script', () => {
  for (const id of ['rec-local-mix', 'rec-local-cue', 'rec-cue-return', 'rec-cue-destination', 'rec-cue-status', 'rec-cue-mapping']) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id + ' is gone from the REC page');
  }
  assert.doesNotMatch(html, /modules\/recording-cue\.js/);
  assert.doesNotMatch(recordingSource, /RcRecordingCue/);
  assert.doesNotMatch(recordingSource, /cueMode/);
  assert.doesNotMatch(recordingSource, /rec-cue/);
  // The main MIX page and its tab are untouched by REC.
  assert.match(html, /class="tab" data-page="mixer"/);
  assert.match(html, /class="page page-mixer hidden"/);
});

function harness(t) {
  const nodes = new Map(), calls = [];
  let generated = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {},
      children: [], listeners: new Map(),
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, handler) { this.listeners.set(name, handler); },
      replaceChildren(...children) { this.children = children; },
      appendChild(child) { this.children.push(child); },
    });
    return nodes.get(id);
  };
  const doc = {
    readyState: 'loading', body: { dataset: { page: 'recording' } }, hidden: false,
    getElementById: node,
    createElement: () => node('generated-' + (++generated)),
    addEventListener: () => {},
  };
  const context = vm.createContext({
    document: doc, Date, setTimeout: () => 0, clearTimeout: () => {},
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    RcSurfaceI18n: { t: key => key },
    sendPhoneCommand: (name, args, cb) => calls.push({ name, args, cb }),
  });
  vm.runInContext(rangeSource, context);
  vm.runInContext(recordingSource, context);
  const client = context.RcRecording.setup();
  t.after(() => client.session(false));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const field = value => ({ value, fresh: true, observedAt: Date.now() });
  const snapshot = () => ({
    scope: 'scope-1',
    transport: {
      connected: true, isPlaying: field(false), recordMode: field(false),
      songTimeBeats: field(0), metronome: field(false),
    },
    tracks: [
      { index: 0, id: 't0', name: 'Guitar', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73 },
      { index: 1, id: 't1', name: 'Bass', arm: false, canArm: true, solo: false, mute: false, volume: 0.25, volumeDefault: 0.73 },
    ],
    locators: [], meter: { numerator: 4, denominator: 4 }, pending: null,
    session: { songId: 'song-1', scenes: [], rows: [], owned: [], active: false },
  });
  const open = async (role = 'controller') => {
    client.session(true, role);
    const reading = client.command('getRecordingState');
    calls.at(-1).cb({ ok: true, result: snapshot() });
    await reading;
  };
  const writes = () => calls.filter(call => call.name !== 'getRecordingState');
  const fader = () => {
    const card = node('rec-track-grid').children[0];
    const actions = card.children.find(child => child.className === 'rec-track-actions');
    return actions.children.find(child => child.className === 'rec-track-vol');
  };
  return { node, calls, client, flush, open, writes, fader };
}

test('the native track volume still writes exactly one mixer level', async t => {
  const h = harness(t);
  await h.open();
  const fader = h.fader();
  assert.equal(fader.role, 'slider');
  assert.equal(fader['aria-valuenow'], '0.5');
  assert.equal(fader['aria-valuetext'], '50%');
  fader.listeners.get('keydown')({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  assert.equal(h.writes().length, 1);
  assert.equal(h.writes()[0].name, 'recordingTrackVolume');
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes()[0].args.track)), { index: 0, id: 't0', name: 'Guitar' });
  assert.equal(h.writes()[0].args.volume, 0.52);
  h.calls.at(-1).cb({ ok: true, result: h.client.view().state });
  await h.flush();
  // A double click restores Live's own default, never an invented level.
  fader.listeners.get('dblclick')({ stopPropagation() {}, preventDefault() {} });
  assert.equal(h.writes().at(-1).args.volume, 0.73);
});

test('the REC page never asks for a Return diagnostic', async t => {
  const h = harness(t);
  await h.open();
  await h.flush();
  assert.deepEqual(h.calls.map(call => call.name), ['getRecordingState']);
  assert.deepEqual(h.writes(), []);
});

test('a viewer reads the REC state and never writes a volume', async t => {
  const h = harness(t);
  await h.open('viewer');
  const fader = h.fader();
  assert.equal(fader['aria-disabled'], 'true');
  const before = h.calls.length;
  fader.listeners.get('keydown')({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  fader.listeners.get('dblclick')({ stopPropagation() {}, preventDefault() {} });
  assert.equal(h.calls.length, before);
});

test('a reconnect keeps the role guard and never replays a volume write', async t => {
  const h = harness(t);
  await h.open();
  h.fader().listeners.get('keydown')({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  assert.equal(h.writes().length, 1);
  h.client.session(false);
  h.client.session(true, 'viewer');
  await h.open('viewer');
  const before = h.calls.length;
  h.fader().listeners.get('keydown')({ key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  assert.equal(h.calls.length, before, 'a reconnect never replays the pending write');
  assert.equal(h.writes().length, 1, 'only the first, confirmed write ever reached the host');
});

/** The retired client: the file is empty in the handoff and the parent removes it. */
test('the retired CUE client carries no implementation', () => {
  const clientUrl = new URL('./modules/recording-cue.js', import.meta.url);
  const source = fs.existsSync(clientUrl) ? fs.readFileSync(clientUrl, 'utf8') : '';
  assert.equal(source.trim(), '', 'the retired client file carries no code');
  assert.doesNotMatch(source, /RcRecordingCue/);
  const modulesDir = new URL('./modules/', import.meta.url);
  for (const name of fs.readdirSync(modulesDir)) {
    const fileUrl = new URL(name, modulesDir);
    if (!name.endsWith('.js') || !fs.statSync(fileUrl).isFile()) continue;
    const text = fs.readFileSync(fileUrl, 'utf8');
    assert.doesNotMatch(text, /RcRecordingCue/, name + ' does not carry the retired client');
  }
});

/** The retired UI strings are gone. The host reason that the backend still sends stays. */
test('the retired CUE UI strings are gone and the backend reason stays', () => {
  const catalog = fs.readFileSync(new URL('../shared/i18n-catalog.js', import.meta.url), 'utf8');
  const retired = [
    'rec.mixMode', 'rec.cueMode', 'rec.cueReturn', 'rec.cueReturnNone', 'rec.cueReadOnly',
    'rec.cueUnavailable', 'rec.cueReading', 'rec.cueChooseReturn', 'rec.cueNoReturns',
    'rec.cueStale', 'rec.cueRead',
  ];
  for (const key of retired) {
    assert.doesNotMatch(catalog, new RegExp("'" + key + "'"), key + ' is retired');
  }
  assert.match(catalog, /'rec\.reason\.CUE_LIMIT'/);
});
