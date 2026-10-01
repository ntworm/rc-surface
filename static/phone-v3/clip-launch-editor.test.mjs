// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = import.meta.dirname;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeElement {
  constructor(tag = '') {
    this.tagName = tag;
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.value = '';
    this.disabled = false;
    this.style = { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; } };
    this.listeners = new Map();
    this.classList = {
      add: (name) => { this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((x) => x !== name).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const active = force === undefined ? !this.classList.contains(name) : !!force;
        if (active) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => c.textContent).join(' ');
  }
  set textContent(val) { this._textContent = String(val); this.children = []; }
  get innerHTML() { return ''; }
  set innerHTML(val) { if (val === '') { this.children = []; this._textContent = ''; } }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  setAttribute(name, value) { this[name] = value; }
  getAttribute(name) { return this[name] || null; }
  querySelectorAll() { return []; }
  closest(selector) {
    if (selector === '.map-pane-right') {
      if (!this._pane) { this._pane = new FakeElement(); this._pane.className = 'map-pane-right'; }
      return this._pane;
    }
    return null;
  }
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}
function findAll(scope, predicate) {
  const out = [];
  walk(scope, (node) => { if (predicate(node)) out.push(node); });
  return out;
}
const byText = (scope, text) => findAll(scope, (n) => n._textContent === text);
const byClass = (scope, name) => findAll(scope, (n) => String(n.className).split(/\s+/).includes(name));
async function click(node) {
  assert.ok(node, 'element to click');
  await node.listeners.get('click')();
  await tick();
}

const CLIP_TARGETS = {
  tracks: [
    { trackIndex: 0, name: 'Keys', sessionId: '11', clips: [{ slotIndex: 0, name: 'Chords', sessionId: '12' }] },
    { trackIndex: 1, name: 'Drums', sessionId: '21', clips: [
      { slotIndex: 0, name: 'Base', sessionId: '22' },
      { slotIndex: 1, name: 'Variação', sessionId: '23' },
      { slotIndex: 2, name: 'Virada', sessionId: '24' },
    ] },
  ],
  osc: { available: true, connected: true },
};

