// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// audio-processor.test.mjs
//
// Unit and integration tests for the main-thread audio processor.
// Tests cover capture ownership, Worklet delivery, analyser fallback,
// amplitude controls and the descriptor wiring through `app.js`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

function loadAudioProcessor(configure) {
  const file = path.join(import.meta.dirname, 'audio-processor.js');
  const source = fs.readFileSync(file, 'utf8');
  const descriptorsFile = path.join(import.meta.dirname, 'audio-descriptors.js');
  const descriptorsSource = fs.readFileSync(descriptorsFile, 'utf8');
  const controlsFile = path.join(import.meta.dirname, 'audio-analysis-controls.js');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  // Use real timers so requestAnimationFrame in the module behaves
  // like a browser — frame callbacks run via setTimeout(0). Tests
  // that need control over frame timing install their own rAF mock.
  const windowContext = {
    window: null,
    globalThis: {},
    navigator: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }],
        }),
      },
    },
    AudioContext: class {
      constructor(options) {
        this.options = options;
        this.state = 'suspended';
        this.sampleRate = 44100;
      }
      createMediaStreamSource() {
        return { connect: () => {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          frequencyBinCount: 256,
          smoothingTimeConstant: 0.8,
          connect: () => {},
          // Fill with a 440 Hz sine wave so YIN has something periodic to lock onto.
          getFloatTimeDomainData: (buf) => {
            const freq = 440;
            const sr = 44100;
            for (let i = 0; i < buf.length; i++) {
              buf[i] = Math.sin((2 * Math.PI * freq * i) / sr);
            }
          },
          getFloatFrequencyData: (buf) => buf.fill(-60),
        };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
    performance: { now: () => Date.now() },
    requestAnimationFrame: (cb) => setTimeout(cb, 10),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
  windowContext.window = windowContext;
  windowContext.globalThis = windowContext;
  configure?.(windowContext);

  vm.runInNewContext(controlsSource, windowContext, { filename: controlsFile });
  vm.runInNewContext(descriptorsSource, windowContext, { filename: descriptorsFile });
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'audio-spectral-descriptors.js'), 'utf8'), windowContext);
  vm.runInNewContext(source, windowContext, { filename: file });
  return windowContext.AudioProcessor;
}

// ---- DSP unit tests ------------------------------------------------------

test('capture exposes only amplitude and descriptors, with no retired tonal engine', async () => {
  let frame;
  const AudioProcessor = loadAudioProcessor((global) => {
    global.requestAnimationFrame = (callback) => { frame = callback; return 1; };
    global.cancelAnimationFrame = () => {};
  });
  const ap = new AudioProcessor();
  let reading;
  ap.onAnalysisUpdate = (value) => { reading = value; };
  await ap.start();
  frame();
  ap.stop();
  assert.ok(reading.rms > 0);
  for (const field of ['pitch', 'midiNote', 'bpm', 'clarity', 'whistleBend', 'key', 'decision']) {
    assert.equal(Object.hasOwn(reading, field), false, field + ' was retired');
  }
  assert.equal(typeof ap._detectPitchYIN, 'undefined');
});

test('explicit capture device is exact and never silently falls back', async () => {
  const requests = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.console = { error() {} };
    global.navigator.mediaDevices.getUserMedia = async (options) => {
      requests.push(options);
      if (options.audio.deviceId?.exact === 'gone') throw new Error('device missing');
      return { getTracks: () => [{ stop() {} }] };
    };
  });
  const ap = new AudioProcessor();
  await ap.start('loopback');
  assert.equal(requests[0].audio.deviceId?.exact, 'loopback');
  ap.stop();
  await assert.rejects(ap.start('gone'), /device missing/);
  assert.equal(requests.length, 2);
  assert.equal(ap.audioContext, null);
  await ap.start();
  assert.equal(requests[2].audio.deviceId, undefined, 'default keeps browser selection');
  ap.stop();
});

test('ended capture notifies once, stops resources and ignores retired stream events', async () => {
  const tracks = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.navigator.mediaDevices.getUserMedia = async () => {
      const track = new EventTarget();
      track.stop = () => { track.stopped = true; };
      tracks.push(track);
      return { getTracks: () => [track] };
    };
  });
  const ap = new AudioProcessor();
  let ended = 0;
  ap.onCaptureEnded = () => { ended += 1; };
  await ap.start();
  tracks[0].dispatchEvent(new Event('ended'));
  assert.equal(ended, 1);
  assert.equal(ap.audioContext, null);
  assert.equal(tracks[0].stopped, true);
  await ap.start();
  tracks[0].dispatchEvent(new Event('ended'));
  assert.equal(ended, 1);
  assert.ok(ap.audioContext);
  ap.stop();
});

function workletFixture(modulePromise = Promise.resolve()) {
  let context;
  const nodes = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.URL = URL;
    global.location = { href: 'https://localhost/static/phone-v3/' };
    const OriginalContext = global.AudioContext;
    global.AudioContext = class extends OriginalContext {
      constructor(options) {
        super(options); context = this; this.currentTime = 1;
        this.audioWorklet = { addModule: () => modulePromise };
      }
    };
    global.AudioWorkletNode = class {
      constructor() {
        this.messages = [];
        this.port = { postMessage: (data) => this.messages.push(data), close: () => { this.closed = true; } };
        nodes.push(this);
      }
      connect() {}
      disconnect() {}
    };
  });
  return { processor: new AudioProcessor(), nodes, context: () => context };
}

