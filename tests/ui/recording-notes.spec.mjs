// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

function createSnapshot(overrides = {}) {
  return {
    scope: 'song-scope-42',
    transport: {
      connected: true,
      isPlaying: field(false),
      recordMode: field(false),
      songTimeBeats: field(0),
      metronome: field(false),
    },
    tracks: [
      { index: 0, id: 'track-0', name: 'Guitar', arm: true, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73 },
      { index: 1, id: 'track-1', name: 'Bass', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73 },
    ],
    locators: [
      { name: 'Intro', time: 0 },
      { name: 'Verse', time: 16 },
      { name: 'Chorus', time: 32 },
    ],
    meter: { numerator: 4, denominator: 4 },
    pending: null,
    range: null,
    safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] },
    ...overrides,
  };
}

async function setupSocket(page, writes, getSnapshot) {
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'test-client', role: 'controller' }));
      return;
    }
    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }
    if (!message.cmd) return;
    if (message.cmd.startsWith('recording')) writes.push(message);
    if (message.cmd === 'getMappings') {
      socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } }));
      return;
    }
    const current = getSnapshot(message);
    if (current !== undefined) {
      socket.send(JSON.stringify({ id: message.id, ok: true, result: current }));
    }
  }));
}

for (const locale of ['en', 'pt-BR']) {
  test(`REC owns no marker action in any mode (${locale})`, async ({ page }) => {
    const writes = [];
    await setupSocket(page, writes, () => createSnapshot());
    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto('/?lang=' + locale);
    await page.locator('.tab[data-page="recording"]').click();
    // The marker is created in Live: the page has no action and no status.
    await expect(page.locator('#rec-add-marker')).toHaveCount(0);
    await expect(page.locator('#rec-marker-status')).toHaveCount(0);
    await expect(page.locator('#rec-marker-result')).toHaveCount(0);
    for (const mode of ['arrangement', 'clip']) {
      await page.locator('#rec-' + mode + '-mode').click();
      await expect(page.locator('#rec-add-marker')).toHaveCount(0);
    }
    expect(writes.filter(w => w.cmd === 'recordingCreateMarker')).toEqual([]);
  });
}

test('the page never issues a marker command on its own', async ({ page }) => {
  const writes = [];
  await setupSocket(page, writes, () => createSnapshot());
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The capture band of the Arrangement owns the range of the capture.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await page.waitForTimeout(500);
  expect(writes.filter(w => w.cmd === 'recordingCreateMarker')).toEqual([]);
});

test('during busy record STOP remains enabled', async ({ page }) => {
  const writes = [];
  let recordPending = false;
  await setupSocket(page, writes, msg => {
    if (msg.cmd === 'recordingRecord') {
      recordPending = true;
      return undefined;
    }
    return createSnapshot(recordPending ? { pending: 'record' } : {});
  });
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The capture band of the Arrangement owns the range of the capture.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();

  await page.locator('#rec-start-marker').selectOption('0');
  await page.locator('#rec-start').click();

  await expect(page.locator('#rec-stop')).toBeEnabled();
});

test('narrow viewport preserves layout without overflow and retains START/END selections', async ({ page }) => {
  const writes = [];
  await setupSocket(page, writes, () => createSnapshot());
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The capture band of the Arrangement owns the range of the capture.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();

  await page.locator('#rec-start-marker').selectOption('1');
  await page.locator('#rec-end-marker').selectOption('2');
  expect(await page.locator('#rec-start-marker').inputValue()).toBe('1');
  expect(await page.locator('#rec-end-marker').inputValue()).toBe('2');

  for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 393 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    // The ruler follows the lane of the new width: the axis settles and the
    // surface is measured once it carries the measured lane again.
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('#page-recording');
      return el.scrollWidth > el.clientWidth + 2;
    })).toBe(false);
    expect(await page.locator('#rec-start-marker').inputValue()).toBe('1');
    expect(await page.locator('#rec-end-marker').inputValue()).toBe('2');
  }
});

