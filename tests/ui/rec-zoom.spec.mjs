// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

// The physical width of the track follows the measured scrollport and the
// real gutter: the layout is verified, never a literal of the style.
const trackWidthGap = (page, zoom) => page.evaluate((factor) => {
  const timeline = document.getElementById('rec-timeline');
  const track = document.getElementById('rec-timeline-track');
  const gutter = parseFloat(getComputedStyle(timeline).getPropertyValue('--rec-gutter')) || 0;
  const expected = timeline.clientWidth * factor - 2 * gutter;
  return Math.abs(track.getBoundingClientRect().width - expected);
}, zoom);

for (const locale of ['en', 'pt-BR']) {
  test(`REC zoom is flat, keyboard visible and keeps native range interaction (${locale})`, async ({ page }, testInfo) => {
    // Optional negative proof changes the response only, never product files.
    const mutation = process.env.RC_REC_ZOOM_MUTATION ? JSON.parse(process.env.RC_REC_ZOOM_MUTATION) : null;
    if (mutation) await page.route('**/recording.css', async route => {
      const response = await route.fetch(), source = await response.text();
      if (!source.includes(mutation.from)) throw new Error('Missing zoom mutation target');
      await route.fulfill({ response, body: source.replace(mutation.from, mutation.to) });
    });
    const commands = [];
    await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'zoom-test', role: 'controller' }));
      if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      if (!message.cmd) return;
      commands.push(message.cmd);
      const observed = value => ({ value, fresh: true, observedAt: Date.now() });
      const result = ['getRecordingState','recordingSeekMarker'].includes(message.cmd) ? {
        transport: { connected: true, isPlaying: observed(false), recordMode: observed(false),
          songTimeBeats: observed(8), metronome: observed(false) },
        tracks: [{ index: 0, id: 'zoom-track', name: 'Drums', arm: false, canArm: true, solo: false, mute: false }],
        locators: [{ name: 'Verse', time: 8 }, { name: 'Chorus', time: 24 }, { name: 'End', time: 40 }],
        meter: { numerator: 4, denominator: 4 },
      } : message.cmd === 'getMappings' ? { mappings: {} } : {};
      socket.send(JSON.stringify({ id: message.id, ok: true, result }));
    }));
    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.tab[data-page="recording"]').click();
    await expect(page.locator('.rec-marker')).toHaveCount(3);
    // The ruler and its zoom belong to the editor of the Arrangement. The
    // Record mode stays the default and never reads a hidden row.
    await page.locator('#rec-arrangement-mode').click();
    await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
    const zoom = page.locator('#rec-zoom');
    await expect(zoom).toHaveAttribute('type', 'range');
    await expect(zoom).toHaveAttribute('min', '1');
    await expect(zoom).toHaveAttribute('max', '300');
    await expect(zoom).toHaveAttribute('step', '1');

    for (const viewport of [{ width: 851, height: 393 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await zoom.focus();
      await zoom.press('Home');
      await page.locator('#rec-position').click();
      await page.locator('.rec-marker-strip').screenshot({ path: testInfo.outputPath(`rec-zoom-${locale}-${viewport.width}-idle.png`) });
      const geometry = await zoom.evaluate(el => ({ width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height, appearance: getComputedStyle(el).appearance,
        radius: getComputedStyle(el).borderRadius, background: getComputedStyle(el).backgroundColor }));
      // The ZOOM owns a fixed context cell: the range is measured inside
      // its own slot, never against a literal of the style.
      const slot = await zoom.evaluate(el => {
        const label = el.closest('label');
        const caption = label.querySelector('.rec-slot-label');
        const slotBox = label.getBoundingClientRect();
        const captionBox = caption.getBoundingClientRect();
        const inputBox = el.getBoundingClientRect();
        return { slotWidth: slotBox.width, slotLeft: slotBox.left, slotRight: slotBox.right,
          captionRight: captionBox.right, inputLeft: inputBox.left, inputRight: inputBox.right,
          inputWidth: inputBox.width, inputHeight: inputBox.height };
      });
      expect(slot.slotWidth, 'the ZOOM keeps its own context cell').toBeCloseTo(112, 0);
      expect(slot.inputWidth, 'the range keeps a real touch width').toBeGreaterThanOrEqual(44);
      expect(slot.inputHeight, 'the range keeps a full touch height').toBeGreaterThanOrEqual(44);
      expect(slot.inputLeft, 'the range sits after the caption of its slot').toBeGreaterThanOrEqual(slot.captionRight - 1);
      expect(slot.inputLeft, 'the range never leaves its slot').toBeGreaterThanOrEqual(slot.slotLeft - 1);
      expect(slot.inputRight, 'the range never overflows its slot').toBeLessThanOrEqual(slot.slotRight + 1);
      expect(geometry.height, 'range has a full touch interaction area').toBeGreaterThanOrEqual(44);
      expect(geometry.appearance, 'replace the browser-default rounded slider').toBe('none');
      expect(geometry.radius).toBe('0px');
      expect(geometry.background).toBe('rgba(0, 0, 0, 0)');

      await zoom.focus();
      await zoom.press('ArrowRight');
      await expect(zoom).toHaveValue('2');
      await expect.poll(() => trackWidthGap(page, 2)).toBeLessThanOrEqual(2);
      await expect(zoom).toBeFocused();
      expect(await zoom.evaluate(el => el.matches(':focus-visible'))).toBe(true);
      await expect(zoom).toHaveCSS('outline-style', 'solid');
      await expect(zoom).toHaveCSS('outline-width', '2px');
      await expect(zoom).toHaveCSS('outline-color', 'rgb(255, 161, 51)');
      await page.locator('.rec-marker-strip').screenshot({ path: testInfo.outputPath(`rec-zoom-${locale}-${viewport.width}-focus.png`) });
      await zoom.press('End');
      await expect(zoom).toHaveValue('300');
      await expect.poll(() => trackWidthGap(page, 300)).toBeLessThanOrEqual(2);
      await zoom.press('ArrowRight');
      await expect(zoom).toHaveValue('300');
      await zoom.press('Home');
      await expect(zoom).toHaveValue('1');

      const box = await zoom.boundingBox();
      await page.mouse.move(box.x + 6, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .75, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const value = Number(await zoom.inputValue());
      expect(value, 'native pointer drag changes the zoom').toBeGreaterThan(1);
      expect(value).toBeLessThanOrEqual(300);
      await expect.poll(() => trackWidthGap(page, value)).toBeLessThanOrEqual(2);
      await expect(page.locator('.rec-marker')).toHaveCount(3);
    }
    expect(commands.filter(command => command.startsWith('recording')), 'zoom never sends host writes').toEqual([]);
    // Chorus is the start of the first selection and also the midpoint of
    // Verse..End: both must stay at the viewport center even when the
    // selected interval no longer fits.
    for (const selection of [{start:'1',end:'',marker:1},{start:'0',end:'2',marker:1}]) {
      await page.locator('#rec-start-marker').selectOption(selection.start);
      await page.locator('#rec-end-marker').selectOption(selection.end);
      const before=commands.length;
      await zoom.evaluate(el=>{el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await expect.poll(()=>page.evaluate(index=>{
        const timeline=document.getElementById('rec-timeline').getBoundingClientRect();
        const marker=document.querySelectorAll('.rec-marker')[index].getBoundingClientRect();
        return Math.abs(marker.x+marker.width/2-(timeline.x+timeline.width/2));
      },selection.marker)).toBeLessThan(3);
      expect(commands.slice(before).filter(command=>command.startsWith('recording'))).toEqual([]);
    }
  });
}

/** A long song: the catalog reaches the bar 2622 and the cursor sits on
 * the bar 62. The first part of the catalog is dense, so the badges of the
 * ruler have to share the axis, and the rest of it is sparse. */
function longSong() {
  const locators = [];
  for (let bar = 2; bar <= 202; bar += 2) locators.push({ name: 'Bar ' + bar, time: (bar - 1) * 4 });
  for (let bar = 222; bar <= 2622; bar += 20) locators.push({ name: 'Bar ' + bar, time: (bar - 1) * 4 });
  return locators;
}

/** A real finger pans the ruler: the scrollport moves on the horizontal
 * axis and the host is never asked. */
async function panTimeline(page) {
  const client = await page.context().newCDPSession(page);
  const box = await page.locator('#rec-timeline').boundingBox();
  const x = box.x + box.width * 0.7;
  const y = box.y + Math.min(20, box.height / 2);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 8, y }] });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  await page.waitForTimeout(400);
  return page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
}

