// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Real browser policy vs host policy; clocks simulated, no physical Live claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getLfoSubdivision, getLfoMaxHz, getPulseTiming } from '../src/live/transport-clock.ts';

const source = fs.readFileSync(new URL('../static/phone-v3/controls.js', import.meta.url), 'utf8');
function declaration(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  return source.slice(start, end);
}
function table(name) {
  const match = source.match(new RegExp('const ' + name + ' = [\\s\\S]*?;'));
  assert.ok(match, name);
  return match[0];
}
function browser() {
  const ctx = { window: { currentBpm: 120, syncMode: 'sync', syncSettings: {} } };
  vm.createContext(ctx);
  vm.runInContext([
    table('LFO_SHAPE_MAX_HZ'), table('LFO_SUBDIVISIONS'), table('PULSE_SUBDIVISIONS'),
    ...['perInstancePulseSubdivision','perInstancePulseSwing','perInstancePulsePhaseOffset','modulatorSyncMode','clamp', 'getLfoMaxHz', 'getLfoSubdivision', 'getPulseSubdivisions', 'getPulseTiming', 'advancePulsePhase'].map(declaration),
  ].join('\n'), ctx);
  return ctx;
}

test('all shapes, tempos, Auto and old pins agree between browser and host', () => {
  const ctx = browser();
  for (const [shape, max] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 15 })) {
    ctx.window.syncSettings.lfoShape = shape;
    assert.equal(ctx.getLfoMaxHz(), max); assert.equal(getLfoMaxHz(shape), max);
    for (const bpm of [30, 60, 120, 180, 300]) {
      for (const pin of [undefined, 3, 2/3, .125, .03125]) {
        for (const rate of [0, .17, .4, .8, 1]) {
          const division = ctx.getLfoSubdivision(rate, bpm, pin);
          assert.equal(division, getLfoSubdivision(rate, bpm, pin, shape));
          assert.ok(bpm / 60 / division <= max + 1e-10);
        }
      }
    }
  }
});

test('Pulse Auto distributes only reachable SYNC speeds across the gesture', () => {
  const values = [0, .4, .8, 1].map(rate => getPulseTiming(rate, 0, 120, true).frequency);
  assert.deepEqual(values, [2, 4, 8, 8]);
});

test('Pulse FREE uses the whole gesture without a capped dead zone', () => {
  for (const count of [0, .3, .6, 1]) {
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const hz = getPulseTiming(i / 100, count, 120, false).frequency;
      assert.ok(hz > previous, `${count}: ${i} did not increase`);
      previous = hz;
    }
    assert.equal(previous, 15);
  }
});

test('Pulse effective rate includes swing/ratchet, pin and FREE/SYNC on both sides', () => {
  const ctx = browser();
  for (const sync of [true, false]) for (const bpm of [60, 120, 180, 300]) {
    for (const pin of [undefined, 1, .25, .03125]) for (const count of [0, .3, .6, 1]) {
      for (const swing of [0, .33, .66]) for (const rate of [0, .35, 1]) {
        ctx.window.currentBpm = bpm; ctx.window.syncMode = sync ? 'sync' : 'free';
        Object.assign(ctx.window.syncSettings, {
          pulseSubdivisionPinned: pin !== undefined, pulseSubdivision: pin, pulseSwing: swing,
        });
        const actual = ctx.getPulseTiming({ rate, count });
        const expected = getPulseTiming(rate, count, bpm, sync, pin, swing);
        for (const key of Object.keys(expected)) assert.equal(actual[key], expected[key]);
        assert.ok(actual.frequency / (sync ? 1 - swing : 1) <= 15 + 1e-10);
      }
    }
  }
});

test('Pulse preview follows real beat/swing gates at 30/60FPS, pause resumes locally', async () => {
  const { computeSyncedPulseValue } = await import('../src/live/transport-clock.ts');
  for (const stepMs of [1000/30, 1000/60]) {
    const ctx = browser();
    ctx.window.playheadActive = true;
    ctx.window.playheadStartTime = 100000;
    ctx.window.playheadBaseTimeMs = 37.23 * 500;
    Object.assign(ctx.window.syncSettings, { clockSource: 'osc', pulseSwing: .33,
      pulseSubdivisionPinned: true, pulseSubdivision: .03125, pulsePhaseOffset: .125 });
    const state = { active: true, rate: 1, depth: .37, count: .6 };
    const timing = getPulseTiming(1, .6, 120, true, .03125, .33);
    for (let now = 0; now <= 1000; now += stepMs) {
      ctx.Date = { now: () => 100000 + now };
      assert.equal(ctx.advancePulsePhase(state, now),
        computeSyncedPulseValue(((ctx.window.playheadBaseTimeMs + (100000 + now) - 100000) / 1000) * 2, timing.subdivision, .125, .33, timing.ratchet));
    }
    ctx.window.playheadActive = false;
    const before = state.phase, time = state.phaseTime;
    ctx.advancePulsePhase(state, time + 10);
    assert.ok(Math.abs((state.phase - before + 2 * Math.PI) % (2 * Math.PI)
      - timing.frequency * .01 * 2 * Math.PI) < 1e-9);
    state.active = false;
    assert.equal(ctx.advancePulsePhase(state, time + 20), false);
    assert.equal(state.phase, 0);
  }
});