test('AudioProcessor worklet rejects stale and pre-reset frames, resumes with fresh data', async () => {
  const f = workletFixture();
  const received = [];
  f.processor.onDescriptorUpdate = (data) => received.push(data);
  await f.processor.start();
  try {
    const node = f.nodes[0];
    const values = { transient: 1, kick: 0.8, snare: 0, brightness: 0.2,
      centroid: 0.1, flux: 0.2, flatness: 0.3, spread: 0.4, rolloff: 0.5, low: 0.6, mid: 0.7, high: 0.8 };
    const send = (frameTimeMs, epoch = 0) => node.port.onmessage({ data: { values, frameTimeMs, epoch } });
    send(500); assert.equal(received.length, 0);
    send(990); assert.equal(received.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(received[0])), values, 'the worklet consumer must keep every new field');
    f.processor.resetDescriptors();
    send(990); assert.equal(received.length, 1);
    send(990, f.processor.descriptorEpoch); assert.equal(received.length, 2);
    f.context().state = 'suspended';
    send(990, f.processor.descriptorEpoch); assert.equal(received.length, 2);
    f.context().state = 'running';
    node.onprocessorerror();
    assert.equal(f.processor.descriptorMode, 'compatibility');
    assert.equal(node.closed, true);
  } finally { f.processor.stop(); }
});

test('AudioProcessor stop during addModule cannot install an obsolete node', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const f = workletFixture(pending);
  const starting = f.processor.start();
  await new Promise((done) => setImmediate(done));
  f.processor.stop();
  resolve();
  assert.equal(await starting, false);
  assert.equal(f.nodes.length, 0);
  assert.equal(f.processor.audioContext, null);
});

test('AudioProcessor addModule failure retains compatibility analysis', async () => {
  const f = workletFixture(Promise.reject(new Error('module unavailable')));
  try {
    await f.processor.start();
    assert.equal(f.processor.descriptorMode, 'compatibility');
    assert.ok(f.processor.descriptorAnalyser);
  } finally { f.processor.stop(); }
});

test('AudioProcessor: exposes a constructor and an onAnalysisUpdate hook', () => {
  const AudioProcessor = loadAudioProcessor();
  assert.ok(AudioProcessor, 'AudioProcessor should be exposed on window');
  const ap = new AudioProcessor();
  assert.equal(typeof ap.start, 'function');
  assert.equal(typeof ap.stop, 'function');
  assert.equal(ap.onAnalysisUpdate, null);
});

test('AudioProcessor: owns a dedicated zero-smoothing descriptor analyser sized by the window setting', async () => {
  const AudioProcessor = loadAudioProcessor();
  const ap = new AudioProcessor();
  try {
    await ap.start();
    assert.ok(ap.descriptorAnalyser, 'descriptors must not share the slower pitch analyser');
    assert.notEqual(ap.descriptorAnalyser, ap.analyser);
    // Default window x2 at 48 kHz: 1024 samples of analysis, 512 at x1.
    assert.equal(ap.descriptorAnalyser.fftSize, 1024);
    assert.equal(ap.descriptorAnalyser.smoothingTimeConstant, 0);
    assert.equal(ap.descriptorTimeBuffer.length, 1024);
    assert.equal(ap.descriptorFrequencyBuffer.length, ap.descriptorAnalyser.frequencyBinCount);
    ap.setDescriptorSettings({ window: 1 });
    assert.equal(ap.descriptorAnalyser.fftSize, 512, 'a narrower window must resize the analyser');
    assert.equal(ap.descriptorTimeBuffer.length, 512);
    ap.setDescriptorSettings({ window: 4 });
    assert.equal(ap.descriptorAnalyser.fftSize, 2048);
    assert.equal(ap.audioContext.options.latencyHint, 'interactive');
  } finally {
    ap.stop();
  }
});


test('AudioProcessor: publishes descriptors before gate without running retired pitch work', async () => {
  const frames = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    global.cancelAnimationFrame = () => {};
  });
  const ap = new AudioProcessor();
  const events = [];
  ap.onDescriptorUpdate = () => events.push('descriptor');
  ap.gateDetector.update = () => { events.push('gate'); return true; };
  ap._detectPitchYIN = () => { events.push('pitch'); return { pitch: 0, clarity: 0 }; };
  try {
    await ap.start();
    for (let frame = 0; frame < 3; frame += 1) frames.shift()();
    assert.ok(!events.includes('pitch'), 'the retired detector must not run');
    assert.equal(events[0], 'descriptor', 'mapping publication must precede gate work');
    for (let i = 0; i < events.length; i += 1) {
      if (events[i] === 'gate') assert.equal(events[i - 1], 'descriptor');
    }
  } finally {
    ap.stop();
  }
});

