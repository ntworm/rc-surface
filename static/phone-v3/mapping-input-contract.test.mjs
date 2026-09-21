// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.join(import.meta.dirname, 'mapping-input-contract.js');
const context = { window: null };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/audio-descriptor-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, {
  filename: 'mapping-input-contract.js',
});

const {
  normalizeValue,
  normalizeControl,
  getControlGroups,
  profiles,
} = context.MappingInputContract;

test('MIX offers eight stable knobs and faders in the mapping catalog and templates', () => {
  vm.runInContext(fs.readFileSync(path.join(import.meta.dirname, '../panel/templates.js'), 'utf8'), context);
  for (const kind of ['knob', 'fader']) {
    const group = getControlGroups().find((group) => group.items.includes(`${kind}-1`));
    assert.deepEqual(Array.from(group.items), Array.from({ length: 8 }, (_, i) => `${kind}-${i + 1}`));
    for (let i = 1; i <= 8; i += 1) {
      assert.equal(normalizeControl({ name: `${kind}-${i}`, value: 0.37 }).value, 0.37);
      const template = context.MappingTemplates[kind === 'knob' ? 'instrument-macro' : 'mixer-8'];
      assert.equal(template.mappings[`${kind}-${i}`][0][kind === 'knob' ? 'paramIndex' : 'trackIndex'], kind === 'knob' ? i : i - 1);
    }
  }
  assert.equal(Object.keys(context.MappingTemplates['mixer-6'].mappings).filter((k) => k.startsWith('fader-')).length, 6,
    'the old six-track template remains compatible');
});







test('already normalized controls are finite and clamped', () => {
  assert.equal(normalizeValue('sensor.audio.rms', -2), 0);
  assert.equal(normalizeValue('sensor.audio.rms', 0.42), 0.42);
  assert.equal(normalizeValue('sensor.audio.rms', 3), 1);
  assert.equal(normalizeValue('sensor.audio.rms', Infinity), null);
  assert.equal(normalizeValue('sensor.audio.rms', 'not-a-number'), null);
});

test('control events are cloned and normalized before entering shared mapping state', () => {
  const raw = { name: 'sensor.audio.centroid', value: 0.31, source: 'microphone' };
  const normalized = normalizeControl(raw);

  assert.notEqual(normalized, raw);
  assert.equal(raw.value, 0.31, 'raw display/analysis data must remain untouched');
  assert.ok(normalized.value > 0 && normalized.value < 1);
  assert.equal(normalized.source, 'microphone');

  const xy = normalizeControl({ name: 'xy-1', x: -0.5, y: 1.4 });
  assert.deepEqual({ x: xy.x, y: xy.y }, { x: 0, y: 1 });
});

test('invalid numeric events become signal loss instead of mapping values', () => {
  const normalized = normalizeControl({ name: 'sensor.audio.centroid', value: NaN });
  assert.equal(normalized.lost, true);
  assert.equal(normalized.value, 0);
});

test('the public VID catalog contains only deliberate performance controls', () => {
  const vision = getControlGroups().find((group) => group.group === 'Sensors: Vision');
  assert.deepEqual(Array.from(vision.items), [
    'sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z',
    'sensor.vision.fist', 'sensor.vision.pinch', 'sensor.vision.victory',
    'sensor.vision.rotateVal', 'sensor.vision.open',
    'sensor.vision.pinch_x', 'sensor.vision.pinch_y', 'sensor.vision.pinch_z',
    'sensor.vision.gesture.1', 'sensor.vision.gesture.2', 'sensor.vision.gesture.3',
  ]);
});

test('the public audio catalog exposes all twelve normalized descriptor controls', () => {
  const audio = getControlGroups().find((group) => group.group === 'Sensors: Audio');
  for (const name of [
    'sensor.audio.transient',
    'sensor.audio.kick',
    'sensor.audio.snare',
    'sensor.audio.brightness',
    ...['centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high'].map((field) => 'sensor.audio.' + field),
  ]) {
    assert.ok(Array.from(audio.items).includes(name), `${name} missing from phone mapping catalog`);
    assert.equal(normalizeValue(name, -1), 0);
    assert.equal(normalizeValue(name, 2), 1);
  }
  assert.equal(profiles['sensor.audio.transient'].kind, 'momentary');
  assert.equal(profiles['sensor.audio.kick'].kind, 'momentary');
  assert.equal(profiles['sensor.audio.snare'].kind, 'momentary');
  assert.equal(profiles['sensor.audio.brightness'].kind, 'continuous');
});
