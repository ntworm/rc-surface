// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 568, height: 320, name: 'iPhone-SE-568x320' },
  { width: 667, height: 375, name: 'iPhone-8-667x375' },
  { width: 851, height: 393, name: 'Pixel-851x393' },
  { width: 932, height: 430, name: 'iPhone-Max-932x430' },
];

// The physical width of the track follows the measured scrollport and the
// real gutter: the layout is verified, never a literal of the style.
const trackWidthGap = (page, zoom) => page.evaluate((factor) => {
  const timeline = document.getElementById('rec-timeline');
  const track = document.getElementById('rec-timeline-track');
  const gutter = parseFloat(getComputedStyle(timeline).getPropertyValue('--rec-gutter')) || 0;
  const expected = timeline.clientWidth * factor - 2 * gutter;
  return Math.abs(track.getBoundingClientRect().width - expected);
}, zoom);

/** The session of the mobile proofs: five tracks and a long song. */
function session() {
  return {
    tracks: [
      { index: 0, id: 'track-0', name: 'Lead Vocal', arm: true, canArm: true, solo: false, mute: false },
      { index: 1, id: 'track-1', name: 'Acoustic Guitar', arm: false, canArm: true, solo: false, mute: false },
      { index: 2, id: 'track-2', name: 'Electric Bass', arm: false, canArm: true, solo: false, mute: false },
      { index: 3, id: 'track-3', name: 'Piano', arm: false, canArm: true, solo: false, mute: false },
      { index: 4, id: 'track-4', name: 'Drum Kit', arm: false, canArm: true, solo: false, mute: false },
    ],
    // Large arrangement ~2000 beats to verify auto-zoom on compact loop
    locators: [
      { name: 'Intro', time: 0 },
      { name: 'Verso I', time: 64 },
      { name: 'Verso II', time: 1314.4 },
      { name: 'Instrumental', time: 1354.4 },
      { name: 'Final', time: 2350 },
    ],
  };
}

async function setupSocket(page, commands, state) {
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'rec-mobile-test', role: 'controller' }));
    if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    if (!message.cmd) return;
    commands.push(message);

    if (message.cmd === 'recordingTrackControl') {
      const target = state.tracks.find(t => t.index === message.args.track.index && t.id === message.args.track.id);
      if (target) target[message.args.property] = message.args.enabled;
    }

    const observed = value => ({ value, fresh: true, observedAt: Date.now() });
    const snapshot = () => ({
      transport: {
        connected: true,
        isPlaying: observed(false),
        recordMode: observed(false),
        songTimeBeats: observed(1314.4),
        metronome: observed(true),
      },
      tracks: state.tracks,
      locators: state.locators,
      meter: { numerator: 4, denominator: 4 },
      range: null,
    });

    const result = ['getRecordingState', 'recordingTrackControl'].includes(message.cmd)
      ? snapshot()
      : message.cmd === 'getMappings' ? { mappings: {} } : {};

    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
}

/** The page of the recorder: the Record mode is the default and never
 * reads a hidden row. */
async function openRecorder(page, locale = 'en') {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=' + locale);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('.rec-track-card')).toHaveCount(5);
}

/** The page of the recorder in the editor of the Arrangement: the Record
 * mode stays the default and never reads a hidden row. */
async function openArrangement(page, locale = 'en') {
  await openRecorder(page, locale);
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
}

