import test from 'node:test';
import assert from 'node:assert/strict';
import { getLfoSubdivision } from '../src/live/transport-clock.ts';

test('Auto covers straight, dotted and triplet intervals at 120 BPM within 4Hz', () => {
  // After P02 adds 32/16/8 beats (8/4/2 bars) at the start of LFO_SUBDIVISIONS,
  // the 10-rate sweep maps to the indices that fall under the new length (25).
  // Directly observed via getLfoSubdivision((i+0.5)/10, 120) on the new table:
  const expected = [32, 16, 4, 3, 8/3, 1.5, 4/3, 1, 2/3, .5];
  expected.forEach((division, i) => assert.equal(getLfoSubdivision((i + .5) / 10, 120), division));
});

test('Auto reaches 32 beats (8 bars) at low rate across tempos within 4Hz', () => {
  // rate 0 must select the slowest subdivision the ceiling allows: 32 beats at any tempo where
  // bps/32 <= maxHz(shape). For sine (maxHz=4) that's any tempo up to 120 BPM; at 200 BPM,
  // bps = 10/3, 10/3 / 32 = 0.104 Hz, still <= 4, so 32 beats is reachable.
  for (const bpm of [60, 120, 200]) {
    assert.equal(getLfoSubdivision(0, bpm), 32, `rate 0 at ${bpm} BPM must land on 32 beats`);
  }
});

test('legacy and new pinned rhythms remain capped at varied tempos', () => {
  for (const bpm of [30, 60, 120, 300]) {
    for (const pin of [4, 3, 8/3, 2, 1.5, 4/3, 1, .75, 2/3, .5, .25, .03125]) {
      const result = getLfoSubdivision(.5, bpm, pin);
      // sine ceiling is now 4 Hz (fallback for teto_efetivo ≈ 50 escritas/s; write-ceiling P04 pendente).
      assert.ok(bpm / 60 / result <= 4);
      assert.ok(result >= pin);
    }
  }
});