function load({ mappings = {}, statuses = [] } = {}) {
  const ids = ['btn-map-mode', 'btn-map-back', 'btn-map-refresh', 'mapping-mode', 'map-armed-strip',
    'map-mobile-status', 'map-mobile-presets', 'map-mobile-search', 'map-mobile-controls', 'map-mobile-detail'];
  const elements = new Map(ids.map((id) => { const el = new FakeElement('div'); el.id = id; return [id, el]; }));
  const body = new FakeElement('body');
  body.dataset.page = 'performance';
  const document = {
    readyState: 'complete', body,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const calls = [];
  let mockMappings = JSON.parse(JSON.stringify(mappings));
  const sendPhoneCommand = (cmd, args, cb) => {
    calls.push({ cmd, args: JSON.parse(JSON.stringify(args || {})) });
    if (cmd === 'setMapping') { mockMappings[args.control] = args.targets; cb({ ok: true }); return true; }
    if (cmd === 'removeMapping') { delete mockMappings[args.control]; cb({ ok: true }); return true; }
    const fixtures = {
      getTargets: { ok: true, result: { targets: [{ type: 'tempo' }] } },
      getMappings: { ok: true, result: { mappings: mockMappings } },
      getClients: { ok: true, result: { clients: [] } },
      listPresets: { ok: true, result: { presets: ['Default'], current: 'Default' } },
      getProjectConfigStatus: { ok: true, result: { report: { loaded: 0, relinked: 0, review: 0, ambiguous: 0, missing: 0 } } },
      getClipTargets: { ok: true, result: CLIP_TARGETS },
      getClipLaunchStatus: { ok: true, result: { statuses, diagnostics: [] } },
      testClipLaunch: { ok: true, result: { control: args?.control, targetIndex: args?.targetIndex ?? 0, state: 'requested' } },
    };
    cb(fixtures[cmd] || { ok: true });
    return true;
  };
  const context = vm.createContext({
    window: {
      throttlePhoneTelemetry() {}, setPhoneMappingModeActive() {},
      showPhonePage(page) { document.body.dataset.page = page; },
      addEventListener() {}, dispatchEvent() {},
      sendPhoneCommand,
    },
    document,
    CustomEvent: class CustomEvent { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
    Event: class Event { constructor(name) { this.type = name; } },
    console,
    setTimeout, clearTimeout,
  });
  context.window.window = context.window;
  context.window.document = document;
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-input-contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-mode.js'), 'utf8'), context);
  const detail = elements.get('map-mobile-detail');
  return { context, calls, detail, mappings: () => mockMappings };
}

async function select(context, control) {
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = control;
  context.window.mobileMappingState.selectedTargetIndex = 0;
  context.window.renderDetail();
  await tick();
}

const VIRADA_TARGET = {
  type: 'clip_launch', trackIndex: 1,
  track: { trackIndex: 1, trackName: 'Drums', trackSessionId: '21' },
  launchMode: 'clip', clip: { slotIndex: 2, clipName: 'Virada', clipSessionId: '24' },
};

test('MAP offers Launch Clip beside Bind and Trigger Note', async () => {
  const { context, detail } = load();
  await select(context, 'sensor.vision.gesture.1');
  const entries = byClass(detail, 'map-entry-choice').map((n) => n.dataset.kind);
  assert.deepEqual(entries, ['bind', 'note', 'clip']);
  const actions = byClass(detail, 'map-detail-actions')[0];
  assert.deepEqual(actions.children.slice(0, 3).map((n) => n._textContent), ['Bind', 'Trigger Note', 'Launch Clip']);
});

test('control → Launch Clip → track → clip saves a target with real names and session identities', async () => {
  const { context, calls, detail } = load();
  await select(context, 'sensor.vision.gesture.2');
  await click(byClass(detail, 'map-entry-choice').find((n) => n.dataset.kind === 'clip'));
  await tick();
  const trackRows = byClass(detail, 'map-picker-row');
  assert.deepEqual(trackRows.map((n) => n._textContent), ['Keys', 'Drums']);
  await click(trackRows[1]);
  const clipRows = byClass(detail, 'map-picker-row');
  assert.deepEqual(clipRows.map((n) => n._textContent), ['Slot 1 · Base', 'Slot 2 · Variação', 'Slot 3 · Virada']);
  await click(clipRows[1]);
  const saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args;
  assert.equal(saved.control, 'sensor.vision.gesture.2');
  assert.deepEqual(saved.targets, [{
    type: 'clip_launch', trackIndex: 1,
    track: { trackIndex: 1, trackName: 'Drums', trackSessionId: '21' },
    launchMode: 'clip', clip: { slotIndex: 1, clipName: 'Variação', clipSessionId: '23' },
  }]);
});

test('the editor shows destination, choice and quantization, and only claims playing when Live says so', async () => {
  const { context, detail } = load({
    mappings: { 'sensor.vision.gesture.3': [VIRADA_TARGET] },
    statuses: [{ control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'idle', quantization: { source: 'global', label: '1 Bar' } }],
  });
  await select(context, 'sensor.vision.gesture.3');
  await tick();
  assert.ok(byText(detail, 'Drums · Virada · Slot 3').length, 'destination');
  const active = byClass(detail, 'map-segmented-btn').filter((n) => n.dataset.clipMode && n.className.includes('active'));
  assert.deepEqual(active.map((n) => n.dataset.clipMode), ['clip']);
  const status = byClass(detail, 'map-clip-status')[0];
  assert.equal(status._textContent, 'Ready');
  assert.equal(byClass(detail, 'map-clip-quantization')[0]._textContent, 'Live global: 1 Bar');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'queued' });
  assert.equal(status._textContent, 'Waiting in Live (next boundary)');
  assert.equal(status.dataset.state, 'queued');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.1', targetIndex: 0, state: 'playing' });
  assert.equal(status._textContent, 'Waiting in Live (next boundary)', 'another control does not change this editor');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'playing' });
  assert.equal(status._textContent, 'Playing');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'missing', reason: 'clip' });
  assert.equal(status._textContent, 'Destination missing — choose it again');
});

test('the Test button runs one activation of the saved target', async () => {
  const { context, calls, detail } = load({ mappings: { 'sensor.vision.gesture.3': [VIRADA_TARGET] } });
  await select(context, 'sensor.vision.gesture.3');
  await click(byClass(detail, 'map-clip-test')[0]);
  const test = calls.filter((c) => c.cmd === 'testClipLaunch').at(-1);
  assert.deepEqual(test.args, { control: 'sensor.vision.gesture.3', targetIndex: 0 });
  assert.equal(byClass(detail, 'map-clip-status')[0]._textContent, 'Sent — waiting for Live');
});

