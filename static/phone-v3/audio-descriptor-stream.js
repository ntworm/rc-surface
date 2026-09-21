// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';

  class SpectrumWindow {
    constructor(size, hann = false) {
      this.size = size;
      this.write = 0;
      this.filled = 0;
      this.samples = new Float32Array(this.size);
      this.window = new Float64Array(this.size);
      let windowPower = 0;
      for (let i = 0; i < size; i += 1) {
        this.window[i] = hann ? 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size) : 1;
        windowPower += this.window[i] ** 2;
      }
      this.powerCorrection = size / windowPower;
      this.real = new Float64Array(this.size);
      this.imag = new Float64Array(this.size);
      this.db = new Float32Array(this.size / 2);
      this.reverse = new Uint32Array(this.size);
      this.cos = new Float64Array(this.size / 2);
      this.sin = new Float64Array(this.size / 2);
      const bits = Math.log2(this.size);
      for (let i = 0; i < this.size; i += 1) {
        let x = i;
        let y = 0;
        for (let b = 0; b < bits; b += 1) { y = (y << 1) | (x & 1); x >>= 1; }
        this.reverse[i] = y;
      }
      for (let i = 0; i < this.cos.length; i += 1) {
        this.cos[i] = Math.cos(-2 * Math.PI * i / this.size);
        this.sin[i] = Math.sin(-2 * Math.PI * i / this.size);
      }
    }

    reset() { this.write = 0; this.filled = 0; this.samples.fill(0); }
    put(value) {
      this.samples[this.write] = value;
      this.write = (this.write + 1) % this.size;
      this.filled = Math.min(this.size, this.filled + 1);
    }

    spectrum() {
      for (let i = 0; i < this.size; i += 1) {
        this.real[this.reverse[i]] = this.samples[(this.write + i) % this.size] * this.window[i];
        this.imag[i] = 0;
      }
      for (let span = 2; span <= this.size; span *= 2) {
        const half = span / 2;
        const step = this.size / span;
        for (let start = 0; start < this.size; start += span) {
          for (let j = 0; j < half; j += 1) {
            const a = start + j;
            const b = a + half;
            const k = j * step;
            const re = this.cos[k] * this.real[b] - this.sin[k] * this.imag[b];
            const im = this.sin[k] * this.real[b] + this.cos[k] * this.imag[b];
            this.real[b] = this.real[a] - re;
            this.imag[b] = this.imag[a] - im;
            this.real[a] += re;
            this.imag[a] += im;
          }
        }
      }
      for (let i = 0; i < this.db.length; i += 1) {
        const power = (this.real[i] ** 2 + this.imag[i] ** 2) / (this.size ** 2);
        this.db[i] = power > 0 ? 10 * Math.log10(power) : -Infinity;
      }
    }
  }

  class DescriptorStream {
    constructor(rate, settings) {
      this.rate = Number.isFinite(rate) && rate > 0 ? rate : 48000;
      this.size = 256;
      while (this.rate / this.size > 120) this.size *= 2;
      // The window setting multiplies that minimum: wider windows resolve low
      // frequencies a kick needs, at the cost of a later attack report.
      // Default x2: at x1 a 93.75 Hz bin cannot tell a kick from a snare body.
      this.settings = root.AudioDescriptors.normalizeSettings(settings);
      this.size *= this.settings.window;
      this.window = this.settings.window;
      // Short rectangular windows retain edge attacks. Overlapping Hann
      // windows reduce spectral leakage for texture without delaying attacks.
      this.fast = new SpectrumWindow(this.size);
      // Same length, same hop, Hann: band decisions need low leakage, and a
      // loud low tone must not paint an empty high band with its sidelobes.
      this.banded = new SpectrumWindow(this.size, true);
      this.timbre = new SpectrumWindow(this.size * 2, true);
      this.processor = root.AudioDescriptors.createProcessor(this.settings);
      this.spectral = root.AudioSpectralDescriptors.createProcessor();
      this.smoother = root.AudioDescriptors.createSmoother();
      this.lastFrameMs = null;
      this.offset = 0;
    }

    /** Live update for everything except the window, which changes the plan. */
    setSettings(settings) {
      this.settings = root.AudioDescriptors.normalizeSettings(settings, this.settings);
      this.processor.setSettings(this.settings);
      return this.settings;
    }
    reset() {
      this.fast.reset(); this.banded.reset(); this.timbre.reset(); this.processor.reset();
      this.spectral.reset(); this.smoother.reset(); this.lastFrameMs = null; this.offset = 0;
    }
    push(input, endMs, onFrame) {
      let latest = null;
      for (let i = 0; i < input.length; i += 1) {
        const value = Number.isFinite(input[i]) ? input[i] : 0;
        this.fast.put(value); this.banded.put(value); this.timbre.put(value);
        if (++this.offset !== this.size) continue;
        this.offset = 0;
        this.fast.spectrum();
        this.banded.spectrum();
        const frameTimeMs = endMs - (input.length - i - 1) / this.rate * 1000;
        const elapsedMs = this.lastFrameMs === null ? 0 : frameTimeMs - this.lastFrameMs;
        const attack = this.processor.process({ timeDomain: this.fast.samples,
          frequencyDb: this.fast.db, bandDb: this.banded.db,
          fftSize: this.size, sampleRate: this.rate, frameTimeMs });
        let spectral = root.AudioSpectralDescriptors.ZERO;
        if (this.timbre.filled === this.timbre.size) {
          this.timbre.spectrum();
          spectral = this.spectral.process({ frequencyDb: this.timbre.db, sampleRate: this.rate,
            fftSize: this.timbre.size, powerCorrection: this.timbre.powerCorrection,
            elapsedMs });
        }
        this.lastFrameMs = frameTimeMs;
        latest = this.smoother.apply({ ...attack, ...spectral }, elapsedMs, this.settings);
        onFrame?.(latest, frameTimeMs);
      }
      return latest;
    }
  }
  root.AudioDescriptorStream = { create: (rate, settings) => new DescriptorStream(rate, settings) };
})(globalThis);
