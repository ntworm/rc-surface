// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator tests only: no claim about physical SDK/automation sampling rate.
import test from 'node:test';
import assert from 'node:assert/strict';
import './control-config.js';

const { create } = globalThis.RcControlConfig;

function makeStorage(seed) {
  const map = seed ? new Map(Object.entries(seed)) : new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    _map: map,
  };
}

function makeStore(seed) {
  return create({ storage: makeStorage(seed), clock: () => 1700000000000 });
}

test('get returns the documented fallback when no override exists', () => {
  const cc = makeStore();
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'A');
  assert.equal(cc.get('toggle-2', 'shape', 'sine'), 'sine');
  assert.equal(cc.get('fader-3', 'resetValue', 0.85), 0.85);
});

test('set stores the override and get returns it', () => {
  const cc = makeStore();
  cc.set('pad-1', { mode: 'B' });
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'B');
});

test('set is additive across keys on the same control', () => {
  const cc = makeStore();
  cc.set('xy-1', { friction: 0.02 });
  cc.set('xy-1', { bounce: 0.5 });
  assert.equal(cc.get('xy-1', 'friction', 0.012), 0.02);
  assert.equal(cc.get('xy-1', 'bounce', 0.75), 0.5);
});

test('setting a single key to null keeps the other keys intact', () => {
  const cc = makeStore();
  cc.set('toggle-1', { mode: 'B', shape: 'triangle' });
  cc.set('toggle-1', { mode: null });
  assert.equal(cc.get('toggle-1', 'mode', 'A'), 'A');
  assert.equal(cc.get('toggle-1', 'shape', 'sine'), 'triangle');
});

test('removing every key deletes the control from the store', () => {
  const cc = makeStore();
  cc.set('pad-3', { mode: 'C' });
  assert.equal(cc.size(), 1);
  cc.set('pad-3', { mode: null });
  assert.equal(cc.size(), 0);
  assert.equal(cc.get('pad-3', 'mode', 'A'), 'A');
});

test('mode validation rejects unknown letters', () => {
  const cc = makeStore();
  cc.set('pad-1', { mode: 'X' });
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'A');
  assert.equal(cc.size(), 0);
});

test('shape validation rejects unknown waveforms', () => {
  const cc = makeStore();
  cc.set('toggle-1', { shape: 'noise' });
  assert.equal(cc.get('toggle-1', 'shape', 'sine'), 'sine');
  assert.equal(cc.size(), 0);
});

test('friction is clamped to the documented safe range', () => {
  const cc = makeStore();
  cc.set('xy-2', { friction: 0.001 });
  assert.equal(cc.get('xy-2', 'friction', 0.012), 0.002);
  cc.set('xy-2', { friction: 1 });
  assert.equal(cc.get('xy-2', 'friction', 0.012), 0.05);
});

test('knobRange is clamped to the documented safe range', () => {
  const cc = makeStore();
  cc.set('knob-1', { knobRange: 50 });
  assert.equal(cc.get('knob-1', 'knobRange', 150), 100);
  cc.set('knob-1', { knobRange: 999 });
  assert.equal(cc.get('knob-1', 'knobRange', 150), 400);
});

test('resetValue is clamped to 0..1', () => {
  const cc = makeStore();
  cc.set('fader-1', { resetValue: -1 });
  assert.equal(cc.get('fader-1', 'resetValue', 0.85), 0);
  cc.set('fader-1', { resetValue: 5 });
  assert.equal(cc.get('fader-1', 'resetValue', 0.85), 1);
});

test('unknown keys are discarded', () => {
  const cc = makeStore();
  cc.set('pad-1', { mode: 'B', color: 'red', __proto__: null });
  const entry = cc.get('pad-1');
  assert.equal(entry.mode, 'B');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'color'), false);
});

test('persistence: set writes JSON to storage', () => {
  const storage = makeStorage();
  const cc = create({ storage, clock: () => 1 });
  cc.set('pad-1', { mode: 'C' });
  assert.equal(typeof storage.getItem(cc.STORAGE_KEY), 'string');
  assert.deepEqual(JSON.parse(storage.getItem(cc.STORAGE_KEY)), {
    'pad-1': { mode: 'C' },
  });
});

