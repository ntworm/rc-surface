// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { applyCurve } from '../../src/live/curves.ts';

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
        const active = force === undefined ? !this.classList.contains(name) : !force;
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
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  setAttribute(name, value) { this[name] = value; }
  getAttribute(name) { return this[name] || null; }
  closest(selector) {
    if (selector === '.map-editor-slider-wrap' && this.classList.contains('map-editor-slider-wrap')) return this;
    if (this.parentNode && typeof this.parentNode.closest === 'function') return this.parentNode.closest(selector);
    return null;
  }
  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) out.push(child);
        else if (selector.startsWith('#') && child.id === selector.slice(1)) out.push(child);
        else if (selector === 'canvas' && child.tagName === 'CANVAS') out.push(child);
        else if (selector.includes('data-field') && child.dataset?.field) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 180, height: 180 };
  }
  setPointerCapture() {}
}

function loadMappingContext(initialMappings = {}, { recordCanvas = false } = {}) {
  const frames = [];
  const drawing = { arcs: [], points: [] };
  const canvasContext = {
    fillRect() {}, beginPath() {}, stroke() {}, fill() {}, setLineDash() {},
    moveTo(x, y) { drawing.points.push({ x, y }); },
    lineTo(x, y) { drawing.points.push({ x, y }); },
    arc(x, y, radius) { drawing.arcs.push({ x, y, radius, lineWidth: this.lineWidth }); },
  };
  const ids = [
    'btn-map-mode', 'btn-map-back', 'btn-map-refresh', 'mapping-mode',
    'map-armed-strip',
    'map-mobile-status', 'map-mobile-presets', 'map-mobile-search',
    'map-mobile-controls', 'map-mobile-detail',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  function getOrCreate(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  }

  const body = new FakeElement('body');
  body.dataset.page = 'performance';
  const document = {
    readyState: 'complete',
    body,
    createElement(tag) {
      const el = new FakeElement();
      el.tagName = tag.toUpperCase();
      if (recordCanvas && tag === 'canvas') el.getContext = () => canvasContext;
      return el;
    },
    getElementById(id) { return getOrCreate(id); },
    querySelector(selector) {
      if (selector === '#map-mobile-status') return getOrCreate('map-mobile-status');
      if (selector === '#map-mobile-detail') return getOrCreate('map-mobile-detail');
      for (const el of elements.values()) {
        const found = el.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(selector) {
      const out = [];
      for (const el of elements.values()) {
        out.push(...el.querySelectorAll(selector));
      }
      return out;
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
    const fixtures = {
      getTargets: { ok: true, result: { targets: [{ type: 'tempo' }] } },
      getMappings: { ok: true, result: { mappings: mockMappings } },
      getClients: { ok: true, result: { clients: [{ client_id: 'phone-1', status: 'active' }] } },
      listPresets: { ok: true, result: { presets: ['Default'], current: 'Default' } },
      getProjectConfigStatus: { ok: true, result: { report: { loaded: 1, relinked: 0, review: 0, ambiguous: 0, missing: 0 }, clientState: {} } },
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
      phoneWs: { readyState: 1 },
      lastSessionBpm: 124,
      currentNumerator: 4,
      currentDenominator: 4,
    },
    document,
    CustomEvent: class CustomEvent { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
    console,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
  });
  context.window.window = context.window;
  context.window.document = document;
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-input-contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'mapping-mode.js'), 'utf8'), context);
  return { context, document, calls, elements, frames, drawing };
}

test('C19: curve line, live marker and handles stay inside the canvas at both extremes', async () => {
  for (const [outMin, outMax] of [[0, 1], [1, 0], [0, 0], [1, 1]]) {
    const target = { type: 'tempo', mode: 'continuous', inMin: 0, inMax: 1, outMin, outMax };
    const { context, elements, frames, drawing } = loadMappingContext({ 'fader-1': [target] }, { recordCanvas: true });
    await context.window.openMobileMappingMode();
    context.window.mobileMappingState.selectedControl = 'fader-1';
    context.window.currentControlStates = { 'fader-1': 0 };
    await context.window.loadMobileMappingData();
    const canvas = elements.get('map-mobile-detail').querySelector('canvas');
    frames.at(-1)();
    assert.equal(drawing.arcs.length, 5, 'live marker and three editing handles are drawn');
    for (const arc of drawing.arcs) {
      const extent = arc.radius + (arc.lineWidth || 0) / 2;
      assert.ok(arc.x - extent >= 0 && arc.x + extent <= canvas.width, 'whole handle fits horizontally');
      assert.ok(arc.y - extent >= 0 && arc.y + extent <= canvas.height, 'whole handle fits vertically');
    }
    for (const point of drawing.points) {
      assert.ok(point.x >= 0 && point.x <= canvas.width && point.y >= 0 && point.y <= canvas.height);
    }
    if (outMin === 0 && outMax === 1) {
      const left = drawing.arcs[2];
      const right = drawing.arcs[3];
      const down = canvas.listeners.get('pointerdown')[0];
      const move = canvas.listeners.get('pointermove')[0];
      const up = canvas.listeners.get('pointerup')[0];
      const rect = canvas.getBoundingClientRect();
      const pointer = (x, y) => ({ clientX: x * rect.width / canvas.width, clientY: y * rect.height / canvas.height, preventDefault() {} });
      down(pointer(left.x, left.y));
      move(pointer(left.x, canvas.height / 2));
      up();
      assert.equal(target.outMin, 0.5, 'drag uses the same inset plot as rendering');
      down(pointer(right.x, right.y));
      move(pointer(right.x, left.y));
      up();
      assert.equal(context.window.mobileMappingState.currentMappings['fader-1'][0].outMax, 0, 'opposite plot edge persists exactly zero');
    }
  }
});

async function curveFixture(target) {
  const fixture = loadMappingContext({ 'fader-1': [target] }, { recordCanvas: true });
  await fixture.context.window.openMobileMappingMode();
  fixture.context.window.mobileMappingState.selectedControl = 'fader-1';
  await fixture.context.window.loadMobileMappingData();
  const canvas = fixture.elements.get('map-mobile-detail').querySelector('canvas');
  const paint = () => {
    fixture.drawing.arcs.length = 0;
    fixture.drawing.points.length = 0;
    fixture.frames.at(-1)();
    return fixture.drawing.arcs.slice(-3);
  };
  const rect = canvas.getBoundingClientRect();
  const drag = (handle, output) => {
    const pointer = (x, y) => ({ clientX: x * rect.width / canvas.width, clientY: y * rect.height / canvas.height, preventDefault() {} });
    canvas.listeners.get('pointerdown')[0](pointer(handle.x, handle.y));
    canvas.listeners.get('pointermove')[0](pointer(handle.x, 14 + (1 - output) * (canvas.height - 28)));
    canvas.listeners.get('pointerup')[0]();
  };
  const outputOf = (handle) => 1 - (handle.y - 14) / (canvas.height - 28);
  return { ...fixture, canvas, paint, drag, outputOf };
}

test('C20: all handles lie on the backend response and drawn line under Drive/Compression', async () => {
  for (const curve of ['linear', 'exponential', 'logarithmic', 's-curve']) {
    for (const drive of [0.32, -0.25]) {
      for (const compressor of [-1, 0, 0.6, 1]) {
        for (const [outMin, outMax] of [[0, 1], [0.8, 0.2], [0.4, 0.4]]) {
          const target = { type: 'tempo', mode: 'continuous', curve, drive, compressor, inMin: 0.17, inMax: 0.83, outMin, outMax };
          const { paint, outputOf, drawing } = await curveFixture(target);
          const handles = paint();
          for (const [index, normalizedInput] of [[0, 0], [1, 1], [2, 0.5]]) {
            const expected = outMin + applyCurve(normalizedInput, curve, drive, compressor) * (outMax - outMin);
            assert.ok(Math.abs(outputOf(handles[index]) - expected) < 1e-8, `${curve}/${drive}/${compressor}: handle matches backend output`);
            assert.ok(drawing.points.some((p) => Math.hypot(p.x - handles[index].x, p.y - handles[index].y) < 1e-8), 'curve path passes through each handle');
          }
        }
      }
    }
  }
});

test('C20: shaped endpoint and center drags land at requested output and persist finite bounds', async () => {
  const target = { type: 'tempo', mode: 'continuous', curve: 'exponential', drive: 0.32, compressor: -0.5, inMin: 0.2, inMax: 0.8, outMin: 0.1, outMax: 0.9 };
  const { paint, drag, outputOf, calls } = await curveFixture(target);
  drag(paint()[0], 0.55);
  assert.ok(Math.abs(outputOf(paint()[0]) - 0.55) < 0.01, 'outMin drag accounts for shaped endpoint coefficient');
  drag(paint()[1], 0.7);
  assert.ok(Math.abs(outputOf(paint()[1]) - 0.7) < 0.01, 'outMax drag accounts for shaped endpoint coefficient');
  const savedBounds = calls.filter((call) => call.cmd === 'setMapping').at(-1).args.targets[0];
  for (const compressor of [-0.5, 0.5]) {
    const centerTarget = { ...savedBounds, compressor };
    const center = await curveFixture(centerTarget);
    center.drag(center.paint()[2], 0.6);
    const actual = center.outputOf(center.paint()[2]);
    assert.ok(Math.abs(actual - 0.6) < 0.01, `Drive drag reverses compression ${compressor}: output=${actual}, drive=${centerTarget.drive}`);
    const savedDrive = center.calls.filter((call) => call.cmd === 'setMapping').at(-1).args.targets[0].drive;
    assert.equal(savedDrive, centerTarget.drive);
  }
  const saved = calls.filter((call) => call.cmd === 'setMapping').at(-1).args.targets[0];
  for (const field of ['outMin', 'outMax', 'drive', 'compressor']) assert.ok(Number.isFinite(saved[field]));
  assert.ok(saved.outMin >= 0 && saved.outMin <= 1 && saved.outMax >= 0 && saved.outMax <= 1);
  assert.ok(saved.drive >= -1 && saved.drive <= 1);
  const inverted = await curveFixture({ ...target, compressor: 0.5, outMin: 0.8, outMax: 0.2 });
  inverted.drag(inverted.paint()[2], 0.4);
  assert.ok(Math.abs(inverted.outputOf(inverted.paint()[2]) - 0.4) < 0.01, 'Drive drag also inverts a descending output range');
});

test('C20: hit testing and drag use live fields after a slider input without rerender', async () => {
  const target = { type: 'tempo', mode: 'continuous', curve: 'exponential', drive: 0.32, compressor: 0, outMin: 0.1, outMax: 0.9 };
  const { paint, drag, outputOf, context } = await curveFixture(target);
  await context.window.updateMobileTargetField('compressor', -0.5, { refresh: false });
  drag(paint()[2], 0.6);
  assert.ok(Math.abs(outputOf(paint()[2]) - 0.6) < 0.01);
  assert.equal(context.window.mobileMappingState.currentMappings['fader-1'][0].compressor, -0.5);
});

test('C20: saturated and flat drags preserve unreachable values without division by zero', async () => {
  for (const [drive, handleIndex, field] of [[1, 0, 'outMin'], [-1, 1, 'outMax']]) {
    const target = { type: 'tempo', mode: 'continuous', curve: 'exponential', drive, outMin: 0.2, outMax: 0.8 };
    const { paint, drag } = await curveFixture(target);
    const original = target[field];
    drag(paint()[handleIndex], 0.5);
    assert.equal(target[field], original, 'saturated endpoint has no influence on this output');
  }
  const target = { type: 'tempo', mode: 'continuous', curve: 'linear', drive: 0.2, compressor: 0.5, outMin: 0.4, outMax: 0.4 };
  const { paint, drag } = await curveFixture(target);
  drag(paint()[2], 0.8);
  assert.equal(target.drive, 0.2, 'flat output range has no inverse for Drive');
});

test('double click on editor faders resets to documented defaults and updates mapping', async () => {
  const target = {
    type: 'tempo',
    mode: 'continuous',
    inMin: 0.2,
    inMax: 0.8,
    outMin: 0.3,
    outMax: 0.7,
    drive: 0.5,
  };
  const { context, elements, calls } = loadMappingContext({ 'fader-1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'fader-1';
  await context.window.loadMobileMappingData();

  const detail = elements.get('map-mobile-detail');
  const sliderWraps = detail.querySelectorAll('.map-editor-slider-wrap');
  assert.ok(sliderWraps.length >= 4, 'must render editor sliders');

  // Find Out Min slider wrap
  const outMinWrap = sliderWraps.find((w) => w.dataset.field === 'outMin');
  assert.ok(outMinWrap, 'must find Out Min wrap');
  const outMinInput = outMinWrap.children.find((c) => c.dataset?.field === 'outMin');
  assert.ok(outMinInput, 'must find Out Min input');

  // Trigger double-click on Out Min input
  const dblListeners = outMinInput.listeners.get('dblclick') || [];
  assert.ok(dblListeners.length > 0, 'must register dblclick listener');
  dblListeners[0]({ preventDefault() {} });

  // Out Min default is 0.00
  assert.equal(outMinInput.value, '0');
  const lastSet = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.ok(lastSet, 'must dispatch setMapping on reset');
  assert.equal(lastSet.args.targets[0].outMin, 0);

  // Find Drive slider wrap
  const driveWrap = sliderWraps.find((w) => w.dataset.field === 'drive');
  const driveInput = driveWrap.children.find((c) => c.dataset?.field === 'drive');
  const driveDbl = driveInput.listeners.get('dblclick') || [];
  driveDbl[0]({ preventDefault() {} });
  assert.equal(driveInput.value, '0');
  const lastSetDrive = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.equal(lastSetDrive.args.targets[0].drive, 0);
});

test('curve canvas registers 3 draggable handles and updates target on drag', async () => {
  const target = {
    type: 'tempo',
    mode: 'continuous',
    inMin: 0,
    inMax: 1,
    outMin: 0.1,
    outMax: 0.9,
    drive: 0,
  };
  const { context, elements, calls } = loadMappingContext({ 'fader-1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'fader-1';
  await context.window.loadMobileMappingData();

  const detail = elements.get('map-mobile-detail');
  const canvas = detail.querySelector('canvas');
  assert.ok(canvas, 'curve canvas must exist');

  // Check pointer listeners exist
  const pointerDown = canvas.listeners.get('pointerdown')?.[0];
  const pointerMove = canvas.listeners.get('pointermove')?.[0];
  const pointerUp = canvas.listeners.get('pointerup')?.[0];
  assert.ok(pointerDown, 'pointerdown listener registered');
  assert.ok(pointerMove, 'pointermove listener registered');
  assert.ok(pointerUp, 'pointerup listener registered');

  // C19: the 14px inset uses the same coordinates for drawing and pointer input.
  pointerDown({ clientX: 7, clientY: 150.8, preventDefault() {} });
  // Move up to y=90 (halfway, normY = 0.5)
  pointerMove({ offsetX: 0, offsetY: 90, clientX: 0, clientY: 90 });
  pointerUp();

  assert.equal(target.outMin, 0.5, 'outMin must update to 0.5');
  const setOutMin = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.equal(setOutMin.args.targets[0].outMin, 0.5);

  pointerDown({ clientX: 173, clientY: 29.2, preventDefault() {} });
  // Inset plot y=74.8 corresponds to normalized output 0.6.
  pointerMove({ clientX: 173, clientY: 74.8 });
  pointerUp();

  assert.equal(context.window.mobileMappingState.currentMappings['fader-1'][0].outMax, 0.6, 'persisted outMax must update to 0.6');

  // Double-click on canvas resets all 3 handles to defaults
  const dblClick = canvas.listeners.get('dblclick')?.[0];
  assert.ok(dblClick, 'dblclick listener on canvas');
  // Double-click in open canvas area (x=50, y=50)
  dblClick({ offsetX: 50, offsetY: 50, clientX: 50, clientY: 50, preventDefault() {} });
  const resetTarget = context.window.mobileMappingState.currentMappings['fader-1'][0];
  assert.equal(resetTarget.outMin, 0, 'outMin reset to 0');
  assert.equal(resetTarget.outMax, 1, 'outMax reset to 1');
  assert.equal(resetTarget.drive, 0, 'drive reset to 0');
});

test('C14: sustained notes use the gate control without chord shortcuts or pitch reset', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    midiNote: 'C3',
    noteTiming: 'immediate',
    noteGate: 'pulse',
    noteDurationMs: 120,
  };
  const { context, elements, calls } = loadMappingContext({ 'sensor.vision.gesture.1': [target] });
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  await context.window.loadMobileMappingData();

  const detail = elements.get('map-mobile-detail');
  assert.equal(detail.querySelector('.map-btn-for-chords-hold'), null);
  await context.window.updateMobileTargetField('noteGate', 'hold');

  const lastSet = calls.filter((c) => c.cmd === 'setMapping').at(-1);
  assert.ok(lastSet, 'setMapping called');
  const saved = lastSet.args.targets[0];
  assert.equal(saved.midiNote, 'C3');
  assert.equal(saved.noteTiming, 'immediate');
  assert.equal(saved.noteGate, 'hold');
});

test('LIVE transport line shows clock sync state when snapshot is valid vs invalid', async () => {
  const target = {
    type: 'device_param',
    trackIndex: 0,
    mode: 'trigger_note',
    noteTiming: 'beat',
    noteGate: 'pulse',
  };
  const { context, elements } = loadMappingContext({ 'sensor.vision.gesture.1': [target] });

  // Simulate invalid clock
  context.window.triggerNoteClockSnapshot = { valid: false, reason: 'unobserved' };
  await context.window.openMobileMappingMode();
  context.window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
  await context.window.loadMobileMappingData();

  const detail = elements.get('map-mobile-detail');
  const liveLine = detail.querySelector('.map-timing-live-status');
  assert.ok(liveLine, 'liveLine must render');
  assert.match(liveLine.textContent, /(?:SEM CLOCK OSC|NO OSC CLOCK) \(unobserved\)/);

  // Now simulate valid clock
  context.window.triggerNoteClockSnapshot = { valid: true, bpm: 120, beat: 4 };
  await context.window.loadMobileMappingData();
  const liveLineValid = detail.querySelector('.map-timing-live-status');
  assert.match(liveLineValid.textContent, /CLOCK OSC OK/);

  // Real-time update via window.updateTriggerNoteClockUI without full reload
  context.window.triggerNoteClockSnapshot = { valid: true, bpm: 128, beat: 8 };
  context.window.lastSessionBpm = 128;
  context.window.updateTriggerNoteClockUI();
  assert.match(liveLineValid.textContent, /LIVE 128\.0BPM/);
  assert.match(liveLineValid.textContent, /CLOCK OSC OK/);
});
