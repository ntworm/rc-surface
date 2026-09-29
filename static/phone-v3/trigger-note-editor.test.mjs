// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = import.meta.dirname;

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.value = '';
    this.style = {
      setProperty(k, v) { this[k] = v; },
      getPropertyValue(k) { return this[k] || ''; },
    };
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

  set textContent(val) {
    this._textContent = val;
    this.children = [];
  }

  get innerHTML() { return ''; }
  set innerHTML(val) {
    if (val === '') {
      this.children = [];
      this._textContent = '';
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(name, fn) {
    this.listeners.set(name, fn);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  getAttribute(name) {
    return this[name] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    function search(node) {
      for (const child of node.children || []) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
          results.push(child);
        } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
          results.push(child);
        } else if (child.id === selector) {
          results.push(child);
        }
        search(child);
      }
    }
    search(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    return null;
  }
}

function findByClass(scope, className) {
  if (!scope) return null;
  if (scope.classList && scope.classList.contains(className)) return scope;
  for (const child of scope.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findAllByClass(scope, className, results = []) {
  if (!scope) return results;
  if (scope.classList && scope.classList.contains(className)) results.push(scope);
  for (const child of scope.children || []) {
    findAllByClass(child, className, results);
  }
  return results;
}

function findByText(scope, text) {
  if (!scope) return null;
  if (scope._textContent === text || (scope.children.length === 0 && scope.textContent === text)) return scope;
  for (const child of scope.children || []) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function loadTriggerEditorContext(initialMappings = {}, allTargets = []) {
  const ids = [
    'btn-map-mode', 'btn-map-back', 'btn-map-refresh', 'mapping-mode',
    'map-armed-strip',
    'map-mobile-status', 'map-mobile-presets', 'map-mobile-search',
    'map-mobile-controls', 'map-mobile-detail',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const body = new FakeElement('body');
  body.dataset.page = 'performance';

  const document = {
    readyState: 'complete',
    body,
    getElementById: (id) => {
      if (elements.has(id)) return elements.get(id);
      for (const el of elements.values()) {
        const found = el.querySelector(`#${id}`) || el.querySelector(id);
        if (found) return found;
      }
      return null;
    },
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    querySelector: (selector) => {
      if (selector === '#map-trigger-feedback') return elements.get('map-trigger-feedback') || null;
      for (const el of elements.values()) {
        const found = el.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      for (const el of elements.values()) {
        results.push(...el.querySelectorAll(selector));
      }
      return results;
    },
  };

  const calls = [];
  let mockMappings = { ...initialMappings };

  function defaultSendPhoneCommand(cmd, args, cb) {
    calls.push({ cmd, args });
    if (cmd === 'setMapping') {
      mockMappings[args.control] = args.targets;
      cb({ ok: true });
      return true;
    }
    if (cmd === 'removeMapping') {
      delete mockMappings[args.control];
      cb({ ok: true });
      return true;
    }
    if (cmd === 'testTriggerNote') {
      cb({ ok: true, result: { tested: true } });
      return true;
    }
    const fixtures = {
      getTargets: {
        ok: true,
        result: {
          targets: allTargets.length > 0 ? allTargets : [
            { type: 'tempo' },
            { trackIndex: 0, name: 'Chords Track', isMidi: true, trackKind: 'track' },
            { trackIndex: 1, name: 'Lead Synth', isMidi: true, trackKind: 'track' },
          ],
        },
      },
      getMappings: { ok: true, result: { mappings: mockMappings } },
      getClients: { ok: true, result: { clients: [{ client_id: 'phone-1', status: 'active' }] } },
      listPresets: { ok: true, result: { presets: ['Default'], current: 'Default' } },
      getProjectConfigStatus: { ok: true, result: { report: { loaded: 1, relinked: 0, review: 0, ambiguous: 0, missing: 0 }, clientState: {} } },
      addUdpReceiverToTrack: { ok: true, result: { success: true } },
    };
    cb(fixtures[cmd] || { ok: true });
    return true;
  }

  const context = vm.createContext({
    window: {
      throttlePhoneTelemetry() {},
      setPhoneMappingModeActive() {},
      showPhonePage(page) { document.body.dataset.page = page; },
      addEventListener() {},
      dispatchEvent() {},
      sendPhoneCommand: defaultSendPhoneCommand,
      lastSessionBpm: 120,
      currentNumerator: 4,
      currentDenominator: 4,
      oscIsPlaying: true,
      phoneWs: { readyState: 1 },
    },
    document,
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
    console,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {},
    Promise,
  });
  context.window.Event = context.Event;
  context.window.CustomEvent = context.CustomEvent;
  context.window.window = context.window;
  context.window.document = document;

  const contractCode = fs.readFileSync(path.join(root, 'mapping-input-contract.js'), 'utf8');
  vm.runInContext(contractCode, context);
  const code = fs.readFileSync(path.join(root, 'mapping-mode.js'), 'utf8');
  vm.runInContext(code, context);

  return { context, elements, calls, document };
}

test('S05 DOM: trigger_note editor renders header, note, timing, gate, actions, feedback and advanced', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    trackKind: 'track',
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 100,
    noteTiming: 'beat',
    noteGate: 'pulse',
    noteDurationMs: 80,
  };
  const { context, elements } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  assert.ok(detail, 'map-mobile-detail must exist');

  // 1. Header with Destination Track and Change button
  const trackLabel = findByClass(detail, 'map-trigger-track-label');
  assert.ok(trackLabel, 'must render destination track label');
  assert.match(trackLabel.textContent, /Chords Track/i);

  const changeBtn = findByClass(detail, 'map-btn-change-target');
  assert.ok(changeBtn, 'must render Change target button');

  // 2. Receiver v2 Status Badge
  const receiverBadge = findByClass(detail, 'map-receiver-badge');
  assert.ok(receiverBadge, 'must render receiver status badge');

  // 3. Pitch and Octave selects, and MIDI number badge
  const pitchSelect = findByClass(detail, 'map-midi-pitch-select');
  assert.ok(pitchSelect, 'must render pitch select');
  assert.equal(pitchSelect.value, 'C');

  const octaveSelect = findByClass(detail, 'map-midi-octave-select');
  assert.ok(octaveSelect, 'must render octave select');
  assert.equal(octaveSelect.value, '2');

  const midiBadge = findByClass(detail, 'map-midi-number-badge');
  assert.ok(midiBadge, 'must render MIDI number badge');
  assert.match(midiBadge.textContent, /MIDI 48/);

  // 4. Timing segmented buttons (Agora, Próx. Tempo, Compasso)
  const timingBtns = findAllByClass(detail, 'map-segmented-btn').filter((b) => ['immediate', 'beat', 'bar'].includes(b.dataset.value));
  assert.equal(timingBtns.length, 3, 'must render 3 timing options');
  const activeTiming = timingBtns.find((b) => b.classList.contains('active'));
  assert.equal(activeTiming?.dataset.value, 'beat');

  // 5. Gate segmented buttons (Curta, While Held)
  const gateBtns = findAllByClass(detail, 'map-segmented-btn').filter((b) => ['pulse', 'hold'].includes(b.dataset.value));
  assert.equal(gateBtns.length, 2, 'must render 2 gate options');
  const activeGate = gateBtns.find((b) => b.classList.contains('active'));
  assert.equal(activeGate?.dataset.value, 'pulse');

  // C14: performance configuration uses visible timing/gate state, without shortcut CTAs.
  assert.equal(findByClass(detail, 'map-btn-for-chords'), null);
  assert.equal(findByClass(detail, 'map-btn-for-chords-hold'), null);
  assert.equal(findByClass(detail, 'map-btn-test-note'), null);
  assert.equal(findByClass(detail, 'map-bound-list'), null, 'C15: one destination must not be repeated above its editor');
  assert.deepEqual(findAllByClass(detail, 'map-note-section-title').map((el) => el.textContent), ['Destination', 'Note', 'Trigger']);

  // 7. Feedback indicator box
  const feedback = findByClass(detail, 'map-trigger-feedback');
  assert.ok(feedback, 'must render trigger feedback readout');

  // 8. Collapsible Advanced section
  const advanced = findByClass(detail, 'map-editor-advanced');
  assert.ok(advanced, 'must render collapsible Advanced section');
});

test('trigger_note editor excludes continuous sliders, curve canvas, and continuous selectors from primary view', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 100,
    noteTiming: 'beat',
    noteGate: 'pulse',
    noteDurationMs: 80,
    curve: 'exponential',
    inMin: 0.2,
    inMax: 0.8,
  };
  const { context, elements } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  
  // Curve canvas must not be rendered
  const canvas = findByClass(detail, 'map-curve-canvas');
  assert.equal(canvas, null, 'curve canvas must NOT be rendered in trigger_note mode');

  // Continuous sliders grid must not be rendered in main view
  const slidersGrid = findByClass(detail, 'map-editor-sliders-grid');
  assert.equal(slidersGrid, null, 'continuous sliders grid must NOT be rendered in trigger_note mode');
});

test('switching from continuous to trigger_note and back preserves continuous values', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'continuous',
    curve: 'exponential',
    inMin: 0.25,
    inMax: 0.85,
    outMin: 0.1,
    outMax: 0.9,
    drive: 0.4,
  };
  const { context, elements } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  // Switch to trigger_note
  await context.window.updateMobileTargetField('mode', 'trigger_note');
  context.window.renderDetail();

  let currentTarget = context.window.mobileMappingState.currentMappings['sensor.vision.gesture.1'][0];
  assert.equal(currentTarget.mode, 'trigger_note');
  assert.equal(currentTarget.curve, 'exponential', 'curve value must be preserved in target object');
  assert.equal(currentTarget.inMin, 0.25);
  assert.equal(currentTarget.inMax, 0.85);

  // Switch back to continuous
  await context.window.updateMobileTargetField('mode', 'continuous');
  context.window.renderDetail();

  currentTarget = context.window.mobileMappingState.currentMappings['sensor.vision.gesture.1'][0];
  assert.equal(currentTarget.mode, 'continuous');
  assert.equal(currentTarget.curve, 'exponential');
  assert.equal(currentTarget.inMin, 0.25);
  assert.equal(currentTarget.inMax, 0.85);
  assert.equal(currentTarget.drive, 0.4);
});

