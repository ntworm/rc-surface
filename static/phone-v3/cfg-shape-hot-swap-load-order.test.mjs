// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Owner bench 2026-09-21: changing an active LFO's shape in the CFG popover
// reached Ableton Live only after re-touching the control. controls.js
// subscribed to RcControlConfig at load time, but index.html loaded
// control-config.js *after* controls.js, so the subscription never happened
// in the real page. Every earlier test loaded the two files in the working
// order and could not see it. These tests load them in the page's real order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const dir = import.meta.dirname;
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

function scriptOrder(html) {
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function makeContext() {
  const modulatorStates = [];
  const domListeners = new Map();
  const context = {
    window: null,
    document: {
      body: { dataset: { page: 'performance' }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener(type, fn) { domListeners.set(type, fn); },
    },
    navigator: { vibrate: () => {} },
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    addEventListener() {},
    dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() {},
    setInterval() {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    onControl() {},
    onModulatorState(state) { modulatorStates.push(state); },
  };
  context.window = context;
  return { context, modulatorStates, domListeners };
}

function run(context, name) {
  vm.runInNewContext(read(name), context, { filename: path.join(dir, name) });
}

function activateLfo(context, name) {
  // Same shape controls.js gives a running LFO; only `active` matters here.
  context.lfoStates.set(name, { name, active: true, depth: 0.5, rate: 0.5, phase: 0, lastTs: 0 });
}

test('index.html loads control-config.js before controls.js', () => {
  const order = scriptOrder(read('index.html'));
  const cfg = order.indexOf('control-config.js');
  const controls = order.indexOf('controls.js');
  assert.ok(cfg >= 0 && controls >= 0, `both scripts must be present: ${order.join(', ')}`);
  assert.ok(cfg < controls, `control-config.js (#${cfg}) must load before controls.js (#${controls})`);
});

test('in the page order, a CFG shape override on an active LFO reaches the host immediately', () => {
  const { context, modulatorStates } = makeContext();
  const order = scriptOrder(read('index.html')).filter((s) => s === 'mode-engine.js' || s === 'control-config.js' || s === 'controls.js');
  assert.deepEqual(order, ['mode-engine.js', 'control-config.js', 'controls.js']);
  for (const name of order) run(context, name);

  activateLfo(context, 'toggle-1');
  modulatorStates.length = 0;
  context.RcControlConfig.set('toggle-1', { shape: 'square' });

  const sent = modulatorStates.filter((s) => s.kind === 'lfo' && s.name === 'toggle-1');
  assert.equal(sent.length, 1, 'one modulator state must be pushed to the host');
  assert.equal(sent[0].shape, 'square');
});

test('if control-config.js loads after controls.js, the subscription is deferred to DOMContentLoaded', () => {
  const { context, modulatorStates, domListeners } = makeContext();
  run(context, 'mode-engine.js');
  run(context, 'controls.js');
  run(context, 'control-config.js');

  activateLfo(context, 'toggle-1');
  context.RcControlConfig.set('toggle-1', { shape: 'triangle' });
  assert.equal(modulatorStates.length, 0, 'nothing can be sent before the store exists');

  const ready = domListeners.get('DOMContentLoaded');
  assert.equal(typeof ready, 'function', 'controls.js must retry the subscription when the DOM is ready');
  ready();
  context.RcControlConfig.set('toggle-1', { shape: 'ramp_up' });
  const sent = modulatorStates.filter((s) => s.kind === 'lfo' && s.name === 'toggle-1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].shape, 'ramp_up');
});
