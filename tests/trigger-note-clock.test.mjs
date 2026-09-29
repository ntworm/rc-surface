// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TriggerNoteClock,
  nextTriggerBeat,
  resolveTriggerNoteOptions,
  resolveGridDurationMs,
} from '../src/live/trigger-note-clock.js';

test('grid duration uses current time signature at ON and rejects invalid fields', () => {
  const options = resolveTriggerNoteOptions({ noteTiming: 'beat', noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: 0.25 });
  assert.equal(options.valid, true);
  assert.equal(resolveGridDurationMs(0.25, { valid: true, bpm: 120, beatsPerBar: 3 }), 375);
  assert.equal(resolveGridDurationMs(0.25, { valid: true, bpm: 120, beatsPerBar: 4 }), 500);
  assert.equal(resolveGridDurationMs(0.25, { valid: false, bpm: 120, beatsPerBar: 4 }), null);
  assert.equal(resolveTriggerNoteOptions({ noteTiming: 'beat', noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: 0.3 }).valid, false);
  assert.equal(resolveTriggerNoteOptions({ noteTiming: 'beat', noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: Infinity }).valid, false);
  assert.equal(resolveTriggerNoteOptions({ noteTiming: 'immediate', noteGate: 'hold', noteDurationMode: 'grid', noteDurationBars: 0.25 }).valid, false);
});

test('C16: immediate pulse accepts musical duration while hold still rejects it', () => {
  assert.equal(resolveTriggerNoteOptions({ noteTiming: 'immediate', noteGate: 'pulse', noteDurationMode: 'grid', noteDurationBars: 0.5 }).valid, true);
  assert.equal(resolveTriggerNoteOptions({ noteTiming: 'immediate', noteGate: 'hold', noteDurationMode: 'grid', noteDurationBars: 0.5 }).valid, false);
});

test('C16: stopped transport has fresh duration metadata without permitting quantized onset', () => {
  let now = 1000;
  const clock = new TriggerNoteClock(() => now);
  clock.updateTransport(false, true, 120, 3, 4);
  clock.observePosition(2, 120, 3, 4);
  assert.equal(clock.snapshot().valid, false);
  assert.equal(resolveGridDurationMs(0.25, clock.snapshot({ allowStopped: true })), 375);
  now += 1001;
  assert.equal(resolveGridDurationMs(0.25, clock.snapshot({ allowStopped: true })), 375, 'a stationary playhead does not expire connected BPM/meter');
  clock.updateTransport(true, true, 120, 3, 4);
  assert.equal(resolveGridDurationMs(0.25, clock.snapshot({ allowStopped: true })), null);
  clock.updateTransport(false, false, 120, 3, 4);
  assert.equal(resolveGridDurationMs(0.25, clock.snapshot({ allowStopped: true })), null);
});

test('nextTriggerBeat: calculates strictly future beats for beat and bar grids', () => {
  // 120 BPM: 500ms per beat.
  // 10.25 -> 11: delta 0.75 beat = 375ms
  const target1025 = nextTriggerBeat(10.25, 'beat', 4);
  assert.equal(target1025, 11);
  const ms1025 = (target1025 - 10.25) * (60_000 / 120);
  assert.equal(ms1025, 375);

  // 10.75 -> 11: delta 0.25 beat = 125ms
  const target1075 = nextTriggerBeat(10.75, 'beat', 4);
  assert.equal(target1075, 11);
  const ms1075 = (target1075 - 10.75) * (60_000 / 120);
  assert.equal(ms1075, 125);

  // 10.0 exact -> 11: delta 1.0 beat = 500ms (strictly future, no retrospective trigger)
  const target1000 = nextTriggerBeat(10.0, 'beat', 4);
  assert.equal(target1000, 11);
  const ms1000 = (target1000 - 10.0) * (60_000 / 120);
  assert.equal(ms1000, 500);

  // 4/4 bar: beatsPerBar = 4. Beat 3.8 -> 4: delta 0.2 beat = 100ms
  const target38 = nextTriggerBeat(3.8, 'bar', 4);
  assert.equal(target38, 4);
  const ms38 = (target38 - 3.8) * (60_000 / 120);
  assert.ok(Math.abs(ms38 - 100) < 1e-6);

  // 7/8 bar: beatsPerBar = 7 * 4 / 8 = 3.5. Beat 3.25 -> 3.5: delta 0.25 beat = 125ms
  const beatsPerBar78 = (7 * 4) / 8;
  assert.equal(beatsPerBar78, 3.5);
  const target325 = nextTriggerBeat(3.25, 'bar', beatsPerBar78);
  assert.equal(target325, 3.5);
  const ms325 = (target325 - 3.25) * (60_000 / 120);
  assert.ok(Math.abs(ms325 - 125) < 1e-6);

  // 3/4 bar: beatsPerBar = 3
  const beatsPerBar34 = (3 * 4) / 4;
  assert.equal(beatsPerBar34, 3);
  assert.equal(nextTriggerBeat(2.5, 'bar', beatsPerBar34), 3);
  assert.equal(nextTriggerBeat(3.0, 'bar', beatsPerBar34), 6);
});

