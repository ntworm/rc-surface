// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Transient and Flux shades from the shared catalogue.
const ATTACK_COLOR = '#ffb3c3';
const TEXTURE_COLOR = '#dec6ff';

function loadTimeline() {
  const file = path.join(import.meta.dirname, 'audio-timeline.js');
  const source = fs.readFileSync(file, 'utf8');
  const frames = [];
  const cancelled = [];
  const context = {
    window: null,
    globalThis: null,
    devicePixelRatio: 2,
    performance: { now: () => 0 },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame(id) { cancelled.push(id); },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/audio-descriptor-catalog.js'), 'utf8'), context);
  vm.runInNewContext(source, context, { filename: file });
  return { Timeline: context.AudioSignalTimeline, catalog: context.AudioDescriptorCatalog, frames, cancelled };
}

test('all twelve descriptor curves use unique catalogue shades and continuous strokes', () => {
  const { Timeline, catalog, frames } = loadTimeline();
  const { canvas, strokePens } = makeCanvas();
  const timeline = new Timeline({ canvas });
  timeline.setView('all');
  timeline.pushDescriptors(Object.fromEntries(catalog.map((entry) => [entry.field, .4])));
  frames.shift()();
  assert.equal(new Set(catalog.map((entry) => entry.color)).size, 12);
  for (const entry of catalog) {
    assert.ok(strokePens.includes(entry.color + '|'), entry.field + ' must draw a solid line');
  }
  assert.ok(strokePens.every((pen) => pen.endsWith('|')), 'no descriptor curve uses dashes');
});

test('descriptor history preserves between-paint attacks, bounded normalized curves and legend selection', () => {
  const { Timeline, frames } = loadTimeline();
  const { canvas, points, strokePens } = makeCanvas();
  const root = { dataset: {} };
  const timeline = new Timeline({ canvas, root });
  timeline.setView('attacks');
  for (const [timestamp, transient] of [[0, 0], [10, 1], [20, 0]]) {
    timeline.pushDescriptors({ timestamp, transient, kick: 0, snare: 0 });
  }
  assert.equal(timeline.history.length, 0, 'descriptor capture is independent of legacy rAF');
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.ok(points.some((p) => p.style === ATTACK_COLOR && p.y === 0), 'an attack between paints must survive');
  assert.equal(root.dataset.view, 'attacks');
  timeline.setSeries('transient', false);
  strokePens.length = 0;
  frames.shift()();
  assert.ok(!strokePens.includes(ATTACK_COLOR + '|'), 'the disabled attack shade must be gone');
  for (const entry of timeline.getSeries().filter((entry) => entry.enabled)) {
    assert.ok(strokePens.includes(entry.color + '|'), entry.field + ' keeps drawing continuously');
  }
  timeline.pushDescriptors({ timestamp: 30, transient: NaN });
  assert.equal(timeline.descriptorHistory.at(-1).transient, 0);
  for (let i = 0; i < 1000; i++) timeline.pushDescriptors({ timestamp: 40 + i, transient: 2 });
  assert.ok(timeline.descriptorHistory.length <= 512);
  timeline.pushDescriptors({ timestamp: 10000, transient: -1 });
  assert.equal(timeline.descriptorHistory.length, 1);
  assert.equal(timeline.descriptorHistory[0].transient, 0);
  timeline.setState('off');
  assert.equal(timeline.descriptorHistory.length, 0);
  assert.equal(root.dataset.state, 'off');
  timeline.setState('waiting');
  timeline.push({ timestamp: 10001, rms: .3, envelope: .2, gate: 1 });
  assert.equal(root.dataset.state, 'waiting', 'legacy frames cannot revive a stale spectral view');
});

function makeCanvas() {
  const strokes = [];
  const strokePens = [];
  let currentDash = [];
  const fills = [];
  const lineDashes = [];
  const texts = [];
  const textCalls = [];
  const points = [];
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    setTransform() {},
    clearRect() {},
    fillRect(...args) { fills.push({ style: this.fillStyle, args }); },
    beginPath() {},
    moveTo(x, y) { points.push({ style: this.strokeStyle, x, y }); },
    lineTo(x, y) { points.push({ style: this.strokeStyle, x, y }); },
    // Record both colour and dash state so solid-curve regressions are visible.
    stroke() { strokes.push(this.strokeStyle); strokePens.push(this.strokeStyle + '|' + currentDash.join(',')); },
    setLineDash(value) { currentDash = [...value]; lineDashes.push([...value]); },
    fillText(value, x, y) { texts.push(value); textCalls.push({ value, x, y }); },
  };
  return {
    canvas: {
      clientWidth: 320,
      clientHeight: 100,
      width: 0,
      height: 0,
      getContext: () => ctx,
    },
    ctx,
    strokes,
    strokePens,
    fills,
    lineDashes,
    texts,
    textCalls,
    points,
  };
}