/** The mock host of the long song: it answers the reads of the page and
 * records every command. */
async function longSongMock(page, commands) {
  const locators = longSong();
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'stop-frame', role: 'controller' }));
    if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    if (!message.cmd) return;
    commands.push(message.cmd);
    const observed = value => ({ value, fresh: true, observedAt: Date.now() });
    const result = message.cmd === 'getRecordingState' ? {
      transport: { connected: true, isPlaying: observed(false), recordMode: observed(false),
        songTimeBeats: observed(244), metronome: observed(false) },
      tracks: [{ index: 0, id: 'long', name: 'Drums', arm: false, canArm: true, solo: false, mute: false }],
      locators, meter: { numerator: 4, denominator: 4 }, pending: null, range: null, capture: null, safety: {},
      session: { songId: 'long', scenes: [], rows: [], owned: [] },
    } : message.cmd === 'getMappings' ? { mappings: {} } : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  return locators;
}

/** The opening with Até STOP: the zoom of the window of sixteen bars and
 * the view on the resolved start. */
async function expectOpening(page, locators) {
  const totalSpan = locators[locators.length - 1].time + 4;
  const expectedZoom = Math.max(1, Math.min(300, Math.round(0.72 * totalSpan / (16 * 4))));
  await expect.poll(() => page.locator('#rec-zoom').inputValue()).toBe(String(expectedZoom));
  const opened = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  expect(opened, 'the opening moves the ruler to the start').toBeGreaterThan(0);
  const showsStart = await page.evaluate(() => {
    const timeline = document.getElementById('rec-timeline').getBoundingClientRect();
    // The marker of the bar 62 is the start of the capture.
    const marker = document.querySelector('.rec-marker[data-index="30"]').getBoundingClientRect();
    const centre = marker.x + marker.width / 2;
    return centre >= timeline.x - 1 && centre <= timeline.x + timeline.width + 1;
  });
  expect(showsStart, 'the opening shows the start').toBe(true);
  return { zoom: expectedZoom, scroll: opened };
}

