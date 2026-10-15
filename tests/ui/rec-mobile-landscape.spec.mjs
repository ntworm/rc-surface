// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 568, height: 320, name: 'iPhone-SE-568x320' },
  { width: 667, height: 375, name: 'iPhone-8-667x375' },
  { width: 851, height: 393, name: 'Pixel-851x393' },
  { width: 932, height: 430, name: 'iPhone-Max-932x430' },
];

for (const locale of ['en', 'pt-BR']) {
  test(`REC mobile landscape keeps transport visible without scroll, supports auto-zoom and tracks (${locale})`, async ({ page }, testInfo) => {
    const tracks = [
      { index: 0, id: 'track-0', name: 'Lead Vocal', arm: true, canArm: true, solo: false, mute: false },
      { index: 1, id: 'track-1', name: 'Acoustic Guitar', arm: false, canArm: true, solo: false, mute: false },
      { index: 2, id: 'track-2', name: 'Electric Bass', arm: false, canArm: true, solo: false, mute: false },
      { index: 3, id: 'track-3', name: 'Piano', arm: false, canArm: true, solo: false, mute: false },
      { index: 4, id: 'track-4', name: 'Drum Kit', arm: false, canArm: true, solo: false, mute: false },
    ];
    // Large arrangement ~2000 beats to verify auto-zoom on compact loop
    const locators = [
      { name: 'Intro', time: 0 },
      { name: 'Verso I', time: 64 },
      { name: 'Verso II', time: 1314.4 },
      { name: 'Instrumental', time: 1354.4 },
      { name: 'Final', time: 2350 },
    ];
    const commands = [];
    const observed = value => ({ value, fresh: true, observedAt: Date.now() });

    await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'rec-mobile-test', role: 'controller' }));
      if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      if (!message.cmd) return;
      commands.push(message);

      if (message.cmd === 'recordingTrackControl') {
        const target = tracks.find(t => t.index === message.args.track.index && t.id === message.args.track.id);
        if (target) target[message.args.property] = message.args.enabled;
      }

      const snapshot = () => ({
        transport: {
          connected: true,
          isPlaying: observed(false),
          recordMode: observed(false),
          songTimeBeats: observed(1314.4),
          metronome: observed(true),
        },
        tracks,
        locators,
        meter: { numerator: 4, denominator: 4 },
        range: null,
      });

      const result = ['getRecordingState', 'recordingTrackControl'].includes(message.cmd)
        ? snapshot()
        : message.cmd === 'getMappings' ? { mappings: {} } : {};

      socket.send(JSON.stringify({ id: message.id, ok: true, result }));
    }));

    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.tab[data-page="recording"]').click();

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
      await expect(page.locator('#rec-pre-roll-0')).toBeInViewport();
      await expect(page.locator('#rec-pre-roll-1')).toBeInViewport();
      await expect(page.locator('#rec-pre-roll-2')).toBeInViewport();
      await expect(page.locator('#rec-pre-roll-4')).toBeInViewport();

      // Verify START and LOOP are in viewport
      await expect(page.locator('#rec-start-marker')).toBeInViewport();
      await expect(page.locator('#rec-loop')).toBeInViewport();

      // Verify header Play button remains accessible at top
      await expect(page.locator('#btn-header-play')).toBeInViewport();

      // Verify track cards are compact and visible
      await expect(page.locator('.rec-track-card')).toHaveCount(5);
      const firstCard = page.locator('.rec-track-card').first();
      await expect(firstCard).toBeInViewport();
      const cardHeight = await firstCard.evaluate(el => el.getBoundingClientRect().height);
      expect(cardHeight, `card remains compact (<= 56px) at ${vp.name}`).toBeLessThanOrEqual(56);
      expect(cardHeight, `card maintains touch target height (>= 44px) at ${vp.name}`).toBeGreaterThanOrEqual(44);

      // Take screenshot artifact for evidence
      await page.locator('#page-recording').screenshot({
        path: testInfo.outputPath(`rec-mobile-${locale}-${vp.name}.png`),
      });
    }

    // 2. Test Auto-zoom on Loop selection
    // Select START = Verso II (index 2), LOOP = ON, END = Instrumental (index 3)
    await page.setViewportSize({ width: 851, height: 393 });
    const zoomSlider = page.locator('#rec-zoom');
    await expect(zoomSlider).toHaveValue('1');

    await page.locator('#rec-start-marker').selectOption('2');
    await page.locator('#rec-loop').click();
    await expect(page.locator('#rec-end-marker')).toBeVisible();
    await page.locator('#rec-end-marker').selectOption('3');

    // Wait for auto-zoom delay (250ms debounced)
    await page.waitForTimeout(350);

    // Loop from 1314.4 to 1354.4 is 40 beats out of 2354 beats (1.7% of song)
    // Target zoom should automatically increase to 8
    await expect(zoomSlider).toHaveValue('8');
    const track = page.locator('#rec-timeline-track');
    await expect(track).toHaveAttribute('style', /width: calc\(800% - 96px\)/);

    // Verify timeline scroll was centered on loop section
    const scrollLeft = await page.locator('#rec-timeline').evaluate(el => el.scrollLeft);
    expect(scrollLeft, 'auto-zoom centered timeline on loop midpoint').toBeGreaterThan(100);

    // 3. Test Manual Zoom override
    // Moving zoom slider manually must override auto-zoom and not be overwritten by background polling
    await zoomSlider.focus();
    await zoomSlider.press('Home');
    await expect(zoomSlider).toHaveValue('1');
    await expect(track).toHaveAttribute('style', /width: calc\(100% - 96px\)/);

    // Wait past poll interval
    await page.waitForTimeout(900);
    await expect(zoomSlider).toHaveValue('1');

    // 4. Test Track Actions in mobile landscape
    // Arm track 3 (Piano)
    const pianoCard = page.locator('.rec-track-card').nth(3);
    const pianoArm = pianoCard.locator('button[data-property="arm"]');
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
    await expect(page.locator('#rec-pre-roll-0')).toBeVisible();
    await expect(page.locator('.rec-track-card')).toHaveCount(5);
  });
}
