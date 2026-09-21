// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator tests only: no claim about physical SDK/automation sampling rate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { hostModulators, updateHostModulator, tickHostModulators, stopHostModulatorLoop } from '../src/live/host-modulators.ts';
import { oscTransport } from '../src/live/osc-transport.ts';
import { setPlayheadActive, setPlayheadStartTime, setPlayheadBaseTimeMs } from '../src/live/state.ts';

function setup(t, kind = 'lfo') {
  const realNow = Date.now;
  let now = 0;
  Date.now = () => now;
  setExtensionContext({ application: { song: { tempo: 120, tracks: [] } } });
  const name = kind === 'lfo' ? 'toggle-1' : 'button-1';
  const update = payload => {
    updateHostModulator('phase-test', { kind, name, active: true, depth: 1, syncMode: 'free', ...payload });
    stopHostModulatorLoop();
  };
  t.after(() => {
    stopHostModulatorLoop(); hostModulators.clear(); clearExtensionContext(); Date.now = realNow;
    oscTransport.state.available = false; oscTransport.state.connected = false; oscTransport.state.isPlaying = false;
    setPlayheadActive(false); setPlayheadStartTime(0); setPlayheadBaseTimeMs(0);
  });
  return { update, setTime: time => { now = time; },
    state: () => hostModulators.get(`phase-test::${name}`),
    async tick(time) { now = time; await tickHostModulators(time); return this.state().lastWrittenValue; } };
}
const sine = cycles => 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles - Math.PI / 2);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00051, `${actual} != ${expected}`);
const syncedSine = cycles => 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles);
for (const [shape, hz] of Object.entries({ sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 })) {
  test(`r11 ${shape} FREE ceiling and shape changes preserve oscillator phase`, async t => {
    const app = setup(t);
    app.update({ shape: 'sine', rate: 1 });
    await app.tick(0); await app.tick(17);
    const phase = app.state().phase;
    app.update({ shape, rate: 1 });
    assert.equal(app.state().phase, phase);
    await app.tick(27);
    const delta = (app.state().phase - phase + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.abs(delta / (2 * Math.PI * .01) - hz) < 1e-8);
  });
}

test('r11 Stutter SYNC respects 15Hz even with ratchet and swing', async t => {
  const app = setup(t, 'stutter');
  playingAt(0);
  app.update({ syncMode: 'sync', rate: 1, count: 1, swing: .66, syncSubdivisionBeats: .03125 });
  let previous, lastEdge = 0;
  let edges = 0;
  for (let ms = 0; ms <= 1000; ms++) {
    const value = await app.tick(ms);
    if (previous !== undefined && value !== previous) {
      if (edges > 0) assert.ok(ms - lastEdge >= 32, `pulse too short: ${ms - lastEdge}ms`);
      lastEdge = ms; edges++;
    }
    previous = value;
  }
  assert.ok(edges > 0 && edges <= 30);
});
function playingAt(beats = 37.23, time = 0) {
  Object.assign(oscTransport.state, { available: true, connected: true,
    isPlaying: true, currentSongTimeBeats: beats });
  oscTransport.lastSongTimeUpdateAt = time;
}

test('SYNC LFO pin changes preserve phase at a nonzero song beat', async t => {
  const app = setup(t);
  playingAt();
  app.update({ rate: 0.4, syncMode: 'sync', syncSubdivisionBeats: 1 });
  const before = await app.tick(103);
  app.update({ rate: 0.9, syncMode: 'sync', syncSubdivisionBeats: 0.5 });
  close(await app.tick(103), before);
  close(await app.tick(110), syncedSine(37.23 + 0.103 * 2 + 0.007 * 4));
});

test('SYNC LFO Auto rate changes preserve phase and only alter future cycle speed', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', rate: 0 });
  const before = await app.tick(103);
  app.update({ syncMode: 'sync', rate: 1 });
  close(await app.tick(103), before);
  // P02: rate 0 SYNC at 120 BPM now lands on subdiv=32 (was 4); divider follows the table.
  close(await app.tick(110), syncedSine((37.23 + 0.103 * 2) / 32 + 0.007 * 4));
});

