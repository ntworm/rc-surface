// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

const TRACK = { index: 0, id: 't-0', name: 'Drums' };

function snapshot() {
  return {
    scope: 'song-scope-1', trackTreeValid: true,
    transport: {
      connected: true, isPlaying: field(false), recordMode: field(false),
      songTimeBeats: field(0), metronome: field(false),
    },
    tracks: [
      { ...TRACK, arm: false, canArm: true, solo: false, mute: false, volume: 0.5, groupId: null, isGroup: false },
    ],
    locators: [{ name: 'Intro', time: 0 }, { name: 'Verse', time: 32 }],
    meter: { numerator: 4, denominator: 4 },
    pending: null, range: null, safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] },
  };
}

/** The source clip of the Arrangement overlaps the takes of the track: the
 * focus of that clip keeps its own interval and shows the lanes of it. */
const ARRANGEMENT_CLIPS = [
  { index: 0, id: 'clip-0', name: 'Verse Audio', startTime: 0, endTime: 32 },
  { index: 1, id: 'clip-1', name: 'Chorus Audio', startTime: 64, endTime: 96 },
];

const TAKE_LANES = [{
  index: 0, id: 'lane-0', name: 'Lane 1',
  clips: [
    { index: 0, id: 'take-0', name: 'Take 1', startTime: 0, endTime: 16, mark: null, reference: 'ref-0' },
    { index: 1, id: 'take-1', name: 'Take 2', startTime: 16, endTime: 32, mark: 'good', reference: 'ref-1' },
  ],
}];

/** The host answers every command with the schema it owns: the native
 * state, the take catalog, the clip catalog and the waveform preview are
 * four different answers and each one belongs to its own command. A
 * parameter never decides which answer a command receives. */
function send(socket, message, result) {
  socket.send(JSON.stringify({ id: message.id, ok: true, result }));
}
function takesCatalog(args) {
  return {
    scope: args.scope,
    track: { ...args.track },
    lanes: TAKE_LANES,
    page: {
      laneOffset: Number.isFinite(args.laneOffset) ? args.laneOffset : 0,
      clipOffset: Number.isFinite(args.clipOffset) ? args.clipOffset : 0,
      next: null,
    },
  };
}
function arrangementCatalog(args) {
  return {
    scope: args.scope,
    track: { ...args.track },
    clips: ARRANGEMENT_CLIPS,
    page: { offset: Number.isFinite(args.offset) ? args.offset : 0, next: null },
  };
}
function previewCatalog(args) {
  return {
    scope: args.scope,
    track: { ...args.track },
    clip: { ...args.clip },
    startTime: Number.isFinite(args.startTime) ? args.startTime : 0,
    endTime: Number.isFinite(args.endTime) ? args.endTime : 0,
    peaks: [0.25, 0.5, 1],
  };
}
function markAnswer(args) {
  return {
    scope: args.scope,
    track: { ...args.track },
    lane: { ...args.lane },
    clip: { ...args.clip, mark: args.mark },
  };
}

const ANSWERS = {
  getMappings: () => ({ mappings: {} }),
  getRecordingState: () => snapshot(),
  getRecordingTakes: takesCatalog,
  getRecordingArrangement: arrangementCatalog,
  getRecordingWaveform: previewCatalog,
  recordingMarkTake: markAnswer,
};

function reply(socket, message) {
  const answer = ANSWERS[message.cmd];
  if (!answer) { send(socket, message, {}); return; }
  send(socket, message, answer(message.args || {}));
}

async function setupSocket(page, log, options = {}) {
  let socket = null;
  await page.routeWebSocket('**/ws*', connection => {
    socket = connection;
    connection.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') {
        connection.send(JSON.stringify({ type: 'hello', client_id: 'focus', role: options.role || 'controller' }));
        return;
      }
      if (message.type === 'ping') { connection.send(JSON.stringify({ type: 'pong' })); return; }
      if (!message.cmd) return;
      log.commands.push(message);
      reply(connection, message);
    });
  });
  return { socket: () => socket };
}

const writes = log => log.commands.filter(command => command.cmd.startsWith('recording'));

async function openRec(page, viewport = { width: 1280, height: 800 }, locale = 'en') {
  await page.setViewportSize(viewport);
  await page.goto('/?lang=' + locale);
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
  // The take focus belongs to the editor of the Arrangement. The Record
  // mode stays the default and never reads a hidden row.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
}

/** The track opens its own take focus: the row of the Arrangement owns the
 * entry, never a new page and never a hidden track of its own. */
