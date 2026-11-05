// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// When a phone socket closes, the host stops that client's LFOs and pulses
// and parks their targets (ws.ts, clearHostModulatorsForClient). A latched
// LFO stays lit on the phone, but nothing re-sent it after the reconnect, so
// Live sat still while the surface showed it running. The new session now
// re-sends every active modulator once. Inactive ones are never re-sent: with
// no modulator on the host, an inactive update parks the target at 0
// (host-modulators.ts, updateHostModulator).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');

function mockDom() {
  const elements = {};
  const element = (id) => {
    elements[id] ||= {
      textContent: '',
      className: '',
      dataset: { name: id, padModeSet: 'A' },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      style: { setProperty() {}, removeProperty() {} },
      addEventListener() {},
      setPointerCapture() {},
      setAttribute() {},
      clientHeight: 100,
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
      querySelector: (sel) => element(sel),
      querySelectorAll: () => [],
      getContext: () => ({
        clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        moveTo() {}, lineTo() {}, fillText() {}, setLineDash() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      }),
    };
    return elements[id];
  };
  return {
    body: { dataset: {} },
    addEventListener() {},
    removeEventListener() {},
    getElementById: element,
    querySelector: (sel) => element(sel),
    querySelectorAll: (sel) => {
      if (sel === '.toggle') return [element('toggle-1'), element('toggle-5')];
      if (sel === '.button') return [element('toggle-5')];
      return [];
    },
  };
}

function pageContext(windowListeners) {
  const context = {
    window: null,
    document: mockDom(),
    navigator: { onLine: true, vibrate() {}, wakeLock: null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    WebSocket: class { constructor() { this.readyState = 0; } send() {} close() {} },
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    requestAnimationFrame: () => 1,
    isSecureContext: true,
    performance: { now: () => Date.now() },
    location: { protocol: 'https:', host: 'localhost:8080' },
    addEventListener(type, cb) { (windowListeners[type] ||= []).push(cb); },
    dispatchEvent() {},
    setInterval: () => {},
    setTimeout: () => {},
    currentControlStates: {},
    syncMode: 'sync',
    syncSettings: {
      clockSource: 'osc', lfoSubdivisionPinned: false, lfoPhaseOffset: 0, lfoShape: 'sine',
      pulseSubdivisionPinned: false, pulsePhaseOffset: 0, pulseSwing: 0,
    },
  };
  context.window = context;
  return context;
}

function loadControls() {
  const windowListeners = {};
  const context = pageContext(windowListeners);
  vm.runInNewContext(read('mode-engine.js'), context, { filename: 'mode-engine.js' });
  vm.runInNewContext(read('../shared/audio-descriptor-catalog.js'), context);
  vm.runInNewContext(read('app.js'), context, { filename: 'app.js' });
  vm.runInNewContext(read('modules/snapshots.js'), context, { filename: 'snapshots.js' });
  vm.runInNewContext(read('control-config.js'), context);
  context.RcControlConfig.set('toggle-5', { shape: 'square' });
  vm.runInNewContext(read('controls.js'), context, { filename: 'controls.js' });

  const emitted = [];
  context.onModulatorState = (modulator) => emitted.push(modulator);
  const dispatch = (type, detail) => { for (const cb of windowListeners[type] || []) cb({ type, detail }); };
  return { context, emitted, dispatch };
}

function stateOf(context, name) {
  const state = context.window.modulatorStates.get(name);
  assert.ok(state, `no modulator state for ${name}`);
  return state;
}

test('a new session re-sends each active modulator once, with its configuration', () => {
  const { context, emitted, dispatch } = loadControls();
  const lfo = stateOf(context, 'toggle-1');
  stateOf(context, 'toggle-5');
  lfo.active = true;
  lfo.rate = 0.4;
  lfo.depth = 0.7;
  emitted.length = 0;

  dispatch('ableton-rc:phone-client-id', { clientId: 'phone-a', role: 'controller' });

  const resent = emitted.filter((modulator) => modulator.name === 'toggle-1');
  assert.equal(resent.length, 1, 'the latched LFO reaches the host again');
  assert.equal(resent[0].active, true);
  assert.equal(resent[0].rate, 0.4);
  assert.equal(resent[0].depth, 0.7);
  assert.equal(resent[0].kind, 'lfo');
});

test('a new session never sends an inactive modulator', () => {
  const { context, emitted, dispatch } = loadControls();
  stateOf(context, 'toggle-1').active = false;
  stateOf(context, 'toggle-5').active = false;
  emitted.length = 0;

  dispatch('ableton-rc:phone-client-id', { clientId: 'phone-a', role: 'controller' });

  assert.deepEqual(emitted, [], 'an inactive update would park an unrelated target at 0');
});

test('an active pulse is re-sent as a pulse', () => {
  const { context, emitted, dispatch } = loadControls();
  stateOf(context, 'toggle-1').active = false;
  stateOf(context, 'toggle-5').active = true;
  emitted.length = 0;

  dispatch('ableton-rc:phone-client-id', { clientId: 'phone-a', role: 'controller' });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, 'toggle-5');
  assert.equal(emitted[0].kind, 'pulse');
  assert.equal(emitted[0].active, true);
});
