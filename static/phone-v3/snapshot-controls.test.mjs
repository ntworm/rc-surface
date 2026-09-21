// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// Three controls on the snapshots page shipped bound to nothing: Clear Slots,
// the transition-time slider and the morph-mode toggle. morphDurationSec and
// morphMode were declared and never assigned, so a transition always ran at
// 1.0s and the finished vector morph pad — already drawing and blending in
// controls.js — sat in a section nothing ever un-hid.
//
// The existing suite could not catch it: its mock answers
// querySelectorAll('[data-morph-mode]') with an empty list and gives every
// element a no-op classList, so there was nothing to bind to and nothing to
// observe. This file supplies the elements for real and a classList that
// records, then drives the controls the way a finger would.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  path.join(import.meta.dirname, 'modules/snapshots.js'),
  'utf8',
);

function el(id = '', className = '', dataset = {}) {
  const listeners = new Map();
  const classes = new Set(className.split(' ').filter(Boolean));
  let _disabled = false;
  return {
    id,
    dataset,
    get disabled() {
      return _disabled;
    },
    set disabled(v) {
      _disabled = !!v;
    },
    get className() {
      return [...classes].join(' ');
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    },
    style: { setProperty() {}, removeProperty() {} },
    setAttribute(name, val) {
      if (name === 'disabled') _disabled = true;
    },
    removeAttribute(name) {
      if (name === 'disabled') _disabled = false;
    },
    textContent: '',
    value: '',
    min: '',
    max: '',
    step: '',
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type, extra = {}) {
      if (_disabled && (type === 'click' || type === 'input' || type === 'keydown')) return;
      (listeners.get(type) || []).forEach((fn) => fn({ preventDefault() {}, ...extra }));
    },
    click() {
      this.fire('click');
    },
  };
}

function build({ bpm = 120 } = {}) {
  const nodes = {
    grid: el('snp-grid-container'),
    vector: el('snp-vector-container', 'hidden'),
    slider: el('slider-morph-time'),
    label: el('morph-time-val'),
    clear: el('btn-snapshot-clear'),
    capture: el('btn-snapshot-capture'),
    modeGrid: el('', 'on', { morphMode: 'grid' }),
    modeVector: el('', '', { morphMode: 'vector' }),
    syncFree: el('', 'on', { morphSync: 'free' }),
    syncOn: el('', '', { morphSync: 'sync' }),
  };
  const byId = new Map(
    Object.values(nodes).filter((n) => n.id).map((n) => [n.id, n]),
  );
  const store = new Map();
  const context = {
    window: null,
    document: {
      body: el('body'),
      getElementById: (id) => byId.get(id) || null,
      querySelector: () => null,
      querySelectorAll: (sel) => {
        if (sel === '[data-morph-mode]') return [nodes.modeGrid, nodes.modeVector];
        if (sel === '[data-morph-sync]') return [nodes.syncFree, nodes.syncOn];
        return [];
      },
      addEventListener() {},
    },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { vibrate() {} },
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent() {},
    setTimeout() {},
    clearTimeout() {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    console,
    JSON,
    Date,
    Math,
    Number,
    currentBpm: bpm,
  };
  context.window = context;
  context.RCSurface = {};
  vm.runInNewContext(source, context);
  const api = context.RCSurface.snapshots;
  api.setupSnapshots();
  return { api, nodes, context };
}

test('the morph-mode toggle reveals the vector pad and hides the grid', () => {
  const { api, nodes } = build();
  assert.equal(api.getMorphMode(), 'grid');
  assert.ok(nodes.vector.classList.contains('hidden'), 'vector starts hidden');
  assert.ok(!nodes.grid.classList.contains('hidden'), 'grid starts visible');

  nodes.modeVector.click();
  assert.equal(api.getMorphMode(), 'vector');
  assert.ok(!nodes.vector.classList.contains('hidden'), 'vector pad must be revealed');
  assert.ok(nodes.grid.classList.contains('hidden'), 'grid must yield to the pad');
  assert.ok(nodes.modeVector.classList.contains('on'));
  assert.ok(!nodes.modeGrid.classList.contains('on'));

  nodes.modeGrid.click();
  assert.equal(api.getMorphMode(), 'grid');
  assert.ok(nodes.vector.classList.contains('hidden'), 'grid mode hides the pad again');
  assert.ok(!nodes.grid.classList.contains('hidden'));
});

test('the transition slider actually sets the transition length', () => {
  const { api, nodes } = build();
  assert.equal(api.getMorphDurationSec(), 1);

  nodes.slider.value = '2.5';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 2.5, 'slider must reach the morph');
  assert.equal(nodes.label.textContent, '2.5s');

  // Out-of-range input is clamped rather than passed through to the morph.
  nodes.slider.value = '99';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 5);
});

