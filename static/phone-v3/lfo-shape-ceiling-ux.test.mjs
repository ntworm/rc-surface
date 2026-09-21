// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// LFO shape ceiling UX tests (F-002).
// Tests shape ceilings, button disabling in #lfo-rate-grid,
// requested vs effective rate feedback in #lfo-effective-rate,
// dynamic recalculation on shape/BPM/config changes,
// preservation of user intention without silent preference mutation,
// and local vs global precedence.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function makeElement(tagName = 'div', dataset = {}, attrs = {}) {
  const listeners = {};
  const classes = new Set();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    dataset: { ...dataset },
    listeners,
    attributes: { ...attrs },
    children,
    disabled: false,
    _textContent: '',
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name) || ''; },
    },
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const enabled = typeof force === 'boolean' ? force : !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, cb) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    clientHeight: 100,
    click() {
      const cbs = listeners['click'] || [];
      cbs.forEach((cb) => cb({
        type: 'click',
        target: this,
        currentTarget: this,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      }));
    },
    trigger(type, event = {}) {
      const cbs = listeners[type] || [];
      const ev = {
        type,
        target: this,
        currentTarget: this,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...event,
      };
      cbs.forEach((cb) => cb(ev));
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (matches(child, selector)) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      for (const child of this.children) {
        if (matches(child, selector)) results.push(child);
        if (child.querySelectorAll) results.push(...child.querySelectorAll(selector));
      }
      return results;
    },
  };
  return el;
}

