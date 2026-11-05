// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Sensor permission startup on the real page.
//
// The phone must never open a permission prompt by itself: the boot attaches
// the APIs that need no gesture and waits for the rest. The Settings sensor
// action asks for the missing permissions inside the user's gesture.
//
// The banner is NOT hidden by this suite: the page has to keep it hidden on
// its own, so every assertion below reads the real DOM state.

import { test, expect } from '@playwright/test';

const sensorTab = async (page) => page.locator('.tab[data-page="sensors"]').click();

const orientEvent = (page, { alpha, beta, gamma }) => page.evaluate(([a, b, g]) => {
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: a, beta: b, gamma: g }));
}, [alpha, beta, gamma]);

// The browser facts the page must react to, installed before any page
// script runs: two APIs that ask for a permission, a permission lookup that
// confirms nothing, a listener counter and a media counter.
const installPermissionRequests = (page, plan) => page.addInitScript((modes) => {
  window.__permissionLog = [];
  window.__permissionArgs = [];
  window.__permissionPending = [];
  window.__permissionSettle = (result) => {
    const pending = window.__permissionPending.splice(0);
    pending.forEach((resolve) => resolve(result));
  };
  window.__sensorListeners = { devicemotion: 0, deviceorientation: 0 };
  window.__mediaCalls = 0;

  const define = (Ctor, name, mode) => {
    if (!Ctor) return;
    Object.defineProperty(Ctor, 'requestPermission', {
      configurable: true,
      value: (...args) => {
        const active = navigator.userActivation?.isActive === true;
        window.__permissionLog.push('call:' + name + ':' + active);
        // The arguments are recorded as they arrive: the orientation call
        // has to use the boolean form of the IDL signature.
        window.__permissionArgs.push({ name, args });
        if (mode === 'grant') return Promise.resolve('granted');
        if (mode === 'deny') return Promise.resolve('denied');
        if (mode === 'reject') return Promise.reject(new Error('the test refused'));
        return new Promise((resolve) => { window.__permissionPending.push(resolve); });
      },
    });
  };
  define(window.DeviceMotionEvent, 'motion', modes.motion);
  define(window.DeviceOrientationEvent, 'orientation', modes.orientation);

  const originalAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type in window.__sensorListeners) window.__sensorListeners[type] += 1;
    return originalAddEventListener(type, listener, options);
  };

  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => {
      window.__mediaCalls += 1;
      return Promise.reject(new Error('no input in the test'));
    };
  }
}, plan);

// The browser confirms no prior grant for the sensor permissions: the page
// may only start a listener when the grant is actually confirmed. The
// Permissions API knows the sensor hardware, not the event names: the
// invented names are rejected and the real ones answer with the states the
// test controls.
const installPermissionQueries = (page, plan) => page.addInitScript((modes) => {
  const queryMode = modes.query || 'prompt';
  const sensorNames = ['accelerometer', 'gyroscope', 'devicemotion', 'deviceorientation'];
  window.__permissionQueries = [];
  const sensorState = (name) => {
    if (queryMode === 'unsupported') return Promise.reject(new TypeError('unsupported'));
    if (queryMode === 'grant') return Promise.resolve({ state: 'granted' });
    const state = queryMode === 'mixed' && name === 'accelerometer' ? 'granted' : 'prompt';
    return Promise.resolve({ state });
  };
  const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: (descriptor) => {
        const name = descriptor?.name;
        if (sensorNames.includes(name)) window.__permissionQueries.push(name);
        if (name === 'devicemotion' || name === 'deviceorientation') {
          return Promise.reject(new TypeError('unsupported permission name'));
        }
        if (name === 'accelerometer' || name === 'gyroscope') return sensorState(name);
        return originalQuery ? originalQuery(descriptor) : Promise.reject(new TypeError('unsupported'));
      },
    },
  });
}, plan);

const installBrowserFacts = (page, plan = { motion: 'grant', orientation: 'grant' }) => {
  installPermissionRequests(page, plan);
  installPermissionQueries(page, plan);
};

const openSensorSettings = async (page) => {
  await sensorTab(page);
  await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#settings-enable-sensors')).toBeVisible();
};

test('boot asks for no permission and keeps the global OK banner hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page);
  await page.goto('/?lang=en');
  await sensorTab(page);

  // The page opens no prompt of its own: the banner stays hidden.
  await expect(page.locator('#permission-banner')).toBeHidden();
  expect(await page.evaluate(() => window.__permissionLog)).toEqual([]);
  // The trackers wait for a gesture instead of asking for one.
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('permission-required');
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText('permission-required');
  // No sensor listener is installed before a permission is granted.
  const listeners = await page.evaluate(() => window.__sensorListeners);
  expect(listeners.devicemotion).toBe(0);
  expect(listeners.deviceorientation).toBe(0);
  // The camera and the microphone stay closed at boot.
  expect(await page.evaluate(() => window.__mediaCalls)).toBe(0);
  const inputs = await page.evaluate(() => ({
    camera: document.getElementById('chk-vision-enable')?.checked,
    audio: document.getElementById('chk-audio-enable')?.checked,
  }));
  expect(inputs.camera).toBe(false);
  expect(inputs.audio).toBe(false);
});

