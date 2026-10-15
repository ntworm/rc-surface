// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// E2E suite for RC Surface phone UI.
// ALL assertions are unconditional — no `if (await x.isVisible())` guards.

import { test, expect } from '@playwright/test';

const LANDSCAPE_PHONE_VIEWPORTS = [
  { width: 568, height: 320 },
  { width: 851, height: 393 },
];

async function measurePageFit(page, pageSelector, requiredSelectors) {
  return page.evaluate(({ pageSelector, requiredSelectors }) => {
    const root = document.querySelector(pageSelector);
    if (!root) throw new Error(`Missing page ${pageSelector}`);

    const rootRect = root.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const missing = [];
    const targets = [];

    for (const selector of requiredSelectors) {
      const elements = [...root.querySelectorAll(selector)];
      if (elements.length === 0) missing.push(selector);
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        targets.push({
          selector,
          id: element.id,
          className: typeof element.className === 'string' ? element.className : '',
          display: style.display,
          visibility: style.visibility,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return {
      root: {
        left: rootRect.left,
        right: rootRect.right,
        top: rootRect.top,
        bottom: rootRect.bottom,
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        overflowX: rootStyle.overflowX,
        overflowY: rootStyle.overflowY,
      },
      missing,
      targets,
    };
  }, { pageSelector, requiredSelectors });
}

function expectPageFit(metrics, label) {
  expect(metrics.missing, `${label}: required controls`).toEqual([]);
  expect(['hidden', 'clip'], `${label}: horizontal scrolling`).toContain(metrics.root.overflowX);
  expect(['hidden', 'clip'], `${label}: vertical scrolling`).toContain(metrics.root.overflowY);
  expect(
    metrics.root.scrollWidth - metrics.root.clientWidth,
    `${label}: horizontal overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.root.scrollHeight - metrics.root.clientHeight,
    `${label}: vertical overflow`,
  ).toBeLessThanOrEqual(1);

  for (const target of metrics.targets) {
    const name = target.id || target.className || target.selector;
    expect(target.display, `${label}: ${name} is rendered`).not.toBe('none');
    expect(target.visibility, `${label}: ${name} is visible`).not.toBe('hidden');
    expect(target.width, `${label}: ${name} has width`).toBeGreaterThan(0);
    expect(target.height, `${label}: ${name} has height`).toBeGreaterThan(0);
    expect(target.left, `${label}: ${name} left edge`).toBeGreaterThanOrEqual(metrics.root.left - 1);
    expect(target.right, `${label}: ${name} right edge`).toBeLessThanOrEqual(metrics.root.right + 1);
    expect(target.top, `${label}: ${name} top edge`).toBeGreaterThanOrEqual(metrics.root.top - 1);
    expect(target.bottom, `${label}: ${name} bottom edge`).toBeLessThanOrEqual(metrics.root.bottom + 1);
  }
}

test.describe('RC Surface UI & E2E Suite', () => {

  // Suppress the orientation-warning overlay AND any pointer-intercepting overlays.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Apply CSS first to prevent any flash of the overlay
    await page.addStyleTag({
      content: [
        '#orientation-warning, .orientation-warning {',
        '  display: none !important;',
        '  pointer-events: none !important;',
        '  visibility: hidden !important;',
        '}',
        '.permission-banner { display: none !important; }',
      ].join('\n'),
    });
    // Also dismiss via JS to handle elements that might intercept before CSS applies
    await page.evaluate(() => {
      const warn = document.getElementById('orientation-warning')
        || document.querySelector('.orientation-warning');
      if (warn) {
        warn.style.cssText = 'display:none!important;pointer-events:none!important;visibility:hidden!important';
        warn.remove();
      }
      // Hide the permission banner too
      const banner = document.getElementById('permission-banner');
      if (banner) banner.style.display = 'none';
    });
    await page.waitForTimeout(300);
  });

  // ── SCENARIO 1: Status bar and navigation rendered ──────────────────────────
  test('page load renders top status bar and navigation tabs', async ({ page }) => {
    await expect(page).toHaveTitle('RC Surface 2.0');
    await expect(page.locator('header.topbar')).toBeVisible();

    const tabs = page.locator('.tabs .tab');
    await expect(tabs).toHaveText(['PERF', 'MIX', 'SNP', 'SNS', 'AUD', 'VID', 'REC']);
    expect(await tabs.evaluateAll(elements => elements.map(element => element.dataset.page)))
      .toEqual(['performance', 'mixer', 'snapshots', 'sensors', 'audio', 'video', 'recording']);

    // Status element must exist in DOM (may be empty before WS connects)
    await expect(page.locator('#status')).toBeAttached();
  });

  // ── SCENARIO 2: Tab activates correct panel, hides others ───────────────────
  test('tab navigation activates the correct panel and hides the others', async ({ page }) => {
    const allTabs = page.locator('.tabs .tab');
    const tabCount = await allTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    // Use the second tab (index 1); get its data-page
    const secondTab = allTabs.nth(1);
    const targetPage = await secondTab.getAttribute('data-page');
    expect(targetPage).not.toBeNull();

    // Trigger click via evaluate to guarantee event firing regardless of mobile viewport orientation overlays
    await secondTab.evaluate((el) => el.click());
    await page.waitForTimeout(200);

    // Body data-page must reflect the clicked tab
    await expect(page.locator('body')).toHaveAttribute('data-page', targetPage);

    // Target panel must NOT have the "hidden" class
    const targetPanel = page.locator(`[data-page="${targetPage}"].page`);
    await expect(targetPanel).not.toHaveClass(/\bhidden\b/);

    // Performance panel must be hidden
    const perfPanel = page.locator('[data-page="performance"].page');
    await expect(perfPanel).toHaveClass(/\bhidden\b/);

    // Navigate back to performance
    await page.locator('.tabs .tab[data-page="performance"]').evaluate((el) => el.click());
    await page.waitForTimeout(200);
    await expect(page.locator('body')).toHaveAttribute('data-page', 'performance');
    await expect(perfPanel).not.toHaveClass(/\bhidden\b/);
  });

  // ── SCENARIO 3: Transport modal opens and closes ─────────────────────────────
  test('transport modal opens and closes via close button', async ({ page }) => {
    const openBtn = page.locator('#btn-trn-mode');
    await expect(openBtn).toBeAttached();

    await openBtn.evaluate((el) => el.click());
    await page.waitForTimeout(200);

    const overlay = page.locator('#transport-lite-overlay');
    // After opening, overlay must not carry the hidden class
    await expect(overlay).not.toHaveClass(/\bhidden\b/);

    // Close via the close button
    const closeBtn = page.locator('#btn-trn-close');
    await expect(closeBtn).toBeAttached();
    await closeBtn.evaluate((el) => el.click());
    await page.waitForTimeout(200);

    // Overlay must be hidden again
    await expect(overlay).toHaveClass(/\bhidden\b/);
  });

  // ── SCENARIO 4: A named control can receive focus programmatically ───────────
  test('a data-name control element can be focused via JavaScript', async ({ page }) => {
    // data-name elements are <div>s — not Tab-focusable natively.
    // The test verifies the DOM is ready and the controls exist and
    // can be focused via element.focus() (which the mapping system uses).
    const firstControlName = await page.evaluate(() => {
      const el = document.querySelector('[data-name]');
      if (!el) return null;
      // Make it programmatically focusable and focus it
      el.tabIndex = 0;
      el.focus();
      return document.activeElement?.dataset?.name ?? null;
    });

    // Must have found and focused a control with a non-empty data-name
    expect(firstControlName).not.toBeNull();
    expect(firstControlName.length).toBeGreaterThan(0);
  });

  // ── SCENARIO 5: WS close triggers disconnected status ───────────────────────
  test('status reflects disconnected state after WebSocket close', async ({ page }) => {
    const statusEl = page.locator('#status');
    await expect(statusEl).toBeAttached();

    // Ensure the socket is genuinely OPEN and the status is not already disconnected
    // before closing, verifying that onclose actively triggers the state transition.
    await expect.poll(() => page.evaluate(() => window.phoneWs?.readyState === (window.WebSocket ? window.WebSocket.OPEN : 1)))
      .toBe(true);
    await expect(statusEl).not.toHaveClass(/disconnected/);

    // Only runFor may move time: onclose schedules a reconnect setTimeout(connect, 1000).
    // Pausing the clock prevents the reconnect timer from firing and clearing the status
    // on slow runners before the assertion reads it.
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

    // Programmatically close the WS from inside the page
    await page.evaluate(() => {
      window.phoneWs.close();
    });

    // Confirm transition to disconnected
    await expect(statusEl).toHaveClass(/disconnected/);

    // After close the status class must indicate disconnected state
    const cls = await statusEl.getAttribute('class') ?? '';
    const txt = await statusEl.textContent() ?? '';
    expect(
      cls.includes('disconnected') || txt.includes('RETRY') || txt.includes('OFFLINE'),
    ).toBe(true);
  });

  // ── SCENARIO 6: onControl records value in currentControlStates ─────────────
  test('onControl API records a control value in currentControlStates', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof window.onControl === 'function') {
        window.onControl({ name: 'e2e-test-pad', value: 0.42 });
      }
    });

    const stored = await page.evaluate(() => window.currentControlStates?.['e2e-test-pad']);
    expect(stored).toBeCloseTo(0.42, 5);
  });

  // ── SCENARIO 7: Orientation change does not crash the page ──────────────────
  test('orientationchange and resize events do not crash the page', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });

    await page.waitForTimeout(400);

    // Page must still be functional
    await expect(page.locator('#status')).toBeAttached();
    // No uncaught JS errors triggered by the events
    expect(pageErrors).toHaveLength(0);
  });

  // ── SCENARIO 8: Snapshot capture and recall via RCSurface.snapshots ─────────
  test('RCSurface.snapshots captures control states and recalls slot state', async ({ page }) => {
    // Inject initial control value and capture snapshot
    const captureResult = await page.evaluate(() => {
      const snaps = window.RCSurface?.snapshots;
      if (!snaps) return null;

      window.onControl({ name: 'pad-1', value: 0.95 });
      snaps.setSnapshotCaptureMode(true);
      const isCapturing = snaps.isCaptureMode();
      snaps.handleSnapshotSlot(0);

      const capturedSnap = snaps.getSnapshots()[0];

      // Reset control value to 0
      window.onControl({ name: 'pad-1', value: 0.0 });
      const resetVal = window.currentControlStates['pad-1'];

      // Start recall of snapshot 0 with short morph duration (0.1s)
      snaps.startLinearMorph(capturedSnap, 0.1);

      return {
        isCapturing,
        capturedValue: capturedSnap ? capturedSnap['pad-1'] : null,
        resetVal,
      };
    });

    expect(captureResult).not.toBeNull();
    expect(captureResult.isCapturing).toBe(true);
    expect(captureResult.capturedValue).toBe(0.95);
    expect(captureResult.resetVal).toBe(0.0);

    // Wait for the 0.1s morph animation to finish
    await page.waitForTimeout(200);

    const recalledVal = await page.evaluate(() => window.currentControlStates?.['pad-1']);
    expect(recalledVal).toBeCloseTo(0.95, 2);
  });

  test('STAGE leaves with the browser when fullscreen drops outside its button', async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 393 });
    const stage = page.locator('#btn-stage-mode');
    await stage.click();
    await expect(page.locator('body')).toHaveClass(/stage-mode/);
    await expect(stage).toHaveText('EXIT');
    await expect(stage).toHaveAttribute('aria-pressed', 'true');
    const fullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
    test.skip(!fullscreen, 'this browser refused fullscreen, so there is nothing to drop');

    // A system gesture or a permission prompt ends fullscreen without the
    // button. The page must not stay on stage with an EXIT and no fullscreen.
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('body')).not.toHaveClass(/stage-mode/);
    await expect(stage).toHaveText('STAGE');
    await expect(stage).toHaveAttribute('aria-pressed', 'false');

    // The button still toggles both ways afterwards.
    await stage.click();
    await expect(page.locator('body')).toHaveClass(/stage-mode/);
    await stage.click();
    await expect(page.locator('body')).not.toHaveClass(/stage-mode/);
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  });

  test('STAGE tapped off before fullscreen is granted does not leave the page fullscreen', async ({ page }) => {
    // A slow fullscreen grant (as on Windows runners and some phones) must
    // not outlive a quick STAGE then EXIT.
    await page.addInitScript(() => {
      const request = Element.prototype.requestFullscreen;
      Element.prototype.requestFullscreen = function slowRequest(...args) {
        return new Promise((resolve) => setTimeout(resolve, 150)).then(() => request.apply(this, args));
      };
    });
    await page.reload();
    await page.setViewportSize({ width: 851, height: 393 });
    const stage = page.locator('#btn-stage-mode');
    await stage.click();
    await stage.click();
    await expect(page.locator('body')).not.toHaveClass(/stage-mode/);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await expect(stage).toHaveText('STAGE');
  });

  test('STAGE labels its exit in the interface language', async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 393 });
    await page.evaluate(() => window.RcSurfaceI18n.setLocale('pt-BR'));
    const stage = page.locator('#btn-stage-mode');
    await stage.click();
    await expect(stage).toHaveText('SAIR');
    // A language change while on stage keeps the exit label, not STAGE.
    await page.evaluate(() => window.RcSurfaceI18n.setLocale('en'));
    await expect(stage).toHaveText('EXIT');
    await stage.click();
    await expect(stage).toHaveText('STAGE');
  });

  test('VID uses six-capture slots without a Takes selector and restores legacy banks', async ({ page }) => {
    await page.locator('.tabs .tab[data-page="video"]').evaluate((element) => element.click());
    await expect(page.locator('#vision-pose-takes')).toHaveCount(0);
    const counts = page.locator('.vision-gesture-slot header strong');
    await expect(counts).toHaveText(['0 / 6', '0 / 6', '0 / 6']);
    for (const [locale, caption] of [['en', '3 to start · up to 6'], ['pt-BR', '3 para começar · até 6']]) {
      await page.evaluate(language => window.RcSurfaceI18n.setLocale(language), locale);
      await expect(page.locator('[data-i18n="vid.examplesEach"]')).toHaveText(caption);
    }
    for (let count = 0; count <= 6; count++) {
      await page.evaluate(n => window.applyProjectClientState({
        gestures: { version: 9, maxTakes: 3, templates: [1, 2, 3].map(id => ({
          name: `Gesture ${id}`, kind: 'pose', samples: Array.from({ length: n }, () => Array(42).fill(0)),
        })) }, preferences: { visionGestureOptions: { maxTakes: 3 } },
      }), count);
      await expect(counts).toHaveText(Array(3).fill(`${count} / 6`));
      for (const card of await page.locator('.vision-gesture-slot').all()) {
        if (count < 3) await expect(card.locator('.vision-slot-test')).toBeDisabled();
        else await expect(card.locator('.vision-slot-test')).toBeEnabled();
        if (count === 6) await expect(card.locator('.vision-slot-learn')).toBeDisabled();
        else await expect(card.locator('.vision-slot-learn')).toBeEnabled();
      }
    }
    await page.reload();
    await expect(counts).toHaveText(['6 / 6', '6 / 6', '6 / 6']);
    await expect(page.locator('#vision-pose-takes')).toHaveCount(0);
  });

  test('VID camera controls remain usable at 568px landscape width', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => window.RcSurfaceI18n.setLocale('pt-BR'));
    await page.locator('.tabs .tab[data-page="video"]').evaluate((el) => el.click());
    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      // On a phone the camera owns the left column; its commands head the
      // right-hand controls column.
      const left = document.querySelector('.vision-right-column').getBoundingClientRect();
      const bar = document.querySelector('.vision-command-bar');
      const controls = [
        document.querySelector('.vision-camera-toggle'),
        document.getElementById('vision-confidence'),
        document.getElementById('vision-recognition-preset'),
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        const label = element.closest('label');
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right,
          labelWidth: label.getBoundingClientRect().width, minWidth: getComputedStyle(label).minWidth };
      });
      return {
        left: { left: left.left, right: left.right, width: left.width },
        barOverflow: bar.scrollWidth - bar.clientWidth,
        controls,
      };
    });

    expect(geometry.barOverflow, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
    for (const control of geometry.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.left).toBeGreaterThanOrEqual(geometry.left.left - 1);
      expect(control.right).toBeLessThanOrEqual(geometry.left.right + 1);
    }
    expect(geometry.controls.at(-1).height).toBeGreaterThanOrEqual(44);
  });

  test('VID pose diagnostics and retake actions remain reachable on short screens', async ({ page }) => {
    await page.locator('.tabs .tab[data-page="video"]').evaluate((el) => el.click());
    for (const locale of ['en', 'pt-BR']) {
      await page.evaluate((language) => {
        window.RcSurfaceI18n.setLocale(language);
        // Show the same optional rows as TEST and an inconsistent capture.
        for (const card of document.querySelectorAll('.vision-gesture-slot')) {
          const neighbor = card.querySelector('.vision-slot-neighbor');
          neighbor.textContent = language === 'en'
            ? 'Nearest: take 6 · 98% of radius' : 'Mais próxima: tomada 6 · 98% do raio';
          neighbor.classList.remove('hidden');
          const warning = card.querySelector('.vision-slot-consistency');
          warning.querySelector('.vision-consistency-message').textContent = language === 'en'
            ? 'Take 6 differs from the others.' : 'A tomada 6 difere das demais.';
          warning.classList.remove('hidden');
        }
      }, locale);
      for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 393 }, { width: 1000, height: 650 }, { width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport);
        const cards = await page.locator('.vision-gesture-slot').evaluateAll((slots) => slots.map((card) => {
          const bounds = card.getBoundingClientRect();
          return { overflow: card.scrollHeight - card.clientHeight,
            rows: [...card.querySelectorAll('.vision-slot-neighbor, .vision-slot-consistency')].map((row) => {
              const rect = row.getBoundingClientRect();
              return { bottom: rect.bottom, cardBottom: bounds.bottom, right: rect.right, cardRight: bounds.right };
            }) };
        }));
        for (const card of cards) {
          expect(card.overflow, `${locale} ${viewport.width}: pose rows fit their card`).toBeLessThanOrEqual(1);
          for (const row of card.rows) {
            expect(row.bottom).toBeLessThanOrEqual(row.cardBottom + 1);
            expect(row.right).toBeLessThanOrEqual(row.cardRight + 1);
          }
        }
        for (const selector of ['.vision-consistency-retake', '.vision-consistency-keep']) {
          const button = page.locator(selector).last();
          await button.scrollIntoViewIfNeeded();
          await expect(button).toBeInViewport();
          await button.click({ trial: true });
          expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  test('AUD keeps every active control inside landscape phone viewports after Follow is withheld', async ({ page }) => {
    const requiredSelectors = [
      '.media-switch-row',
      '.audio-window-control',
      '.audio-timeline',
      // Twelve descriptor rows cannot all fit a 320px-tall phone: the bank
      // itself must fit the page and scroll internally, never the page.
      '#audio-detector-bank',
      '#audio-detector-controls',
    ];

    await page.locator('.tabs .tab[data-page="audio"]').evaluate((element) => element.click());

    const expectDecisionViewFit = async (label) => {
      await expect(page.locator('#audio-timeline-mode-decisions, .audio-diagnostic-footer')).toHaveCount(0);
      const metrics = await measurePageFit(page, '.page-audio', [
        '#audio-timeline-canvas', '#audio-timeline-status', '#audio-detector-bank',
      ]);
      expectPageFit(metrics, label + ' detectors');
    };

    for (const viewport of LANDSCAPE_PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.body.classList.remove('stage-mode'));

      await expect(page.locator('#follow-note')).toHaveCount(0);

      expectPageFit(
        await measurePageFit(page, '.page-audio', requiredSelectors),
        `AUD ${viewport.width}x${viewport.height} permanent`,
      );
      await expectDecisionViewFit(`AUD ${viewport.width}x${viewport.height} permanent`);

      await page.evaluate(() => document.body.classList.add('stage-mode'));
      expectPageFit(
        await measurePageFit(page, '.page-audio', requiredSelectors),
        `AUD ${viewport.width}x${viewport.height} permanent stage`,
      );
      await expectDecisionViewFit(`AUD ${viewport.width}x${viewport.height} permanent stage`);

    }
  });

  test('VID remains fully contained at landscape phone viewports', async ({ page }) => {
    const requiredSelectors = [
      '.vision-camera-toggle',
      '#vision-confidence',
      '#vision-recognition-preset',
      '.vision-command-bar',
      '.vision-pose-grid',
      '.vision-detector-section',
      '.vision-signal-strip',
    ];

    await page.locator('.tabs .tab[data-page="video"]').evaluate((element) => element.click());

    for (const viewport of LANDSCAPE_PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const stageMode of [false, true]) {
        await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stageMode);
        expectPageFit(
          await measurePageFit(page, '.page-video', requiredSelectors),
          `VID ${viewport.width}x${viewport.height}${stageMode ? ' stage' : ''}`,
        );
        const bank = page.locator('.vision-pose-grid');
        await expect(bank).toHaveCSS('overflow-y', 'auto');
        expect(await bank.evaluate(el => el.scrollHeight - el.clientHeight), 'pose bank scrolls internally')
          .toBeGreaterThan(1);
        await expect(bank.locator('.vision-gesture-slot')).toHaveCount(3);
        for (const card of await bank.locator('.vision-gesture-slot').all()) {
          // A short bank need not show an entire card at once. Every name and
          // action must be reachable, fully inside the bank, without page scroll.
          for (const target of [card.locator('header > span'), ...await card.locator('button:visible').all()]) {
            await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
            const geometry = await target.evaluate(el => {
              const rect = el.getBoundingClientRect().toJSON();
              const bank = el.closest('.vision-pose-grid');
              const page = el.closest('.page-video');
              return { rect, bank: bank.getBoundingClientRect().toJSON(), bankScroll: bank.scrollTop,
                pageScroll: page.scrollTop, windowScroll: window.scrollY,
                clippedText: el.scrollWidth > el.clientWidth };
            });
            expect(geometry.rect.top).toBeGreaterThanOrEqual(geometry.bank.top - 1);
            expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.bank.bottom + 1);
            expect(geometry.rect.left).toBeGreaterThanOrEqual(geometry.bank.left - 1);
            expect(geometry.rect.right).toBeLessThanOrEqual(geometry.bank.right + 1);
            expect(geometry.pageScroll).toBe(0);
            expect(geometry.windowScroll).toBe(0);
            expect(geometry.clippedText).toBe(false);
          }
        }
        expect(await bank.evaluate(el => el.scrollTop), 'last card is reached by internal scroll').toBeGreaterThan(0);
        expectPageFit(await measurePageFit(page, '.page-video', requiredSelectors), 'VID after bank scroll');
      }
    }
  });

  test('detector knobs render as custom dials and remain keyboard accessible', async ({ page }) => {
    await page.locator('.tabs .tab[data-page="audio"]').evaluate((el) => el.click());
    // Amplitude has no detector of its own: only the shared window picker.
    await expect(page.locator('.audio-analysis-control')).toHaveCount(0);
    await expect(page.locator('[data-detector-knob="window"]')).toHaveCount(1);

    // Attacks: sensitivity, release, curve and the group's output gain.
    await page.locator('[data-audio-view="attacks"]').click();
    await expect(page.locator('.audio-analysis-dial')).toHaveCount(4);
    await expect(page.locator('.audio-analysis-control')).toHaveCount(4);

    const release = page.locator('[data-detector-knob="releaseMs"] input');
    await release.focus();
    const before = await page.locator('[data-detector-knob="releaseMs"] output').textContent();
    await release.press('ArrowUp');
    const after = await page.locator('[data-detector-knob="releaseMs"] output').textContent();
    expect(after).not.toBe(before);
    await expect(release).toHaveCSS('pointer-events', 'none');

    // A reading group shows its smoothing and its gain; the combined view
    // shows every group's knobs under four shared group headings.
    await page.locator('[data-audio-view="bands"]').click();
    await expect(page.locator('.audio-analysis-dial')).toHaveCount(2);
    await expect(page.locator('[data-detector-knob="bandsGain"]')).toHaveCount(1);
    await page.locator('[data-audio-view="all"]').click();
    await expect(page.locator('.audio-analysis-dial')).toHaveCount(10);
    await expect(page.locator('.audio-control-group h3')).toHaveCount(4);
  });
});