test('normal capture quarantines tonal analysers while amplitude and onset attack stay alive', async () => {
  const frames = [];
  let now = 0;
  const AudioProcessor = loadAudioProcessor((global) => {
    global.performance.now = () => now;
    global.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    global.cancelAnimationFrame = () => {};
  });
  const ap = new AudioProcessor();
  const updates = [];
  ap.onAnalysisUpdate = (frame) => updates.push(frame);
  ap._detectPitchYIN = () => assert.fail('retired YIN executed');
  ap._detectOnsets = () => assert.fail('retired BPM estimator executed');
  ap.setAnalysisSettings({ gateThreshold: 0.02, toneWindowMs: 500 });
  assert.equal(ap.tonalStabilizer, undefined);
  assert.equal(ap.bpmStabilizer, undefined);
  assert.equal(ap.noteHold, undefined);
  assert.equal(ap.chromagram, undefined);
  try {
    await ap.start();
    assert.ok(!ap.chromaAnalyser, 'do not allocate the retired 16k analyser');
    // Real onset gate and velocity window; controlled descriptor input represents
    // an unpitched broadband attack already calculated by the worklet.
    ap.descriptorMode = 'worklet';
    for (let i = 0; i < 60; i += 1) {
      ap.lastDescriptorValues.transient = i === 1 ? 1 : 0;
      now += 16;
      frames.shift()();
    }
    assert.equal(updates.length, 60);
    assert.ok(updates.every((v) => v.rms > 0 && v.envelope > 0 && v.gate === 1));
    assert.ok(updates.some((v) => v.attack > 0), 'attack must not depend on a MIDI note');
    assert.ok(updates.every((v) => !('pitch' in v) && !('midiNote' in v) && !('bpm' in v) && !('key' in v)));
  } finally { ap.stop(); }
  assert.equal(ap.envelope, 0, 'a restart must not inherit the previous envelope');
  assert.equal(ap.lastRms, 0);
});

test('compatibility analyser publishes spectral fields and resets their history', async () => {
  const frames = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    global.cancelAnimationFrame = () => {};
  });
  const ap = new AudioProcessor();
  let frame;
  ap.onDescriptorUpdate = (value) => { frame = value; };
  try {
    await ap.start();
    frames.shift()();
    assert.equal(Object.keys(frame).length, 12);
    assert.ok(frame.centroid > 0 && frame.mid > 0);
    assert.ok(Math.abs(frame.flatness - 1) < 1e-6);
    ap.resetDescriptors();
    assert.ok(Object.values(ap.lastDescriptorValues).every((v) => v === 0));
  } finally { ap.stop(); }
});

test('AudioProcessor: suspended or muted capture cannot publish frozen analyser frames', async () => {
  const AudioProcessor = loadAudioProcessor();
  const ap = new AudioProcessor();
  let frames = 0;
  ap.onDescriptorUpdate = () => { frames += 1; };
  try {
    await ap.start();
    const initial = frames;
    ap.audioContext.state = 'suspended';
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(frames, initial, 'suspended capture must let the loss watchdog expire');
    ap.audioContext.state = 'running';
    const track = { muted: true, stop() {} };
    ap.stream.getTracks = () => [track];
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(frames, initial, 'a muted input has no fresh samples either');
    track.muted = false;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(frames > initial, 'unmuted running capture resumes without replacing the session');
  } finally {
    ap.stop();
  }
});

test('phone entry loads audio descriptors before the processor that consumes them', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8');
  const descriptors = html.indexOf('<script src="audio-descriptors.js"></script>');
  const processor = html.indexOf('<script src="audio-processor.js"></script>');
  assert.ok(descriptors >= 0, 'the production phone entry must load the descriptor DSP');
  assert.ok(descriptors < processor, 'descriptor global must exist before AudioProcessor is evaluated');
});

test('AudioProcessor: analysis settings update live without restarting the microphone', () => {
  const AudioProcessor = loadAudioProcessor();
  const ap = new AudioProcessor();
  const settings = ap.setAnalysisSettings({ gateThreshold: 0.04, toneWindowMs: 700, bpmWindow: 8 });
  // The fields under test, not the whole object: this is about a live update
  // reaching the analysers, and every new setting broke it otherwise.
  assert.equal(settings.gateThreshold, 0.04);
  assert.equal(settings.toneWindowMs, undefined);
  assert.equal(settings.bpmWindow, undefined);
  // Untouched fields keep their defaults rather than being dropped.
  assert.equal(settings.clarityFloor, undefined);
  assert.equal(settings.minNoteMs, undefined);
  assert.equal(ap.gateDetector.threshold, 0.04);
  assert.equal(ap.tonalStabilizer, undefined, 'stored tonal settings must not revive retired analysis');
  assert.equal(ap.bpmStabilizer, undefined);
  assert.equal(ap.audioContext, null, 'changing analysis settings must not restart capture');
});

test('AudioProcessor: calculates correct RMS value for audio buffers', () => {
  const AudioProcessor = loadAudioProcessor();
  const ap = new AudioProcessor();

  // Constant signal of 0.5 → RMS should be exactly 0.5.
  const buf = new Float32Array(100);
  buf.fill(0.5);
  const rms = ap._calculateRMS(buf);
  assert.ok(Math.abs(rms - 0.5) < 0.001, `expected 0.5, got ${rms}`);

  // Zero signal → RMS = 0.
  const silent = new Float32Array(64);
  assert.equal(ap._calculateRMS(silent), 0);
});


