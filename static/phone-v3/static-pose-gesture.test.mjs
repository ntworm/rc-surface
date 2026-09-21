// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function load() {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'safe-input-layer.js'), 'utf8');
  const context = { window: null, globalThis: null };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.SafeInputLayer;
}

// A hand whose fingers CURL. `e = 1` is extended, `e = 0` brings the tip back
// beside its own knuckle, which is what a finger does when it closes.
//
// The previous fixture folded a finger by scaling its length toward the wrist.
// That reads as a finger passing THROUGH its own knuckle and out the other
// side: at e = 0.42 the tip sat above the MCP, the knuckle-to-tip vector
// flipped, and the spread angle jumped 180 degrees between two poses that
// should differ slightly. Two conclusions were drawn from that fixture and
// both were wrong, so it is measured geometry now, calibrated so a folded
// finger reads about 0.30 of a palm from its knuckle and an extended one
// about 0.95 — the values RC MediaPipe recorded from real takes.
function handPose({ thumb = 0.5, index = 1, middle = 1, ring = 1, pinky = 1 } = {}) {
  const L = new Array(21);
  const P = (i, x, y) => { L[i] = { x, y, z: 0 }; };
  P(0, 0.50, 0.90);
  const a0 = thumb * (-2.30) + (1 - thumb) * 0.35;
  const a1 = a0 + (1 - thumb) * (Math.PI * 0.92);
  P(1, 0.445, 0.825);
  P(2, 0.405, 0.762);
  P(3, 0.405 + Math.cos(a0) * 0.100, 0.762 + Math.sin(a0) * 0.100);
  P(4, L[3].x + Math.cos(a1) * 0.092, L[3].y + Math.sin(a1) * 0.092);
  const columns = [[5, 0.42], [9, 0.48], [13, 0.54], [17, 0.60]];
  const extension = [index, middle, ring, pinky];
  const segments = [
    [0.105, 0.090, 0.070], [0.110, 0.095, 0.072],
    [0.100, 0.088, 0.068], [0.085, 0.072, 0.058],
  ];
  columns.forEach(([base, x], column) => {
    const e = extension[column];
    const seg = segments[column];
    P(base, x, 0.62);
    let px = x;
    let py = 0.62;
    let angle = -Math.PI / 2;
    const bend = (1 - e) * (Math.PI * 1.72);
    const share = [0.42, 0.34, 0.24];
    for (let joint = 0; joint < 3; joint += 1) {
      angle += bend * share[joint];
      px += Math.cos(angle) * seg[joint];
      py += Math.sin(angle) * seg[joint];
      P(base + 1 + joint, px, py);
    }
  });
  return L;
}

function transform(landmarks, { scale = 1, x = 0, y = 0, z = 0 } = {}) {
  return landmarks.map((point) => ({
    x: point.x * scale + x,
    y: point.y * scale + y,
    z: point.z * scale + z,
  }));
}

function transform2D(landmarks, { scale = 1, x = 0, y = 0, radians = 0, z = 0 } = {}) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return landmarks.map((point) => ({
    x: (point.x * c - point.y * s) * scale + x,
    y: (point.x * s + point.y * c) * scale + y,
    z: point.z + z,
  }));
}

function frames(descriptor, count = 8, jitter = 0.002) {
  return Array.from({ length: count }, (_, frame) => descriptor.map((value, index) =>
    value + Math.sin(frame * 1.7 + index * 0.31) * jitter));
}

test('normalizes all 21 MediaPipe landmarks independently of screen position and hand scale', () => {
  const { normalizeHandPose, poseDistance } = load();
  assert.equal(typeof normalizeHandPose, 'function');
  const pose = handPose({ thumb: 1, index: 1, middle: 0.25, ring: 0.2, pinky: 0.2 });
  const original = normalizeHandPose(transform(pose, { scale: 0.2, x: 0.15, y: 0.7, z: -0.1 }));
  const moved = normalizeHandPose(transform(pose, { scale: 0.75, x: 0.8, y: 0.1, z: 0.4 }));
  // 42 positional coordinates plus the 5-value articulation block.
  assert.equal(original.length, 47);
  assert.ok(poseDistance(original, moved) < 0.001);
});