async function openFocus(page) {
  const entry = page.locator('#rec-track-grid button').filter({ hasText: /^TAKES$/ }).first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('#rec-focus')).toBeVisible();
}

/** The real adapter is on the page and the native takes are the ones it
 * read: the lanes are not a painted guess of the focus. */
test('the real take adapter is loaded and the native takes are rendered', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  expect(await page.evaluate(() => typeof window.RcRecordingTakes)).not.toBe('undefined');
  await openFocus(page);
  expect(log.commands.filter(command => command.cmd === 'getRecordingTakes').length).toBeGreaterThan(0);
  await expect(page.locator('#rec-takes-list .rec-takes-lane')).toHaveCount(1);
  await expect(page.locator('#rec-takes-list .rec-takes-clip')).toHaveCount(2);
  await expect(page.locator('#rec-takes-list .rec-takes-clip').first()).toContainText('Take 1');
});

/** Without the adapter of the take list there is no focus at all: the rows
 * stay visible and no panel opens. */
test('the focus opens only after the real adapter answers', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await page.route('**/recording-takes-focus.js', route => route.abort());
  await openRec(page);
  const entry = page.locator('#rec-track-grid button').filter({ hasText: /^TAKES$/ }).first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('#rec-focus')).toBeHidden();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toBeVisible();
});

for (const locale of ['en', 'pt-BR']) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 851, height: 393 }]) {
    test(`the take focus hides every track row and restores them (${locale} ${viewport.width})`, async ({ page }) => {
      const log = { commands: [] };
      await setupSocket(page, log);
      await openRec(page, viewport, locale);
      const rows = page.locator('#rec-track-grid .rec-track-row');
      await expect(rows).toBeVisible();

      await openFocus(page);
      await expect(rows).toBeHidden();
      await expect(page.locator('#rec-focus-track')).toHaveText('Drums');
      await expect(page.locator('#rec-start')).toBeVisible();
      await expect(page.locator('#rec-stop')).toBeVisible();
      await expect(page.locator('#rec-pre-roll-inline')).toBeVisible();
      await expect(page.locator('#rec-passages')).toBeVisible();
      await expect(page.locator('#rec-click')).toBeVisible();

      await page.locator('#rec-focus-all-tracks').click();
      await expect(page.locator('#rec-focus')).toBeHidden();
      await expect(rows).toBeVisible();
    });
  }
}

test('the toolbar keeps the same four boxes with the focus open', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page, { width: 1280, height: 800 });
  const boxes = async () => {
    const result = {};
    for (const id of ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages']) {
      const box = await page.locator('#' + id).boundingBox();
      result[id] = box ? Math.round(box.height) : 0;
    }
    return result;
  };
  const before = await boxes();
  await openFocus(page);
  const after = await boxes();
  expect(after).toEqual(before);
  expect(new Set(Object.values(after)).size).toBe(1);
});

test('the focus never writes, seeks or plays', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  await page.locator('.rec-takes-clip').first().click();
  await page.locator('#rec-focus-phrase').click();
  await page.locator('#rec-focus-all-tracks').click();
  await expect(page.locator('#rec-focus')).toBeHidden();
  expect(writes(log)).toHaveLength(0);
});

test('the take lanes keep their native order and their real intervals', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  const lanes = page.locator('#rec-takes-list .rec-takes-lane');
  await expect(lanes).toHaveCount(1);
  await expect(lanes.first()).toContainText('Lane 1');
  const clips = page.locator('#rec-takes-list .rec-takes-clip');
  await expect(clips).toHaveCount(2);
  await expect(clips.first()).toContainText('Take 1');
  await expect(clips.nth(1)).toContainText('Take 2');
  const positions = await clips.evaluateAll(nodes => nodes.map(node => {
    const label = node.querySelector('.rec-takes-clip-pos');
    return label ? label.textContent : '';
  }));
  expect(positions[0]).toContain('0');
  expect(positions[0]).toContain('16');
});

/** The focus of a source clip keeps the interval of that clip and shows the
 * lanes of it. Everything stays local: no write, no seek, no play. */
test('the focus of a source clip keeps its own interval and stays local', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  const clip = page.locator('#rec-track-grid .rec-arrangement-clip-name').first();
  await expect(clip).toBeVisible();
  await clip.click();
  await expect(page.locator('#rec-focus')).toBeVisible();
  await expect(page.locator('#rec-focus-clip')).toHaveText('Verse Audio');
  await expect(page.locator('#rec-focus-interval')).toContainText('0');
  await expect(page.locator('#rec-focus-interval')).toContainText('32');
  // The lanes of the focus are the ones of that range.
  await expect(page.locator('#rec-takes-list .rec-takes-clip')).toHaveCount(2);
  expect(writes(log)).toHaveLength(0);
});

