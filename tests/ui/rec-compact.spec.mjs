// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The compact Record mode of the REC page: the page never scrolls, the track
// list owns the only vertical overflow and the capture controls stay fixed.
// The page is the real one of this repository and the host is a WebSocket
// mock: neither Ableton nor a Live server are involved.

import { test, expect } from '@playwright/test';

const field = value => ({ value, fresh: true, observedAt: Date.now() });

const VIEWPORTS = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 851, height: 393 },
  { width: 932, height: 430 },
  { width: 1280, height: 800 },
];

const LOCALES = [['en', 'Record'], ['pt-BR', 'Gravar']];

const LOCATORS = [
  { name: 'Intro', time: 0 },
  { name: 'Verse', time: 16 },
  { name: 'Chorus', time: 32 },
];

// The writes a local view must never send.
const WRITE_COMMANDS = ['recordingRecord', 'recordingSessionRecord', 'recordingStop', 'recordingSessionStop',
  'recordingArm', 'recordingArmTracks', 'recordingTrackControl', 'recordingTrackVolume', 'recordingClick',
  'recordingCreateMarker', 'recordingMark', 'recordingMarkTake', 'recordingSetPoint', 'recordingLocator',
  'recordingSeekMarker', 'recordingPrepare', 'recordingStart', 'recordingAudition', 'recordingRenameTrack',
  'recordingReturnToArrangement'];

// The destinations and the CLICK live in the header: never a 44px cell.
const FIXED_CONTROLS = ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages',
  'rec-start-marker', 'rec-end-marker', 'rec-arm-all', 'rec-arm-mode'];

/** The combined band: the arming controls, the ruler and the footer of the band. */
const FIXED_BAND = ['rec-combined-band', 'rec-combined-controls', 'rec-combined-editor', 'rec-combined-footer', 'rec-timeline', 'rec-arm-all', 'rec-arm-mode', 'rec-status'];

const BOX_EDGES = ['top', 'bottom', 'left', 'right', 'width', 'height'];

/** The boxes that every destination must share: the modes, the transport, the CLICK and the band. */
const SHARED_BOXES = ['rec-record-mode', 'rec-arrangement-mode', 'rec-clip-mode',
  'rec-start', 'rec-stop', 'rec-click', 'rec-capture-band'];

/** The native controls of the band in every destination: their hit area
 * never shrinks and the transport keeps its own cells of 88. */
const NATIVE = {
  record: ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages', 'rec-start-marker', 'rec-end-marker', 'rec-zoom'],
  arrangement: ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages', 'rec-start-marker', 'rec-end-marker', 'rec-zoom'],
  clip: ['rec-start', 'rec-stop', 'rec-bars-slot', 'rec-quant-slot', 'rec-session-bars', 'rec-session-quantization', 'rec-session-prev', 'rec-session-next'],
};
/** The cells of the band that keep their own width in every destination. */
const CELLS = { record: ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages'],
  arrangement: ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages'],
  clip: ['rec-start', 'rec-stop', 'rec-bars-slot', 'rec-quant-slot'] };
const MODES = ['record', 'arrangement', 'clip', 'record'];

/** The native geometry of the band: one row of 44 on a wide surface and two
 * rows of 44 on a narrow one, in every destination. */
function expectBandGeometry(boxes, wide, label) {
  for (const [index, mode] of MODES.entries()) {
    expect(boxes[index]['rec-capture-band'].height, label + ' ' + mode + ' band').toBeCloseTo(wide ? 44 : 92, 1);
    for (const id of NATIVE[mode]) expect(boxes[index][id].height, label + ' ' + mode + ' ' + id).toBeGreaterThanOrEqual(44);
    if (wide) for (const id of CELLS[mode]) expect(boxes[index][id].width, label + ' ' + mode + ' ' + id).toBeCloseTo(88, 1);
  }
}

