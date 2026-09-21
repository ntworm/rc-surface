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

test('VisionProcessor: MediaPipe dependencies are bundled locally for offline use', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, 'vision-processor.js'), 'utf8');
  const buildSource = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'build.ts'), 'utf8');
  assert.match(source, /vendor\/mediapipe\/camera_utils\/camera_utils\.js/);
  assert.match(source, /vendor\/mediapipe\/hands\/hands\.js/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net/);
  assert.match(buildSource, /node_modules["', ]+, ["']@mediapipe/);
});

function loadVisionProcessor() {
  const file = path.join(import.meta.dirname, 'vision-processor.js');
  const source = fs.readFileSync(file, 'utf8');
  const safeSource = fs.readFileSync(path.join(import.meta.dirname, 'safe-input-layer.js'), 'utf8');
  const cameraSource = fs.readFileSync(path.join(import.meta.dirname, 'camera-lifecycle.js'), 'utf8');

  // Stub MediaPipe Hands and Camera
  class HandsMock {
    constructor(config) {
      HandsMock.instance = this;
      this.config = config;
      this.options = {};
    }
    setOptions(opts) {
      this.options = opts;
    }
    onResults(cb) {
      this.resultsCallback = cb;
    }
    send(data) {
      this.sentData = data;
      return Promise.resolve();
    }
    close() {
      this.closed = true;
    }
  }

  class CameraMock {
    constructor(video, config) {
      CameraMock.instance = this;
      this.video = video;
      this.config = config;
    }
    start() {
      CameraMock.startCalls = (CameraMock.startCalls || 0) + 1;
      if (CameraMock.failNext) {
        const error = CameraMock.failNext;
        CameraMock.failNext = null;
        return Promise.reject(error);
      }
      this.started = true;
      return Promise.resolve();
    }
    stop() {
      this.stopped = true;
    }
  }

  const windowContext = {
    window: null,
    globalThis: {},
    document: {
      createElement: (tag) => {
        return {
          onload: null,
          onerror: null,
          set src(val) {
            // Simulate script load asynchronously
            setTimeout(() => {
              if (val.includes('hands.js')) {
                windowContext.Hands = HandsMock;
              } else if (val.includes('camera_utils.js')) {
                windowContext.Camera = CameraMock;
              }
              if (this.onload) this.onload();
            }, 5);
          }
        };
      },
      head: {
        appendChild: () => {}
      }
    },
    Hands: null,
    Camera: null,
  };
  windowContext.window = windowContext;
  windowContext.globalThis = windowContext;

  vm.runInNewContext(safeSource, windowContext, { filename: 'safe-input-layer.js' });
  vm.runInNewContext(cameraSource, windowContext, { filename: 'camera-lifecycle.js' });
  vm.runInNewContext(source, windowContext, { filename: file });

  return {
    VisionProcessor: windowContext.VisionProcessor,
    windowContext,
    HandsMock,
    CameraMock
  };
}

test('VisionProcessor: lifecycle load, start, process, stop', async () => {
  const { VisionProcessor, windowContext, HandsMock, CameraMock } = loadVisionProcessor();
  assert.ok(VisionProcessor);

  const vp = new VisionProcessor();

  // Set up mock elements
  const mockVideo = {};
  let canvasContextRequest = null;
  const mockCanvas = {
    width: 320,
    height: 240,
    getContext: (type, options) => {
      canvasContextRequest = { type, options };
      return {
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        drawImage: () => {},
        beginPath: () => {},
        arc: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
      };
    }
  };

  let handUpdateData = null;
  vp.onHandUpdate = (data) => {
    handUpdateData = data;
  };

  // Start the processor (triggers dynamic script loading and camera start)
  await vp.start(mockVideo, mockCanvas);

  assert.ok(vp.active);
  assert.ok(HandsMock.instance);
  assert.ok(CameraMock.instance);
  assert.ok(CameraMock.instance.started);
  // 320x240, not the old 160x120: at that size a fast-moving hand was a few
  // blurred pixels and MediaPipe dropped it mid-gesture.
  assert.equal(CameraMock.instance.config.width, 320);
  assert.equal(CameraMock.instance.config.height, 240);
  assert.equal(HandsMock.instance.options.maxNumHands, 1);
  assert.equal(canvasContextRequest.type, '2d');
  assert.equal(
    canvasContextRequest.options?.willReadFrequently,
    true,
    'the color sampler reads pixels repeatedly and must request a readback-optimized canvas',
  );

  // Simulate MediaPipe results callback with handedness metadata so the
  // processor can attribute the reading to "Right".
  const mockLandmarks = makeOpenHand();

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [mockLandmarks],
    multiHandedness: [{ label: 'Right' }]
  });

  assert.ok(handUpdateData);
  // Open hand → 5 stretched fingers, no fist/pinch, x/y from palm center.
  assert.equal(handUpdateData.active, true);
  assert.equal(handUpdateData.fist, false);
  assert.equal(handUpdateData.open, true);
  // fingers normalized to 1.0 (= 5 raised / 5)
  assert.equal(handUpdateData.fingers, 1);

  // Now simulate a fist: every finger curled back onto its own knuckle.
  const fistLandmarks = makeHand(['thumb', 'index', 'middle', 'ring', 'pinky']);
  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [fistLandmarks],
    multiHandedness: [{ label: 'Right' }]
  });

  assert.equal(handUpdateData.fist, true);
  assert.equal(handUpdateData.open, false);
  assert.ok(handUpdateData.fingers <= 1, `expected <=1 stretched finger, got ${handUpdateData.fingers}`);

  // Stop the processor
  vp.stop();
  assert.equal(vp.active, false);
  assert.ok(CameraMock.instance.stopped);
});

test('VisionProcessor: a failed camera start cleans up and a retry really reacquires it', async () => {
  const { VisionProcessor, CameraMock } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const cameraError = Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
  CameraMock.startCalls = 0;
  CameraMock.failNext = cameraError;
  await assert.rejects(vp.start({}, { getContext: () => null }), cameraError);
  assert.equal(vp.active, false);
  await vp.start({}, { getContext: () => null });
  assert.equal(vp.active, true);
  assert.equal(CameraMock.startCalls, 2);
  vp.stop();
});

test('Managed camera releases a stream that arrives after stop and restarts cleanly', async () => {
  const { windowContext } = loadVisionProcessor();
  const ManagedCameraSession = windowContext.ManagedCameraSession;
  assert.equal(typeof ManagedCameraSession, 'function');

  let resolveFirst;
  const firstTrack = { readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } };
  const secondTrack = { readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } };
  const firstStream = { getTracks: () => [firstTrack], getVideoTracks: () => [firstTrack] };
  const secondStream = { getTracks: () => [secondTrack], getVideoTracks: () => [secondTrack] };
  let acquisitions = 0;
  windowContext.navigator = {
    mediaDevices: {
      getUserMedia: () => {
        acquisitions += 1;
        if (acquisitions === 1) return new Promise((resolve) => { resolveFirst = resolve; });
        return Promise.resolve(secondStream);
      },
    },
  };
  windowContext.requestAnimationFrame = () => 17;
  windowContext.cancelAnimationFrame = () => {};
  const video = {
    srcObject: null,
    paused: false,
    readyState: 4,
    play: () => Promise.resolve(),
    pause() { this.paused = true; },
  };
  const camera = new ManagedCameraSession(video, { width: 160, height: 120, onFrame: async () => {} });

  const pendingStart = camera.start();
  camera.stop();
  resolveFirst(firstStream);
  await assert.rejects(pendingStart, /cancel/i);
  assert.equal(firstTrack.stopped, true);
  assert.equal(video.srcObject, null);

  video.paused = false;
  await camera.start();
  assert.equal(video.srcObject, secondStream);
  camera.stop();
  assert.equal(secondTrack.stopped, true);
  assert.equal(video.srcObject, null);
});

test('Managed camera starts playback when mobile loadeddata never fires', async () => {
  const { windowContext } = loadVisionProcessor();
  const ManagedCameraSession = windowContext.ManagedCameraSession;
  const track = { stop() {} };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  windowContext.navigator = { mediaDevices: { getUserMedia: async () => stream } };
  windowContext.requestAnimationFrame = () => 99;
  windowContext.cancelAnimationFrame = () => {};
  windowContext.setTimeout = (callback) => {
    setImmediate(callback);
    return 1;
  };
  windowContext.clearTimeout = () => {};
  let readinessListeners = 0;
  let playCalls = 0;
  const video = {
    srcObject: null,
    readyState: 0,
    muted: false,
    playsInline: false,
    addEventListener(name) {
      if (name === 'loadeddata' || name === 'error') readinessListeners += 1;
    },
    removeEventListener() {},
    async play() {
      playCalls += 1;
      this.readyState = 2;
    },
    pause() {},
  };
  const camera = new ManagedCameraSession(video, { onFrame: async () => {} });

  await camera.start();
  assert.equal(playCalls, 1);
  assert.equal(readinessListeners, 0);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.srcObject, stream);
  assert.equal(camera.running, true);
  camera.stop();
});

test('Managed camera leaves frame-rate negotiation to the browser after real devices returned black frames', async () => {
  const { windowContext } = loadVisionProcessor();
  const ManagedCameraSession = windowContext.ManagedCameraSession;
  const captures = [];
  windowContext.navigator = {
    mediaDevices: {
      getUserMedia: async (constraints) => {
        captures.push(constraints);
        const track = { stop() {} };
        return { getTracks: () => [track], getVideoTracks: () => [track] };
      },
    },
  };
  windowContext.requestAnimationFrame = () => 23;
  windowContext.cancelAnimationFrame = () => {};
  const makeVideo = () => ({ srcObject: null, play: async () => {}, pause: () => {} });

  const managed = new ManagedCameraSession(makeVideo(), { width: 320, height: 240, onFrame: async () => {} });
  await managed.start();
  managed.stop();

  windowContext.AbletonRcCameraLifecycle = null;
  const direct = new ManagedCameraSession(makeVideo(), { width: 320, height: 240, onFrame: async () => {} });
  await direct.start();
  direct.stop();

  assert.equal(captures.length, 2);
  for (const constraints of captures) {
    assert.equal(constraints.video.width.ideal, 320);
    assert.equal(constraints.video.height.ideal, 240);
    assert.equal(
      'frameRate' in constraints.video,
      false,
      'some phone and desktop drivers accept the ideal constraint but then deliver a black stream',
    );
  }
});

test('VisionProcessor uses the managed camera lifecycle when getUserMedia is available', async () => {
  const { VisionProcessor, windowContext, CameraMock } = loadVisionProcessor();
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  windowContext.navigator = { mediaDevices: { getUserMedia: async () => stream } };
  windowContext.requestAnimationFrame = () => 31;
  windowContext.cancelAnimationFrame = () => {};
  CameraMock.startCalls = 0;
  const video = {
    srcObject: null,
    play: async () => {},
    pause: () => {},
  };
  const vp = new VisionProcessor();

  await vp.start(video, { getContext: () => null });
  assert.equal(video.srcObject, stream);
  assert.equal(CameraMock.startCalls, 0);
  vp.stop();
  assert.equal(track.stopped, true);
  assert.equal(video.srcObject, null);
});