test('static pose ignores depth and tolerates modest wrist rotation', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 });
  const library = new GestureLibrary({ holdMs: 0, minimumConfidence: 0.5 });
  for (const jitter of [-0.004, 0, 0.004]) {
    const sample = normalizeHandPose(transform2D(pose, { x: jitter }));
    library.learn('Gesture 1', frames(sample, 8, 0.002));
  }
  const liveLandmarks = transform2D(pose, {
    scale: 1.7,
    x: 0.31,
    y: -0.22,
    radians: Math.PI / 15,
  }).map((point, index) => ({ ...point, z: Math.sin(index * 1.9) * 0.8 }));
  const live = normalizeHandPose(liveLandmarks);
  assert.equal(library.evaluate(live)?.accepted, true);
});

test('version 7 spatial pose samples request recapture instead of appearing ready', () => {
  const { GestureLibrary } = load();
  const restored = GestureLibrary.fromJSON({
    version: 7,
    templates: [{ name: 'Gesture 1', kind: 'pose', samples: [Array(63).fill(0)] }],
  });
  assert.deepEqual(Array.from(restored.getIncompatibleNames()), ['Gesture 1']);
  assert.equal(restored.sampleCount('Gesture 1'), 0);
});

test('learns a static hand pose from three stable takes and rejects a different pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const thumbsUp = normalizeHandPose(handPose({ thumb: 1, index: 0.2, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 200 });
  lib.learn('Gesture 1', frames(gun, 8, 0.002));
  lib.learn('Gesture 1', frames(gun, 8, 0.003));
  lib.learn('Gesture 1', frames(gun, 8, 0.004));

  assert.equal(lib.kind('Gesture 1'), 'pose');
  assert.equal(lib.evaluate(gun).accepted, true);
  assert.equal(lib.evaluate(thumbsUp).accepted, false);
});

test('requires a stable pose, fires once, and rearms only after release', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 200, releaseMs: 150 });
  for (let take = 0; take < 3; take += 1) lib.learn('Gesture 1', frames(gun));

  assert.equal(lib.recognize(gun, 0), null);
  assert.equal(lib.recognize(gun, 100), null);
  assert.equal(lib.recognize(gun, 210)?.name, 'Gesture 1');
  assert.equal(lib.recognize(gun, 500), null, 'holding the pose must not repeat');
  assert.equal(lib.recognize(open, 550), null);
  assert.equal(lib.recognize(open, 720), null);
  assert.equal(lib.recognize(gun, 800), null);
  assert.equal(lib.recognize(gun, 1010)?.name, 'Gesture 1');
});

test('a held pose does not rearm while its score drifts across the acquisition cutoff', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const mildDrift = gun.map((value) => value + 0.14);
  const clearRelease = gun.map((value) => value + 0.30);
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 0, releaseMs: 150 });
  for (let take = 0; take < 3; take += 1) lib.learn('Gesture 1', frames(gun));

  assert.equal(lib.recognize(gun, 0)?.name, 'Gesture 1');
  assert.equal(lib.evaluate(mildDrift).accepted, false, 'drift is outside the acquisition cutoff');
  assert.equal(lib.recognize(mildDrift, 100), null);
  assert.equal(lib.recognize(mildDrift, 260), null);
  assert.equal(lib.recognize(gun, 261), null, 'mild drift must not rearm a continuously held pose');

  assert.equal(lib.recognize(clearRelease, 300), null);
  assert.equal(lib.recognize(clearRelease, 451), null);
  assert.equal(lib.recognize(gun, 452)?.name, 'Gesture 1', 'a clear release must still rearm immediately');
});

test('uses the median of three pose examples and persists only the static format', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 0 });
  lib.learn('Gesture 1', frames(gun));
  lib.learn('Gesture 1', frames(gun, 8, 0.004));
  lib.learn('Gesture 1', frames(open));
  assert.equal(lib.evaluate(gun).accepted, true);

  const saved = lib.toJSON();
  assert.equal(saved.version, 8);
  assert.equal(saved.templates[0].kind, 'pose');
  const restored = GestureLibrary.fromJSON(saved, { threshold: 0.13, minimumConfidence: 0.55, holdMs: 0 });
  assert.equal(restored.evaluate(gun).accepted, true);

  const legacy = GestureLibrary.fromJSON({
    version: 6,
    templates: [{ name: 'Gesture 1', samples: [[{ x: 0, y: 0, z: 0 }]], kind: 'motion' }],
  });
  assert.equal(legacy.sampleCount('Gesture 1'), 0);
});

