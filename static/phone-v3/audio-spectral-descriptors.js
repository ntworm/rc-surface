// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Spectral descriptors: K-weighted loudness per band (ITU-R BS.1770-4),
// dB-mapped flatness, and the unchanged centroid/spread/rolloff/flux family.
// The K-weighting is applied per bin (|H_K(f)|^2 cached by geometry), so a
// single module covers both the worklet and the compatibility analyser path.

(function (root) {
  'use strict';

  const ZERO = Object.freeze({
    centroid: 0, flux: 0, flatness: 0, spread: 0, rolloff: 0,
    low: 0, mid: 0, high: 0,
  });

  // Public, frozen constants for K-weighted loudness. Range 0 = FLOOR_LU,
  // 1 = CEIL_LU (relative to the digital full scale of the input, not SPL).
  const LOUDNESS = Object.freeze({
    RANGE_DB: 45,
    CEIL_LU: -5,
    TAU_MS: 400,
    FLATNESS_RANGE_DB: 60,
    MIN_POWER: 1e-12,
  });
  const FLOOR_LU = LOUDNESS.CEIL_LU - LOUDNESS.RANGE_DB; // -50 LU

  const SHELF = Object.freeze({
    b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285,
    a1: -1.69065929318241, a2: 0.73248077421585,
  });
  const HIGHPASS = Object.freeze({
    b0: 1.0, b1: -2.0, b2: 1.0,
    a1: -1.99004745483398, a2: 0.99007225036621,
  });
  const REF_SAMPLE_RATE = 48000; // Coefficients defined at 48 kHz per BS.1770-4.

  function unit(v) {
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  /**
   * |H(e^{jω})|^2 for a biquad at hz Hz, using the BS.1770-4 48 kHz coefficients.
   * Real coefficients: |N|^2 = (b0 + b1·cos + b2·cos2)^2 + (b1·sin + b2·sin2)^2.
   */
  function biquadMagnitudeSq(hz, b0, b1, b2, a1, a2) {
    if (!(hz > 0)) return 0;
    const omega = 2 * Math.PI * hz / REF_SAMPLE_RATE;
    const cos1 = Math.cos(omega);
    const sin1 = Math.sin(omega);
    const cos2 = Math.cos(2 * omega);
    const sin2 = Math.sin(2 * omega);
    const nRe = b0 + b1 * cos1 + b2 * cos2;
    const nIm = b1 * sin1 + b2 * sin2;
    const dRe = 1 + a1 * cos1 + a2 * cos2;
    const dIm = a1 * sin1 + a2 * sin2;
    const dSq = dRe * dRe + dIm * dIm;
    if (dSq <= 0) return 0;
    const nSq = nRe * nRe + nIm * nIm;
    return nSq / dSq;
  }

  /** Exposed for tests: K-weighting power response at hz Hz. */
  function kWeightingPower(hz) {
    if (!(hz > 0)) return 0;
    const shelf = biquadMagnitudeSq(hz, SHELF.b0, SHELF.b1, SHELF.b2, SHELF.a1, SHELF.a2);
    const hp = biquadMagnitudeSq(hz, HIGHPASS.b0, HIGHPASS.b1, HIGHPASS.b2, HIGHPASS.a1, HIGHPASS.a2);
    return shelf * hp;
  }

  /**
   * K-weighted LU relative to full scale.
   * L = -0.691 + 10·log10(P); 0 LU == full-scale sine of amplitude 1.
   */
  function powerToLu(power) {
    if (!Number.isFinite(power) || power <= 0) return -Infinity;
    return -0.691 + 10 * Math.log10(power);
  }

  class SpectralDescriptors {
    constructor() {
      this.geometry = '';
      this.ready = false;
      this.bandState = { low: 0, mid: 0, high: 0 };
    }

    reset() {
      this.previous?.fill(0);
      this.ready = false;
      this.bandState = { low: 0, mid: 0, high: 0 };
    }

    process({
      frequencyDb, sampleRate, fftSize,
      powerCorrection = 1, elapsedMs = 0,
    } = {}) {
      if (!Number.isFinite(sampleRate) || sampleRate <= 0
        || !Number.isInteger(fftSize) || fftSize < 2
        || !frequencyDb?.length
        || !Number.isFinite(powerCorrection) || powerCorrection <= 0) {
        this.reset();
        return { ...ZERO };
      }

      const geometry = sampleRate + ':' + fftSize + ':' + frequencyDb.length;
      if (this.geometry !== geometry) {
        this.geometry = geometry;
        this.powers = new Float64Array(frequencyDb.length);
        this.magnitudes = new Float64Array(frequencyDb.length);
        this.previous = new Float64Array(frequencyDb.length);
        this.kWeight = new Float64Array(frequencyDb.length);
        this.kWeightGeometry = geometry;
        for (let i = 0; i < frequencyDb.length; i += 1) {
          this.kWeight[i] = 0;
        }
        this.reset();
      }
      if (this.kWeightGeometry !== geometry) {
        // Geometry changed mid-flight (different FFT size). Recompute K.
        this.kWeight = new Float64Array(frequencyDb.length);
        this.kWeightGeometry = geometry;
      }

      const step = sampleRate / fftSize;
      const first = Math.max(1, Math.ceil(20 / step));
      const last = Math.min(frequencyDb.length - 1,
        Math.floor(Math.min(20000, sampleRate / 2) / step));

      let total = 0;
      let magnitudeSum = 0;
      let weighted = 0;
      let logSum = 0;
      let logCount = 0;
      let lowInstant = 0;
      let midInstant = 0;
      let highInstant = 0;

      for (let i = first; i <= last; i += 1) {
        const db = frequencyDb[i];
        const power = Number.isFinite(db) ? Math.pow(10, Math.min(300, db) / 10) : 0;
        const magnitude = Math.sqrt(power);
        const hz = i * step;
        if (this.kWeight[i] === 0 && hz > 0) {
          this.kWeight[i] = kWeightingPower(hz);
        }
        const kw = this.kWeight[i];

        this.powers[i] = power;
        this.magnitudes[i] = magnitude;
        total += power;
        magnitudeSum += magnitude;
        weighted += magnitude * hz;

        const safePower = power > 0 ? power : LOUDNESS.MIN_POWER;
        logSum += Math.log(safePower);
        logCount += 1;

        const kPower = power * kw;
        if (hz < 250) lowInstant += kPower;
        else if (hz < 2000) midInstant += kPower;
        else highInstant += kPower;
      }

      if (total <= 1e-14 || magnitudeSum === 0) {
        this.reset();
        return { ...ZERO };
      }

      const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
      const alpha = elapsed > 0 ? 1 - Math.exp(-elapsed / LOUDNESS.TAU_MS) : 0;
      if (alpha > 0) {
        this.bandState.low += (lowInstant - this.bandState.low) * alpha;
        this.bandState.mid += (midInstant - this.bandState.mid) * alpha;
        this.bandState.high += (highInstant - this.bandState.high) * alpha;
      }

      const useIntegrated = alpha > 0;
      const lowP = useIntegrated ? this.bandState.low : lowInstant;
      const midP = useIntegrated ? this.bandState.mid : midInstant;
      const highP = useIntegrated ? this.bandState.high : highInstant;

      const twoScaled = 2 * powerCorrection;
      const lowLu = powerToLu(lowP * twoScaled);
      const midLu = powerToLu(midP * twoScaled);
      const highLu = powerToLu(highP * twoScaled);

      const centroidHz = weighted / magnitudeSum;
      let variance = 0;
      let flux = 0;
      let cumulative = 0;
      let rolloffHz = 0;
      for (let i = first; i <= last; i += 1) {
        const normalized = this.magnitudes[i] / magnitudeSum;
        variance += normalized * (i * step - centroidHz) ** 2;
        flux += Math.abs(normalized - this.previous[i]);
        this.previous[i] = normalized;
        cumulative += this.powers[i];
        if (rolloffHz === 0 && cumulative >= total * 0.95) rolloffHz = i * step;
      }
      const flatDb = logCount > 0 && total > 0
        ? 10 * Math.log10(Math.exp(logSum / logCount) / (total / logCount))
        : -Infinity;
      const flatness = unit(1 + flatDb / LOUDNESS.FLATNESS_RANGE_DB);

      const result = {
        centroid: unit(centroidHz / 20000),
        spread: unit(Math.sqrt(variance) / 10000),
        rolloff: unit(rolloffHz / 20000),
        flatness,
        flux: this.ready ? unit(flux * 0.5) : 0,
        low: unit((lowLu - FLOOR_LU) / LOUDNESS.RANGE_DB),
        mid: unit((midLu - FLOOR_LU) / LOUDNESS.RANGE_DB),
        high: unit((highLu - FLOOR_LU) / LOUDNESS.RANGE_DB),
      };
      this.ready = true;
      return result;
    }
  }

  root.AudioSpectralDescriptors = Object.freeze({
    ZERO,
    LOUDNESS,
    kWeightingPower,
    createProcessor: () => new SpectralDescriptors(),
  });
})(typeof window !== 'undefined' ? window : globalThis);