test('VisionProcessor requests the native camera before first-load MediaPipe dependencies finish', async () => {
  const { VisionProcessor, windowContext } = loadVisionProcessor();
  const track = { stop() {} };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  let acquisitions = 0;
  windowContext.navigator = {
    mediaDevices: {
      getUserMedia: async () => {
        acquisitions += 1;
        return stream;
      },
    },
  };
  windowContext.requestAnimationFrame = () => 41;
  windowContext.cancelAnimationFrame = () => {};
  const video = { srcObject: null, play: async () => {}, pause: () => {} };
  const vp = new VisionProcessor();

  const starting = vp.start(video, { getContext: () => null });
  assert.equal(acquisitions, 1, 'camera acquisition must begin in the original user activation');
  await starting;
  vp.stop();
});

test('VisionProcessor: ambient color detection processes canvas frames and calculates average RGB', async () => {
  const { VisionProcessor, HandsMock } = loadVisionProcessor();
  const vp = new VisionProcessor();

  const mockVideo = {};
  const mockCanvas = {
    width: 160,
    height: 120,
    getContext: () => ({
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      drawImage: () => {},
      getImageData: () => {
        const data = new Uint8ClampedArray(160 * 120 * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255;
          data[i + 1] = 127;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
        return { data };
      }
    })
  };

  let colorUpdateData = null;
  vp.onColorUpdate = (data) => {
    colorUpdateData = data;
  };

  await vp.start(mockVideo, mockCanvas);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: []
  });

  assert.ok(colorUpdateData);
  assert.ok(Math.abs(colorUpdateData.r - 1.0) < 0.01);
  assert.ok(Math.abs(colorUpdateData.g - 0.498) < 0.01);
  assert.ok(Math.abs(colorUpdateData.b - 0.0) < 0.01);

  vp.stop();
});

function loadVisionAndApp() {
  const vpFile = path.join(import.meta.dirname, 'vision-processor.js');
  const vpSource = fs.readFileSync(vpFile, 'utf8');

  const appFile = path.join(import.meta.dirname, 'app.js');
  const appSource = fs.readFileSync(appFile, 'utf8');

  // Stubs for MediaPipe Hands and Camera
  class HandsMock {
    constructor(config) {
      HandsMock.instance = this;
      this.config = config;
    }
    setOptions() {}
    onResults(cb) {
      this.resultsCallback = cb;
    }
    close() {}
  }

  class CameraMock {
    constructor(video, config) {
      CameraMock.instance = this;
      // Keep the options so tests can drive the frame loop by hand; the real
      // camera_utils Camera invokes config.onFrame() per presented frame.
      this.config = config;
    }
    start() {
      CameraMock.startCalls = (CameraMock.startCalls || 0) + 1;
      if (CameraMock.failNext) {
        const error = CameraMock.failNext;
        CameraMock.failNext = null;
        return Promise.reject(error);
      }
      return Promise.resolve();
    }
    stop() {}
  }

  const mockElements = {};
  const getMockElement = (id) => {
    if (!mockElements[id]) {
      const el = {
        textContent: '',
        checked: false,
        className: '',
        style: {},
        addEventListener: function(evt, cb) {
          this[`on${evt}`] = cb;
        },
        getContext: () => ({
          save: () => {},
          restore: () => {},
          clearRect: () => {},
          drawImage: () => {},
          beginPath: () => {},
          arc: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          fill: () => {},
        }),
      };
      el.classList = {
        add: (c) => { el.className = c; },
        remove: (c) => { el.className = ''; },
        toggle: () => {},
        contains: () => false,
      };
      mockElements[id] = el;
    }
    return mockElements[id];
  };

  const windowContext = {
    window: null,
    globalThis: {},
    document: {
      body: { dataset: {} },
      getElementById: getMockElement,
      querySelector: getMockElement,
      querySelectorAll: () => [getMockElement('pad-1')],
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: (tag) => {
        return {
          onload: null,
          onerror: null,
          set src(val) {
            setTimeout(() => {
              windowContext.Hands = HandsMock;
              windowContext.Camera = CameraMock;
              if (this.onload) this.onload();
            }, 5);
          }
        };
      },
      head: {
        appendChild: () => {}
      }
    },
    navigator: {
      vibrate: () => {},
    },
    currentTime: Date.now(),
    Date: {
      now: () => windowContext.currentTime
    },
    performance: { now: () => windowContext.currentTime },
    isSecureContext: true,
    location: {
      protocol: 'https:',
      host: 'localhost:8080',
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    WebSocket: class {
      constructor() { this.readyState = 0; }
      send() {}
      close() {}
    },
    addEventListener: () => {},
    setInterval: (cb, delay) => {
      if (delay === 33) {
        windowContext.lastIntervalCallback = cb;
      }
    },
    setTimeout: (cb, delay) => { cb(); },
    dispatchEvent: () => {},
    Hands: null,
    Camera: null,
  };
  windowContext.window = windowContext;
  windowContext.globalThis = windowContext;

  // Provide window.RCSurface stub so app.js can call initSession() without crashing.
  windowContext.RCSurface = {
    initSession: (opts = {}) => {},
    getMappingModeActive: () => false,
    getTelemetryThrottleUntil: () => 0,
    _setStatus: () => {},
    _connect: () => {},
  };
  windowContext.isPhoneMappingModeActive = () => false;
  windowContext.setPhoneMappingModeActive = () => {};
  windowContext.throttlePhoneTelemetry = () => {};
  windowContext.getPhoneClientId = () => null;
  windowContext.sendPhoneCommand = () => false;

  const visionStateFile = path.join(import.meta.dirname, 'vision-control-state.js');
  vm.runInNewContext(fs.readFileSync(visionStateFile, 'utf8'), windowContext, { filename: visionStateFile });
  vm.runInNewContext(vpSource, windowContext, { filename: vpFile });
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/audio-descriptor-catalog.js'), 'utf8'), windowContext);
  vm.runInNewContext(appSource, windowContext, { filename: appFile });

  return { windowContext, mockElements, HandsMock, CameraMock };
}

test('VisionProcessor integration: setupVisionUI initializes checkbox and updates HUD', async () => {
  const { windowContext, mockElements, HandsMock } = loadVisionAndApp();

  const chk = mockElements['chk-vision-enable'];
  assert.ok(chk);

  // Trigger change event to enable vision
  chk.checked = true;
  await chk.onchange(); // calls startVision() inside setupVisionUI

  // Verify HUD classList had 'hidden' removed
  assert.equal(mockElements['vision-hud'].className, '');

  // Stop vision
  chk.checked = false;
  chk.onchange(); // calls stopVision()

  assert.equal(mockElements['vision-hud'].className, 'hidden');
});

test('VisionProcessor integration: camera diagnostics show palm size and signed facing only', async () => {
  const { mockElements, HandsMock } = loadVisionAndApp();
  const chk = mockElements['chk-vision-enable'];
  chk.checked = true;
  await chk.onchange();

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makePalmFacingPinchHand()],
    multiHandedness: [HAND_LABEL_FOR_REAL_LEFT],
  });
  assert.match(mockElements['vision-value-facing'].textContent, /^\+0\./);
  assert.match(mockElements['vision-value-palm'].textContent, /^0\./);
  for (const removed of [
    'vision-value-palm-pose',
    'vision-value-index-curved',
    'vision-value-other-fingers',
    'vision-value-handedness',
  ]) assert.equal(mockElements[removed], undefined, `${removed} must stay removed from the phone UI`);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [mirrorHand(makePalmFacingPinchHand())],
    multiHandedness: [HAND_LABEL_FOR_REAL_LEFT],
  });
  assert.match(mockElements['vision-value-facing'].textContent, /^-0\./);

  chk.checked = false;
  await chk.onchange();
  assert.equal(mockElements['vision-value-facing'].textContent, '+0.00');
  assert.equal(mockElements['vision-value-palm'].textContent, '0.00');
});

test('VisionProcessor integration: a busy camera renders inline error and retry succeeds', async () => {
  const { mockElements, CameraMock } = loadVisionAndApp();
  const chk = mockElements['chk-vision-enable'];
  CameraMock.startCalls = 0;
  CameraMock.failNext = Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
  chk.checked = true;
  await chk.onchange();
  assert.equal(chk.checked, false);
  assert.equal(mockElements['vision-camera-state-title'].textContent, 'CAMERA BUSY');
  assert.equal(mockElements['.vision-camera-stage'].className, 'camera-error');
  chk.checked = true;
  await chk.onchange();
  assert.equal(mockElements['.vision-camera-stage'].className, 'camera-active');
  assert.equal(CameraMock.startCalls, 2);
});

test('VisionProcessor integration: a ready camera is visible and cancellable while MediaPipe is still loading', async () => {
  const { windowContext, mockElements, HandsMock } = loadVisionAndApp();
  let finishDependencies;
  const dependencies = new Promise((resolve) => { finishDependencies = resolve; });
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  windowContext.navigator.mediaDevices = { getUserMedia: async () => stream };
  windowContext.VisionProcessor.prototype.loadDependencies = () => dependencies;

  const chk = mockElements['chk-vision-enable'];
  chk.checked = true;
  const starting = chk.onchange();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (windowContext.currentVisionProcessor?.visionStatus.cameraActive) break;
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(windowContext.currentVisionProcessor?.visionStatus.stage, 'camera-ready');
  assert.equal(mockElements['vision-camera-state-title'].textContent, 'CAMERA ACTIVE');
  assert.equal(mockElements['vision-hud'].className, '', 'the live preview must not wait for MediaPipe');
  assert.equal(Boolean(chk.disabled), false, 'the camera switch must remain usable during startup');

  chk.checked = false;
  await chk.onchange();
  assert.equal(track.stopped, true);
  assert.equal(mockElements['vision-camera-state-title'].textContent, 'CAMERA OFF');

  windowContext.Hands = HandsMock;
  finishDependencies();
  await starting;
  assert.equal(chk.checked, false);
  assert.equal(mockElements['vision-camera-state-title'].textContent, 'CAMERA OFF');
  assert.notEqual(mockElements['.vision-camera-stage'].className, 'camera-error');
});