test('rejects an unstable capture instead of learning hand movement as a pose', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const gun = normalizeHandPose(handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const lib = new GestureLibrary({ captureStabilityThreshold: 0.08 });
  assert.throws(() => lib.learn('Gesture 1', [gun, open, gun, open, gun]), /hold the pose still/i);
});

test('takes captured with variation accept the gesture repeated loosely, without accepting a different one', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  // The rock: thumb, index and pinky out; middle and ring folded in. The two
  // folded fingers are the ones the performer cannot reproduce identically,
  // and they are exactly what defines the gesture.
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));

  const tight = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  const varied = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });

  // Three takes in the same spot, the way the capture flow used to ask for.
  for (let take = 0; take < 3; take += 1) tight.learn('Rock', frames(rock(0.20, 0.20)));

  // Three takes with the folded fingers curled slightly differently each time,
  // which is what actually happens when a person repeats a gesture.
  varied.learn('Rock', frames(rock(0.16, 0.18)));
  varied.learn('Rock', frames(rock(0.20, 0.20)));
  varied.learn('Rock', frames(rock(0.26, 0.24)));

  // A fourth attempt, curled looser than any of the three takes — the case
  // the performer complains about: same gesture, done a bit differently.
  const attempt = rock(0.42, 0.36);

  // The tolerance arrives through the weighting, not through a wider radius:
  // the dimensions the performer cannot hold steady are discounted, so the
  // same variation scores far closer without the acceptance radius moving.
  assert.equal(tight.evaluate(attempt).accepted, false,
    'three identical takes demand the pose be reproduced exactly');
  assert.equal(varied.evaluate(attempt).accepted, true,
    'takes captured with variation accept the same gesture curled differently');
  assert.ok(varied.evaluate(attempt).score < tight.evaluate(attempt).score * 0.75,
    'the same hand scores markedly closer once the gesture knows its own spread');

  // Tolerance must not be bought with discrimination. The near neighbour is
  // the same gesture missing one finger, and it must still be turned away.
  const withoutThumb = normalizeHandPose(
    handPose({ thumb: 0.15, index: 1, middle: 0.20, ring: 0.20, pinky: 1 }));
  const open = normalizeHandPose(handPose());
  const fist = normalizeHandPose(
    handPose({ thumb: 0.15, index: 0.15, middle: 0.15, ring: 0.15, pinky: 0.15 }));
  assert.equal(varied.evaluate(withoutThumb).accepted, false, 'the rock without a thumb is not the rock');
  assert.equal(varied.evaluate(open).accepted, false, 'an open hand is still rejected');
  assert.equal(varied.evaluate(fist).accepted, false, 'a closed fist is still rejected');
});

test('the learned spread survives a save and reload, and an older save still loads', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const lib = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  lib.learn('Rock', frames(rock(0.16, 0.18)));
  lib.learn('Rock', frames(rock(0.20, 0.20)));
  lib.learn('Rock', frames(rock(0.26, 0.24)));

  const saved = lib.toJSON();
  assert.equal(saved.version, 8, 'the format version does not move, so nothing needs relearning');
  assert.equal(saved.templates[0].spread.length, 47);

  const restored = GestureLibrary.fromJSON(saved, { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  assert.equal(restored.thresholdFor('Rock'), lib.thresholdFor('Rock'),
    'the calibrated radius is restored, not recomputed from nothing');
  assert.equal(restored.evaluate(rock(0.31, 0.27)).accepted, true);

  // A save written before spread existed carries no such field and must still load.
  const older = GestureLibrary.fromJSON(
    { version: 8, templates: [{ name: 'Rock', kind: 'pose', samples: saved.templates[0].samples }] },
    { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  assert.equal(older.sampleCount('Rock'), 3, 'a spreadless save still loads its samples');
});

test('each take has equal weight even when devices deliver different frame counts', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const takes = [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.26, 0.24)];
  const learn = (counts) => {
    const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
    takes.forEach((descriptor, index) => library.learn('Rock', frames(descriptor, counts[index], 0)));
    return Array.from(library.toJSON().templates[0].spread);
  };

  const even = learn([8, 8, 8]);
  const uneven = learn([8, 80, 8]);
  assert.ok(even.some((value) => value > 0), 'the three distinct takes must teach a non-zero spread');
  assert.ok(
    even.every((value, index) => Math.abs(value - uneven[index]) < 1e-12),
    'a high-FPS take must not outweigh the other two',
  );
});

test('remove after reload rebuilds tolerance from the two retained takes and the replacement', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const options = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const original = new GestureLibrary(options);
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.26, 0.24)]) {
    original.learn('Rock', frames(descriptor, 8, 0));
  }

  const restored = GestureLibrary.fromJSON(original.toJSON(), options);
  assert.equal(restored.removeLast('Rock'), 2);
  restored.learn('Rock', frames(rock(0.32, 0.29), 32, 0));

  const fresh = new GestureLibrary(options);
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.32, 0.29)]) {
    fresh.learn('Rock', frames(descriptor, 8, 0));
  }
  const restoredSpread = Array.from(restored.toJSON().templates[0].spread);
  const freshSpread = Array.from(fresh.toJSON().templates[0].spread);
  assert.ok(
    restoredSpread.every((value, index) => Math.abs(value - freshSpread[index]) < 1e-12),
    'retaking after reload must be equivalent to learning those same three takes fresh',
  );
});

