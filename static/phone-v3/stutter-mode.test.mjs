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

function makeElement(dataset = {}) {
  const listeners = {};
  const classes = new Set();
  return {
    dataset,
    listeners,
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name) || ''; },
      get backgroundColor() { return this.values.get('backgroundColor') || ''; },
      set backgroundColor(value) { this.values.set('backgroundColor', value); },
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
    addEventListener(type, cb) { listeners[type] = cb; },
    setPointerCapture() {},
    setAttribute() {},
    querySelector() { return null; },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    clientHeight: 100,
  };
}

function loadControls(stutterName = 'stutter-1', { snapshots = false, syncPanel = false, stutterBar = null } = {}) {
  const engineFile = path.join(import.meta.dirname, 'mode-engine.js');
  const controlsFile = path.join(import.meta.dirname, 'controls.js');
  const engineSource = fs.readFileSync(engineFile, 'utf8');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  const stutter = makeElement({ name: stutterName });
  // P04 (rc-surface-modulator-quality-2026-09-16): inject an optional
  // .mod-val-bar child on the stutter gate so makeStutterButton can capture
  // it via el.querySelector('.mod-val-bar'). The override must land BEFORE
  // controls.js runs, otherwise the closure already bound `bar` to null.
  if (stutterBar) {
    stutter.querySelector = (selector) => (selector === '.mod-val-bar' ? stutterBar : null);
  }
  const lfo = makeElement({ name: 'toggle-1' });
  const overlay = makeElement();
  const rateReadout = makeElement();
  const modeButtons = ['A', 'B', 'C', 'D'].map((mode) => makeElement({ padModeSet: mode }));
  let rafCallbacks = [];
  let now = 0;
  const emitted = [];
  const modulatorStates = [];

  const context = {
    window: null,
    document: {
      body: { dataset: {} },
      getElementById: id => syncPanel && id === 'sync-settings-overlay' ? overlay
        : syncPanel && id === 'lfo-effective-rate' ? rateReadout : null,
      querySelector(selector) {
        if (selector === `.button[data-name="${stutterName}"]`) return stutter;
        if (selector === '.toggle[data-name="toggle-1"]') return lfo;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-pad-mode-set]') return modeButtons;
        if (selector === '.toggle') return [lfo];
        if (selector === '.button') return [stutter];
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
  if (snapshots) vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'modules/snapshots.js'), 'utf8'), context);
  vm.runInNewContext(controlsSource, context, { filename: controlsFile });

  return {
    context,
    stutter,
    lfo,
    rateReadout,
    modeButtons,
    emitted,
    modulatorStates,
    setTime(at) { now = at; },
    tick(at) {
      now = at;
      const callbacks = rafCallbacks; rafCallbacks = [];
      callbacks.forEach(cb => cb());
    },
  };
}

function pointer(pointerId, clientY) {
  return { pointerId, clientX: 50, clientY, button: 0, preventDefault() {} };
}

for (const [shape, hz] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 })) {
  test(`r11 preview ${shape} uses its own FREE ceiling`, () => {
    const app = loadControls();
    const ctx = app.context;
    ctx.syncMode = 'free'; ctx.syncSettings.lfoShape = shape;
    ctx.controlSetters['toggle-1.rate'](1); ctx.controlSetters['toggle-1'](1);
    app.tick(0); app.tick(10);
    assert.equal(ctx.lfoStates.get('toggle-1').phaseFrequency, hz);
  });
}

test('Stutter preserves amplitude and pulses at 15Hz instead of freezing above 4Hz', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.syncMode = 'free';
  ctx.controlSetters['stutter-1.rate'](1);
  ctx.controlSetters['stutter-1.depth'](.37);
  app.stutter.listeners.pointerdown(pointer(1, 100));
  app.tick(0);
  const on = app.stutter.style.backgroundColor;
  app.tick(40);
  const off = app.stutter.style.backgroundColor;
  app.tick(70);
  assert.equal(ctx.stutterStates.get('stutter-1').depth, .37);
  assert.notEqual(on, off);
  assert.equal(app.stutter.style.backgroundColor, on);
  assert.equal(app.stutter.dataset.pulseView, 'pulse');
  assert.equal(ctx.stutterStates.get('stutter-1').phaseFrequency, 15);
});

