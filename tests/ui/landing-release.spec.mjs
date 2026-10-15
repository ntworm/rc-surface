import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  const root = path.resolve('docs');
  await page.route('**/landing/**', async (route) => {
    const filename = path.resolve(root, '.' + new URL(route.request().url()).pathname.replace('/landing', ''));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.abort();
    let body = fs.readFileSync(filename);
    // Negative proofs change only the response, never a product file on disk.
    const mutation = process.env.RC_LANDING_MUTATION ? JSON.parse(process.env.RC_LANDING_MUTATION) : null;
    if (mutation && path.basename(filename) === mutation.file) {
      const source = body.toString('utf8');
      if (!source.includes(mutation.from)) throw new Error('Missing landing mutation target: ' + mutation.from);
      body = Buffer.from(source.replace(mutation.from, mutation.to));
    }
    await route.fulfill({ body, contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html' });
  });
});

test('REC plan keeps its active REC and SYNC labels readable in EN/PT', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const locale of ['en', 'pt-BR']) {
    await page.goto('/landing/index.html?lang=' + locale);
    await page.locator('label[for="surface-select-rec"]').click();
    const header = page.locator('#surface-map-rec [data-plan-header="seven-pages"]');
    for (const [label, fill] of [['REC', 'rgb(255, 161, 51)'], ['SYNC', 'rgb(200, 190, 80)']]) {
      const text = header.locator('text').filter({ hasText: new RegExp('^' + label + '$') });
      await expect(text).toBeVisible();
      const colors = await text.evaluate(el => {
        const ink = getComputedStyle(el).fill;
        const paper = getComputedStyle(el.previousElementSibling).fill;
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3)
          .map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
          .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const [dark, light] = [luminance(ink), luminance(paper)].sort((a, b) => a - b);
        return { ink, paper, contrast: (light + .05) / (dark + .05) };
      });
      expect(colors.paper, locale + ' ' + label + ' active state color').toBe(fill);
      expect(colors.contrast, locale + ' ' + label + ' readable header contrast').toBeGreaterThanOrEqual(4.5);
    }
  }
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

test('the Portuguese landing URL opens in Portuguese for a browser that last chose English', async ({ page }) => {
  // pt-br.html is what a Portuguese search result links to; storage from an
  // earlier English visit must not turn it back into the English page.
  await page.addInitScript(() => localStorage.setItem('ableton-rc:locale', 'en'));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/landing/pt-br.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('a[data-i18n-html="lp.surface.004"]')).toHaveText('Versões publicadas');
  await expect(page.locator('[data-i18n-html="lp.map.018"] code').nth(1)).toHaveText('XY 2');
  await page.locator('[data-set-locale="en"]').click();
  await expect(page.locator('a[data-i18n-html="lp.surface.004"]')).toHaveText('Published releases');
  expect(errors).toEqual([]);
});

test('eight plans including REC and PERF AUT plus six control families remain reachable in EN/PT', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const locale of ['en', 'pt-BR']) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto('/landing/index.html?lang=' + locale);
      await page.evaluate(() => document.fonts.ready);
      for (const tab of ['perf', 'mix', 'snp', 'sns', 'aud', 'vid', 'rec', 'map']) {
        await page.locator(`label[for="surface-select-${tab}"]`).click();
        const sheet = page.locator('#surface-map-' + tab);
        await expect(sheet).toBeVisible();
        await expect(page.locator('.surface-tab-input:checked')).toHaveValue(tab);
        await expect(sheet.locator('svg.surface-diagram').first()).toBeVisible();
        await expect(sheet.locator('[data-plan-header="seven-pages"] [data-page-tab]')).toHaveCount(7);
        await expect(sheet.locator('[data-header-mode="aut"]')).toHaveText('AUT');
        if (tab === 'rec') {
          await expect(sheet.locator('[data-rec-timeline="musical-scale"]')).toBeVisible();
          await expect(sheet.locator('[data-rec-track-action="arm"]')).toHaveCount(4);
          await expect(sheet.locator('td[data-i18n="lp.rec.preRollFlow"]')).toContainText(locale === 'en' ? 'read-only' : 'somente leitura');
        }
        const drawingHeight = await sheet.locator('svg.surface-diagram').first().evaluate((svg) => svg.getBoundingClientRect().height);
        const frameHeight = await sheet.locator('.figwrap').evaluate((frame) => frame.getBoundingClientRect().height);
        expect(frameHeight - drawingHeight, 'inactive tabs must not stretch this card').toBeLessThan(40);
        if (['sns', 'vid', 'rec'].includes(tab)) {
          const overflow = await sheet.locator('svg text[data-i18n]').evaluateAll((texts) => texts
            .filter((text) => text.getBBox().x + text.getBBox().width > 1080)
            .map((text) => text.textContent));
          expect(overflow, locale + ': diagram labels must fit the frame').toEqual([]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (width === 1440) {
          await sheet.locator('.figwrap').screenshot({ path: testInfo.outputPath('landing-' + locale + '-' + tab + '.png') });
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