test('synced transitions are read from the tempo, in beats', () => {
  const { api, nodes } = build({ bpm: 120 });
  const subs = api.getSubdivisions();

  // The first seven entries are the LFO table from controls.js; 2 and 4 bars
  // sit on top because a snapshot transition is a slower gesture.
  // Array.from, not map: the module runs in a vm realm with its own Array, so
  // what it returns is not an instance of this realm's and deepEqual refuses it.
  assert.deepEqual(
    Array.from(subs, (s) => s.beats),
    [16, 8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625],
  );
  assert.deepEqual(
    Array.from(subs, (s) => s.label).slice(0, 3),
    ['16 beats', '8 beats', '4 beats'],
  );

  nodes.syncOn.click();
  assert.equal(api.isTimeSynced(), true);

  // index 2 is one bar: four beats at 120 BPM is two seconds.
  nodes.slider.value = '2';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 2);
  assert.equal(nodes.label.textContent, '4 beats');

  // index 4 is one beat: half a second at 120.
  nodes.slider.value = '4';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 0.5);

  // Back to free, and the seconds value it had is still there.
  nodes.syncFree.click();
  assert.equal(api.isTimeSynced(), false);
  assert.equal(api.getMorphDurationSec(), 1);
});

test('a synced transition follows the tempo Live reports', () => {
  const { api, nodes, context } = build({ bpm: 60 });
  nodes.syncOn.click();
  nodes.slider.value = '4'; // one beat
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 1, 'one beat at 60 BPM is one second');

  context.currentBpm = 140;
  assert.ok(
    Math.abs(api.getMorphDurationSec() - 60 / 140) < 1e-9,
    'a tempo change must move the transition without touching the slider',
  );

  // No tempo yet must not produce Infinity for the morph.
  context.currentBpm = 0;
  assert.equal(api.getMorphDurationSec(), 0.5, 'falls back to 120 BPM');
});

test('Clear Slots empties the stored snapshots', () => {
  const { api, nodes } = build();
  const snaps = api.getSnapshots();
  snaps[0] = { 'knob-1': 0.4 };
  assert.ok(api.getSnapshots()[0]);

  nodes.clear.click();
  assert.ok(
    api.getSnapshots().every((s) => !s),
    'every slot must be empty after Clear Slots',
  );
});

test('switching to Vector XY mode disables Transition Time controls (slider, sync, keyboard) and restoring Grid re-enables them preserving values', () => {
  const { api, nodes } = build({ bpm: 120 });

  // Set transition time to 2.5s free
  nodes.slider.value = '2.5';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 2.5);

  // Switch to Vector mode
  nodes.modeVector.click();
  assert.equal(api.getMorphMode(), 'vector');

  // Transition Time controls must be disabled and grayed out
  assert.equal(nodes.slider.disabled, true, 'slider must be disabled in Vector mode');
  assert.equal(nodes.syncFree.disabled, true, 'syncFree button must be disabled in Vector mode');
  assert.equal(nodes.syncOn.disabled, true, 'syncOn button must be disabled in Vector mode');

  // Changing slider or clicking sync buttons must be inoperative
  nodes.slider.value = '4.0';
  nodes.slider.fire('input');
  nodes.slider.fire('keydown', { key: 'ArrowRight' });
  assert.equal(api.getMorphDurationSec(), 2.5, 'duration must not change while in Vector mode');

  nodes.syncOn.click();
  assert.equal(api.isTimeSynced(), false, 'sync mode must not change while in Vector mode');

  // Switch back to Grid mode
  nodes.modeGrid.click();
  assert.equal(api.getMorphMode(), 'grid');

  // Controls must be re-enabled
  assert.equal(nodes.slider.disabled, false, 'slider must be re-enabled in Grid mode');
  assert.equal(nodes.syncFree.disabled, false, 'syncFree must be re-enabled in Grid mode');
  assert.equal(nodes.syncOn.disabled, false, 'syncOn must be re-enabled in Grid mode');

  // Value must still be 2.5s and functional
  assert.equal(api.getMorphDurationSec(), 2.5, 'preserved value must be intact');
  nodes.slider.value = '1.5';
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 1.5, 'slider must be functional again in Grid mode');

  // Test with Sync mode (e.g. 2 beats / 1 beat)
  nodes.syncOn.click();
  assert.equal(api.isTimeSynced(), true);
  nodes.slider.value = '3'; // 2 beats
  nodes.slider.fire('input');
  assert.equal(api.getMorphDurationSec(), 1.0); // 2 beats at 120 BPM = 1.0s

  // Switch to Vector mode with Sync active
  nodes.modeVector.click();
  assert.equal(nodes.slider.disabled, true);
  assert.equal(nodes.syncFree.disabled, true);
  assert.equal(nodes.syncOn.disabled, true);

  // Switch back to Grid mode
  nodes.modeGrid.click();
  assert.equal(api.isTimeSynced(), true, 'Sync mode preserved');
  assert.equal(api.getMorphDurationSec(), 1.0, '2 beats duration preserved');
});