test('VisionProcessor integration: hand active status and mappable X/Y/Z follow detection and loss', async () => {
  const { windowContext, mockElements, HandsMock } = loadVisionAndApp();

  const chk = mockElements['chk-vision-enable'];
  assert.ok(chk);

  // Enable vision
  chk.checked = true;
  await chk.onchange();

  // Wait for HandsMock.instance to initialize asynchronously
  for (let i = 0; i < 20; i++) {
    if (HandsMock.instance) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  assert.ok(HandsMock.instance, "HandsMock.instance was not initialized");

  // 1. Simulate hand detected. Direct X/Y/Z measurements remain mappable
  // even though calibrated/predicted spatial tracking is retired.
  const mockLandmarks = [];
  for (let i = 0; i < 21; i++) {
    mockLandmarks.push({ x: 0.5, y: 0.5, z: 0.0 });
  }
  mockLandmarks[0] = { x: 0.4, y: 0.8, z: 0.0 }; // wrist
  mockLandmarks[5] = { x: 0.3, y: 0.4, z: 0.0 }; // index mcp
  mockLandmarks[17] = { x: 0.5, y: 0.4, z: 0.0 }; // pinky mcp
  mockLandmarks[9] = { x: 0.4, y: 0.4, z: 0.0 }; // middle mcp
  [8, 12, 16, 20].forEach((tip) => {
    mockLandmarks[tip] = { x: 0.4, y: 0.1, z: 0.0 };
  });

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [mockLandmarks],
    multiHandedness: [{ label: 'Right' }]
  });

  assert.equal(windowContext.currentControlStates['sensor.vision.active'], 1);
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(typeof windowContext.currentControlStates[`sensor.vision.${axis}`], 'number');
  }
  for (const diagnostic of ['sensor.vision.palm', 'sensor.vision.face', 'sensor.vision.fingers']) {
    assert.equal(
      windowContext.currentControlStates[diagnostic], undefined,
      `${diagnostic} must remain a local diagnostic instead of a noisy mapping source`,
    );
  }
  // MCP-based rotateVal lives on the hand state. The wire only carries
  // it when the Victory detector is opted in, which is the default the
  // panel uses, but the integration test does not toggle detectors —
  // assert on the state instead.
  assert.equal(typeof windowContext.state.vision.hand.rotateVal, 'number');

  // 2. Simulate hand lost
  const startTime = 1000;
  windowContext.currentTime = startTime;

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [],
    multiHandedness: []
  });

  assert.ok(windowContext.lastIntervalCallback, "setInterval callback was not captured");

  // Tick the decay loop once and assert the hand flag flipped off.
  windowContext.currentTime = startTime + 150;
  windowContext.lastIntervalCallback();

  assert.equal(windowContext.currentControlStates['sensor.vision.active'], 0);
  // Built-in gesture detectors are opt-in; a disabled detector must stay
  // completely off the output stream instead of producing noisy zeroes.
  assert.equal(windowContext.currentControlStates['sensor.vision.fist'], undefined);

  // Tick 2: 300ms after loss (fully decayed). With spatial tracking
  // retired there is nothing to decay toward a neutral; the only
  // state change is that `sensor.vision.active` is now 0.
  windowContext.currentTime = startTime + 300;
  windowContext.lastIntervalCallback();

  assert.equal(windowContext.currentControlStates['sensor.vision.active'], 0);
});

// Build a synthetic 21-landmark "open hand" in the same coordinates used
// across the original test suite. All fingertips are stretched far from the
// wrist so every stretch ratio should land well above 0.65.
// An anatomically complete hand. Every one of the 21 landmarks is placed,
// because finger extension is measured tip-to-its-own-MCP: a fixture that
// leaves a knuckle at the array default, or parks a fingertip on the wrist,
// describes a hand that cannot exist and the measure reads noise from it.
//
// Geometry is pinned so palmSize is exactly 0.4 (wrist to middle MCP) and the
// wrist, index MCP and pinky MCP keep their previous coordinates, which is
// what the x/y assertions below are built on.
//
// `folded` names the fingers that are curled. A curled finger returns its tip
// to its own knuckle, which is what a hand actually does; it does not travel
// to the wrist.
function makeHand(folded = []) {
  const down = new Set(folded);
  const lms = new Array(21);
  const put = (i, x, y) => { lms[i] = { x, y, z: 0.0 }; };

  put(0, 0.4, 0.8);        // wrist
  put(1, 0.355, 0.715);    // thumb CMC
  put(2, 0.315, 0.640);    // thumb MCP — the reference the thumb is measured from

  // The thumb is measured by OPPOSITION — tip to the pinky knuckle — because
  // that is the axis it actually moves on. So the fixture has to place it at
  // anatomical proportions on that axis, not merely somewhere plausible:
  // an abducted thumb sits a little further from the far knuckle than the
  // palm is long, and a tucked one about half that.
  //   palmSize here is 0.400 (wrist to middle MCP), pinky MCP at (0.500, 0.400)
  if (down.has('thumb')) {
    put(3, 0.372, 0.560);
    put(4, 0.340, 0.470);  // 0.175 from the pinky knuckle -> ratio 0.44
  } else {
    put(3, 0.205, 0.520);
    put(4, 0.060, 0.550);  // 0.465 from the pinky knuckle -> ratio 1.16
  }

  // The four fingers, knuckles across the same line so palmSize stays 0.4.
  const columns = [
    { name: 'index',  base: 5,  x: 0.300 },
    { name: 'middle', base: 9,  x: 0.400 },
    { name: 'ring',   base: 13, x: 0.467 },
    { name: 'pinky',  base: 17, x: 0.500 },
  ];
  for (const { name, base, x } of columns) {
    put(base, x, 0.40);
    if (down.has(name)) {
      // Curled: the tip arcs over and comes back beside its own knuckle.
      put(base + 1, x + 0.010, 0.310);
      put(base + 2, x + 0.055, 0.290);
      put(base + 3, x + 0.070, 0.360);   // ~0.08 from the MCP
    } else {
      put(base + 1, x, 0.283);
      put(base + 2, x, 0.166);
      put(base + 3, x, 0.050);           // 0.35 from the MCP
    }
  }
  return lms;
}

function makeOpenHand() {
  return makeHand();
}

function makeHandAtPalmSize(palmSize) {
  const landmarks = makeOpenHand();
  const wrist = landmarks[0];
  landmarks[9] = { x: wrist.x, y: wrist.y - palmSize, z: wrist.z };
  return landmarks;
}

function makePerspectiveShortenedOpenThumb() {
  const landmarks = makeOpenHand();
  // The thumb remains a straight, outward-pointing chain, but camera
  // perspective shortens MCP-to-tip to 0.20 while palmSize stays 0.40.
  // This is the real-phone failure shape: the other four fingers stay open,
  // yet the previous rig-specific thumb gate reports only four raised.
  landmarks[3] = { x: 0.257, y: 0.558, z: 0.0 };
  landmarks[4] = { x: 0.199, y: 0.477, z: 0.0 };
  return landmarks;
}

function curveIndexFinger(landmarks) {
  const mcp = landmarks[5];
  const tip = landmarks[8];
  const dx = tip.x - mcp.x;
  const dy = tip.y - mcp.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return landmarks;
  const normalX = -dy / length;
  const normalY = dx / length;
  const bow = length * 0.5;
  landmarks[6] = { x: mcp.x + dx / 3 + normalX * bow, y: mcp.y + dy / 3 + normalY * bow, z: mcp.z };
  landmarks[7] = { x: mcp.x + (dx * 2) / 3 + normalX * bow, y: mcp.y + (dy * 2) / 3 + normalY * bow, z: mcp.z };
  return landmarks;
}

function makePinchHand() {
  const landmarks = makeOpenHand();
  landmarks[4] = { x: 0.4, y: 0.1, z: 0.0 };
  landmarks[8] = { x: 0.4, y: 0.1, z: 0.0 };
  return curveIndexFinger(landmarks);
}

function makePalmFacingPinchHand() {
  const landmarks = makePinchHand();
  // Widen the visible MCP span while keeping every supporting finger extended.
  // This is a comfortably face-on pose with a positive signed palm triangle.
  for (const index of [17, 18, 19, 20]) {
    landmarks[index] = { ...landmarks[index], x: landmarks[index].x + 0.08 };
  }
  return landmarks;
}

// Pareamento medido no aparelho do proprietario em 27/08/2026, com a mao
// aberta na frente da camera. Este caminho envia o frame NAO espelhado, e
// nele o MediaPipe etiqueta a mao real ao contrario:
//
//   mao real esquerda  -> chip HAND mostra 'Right'
//   mao real direita   -> chip HAND mostra 'Left'
//
// A geometria nao espelhada dos fixtures abaixo (MCP do indicador a esquerda
// do mindinho) e uma mao ESQUERDA real; mirrorHand() produz a direita. Usar
// as constantes em vez da etiqueta crua mantem o par geometria/etiqueta
// honesto: um fixture com o par trocado descreve uma leitura que o aparelho
// nunca emite, e foi assim que a inversao de sinal passou despercebida.
const HAND_LABEL_FOR_REAL_LEFT = { label: 'Right' };
const HAND_LABEL_FOR_REAL_RIGHT = { label: 'Left' };

function mirrorHand(landmarks) {
  const axis = landmarks[0].x;
  return landmarks.map((point) => ({ ...point, x: axis * 2 - point.x }));
}

function makeEdgeOnPinchHand() {
  const landmarks = makePinchHand();
  const axis = landmarks[0].x;
  // Collapse only the horizontal palm span. The fingers remain long enough
  // to be recognized, while the signed palm triangle approaches zero.
  for (const index of [5, 9, 13, 17, 18, 19, 20]) {
    landmarks[index] = {
      ...landmarks[index],
      x: axis + (landmarks[index].x - axis) * 0.05,
    };
  }
  return landmarks;
}

function makeRelaxedPinchHand() {
  const landmarks = makePinchHand();
  // Keep the supporting middle and ring fingers naturally curved: each tip
  // is only 0.27 palm units from its own MCP, yielding normalized readings
  // below the fully extended reading while retaining a deliberate index curl.
  for (const base of [9, 13]) {
    landmarks[base + 3] = {
      ...landmarks[base + 3],
      y: landmarks[base].y - 0.27,
    };
  }
  return landmarks;
}

function makeCurledSupportPinchHand() {
  const landmarks = makeHand(['middle', 'ring', 'pinky']);
  landmarks[4] = { x: 0.4, y: 0.1, z: 0.0 };
  landmarks[8] = { x: 0.4, y: 0.1, z: 0.0 };
  return curveIndexFinger(landmarks);
}

function makeContactingFist() {
  const landmarks = makeHand(['thumb', 'index', 'middle', 'ring', 'pinky']);
  landmarks[4] = { ...landmarks[8] };
  return landmarks;
}

// Hand-checked projection of the requested relaxed gesture, not a camera
// recording: the tips have a visible gap, the index bends gently and all
// three supporting fingers extend partway. Expectations do not use detector
// constants. Scaling the whole hand preserves its pose, unlike moving one MCP.
function makeRelaxedPhonePinch() {
  return [
    [0.50, 0.80],
    [0.43, 0.72], [0.36, 0.62], [0.355, 0.48], [0.40, 0.38],
    [0.42, 0.55], [0.41, 0.45], [0.44, 0.39], [0.47, 0.38],
    [0.50, 0.55], [0.50, 0.45], [0.51, 0.405], [0.52, 0.395],
    [0.56, 0.57], [0.56, 0.47], [0.56, 0.43], [0.57, 0.42],
    [0.61, 0.60], [0.62, 0.51], [0.63, 0.48], [0.64, 0.47],
  ].map(([x, y]) => ({ x, y, z: 0 }));
}

function straightenPhonePinchIndex(landmarks) {
  const mcp = landmarks[5];
  const tip = landmarks[8];
  for (const offset of [1, 2]) {
    landmarks[5 + offset] = {
      x: mcp.x + (tip.x - mcp.x) * offset / 3,
      y: mcp.y + (tip.y - mcp.y) * offset / 3,
      z: 0,
    };
  }
  return landmarks;
}

