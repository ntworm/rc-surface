// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  ContinuationTracker,
  SEND_MARGIN_BEATS,
  effectiveSongQuantization,
  planPasses,
  predictLanding,
  quantumBeats,
} from "../src/live/clip-continuation.ts";

const loopClip = (startMarker, loopStart, loopEnd) => ({
  startMarker, loopStart, loopEnd, endMarker: loopEnd, looping: true, beatUnits: true,
});
const oneShot = (startMarker, endMarker) => ({
  startMarker, endMarker, loopStart: startMarker, loopEnd: endMarker, looping: false, beatUnits: true,
});

/** Where Live's playing_position is after `elapsed` beats of play. */
function positionAt(geometry, elapsed) {
  const first = geometry.loopEnd - geometry.startMarker;
  if (!geometry.looping || elapsed < first) return geometry.startMarker + elapsed;
  const loop = geometry.loopEnd - geometry.loopStart;
  return geometry.loopStart + ((elapsed - first) % loop);
}

/**
 * Feed the tracker a playing clip: confirmation at elapsed 0, then one push
 * every `step(i)` beats, each reporting `step(i) + error(i)` beats elapsed.
 */
function simulate({ geometry, passes, quantum, bpm = 120, step = () => 0.1, error = () => 0, until }) {
  const created = ContinuationTracker.create({ geometry, passes, quantum, bpm });
  assert.equal(created.ok, true, `rule refused: ${created.reason}`);
  const tracker = created.tracker;
  const decisions = [];
  const record = (decision, elapsed) => { if (decision.kind !== "none") decisions.push({ ...decision, elapsed }); };
  record(tracker.confirm(), 0);
  const end = until ?? tracker.plan.total + 2 * quantum;
  let elapsed = 0;
  for (let i = 0; i < 100_000; i++) {
    const beats = step(i);
    if (elapsed + beats > end) break;
    if (!geometry.looping && elapsed + beats >= geometry.endMarker - geometry.startMarker) {
      record(tracker.naturalEnd(), geometry.endMarker - geometry.startMarker);
      break;
    }
    elapsed += beats;
    record(tracker.position(positionAt(geometry, elapsed), beats + error(i)), elapsed);
  }
  return { tracker, decisions };
}

/** Deterministic pseudo-random sequence in [0, 1). */
function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

test("quantization values map to beats with the current time signature", () => {
  assert.equal(quantumBeats(4, 4, 4), 4, "1 Bar in 4/4");
  assert.equal(quantumBeats(4, 3, 4), 3, "1 Bar in 3/4");
  assert.equal(quantumBeats(4, 6, 8), 3, "1 Bar in 6/8");
  assert.equal(quantumBeats(3, 4, 4), 8, "2 Bars");
  assert.equal(quantumBeats(1, 4, 4), 32, "8 Bars");
  assert.equal(quantumBeats(7, 4, 4), 1, "1/4");
  assert.equal(quantumBeats(11, 4, 4), 0.25, "1/16");
  assert.equal(quantumBeats(0, 4, 4), null, "None");
  assert.equal(quantumBeats(null, 4, 4), null);
  assert.equal(effectiveSongQuantization(0, 4), 4, "clip Global follows the song");
  assert.equal(effectiveSongQuantization(1, 4), 0, "clip None");
  assert.equal(effectiveSongQuantization(2, 4), 1, "clip 8 Bars");
  assert.equal(effectiveSongQuantization(5, 4), 4, "clip 1 Bar");
  assert.equal(effectiveSongQuantization(null, 4), 4, "unknown clip setting falls back to the song");
  assert.equal(effectiveSongQuantization(99, 4), null);
});

test("N passes count the first pass from the start marker and later passes from the loop", () => {
  // Start marker on the loop start: every pass is one loop.
  for (const [passes, total] of [[1, 4], [2, 8], [3, 12]]) {
    const plan = planPasses(loopClip(0, 0, 4), passes);
    assert.deepEqual([plan.ok, plan.first, plan.loop, plan.total], [true, 4, 4, total]);
  }
  // Start marker inside the loop: the first pass is shorter.
  for (const [passes, total] of [[1, 2], [2, 6], [3, 10]]) {
    const plan = planPasses(loopClip(2, 0, 4), passes);
    assert.deepEqual([plan.ok, plan.first, plan.loop, plan.total], [true, 2, 4, total]);
  }
  // Pre-roll before the loop: the first pass is longer.
  for (const [passes, total] of [[1, 8], [2, 12], [3, 16]]) {
    const plan = planPasses(loopClip(0, 4, 8), passes);
    assert.deepEqual([plan.ok, plan.first, plan.loop, plan.total], [true, 8, 4, total]);
  }
  // A clip without loop plays once.
  const once = planPasses(oneShot(0, 6), 1);
  assert.deepEqual([once.ok, once.total, once.loop], [true, 6, null]);
  assert.deepEqual(planPasses(oneShot(0, 6), 2), { ok: false, reason: "non_loop_passes" });
});