function track(index, extra = {}) {
  return {
    index,
    id: 't-' + index,
    name: 'Input ' + (index + 1),
    arm: index === 0,
    canArm: true,
    solo: false,
    mute: false,
    volume: 0.5,
    volumeDefault: 0.5,
    groupId: null,
    isGroup: false,
    ...extra,
  };
}

/** A tree with a group, its children and plain tracks. */
function groupTracks() {
  return [
    track(0, { name: 'Drums' }),
    track(1, { name: 'Group A', arm: false, canArm: false, isGroup: true }),
    track(2, { name: 'Kick', arm: false, groupId: 't-1' }),
    track(3, { name: 'Snare', arm: false, groupId: 't-1' }),
    track(4, { name: 'Guitar' }),
  ];
}

function manyTracks(count) {
  return Array.from({ length: count }, (_, index) => track(index));
}

function snapshot(options) {
  const state = {
    scope: 'song-scope', trackTreeValid: true, pending: null, range: null, safety: {},
    transport: { connected: true, isPlaying: field(false), recordMode: field(false), songTimeBeats: field(0), metronome: field(false) },
    tracks: options.tracks || [track(0)], locators: options.locators || LOCATORS, meter: { numerator: 4, denominator: 4 },
    session: { songId: 'song-1', scenes: [], rows: [], owned: [], active: false },
  };
  return { ...state, ...(options.state || {}) };
}

/** The mock host answers the reads of the page and records every command.
 * The options are the state of the host itself: a volume write mutates its
 * own track and is answered with the whole snapshot. */
async function openRec(page, options = {}) {
  const commands = [];
  const role = options.role || 'controller';
  const host = { volume: null };
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') { socket.send(JSON.stringify({ type: 'hello', client_id: 'compact-test', role })); return; }
    if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
    if (!message.cmd) return;
    commands.push(message);
    if (message.cmd === 'getMappings') { socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } })); return; }
    if (message.cmd === 'recordingTrackVolume') {
      const args = message.args || {}, target = (options.tracks || [track(0)]).find(item => item.index === args.track?.index && item.id === args.track?.id);
      if (target) target.volume = args.volume;
      host.volume = args.volume;
      socket.send(JSON.stringify({ id: message.id, ok: true, result: snapshot(options) }));
      return;
    }
    const result = ['getRecordingState', 'getSessionRecordingState'].includes(message.cmd) ? snapshot(options) : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  await page.setViewportSize(options.viewport || VIEWPORTS[0]);
  await page.goto('/?lang=' + (options.locale || 'en'));
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', 'record');
  const rows = (options.tracks || [track(0)]).length;
  await page.waitForFunction(count => document.querySelectorAll('#rec-track-grid .rec-track-row').length === count, rows);
  return { commands, host };
}

/** The client and the scroll dimensions of every owner of a scroll. */
function scrollMetrics(page) {
  return page.evaluate(() => {
    const nodes = {
      document: document.scrollingElement,
      body: document.body,
      page: document.getElementById('page-recording'),
      workspace: document.querySelector('.rec-workspace'),
      list: document.getElementById('rec-track-grid'),
    };
    const out = {};
    for (const [key, node] of Object.entries(nodes)) {
      out[key] = {
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollTop: node.scrollTop,
      };
    }
    return out;
  });
}

/** The physical boxes of the fixed controls of the surface. */
function controlBoxes(page, ids = FIXED_CONTROLS) {
  return page.evaluate(list => {
    const out = { viewport: { width: window.innerWidth, height: window.innerHeight } };
    for (const id of list) {
      const rect = document.getElementById(id).getBoundingClientRect();
      out[id] = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    }
    return out;
  }, ids);
}

/** The width of the list against the width of the workspace. */
function listGeometry(page) {
  return page.evaluate(() => {
    const list = document.getElementById('rec-track-grid').getBoundingClientRect();
    const workspace = document.querySelector('.rec-workspace').getBoundingClientRect();
    return { listWidth: list.width, listHeight: list.height, workspaceWidth: workspace.width };
  });
}

