// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// curves-inverse.test.mjs — the inverse curve must undo the forward curve.
//
// applyCurve shapes a value (curve, then drive, then compressor) and
// applyCurveInverse has to walk the same steps backwards, so a control can
// pick up from whatever Live already holds. The only lossy step is the drive
// clamp: once the shift pins the value to 0 or 1 the original value is gone
// and nothing can bring it back. Every other input must come back exactly.

import test from "node:test";
import assert from "node:assert/strict";
import { applyCurve, applyCurveInverse } from "../src/live/curves.ts";

const CURVES = ["linear", "exponential", "logarithmic", "s-curve"];
const DRIVES = [-0.3, -0.25, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
const COMPRESSORS = [-0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
const VALUES = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
const TOLERANCE = 1e-9;

/**
 * True when the drive shift did not saturate for this input. Driving with no
 * compressor leaves the shift as the last step, and the shift pins a
 * saturated value to exactly 0 or 1, so a result strictly inside (0,1) means
 * the forward path kept the whole original value.
 */
function keepsInterior(value, curve, drive) {
  const shifted = applyCurve(value, curve, drive, 0);
  return shifted > 0 && shifted < 1;
}

/** Every grid point of one curve whose forward path does not saturate. */
function invertibleCases(curve) {
  const cases = [];
  for (const drive of DRIVES) {
    for (const compressor of COMPRESSORS) {
      for (const value of VALUES) {
        if (!keepsInterior(value, curve, drive)) continue;
        cases.push({ value, curve, drive, compressor });
      }
    }
  }
  return cases;
}

/** How far the inverse lands from the value the forward path started with. */
function roundTripError({ value, curve, drive, compressor }) {
  const forward = applyCurve(value, curve, drive, compressor);
  const back = applyCurveInverse(forward, curve, drive, compressor);
  return Math.abs(back - value);
}

for (const curve of CURVES) {
  test(`applyCurveInverse inverts applyCurve (${curve})`, () => {
    const cases = invertibleCases(curve);
    assert.ok(cases.length > 0, `no invertible case found for curve ${curve}`);
    const broken = cases
      .map((c) => ({ ...c, error: roundTripError(c) }))
      .filter((c) => !(c.error <= TOLERANCE));
    assert.deepEqual(
      broken.slice(0, 3),
      [],
      `applyCurveInverse does not invert applyCurve for curve ${curve}: ${broken.length} of ${cases.length} cases`,
    );
  });
}

test("the forward value of every invertible case stays inside (0,1)", () => {
  for (const curve of CURVES) {
    const saturated = [];
    for (const c of invertibleCases(curve)) {
      const forward = applyCurve(c.value, c.curve, c.drive, c.compressor);
      if (!(forward > 0 && forward < 1)) saturated.push({ ...c, forward });
    }
    assert.deepEqual(
      saturated.slice(0, 3),
      [],
      `the forward path saturates for curve ${curve} where nothing should saturate`,
    );
  }
});

test("the grid keeps the invertible points and drops the saturated ones", () => {
  let kept = 0;
  let dropped = 0;
  for (const curve of CURVES) {
    for (const drive of DRIVES) {
      for (const value of VALUES) {
        if (keepsInterior(value, curve, drive)) kept += 1;
        else dropped += 1;
      }
    }
  }
  assert.ok(kept > 0, "the grid must keep invertible points");
  assert.ok(dropped > 0, "the grid must hold saturated points to drop");
});

test("a saturated drive pins the forward path to 0 or 1", () => {
  // The exponential curve of 0.05 is 0.0025, so a drive of -0.3 pushes it
  // below zero: the shift clamps, and the original value is unrecoverable.
  const forward = applyCurve(0.05, "exponential", -0.3, 0);
  assert.equal(forward, 0);
  assert.equal(keepsInterior(0.05, "exponential", -0.3), false);
  // The exponential curve of 0.8 is 0.64, which a drive of -0.3 leaves at
  // 0.34: strictly inside (0,1), so the forward path keeps every bit.
  assert.equal(keepsInterior(0.8, "exponential", -0.3), true);
});
