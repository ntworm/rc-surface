// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const messages = [];
  let Processor;
  const context = vm.createContext({
    sampleRate: 48000, currentFrame: 0,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => messages.push(data) }; } },
    registerProcessor: (_name, value) => { Processor = value; },
  });
  for (const name of ['audio-descriptors.js', 'audio-spectral-descriptors.js', 'audio-descriptor-stream.js', 'audio-descriptor-worklet.js']) {
    const source = fs.readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;$/gm, '');
    vm.runInContext(source, context);
  }
  const node = new Processor();
  const output = new Float32Array(128).fill(1);
  // One call feeds exactly one analysis hop, whatever window is configured.
  const blocksPerHop = Math.ceil(node.stream.size / 128);
  function frame(value = 0.5) {
    for (let i = 0; i < blocksPerHop; i += 1) {
      node.process([[new Float32Array(128).fill(value)]], [[output]]);
      context.currentFrame += 128;
    }
  }
  return { node, messages, frame, output };
}

test('worklet has one pending message, silent output and no queued replay after ACK', () => {
  const f = fixture();
  f.frame();
  assert.equal(f.messages.length, 1);
  assert.ok(f.output.every((v) => v === 0), 'microphone is never monitored');
  for (let i = 0; i < 40; i += 1) f.frame(0);
  assert.equal(f.messages.length, 1, 'busy UI cannot build a message queue');
  f.node.port.onmessage({ data: { type: 'ack', epoch: 0 } });
  assert.equal(f.messages.length, 1, 'ACK cannot replay an old cached attack');
  f.frame(0);
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[1].values.transient, 0);
  assert.ok(f.messages[1].frameTimeMs > f.messages[0].frameTimeMs + 400);
});

test('worklet reset invalidates old ACK, clears DSP and stop ends processing', () => {
  const f = fixture();
  f.frame();
  f.node.port.onmessage({ data: { type: 'reset', epoch: 1 } });
  f.frame(0);
  assert.equal(f.messages[1].epoch, 1);
  assert.equal(f.messages[1].values.transient, 0);
  f.node.port.onmessage({ data: { type: 'ack', epoch: 0 } });
  f.frame(0);
  assert.equal(f.messages.length, 2, 'old ACK cannot grant new credit');
  f.node.port.onmessage({ data: { type: 'stop' } });
  assert.equal(f.node.process([], []), false);
});
