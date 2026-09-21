// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { test, expect } from '@playwright/test';

const desktopSizes = [{ width: 1280, height: 960 }, { width: 1440, height: 900 },
  { width: 1024, height: 768 }, { width: 1920, height: 1200 },
  { width: 1000, height: 650 }, { width: 1920, height: 650 }];

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/ws*', (socket) => socket.onMessage((raw) => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'layout-test', role: 'controller' }));
    if (!message.cmd) return;
    const result = message.cmd === 'getTargets'
      ? { targets: [{ trackKind: 'track', trackIndex: 0, isMidi: true, name: 'Test MIDI' }] }
      : message.cmd === 'getMappings' ? { mappings: {} } : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  await page.setViewportSize(desktopSizes[0]);
  await page.goto('/?lang=pt-BR');
  await page.evaluate(() => document.fonts.ready);
});

async function boxes(page, selectors) {
  return page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => [selector,
    [...document.querySelectorAll(selector)].map((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
        clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 };
    }),
  ])), selectors);
}

function inside(child, parent, label) {
  expect(child.x, `${label}: left`).toBeGreaterThanOrEqual(parent.x - 1);
  expect(child.y, `${label}: top`).toBeGreaterThanOrEqual(parent.y - 1);
  expect(child.right, `${label}: right`).toBeLessThanOrEqual(parent.right + 1);
  expect(child.bottom, `${label}: bottom`).toBeLessThanOrEqual(parent.bottom + 1);
}

test('desktop AUD gives controls readable size after Follow is withheld', async ({ page }) => {
  await page.locator('.tab[data-page="audio"]').click();
  await expect(page.locator('#follow-note')).toHaveCount(0);
  await page.locator('[data-audio-view="attacks"]').click();
  await page.evaluate(() => {
    document.getElementById('lbl-audio-centroid').textContent = '19850 Hz';
    document.getElementById('lbl-audio-transient').textContent = '0.999';
  });
  for (const viewport of desktopSizes) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      const m = await boxes(page, ['.page-audio', '.audio-analysis-dial',
        '.audio-analysis-control-head', '.audio-detectors-title', '#lbl-audio-centroid']);
      for (const dial of m['.audio-analysis-dial']) {
        // Smaller than the retired pitch dials on purpose, still a real target.
        expect(dial.width, 'desktop knobs must not stay phone-sized').toBeGreaterThanOrEqual(36);
        inside(dial, m['.page-audio'][0], 'audio dial');
      }
      for (const selector of ['.audio-analysis-control-head', '.audio-detectors-title', '#lbl-audio-centroid']) {
        for (const element of m[selector]) {
          expect(element.fontSize, `${selector}: desktop text`).toBeGreaterThanOrEqual(12);
          expect(element.clipped, `${selector}: readable contents`).toBe(false);
          inside(element, m['.page-audio'][0], selector);
        }
      }
    }
  }
});

test('desktop VID uses bounded pose actions beside a proportional camera preview', async ({ page }) => {
  await page.locator('.tab[data-page="video"]').click();
  for (const viewport of desktopSizes) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      const m = await boxes(page, ['.page-video', '.vision-camera-stage', '.vision-slot-actions button',
        '.vision-gesture-slot', '.vision-axis-chips b', '.vision-command-bar select']);
      const preview = m['.vision-camera-stage'][0];
      expect(preview.width / preview.height, 'preview must not become a tall black column').toBeGreaterThan(1.2);
      expect(preview.width / preview.height).toBeLessThan(1.45);
      inside(preview, m['.page-video'][0], 'camera preview');
      for (const button of m['.vision-slot-actions button']) {
        expect(button.height, 'pose actions remain usable').toBeGreaterThanOrEqual(40);
        expect(button.height, 'pose actions must not stretch to several hundred pixels').toBeLessThanOrEqual(120);
        expect(button.fontSize).toBeGreaterThanOrEqual(12);
        expect(button.clipped).toBe(false);
        inside(button, m['.page-video'][0], 'pose action');
      }
      const slots = m['.vision-gesture-slot'];
      expect(slots[1].y, 'desktop pose slots share width in separate rows').toBeGreaterThanOrEqual(slots[0].bottom);
      expect(slots[2].y).toBeGreaterThanOrEqual(slots[1].bottom);
      for (const readout of [...m['.vision-axis-chips b'], ...m['.vision-command-bar select']]) {
        expect(readout.fontSize).toBeGreaterThanOrEqual(12);
        inside(readout, m['.page-video'][0], 'vision readout');
      }
    }
  }
});

test('MIX gives eight knobs and faders equal full-height panels with compact arc dials', async ({ page }) => {
  await page.locator('.tab[data-page="mixer"]').click();
  for (const viewport of [{ width: 851, height: 393, minDial: 50 }, { width: 568, height: 320, minDial: 32 },
    { width: 851, height: 300, minDial: 50 }, { width: 1280, height: 960, minDial: 76 }]) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      const m = await boxes(page, ['.mixer-layout-container', '.knobs-section', '.faders-section', '.knob', '.knob-face', '.fader-track']);
      const [knobs, faders] = [m['.knobs-section'][0], m['.faders-section'][0]];
      expect(knobs.width, 'equal panel widths').toBeCloseTo(faders.width, 0);
      expect(knobs.height, 'equal panel heights').toBeCloseTo(faders.height, 0);
      expect(knobs.height, 'panels fill the available workspace').toBeGreaterThan(m['.mixer-layout-container'][0].height * 0.95);
      for (const [index, dial] of m['.knob-face'].entries()) {
        expect(dial.width, 'knob grows with available room').toBeGreaterThanOrEqual(viewport.minDial);
        inside(dial, m['.knob'][index], 'knob dial');
      }
      for (const track of m['.fader-track']) inside(track, faders, 'fader track');
    }
  }
});

test('MIX fader thumb stays aligned with its value when the workspace changes', async ({ page }) => {
  await expect(page.locator('.fader-fill').first()).toHaveAttribute('style', /height: 85%/);
  await page.locator('.tab[data-page="mixer"]').click();
  const positions = () => page.locator('.fader').evaluateAll((faders) => faders.map((fader) => {
    const track = fader.querySelector('.fader-track').getBoundingClientRect();
    const thumb = fader.querySelector('.fader-thumb').getBoundingClientRect();
    const fill = fader.querySelector('.fader-fill').getBoundingClientRect();
    return { center: thumb.y + thumb.height / 2, fillTop: fill.y, fillBottom: fill.bottom,
      trackTop: track.y, trackHeight: track.height };
  }));
  for (const fader of await positions()) {
    expect(Math.abs(fader.center - fader.fillTop), 'initial thumb must meet its level fill').toBeLessThan(2);
  }
  for (const value of [0.25, 0.75]) {
    await page.evaluate((value) => {
      document.querySelector('.fader').classList.add('bipolar');
      window.controlSetters['fader-1'](value);
    }, value);
    for (const viewport of [{ width: 851, height: 393 }, { width: 568, height: 320 }, { width: 1280, height: 960 }]) {
      await page.setViewportSize(viewport);
      for (const stage of [false, true]) {
        await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
        const [fader] = await positions();
        const expected = fader.trackTop + (1 - value) * fader.trackHeight;
        expect(Math.abs(fader.center - expected), 'thumb tracks the normalized value after layout changes').toBeLessThan(2);
        const filledEnd = value < 0.5 ? fader.fillBottom : fader.fillTop;
        expect(Math.abs(fader.center - filledEnd), 'bipolar fill meets the thumb').toBeLessThan(2);
      }
    }
  }
});
