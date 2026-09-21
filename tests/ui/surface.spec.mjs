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
    await expect(page).toHaveTitle(/ableton-rc/i);
    await expect(page.locator('header.topbar')).toBeVisible();

    const tabs = page.locator('.tabs .tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

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
    // Allow time for the initial connection attempt to start
    await page.waitForTimeout(1200);

    // Programmatically close the WS from inside the page
    await page.evaluate(() => {
      const ws = window.phoneWs;
      if (ws && ws.readyState < 2) ws.close();
    });

    await page.waitForTimeout(600);

    const statusEl = page.locator('#status');
    await expect(statusEl).toBeAttached();

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

  test('VID camera controls remain usable at 568px landscape width', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.locator('.tabs .tab[data-page="video"]').evaluate((el) => el.click());
    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      const left = document.querySelector('.vision-left-column').getBoundingClientRect();
      const bar = document.querySelector('.vision-command-bar');
      const controls = [
        document.querySelector('.vision-camera-toggle'),
        document.getElementById('vision-confidence'),
        document.getElementById('vision-recognition-preset'),
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, left: rect.left, right: rect.right };
      });
      return {
        left: { left: left.left, right: left.right, width: left.width },
        barOverflow: bar.scrollWidth - bar.clientWidth,
        controls,
      };
    });

    expect(geometry.barOverflow).toBeLessThanOrEqual(1);
    for (const control of geometry.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.left).toBeGreaterThanOrEqual(geometry.left.left - 1);
      expect(control.right).toBeLessThanOrEqual(geometry.left.right + 1);
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
      '.vision-gesture-slot',
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