test('a mock lacking a scope never breaks the page', async ({ page }) => {
  const writes = [];
  await setupSocket(page, writes, () => {
    const snap = createSnapshot();
    delete snap.scope;
    return snap;
  });
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The capture band of the Arrangement owns the range of the capture.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await expect(page.locator('#rec-stop')).toBeEnabled();
});

const TAKES_SNAPSHOT = {
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

function takesCatalog(overrides = {}) {
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

/** The mock keeps the held replies so a test can release an old one late. */
async function setupTakesSocket(page, commands, options = {}) {
  const held = [];
  const state = { clips: {} };
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'test-client', role: options.role || 'controller' }));
      return;
    }
    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }
    if (!message.cmd) return;
    commands.push(message);
    replyTakes(message, socket, options, held, state);
  }));
  return held;
}

/** The native prefixes of a marked clip, brackets, colon and space included. */
const GOOD_PREFIX = '[RC:GOOD] ';
const REVIEW_PREFIX = '[RC:REVIEW] ';

/** A marked clip carries the prefix that the host gave it. */
function markName(message) {
  const base = String(message.args.clip.name).replace(/^(\[RC:(?:GOOD|REVIEW)\] )+/, '');
  if (message.args.mark === 'good') return GOOD_PREFIX + base;
  if (message.args.mark === 'review') return REVIEW_PREFIX + base;
  return base;
}

/** The catalog that a re-read sees: the names and the marks of the host. */
function markedCatalog(state) {
  const base = takesCatalog();
  const clips = base.lanes[0].clips.map(clip => {
    const marked = state.clips[clip.id];
    return marked ? { ...clip, name: marked.name, mark: marked.mark } : clip;
  });
  return { ...base, lanes: [{ ...base.lanes[0], clips }] };
}

function replyTakes(message, socket, options, held, state) {
  if (message.cmd === 'getMappings') {
    socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } }));
    return;
  }
  const answer = result => {
    const payload = JSON.stringify({ id: message.id, ok: true, result });
    if (options.hold && message.cmd === 'getRecordingTakes') { held.push(() => socket.send(payload)); return; }
    socket.send(payload);
  };
  if (message.cmd === 'getRecordingState') { answer(options.snapshot ? options.snapshot() : TAKES_SNAPSHOT); return; }
  if (message.cmd === 'getRecordingTakes') { answer(options.catalog ? options.catalog(message, state) : markedCatalog(state)); return; }
  if (message.cmd === 'recordingMarkTake') {
    const name = options.mark ? options.mark(message, state) : markName(message);
    state.clips[message.args.clip.id] = { name, mark: message.args.mark };
    answer({
      ...(options.snapshot ? options.snapshot() : TAKES_SNAPSHOT),
      scope: message.args.scope,
      track: message.args.track,
      lane: message.args.lane,
      clip: { ...message.args.clip, name, mark: message.args.mark },
    });
    return;
  }
  answer({});
}

/** The take list belongs to the focus of one track: the entry is the TAKES
 * action of the row of that track, never a global panel of its own. */
async function openFocusOfRow(page, index = 0) {
  const row = page.locator('#rec-track-grid .rec-track-row').nth(index);
  await row.locator('button').filter({ hasText: /^TAKES$/ }).click();
  await expect(page.locator('#rec-focus')).toBeVisible();
}

async function openTakes(page) {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The take lanes belong to the editor of the Arrangement.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await openFocusOfRow(page);
}

test('take-lane list sits below the timeline and before the track cards', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The take lanes belong to the editor of the Arrangement.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  const placement = await page.evaluate(() => {
    const FOLLOWING = 4;
    const before = (a, b) => !!(a.compareDocumentPosition(b) & FOLLOWING);
    const takes = document.getElementById('rec-takes');
    return {
      inRec: document.getElementById('page-recording').contains(takes),
      afterTimeline: before(document.getElementById('rec-timeline'), takes),
      afterRange: before(document.getElementById('rec-start-marker'), takes),
      bandBefore: before(document.getElementById('rec-combined-band'), takes),
      beforeGrid: before(takes, document.getElementById('rec-track-grid')),
      summary: document.querySelector('#rec-takes > summary').textContent,
    };
  });
  expect(placement.inRec).toBe(true);
  expect(placement.afterTimeline).toBe(true);
  expect(placement.afterRange).toBe(true);
  expect(placement.bandBefore).toBe(true);
  expect(placement.beforeGrid).toBe(true);
  expect(placement.summary).toBe('Take lanes');
});