test('MIDI note range: C-2=0, C2=48, G8=127; G#8 and higher are rejected', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 100,
  };
  const { context, calls } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';

  // Valid note C-2
  await context.window.updateMobileTargetField('midiNote', 'C-2');
  let lastCall = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.equal(lastCall.args.targets[0].midiNote, 'C-2');

  // Valid note G8 (MIDI 127)
  await context.window.updateMobileTargetField('midiNote', 'G8');
  lastCall = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.equal(lastCall.args.targets[0].midiNote, 'G8');

  // Invalid note G#8 (MIDI 128 - out of bounds)
  const prevCallsCount = calls.filter((c) => c.cmd === 'setMapping').length;
  await context.window.updateMobileTargetField('midiNote', 'G#8');
  // Should NOT dispatch setMapping with G#8
  assert.equal(calls.filter((c) => c.cmd === 'setMapping').length, prevCallsCount, 'G#8 must be rejected and not saved');

  // Invalid note A8
  await context.window.updateMobileTargetField('midiNote', 'A8');
  assert.equal(calls.filter((c) => c.cmd === 'setMapping').length, prevCallsCount, 'A8 must be rejected and not saved');
});

test('hold + sync rejection: sync timing disables hold, and switching to sync forces pulse gate', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 100,
    noteTiming: 'immediate',
    noteGate: 'hold',
    noteDurationMs: 80,
  };
  const { context, elements, calls } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  // Switch timing to beat
  await context.window.updateMobileTargetField('noteTiming', 'beat');
  const lastTarget = calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0];
  assert.equal(lastTarget.noteTiming, 'beat');
  assert.equal(lastTarget.noteGate, 'pulse', 'switching to beat must automatically force gate to pulse');

  // Check that hold is disabled in UI when sync
  context.window.renderDetail();
  const detail = elements.get('map-mobile-detail');
  const holdBtn = findAllByClass(detail, 'map-segmented-btn').find((b) => b.dataset.value === 'hold');
  assert.ok(holdBtn, 'hold button must exist');
  assert.equal(holdBtn.disabled, true, 'hold button must be disabled when timing is beat');
});

