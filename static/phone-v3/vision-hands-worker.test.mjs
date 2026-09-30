// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The vision worker runs MediaPipe Hands off the page's main thread. These
// tests run its source in a bare worker-like scope and check the protocol and
// the page shim the bundled solution needs to start there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'vision-hands-worker.js'), 'utf8');

function loadWorker({ failInitialize = false, failSend = false } = {}) {
  const posted = [];
  const imported = [];
  const scope = {
    console: { error: () => {}, warn: () => {}, log: () => {} },
    URL,
    setTimeout,
    navigator: { maxTouchPoints: 5 },
    OffscreenCanvas: class { constructor(width, height) { this.width = width; this.height = height; } },
    postMessage: (message) => posted.push(message),
    close: () => { scope.closed = true; },
  };
  scope.self = scope;
  scope.importScripts = (...urls) => {
    imported.push(...urls);
    for (const url of urls) {
      if (url.endsWith('/hands.js')) scope.Hands = makeHands();
      if (url.endsWith('missing.js')) throw new Error('404');
    }
  };

  function makeHands() {
    return class HandsStub {
      constructor(config) {
        this.config = config;
        HandsStub.instance = this;
      }
      setOptions(options) { this.options = { ...this.options, ...options }; }
      onResults(listener) { this.listener = listener; }
      async initialize() {
        // The page branch of the real solution loads its WASM through a
        // <script> element appended to document.body and draws into a canvas.
        this.sawWindow = typeof scope.window === 'object';
        this.touchDocument = 'ontouchend' in scope.document;
        const canvas = scope.document.createElement('canvas');
        this.canvasIsOffscreen = canvas instanceof scope.OffscreenCanvas;
        await new Promise((resolve) => {
          const script = scope.document.createElement('script');
          script.setAttribute('src', this.config.locateFile('hands_solution_simd_wasm_bin.js'));
          script.addEventListener('load', resolve);
          script.addEventListener('error', resolve);
          scope.document.body.appendChild(script);
        });
        if (failInitialize) throw new Error('no WebGL2 in this worker');
      }
      async send({ image }) {
        this.lastImage = image;
        if (failSend) throw new Error('context lost');
        this.listener({
          image: { close() { this.closed = true; } },
          multiHandLandmarks: [Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: 0.5, z: -0.01, visibility: 1 }))],
          multiHandedness: [{ index: 0, score: 0.97, label: 'Right', extra: 'dropped' }],
        });
      }
      close() { this.closed = true; }
    };
  }

  vm.runInNewContext(source, scope, { filename: 'vision-hands-worker.js' });
  const send = (data) => scope.onmessage({ data });
  return { scope, posted, imported, send };
}

const init = {
  type: 'init',
  handsUrl: 'https://phone.local/static/phone-v3/vendor/mediapipe/hands/hands.js',
  assetBase: 'https://phone.local/static/phone-v3/vendor/mediapipe/hands/',
  options: { maxNumHands: 1, modelComplexity: 0 },
};

test('vision worker: starts MediaPipe through the page branch with a minimal shim', async () => {
  const { scope, posted, imported, send } = loadWorker();
  await send(init);

  assert.deepEqual(posted.map((message) => message.type), ['ready']);
  const hands = scope.Hands.instance;
  assert.equal(hands.sawWindow, true, 'the solution takes its working page branch');
  assert.equal(hands.canvasIsOffscreen, true, 'WebGL gets an OffscreenCanvas');
  assert.equal(hands.touchDocument, true, 'touch devices keep the page inference backend choice');
  assert.deepEqual(imported, [
    init.handsUrl,
    'https://phone.local/static/phone-v3/vendor/mediapipe/hands/hands_solution_simd_wasm_bin.js',
  ], 'assets resolve against the bundled MediaPipe folder');
  assert.deepEqual(hands.options, init.options);
  assert.equal(scope.document.currentScript, null);
});

test('vision worker: returns plain landmarks and releases every bitmap', async () => {
  const { scope, posted, send } = loadWorker();
  await send(init);
  const bitmap = { closed: false, close() { this.closed = true; } };
  await send({ type: 'frame', id: 7, bitmap });

  const result = posted.at(-1);
  assert.equal(result.type, 'results');
  assert.equal(result.id, 7);
  assert.equal(result.multiHandLandmarks[0].length, 21);
  assert.deepEqual(Object.keys(result.multiHandLandmarks[0][20]).sort(), ['x', 'y', 'z']);
  assert.equal(result.multiHandLandmarks[0][20].x, 1);
  assert.deepEqual({ ...result.multiHandedness[0] }, { index: 0, score: 0.97, label: 'Right' });
  assert.equal(scope.Hands.instance.lastImage, bitmap);
  assert.equal(bitmap.closed, true, 'the transferred frame is closed after inference');

  await send({ type: 'options', options: { minDetectionConfidence: 0.7 } });
  assert.equal(scope.Hands.instance.options.minDetectionConfidence, 0.7);

  await send({ type: 'close' });
  assert.equal(scope.Hands.instance.closed, true);
  assert.equal(scope.closed, true);
});

test('vision worker: reports start and frame failures instead of going silent', async () => {
  const failedStart = loadWorker({ failInitialize: true });
  await failedStart.send(init);
  assert.equal(failedStart.posted.at(-1).type, 'error');
  assert.match(failedStart.posted.at(-1).message, /WebGL2/);

  const failedFrame = loadWorker({ failSend: true });
  await failedFrame.send(init);
  const bitmap = { closed: false, close() { this.closed = true; } };
  await failedFrame.send({ type: 'frame', id: 3, bitmap });
  assert.deepEqual({ ...failedFrame.posted.at(-1) }, { type: 'frame-error', id: 3, message: 'context lost' });
  assert.equal(bitmap.closed, true);

  const early = loadWorker();
  const earlyBitmap = { closed: false, close() { this.closed = true; } };
  await early.send({ type: 'frame', id: 1, bitmap: earlyBitmap });
  assert.equal(early.posted.at(-1).type, 'frame-error');
  assert.equal(earlyBitmap.closed, true);
});