for (const locale of ['en', 'pt-BR']) {
  test(`REC mobile landscape keeps transport visible without scroll, supports auto-zoom and tracks (${locale})`, async ({ page }, testInfo) => {
    const commands = [];
    const state = session();
    await setupSocket(page, commands, state);
    await openArrangement(page, locale);

    // 1. Test each mobile landscape viewport (568 to 932 px)
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);

      // Verify page is not scrolled down to reach controls
      const scrollY = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop);
      expect(scrollY, `page has zero vertical scroll at ${vp.name}`).toBe(0);

      // Verify REC, STOP, CLICK, PRE-ROLL are ALL within viewport without scrolling
      await expect(page.locator('#rec-start')).toBeInViewport();
      await expect(page.locator('#rec-stop')).toBeInViewport();
      await expect(page.locator('#rec-click')).toBeInViewport();
      await expect(page.locator('#rec-pre-roll-inline')).toBeInViewport();
      await expect(page.locator('#rec-pre-roll-value')).toHaveText('OFF');

      // Verify START and LOOP are in viewport
      await expect(page.locator('#rec-start-marker')).toBeInViewport();
      await expect(page.locator('#rec-end-marker')).toBeInViewport();

      // Verify guidance status is visible in the footer of the combined band
      await expect(page.locator('#rec-combined-footer #rec-status')).toBeVisible();
      await expect(page.locator('#rec-combined-band')).toBeVisible();
      // The ruler of the capture sits above the rows of the editor.
      await expect(page.locator('#rec-timeline')).toBeVisible();

      // Verify header Play button remains accessible at top
      await expect(page.locator('#btn-header-play')).toBeInViewport();

      // Verify track rows keep two accessible lines: the name above the actions
      await expect(page.locator('.rec-track-card')).toHaveCount(5);
      await expect(page.locator('.rec-track-row')).toHaveCount(5);
      const firstCard = page.locator('.rec-track-card').first();
      await expect(firstCard).toBeVisible();
      const cardHeight = await firstCard.evaluate(el => el.getBoundingClientRect().height);
      expect(cardHeight, `row keeps the accessible name and actions rows (<= 96px) at ${vp.name}`).toBeLessThanOrEqual(96);
      expect(cardHeight, `row maintains touch target height (>= 44px) at ${vp.name}`).toBeGreaterThanOrEqual(44);

      // Take screenshot artifact for evidence
      await page.locator('#page-recording').screenshot({
        path: testInfo.outputPath(`rec-mobile-${locale}-${vp.name}.png`),
      });
    }

    // 2. Test Auto-zoom on Loop selection
    // Select START = Verso II (index 2), LOOP = ON, END = Instrumental (index 3)
    await page.setViewportSize({ width: 851, height: 393 });
    const zoomSlider = page.locator('#rec-zoom');
    // The opening with Até STOP frames sixteen bars from the resolved
    // start: the ruler opens on the window of the capture and not on the
    // whole catalog, so the zoom is not 1 any more.
    await expect(zoomSlider).toHaveValue('26');

    await page.locator('#rec-start-marker').selectOption('2');
    await expect(page.locator('#rec-end-marker')).toBeVisible();
    await page.locator('#rec-end-marker').selectOption('3');

    // Wait for auto-zoom delay (250ms debounced)
    await page.waitForTimeout(350);

    // Loop from 1314.4 to 1354.4 is 40 beats out of 2354 beats (1.7% of song)
    // Target zoom should automatically increase to 42
    await expect(zoomSlider).toHaveValue('42');
    // The zoom really widens the physical track of the measured scrollport.
    await expect.poll(() => trackWidthGap(page, 42)).toBeLessThanOrEqual(2);

    // Verify timeline scroll was centered on loop section
    const scrollLeft = await page.locator('#rec-timeline').evaluate(el => el.scrollLeft);
    expect(scrollLeft, 'auto-zoom centered timeline on loop midpoint').toBeGreaterThan(100);

    // 3. Test Manual Zoom override
    // Moving zoom slider manually must override auto-zoom and not be overwritten by background polling
    await zoomSlider.focus();
    await zoomSlider.press('Home');
    await expect(zoomSlider).toHaveValue('1');
    // The manual zoom really narrows the physical track again.
    await expect.poll(() => trackWidthGap(page, 1)).toBeLessThanOrEqual(2);

    // Wait past poll interval
    await page.waitForTimeout(900);
    await expect(zoomSlider).toHaveValue('1');

    // 4. Test Track Actions in mobile landscape
    // Arm track 3 (Piano)
    const pianoRow = page.locator('.rec-track-row').nth(3);
    const pianoArm = pianoRow.locator('button[data-property="arm"]');
    await expect(pianoArm).toHaveAttribute('aria-pressed', 'false');
    await pianoArm.click();
    await expect(pianoArm).toHaveAttribute('aria-pressed', 'true');
    expect(commands.some(c => c.cmd === 'recordingTrackControl' && c.args.track.id === 'track-3' && c.args.property === 'arm' && c.args.enabled === true)).toBe(true);

    // 5. Test Desktop control (1280x800) - Verify no desktop regression
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);
    await expect(page.locator('#rec-start')).toBeVisible();
    await expect(page.locator('#rec-stop')).toBeVisible();
    await expect(page.locator('#rec-click')).toBeVisible();
    await expect(page.locator('#rec-pre-roll-inline')).toBeVisible();
    await expect(page.locator('.rec-track-card')).toHaveCount(5);
  });
}

/** A real finger pans the ruler of the Record mode: the scrollport moves on
 * the horizontal axis, the local range stays where it is and the host is
 * never asked. */
