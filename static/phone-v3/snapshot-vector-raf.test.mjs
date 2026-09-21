// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// static/phone-v3/snapshot-vector-raf.test.mjs — Unit tests for Vector Pad RAF coalescing (F-004).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const engineSource = fs.readFileSync(path.join(import.meta.dirname, 'mode-engine.js'), 'utf8');
const snapshotsSource = fs.readFileSync(path.join(import.meta.dirname, 'modules/snapshots.js'), 'utf8');
const controlsSource = fs.readFileSync(path.join(import.meta.dirname, 'controls.js'), 'utf8');

function createVectorEnvironment() {
  const rafCallbacks = new Map();
  let nextRafId = 1;
  let rafCallsCount = 0;

  function fakeRequestAnimationFrame(cb) {
    rafCallsCount++;
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  }

  function fakeCancelAnimationFrame(id) {
    rafCallbacks.delete(id);
  }

  function flushOneRaf(timestamp = 1000) {
    const cbs = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const cb of cbs) {
      cb(timestamp);
    }
  }

  function getPendingRafCount() {
    return rafCallbacks.size;
  }

  function getRafCallsCount() {
    return rafCallsCount;
  }

  function createMockElement(id = '', className = '') {
    const listeners = new Map();
    const el = {
      id,
      className,
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; },
      },
      style: {
        setProperty() {},
        removeProperty() {},
      },
      setAttribute() {},
      removeAttribute() {},
      setPointerCapture() {},
      releasePointerCapture() {},
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      fire(type, eventObj = {}) {
        const fns = listeners.get(type) || [];
        for (const fn of fns) {
          fn({
            preventDefault() {},
            pointerId: 1,
            button: 0,
            ...eventObj,
          });
        }
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
      },
      getContext() {
        return {
          clearRect() {},
          beginPath() {},
          arc() {},
          fill() {},
          stroke() {},
          fillText() {},
          setLineDash() {},
          moveTo() {},
          lineTo() {},
          createRadialGradient() {
            return { addColorStop() {} };
          },
        };
      },
      querySelector(sel) {
        if (sel === '#xy-vector-canvas') return canvas;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      clientWidth: 100,
      clientHeight: 100,
    };
    return el;
  }

  const canvas = createMockElement('xy-vector-canvas');
  const vPad = createMockElement('xy-vector-pad');
  const container = createMockElement('snp-vector-container');

  const elementsById = new Map([
    ['xy-vector-pad', vPad],
    ['xy-vector-canvas', canvas],
    ['snp-vector-container', container],
  ]);

  const faderValues = [];
  const setterCallCounts = { fader: 0 };

  const context = {
    window: null,
    document: {
      body: {
        ...createMockElement('body'),
        dataset: { page: 'performance' },
      },
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    },
    navigator: { vibrate() {} },
    Date: { now: () => 1000 },
    performance: { now: () => 1000 },
    requestAnimationFrame: fakeRequestAnimationFrame,
    cancelAnimationFrame: fakeCancelAnimationFrame,
    addEventListener() {},
    dispatchEvent() {},
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    setTimeout: (fn) => fn(),
    clearTimeout() {},
    setInterval() {},
    clearInterval() {},
    console,
    Array,
    JSON,
    Math,
    Number,
  };
  context.window = context;

  vm.runInNewContext(engineSource, context, { filename: 'mode-engine.js' });
  vm.runInNewContext(snapshotsSource, context, { filename: 'modules/snapshots.js' });
  vm.runInNewContext(controlsSource, context, { filename: 'controls.js' });

  // Setup 4 snapshot corners for interpolation:
  // Slot 0 (TL: x=0, y=0): fader-1 = 0.0
  // Slot 1 (TR: x=1, y=0): fader-1 = 1.0
  // Slot 2 (BL: x=0, y=1): fader-1 = 0.0
  // Slot 3 (BR: x=1, y=1): fader-1 = 1.0
  // Interpolated fader-1 value at (x, y) is exactly x.
  const snaps = context.window.RCSurface.snapshots;
  snaps.loadSnapshots();
  const rawSnaps = snaps.getSnapshots();
  rawSnaps[0] = { 'fader-1': 0.0 };
  rawSnaps[1] = { 'fader-1': 1.0 };
  rawSnaps[2] = { 'fader-1': 0.0 };
  rawSnaps[3] = { 'fader-1': 1.0 };

  // Track controlSetters['fader-1']
  context.window.controlSetters = context.window.controlSetters || {};
  context.window.controlSetters['fader-1'] = (v) => {
    setterCallCounts.fader++;
    faderValues.push(v);
  };

  if (typeof context.window.setupVectorPad === 'function') {
    context.window.setupVectorPad();
  }

  return {
    context,
    vPad,
    canvas,
    faderValues,
    setterCallCounts,
    flushOneRaf,
    getPendingRafCount,
    getRafCallsCount,
  };
}