test('delete removes every learned statistic before the same gesture name is relearned', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = (thumb, index, middle, ring, pinky) => normalizeHandPose(
    handPose({ thumb, index, middle, ring, pinky }));
  const options = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const reused = new GestureLibrary(options);
  for (const descriptor of [
    pose(1, 1, 0.16, 0.18, 1),
    pose(1, 1, 0.20, 0.20, 1),
    pose(1, 1, 0.26, 0.24, 1),
  ]) reused.learn('Gesture 1', frames(descriptor, 8, 0));
  assert.equal(reused.delete('Gesture 1'), true);

  const replacementTakes = [
    pose(1, 0.16, 0.18, 0.18, 0.18),
    pose(1, 0.20, 0.20, 0.20, 0.20),
    pose(1, 0.28, 0.25, 0.24, 0.23),
  ];
  for (const descriptor of replacementTakes) reused.learn('Gesture 1', frames(descriptor, 8, 0));
  const fresh = new GestureLibrary(options);
  for (const descriptor of replacementTakes) fresh.learn('Gesture 1', frames(descriptor, 8, 0));

  const reusedSpread = Array.from(reused.toJSON().templates[0].spread);
  const freshSpread = Array.from(fresh.toJSON().templates[0].spread);
  assert.ok(
    reusedSpread.every((value, index) => Math.abs(value - freshSpread[index]) < 1e-12),
    'deleted frames and thresholds must not influence a gesture learned under the same name',
  );
  assert.equal(reused.thresholdFor('Gesture 1'), fresh.thresholdFor('Gesture 1'));
});

test('a calibrated gesture radius follows later recognition preset changes', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  for (const descriptor of [rock(0.16, 0.18), rock(0.20, 0.20), rock(0.28, 0.25)]) {
    library.learn('Rock', frames(descriptor, 8, 0));
  }

  const learnedFactor = library.thresholdFor('Rock') / library.threshold;
  library.threshold = 0.20;
  assert.ok(
    Math.abs(library.thresholdFor('Rock') - 0.20 * learnedFactor) < 1e-12,
    'switching to Flexible must scale an already learned gesture immediately',
  );
  library.threshold = 0.11;
  assert.ok(
    Math.abs(library.thresholdFor('Rock') - 0.11 * learnedFactor) < 1e-12,
    'switching to Precision must tighten that same learned gesture immediately',
  );
});

test('TEST scores every learned gesture and rejects the same ambiguity as Live', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 1 }));
  const library = new GestureLibrary({ threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });
  for (const name of ['Gesture 1', 'Gesture 2']) {
    for (let take = 0; take < 3; take += 1) library.learn(name, frames(pose, 8, 0));
  }

  const live = library.evaluate(pose);
  const testMode = library.evaluate(pose, 'Gesture 1');
  assert.equal(live.ambiguous, true);
  assert.equal(live.accepted, false);
  assert.equal(testMode.ambiguous, true, 'TEST must not hide a competing learned gesture');
  assert.equal(testMode.accepted, false, 'a pose rejected by Live cannot pass TEST');
  assert.equal(testMode.candidates.length, 2, 'TEST must show all competing candidates');
});

