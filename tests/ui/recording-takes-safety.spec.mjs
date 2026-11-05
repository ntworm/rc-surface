// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

const SNAPSHOT = {
  scope: 'song-scope-42',
  transport: {
    connected: true,
    isPlaying: field(false),
    recordMode: field(false),
    songTimeBeats: field(0),
    metronome: field(false),
  },
  tracks: [
    { index: 0, id: 'track-0', name: 'Guitar', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73 },
    { index: 1, id: 'track-1', name: 'Bass', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73 },
  ],
  locators: [],
  meter: { numerator: 4, denominator: 4 },
  pending: null,
  attemptActive: false,
  preRoll: null,
  session: { songId: 'song-1', scenes: [], rows: [], owned: [], active: false },
};

function catalog(overrides = {}) {
  return {
    scope: 'song-scope-42',
    track: { index: 0, id: 'track-0', name: 'Guitar' },
    lanes: [{
      index: 0,
      id: 'lane-0',
      name: 'Lane 1',
      clips: [
        { index: 0, id: 'clip-0', name: 'Take 1', startTime: 0, endTime: 16, mark: null, reference: 'ref-0' },
        { index: 1, id: 'clip-1', name: 'Take 2', startTime: 16, endTime: 32, mark: 'good', reference: 'ref-1' },
      ],
    }],
    page: { laneOffset: 0, clipOffset: 0, next: null },
    ...overrides,
  };
}

/** The catalog answers the track that was asked for, not a remembered one. */
function catalogFor(message) {
  return catalog({ track: { ...message.args.track } });
}

function send(socket, message, result) {
  socket.send(JSON.stringify({ id: message.id, ok: true, result }));
}

/** A held reply waits in the queue: the test releases it when it wants to. */
function defer(socket, message, result, queue) {
  const payload = JSON.stringify({ id: message.id, ok: true, result });
  queue.push(() => socket.send(payload));
}

function answerTakes(message, socket, options, held, session) {
  session.takes += 1;
  const result = options.catalog ? options.catalog(message) : catalogFor(message);
  // Only a read the test arms is held, so an editor choice cannot strand the list.
  if (options.holdTakes && session.holdTakes) {
    defer(socket, message, result, held.takes);
    return;
  }
  send(socket, message, result);
}

function answerMark(message, socket, options, held) {
  const args = message.args;
  const result = {
    scope: args.scope, track: args.track, lane: args.lane,
    clip: { ...args.clip, mark: args.mark },
  };
  if (options.holdMark) { defer(socket, message, result, held.mark); return; }
  send(socket, message, result);
}

function answer(message, socket, options, held, session) {
  if (message.cmd === 'getMappings') { send(socket, message, { mappings: {} }); return; }
  if (message.cmd === 'getRecordingTakes') { answerTakes(message, socket, options, held, session); return; }
  if (message.cmd === 'recordingMarkTake') { answerMark(message, socket, options, held); return; }
  if (message.cmd === 'getRecordingState' || message.cmd === 'recordingStop') {
    send(socket, message, options.snapshot ? options.snapshot() : SNAPSHOT);
    return;
  }
  send(socket, message, {});
}

/** The mock keeps the held replies and can change the live role on demand. */
async function setupTakesSocket(page, commands, options = {}) {
  const held = { takes: [], mark: [] };
  const session = { role: options.role || 'controller', takes: 0, socket: null, holdTakes: false };
  await page.routeWebSocket('**/ws*', socket => {
    session.socket = socket;
    socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') {
        socket.send(JSON.stringify({ type: 'hello', client_id: 'test-client', role: session.role }));
        return;
      }
      if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
      if (!message.cmd) return;
      commands.push(message);
      answer(message, socket, options, held, session);
    });
  });
  return { held, session };
}

/** The take list belongs to the focus of one track: the entry is the TAKES
 * action of the row of that track, never a global panel of its own. */
async function openFocusOfRow(page, index = 0) {
  const row = page.locator('#rec-track-grid .rec-track-row').nth(index);
  await row.locator('button').filter({ hasText: /^TAKES$/ }).click();
  await expect(page.locator('#rec-focus')).toBeVisible();
}

async function openTakes(page, viewport = { width: 851, height: 393 }) {
  await page.setViewportSize(viewport);
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The takes live in the Arrangement editor; Record is the default destination.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
}

/** The focus owns one track: another track is opened by its own row, after
 * the focus of the previous one is closed. */
async function readTrack(page, track = '0') {
  if (await page.locator('#rec-focus').isVisible()) {
    await page.locator('#rec-focus-all-tracks').click();
    await expect(page.locator('#rec-focus')).toBeHidden();
  }
  await openFocusOfRow(page, Number(track));
  await expect(page.locator('.rec-takes-clip')).toHaveCount(2);
}
for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 393 }, { width: 1280, height: 800 }]) {
  test(`the open take list expands below the combined band (${viewport.width}x${viewport.height})`, async ({ page }) => {
    const commands = [];
    await setupTakesSocket(page, commands);
    await openTakes(page, viewport);
    await readTrack(page);
    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const band = box('#rec-combined-band');
      const timeline = box('#rec-timeline');
      const takes = box('#rec-takes');
      return {
        bandBottom: band.bottom, timelineBottom: timeline.bottom,
        takesTop: takes.top, takesBottom: takes.bottom,
      };
    });
    expect(geometry.bandBottom, 'the combined band is above the editor').toBeLessThanOrEqual(geometry.takesTop + 1);
    expect(geometry.timelineBottom, 'the ruler is above the take list').toBeLessThanOrEqual(geometry.takesTop + 1);
    const clipped = await page.evaluate(() => {
      const list = document.querySelector('#rec-takes-list');
      return list.scrollHeight > list.clientHeight + 1;
    });
    expect(clipped).toBe(false, 'the open list is not cut off by an inner scrollbar');
  });
}

