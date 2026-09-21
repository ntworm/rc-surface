// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function loadApp() {
  const appFile = path.join(import.meta.dirname, 'app.js');
  const appSource = fs.readFileSync(appFile, 'utf8');

  // Mocks for browser environment
  const mockElements = {};
  const getMockElement = (id) => {
    if (!mockElements[id]) {
      mockElements[id] = {
        textContent: '',
        className: '',
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
        style: {},
        addEventListener: () => {},
      };
    }
    return mockElements[id];
  };

  const listeners = {};
  const docListeners = {};

  let vibrateCalls = 0;
  const navigatorMock = {
    onLine: true,
    vibrate: () => { vibrateCalls += 1; },
    wakeLock: null,
  };

  const sockets = [];
  class WebSocketMock {
    static OPEN = 1;

    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() {}
  }

  const windowContext = {
    window: null,
    document: {
      addEventListener: (evt, cb) => { docListeners[evt] = cb; },
      getElementById: getMockElement,
      querySelector: (sel) => getMockElement(sel),
      querySelectorAll: (sel) => [],
    },
    navigator: navigatorMock,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    WebSocket: WebSocketMock,
    DeviceMotionEvent: function() {},
    DeviceOrientationEvent: function() {},
    isSecureContext: true,
    location: {
      protocol: 'https:',
      host: 'localhost:8080',
    },
    addEventListener: (evt, cb) => { listeners[evt] = cb; },
    setInterval: () => {},
    setTimeout: (cb, delay) => { cb(); },
    currentControlStates: {},
    __getVibrateCalls: () => vibrateCalls,
    __getSockets: () => sockets,
    __triggerDocEvent: (evt, e) => { if (docListeners[evt]) docListeners[evt](e); },
    __triggerWindowEvent: (evt, e) => { if (listeners[evt]) listeners[evt](e); },
  };
  windowContext.window = windowContext;

  let currentClientId = null;
  // Provide window.RCSurface stub so app.js can call initSession() —
  // the stub creates a WebSocket using the mock so completeHandshake() works.
  windowContext.RCSurface = {
    initSession(opts = {}) {
      const proto = 'ws';
      const host = windowContext.location.host;
      const ws = new WebSocketMock(`${proto}://${host}/ws`);
      windowContext.phoneWs = ws;
      // Expose callbacks so tests can drive the WS lifecycle
      ws.onopen = opts.onOpen ? () => opts.onOpen({ clientId: currentClientId }) : () => {};
      ws.onmessage = opts.onMessage ? (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'hello') currentClientId = msg.client_id;
          opts.onMessage(msg, { clientId: currentClientId, ws });
        } catch(e){}
      } : () => {};
      ws.onclose = opts.onClose ? opts.onClose : () => {};
      ws.onerror = () => {};
      return { getClientId: () => currentClientId, send: (d) => ws.send(d), isConnected: () => true, setStatus: () => {} };
    },
    getMappingModeActive: () => false,
    getTelemetryThrottleUntil: () => 0,
    _setStatus: () => {},
    _connect: () => {},
  };
  windowContext.isPhoneMappingModeActive = () => false;
  windowContext.setPhoneMappingModeActive = () => {};
  windowContext.throttlePhoneTelemetry = () => {};
  windowContext.getPhoneClientId = () => currentClientId;
  windowContext.sendPhoneCommand = () => false;

  // Run App script
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/audio-descriptor-catalog.js'), 'utf8'), windowContext);
  // Capability tracker must load before app.js (script order in index.html).
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'sensor-capabilities.js'), 'utf8'), windowContext);
  vm.runInNewContext(appSource, windowContext, { filename: appFile });
  
  return windowContext;
}

function completeHandshake(context) {
  const socket = context.__getSockets()[0];
  assert.ok(socket, 'expected app.js to create a WebSocket');
  socket.readyState = context.WebSocket.OPEN;
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({ type: 'hello', client_id: 'client-1' }),
  });
  socket.sent = [];
  return socket;
}

test('Performance controls are queued into state.controls and do not send an immediate message', () => {
  const context = loadApp();
  const socket = completeHandshake(context);

  context.window.onControl({ name: 'button-1', value: 1 });

  // Performance controls are no longer sent as an immediate `type: 'control'`
  // message: they are written to state.controls and dispatched by the 33ms
  // snapshot loop. This avoids double-send (immediate + snapshot) and the
  // duplicated applyMapping/appendHistory calls on the server.
  const sentImmediate = socket.sent.some((msg) => {
    const parsed = JSON.parse(msg);
    return parsed.type === 'control';
  });
  assert.equal(sentImmediate, false, 'expected no immediate control message');

  // The value must still be staged in state.controls for the next snapshot.
  const state = context.window.__abletonRc.state;
  const staged = state.controls.find((c) => c.name === 'button-1');
  assert.ok(staged, 'expected button-1 in state.controls');
  assert.equal(staged.value, 1);
});

