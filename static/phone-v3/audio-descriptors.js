// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Four deliberately small, low-latency audio descriptors. Kick and Snare are
// onset-weighted spectral confidences, not source separation or classifiers.

(function (root) {
  'use strict';

  const RELEASE_MS = 45;
  // Dotted whole-note SYNC at the lowest supported tempo (1 BPM).
  // FREE knobs retain their compact ranges; DSP must accept resolved times.
  const MAX_TIMING_MS = 360000;
  // 1/128 triplet at 1000 BPM. FREE controls still enforce 10..500ms.
  const MIN_RELEASE_MS = 1.25;
  const SILENCE_RMS = 1e-7;
  const SILENCE_POWER = 1e-12;
  // A band's own recent energy is the reference for its attacks, so a hit is
  // judged by what changed in that band, not by its share of the whole mix.
  const ENERGY_TAU_MS = 300;
  const REFERENCE_FLOOR = 1e-9;
  // A band sitting more than 30 dB under the whole frame is masked: without
  // this floor, leakage into a nearly empty band reads as a huge relative rise.
  const MASKED_FRACTION = 1e-3;
  const ZERO = Object.freeze({ transient: 0, kick: 0, snare: 0, brightness: 0 });
  const BANDS = Object.freeze({
    kick: Object.freeze([35, 100]),
    snare: Object.freeze([1500, 8000]),
  });
  const DEFAULT_SETTINGS = Object.freeze({
    sensitivity: 0.65, releaseMs: RELEASE_MS, curve: 1, window: 2,
    toneMs: 0, textureMs: 0, bandsMs: 0,
    attacksGain: 1, toneGain: 1, textureGain: 1, bandsGain: 1,
  });
  // Groups share their controls; the browser catalogue keeps the same
  // grouping for labels and colours.
  const GROUPS = Object.freeze({
    attacks: Object.freeze({ fields: Object.freeze(['transient', 'kick', 'snare']), gain: 'attacksGain' }),
    tone: Object.freeze({ fields: Object.freeze(['brightness', 'centroid', 'rolloff']), gain: 'toneGain', smooth: 'toneMs' }),
    texture: Object.freeze({ fields: Object.freeze(['flux', 'flatness', 'spread']), gain: 'textureGain', smooth: 'textureMs' }),
    bands: Object.freeze({ fields: Object.freeze(['low', 'mid', 'high']), gain: 'bandsGain', smooth: 'bandsMs' }),
  });
  // Centroid, rolloff and spread are printed in Hz. A gain on them would show
  // a frequency the signal does not have, so level shaping skips them.
  const PHYSICAL_FIELDS = Object.freeze(['centroid', 'rolloff', 'spread']);

  /** Clamps a settings patch onto a base, ignoring anything unusable. */
  function normalizeSettings(patch, base = DEFAULT_SETTINGS) {
    const windows = [1, 2, 4];
    const requested = Number(patch?.window);
    return {
      sensitivity: clampRange(patch?.sensitivity, 0, 1, base.sensitivity),
      releaseMs: clampRange(patch?.releaseMs, MIN_RELEASE_MS, MAX_TIMING_MS, base.releaseMs),
      curve: clampRange(patch?.curve, 0.3, 3, base.curve),
      window: windows.includes(requested) ? requested : base.window,
      toneMs: clampRange(patch?.toneMs, 0, MAX_TIMING_MS, base.toneMs),
      textureMs: clampRange(patch?.textureMs, 0, MAX_TIMING_MS, base.textureMs),
      bandsMs: clampRange(patch?.bandsMs, 0, MAX_TIMING_MS, base.bandsMs),
      attacksGain: clampRange(patch?.attacksGain, 0.25, 8, base.attacksGain),
      toneGain: clampRange(patch?.toneGain, 0.25, 8, base.toneGain),
      textureGain: clampRange(patch?.textureGain, 0.25, 8, base.textureGain),
      bandsGain: clampRange(patch?.bandsGain, 0.25, 8, base.bandsGain),
    };
  }

  /**
   * Per group: an output gain, then one pole per descriptor driven by real
   * elapsed time so a dropped frame cannot change the shape. A zero time
   * constant passes values through; a gain of 1 leaves the level alone.
   *
   * The bands group is special: its source is K-weighted loudness in LU, so
   * `bandsGain` is applied as a dB offset (±18 dB at the 0.25..8 extremes) on
   * top of the measured unit value before clamping. Other groups keep the
   * original multiplicative gain.
   */
  class GroupShaper {
    constructor() { this.state = new Map(); }
    reset() { this.state.clear(); }
    apply(values, elapsedMs, settings) {
      const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
      const loudness = root.AudioSpectralDescriptors?.LOUDNESS;
      const rangeDb = loudness?.RANGE_DB > 0 ? loudness.RANGE_DB : 45;
      for (const group of Object.values(GROUPS)) {
        const gain = clampRange(settings?.[group.gain], 0.25, 8, 1);
        const tau = group.smooth ? clampRange(settings?.[group.smooth], 0, MAX_TIMING_MS, 0) : 0;
        for (const field of group.fields) {
          const measured = Number.isFinite(values[field]) ? values[field] : 0;
          let target;
          if (PHYSICAL_FIELDS.includes(field)) {
            target = measured;
          } else if (group === GROUPS.bands) {
            // bandsGain acts as a dB offset on the K-weighted loudness scale.
            // gain=2 → +6 dB; gain=0.5 → -6 dB; gain=1 → 0 dB (unity).
            const offset = 20 * Math.log10(gain) / rangeDb;
            target = clamp01(measured + offset);
          } else {
            target = clamp01(measured * gain);
          }
          values[field] = target;
          if (tau <= 0 || elapsed <= 0) { this.state.set(field, target); continue; }
          const previous = this.state.has(field) ? this.state.get(field) : target;
          const next = previous + (target - previous) * (1 - Math.exp(-elapsed / tau));
          this.state.set(field, next);
          values[field] = clamp01(next);
        }
      }
      return values;
    }
  }
  const BANDED_NAMES = Object.freeze(['kick', 'snare']);

  function clampRange(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  /**
   * Sensitivity 0..1 picks the knee of the attack response: the band-relative
   * rise that reads as half scale. A soft knee keeps loud hits from all
   * pinning at 1.000, which is what made the three attacks look identical.
   */
  function kneeForSensitivity(sensitivity) {
    return 12 * Math.pow(0.08, sensitivity);
  }

  function clamp01(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }

  function finiteSample(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function rmsOf(samples) {
    if (!samples || typeof samples.length !== 'number' || samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = finiteSample(samples[i]);
      sum += sample * sample;
    }
    return Number.isFinite(sum) ? Math.sqrt(sum / samples.length) : 0;
  }

  function powerFromDb(db) {
    if (!Number.isFinite(db)) return 0;
    const power = Math.pow(10, db / 10);
    return Number.isFinite(power) ? power : Number.MAX_VALUE;
  }

  class DescriptorProcessor {
    constructor(settings) {
      this.previousPowers = null;
      this.previousBandPowers = null;
      this.previousFrameTimeMs = null;
      this.reference = { total: 0, shaped: 0, kick: 0, snare: 0 };
      this.output = { ...ZERO };
      this.settings = { ...DEFAULT_SETTINGS };
      this.setSettings(settings);
    }

    setSettings(settings) {
      if (!settings) return this.settings;
      this.settings = normalizeSettings(settings, this.settings);
      return this.settings;
    }

    reset() {
      this.previousPowers?.fill(0);
      this.previousBandPowers?.fill(0);
      this.previousFrameTimeMs = null;
      this.reference = { total: 0, shaped: 0, kick: 0, snare: 0 };
      this.output = { ...ZERO };
    }

    process(frame) {
      const timeDomain = frame?.timeDomain;
      const frequencyDb = frame?.frequencyDb;
      // Bands read a low-leakage spectrum when the caller has one; the
      // compatibility analyser already windows, so it passes the same buffer.
      const bandDb = frame?.bandDb?.length === frame?.frequencyDb?.length ? frame.bandDb : frequencyDb;
      const sampleRate = Number(frame?.sampleRate);
      const fftSize = Number(frame?.fftSize);
      const validSpectrum = frequencyDb && typeof frequencyDb.length === 'number';
      const validGeometry = Number.isFinite(sampleRate) && sampleRate > 0
        && Number.isFinite(fftSize) && fftSize > 0;
      const rms = rmsOf(timeDomain);
      const binCount = validSpectrum ? frequencyDb.length : 0;
      // One fixed-sized buffer serves as previous/current powers. Read each
      // previous bin before overwriting it, avoiding per-frame typed arrays.
      if (!this.previousPowers || this.previousPowers.length !== binCount) {
        this.previousPowers = new Float64Array(binCount);
        this.previousBandPowers = new Float64Array(binCount);
      }
      const powers = this.previousPowers;
      const hzPerBin = validGeometry ? sampleRate / fftSize : 0;
      // Two domains on purpose. The rectangular spectrum keeps an attack that
      // lands on a window edge, so it answers "did something happen". The Hann
      // spectrum leaks far less, so it answers "in which band".
      const bandPower = { kick: 0, snare: 0 };
      const bandRise = { kick: 0, snare: 0 };
      let totalPower = 0;
      let totalRise = 0;
      let shapedTotal = 0;
      let shapedRise = 0;
      let centroidPower = 0;
      let centroidWeightedHz = 0;

      for (let i = 0; i < powers.length; i += 1) {
        const power = i === 0 ? 0 : powerFromDb(frequencyDb[i]); // DC is not spectral sound energy.
        const previous = powers[i];
        powers[i] = power;
        totalPower += power;
        if (power > previous) totalRise += power - previous;
        if (!hzPerBin) continue;
        const shaped = i === 0 ? 0 : powerFromDb(bandDb[i]);
        const previousShaped = this.previousBandPowers[i];
        this.previousBandPowers[i] = shaped;
        const rise = shaped > previousShaped ? shaped - previousShaped : 0;
        shapedTotal += shaped;
        shapedRise += rise;
        const hz = i * hzPerBin;
        const binLow = hz - hzPerBin / 2;
        const binHigh = hz + hzPerBin / 2;
        // Fractional bin overlap keeps a band meaningful at 96 kHz, where the
        // first non-DC centre (187.5 Hz) already exceeds the kick cutoff.
        for (const name of BANDED_NAMES) {
          const band = BANDS[name];
          const share = Math.max(0, Math.min(binHigh, band[1]) - Math.max(binLow, band[0])) / hzPerBin;
          if (share <= 0) continue;
          bandPower[name] += shaped * share;
          bandRise[name] += rise * share;
        }
        const centroidLow = Math.max(binLow, 100);
        const centroidHigh = Math.min(binHigh, 12000);
        if (centroidHigh > centroidLow) {
          const weightedPower = power * (centroidHigh - centroidLow) / hzPerBin;
          centroidPower += weightedPower;
          centroidWeightedHz += weightedPower * ((centroidLow + centroidHigh) / 2);
        }
      }

      if (!Number.isFinite(totalPower)) totalPower = Number.MAX_VALUE;
      if (!Number.isFinite(totalRise)) totalRise = totalPower;
      if (!Number.isFinite(shapedTotal)) shapedTotal = Number.MAX_VALUE;
      if (!Number.isFinite(shapedRise)) shapedRise = shapedTotal;
      for (const name of BANDED_NAMES) {
        if (!Number.isFinite(bandPower[name])) bandPower[name] = Number.MAX_VALUE;
        if (!Number.isFinite(bandRise[name])) bandRise[name] = bandPower[name];
      }

      const frameTimeMs = Number(frame?.frameTimeMs);
      const elapsedMs = Number.isFinite(frameTimeMs) && Number.isFinite(this.previousFrameTimeMs)
        ? Math.max(0, frameTimeMs - this.previousFrameTimeMs)
        : 0;
      const release = Math.exp(-elapsedMs / this.settings.releaseMs);

      // Silence carries only the bounded pulse tail. Once it is inaudible the
      // processor resets exactly to zero, so steady silence cannot keep a
      // mapping active while a one-frame onset still remains catchable.
      if (rms <= SILENCE_RMS && totalPower <= SILENCE_POWER) {
        const tail = {
          transient: this.output.transient * release,
          kick: this.output.kick * release,
          snare: this.output.snare * release,
          brightness: 0,
        };
        for (const name of ['transient', 'kick', 'snare']) {
          if (tail[name] < 0.005) tail[name] = 0;
        }
        if (tail.transient === 0 && tail.kick === 0 && tail.snare === 0) {
          this.reset();
          return { ...ZERO };
        }
        this.previousPowers = powers;
        this.previousFrameTimeMs = Number.isFinite(frameTimeMs) ? frameTimeMs : null;
        this.output = tail;
        return { ...tail };
      }

      let brightness = 0;
      if (centroidPower > SILENCE_POWER) {
        const centroidHz = centroidWeightedHz / centroidPower;
        brightness = clamp01(
          Math.log(Math.max(100, centroidHz) / 100) / Math.log(12000 / 100),
        );
      }

      // Each attack is the rise inside its own band measured against that
      // band's recent energy. A loud mix no longer decides which detector
      // fires; the band that actually changed does.
      const knee = kneeForSensitivity(this.settings.sensitivity);
      const curve = this.settings.curve;
      const trackNewEnergy = elapsedMs > 0 ? 1 - Math.exp(-elapsedMs / ENERGY_TAU_MS) : 0;
      // Brightness is deliberately unsmoothed: the current FFT owns it.
      const next = { transient: 0, kick: 0, snare: 0, brightness: clamp01(brightness) };
      // Transient answers "did something happen": the frame's whole rise
      // against the energy the frame has been carrying.
      const wideReference = Math.max(this.reference.total, REFERENCE_FLOOR);
      const novelty = Math.max(0, totalRise) / wideReference;
      const attack = Math.pow(novelty / (novelty + knee), curve);
      next.transient = clamp01(Math.max(attack, this.output.transient * release));
      for (const name of BANDED_NAMES) {
        // A band answers "did it happen HERE": how much of the new energy
        // landed in this band compared with the share it normally holds.
        const shareNow = shapedRise > 0 ? Math.max(0, bandRise[name]) / shapedRise : 0;
        const shapedReference = Math.max(this.reference.shaped, REFERENCE_FLOOR);
        const baseline = Math.max(this.reference[name], shapedReference * MASKED_FRACTION);
        const shareBase = Math.min(1, baseline / shapedReference);
        const focus = shareBase > 0 ? shareNow / shareBase : 0;
        // Squared on purpose: a narrow band fluctuates a lot under noise, so
        // carrying merely its usual share of the change must not read as a hit.
        const concentration = clamp01(2 * focus / (focus + 1)) ** 2;
        // The band must also have jumped on its own terms: concentration alone
        // would let steady noise in a wide band read as a hit.
        const bandNovelty = Math.max(0, bandRise[name]) / baseline;
        const bandAttack = Math.pow(bandNovelty / (bandNovelty + knee), curve);
        next[name] = clamp01(Math.max(bandAttack * concentration, this.output[name] * release));
      }
      // Updated after use, so an attack is never measured against itself.
      this.reference.total += (totalPower - this.reference.total) * trackNewEnergy;
      this.reference.shaped += (shapedTotal - this.reference.shaped) * trackNewEnergy;
      for (const name of BANDED_NAMES) {
        this.reference[name] += (bandPower[name] - this.reference[name]) * trackNewEnergy;
      }

      this.previousPowers = powers;
      this.previousFrameTimeMs = Number.isFinite(frameTimeMs) ? frameTimeMs : null;
      this.output = next;
      return { ...next };
    }
  }

  root.AudioDescriptors = Object.freeze({
    RELEASE_MS,
    BANDS,
    DEFAULT_SETTINGS,
    GROUPS,
    PHYSICAL_FIELDS,
    normalizeSettings,
    createSmoother: () => new GroupShaper(),
    createProcessor: (settings) => new DescriptorProcessor(settings),
  });
})(typeof window !== 'undefined' ? window : globalThis);