test("rules refuse what they cannot count", () => {
  assert.equal(planPasses({ ...loopClip(0, 0, 4), beatUnits: false }, 1).reason, "unwarped_audio");
  assert.equal(planPasses(loopClip(5, 0, 4), 1).reason, "invalid_markers");
  assert.equal(planPasses(loopClip(0, 0, 0.5), 1).reason, "loop_too_short");
  assert.equal(planPasses(loopClip(0, 0, 4), 0).reason, "invalid_passes");
  assert.equal(planPasses(loopClip(0, 0, 4), 9).reason, "invalid_passes");
  assert.equal(planPasses(loopClip(0, 0, Number.NaN), 1).reason, "invalid_markers");
  const none = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 1, quantum: null, bpm: 120 });
  assert.deepEqual(none, { ok: false, reason: "quantization_none" });
  // 1/16 leaves no window once the margin is taken.
  const sixteenth = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 1, quantum: 0.25, bpm: 120 });
  assert.deepEqual(sixteenth, { ok: false, reason: "window_too_short" });
  // 1/4 at 240 BPM: 0.75 beat = 187.5 ms.
  const fast = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 1, quantum: 1, bpm: 240 });
  assert.deepEqual(fast, { ok: false, reason: "window_too_short" });
  assert.equal(ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 1, quantum: 1, bpm: 120 }).ok, true);
});

test("the prediction tells extra repetition from silence", () => {
  assert.deepEqual(predictLanding(4, 4, true), { landingBeats: 4, extraBeats: 0, kind: "exact" });
  assert.deepEqual(predictLanding(2, 4, true), { landingBeats: 4, extraBeats: 2, kind: "repeat" });
  assert.deepEqual(predictLanding(6, 4, false), { landingBeats: 8, extraBeats: 2, kind: "silence" });
  assert.deepEqual(predictLanding(12, 4, true), { landingBeats: 12, extraBeats: 0, kind: "exact" });
  assert.deepEqual(predictLanding(10, 4, true), { landingBeats: 12, extraBeats: 2, kind: "repeat" });
});

test("one pass of a one-bar break goes out as soon as Live confirms it", () => {
  const { decisions, tracker } = simulate({ geometry: loopClip(0, 0, 4), passes: 1, quantum: 4 });
  assert.deepEqual(decisions, [{ kind: "send", late: false, elapsed: 0 }]);
  assert.equal(tracker.diagnostics.prediction.kind, "exact");
});

for (const [label, geometry] of [
  ["start marker on the loop", loopClip(0, 0, 4)],
  ["start marker inside the loop", loopClip(2, 0, 4)],
  ["pre-roll before the loop", loopClip(0, 4, 8)],
]) {
  for (const passes of [1, 2, 3]) {
    test(`return after ${passes} pass(es), ${label}, is sent once inside the last quantum`, () => {
      const quantum = 4;
      const { decisions, tracker } = simulate({ geometry, passes, quantum });
      const total = tracker.plan.total;
      assert.equal(decisions.length, 1, JSON.stringify(decisions));
      const [decision] = decisions;
      assert.equal(decision.kind, "send");
      assert.equal(decision.late, false);
      if (total <= quantum) {
        assert.equal(decision.elapsed, 0);
      } else {
        assert.ok(decision.elapsed >= total - quantum + SEND_MARGIN_BEATS - 1e-9, `sent early at ${decision.elapsed} of ${total}`);
        assert.ok(decision.elapsed < total, `sent late at ${decision.elapsed} of ${total}`);
      }
      // Every loop-end crossing before the send was counted, none invented.
      const { first, loop } = tracker.plan;
      const expectedWraps = decision.elapsed < first ? 0 : 1 + Math.floor((decision.elapsed - first) / loop);
      assert.equal(tracker.diagnostics.wrapsAtSend, expectedWraps);
    });
  }
}

test("a non-loop clip that ends before the window counts as a late return, reported as silence", () => {
  // Quarter-note quantization at 60 BPM, pushes one beat apart: the window
  // [5.25, 6) sits between two pushes and the clip ends at 6.
  const geometry = oneShot(0, 6);
  const { decisions, tracker } = simulate({ geometry, passes: 1, quantum: 1, bpm: 60, step: () => 1 });
  // Push at 5 is not yet in the window; the clip then runs out.
  assert.deepEqual(decisions, [{ kind: "send", late: true, elapsed: 6 }]);
  assert.equal(tracker.diagnostics.prediction.kind, "exact");
  assert.equal(predictLanding(6, 4, false).kind, "silence");
});