test('HOST accepts dotted and triplet pins only for LFO', async t => {
  const app = setup(t);
  for (const subdivision of [3, 8 / 3, 1.5, 4 / 3, 0.75, 2 / 3, 0.375, 1 / 3]) {
    app.update({ syncMode: 'sync', syncSubdivisionBeats: subdivision });
    assert.equal(app.state().syncSubdivisionBeats, subdivision);
  }
  updateHostModulator('phase-test', { kind: 'stutter', name: 'button-1', active: true,
    syncMode: 'sync', syncSubdivisionBeats: 0.75 });
  stopHostModulatorLoop();
  assert.equal(hostModulators.get('phase-test::button-1').syncSubdivisionBeats, undefined);
});

test('SDK clock LFO pin changes settle between ticks and seeks restore song alignment', async t => {
  const app = setup(t);
  setPlayheadActive(true); setPlayheadStartTime(0); setPlayheadBaseTimeMs(37.23 * 500);
  app.update({ syncMode: 'sync', clockSource: 'sdk', syncSubdivisionBeats: 1 });
  await app.tick(100);
  app.setTime(105); app.update({ syncMode: 'sync', clockSource: 'sdk', syncSubdivisionBeats: 0.5 });
  close(await app.tick(111), syncedSine(37.23 + 0.105 * 2 + 0.006 * 4));
  setPlayheadStartTime(120); setPlayheadBaseTimeMs(4.13 * 500);
  close(await app.tick(120), syncedSine(4.13 / 0.5));
});

test('SYNC LFO config between ticks settles the old pin at the message timestamp', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 1 });
  await app.tick(100);
  app.setTime(105); app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5 });
  close(await app.tick(111), syncedSine(37.23 + 0.105 * 2 + 0.006 * 4));
  for (const time of [113, 118, 121]) {
    app.setTime(time); app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5 });
  }
  close(await app.tick(127), syncedSine(37.23 + 0.105 * 2 + 0.022 * 4));
});

test('SYNC LFO offset updates intentionally shift phase after a continuous pin change', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 1 });
  await app.tick(103);
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5, phaseOffsetBeats: 0.125 });
  close(await app.tick(103), syncedSine(37.23 + 0.103 * 2 + 0.125 / 0.5));
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5, phaseOffsetBeats: 0.125 });
  close(await app.tick(110), syncedSine(37.23 + 0.103 * 2 + 0.125 / 0.5 + 0.007 * 4));
});

test('SYNC LFO rate morph preserves phase at each subdivision transition', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', rate: 0 });
  await app.tick(103);
  app.update({ syncMode: 'sync', rate: 1, morphMs: 1000 });
  // P02: rate 0 SYNC at 120 BPM now lands on subdiv=32; pos anchor becomes 37.23/32.
  // The account must follow the 32-beat subdivision: 2/32 = 0.0625 Hz (was 2/4 = 0.5 Hz).
  const first = 37.23 / 32 + 0.103 * 0.0625;
  close(await app.tick(603), syncedSine(first + 0.5 * 0.0625));
  const phase = app.state().phase;
  close(await app.tick(603), syncedSine(phase / (2 * Math.PI)));
  assert.equal(app.state().phase, phase, 'a duplicate morph sample must not move phase');
});

test('SYNC LFO keeps its continuous phase through pause and relocks after resume or seeks', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 1 });
  await app.tick(103);
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5 });
  await app.tick(110);
  oscTransport.state.isPlaying = false;
  close(await app.tick(120), syncedSine(37.23 + 0.103 * 2 + 0.017 * 4));
  playingAt(12.13, 200);
  close(await app.tick(200), syncedSine(12.13 / 0.5));
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 1 });
  playingAt(4.19, 210);
  close(await app.tick(210), syncedSine(4.19));
  playingAt(81.31, 220);
  close(await app.tick(220), syncedSine(81.31));
});