test('opening the focus of a track and choosing a clip read without writing', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands);
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  // The take lanes belong to the editor of the Arrangement.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  expect(commands.filter(c => c.cmd === 'getRecordingTakes')).toHaveLength(0);
  expect(commands.filter(c => c.cmd.startsWith('recording'))).toHaveLength(0);

  await openFocusOfRow(page);
  await expect(page.locator('.rec-takes-clip')).toHaveCount(2);
  const reads = commands.filter(c => c.cmd === 'getRecordingTakes');
  expect(reads.length, 'the focus reads the take lanes once').toBe(1);
  expect(reads[0].args).toEqual({
    scope: 'song-scope-42',
    track: { index: 0, id: 'track-0', name: 'Guitar' },
    laneOffset: 0,
    clipOffset: 0,
  });
  expect(commands.filter(c => c.cmd.startsWith('recording'))).toHaveLength(0);

  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-takes-target')).toHaveText('Take 1');
  expect(commands.filter(c => c.cmd === 'getRecordingTakes')).toHaveLength(1);
  expect(commands.filter(c => c.cmd.startsWith('recording'))).toHaveLength(0);
});

/** The catalog is read again after a confirmed mark. */
function readsAfterMark(commands) {
  const index = commands.findIndex(command => command.cmd === 'recordingMarkTake');
  if (index < 0) return 0;
  return commands.slice(index + 1).filter(command => command.cmd === 'getRecordingTakes').length;
}

test('GOOD, REVIEW and no mark address exactly the chosen clip', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands, { mark: markName });
  await openTakes(page);
  await page.locator('.rec-takes-clip').first().click();

  await page.locator('#rec-take-good').click();
  await expect.poll(() => commands.filter(c => c.cmd === 'recordingMarkTake').length).toBe(1);
  const notes = commands.filter(c => c.cmd === 'recordingMarkTake');
  expect(notes[0].args).toEqual({
    scope: 'song-scope-42',
    track: { index: 0, id: 'track-0', name: 'Guitar' },
    lane: { index: 0, id: 'lane-0', name: 'Lane 1' },
    clip: { index: 0, id: 'clip-0', name: 'Take 1', startTime: 0, endTime: 16, reference: 'ref-0' },
    mark: 'good',
  });
  await expect(page.locator('#rec-takes-status')).toContainText('Take 1');

  // The confirmed mark is kept and the page is read again, but the row is not
  // selected again: the reader chooses it once more by hand.
  await expect.poll(() => readsAfterMark(commands)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.rec-takes-clip').first()).toContainText('[RC:GOOD] Take 1');
  expect(await page.locator('.rec-takes-clip').first().getAttribute('aria-pressed')).not.toBe('true');
  const confirmed = await page.locator('.rec-takes-clip').first().evaluate(el => ({
    mark: el.getAttribute('data-mark'),
    text: (el.querySelector('.rec-takes-clip-mark') || {}).textContent || '',
  }));
  expect(`${confirmed.mark} ${confirmed.text}`.toLowerCase()).toContain('good');
  const goodName = (await page.locator('.rec-takes-clip').first().locator('.rec-takes-clip-name').textContent()).trim();
  expect(goodName).toBe('[RC:GOOD] Take 1');

  // The row is chosen again by hand before the next note.
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-takes-target')).toContainText('[RC:GOOD] Take 1');
  await page.locator('#rec-take-review').click();
  await expect.poll(() => commands.filter(c => c.cmd === 'recordingMarkTake').length).toBe(2);
  const reviewed = commands.filter(c => c.cmd === 'recordingMarkTake')[1].args;
  expect(reviewed.mark).toBe('review');
  expect(reviewed.clip.name).toBe(goodName);
  expect(reviewed.clip.reference).toBe('ref-0');
  expect(reviewed.lane).toEqual({ index: 0, id: 'lane-0', name: 'Lane 1' });

  await expect.poll(() => readsAfterMark(commands)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.rec-takes-clip').first()).toContainText('[RC:REVIEW] Take 1');
  expect(await page.locator('.rec-takes-clip').first().getAttribute('aria-pressed')).not.toBe('true');
  // The row is chosen again by hand before the last note.
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-takes-target')).toContainText('[RC:REVIEW] Take 1');
  await page.locator('#rec-take-clear').click();
  await expect.poll(() => commands.filter(c => c.cmd === 'recordingMarkTake').length).toBe(3);
  const cleared = commands.filter(c => c.cmd === 'recordingMarkTake')[2].args;
  expect(cleared.mark).toBeNull();
  expect(cleared.clip.name).toBe('[RC:REVIEW] Take 1');
  expect(cleared.clip.reference).toBe('ref-0');
  expect(cleared.lane).toEqual({ index: 0, id: 'lane-0', name: 'Lane 1' });
});