test('AudioProcessor: envelope follower attacks fast and releases slow', () => {
  const AudioProcessor = loadAudioProcessor();
  const ap = new AudioProcessor();

  // Attack (rms > envelope): should converge quickly toward rms.
  ap.envelope = 0.1;
  ap.envelope = ap.envelope * 0.2 + 0.5 * 0.8; // 0.42
  assert.ok(
    Math.abs(ap.envelope - 0.42) < 0.01,
    `attack expected 0.42, got ${ap.envelope}`
  );

  // Release (rms < envelope): should hold closer to the prior value.
  ap.envelope = ap.envelope * 0.85 + 0.1 * 0.15; // 0.372
  assert.ok(
    Math.abs(ap.envelope - 0.372) < 0.01,
    `release expected 0.372, got ${ap.envelope}`
  );
});

// ---- Continuous analysis regression test --------------------------------
//
// This is the regression test for the AudioWorklet bug that took the
// processor down after a couple of audio quanta (the TDZ
// `const sampleRate = sampleRate` bug). The main-thread implementation
// must keep publishing analysis messages for every frame, indefinitely,
// as long as `start()` has been called and `stop()` has not.

test('AudioProcessor: keeps publishing analysis across many frames (regression)', async () => {
  const frames = [];
  const AudioProcessor = loadAudioProcessor((global) => {
    global.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    global.cancelAnimationFrame = () => {};
  });
  const ap = new AudioProcessor();

  // Capture every callback the loop produces.
  const updates = [];
  ap.onAnalysisUpdate = (msg) => updates.push(msg);

  await ap.start();

  // Drive twenty real loop callbacks, not a wall-clock sleep that depends
  // on how many unrelated tests are competing for the CPU.
  for (let frame = 0; frame < 20; frame += 1) {
    assert.ok(frames.length, 'the loop must schedule its next frame');
    frames.shift()();
  }

  assert.ok(updates.length > 3, 'analysis must keep publishing frames');
  assert.ok(
    updates.every((update) => update.gateThreshold === 0.015),
    'every frame publishes the single threshold used to calculate its gate',
  );

  ap.stop();

  assert.ok(
    updates.length >= 10,
    `expected at least 10 frames of analysis, got ${updates.length} ` +
      `(regression: the loop died early)`
  );

  // Every update must carry the full sensor.audio.* payload — the
  // controller contract app.js relies on.
  const last = updates[updates.length - 1];
  for (const key of [
    'rms',
    'envelope',
    'transient',
    'kick',
    'snare',
    'brightness',
    'gate',
  ]) {
    assert.ok(key in last, `analysis update missing field "${key}"`);
  }
});


// ---- App integration ----------------------------------------------------

function loadAudioAndApp() {
  const apFile = path.join(import.meta.dirname, 'audio-processor.js');
  const apSource = fs.readFileSync(apFile, 'utf8');
  const descriptorsFile = path.join(import.meta.dirname, 'audio-descriptors.js');
  const descriptorsSource = fs.readFileSync(descriptorsFile, 'utf8');
  const controlsFile = path.join(import.meta.dirname, 'audio-analysis-controls.js');
  const controlsSource = fs.readFileSync(controlsFile, 'utf8');

  const smoothFile = path.join(import.meta.dirname, 'audio-smoothing.js');
  const smoothSource = fs.readFileSync(smoothFile, 'utf8');

  const appFile = path.join(import.meta.dirname, 'app.js');
  const appSource = fs.readFileSync(appFile, 'utf8');

  const mockElements = {};
  const getMockElement = (id) => {
    if (!mockElements[id]) {
      mockElements[id] = {
        textContent: '',
        style: { width: '0%' },
        checked: false,
        addEventListener: function (evt, cb) {
          this[`on${evt}`] = cb;
        },
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      };
    }
    return mockElements[id];
  };

  const windowListeners = new Map();
  const intervals = [];
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
    },
    navigator: {
      vibrate: () => {},
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }],
        }),
      },
    },
    AudioContext: class {
      constructor() {
        this.state = 'suspended';
        this.sampleRate = 44100;
      }
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          frequencyBinCount: 256,
          smoothingTimeConstant: 0.8,
          connect: () => {},
          disconnect: () => {},
          // Constant 0.1 signal so RMS comes back as 0.1 — nonzero
          // so the bar moves on the very first frame.
          getFloatTimeDomainData: (buf) => {
            buf.fill(0.1);
          },
          getFloatFrequencyData: (buf) => buf.fill(-60),
        };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
    performance: { now: () => Date.now() },
    isSecureContext: true,
    location: {
      protocol: 'https:',
      host: 'localhost:8080',
    },
    requestAnimationFrame: (cb) => setTimeout(cb, 10),
    cancelAnimationFrame: (id) => clearTimeout(id),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    WebSocket: class {
      constructor() {
        this.readyState = 0;
      }
      send() {}
      close() {}
    },
    addEventListener: (event, listener) => {
      const listeners = windowListeners.get(event) || [];
      listeners.push(listener);
      windowListeners.set(event, listeners);
    },
    setInterval: (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; },
    clearInterval: () => {},
    setTimeout: (cb, delay) => {
      cb();
    },
    dispatchEvent: () => {},
    __triggerWindowEvent: (event) => {
      for (const listener of windowListeners.get(event) || []) listener();
    },
    __intervals: intervals,
  };
  windowContext.window = windowContext;
  windowContext.globalThis = windowContext;
  windowContext.RCSurface = {
    initSession(options = {}) { windowContext.__sessionOptions = options; },
    setupWakeLock() {},
    getMappingModeActive: () => false,
    getTelemetryThrottleUntil: () => 0,
    _setStatus() {},
    _connect() {},
  };
  windowContext.isPhoneMappingModeActive = () => false;
  windowContext.setPhoneMappingModeActive = () => {};
  windowContext.throttlePhoneTelemetry = () => {};
  windowContext.getPhoneClientId = () => null;
  windowContext.sendPhoneCommand = () => false;
  windowContext.phoneWs = null;
  windowContext.__audioTimelineEvents = [];
  windowContext.AudioSignalTimeline = class {
    constructor() {
      windowContext.__audioTimelineEvents.push({ type: 'construct' });
    }
    setState(state) {
      windowContext.__audioTimelineEvents.push({ type: 'state', state });
    }
    push(sample) {
      windowContext.__audioTimelineEvents.push({ type: 'push', sample });
    }
    pushMidiEvent(event) {
      windowContext.__audioTimelineEvents.push({ type: 'midi', event });
    }
    setMode(mode) {
      windowContext.__audioTimelineEvents.push({ type: 'mode', mode });
    }
    resetDiagnostics() {
      windowContext.__audioTimelineEvents.push({ type: 'reset' });
    }
    destroy() {}
  };

  vm.runInNewContext(controlsSource, windowContext, { filename: controlsFile });
 vm.runInNewContext(descriptorsSource, windowContext, { filename: descriptorsFile });
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, 'audio-spectral-descriptors.js'), 'utf8'), windowContext);
  vm.runInNewContext(apSource, windowContext, { filename: apFile });

  const OriginalAP = windowContext.AudioProcessor;
  windowContext.AudioProcessor = class extends OriginalAP {
    constructor() {
      super();
      windowContext.__audioProcessorInstance = this;
    }
  };

  // audio-smoothing.js must load before app.js so window.AudioSmoothing
  // is defined when setupAudioUI calls its adaptive smoother.
  vm.runInNewContext(smoothSource, windowContext, { filename: smoothFile });
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/audio-descriptor-catalog.js'), 'utf8'), windowContext);
  vm.runInNewContext(appSource, windowContext, { filename: appFile });

  return { windowContext, mockElements };
}

