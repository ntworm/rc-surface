// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Camera frames come from requestVideoFrameCallback, which the browser stops
// delivering while the page is hidden (a camera window behind Live, a
// background tab). Nothing in the vision pipeline handled that: the HUD kept
// saying the camera was live while no frame was analysed. The processor now
// reports a paused stage while the page is hidden and, when the page is
// visible again, re-arms the frame loop and starts from a clean clutch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(path.join(import.meta.dirname, name), 'utf8');

// MediaPipe Hands and camera_utils stand-ins, as in vision-processor.test.mjs.
class HandsMock {
  constructor(config) { HandsMock.instance = this; this.config = config; this.options = {}; }
  setOptions(opts) { this.options = opts; }
  onResults(cb) { this.resultsCallback = cb; }
  send(data) { this.sentData = data; return Promise.resolve(); }
  close() { this.closed = true; }
}

class CameraMock {
  constructor(video, config) { CameraMock.instance = this; this.video = video; this.config = config; }
  start() { this.started = true; return Promise.resolve(); }
  stop() { this.stopped = true; }
}

function documentStub(windowContext, listeners) {
  return {
    hidden: false,
    addEventListener: (type, cb) => { (listeners[type] ||= []).push(cb); },
    removeEventListener: (type, cb) => {
      listeners[type] = (listeners[type] || []).filter((entry) => entry !== cb);
    },
    // Script tags "load" asynchronously and install the stand-ins.
    createElement: () => ({
      onload: null,
      onerror: null,
      set src(val) {
        setTimeout(() => {
          if (val.includes('hands.js')) windowContext.Hands = HandsMock;
          else if (val.includes('camera_utils.js')) windowContext.Camera = CameraMock;
          if (this.onload) this.onload();
        }, 5);
      },
    }),
    head: { appendChild: () => {} },
  };
}

function loadVisionProcessor() {
  const listeners = {};
  const windowContext = { window: null, globalThis: {}, Hands: null, Camera: null };
  windowContext.document = documentStub(windowContext, listeners);
  windowContext.window = windowContext;
  windowContext.globalThis = windowContext;
  vm.runInNewContext(read('safe-input-layer.js'), windowContext, { filename: 'safe-input-layer.js' });
  vm.runInNewContext(read('camera-lifecycle.js'), windowContext, { filename: 'camera-lifecycle.js' });
  vm.runInNewContext(read('vision-processor.js'), windowContext, { filename: 'vision-processor.js' });
  return {
    VisionProcessor: windowContext.VisionProcessor,
    windowContext,
    setHidden(hidden) {
      windowContext.document.hidden = hidden;
      for (const cb of listeners.visibilitychange || []) cb({ type: 'visibilitychange' });
    },
  };
}

function canvasStub() {
  return {
    width: 320,
    height: 240,
    getContext: () => ({
      save() {}, restore() {}, clearRect() {}, drawImage() {}, beginPath() {},
      arc() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    }),
  };
}

async function startedProcessor() {
  const env = loadVisionProcessor();
  const vp = new env.VisionProcessor();
  vp.video = { videoWidth: 320, videoHeight: 240 };
  const stages = [];
  vp.onVisionStatus = (status) => stages.push(status.stage);
  await vp.start({}, canvasStub());
  assert.ok(vp.active, 'the processor started');
  return { ...env, vp, stages };
}

test('a hidden page pauses vision, drops the pending frame and says so', async () => {
  const { vp, stages, setHidden } = await startedProcessor();
  let paused = 0;
  const camera = vp.camera;
  vp.camera = { pauseFrames() { paused += 1; }, scheduleFrame() {}, stop() { camera?.stop?.(); } };
  setHidden(true);
  assert.equal(vp.visionStatus.stage, 'paused-hidden');
  assert.equal(stages.at(-1), 'paused-hidden', 'the HUD hears about the pause');
  assert.equal(paused, 1, 'the pending frame request is cancelled');
  vp.processResults({ multiHandLandmarks: [] });
  assert.equal(vp.visionStatus.stage, 'paused-hidden', 'a late result does not claim the camera is live');
  vp.stop();
});

test('a visible page resumes vision, re-arms the frame loop and starts clean', async () => {
  const { vp, setHidden } = await startedProcessor();
  let armed = 0;
  const camera = vp.camera;
  vp.camera = { pauseFrames() {}, scheduleFrame() { armed += 1; }, stop() { camera?.stop?.(); } };
  setHidden(true);
  let clutchResets = 0;
  const resetClutch = vp.pinchClutch.reset.bind(vp.pinchClutch);
  vp.pinchClutch.reset = () => { clutchResets += 1; resetClutch(); };
  let filterResets = 0;
  for (const filter of Object.values(vp.positionFilters)) {
    const resetFilter = filter.reset.bind(filter);
    filter.reset = () => { filterResets += 1; resetFilter(); };
  }
  setHidden(false);
  assert.equal(vp.visionStatus.stage, 'waiting-hand');
  assert.equal(armed, 1, 'the frame loop asks for a frame again');
  assert.ok(clutchResets >= 1, 'resuming starts from a clean clutch');
  assert.equal(filterResets, 3, 'no axis eases out of a position recorded before the pause');
  vp.stop();
});

test('a stopped processor ignores visibility changes', async () => {
  const { vp, setHidden } = await startedProcessor();
  vp.stop();
  setHidden(true);
  assert.equal(vp.visionStatus.stage, 'idle');
  setHidden(false);
  assert.equal(vp.visionStatus.stage, 'idle');
});

test('the managed camera can drop its pending frame request and ask again', () => {
  const { windowContext } = loadVisionProcessor();
  const requests = [], cancels = [];
  const video = {
    requestVideoFrameCallback: (cb) => { requests.push(cb); return requests.length; },
    cancelVideoFrameCallback: (id) => { cancels.push(id); },
  };
  const session = new windowContext.ManagedCameraSession(video, {});
  session.running = true;
  session.scheduleFrame();
  assert.equal(requests.length, 1);
  session.pauseFrames();
  assert.deepEqual(cancels, [1], 'the pending request is cancelled');
  assert.equal(session.frameRequest, null);
  session.scheduleFrame();
  assert.equal(requests.length, 2, 'a paused session can be re-armed');
});

test('a vision error survives hiding and showing the page', async () => {
  const { vp, setHidden } = await startedProcessor();
  vp.setVisionStatus({ stage: 'error', lastError: 'MediaPipe inference failed.' });
  setHidden(true);
  assert.equal(vp.visionStatus.stage, 'error', 'a broken pipeline is not "paused"');
  setHidden(false);
  assert.equal(vp.visionStatus.stage, 'error', 'coming back must not claim the camera is waiting for a hand');
  vp.stop();
});

test('a page hidden while hand tracking loads comes back to the loading stage', async () => {
  const { vp, setHidden } = await startedProcessor();
  vp.setVisionStatus({ stage: 'camera-ready' });
  setHidden(true);
  assert.equal(vp.visionStatus.stage, 'paused-hidden');
  setHidden(false);
  assert.equal(vp.visionStatus.stage, 'camera-ready', 'the HUD returns to what it was showing');
  vp.stop();
});

test('a page hidden with a hand in view comes back waiting for the hand', async () => {
  const { vp, setHidden } = await startedProcessor();
  vp.setVisionStatus({ stage: 'hand-detected' });
  setHidden(true);
  setHidden(false);
  assert.equal(vp.visionStatus.stage, 'waiting-hand', 'no hand is known after a pause until a frame shows one');
  vp.stop();
});