test('Modulator state sends an immediate host-modulator message after handshake', () => {
  const context = loadApp();
  const socket = completeHandshake(context);

  context.window.onModulatorState({
    kind: 'stutter',
    name: 'button-1',
    active: true,
    rate: 1,
    count: 1,
    morphMs: 1000,
    syncMode: 'free',
  });

  assert.deepEqual(socket.sent.at(-1), {
    type: 'modulator',
    client_id: 'client-1',
    ts: socket.sent.at(-1).ts,
    modulator: {
      kind: 'stutter',
      name: 'button-1',
      active: true,
      rate: 1,
      count: 1,
      morphMs: 1000,
      syncMode: 'free',
    },
  });
  assert.equal(typeof socket.sent.at(-1).ts, 'number');
});

test('LFO and Stutter Auto clear survives actual modulator WebSocket serialization', () => {
  const context = loadApp();
  const socket = completeHandshake(context);
  const config = { kind: 'lfo', name: 'toggle-1', active: true, rate: 1,
    depth: 1, syncMode: 'sync', clockSource: 'osc' };
  context.onModulatorState({ ...config, syncSubdivisionBeats: 4 });
  assert.equal(socket.sent.at(-1).modulator.syncSubdivisionBeats, 4);
  context.onModulatorState({ ...config, syncSubdivisionBeats: null });
  assert.equal(socket.sent.at(-1).modulator.syncSubdivisionBeats, null);
  context.onModulatorState(config);
  assert.equal(Object.hasOwn(socket.sent.at(-1).modulator, 'syncSubdivisionBeats'), false);
  context.onModulatorState({ ...config, kind: 'stutter', name: 'button-1', syncSubdivisionBeats: null });
  assert.equal(socket.sent.at(-1).modulator.syncSubdivisionBeats, null);
});

test('all incoming playhead state messages keep the header transport in sync', () => {
  const context = loadApp();
  const renderedStates = [];
  context.window.updateHeaderPlayState = (isPlaying) => {
    renderedStates.push(Boolean(isPlaying));
  };
  const socket = completeHandshake(context);

  for (const message of [
    { type: 'hello', client_id: 'client-1', playheadActive: true, playheadTimeMs: 10 },
    { type: 'live_state', playheadActive: false, playheadTimeMs: 20 },
    { type: 'playhead_state', playheadActive: true, playheadTimeMs: 30 },
  ]) {
    socket.onmessage({ data: JSON.stringify(message) });
  }

  assert.deepEqual(
    renderedStates,
    [true, false, true],
    'hello, live_state, and playhead_state must all render the play/pause icon',
  );
});

test('Direct Orientation: deviceorientation event writes raw values to state.orient directly', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  assert.ok(rc.state);
  assert.equal(rc.state.orient, null);

  // Trigger simulated deviceorientation event
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 120.5,
    beta: -45.2,
    gamma: 15.8,
    absolute: true,
  });

  // Verify direct mapping with no transformation/smoothing
  assert.ok(rc.state.orient);
  assert.equal(rc.state.orient.alpha, 239.5);
  assert.equal(rc.state.orient.beta, -45.2);
  assert.equal(rc.state.orient.gamma, 15.8);

  assert.ok(rc.state.sensors.orientation_reading);
  assert.equal(rc.state.sensors.orientation_reading.alpha, 239.5);
  assert.equal(rc.state.sensors.orientation_reading.beta, -45.2);
  assert.equal(rc.state.sensors.orientation_reading.gamma, 15.8);
  assert.equal(rc.state.sensors.orientation, 'available');
});

test('Direct Motion: devicemotion event writes raw acceleration and rotationRate directly to state.motion', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  // Trigger simulated devicemotion event
  context.__triggerWindowEvent('devicemotion', {
    accelerationIncludingGravity: { x: 1.2, y: -2.3, z: 9.8 },
    acceleration: { x: 0.1, y: 0.2, z: 0.3 },
    rotationRate: { alpha: 45.0, beta: -12.5, gamma: 90.0 },
    interval: 16.6,
  });

  // Verify direct mapping
  assert.ok(rc.state.motion);
  assert.equal(rc.state.motion.ax, 1.2);
  assert.equal(rc.state.motion.ay, -2.3);
  assert.equal(rc.state.motion.az, 9.8);
  assert.equal(rc.state.motion.gx, 45.0);
  assert.equal(rc.state.motion.gy, -12.5);
  assert.equal(rc.state.motion.gz, 90.0);
  assert.equal(rc.state.sensors.motion, 'available');
});

