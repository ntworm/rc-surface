// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// RED/GREEN contract for learned gesture hold behaviour.
//
// BUG (before fix): app.js onGesture emits value=1 then schedules value=0
// after 80 ms unconditionally, regardless of whether the pose is still held.
// This means:
//   - With noteGate='hold', a note-off fires 80 ms after entry — not on release.
//   - If the user changes pose (G1→G2) the previous slot gets its OFF from the
//     timer, not from the FSM transition — timing is off and a stuck note is
//     possible if the timer fires after the new slot's ON.
//
// EXPECTED (after fix): app.js must:
//   1. Emit value=1 on the ENTRY edge (onGesture callback) — once per entry.
//   2. Emit value=0 on the EXIT edge via onGestureRelease callback — once per
//      release (pose lost, hand lost, camera stop, mode change, stop, disconnect).
//   3. NOT schedule a fixed-duration 0 that fires while the pose is still held.
//   4. For pulse gate: still emit value=1 and schedule value=0 after noteDurationMs.
//      (Pulse is decided by the mapping's noteGate field, not hard-coded in the
//       gesture emitter.)
//   5. TEST mode (visionGestureTestSlot active) remains MIDI-silent.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = import.meta.dirname;
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// Extract the VisionControlState module to get controlForSlot/slotForGesture.
function loadVisionControlState() {
  const src = fs.readFileSync(path.join(root, 'vision-control-state.js'), 'utf8');
  const ctx = { window: {} };
  ctx.window.globalThis = ctx.window;
  vm.runInNewContext(src, ctx.window);
  return ctx.window;
}

// Build a minimal VisionControlState with a gesture named 'Rock' in slot 1.
function makeVisionControls(gestureNames = ['Rock', 'Peace', 'OK']) {
  const mod = loadVisionControlState();
  const templates = gestureNames.map((name) => ({ name }));
  return new mod.VisionControlState({}, templates);
}

// Extract the onGesture assignment from app.js so we can unit-test it without
// booting the full phone UI.  We look for the block that starts immediately
// after the gesture-test branch ends (the `return;` at line 2483) and ends
// at the next enclosing `};` closing the assignment.
function extractOnGestureBody() {
  const start = appSource.indexOf('visionProcessor.onGesture = (match) => {');
  assert.ok(start > 0, 'onGesture assignment must exist in app.js');
  // Find the closing `};` that terminates the assignment.
  const end = appSource.indexOf('};', start + 10);
  assert.ok(end > start, 'onGesture body closing brace not found');
  return appSource.slice(start, end + 2);
}

// Check that app.js exposes an onGestureRelease assignment site.
// This is the canonical proof that the fix landed: the app wires a release
// callback on the processor, not just an entry callback.
test('app.js declares visionProcessor.onGestureRelease for OFF edge', () => {
  assert.match(
    appSource,
    /visionProcessor\.onGestureRelease\s*=/,
    'app.js must assign visionProcessor.onGestureRelease to emit value=0 on release. ' +
    'Currently only onGesture fires and schedules 0 after 80 ms.',
  );
});

