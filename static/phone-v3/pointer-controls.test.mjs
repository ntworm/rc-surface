// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const controlsFile = path.join(import.meta.dirname, 'controls.js');
const styleFile = path.join(import.meta.dirname, 'style.css');

function makeClassList() {
  const classes = new Set();
  return {
    add(...names) { names.forEach((name) => classes.add(name)); },
    remove(...names) { names.forEach((name) => classes.delete(name)); },
    toggle(name, force) {
      const enabled = typeof force === 'boolean' ? force : !classes.has(name);
      if (enabled) classes.add(name);
      else classes.delete(name);
      return enabled;
    },
    contains(name) { return classes.has(name); },
  };
}

function makeStyle() {
  const values = new Map();
  return {
    setProperty(name, value) { values.set(name, String(value)); },
    removeProperty(name) { values.delete(name); },
  };
}

function makePad(name) {
  const listeners = new Map();
  const captured = [];
  return {
    dataset: { name },
    listeners,
    captured,
    classList: makeClassList(),
    style: makeStyle(),
    clientHeight: 100,
    addEventListener(type, listener) { listeners.set(type, listener); },
    setPointerCapture(pointerId) { captured.push(pointerId); },
    querySelector() { return null; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
  };
}

function loadTwoPads() {
  const pads = [makePad('pad-left'), makePad('pad-right')];
  const emitted = [];
  const context = {
    window: null,
    document: {
      readyState: 'complete',
      body: { dataset: {}, classList: makeClassList() },
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll(selector) { return selector === '.pad' ? pads : []; },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    performance: { now() { return 100; } },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    onControl(message) { emitted.push(message); },
  };
  context.window = context;

  const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
  vm.runInNewContext(fs.readFileSync(engineFile, 'utf8'), context, { filename: engineFile });
  vm.runInNewContext(fs.readFileSync(controlsFile, 'utf8'), context, { filename: controlsFile });
  return { pads, emitted };
}

function dispatch(el, type, init) {
  const listener = el.listeners.get(type);
  assert.equal(typeof listener, 'function', `${el.dataset.name} must bind ${type}`);
  let prevented = false;
  listener({
    button: 0,
    clientX: 50,
    clientY: 80,
    preventDefault() { prevented = true; },
    ...init,
  });
  return prevented;
}

test('all eight continuous-control factories share the captured Pointer Events contract', () => {
  const source = fs.readFileSync(controlsFile, 'utf8');

  assert.match(source, /function bindPointerGesture\(/);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /addEventListener\('pointermove'/);
  assert.match(source, /addEventListener\('pointerup'/);
  assert.match(source, /addEventListener\('pointercancel'/);
  assert.match(source, /e\.button !== 0/);
  assert.match(source, /setPointerCapture\(e\.pointerId\)/);

  const bindings = source.match(/bindPointerGesture\((?:el|vPad),/g) || [];
  assert.equal(bindings.length, 8, 'exactly the eight continuous controls must use the pointer binder');
  assert.equal((source.match(/addEventListener\('touchstart'/g) || []).length, 1,
    'only the unrelated sync-mode long press may retain touchstart');
});

test('two different controls keep independent pointerIds and ignore hover or non-primary buttons', () => {
  const { pads, emitted } = loadTwoPads();
  const [left, right] = pads;

  assert.equal(dispatch(left, 'pointerdown', { pointerId: 11, clientY: 90 }), true);
  assert.equal(dispatch(right, 'pointerdown', { pointerId: 22, clientY: 85 }), true);
  assert.deepEqual(left.captured, [11]);
  assert.deepEqual(right.captured, [22]);

  dispatch(left, 'pointermove', { pointerId: 11, clientY: 20 });
  dispatch(right, 'pointermove', { pointerId: 22, clientY: 35 });
  assert.ok(emitted.some((message) => message.name === 'pad-left' && message.value > 0));
  assert.ok(emitted.some((message) => message.name === 'pad-right' && message.value > 0));

  const beforeHover = emitted.length;
  dispatch(left, 'pointermove', { pointerId: 99, clientY: 0 });
  assert.equal(emitted.length, beforeHover, 'an unclaimed hover pointer must not move the pad');

  dispatch(left, 'pointercancel', { pointerId: 11 });
  dispatch(right, 'pointerup', { pointerId: 22 });
  dispatch(left, 'pointerdown', { pointerId: 33, clientY: 80, button: 2 });
  assert.deepEqual(left.captured, [11], 'right-click must not capture or start a gesture');

  dispatch(left, 'pointerdown', { pointerId: 44, clientY: 80 });
  assert.deepEqual(left.captured, [11, 44], 'pointercancel must free the control for the next gesture');
});

test('every migrated control keeps touch-action none so phone gestures stay owned by the surface', () => {
  const css = fs.readFileSync(styleFile, 'utf8');
  const selectors = ['pad', 'toggle', 'button', 'xy-pad-physics', 'xy-pad', 'knob', 'fader', 'xy-pad-vector'];

  for (const selector of selectors) {
    const block = css.match(new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`, 's'));
    assert.ok(block, `.${selector} must have a CSS rule`);
    assert.match(block[0], /touch-action:\s*none/, `.${selector} must disable browser touch gestures`);
  }
});

// ---------------------------------------------------------------------------
// A fader bound to pan is centred, not half open.

test('the bipolar fader path is reachable, not dead code', () => {
  const controls = fs.readFileSync(
    path.join(import.meta.dirname, 'controls.js'), 'utf8');
  const app = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');

  // The branch that fills from the centre existed from the start and nothing
  // ever added the class that selects it, so a pan-bound fader drew its centre
  // as half travel — which is what made one fader look permanently wrong.
  assert.match(app, /classList\.add\('bipolar'\)/,
    'something must actually mark a fader bipolar');
  assert.match(app, /msg\.bipolarControls/,
    'and it must come from the host, which is what knows the target type');

  // Read per render, not captured once: the class arrives with the mapping,
  // long after the fader was built.
  assert.match(controls, /const isBipolar = \(\) => el\.classList\.contains\('bipolar'\)/);
  assert.doesNotMatch(controls, /const isBipolar = el\.classList\.contains/,
    'a captured flag cannot see a class added later');
  assert.match(controls, /window\.refreshFaderRendering/,
    'and the faders must redraw once the host has spoken');
});