test('the phrase stays inside the chosen take and the range is highlighted', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  // Without a chosen take there is no context for a phrase.
  await expect(page.locator('#rec-focus-phrase')).toBeDisabled();
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-focus-phrase')).toBeEnabled();

  await page.locator('#rec-focus-phrase').click();
  await expect(page.locator('#rec-focus-phrase-fields')).toBeVisible();
  await page.locator('#rec-focus-phrase-start').fill('2');
  await page.locator('#rec-focus-phrase-end').fill('8');
  await page.locator('#rec-focus-phrase-end').blur();
  await expect(page.locator('.rec-focus-range')).toHaveCount(1);

  // An end before the start is refused and the range stays where it was.
  await page.locator('#rec-focus-phrase-start').fill('20');
  await page.locator('#rec-focus-phrase-start').blur();
  await expect(page.locator('#rec-focus-status')).not.toBeEmpty();
  // A phrase outside the chosen take is refused as well.
  await page.locator('#rec-focus-phrase-start').fill('4');
  await page.locator('#rec-focus-phrase-end').fill('40');
  await page.locator('#rec-focus-phrase-end').blur();
  await expect(page.locator('#rec-focus-status')).not.toBeEmpty();
  expect(writes(log)).toHaveLength(0);
});

/** The phrase belongs to the take that holds it. A new take that does not
 * hold it drops the outline of the old one: the local view follows the
 * adapter, the REC range and the transport stay as they are. */
test('a new take drops the phrase of the previous one', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  await page.locator('#rec-takes-list .rec-takes-clip').first().click();
  await page.locator('#rec-focus-phrase').click();
  await page.locator('#rec-focus-phrase-start').fill('2');
  await page.locator('#rec-focus-phrase-end').fill('8');
  await page.locator('#rec-focus-phrase-end').blur();
  await expect(page.locator('.rec-focus-range')).toHaveCount(1);
  // The second take does not hold the phrase of the first one.
  await page.locator('#rec-takes-list .rec-takes-clip').nth(1).click();
  await expect.poll(() => page.locator('.rec-focus-range').count()).toBe(0);
  await expect(page.locator('#rec-focus-whole')).toHaveAttribute('aria-pressed', 'true');
  // The new take stays the chosen one.
  await expect.poll(() => page.locator('#rec-takes-list .rec-takes-clip')
    .evaluateAll(nodes => nodes.map(node => node.dataset.focusSelected === 'true' ? 1 : 0))).toEqual([0, 1]);
  expect(writes(log)).toHaveLength(0);
});

test('the chosen take keeps its opaque reference and the note names the whole clip', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  await page.locator('.rec-takes-clip').first().click();
  // The note says what the marks do, in the words of the page: no code.
  await expect(page.locator('#rec-focus-note')).toContainText('GOOD');
  await expect(page.locator('#rec-focus-note')).toContainText('WHOLE chosen clip');
  // The outline follows the exact opaque clip, never a name of the lane.
  await expect.poll(() => page.locator('#rec-takes-list .rec-takes-clip')
    .evaluateAll(nodes => nodes.map(node => node.dataset.focusSelected === 'true' ? 1 : 0))).toEqual([1, 0]);
  await page.locator('#rec-take-good').click();
  await expect.poll(() => log.commands.filter(command => command.cmd === 'recordingMarkTake').length).toBe(1);
  const note = log.commands.filter(command => command.cmd === 'recordingMarkTake')[0];
  expect(note.args).toEqual({
    scope: 'song-scope-1',
    track: { index: 0, id: 't-0', name: 'Drums' },
    lane: { index: 0, id: 'lane-0', name: 'Lane 1' },
    clip: { index: 0, id: 'take-0', name: 'Take 1', startTime: 0, endTime: 16, reference: 'ref-0' },
    mark: 'good',
  });
});

test('the listen action stays unavailable with a readable reason', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  const listen = page.locator('#rec-focus-listen');
  await expect(listen).toBeDisabled();
  const reason = await listen.getAttribute('aria-label');
  expect(reason).toBeTruthy();
  expect(reason.toLowerCase()).toContain('live');
  // The reason is visible next to the button, in the words of the page.
  await expect(page.locator('#rec-focus-listen-reason')).toHaveText(reason);
  expect(writes(log)).toHaveLength(0);
});

