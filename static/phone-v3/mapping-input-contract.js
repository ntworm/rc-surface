// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Canonical mapping boundary for the phone surface. Human-facing readouts keep
// their raw units, but every value that enters shared mapping state is finite
// and normalized to 0..1.

(function (root) {
  'use strict';

  const profiles = Object.freeze({
    'sensor.audio.transient': Object.freeze({ kind: 'momentary', min: 0, max: 1, scale: 'linear' }),
    'sensor.audio.kick': Object.freeze({ kind: 'momentary', min: 0, max: 1, scale: 'linear' }),
    'sensor.audio.snare': Object.freeze({ kind: 'momentary', min: 0, max: 1, scale: 'linear' }),
    'sensor.audio.brightness': Object.freeze({ kind: 'continuous', min: 0, max: 1, scale: 'linear' }),
  });

  const controlGroups = Object.freeze([
    Object.freeze({ group: 'Pads', items: Object.freeze(Array.from({ length: 12 }, (_, i) => `pad-${i + 1}`)) }),
    Object.freeze({ group: 'XY Pads', items: Object.freeze(['xy-1.x', 'xy-1.y', 'xy-2.x', 'xy-2.y']) }),
    Object.freeze({ group: 'LFOs (1-4)', items: Object.freeze(['toggle-1', 'toggle-2', 'toggle-3', 'toggle-4']) }),
    Object.freeze({ group: 'Stutters (Buttons 1-4)', items: Object.freeze(['button-1', 'button-2', 'button-3', 'button-4']) }),
    Object.freeze({ group: 'Mix Knobs (1-8)', items: Object.freeze(Array.from({ length: 8 }, (_, i) => `knob-${i + 1}`)) }),
    Object.freeze({ group: 'Mix Faders (1-8)', items: Object.freeze(Array.from({ length: 8 }, (_, i) => `fader-${i + 1}`)) }),
    Object.freeze({
      group: 'Sensors: Orientation + Motion',
      items: Object.freeze([
        'sensor.orient.alpha', 'sensor.orient.beta', 'sensor.orient.gamma',
        'sensor.motion.ax', 'sensor.motion.ay', 'sensor.motion.az',
        'sensor.motion.gx', 'sensor.motion.gy', 'sensor.motion.gz',
      ]),
    }),
    Object.freeze({
      group: 'Sensors: Audio',
      items: Object.freeze([
        'sensor.audio.rms',
        'sensor.audio.envelope', 'sensor.audio.gate', 'sensor.audio.attack',
        'sensor.audio.transient', 'sensor.audio.kick', 'sensor.audio.snare',
        'sensor.audio.brightness',
      ]),
    }),
    Object.freeze({
      group: 'Sensors: Vision',
      items: Object.freeze([
        'sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z',
        'sensor.vision.fist', 'sensor.vision.pinch', 'sensor.vision.victory',
        'sensor.vision.rotateVal', 'sensor.vision.open',
        'sensor.vision.pinch_x', 'sensor.vision.pinch_y', 'sensor.vision.pinch_z',
        'sensor.vision.gesture.1', 'sensor.vision.gesture.2', 'sensor.vision.gesture.3',
      ]),
    }),
  ]);

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function normalizeValue(_name, raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;

    return clamp01(value);
  }

  function normalizeControl(control) {
    if (!control || typeof control !== 'object') return control;
    const normalized = { ...control };
    const name = typeof control.name === 'string' ? control.name : '';

    if (control.x !== undefined && control.y !== undefined) {
      const x = normalizeValue(`${name}.x`, control.x);
      const y = normalizeValue(`${name}.y`, control.y);
      if (x === null || y === null) {
        normalized.x = 0;
        normalized.y = 0;
        normalized.lost = true;
      } else {
        normalized.x = x;
        normalized.y = y;
      }
    } else if (control.value !== undefined) {
      const value = normalizeValue(name, control.value);
      if (value === null) {
        normalized.value = 0;
        normalized.lost = true;
      } else {
        normalized.value = value;
      }
    }

    return normalized;
  }

  function getControlGroups() {
    // Resolve the current catalog when consumed, after the surface's script
    // includes. Standalone/legacy consumers retain the original four entries.
    const audioDescriptors = root.AudioDescriptorCatalog?.map(({ name }) => name) || [];
    return controlGroups.map((entry) => ({
      group: entry.group,
      items: Array.from(new Set([...entry.items, ...(entry.group === 'Sensors: Audio' ? audioDescriptors : [])])),
    }));
  }

  root.MappingInputContract = Object.freeze({
    profiles,
    clamp01,
    normalizeValue,
    normalizeControl,
    getControlGroups,
  });
})(typeof window !== 'undefined' ? window : globalThis);
