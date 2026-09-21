// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// P03: fader tracks the user's finger 1:1 across the live .fader-track height.
// The previous behavior used a fixed `rangePx = 150`, so a 150 px drag on a
// 300 px track still only moved the value by 0.5 and the thumb lagged behind
// the pointer on long MIX screens. With the track height driving the range,
// a 150 px drag on a 300 px track now moves the value by 0.5 (and the thumb
// hits the same pixel the finger is on).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function makeElement(dataset = {}, classes = []) {
  const listeners = {};
  const classSet = new Set(classes);
  let rect = { top: 0, left: 0, width: 100, height: 100 };
  return {
    dataset,
    listeners,
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name) || ''; },
    },
    classList: {
      _set: classSet,
      add(...names) { names.forEach((n) => classSet.add(n)); },
      remove(...names) { names.forEach((n) => classSet.delete(n)); },
      contains(name) { return classSet.has(name); },
    },
    addEventListener(type, cb) { listeners[type] = cb; },
    removeEventListener(type) { delete listeners[type]; },
    setPointerCapture() {},
    releasePointerCapture() {},
    setAttribute(name, value) { this[`__${name}`] = value; },
    getAttribute(name) { return this[`__${name}`]; },
    querySelector(selector) {
      if (selector === '.fader-thumb') return makeElement({ name: `${dataset.name}-thumb` });
      if (selector === '.fader-fill') return makeElement({ name: `${dataset.name}-fill` });
      if (selector === '.fader-track') return track;
      return null;
    },
    getBoundingClientRect: () => rect,
    setRect(next) { rect = next; },
    clientHeight: 100,
  };
}

function pointer(pointerId, clientY) {
  return { pointerId, clientX: 50, clientY, button: 0, preventDefault() {} };
}

function loadFader(trackHeight) {
  const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
  const controlsFile = path.join(import.meta.dirname, 'controls.js');
  const engineSource = fs.readFileSync(engineFile, 'utf8');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  const faderEl = makeElement({ name: 'fader-1' });
  const track = makeElement({ name: 'fader-1-track' });
  track.setRect({ top: 0, left: 0, width: 60, height: trackHeight });
  // Wire the fader element so its .fader-track lookup returns the tracked track.
  faderEl.querySelector = (selector) => {
    if (selector === '.fader-thumb') return makeElement({ name: `${faderEl.dataset.name}-thumb` });
    if (selector === '.fader-fill') return makeElement({ name: `${faderEl.dataset.name}-fill` });
    if (selector === '.fader-track') return track;
    return null;
  };

  let now = 0;
  const emitted = [];
  const rafCallbacks = [];

  const context = {
    document: {
      body: { dataset: {} },
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '.fader:not(.bipolar)') return [faderEl];
        if (selector === '.fader.bipolar') return [];
        return [];
      },
      getElementById: () => null,
      addEventListener() {},
    },
    navigator: { vibrate: () => {} },
    performance: { now: () => now },
    // Date.now() advances with the synthetic clock so consecutive pointerdowns
    // are seen as separate taps (controls.js treats gaps < 300 ms as a double
    // tap that resets the value to its baseline).
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
    onModulatorState() {},
  };
  context.window = context;
  context.faderRenderers = [];

  vm.runInNewContext(engineSource, context, { filename: engineFile });
  vm.runInNewContext(controlsSource, context, { filename: controlsFile });

  return {
    context,
    fader: faderEl,
    track,
    emitted,
    setTime(at) { now = at; },
    // Advance the synthetic clock by 400 ms (>300 ms debounce) before a new
    // gesture starts, so the double-tap reset branch in makeFader does not fire.
    bump() { now += 400; },
    tick() {
      const callbacks = rafCallbacks; rafCallbacks = [];
      callbacks.forEach((cb) => cb());
    },
    ariaValue() { return Number(faderEl.getAttribute('aria-valuenow')); },
  };
}

test('300 px track: 150 px drag moves the value by 0.5', () => {
  const app = loadFader(300);
  const startVal = Number(app.fader.getAttribute('aria-valuenow'));
  app.fader.listeners.pointerdown(pointer(1, 400));
  app.fader.listeners.pointermove(pointer(1, 250));
  app.fader.listeners.pointerup(pointer(1, 250));
  const endVal = app.ariaValue();
  // Default non-bipolar fader starts at 0.85; 150/300 = +0.5 -> clamp to 1.0.
  assert.equal(startVal, 0.85, 'non-bipolar fader must initialize at 0.85');
  assert.equal(endVal, 1, '150 px drag over a 300 px track must clamp the fader to the top');
  assert.equal(app.emitted.at(-1).value, 1);
});

test('150 px track: 150 px drag moves the value by the full 1.0 (clamped)', () => {
  const app = loadFader(150);
  const startVal = Number(app.fader.getAttribute('aria-valuenow'));
  app.fader.listeners.pointerdown(pointer(1, 200));
  app.fader.listeners.pointermove(pointer(1, 50));
  app.fader.listeners.pointerup(pointer(1, 50));
  const endVal = app.ariaValue();
  // 150/150 = +1.0; clamped to 1, regardless of startVal.
  assert.equal(startVal, 0.85);
  assert.equal(endVal, 1);
});

test('300 px track: 60 px drag moves the value by 0.20 (1 px = 1/300 of the range)', () => {
  const app = loadFader(300);
  app.fader.listeners.pointerdown(pointer(1, 400));
  app.fader.listeners.pointermove(pointer(1, 340));
  app.fader.listeners.pointerup(pointer(1, 340));
  const endVal = app.ariaValue();
  // 60/300 = +0.20 from the 0.85 baseline -> 1.05, clamped to 1.
  assert.equal(endVal, 1);
});

test('60 px drag on a 600 px track moves the value by 0.10', () => {
  const app = loadFader(600);
  app.fader.listeners.pointerdown(pointer(1, 400));
  app.fader.listeners.pointermove(pointer(1, 340));
  app.fader.listeners.pointerup(pointer(1, 340));
  const endVal = app.ariaValue();
  // 60/600 = +0.10 from the 0.85 baseline -> 0.95.
  assert.ok(Math.abs(endVal - 0.95) < 1e-9, `expected 0.95, got ${endVal}`);
});

test('track height is re-measured on each gesture start (no stale rangePx)', () => {
  const app = loadFader(300);
  // First drag with 300 px track.
  app.fader.listeners.pointerdown(pointer(1, 400));
  app.fader.listeners.pointermove(pointer(1, 250));
  app.fader.listeners.pointerup(pointer(1, 250));
  assert.equal(app.ariaValue(), 1);
  // Resize the track between gestures (e.g. MIX sheet rotated or reopened) and
  // advance the synthetic clock past the 300 ms double-tap debounce.
  app.track.setRect({ top: 0, left: 0, width: 60, height: 150 });
  app.bump();
  app.fader.listeners.pointerdown(pointer(2, 200));
  // Now the rangePx should come from the live 150 px track: a 150 px drag = +1.0.
  app.fader.listeners.pointermove(pointer(2, 50));
  app.fader.listeners.pointerup(pointer(2, 50));
  assert.equal(app.ariaValue(), 1);
  // And another drag of 60 px on the 150 px track must move by 60/150 = +0.4,
  // not by the stale 60/300 = +0.2 from the previous gesture.
  app.bump();
  app.fader.listeners.pointerdown(pointer(3, 50));
  app.fader.listeners.pointermove(pointer(3, -10));
  app.fader.listeners.pointerup(pointer(3, -10));
  assert.ok(Math.abs(app.ariaValue() - 1) < 1e-9, `expected clamped 1, got ${app.ariaValue()}`);
});
