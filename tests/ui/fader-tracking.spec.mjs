// P03 (rc-surface-modulator-quality-2026-09-16): the MIX fader must track
// the user's finger 1:1 across the live .fader-track height. A drag from
// the centre of the thumb to the top of the track must clamp the value to
// 1 and place the thumb within 6 px of the pointer; a drag from the top
// to the middle of the track must land the value at ~0.5.
import { test, expect } from '@playwright/test';

async function dragFromThumbToY(page, faderName, targetClientY) {
  const trackBox = await page.locator(`.page-mixer [data-name="${faderName}"] .fader-track`).boundingBox();
  const thumbBox = await page.locator(`.page-mixer [data-name="${faderName}"] .fader-thumb`).boundingBox();
  expect(trackBox).not.toBeNull();
  expect(thumbBox).not.toBeNull();
  const startX = thumbBox.x + thumbBox.width / 2;
  const startY = thumbBox.y + thumbBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move in two steps so pointermove sees a real drag and the gesture
  // bookkeeping (active pointer, rangePx re-measure) runs at least once.
  await page.mouse.move(startX, (startY + targetClientY) / 2, { steps: 5 });
  await page.mouse.move(startX, targetClientY, { steps: 5 });
  await page.mouse.up();
}

test('MIX fader thumb tracks the pointer 1:1 across the live track height', async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  // The fader reads a second pointerdown within 300 ms as a double tap and
  // resets instead of dragging. The page clock lets the spec step past that
  // window whatever the runner's speed.
  await page.clock.install();
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="mixer"]').click();
  await expect(page.locator('.page-mixer .fader')).toHaveCount(8);

  // Drag from the centre of fader-1's thumb to the top of its track.
  const trackBox = await page.locator('.page-mixer [data-name="fader-1"] .fader-track').boundingBox();
  expect(trackBox.height).toBeGreaterThan(60);
  const topY = trackBox.y;

  await dragFromThumbToY(page, 'fader-1', topY + 4);

  const ariaTop = Number(await page.locator('.page-mixer [data-name="fader-1"]')
    .getAttribute('aria-valuenow'));
  expect(ariaTop).toBeCloseTo(1, 1);

  const thumbBoxAfter = await page.locator('.page-mixer [data-name="fader-1"] .fader-thumb').boundingBox();
  const thumbCenterY = thumbBoxAfter.y + thumbBoxAfter.height / 2;
  expect(Math.abs(thumbCenterY - (topY + 4))).toBeLessThanOrEqual(6);

  // Now drag from the top back down to the middle of the track: value ~ 0.5.
  // A second drag inside the double-tap window would reset the fader to its
  // 0.85 default instead, which is how an older `>= 0.7` bound passed on fast
  // runners and failed on the slow macOS one.
  await page.clock.runFor(350);
  const midY = trackBox.y + trackBox.height / 2;
  await dragFromThumbToY(page, 'fader-1', midY);

  const ariaMid = Number(await page.locator('.page-mixer [data-name="fader-1"]')
    .getAttribute('aria-valuenow'));
  // P03 relative drag: `value = clamp(startVal + (startY - clientY) / rangePx, 0, 1)` with
  // rangePx = the live track height, so the drag from the thumb at the top (value 1) down to
  // the middle of the track lands near 0.5 — well clear of the 0.85 a double-tap reset leaves.
  expect(ariaMid).toBeCloseTo(0.5, 1);
});

test('MIX fader rangePx tracks the live track height on mobile landscape', async ({ page }) => {
  // Phone UI v3 is landscape-only by design (static/phone-v3/style.css: LANDSCAPE-ONLY).
  // Portrait viewports trigger the orientation-warning overlay and skip the MIX page render.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="mixer"]').click({ force: true });
  await expect(page.locator('.page-mixer .fader')).toHaveCount(8);

  const trackBox = await page.locator('.page-mixer [data-name="fader-1"] .fader-track').boundingBox();
  expect(trackBox.height).toBeGreaterThan(60);
  const topY = trackBox.y;
  const midY = trackBox.y + trackBox.height / 2;

  await dragFromThumbToY(page, 'fader-1', topY + 4);
  const ariaTop = Number(await page.locator('.page-mixer [data-name="fader-1"]')
    .getAttribute('aria-valuenow'));
  expect(ariaTop).toBeCloseTo(1, 1);

  await dragFromThumbToY(page, 'fader-1', midY);
  const ariaMid = Number(await page.locator('.page-mixer [data-name="fader-1"]')
    .getAttribute('aria-valuenow'));
  // P03 preserved the relative drag formula (see the desktop test above for the rationale).
  expect(ariaMid).toBeGreaterThanOrEqual(0.7);
  expect(ariaMid).toBeLessThanOrEqual(1);
});
