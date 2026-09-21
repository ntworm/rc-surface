// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Only the Live boundary is simulated; assets, controls and layout are real.
  await page.routeWebSocket('**/ws*', (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(raw);
      if (!message.cmd) return;
      const result = message.cmd === 'getTargets'
        ? { targets: [{ trackKind: 'track', trackIndex: 0, isMidi: true, name: 'Test MIDI' }] }
        : message.cmd === 'getMappings' ? { mappings: {} } : {};
      socket.send(JSON.stringify({ id: message.id, ok: true, result }));
    });
  });
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=pt-BR');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.tab[data-page="audio"]').click();
});

test('AUD uses the shipped Portuguese catalog', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('.media-switch-row').filter({ has: page.locator('#chk-audio-enable') }))
    .toContainText('Entrada de áudio');
});

test('AUD loads the actual bundled face, not fallback geometry', async ({ page }) => {
  const font = await page.evaluate(() => [...document.fonts]
    .find((face) => face.family.replaceAll('"', '') === 'Departure Mono')?.status);
  expect(font).toBe('loaded');
});

test('AUD omits Follow controls for a read-only client', async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ableton-rc:phone-client-id', {
    detail: { clientId: 'viewer-test', role: 'viewer' },
  })));

  await expect(page.locator('#follow-note, #follow-note-track, #follow-note-toggle')).toHaveCount(0);
});

for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 300 }, { width: 851, height: 393 }]) {
  test(`AUD keeps a readable graph and compact controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Amplitude offers only the shared window picker; the attack knobs are the
    // ones with dials to measure.
    await page.locator('[data-audio-view="attacks"]').click();
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      await expect(page.locator('#follow-note')).toHaveCount(0);

      {
        const geometry = await page.evaluate(() => {
          const rect = (element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
          };
          const one = (selector) => rect(document.querySelector(selector));
          const controls = [...document.querySelectorAll('.audio-analysis-control')]
            .filter((element) => element.querySelector('.audio-analysis-dial'))
            .map((element) => ({
              card: rect(element), dial: rect(element.querySelector('.audio-analysis-dial')),
            }));
          return {
            page: one('.page-audio'), graph: one('#audio-timeline'), canvas: one('#audio-timeline-canvas'),
            head: one('.audio-timeline-head'), footer: one('.audio-timeline-legend'),
            analysis: one('.audio-analysis-grid'), controls,
          };
        });
        expect(geometry.graph.height, 'graph needs room beyond its toolbar').toBeGreaterThanOrEqual(70);
        expect(geometry.graph.width, 'graph spans the analysis column').toBeGreaterThanOrEqual(geometry.analysis.width - 2);
        expect(geometry.canvas.height, 'unobstructed signal area').toBeGreaterThanOrEqual(28);
        expect(geometry.canvas.y, 'toolbar must not cover signal').toBeGreaterThanOrEqual(geometry.head.bottom);
        expect(geometry.canvas.bottom, 'footer must not cover signal').toBeLessThanOrEqual(geometry.footer.y);
        for (const { card, dial } of geometry.controls) {
          expect(card.height, 'knob cards must not absorb spare screen height').toBeLessThanOrEqual(100);
          expect(dial.width, 'usable dial touch width').toBeGreaterThanOrEqual(30);
          expect(dial.bottom, 'dial must stay inside its card').toBeLessThanOrEqual(card.bottom);
        }
      }
    }
  });
}

test('AUD keeps live numbers and translated labels readable on phones', async ({ page }) => {
  await page.locator('[data-audio-view="attacks"]').click();
  await page.evaluate(() => {
    for (const [id, value] of Object.entries({
      'lbl-audio-centroid': '19850 Hz', 'lbl-audio-rolloff': '19850 Hz',
      'lbl-audio-transient': '0.999', 'lbl-audio-flatness': '0.999',
    })) document.getElementById(id).textContent = value;
  });
  for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 300 }]) {
    await page.setViewportSize(viewport);
    const clipped = await page.evaluate(() => {
      const selectors = '.audio-detector-value,.audio-detector-label,.audio-analysis-control-head,.audio-analysis-control';
      // Vertical scrolling inside the detector bank is by design on a short
      // phone; a value cut off sideways is not.
      return [...document.querySelectorAll(selectors)].filter((element) => element.getClientRects().length)
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent.trim());
    });
    expect(clipped, 'visible labels and values must fit without clipping or ellipsis').toEqual([]);
  }
});

test('AUD omits the retired decision counters and reset', async ({ page }) => {
  await expect(page.locator('#audio-diagnostic-summary, #audio-diagnostic-reset, #audio-timeline-mode-decisions')).toHaveCount(0);
});