/** A real touch gesture, driven by the browser itself: a touch start, six
 * moves with their own coordinates and frames, and a touch end. */
async function touchDrag(page, from, to, steps = 6) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y), id: 1 }] });
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(from.x + (to.x - from.x) * ratio), y: Math.round(from.y + (to.y - from.y) * ratio), id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await cdp.detach();
}

/** A real touch scroll on the name area of the list. */
async function touchScrollList(page) {
  const box = await page.locator('#rec-track-grid').boundingBox();
  const viewport = page.viewportSize();
  const x = box.x + 20;
  const y = Math.min(viewport.height - 16, box.y + box.height - 12);
  await touchDrag(page, { x, y }, { x, y: y - 60 });
}

async function shoot(page, testInfo, name) {
  const path = testInfo.outputPath(name + '.png');
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
test('REC opens in the compact Record mode and the page never scrolls', async ({ page }, testInfo) => {
  const { commands } = await openRec(page, { viewport: VIEWPORTS[0], tracks: manyTracks(50) });
  // The compact mode is the default and it is announced by the page itself.
  await expect(page.locator('#rec-record-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rec-arrangement-mode')).toHaveAttribute('aria-pressed', 'false');
  // The ruler of the capture belongs to the Record mode: it shows the
  // markers of the Set without the editor of a take.
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await expect(page.locator('.rec-marker')).toHaveCount(LOCATORS.length);
  // The take inspection belongs to the Arrangement alone.
  await expect(page.locator('#rec-focus')).toBeHidden();
  await expect(page.locator('#rec-takes')).toBeHidden();
  // The black knob of the click level is gone in every mode.
  await expect(page.locator('#rec-click-volume')).toHaveCount(0);
  await expect(page.locator('#rec-click')).toBeVisible();
  // The shared range is outside the editor: it stays reachable.
  await expect(page.locator('#rec-range-row')).toBeVisible();
  await expect(page.locator('#rec-start-marker')).toBeVisible();
  await expect(page.locator('#rec-end-marker')).toBeVisible();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);
    const metrics = await scrollMetrics(page);
    for (const key of ['document', 'body', 'page', 'workspace']) {
      expect(metrics[key].scrollHeight, key + ' must not overflow at ' + viewport.width + 'x' + viewport.height).toBeLessThanOrEqual(metrics[key].clientHeight + 2);
      expect(metrics[key].scrollWidth, key + ' must not overflow horizontally').toBeLessThanOrEqual(metrics[key].clientWidth + 2);
    }
    // Only the track list owns a vertical overflow.
    expect(metrics.list.scrollHeight).toBeGreaterThan(metrics.list.clientHeight);
  }
  await page.setViewportSize(VIEWPORTS[0]);
  await shoot(page, testInfo, 'rec-compact-many-tracks');
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
});

test('REC the track list owns the vertical overflow and the page never scrolls', async ({ page }) => {
  const { commands } = await openRec(page, { viewport: VIEWPORTS[0], tracks: manyTracks(50) });
  const list = page.locator('#rec-track-grid');
  await expect.poll(() => list.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  const before = await controlBoxes(page, [...FIXED_CONTROLS, ...FIXED_BAND]);
  await touchScrollList(page);
  const after = await scrollMetrics(page);
  expect(after.list.scrollTop, 'the real touch scrolls the list').toBeGreaterThan(0);
  for (const key of ['page', 'document', 'body', 'workspace']) expect(after[key].scrollTop, key).toBe(0);

  // A programmatic scroll of any other owner changes nothing at all.
  await page.evaluate(() => {
    document.getElementById('page-recording').scrollTop = 120;
    document.querySelector('.rec-workspace').scrollTop = 120;
    document.body.scrollTop = 120;
    document.scrollingElement.scrollTop = 120;
  });
  const forced = await scrollMetrics(page);
  for (const key of ['document', 'body', 'page', 'workspace']) expect(forced[key].scrollTop, key).toBe(0);

  // The fixed controls and the combined band never move while the list
  // scrolls: the ruler stays above the list.
  const boxes = await controlBoxes(page, [...FIXED_CONTROLS, ...FIXED_BAND]);
  for (const id of [...FIXED_CONTROLS, ...FIXED_BAND]) for (const edge of ['top', 'left', 'height']) {
    expect(boxes[id][edge], id + ' ' + edge + ' stays in place').toBeCloseTo(before[id][edge], 1);
  }
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd)), 'a touch never writes').toEqual([]);
});