test('Stutter horizontal drag releases an old capped pin; vertical-only drag preserves it', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.syncMode = 'sync'; ctx.currentBpm = 120;
  ctx.syncSettings.stutterSubdivisionPinned = true;
  ctx.syncSettings.stutterSubdivision = .03125;
  app.stutter.listeners.pointerdown(pointer(1, 100));
  app.stutter.listeners.pointermove(pointer(1, 80));
  assert.equal(ctx.syncSettings.stutterSubdivisionPinned, true);
  app.stutter.listeners.pointermove({ ...pointer(1, 80), clientX: -100 });
  app.tick(20);
  assert.equal(ctx.syncSettings.stutterSubdivisionPinned, false);
  assert.equal(ctx.stutterStates.get('stutter-1').phaseFrequency, 2);
  assert.equal(app.modulatorStates.at(-1).syncSubdivisionBeats, null);
});

test('SYNC 1/16 flashes the actual 8Hz gate at 60FPS and resumes immediately after a slow frame', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.syncMode = 'sync'; ctx.currentBpm = 120;
  ctx.playheadActive = true; ctx.playheadStartTime = 100000; ctx.playheadBaseTimeMs = 0;
  ctx.syncSettings.stutterSubdivisionPinned = true; ctx.syncSettings.stutterSubdivision = .25;
  ctx.controlSetters['stutter-1'](1);
  const colors = new Set();
  for (let frame = 0; frame < 60; frame++) {
    const at = frame * 1000 / 60;
    app.tick(at);
    const color = app.stutter.style.backgroundColor;
    colors.add(color);
    assert.equal(color, (at % 125) < 62.5 ? 'rgba(255,159,10,0.82)' : 'rgba(255,159,10,0.10)');
  }
  assert.equal(colors.size, 2);
  app.tick(2090);
  assert.equal(app.stutter.style.backgroundColor, 'rgba(255,159,10,0.10)');
  app.tick(2125);
  assert.equal(app.stutter.style.backgroundColor, 'rgba(255,159,10,0.82)');
});

test('LFO preview changes synced rate without relocating the current phase', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.playheadActive = true;
  ctx.playheadBaseTimeMs = 5062.5;
  ctx.playheadStartTime = 100000;
  ctx.syncSettings.lfoSubdivisionPinned = true;
  ctx.syncSettings.lfoSubdivision = 1;
  ctx.controlSetters['toggle-1'](1);
  ctx.controlSetters['toggle-1.depth'](1);
  app.tick(0);
  const state = ctx.lfoStates.get('toggle-1');
  const before = state.phase;
  ctx.syncSettings.lfoSubdivision = .5;
  app.tick(0);
  assert.ok(Math.abs(state.phase - before) < 1e-9, 'same-time division change must not reset phase');
  app.tick(10);
  assert.ok(Math.abs(state.phase - before - 2 * Math.PI * .04) < 1e-9);
});

test('LFO preview integrates FREE speed edits at their pointer timestamp, with fine drag', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.syncMode = 'free';
  app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
  ctx.controlSetters['toggle-1.rate'](.2);
  app.lfo.listeners.pointerdown(pointer(1, 100));
  app.tick(100);
  const state = ctx.lfoStates.get('toggle-1');
  const before = state.phase;
  app.setTime(105);
  ctx.controlSetters['toggle-1.rate'](.9);
  app.tick(111);
  const delta = (state.phase - before + 2 * Math.PI) % (2 * Math.PI);
  // sine ceiling is now 4 Hz (fallback for teto_efetivo ≈ 50 escritas/s; write-ceiling P04 pendente):
  // rate=0.2 → freq 0.88 Hz (was 1.08); rate=0.9 → freq 3.61 Hz (was 4.51).
  assert.ok(Math.abs(delta - 2 * Math.PI * (.005 * 0.88 + .006 * 3.61)) < 1e-9);
  const rateBeforeDrag = state.rate;
  app.lfo.listeners.pointermove({ ...pointer(1, 100), clientX: 65, shiftKey: true });
  assert.ok(Math.abs(state.rate - rateBeforeDrag - .025) < 1e-9, 'Shift drag is quarter sensitivity');
  const rateFine = state.rate;
  app.lfo.listeners.pointermove({ ...pointer(1, 100), clientX: 65, shiftKey: false });
  assert.equal(state.rate, rateFine, 'modifier toggle alone cannot jump rate');
});