test('phone pinch accepts nearby fingertips without requiring overlap', () => {
  const { windowContext } = loadVisionProcessor();
  const landmarks = makeRelaxedPhonePinch();
  // Isolate contact tolerance from the relaxed-index requirement.
  landmarks[6] = { x: 0.37, y: 0.44, z: 0 };
  landmarks[7] = { x: 0.39, y: 0.36, z: 0 };
  const data = windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT);
  const clutch = new windowContext.PinchClutch();
  let state;
  for (let frame = 0; frame < 6; frame += 1) {
    state = clutch.update(data.pinchSignal, data.x, data.y, data.z);
  }
  assert.equal(data.pinch, true, 'the visible fingertip gap is a deliberate pinch');
  assert.equal(state.pinch_engaged, true, 'the same gesture must arm the clutch');
});

test('phone pinch accepts a gently curved index with relaxed supporting fingers', () => {
  const { windowContext } = loadVisionProcessor();
  const landmarks = makeRelaxedPhonePinch();
  // Isolate finger shape from contact tolerance.
  landmarks[4] = { ...landmarks[8] };
  const data = windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT);
  assert.equal(data.pinch, true, 'contact does not require an exaggerated index curl');
  assert.ok(data.pinchSignal > 0.75, 'the relaxed pose reaches the clutch input');
});

test('phone pinch works across hand sizes and handedness through the live processor', () => {
  const { VisionProcessor, windowContext } = loadVisionProcessor();
  for (const scale of [1, 0.48, 0.24]) {
    for (const mirrored of [false, true]) {
      const vp = new VisionProcessor();
      let landmarks = makeRelaxedPhonePinch().map((point) => ({
        x: 0.5 + (point.x - 0.5) * scale,
        y: 0.8 + (point.y - 0.8) * scale,
        z: point.z * scale,
      }));
      if (mirrored) landmarks = mirrorHand(landmarks);
      const label = mirrored ? HAND_LABEL_FOR_REAL_RIGHT : HAND_LABEL_FOR_REAL_LEFT;
      let state;
      for (let frame = 0; frame < 6; frame += 1) {
        const data = windowContext.computeHandData(landmarks, label);
        state = vp.processHandData(data, frame * 33, landmarks);
      }
      assert.equal(state.pinch_engaged, true, `scale=${scale}, mirrored=${mirrored}`);
    }
  }
});

test('phone pinch rejects negative palm facing even near the edge-on boundary', () => {
  const { windowContext } = loadVisionProcessor();
  const landmarks = mirrorHand(makeEdgeOnPinchHand());
  const data = windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT);
  assert.ok(data.facing < 0 && data.facing > -0.15, 'fixture is slightly back-facing');
  assert.equal(data.pinch, false, 'negative facing cannot start a pinch');
  assert.equal(data.pinchSignal, 0, 'negative facing cannot arm the clutch');
});

test('phone pinch only grants the relaxed-index margin with all three supporting fingers', () => {
  const { windowContext } = loadVisionProcessor();
  for (const base of [9, 13, 17]) {
    const landmarks = makeRelaxedPhonePinch();
    const mcp = landmarks[base];
    landmarks[base + 1] = { x: mcp.x + 0.005, y: mcp.y - 0.045, z: 0 };
    landmarks[base + 2] = { x: mcp.x + 0.030, y: mcp.y - 0.040, z: 0 };
    landmarks[base + 3] = { x: mcp.x + 0.025, y: mcp.y - 0.015, z: 0 };
    const data = windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT);
    assert.equal(data.pinch, false, `folded supporting finger at ${base} must not earn extra margin`);
    assert.equal(data.pinchSignal, 0);
  }
});

test('phone pinch rejects a straight index even with known positive palm facing', () => {
  const { windowContext } = loadVisionProcessor();
  const landmarks = straightenPhonePinchIndex(makeRelaxedPhonePinch());
  const data = windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT);
  assert.equal(data.palmPoseOk, true);
  assert.equal(data.otherFingersExtended, true);
  assert.equal(data.pinch, false, 'the relaxed allowance still needs an index curve');
  assert.equal(data.pinchSignal, 0);
});

test('phone pinch cannot engage from one valid frame followed by rejected poses', () => {
  const { VisionProcessor, windowContext } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const landmarks = makeRelaxedPhonePinch();
  const process = () => vp.processHandData(
    windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT),
    undefined, landmarks,
  );
  assert.equal(process().pinch_engaged, false, 'one frame does not establish intent');
  straightenPhonePinchIndex(landmarks);
  for (let frame = 0; frame < 10; frame += 1) {
    assert.equal(process().pinch_engaged, false, `rejected frame ${frame} cannot finish engagement`);
  }
});

test('phone pinch releases when the nearby fingertips separate', () => {
  const { VisionProcessor, windowContext } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const landmarks = makeRelaxedPhonePinch();
  const frame = () => vp.processHandData(
    windowContext.computeHandData(landmarks, HAND_LABEL_FOR_REAL_LEFT),
    undefined, landmarks,
  );
  let state;
  for (let index = 0; index < 6; index += 1) state = frame();
  assert.equal(state.pinch_engaged, true);
  // Opening the thumb creates a gap larger than half a palm.
  landmarks[4] = { x: 0.32, y: 0.38, z: 0 };
  for (let index = 0; index < 25; index += 1) state = frame();
  assert.equal(state.pinch_engaged, false, 'extra contact margin must not leave the clutch latched');
});

test('dist3D computes Euclidean distance between two landmarks', () => {
  const { windowContext } = loadVisionProcessor();
  // 3-4-5 triangle: sqrt(3² + 4² + 0²) = 5
  assert.equal(
    windowContext.dist3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }),
    5
  );
  // 1-2-2: sqrt(1 + 4 + 4) = 3
  assert.equal(
    windowContext.dist3D({ x: 1, y: 2, z: 2 }, { x: 0, y: 0, z: 0 }),
    3
  );
});

test('computeHandData: open hand reports 5 stretched fingers and no fist', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeOpenHand());
  // Every finger stretched beyond 0.65 → open + fingers normalized to 1.0
  // (5 raised / 5). The PC panel multiplies this back by 5 for display.
  assert.equal(data.open, true);
  assert.equal(data.fist, false);
  assert.equal(data.fingers, 1);
  assert.ok(data.thumb > 0.65);
  assert.ok(data.index > 0.65);
  assert.ok(data.middle > 0.65);
  assert.ok(data.ring > 0.65);
  assert.ok(data.pinky > 0.65);
  // Palm center mirrored: (1 - avg(0.4, 0.3, 0.5)) = 0.6
  assert.ok(Math.abs(data.x - 0.6) < 0.01);
  assert.ok(Math.abs(data.y - 0.467) < 0.01);
});

test('computeHandData: a perspective-shortened open thumb still counts as the fifth finger', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makePerspectiveShortenedOpenThumb());

  assert.ok(data.thumb > 0.65, `open thumb must clear the raised gate, got ${data.thumb}`);
  assert.equal(data.fingers, 1, 'all five open fingers must remain present on a phone camera');
  assert.equal(data.open, true);
});

test('computeHandData: fist (tips collapsed to wrist) reports fist=true and fingers=0', () => {
  const { windowContext } = loadVisionProcessor();
  // A real fist curls every finger back onto its own knuckle. The tips do
  // not travel to the wrist, which is what the old fixture asserted and what
  // made a closed hand read as four raised fingers.
  const lms = makeHand(['thumb', 'index', 'middle', 'ring', 'pinky']);
  const data = windowContext.computeHandData(lms);
  assert.equal(data.fist, true);
  assert.equal(data.open, false);
  // fingers stays 0 in normalized space (0 raised / 5)
  assert.equal(data.fingers, 0);
  assert.ok(data.index < 0.35);
  assert.ok(data.middle < 0.35);
  assert.ok(data.ring < 0.35);
  assert.ok(data.pinky < 0.35);
});

test('computeHandData: victory gesture (index+middle extended, ring+pinky folded)', () => {
  const { windowContext } = loadVisionProcessor();
  // The V-sign: index and middle out, the other three curled, thumb tucked
  // over the palm rather than stretched outward.
  const lms = makeHand(['thumb', 'ring', 'pinky']);
  const data = windowContext.computeHandData(lms);
  assert.equal(data.victory, true);
  assert.equal(data.fist, false);
  // Two raised fingers → 2/5 = 0.4 in normalized wire format
  assert.equal(data.fingers, 0.4);
  assert.ok(data.index > 0.65);
  assert.ok(data.middle > 0.65);
});

test('computeHandData: pinch (thumb tip near index tip) reports pinch=true and pinchVal≈1', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makePinchHand());
  assert.equal(data.pinch, true);
  assert.ok(data.pinchVal > 0.75, `expected pinchVal > 0.75 (gate threshold), got ${data.pinchVal}`);
  assert.ok(data.pinchVal <= 1, `expected pinchVal ≤ 1, got ${data.pinchVal}`);
});

test('computeHandData: a palm-facing deliberate pinch with supporting fingers extended is accepted', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makePalmFacingPinchHand(), HAND_LABEL_FOR_REAL_LEFT);

  assert.ok(data.middle > 0.65);
  assert.ok(data.ring > 0.65);
  assert.ok(data.pinky > 0.65);
  assert.equal(data.palmPoseOk, true);
  assert.equal(data.indexCurved, true);
  assert.equal(data.otherFingersExtended, true);
  assert.ok(data.pinchVal > 0.75, `deliberate contact must clear the analog gate, got ${data.pinchVal}`);
  assert.ok(data.pinchSignal > 0.75, `valid contact must arm the clutch, got ${data.pinchSignal}`);
  assert.equal(data.pinch, true);
});

test('computeHandData: relaxed supporting fingers still allow a deliberate pinch', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeRelaxedPinchHand(), HAND_LABEL_FOR_REAL_LEFT);

  assert.ok(data.middle > 0.45 && data.middle < 0.65, `middle should be relaxed, got ${data.middle}`);
  assert.ok(data.ring > 0.45 && data.ring < 0.65, `ring should be relaxed, got ${data.ring}`);
  assert.ok(data.pinchVal > 0.75, `relaxed contact must clear the analog gate, got ${data.pinchVal}`);
  assert.equal(data.pinch, true);
});

test('computeHandData: edge-on pinching remains accepted near zero facing', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeEdgeOnPinchHand(), HAND_LABEL_FOR_REAL_LEFT);

  assert.ok(Math.abs(data.facing) < 0.10, `edge-on facing should be near zero, got ${data.facing}`);
  assert.ok(data.pinchVal > 0.75, `edge-on contact must clear the analog gate, got ${data.pinchVal}`);
  assert.equal(data.pinch, true);
});

test('computeHandData: contact analog survives a rejected pose while gated signal stays off', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(
    mirrorHand(makePalmFacingPinchHand()),
    HAND_LABEL_FOR_REAL_LEFT,
  );

  assert.equal(data.palmPoseOk, false);
  assert.ok(data.pinchVal > 0.75, `contact readout must remain analog, got ${data.pinchVal}`);
  assert.equal(data.pinchSignal, 0, 'invalid pose must not arm the clutch');
  assert.equal(data.pinch, false);
});