test('every clip and action of the open list is reachable by page scroll', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await openTakes(page);
  await readTrack(page);
  await page.locator('.rec-takes-clip').first().click();
  const reachable = await page.evaluate(() => {
    const shown = selector => {
      const element = document.querySelector(selector);
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
    };
    return {
      clip: shown('.rec-takes-clip'),
      good: shown('#rec-take-good'),
      clear: shown('#rec-take-clear'),
    };
  });
  expect(reachable).toEqual({ clip: true, good: true, clear: true });
});

test('STOP stays reachable while the open list is read', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await openTakes(page);
  await readTrack(page);
  await page.evaluate(() => {
    const surface = document.querySelector('#page-recording');
    surface.scrollTop = surface.scrollHeight;
  });
  const stop = await page.evaluate(() => {
    const rect = document.querySelector('#rec-stop').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  });
  const height = page.viewportSize().height;
  expect(stop.height).toBeGreaterThan(0);
  expect(stop.top).toBeGreaterThanOrEqual(-1);
  expect(stop.bottom).toBeLessThanOrEqual(height + 1);
});

test('the focus owns one track and reads exactly that track', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await openTakes(page);
  await readTrack(page);
  const reads = commands.filter(command => command.cmd === 'getRecordingTakes');
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) {
    expect(read.args.track, 'the read names the track of the focus').toEqual({ index: 0, id: 'track-0', name: 'Guitar' });
  }
  expect(commands.filter(command => command.cmd === 'recordingMarkTake')).toHaveLength(0);
  await expect(page.locator('#rec-takes-target')).toHaveText('');
});

test('a page read in flight disables the mark actions', async ({ page }) => {
  const commands = [];
  const { held, session } = await setupTakesSocket(page, commands, { holdTakes: true });
  await openTakes(page);
  await readTrack(page);
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-take-good')).toBeEnabled();
  // The read the test arms is the one that stays in flight.
  session.holdTakes = true;
  await page.locator('#rec-takes-reload').click();
  await expect(page.locator('#rec-take-good')).toBeDisabled();
  held.takes[0]();
  await expect(page.locator('.rec-takes-clip')).toHaveCount(2);
});

test('a session with another role clears the list', async ({ page }) => {
  const commands = [];
  const { session } = await setupTakesSocket(page, commands);
  await openTakes(page);
  await readTrack(page);
  session.role = 'viewer';
  session.socket.send(JSON.stringify({ type: 'hello', client_id: 'test-client', role: 'viewer' }));
  await expect(page.locator('.rec-takes-clip')).toHaveCount(0);
  await expect(page.locator('#rec-take-good')).toBeDisabled();
});

test('a note that lands after the list moved on is ignored', async ({ page }) => {
  const commands = [];
  const { held } = await setupTakesSocket(page, commands, { holdMark: true });
  await openTakes(page);
  await readTrack(page);
  await page.locator('.rec-takes-clip').first().click();
  await page.locator('#rec-take-good').click();
  await expect.poll(() => commands.filter(command => command.cmd === 'recordingMarkTake').length).toBe(1);
  // The focus moves to the other track: the note of the previous one lands
  // on a list that is gone.
  await readTrack(page, '1');
  held.mark[0]();
  await page.waitForTimeout(200);
  expect(commands.filter(command => command.cmd === 'recordingMarkTake')).toHaveLength(1);
  await expect(page.locator('#rec-takes-status')).not.toContainText('confirmed');
});

test('every write names exactly the chosen clip and nothing is replayed', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await openTakes(page);
  await readTrack(page);
  await page.locator('.rec-takes-clip').first().click();
  await page.locator('#rec-take-good').click();
  await expect.poll(() => commands.filter(command => command.cmd === 'recordingMarkTake').length).toBe(1);
  // The row is chosen again, by hand, before the next note.
  await page.locator('.rec-takes-clip').first().click();
  await page.locator('#rec-take-review').click();
  await expect.poll(() => commands.filter(command => command.cmd === 'recordingMarkTake').length).toBe(2);
  const notes = commands.filter(command => command.cmd === 'recordingMarkTake');
  expect(notes[0].args).toEqual({
    scope: 'song-scope-42',
    track: { index: 0, id: 'track-0', name: 'Guitar' },
    lane: { index: 0, id: 'lane-0', name: 'Lane 1' },
    clip: { index: 0, id: 'clip-0', name: 'Take 1', startTime: 0, endTime: 16, reference: 'ref-0' },
    mark: 'good',
  });
  expect(notes[1].args.mark).toBe('review');
  expect(notes[1].args.clip.reference).toBe('ref-0');
  expect(notes[1].args.lane).toEqual({ index: 0, id: 'lane-0', name: 'Lane 1' });
  expect(commands.filter(command => command.cmd === 'recordingMarkTake')).toHaveLength(2);
});

test('a cancelled note asks for the name in Live', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands, { holdMark: true });
  await openTakes(page);
  await readTrack(page);
  await page.locator('.rec-takes-clip').first().click();
  await page.locator('#rec-take-good').click();
  await expect.poll(() => commands.filter(command => command.cmd === 'recordingMarkTake').length).toBe(1);
  await page.locator('#rec-stop').click();
  await expect(page.locator('#rec-takes-status')).toContainText('Check the name in Live');
  expect(commands.filter(command => command.cmd === 'recordingMarkTake')).toHaveLength(1);
});