function matches(el, selector) {
  if (!el || !selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attr = selector.slice(1, -1);
    if (attr.includes('=')) {
      const [k, v] = attr.split('=');
      const cleanV = v.replace(/^["']|["']$/g, '');
      if (k.startsWith('data-')) {
        const dataKey = k.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        return el.dataset[dataKey] === cleanV;
      }
      return el.getAttribute(k) === cleanV;
    }
    if (attr.startsWith('data-')) {
      const dataKey = attr.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      return el.dataset[dataKey] !== undefined;
    }
    return el.getAttribute(attr) !== null;
  }
  return el.tagName === selector.toUpperCase();
}

const LFO_RATE_VALUES = [
  'auto', '32', '16', '8', '4', '3', '2.6666666666666665', '2',
  '1.5', '1.3333333333333333', '1', '0.75', '0.6666666666666666',
  '0.5', '0.25', '0.125', '0.0625',
];

const LFO_SHAPES = ['sine', 'triangle', 'ramp_up', 'ramp_down', 'square'];

function loadHarness() {
  const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
  const controlConfigFile = path.join(import.meta.dirname, 'control-config.js');
  const controlsFile = path.join(import.meta.dirname, 'controls.js');

  const engineSource = fs.readFileSync(engineFile, 'utf8');
  const controlConfigSource = fs.readFileSync(controlConfigFile, 'utf8');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  const overlay = makeElement('div');
  overlay.id = 'sync-settings-overlay';

  const rateGrid = makeElement('div');
  rateGrid.id = 'lfo-rate-grid';
  rateGrid.classList.add('rate-grid');
  overlay.children.push(rateGrid);

  const rateButtons = new Map();
  for (const val of LFO_RATE_VALUES) {
    const btn = makeElement('button', { val });
    btn.classList.add('grid-btn');
    rateGrid.children.push(btn);
    rateButtons.set(val, btn);
  }

  const shapeGrid = makeElement('div');
  shapeGrid.id = 'lfo-shape-grid';
  shapeGrid.classList.add('shape-grid');
  overlay.children.push(shapeGrid);

  const shapeButtons = new Map();
  for (const val of LFO_SHAPES) {
    const btn = makeElement('button', { val });
    btn.classList.add('grid-btn');
    shapeGrid.children.push(btn);
    shapeButtons.set(val, btn);
  }

  const effectiveRate = makeElement('div');
  effectiveRate.id = 'lfo-effective-rate';
  effectiveRate.classList.add('readout-val');
  effectiveRate.textContent = 'AUTO · 1 → 1/8';
  overlay.children.push(effectiveRate);

  const shapeLimit = makeElement('div');
  shapeLimit.id = 'lfo-shape-limit';
  shapeLimit.classList.add('readout-val');
  shapeLimit.textContent = 'sine · MAX 4 Hz';
  overlay.children.push(shapeLimit);

  const lfo = makeElement('div', { name: 'toggle-1' });
  lfo.classList.add('toggle');
  const lfoReadout = makeElement('span');
  lfoReadout.classList.add('lfo-rate-readout');
  lfo.children.push(lfoReadout);

  const elementsById = {
    'sync-settings-overlay': overlay,
    'lfo-rate-grid': rateGrid,
    'lfo-shape-grid': shapeGrid,
    'lfo-effective-rate': effectiveRate,
    'lfo-shape-limit': shapeLimit,
  };

  let rafCallbacks = [];
  let now = 0;
  const emitted = [];
  const modulatorStates = [];

  const context = {
    window: null,
    document: {
      body: {
        dataset: { page: 'performance' },
        classList: {
          add() {}, remove() {}, toggle() {}, contains() { return false; },
        },
      },
      getElementById: (id) => elementsById[id] || null,
      querySelector(sel) {
        if (sel === '.toggle[data-name="toggle-1"]') return lfo;
        if (sel === '#lfo-rate-grid') return rateGrid;
        if (sel === '#lfo-shape-grid') return shapeGrid;
        if (sel === '#lfo-effective-rate') return effectiveRate;
        if (sel === '#lfo-shape-limit') return shapeLimit;
        if (sel === '#sync-settings-overlay') return overlay;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.toggle') return [lfo];
        if (sel === '[data-name]') return [lfo];
        return [];
      },
      addEventListener() {},
    },
    navigator: { vibrate: () => {} },
    performance: { now: () => now },
    Date: { now: () => 100000 + now },
    requestAnimationFrame(cb) { rafCallbacks.push(cb); },
    cancelAnimationFrame() {},
    addEventListener() {},
    dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() {},
    setInterval() {},
    localStorage: { getItem: () => null, setItem: () => {} },
    onControl(ctrl) { emitted.push(ctrl); },
    onModulatorState(state) { modulatorStates.push(state); },
  };
  context.window = context;

  vm.runInNewContext(engineSource, context, { filename: engineFile });
  vm.runInNewContext(controlConfigSource, context, { filename: controlConfigFile });
  vm.runInNewContext(controlsSource, context, { filename: controlsFile });

  return {
    context,
    overlay,
    rateGrid,
    rateButtons,
    shapeGrid,
    shapeButtons,
    effectiveRate,
    shapeLimit,
    lfo,
    lfoReadout,
    emitted,
    modulatorStates,
    tick(at) {
      now = at;
      const cbs = rafCallbacks;
      rafCallbacks = [];
      cbs.forEach((cb) => cb());
    },
  };
}

test('P01-1: at 120 BPM, triangle shape disables subdivisions exceeding 3 Hz ceiling and allows exact limit', () => {
  const h = loadHarness();
  h.context.currentBpm = 120;
  h.shapeButtons.get('triangle').click();
  h.tick(16);

  // At 120 BPM (2 bps), ceiling for triangle is 3 Hz:
  // - 1/8 note (val 0.5): 2 / 0.5 = 4 Hz > 3 Hz => must be DISABLED
  const btn1_8 = h.rateButtons.get('0.5');
  assert.equal(btn1_8.disabled, true, '1/8 (4 Hz at 120 BPM) must be disabled under triangle 3 Hz ceiling');

  // - 1/16 (0.25): 8 Hz > 3 Hz => DISABLED
  assert.equal(h.rateButtons.get('0.25').disabled, true, '1/16 (8 Hz) must be disabled');
  // - 1/32 (0.125): 16 Hz > 3 Hz => DISABLED
  assert.equal(h.rateButtons.get('0.125').disabled, true, '1/32 (16 Hz) must be disabled');
  // - 1/64 (0.0625): 32 Hz > 3 Hz => DISABLED
  assert.equal(h.rateButtons.get('0.0625').disabled, true, '1/64 (32 Hz) must be disabled');

  // Exact limit:
  // - 1/4 T (val 2/3): 2 / (2/3) = 3 Hz == 3 Hz => must be ALLOWED (disabled: false)
  const btn1_4T = h.rateButtons.get('0.6666666666666666');
  assert.equal(btn1_4T.disabled, false, '1/4 T (exact limit 3.0 Hz) must be enabled');

  // Slower rates:
  // - 1/8 D (0.75): 2 / 0.75 = 2.67 Hz <= 3 Hz => ALLOWED
  assert.equal(h.rateButtons.get('0.75').disabled, false, '1/8 D (2.67 Hz) must be enabled');
  // - 1/4 (1.0): 2 / 1 = 2 Hz <= 3 Hz => ALLOWED
  assert.equal(h.rateButtons.get('1').disabled, false, '1/4 (2 Hz) must be enabled');
  // - auto: always ALLOWED
  assert.equal(h.rateButtons.get('auto').disabled, false, 'Auto must always be enabled');
});

test('P01-2: clicking or keyboard activating a disabled button in #lfo-rate-grid is rejected', () => {
  const h = loadHarness();
  h.context.currentBpm = 120;
  h.shapeButtons.get('triangle').click();
  h.tick(16);

  const btn1_8 = h.rateButtons.get('0.5');
  assert.equal(btn1_8.disabled, true);

  // Attempt click on disabled button
  btn1_8.click();
  assert.notEqual(h.context.syncSettings.lfoSubdivision, 0.5, 'Clicking disabled button must not set lfoSubdivision');
  assert.equal(h.context.syncSettings.lfoSubdivisionPinned, false, 'Clicking disabled button must not pin subdivision');
});

test('P01-3: switching shape dynamically recalculates button availability and shape limit readout', () => {
  const h = loadHarness();
  h.context.currentBpm = 120;

  // Triangle: 3 Hz ceiling
  h.shapeButtons.get('triangle').click();
  h.tick(16);
  assert.equal(h.rateButtons.get('0.5').disabled, true, '1/8 disabled on triangle');
  assert.equal(h.shapeLimit.textContent, 'triangle · MAX 3 Hz');

  // Switch to Square: 12 Hz ceiling
  h.shapeButtons.get('square').click();
  h.tick(32);
  assert.equal(h.rateButtons.get('0.5').disabled, false, '1/8 re-enabled on square (4 Hz <= 12 Hz)');
  assert.equal(h.rateButtons.get('0.25').disabled, false, '1/16 re-enabled on square (8 Hz <= 12 Hz)');
  assert.equal(h.rateButtons.get('0.125').disabled, true, '1/32 still disabled on square (16 Hz > 12 Hz)');
  assert.equal(h.shapeLimit.textContent, 'square · MAX 12 Hz');

  // Switch to Sine: 4 Hz ceiling (exact limit for 1/8)
  h.shapeButtons.get('sine').click();
  h.tick(48);
  assert.equal(h.rateButtons.get('0.5').disabled, false, '1/8 enabled on sine (exact limit 4 Hz <= 4 Hz)');
  assert.equal(h.rateButtons.get('0.25').disabled, true, '1/16 disabled on sine (8 Hz > 4 Hz)');
  assert.equal(h.shapeLimit.textContent, 'sine · MAX 4 Hz');

  // Switch to Ramp Up / Ramp Down: 3 Hz ceiling
  h.shapeButtons.get('ramp_up').click();
  h.tick(64);
  assert.equal(h.rateButtons.get('0.5').disabled, true, '1/8 disabled on ramp_up');
  assert.equal(h.shapeLimit.textContent, 'ramp_up · MAX 3 Hz');

  h.shapeButtons.get('ramp_down').click();
  h.tick(80);
  assert.equal(h.rateButtons.get('0.5').disabled, true, '1/8 disabled on ramp_down');
  assert.equal(h.shapeLimit.textContent, 'ramp_down · MAX 3 Hz');
});

test('P01-4: BPM changes recalculate button availability', () => {
  const h = loadHarness();
  h.context.currentBpm = 60; // 1 bps
  h.shapeButtons.get('triangle').click(); // 3 Hz ceiling
  h.tick(16);

  // At 60 BPM (1 bps): 1/8 note (0.5) is 1 / 0.5 = 2 Hz <= 3 Hz => enabled!
  assert.equal(h.rateButtons.get('0.5').disabled, false, '1/8 at 60 BPM (2 Hz) must be enabled under 3 Hz ceiling');

  // Tempo changes to 120 BPM (2 bps): 1/8 is now 2 / 0.5 = 4 Hz > 3 Hz => disabled!
  h.context.currentBpm = 120;
  h.tick(32);
  assert.equal(h.rateButtons.get('0.5').disabled, true, '1/8 at 120 BPM (4 Hz) must be disabled under 3 Hz ceiling');

  // Tempo changes to 240 BPM (4 bps): 1/4 (1.0) is 4 / 1 = 4 Hz > 3 Hz => disabled!
  h.context.currentBpm = 240;
  h.tick(48);
  assert.equal(h.rateButtons.get('1').disabled, true, '1/4 at 240 BPM (4 Hz) must be disabled under 3 Hz ceiling');
  assert.equal(h.rateButtons.get('2').disabled, false, '1/2 at 240 BPM (2 Hz) must remain enabled');
});

test('P01-5: existing selection above ceiling stays as intention with clamp feedback in #lfo-effective-rate without silent mutation', () => {
  const h = loadHarness();
  // Select 1/8 at 60 BPM where it is valid
  h.context.currentBpm = 60;
  h.shapeButtons.get('triangle').click();
  h.rateButtons.get('0.5').click();
  h.tick(16);

  assert.equal(h.context.syncSettings.lfoSubdivisionPinned, true);
  assert.equal(h.context.syncSettings.lfoSubdivision, 0.5);
  assert.equal(h.effectiveRate.textContent, '1/8');

  // Tempo increases to 120 BPM: 1/8 requests 4 Hz > 3 Hz ceiling
  h.context.currentBpm = 120;
  h.tick(32);

  // Intention is preserved: stored preference NOT mutated silently!
  assert.equal(h.context.syncSettings.lfoSubdivision, 0.5, 'Stored subdivision preference must not be mutated');
  // Button shows intention (active / on) but disabled
  assert.equal(h.rateButtons.get('0.5').disabled, true, 'Button is disabled');
  assert.equal(h.rateButtons.get('0.5').classList.contains('on'), true, 'Button retains active intention class');

  // Feedback shows requested vs clamped effective rate: 1/8 -> 1/4 (clamped to 2 Hz <= 3 Hz)
  assert.equal(h.effectiveRate.textContent, '1/8 → 1/4', 'Feedback must show requested vs clamped effective rate');

  // Switching shape to square (12 Hz ceiling) lifts the clamp
  h.shapeButtons.get('square').click();
  h.tick(48);
  assert.equal(h.effectiveRate.textContent, '1/8', 'Feedback returns to requested rate when ceiling permits');
  assert.equal(h.rateButtons.get('0.5').disabled, false, 'Button re-enabled under 12 Hz ceiling');
});

test('P01-6: independent clamp verification on runtime / getLfoSubdivision', () => {
  const h = loadHarness();
  // Under triangle (3 Hz ceiling) at 120 BPM:
  // requested 0.5 (1/8 note = 4 Hz) must clamp to 1.0 (1/4 note = 2 Hz <= 3 Hz)
  const clampedTriangle = h.context.getLfoSubdivision(0.5, 120, 0.5, 'triangle');
  assert.equal(clampedTriangle, 1.0, 'getLfoSubdivision with triangle at 120 BPM must clamp 0.5 to 1.0');

  // Under sine (4 Hz ceiling) at 120 BPM:
  // requested 0.5 (1/8 note = 4 Hz) is exact limit => 0.5
  const exactSine = h.context.getLfoSubdivision(0.5, 120, 0.5, 'sine');
  assert.equal(exactSine, 0.5, 'getLfoSubdivision with sine at 120 BPM must permit exact limit 0.5');

  // Under square (12 Hz ceiling) at 120 BPM:
  // requested 0.5 => 0.5
  const exactSquare = h.context.getLfoSubdivision(0.5, 120, 0.5, 'square');
  assert.equal(exactSquare, 0.5, 'getLfoSubdivision with square must permit 0.5');
});

test('P01-7: local per-control shape override in RcControlConfig takes precedence over global syncSettings', () => {
  const h = loadHarness();
  h.context.currentBpm = 120;
  // Global shape is square (12 Hz)
  h.shapeButtons.get('square').click();
  h.tick(16);

  // toggle-1 has local shape override 'triangle' (3 Hz) in RcControlConfig
  h.context.RcControlConfig.set('toggle-1', { shape: 'triangle' });

  // Pinned to 1/8 note (0.5 = 4 Hz at 120 BPM)
  h.context.syncSettings.lfoSubdivisionPinned = true;
  h.context.syncSettings.lfoSubdivision = 0.5;
  h.tick(32);

  // Send state or tick toggle-1
  h.context.sendLfoState('toggle-1', h.context.lfoStates.get('toggle-1'));
  const lastState = h.modulatorStates.at(-1);
  assert.equal(lastState.shape, 'triangle', 'Emitted state must use local shape override');

  // Local readout on the control reflects its effective clamped rate (1/4 note under 3 Hz ceiling)
  assert.equal(h.lfoReadout.textContent, '1/4', 'Control rate readout must reflect local shape ceiling');

  // Clearing local override reverts toggle-1 to global square ceiling (4 Hz <= 12 Hz -> 1/8)
  h.context.RcControlConfig.clear('toggle-1');
  h.tick(48);
  assert.equal(h.lfoReadout.textContent, '1/8', 'Control rate readout must revert to global square ceiling');
});