test('a hostile clip name is shown as text and never as markup', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands, {
    catalog: () => takesCatalog({
      lanes: [{
        index: 0,
        id: 'lane-0',
        name: '<b id="lane-xss">Lane</b>',
        clips: [{
          index: 0, id: 'clip-0', name: '<img id="clip-xss" src=x onerror="window.__pwned=1">',
          startTime: 0, endTime: 16, mark: null, reference: 'ref-0',
        }],
      }],
    }),
  });
  await openTakes(page);
  await expect(page.locator('.rec-takes-clip-name')).toContainText('<img id="clip-xss"');
  expect(await page.locator('#clip-xss').count()).toBe(0);
  expect(await page.locator('#lane-xss').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a new page replaces the old list and a stale reply never comes back', async ({ page }) => {
  const commands = [];
  const held = await setupTakesSocket(page, commands, {
    hold: true,
    catalog: message => message.args.laneOffset === 4
      ? takesCatalog({
        lanes: [{ index: 4, id: 'lane-4', name: 'Lane 5', clips: [{ index: 0, id: 'clip-9', name: 'Take 9', startTime: 64, endTime: 80, mark: null, reference: 'ref-9' }] }],
        page: { laneOffset: 4, clipOffset: 0, next: null },
      })
      : takesCatalog({ page: { laneOffset: 0, clipOffset: 0, next: { laneOffset: 4, clipOffset: 0 } } }),
  });
  await openTakes(page);
  await page.locator('#rec-takes-reload').click();
  await expect.poll(() => commands.filter(c => c.cmd === 'getRecordingTakes').length).toBe(2);
  held[0]();
  await page.waitForTimeout(200);
  await expect(page.locator('.rec-takes-clip')).toHaveCount(0);
});

test('a viewer never writes a mark', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands, { role: 'viewer' });
  await openTakes(page);
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-take-good')).toBeDisabled();
  await expect(page.locator('#rec-take-review')).toBeDisabled();
  await expect(page.locator('#rec-take-clear')).toBeDisabled();
  expect(commands.filter(c => c.cmd === 'recordingMarkTake')).toHaveLength(0);
});

test('a running Live never writes a mark', async ({ page }) => {
  const commands = [];
  await setupTakesSocket(page, commands, {
    snapshot: () => ({
      ...TAKES_SNAPSHOT,
      transport: { ...TAKES_SNAPSHOT.transport, isPlaying: field(true) },
    }),
  });
  await openTakes(page);
  await page.locator('.rec-takes-clip').first().click();
  await expect(page.locator('#rec-take-good')).toBeDisabled();
  expect(commands.filter(c => c.cmd === 'recordingMarkTake')).toHaveLength(0);
});