test('a real finger pans the ruler of the Record mode', async ({ page }) => {
  const commands = [];
  const state = session();
  await setupSocket(page, commands, state);
  await openRecorder(page);
  await page.locator('#rec-zoom').fill('8');
  await expect.poll(() => page.locator('#rec-timeline').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  const before = await page.evaluate(() => ({
    start: document.getElementById('rec-start-marker').value,
    end: document.getElementById('rec-end-marker').value,
  }));
  const client = await page.context().newCDPSession(page);
  const box = await page.locator('#rec-timeline').boundingBox();
  const x = box.x + box.width * 0.7;
  const y = box.y + Math.min(20, box.height / 2);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 6, y }] });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const scrollLeft = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  expect(scrollLeft, 'the finger panned the ruler of the Record mode').toBeGreaterThan(0);
  const after = await page.evaluate(() => ({
    start: document.getElementById('rec-start-marker').value,
    end: document.getElementById('rec-end-marker').value,
  }));
  expect(after, 'the local range never moved').toEqual(before);
  expect(commands.filter(command => command.cmd.startsWith('recording')), 'the pan never writes to the host').toEqual([]);
});

/** The Arrangement opens on the range of the capture: the axis of the
 * visible editor is measured and centred on the chosen range, never left
 * where the hidden editor was. */
test('the Arrangement opens on the range of the capture', async ({ page }) => {
  const commands = [];
  const state = session();
  await setupSocket(page, commands, state);
  await openRecorder(page);
  // The range is chosen in the default Record mode: the editor of the
  // Arrangement opens on the range of that choice.
  await page.locator('#rec-start-marker').selectOption('2');
  await page.locator('#rec-end-marker').selectOption('3');
  // Wait for auto-zoom delay (250ms debounced)
  await page.waitForTimeout(350);
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await expect(page.locator('#rec-zoom')).toHaveValue('42');
  // The centre of the range is the centre of the two marker boxes: the
  // left edges of two boxes are never the centre of their range.
  await expect.poll(() => page.evaluate(() => {
    const timeline = document.getElementById('rec-timeline').getBoundingClientRect();
    const markers = [...document.querySelectorAll('.rec-marker')];
    const start = markers[2].getBoundingClientRect();
    const end = markers[3].getBoundingClientRect();
    const centre = (start.x + start.width / 2 + end.x + end.width / 2) / 2;
    return Math.abs(centre - (timeline.x + timeline.width / 2));
  })).toBeLessThanOrEqual(2);
  expect(commands.filter(command => command.cmd.startsWith('recording')), 'the local choice never writes').toEqual([]);
});

/** A real finger pans the ruler: the scrollport moves on the horizontal
 * axis, the local range stays where it is and the host is never asked. */
test('a real finger pans the ruler of the Arrangement', async ({ page }) => {
  const commands = [];
  const state = session();
  await setupSocket(page, commands, state);
  await openArrangement(page);
  // The local start is an explicit marker before the gesture: the reducer
  // compares the times of the markers, and the cursor at the position of
  // a marker is a different identity.
  await page.locator('#rec-start-marker').selectOption('3');
  // The ruler is wider than the surface: the finger has something to pan.
  await page.locator('#rec-zoom').fill('8');
  await expect.poll(() => page.locator('#rec-timeline').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  const before = await page.evaluate(() => ({
    start: document.getElementById('rec-start-marker').value,
    end: document.getElementById('rec-end-marker').value,
  }));
  expect(before.start, 'the local start is an explicit marker').toBe('3');
  const client = await page.context().newCDPSession(page);
  const box = await page.locator('#rec-timeline').boundingBox();
  const x = box.x + box.width * 0.75;
  const y = box.y + Math.min(24, box.height / 2);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 15, y }] });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const scrollLeft = await page.locator('#rec-timeline').evaluate(node => node.scrollLeft);
  expect(scrollLeft, 'the finger panned the ruler').toBeGreaterThan(0);
  const after = await page.evaluate(() => ({
    start: document.getElementById('rec-start-marker').value,
    end: document.getElementById('rec-end-marker').value,
  }));
  expect(after, 'the local range never moved').toEqual(before);
  expect(commands.filter(command => command.cmd.startsWith('recording')), 'the pan never writes to the host').toEqual([]);
  // The native marker tap still follows the reducer: a marker earlier than
  // the explicit start moves the local range and it never asks the host.
  await page.locator('.rec-marker[data-index="2"]').click();
  await expect(page.locator('#rec-start-marker')).toHaveValue('2');
  expect(commands.filter(command => command.cmd.startsWith('recording')), 'the tap never writes to the host').toEqual([]);
});