test('LFO Auto preview includes intermediate rhythmic frequencies without exceeding ceiling', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.playheadActive = true;
  ctx.playheadBaseTimeMs = 0; ctx.playheadStartTime = 100000;
  ctx.controlSetters['toggle-1'](1);
  const frequencies = [];
  for (let i = 0; i < 10; i++) {
    ctx.controlSetters['toggle-1.rate']((i + .5) / 10);
    app.tick(i * 10);
    const before = ctx.lfoStates.get('toggle-1').phase;
    app.tick(i * 10 + 4);
    frequencies.push(((ctx.lfoStates.get('toggle-1').phase - before + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI * .004));
  }
  // P02: 32/16/8 beats added at the start of LFO_SUBDIVISIONS, so 10-rate sweep
  // at 120 BPM SYNC now yields a new sequence of frequencies. Observed directly via
  // getLfoSubdivision((i+0.5)/10, 120, undefined, 'sine') with the new table:
  //   subdiv = [32, 16, 4, 3, 8/3, 1.5, 4/3, 1, 2/3, 0.5]
  //   freq = bps/subdiv = 2/subdiv = [0.0625, 0.125, 0.5, 0.667, 0.75, 1.333, 1.5, 2, 3, 4].
  const expected = [0.0625, 0.125, 0.5, 2/3, 0.75, 4/3, 1.5, 2, 3, 4];
  frequencies.forEach((f, i) => assert.ok(Math.abs(f - expected[i]) < 1e-9, `${i}: ${f} != ${expected[i]}`));
});

for (const bpm of [60, 120, 300]) {
  for (const mode of ['free', 'sync', 'paused', 'pinned']) {
    test(`LFO preview respects 4Hz sine ceiling: ${mode} at ${bpm} BPM`, () => {
      const app = loadControls();
      app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
      app.lfo.listeners.pointerdown(pointer(1, 100));
      const ctx = app.context;
      ctx.currentBpm = bpm;
      ctx.syncMode = mode === 'free' ? 'free' : 'sync';
      ctx.playheadActive = mode !== 'paused';
      ctx.playheadBaseTimeMs = 0; ctx.playheadStartTime = 100000;
      ctx.syncSettings.clockSource = 'osc';
      ctx.syncSettings.lfoSubdivisionPinned = mode === 'pinned';
      ctx.syncSettings.lfoSubdivision = 0.03125;
      ctx.controlSetters['toggle-1.rate'](1);
      ctx.controlSetters['toggle-1.depth'](1);
      const phases = [];
      for (let time = 0; time <= 1000; time += 4) {
        app.tick(time);
        phases.push(ctx.lfoStates.get('toggle-1').phase);
      }
      const turn = 2 * Math.PI;
      const cycles = phases.slice(1).reduce((sum, p, i) => sum + ((p - phases[i] + turn) % turn) / turn, 0);
      // sine ceiling is now 4 Hz (fallback for teto_efetivo ≈ 50 escritas/s; write-ceiling P04 pendente).
      // FREE mode bypasses getLfoSubdivision (linear formula 0.1+rate·(maxHz-0.1) → 4 Hz at rate=1, all BPMs).
      // SYNC/paused/pinned route through getLfoSubdivision: 60/120 BPM always hit 4 Hz; 300 BPM
      // sync without pin → subdiv 4/3 → 3.75 Hz; pinned 0.03125 → subdiv 2 → 2.5 Hz.
      const expected =
        mode === 'free'
          ? 4
          : (bpm === 60 ? 4
            : bpm === 120 ? 4
            : (mode === 'pinned' ? 2.5 : 3.75));
      assert.ok(Math.abs(cycles - expected) < 0.00001, `expected ${expected} cycles, got ${cycles}`);
    });
  }
}