test('pointermove burst coalesces to exactly one update per RAF frame applying final coordinate', () => {
  const env = createVectorEnvironment();

  // Pointer down at (50, 50) -> x=0.5, y=0.5
  env.vPad.fire('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
  env.flushOneRaf();
  env.setterCallCounts.fader = 0;
  env.faderValues.length = 0;

  // Burst of 100 pointermove events in a single frame
  const rafCallsBefore = env.getRafCallsCount();
  for (let i = 1; i <= 100; i++) {
    // clientX moves from 50 to 90 (x goes to 0.9)
    const clientX = 50 + (40 * i) / 100;
    env.vPad.fire('pointermove', { pointerId: 1, clientX, clientY: 50 });
  }

  // BEFORE RAF fires: burst must NOT call setters for every move
  assert.equal(
    env.setterCallCounts.fader,
    0,
    'Setters must not be called 100 times synchronously during pointermove burst before RAF',
  );
  assert.equal(
    env.getRafCallsCount() - rafCallsBefore,
    1,
    'Exactly one RAF should be scheduled for the burst of 100 moves',
  );

  // Flush the single RAF frame
  env.flushOneRaf();

  // AFTER RAF fires: exactly ONE application with the final coordinate (x=0.9 -> fader=0.9)
  assert.equal(env.setterCallCounts.fader, 1, 'Exactly one application must occur when RAF fires');
  assert.equal(env.faderValues.length, 1);
  assert.ok(
    Math.abs(env.faderValues[0] - 0.9) < 1e-4,
    `Final coordinate must be applied (expected 0.9, got ${env.faderValues[0]})`,
  );
});

test('reproducible 60-frame gesture applies at most once per frame and reaches exact end position', () => {
  const env = createVectorEnvironment();

  env.vPad.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  env.flushOneRaf();
  env.setterCallCounts.fader = 0;
  env.faderValues.length = 0;

  // 60 frames, each frame receives a burst of 100 pointermove events
  for (let frame = 1; frame <= 60; frame++) {
    const frameTargetX = frame / 60; // moves towards 1.0
    for (let move = 1; move <= 100; move++) {
      const clientX = (frameTargetX * 100 * move) / 100;
      env.vPad.fire('pointermove', { pointerId: 1, clientX, clientY: 50 });
    }

    // Setters must not accumulate during the burst within the frame
    assert.equal(
      env.setterCallCounts.fader,
      frame - 1,
      `Frame ${frame}: setters must not run before RAF fires`,
    );

    // RAF fires for this frame
    env.flushOneRaf();

    assert.equal(
      env.setterCallCounts.fader,
      frame,
      `Frame ${frame}: exactly one application per frame`,
    );
    assert.ok(
      Math.abs(env.faderValues[env.faderValues.length - 1] - frameTargetX) < 1e-4,
      `Frame ${frame}: value must match end coordinate of frame`,
    );
  }

  // Over 60 frames (6000 pointermove events), exactly 60 applications occurred
  assert.equal(env.setterCallCounts.fader, 60, 'Total setter calls across 60 frames must be exactly 60');
  assert.ok(
    Math.abs(env.faderValues[env.faderValues.length - 1] - 1.0) < 1e-4,
    'Final coordinate must reach 1.0',
  );
});

test('pointerup flushes pending final position and cancels obsolete callbacks', () => {
  const env = createVectorEnvironment();

  env.vPad.fire('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
  env.flushOneRaf();
  env.setterCallCounts.fader = 0;
  env.faderValues.length = 0;

  // Move right before release
  env.vPad.fire('pointermove', { pointerId: 1, clientX: 75, clientY: 50 });

  // Pointerup occurs before RAF fires
  env.vPad.fire('pointerup', { pointerId: 1, clientX: 75, clientY: 50 });

  // End of gesture must ensure final position is applied and no obsolete RAF lingers
  assert.ok(
    Math.abs(env.faderValues[env.faderValues.length - 1] - 0.75) < 1e-4,
    'Final position of completed gesture must not be lost on pointerup',
  );

  // Flushing any remaining RAF should not apply old/duplicate data
  const countAtEnd = env.setterCallCounts.fader;
  env.flushOneRaf();
  assert.equal(env.setterCallCounts.fader, countAtEnd, 'No obsolete callbacks should run after gesture ended');
});

test('resetVectorPad cancels pending RAF and resets coordinates', () => {
  const env = createVectorEnvironment();

  env.vPad.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
  env.flushOneRaf();
  env.faderValues.length = 0;

  // Pending move
  env.vPad.fire('pointermove', { pointerId: 1, clientX: 95, clientY: 20 });

  // Call resetVectorPad
  env.context.window.resetVectorPad();

  // Must cancel pending RAF and not apply 0.95
  env.flushOneRaf();
  const has095 = env.faderValues.some((v) => Math.abs(v - 0.95) < 1e-4);
  assert.equal(has095, false, 'resetVectorPad must cancel pending RAF and not apply obsolete move coordinate');
});