test('minor OSC corrections retain the per-LFO subdivision-change anchor', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 1 });
  await app.tick(103);
  app.update({ syncMode: 'sync', syncSubdivisionBeats: 0.5 });
  playingAt(37.23 + 0.103 * 2 - 0.002, 107);
  close(await app.tick(107), syncedSine(37.23 + 0.103 * 2 - 0.002 / 0.5));
});

test('FREE to SYNC morph alignment happens at the config timestamp and back to FREE keeps phase', async t => {
  const app = setup(t);
  playingAt();
  app.update({ syncMode: 'free', rate: 0.2 });
  await app.tick(100);
  app.setTime(105); app.update({ syncMode: 'sync', syncSubdivisionBeats: 1, rate: 0.8, morphMs: 1000 });
  close(await app.tick(111), syncedSine(37.23 + 0.111 * 2));
  app.setTime(115); app.update({ syncMode: 'free', rate: 0.6 });
  // sine ceiling is now 4 Hz: rate=0.6 free → freq = 0.1 + 0.6·(4-0.1) = 2.44 Hz (was 3.04).
  close(await app.tick(121), syncedSine(37.23 + 0.115 * 2 + 0.006 * 2.44));
});

for (const tempo of [60, 120, 300]) {
  for (const mode of ['free', 'sync', 'paused', 'pinned']) {
    test(`LFO maximum respects 4Hz sine ceiling: ${mode} at ${tempo} BPM`, async t => {
      const app = setup(t);
      setExtensionContext({ application: { song: { tempo, tracks: [] } } });
      Object.assign(oscTransport.state, { available: true, connected: true,
        isPlaying: mode !== 'paused', currentSongTimeBeats: 0 });
      oscTransport.lastSongTimeUpdateAt = 0;
      app.update({ rate: 1, syncMode: mode === 'free' ? 'free' : 'sync', clockSource: 'osc',
        ...(mode === 'pinned' ? { syncSubdivisionBeats: 0.03125 } : {}) });
      const phases = [];
      for (let time = 0; time <= 1000; time += 4) {
        await app.tick(time);
        phases.push(app.state().phase);
      }
      const turn = 2 * Math.PI;
      const cycles = phases.slice(1).reduce((sum, p, i) => sum + ((p - phases[i] + turn) % turn) / turn, 0);
      // sine ceiling is now 4 Hz (fallback for teto_efetivo ≈ 50 escritas/s; write-ceiling P04 pendente).
      // Measured behaviour with the new table:
      //   FREE mode bypasses getLfoSubdivision and uses the linear formula
      //   `freq = 0.1 + rate·(maxHz - 0.1)` = 0.1 + 1·3.9 = 4 Hz at rate=1.
      //   SYNC / paused / pinned modes route through getLfoSubdivision, which
      //   doubles the pinned or rate-selected subdivision until it fits the
      //   ceiling. At 300 BPM, sync without pin → subdiv 4/3 → freq 3.75 Hz;
      //   pinned 0.03125 → subdiv 2 → freq 2.5 Hz. 60/120 BPM always hit 4 Hz.
      const expected =
        mode === 'free'
          ? 4
          : (tempo === 60 ? 4
            : tempo === 120 ? 4
            : (mode === 'pinned' ? 2.5 : 3.75));
      assert.ok(Math.abs(cycles - expected) < 0.00001, `expected ${expected} cycles, got ${cycles}`);
      assert.ok(cycles <= 4.00001);
    });
  }
}

test('FREE LFO rate change preserves phase after a long run and uses the new rate only afterward', async t => {
  const app = setup(t);
  app.update({ rate: 0.2 }); await app.tick(0);
  const before = await app.tick(12123);
  app.update({ rate: 0.9 });
  close(await app.tick(12123), before);
  // sine ceiling is now 4 Hz: rate=0.2 → freq 0.88 Hz (was 1.08); rate=0.9 → freq 3.61 Hz (was 4.51).
  close(await app.tick(12130), sine(12.123 * 0.88 + 0.007 * 3.61));
});

