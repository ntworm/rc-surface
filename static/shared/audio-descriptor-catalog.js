// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (global) {
  'use strict';
  // Family accents stay stable on headings/knobs. Curves use three lightness
  // steps per family, all >=3:1 against #0e0e0e. Shades are identities, not
  // signal strength; labelled cards and legend toggles remain essential when
  // curves overlap or colour vision makes a pair difficult to distinguish.
  const FAMILIES = Object.freeze({
    attacks: '#ff375f',
    tone: '#ffa133',
    texture: '#b57aff',
    bands: '#5ac8fa',
  });
  const SHADES = Object.freeze({
    attacks: Object.freeze(['#ffb3c3', FAMILIES.attacks, '#b52946']),
    tone: Object.freeze(['#ffe6a8', FAMILIES.tone, '#b86916']),
    texture: Object.freeze(['#dec6ff', FAMILIES.texture, '#8245c2']),
    bands: Object.freeze(['#c4f5ff', FAMILIES.bands, '#2184a8']),
  });
  const rows = [
    ['transient', 'Transient', 'Attack strength', 'attacks'],
    ['kick', 'Kick', 'Low-band attack', 'attacks'],
    ['snare', 'Snare', 'Mid/high-band attack', 'attacks'],
    ['brightness', 'Brightness', 'Dark → bright', 'tone'],
    ['centroid', 'Centroid', 'Spectral center', 'tone', 20000],
    ['rolloff', 'Rolloff 95%', '95% of spectral power', 'tone', 20000],
    ['flux', 'Flux', 'Spectral change', 'texture'],
    ['flatness', 'Flatness', 'Tonal → noise-like (dB)', 'texture'],
    ['spread', 'Spread', 'Spectral dispersion', 'texture', 10000],
    ['low', 'Low', '20–250 Hz · LU', 'bands'],
    ['mid', 'Mid', '250–2000 Hz · LU', 'bands'],
    ['high', 'High', '2–20 kHz · LU', 'bands'],
  ];
  const seen = {};
  global.AudioDescriptorFamilies = FAMILIES;
  global.AudioDescriptorCatalog = Object.freeze(rows.map(([field, label, hint, group, hzScale]) => {
    const index = seen[group] = (seen[group] ?? -1) + 1;
    return Object.freeze({
      field,
      name: 'sensor.audio.' + field,
      label,
      hint,
      group,
      color: SHADES[group][index],
      hzScale: hzScale || 0,
    });
  }));
})(typeof window !== 'undefined' ? window : globalThis);
