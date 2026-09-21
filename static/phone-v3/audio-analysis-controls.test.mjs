// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// The module runs in a vm, so everything it returns carries that realm's
// prototypes and deepStrictEqual refuses it. Compare the values, not the
// realms they were built in.
const mesmo = (real, esperado, msg) =>
  assert.deepEqual(JSON.parse(JSON.stringify(real)), esperado, msg);

function loadControls() {
  const file = path.join(import.meta.dirname, 'audio-analysis-controls.js');
  const source = fs.readFileSync(file, 'utf8');
  const storage = new Map();
  const context = {
    window: null,
    globalThis: null,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: file });
  return { controls: context.AudioAnalysisControls, storage };
}


test('hysteretic gate opens at threshold and closes only below 80 percent', () => {
  const { controls } = loadControls();
  const gate = new controls.HystereticGate(0.1);
  assert.equal(gate.update(0.099), false);
  assert.equal(gate.update(0.1), true);
  assert.equal(gate.update(0.085), true);
  assert.equal(gate.update(0.079), false);
});


// ---------------------------------------------------------------------------
// How sure, and for how long. Neither question had an answer before.


// ---------------------------------------------------------------------------
// The two timings that decide when a note may change have to follow the tempo,
// or generated MIDI lands near the grid instead of on it.


// ---------------------------------------------------------------------------
// Phase 1: an attack, a repeat, and a key. Three decisions that were all being
// made by one rule — "the vote changed while the gate was open".

test('an onset is an edge, not a level', () => {
  const { controls } = loadControls();
  const gate = new controls.OnsetGate({ sensitivity: 0.25 });
  // The transient channel stays high while the level keeps climbing, so
  // reading it as a level reports an attack on every frame of one strike.
  assert.equal(gate.update(0.10, 0), false);
  assert.equal(gate.update(0.40, 10), true, 'the crossing is the attack');
  assert.equal(gate.update(0.50, 20), false, 'still the same strike');
  assert.equal(gate.update(0.30, 30), false);
  // Has to fall well under the threshold before another can be reported,
  // or a level hovering at it reports an onset every other frame.
  assert.equal(gate.update(0.20, 40), false, 'hysteresis: 0.20 is not low enough');
  assert.equal(gate.update(0.05, 50), false);
  assert.equal(gate.update(0.40, 60), true, 're-armed, so a new strike counts');
  assert.equal(gate.sinceMs(100), 40);
});

test('the onset gate survives nonsense and retunes', () => {
  const { controls } = loadControls();
  const gate = new controls.OnsetGate({ sensitivity: Number.NaN });
  assert.ok(Number.isFinite(gate.sensitivity));
  assert.equal(gate.update(Number.NaN, 0), false);
  assert.equal(gate.setSensitivity(9), 1, 'clamped to the top of the channel');
  assert.equal(gate.setSensitivity(0), 0.02, 'and never to zero, which fires always');
  gate.reset();
  assert.equal(gate.sinceMs(10), null);
});


// ---------------------------------------------------------------------------
// Phase 3: how hard it was played, measured where that is actually audible.

test('the loudness comes from the peak after the attack, not the first frame', () => {
  const { controls } = loadControls();
  const w = new controls.VelocityWindow({ windowMs: 30, rangeDb: 40 });
  w.open(0);
  // The frame a note starts is the beginning of the rise: at that moment a
  // hard hit and a soft one are both near zero.
  assert.equal(w.update(0.05, 0), false, 'still watching');
  assert.equal(w.value(), null, 'and refuses to answer early');
  w.update(0.40, 10);
  w.update(0.80, 20);
  assert.equal(w.update(0.60, 30), true, 'the window closes on time');
  assert.equal(w.value(), 1, 'the loudest thing yet is the top of the range');
});

test('loudness is read in dB, because hearing is', () => {
  const { controls } = loadControls();
  const w = new controls.VelocityWindow({ windowMs: 30, rangeDb: 40 });
  // Establish the ceiling with a loud note.
  w.open(0); w.update(0.8, 0); w.update(0.8, 30);
  assert.equal(w.value(), 1);
  // A tenth of the amplitude is 20 dB down, which is half way through a 40 dB
  // range. Linear would have called it 0.1 and left the bottom of the range
  // unreachable for anything audible.
  w.open(100); w.update(0.08, 100); w.update(0.08, 130);
  assert.ok(Math.abs(w.value() - 0.5) < 1e-9, `expected 0.5, got ${w.value()}`);
  // A hundredth is 40 dB down: the floor.
  w.open(200); w.update(0.008, 200); w.update(0.008, 230);
  assert.ok(Math.abs(w.value()) < 1e-9);
  // And quieter than the range still floors rather than going negative.
  w.open(300); w.update(0.0001, 300); w.update(0.0001, 330);
  assert.equal(w.value(), 0);
});

test('the ceiling is the performance, not the note', () => {
  const { controls } = loadControls();
  const w = new controls.VelocityWindow({ windowMs: 10, rangeDb: 40 });
  // A quiet opening note must not make itself full velocity by being the only
  // thing heard so far — but it is the only reference there is, so it does,
  // and the ceiling then rises and never falls.
  w.open(0); w.update(0.1, 0); w.update(0.1, 10);
  assert.equal(w.value(), 1, 'the first note has nothing to be quieter than');
  w.open(20); w.update(1.0, 20); w.update(1.0, 30);
  assert.equal(w.value(), 1, 'a louder note raises the ceiling');
  w.open(40); w.update(0.1, 40); w.update(0.1, 50);
  assert.equal(w.value(), 0.5, 'and the quiet one is now 20 dB down');
  // Cleared only when analysis stops, not between notes.
  w.reset();
  assert.equal(w.ceiling, 0);
});

test('the velocity window survives nonsense and retunes', () => {
  const { controls } = loadControls();
  const w = new controls.VelocityWindow({ windowMs: Number.NaN, rangeDb: 'x' });
  assert.ok(Number.isFinite(w.windowMs) && Number.isFinite(w.rangeDb));
  assert.equal(w.value(), null, 'no note open, no answer');
  assert.equal(w.update(0.5, 0), false, 'a level with no note open is ignored');
  assert.equal(w.setWindowMs(9999), 200, 'clamped to the documented ceiling');
  assert.equal(w.setRangeDb(1), 12, 'and a range too small to be usable is refused');
  w.open(0); w.update(Number.NaN, 0); w.update(Number.NaN, 500);
  assert.equal(w.value(), 0, 'silence is zero, never NaN');
});

// ---------------------------------------------------------------------------
// Phase 4: what key is this, when the input is harmony rather than melody.

// A bin has to be narrower than a semitone or the fold is meaningless in the
// register that matters, so these use the window the class recommends.
