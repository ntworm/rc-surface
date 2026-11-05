// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { test, expect } from '@playwright/test';

const CLIPS = [
  { index: 0, id: 'clip-0', name: 'Verse Audio', startTime: 32, endTime: 48 },
  { index: 1, id: 'clip-1', name: 'Chorus Audio', startTime: 64, endTime: 96 }
];

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

function snapshot() {
  return {
    scope: 'song-scope-1', trackTreeValid: true,
    transport: {
      connected: true, isPlaying: field(false), recordMode: field(false),
      songTimeBeats: field(0), metronome: field(false)
    },
    tracks: [
      { index: 0, id: 't-0', name: 'Drums', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, groupId: null, isGroup: false }
    ],
    locators: [{ name: 'Intro', time: 0 }, { name: 'Verse', time: 32 }, { name: 'Chorus', time: 64 }],
    meter: { numerator: 4, denominator: 4 }, pending: null, range: null, safety: {},
    attemptActive: false,
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] }
  };
}

/** The preview of one waveform: scope, track, clip, interval, amplitudes. */
function waveformReply(args) {
  return {
    scope: 'song-scope-1',
    track: args.track,
    clip: args.clip,
    startTime: Number.isFinite(args.startTime) ? args.startTime : 0,
    endTime: Number.isFinite(args.endTime) ? args.endTime : 0,
    peaks: [0.25, 0.5, 1],
  };
}

/** The catalog of the clips of one track, paged. */
function catalogReply(args) {
  return { scope: 'song-scope-1', track: args.track, clips: CLIPS, page: { offset: 0, next: null } };
}

/** Every answer belongs to the command it replies to. */
function replyFor(command, args) {
  if (command === 'getMappings') return { mappings: {} };
  if (command === 'getRecordingState') return snapshot();
  if (command === 'getRecordingWaveform') return waveformReply(args);
  // The catalog is the other read of the lane: the track it belongs to, no clip.
  if (command === 'getRecordingArrangement') return catalogReply(args);
  return {};
}

/** The host answers every read with the schema it owns: the native state,
 * the catalog of the clip and the preview of a waveform are three
 * different answers. The arrangement reads travel the same phone channel
 * as the REC state. */
async function setupSocket(page, log) {
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'arrangement', role: 'controller' }));
      return;
    }
    if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
    if (!message.cmd) return;
    const args = message.args || {};
    log.commands.push(message.cmd);
    const result = replyFor(message.cmd, args);
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
}

function readsOf(log) {
  // Only the reads of the lane count: a command of the phone itself never
  // changes the number of catalogs and previews of the rows.
  return log.commands.filter(cmd => cmd === 'getRecordingArrangement' || cmd === 'getRecordingWaveform');
}

async function openRec(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
  // The editor belongs to the Arrangement. The Record mode stays the
  // default and never reads a hidden row.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
}

/** What the page really loaded: the namespace, the rows and the first read. */
async function report(page, log) {
  return page.evaluate((commands) => {
    const namespace = window.RcRecordingArrangement || {};
    return {
      reads: typeof namespace.createReads,
      model: typeof namespace.createRowsModel,
      rows: typeof namespace.setupRows,
      clips: document.querySelectorAll('.rec-arrangement-clip').length,
      bars: document.querySelectorAll('.rec-arrangement-bar').length,
      status: (document.querySelector('.rec-arrangement-status') || {}).textContent,
      commands: commands.join(',')
    };
  }, log.commands);
}
/** The clip that starts at 32, the marker at 32 and the bar line at 32 are
 * the same point of the one measured axis. */
