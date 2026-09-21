import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  const root = path.resolve('docs');
  await page.route('**/landing/**', async (route) => {
    const filename = path.resolve(root, '.' + new URL(route.request().url()).pathname.replace('/landing', ''));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.abort();
    await route.fulfill({ body: fs.readFileSync(filename), contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html' });
  });
});

test('operator landing fits mobile widths in both languages with local scrollable diagrams', async ({ page }) => {
  for (const locale of ['en', 'pt-BR']) {
    await page.goto('/landing/index.html?lang=' + locale);
    // Text bindings use textContent: encoded entities must not become visible
    // "&amp;#183;" strings, and a colliding catalog key must not rename the target.
    expect.soft((await page.locator('[data-i18n]').allTextContents()).join('\n')).not.toMatch(/&#(?:\d+|x[\da-f]+);/i);
    await expect.soft(page.locator('[data-i18n="lp.fig.160"]')).toHaveText(
      locale === 'en' ? 'LIVE PARAMETER / MIDI' : 'PARÂMETRO DO LIVE / MIDI');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, viewport: innerWidth,
        candidates: [...document.querySelectorAll('body *')].filter((el) => {
          if (el.getBoundingClientRect().right <= innerWidth + 1) return false;
          for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (getComputedStyle(parent).overflowX !== 'visible') return false;
          }
          return true;
        }).slice(0, 12).map((el) => ({ tag: el.tagName, cls: el.className, text: el.textContent.slice(0, 25) })),
        overflowing: [...document.querySelectorAll('h1, h2, .sec > .c, .head, .duo')]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => ({ text: el.textContent.slice(0, 40), right: el.getBoundingClientRect().right })),
      }));
      expect(bounds, locale + ' ' + width + ' ' + JSON.stringify(bounds)).toMatchObject({ width, viewport: width, overflowing: [] });
    }
    await expect(page.locator('a[data-i18n-html="lp.surface.004"]')).toHaveText(locale === 'en' ? 'Published releases' : 'Versões publicadas');
    if (locale === 'pt-BR') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '.agent-context/runtime/release-landing-pt-390.png' });
    }
  }
});

test('all seven refreshed tab diagrams and six family cards remain reachable in EN/PT', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const locale of ['en', 'pt-BR']) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto('/landing/index.html?lang=' + locale);
      await page.evaluate(() => document.fonts.ready);
      for (const tab of ['perf', 'mix', 'snp', 'sns', 'aud', 'vid', 'map']) {
        await page.locator(`label[for="surface-select-${tab}"]`).click();
        const sheet = page.locator('#surface-map-' + tab);
        await expect(sheet).toBeVisible();
        await expect(page.locator('.surface-tab-input:checked')).toHaveValue(tab);
        await expect(sheet.locator('svg.surface-diagram').first()).toBeVisible();
        const drawingHeight = await sheet.locator('svg.surface-diagram').first().evaluate((svg) => svg.getBoundingClientRect().height);
        const frameHeight = await sheet.locator('.figwrap').evaluate((frame) => frame.getBoundingClientRect().height);
        expect(frameHeight - drawingHeight, 'inactive tabs must not stretch this card').toBeLessThan(40);
        if (tab === 'sns' || tab === 'vid') {
          const overflow = await sheet.locator('svg text[data-i18n]').evaluateAll((texts) => texts
            .filter((text) => text.getBBox().x + text.getBBox().width > 1080)
            .map((text) => text.textContent));
          expect(overflow, locale + ': diagram labels must fit the frame').toEqual([]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (width === 1440 && locale === 'pt-BR') {
          await sheet.locator('.figwrap').screenshot({ path: testInfo.outputPath('landing-' + tab + '.png') });
        }
      }
      for (const family of ['performance', 'continuous', 'snapshots', 'sensors', 'vision', 'mapping']) {
        await page.locator(`label[for="control-select-${family}"]`).click();
        await expect(page.locator('#control-family-' + family)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (family === 'sensors' && locale === 'pt-BR') {
          await page.locator('#control-family-sensors .feature-figure').screenshot({ path: testInfo.outputPath('landing-sensors-' + width + '.png') });
        }
      }
    }
  }
  expect(errors).toEqual([]);
});
