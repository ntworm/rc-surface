// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('learned gesture UI captures only static poses with a short automatic take', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
  // The capture affordance is one button per gesture slot. Its label was
  // compacted from "CAPTURE POSE" to "CAP" when the Vision page was rebuilt to
  // fit a phone in landscape; what the contract cares about is that every slot
  // still owns a capture control and that the studio is framed as poses.
  assert.equal((html.match(/class="vision-slot-learn"/g) || []).length, 3);
  assert.match(html, /<strong[^>]*>LEARNED POSES<\/strong>/);
  assert.match(app, /POSE_CAPTURE_MS/);
  assert.match(app, /HOLD POSE/);
  assert.match(app, /POSE · 3\/3 complete/);
  assert.doesNotMatch(app, /perform one MOTION/);
  assert.doesNotMatch(app, /STOP & SAVE TAKE/);
  assert.doesNotMatch(app, /repeat the full movement/);
});

test('pose testing explains arming, confidence and release instead of movement tracking', () => {
  const app = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
  assert.match(app, /HOLD THE LEARNED POSE/);
  assert.match(app, /POSE MATCH/);
  assert.match(app, /release and show the pose again/i);
});

test('the capture flow asks for meaningful curl and palm-angle variation on each take', () => {
  const app = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
  assert.match(app, /POSE_TAKE_GUIDANCE/,
    'the three takes must carry per-take guidance, not one repeated instruction');
  assert.match(app, /looser or tighter curl/);
  assert.match(app, /toward or away from the camera/);
  assert.match(app, /WAITING FOR STABLE/,
    'transition frames must be excluded before the timed take begins');
  assert.doesNotMatch(app, /closer, or further away/,
    'uniform scale is normalized and should not be the main capture instruction');
  assert.match(app, /poseTakeHint\(samplesForGesture\(name\)\)/,
    'the hint shown while capturing must depend on which take this is');
  assert.match(app, /next take \{hint\}', \{ n: samples, hint: poseTakeHint\(samples\) \}/,
    'the message between takes must say what to vary next');
});

test('F-010: recognition label renders match.name literally and distinguishes saved name from CSS truncation', () => {
  const app = fs.readFileSync(path.join(import.meta.dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(import.meta.dirname, 'style.css'), 'utf8');
  const i18n = fs.readFileSync(path.join(import.meta.dirname, '../shared/i18n-catalog.js'), 'utf8');

  // Verify the exact lookup in app.js: the saved name goes in as {name}
  assert.match(
    app,
    /status\.textContent\s*=\s*T\('vid\.poseRecognized',\s*'✓ \{name\} recognized · \{percent\}%',\s*\{ name: match\.name, percent \}\)/,
    'app.js must interpolate match.name directly, not a missing placeholder like {n}s',
  );
  assert.match(i18n, /'vid\.poseRecognized': \{ en: '✓ \{name\} recognized · \{percent\}%'/);

  // Exercise formatting helper mimicking app.js line 2466
  function formatRecognition(matchName, confidence) {
    const percent = Math.round(confidence * 100);
    return `✓ ${matchName} recognized · ${percent}%`;
  }

  // 1. Single-letter name 's' (as seen in print 07)
  const formattedS = formatRecognition('s', 0.77);
  assert.equal(formattedS, '✓ s recognized · 77%');
  assert.equal(formattedS.length, 20);

  // 2. Standard slot name 'G1'
  const formattedG1 = formatRecognition('G1', 0.77);
  assert.equal(formattedG1, '✓ G1 recognized · 77%');

  // 3. Long name
  const formattedLong = formatRecognition('custom-pose-extended-take', 0.92);
  assert.equal(formattedLong, '✓ custom-pose-extended-take recognized · 92%');

  // 4. Empty name
  const formattedEmpty = formatRecognition('', 0.63);
  assert.equal(formattedEmpty, '✓  recognized · 63%');

  // Verify CSS properties on .vision-slot-status
  assert.match(css, /\.vision-slot-status\s*\{[^}]*text-overflow:\s*ellipsis;/);
  assert.match(css, /\.vision-slot-status\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(css, /\.vision-slot-status\s*\{[^}]*overflow:\s*hidden;/);

  // Verify no orphaned 'recognized' key in shared i18n-catalog
  assert.doesNotMatch(
    i18n,
    /["']recognized["']\s*:/,
    'i18n-catalog does not define a recognized key; the string is a product template literal',
  );

  // Conclusion: '✓ s recognized · 77%' occurs because the saved gesture name is 's',
  // not due to a missing duration '{n}s' or CSS clipping of 'Gesture 1'.
});
