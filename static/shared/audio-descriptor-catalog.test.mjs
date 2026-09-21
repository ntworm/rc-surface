// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import test from 'node:test';
import './audio-descriptor-catalog.js';

const catalog = globalThis.AudioDescriptorCatalog;
const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16) / 255)
    .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};

test('descriptor palette keeps the wire/card order and three contrasting shades per family', () => {
  assert.deepEqual(catalog.map((entry) => entry.field), [
    'transient', 'kick', 'snare', 'brightness', 'centroid', 'rolloff',
    'flux', 'flatness', 'spread', 'low', 'mid', 'high',
  ]);
  assert.equal(new Set(catalog.map((entry) => entry.color)).size, 12);
  for (const group of ['attacks', 'tone', 'texture', 'bands']) {
    const colors = catalog.filter((entry) => entry.group === group).map((entry) => entry.color);
    assert.equal(colors.length, 3);
    assert.ok(colors.includes(globalThis.AudioDescriptorFamilies[group]), 'group accent belongs to its palette');
    for (const color of colors) {
      assert.match(color, /^#[0-9a-f]{6}$/i);
      const ratio = (luminance(color) + .05) / (luminance('#0e0e0e') + .05);
      assert.ok(ratio >= 3, color + ' must contrast at least 3:1, got ' + ratio);
    }
  }
});
