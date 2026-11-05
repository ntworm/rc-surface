// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The header of the REC page: the local destinations live in a thin line
// under the top bar and the CLICK lives in the top bar itself. No global
// control moves: the REC page carries the same header as the PERF page, in
// every width, in both states of the fullscreen and with the OSC connected
// or disconnected.
//
// The page is the real one of this repository and the host is a WebSocket
// mock: neither Ableton nor a Live server are involved.

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 800, height: 360 },
  { width: 801, height: 393 },
  { width: 851, height: 393 },
  { width: 932, height: 430 },
  { width: 960, height: 414 },
  { width: 1001, height: 700 },
  { width: 1280, height: 800 },
];
const LOCALES = ['en', 'pt-BR'];

// The header of the page: the tabs, the transport, the modes of the header
// and the status. The REC page keeps the box of every one of them.
const HEADER = ['.tab[data-page="performance"]', '.tab[data-page="mixer"]', '.tab[data-page="snapshots"]',
  '.tab[data-page="sensors"]', '.tab[data-page="audio"]', '.tab[data-page="video"]', '.tab[data-page="recording"]',
  '#live-bpm', '#btn-header-prev', '#btn-header-play', '#btn-header-next', '#btn-trn-mode',
  '#btn-sync-mode', '#btn-stage-mode', '#status', '.topbar'];
// The local controls of the REC page leave the header: the global ones
// never move with them.
const REC_HEADER_OFF = '#rec-click, #rec-header-modes { display: none !important; }'
  + ' .topbar { margin-bottom: 0 !important; }';
// The destinations and the CLICK of the header.
const MODES = ['#rec-record-mode', '#rec-arrangement-mode', '#rec-clip-mode'];
// The content of the REC page never gets smaller than the reviewed
// candidate (owner, .hub-review/claude-arr-baseline.jsonl): the first
// value is the fullscreen off, the second one the fullscreen on.
const CONTENT_MINIMUM = {
  '568x320': [50, 44],
  '667x375': [105, 99],
  '800x360': [90, 84],
  '851x393': [197, 193],
  '932x430': [234, 230],
};

/** The mock host answers the reads of the page and nothing else. */
function liveMock(page) {
  const field = value => ({ value, fresh: true, observedAt: Date.now() });
  const recording = () => ({
    transport: { connected: true, isPlaying: field(false), recordMode: field(false), songTimeBeats: field(0), metronome: field(false) },
    tracks: [{ index: 0, id: 'd', name: 'Drums', arm: false, canArm: true, solo: false, mute: false, volume: .5 }],
    locators: [{ name: 'Intro', time: 0 }, { name: 'Verse', time: 32 }, { name: 'Chorus', time: 64 }],
    meter: { numerator: 4, denominator: 4 }, pending: null, range: null, capture: null, safety: {},
    session: { songId: 's', scenes: [], rows: [], owned: [] },
  });
  return page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'rec-header', role: 'controller' }));
    if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    if (!message.cmd) return;
    let result = { ok: true };
    if (message.cmd === 'getRecordingState') result = recording();
    else if (message.cmd === 'getMappings') result = { mappings: {} };
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
}

/** The physical boxes of the given selectors. A hidden control has no box
 * and never enters the comparison. */
function boxes(page, selectors) {
  return page.evaluate(list => {
    const out = {};
    for (const selector of list) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const box = node.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      out[selector] = { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    }
    return out;
  }, selectors);
}

/** Every control of the header keeps its own box. */
function sameBoxes(before, after, label) {
  for (const selector of Object.keys(before)) {
    if (!after[selector]) continue;
    for (const axis of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(after[selector][axis] - before[selector][axis]),
        `${label} ${selector} ${axis}`).toBeLessThanOrEqual(1);
    }
  }
}

/** The pairs of visible header controls that cover each other. */
function overlaps(page) {
  return page.evaluate(() => {
    const selectors = ['#rec-header-modes .rec-header-mode', '#rec-click', '.topbar .tab', '#live-bpm',
      '#btn-header-prev', '#btn-header-play', '#btn-header-next', '#btn-trn-mode', '#btn-map-mode',
      '#btn-aut-mode', '#btn-cfg-mode', '#btn-sync-mode', '#btn-stage-mode', '#status'];
    const visible = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (getComputedStyle(node).visibility === 'hidden') continue;
        visible.push({ id: node.id || selector, box });
      }
    }
    // The pairs of boxes that cover each other.
    const hits = (boxes) => {
      const found = [];
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].box, b = boxes[j].box;
        if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) found.push(boxes[i].id + ' x ' + boxes[j].id);
      }
      return found;
    };
    return hits(visible);
  });
}

