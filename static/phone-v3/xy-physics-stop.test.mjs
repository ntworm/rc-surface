// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// The XY 2 puck used to glue itself into a corner. Free flight treated the
// puck as stopped below 0.01, but each of the four wall branches used 0.1 —
// ten times sooner. A corner hit runs the x branch and the y branch in the
// same frame, so both velocities were zeroed at once and the puck parked
// there, while the same speed along a single edge kept travelling.
//
// The fix is one named threshold shared by all six checks. This test guards
// that shape: two different literals is the bug, and it is invisible unless
// something insists they are the same number.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.join(import.meta.dirname, 'controls.js'),
  'utf8',
);

test('the XY puck uses one stop threshold everywhere, walls included', () => {
  const declared = source.match(/const STOP_BELOW = ([\d.]+);/g) || [];
  assert.equal(declared.length, 1, 'exactly one stop threshold may be declared');

  // Every velocity cutoff has to go through it. A bare number here is how the
  // two thresholds drifted apart in the first place.
  const cutoffs = source.match(/Math\.abs\(v[xy]\)\s*<\s*([A-Za-z_$][\w$]*|[\d.]+)/g) || [];
  assert.ok(cutoffs.length >= 6, `expected the six velocity cutoffs, saw ${cutoffs.length}`);
  const literal = cutoffs.filter((c) => /<\s*[\d.]+$/.test(c));
  assert.deepEqual(
    literal,
    [],
    `velocity cutoffs must name the threshold, not inline it: ${literal.join(', ')}`,
  );
  for (const c of cutoffs) {
    assert.match(c, /STOP_BELOW$/, `cutoff "${c}" must use STOP_BELOW`);
  }
});

test('a corner keeps its speed the way a single edge does', () => {
  // A model of the loop in controls.js, not the loop itself: it exists to show
  // why one threshold matters. With a shared cutoff, a puck that reaches a
  // corner at a speed an edge would survive survives the corner too. Under the
  // old split (walls at 0.1, flight at 0.01) the corner killed it.
  const bounce = 0.75;
  const step = (vx, vy, stopAtWall) => {
    let nvx = -vx * bounce;
    let nvy = -vy * bounce;
    if (Math.abs(nvx) < stopAtWall) nvx = 0;
    if (Math.abs(nvy) < stopAtWall) nvy = 0;
    return [nvx, nvy];
  };

  // A speed that clears the flight cutoff after a bounce, but not the old
  // coarse wall cutoff: 0.075 * 0.75 = 0.05625.
  const v = 0.075;

  const [ux, uy] = step(v, v, 0.01);
  assert.ok(ux !== 0 && uy !== 0, 'with one threshold the puck leaves the corner');

  const [ox, oy] = step(v, v, 0.1);
  assert.ok(
    ox === 0 && oy === 0,
    'the old split threshold is what pinned both axes at once',
  );
});