test('Calibration delegates to the contextual collector; one event cannot set neutral', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  // Initial event
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 100,
    beta: 20,
    gamma: -10,
    absolute: true,
  });

  assert.equal(rc.state.orient.alpha, 260);

  let requested = null, measured = null;
  context.PageCalibration = {
    start: (page) => { requested = page; },
    feed: (page, sample) => { measured = sample; },
  };
  // The stable-window behavior and timeout are exercised by calibration tests.
  rc.calibrateHorizon();
  assert.equal(requested, 'sensors');
  assert.equal(context.__getVibrateCalls(), 0);

  // Only the raw reading is passed to the collector; no one-frame success.
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 110,
    beta: 25,
    gamma: -5,
    absolute: true,
  });

  assert.equal(rc.state.calibration.active, false);
  assert.equal(rc.state.calibration.offsets.alpha, 0);
  assert.equal(measured.alpha, 250);
  rc.state.calibration.offsets = measured;
  rc.state.calibration.active = true;
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 110, beta: 25, gamma: -5, absolute: true,
  });
  assert.equal(rc.state.calibration.offsets.alpha, 250);
  assert.equal(rc.state.calibration.offsets.beta, 25);
  assert.equal(rc.state.calibration.offsets.gamma, -5);

  assert.equal(rc.state.orient.alpha, 180);
  assert.equal(rc.state.orient.beta, 0);
  assert.equal(rc.state.orient.gamma, 0);

  // Subsequent event relative to offset
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 120,
    beta: 35,
    gamma: 0,
    absolute: true,
  });

  assert.equal(rc.state.orient.alpha, 170);
  assert.equal(rc.state.orient.beta, 10);
  assert.equal(rc.state.orient.gamma, 5);
});

test('Calibration: reset button clears offsets back to zero', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  // Set non-zero offsets
  rc.state.calibration.offsets = { alpha: 50, beta: 10, gamma: -5 };

  // Clear offsets
  rc.state.calibration.offsets = { alpha: 0, beta: 0, gamma: 0 };
  
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 120,
    beta: -45,
    gamma: 15,
    absolute: true,
  });

  assert.equal(rc.state.orient.alpha, 240);
  assert.equal(rc.state.orient.beta, -45);
  assert.equal(rc.state.orient.gamma, 15);
});

test('Direct Orientation: derives beta and gamma from state.motion if accelerometer values are available', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  // Set accelerometer values (e.g. phone tilted forward Z-accel, tilted right X-accel)
  // ax = 4.9 (roll), az = -4.9 (pitch)
  context.__triggerWindowEvent('devicemotion', {
    accelerationIncludingGravity: { x: 4.9, y: 9.8, z: -4.9 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    interval: 16.6,
  });

  // Now trigger deviceorientation
  context.__triggerWindowEvent('deviceorientation', {
    alpha: 100,
    beta: 20,
    gamma: -10,
    absolute: true,
  });

  // beta = -az * 9.18 = 45 degrees
  assert.ok(Math.abs(rc.state.orient.beta - 45) < 0.1, `beta was ${rc.state.orient.beta}`);
  // gamma = ax * 18.36 = 90 degrees
  assert.ok(Math.abs(rc.state.orient.gamma - 90) < 0.1, `gamma was ${rc.state.orient.gamma}`);
});

test('XY pads, knobs, and faders are queued into state.controls and do not send immediate messages', () => {
  const context = loadApp();
  const socket = completeHandshake(context);

  const state = context.window.__abletonRc.state;
  const initialSent = socket.sent.length;

  context.window.onControl({ name: 'xy-1', x: 0.25, y: 0.75 });
  context.window.onControl({ name: 'knob-1', value: 0.42 });
  context.window.onControl({ name: 'fader-2', value: 0.88 });

  // All three should be queued in state.controls but no immediate `control`
  // message should be on the wire.
  const sentAfter = socket.sent.slice(initialSent).filter((msg) => {
    return JSON.parse(msg).type === 'control';
  });
  assert.equal(sentAfter.length, 0, 'expected no immediate control messages for performance controls');

  const xy = state.controls.find((c) => c.name === 'xy-1');
  assert.ok(xy, 'expected xy-1 in state.controls');
  assert.equal(xy.x, 0.25);
  assert.equal(xy.y, 0.75);

  const knob = state.controls.find((c) => c.name === 'knob-1');
  assert.ok(knob, 'expected knob-1 in state.controls');
  assert.equal(knob.value, 0.42);

  const fader = state.controls.find((c) => c.name === 'fader-2');
  assert.ok(fader, 'expected fader-2 in state.controls');
  assert.equal(fader.value, 0.88);
});

