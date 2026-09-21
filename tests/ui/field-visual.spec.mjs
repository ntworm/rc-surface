// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

const sizes = [{ width: 568, height: 320 }, { width: 851, height: 393 },
  { width: 1000, height: 650 }, { width: 1280, height: 960 }, { width: 1920, height: 1200 }];

test.beforeEach(async ({ page }) => {
  // Mutate only served responses when proving the guards; never the working tree.
  const mutation = process.env.RC_FIELD_MUTATION ? JSON.parse(process.env.RC_FIELD_MUTATION) : null;
  if (mutation) await page.route(`**/${mutation.file}`, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    if (!source.includes(mutation.from)) throw new Error(`Missing mutation target: ${mutation.from}`);
    await route.fulfill({ response, body: source.replace(mutation.from, mutation.to) });
  });
  await page.routeWebSocket('**/ws*', (socket) => socket.onMessage((raw) => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'field-test', role: 'controller' }));
    if (!message.cmd) return;
    if (message.cmd === 'addUdpReceiverToTrack') {
      socket.send(JSON.stringify({ id: message.id, ok: true, result: {
        success: false, inserted: false, existing: false, reason: 'receiver_missing',
      } }));
      return;
    }
    const result = message.cmd === 'getTargets'
      ? { targets: [{ trackKind: 'track', trackIndex: 0, isMidi: true, name: 'Test MIDI' }] }
      : message.cmd === 'getMappings' ? { mappings: {} } : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=pt-BR');
  await page.evaluate(() => document.fonts.ready);
});

async function needleGeometry(locator) {
  return locator.evaluate((dial) => {
    const face = dial.querySelector('.audio-analysis-dial-face') || dial.querySelector('.follow-attack-needle');
    const pseudo = getComputedStyle(face, face.classList.contains('follow-attack-needle') ? '::before' : '::after');
    // A transparent replica of the painted pseudo-element lets the browser
    // measure its endpoints, including every ancestor transform and border.
    const probe = document.createElement('span');
    for (const property of ['position', 'top', 'left', 'width', 'height', 'transform', 'transform-origin']) {
      probe.style.setProperty(property, pseudo.getPropertyValue(property));
    }
    probe.style.pointerEvents = 'none';
    face.appendChild(probe);
    const endpoints = ['0%', '100%'].map((top) => {
      const point = document.createElement('span');
      point.style.cssText = `position:absolute;left:50%;top:${top};width:0;height:0`;
      probe.appendChild(point);
      const rect = point.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    probe.remove();
    const rect = dial.getBoundingClientRect();
    return { tip: endpoints[0], base: endpoints[1], cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2, radius: rect.width / 2 };
  });
}

test('detector needles stay radial at every size after Follow is withheld', async ({ page }) => {
  await page.locator('.tab[data-page="audio"]').click();
  // This samples the continuous sweep; SYNC has discrete note positions,
  // including OFF, so its midpoint need not land at 50% of the travel.
  await page.locator('#btn-sync-mode').click();
  await page.locator('[data-audio-view="all"]').click();
  const controls = ['sensitivity', 'releaseMs', 'curve', 'toneMs', 'textureMs', 'bandsMs'];
  const directions = [[-Math.SQRT1_2, Math.SQRT1_2], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]];
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      for (const id of controls) {
        const input = page.locator(`[data-detector-knob="${id}"] input`);
        for (const [index, direction] of directions.entries()) {
          await input.evaluate((el, fraction) => {
            el.value = String(Number(el.min) + fraction * (Number(el.max) - Number(el.min)));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }, index / 2);
          const dial = input.locator('..');
          const g = await needleGeometry(dial);
          const dx = g.tip.x - g.base.x, dy = g.tip.y - g.base.y;
          const length = Math.hypot(dx, dy);
          const radial = Math.hypot(g.tip.x - g.cx, g.tip.y - g.cy);
          const miss = Math.abs(dx * (g.cy - g.tip.y) - dy * (g.cx - g.tip.x)) / length;
          expect(length, `${id}: visible tick`).toBeGreaterThan(3);
          expect(miss, `${id}: tick must point through the dial center`).toBeLessThan(1);
          expect(radial, `${id}: tip stays within dial`).toBeLessThan(g.radius);
          expect((g.tip.x - g.cx) / radial, `${id}: horizontal sweep`).toBeCloseTo(direction[0], 1);
          expect((g.tip.y - g.cy) / radial, `${id}: vertical sweep`).toBeCloseTo(direction[1], 1);
        }
      }
    }
  }
});

test('desktop VID puts camera commands at the top and prioritizes useful preview area', async ({ page }) => {
  await page.locator('.tab[data-page="video"]').click();
  await expect(page.locator('.vision-studio-head')).toContainText('3 exemplos cada · momentâneo 0 → 1');
  expect((await page.locator('.vision-studio-head').innerText()).match(/momentâneo/g)).toHaveLength(1);
  for (const viewport of [{ width: 1000, height: 650 }, { width: 1280, height: 960 },
    { width: 1440, height: 900 }, { width: 1920, height: 1200 }]) {
    await page.setViewportSize(viewport);
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      const g = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { workspace: rect('.vision-workspace'), commands: rect('.vision-command-bar'),
          preview: rect('.vision-camera-stage'), canvas: rect('#vision-canvas'),
          fit: getComputedStyle(document.getElementById('vision-canvas')).objectFit };
      });
      expect(g.commands.y - g.workspace.y, 'no dead band above camera controls').toBeLessThan(4);
      expect(g.preview.y - g.commands.bottom, 'preview follows controls').toBeLessThan(16);
      expect(g.preview.width, 'camera gets at least 58% of the workspace width').toBeGreaterThan(g.workspace.width * 0.58);
      expect(g.preview.height, 'large enough to see hand details').toBeGreaterThan(g.workspace.height * 0.7);
      expect(g.fit, 'camera image is contained, never stretched/cropped').toBe('contain');
      for (const button of await page.locator('.vision-gesture-list button').all()) {
        const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(clipped, 'all four detector names remain readable beside the larger camera').toBe(false);
      }
    }
  }
});

test('AUD omits the withheld Follow receiver controls at every viewport', async ({ page }) => {
  await page.locator('.tab[data-page="audio"]').click();
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#follow-note, #follow-note-track, #follow-note-toggle')).toHaveCount(0);
  }
});
