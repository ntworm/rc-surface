// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// MediaPipe Hands, run off the page's main thread.
//
// The page transfers one ImageBitmap per camera frame and receives plain
// landmark arrays back. The bundled solution supports dedicated workers on
// its own: without `window` it loads its WASM with importScripts and renders
// into an OffscreenCanvas. Messages:
//
//   in:  { type: 'init', handsUrl, assetBase, options }
//        { type: 'options', options }
//        { type: 'frame', id, bitmap }      (bitmap is transferred)
//        { type: 'close' }
//   out: { type: 'ready' } | { type: 'error', message }
//        { type: 'results', id, multiHandLandmarks, multiHandedness }
//        { type: 'frame-error', id, message }
/* global importScripts */
'use strict';

let hands = null;
let latestResults = null;

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

// The bundled solution's own worker branch importScripts() every file, the
// .tflite model included, and never fetches its graph, so it cannot start.
// Its page branch runs in a worker once `window` exists alongside the three
// DOM pieces it touches: a <script> loader, a <canvas> for WebGL, and a body
// to append scripts to. `ontouchend` mirrors the page so iPadOS picks the same
// inference backend it would on the page.
function createScriptElement(doc) {
  const listeners = { load: [], error: [] };
  const attributes = {};
  return {
    tagName: 'SCRIPT',
    get src() { return attributes.src || ''; },
    set src(value) { attributes.src = String(value); },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return name in attributes ? attributes[name] : null; },
    addEventListener(type, listener) { listeners[type]?.push(listener); },
    removeEventListener() {},
    load() {
      let outcome = 'load';
      doc.currentScript = this;
      try {
        importScripts(this.src);
      } catch (error) {
        outcome = 'error';
        console.error('[RC Surface] Vision worker could not load', this.src, messageOf(error));
      } finally {
        doc.currentScript = null;
      }
      setTimeout(() => {
        for (const listener of listeners[outcome]) listener.call(this, { type: outcome, target: this });
      }, 0);
    },
  };
}

function installPageShim() {
  if (typeof self.window === 'object') return;
  const appendChild = (element) => {
    if (element?.tagName === 'SCRIPT') element.load();
    return element;
  };
  const doc = {
    currentScript: null,
    body: { appendChild },
    head: { appendChild },
    createElement(tag) {
      const name = String(tag).toLowerCase();
      if (name === 'canvas') return new OffscreenCanvas(1, 1);
      if (name === 'script') return createScriptElement(doc);
      throw new Error(`The vision worker cannot create <${name}>`);
    },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
  };
  if ((self.navigator?.maxTouchPoints || 0) > 0) doc.ontouchend = null;
  self.document = doc;
  self.window = self;
}

function plainLandmarks(results) {
  return (results?.multiHandLandmarks || []).map((hand) =>
    Array.from(hand || [], (point) => ({ x: point.x, y: point.y, z: point.z })));
}

function plainHandedness(results) {
  return (results?.multiHandedness || []).map((entry) => ({
    index: entry.index,
    score: entry.score,
    label: entry.label,
  }));
}

async function init({ handsUrl, assetBase, options }) {
  installPageShim();
  importScripts(handsUrl);
  hands = new self.Hands({ locateFile: (file) => new URL(file, assetBase).href });
  hands.setOptions(options || {});
  hands.onResults((results) => {
    latestResults = results;
  });
  await hands.initialize();
}

async function processFrame({ id, bitmap }) {
  latestResults = null;
  try {
    await hands.send({ image: bitmap });
    const results = latestResults;
    latestResults = null;
    results?.image?.close?.();
    self.postMessage({
      type: 'results',
      id,
      multiHandLandmarks: plainLandmarks(results),
      multiHandedness: plainHandedness(results),
    });
  } catch (error) {
    self.postMessage({ type: 'frame-error', id, message: messageOf(error) });
  } finally {
    bitmap?.close?.();
  }
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === 'init') {
    try {
      await init(message);
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: messageOf(error) });
    }
  } else if (message.type === 'options') {
    hands?.setOptions(message.options || {});
  } else if (message.type === 'frame') {
    if (!hands) {
      message.bitmap?.close?.();
      self.postMessage({ type: 'frame-error', id: message.id, message: 'Hand tracking is not ready' });
      return;
    }
    await processFrame(message);
  } else if (message.type === 'close') {
    try { hands?.close(); } catch { /* closing anyway */ }
    hands = null;
    self.close();
  }
};