test('choosing Advance list seeds two clips and hides the continuation; Stop track keeps no clip', async () => {
  const { context, calls, detail } = load({ mappings: { 'pad-1': [VIRADA_TARGET] } });
  await select(context, 'pad-1');
  await tick();
  await click(byClass(detail, 'map-segmented-btn').find((n) => n.dataset.clipMode === 'list'));
  let saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.equal(saved.launchMode, 'list');
  assert.deepEqual(saved.clips.map((c) => c.clipName), ['Virada', 'Base']);
  assert.equal(saved.clip, undefined);
  context.window.renderDetail();
  await tick();
  assert.equal(byClass(detail, 'map-clip-rule-label').length, 0, 'list mode has no "After it starts"');
  assert.equal(byClass(detail, 'map-clip-list-item').length, 2);
  await click(byClass(detail, 'map-segmented-btn').find((n) => n.dataset.clipMode === 'stop'));
  saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.equal(saved.launchMode, 'stop');
  assert.equal(saved.clips, undefined);
});

test('"After it starts" is separate from the choice and labels the rule as Surface\'s own', async () => {
  const { context, calls, detail } = load({ mappings: { 'sensor.vision.gesture.3': [VIRADA_TARGET] } });
  await select(context, 'sensor.vision.gesture.3');
  await tick();
  const sections = byClass(detail, 'map-note-section').map((n) => n.dataset.section);
  assert.deepEqual(sections, ['destination', 'choice', 'quantization', 'after']);
  await click(byClass(detail, 'map-segmented-btn').find((n) => n.dataset.clipThen === 'clip'));
  const rows = byClass(detail, 'map-picker-row');
  assert.deepEqual(rows.map((n) => n._textContent), ['Slot 1 · Base', 'Slot 2 · Variação'], 'the launched clip is not offered as its own return');
  await click(rows[0]);
  let saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.deepEqual(saved.then, { action: 'clip', passes: 1, clip: { slotIndex: 0, clipName: 'Base', clipSessionId: '22' } });
  context.window.renderDetail();
  await tick();
  assert.ok(byText(detail, 'RC Surface rule. It does not read or change the Follow Actions in Live.').length);
  assert.ok(byText(detail, 'If this clip has a Follow Action in Live, both will act. Use one or the other.').length);
  const passes = byClass(detail, 'map-clip-passes')[0];
  passes.value = '2';
  await passes.listeners.get('change')();
  await tick();
  saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.equal(saved.then.passes, 2);
  await click(byClass(detail, 'map-segmented-btn').find((n) => n.dataset.clipThen === 'none'));
  saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.equal(saved.then, undefined);
});

test('rule state and prediction come from the host, including refusals', async () => {
  const target = { ...VIRADA_TARGET, then: { action: 'clip', passes: 1, clip: { slotIndex: 0, clipName: 'Base', clipSessionId: '22' } } };
  const { context, detail } = load({
    mappings: { 'sensor.vision.gesture.3': [target] },
    statuses: [{ control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'idle',
      rule: { state: 'ready', prediction: { kind: 'repeat', extraBeats: 2, landingBeats: 4 } } }],
  });
  await select(context, 'sensor.vision.gesture.3');
  await tick();
  const rule = byClass(detail, 'map-clip-rule-state')[0];
  assert.equal(rule._textContent, 'Rule ready · Expected: the clip plays 2 beats more before Base.');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'playing',
    rule: { state: 'late' } });
  assert.equal(rule._textContent, 'Late return');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'idle',
    rule: { state: 'refused', refusal: 'quantization_none' } });
  assert.equal(rule._textContent, 'Needs a Live quantization other than None.');
  context.window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.3', targetIndex: 0, state: 'idle',
    rule: { state: 'cancelled', reason: 'insufficient_pushes' } });
  assert.equal(rule._textContent, 'Rule cancelled (too few position updates to count)');
});

test('the same clip on two controls is not a conflict; the bound list names Launch Clip', async () => {
  const { context, calls, detail } = load({ mappings: { 'pad-1': [VIRADA_TARGET] } });
  await select(context, 'pad-2');
  await click(byClass(detail, 'map-entry-choice').find((n) => n.dataset.kind === 'clip'));
  await click(byClass(detail, 'map-picker-row')[1]);
  await click(byClass(detail, 'map-picker-row')[2]);
  const saved = calls.filter((c) => c.cmd === 'setMapping').at(-1).args;
  assert.equal(saved.control, 'pad-2');
  assert.equal(byClass(detail, 'map-conflict').length, 0);
  context.window.mobileMappingState.selectedControl = 'pad-1';
  context.window.renderDetail();
  await tick();
  assert.ok(byClass(detail, 'map-bound-type').length === 0 || byClass(detail, 'map-bound-type').every((n) => n._textContent === 'Launch Clip'));
});
