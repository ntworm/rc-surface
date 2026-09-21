import { test, expect } from '@playwright/test';

test('new MIX controls survive snapshot capture, reload and recall with localized slot feedback', async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=pt-BR');
  const values = { 'knob-7': 0.2, 'knob-8': 0.25, 'fader-7': 0.6, 'fader-8': 0.75 };
  await page.evaluate((values) => {
    for (const [name, value] of Object.entries(values)) window.controlSetters[name](value);
  }, values);
  await page.locator('.tab[data-page="snapshots"]').click();
  await page.locator('#btn-snapshot-capture').click();
  const slot = page.locator('.snapshot-slot[data-slot="1"]');
  await slot.click();
  await expect.soft(slot.locator('.status-indicator')).toHaveText('SALVO', { timeout: 500 });
  await page.reload();
  await page.locator('.tab[data-page="snapshots"]').click();
  await expect.soft(slot.locator('.status-indicator')).toHaveText('PRONTO', { timeout: 500 });
  await page.evaluate(() => {
    for (const name of ['knob-7', 'knob-8', 'fader-7', 'fader-8']) window.controlSetters[name](0);
  });
  await slot.click();
  for (const [name, value] of Object.entries(values)) {
    await expect(page.locator(`.page-mixer [data-name="${name}"]`)).toHaveAttribute('aria-valuenow', String(value));
  }
});

test('MIX 8+8 keeps pointer, keyboard, snapshot setter and reset behavior', async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="mixer"]').click();
  await expect(page.locator('.page-mixer .knob')).toHaveCount(8);
  await expect(page.locator('.page-mixer .fader')).toHaveCount(8);
  for (const kind of ['knob', 'fader']) {
    for (const i of [1, 6, 7, 8]) {
      const name = `${kind}-${i}`;
      const control = page.locator(`.page-mixer [data-name="${name}"]`);
      await page.evaluate((name) => window.controlSetters[name](0.3), name);
      await expect(control).toHaveAttribute('aria-valuenow', '0.3');
      await control.focus();
      await control.press('End');
      await expect(control).toHaveAttribute('aria-valuenow', '1');
      await control.press('ArrowDown');
      await expect(control).toHaveAttribute('aria-valuenow', '0.99');
      await control.dblclick();
      await expect(control).toHaveAttribute('aria-valuenow', kind === 'knob' ? '0.5' : '0.85');
    }
  }
  for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 393 },
    { width: 1280, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.page-mixer').evaluate((root) => {
      const outer = root.getBoundingClientRect();
      return [...root.querySelectorAll('.knob, .knob-face, .fader-thumb')].map((el) => {
        const b = el.getBoundingClientRect();
        return { name: el.dataset.name || el.className, inside: b.left >= outer.left && b.right <= outer.right + 1 && b.top >= outer.top && b.bottom <= outer.bottom + 1 };
      });
    });
    expect(geometry.filter((b) => !b.inside)).toEqual([]);
    await page.screenshot({ path: `.agent-context/runtime/final-review-mix-${viewport.width}.png` });
  }
});
