import { test, expect } from '@playwright/test';

test('AUD source selection restarts only enabled capture and reports removal/failure', async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: async () => [
      { kind: 'audioinput', deviceId: 'loop', label: 'Loopback' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
    ] });
    window.inputStarts = [];
    window.inputStops = 0;
  });
  // Hardware boundary only; exercise real app/selector lifecycle and DOM.
  await page.route('**/audio-processor.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    window.AudioProcessor = class {
      constructor() { window.testCapture = this; }
      setAnalysisSettings() {} setDescriptorSettings() {} resetDescriptors() {}
      async start(id) {
        window.inputStarts.push(id);
        if (window.inputFailure) throw Error('gone');
        this.onDescriptorModeChange('worklet');
        return true;
      }
      stop() { window.inputStops++; this.onDescriptorModeChange('off'); }
    };` }));
  await page.goto('/?lang=pt-BR');
  await page.locator('.tab[data-page="audio"]').click();
  const select = page.locator('#audio-input-device');
  const toggle = page.locator('#chk-audio-enable');
  await expect(select).toHaveValue('');
  await expect(select.locator('option')).toHaveCount(3);
  await select.selectOption('loop');
  expect(await page.evaluate(() => window.inputStarts)).toEqual([]);
  await toggle.check({ force: true });
  await expect.poll(() => page.evaluate(() => window.inputStarts)).toEqual(['loop']);
  await select.selectOption('mic');
  await expect.poll(() => page.evaluate(() => window.inputStarts)).toEqual(['loop', 'mic']);
  expect(await page.evaluate(() => window.inputStops)).toBeGreaterThan(0);
  await page.evaluate(() => window.testCapture.onCaptureEnded());
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#lbl-audio-path')).toContainText('Entrada desconectada');
  await page.evaluate(() => { window.inputFailure = true; });
  await toggle.click({ force: true });
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#lbl-audio-path')).toContainText('Não foi possível');
  await page.reload();
  await expect(select).toHaveValue('mic');
  expect(await page.evaluate(() => window.inputStarts)).toEqual([], 'reload must not request capture');
});
