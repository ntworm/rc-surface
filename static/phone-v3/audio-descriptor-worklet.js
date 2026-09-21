// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import './audio-descriptors.js';
import './audio-spectral-descriptors.js';
import './audio-descriptor-stream.js';

class AudioDescriptorWorklet extends globalThis.AudioWorkletProcessor {
  constructor(options) {
    super();
    this.settings = options?.processorOptions?.settings;
    this.stream = globalThis.AudioDescriptorStream.create(globalThis.sampleRate, this.settings);
    this.awaitingAck = false;
    this.epoch = 0;
    this.stopped = false;
    this.hadInput = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'settings') {
        // A different window means a different FFT plan: rebuild, keep silent
        // credit rules intact and start the analysis over from real audio.
        const wanted = globalThis.AudioDescriptors.normalizeSettings(data.settings, this.stream.settings);
        if (wanted.window !== this.stream.window) {
          this.stream = globalThis.AudioDescriptorStream.create(globalThis.sampleRate, wanted);
        } else {
          this.stream.setSettings(wanted);
        }
      }
      if (data?.type === 'stop') this.stopped = true;
      if (data?.type === 'reset') {
        this.epoch = data.epoch;
        this.stream.reset();
        this.awaitingAck = false;
      }
      if (data?.type === 'ack' && data.epoch === this.epoch) this.awaitingAck = false;
    };
    this.emit = (values, frameTimeMs) => {
      // At most one pending message. While UI is busy keep analysing, but
      // never enqueue a history of attacks for later replay.
      if (this.awaitingAck) return;
      this.awaitingAck = true;
      this.port.postMessage({ values, frameTimeMs, epoch: this.epoch });
    };
  }

  process(inputs, outputs) {
    for (const channels of outputs) for (const channel of channels) channel.fill(0);
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input?.length) {
      if (this.hadInput) this.stream.reset();
      this.hadInput = false;
      return true;
    }
    this.hadInput = true;
    const endMs = (globalThis.currentFrame + input.length) / globalThis.sampleRate * 1000;
    this.stream.push(input, endMs, this.emit);
    return true;
  }
}
globalThis.registerProcessor('rc-audio-descriptors', AudioDescriptorWorklet);