test('TriggerNoteClock: invalidates on initial unobserved, stopped, disconnected, count-in and age > 1000ms', () => {
  let fakeNow = 1000;
  const clock = new TriggerNoteClock(() => fakeNow);

  // Initial unobserved state
  let snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'disconnected');

  // Connected but stopped
  clock.updateTransport(false, true, 120, 4, 4);
  snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'stopped');

  // Connected and playing, but position not observed yet
  clock.updateTransport(true, true, 120, 4, 4);
  snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'unobserved');

  // Position observed with negative count-in
  clock.observePosition(-1.0, 120, 4, 4);
  snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'count_in');

  // Position observed valid at beat 10.0
  fakeNow = 2000;
  clock.observePosition(10.0, 120, 4, 4);
  snap = clock.snapshot();
  assert.equal(snap.valid, true);
  assert.equal(snap.beat, 10.0);
  assert.equal(snap.bpm, 120);
  assert.equal(snap.beatsPerBar, 4);

  // Advance time by 250ms (0.5 beat at 120BPM)
  fakeNow = 2250;
  snap = clock.snapshot();
  assert.equal(snap.valid, true);
  assert.ok(Math.abs(snap.beat - 10.5) < 1e-4);

  // Age reaches 1001ms without fresh observation -> stale
  fakeNow = 3001;
  snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'stale');

  // Fresh observation restores validity
  fakeNow = 3010;
  clock.observePosition(12.0, 120, 4, 4);
  snap = clock.snapshot();
  assert.equal(snap.valid, true);
});

test('TriggerNoteClock: tempo change integrates advance with old BPM before new BPM and does not renew position alone', () => {
  let fakeNow = 1000;
  const clock = new TriggerNoteClock(() => fakeNow);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.0, 120, 4, 4);

  // Advance 250ms at 120 BPM: 250ms = 0.5 beat
  fakeNow = 1250;
  // Tempo changes from 120 to 60 via updateTransport
  clock.updateTransport(true, true, 60, 4, 4);

  // Immediate beat after tempo change should reflect 10.5
  let snap = clock.snapshot();
  assert.equal(snap.valid, true);
  assert.ok(Math.abs(snap.beat - 10.5) < 1e-4, `Expected 10.5, got ${snap.beat}`);
  assert.equal(snap.bpm, 60);

  // Now advance another 500ms at 60 BPM (1 beat/sec): 500ms = 0.5 beat -> 11.0
  fakeNow = 1750;
  snap = clock.snapshot();
  assert.equal(snap.valid, true);
  assert.ok(Math.abs(snap.beat - 11.0) < 1e-4, `Expected 11.0, got ${snap.beat}`);

  // An isolated tempo change does NOT renew anchorTimeMs for staleness check
  // Anchor was at 1000. At fakeNow = 2005 (1005ms since observePosition), it must be stale
  fakeNow = 2005;
  snap = clock.snapshot();
  assert.equal(snap.valid, false);
  assert.equal(snap.reason, 'stale');
});