test('computeHandData: a deep index curl retains its pinch without the relaxed-pose allowance', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeCurledSupportPinchHand(), HAND_LABEL_FOR_REAL_LEFT);

  assert.equal(data.palmPoseOk, true);
  assert.equal(data.indexCurved, true);
  assert.equal(data.otherFingersExtended, false);
  assert.equal(data.fist, false);
  assert.ok(data.pinchVal > 0.75);
  assert.ok(data.pinchSignal > 0.75);
  assert.equal(data.pinch, true);
});

test('computeHandData: handedness normalization keeps a mirrored palm-facing pinch positive', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(
    mirrorHand(makePalmFacingPinchHand()),
    HAND_LABEL_FOR_REAL_RIGHT,
  );

  assert.ok(data.facing > 0.15, `mirrored palm must normalize positive, got ${data.facing}`);
  assert.equal(data.pinch, true);
});

test('computeHandData: a decisive back-of-hand pinch is rejected', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(
    mirrorHand(makePalmFacingPinchHand()),
    HAND_LABEL_FOR_REAL_LEFT,
  );

  assert.ok(data.facing < -0.15, `back-of-hand facing must be negative, got ${data.facing}`);
  assert.ok(data.pinchVal > 0.75, 'back-of-hand contact remains visible as analog data');
  assert.equal(data.pinchSignal, 0);
  assert.equal(data.pinch, false);
});

test('computeHandData: a contacting fist is a fist, never a pinch', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeContactingFist());

  assert.equal(data.fist, true);
  assert.equal(data.pinch, false);
  assert.ok(data.pinchVal > 0.75, 'fist contact remains visible as analog data');
  assert.equal(data.pinchSignal, 0, 'fist contact must not arm analog consumers');
  assert.equal(data.fist && data.pinch, false, 'fist and pinch must be mutually exclusive');
});

test('computeHandData: pinch contact ignores relative landmark z noise', () => {
  const { windowContext } = loadVisionProcessor();
  const lms = makePinchHand();
  lms[4].z = -0.15;
  lms[8].z = 0.15;
  const data = windowContext.computeHandData(lms);

  assert.ok(data.pinchVal > 0.75, `2D contact must survive z noise, got ${data.pinchVal}`);
  assert.equal(data.pinch, true);
});

test('computeHandData: a straight index does not pinch however close the tips project', () => {
  const { windowContext } = loadVisionProcessor();
  const curved = makePinchHand();
  const straight = curved.map((point) => ({ ...point }));
  const mcp = straight[5];
  const tip = straight[8];
  straight[6] = { x: mcp.x + (tip.x - mcp.x) / 3, y: mcp.y + (tip.y - mcp.y) / 3, z: 0 };
  straight[7] = { x: mcp.x + ((tip.x - mcp.x) * 2) / 3, y: mcp.y + ((tip.y - mcp.y) * 2) / 3, z: 0 };

  const curvedData = windowContext.computeHandData(curved);
  const straightData = windowContext.computeHandData(straight);
  assert.ok(straightData.pinchVal > 0.75, 'invalid finger shape remains visible as analog data');
  assert.equal(straightData.pinchSignal, 0, 'invalid finger shape must not arm analog consumers');
  assert.equal(curvedData.pinch, true);
  assert.equal(straightData.pinch, false);
});

test('computeHandData: a wide palm is not mistaken for a facing failure', () => {
  const { windowContext } = loadVisionProcessor();
  const lms = makePinchHand();
  lms[17] = { x: 0.7, y: 0.4, z: 0.0 };
  const data = windowContext.computeHandData(lms, HAND_LABEL_FOR_REAL_LEFT);

  assert.ok(data.facing > 0.15, `wide palm should retain positive facing, got ${data.facing}`);
  assert.ok(data.pinchVal > 0.75, 'wide palm contact must reach analog consumers');
  assert.equal(data.pinch, true);
});

test('computeHandData: pinch halfway between closed and open reports pinchVal between 0 and 1', () => {
  const { windowContext } = loadVisionProcessor();
  const lms = makeOpenHand();
  // Halfway pinch: thumb tip 30% of the way from wrist to index tip.
  // dist(4, 8) ≈ 0.21, palmSize = 0.4: this gap is over half a palm.
  lms[4] = { x: 0.4, y: 0.38, z: 0.0 };
  const data = windowContext.computeHandData(lms);
  assert.ok(data.pinchVal >= 0 && data.pinchVal <= 1, `pinchVal out of range: ${data.pinchVal}`);
  // Halfway pinch should NOT trip the gate (pinchVal well below 0.75).
  assert.equal(data.pinch, false);
});

test('computeHandData: open hand has pinchVal near 0 (no pinch)', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeOpenHand());
  // Open hand: thumb and index tips are far apart (palmSize × 1.0+ ratio)
  // → pinchVal collapses well below the 0.75 gate.
  assert.ok(data.pinchVal <= 0.2, `expected pinchVal ≤ 0.2 for open hand, got ${data.pinchVal}`);
  assert.equal(data.pinch, false);
});

// Build a synthetic Victory pose (index + middle extended, thumb/ring/pinky
// folded onto the wrist). The optional `tiltDeg` rotates the palm base —
// the MCP (knuckle) anchors of the index finger (landmark 5) and the
// pinky finger (landmark 17) — around the wrist (landmark 0) so we can
// drive the wrist rotation reading without depending on fingertip
// positions that collapse during Victory.
function makeVictoryHand({ tiltDeg = 0 } = {}) {
  // Victory: index and middle out, thumb, ring and pinky curled onto their
  // own knuckles. They are not parked on the wrist — a finger cannot reach
  // there, and extension is measured from the knuckle.
  const lms = makeHand(['thumb', 'ring', 'pinky']);
  // Rotate the palm base MCP anchors (5 = index MCP, 17 = pinky MCP)
  // around the wrist to simulate wrist pronation/supination. This is the
  // anchor pair the rotateVal calculation reads from, so moving them is
  // what actually exercises the math.
  const wrist = lms[0];
  const arm = 0.4;
  // Horizontal baseline: index MCP on the left, pinky MCP on the right.
  const baseIndexDeg = -160;
  const basePinkyDeg = -20;
  const indexDeg = baseIndexDeg + tiltDeg;
  const pinkyDeg = basePinkyDeg + tiltDeg;
  const toRad = (deg) => (deg * Math.PI) / 180;
  // Moving a knuckle carries its finger with it. Extension is measured from
  // the knuckle, so relocating one without its phalanges would describe a
  // finger stretched or crushed by the wrist turning, which is not a thing.
  const carry = (mcp, chain, nx, ny) => {
    const dx = nx - lms[mcp].x;
    const dy = ny - lms[mcp].y;
    for (const i of chain) lms[i] = { x: lms[i].x + dx, y: lms[i].y + dy, z: 0.0 };
    lms[mcp] = { x: nx, y: ny, z: 0.0 };
  };
  carry(5, [6, 7, 8],
    wrist.x + Math.cos(toRad(indexDeg)) * arm,
    wrist.y + Math.sin(toRad(indexDeg)) * arm);
  carry(17, [18, 19, 20],
    wrist.x + Math.cos(toRad(pinkyDeg)) * arm,
    wrist.y + Math.sin(toRad(pinkyDeg)) * arm);
  return lms;
}

test('computeHandData: victory pose reports victory=true and rotateVal≈0.5 when the palm is horizontal', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeVictoryHand());
  assert.equal(data.victory, true);
  assert.equal(data.fist, false);
  assert.equal(data.open, false);
  // Horizontal palm: index MCP and pinky MCP share the same y → atan2(0, dx) = 0
  // → normalized value lands on the neutral 0.5 mark.
  assert.ok(Math.abs(data.rotateVal - 0.5) < 0.05, `expected rotateVal≈0.5, got ${data.rotateVal}`);
  assert.ok(data.rotateVal >= 0 && data.rotateVal <= 1, `rotateVal out of range: ${data.rotateVal}`);
});

test('computeHandData: rotateVal is computed unconditionally from the palm MCP anchors', () => {
  const { windowContext } = loadVisionProcessor();
  // rotateVal no longer depends on a "rotate gate" — the MCP-based angle
  // is computed for every frame so the app.js pipeline can latch onto it
  // the moment the Victory pose fires.
  const open = windowContext.computeHandData(makeOpenHand());
  assert.equal(typeof open.rotateVal, 'number');
  assert.ok(open.rotateVal >= 0 && open.rotateVal <= 1);
  const fist = windowContext.computeHandData(
    makeHand(['thumb', 'index', 'middle', 'ring', 'pinky']));
  assert.ok(fist.rotateVal >= 0 && fist.rotateVal <= 1);
});

test('computeHandData: victory tilted -45° (pinky MCP down) shifts rotateVal above neutral', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeVictoryHand({ tiltDeg: -45 }));
  assert.equal(data.victory, true);
  assert.ok(Math.abs(data.rotateVal - 0.5) > 0.05, `expected rotateVal tilted away from 0.5, got ${data.rotateVal}`);
});

test('computeHandData: victory tilted +45° (pinky MCP up) shifts rotateVal to the opposite side of neutral', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeVictoryHand({ tiltDeg: 45 }));
  assert.equal(data.victory, true);
  assert.ok(Math.abs(data.rotateVal - 0.5) > 0.05, `expected rotateVal tilted away from 0.5, got ${data.rotateVal}`);
});

test('processMissing: returns null and resets gesture recognition so the panel returns to neutral when the hand drops', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  vp.setGestureOptions({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 0, releaseMs: 0 });
  vp.beginGestureTest('Gesture 1');
  vp.processHandData({ victory: true, rotateVal: 0.9 }, 0);
  // No tracker → no inertial prediction: the wire stays silent. The
  // gesture library still gets the null tick so it can clear its
  // candidate / active state.
  assert.equal(vp.processMissing(100), null);
  assert.equal(vp.processMissing(300), null);
});

test('processResults: delivers a single hand reading', async () => {
  const { VisionProcessor, HandsMock } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const mockVideo = {};
  const mockCanvas = {
    width: 320, height: 240,
    getContext: () => ({
      save: () => {}, restore: () => {}, clearRect: () => {}, drawImage: () => {},
      beginPath: () => {}, arc: () => {}, moveTo: () => {}, lineTo: () => {},
      stroke: () => {}, fill: () => {},
    })
  };
  let handData = null;
  vp.onHandUpdate = (data) => { handData = data; };
  await vp.start(mockVideo, mockCanvas);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }]
  });

  assert.ok(handData, "expected hand reading");
  assert.equal(handData.active, true);
  assert.equal(handData.open, true);

  vp.stop();
});

