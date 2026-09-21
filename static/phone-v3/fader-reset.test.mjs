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

const controlsFile = path.join(import.meta.dirname, 'controls.js');
const controlsSource = fs.readFileSync(controlsFile, 'utf8');
const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
const engineSource = fs.readFileSync(engineFile, 'utf8');

function loadFader({ bipolar = false } = {}) {
  const classes = new Set(bipolar ? ['bipolar'] : []);
  const thumb = { style: {} };
  const fill = { style: {} };
  const el = Object.assign(new EventTarget(), {
    dataset: { name: 'fader-1' },
    classList: {
      contains(name) { return classes.has(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
    setPointerCapture() {},
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) {
      return { '.fader-thumb': thumb, '.fader-fill': fill }[selector] || null;
    },
  });
  const emitted = [];
  const timeouts = [];
  let now = 1000;
  const context = {
    window: null,
    document: {
      readyState: 'complete',
      body: { dataset: {} },
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll(selector) {
        const faderSelector = bipolar ? '.fader.bipolar' : '.fader:not(.bipolar)';
        return selector === faderSelector ? [el] : [];
      },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    Date: class extends Date { static now() { return now; } },
    performance: { now() { return now; } },
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    setTimeout(callback) { timeouts.push(callback); return timeouts.length; },
    clearTimeout() {},
    setInterval() {},
    clearInterval() {},
    addEventListener() {},
    dispatchEvent() {},
    onControl(message) { emitted.push({ ...message }); },
  };
  context.window = context;
  vm.runInNewContext(engineSource, context, { filename: engineFile });
  vm.runInNewContext(controlsSource, context, { filename: controlsFile });
  timeouts.forEach((callback) => callback());
  return {
    el, thumb, fill, emitted,
    advance(ms) { now += ms; },
    setValue(value) { context.controlSetters['fader-1'](value); },
  };
}

function dispatch(el, type, init = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    button: 0, pointerId: 1, pointerType: 'touch', clientY: 100, ...init,
  });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

function resetFader(fader, gesture) {
  if (gesture === 'double-click') {
    assert.equal(dispatch(fader.el, 'dblclick', { pointerType: 'mouse' }), true);
    return;
  }
  fader.advance(400);
  dispatch(fader.el, 'pointerdown', { pointerId: 1 });
  dispatch(fader.el, 'pointerup', { pointerId: 1 });
  fader.advance(100);
  dispatch(fader.el, 'pointerdown', { pointerId: 2 });
  dispatch(fader.el, 'pointerup', { pointerId: 2 });
}

function assertOutput(fader, value, top, height, bottom) {
  assert.deepEqual(fader.emitted.at(-1), { name: 'fader-1', value }, 'emitted fader value');
  assert.ok(Math.abs(parseFloat(fader.thumb.style.top) - top) < 1e-9, 'thumb position');
  assert.equal(fader.fill.style.height, height, 'fill height');
  assert.equal(fader.fill.style.bottom, bottom, 'fill origin');
}

test('unipolar fader initializes at 85 percent', () => {
  assertOutput(loadFader(), 0.85, 15, '85%', '0');
});

test('bipolar fader initializes at its neutral centre', () => {
  assertOutput(loadFader({ bipolar: true }), 0.5, 50, '0%', '50%');
});

for (const gesture of ['double-click', 'double-tap']) {
  test(`${gesture} restores the unipolar fader initial value`, () => {
    const fader = loadFader();
    fader.setValue(0.12);
    fader.emitted.length = 0;
    resetFader(fader, gesture);
    assert.equal(fader.emitted.length, 1, 'reset publishes one value');
    assertOutput(fader, 0.85, 15, '85%', '0');
  });

  test(`${gesture} follows pan mapping changes after fader initialization`, () => {
    const fader = loadFader();
    fader.el.classList.add('bipolar');
    fader.setValue(0.12);
    resetFader(fader, gesture);
    assertOutput(fader, 0.5, 50, '0%', '50%');

    fader.el.classList.remove('bipolar');
    fader.setValue(0.12);
    resetFader(fader, gesture);
    assertOutput(fader, 0.85, 15, '85%', '0');
  });

  test(`${gesture} leaves no held pointer and allows a later drag from the reset value`, () => {
    const fader = loadFader();
    fader.setValue(0.12);
    resetFader(fader, gesture);
    const afterReset = fader.emitted.length;
    dispatch(fader.el, 'pointermove', { pointerId: 2, clientY: 70 });
    assert.equal(fader.emitted.length, afterReset, 'released reset pointer must not move the fader');

    fader.advance(400);
    dispatch(fader.el, 'pointerdown', { pointerId: 3 });
    dispatch(fader.el, 'pointermove', { pointerId: 3, clientY: 130 });
    assert.ok(Math.abs(fader.emitted.at(-1).value - 0.65) < 1e-9, 'later drag starts at the reset value');
    dispatch(fader.el, 'pointercancel', { pointerId: 3 });
    const afterCancel = fader.emitted.length;
    dispatch(fader.el, 'pointermove', { pointerId: 3, clientY: 0 });
    assert.equal(fader.emitted.length, afterCancel, 'cancelled drag must not keep moving');
  });
}