test('REC the capture controls stay fixed, reachable and large enough', async ({ page }) => {
  await openRec(page, { viewport: VIEWPORTS[0], tracks: manyTracks(50) });
  const boxes = await controlBoxes(page);

  for (const id of FIXED_CONTROLS) {
    const box = boxes[id];
    expect(box.height, id + ' keeps a 44px touch target').toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(0);
    expect(box.top, id + ' is inside the viewport').toBeGreaterThanOrEqual(0);
    expect(box.bottom, id + ' is inside the viewport').toBeLessThanOrEqual(boxes.viewport.height);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(boxes.viewport.width);
  }

  // The four capture controls share one height, and REC and STOP share one
  // width: the transport is the same in every destination.
  const capture = ['rec-start', 'rec-stop', 'rec-pre-roll-inline', 'rec-passages'].map(id => boxes[id]);
  for (const box of capture) expect(box.height).toBeCloseTo(capture[0].height, 1);
  expect(capture[1].width).toBeCloseTo(capture[0].width, 1);
});

test('REC the three destinations share one geometry', async ({ page }) => {
  test.setTimeout(180000);
  for (const viewport of VIEWPORTS) {
    for (const [locale] of LOCALES) {
      const surface = await page.context().newPage();
      const { commands } = await openRec(surface, { viewport, locale, tracks: manyTracks(1) });
      await surface.evaluate(() => document.fonts.ready);
      const label = viewport.width + 'x' + viewport.height + ' (' + locale + ')';
      const boxes = [];
      for (const mode of MODES) {
        await surface.locator('#rec-' + mode + '-mode').click();
        await expect(surface.locator('#page-recording')).toHaveAttribute('data-rec-mode', mode);
        await surface.waitForTimeout(200);
        await surface.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        boxes.push(await controlBoxes(surface, [...SHARED_BOXES, ...NATIVE[mode]]));
      }
      for (const other of boxes.slice(1)) for (const id of SHARED_BOXES) for (const edge of BOX_EDGES) {
        expect(Math.abs(other[id][edge] - boxes[0][id][edge]), label + ' ' + id + ' ' + edge).toBeLessThanOrEqual(1);
      }
      // The native geometry of the band: one row of 44 on a wide surface and
      // two rows of 44 on a narrow one, in every destination.
      expectBandGeometry(boxes, viewport.width >= 851, label);
      expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd)), 'a local destination never writes').toEqual([]);
      await surface.close();
    }
  }
});

test('REC the fader moves its own value and never arms a track or moves the page', async ({ page }) => {
  const { commands, host } = await openRec(page, { viewport: VIEWPORTS[0], tracks: manyTracks(50) });
  const fader = page.locator('#rec-track-grid .rec-track-vol').first();
  const box = await fader.boundingBox();
  await touchDrag(page, { x: box.x + 8, y: box.y + box.height / 2 }, { x: box.x + 60, y: box.y + box.height / 2 });

  const writes = commands.filter(command => command.cmd === 'recordingTrackVolume');
  expect(writes.length, 'the gesture writes the native volume').toBeGreaterThan(0);
  expect(writes.at(-1).args.track.id).toBe('t-0');
  expect(writes.at(-1).args.volume).toBeGreaterThan(0.5);
  // The host answers with its own snapshot: the native target is confirmed.
  await expect.poll(() => host.volume).toBeGreaterThan(0.5);
  await expect.poll(async () => (await fader.getAttribute('aria-valuenow')) === String(host.volume)).toBe(true);
  expect(commands.filter(command => command.cmd === 'recordingTrackControl'), 'the fader never arms a track').toEqual([]);
  expect(commands.filter(command => command.cmd === 'recordingArm' || command.cmd === 'recordingArmTracks')).toEqual([]);
  expect(commands.filter(command => command.cmd === 'recordingRecord'), 'the fader never records').toEqual([]);
  const after = await scrollMetrics(page);
  expect(after.list.scrollTop).toBe(0);
  expect(after.page.scrollTop).toBe(0);
  expect(after.document.scrollTop).toBe(0);
});