test('C14: entering sync after ms/hold use selects musical 1/4 bar without resetting pitch or velocity', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'E4',
    midiVelocity: 64,
    noteTiming: 'immediate',
    noteGate: 'hold',
    noteDurationMode: 'ms',
    noteDurationMs: 500,
  };
  const { context, elements, calls } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  const beatBtn = findAllByClass(detail, 'map-segmented-btn').find((b) => b.dataset.value === 'beat');
  await beatBtn.listeners.get('click')();

  const lastSet = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.ok(lastSet, 'must dispatch setMapping');
  const updated = lastSet.args.targets[0];
  assert.equal(updated.midiNote, 'E4');
  assert.equal(updated.midiVelocity, 64);
  assert.equal(updated.noteTiming, 'beat');
  assert.equal(updated.noteGate, 'pulse');
  assert.equal(updated.noteDurationMode, 'grid');
  assert.equal(updated.noteDurationBars, 0.25);
  assert.equal(updated.noteDurationMs, 500);
  const modeBtns = findAllByClass(detail, 'map-duration-mode-btn');
  assert.equal(modeBtns.length, 2);
  assert.equal(modeBtns.find((b) => b.classList.contains('active'))?.dataset.durationMode, 'grid');
  await context.window.updateMobileTargetField('noteDurationBars', 0.5);
  await context.window.updateMobileTargetField('noteTiming', 'bar');
  assert.equal(calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0].noteDurationBars, 0.5);
  await context.window.updateMobileTargetField('noteTiming', 'immediate');
  await context.window.updateMobileTargetField('noteTiming', 'bar');
  assert.equal(calls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0].noteDurationMode, 'grid');
});

