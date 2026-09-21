// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// Amplitude primitives. Descriptor timing uses audio-detector-timing.js.
(function (global) {
  'use strict';
  const DEFAULT_SETTINGS = Object.freeze({
    gateThreshold: 0.015, onsetSensitivity: 0.25,
    velocityWindowMs: 35, velocityRangeDb: 40,
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function finiteOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }


  function sanitizeSettings(settings = {}) {
    const input = settings && typeof settings === 'object' ? settings : {};
    return {
      gateThreshold: clamp(finiteOr(input.gateThreshold, DEFAULT_SETTINGS.gateThreshold), 0.001, 0.12),
      onsetSensitivity: clamp(finiteOr(input.onsetSensitivity, DEFAULT_SETTINGS.onsetSensitivity), 0.02, 1),
      velocityWindowMs: Math.round(clamp(finiteOr(input.velocityWindowMs, DEFAULT_SETTINGS.velocityWindowMs), 5, 200)),
      velocityRangeDb: Math.round(clamp(finiteOr(input.velocityRangeDb, DEFAULT_SETTINGS.velocityRangeDb), 12, 80)),
    };
  }

  class HystereticGate {
    constructor(threshold = DEFAULT_SETTINGS.gateThreshold) {
      this.threshold = clamp(finiteOr(threshold, DEFAULT_SETTINGS.gateThreshold), 0.001, 0.12);
      this.open = false;
    }

    setThreshold(threshold) {
      this.threshold = clamp(finiteOr(threshold, this.threshold), 0.001, 0.12);
      return this.threshold;
    }

    update(rms) {
      const level = Math.max(0, finiteOr(rms, 0));
      if (this.open) {
        if (level < this.threshold * 0.8) this.open = false;
      } else if (level >= this.threshold) {
        this.open = true;
      }
      return this.open;
    }

    reset() {
      this.open = false;
    }
  }

  class OnsetGate {
    constructor({ sensitivity = DEFAULT_SETTINGS.onsetSensitivity } = {}) {
      this.sensitivity = clamp(finiteOr(sensitivity, DEFAULT_SETTINGS.onsetSensitivity), 0.02, 1);
      this.armed = true;
      this.lastOnsetMs = null;
    }

    setSensitivity(sensitivity) {
      this.sensitivity = clamp(finiteOr(sensitivity, this.sensitivity), 0.02, 1);
      return this.sensitivity;
    }

    /** True on the frame an attack begins, false on every frame after it. */
    update(transient, timeMs = Date.now()) {
      const level = Math.max(0, finiteOr(transient, 0));
      if (level >= this.sensitivity) {
        if (!this.armed) return false;
        this.armed = false;
        this.lastOnsetMs = finiteOr(timeMs, Date.now());
        return true;
      }
      // Re-arm with hysteresis so a level hovering at the threshold does not
      // report an onset every other frame.
      if (level < this.sensitivity * 0.6) this.armed = true;
      return false;
    }

    /** How long ago the last attack was, or null. */
    sinceMs(timeMs = Date.now()) {
      if (this.lastOnsetMs === null) return null;
      return finiteOr(timeMs, Date.now()) - this.lastOnsetMs;
    }

    reset() {
      this.armed = true;
      this.lastOnsetMs = null;
    }
  }

  class VelocityWindow {
    constructor({ windowMs = DEFAULT_SETTINGS.velocityWindowMs, rangeDb = DEFAULT_SETTINGS.velocityRangeDb } = {}) {
      this.windowMs = clamp(finiteOr(windowMs, DEFAULT_SETTINGS.velocityWindowMs), 5, 200);
      this.rangeDb = clamp(finiteOr(rangeDb, DEFAULT_SETTINGS.velocityRangeDb), 12, 80);
      this.reset();
    }

    setWindowMs(windowMs) {
      this.windowMs = clamp(finiteOr(windowMs, this.windowMs), 5, 200);
      return this.windowMs;
    }

    setRangeDb(rangeDb) {
      this.rangeDb = clamp(finiteOr(rangeDb, this.rangeDb), 12, 80);
      return this.rangeDb;
    }

    /** Begin watching. Call on the frame a note starts. */
    open(timeMs = Date.now()) {
      this.openedMs = finiteOr(timeMs, Date.now());
      this.peak = 0;
      this.settled = false;
    }

    /** Feed a level. Returns true once the window has closed. */
    update(level, timeMs = Date.now()) {
      if (this.openedMs === null || this.settled) return this.settled;
      const rms = Math.max(0, finiteOr(level, 0));
      if (rms > this.peak) this.peak = rms;
      if (finiteOr(timeMs, Date.now()) - this.openedMs >= this.windowMs) {
        this.settled = true;
        // The loudest peak ever seen is the reference, so the range is
        // relative to this performance rather than to a number we guessed.
        if (this.peak > this.ceiling) this.ceiling = this.peak;
      }
      return this.settled;
    }

    /**
     * 0..1, where 1 is the loudest peak observed and 0 is rangeDb below it.
     * Returns null while the window is still open.
     */
    value() {
      if (!this.settled) return null;
      if (!(this.ceiling > 0) || !(this.peak > 0)) return 0;
      const db = 20 * Math.log10(this.peak / this.ceiling);
      return clamp(1 + db / this.rangeDb, 0, 1);
    }

    reset() {
      this.openedMs = null;
      this.peak = 0;
      this.settled = false;
      // Kept across notes: it is the performance's loudest moment, not this
      // note's. Cleared only when analysis stops.
      this.ceiling = 0;
    }
  }


  global.AudioAnalysisControls = {
    DEFAULT_SETTINGS, sanitizeSettings, HystereticGate, OnsetGate, VelocityWindow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
