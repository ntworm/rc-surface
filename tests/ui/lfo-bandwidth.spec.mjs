import { test, expect } from '@playwright/test';

test('r11 shape settings select all ceilings without phase resets and persist', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.goto('/?lang=en');
  await page.evaluate(() => {
    window.syncMode = 'free';
    window.controlSetters['toggle-1.rate'](1);
    window.controlSetters['toggle-1'](1);
  });
  await page.locator('#btn-sync-settings').click();
  for (const [shape, max] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 })) {
    const error = await page.evaluate(shape => {
      const state = window.lfoStates.get('toggle-1');
      const before = { phase: state.phase, time: state.phaseTime, frequency: state.phaseFrequency };
      document.querySelector('#lfo-shape-grid [data-val="' + shape + '"]').click();
      const expected = (before.phase + (state.phaseTime - before.time) / 1000 * before.frequency * 2 * Math.PI) % (2 * Math.PI);
      return Math.abs(Math.atan2(Math.sin(state.phase - expected), Math.cos(state.phase - expected)));
    }, shape);
    expect(error).toBeLessThan(1e-7);
    await expect(page.locator('#lfo-shape-limit')).toHaveText(shape + ' · MAX ' + max + ' Hz');
    await expect(page.locator('.toggle[data-name="toggle-1"] .lfo-rate-readout')).toHaveText(max.toFixed(2) + ' Hz');
  }
  await page.reload();
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#lfo-shape-limit')).toHaveText('square · MAX 12 Hz');
});

