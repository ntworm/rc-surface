// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Capability-tracked sensor integration on the real page. Desktop Chromium
// exposes the orientation/motion APIs but delivers no events without
// hardware; the spec drives readings through the same dispatchEvent path
// calibration.spec.mjs uses. The fake clock is installed BEFORE navigation so
// the trackers capture a mocked monotonic clock from the first instruction.
import { test, expect } from '@playwright/test';

const gotoWithClock = async (page, url) => {
  await page.clock.install();
  await page.goto(url);
};

const sensorTab = async (page) => page.locator('.tab[data-page="sensors"]').click();

const orientEvent = (page, { alpha, beta, gamma }) => page.evaluate(([a, b, g]) => {
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: a, beta: b, gamma: g }));
}, [alpha, beta, gamma]);

const motionEvent = (page, ax, ay, az) => page.evaluate(([x, y, z]) => {
  const e = new Event('devicemotion');
  Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x, y, z } });
  Object.defineProperty(e, 'acceleration', { value: { x: 0, y: 0, z: 0 } });
  Object.defineProperty(e, 'rotationRate', { value: { alpha: 0, beta: 0, gamma: 0 } });
  window.dispatchEvent(e);
}, [ax, ay, az]);

const installWireCapture = (page) => page.evaluate(() => {
  window.__sensorWire = [];
  const original = window.onControl;
  window.onControl = (ctrl) => {
    window.__sensorWire.push(ctrl);
    if (original) original(ctrl);
  };
});

test('desktop with API but no hardware shows no-readings and never a false permission denial', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await gotoWithClock(page, '/?lang=en');
  await sensorTab(page);
  const motionPill = page.locator('[data-sensor-status="motion"]');
  const orientPill = page.locator('[data-sensor-status="orientation"]');
  await page.clock.runFor(2100);
  // Desktop exposes the API but no sensor fires; this is silence, not refusal.
  await expect(motionPill).toHaveText('no-readings');
  await expect(orientPill).toHaveText('no-readings');
  await expect(page.locator('#permission-banner')).toBeHidden();

  // A late real event flips no-readings back to ready (reversible).
  await orientEvent(page, { alpha: 0, beta: 0, gamma: 0 });
  await expect(orientPill).toHaveText('ready');

  // Zero is a valid reading: state carries real zero values, not nulls.
  const st = await page.evaluate(() => window.__abletonRc.state);
  expect(st.orient).toBeTruthy();
  expect(typeof st.orient.alpha).toBe('number');
});

test('mobile-style valid zero readings reach the wire and loss emits one lost frame per axis, no stale replay', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await gotoWithClock(page, '/?lang=en');
  await sensorTab(page);
  await installWireCapture(page);

  await motionEvent(page, 0, 0, 9.8);
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('ready');

  // 2s without any new reading turns ready into lost.
  await page.clock.runFor(2100);
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('lost');

  const wire = await page.evaluate(() => window.__sensorWire);
  const lostFrames = wire.filter((c) => c.lost === true);
  expect(lostFrames.length).toBeGreaterThan(0);
  for (const frame of lostFrames) {
    expect(frame.name).toMatch(/^sensor\.motion\./);
    expect(frame.value).toBe(0);
  }

  // Stale replay must stop: while lost, no further real-value motion frames.
  const realMotionCount = wire.filter((c) => c.lost !== true && /^sensor\.motion\./.test(c.name)).length;
  await page.clock.runFor(500);
  const wireAfter = await page.evaluate(() => window.__sensorWire);
  const realMotionAfter = wireAfter.filter((c) => c.lost !== true && /^sensor\.motion\./.test(c.name)).length;
  expect(realMotionAfter).toBe(realMotionCount);

  // Recovery: a new real event makes it ready again.
  await motionEvent(page, 1, 0, 9);
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('ready');
});

test('permission denied on one API stays independent of the other', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.addInitScript(() => {
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('denied'),
    });
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('granted'),
    });
  });
  await page.goto('/?lang=en');
  await sensorTab(page);

  const banner = page.locator('#permission-banner');
  await expect(banner).toBeVisible();
  await page.locator('#permission-activate').click();

  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('denied');
  // Orientation's grant proceeds independently; motion stays denied.
  await orientEvent(page, { alpha: 0, beta: 0, gamma: 0 });
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText('ready');
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('denied');
});

test('CALIBRATE without readings shows a neutral reason and audio/camera stay actionable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await gotoWithClock(page, '/?lang=en');
  await sensorTab(page);
  await page.clock.runFor(2100);

  const button = page.locator('#btn-calibrate-sensors-header');
  await expect(button).toHaveText('CALIBRATE');
  await button.click();
  await expect(page.locator('#calibration-message')).toContainText('No motion readings on this device');

  // Audio and camera inputs keep working while sensors have no readings.
  await page.locator('.tab[data-page="audio"]').click();
  const audioChk = page.locator('#chk-audio-enable');
  await expect(audioChk).toBeVisible();
  await audioChk.check({ force: true });
  await expect(audioChk).toBeChecked();
  await audioChk.uncheck({ force: true });

  await page.locator('.tab[data-page="video"]').click();
  await expect(page.locator('#chk-vision-enable')).toBeVisible();
});

test('pt-BR shows the neutral calibration message and no permission banner', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await gotoWithClock(page, '/?lang=pt-BR');
  await sensorTab(page);
  await expect(page.locator('#permission-banner')).toBeHidden();
  await page.clock.runFor(2100);
  await page.locator('#btn-calibrate-sensors-header').click();
  await expect(page.locator('#calibration-message')).toContainText('Sem leituras de movimento neste dispositivo');
});