test('explicit LFO Auto clears old pinned subdivision but partial updates retain it', async t => {
  const app = setup(t);
  Object.assign(oscTransport.state, { available: true, connected: true,
    isPlaying: true, currentSongTimeBeats: 0 });
  oscTransport.lastSongTimeUpdateAt = 0;
  app.update({ rate: 1, syncMode: 'sync', syncSubdivisionBeats: 4 });
  await app.tick(0);
  app.update({ rate: 1, syncMode: 'sync' });
  assert.equal(app.state().syncSubdivisionBeats, 4, 'omitted field is a partial update');
  app.update({ rate: 1, syncMode: 'sync', syncSubdivisionBeats: null });
  assert.equal(app.state().syncSubdivisionBeats, undefined, 'explicit Auto must release the pin');
  close(await app.tick(37), 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * 0.037));
});

test('FREE LFO rate changes between ticks are anchored to the configuration timestamp', async t => {
  const app = setup(t);
  app.update({ rate: 0.2 }); await app.tick(0); await app.tick(100);
  app.setTime(105); app.update({ rate: 0.9 });
  // sine ceiling is now 4 Hz: 0.105 × 0.88 (was 1.08) + 0.006 × 3.61 (was 4.51).
  close(await app.tick(111), sine(0.105 * 0.88 + 0.006 * 3.61));
});

test('FREE LFO snapshot rate morph integrates frequency, including a dropped tick past morph end', async t => {
  const app = setup(t);
  app.update({ rate: 0.2 }); await app.tick(0); await app.tick(103);
  app.update({ rate: 0.8, morphMs: 1000 });
  // sine ceiling is now 4 Hz: rate=0.2 → 0.88 Hz; rate=0.5 → 2.05 Hz; rate=0.8 → 3.22 Hz.
  close(await app.tick(603), sine(0.103 * 0.88 + 0.5 * (0.88 + 2.05) / 2));
  close(await app.tick(1503), sine(0.103 * 0.88 + (0.88 + 3.22) / 2 + 0.4 * 3.22));
});

test('FREE stutter rate change preserves pulse phase instead of recalculating its history', async t => {
  const app = setup(t, 'stutter');
  app.update({ rate: 0 }); await app.tick(0);
  assert.equal(await app.tick(210), 1);
  // Keep the original 1 -> 2.9Hz phase probe under the r12 1..15Hz range.
  app.update({ rate: (2.9 - 1) / 14 });
  assert.equal(await app.tick(210), 1);
  assert.equal(await app.tick(320), 0);
});

test('LFO fallback after the synced clock stops advances from the last synced phase', async t => {
  const app = setup(t);
  Object.assign(oscTransport.state, { available: true, connected: true, isPlaying: true, currentSongTimeBeats: 0 });
  oscTransport.lastSongTimeUpdateAt = 0;
  app.update({ rate: 0.4, syncMode: 'sync', clockSource: 'osc', syncSubdivisionBeats: 2 });
  await app.tick(103);
  oscTransport.state.isPlaying = false;
  close(await app.tick(113), 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.113));
});

test('paused LFO keeps the pinned subdivision and re-locks when transport resumes', async t => {
  const app = setup(t);
  Object.assign(oscTransport.state, { available: true, connected: true, isPlaying: true, currentSongTimeBeats: 0 });
  oscTransport.lastSongTimeUpdateAt = 0;
  app.update({ rate: 0.9, syncMode: 'sync', clockSource: 'osc', syncSubdivisionBeats: 2 });
  const locked = await app.tick(103);
  oscTransport.state.isPlaying = false;
  close(await app.tick(173), 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.173));
  oscTransport.state.isPlaying = true;
  oscTransport.lastSongTimeUpdateAt = 1000;
  close(await app.tick(1103), locked);
});