test("a missed window late-sends exactly once", () => {
  // Two-bar loop, quarter-note quantization at 60 BPM, one push per beat:
  // the window [7.25, 8) falls between the pushes at 7 and 8.
  const { decisions, tracker } = simulate({ geometry: loopClip(0, 0, 8), passes: 1, quantum: 1, bpm: 60, step: () => 1, until: 14 });
  assert.deepEqual(decisions, [{ kind: "send", late: true, elapsed: 8 }]);
  assert.equal(tracker.diagnostics.late, true);
  assert.equal(tracker.outcome, "sent");
});

test("an invalidated rule never sends a return, late or not", () => {
  const created = ContinuationTracker.create({ geometry: loopClip(0, 0, 8), passes: 1, quantum: 1, bpm: 60 });
  const tracker = created.tracker;
  tracker.confirm();
  assert.equal(tracker.position(1, 1).kind, "none");
  assert.deepEqual(tracker.invalidate("new_choice"), { kind: "cancel", reason: "new_choice" });
  for (let pos = 2; pos < 8; pos++) assert.equal(tracker.position(pos, 1).kind, "none");
  assert.equal(tracker.position(0, 1).kind, "none");
  assert.equal(tracker.naturalEnd().kind, "none");
  assert.equal(tracker.diagnostics.reason, "new_choice");
});

test("invalidation after the return was handed to Live sends nothing more", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 1, quantum: 4, bpm: 120 }).tracker;
  assert.equal(tracker.confirm().kind, "send");
  assert.equal(tracker.invalidate("stopped").kind, "none");
  assert.equal(tracker.confirm().kind, "none");
});

test("pushes too far apart to rule out a whole loop cancel instead of guessing", () => {
  const { decisions, tracker } = simulate({ geometry: loopClip(0, 0, 4), passes: 3, quantum: 4, step: () => 3.5 });
  assert.deepEqual(decisions.map((d) => d.kind === "cancel" ? d.reason : d.kind), ["insufficient_pushes"]);
  assert.equal(tracker.outcome, "cancelled");
});

test("a push without a measurable musical interval cancels instead of guessing", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 2, quantum: 4, bpm: 120 }).tracker;
  tracker.confirm();
  assert.deepEqual(tracker.position(1, null), { kind: "cancel", reason: "insufficient_pushes" });
});

test("a position that matches neither straight play nor one wrap cancels", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 2, quantum: 4, bpm: 120 }).tracker;
  tracker.confirm();
  assert.equal(tracker.position(1, 1).kind, "none");
  // Back to 0.5 after 0.1 beat: no wrap is that short.
  assert.deepEqual(tracker.position(0.5, 0.1), { kind: "cancel", reason: "inconsistent_position" });
});

test("song time running backwards cancels", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 2, quantum: 4, bpm: 120 }).tracker;
  tracker.confirm();
  assert.deepEqual(tracker.position(1, -2), { kind: "cancel", reason: "transport_jump" });
});

test("a looped clip does not end on its own: an end report cancels", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 2, quantum: 4, bpm: 120 }).tracker;
  tracker.confirm();
  assert.deepEqual(tracker.naturalEnd(), { kind: "cancel", reason: "stopped" });
});

test("a confirmation is only accepted once", () => {
  const tracker = ContinuationTracker.create({ geometry: loopClip(0, 0, 4), passes: 2, quantum: 4, bpm: 120 }).tracker;
  assert.equal(tracker.confirm().kind, "none");
  assert.equal(tracker.confirm().kind, "none");
  assert.equal(tracker.position(0.5, 0.5).kind, "none");
});

test("jittered pushes in 4/4 and 3/4 never send early and stay inside the window", () => {
  for (const [numerator, seed] of [[4, 7], [3, 11], [4, 23], [3, 41]]) {
    const quantum = quantumBeats(4, numerator, 4);
    for (const passes of [1, 2, 3]) {
      for (const geometry of [loopClip(0, 0, quantum), loopClip(0, 0, 2 * quantum), loopClip(1, 0, quantum + 1)]) {
        const random = lcg(seed * 31 + passes);
        const { decisions, tracker } = simulate({
          geometry, passes, quantum, bpm: 128,
          step: () => 0.05 + random() * 0.3,
          error: () => (random() - 0.5) * 0.2,
        });
        const total = tracker.plan.total;
        assert.equal(decisions.length, 1, `${numerator}/4 N=${passes} ${JSON.stringify(geometry)} ${JSON.stringify(decisions)}`);
        const [decision] = decisions;
        assert.equal(decision.kind, "send", JSON.stringify({ decision, diag: tracker.diagnostics }));
        assert.equal(decision.late, false);
        if (total > quantum) {
          assert.ok(decision.elapsed >= total - quantum + SEND_MARGIN_BEATS - 1e-9);
          assert.ok(decision.elapsed < total);
        }
      }
    }
  }
});