test('persistence: load restores overrides from storage', () => {
  const storage = makeStorage({
    'ableton-rc:control_config': JSON.stringify({
      'pad-1': { mode: 'D' },
      'toggle-1': { shape: 'square' },
    }),
  });
  const cc = create({ storage, clock: () => 2 });
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'D');
  assert.equal(cc.get('toggle-1', 'shape', 'sine'), 'square');
});

test('persistence: corrupted JSON yields an empty store without throwing', () => {
  const storage = makeStorage({ 'ableton-rc:control_config': '{not valid json' });
  const cc = create({ storage, clock: () => 3 });
  assert.equal(cc.size(), 0);
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'A');
});

test('subscribe receives name, patch and next snapshot on set', () => {
  const cc = makeStore();
  const events = [];
  const unsub = cc.subscribe((evt) => events.push(evt));
  cc.set('pad-1', { mode: 'B' });
  cc.set('toggle-1', { shape: 'triangle' });
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'pad-1');
  assert.deepEqual(events[0].patch, { mode: 'B' });
  assert.deepEqual(events[0].next, { mode: 'B' });
  assert.equal(events[1].name, 'toggle-1');
  unsub();
  cc.set('pad-2', { mode: 'C' });
  assert.equal(events.length, 2);
});

test('clear removes a single control and emits', () => {
  const cc = makeStore();
  cc.set('pad-1', { mode: 'B' });
  cc.set('pad-2', { mode: 'C' });
  const events = [];
  cc.subscribe((evt) => events.push(evt.name));
  cc.clear('pad-1');
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'A');
  assert.equal(cc.get('pad-2', 'mode', 'A'), 'C');
  assert.deepEqual(events, ['pad-1']);
});

test('clearAll wipes everything and emits per control', () => {
  const cc = makeStore();
  cc.set('pad-1', { mode: 'B' });
  cc.set('toggle-1', { shape: 'triangle' });
  const events = [];
  cc.subscribe((evt) => events.push(evt.name));
  cc.clearAll();
  assert.equal(cc.size(), 0);
  assert.equal(events.length, 2);
  assert.ok(events.includes('pad-1'));
  assert.ok(events.includes('toggle-1'));
});

test('listOverrides returns every control with a human summary', () => {
  const cc = makeStore();
  cc.set('toggle-1', { shape: 'triangle' });
  cc.set('xy-1', { friction: 0.03, bounce: 0.4 });
  cc.set('pad-2', { mode: 'B' });
  const list = cc.listOverrides();
  assert.equal(list.length, 3);
  const byName = Object.fromEntries(list.map((e) => [e.name, e.summary]));
  assert.equal(byName['toggle-1'], 'triangle');
  assert.equal(byName['xy-1'], 'friction 0.03, bounce 0.4');
  assert.equal(byName['pad-2'], 'mode B');
});

test('setting a non-object patch is a no-op', () => {
  const cc = makeStore();
  cc.set('pad-1', null);
  cc.set('pad-1', 'B');
  cc.set('pad-1', 42);
  cc.set('pad-1', ['B']);
  assert.equal(cc.size(), 0);
});

test('numeric fields require finite numbers', () => {
  const cc = makeStore();
  cc.set('xy-1', { friction: NaN });
  cc.set('xy-1', { friction: Infinity });
  cc.set('xy-1', { friction: '0.02' });
  assert.equal(cc.size(), 0);
});

test('storage with setItem that throws still lets the in-memory store work', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota'); },
    removeItem() {},
    clear() {},
  };
  const cc = create({ storage, clock: () => 0 });
  cc.set('pad-1', { mode: 'B' });
  assert.equal(cc.get('pad-1', 'mode', 'A'), 'B');
});

test('global RcControlConfig exposes a live singleton store', () => {
  // controls.js / app.js call these directly on window.RcControlConfig, so the
  // module global must be an active instance, not just the `create` factory.
  const cc = globalThis.RcControlConfig;
  assert.equal(typeof cc.get, 'function');
  assert.equal(typeof cc.set, 'function');
  assert.equal(typeof cc.clear, 'function');
  assert.equal(typeof cc.clearAll, 'function');
  assert.equal(typeof cc.listOverrides, 'function');
  assert.equal(typeof cc.subscribe, 'function');
  assert.equal(typeof cc.create, 'function');
});