test('stutter mode B auto-deactivates when vertical amplitude is dragged to zero', () => {
  const app = loadControls();
  const modeB = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'B');
  modeB.listeners.click();

  app.stutter.listeners.pointerdown(pointer(1, 100));
  app.stutter.listeners.pointermove(pointer(1, 200)); // dy=-100, depth=0
  app.stutter.listeners.pointerup(pointer(1, 200));

  app.tick(1000);

  assert.equal(app.stutter.classList.contains('pressed'), false);
  const last = app.modulatorStates.at(-1);
  assert.equal(last.name, 'stutter-1');
  assert.equal(last.active, false);
});

test('stutter uses vertical depth and horizontal rate, preserving legacy count', () => {
  const app = loadControls();
  const send = (type, x, y) => app.stutter.listeners[type]({ ...pointer(1, y), clientX: x });
  app.context.controlSetters['stutter-1.count'](0.75);
  send('pointerdown', 50, 100);
  send('pointermove', 50, 55); app.tick(16);
  let state = app.context.stutterStates.get('stutter-1');
  assert.equal(state.rate, 0.1);
  assert.equal(state.depth, 0.8);
  send('pointermove', 110, 55); app.tick(32);
  assert.equal(state.rate, 0.5);
  assert.equal(state.depth, 0.8);
  assert.equal(state.count, 0.75);
  assert.equal(app.context.currentControlStates['stutter-1.depth'], 0.8);
  assert.equal(app.modulatorStates.at(-1).depth, 0.8);
  assert.equal(app.modulatorStates.at(-1).rate, 0.5);
});

test('vertical drag updates .mod-val-bar height to depth and resets on pointerup', () => {
  // P04 (rc-surface-modulator-quality-2026-09-16): the bar inside the
  // momentary gate must follow depth live (intent) and snap back to 0%
  // when the gate releases. Same gesture as the depth test above.
  const bar = makeElement({}); // fake .mod-val-bar; style.height = '80%' is a direct JS prop
  assert.equal(bar.style.height, undefined); // fresh bar, no prior paint
  const app = loadControls('stutter-1', { stutterBar: bar });
  const send = (type, x, y) => app.stutter.listeners[type]({ ...pointer(1, y), clientX: x });

  send('pointerdown', 50, 100);
  send('pointermove', 50, 55); app.tick(16);
  let state = app.context.stutterStates.get('stutter-1');
  assert.equal(state.depth, 0.8);
  assert.equal(bar.style.height, '80%');

  send('pointermove', 50, 100); app.tick(32);
  state = app.context.stutterStates.get('stutter-1');
  assert.equal(state.depth, 0.5);
  assert.equal(bar.style.height, '50%');

  send('pointerup', 50, 100);
  assert.equal(bar.style.height, '0%');
});

test('stutter depth setter paints the .mod-val-bar so snapshots re-show the saved depth', () => {
  // P04 (rc-surface-modulator-quality-2026-09-16): when a snapshot restores
  // depth through controlSetters[name.depth], the bar must repaint even though
  // no gesture is happening — otherwise the bar stays at 0% and lies.
  const bar = makeElement({});
  const app = loadControls('stutter-1', { stutterBar: bar });
  const setter = app.context.controlSetters['stutter-1.depth'];
  setter(0.7);
  assert.equal(app.context.stutterStates.get('stutter-1').depth, 0.7);
  assert.equal(bar.style.height, '70%');
  setter(-1); // clamps to 0
  assert.equal(bar.style.height, '0%');
  setter(2); // clamps to 1
  assert.equal(bar.style.height, '100%');
});

test('stutter mode B keeps horizontal speed drag latched even at zero rate', () => {
  const app = loadControls();
  app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
  app.stutter.listeners.pointerdown(pointer(1, 100));
  const end = { ...pointer(1, 100), clientX: 0 };
  app.stutter.listeners.pointermove(end); app.stutter.listeners.pointerup(end);
  const state = app.context.stutterStates.get('stutter-1');
  assert.equal(state.rate, 0);
  assert.equal(state.depth, 0.5);
  assert.equal(state.pressed, true);
});