test('AudioProcessor integration: setupAudioUI initializes checkbox and updates UI/controls', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();

  const chk = mockElements['chk-audio-enable'];
  assert.ok(chk);

  chk.checked = true;
  await chk.onchange();

  assert.ok(
    windowContext.__audioTimelineEvents.some(({ type, state }) => type === 'state' && state === 'waiting'),
    'enabling the microphone arms the timeline while the first frame is pending',
  );

  // Give the rAF loop one tick so the bar updates.
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.notEqual(
    mockElements['bar-audio-rms'].style.width,
    '0%',
    `expected bar-audio-rms to update after enable, got "${mockElements['bar-audio-rms'].style.width}"`
  );
  assert.ok(
    windowContext.__audioTimelineEvents.some(({ type, sample }) => type === 'push' && sample.gateThreshold === 0.015),
    'analysis frames feed the runtime timeline with the real gate threshold',
  );

  chk.checked = false;
  chk.onchange();

  assert.ok(
    windowContext.__audioTimelineEvents.some(({ type, state }) => type === 'state' && state === 'off'),
    'disabling the microphone clears the runtime timeline',
  );

  assert.notEqual(mockElements['bar-audio-rms'].style.width, '0%',
    'disabling audio must hold the last continuous value before release');
});

test('AudioProcessor integration: active timeline keeps signal without dormant decisions', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();
  const ap = windowContext.__audioProcessorInstance;
  const decision = {
    sampled: true, rawClarity: 0.4, clarityFloor: 0.65,
    accepted: false, reason: 'clarity', candidateNote: 69, resultNote: 0,
  };

  try {
    ap.onAnalysisUpdate({
      rms: 0.1, pitch: 0, midiNote: 0, bpm: 0,
      clarity: 0, whistleActive: 0, whistleBend: 0.5,
      envelope: 0.1, attack: 0, transient: 0, gate: 1,
      gateThreshold: 0.015, decision,
    });
    const sample = windowContext.__audioTimelineEvents
      .filter((event) => event.type === 'push').at(-1)?.sample;
    assert.equal(sample.rms, 0.1);
    assert.equal(sample.decision, undefined, 'v1 does not collect dormant diagnostics');
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: dormant MIDI events do not populate the active timeline', () => {
  const { windowContext } = loadAudioAndApp();
  const event = {
    type: 'audio_note_event', event: 'note_on', note: 60, velocity: 96, timestamp: 1000,
  };
  assert.equal(typeof windowContext.__sessionOptions?.onMessage, 'function');
  windowContext.__sessionOptions.onMessage(event);
  const received = windowContext.__audioTimelineEvents
    .find((entry) => entry.type === 'midi');
  assert.equal(received, undefined);
});

test('AudioProcessor integration: old graph buttons have no active event handlers', () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const signal = mockElements['audio-timeline-mode-signal'];
  const decisions = mockElements['audio-timeline-mode-decisions'];
  const reset = mockElements['audio-diagnostic-reset'];
  assert.notEqual(typeof signal?.onclick, 'function');
  assert.notEqual(typeof decisions?.onclick, 'function');
  assert.notEqual(typeof reset?.onclick, 'function');
});


