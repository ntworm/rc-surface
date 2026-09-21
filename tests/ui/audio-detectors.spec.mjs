// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=pt-BR');
  await page.locator('.tab[data-page="audio"]').click();
});

test('AUD exposes twelve grouped mappable descriptors and no retired interaction', async ({ page }) => {
  const cards = page.locator('.audio-detector-card');
  await expect(cards).toHaveCount(12);
  expect(await cards.evaluateAll((elements) => elements.map((element) => element.dataset.name)))
    .toEqual(['transient', 'kick', 'snare', 'brightness', 'centroid', 'rolloff', 'flux', 'flatness', 'spread', 'low', 'mid', 'high']
      .map((field) => 'sensor.audio.' + field));
  await expect(page.locator('.audio-detectors-title')).toHaveText('DETECTORES DE ÁUDIO');
  await expect(cards.nth(0)).toContainText('Transiente');
  await expect(cards.nth(3)).toContainText('Brilho');
  await expect(page.locator('#follow-note, #audio-timeline-mode-decisions, .audio-diagnostic-footer')).toHaveCount(0);
  await page.locator('[data-audio-view="tone"]').click();
  await page.locator('.audio-detectors-title').click();
  await expect(cards.nth(3)).toBeVisible();
});

test('descriptor callback renders raw values immediately and stop clears meters', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  // Only capture is substituted. Exercise the shipped app callback and DOM.
  await page.evaluate(() => {
    window.AudioProcessor = class {
      constructor() { window.testAudioProcessor = this; }
      setAnalysisSettings() {}
      async start() { return true; }
      stop() {}
    };
  });
  await page.locator('#chk-audio-enable').check({ force: true });
  await page.evaluate(() => window.testAudioProcessor.onDescriptorUpdate({
    transient: 0.91, kick: 0.73, snare: 0.27, brightness: 0.64,
  }));
  for (const [name, value] of Object.entries({ transient: 0.91, kick: 0.73, snare: 0.27, brightness: 0.64 })) {
    await expect(page.locator('#lbl-audio-' + name)).toHaveText(value.toFixed(3));
    await expect(page.locator('#bar-audio-' + name)).toHaveCSS('transform', new RegExp(String(value)));
    await expect(page.locator('#bar-audio-' + name)).toHaveCSS('transition-duration', '0s');
  }
  await page.locator('#chk-audio-enable').uncheck({ force: true });
  for (const name of ['transient', 'kick', 'snare', 'brightness']) {
    await expect(page.locator('#lbl-audio-' + name)).toHaveText('0.000');
    await expect(page.locator('#bar-audio-' + name)).toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');
  }
});

test('MAP selects the actual Kick control from its detector card', async ({ page }) => {
  await page.locator('#btn-map-mode').click();
  await page.locator('.audio-detector-card[data-name="sensor.audio.kick"]').click();
  await expect.poll(() => page.evaluate(() => window.mobileMappingState.selectedControl))
    .toBe('sensor.audio.kick');
  await expect(page.locator('#mapping-mode')).toBeVisible();
});

for (const liveStream of ['descriptor', 'analysis']) {
  test('audio watchdog isolates the stalled stream while ' + liveStream + ' stays live', async ({ page }) => {
    await page.clock.install();
    await page.evaluate(() => {
      window.AudioProcessor = class {
        constructor() { window.testAudioProcessor = this; }
        setAnalysisSettings() {}
        async start() { return true; }
        resetDescriptors() {}
        stop() {}
      };
      window.testDescriptorFrame = () => window.testAudioProcessor.onDescriptorUpdate({
        transient: 1, kick: 1, snare: 0.1, brightness: 0.5,
      });
      window.testAnalysisFrame = () => window.testAudioProcessor.onAnalysisUpdate({
        rms: 0.5, pitch: 440, midiNote: 69, bpm: 120, clarity: 0.95,
        whistleBend: 0.5, envelope: 0.5, attack: 1, gate: 1,
      });
    });
    await page.locator('#chk-audio-enable').check({ force: true });
    await page.evaluate(() => { window.testDescriptorFrame(); window.testAnalysisFrame(); });
    for (let frame = 0; frame < 6; frame += 1) {
      await page.evaluate((stream) => stream === 'descriptor' ? window.testDescriptorFrame() : window.testAnalysisFrame(), liveStream);
      await page.clock.runFor(50);
    }
    const lost = await page.evaluate(() => window.currentControlLost);
    expect(lost['sensor.audio.kick']).toBe(liveStream === 'analysis');
    expect(lost['sensor.audio.gate']).toBe(liveStream === 'descriptor');
    if (liveStream === 'analysis') await expect(page.locator('#lbl-audio-kick')).toHaveText('0.000');
    else await expect.poll(() => page.evaluate(() => window.currentControlLost['sensor.audio.gate'])).toBe(true);
    await page.locator('#chk-audio-enable').uncheck({ force: true });
  });
}

for (const viewport of [
  { width: 568, height: 320 }, { width: 851, height: 300 }, { width: 851, height: 393 },
  { width: 1280, height: 960 }, { width: 1920, height: 1200 },
]) {
  test('detectors occupy the released workspace at ' + viewport.width + 'x' + viewport.height, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      await page.locator('#lbl-audio-path').evaluate((element) => { element.textContent = 'Captura compatível'; });
      const geometry = await page.evaluate(() => {
        const box = (element) => {
          const r = element.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
            clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 };
        };
        return {
          root: box(document.querySelector('.media-card-audio')),
          graph: box(document.querySelector('.audio-analysis-grid')),
          panel: box(document.querySelector('.audio-detectors')),
          cards: [...document.querySelectorAll('.audio-detector-card')].filter((e) => e.getClientRects().length).map(box),
          // Rows scrolled out of the bank are still real cards; only the ones
          // currently inside it have to sit inside the card's own box.
          visibleCards: [...document.querySelectorAll('.audio-detector-card')].filter((e) => {
            const bank = document.querySelector('#audio-detector-bank').getBoundingClientRect();
            const r = e.getBoundingClientRect();
            return r.top >= bank.top - 1 && r.bottom <= bank.bottom + 1;
          }).map(box),
          outputs: [...document.querySelectorAll('.audio-detector-value')].filter((e) => {
            const bank = document.querySelector('#audio-detector-bank').getBoundingClientRect();
            const r = e.getBoundingClientRect();
            return r.top >= bank.top - 1 && r.bottom <= bank.bottom + 1;
          }).map(box),
          pageScroll: document.documentElement.scrollHeight > innerHeight + 1,
        };
      });
      expect(geometry.pageScroll).toBe(false);
      expect(geometry.cards).toHaveLength(12);
      expect(geometry.graph.width).toBeGreaterThan(geometry.root.width * 0.55);
      expect(geometry.panel.x).toBeGreaterThanOrEqual(geometry.graph.right);
      for (const item of [geometry.panel, ...geometry.visibleCards, ...geometry.outputs]) {
        expect(item.width).toBeGreaterThan(0);
        expect(item.height).toBeGreaterThan(0);
        expect(item.clipped).toBe(false);
        expect(item.right).toBeLessThanOrEqual(geometry.root.right);
        expect(item.bottom).toBeLessThanOrEqual(geometry.root.bottom);
      }
      if (!stage && viewport.width === 1280) {
        await page.screenshot({ path: testInfo.outputPath('audio-descriptors.png') });
      }
    }
  });
}