/** Every marker of the catalog is in the page and in the selectors, and no
 * two whole badges cover each other. */
async function expectWholeBadges(page, locators) {
  await expect(page.locator('#rec-start-marker option')).toHaveCount(locators.length + 4);
  await expect(page.locator('#rec-end-marker option')).toHaveCount(locators.length + 3);
  expect(await page.locator('.rec-marker[data-compact="true"]').count(), 'the crowded badges become compact traces').toBeGreaterThan(0);
  expect(await page.locator('.rec-marker[data-compact="false"]').count(), 'the badges that fit keep their own width').toBeGreaterThan(1);
  const overlap = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.rec-marker[data-compact="false"]')]
      .map(node => node.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    for (let index = 1; index < cards.length; index += 1) {
      if (cards[index].left - cards[index - 1].right < 2) return { left: cards[index - 1].left, right: cards[index].right };
    }
    return null;
  });
  expect(overlap, 'no two whole badges overlap').toBeNull();
}

/** A finger pans the ruler and the polls never move the view again. */
async function expectStableView(page) {
  const panned = await panTimeline(page);
  expect(panned, 'the finger panned the ruler').toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  const first = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  await page.waitForTimeout(2500);
  const second = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  expect(Math.abs(second - first), 'the polls never move the view of the reader').toBeLessThanOrEqual(1);
}

test('REC opens on the start with Até STOP and the reader keeps the view', async ({ page }) => {
  test.setTimeout(180000);
  const commands = [];
  const locators = await longSongMock(page, commands);
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('.rec-marker')).toHaveCount(locators.length);
  const opening = await expectOpening(page, locators);
  await expectWholeBadges(page, locators);
  // The finger owns the view of the Record mode.
  await expectStableView(page);
  // The manual zoom of the reader is preserved by the polls.
  await page.locator('#rec-zoom').evaluate(input => { input.value = '42'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#rec-zoom')).toHaveValue('42');
  await page.waitForTimeout(2500);
  await expect(page.locator('#rec-zoom'), 'the manual zoom is preserved').toHaveValue('42');
  // The reader chooses the same start again: the view reopens on it.
  await page.locator('#rec-start-marker').selectOption('cursor');
  await expect.poll(() => page.locator('#rec-zoom').inputValue()).toBe(String(opening.zoom));
  const reopened = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  expect(Math.abs(reopened - opening.scroll), 'the view opens again on the start').toBeLessThanOrEqual(2);
  // The Arrangement keeps the view of the reader too.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await expectStableView(page);
  // The navigation of the view never writes to the host.
  expect(commands.filter(command => command.startsWith('recording') && !command.startsWith('get')),
    'the navigation never writes to the host').toEqual([]);
});
