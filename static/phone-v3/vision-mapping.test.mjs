// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = import.meta.dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function sensorDeck(html) {
  const start = html.indexOf('<div class="vision-sensor-deck');
  const end = html.indexOf('</section>', start);
  assert.ok(start > 0 && end > start, 'VID sensor deck must exist');
  return html.slice(start, end);
}

test('VID lower strip contains only direct MAP and intentional CLUTCH controls', () => {
  const deck = sensorDeck(read('index.html'));
  assert.equal((deck.match(/class="vision-readout-card/g) || []).length, 2);
  assert.match(deck, /<em[^>]*>MAP<\/em>/);
  assert.match(deck, /<em[^>]*>CLUTCH<\/em>/);
  assert.deepEqual(
    Array.from(deck.matchAll(/data-name="([^"]+)"/g), (match) => match[1]),
    [
      'sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z',
      'sensor.vision.palm', 'sensor.vision.face',
      'sensor.vision.pinch_x', 'sensor.vision.pinch_y', 'sensor.vision.pinch_z',
    ],
  );
  assert.doesNotMatch(deck, /FINGERS|GESTURE|AMBIENT|sensor\.vision\.(?:active|fingers|color)/);
});

test('PALM and FACE move into the lower MAP strip with raw readouts', () => {
  const html = read('index.html');
  const cameraStart = html.indexOf('<aside class="vision-camera-stage');
  const cameraEnd = html.indexOf('</aside>', cameraStart);
  const camera = html.slice(cameraStart, cameraEnd);
  assert.doesNotMatch(camera, /id="vision-value-palm"/);
  const deck=sensorDeck(html);
  assert.match(deck, /data-name="sensor\.vision\.palm"[^>]*>PALM <b id="vision-value-palm"/);
  assert.match(deck, /data-name="sensor\.vision\.face"[^>]*>FACE <b id="vision-value-facing"/);
  assert.doesNotMatch(camera, /id="vision-value-facing"/);
  assert.doesNotMatch(camera, /data-name=/);
  assert.doesNotMatch(html, /vision-value-(?:palm-pose|index-curved|other-fingers|handedness)/);
  assert.match(read('style.css'),/\.vision-axis-chips span\[data-name\]\s*\{\s*min-height:\s*44px/);
  assert.match(read('style.css'),/\.vision-readout-card:nth-child\(1\) \.vision-axis-chips\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:\s*var\(--text3\) var\(--surface\)/);
  assert.match(read('style.css'),/\.vision-axis-chips::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*var\(--text3\);\s*border-radius:\s*0/);
});

test('Fingers and passive camera measurements are absent from public mapping surfaces', () => {
  const html = read('index.html');
  const phone = read('mapping-mode.js');
  const app = read('app.js');
  const admin = fs.readFileSync(path.join(root, '..', 'admin', 'mappings-core.js'), 'utf8');

  assert.doesNotMatch(html, /data-vision-gesture="fingers"/);
  assert.match(phone, /MappingInputContract\.getControlGroups\(\)/);
  assert.match(admin, /MappingInputContract\.getControlGroups\(\)/);
  for (const name of [
    'sensor.vision.fingers',
    'sensor.vision.color.r', 'sensor.vision.color.g', 'sensor.vision.color.b',
  ]) {
    const escaped = name.replaceAll('.', '\\.');
    assert.doesNotMatch(phone, new RegExp(`['"]${escaped}['"]`), `${name} phone catalog`);
    assert.doesNotMatch(admin, new RegExp(`['"]${escaped}['"]`), `${name} admin catalog`);
    assert.doesNotMatch(
      app,
      new RegExp(`window\\.onControl\\(\\{ name: ['"]${escaped}['"]`),
      `${name} phone emission`,
    );
  }
});