test('stutter amplitude setter clamps, rejects non-finite data and respects morph suppression', () => {
  const app = loadControls();
  const setter = app.context.controlSetters['stutter-1.depth'];
  assert.equal(typeof setter, 'function');
  setter(5); assert.equal(app.context.stutterStates.get('stutter-1').depth, 1);
  setter(-5); assert.equal(app.context.currentControlStates['stutter-1.depth'], 0);
  const before = app.modulatorStates.length;
  setter(NaN); setter(Infinity);
  assert.equal(app.modulatorStates.length, before);
  app.context.withModulatorEmitSuppressed(() => setter(0.7));
  assert.equal(app.context.currentControlStates['stutter-1.depth'], 0.7);
  assert.equal(app.modulatorStates.length, before);
});

test('stutter snapshot recalls depth with one host morph and preserves depth in old snapshots', () => {
  const app = loadControls('button-1', { snapshots: true });
  const { context } = app;
  const setter = context.controlSetters['button-1.depth'];
  assert.equal(typeof setter, 'function');
  const snapshots = context.RCSurface.snapshots;
  setter(0.8); context.controlSetters['button-1'](1);
  snapshots.setSnapshotCaptureMode(true); snapshots.handleSnapshotSlot(0);
  setter(0.2); app.modulatorStates.length = 0;
  snapshots.handleSnapshotSlot(0);
  const stutterEvents = () => app.modulatorStates.filter(event => event.name === 'button-1');
  assert.equal(stutterEvents().length, 1);
  assert.equal(stutterEvents()[0].depth, 0.8);
  assert.equal(stutterEvents()[0].morphMs, 1000);
  app.tick(500); assert.ok(Math.abs(context.stutterStates.get('button-1').depth - 0.5) < 1e-9);
  app.tick(1000); assert.equal(context.stutterStates.get('button-1').depth, 0.8);
  assert.equal(stutterEvents().length, 1, 'local interpolation must not restart host morph');
  app.modulatorStates.length = 0;
  snapshots.startLinearMorph({ 'button-1.rate': 0.3 }, 1);
  assert.equal(app.modulatorStates[0].depth, 0.8, 'old snapshot missing depth retains current amplitude');
  app.tick(2000); assert.equal(context.stutterStates.get('button-1').depth, 0.8);
});

test('stutter visual state follows the active performance mode while pulsing the full interior', () => {
  const app = loadControls();
  const modeC = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'C');
  modeC.listeners.click();

  app.stutter.listeners.pointerdown(pointer(1, 100));

  assert.equal(app.stutter.classList.contains('mode-c'), true);

  app.tick(16);

  assert.match(app.stutter.style.backgroundColor, /^rgba\(255,\s*159,\s*10,/);
  assert.equal(app.stutter.style.getPropertyValue('--stut-glow-size'), '12px');
});

test('stutter keeps emitting while hidden but skips visual writes until Performance returns', () => {
  const app = loadControls();
  const modeB = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'B');
  modeB.listeners.click();

  app.stutter.listeners.pointerdown(pointer(1, 100));

  app.context.document.body.dataset.page = 'media';
  app.tick(1000);

  assert.equal(app.stutter.style.backgroundColor, '');
  assert.equal(app.modulatorStates.at(-1).name, 'stutter-1');

  app.context.document.body.dataset.page = 'performance';
  app.tick(1016);

  assert.match(app.stutter.style.backgroundColor, /^rgba\(255,\s*159,\s*10,/);
});

test('stutter high sync rates send configuration, never per-frame pulse samples', () => {
  const app = loadControls();
  const modeB = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'B');
  modeB.listeners.click();

  app.stutter.listeners.pointerdown(pointer(1, 100));
  app.context.controlSetters['stutter-1.rate'](1);
  app.context.controlSetters['stutter-1.count'](1);

  app.tick(1002);

  const stutterEvents = app.emitted.filter((event) => event.name === 'stutter-1');
  assert.equal(stutterEvents.length, 0);
  assert.equal(app.modulatorStates.at(-1).name, 'stutter-1');
  assert.equal(app.modulatorStates.at(-1).kind, 'stutter');
  assert.equal(app.modulatorStates.at(-1).active, true);
});