test('processResults: threads handedness into the raw facing gate', async () => {
  const { VisionProcessor, HandsMock } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const mockCanvas = {
    width: 320, height: 240,
    getContext: () => ({
      save: () => {}, restore: () => {}, clearRect: () => {}, drawImage: () => {},
      beginPath: () => {}, arc: () => {}, moveTo: () => {}, lineTo: () => {},
      stroke: () => {}, fill: () => {},
    })
  };
  let handData = null;
  vp.onHandUpdate = (data) => { handData = data; };
  await vp.start({}, mockCanvas);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makePalmFacingPinchHand()],
    multiHandedness: [HAND_LABEL_FOR_REAL_LEFT],
  });
  assert.ok(handData?.facing > 0.15, `left-labelled palm should face positive, got ${handData?.facing}`);
  assert.equal(handData?.pinch, true);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [mirrorHand(makePalmFacingPinchHand())],
    multiHandedness: [HAND_LABEL_FOR_REAL_LEFT],
  });
  assert.ok(handData?.facing < -0.15, `same label with back-facing geometry should be negative, got ${handData?.facing}`);
  assert.equal(handData?.pinch, false);
  assert.ok(handData?.pinchVal > 0.75);
  assert.equal(handData?.pinchSignal, 0);

  vp.stop();
});

test('processResults: empty multiHandLandmarks emits null (no active hands)', async () => {
  const { VisionProcessor, HandsMock } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const mockVideo = {};
  const mockCanvas = {
    width: 320, height: 240,
    getContext: () => ({
      save: () => {}, restore: () => {}, clearRect: () => {}, drawImage: () => {},
      beginPath: () => {}, arc: () => {}, moveTo: () => {}, lineTo: () => {},
      stroke: () => {}, fill: () => {},
    })
  };
  let handData = { sentinel: true };
  vp.onHandUpdate = (data) => { handData = data; };
  await vp.start(mockVideo, mockCanvas);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [],
    multiHandedness: []
  });

  assert.equal(handData, null);
  vp.stop();
});

test('processResults: hand detection is delivered even when canvas rendering is unavailable', async () => {
  const { VisionProcessor, HandsMock } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const mockVideo = {};
  const mockCanvas = {
    width: 320,
    height: 240,
    getContext: () => null,
  };
  let handData = null;
  vp.onHandUpdate = (data) => { handData = data; };
  await vp.start(mockVideo, mockCanvas);

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });

  assert.equal(handData?.active, true);
  assert.equal(handData?.open, true);
  vp.stop();
});

test('VisionProcessor: ambient color sampling is throttled without throttling hand frames', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  let colorUpdates = 0;
  let handUpdates = 0;
  vp.active = true;
  vp.canvas = { width: 320, height: 240 };
  vp.ctx = {
    save: () => {}, restore: () => {}, clearRect: () => {}, drawImage: () => {},
  };
  vp.calculateAverageColor = () => ({ r: 0.1, g: 0.2, b: 0.3 });
  vp.onColorUpdate = () => { colorUpdates += 1; };
  vp.onHandUpdate = () => { handUpdates += 1; };
  const results = { image: {}, multiHandLandmarks: [] };

  vp.processResults(results, 0);
  vp.processResults(results, 40);
  vp.processResults(results, 80);
  vp.processResults(results, 120);

  assert.equal(handUpdates, 4);
  assert.equal(colorUpdates, 2);
});

test('VisionProcessor: gesture persistence and confidence control are exposed', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  // setGestureOptions still works (gestures are unchanged).
  vp.setGestureOptions({ threshold: 0.12, ambiguityRatio: 1.4, releaseRatio: 1.25, unknownGraceMs: 90 });
  assert.equal(vp.exportSafetyConfig().gestureOptions.threshold, 0.12);
  assert.equal(vp.exportSafetyConfig().gestureOptions.ambiguityRatio, 1.4);
  assert.equal('ambiguityMargin' in vp.exportSafetyConfig().gestureOptions, false);
  assert.equal(vp.exportSafetyConfig().gestureOptions.releaseRatio, 1.25);
  assert.equal(vp.exportSafetyConfig().gestureOptions.unknownGraceMs, 90);
  const restored = new VisionProcessor();
  restored.importSafetyConfig(vp.exportSafetyConfig());
  assert.equal(restored.gestures.releaseRatio, 1.25, 'amplitude hysteresis survives persistence');
  assert.equal(restored.gestures.ambiguityRatio, 1.4, 'relative ambiguity survives persistence');
  assert.equal(restored.gestures.unknownGraceMs, 90, 'missing-hand grace survives persistence');
  // setConfidence reconfigures MediaPipe so the next hands.send uses
  // the new minDetection / minTracking thresholds. We assert against the
  // captured value on the processor itself because the mocked Hands
  // instance is only created once start() is called.
  vp.setConfidence('low');
  assert.equal(vp.confidence, 0.2);
  vp.setConfidence('medium');
  assert.equal(vp.confidence, 0.5);
  vp.setConfidence('high');
  assert.equal(vp.confidence, 0.7);
  // Unknown presets fall back to the medium default so a malformed UI
  // value never breaks the camera.
  vp.setConfidence('garbage');
  assert.equal(vp.confidence, 0.5);
});

test('PinchClutch engages deliberately, freezes on release, and resumes without a jump', () => {
  const { windowContext } = loadVisionProcessor();
  const clutch = new windowContext.PinchClutch();

  for (let frame = 0; frame < 3; frame += 1) {
    assert.equal(clutch.update(true, 0.5, 0.5, 0.5).pinch_engaged, false);
  }
  assert.equal(clutch.update(true, 0.5, 0.5, 0.5).pinch_engaged, true);
  const moved = clutch.update(true, 0.4, 0.5, 0.5);
  assert.ok(moved.pinch_x > 0.5, 'moving while pinched must move the clutch output');

  const firstRelease = clutch.update(false, 0.1, 0.5, 0.5);
  assert.equal(firstRelease.pinch_engaged, true, 'release debounce must absorb one bad gate frame');
  assert.equal(firstRelease.pinch_x, moved.pinch_x, 'the value freezes as soon as the pinch is released');
  let released = firstRelease;
  for (let frame = 1; frame <= 15; frame += 1) released = clutch.update(false, 0.8, 0.5, 0.5);
  assert.equal(released.pinch_engaged, false);
  assert.equal(released.pinch_x, moved.pinch_x);

  const frozen = released.pinch_x;
  for (let frame = 0; frame < 4; frame += 1) released = clutch.update(true, 0.8, 0.5, 0.5);
  assert.equal(released.pinch_engaged, true);
  assert.ok(Math.abs(released.pinch_x - frozen) <= 0.002,
    'a new pinch anchors at the current hand position without a perceptible jump');
  assert.notEqual(clutch.update(true, 0.7, 0.5, 0.5).pinch_x, frozen,
    'movement after re-engaging continues from the frozen value');
});

test('PinchClutch reanchors after a brief release before it resumes movement', () => {
  const { windowContext } = loadVisionProcessor();
  const clutch = new windowContext.PinchClutch();

  for (let frame = 0; frame < 4; frame += 1) clutch.update(true, 0.5, 0.5, 0.5);
  let moved = null;
  for (let frame = 0; frame < 20; frame += 1) moved = clutch.update(true, 0.4, 0.5, 0.5);
  assert.equal(moved.pinch_x, 0.7, 'setup: held pinch movement must reach the expected output');

  let released = null;
  for (let frame = 0; frame < 8; frame += 1) released = clutch.update(false, 0.8, 0.5, 0.5);
  assert.equal(released.pinch_engaged, true, 'brief release must remain inside the dropout debounce');
  assert.equal(released.pinch_x, moved.pinch_x, 'release must freeze the previous output');

  const repinched = clutch.update(true, 0.8, 0.5, 0.5);
  assert.equal(repinched.pinch_x, moved.pinch_x,
    'a quick re-pinch must anchor at the new hand position instead of jumping');
});

test('PinchClutch discards release travel instead of drifting after a quick re-pinch', () => {
  const { windowContext } = loadVisionProcessor();
  for (const releaseFrames of [1, 8]) {
    const clutch = new windowContext.PinchClutch();
    for (let frame = 0; frame < 4; frame += 1) clutch.update(true, 0.5, 0.5, 0.5);
    for (let frame = 0; frame < 20; frame += 1) clutch.update(true, 0.4, 0.6, 0.6);
    for (let frame = 0; frame < releaseFrames; frame += 1) clutch.update(false, 0.8, 0.2, 0.2);
    for (let frame = 0; frame < 20; frame += 1) {
      const held = clutch.update(true, 0.8, 0.2, 0.2);
      for (const axis of ['pinch_x', 'pinch_y', 'pinch_z']) {
        assert.equal(held[axis], 0.7,
          `${axis} must stay held with a stationary hand after ${releaseFrames} release frames, frame ${frame}`);
      }
    }
    const moved = clutch.update(true, 0.7, 0.3, 0.3);
    for (const axis of ['pinch_x', 'pinch_y', 'pinch_z']) {
      assert.ok(moved[axis] > 0.7, `${axis} must respond to new travel after re-pinch`);
    }
  }
});

test('PinchClutch: contacting fist analog never engages the clutch', () => {
  const { windowContext, VisionProcessor } = loadVisionProcessor();
  const fist = windowContext.computeHandData(makeContactingFist());
  const vp = new VisionProcessor();
  let state = vp.processHandData(fist);
  for (let frame = 1; frame < 8; frame += 1) state = vp.processHandData(fist);
  assert.equal(fist.fist, true, 'fixture must remain a fist');
  assert.equal(state.pinch_engaged, false, 'a fist must not arm the analog clutch');
});

test('PinchClutch: losing the hand mid-pinch unlatches the gate, so a half-closed hand cannot re-engage it', () => {
  const { windowContext } = loadVisionProcessor();
  const clutch = new windowContext.PinchClutch();

  // Engage deliberately, then take the hand out of frame and let the release
  // debounce time out. The gate latch is hysteretic: it arms above 0.75 and
  // only unlatches below 0.55, so if the timeout leaves it set, the next hand
  // to appear anywhere in that dead band is already gated on.
  for (let frame = 0; frame < 4; frame += 1) clutch.update(true, 0.5, 0.5, 0.5);
  assert.equal(clutch.snapshot().pinch_engaged, true, 'setup: the clutch must be engaged before the hand is lost');

  let lost = null;
  for (let frame = 0; frame <= 16; frame += 1) lost = clutch.missing();
  assert.equal(lost.pinch_engaged, false, 'the clutch must release once the hand stays gone');

  // 0.65 is the CONTACT STRENGTH, inside the dead band: below the 0.75 engage
  // threshold, above the 0.55 unlatch threshold, so neither branch of the
  // hysteresis touches the latch and whatever missing() left there decides it.
  // A hand returning half-closed is not a pinch.
  let returned = null;
  for (let frame = 0; frame < 6; frame += 1) returned = clutch.update(0.65, 0.5, 0.5, 0.5);
  assert.equal(returned.pinch_engaged, false,
    'a half-closed hand returning after a loss must not re-engage the clutch on its own');
});

test('VisionProcessor: the clutch follows analog pinch contact through its hysteresis band', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const frame = (pinchVal, x) => vp.processHandData({
    pinch: false,
    pinchVal,
    x,
    y: 0.5,
    z: 0.5,
  });

  // The strict pose gate is deliberately false throughout. It may flicker
  // with hand angle, while strong fingertip contact remains continuous.
  for (let index = 0; index < 4; index += 1) frame(0.9, 0.5);
  const movedStrong = frame(0.9, 0.4);
  assert.equal(movedStrong.pinch_engaged, true, 'strong analog contact must arm the clutch');
  assert.ok(movedStrong.pinch_x > 0.5, 'movement while strongly pinched must leave centre');

  const movedMidband = frame(0.65, 0.3);
  assert.equal(movedMidband.pinch_engaged, true);
  assert.ok(movedMidband.pinch_x > movedStrong.pinch_x,
    'once armed, midband contact must keep following movement instead of freezing');
});