test('audio timeline keeps a bounded 2.5 second history and one pending paint', () => {
  const { Timeline, frames } = loadTimeline();
  const { canvas } = makeCanvas();
  const root = { dataset: {} };
  const status = { textContent: '' };
  const timeline = new Timeline({ canvas, root, status, windowMs: 2500 });

  assert.equal(root.dataset.state, 'off');
  assert.equal(status.textContent, 'AUDIO OFF');
  timeline.setState('waiting');
  assert.equal(status.textContent, 'WAITING FOR SIGNAL');

  timeline.push({ timestamp: 0, rms: 0.01, envelope: 0.02, gate: 0, gateThreshold: 0.015 });
  timeline.push({ timestamp: 1000, rms: 0.03, envelope: 0.025, gate: 1, gateThreshold: 0.015 });
  timeline.push({ timestamp: 3000, rms: 2, envelope: -1, gate: 1, gateThreshold: 0.015 });
  assert.equal(frames.length, 1, 'many audio frames must coalesce into one paint');
  assert.equal(timeline.history.length, 2, 'samples older than the display window are discarded');
  assert.deepEqual(
    Array.from(timeline.history, ({ rms, envelope }) => [rms, envelope]),
    [[0.03, 0.025], [1, 0]],
    'plot values are finite and clamped without changing mapping values',
  );
});

test('audio timeline draws RMS and envelope without a retired gate overlay', () => {
  const { Timeline, frames } = loadTimeline();
  const { canvas, strokes, fills, lineDashes } = makeCanvas();
  const timeline = new Timeline({ canvas, root: { dataset: {} }, status: { textContent: '' } });
  timeline.push({ timestamp: 1000, rms: 0.02, envelope: 0.03, gate: 1, gateThreshold: 0.015 });
  frames.shift()(1010);

  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 200);
  assert.ok(strokes.includes('#5ac8fa'), 'RMS uses the landing-page cyan');
  assert.ok(strokes.includes('#30d158'), 'envelope uses the landing-page green');
  assert.ok(!strokes.includes('#ff453a'), 'retired threshold must not be drawn');
  assert.ok(!lineDashes.some((dash) => dash.length > 0));
  assert.ok(!fills.some(({ style }) => /48,\s*209,\s*88/.test(style)));
});

test('audio timeline ignores invalid frames and clears on off', () => {
  const { Timeline, cancelled } = loadTimeline();
  const { canvas } = makeCanvas();
  const status = { textContent: '' };
  const timeline = new Timeline({ canvas, root: { dataset: {} }, status });
  timeline.push({ timestamp: 10, rms: Number.NaN, envelope: 0.2, gate: 0, gateThreshold: 0.015 });
  assert.equal(timeline.history.length, 0);
  timeline.push({ timestamp: 20, rms: 0.1, envelope: 0.2, gate: 0, gateThreshold: 0.015 });
  timeline.setState('off');
  assert.equal(timeline.history.length, 0);
  assert.equal(status.textContent, 'AUDIO OFF');
  timeline.destroy();
  assert.ok(cancelled.length > 0, 'destroy cancels a pending paint');
});









