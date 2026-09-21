// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test.beforeEach(async ({ page }) => {
  // Optional test-only response mutation: production files stay untouched.
  const mutation = process.env.RC_CONTROL_MUTATION ? JSON.parse(process.env.RC_CONTROL_MUTATION) : null;
  if (mutation) await page.route(`**/${mutation.file}`, async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    if (!original.includes(mutation.from)) throw new Error(`Missing mutation target: ${mutation.from}`);
    await route.fulfill({ response, body: original.replace(mutation.from, mutation.to) });
  });
  await page.routeWebSocket('**/ws*', (socket) => socket.onMessage((raw) => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'polish-test', role: 'controller' }));
    if (!message.cmd) return;
    const result = message.cmd === 'getTargets'
      ? { targets: [{ trackKind: 'track', trackIndex: 0, isMidi: true, name: 'Test MIDI' }] }
      : message.cmd === 'getMappings' ? { mappings: {} }
        : { success: true };
    const reply = () => socket.send(JSON.stringify({ id: message.id, ok: true, result }));
    reply();
  }));
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=pt-BR');
  await page.evaluate(() => document.fonts.ready);
});

test('snapshot time uses a custom fader in Free and Sync without losing keyboard control', async ({ page }) => {
  await page.locator('.tab[data-page="snapshots"]').click();
  const slider = page.locator('#slider-morph-time');
  for (const mode of ['free', 'sync']) {
    await page.locator(`[data-morph-sync="${mode}"]`).click();
    expect(await slider.evaluate((el) => getComputedStyle(el).appearance), 'no browser-default slider').toBe('none');
    await slider.focus();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue(mode === 'free' ? '0.2' : '1');
    const progress = await slider.evaluate((el) => Number.parseFloat(el.style.getPropertyValue('--range-progress')));
    expect(progress, 'custom fill follows the actual value').toBeCloseTo(mode === 'free' ? 100 / 49 : 12.5, 4);
    await expect(page.locator('#morph-time-val')).toHaveText(mode === 'free' ? '0.2s' : '8 tempos');
  }
});

test('all three VID cards keep capture and delete-last words on two unclipped lines', async ({ page }) => {
  await page.locator('.tab[data-page="video"]').click();
  for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 393 }, { width: 1280, height: 960 }]) {
    await page.setViewportSize(viewport);
    const labels = await page.locator('.vision-slot-learn, .vision-slot-retake').evaluateAll((buttons) => buttons.map((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      const rects = [...range.getClientRects()];
      const box = button.getBoundingClientRect();
      return { text: button.textContent.trim(), lines: new Set(rects.filter((r) => r.width > 0).map((r) => Math.round(r.top))).size,
        clipped: rects.some((r) => r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom) };
    }));
    expect(labels).toHaveLength(6);
    for (const label of labels) {
      expect(label.text).toMatch(/^(CAPTURAR\s+POSE|APAGAR\s+ÚLTIMA)$/i);
      expect(label.lines, label.text).toBe(2);
      expect(label.clipped, label.text).toBe(false);
    }
  }
});

test('AUD frees the Follow layout while the feature is withheld', async ({ page }) => {
  await page.locator('.tab[data-page="audio"]').click();
  for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 300 }, { width: 851, height: 393 },
    { width: 1000, height: 650 }, { width: 1280, height: 960 }]) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((value) => document.body.classList.toggle('stage-mode', value), stage);
      await expect(page.locator('#follow-note, .velocity-graph, #fn-attack')).toHaveCount(0);
      const geometry = await page.locator('.page-audio').evaluate((root) => {
        const rootBox = root.getBoundingClientRect();
        const boxes = (selector) => [...root.querySelectorAll(selector)]
          .filter((element) => element.getClientRects().length)
          .map((element) => element.getBoundingClientRect());
        const blocks = boxes('.audio-analysis-readouts, #audio-timeline, .audio-extra-grid');
        const controls = [...root.querySelectorAll('.audio-analysis-control, .audio-stats > span, .media-meter, .audio-timeline-modes button, .audio-extra-btn')]
          .filter((element) => element.getClientRects().length);
        return {
          scroll: root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1,
          clipped: controls.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.top < rootBox.top || box.bottom > rootBox.bottom || box.left < rootBox.left || box.right > rootBox.right;
          }).map((element) => element.id || element.className || element.textContent.trim()),
          overlap: blocks.some((a, index) => blocks.slice(index + 1).some((b) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
              && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)),
          timelineHeight: root.querySelector('#audio-timeline').getBoundingClientRect().height,
        };
      });
      expect(geometry.scroll).toBe(false);
      expect(geometry.clipped).toEqual([]);
      expect(geometry.overlap).toBe(false);
      expect(geometry.timelineHeight).toBeGreaterThanOrEqual(viewport.width >= 1000 ? 100 : 70);
    }
  }
});
