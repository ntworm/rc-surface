import test from 'node:test';
import assert from 'node:assert/strict';
import './calibration.js';

const { createCollector, prepareCamera } = globalThis.CalibrationCore;
const collect = (kind, sample, step = 50) => {
  const c = createCollector(kind);
  let result;
  for (let t = 0; t <= c.duration; t += step) result = c.add(sample(t), t);
  return result;
};

test('sensor neutral requires a stable window and averages across north without a jump', () => {
  const c = createCollector('sensors');
  assert.equal(c.add({ alpha: 0, beta: 0, gamma: 0 }, 0).done, false);
  assert.equal(c.add({ alpha: 0, beta: 0, gamma: 0 }, 0).done, false);
  const good = collect('sensors', (t) => ({ alpha: t % 100 ? 359.5 : 0.5, beta: 20, gamma: -5 }));
  assert.equal(good.ok, true);
  assert.ok(Math.abs(((good.value.alpha + 180) % 360) - 180) < 0.1);
  assert.equal(good.value.beta, 20);
  assert.equal(collect('sensors', (t) => ({ alpha: t / 10, beta: 20, gamma: 0 })).error, 'moving');
});

test('audio uses five seconds of raw playing levels, bounds gain and rejects silence', () => {
  assert.equal(createCollector('audio').duration, 5000);
  assert.equal(collect('audio', () => ({ rms: 0.15 })).value.gain, 5);
  assert.equal(collect('audio', () => ({ rms: 0.005 })).value.gain, 8);
  assert.equal(collect('audio', () => ({ rms: 0 })).error, 'quiet');
  assert.equal(collect('audio', () => ({ rms: 0.99 })).error, 'clipping');
});

test('stale, invalid and duplicate samples cannot manufacture completed calibration', () => {
  const c = createCollector('audio');
  for (let t = 0; t < 5000; t += 50) c.add({ rms: 0.15 }, t);
  assert.equal(c.add({ rms: 0.15 }, 9000).done, false, 'gap starts a new window');
  for (let i = 0; i < 200; i++) assert.equal(c.add({ rms: NaN }, 10000 + i).done, false);
});

test('video verifies actual fresh hand results and illumination, not latched hand coordinates', () => {
  assert.equal(collect('video', () => ({ light: 0.45, clipped: 0.02, hand: true })).ok, true);
  assert.equal(collect('video', () => ({ light: 0.04, clipped: 0, hand: true })).error, 'dark');
  assert.equal(collect('video', () => ({ light: 0.9, clipped: 0.7, hand: true })).error, 'bright');
  assert.equal(collect('video', (t) => ({ light: 0.45, clipped: 0, hand: t % 200 === 0 })).error, 'hand');
});

test('camera automatic modes are capability-checked, verified and reversible; no confidence/coordinates touched', async () => {
  let settings = { exposureMode: 'manual', focusMode: 'manual' };
  const track = {
    getCapabilities: () => ({ exposureMode: ['manual', 'continuous'], focusMode: ['manual', 'continuous'] }),
    getSettings: () => ({ ...settings }),
    applyConstraints: async ({ advanced: [patch] }) => { settings = { ...settings, ...patch }; },
  };
  const applied = await prepareCamera(track);
  assert.equal(applied.changed, true);
  assert.deepEqual(settings, { exposureMode: 'continuous', focusMode: 'continuous' });
  await applied.restore();
  assert.deepEqual(settings, { exposureMode: 'manual', focusMode: 'manual' });
  assert.equal((await prepareCamera({})).changed, false);
  track.applyConstraints = async () => {};
  assert.equal((await prepareCamera(track)).changed, false, 'ignored constraints are not a claimed adjustment');
});