for (const locale of LOCALES) for (const viewport of VIEWPORTS) {
  test(`the REC header keeps the header of the PERF page (${locale} ${viewport.width}x${viewport.height})`, async ({ page }) => {
    test.setTimeout(120000);
    await liveMock(page);
    await page.setViewportSize(viewport);
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    const label = `${locale} ${viewport.width}x${viewport.height}`;
    for (const stage of [false, true]) {
      if (stage) await page.locator('#btn-stage-mode').click();
      for (const connected of [true, false]) {
        // The state of the OSC changes the width of the status at runtime:
        // the header is compared with the same state on both measures.
        await page.evaluate(value => window.updateOscStatus(false, value), connected);
        await page.locator('.tab[data-page="recording"]').click();
        await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
        const rec = await boxes(page, HEADER);
        // The local controls of the REC page leave the header: the tabs, the
        // transport, the modes of the header, the status and the top bar
        // keep their own box, in every state of the page.
        const style = await page.addStyleTag({ content: REC_HEADER_OFF });
        const plain = await boxes(page, HEADER);
        await style.evaluate(node => node.remove());
        sameBoxes(rec, plain, `${label} stage=${stage} osc=${connected}`);
        // The page of the REC starts below the thin line of the header.
        const line = await boxes(page, ['#rec-header-modes', '#page-recording']);
        expect(line['#rec-header-modes'], `${label} the thin line exists`).toBeTruthy();
        expect(line['#page-recording'].y, `${label} the page starts under the thin line`)
          .toBeGreaterThanOrEqual(line['#rec-header-modes'].bottom - 0.5);
        // The PERF page keeps the original place: no reserved line.
        await page.locator('.tab[data-page="performance"]').click();
        const perf = await boxes(page, ['.topbar', '.page-performance']);
        expect(perf['.page-performance'].y, `${label} the PERF page keeps its place`)
          .toBeLessThanOrEqual(perf['.topbar'].bottom + 0.5);
        await page.locator('.tab[data-page="recording"]').click();
      }
      if (stage) await page.locator('#btn-stage-mode').click();
    }
  });
}

for (const locale of LOCALES) for (const viewport of VIEWPORTS) {
  test(`the REC header shows the CLICK and the destinations (${locale} ${viewport.width}x${viewport.height})`, async ({ page }) => {
    test.setTimeout(120000);
    await liveMock(page);
    await page.setViewportSize(viewport);
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    const label = `${locale} ${viewport.width}x${viewport.height}`;
    for (const stage of [false, true]) {
      if (stage) await page.locator('#btn-stage-mode').click();
      for (const connected of [true, false]) {
        await page.evaluate(value => window.updateOscStatus(false, value), connected);
        await page.locator('.tab[data-page="recording"]').click();
        await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
        const bar = (await boxes(page, ['.topbar']))['.topbar'];
        const click = (await boxes(page, ['#rec-click']))['#rec-click'];
        const line = (await boxes(page, ['#rec-header-modes']))['#rec-header-modes'];
        // The CLICK is whole inside the top bar.
        expect(click, `${label} the CLICK is visible`).toBeTruthy();
        expect(click.x, `${label} the CLICK starts inside the top bar`).toBeGreaterThanOrEqual(bar.x - 0.5);
        expect(click.right, `${label} the CLICK ends inside the top bar`).toBeLessThanOrEqual(bar.right + 0.5);
        expect(click.y, `${label} the CLICK is in the top bar`).toBeGreaterThanOrEqual(bar.y - 0.5);
        expect(click.bottom, `${label} the CLICK is in the top bar`).toBeLessThanOrEqual(bar.bottom + 0.5);
        // The whole status of the metronome fits: no ellipsis and no cut.
        const fit = await page.locator('#rec-click').evaluate(node => ({
          scroll: node.scrollWidth, client: node.clientWidth, ellipsis: getComputedStyle(node).textOverflow,
        }));
        expect(fit.scroll, `${label} the CLICK is never cut`).toBeLessThanOrEqual(fit.client);
        expect(fit.ellipsis, `${label} the CLICK hides nothing`).not.toBe('ellipsis');
        // The destinations live in the thin line under the top bar.
        expect(line, `${label} the thin line is visible`).toBeTruthy();
        expect(line.height, `${label} the thin line is 26px`).toBeCloseTo(26, 0);
        expect(line.y, `${label} the thin line is right below the top bar`).toBeGreaterThanOrEqual(bar.bottom - 1);
        for (const selector of MODES) {
          const mode = (await boxes(page, [selector]))[selector];
          expect(mode, `${label} ${selector} is visible`).toBeTruthy();
          expect(mode.y, `${label} ${selector} is inside the thin line`).toBeGreaterThanOrEqual(line.y - 0.5);
          expect(mode.bottom, `${label} ${selector} is inside the thin line`).toBeLessThanOrEqual(line.bottom + 0.5);
        }
        // Nothing covers anything else: the destinations, the CLICK and the
        // global controls are apart.
        expect(await overlaps(page), `${label} nothing overlaps`).toEqual([]);
      }
      if (stage) await page.locator('#btn-stage-mode').click();
    }
    // Outside the REC page the group and the CLICK are gone.
    await page.locator('.tab[data-page="performance"]').click();
    await expect(page.locator('#rec-header-modes')).toBeHidden();
    await expect(page.locator('#rec-click')).toBeHidden();
    const bar = (await boxes(page, ['.topbar']))['.topbar'];
    const perf = (await boxes(page, ['.page-performance']))['.page-performance'];
    expect(perf.y, 'the content returns to the original place').toBeLessThanOrEqual(bar.bottom + 0.5);
  });
}