test('AudioProcessor integration: pagehide releases the microphone and resets its toggle', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];

  chk.checked = true;
  chk.onchange();
  const processor = windowContext.__audioProcessorInstance;
  for (let i = 0; i < 20 && !processor.stream; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(processor.stream, 'test setup must acquire a microphone stream');

  windowContext.__triggerWindowEvent('pagehide');

  assert.equal(processor.stream, null, 'pagehide must stop every microphone track');
  assert.equal(chk.checked, false, 'a BFCache restore must not show a stale enabled toggle');
});

test('AudioProcessor: EMA smoothing reduces step changes gradually', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();

  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();

  const ap = windowContext.__audioProcessorInstance;
  assert.ok(ap);

  try {
    const rmsValues = [];
    windowContext.onControl = (ctrl) => {
      if (ctrl.name === 'sensor.audio.rms') {
        rmsValues.push(ctrl.value);
      }
    };

    // Adaptive smoother with raw=1.0: alpha = 0.08 + min(0.5, 1.0*2) = 0.58.
    ap.onAnalysisUpdate({
      rms: 1.0, pitch: 0, midiNote: 0, bpm: 0,
      clarity: 0, whistleActive: 0, whistleBend: 0.5,
      envelope: 1.0, transient: 0, gate: 1,
    });

    assert.ok(rmsValues.length > 0, 'expected onControl to be called with sensor.audio.rms');
    assert.ok(
      Math.abs(rmsValues[0] - 0.58) < 0.01,
      `expected ~0.58 (alpha at raw=1.0), got ${rmsValues[0]}`
    );

    ap.onAnalysisUpdate({
      rms: 1.0, pitch: 0, midiNote: 0, bpm: 0,
      clarity: 0, whistleActive: 0, whistleBend: 0.5,
      envelope: 1.0, transient: 0, gate: 1,
    });

    // 0.58 * 0.42 + 1.0 * 0.58 = 0.824.
    assert.ok(
      Math.abs(rmsValues[1] - 0.824) < 0.01,
      `expected ~0.824, got ${rmsValues[1]}`
    );
  } finally {
    chk.checked = false;
    chk.onchange();
  }
});