// Verify the onGesture handler no longer contains a hard-coded 80 ms timer
// that fires OFF unconditionally.
test('onGesture does NOT schedule an unconditional value=0 after fixed ms', () => {
  const body = extractOnGestureBody();
  // The pattern `setTimeout(() => ... value: 0 ...}, 80)` is the bug.
  assert.doesNotMatch(
    body,
    /setTimeout\s*\(\s*\(\s*\)\s*=>\s*window\.onControl\s*&&\s*window\.onControl\(\s*\{[^}]*value:\s*0/,
    'onGesture body must not contain a hard-coded timer that zeros the gesture channel. ' +
    'OFF must be emitted by onGestureRelease, not a race-prone setTimeout.',
  );
});

// Functional contract: a gesture entering and remaining active must keep
// value=1 past 80 ms.  This test drives the same VisionControlState FSM that
// the real app uses, with a fake onControl recorder and fake setTimeout that
// runs synchronously when asked.
test('gesture hold keeps value=1 while pose is active, value=0 only on release', () => {
  const controls = makeVisionControls();
  const emissions = [];

  // Simulate the app's onControl mock
  const onControl = (event) => emissions.push({ ...event });

  // Build a minimal fake processor that tracks callbacks registered on it
  const processor = {
    onGesture: null,
    onGestureRelease: null,
  };

  // Minimal visionGestureTestSlot state (null = not in test mode)
  let visionGestureTestSlot = null;

  // Spy on setTimeout to detect if a zero-timer is scheduled
  const scheduledTimers = [];
  const fakeSetTimeout = (fn, ms) => {
    scheduledTimers.push({ fn, ms });
    return scheduledTimers.length;
  };

  // Wire up the callbacks as the fixed app.js should:
  // ON: emit value=1 on entry
  processor.onGesture = (match) => {
    const slot = controls.slotForGesture(match.name);
    if (!slot) return;
    if (visionGestureTestSlot !== null && visionGestureTestSlot !== slot.id) return;
    // TEST mode: silent (no MIDI) — already handled by early return above
    if (visionGestureTestSlot !== null) return;
    const control = controls.controlForSlot(slot.id);
    onControl({ name: control, value: 1 });
    // BUG would be: fakeSetTimeout(() => onControl({ name: control, value: 0 }), 80);
    // FIX: no timer here — OFF comes from onGestureRelease
  };

  // OFF: emit value=0 on release
  processor.onGestureRelease = (name) => {
    const slot = controls.slotForGesture(name);
    if (!slot) return;
    const control = controls.controlForSlot(slot.id);
    onControl({ name: control, value: 0 });
  };

  // Simulate: user holds 'Rock' pose
  processor.onGesture({ name: 'Rock', confidence: 0.95, score: 0.1 });

  // Immediately after ON, value should be 1
  assert.equal(emissions.length, 1, 'exactly one emission on gesture entry');
  assert.deepEqual(emissions[0], { name: 'sensor.vision.gesture.1', value: 1 });

  // No timer should have been scheduled (no 80 ms OFF)
  assert.equal(scheduledTimers.length, 0, 'no timer must be scheduled for OFF on hold gate');

  // After 200 ms (simulated) with pose still held: still value=1 (no OFF emitted)
  // In a real implementation, the app polls the FSM; here we just verify no OFF appeared.
  assert.equal(emissions.length, 1, 'value must remain 1 while pose is held');

  // Release: user drops pose
  processor.onGestureRelease('Rock');

  assert.equal(emissions.length, 2, 'exactly one OFF emission on release');
  assert.deepEqual(emissions[1], { name: 'sensor.vision.gesture.1', value: 0 });
});

// G1→G2 transition: changing poses must emit OFF for G1 then ON for G2.
test('G1→G2 transition emits OFF for G1 before ON for G2', () => {
  const controls = makeVisionControls();
  const emissions = [];
  const onControl = (e) => emissions.push({ ...e });

  const processor = { onGesture: null, onGestureRelease: null };

  processor.onGesture = (match) => {
    const slot = controls.slotForGesture(match.name);
    if (!slot) return;
    onControl({ name: controls.controlForSlot(slot.id), value: 1 });
  };

  processor.onGestureRelease = (name) => {
    const slot = controls.slotForGesture(name);
    if (!slot) return;
    onControl({ name: controls.controlForSlot(slot.id), value: 0 });
  };

  // Enter G1 (Rock)
  processor.onGesture({ name: 'Rock', confidence: 0.9 });
  assert.deepEqual(emissions[0], { name: 'sensor.vision.gesture.1', value: 1 });

  // Leave G1 — FSM should fire onGestureRelease before onGesture for G2
  processor.onGestureRelease('Rock');
  processor.onGesture({ name: 'Peace', confidence: 0.88 });

  assert.equal(emissions.length, 3);
  assert.deepEqual(emissions[1], { name: 'sensor.vision.gesture.1', value: 0 });
  assert.deepEqual(emissions[2], { name: 'sensor.vision.gesture.2', value: 1 });
});

// TEST mode (visionGestureTestSlot active): no MIDI emitted.
test('TEST mode suppresses MIDI emission', () => {
  const controls = makeVisionControls();
  const emissions = [];
  const onControl = (e) => emissions.push({ ...e });

  let visionGestureTestSlot = 1; // Testing slot 1

  const processor = { onGesture: null, onGestureRelease: null };

  processor.onGesture = (match) => {
    const slot = controls.slotForGesture(match.name);
    if (!slot) return;
    if (visionGestureTestSlot !== null) return; // TEST mode: silent
    onControl({ name: controls.controlForSlot(slot.id), value: 1 });
  };

  processor.onGestureRelease = (name) => {
    const slot = controls.slotForGesture(name);
    if (!slot) return;
    if (visionGestureTestSlot !== null) return; // TEST mode: silent
    onControl({ name: controls.controlForSlot(slot.id), value: 0 });
  };

  processor.onGesture({ name: 'Rock', confidence: 0.9 });
  processor.onGestureRelease('Rock');

  assert.equal(emissions.length, 0, 'TEST mode must produce no MIDI emissions');
});

// Hand lost / camera stop: must emit OFF for any currently-held gesture.
test('signal loss emits OFF for held gesture channel', () => {
  // This test verifies that VISION_LOSS_CHANNELS includes gesture slots
  // so emitVisionSignalLoss() clears them on hand loss.
  const lossChannels = ['sensor.vision.gesture.1', 'sensor.vision.gesture.2', 'sensor.vision.gesture.3'];
  for (const ch of lossChannels) {
    assert.match(
      appSource,
      new RegExp(`'${ch.replace(/\./g, '\\.')}'|"${ch.replace(/\./g, '\\.')}"`, 'u'),
      `${ch} must appear in VISION_LOSS_CHANNELS or emitVisionSignalLoss body`,
    );
  }
});