for (const locale of LOCALES) for (const viewport of VIEWPORTS) {
  test(`the REC destinations and the CLICK keep one geometry (${locale} ${viewport.width}x${viewport.height})`, async ({ page }) => {
    test.setTimeout(120000);
    await liveMock(page);
    await page.setViewportSize(viewport);
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    const label = `${locale} ${viewport.width}x${viewport.height}`;
    const measured = [];
    for (const mode of ['record', 'arrangement', 'clip']) {
      await page.locator('.tab[data-page="recording"]').click();
      await page.locator('#rec-' + mode + '-mode').click();
      await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', mode);
      await page.waitForTimeout(150);
      measured.push(await boxes(page, [...MODES, '#rec-click', '#rec-start', '#rec-stop', '.rec-bta-slot']));
    }
    const first = measured[0];
    for (const other of measured.slice(1)) for (const selector of Object.keys(first)) {
      for (const axis of ['x', 'y', 'width', 'height']) {
        expect(Math.abs(other[selector][axis] - first[selector][axis]),
          `${label} ${selector} ${axis} keeps its geometry`).toBeLessThanOrEqual(1);
      }
    }
  });
}

for (const viewport of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 800, height: 360 },
  { width: 851, height: 393 }, { width: 932, height: 430 }]) {
  test(`the REC content never gets smaller than the reviewed candidate (${viewport.width}x${viewport.height})`, async ({ page }) => {
    test.setTimeout(120000);
    await liveMock(page);
    await page.setViewportSize(viewport);
    await page.goto('/?lang=en');
    await page.evaluate(() => document.fonts.ready);
    const minimum = CONTENT_MINIMUM[viewport.width + 'x' + viewport.height];
    for (const stage of [false, true]) {
      if (stage) await page.locator('#btn-stage-mode').click();
      for (const mode of ['record', 'arrangement']) {
        await page.locator('.tab[data-page="recording"]').click();
        await page.locator('#rec-' + mode + '-mode').click();
        await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', mode);
        await page.waitForTimeout(200);
        const content = await page.locator('#rec-content').evaluate(node => node.getBoundingClientRect().height);
        expect(content, `${viewport.width}x${viewport.height} ${mode} stage=${stage}`).toBeGreaterThanOrEqual(minimum[stage ? 1 : 0]);
      }
      if (stage) await page.locator('#btn-stage-mode').click();
    }
  });
}

test('the compact Record mode keeps a readable list and the document never scrolls', async ({ page }) => {
  await liveMock(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
  const list = await page.locator('#rec-track-grid').evaluate(node => node.getBoundingClientRect().height);
  expect(list, 'the list of tracks keeps a readable height').toBeGreaterThanOrEqual(48);
  const scroll = await page.evaluate(() => ({
    document: document.scrollingElement.scrollHeight, view: window.innerHeight,
  }));
  expect(scroll.document, 'the document never scrolls').toBeLessThanOrEqual(scroll.view + 1);
});