test('AudioProcessor integration: the dormant pitch lane is never published', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();
  const ap = windowContext.__audioProcessorInstance;
  const controls = [];
  windowContext.onControl = (control) => controls.push(control);

  try {
    ap.onAnalysisUpdate({
      rms: 0.3, pitch: 440, midiNote: 69, bpm: 120,
      clarity: 0.9, whistleActive: 0, whistleBend: 0.5,
      envelope: 0.2, transient: 0.4, gate: 1,
    });

    for (const retired of ['pitch', 'note', 'bpm', 'clarity', 'whistle.bend']) {
      assert.equal(controls.find((control) => control.name === 'sensor.audio.' + retired), undefined,
        retired + ' is dormant: computed for diagnostics, never offered as a channel');
    }
    assert.ok(controls.some((control) => control.name === 'sensor.audio.rms'), 'the level still ships');
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: publishes settled attack before note', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();
  const ap = windowContext.__audioProcessorInstance;
  const controls = [];
  windowContext.onControl = (control) => controls.push(control.name);

  try {
    ap.onAnalysisUpdate({
      rms: 0.2, pitch: 440, midiNote: 69, bpm: 0,
      clarity: 0.95, whistleActive: 0, whistleBend: 0.5,
      envelope: 0.4, attack: 0.9, transient: 1, gate: 1,
      key: null,
    });

    const attackIndex = controls.indexOf('sensor.audio.attack');
    const envelopeIndex = controls.indexOf('sensor.audio.envelope');
    assert.notEqual(attackIndex, -1, 'the frame must publish its settled attack');
    assert.notEqual(envelopeIndex, -1, 'the frame must publish its envelope');
    assert.ok(
      attackIndex < envelopeIndex,
      'attack must reach the note voice before that frame can latch its velocity',
    );
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: sends one immediate raw twelve-control descriptor batch per frame', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();
  const ap = windowContext.__audioProcessorInstance;
  const sent = [];
  windowContext.WebSocket.OPEN = 1;
  windowContext.phoneWs = { readyState: 1, send: (payload) => sent.push(JSON.parse(payload)) };
  windowContext.getPhoneClientId = () => 'audio-client';

  try {
    ap.onDescriptorUpdate({ transient: 0.91, kick: 0.73, snare: 0.27, brightness: 0.64,
      centroid: .1, flux: .2, flatness: .3, spread: .4, rolloff: .5, low: .6, mid: .7, high: .8 });
    ap.onAnalysisUpdate({
      rms: 0, pitch: 0, midiNote: 0, bpm: 0,
      clarity: 0, whistleActive: 0, whistleBend: 0.5,
      envelope: 0, attack: 0, gate: 0,
      transient: 0.91, kick: 0.73, snare: 0.27, brightness: 0.64,
    });

    const batches = sent.filter((message) => message.type === 'controls');
    assert.equal(batches.length, 1, 'one analysis frame must emit one message, not four');
    assert.equal(batches[0].client_id, 'audio-client');
    assert.deepEqual(batches[0].controls.map(({ name, value, lost }) => ({ name, value, lost })), [
      { name: 'sensor.audio.transient', value: 0.91, lost: false },
      { name: 'sensor.audio.kick', value: 0.73, lost: false },
      { name: 'sensor.audio.snare', value: 0.27, lost: false },
      { name: 'sensor.audio.brightness', value: 0.64, lost: false },
      // Catalogue order: tone (centroid, rolloff) before texture.
      ...[['centroid', .1], ['rolloff', .5], ['flux', .2], ['flatness', .3], ['spread', .4],
        ['low', .6], ['mid', .7], ['high', .8]]
        .map(([field, value]) => ({ name: 'sensor.audio.' + field, value, lost: false })),
    ]);
    for (const control of batches[0].controls) {
      assert.equal(windowContext.currentControlStates[control.name], control.value,
        `${control.name} must remain in snapshot/display fallback state`);
      assert.equal(windowContext.state.sensors.audio_reading[control.name.slice('sensor.audio.'.length)], control.value);
    }
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: congested transport drops obsolete descriptor frames but retains fallback', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  mockElements['chk-audio-enable'].checked = true;
  await mockElements['chk-audio-enable'].onchange();
  const ap = windowContext.__audioProcessorInstance;
  const sent = [];
  const socket = { readyState: 1, bufferedAmount: 1, send: (payload) => sent.push(JSON.parse(payload)) };
  windowContext.WebSocket.OPEN = 1;
  windowContext.phoneWs = socket;
  windowContext.getPhoneClientId = () => 'audio-client';
  try {
    ap.onDescriptorUpdate({ transient: 0.9, kick: 0.8, snare: 0.1, brightness: 0.2 });
    assert.equal(sent.length, 0, 'do not append stale control frames behind a backed-up socket');
    assert.equal(windowContext.currentControlStates['sensor.audio.kick'], 0.8);
    socket.bufferedAmount = 0;
    ap.onDescriptorUpdate({ transient: 0.3, kick: 0.2, snare: 0.1, brightness: 0.7 });
    assert.equal(sent.length, 1, 'recovery sends only the current frame');
    assert.equal(sent[0].controls[1].value, 0.2);
    socket.readyState = 0;
    ap.onDescriptorUpdate({ kick: 0.4 });
    assert.equal(sent.length, 1, 'closed sockets are not written');
    socket.readyState = 1;
    windowContext.getPhoneClientId = () => null;
    ap.onDescriptorUpdate({ kick: 0.5 });
    assert.equal(sent.length, 1, 'pre-hello sockets are not written');
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: snapshot cannot bypass descriptor backpressure', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  mockElements['chk-audio-enable'].checked = true;
  await mockElements['chk-audio-enable'].onchange();
  const ap = windowContext.__audioProcessorInstance;
  const sent = [];
  let now = Date.now();
  windowContext.Date = class extends Date { static now() { return now; } };
  windowContext.WebSocket.OPEN = 1;
  const socket = { readyState: 1, bufferedAmount: 1024, send: (data) => sent.push(JSON.parse(data)) };
  windowContext.phoneWs = socket;
  windowContext.getPhoneClientId = () => 'audio-client';
  try {
    ap.onDescriptorUpdate({ transient: 1, kick: 1, snare: 0, brightness: 0.4 });
    const snapshotTick = windowContext.__intervals.find(({ delay }) => delay === 33).callback;
    now += 34; snapshotTick();
    assert.equal(sent.length, 0, 'congested snapshots must not queue stale attacks');
    socket.bufferedAmount = 0;
    now += 34; snapshotTick();
    assert.equal(sent.at(-1).type, 'snapshot', 'latest fallback resumes normally');
  } finally { ap.stop(); }
});

test('AudioProcessor integration: stale capture resets DSP and immediately releases all descriptors once', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  mockElements['chk-audio-enable'].checked = true;
  await mockElements['chk-audio-enable'].onchange();
  const ap = windowContext.__audioProcessorInstance;
  const sent = [];
  let now = Date.now();
  windowContext.Date = class extends Date { static now() { return now; } };
  windowContext.WebSocket.OPEN = 1;
  windowContext.phoneWs = { readyState: 1, bufferedAmount: 0, send: (payload) => sent.push(JSON.parse(payload)) };
  windowContext.getPhoneClientId = () => 'audio-client';
  let resets = 0;
  ap.descriptorProcessor.reset = () => { resets += 1; };
  try {
    ap.onDescriptorUpdate({ transient: 1, kick: 1, snare: 0, brightness: 0.4 });
    sent.length = 0;
    now += 181;
    const watchdog = windowContext.__intervals.find(({ delay }) => delay === 50);
    assert.ok(watchdog, 'audio loss watchdog is installed');
    watchdog.callback();
    assert.equal(resets, 1, 'a recovered microphone must start with fresh onset state');
    assert.equal(sent.length, 1, 'release must not wait for the next snapshot');
    assert.ok(sent[0].controls.every(({ value, lost }) => value === 0 && lost));
    watchdog.callback();
    assert.equal(sent.length, 1, 'loss must not flood duplicate immediate frames');
    assert.equal(windowContext.state.sensors.audio, 'lost');
    ap.onDescriptorUpdate({ transient: 0, kick: 0, snare: 0, brightness: 0.2 });
    assert.equal(windowContext.state.sensors.audio, 'available', 'a real resumed frame restores capture status');
  } finally {
    ap.stop();
  }
});

test('AudioProcessor integration: stopping audio immediately releases descriptor pulses to zero', async () => {
  const { windowContext, mockElements } = loadAudioAndApp();
  const chk = mockElements['chk-audio-enable'];
  chk.checked = true;
  await chk.onchange();
  const sent = [];
  windowContext.WebSocket.OPEN = 1;
  windowContext.phoneWs = { readyState: 1, send: (payload) => sent.push(JSON.parse(payload)) };
  windowContext.getPhoneClientId = () => 'audio-client';

  chk.checked = false;
  chk.onchange();

  const batch = sent.filter((message) => message.type === 'controls').at(-1);
  assert.ok(batch, 'stop must not wait for the next snapshot');
  assert.deepEqual(batch.controls.map(({ name, value, lost }) => ({ name, value, lost })), [
    { name: 'sensor.audio.transient', value: 0, lost: true },
    { name: 'sensor.audio.kick', value: 0, lost: true },
    { name: 'sensor.audio.snare', value: 0, lost: true },
    { name: 'sensor.audio.brightness', value: 0, lost: true },
    ...['centroid', 'rolloff', 'flux', 'flatness', 'spread', 'low', 'mid', 'high']
      .map((field) => ({ name: 'sensor.audio.' + field, value: 0, lost: true })),
  ]);
  windowContext.__intervals.find(({ delay }) => delay === 50).callback();
  assert.equal(windowContext.state.sensors.audio, 'inactive', 'the release watchdog cannot undo an explicit stop');
  assert.equal(windowContext.__audioTimelineEvents.filter(({ type }) => type === 'state').at(-1).state, 'off');
});

for (const pendingStage of ['capture', 'resume']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`AudioProcessor lifecycle: obsolete ${pendingStage} ${outcome} cannot replace a restarted session`, async () => {
      const { windowContext, mockElements } = loadAudioAndApp();
      let settle;
      const pending = new Promise((resolve, reject) => {
        settle = outcome === 'resolve' ? resolve : reject;
      });
      let staleTrackStops = 0;
      const staleStream = { getTracks: () => [{ stop() { staleTrackStops += 1; } }] };
      let captures = 0;
      windowContext.navigator.mediaDevices.getUserMedia = () => {
        captures += 1;
        if (captures === 1) return pendingStage === 'capture' ? pending : Promise.resolve(staleStream);
        return Promise.resolve({ getTracks: () => [{ stop() {} }] });
      };
      if (pendingStage === 'resume') {
        const AudioContext = windowContext.AudioContext;
        let contexts = 0;
        windowContext.AudioContext = class extends AudioContext {
          constructor(...args) { super(...args); this.number = ++contexts; }
          resume() { return this.number === 1 ? pending : super.resume(); }
        };
      }
      const chk = mockElements['chk-audio-enable'];
      chk.checked = true;
      chk.onchange();
      await new Promise((resolve) => setImmediate(resolve));
      const oldProcessor = windowContext.__audioProcessorInstance;
      chk.checked = false;
      chk.onchange();
      chk.checked = true;
      chk.onchange();
      await new Promise((resolve) => setImmediate(resolve));
      const activeProcessor = windowContext.__audioProcessorInstance;
      try {
        assert.notEqual(activeProcessor, oldProcessor);
        assert.ok(activeProcessor.audioContext, 'replacement capture must actually be running');
        settle(outcome === 'reject' ? new Error('obsolete permission failure') : staleStream);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(chk.checked, true, 'obsolete completion cannot turn the replacement toggle off');
        assert.ok(activeProcessor.audioContext, 'obsolete completion cannot close the replacement context');
        assert.equal(oldProcessor.audioContext, null, 'obsolete capture must remain stopped');
        assert.equal(oldProcessor.stream, null, 'obsolete stream must not become current');
        assert.equal(staleTrackStops, pendingStage === 'capture' && outcome === 'reject' ? 0 : 1,
          'every stream granted to the obsolete request must be stopped once');
      } finally {
        chk.checked = false;
        chk.onchange();
      }
    });
  }
}

test('no browser voice DSP touches the signal before the analyser', () => {
  // Each of these is built for speech on a call, and each destroys something
  // the analyser needs: AGC flattens the dynamics velocity is read from, echo
  // cancellation ducks and gates, and noise suppression rewrites the spectrum
  // a pitch detector reads. A default is not neutral here — it has to be off
  // and stay off.
  const source = fs.readFileSync(
    path.join(import.meta.dirname, 'audio-processor.js'), 'utf8');
  const constraints = source.slice(source.indexOf('getUserMedia({'), source.indexOf('video: false'));
  for (const flag of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) {
    // No regex: a pattern whose escapes get eaten matches nothing and the test
    // passes by finding nothing, which is the failure this file exists to stop.
    assert.ok(constraints.includes(`${flag}: false`),
      `${flag} must be explicitly false, not defaulted`);
  }
});

// ---------------------------------------------------------------------------
// The three gates in the loop, and the order they run in.


// ---------------------------------------------------------------------------
// Phase 4: the key readout must never be able to take the analysis with it.