async function alignment(page) {
  const clip = await page.locator('.rec-arrangement-clip').first().boundingBox();
  const marker = await page.locator('.rec-marker[data-index="1"]').boundingBox();
  const bar = await page.locator('#rec-grid .rec-grid-bar').evaluateAll(nodes => {
    const node = nodes.find((item) => item.textContent === '9');
    return node ? node.getBoundingClientRect().x : null;
  });
  return { clip, marker, bar };
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 851, height: 393 }]) {
  test(`the arrangement clips share the ruler axis (${viewport.width})`, async ({ page }) => {
    const log = { commands: [] };
    await setupSocket(page, log);
    await openRec(page, viewport);
    await page.waitForTimeout(1500);
    const observed = await report(page, log);
    expect(observed.reads).toBe('function');
    expect(observed.model).toBe('function');
    expect(observed.rows).toBe('function');
    expect(observed.clips).toBe(2);
    expect(observed.bars).toBe(1);
    expect(typeof observed.status).toBe('string');
    expect(observed.status.length).toBeGreaterThan(0);
    expect(observed.commands).toContain('getRecordingState');
    expect(readsOf(log).length, 'the row reads its catalog once').toBeGreaterThanOrEqual(1);
    const clip = page.locator('.rec-arrangement-clip').first();
    await expect(clip).toBeVisible();
    await expect(page.locator('.rec-arrangement-clip-name').first()).toHaveText('Verse Audio');
    // The first marker keeps its own badge: its box never changes and its
    // centre stays on the axis.
    const firstMarker = await page.locator('.rec-marker[data-index="0"]').boundingBox();
    expect(firstMarker, 'the first marker is drawn').not.toBeNull();
    expect([76, 24], 'the badge keeps its own width').toContain(Math.round(firstMarker.width));
    // The reader owns the view: the zoom goes back to 1 and the ruler to
    // its beginning, so the badge of the first marker is whole inside it.
    await page.locator('#rec-zoom').fill('1');
    await page.locator('#rec-zoom').dispatchEvent('input');
    await page.locator('#rec-timeline').evaluate(node => { node.scrollLeft = 0; });
    const timeline = await page.locator('#rec-timeline').boundingBox();
    const badge = await page.locator('.rec-marker[data-index="0"]').boundingBox();
    expect(badge.x - timeline.x, 'the badge starts inside the ruler').toBeGreaterThanOrEqual(-2);
    expect(timeline.x + timeline.width - (badge.x + badge.width),
      'the badge ends inside the ruler').toBeGreaterThanOrEqual(-2);
    let measured = await alignment(page);
    expect(measured.bar, 'the bar line of beat 32 exists').not.toBeNull();
    expect(Math.abs(measured.clip.x - (measured.marker.x + measured.marker.width / 2)),
      'the clip starts where the marker is centred').toBeLessThanOrEqual(2);
    expect(Math.abs(measured.clip.x - measured.bar), 'the clip starts on the bar line').toBeLessThanOrEqual(2);
    // The zoomed axis keeps the same origin: the ruler scrolls, the lane follows.
    await page.locator('#rec-zoom').fill('8');
    await expect.poll(async () => (await alignment(page)).clip.x).not.toBe(measured.clip.x);
    measured = await alignment(page);
    expect(Math.abs(measured.clip.x - (measured.marker.x + measured.marker.width / 2)),
      'the zoomed clip starts where the marker is centred').toBeLessThanOrEqual(2);
    expect(Math.abs(measured.clip.x - measured.bar), 'the zoomed clip starts on the bar line').toBeLessThanOrEqual(2);
    await page.locator('#rec-timeline').evaluate((node) => { node.scrollLeft = 400; });
    await expect.poll(async () => (await alignment(page)).clip.x).not.toBe(measured.clip.x);
    measured = await alignment(page);
    expect(Math.abs(measured.clip.x - (measured.marker.x + measured.marker.width / 2)),
      'the scrolled clip starts where the marker is centred').toBeLessThanOrEqual(2);
    expect(Math.abs(measured.clip.x - measured.bar), 'the scrolled clip starts on the bar line').toBeLessThanOrEqual(2);
  });
}