test('VisionProcessor: processMissing returns null when no tracker is active (spatial tracking retired)', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  // No tracker means no inertial prediction: the hand simply vanishes.
  // Discrete gesture flags must always be cleared so a stale reading
  // can never linger in the wire payload after the hand drops.
  vp.processHandData({ x: 0.2, y: 0.5, z: 0.5, fist: true, pinch: true, victory: true, open: true }, 0);
  vp.processHandData({ x: 0.4, y: 0.5, z: 0.5, fist: true, pinch: true, victory: true, open: true }, 50);
  assert.equal(vp.processMissing(100), null);
  assert.equal(vp.processMissing(300), null);
});

test('VisionProcessor learns and recognizes only stable static landmark poses', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  vp.setGestureOptions({ threshold: 0.13, minimumConfidence: 0.55, holdMs: 200, releaseMs: 150 });
  const landmarks = [
    [0, 0], [-0.3, 0.1], [-0.45, 0.25], [-0.55, 0.45], [-0.65, 0.7],
    [-0.3, 0.4], [-0.32, 0.7], [-0.34, 0.95], [-0.35, 1.15],
    [0, 0.48], [0, 0.18], [0, 0.2], [0, 0.22],
    [0.28, 0.43], [0.28, 0.17], [0.3, 0.19], [0.31, 0.21],
    [0.5, 0.35], [0.5, 0.14], [0.52, 0.16], [0.54, 0.18],
  ].map(([x, y]) => ({ x, y, z: 0 }));
  const raw = { x: 0.5, y: 0.5, z: 0.4, confidence: 1 };

  for (let take = 0; take < 3; take += 1) {
    vp.beginGestureLearn('Gesture 1');
    for (let frame = 0; frame < 13; frame += 1) {
      vp.processHandData(raw, take * 1000 + frame * 33, landmarks);
    }
    assert.equal(vp.finishGestureLearn(), take + 1);
  }
  assert.equal(vp.gestureKind('Gesture 1'), 'pose');
  assert.equal(vp.gestures.templates.get('Gesture 1')[0].length, 47);

  let recognized = null;
  vp.onGesture = (match) => { recognized = match; };
  vp.processHandData(raw, 4000, landmarks);
  vp.processHandData(raw, 4100, landmarks);
  vp.processHandData(raw, 4210, landmarks);
  assert.equal(recognized?.name, 'Gesture 1');
  vp.processHandData(raw, 4500, landmarks);
  assert.equal(recognized?.name, 'Gesture 1', 'holding the same pose must not emit another trigger');
  assert.equal(vp.removeLastGestureTake('Gesture 1'), 2);
  assert.equal(vp.deleteGesture('Gesture 1'), true);
  assert.equal(vp.gestureSampleCount('Gesture 1'), 0);
});

test('gesture capture waits for a stable preparation window and excludes transition frames', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const raw = { x: 0.5, y: 0.5, z: 0.4, confidence: 1 };
  const open = makeOpenHand();
  const curled = makeHand(['middle', 'ring']);
  let readyCount = 0;
  vp.onGestureLearnReady = () => { readyCount += 1; };
  vp.beginGestureLearn('Gesture 1');

  for (let frame = 0; frame < 10; frame += 1) {
    vp.processHandData(raw, frame * 33, frame % 2 ? open : curled);
  }
  assert.equal(readyCount, 0, 'moving into the pose must not start the 900 ms capture');
  for (let frame = 0; frame < 5; frame += 1) {
    vp.processHandData(raw, 400 + frame * 33, curled);
  }
  assert.equal(readyCount, 1, 'five stable frames arm the real capture window');
  assert.equal(vp.gestureLearnFrames.length, 0,
    'preparation frames are discarded instead of becoming learned examples');

  for (let frame = 0; frame < 8; frame += 1) {
    vp.processHandData(raw, 600 + frame * 33, curled);
  }
  assert.equal(vp.finishGestureLearn(), 1);
});

// ── Root cause R4 ───────────────────────────────────────────────────────────
// Field report: "the camera opens and shows video, but MediaPipe never detects
// the hand". The UI had no way to distinguish a dead pipeline from a live one
// that simply has no hand in frame, and hands.send() rejections were swallowed
// by a console.warn inside the frame loop.

function startedProcessor() {
  const loaded = loadVisionProcessor();
  const vp = new loaded.VisionProcessor();
  const canvas = { width: 320, height: 240, getContext: () => null };
  return { ...loaded, vp, start: () => vp.start({}, canvas) };
}

test('vision: reports waiting-for-hand once MediaPipe is loaded but no hand is in frame', async () => {
  const env = startedProcessor();
  await env.start();
  assert.equal(env.vp.visionStatus.cameraActive, true);
  assert.equal(env.vp.visionStatus.mediapipeLoaded, true);
  assert.equal(env.vp.visionStatus.stage, 'waiting-hand');
});

test('vision: reports hand-detected after landmarks arrive, and back to waiting when they stop', async () => {
  const env = startedProcessor();
  await env.start();

  env.HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });
  assert.equal(env.vp.visionStatus.stage, 'hand-detected');
  assert.ok(env.vp.visionStatus.resultsReceived >= 1);

  env.HandsMock.instance.resultsCallback({ image: {}, multiHandLandmarks: [] });
  assert.equal(env.vp.visionStatus.stage, 'waiting-hand');
});

test('vision: a hands.send() rejection is surfaced as an inference error, not swallowed', async () => {
  const env = startedProcessor();
  await env.start();

  env.HandsMock.instance.send = () => Promise.reject(new Error('wasm module failed to load'));
  await env.CameraMock.instance.config.onFrame();

  assert.equal(
    env.vp.visionStatus.stage,
    'error',
    'a failing inference must be visible in the UI state',
  );
  assert.match(env.vp.visionStatus.lastError, /wasm module failed to load/);
});

test('vision: status changes are published so the UI can render them', async () => {
  const env = startedProcessor();
  const seen = [];
  env.vp.onVisionStatus = (s) => seen.push(s.stage);
  await env.start();

  env.HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });

  assert.ok(seen.includes('waiting-hand'), `stages seen: ${seen.join(',')}`);
  assert.ok(seen.includes('hand-detected'), `stages seen: ${seen.join(',')}`);
});

test('vision: steady frame counters update without repainting an unchanged camera stage', () => {
  const { VisionProcessor, windowContext } = loadVisionProcessor();
  let now = 0;
  windowContext.performance = { now: () => now };
  const vp = new VisionProcessor();
  const seen = [];
  vp.onVisionStatus = (status) => seen.push({ ...status });

  vp.setVisionStatus({ stage: 'waiting-hand' });
  now = 20;
  vp.setVisionStatus({ framesSent: 1 });
  now = 50;
  vp.setVisionStatus({ resultsReceived: 1 });

  assert.equal(vp.visionStatus.framesSent, 1, 'frame accounting remains exact');
  assert.equal(vp.visionStatus.resultsReceived, 1, 'result accounting remains exact');
  assert.equal(seen.length, 1, 'byte-equivalent steady camera text must not repaint per frame');

  now = 100;
  vp.setVisionStatus({ framesSent: 2 });
  assert.equal(seen.length, 2, 'steady diagnostics remain observable at 10 Hz');

  now = 101;
  vp.setVisionStatus({ stage: 'error', lastError: 'first inference failure' });
  assert.equal(seen.length, 3, 'an error transition must publish immediately');
  now = 102;
  vp.setVisionStatus({ lastError: 'more specific failure' });
  assert.equal(seen.length, 4, 'new error detail must publish immediately even within the error stage');
  assert.equal(seen.at(-1).lastError, 'more specific failure');
});

test('vision: frames sent to MediaPipe are counted so a dead pipeline is distinguishable', async () => {
  const env = startedProcessor();
  await env.start();
  assert.equal(env.vp.visionStatus.framesSent, 0);
  await env.CameraMock.instance.config.onFrame();
  assert.equal(env.vp.visionStatus.framesSent, 1);
});

test('VisionProcessor integration: camera stage reports waiting-for-hand, then hand detected', async () => {
  const { mockElements, HandsMock } = loadVisionAndApp();
  const chk = mockElements['chk-vision-enable'];

  chk.checked = true;
  await chk.onchange();

  // The old copy claimed "MediaPipe is receiving frames" the instant start()
  // resolved, which is exactly what made a dead pipeline indistinguishable
  // from a live one with no hand in view.
  assert.match(
    mockElements['vision-camera-state-detail'].textContent,
    /waiting for hand/i,
    `got: ${mockElements['vision-camera-state-detail'].textContent}`,
  );

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });
  assert.match(
    mockElements['vision-camera-state-detail'].textContent,
    /hand detected/i,
    `got: ${mockElements['vision-camera-state-detail'].textContent}`,
  );

  HandsMock.instance.resultsCallback({ image: {}, multiHandLandmarks: [] });
  assert.match(mockElements['vision-camera-state-detail'].textContent, /waiting for hand/i);
});

test('VisionProcessor integration: an inference failure is shown on the camera stage', async () => {
  const { mockElements, HandsMock, CameraMock } = loadVisionAndApp();
  const chk = mockElements['chk-vision-enable'];

  chk.checked = true;
  await chk.onchange();

  HandsMock.instance.send = () => Promise.reject(new Error('wasm module failed to load'));
  await CameraMock.instance.config.onFrame();

  assert.equal(mockElements['.vision-camera-stage'].className, 'camera-error');
  assert.match(
    mockElements['vision-camera-state-detail'].textContent,
    /wasm module failed to load/,
    `got: ${mockElements['vision-camera-state-detail'].textContent}`,
  );
});

// Same defect class as markHandLost(): whenever the client has no reading, it
// must SAY so and let each target's Safe loss policy decide, instead of
// inventing a number the server then applies literally.
test('VisionProcessor integration: camera stop emits the complete pre-armed loss catalog', async () => {
  const { windowContext, mockElements } = loadVisionAndApp();
  const chk = mockElements['chk-vision-enable'];
  const prearmedLossNames = Array.from(windowContext.__abletonRc.state.controls)
    .filter((ctrl) => ctrl.name?.startsWith('sensor.vision.') && ctrl.lost === true)
    .map((ctrl) => ctrl.name)
    .sort();

  chk.checked = true;
  await chk.onchange();

  const seen = [];
  const real = windowContext.onControl;
  windowContext.onControl = (ctrl) => { seen.push(ctrl); if (real) real(ctrl); };

  chk.checked = false;
  await chk.onchange();

  const stoppedLossNames = seen
    .filter((ctrl) => ctrl.name?.startsWith('sensor.vision.') && ctrl.lost === true)
    .map((ctrl) => ctrl.name)
    .sort();
  assert.deepEqual(
    stoppedLossNames,
    prearmedLossNames,
    'camera stop and pre-arm must consume one loss catalog; duplicated lists drifted before',
  );

  for (const name of prearmedLossNames) {
    const emitted = seen.find((c) => c.name === name);
    assert.ok(emitted, `${name} must still be reported when the camera stops`);
    assert.equal(
      emitted.lost,
      true,
      `${name} must be flagged lost so Safe loss decides; got value ${emitted.value} with no flag`,
    );
  }
});

