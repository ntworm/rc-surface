// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const read = (name) => fs.readFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), 'utf8');
const html = read('docs/index.html');
const svg = (tab) => html.split(`id="surface-map-${tab}"`)[1].match(/<svg[\s\S]*?<\/svg>/)[0];

test('every tab uses the same crisp, accessible diagram treatment', () => {
  assert.match(html, /href="surface-cards.css"/);
  for (const tab of ['perf', 'mix', 'snp', 'sns', 'aud', 'vid', 'map']) {
    assert.match(svg(tab), /class="surface-diagram"/);
    assert.match(svg(tab), /role="img" aria-label="[^"]+"/);
    assert.doesNotMatch(svg(tab), /crispEdges/);
  }
});

test('MIX illustrates eight variable arc knobs and eight faders', () => {
  const mix = svg('mix');
  assert.equal((mix.match(/data-mix-knob="\d"/g) || []).length, 8);
  for (let n = 1; n <= 8; n++) {
    assert.match(mix, new RegExp(`data-mix-knob="${n}"`));
    assert.match(mix, new RegExp(`>fader-${n}<`));
  }
  const arcs = [...mix.matchAll(/class="dial-value"[^>]*stroke-dasharray="([^"]+)"/g)];
  assert.equal(arcs.length, 8);
  assert.ok(new Set(arcs.map((m) => m[1])).size >= 6);
});

test('MAP background retains the same eight by eight MIX inventory', () => {
  const map = svg('map');
  assert.equal((map.match(/data-mix-knob="\d"/g) || []).length, 8);
  assert.equal((map.match(/data-mix-fader="\d"/g) || []).length, 8);
});

test('AUD draws the ten real controls in four racks and no WINDOW dial', () => {
  const aud = svg('aud');
  const keys = ['sensitivity', 'releaseMs', 'curve', 'attacksGain', 'toneMs',
    'toneGain', 'textureMs', 'textureGain', 'bandsMs', 'bandsGain'];
  assert.deepEqual([...aud.matchAll(/data-audio-knob="([^"]+)"/g)].map((m) => m[1]), keys);
  for (const group of ['attacks', 'tone', 'texture', 'bands']) {
    assert.match(aud, new RegExp(`data-audio-rack="${group}"`));
  }
  assert.match(aud, /data-window-picker="true"/);
  assert.match(aud, /1\/128/);
  assert.doesNotMatch(aud, /data-audio-knob="window"/);
});

test('AUD draws twelve individually named readouts with their real catalog colors', () => {
  const catalog = read('static/shared/audio-descriptor-catalog.js');
  const ctx = {};
  vm.runInNewContext(catalog, ctx);
  const aud = svg('aud');
  assert.equal((aud.match(/data-descriptor="[^"]+"/g) || []).length, 12);
  for (const id of ['transient', 'kick', 'snare', 'brightness', 'centroid', 'rolloff',
    'flux', 'flatness', 'spread', 'low', 'mid', 'high']) {
    const row = ctx.AudioDescriptorCatalog.find((item) => item.field === id);
    assert.ok(row);
    const drawn = aud.match(new RegExp(`data-descriptor="${id}"[\\s\\S]*?<\/g>`))?.[0];
    assert.ok(drawn, id);
    assert.ok(drawn.includes(row.color), id + ' must match its runtime color');
  }
  for (const label of ['CENTROID', 'SPREAD', 'ROLLOFF 95%']) {
    assert.match(aud, new RegExp(label + '[\\s\\S]*?Hz'));
  }
});

test('the audio family card separates window buttons from the knobs', () => {
  const panel = html.split('data-audio-layout="readouts-timeline-controls"')[1].split('data-i18n="lp.audio.timing"')[0];
  assert.doesNotMatch(panel, /data-audio-setting="window"/);
  assert.match(panel, /data-window-picker="true"/);
  for (const n of [1, 2, 4]) assert.match(panel, new RegExp('>x' + n + '<'));
});

test('AUD uses a small selection of bounded, non-looping example curves', () => {
  const aud = svg('aud');
  const traces = [...aud.matchAll(/data-curve="([^"]+)" d="([^"]+)"/g)];
  assert.equal(traces.length, 5, 'the example selects five curves, not all twelve');
  assert.match(aud, /clip-path="url\(#landing-audio-plot\)"/);
  assert.equal((aud.match(/data-legend="[^"]+"/g) || []).length, 12);
  for (const [, name, d] of traces) {
    assert.equal(d.replace(/[ML][\d.]+ [\d.]+/g, ''), '', name + ' must use sampled M/L geometry');
    const points = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(points.length > 20);
    let previous = 87;
    for (const [x, y] of points) {
      assert.ok(x > previous && x <= 687, name + ': time only moves forward');
      assert.ok(y >= 208 && y <= 320, name + ': normalized values stay in the plot');
      previous = x;
    }
  }
});
