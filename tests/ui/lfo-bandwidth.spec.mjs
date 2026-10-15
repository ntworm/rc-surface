import { test, expect } from '@playwright/test';

const slot = '.toggle[data-name="toggle-1"]';
const readout = slot + ' .modulator-rate-readout';
const menu = '#control-config-menu';
const choice = (label, value) => `${menu} [data-cfg-choice="${label}"] [data-value="${value}"]`;

test.beforeEach(async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
});

async function openConfig(page) {
  await page.locator('#btn-cfg-mode').click();
  await page.locator(slot).click();
  await expect(page.locator(menu)).toHaveAttribute('data-cfg-open-for', 'toggle-1');
}

async function closeConfig(page) {
  await page.locator(`${menu} .cfg-menu-close`).click();
  // Closing a toggle-opened popover leaves CFG on; leave it explicitly before
  // exercising a performance drag. The expanded menu may cover the header.
  await page.locator('#btn-cfg-mode').click();
}

async function expand(page, title) {
  await page.locator(`${menu} summary`).filter({ hasText: title }).click();
}

async function configureSquare(page) {
  await openConfig(page);
  await page.locator(choice('Waveform', 'square')).click();
  await page.locator(choice('Mode', 'C')).click();
}

test('2.0 shape settings select all ceilings, preserve LFO phase and persist', async ({ page }) => {
  await page.goto('/?lang=en');
  await expect(page.locator('.toggle')).toHaveCount(8);
  expect(await page.locator('.toggle').evaluateAll(nodes => nodes.map(el => el.dataset.name)))
    .toEqual(Array.from({ length: 8 }, (_, index) => 'toggle-' + (index + 1)));
  await page.evaluate(() => {
    window.syncMode = 'free';
    window.controlSetters['toggle-1.rate'](1);
    window.controlSetters['toggle-1'](1);
  });
  await page.locator('#btn-sync-settings').click();
  for (const [shape, max] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 15 })) {
    const result = await page.evaluate(shape => {
      const state = window.modulatorStates.get('toggle-1');
      const before = { phase: state.phase, time: state.phaseTime, frequency: state.phaseFrequency };
      // Several synchronous subscribers settle the phase during one click.
      // Freeze that transaction's clock so sub-millisecond handler time cannot
      // be mistaken for a phase reset when the new frequency takes effect.
      const now = performance.now();
      const clock = performance.now;
      performance.now = () => now;
      try { document.querySelector('#lfo-shape-grid [data-val="' + shape + '"]').click(); }
      finally { performance.now = clock; }
      const expected = (before.phase + (state.phaseTime - before.time) / 1000 * before.frequency * 2 * Math.PI) % (2 * Math.PI);
      return { error: Math.abs(Math.atan2(Math.sin(state.phase - expected), Math.cos(state.phase - expected))),
        active: state.active, kind: state.kind };
    }, shape);
    // Square replaces the LFO motor with a pulse motor; it preserves the gate.
    if (shape !== 'square') expect(result.error).toBeLessThan(1e-7);
    expect(result.active).toBe(true);
    expect(result.kind).toBe(shape === 'square' ? 'pulse' : 'lfo');
    await expect(page.locator('#lfo-shape-limit')).toHaveText(shape + ' · MAX ' + max + ' Hz');
    await expect(page.locator(readout)).toHaveText(max.toFixed(2) + ' Hz');
  }
  await page.reload();
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#lfo-shape-limit')).toHaveText('square · MAX 15 Hz');
});