test('r11 compact Stutter shows only its rate and retains high-rate activity', async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.goto('/?lang=pt-BR');
  await page.evaluate(() => {
    window.syncMode = 'free';
    window.controlSetters['button-1.rate'](1);
    window.controlSetters['button-1.depth'](.37);
    window.controlSetters['button-1'](1);
  });
  const stutter = page.locator('.button[data-name="button-1"]');
  await expect(stutter.locator('.stutter-rate-readout')).toHaveText('15.00 Hz');
  await expect(stutter.locator('.stutter-depth-readout, .stutter-static-label')).toHaveCount(0);
  await expect(page.locator('#btn-lfo-shape')).toHaveCount(0);
  await expect(stutter).toHaveText('S115.00 Hz');
  await expect(stutter).toHaveAttribute('data-pulse-view', 'pulse');
  const colors = await stutter.evaluate(el => new Promise(resolve => {
    const samples = new Set();
    const start = performance.now();
    function sample() {
      samples.add(getComputedStyle(el).backgroundColor);
      if (performance.now() - start >= 600) resolve([...samples]);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  expect(colors).toHaveLength(2);
  for (const selector of ['.stutter-rate-readout']) {
    const box = await stutter.locator(selector).evaluate(el => {
      const css = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, line: parseFloat(css.lineHeight),
        width: el.getBoundingClientRect().width, available: el.closest('.button').clientWidth };
    });
    expect(box.height, JSON.stringify(box)).toBeLessThanOrEqual(box.line + 1);
    expect(box.width, JSON.stringify(box)).toBeLessThanOrEqual(box.available);
  }
  await page.screenshot({ path: '.agent-context/runtime/r11-stutter-' + testInfo.project.name.replaceAll(' ', '-') + '.png' });
  await page.locator('#btn-perf-off').click();
  await expect(stutter).toHaveAttribute('data-pulse-view', 'off');
  await expect(stutter.locator('.stutter-static-label')).toBeHidden();
});

test('Stutter settings disclose the actual limit and horizontal drag unlocks a persisted 1/128', async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.goto('/?lang=en');
  await page.evaluate(() => {
    window.syncMode = 'sync'; window.currentBpm = 120;
    window.syncSettings.stutterSubdivisionPinned = true;
    window.syncSettings.stutterSubdivision = .03125;
    localStorage.setItem('ableton-rc:sync_settings', JSON.stringify(window.syncSettings));
  });
  await page.reload();
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#stutter-rate-grid [data-val="0.03125"]')).toBeDisabled();
  await expect(page.locator('#stutter-effective-rate')).toContainText('1/128 → 1/16');
  await page.locator('#btn-sync-settings-close').click();
  const stutter = page.locator('.button[data-name="button-1"]');
  await stutter.dispatchEvent('pointerdown', { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
  await stutter.dispatchEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 100 });
  await expect(stutter.locator('.stutter-rate-readout')).toHaveText('1/4');
  await stutter.dispatchEvent('pointerup', { pointerId: 1, clientX: 50, clientY: 100 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ableton-rc:sync_settings')));
  expect(saved.stutterSubdivisionPinned).toBe(false);
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#stutter-rate-grid [data-val="auto"]')).toHaveClass(/on/);
  await page.locator('#stutter-rate-grid [data-val="0.5"]').click();
  await expect(page.locator('#stutter-effective-rate')).toHaveText('1/8');
  await page.evaluate(() => { window.currentBpm = 15; });
  await expect(page.locator('#stutter-rate-grid [data-val="0.03125"]')).toBeEnabled();
  await page.locator('#stutter-rate-grid [data-val="0.03125"]').click();
  await expect(page.locator('#stutter-effective-rate')).toHaveText('1/128');
  await page.evaluate(() => { window.currentBpm = 120; window.syncSettings.stutterSwing = .66; });
  await expect(page.locator('#stutter-rate-grid [data-val="0.25"]')).toBeDisabled();
  await expect(page.locator('#stutter-effective-rate')).toHaveText('1/128 → 1/8');
});

test('LFO settings disclose effective bandwidth on desktop/mobile', async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.goto('/?lang=pt-BR');
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('[data-i18n="sync.lfoBandwidth"]')).toContainText('senoide 4 Hz');
  await expect(page.locator('#lfo-rate-grid [data-val="0.0625"]')).toBeDisabled();
  await page.evaluate(() => {
    window.syncSettings.lfoSubdivisionPinned = true;
    window.syncSettings.lfoSubdivision = 0.0625;
    window.renderLfoSettings && window.renderLfoSettings();
  });
  await expect(page.locator('#lfo-effective-rate')).toHaveText('1/64 → 1/8');
  await page.locator('#lfo-rate-grid [data-val="0.6666666666666666"]').click();
  await expect(page.locator('#lfo-effective-rate')).toHaveText('1/4 T');
  await expect(page.locator('#lfo-rate-grid .grid-btn')).toHaveCount(17);
  await page.screenshot({ path: `.agent-context/runtime/r11-lfo-bandwidth-${testInfo.project.name.replaceAll(' ', '-')}.png` });
});

test('r11 compact SYNC rates are musical notes, including caps, ratchet and triplets', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.evaluate(() => {
    window.syncMode = 'sync';
    window.currentBpm = 120;
    window.syncSettings.lfoSubdivisionPinned = true;
    window.syncSettings.lfoSubdivision = .75;
    window.syncSettings.stutterSubdivisionPinned = true;
    window.syncSettings.stutterSubdivision = 1;
    window.controlSetters['button-1.count'](.6);
    window.controlSetters['toggle-1'](1);
    window.controlSetters['button-1'](1);
  });
  const lfo = page.locator('.toggle[data-name="toggle-1"] .lfo-rate-readout');
  const stutter = page.locator('.button[data-name="button-1"] .stutter-rate-readout');
  await expect(lfo).toHaveText('1/8 D');
  await expect(stutter).toHaveText('1/8 T');
  await page.evaluate(() => { window.syncSettings.lfoSubdivision = .03125; });
  await expect(lfo).toHaveText('1/8');
  await page.evaluate(() => { window.syncSettings.lfoSubdivision = 1; window.currentBpm = 180; });
  await expect(lfo).toHaveText('1/4');
  await page.evaluate(() => { window.currentBpm = 120; });
  await expect(lfo).toHaveText('1/4');
  await page.evaluate(() => { window.syncMode = 'free'; });
  await expect(lfo).toContainText('Hz');
  await expect(stutter).toContainText('Hz');
});

test('LFO FREE fine drag exposes the resulting speed without modifier jumps', async ({ page }) => {
  await page.goto('/?lang=en');
  const lfo = page.locator('.toggle[data-name="toggle-1"]');
  await page.evaluate(() => { window.syncMode = 'free'; window.controlSetters['toggle-1.rate'](0.5); });
  await lfo.dispatchEvent('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  await lfo.dispatchEvent('pointermove', { pointerId: 1, clientX: 115, clientY: 100, shiftKey: true });
  await expect(lfo.locator('.lfo-rate-readout')).toHaveText('2.15 Hz');
  const rate = await page.evaluate(() => window.lfoStates.get('toggle-1').rate);
  expect(rate).toBeCloseTo(0.525, 10);
  await lfo.dispatchEvent('pointermove', { pointerId: 1, clientX: 115, clientY: 100, shiftKey: false });
  expect(await page.evaluate(() => window.lfoStates.get('toggle-1').rate)).toBeCloseTo(rate, 10);
  await lfo.dispatchEvent('pointerup', { pointerId: 1, clientX: 115, clientY: 100 });
});