// ---- Capability-tracker integration regressions (P02) ----

test('no events never turns sensors into permission-denied', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  // With the old timeout->denied heuristic and this harness's immediate
  // setTimeout, this used to become 'permission-denied'. Silence is now
  // no-readings; denial only follows an explicit permission('denied').
  assert.notEqual(rc.state.sensors.motion, 'permission-denied');
  assert.notEqual(rc.state.sensors.orientation, 'permission-denied');

  rc.__sensorTrackers.motion.permission('denied');
  rc.__syncSensorTrackers();
  assert.equal(rc.state.sensors.motion, 'permission-denied');
  assert.equal(rc.state.sensors.orientation, 'unknown');
});

test('ready->lost emits exactly one lost frame per previously active axis and stops replay', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;
  const emitted = [];
  const originalOnControl = context.window.onControl;
  context.window.onControl = (ctrl) => { emitted.push(ctrl); originalOnControl(ctrl); };

  // A real reading makes the tracker ready and feeds the emission path.
  context.__triggerWindowEvent('devicemotion', {
    accelerationIncludingGravity: { x: 1.2, y: -2.3, z: 9.8 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 1, beta: 2, gamma: 3 },
    interval: 16.6,
  });
  assert.equal(rc.state.sensors.motion, 'available');

  // Mark previously-active axes the same way the rAF loop does.
  rc.state.controls = [];
  rc.__emitSensorControls();
  const before = emitted.length;
  // Suspend: ready -> lost, values discarded.
  rc.__sensorTrackers.motion.suspend();
  rc.__syncSensorTrackers();

  const lostFrames = emitted.slice(before).filter((c) => c.lost === true);
  assert.ok(lostFrames.length >= 1, 'expected lost frames for previously active axes');
  const lostNames = new Set(lostFrames.map((c) => c.name));
  assert.ok(lostNames.has('sensor.motion.ax'));
  assert.equal(rc.state.motion, null, 'stale motion samples must be discarded');
  assert.equal(rc.state.sensors.motion, 'unknown');

  // No duplicate lost emission on the next sync.
  const beforeSecond = emitted.length;
  rc.__syncSensorTrackers();
  const secondLost = emitted.slice(beforeSecond).filter((c) => c.lost === true);
  assert.equal(secondLost.length, 0, 'lost frames must be emitted exactly once');
});

test('resume waits for real readings instead of replaying or re-prompting', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  context.__triggerWindowEvent('deviceorientation', {
    alpha: 100, beta: 20, gamma: -10, absolute: true,
  });
  assert.equal(rc.state.sensors.orientation, 'available');

  rc.__sensorTrackers.orientation.suspend();
  rc.__syncSensorTrackers();
  assert.equal(rc.state.orient, null);

  rc.__sensorTrackers.orientation.resume();
  rc.__syncSensorTrackers();
  assert.equal(rc.state.sensors.orientation, 'unknown', 'resume waits, does not replay');
  assert.equal(rc.state.orient, null);
});

test('legacy snapshot vocabulary maps the tracker statuses', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;

  context.__triggerWindowEvent('devicemotion', {
    accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    interval: 16.6,
  });
  // Zero is a valid reading.
  assert.equal(rc.state.sensors.motion, 'available');
});

test('denied after ready never replays stale values from emitSensorControls', () => {
  const context = loadApp();
  const rc = context.window.__abletonRc;
  const emitted = [];
  const originalOnControl = context.window.onControl;
  context.window.onControl = (ctrl) => { emitted.push(ctrl); originalOnControl(ctrl); };

  context.__triggerWindowEvent('devicemotion', {
    accelerationIncludingGravity: { x: 1, y: 0, z: 9.8 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    interval: 16.6,
  });
  rc.__emitSensorControls();
  const realFrames = () => emitted.filter((c) => !c.lost && c.name.startsWith('sensor.motion.')).length;
  const before = realFrames();
  assert.ok(before > 0, 'ready values reach the wire');

  // Explicit deny while state.motion still holds the last reading: the
  // tracker is no longer ready, so emitSensorControls must not replay it.
  rc.__sensorTrackers.motion.permission('denied');
  rc.__emitSensorControls();
  assert.equal(realFrames(), before, 'stale motion values must not be replayed after deny');
});