test('2.0 Square CFG retains high-rate fill feedback and a compact rate readout', async ({ page }, testInfo) => {
  await page.goto('/?lang=en');
  await configureSquare(page);
  await page.locator(choice('Timing', 'free')).click();
  await closeConfig(page);
  await page.evaluate(() => {
    window.controlSetters['toggle-1.rate'](1);
    window.controlSetters['toggle-1.depth'](.37);
    window.controlSetters['toggle-1'](1);
  });
  const square = page.locator(slot);
  await expect(square).toHaveAttribute('data-waveform', 'square');
  await expect(square.locator('.modulator-wave-label')).toHaveText('SQR');
  await expect(square.locator('.modulator-mode-label')).toHaveText('C');
  await expect(page.locator(readout)).toHaveText('15.00 Hz');
  await expect(square.locator('.stutter-depth-readout, .stutter-static-label')).toHaveCount(0);
  const fills = await square.locator('.mod-val-bar').evaluate(el => new Promise(resolve => {
    const samples = new Set();
    const start = performance.now();
    function sample() {
      samples.add(new DOMMatrix(getComputedStyle(el).transform).m22);
      if (performance.now() - start >= 600) resolve([...samples]);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  expect(fills).toContain(0);
  expect(fills.some(value => Math.abs(value - .37) < 1e-6)).toBe(true);
  expect(fills).toHaveLength(2);
  const box = await page.locator(readout).evaluate(el => {
    const css = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, line: parseFloat(css.lineHeight),
      width: el.getBoundingClientRect().width, available: el.closest('.toggle').clientWidth };
  });
  expect(box.height, JSON.stringify(box)).toBeLessThanOrEqual(box.line + 1);
  expect(box.width, JSON.stringify(box)).toBeLessThanOrEqual(box.available);
  await square.screenshot({ path: testInfo.outputPath('square-high-rate.png') });
  await page.locator('#btn-perf-off').click();
  await expect(square).not.toHaveClass(/\bon\b/);
  await expect(square.locator('.mod-val-bar')).toHaveCSS('transform', 'matrix(1, 0, 0, 0, 0, 0)');
});

test('Square CFG exposes safe rhythms and drag releases a persisted 1/128 pin', async ({ page }) => {
  await page.goto('/?lang=en');
  await configureSquare(page);
  await page.locator(choice('Timing', 'sync')).click();
  await closeConfig(page);
  // A saved pin can exceed today's tempo limit; opening CFG must not rewrite it.
  await page.evaluate(() => {
    window.currentBpm = 120;
    window.RcControlConfig.set('toggle-1', { subdivision: .03125 });
  });
  await page.reload();
  await openConfig(page);
  await expand(page, 'Subdivision');
  await expect(page.locator(`${menu} summary`).filter({ hasText: 'Subdivision' })).toHaveText('Subdivision · 1/16');
  await expect(page.locator(choice('Note value', '1/128'))).toHaveCount(0);
  expect(await page.evaluate(() => window.RcControlConfig.get('toggle-1', 'subdivision'))).toBe(.03125);
  await closeConfig(page);
  const square = page.locator(slot);
  await square.dispatchEvent('pointerdown', { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
  await square.dispatchEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 100 });
  await expect(page.locator(readout)).toHaveText('1/4');
  await square.dispatchEvent('pointerup', { pointerId: 1, clientX: 50, clientY: 100 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ableton-rc:v3:control_config')));
  expect(saved['toggle-1'].subdivision).toBe(0);
  await openConfig(page);
  await expand(page, 'Subdivision');
  await expect(page.locator(choice('', '0'))).toHaveAttribute('aria-pressed', 'true');
  await page.locator(choice('Note value', '1/8')).click();
  await expect(page.locator(readout)).toHaveText('1/8');
  await closeConfig(page);
  await page.evaluate(() => { window.currentBpm = 15; });
  await openConfig(page);
  await expand(page, 'Subdivision');
  await page.locator(choice('Note value', '1/128')).click();
  await expect(page.locator(readout)).toHaveText('1/128');
  await closeConfig(page);
  await page.evaluate(() => {
    window.currentBpm = 120;
    window.RcControlConfig.set('toggle-1', { swing: .66 });
  });
  await openConfig(page);
  await expand(page, 'Subdivision');
  await expect(page.locator(choice('Note value', '1/16'))).toHaveCount(0);
  await expect(page.locator(`${menu} summary`).filter({ hasText: 'Subdivision' })).toHaveText('Subdivision · 1/8');
  expect(await page.evaluate(() => window.RcControlConfig.get('toggle-1', 'subdivision'))).toBe(.03125);
  await expect(page.locator(readout)).toHaveText('1/8');
});

test('LFO settings disclose effective bandwidth on desktop/mobile', async ({ page }, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('lfo-bandwidth.png') });
});

test('2.0 compact SYNC rates include capped notes, Square ratchet and triplets', async ({ page }) => {
  await page.goto('/?lang=en');
  await configureSquare(page);
  await page.locator(choice('Timing', 'sync')).click();
  await expand(page, 'Advanced');
  await page.locator(choice('Ratchet', 2 / 3)).click();
  await expand(page, 'Subdivision');
  await page.locator(choice('Note value', '1/4')).click();
  await closeConfig(page);
  await page.evaluate(() => {
    window.syncMode = 'sync'; window.currentBpm = 120;
    window.RcControlConfig.set('toggle-2', { shape: 'sine', subdivision: .75, mode: 'C' });
    window.controlSetters['toggle-1'](1);
    window.controlSetters['toggle-2'](1);
  });
  const lfo = page.locator('.toggle[data-name="toggle-2"] .modulator-rate-readout');
  await expect(lfo).toHaveText('1/8 D');
  await expect(page.locator(readout)).toHaveText('1/8 T');
  await openConfig(page);
  await expand(page, 'Subdivision');
  // At ratchet 3 and 120 BPM, a 1/16 triplet would exceed 15 Hz.
  await expect(page.locator(choice('Note value', '1/16'))).toHaveCount(0);
  await page.locator(choice('Note value', '1/8')).click();
  await expect(page.locator(choice('Rhythm', 'triplet'))).toBeDisabled();
  await closeConfig(page);
  await page.evaluate(() => { window.RcControlConfig.set('toggle-2', { subdivision: .03125 }); });
  await expect(lfo).toHaveText('1/8');
  await page.evaluate(() => { window.RcControlConfig.set('toggle-2', { subdivision: 1 }); window.currentBpm = 180; });
  await expect(lfo).toHaveText('1/4');
  await page.evaluate(() => { window.currentBpm = 120; });
  await expect(lfo).toHaveText('1/4');
  await openConfig(page);
  await page.locator(choice('Timing', 'free')).click();
  await closeConfig(page);
  await page.evaluate(() => { window.syncMode = 'free'; });
  await expect(lfo).toContainText('Hz');
  await expect(page.locator(readout)).toContainText('Hz');
});

test('LFO FREE fine drag exposes the resulting speed without modifier jumps', async ({ page }) => {
  await page.goto('/?lang=en');
  const lfo = page.locator(slot);
  await page.evaluate(() => { window.syncMode = 'free'; window.controlSetters['toggle-1.rate'](0.5); });
  await lfo.dispatchEvent('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  await lfo.dispatchEvent('pointermove', { pointerId: 1, clientX: 115, clientY: 100, shiftKey: true });
  await expect(page.locator(readout)).toHaveText('2.15 Hz');
  const rate = await page.evaluate(() => window.modulatorStates.get('toggle-1').rate);
  expect(rate).toBeCloseTo(0.525, 10);
  await lfo.dispatchEvent('pointermove', { pointerId: 1, clientX: 115, clientY: 100, shiftKey: false });
  expect(await page.evaluate(() => window.modulatorStates.get('toggle-1').rate)).toBeCloseTo(rate, 10);
  await lfo.dispatchEvent('pointerup', { pointerId: 1, clientX: 115, clientY: 100 });
});