test('a new role retires the focus instead of substituting a track', async ({ page }) => {
  const log = { commands: [] };
  const host = await setupSocket(page, log);
  await openRec(page);
  await openFocus(page);
  await expect(page.locator('#rec-focus')).toBeVisible();
  host.socket().send(JSON.stringify({ type: 'hello', client_id: 'focus', role: 'viewer' }));
  await expect(page.locator('#rec-focus')).toBeHidden();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toBeVisible();
});

test('the open focus never traps the reader in an inner scroll', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page, { width: 851, height: 393 });
  await openFocus(page);
  const geometry = await page.evaluate(() => {
    const list = document.querySelector('#rec-takes-list');
    const surface = document.querySelector('#page-recording');
    return {
      clipped: list.scrollHeight > list.clientHeight + 1,
      overflow: surface.scrollWidth > surface.clientWidth + 2,
    };
  });
  expect(geometry.clipped).toBe(false);
  expect(geometry.overflow).toBe(false);
});

/** The zoom pushes the clips out of the view: the axis clips them and the
 * page never grows with them. */
test('the zoomed focus clips stay inside the axis', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page, { width: 851, height: 393 });
  await openFocus(page);
  await page.locator('#rec-zoom').evaluate(input => {
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => {
    const axis = document.querySelector('#rec-takes-list .rec-focus-axis');
    return axis ? axis.scrollWidth - axis.clientWidth : 0;
  })).toBeGreaterThan(0);
  const geometry = await page.evaluate(() => {
    const axis = document.querySelector('#rec-takes-list .rec-focus-axis');
    const surface = document.querySelector('#page-recording');
    const style = axis ? getComputedStyle(axis) : null;
    return {
      overflow: style ? style.overflow : '',
      pageOverflow: surface.scrollWidth - surface.clientWidth,
    };
  });
  expect(geometry.overflow).toBe('hidden');
  expect(geometry.pageOverflow).toBeLessThanOrEqual(2);
});

test('the narrow surface keeps the focus inside its own box', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  // The phone guard owns the portrait: the page is opened in the supported
  // landscape and only the geometry of the narrow surface is measured.
  await openRec(page, { width: 851, height: 393 });
  await openFocus(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(200);
  const geometry = await page.evaluate(() => {
    const surface = document.querySelector('#page-recording');
    const focus = document.querySelector('#rec-focus');
    const box = focus.getBoundingClientRect();
    return {
      overflow: surface.scrollWidth > surface.clientWidth + 2,
      focusWidth: Math.round(box.width),
      surfaceWidth: Math.round(surface.clientWidth),
    };
  });
  expect(geometry.overflow).toBe(false);
  expect(geometry.focusWidth).toBeLessThanOrEqual(geometry.surfaceWidth + 1);
});

/** The take lanes and the ruler share one measured axis: the lanes start
 * at the origin of the ruler, they are as wide as it, and a take of a
 * time stands where the marker of that time stands. */
test('the take lanes and the ruler share one measured axis', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await openRec(page, { width: 851, height: 393 });
  await openFocus(page);
  await expect(page.locator('#rec-takes-list .rec-takes-clip')).toHaveCount(2);
  const measured = await page.evaluate(() => {
    const axis = document.querySelector('#rec-takes-list .rec-focus-axis').getBoundingClientRect();
    const holder = document.querySelector('#rec-takes-list .rec-focus-clips').getBoundingClientRect();
    const clip = document.querySelector('#rec-takes-list .rec-takes-clip').getBoundingClientRect();
    const track = document.getElementById('rec-timeline-track').getBoundingClientRect();
    const marker = document.querySelector('.rec-marker[data-index="0"]').getBoundingClientRect();
    return {
      origin: holder.x - axis.x,
      trackOrigin: track.x - axis.x,
      width: holder.width,
      trackWidth: track.width,
      take: clip.x,
      marker: marker.x + marker.width / 2,
    };
  });
  expect(Math.abs(measured.origin - measured.trackOrigin),
    'the take lanes start at the origin of the ruler').toBeLessThanOrEqual(2);
  expect(Math.abs(measured.width - measured.trackWidth),
    'the take lanes are as wide as the ruler').toBeLessThanOrEqual(2);
  expect(Math.abs(measured.take - measured.marker),
    'a take of a time stands where the marker of that time stands').toBeLessThanOrEqual(2);
});