test('TriggerNoteClock: epoch increments on seek, loop, signature change, disconnect and stop, but not small corrections', () => {
  let fakeNow = 1000;
  const clock = new TriggerNoteClock(() => fakeNow);
  clock.updateTransport(true, true, 120, 4, 4);
  clock.observePosition(10.0, 120, 4, 4);

  const initialEpoch = clock.snapshot().epoch;

  // Advance 100ms: expected beat 10.2
  fakeNow = 1100;
  // Sample observed is 10.22 (small correction of 0.02 <= 0.25 beat)
  clock.observePosition(10.22, 120, 4, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch, 'Small correction must not increment epoch');

  // Advance another 100ms: expected ~10.42. Received 10.42 (repeated/exact)
  fakeNow = 1200;
  clock.observePosition(10.42, 120, 4, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch, 'Repeated/expected sample must not increment epoch');

  // Sudden deviation > 0.25 beat (e.g. seek to beat 24.0)
  clock.observePosition(24.0, 120, 4, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch + 1, 'Deviation > 0.25 beat increments epoch');

  // Loop back: beat jumps from 24 to 8
  fakeNow = 1300;
  clock.observePosition(8.0, 120, 4, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch + 2, 'Loop jump increments epoch');

  // Signature change increments epoch
  fakeNow = 1400;
  clock.observePosition(8.2, 120, 3, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch + 3, 'Signature change increments epoch');

  // Stop increments epoch
  clock.updateTransport(false, true, 120, 3, 4);
  assert.equal(clock.snapshot().epoch, initialEpoch + 4, 'Stop increments epoch');

  // Reconnect increments epoch
  clock.updateTransport(true, false, 120, 3, 4);
  clock.updateTransport(true, true, 120, 3, 4);
  assert.ok(clock.snapshot().epoch >= initialEpoch + 5, 'Disconnect/reconnect increments epoch');
});

test('resolveTriggerNoteOptions: resolves defaults, validates enums and bounds, and rejects hold+sync', () => {
  // Empty target resolves to legacy defaults: immediate, hold, 80ms
  const def = resolveTriggerNoteOptions({});
  assert.equal(def.valid, true);
  assert.equal(def.timing, 'immediate');
  assert.equal(def.gate, 'hold');
  assert.equal(def.durationMs, 80);

  // immediate + pulse is valid with custom integer duration in 20..2000
  const immPulse = resolveTriggerNoteOptions({ noteTiming: 'immediate', noteGate: 'pulse', noteDurationMs: 150 });
  assert.equal(immPulse.valid, true);
  assert.equal(immPulse.timing, 'immediate');
  assert.equal(immPulse.gate, 'pulse');
  assert.equal(immPulse.durationMs, 150);

  // beat + pulse is valid (e.g. Para acordes preset)
  const beatPulse = resolveTriggerNoteOptions({ noteTiming: 'beat', noteGate: 'pulse', noteDurationMs: 80 });
  assert.equal(beatPulse.valid, true);
  assert.equal(beatPulse.timing, 'beat');
  assert.equal(beatPulse.gate, 'pulse');
  assert.equal(beatPulse.durationMs, 80);

  // bar + pulse is valid
  const barPulse = resolveTriggerNoteOptions({ noteTiming: 'bar', noteGate: 'pulse', noteDurationMs: 200 });
  assert.equal(barPulse.valid, true);
  assert.equal(barPulse.timing, 'bar');

  // Rejection: hold + sync (beat/bar + hold) is invalid
  const beatHold = resolveTriggerNoteOptions({ noteTiming: 'beat', noteGate: 'hold' });
  assert.equal(beatHold.valid, false);
  assert.match(beatHold.error, /hold/i);

  const barHold = resolveTriggerNoteOptions({ noteTiming: 'bar', noteGate: 'hold' });
  assert.equal(barHold.valid, false);
  assert.match(barHold.error, /hold/i);

  // Rejection: invalid timing enum
  const badTiming = resolveTriggerNoteOptions({ noteTiming: 'quarter' });
  assert.equal(badTiming.valid, false);
  assert.match(badTiming.error, /noteTiming/);

  // Rejection: invalid gate enum
  const badGate = resolveTriggerNoteOptions({ noteGate: 'toggle' });
  assert.equal(badGate.valid, false);
  assert.match(badGate.error, /noteGate/);

  // Rejection: duration out of 20..2000 bounds
  const tooLow = resolveTriggerNoteOptions({ noteDurationMs: 10 });
  assert.equal(tooLow.valid, false);
  const tooHigh = resolveTriggerNoteOptions({ noteDurationMs: 2500 });
  assert.equal(tooHigh.valid, false);

  // Rejection: fractional duration
  const fractional = resolveTriggerNoteOptions({ noteDurationMs: 80.5 });
  assert.equal(fractional.valid, false);
  assert.match(fractional.error, /integer/i);
});