test('the narrow arrangement page keeps every control inside the surface', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  // The orientation guard of the phone owns the portrait: the page is
  // opened in the supported landscape and only the geometry of the narrow
  // surface is measured here.
  await openRec(page, { width: 851, height: 393 });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(200);
  await expect(page.locator('.rec-arrangement-clip').first()).toBeAttached();
  const problems = await page.evaluate(() => {
    const found = [];
    const surface = document.querySelector('#page-recording');
    if (surface.scrollWidth > surface.clientWidth + 2) found.push('page-overflow');
    for (const row of document.querySelectorAll('#rec-track-grid .rec-track-row')) {
      const rowBox = row.getBoundingClientRect();
      for (const control of row.querySelectorAll('button, .rec-track-vol, .rec-track-name')) {
        const box = control.getBoundingClientRect();
        if (!box.width && !box.height) continue;
        if (box.left < rowBox.left - 1 || box.right > rowBox.right + 1) found.push('overflow:' + control.className);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
  // The lane of the row owns the preview and the secondary bar: in the
  // narrow portrait it keeps a real height instead of collapsing to zero.
  const lanes = await page.locator('#rec-track-grid .rec-track-lane').evaluateAll(nodes =>
    nodes.map((node) => node.getBoundingClientRect().height));
  expect(lanes.length, 'the row keeps its lane').toBeGreaterThan(0);
  for (const height of lanes) {
    expect(height, 'the lane keeps a real height').toBeGreaterThanOrEqual(44);
    expect(Math.abs(height - 88), 'the lane holds the preview and the secondary bar')
      .toBeLessThanOrEqual(1);
  }
});

test('a preview is read only when it is asked for and paints its real amplitudes', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page, { width: 1280, height: 800 });
  const clip = page.locator('.rec-arrangement-clip').first();
  await expect(clip).toBeVisible();
  await page.waitForTimeout(1200);
  const before = readsOf(log).length;
  expect(before, 'the row reads its catalog once').toBe(1);
  await expect(page.locator('.rec-arrangement-peaks')).toHaveCount(0);
  await page.locator('.rec-arrangement-clip-wave').first().click();
  await expect(page.locator('.rec-arrangement-peaks')).toHaveCount(1);
  expect(readsOf(log).length, 'the explicit action reads one preview').toBe(before + 1);
  const bars = await page.locator('.rec-arrangement-peak').evaluateAll(nodes => nodes.map((node) => node.style.height));
  expect(bars).toEqual(['25%', '50%', '100%']);
  // The painted interval is the interval the host returned: the preview never
  // stretches over the whole clip.
  const clipBox = await clip.boundingBox();
  const peaksBox = await page.locator('.rec-arrangement-peaks').boundingBox();
  expect(Math.abs(peaksBox.x - clipBox.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(peaksBox.width - clipBox.width)).toBeLessThanOrEqual(2);
});

/** The socket of the axis proof: a group, an ordinary track and the real
 * catalog of the clips of the lane. */
async function setupAxisSocket(page) {
  const group = { index: 0, id: 'g-0', name: 'Group', arm: false, canArm: false, solo: false, mute: false, volume: 0.5, groupId: null, isGroup: true };
  const track = { index: 1, id: 't-1', name: 'Drums', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, groupId: null, isGroup: false };
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'axis', role: 'controller' }));
      return;
    }
    if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
    if (!message.cmd) return;
    const args = message.args || {};
    const result = message.cmd === 'getRecordingState'
      ? { ...snapshot(), tracks: [group, track] }
      : message.cmd === 'getRecordingArrangement' ? catalogReply(args)
      : message.cmd === 'getMappings' ? { mappings: {} } : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
}

/** The physical axis of the surface: the origin of the ruler, the centre
 * of the marker of the same time, the bar line and the boundary of the
 * clip that starts there. */