test('VisionProcessor integration: hand loss emits the complete pre-armed loss catalog', async () => {
  const { windowContext, mockElements, HandsMock } = loadVisionAndApp();
  const prearmedLossNames = Array.from(windowContext.__abletonRc.state.controls)
    .filter((ctrl) => ctrl.name?.startsWith('sensor.vision.') && ctrl.lost === true)
    .map((ctrl) => ctrl.name)
    .sort();
  const chk = mockElements['chk-vision-enable'];
  chk.checked = true;
  await chk.onchange();

  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });
  const seen = [];
  const real = windowContext.onControl;
  windowContext.onControl = (ctrl) => { seen.push(ctrl); if (real) real(ctrl); };

  HandsMock.instance.resultsCallback({ image: {}, multiHandLandmarks: [], multiHandedness: [] });

  const lostNames = seen
    .filter((ctrl) => ctrl.name?.startsWith('sensor.vision.') && ctrl.lost === true)
    .map((ctrl) => ctrl.name)
    .sort();
  assert.deepEqual(
    lostNames,
    prearmedLossNames,
    'hand loss, camera stop, and pre-arm must consume one shared loss catalog',
  );
});

test('VisionProcessor integration: absent-hand cadence keeps enabled detector outputs marked lost', async () => {
  const { windowContext, mockElements, HandsMock } = loadVisionAndApp();
  const victoryButton = mockElements['[data-vision-gesture="victory"]']
    || windowContext.document.querySelector('[data-vision-gesture="victory"]');
  victoryButton.getAttribute = (name) => name === 'aria-pressed' ? 'true' : null;
  const chk = mockElements['chk-vision-enable'];
  chk.checked = true;
  await chk.onchange();
  HandsMock.instance.resultsCallback({
    image: {},
    multiHandLandmarks: [makeOpenHand()],
    multiHandedness: [{ label: 'Right' }],
  });
  HandsMock.instance.resultsCallback({ image: {}, multiHandLandmarks: [], multiHandedness: [] });

  const seen = [];
  const real = windowContext.onControl;
  windowContext.onControl = (ctrl) => { seen.push(ctrl); if (real) real(ctrl); };
  windowContext.lastIntervalCallback();

  for (const name of ['sensor.vision.victory', 'sensor.vision.rotateVal']) {
    const emitted = seen.find((ctrl) => ctrl.name === name);
    assert.ok(emitted, `${name} should be published on the absent-hand cadence`);
    assert.equal(emitted.lost, true, `${name} must remain a loss, not a synthetic measurement`);
  }
});

test('computeHandData: a curled finger stops counting as raised', () => {
  const { windowContext } = loadVisionProcessor();
  // The reported symptom: an open hand reads five, folding the thumb still
  // reads five, dropping the index reads four when three are up. Extension
  // used to be measured tip-to-WRIST, and a curled fingertip arcs over the
  // palm without ever getting much closer to the wrist, so the ratio barely
  // moved. Measured on a curling hand, a closed fist reported FOUR raised
  // fingers with the pinky reading 1.000 while fully folded.
  const raised = (folded) => Math.round(
    windowContext.computeHandData(makeHand(folded)).fingers * 5);

  assert.equal(raised([]), 5, 'an open hand is five');
  assert.equal(raised(['thumb']), 4, 'folding the thumb drops it to four');
  assert.equal(raised(['thumb', 'index']), 3, 'and the index to three');
  assert.equal(raised(['thumb', 'index', 'middle', 'ring', 'pinky']), 0,
    'a closed fist raises nothing — this reported four before');
  assert.equal(raised(['middle', 'ring']), 3,
    'the rock is three: thumb, index and pinky — this reported five before');
  assert.equal(raised(['thumb', 'ring', 'pinky']), 2, 'the V-sign is two');

  // The pinky was the worst of them: fully curled it read as fully extended.
  const fist = windowContext.computeHandData(
    makeHand(['thumb', 'index', 'middle', 'ring', 'pinky']));
  assert.ok(fist.pinky < 0.35, `a curled pinky must read low, got ${fist.pinky}`);
  assert.ok(fist.ring < 0.35, `a curled ring must read low, got ${fist.ring}`);
});

test('computeHandData: the depth window is named, and the number it is cut from is published', () => {
  const { windowContext } = loadVisionProcessor();
  const data = windowContext.computeHandData(makeHandAtPalmSize(0.21));

  // palmSize is what the Z window is defined against. It was not exposed
  // anywhere, so nobody could check whether the measured 0.12..0.30 window
  // matched the phone's optics — Z could sit pinned near zero for its whole
  // life and look like a dead channel rather than a mis-cut one.
  assert.equal(typeof data.palmSize, 'number');
  assert.equal(data.palmSize, 0.21, 'the fixture must sit midway through the measured travel');

  // And Z must still be the window applied to exactly that number.
  const FAR = 0.12;
  const NEAR = 0.30;
  const expected = Math.min(1, Math.max(0, (data.palmSize - FAR) / (NEAR - FAR)));
  assert.ok(Math.abs(data.z - expected) < 0.002,
    `z (${data.z}) must be the window applied to palmSize (${data.palmSize})`);
});

test('computeHandData: measured phone calibration clears the index gate and spans Z', () => {
  const { windowContext } = loadVisionProcessor();
  const indexHand = makeOpenHand();
  const palmSize = 0.4;
  const indexMcp = indexHand[5];
  indexHand[8] = {
    x: indexMcp.x,
    y: indexMcp.y - 0.78 * palmSize,
    z: indexMcp.z,
  };

  const indexData = windowContext.computeHandData(indexHand);
  assert.ok(indexData.index > 0.65,
    `a measured 0.78 index ratio must clear the raised gate, got ${indexData.index}`);

  const farData = windowContext.computeHandData(makeHandAtPalmSize(0.12));
  const nearData = windowContext.computeHandData(makeHandAtPalmSize(0.30));
  assert.equal(farData.palmSize, 0.12);
  assert.equal(farData.z, 0, 'the measured far position must reach the bottom of Z');
  assert.equal(nearData.palmSize, 0.30);
  assert.equal(nearData.z, 1, 'the measured near position must reach the top of Z');
});

// A histerese do clutch, de 0.75 para engatar e 0.55 para soltar, e boa, mas o
// gate de pose zerava o sinal de uma vez, e zero passa por baixo de 0.55 de
// qualquer jeito. Um unico frame em que `palmPoseOk` piscava soltava o latch, e
// o proprietario sentia isso ao inclinar a mao: "as vezes pega e as vezes nao
// pega", "nao esta sendo muito tolerante". Estes dois testes fixam a tolerancia
// e o seu limite.
test('VisionProcessor: um piscar do gate de pose nao solta o clutch com os dedos encostados', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const frame = (pinchSignal, x) => vp.processHandData({
    pinch: false, pinchVal: 0.9, pinchSignal, x, y: 0.5, z: 0.5,
  });

  for (let index = 0; index < 5; index += 1) frame(0.9, 0.5);
  const engatado = frame(0.9, 0.45);
  assert.equal(engatado.pinch_engaged, true, 'a pose valida precisa engatar o clutch');

  // Tres frames de pose reprovada, com o contato intacto: e a mao inclinando,
  // nao o performer soltando.
  //
  // O que se afirma aqui e o MOVIMENTO, nao o engate. O clutch ja tolera 15
  // frames perdidos sem soltar, entao afirmar `pinch_engaged` passaria com ou
  // sem a tolerancia de pose e nao provaria nada — a primeira versao deste
  // teste fazia exatamente isso e passava com a tolerancia desligada. O que o
  // clutch NAO faz sozinho e continuar seguindo a mao: com o gate falso ele
  // congela no lugar, e e esse congelamento que o proprietario sentia como
  // "as vezes pega e as vezes nao pega".
  const durante = [frame(0, 0.42), frame(0, 0.38), frame(0, 0.34)];
  for (const [indice, estado] of durante.entries()) {
    assert.equal(estado.pinch_engaged, true,
      `o clutch precisa aguentar o frame ${indice + 1} de pose reprovada`);
  }
  assert.ok(durante[2].pinch_x > durante[0].pinch_x,
    'o clutch precisa continuar seguindo a mao durante o piscar da pose, em vez '
    + `de congelar: ${durante[0].pinch_x} -> ${durante[2].pinch_x}`);

  const voltou = frame(0.9, 0.30);
  assert.equal(voltou.pinch_engaged, true, 'a pose voltando mantem o clutch engatado');
});

test('VisionProcessor: pose reprovada por tempo demais solta o clutch mesmo com contato', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const frame = (pinchSignal) => vp.processHandData({
    pinch: false, pinchVal: 0.9, pinchSignal, x: 0.5, y: 0.5, z: 0.5,
  });

  for (let index = 0; index < 5; index += 1) frame(0.9);
  assert.equal(frame(0.9).pinch_engaged, true);

  // O dorso da mao nao e um piscar. A paciencia da pose acaba em 4 frames, e
  // o clutch ainda segura 15 por conta propria, para nao largar em frame
  // perdido. Somados sao cerca de 316 ms a 60 FPS antes de soltar de fato.
  let estado = null;
  for (let index = 0; index < 25; index += 1) estado = frame(0);
  assert.equal(estado.pinch_engaged, false,
    'uma pose de fato errada precisa soltar, senao a rejeicao de dorso nao existe');
});

test('VisionProcessor: stop limpa o sinal guardado da tolerancia de pose', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const frame = (pinchSignal) => vp.processHandData({
    pinch: false, pinchVal: 0.9, pinchSignal, x: 0.5, y: 0.5, z: 0.5,
  });

  for (let index = 0; index < 5; index += 1) frame(0.9);
  assert.equal(frame(0.9).pinch_engaged, true);
  vp.stop();

  let estado = null;
  for (let index = 0; index < 4; index += 1) estado = frame(0);
  assert.equal(estado.pinch_engaged, false,
    'reiniciar a camera nao pode rearmar uma pose invalida com sinal antigo');
});

test('VisionProcessor: ausencia longa limpa o sinal guardado da tolerancia de pose', () => {
  const { VisionProcessor } = loadVisionProcessor();
  const vp = new VisionProcessor();
  const frame = (pinchSignal) => vp.processHandData({
    pinch: false, pinchVal: 0.9, pinchSignal, x: 0.5, y: 0.5, z: 0.5,
  });

  for (let index = 0; index < 5; index += 1) frame(0.9);
  assert.equal(frame(0.9).pinch_engaged, true);
  for (let index = 0; index < 20; index += 1) vp.processMissing();

  let estado = null;
  for (let index = 0; index < 4; index += 1) estado = frame(0);
  assert.equal(estado.pinch_engaged, false,
    'uma mao que volta em pose invalida nao pode reutilizar contato anterior a perda');
});
