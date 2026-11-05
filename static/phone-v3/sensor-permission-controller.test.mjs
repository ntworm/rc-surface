// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Contract tests for the sensor permission controller. The controller never
// reads the DOM, the user agent or the wire: every browser fact arrives
// through the injected descriptors.
import test from 'node:test';
import assert from 'node:assert/strict';
import './sensor-capabilities.js';
import './sensor-permission-controller.js';

const { create: createTracker } = globalThis.RcSensorCapabilities;
const { create: createController } = globalThis.RcSensorPermissions;

const flush = () => new Promise((resolve) => setImmediate(resolve));

function makeTracker({ apiPresent = true, secureContext = true, permissionRequired = false } = {}) {
  let time = 0;
  return createTracker({ apiPresent, secureContext, permissionRequired, now: () => time });
}

function makeHarness({ motion = {}, orientation = {}, queryPermission = null, attach = {} } = {}) {
  const attached = [];
  const changes = [];
  const trackers = {
    motion: makeTracker(motion.tracker),
    orientation: makeTracker(orientation.tracker),
  };
  const controller = createController({
    apis: {
      motion: { present: motion.present !== false, request: motion.request || null },
      orientation: { present: orientation.present !== false, request: orientation.request || null },
    },
    trackers,
    attach: {
      motion: attach.motion || (() => attached.push('motion')),
      orientation: attach.orientation || (() => attached.push('orientation')),
    },
    queryPermission,
    onChange: (name, outcome) => changes.push(name + ':' + outcome),
  });
  return { controller, trackers, attached, changes };
}

test('the controller refuses to exist without its dependencies', () => {
  assert.throws(() => createController(), TypeError);
});

test('an absent API stays unsupported: nothing is attached and nothing is asked', () => {
  const { controller, trackers, attached } = makeHarness({
    motion: { present: false, tracker: { apiPresent: false } },
    orientation: { present: false, tracker: { apiPresent: false } },
  });
  controller.start();
  assert.deepEqual(attached, []);
  assert.equal(trackers.motion.getState().status, 'unsupported');
  assert.equal(trackers.orientation.getState().status, 'unsupported');
  assert.equal(controller.status().motion.outcome, 'unsupported');
});

test('boot attaches the APIs that need no gesture and asks for nothing', () => {
  const { controller, trackers, attached } = makeHarness();
  controller.start();
  assert.deepEqual(attached, ['motion', 'orientation']);
  assert.equal(trackers.motion.getState().status, 'waiting');
  assert.equal(trackers.orientation.getState().status, 'waiting');
});

test('an API that needs a gesture waits: boot neither attaches nor asks', () => {
  let asked = 0;
  const { controller, trackers, attached } = makeHarness({
    motion: {
      request: () => { asked += 1; return Promise.resolve('granted'); },
      tracker: { permissionRequired: true },
    },
  });
  controller.start();
  assert.equal(asked, 0, 'boot must not open a permission prompt');
  assert.deepEqual(attached, ['orientation'], 'only the API that needs no gesture is attached');
  assert.equal(trackers.motion.getState().status, 'permission-required');
});

test('only a confirmed grant starts a listener at boot', async () => {
  const confirmed = makeHarness({
    motion: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
    orientation: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
    queryPermission: (name) => Promise.resolve(name === 'motion' ? 'granted' : 'prompt'),
  });
  confirmed.controller.start();
  await flush();
  assert.deepEqual(confirmed.attached, ['motion']);
  assert.equal(confirmed.trackers.motion.getState().status, 'waiting');
  assert.equal(confirmed.trackers.orientation.getState().status, 'permission-required');

  const unconfirmed = makeHarness({
    motion: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
    orientation: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
    queryPermission: () => Promise.resolve('prompt'),
  });
  unconfirmed.controller.start();
  await flush();
  assert.deepEqual(unconfirmed.attached, []);
  assert.equal(unconfirmed.trackers.motion.getState().status, 'permission-required');
});

test('a request starts every API before anything is awaited', async () => {
  const log = [];
  const resolvers = [];
  const request = (name) => () => {
    log.push('call:' + name);
    return new Promise((resolve) => {
      resolvers.push(() => { log.push('settle:' + name); resolve('granted'); });
    });
  };
  const { controller, attached } = makeHarness({
    motion: { request: request('motion'), tracker: { permissionRequired: true } },
    orientation: { request: request('orientation'), tracker: { permissionRequired: true } },
  });
  controller.start();
  assert.deepEqual(log, [], 'boot must not ask for anything');
  const pending = controller.request();
  assert.deepEqual(log, ['call:motion', 'call:orientation'], 'both requests start inside the gesture');
  assert.deepEqual(attached, [], 'nothing attaches before a permission is granted');
  resolvers.forEach((resolve) => resolve());
  await pending;
  assert.deepEqual(attached, ['motion', 'orientation']);
});

test('one denial never touches the other API', async () => {
  const { controller, trackers, attached, changes } = makeHarness({
    motion: { request: () => Promise.resolve('denied'), tracker: { permissionRequired: true } },
    orientation: { request: () => Promise.resolve('granted'), tracker: { permissionRequired: true } },
  });
  controller.start();
  await controller.request();
  assert.equal(trackers.motion.getState().status, 'denied');
  assert.equal(trackers.orientation.getState().status, 'waiting');
  assert.deepEqual(attached, ['orientation'], 'a denied API never attaches');
  assert.deepEqual(changes, ['motion:denied', 'orientation:granted']);
  // The status reports the real state of each API.
  const status = controller.status();
  assert.equal(status.motion.outcome, 'denied');
  assert.equal(status.motion.attached, false);
  assert.equal(status.motion.tracker, 'denied');
  assert.equal(status.orientation.tracker, 'waiting');
});