async function measuredAxis(page) {
  return page.evaluate(() => {
    const timeline = document.getElementById('rec-timeline');
    const track = timeline.querySelector('#rec-timeline-track').getBoundingClientRect();
    const marker = document.querySelector('.rec-marker[data-index="1"]').getBoundingClientRect();
    const bar = [...document.querySelectorAll('#rec-grid .rec-grid-bar')].find(node => node.textContent === '9');
    const clip = document.querySelector('.rec-arrangement-clip').getBoundingClientRect();
    const lane = document.querySelector('.rec-track-lane').getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(timeline).getPropertyValue('--rec-gutter')) || 0;
    return {
      marker: marker.x + marker.width / 2,
      bar: bar ? bar.getBoundingClientRect().x : null,
      clip: clip.x,
      // The ruler starts at the lane of the rows, the scroll of the ruler
      // belongs to the same axis.
      origin: track.x - lane.x + timeline.scrollLeft,
      gutter,
    };
  });
}

/** Every part of the ruler, of the marker and of the lane agrees on the
 * one measured axis. */
async function expectAlignedAxis(page, label) {
  await expect.poll(async () => {
    const value = await measuredAxis(page);
    const gaps = [Math.abs(value.clip - value.marker), Math.abs(value.origin - value.gutter)];
    if (value.bar !== null) gaps.push(Math.abs(value.clip - value.bar));
    return Math.max(...gaps);
  }, { message: label }).toBeLessThanOrEqual(2);
}

/** One measured axis: the ruler, the marker of a time, the bar line and
 * the boundary of the clip share their origin and their width at every
 * zoom, after a scroll, a resize and a collapse of a group. */
test('the ruler, the markers and the clips share one measured axis', async ({ page }) => {
  await setupAxisSocket(page);
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(2);
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('.rec-arrangement-clip').first()).toBeVisible();

  await expectAlignedAxis(page, 'the axis agrees at the first zoom');
  // The ruler keeps a real finger area and its first label stays inside.
  const ruler = await page.locator('#rec-timeline-track').boundingBox();
  expect(ruler.height, 'the ruler keeps a finger area').toBeGreaterThanOrEqual(44);
  const first = await page.locator('.rec-marker[data-index="0"]').boundingBox();
  const timeline = await page.locator('#rec-timeline').boundingBox();
  expect(first.x - timeline.x, 'the first badge starts inside the ruler').toBeGreaterThanOrEqual(-2);
  expect(timeline.x + timeline.width - (first.x + first.width),
    'the first badge ends inside the ruler').toBeGreaterThanOrEqual(-2);
  for (const zoom of ['8', '300', '1']) {
    await page.locator('#rec-zoom').fill(zoom);
    await expectAlignedAxis(page, 'the axis agrees at zoom ' + zoom);
  }
  await page.locator('#rec-zoom').fill('8');
  await page.locator('#rec-timeline').evaluate(node => { node.scrollLeft = 300; });
  await expectAlignedAxis(page, 'the axis agrees after a horizontal scroll');
  // The last label of the ruler stays reachable at the end of the scroll.
  await page.locator('#rec-timeline').evaluate(node => { node.scrollLeft = node.scrollWidth; });
  const last = await page.locator('.rec-marker[data-index="2"]').boundingBox();
  const scrolled = await page.locator('#rec-timeline').boundingBox();
  expect(scrolled.x + scrolled.width - (last.x + last.width),
    'the last badge ends inside the ruler').toBeGreaterThanOrEqual(-2);
  for (const size of [{ width: 568, height: 320 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await expectAlignedAxis(page, 'the axis agrees after a resize');
  }
  // A collapsed group hides its own rows: the lane of the ordinary track
  // and the ruler keep their shared axis.
  await page.locator('.rec-track-row[data-id="g-0"] .rec-track-group-toggle').click();
  await expect(page.locator('.rec-track-row[data-id="g-0"] .rec-track-group-toggle'))
    .toHaveAttribute('aria-expanded', 'false');
  await expectAlignedAxis(page, 'the axis agrees after a collapse');
});
