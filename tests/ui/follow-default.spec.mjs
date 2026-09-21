// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { test, expect } from '@playwright/test';

test('AUD exposes no active Follow UI or Follow scripts', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tab[data-page="audio"]').evaluate((element) => element.click());
  await expect(page.locator('#follow-note')).toHaveCount(0);
  await expect(page.locator('script[src="follow-note-graph.js"]')).toHaveCount(0);
  await expect(page.locator('script[src="modules/follow-note.js"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.RcSurfaceFollowNote)).toBeUndefined();
});