test('C14: feedback follows actual trigger_note_state without a Test Note action', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 100,
    noteTiming: 'beat',
    noteGate: 'pulse',
    noteDurationMs: 80,
  };
  const { context, elements, calls } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  assert.equal(findByClass(detail, 'map-btn-test-note'), null);
  assert.equal(calls.find((c) => c.cmd === 'testTriggerNote'), undefined);

  // Emulate incoming trigger_note_state messages from server
  const feedbackEl = findByClass(detail, 'map-trigger-feedback');
  assert.ok(feedbackEl, 'feedback element must exist');

  // 1. Pending state
  context.window.handleTriggerNoteState({
    type: 'trigger_note_state',
    control: 'sensor.vision.gesture.1',
    target: '0',
    state: 'pending',
    targetBeat: 17.0,
  });
  assert.equal(feedbackEl.dataset.state, 'pending');
  assert.match(feedbackEl.textContent, /17\.0/);

  // 2. Sent state
  context.window.handleTriggerNoteState({
    type: 'trigger_note_state',
    control: 'sensor.vision.gesture.1',
    target: '0',
    state: 'sent',
    targetBeat: 17.0,
  });
  assert.equal(feedbackEl.dataset.state, 'sent');
  assert.match(feedbackEl.textContent, /SENT|ENVIADO/i);

  // 3. Unavailable / No Sync state
  context.window.handleTriggerNoteState({
    type: 'trigger_note_state',
    control: 'sensor.vision.gesture.1',
    target: '0',
    state: 'unavailable',
    reason: 'clock_unavailable',
  });
  assert.equal(feedbackEl.dataset.state, 'unavailable');
  assert.match(feedbackEl.textContent, /SYNC/i);
});