test('LFO animation sends configuration only, not per-frame output samples', () => {
  const app = loadControls();
  const modeB = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'B');
  modeB.listeners.click();

  app.lfo.listeners.pointerdown(pointer(1, 100));
  app.context.controlSetters['toggle-1.rate'](1);
  app.context.controlSetters['toggle-1.depth'](1);

  app.tick(1007);

  const lfoEvents = app.emitted.filter((event) => event.name === 'toggle-1');
  assert.equal(lfoEvents.length, 0);
  assert.equal(app.modulatorStates.at(-1).name, 'toggle-1');
  assert.equal(app.modulatorStates.at(-1).kind, 'lfo');
  assert.equal(app.modulatorStates.at(-1).active, true);
});

test('LFO sync payload uses per-control rate unless subdivision is pinned', () => {
  const app = loadControls();
  const modeB = app.modeButtons.find((btn) => btn.dataset.padModeSet === 'B');
  modeB.listeners.click();

  app.lfo.listeners.pointerdown(pointer(1, 100));

  let lfoState = app.modulatorStates.findLast((event) => event.name === 'toggle-1');
  assert.equal(lfoState.syncMode, 'sync');
  assert.equal(lfoState.syncSubdivisionBeats, null);

  app.lfo.listeners.pointerup(pointer(1, 100));
  app.modulatorStates.length = 0;
  app.context.syncSettings.lfoSubdivisionPinned = true;
  app.context.syncSettings.lfoSubdivision = 0.25;
  app.context.controlSetters['toggle-1'](0);

  app.lfo.listeners.pointerdown(pointer(2, 100));

  lfoState = app.modulatorStates.findLast((event) => event.name === 'toggle-1');
  assert.equal(lfoState.syncSubdivisionBeats, 0.25);
});