test('the boot asks for the sensor hardware and needs the whole bundle granted', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'grant', orientation: 'grant', query: 'grant' });
  await page.goto('/?lang=en');
  await sensorTab(page);

  // The Permissions API is asked for the sensor hardware, never for the
  // invented event names.
  await expect.poll(() => page.evaluate(() => [...new Set(window.__permissionQueries)].sort()))
    .toEqual(['accelerometer', 'gyroscope']);
  // The whole bundle is granted, so both listeners start.
  await expect.poll(() => page.evaluate(() => window.__sensorListeners))
    .toEqual({ devicemotion: 1, deviceorientation: 1 });
  // The boot still opens no prompt and leaves the camera and the mic alone.
  expect(await page.evaluate(() => window.__permissionLog)).toEqual([]);
  expect(await page.evaluate(() => window.__mediaCalls)).toBe(0);
});

test('one granted hardware name confirms nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'grant', orientation: 'grant', query: 'mixed' });
  await page.goto('/?lang=en');
  await sensorTab(page);

  await expect.poll(() => page.evaluate(() => [...new Set(window.__permissionQueries)].sort()))
    .toEqual(['accelerometer', 'gyroscope']);
  expect(await page.evaluate(() => window.__sensorListeners))
    .toEqual({ devicemotion: 0, deviceorientation: 0 });
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('permission-required');
});

test('an unsupported permission query keeps the page waiting', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'grant', orientation: 'grant', query: 'unsupported' });
  await page.goto('/?lang=en');
  await sensorTab(page);

  await expect.poll(() => page.evaluate(() => [...new Set(window.__permissionQueries)].sort()))
    .toEqual(['accelerometer', 'gyroscope']);
  expect(await page.evaluate(() => window.__sensorListeners))
    .toEqual({ devicemotion: 0, deviceorientation: 0 });
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText('permission-required');
});

test('the Settings sensor action asks both APIs inside the gesture', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'deferred', orientation: 'deferred' });
  await page.goto('/?lang=en');
  await openSensorSettings(page);
  await page.locator('#settings-enable-sensors').click();

  // Both requests start before either of them is awaited, and both start
  // while the gesture is still active.
  await expect.poll(() => page.evaluate(() => window.__permissionLog))
    .toEqual(['call:motion:true', 'call:orientation:true']);
  expect(await page.evaluate(() => window.__permissionLog.length)).toBe(2);

  // The orientation request carries exactly one argument and it is the
  // boolean false: the signature is requestPermission(optional boolean
  // absolute=false), so an options object would silently ask for the
  // absolute orientation and the magnetometer.
  const orientationCalls = await page.evaluate(() => window.__permissionArgs
    .filter((entry) => entry.name === 'orientation'));
  expect(orientationCalls.length).toBe(1);
  expect(orientationCalls[0].args).toEqual([false]);

  await page.evaluate(() => window.__permissionSettle('granted'));
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText(/^(waiting|no-readings|ready)$/);
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText(/^(waiting|no-readings|ready)$/);
  await expect(page.locator('#permission-banner')).toBeHidden();
});

test('one denied API never blocks the other', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'deny', orientation: 'grant' });
  await page.goto('/?lang=en');
  await openSensorSettings(page);
  await page.locator('#settings-enable-sensors').click();

  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('denied');
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText(/^(waiting|no-readings|ready)$/);
  // The denied API never installs a listener; the granted one does.
  await expect.poll(() => page.evaluate(() => window.__sensorListeners.deviceorientation)).toBe(1);
  expect(await page.evaluate(() => window.__sensorListeners.devicemotion)).toBe(0);
  await orientEvent(page, { alpha: 0, beta: 0, gamma: 0 });
  await expect(page.locator('[data-sensor-status="orientation"]')).toHaveText('ready');
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('denied');
  await expect(page.locator('#permission-banner')).toBeHidden();
});

test('a failed request stays an error and the next action asks again', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page, { motion: 'reject', orientation: 'grant' });
  await page.goto('/?lang=en');
  await openSensorSettings(page);
  await page.locator('#settings-enable-sensors').click();

  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('error');
  expect(await page.evaluate(() => window.__sensorListeners.devicemotion)).toBe(0);

  // A failure is not a one-shot decision: the next action asks again.
  await page.locator('#settings-enable-sensors').click();
  await expect.poll(() => page.evaluate(() => window.__permissionLog
    .filter((entry) => entry.startsWith('call:motion')).length)).toBe(2);
  await expect(page.locator('[data-sensor-status="motion"]')).toHaveText('error');
});

test('a repeated activation never attaches a second listener', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await installBrowserFacts(page);
  await page.goto('/?lang=en');
  await openSensorSettings(page);
  await page.locator('#settings-enable-sensors').click();
  await expect.poll(() => page.evaluate(() => window.__sensorListeners.deviceorientation)).toBe(1);

  await page.locator('#settings-enable-sensors').click();
  await expect.poll(() => page.evaluate(() => window.__permissionLog.length)).toBe(2);
  const listeners = await page.evaluate(() => window.__sensorListeners);
  expect(listeners.devicemotion).toBe(1);
  expect(listeners.deviceorientation).toBe(1);
});

test('the fullscreen button names the action in the interface language', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?lang=en');
  const stage = page.locator('#btn-stage-mode');
  await expect(stage).toHaveAttribute('aria-label', 'FULLSCREEN');
  await expect(stage).toHaveAttribute('title', 'FULLSCREEN');
  await expect(stage).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.RcSurfaceI18n.setLocale('pt-BR'));
  await expect(stage).toHaveAttribute('aria-label', 'TELA CHEIA');
  await expect(stage).toHaveAttribute('title', 'TELA CHEIA');
  await expect(stage).toHaveAttribute('aria-pressed', 'false');
});
