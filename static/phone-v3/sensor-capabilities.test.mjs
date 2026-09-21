// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Contract tests for RcSensorCapabilities. Pure state machine: the tracker
// never reads the DOM, the wire or Date.now — every transition is driven by
// the injected clock and explicit permission outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import './sensor-capabilities.js';

const { create, NO_READINGS_MS, LOST_MS } = globalThis.RcSensorCapabilities;

function makeClock() {
  let time = 0;
  return { now: () => time, advance: (ms) => { time += ms; }, time: () => time };
}

function makeTracker({ apiPresent = true, secureContext = true, permissionRequired = false } = {}) {
  const clock = makeClock();
  const tracker = create({ apiPresent, secureContext, permissionRequired, now: clock.now });
  return { tracker, clock };
}

test('absent API is unsupported; insecure context is insecure; permission gate is required', () => {
  const { tracker: noApi } = makeTracker({ apiPresent: false });
  assert.equal(noApi.getState().status, 'unsupported');
  noApi.start(); noApi.tick();
  assert.equal(noApi.getState().status, 'unsupported');

  const { tracker: insecure } = makeTracker({ secureContext: false });
  assert.equal(insecure.getState().status, 'insecure');
  insecure.start(); insecure.permission('granted');
  assert.equal(insecure.getState().status, 'insecure');

  const { tracker: gated } = makeTracker({ permissionRequired: true });
  assert.equal(gated.getState().status, 'permission-required');
});

test('waiting 2000 ms without a sample becomes no-readings, never denied', () => {
  const { tracker, clock } = makeTracker();
  tracker.start();
  assert.equal(tracker.getState().status, 'waiting');
  clock.advance(NO_READINGS_MS - 1);
  tracker.tick();
  assert.equal(tracker.getState().status, 'waiting');
  clock.advance(1);
  tracker.tick();
  assert.equal(tracker.getState().status, 'no-readings');
  assert.notEqual(tracker.getState().status, 'denied');
  assert.equal(tracker.getState().lastValidAt, null);
  assert.equal(tracker.getState().everRead, false);
});

test('a sample with no finite axis never becomes ready; zero is a valid reading', () => {
  const { tracker, clock } = makeTracker();
  tracker.start();
  tracker.sample({ alpha: null, beta: NaN, gamma: null });
  assert.notEqual(tracker.getState().status, 'ready');
  tracker.sample({ alpha: undefined, beta: Infinity, gamma: 'x' });
  assert.notEqual(tracker.getState().status, 'ready');

  tracker.sample({ alpha: 0, beta: 0, gamma: 0 });
  assert.equal(tracker.getState().status, 'ready');
  assert.equal(tracker.getState().everRead, true);
  assert.equal(tracker.getState().lastValidAt, clock.time());
  assert.deepEqual(tracker.getState().values, { alpha: 0, beta: 0, gamma: 0 });
});

test('only finite axes are kept and returned as a copy', () => {
  const { tracker } = makeTracker();
  tracker.start();
  tracker.sample({ ax: 1.5, ay: null, az: NaN, gx: 0 });
  const state = tracker.getState();
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.values, { ax: 1.5, gx: 0 });
  state.values.ax = 999;
  assert.equal(tracker.getState().values.ax, 1.5, 'getState values must be a copy');
});

test('no-readings is reversible: a later real reading makes it ready', () => {
  const { tracker, clock } = makeTracker();
  tracker.start();
  clock.advance(NO_READINGS_MS + 10);
  tracker.tick();
  assert.equal(tracker.getState().status, 'no-readings');
  tracker.sample({ alpha: 5 });
  assert.equal(tracker.getState().status, 'ready');
});

test('2000 ms without a new sample turns ready into lost and discards values', () => {
  const { tracker, clock } = makeTracker();
  tracker.start();
  tracker.sample({ ax: 1, ay: 2 });
  clock.advance(LOST_MS - 1);
  tracker.tick();
  assert.equal(tracker.getState().status, 'ready');
  clock.advance(1);
  tracker.tick();
  assert.equal(tracker.getState().status, 'lost');
  assert.deepEqual(tracker.getState().values, {}, 'stale samples must be discarded');
  tracker.sample({ ax: 3 });
  assert.equal(tracker.getState().status, 'ready');
  assert.deepEqual(tracker.getState().values, { ax: 3 });
});

test('explicit deny is denied; explicit error is error; both recover only via explicit permission', () => {
  const { tracker } = makeTracker({ permissionRequired: true });
  tracker.start();
  assert.equal(tracker.getState().status, 'permission-required');
  tracker.permission('denied');
  assert.equal(tracker.getState().status, 'denied');
  tracker.tick();
  assert.equal(tracker.getState().status, 'denied', 'denied is terminal without a new prompt');

  const { tracker: errTracker } = makeTracker({ permissionRequired: true });
  errTracker.permission('error');
  assert.equal(errTracker.getState().status, 'error');

  const { tracker: retry } = makeTracker({ permissionRequired: true });
  retry.permission('denied');
  retry.permission('granted');
  assert.equal(retry.getState().status, 'waiting');
  retry.sample({ alpha: 1 });
  assert.equal(retry.getState().status, 'ready');
});

test('granted permission opens the waiting window; sample before permission is ignored', () => {
  const { tracker, clock } = makeTracker({ permissionRequired: true });
  tracker.sample({ alpha: 1 });
  assert.equal(tracker.getState().status, 'permission-required');
  tracker.permission('granted');
  assert.equal(tracker.getState().status, 'waiting');
  clock.advance(NO_READINGS_MS + 1);
  tracker.tick();
  assert.equal(tracker.getState().status, 'no-readings');
});

test('suspension invalidates a ready source and resume waits for real readings', () => {
  const { tracker } = makeTracker();
  tracker.start();
  tracker.sample({ alpha: 1 });
  tracker.suspend();
  assert.equal(tracker.getState().status, 'lost');
  assert.deepEqual(tracker.getState().values, {});
  // Samples arriving while hidden are ignored.
  tracker.sample({ alpha: 2 });
  assert.equal(tracker.getState().status, 'lost');
  tracker.resume();
  assert.equal(tracker.getState().status, 'waiting');
  tracker.sample({ alpha: 3 });
  assert.equal(tracker.getState().status, 'ready');
});

test('resume never re-opens a permission prompt by itself', () => {
  const { tracker } = makeTracker({ permissionRequired: true });
  tracker.permission('granted');
  tracker.sample({ alpha: 1 });
  tracker.suspend();
  tracker.resume();
  assert.equal(tracker.getState().status, 'waiting', 'resume waits, does not demand a gesture');
});

test('stray events are ignored while denied or in error', () => {
  const { tracker: denied } = makeTracker({ permissionRequired: true });
  denied.permission('denied');
  denied.sample({ alpha: 1 });
  assert.equal(denied.getState().status, 'denied');

  const { tracker: errored } = makeTracker({ permissionRequired: true });
  errored.permission('error');
  errored.sample({ alpha: 1 });
  assert.equal(errored.getState().status, 'error');
});