test('an unknown outcome is an error, never a grant', async () => {
  const { controller, trackers, attached } = makeHarness({
    motion: { request: () => Promise.resolve('prompt'), tracker: { permissionRequired: true } },
    orientation: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
  });
  controller.start();
  await controller.request();
  assert.equal(trackers.motion.getState().status, 'error');
  assert.notEqual(trackers.motion.getState().status, 'granted');
  assert.deepEqual(attached, ['orientation'], 'the failed API never attaches');
});

test('a failed request is an error and the next gesture retries it', async () => {
  let attempt = 0;
  const { controller, trackers, attached } = makeHarness({
    motion: {
      request: () => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('granted');
      },
      tracker: { permissionRequired: true },
    },
    orientation: {
      request: () => Promise.resolve('granted'),
      tracker: { permissionRequired: true },
    },
  });
  controller.start();
  await controller.request();
  assert.equal(trackers.motion.getState().status, 'error');
  assert.deepEqual(attached, ['orientation'], 'the failed API never attaches');
  await controller.request();
  assert.equal(attempt, 2, 'a failed request can be retried');
  assert.equal(trackers.motion.getState().status, 'waiting');
  assert.deepEqual(attached, ['orientation', 'motion']);
});

test('a repeated activation never attaches a second listener', async () => {
  let asked = 0;
  const { controller, attached } = makeHarness({
    motion: {
      request: () => { asked += 1; return Promise.resolve('granted'); },
      tracker: { permissionRequired: true },
    },
    orientation: {
      request: () => { asked += 1; return Promise.resolve('granted'); },
      tracker: { permissionRequired: true },
    },
  });
  controller.start();
  await controller.request();
  await controller.request();
  assert.deepEqual(attached, ['motion', 'orientation']);
  assert.equal(asked, 2, 'a granted API is not asked again');
});

test('a stale query never overrides the outcome that came after it', async () => {
  const resolvers = new Map();
  const { controller, trackers, attached } = makeHarness({
    motion: { request: () => Promise.resolve('denied'), tracker: { permissionRequired: true } },
    orientation: { request: () => Promise.reject(new Error('boom')), tracker: { permissionRequired: true } },
    queryPermission: (name) => new Promise((resolve) => { resolvers.set(name, resolve); }),
  });
  controller.start();
  await controller.request();
  assert.equal(controller.status().motion.outcome, 'denied');
  assert.equal(controller.status().orientation.outcome, 'error');

  // The boot query resolves after the request: it may not own the API any
  // more, so its late grant changes nothing.
  resolvers.forEach((resolve) => resolve('granted'));
  await flush();
  assert.equal(controller.status().motion.outcome, 'denied', 'a late grant cannot override a denial');
  assert.equal(controller.status().orientation.outcome, 'error', 'a late grant cannot override an error');
  assert.deepEqual(attached, [], 'a late grant never installs a listener');
  assert.equal(trackers.motion.getState().status, 'denied');
});

test('a second gesture reuses the pending request instead of asking again', async () => {
  let asked = 0;
  let resolveMotion = null;
  const { controller, attached } = makeHarness({
    motion: {
      request: () => {
        asked += 1;
        return new Promise((resolve) => { resolveMotion = resolve; });
      },
      tracker: { permissionRequired: true },
    },
    orientation: {
      request: () => { asked += 1; return Promise.resolve('granted'); },
      tracker: { permissionRequired: true },
    },
  });
  controller.start();
  const first = controller.request();
  assert.equal(asked, 2, 'both APIs start inside the gesture');
  const second = controller.request();
  assert.equal(asked, 2, 'the pending request is reused, nothing is asked twice');
  resolveMotion('granted');
  await Promise.all([first, second]);
  assert.deepEqual(attached, ['orientation', 'motion']);
});

test('a request that throws synchronously is an error and the next gesture retries it', async () => {
  let attempt = 0;
  const { controller, trackers, attached } = makeHarness({
    motion: {
      request: () => {
        attempt += 1;
        if (attempt === 1) throw new Error('boom');
        return Promise.resolve('granted');
      },
      tracker: { permissionRequired: true },
    },
    orientation: { request: () => Promise.resolve('granted'), tracker: { permissionRequired: true } },
  });
  controller.start();
  await controller.request();
  assert.equal(trackers.motion.getState().status, 'error');
  assert.deepEqual(attached, ['orientation']);
  await controller.request();
  assert.equal(attempt, 2, 'a synchronous failure can be retried');
  assert.equal(trackers.motion.getState().status, 'waiting');
  assert.deepEqual(attached, ['orientation', 'motion']);
});

test('a listener that does not install is an error, never a grant', async () => {
  let attempts = 0;
  const { controller, trackers } = makeHarness({
    motion: { request: () => Promise.resolve('granted'), tracker: { permissionRequired: true } },
    orientation: { request: () => Promise.resolve('granted'), tracker: { permissionRequired: true } },
    attach: {
      motion: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('boom');
      },
    },
  });
  controller.start();
  await controller.request();
  assert.equal(controller.status().motion.outcome, 'error');
  assert.equal(controller.status().motion.attached, false);
  assert.equal(trackers.motion.getState().status, 'error');

  // The failure is not final: the next gesture installs the listener.
  await controller.request();
  assert.equal(attempts, 2);
  assert.equal(controller.status().motion.outcome, 'granted');
  assert.equal(controller.status().motion.attached, true);
});