test('REC the Record mode reads no Arrangement catalog', async ({ page }) => {
  const { commands } = await openRec(page, { viewport: VIEWPORTS[1], tracks: groupTracks() });
  await page.waitForTimeout(900);
  const catalogs = commands.filter(command => /catalog|wave|arrangement/i.test(command.cmd));
  expect(catalogs, 'a hidden editor reads no catalog').toEqual([]);
  expect(commands.filter(command => command.cmd === 'getRecordingState').length).toBeGreaterThan(0);
  // The group of the tree keeps its collective ARM and its own disclosure.
  const group = page.locator('#rec-track-grid [data-id="t-1"]');
  await expect(group.locator('.rec-track-group-toggle')).toBeVisible();
  await expect(group.locator('[data-property="arm"]')).toBeVisible();
  await expect(page.locator('#rec-track-grid [data-id="t-0"] .rec-track-group-toggle')).toBeHidden();
  await group.locator('.rec-track-group-toggle').click();
  await expect(group.locator('.rec-track-group-toggle')).toHaveAttribute('aria-expanded', 'false');
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd)), 'a disclosure never writes').toEqual([]);
});

test('REC a viewer keeps every control locked', async ({ page }) => {
  const { commands } = await openRec(page, { viewport: VIEWPORTS[0], role: 'viewer' });
  await expect(page.locator('#rec-start')).toBeDisabled();
  await expect(page.locator('#rec-click')).toBeDisabled();
  await expect(page.locator('#rec-track-grid [data-property="arm"]').first()).toBeDisabled();
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
});

test('REC a stale host keeps every control locked', async ({ page }) => {
  const { commands } = await openRec(page, {
    viewport: VIEWPORTS[0],
    state: {
      transport: {
        connected: true,
        isPlaying: { value: false, fresh: false },
        recordMode: field(false),
        songTimeBeats: field(0),
        metronome: field(false),
      },
    },
  });
  await expect(page.locator('#rec-start')).toBeDisabled();
  await expect(page.locator('#rec-start-marker')).toBeDisabled();
  await expect(page.locator('#rec-track-grid [data-property="arm"]').first()).toBeDisabled();
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
});

test('REC the local modes are locked while the host owns the capture', async ({ page }) => {
  const { commands } = await openRec(page, { viewport: VIEWPORTS[0], state: { pending: 'record' } });
  await expect(page.locator('#rec-record-mode')).toBeDisabled();
  await expect(page.locator('#rec-arrangement-mode')).toBeDisabled();
  await expect(page.locator('#rec-clip-mode')).toBeDisabled();
  // The native button is disabled: the reader cannot even aim at it, and a
  // tap that arrives anyway never switches the mode.
  await page.locator('#rec-clip-mode').dispatchEvent('click');
  await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', 'record');
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
});

test('REC a removed end marker blocks the capture in the Record mode', async ({ page }) => {
  const locators = [...LOCATORS];
  const { commands } = await openRec(page, { viewport: VIEWPORTS[0], locators });
  await expect(page.locator('#rec-start')).toBeEnabled();
  await page.locator('#rec-end-marker').selectOption('2');
  await expect(page.locator('#rec-end-marker')).toHaveValue('2');

  // The chosen end leaves the catalog: the capture is blocked, never widened.
  locators.splice(0, locators.length, ...LOCATORS.filter(cue => cue.name !== 'Chorus'));
  await expect.poll(() => page.locator('#rec-start').isDisabled(), { timeout: 8000 }).toBe(true);
  expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
});