test('AUD page loads the runtime timeline before app wiring', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8');
  assert.match(html, /id="audio-timeline"[\s\S]*id="audio-timeline-canvas"/);
  assert.match(html, /id="audio-timeline-status"[^>]*>AUDIO OFF</);
  for (const id of [
    'audio-timeline-mode-signal', 'audio-timeline-mode-decisions',
    'audio-diagnostic-summary', 'audio-diagnostic-reset',
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} is dormant with Follow, not an active AUD control`);
  }
  assert.ok(
    html.indexOf('<script src="audio-timeline.js"></script>') < html.indexOf('<script src="app.js"></script>'),
    'timeline must load before setupAudioUI runs',
  );
});

test('each graph view owns its series and the combined view keeps all twelve descriptors', () => {
  const { Timeline } = loadTimeline();
  const { canvas, strokePens } = makeCanvas();
  const timeline = new Timeline({ canvas, root: { dataset: {} } });
  // getSeries() comes from the vm realm; copy into this realm before comparing.
  const fields = (view) => { timeline.setView(view); return Array.from(timeline.getSeries(), (entry) => entry.field); };
  assert.deepEqual(fields('amplitude'), ['rms', 'envelope']);
  assert.deepEqual(fields('attacks'), ['transient', 'kick', 'snare']);
  assert.deepEqual(fields('tone'), ['brightness', 'centroid', 'rolloff']);
  assert.deepEqual(fields('texture'), ['flux', 'flatness', 'spread']);
  assert.deepEqual(fields('bands'), ['low', 'mid', 'high']);
  assert.equal(fields('all').length, 12, 'the combined view draws every descriptor at once');
  assert.equal(fields('nonsense').length, 2, 'an unknown view falls back to amplitude');
  timeline.setView('all');
  timeline.setSeries('flux', false);
  assert.equal(Array.from(timeline.getSeries()).find((entry) => entry.field === 'flux').enabled, false);
  assert.equal(Array.from(timeline.getSeries()).filter((entry) => entry.enabled).length, 11);
  for (const timestamp of [0, 10, 20]) timeline.pushDescriptors({ timestamp, transient: .5, flux: .5, mid: .5 });
  strokePens.length = 0;
  timeline._paint();
  assert.ok(strokePens.includes(ATTACK_COLOR + '|'), 'enabled descriptors still paint in the combined view');
  assert.ok(!strokePens.includes(TEXTURE_COLOR + '|'), 'the disabled solid texture curve stays hidden');
});

test('descriptor curves scale to what is actually there and say so', () => {
  const { Timeline, frames } = loadTimeline();
  const { canvas, points } = makeCanvas();
  const root = { dataset: {} };
  const scale = { textContent: '' };
  const timeline = new Timeline({ canvas, root, scale });
  timeline.setView('attacks');
  for (const [timestamp, transient] of [[0, 0.05], [10, 0.25], [20, 0.1]]) {
    timeline.pushDescriptors({ timestamp, transient, kick: 0, snare: 0 });
  }
  frames.shift()();
  // A 0.25 peak must reach the top of the plot instead of sitting in the
  // bottom quarter, and the ceiling it was drawn against must be readable.
  const top = Math.min(...points.filter((point) => point.style === ATTACK_COLOR).map((point) => point.y));
  assert.ok(top < 12, 'the tallest attack should reach the top of the graph, got y=' + top);
  assert.equal(root.dataset.scale, '0.28');
  assert.equal(scale.textContent, '0–0.28');
  timeline.setSeries('transient', false);
  frames.shift()();
  assert.equal(root.dataset.scale, '0.05', 'hiding every loud curve drops the ceiling to the floor value');
});

test('descriptor curves keep scrolling between measurements', () => {
  const { Timeline, frames } = loadTimeline();
  const { canvas, points } = makeCanvas();
  const timeline = new Timeline({ canvas, root: { dataset: {} } });
  timeline.setView('attacks');
  for (const timestamp of [1000, 1020, 1040]) timeline.pushDescriptors({ timestamp, transient: .5 });
  // A wide analysis window updates the curve far less often than the screen
  // repaints. The line still has to advance, and hold its last value.
  timeline.paintAt(1200);
  const drawn = points.filter((point) => point.style === ATTACK_COLOR || point.style);
  const rightmost = Math.max(...drawn.map((point) => point.x));
  assert.ok(rightmost >= 299, 'the curve must reach the right edge, got ' + rightmost);
  const oldest = Math.min(...drawn.map((point) => point.x));
  assert.ok(oldest < 100, 'older samples must have scrolled left, got ' + oldest);
});
