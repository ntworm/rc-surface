import { test, expect } from '@playwright/test';

async function setup(page) {
  const viewport = page.viewportSize();
  if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.goto('/?lang=en');
  await page.waitForFunction(() => window.openMobileMappingMode && window.phoneWs?.readyState === 1);
  await page.evaluate(() => {
    const target = { type: 'device_param', trackKind: 'main', trackIndex: 0, deviceIndex: 0, paramIndex: 1, label: 'Ceiling' };
    window.sendPhoneCommand = (cmd, args, cb) => {
      cb?.(cmd === 'getTargets' ? { ok: true, result: { targets: [
        { name: 'Main', trackKind: 'main', trackIndex: 0, mixer: [{ type: 'mixer_pan', trackKind: 'main', trackIndex: 0, label: 'Pan' }], devices: [{ name: 'Limiter', params: [target] }] },
        { name: '15 CLARINET', trackKind: 'track', trackIndex: 14, mixer: [{ type: 'mixer_pan', trackKind: 'track', trackIndex: 14, label: 'Pan' }], devices: [{ name: 'Compressor', params: [{ ...target, trackKind: 'track', trackIndex: 14, label: 'Threshold' }] }] },
      ] } } : { ok: true, result: { mappings: {}, clients: [], presets: [] } });
      return true;
    };
  });
  await page.locator('#btn-map-mode').click();
  await page.locator('.xy-pad[data-name="xy-1"]').click();
}

test('Main picker has the same collapsed hierarchy as tracks on desktop/mobile', async ({ page }, testInfo) => {
  await setup(page);
  await page.locator('#map-mobile-detail').getByRole('button', { name: 'Bind', exact: true }).click();
  const tree = page.locator('.map-picker-tree');
  await expect(tree.getByRole('button', { name: 'Tempo', exact: true })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Ceiling', exact: true })).toBeHidden();
  await tree.locator('.map-picker-track-header').filter({ hasText: 'Main' }).click();
  await expect(tree.getByRole('button', { name: 'Ceiling', exact: true })).toBeHidden();
  await tree.locator('.map-picker-device-header').filter({ hasText: 'Limiter' }).click();
  await expect(tree.getByRole('button', { name: 'Ceiling', exact: true })).toBeVisible();
  await page.screenshot({ path: `.agent-context/runtime/main-picker-${testInfo.project.name.replaceAll(' ', '-')}.png` });
  await page.locator('.map-picker-search').fill('Main > Limiter');
  await expect(tree.getByRole('button', { name: 'Ceiling', exact: true })).toBeVisible();
  await expect(tree.locator('.map-picker-track-header')).toHaveCount(1);
});

test('real XY pointer moves stream while MAP is open, before release, with final position delivered', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.__frames = [];
    window.phoneWs = { readyState: 1, controlStreamVersion: 1, bufferedAmount: 0,
      send: raw => window.__frames.push({ ...JSON.parse(raw), at: performance.now() }) };
    window.getPhoneClientId = () => 'ui-control-test';
  });
  const box = await page.locator('.xy-pad[data-name="xy-1"]').boundingBox();
  const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 20 });
  const during = await page.evaluate(() => window.__frames.filter(m => m.type === 'control_frame' && m.controls.some(c => c.name === 'xy-1')));
  expect(during.length).toBeGreaterThan(3);
  expect(new Set(during.flatMap(m => m.controls.filter(c => c.name === 'xy-1').map(c => c.x))).size).toBeGreaterThan(3);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const frames = window.__frames.filter(m => m.type === 'control_frame');
    const xy = frames.flatMap(m => m.controls).filter(c => c.name === 'xy-1').at(-1);
    return xy && Math.abs(xy.x - window.currentControlStates['xy-1.x']) < 0.001;
  })).toBe(true);
  expect(await page.evaluate(() => window.RCSurface.getMappingModeActive())).toBe(true);
});