test('REC the hidden editor is never measured and the Arrangement measures it', async ({ page }) => {
  await openRec(page, { viewport: VIEWPORTS[0], tracks: manyTracks(50) });
  await page.evaluate(() => {
    window.__laneRects = 0;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) {
      if (this.classList && this.classList.contains('rec-track-lane')) window.__laneRects += 1;
      return original.apply(this, args);
    };
  });
  // A poll of the page and a resize of the surface never measure a hidden
  // lane: the editor is not there.
  await page.waitForTimeout(1200);
  await page.setViewportSize(VIEWPORTS[1]);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__laneRects), 'a hidden lane is never measured').toBe(0);

  // The Arrangement owns the editor: its lanes are the real geometry.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__laneRects)).toBeGreaterThan(0);
});

for (const viewport of VIEWPORTS) {
  test(`REC the surface fills its width and the list keeps a readable height (${viewport.width}x${viewport.height})`,
    async ({ page }) => {
      test.setTimeout(180000);
      for (const [locale] of LOCALES) {
        for (const tracks of [manyTracks(0), manyTracks(1), manyTracks(50), groupTracks()]) {
          const surface = await page.context().newPage();
          await openRec(surface, { viewport, locale, tracks });
          const geometry = await listGeometry(surface);
          expect(geometry.listWidth, 'the list uses the width of the workspace')
            .toBeGreaterThan(geometry.workspaceWidth - 6);
          expect(geometry.listHeight, 'the list keeps a readable height').toBeGreaterThanOrEqual(44);
          const metrics = await scrollMetrics(surface);
          for (const key of ['document', 'body', 'page', 'workspace']) {
            expect(metrics[key].scrollHeight, key + ' never scrolls').toBeLessThanOrEqual(metrics[key].clientHeight + 2);
            expect(metrics[key].scrollWidth, key + ' never overflows horizontally').toBeLessThanOrEqual(metrics[key].clientWidth + 2);
          }
          await surface.close();
        }
      }
    });
}

for (const [locale, label] of LOCALES) {
  test(`REC the local mode follows the language and the Arrangement stays usable (${locale})`, async ({ page }, testInfo) => {    await openRec(page, { viewport: VIEWPORTS[2], locale, tracks: groupTracks() });
    await expect(page.locator('#rec-record-mode')).toHaveText(label);
    // The mode cells are uppercase in every language.
    expect(await page.locator('#rec-record-mode').evaluate(node => node.innerText)).toBe(label.toUpperCase());
    await shoot(page, testInfo, 'rec-compact-' + locale);
    // The Arrangement keeps its editor, its markers and the shared range.
    await page.locator('#rec-arrangement-mode').click();
    await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', 'arrangement');
    await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
    await expect(page.locator('.rec-marker')).toHaveCount(LOCATORS.length);
    await expect(page.locator('#rec-range-row')).toBeVisible();
    await expect(page.locator('#rec-start-marker')).toBeVisible();
    // The take inspection belongs to the Arrangement: the list of the takes
    // belongs to the focus of a track, so the overview shows no empty list.
    await expect(page.locator('#rec-takes')).toBeHidden();
    await expect(page.locator('#rec-focus')).toBeHidden();
    await expect(page.locator('#rec-click-volume')).toHaveCount(0);
    // The Clip keeps its own contract and shows no take editor.
    await page.locator('#rec-clip-mode').click();
    await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', 'clip');
    await expect(page.locator('#rec-session-panel')).toBeVisible();
    await expect(page.locator('#rec-takes')).toBeHidden();
    await expect(page.locator('#rec-focus')).toBeHidden();
    await expect(page.locator('#rec-click-volume')).toHaveCount(0);
  });
}