test('destination change [TROCAR] preserves existing target configuration on target track switch', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    trackKind: 'track',
    mode: 'trigger_note',
    midiNote: 'D2',
    midiVelocity: 110,
    noteTiming: 'bar',
    noteGate: 'pulse',
    noteDurationMs: 120,
  };
  const { context, elements, calls } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  const changeBtn = findByClass(detail, 'map-btn-change-target');
  assert.ok(changeBtn, 'change button must exist');

  // Click change target
  changeBtn.listeners.get('click')();
  assert.equal(context.window.mobileMappingState.pickerMode, 'midi');
  assert.equal(context.window.mobileMappingState.changeTargetIndex, 0);

  // Pick track 1 (Lead Synth)
  const rows = findAllByClass(detail, 'map-picker-row');
  assert.ok(rows.length >= 2, 'must render MIDI tracks');
  const track1Row = rows.find((r) => r.textContent.includes('Lead Synth'));
  assert.ok(track1Row, 'track 1 row must exist');

  await track1Row.listeners.get('click')();

  // Verify targetIndex 0 was updated to track 1 while keeping its note settings
  const lastSet = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.ok(lastSet);
  const updated = lastSet.args.targets[0];
  assert.equal(updated.trackIndex, 1);
  assert.equal(updated.midiNote, 'D2');
  assert.equal(updated.midiVelocity, 110);
  assert.equal(updated.noteTiming, 'bar');
  assert.equal(updated.noteGate, 'pulse');
  assert.equal(updated.noteDurationMs, 120);
});

test('C15/C18: multi-target navigation survives without a redundant note mode selector', async () => {
  const note = { type: 'device_param', trackIndex: 0, mode: 'trigger_note', midiNote: 'C2', noteTiming: 'immediate', noteGate: 'hold', threshold: 0.7 };
  const { context, elements } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [note, { ...note, trackIndex: 1, midiNote: 'E4' }] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();
  const detail = elements.get('map-mobile-detail');
  const destinations = findAllByClass(detail, 'map-bound-target');
  assert.equal(destinations.length, 2);
  assert.doesNotMatch(destinations[0].textContent, /C2/);
  await destinations[1].listeners.get('click')();
  assert.match(findByClass(detail, 'map-trigger-track-label').textContent, /Lead Synth/);
  assert.match(findByClass(detail, 'map-safe-loss-note').textContent, /keep the last state/);
  assert.equal(findByClass(detail, 'map-note-mode-select'), null);
  const threshold = findAllByClass(detail, 'map-editor-slider-input').find((input) => input.dataset.field === 'threshold');
  assert.equal(Number(threshold.value), 0.7);
});

test('sliders theme: velocity and duration sliders set --range-progress and share theme class', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C2',
    midiVelocity: 64,
    noteTiming: 'beat',
    noteGate: 'pulse',
    noteDurationMs: 1000,
  };
  const { context, elements } = loadTriggerEditorContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  context.window.renderDetail();

  const detail = elements.get('map-mobile-detail');
  const sliders = findAllByClass(detail, 'map-editor-slider-input');
  assert.ok(sliders.length >= 2, 'must have velocity and duration sliders');

  for (const slider of sliders) {
    assert.ok(slider.classList.contains('morph-slider'), 'sliders must have morph-slider class for CFG theme');
    assert.ok(slider.style.getPropertyValue('--range-progress'), 'sliders must set --range-progress');
  }
});