test('active SYNC LFO animates while transport is stopped without moving the playhead', () => {
  const app = loadControls();
  app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
  app.lfo.listeners.pointerdown(pointer(1, 100));
  app.context.controlSetters['toggle-1.rate'](0.4);
  app.context.controlSetters['toggle-1.depth'](1);
  app.context.playheadActive = false;
  app.context.playheadBaseTimeMs = 2000;
  app.tick(16);
  const phaseBefore = app.context.lfoStates.get('toggle-1').phase;
  const valueBefore = app.context.lfoStates.get('toggle-1').value;
  app.tick(79);
  const state = app.context.lfoStates.get('toggle-1');
  // P02/P01: rate=0.4 SYNC sine 120 BPM pinned=undefined now selects subdiv=8/3, freq=0.75 Hz.
  // With playheadActive=false, the controls.js motor falls into the linear-phase branch
  // (state.phase += 2π·frequency·elapsed) so phase must advance over 63 ms by exactly
  // 0.75 × 63/1000 = 0.04725 cycles = 2π × 0.04725 ≈ 0.2969 rad.
  const expectedPhaseDelta = 2 * Math.PI * 0.75 * 63 / 1000;
  const phaseDelta = ((state.phase - phaseBefore) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(Math.abs(phaseDelta - expectedPhaseDelta) < 1e-9,
    `paused transport must not freeze LFO animation (got phase delta ${phaseDelta}, expected ${expectedPhaseDelta})`);
  assert.notEqual(state.value, valueBefore, 'sin/cos value must reflect the new phase');
  assert.equal(state.active, true);
  assert.equal(app.context.playheadActive, false);
  assert.equal(app.context.playheadBaseTimeMs, 2000, 'animation must not advance Live transport state');
  assert.equal(app.emitted.filter(event => event.name === 'toggle-1').length, 0);
});

test('SYNC LFO resumes absolute beat phase after pause and repeats at the same song position', () => {
  const app = loadControls();
  const ctx = app.context;
  app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
  app.lfo.listeners.pointerdown(pointer(1, 100));
  ctx.controlSetters['toggle-1.depth'](1);
  ctx.syncSettings.lfoSubdivisionPinned = true;
  ctx.syncSettings.lfoSubdivision = 2;
  ctx.syncSettings.lfoPhaseOffset = 0.25;
  ctx.playheadActive = true;
  ctx.playheadBaseTimeMs = 1234;
  ctx.playheadStartTime = 100000;
  app.tick(16);
  const state = ctx.lfoStates.get('toggle-1');
  const locked = state.value;
  const phaseBeforePause = state.phase;
  ctx.playheadActive = false;
  app.tick(79);
  // P02/P01: rate=0.4 SYNC sine 120 BPM pin=2 → freq 1 Hz (bps/subdiv=1, unchanged across tables).
  const expected = 0.5 + 0.5 * Math.sin(phaseBeforePause + 2 * Math.PI * 0.063);
  assert.ok(Math.abs(state.value - expected) < 1e-9, 'paused LFO continues from last phase at pinned 1Hz');
  ctx.playheadActive = true;
  ctx.playheadStartTime = 100100;
  app.tick(116);
  assert.ok(Math.abs(state.value - locked) < 1e-9, 'Play re-locks to same song position, not paused phase');
});

test('internal clock LFO ignores Live transport position even when SYNC is selected', () => {
  const app = loadControls();
  app.modeButtons.find(btn => btn.dataset.padModeSet === 'B').listeners.click();
  app.lfo.listeners.pointerdown(pointer(1, 100));
  app.context.controlSetters['toggle-1.rate'](0.4);
  app.context.controlSetters['toggle-1.depth'](1);
  app.context.syncSettings.clockSource = 'free';
  app.context.playheadActive = true;
  app.tick(16);
  const state = app.context.lfoStates.get('toggle-1');
  const phase = state.phase;
  app.context.playheadBaseTimeMs = 187654;
  app.tick(79);
  // P02/P01: rate=0.4 internal-clock SYNC sine 120 BPM no-pin → subdiv=8/3, freq = 2/(8/3) = 0.75 Hz.
  // Phase advance over 63 ms = 0.75·0.063 = 0.04725 cycles.
  const expected = 0.5 + 0.5 * Math.sin(phase + 2 * Math.PI * 0.75 * 63 / 1000);
  assert.ok(Math.abs(state.value - expected) < 1e-9, 'internal clock must not jump to transport seek');
});

test('LFO settings show effective pinned division and update when BPM changes', () => {
  const app = loadControls('button-1', { syncPanel: true });
  app.context.syncSettings.lfoSubdivisionPinned = true;
  app.context.syncSettings.lfoSubdivision = 0.0625;
  app.tick(16);
  assert.equal(app.rateReadout.textContent, '1/64 → 1/8');
  app.context.currentBpm = 300;
  app.tick(32);
  // 300 BPM pino 0.0625: doubles to subdiv=2 (bps/subdiv=2.5 ≤ maxHz), so effective label = 1/2.
  assert.equal(app.rateReadout.textContent, '1/64 → 1/2');
  app.context.syncMode = 'free';
  app.tick(48);
  // sine ceiling is now 4 Hz: FREE band reflects maxHz for the current shape (sine → 4 Hz).
  assert.equal(app.rateReadout.textContent, 'FREE · 0.10–4.00 Hz');
});

test('LFO rate restored from snapshots is finite and clamped like host configuration', () => {
  const app = loadControls('button-1', { snapshots: true });
  const setter = app.context.controlSetters['toggle-1.rate'];
  const state = app.context.lfoStates.get('toggle-1');
  setter(2); assert.equal(state.rate, 1);
  setter(-1); assert.equal(state.rate, 0);
  setter(0.6); setter(NaN); setter(Infinity);
  assert.equal(state.rate, 0.6);
  assert.equal(app.context.currentControlStates['toggle-1.rate'], 0.6);
});

test('LFO Auto emits an explicit JSON null to clear a prior host pin', () => {
  const app = loadControls();
  const ctx = app.context;
  ctx.syncSettings.lfoSubdivisionPinned = true;
  ctx.syncSettings.lfoSubdivision = 4;
  ctx.sendLfoState('toggle-1', ctx.lfoStates.get('toggle-1'));
  assert.equal(app.modulatorStates.at(-1).syncSubdivisionBeats, 4);
  ctx.syncSettings.lfoSubdivisionPinned = false;
  ctx.sendLfoState('toggle-1', ctx.lfoStates.get('toggle-1'));
  assert.equal(JSON.parse(JSON.stringify(app.modulatorStates.at(-1))).syncSubdivisionBeats, null);
});