test('one short missing-hand interval does not restart the gesture hold timer', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 120,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(null, 80), null);
  assert.equal(library.recognize(pose, 170)?.name, 'Gesture 1',
    'a 90 ms detector dropout should retain the stable hold started at 0 ms');
});

test('a missing-hand interval beyond the grace period restarts acquisition', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 100,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(null, 40), null);
  assert.equal(library.recognize(null, 150), null);
  assert.equal(library.recognize(pose, 170), null,
    'returning after a long dropout must start a fresh hold');
  assert.equal(library.recognize(pose, 340)?.name, 'Gesture 1');
});

test('a visible different pose still cancels acquisition immediately', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const pose = normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle: 0.2, ring: 0.2, pinky: 0.2 }));
  const open = normalizeHandPose(handPose());
  const library = new GestureLibrary({
    threshold: 0.13,
    minimumConfidence: 0.45,
    holdMs: 160,
    unknownGraceMs: 200,
  });
  for (let take = 0; take < 3; take += 1) library.learn('Gesture 1', frames(pose));

  assert.equal(library.recognize(pose, 0), null);
  assert.equal(library.recognize(open, 80), null);
  assert.equal(library.recognize(pose, 170), null,
    'grace applies to missing tracking, not a contradictory visible pose');
  assert.equal(library.recognize(pose, 340)?.name, 'Gesture 1');
});

test('the articulation block sharpens the near neighbour without costing tolerance', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));
  const positionalOnly = (d) => d.slice(0, 42);

  const opts = { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 };
  const build = (trim) => {
    const lib = new GestureLibrary(opts);
    for (const take of [rock(0.10, 0.12), rock(0.16, 0.15), rock(0.24, 0.20)]) {
      lib.learn('Rock', frames(trim ? positionalOnly(take) : take));
    }
    return lib;
  };
  const flat = build(true);
  const hybrid = build(false);

  // Same gesture done with a looser curl: both accept it, so the articulation
  // block is not bought at the cost of tolerance.
  const looser = rock(0.42, 0.36);
  assert.equal(flat.evaluate(positionalOnly(looser)).accepted, true);
  assert.equal(hybrid.evaluate(looser).accepted, true);

  // The hard neighbour is the same gesture with the thumb tucked away. It is
  // what the opposition dimension exists to separate, and the margin against
  // it is where the block earns its place.
  const withoutThumb = normalizeHandPose(
    handPose({ thumb: 0, index: 1, middle: 0.16, ring: 0.15, pinky: 1 }));
  const flatMargin = flat.evaluate(positionalOnly(withoutThumb)).score
    / flat.thresholdFor('Rock');
  const hybridMargin = hybrid.evaluate(withoutThumb).score
    / hybrid.thresholdFor('Rock');
  assert.ok(flatMargin > 1, 'positional alone already rejects it, but only just');
  assert.ok(hybridMargin > flatMargin * 1.25,
    `articulation must widen the margin: ${flatMargin.toFixed(2)} -> ${hybridMargin.toFixed(2)}`);
});

test('a save written before the articulation block still loads and still matches', () => {
  const { GestureLibrary, normalizeHandPose } = load();
  const rock = (middle, ring) => normalizeHandPose(
    handPose({ thumb: 1, index: 1, middle, ring, pinky: 1 }));

  // An old save carries 42-long samples and no articulation. Nothing about
  // this change may force a gesture to be taught again.
  const legacySamples = [rock(0.10, 0.12), rock(0.16, 0.15), rock(0.24, 0.20)]
    .map((d) => d.slice(0, 42));
  const restored = GestureLibrary.fromJSON(
    { version: 8, templates: [{ name: 'Rock', kind: 'pose', samples: legacySamples }] },
    { threshold: 0.13, minimumConfidence: 0.45, holdMs: 0 });

  assert.equal(restored.sampleCount('Rock'), 3, 'a 42-long save still loads');
  // And a live frame, which now carries articulation, still matches it: the
  // comparison uses only the dimensions both sides have.
  assert.equal(restored.evaluate(rock(0.20, 0.18)).accepted, true);
});
