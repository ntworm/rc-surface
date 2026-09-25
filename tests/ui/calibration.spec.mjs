import { test, expect } from '@playwright/test';

test('contextual calibration collects actual sensor events, cancels, and isolates page states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?lang=en');
  const button = page.locator('#btn-calibrate-sensors-header');
  await expect(button).toBeHidden();
  await page.locator('.tab[data-page="sensors"]').click();
  await expect(button).toHaveText('CALIBRATE');
  await page.clock.install();
  // Only runFor may move time: the sensor collector restarts its 1 s window when
  // two samples arrive more than 250 ms apart. With the clock running, a stall of
  // about 200 ms between loop steps on a slow runner opens that gap, the job never
  // finishes and the 1.2 s watchdog cancels it back to idle for lack of readings.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await button.click();
  await page.clock.runFor(1500);
  await expect(button).not.toHaveText('CALIBRATED');
  await expect(page.locator('#calibration-message')).toContainText('readings');
  const sample = () => page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
    { alpha: 100, beta: 20, gamma: -10 })));
  await sample();
  await button.click();
  for (let i = 0; i <= 22; i++) { await sample(); await page.clock.runFor(50); }
  await expect(button).toHaveText('CALIBRATED');
  expect(await page.evaluate(() => window.__abletonRc.state.calibration.offsets.beta)).toBe(20);
  await page.screenshot({ path: testInfo.outputPath('sns-calibrated.png') });
  await page.locator('.tab[data-page="audio"]').click();
  await expect(button).toHaveText('CALIBRATE');
  await button.click();
  await expect(page.locator('#calibration-message')).toContainText('Enable');
  await page.locator('.tab[data-page="sensors"]').click();
  await expect(button).toHaveText('CALIBRATED');
  await button.click();
  await page.locator('.tab[data-page="video"]').click();
  await page.clock.runFor(8000);
  await page.locator('.tab[data-page="sensors"]').click();
  await expect(button).toHaveText('CALIBRATE');
});

test('audio calibration uses live raw samples and resets on input stop without changing detector timing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.route('**/audio-processor.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.AudioProcessor = class {
      constructor() { window.testCapture = this; }
      setAnalysisSettings() {} setDescriptorSettings() {} resetDescriptors() {}
      async start() { return true; } stop() {}
    };` }));
  await page.goto('/?lang=pt-BR');
  await page.locator('.tab[data-page="audio"]').click();
  await page.locator('#chk-audio-enable').check({ force: true });
  await page.clock.install();
  // Only runFor may move time: the audio watchdog marks the envelope lost 180 ms
  // after the last frame, and the resize and screenshot steps below take longer
  // than that on a slow runner, which turned the final reading into a recovery.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const button = page.locator('#btn-calibrate-sensors-header');
  const detectors = await page.evaluate(() => localStorage.getItem('ableton-rc:audio_detectors'));
  await button.click();
  await expect(page.locator('#calibration-message')).toContainText('tocando');
  for (let i = 0; i <= 105; i++) {
    await page.evaluate(() => window.testCapture.onAnalysisUpdate({ rms: 0.15, envelope: 0.1, attack: 0.2, gate: 0 }));
    await page.clock.runFor(50);
  }
  await expect(button).toHaveText('CALIBRADO');
  for (const width of [851, 568]) {
    await page.setViewportSize({ width, height: 320 });
    const bounds = await button.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  }
  await expect(button).toHaveCSS('color', 'rgb(48, 209, 88)');
  await page.screenshot({ path: testInfo.outputPath('aud-calibrated-568.png') });
  await page.locator('#calibration-close').click();
  await expect(button).toHaveText('CALIBRADO');
  expect(await page.evaluate(() => localStorage.getItem('ableton-rc:audio_detectors'))).toBe(detectors);
  await page.evaluate(() => window.testCapture.onAnalysisUpdate({ rms: 0.15, envelope: 0.1, attack: 0.2, gate: 0 }));
  expect(await page.evaluate(() => window.__abletonRc.state.sensors.audio_reading.envelope)).toBeCloseTo(0.5);
  await page.locator('#chk-audio-enable').uncheck({ force: true });
  await expect(button).toHaveText('CALIBRAR');
});

test('camera calibration restores canceled adjustments, rejects missing hands and verifies unsupported cameras honestly', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="video"]').click();
  // Only the hardware adapter is replaced. Real page coordinator and collectors run.
  await page.evaluate(() => {
    window.cameraSettings = { exposureMode: 'manual' };
    window.testCamera = {
      readyState: 'live',
      getCapabilities: () => ({ exposureMode: ['manual', 'continuous'] }),
      getSettings: () => ({ ...window.cameraSettings }),
      applyConstraints: async ({ advanced: [patch] }) => { Object.assign(window.cameraSettings, patch); },
    };
    window.PageCalibration.register('video', {
      source: () => window.testCamera,
      apply() {}, reset() {},
    });
  });
  await page.clock.install();
  // Only runFor may move time: the camera collector restarts its 4 s window when
  // two samples arrive more than 500 ms apart. With the clock running, a stall of
  // about 400 ms between loop steps on a slow runner opens that gap, the job never
  // finishes and the 1.2 s watchdog cancels it back to idle for lack of readings.
  // A 1.2 s stall right after the first click would likewise let the watchdog
  // undo the camera change before the spec reads it.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const button = page.locator('#btn-calibrate-sensors-header');
  await button.click();
  await expect.poll(() => page.evaluate(() => window.cameraSettings.exposureMode)).toBe('continuous');
  await button.click();
  await expect.poll(() => page.evaluate(() => window.cameraSettings.exposureMode)).toBe('manual');
  await button.click();
  await page.evaluate(async () => { await Promise.resolve(); });
  for (let i = 0; i <= 42; i++) {
    await page.evaluate(() => window.PageCalibration.feed('video', { light: 0.5, clipped: 0, hand: false }));
    await page.clock.runFor(100);
  }
  await expect(button).toHaveText('CALIBRATE');
  await expect(page.locator('#calibration-message')).toContainText('Hand tracking');
  expect(await page.evaluate(() => window.cameraSettings.exposureMode)).toBe('manual');
  await page.evaluate(() => { delete window.testCamera.getCapabilities; });
  await button.click();
  await page.evaluate(async () => { await Promise.resolve(); });
  for (let i = 0; i <= 42; i++) {
    await page.evaluate(() => window.PageCalibration.feed('video', { light: 0.5, clipped: 0, hand: true }));
    await page.clock.runFor(100);
  }
  await expect(button).toHaveText('CALIBRATED');
  await expect(page.locator('#calibration-message')).toContainText('No camera settings changed');
  await page.screenshot({ path: testInfo.outputPath('vid-checked.png') });
  await page.locator('#calibration-reset').click();
  await expect(button).toHaveText('CALIBRATE');
});
