// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  // Pure boundary only: no transport, device access, clock or musical writes.
  const VERSION = 1;
  const DESCRIPTORS = Object.freeze(['transient', 'kick', 'snare', 'brightness',
    'centroid', 'rolloff', 'flux', 'flatness', 'spread', 'low', 'mid', 'high']);
  const ATTACKS = ['transient', 'kick', 'snare'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const BEATS = [128, 64, 32, 16, 8, 4, 2, 1].flatMap((d) => [4 / d, 4 / d * 2 / 3, 4 / d * 3 / 2]);
  const SETTING_RANGES = Object.freeze({ sensitivity: [0, 1], releaseMs: [10, 500],
    curve: [.3, 3], toneMs: [0, 200], textureMs: [0, 200], bandsMs: [0, 200],
    attacksGain: [.25, 8], toneGain: [.25, 8], textureGain: [.25, 8], bandsGain: [.25, 8] });
  const BEAT_KEYS = ['releaseBeats', 'toneBeats', 'textureBeats', 'bandsBeats'];
  const SETTINGS = Object.keys(SETTING_RANGES).concat(BEAT_KEYS, ['window', 'syncMode']);

  function requireValue(condition) { if (!condition) throw new Error('invalid'); }
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const bool = (v) => typeof v === 'boolean';
  const uuid = (v) => typeof v === 'string' && UUID.test(v);
  const powerOfTwo = (v, min, max) => integer(v, max) && v >= min && (v & (v - 1)) === 0;

  // Work on an owned bounded JSON tree. No getters/toJSON, prototype keys or
  // caller-owned mutable aliases survive the boundary. HTTP still limits raw
  // bytes before parsing; these limits also protect in-process consumers.
  function copyJson(input) {
    let nodes = 0;
    const ancestors = new Set();
    function copy(value, depth) {
      requireValue(++nodes <= 2048 && depth <= 12);
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'number') { requireValue(Number.isFinite(value)); return value; }
      if (typeof value === 'string') { requireValue(value.length <= 1024); return value; }
      requireValue(typeof value === 'object' && !ancestors.has(value));
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      requireValue(array || prototype === null || Object.getPrototypeOf(prototype) === null);
      const keys = Reflect.ownKeys(value);
      requireValue(keys.length <= 64 && (!array || value.length <= 12));
      ancestors.add(value);
      const result = array ? [] : {};
      for (const key of keys) {
        if (array && key === 'length') continue;
        requireValue(typeof key === 'string' && key.length <= 64
          && key !== '__proto__' && key !== 'prototype' && key !== 'constructor');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        requireValue(descriptor && own(descriptor, 'value') && descriptor.enumerable);
        if (array) requireValue(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length);
        result[key] = copy(descriptor.value, depth + 1);
      }
      if (array) requireValue(Object.keys(result).length === value.length);
      ancestors.delete(value);
      return result;
    }
    const result = copy(input, 0);
    // No input hooks remain by this point. Bound total encoded size as well.
    const text = JSON.stringify(result);
    let bytes = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      bytes += code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4;
      requireValue(bytes <= 16384);
    }
    return result;
  }
  function shape(value, required, optional = []) {
    requireValue(value && typeof value === 'object' && !Array.isArray(value));
    requireValue(required.every((key) => own(value, key)));
    requireValue(Object.keys(value).every((key) => required.includes(key) || optional.includes(key)));
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function decode(input, check, code) {
    try {
      const value = copyJson(input);
      check(value);
      return freeze(value);
    } catch {
      // Never interpolate raw data, private paths, tokens or upstream errors.
      const error = new Error('Invalid native audio payload');
      error.code = code;
      throw error;
    }
  }
  function normalizedValues(value, keys) {
    shape(value, keys);
    requireValue(keys.every((key) => number(value[key], 0, 1)));
  }
  function frame(value) {
    shape(value, ['version', 'hostEpoch', 'instanceId', 'seq', 'captureSample', 'sampleRate',
      'signalVectorSize', 'fftSize', 'hopSize', 'configRevision', 'enabled',
      'dspRunning', 'spectralReady', 'values', 'amplitude', 'peaks']);
    requireValue(value.version === VERSION && uuid(value.hostEpoch) && uuid(value.instanceId));
    requireValue(integer(value.seq) && integer(value.captureSample) && integer(value.configRevision));
    requireValue(number(value.sampleRate, 8000, 384000)
      && powerOfTwo(value.signalVectorSize, 1, 8192)
      && powerOfTwo(value.fftSize, 256, 65536)
      && value.hopSize === value.fftSize / 2);
    requireValue(bool(value.enabled) && bool(value.dspRunning) && bool(value.spectralReady)
      && (!value.spectralReady || value.dspRunning));
    normalizedValues(value.values, DESCRIPTORS);
    normalizedValues(value.amplitude, ['rms', 'envelope']);
    normalizedValues(value.peaks, ATTACKS);
  }
  function settings(value, partial = false) {
    shape(value, partial ? [] : SETTINGS, partial ? SETTINGS : []);
    requireValue(Object.keys(value).length > 0);
    for (const [key, v] of Object.entries(value)) {
      if (own(SETTING_RANGES, key)) requireValue(number(v, ...SETTING_RANGES[key]));
      else if (BEAT_KEYS.includes(key)) requireValue(typeof v === 'number' && Number.isFinite(v)
        && ((key !== 'releaseBeats' && v === 0) || BEATS.some((b) => Math.abs(b - v) <= 1e-12)));
      else if (key === 'window') requireValue([1, 2, 4].includes(v));
      else if (key === 'syncMode') requireValue(v === 'sync' || v === 'free');
    }
  }
  function track(value) {
    shape(value, ['kind', 'index']);
    requireValue(['track', 'return', 'master'].includes(value.kind) && integer(value.index, 65535));
    requireValue(value.kind !== 'master' || value.index === 0);
  }
  function target(value) {
    shape(value, ['track', 'deviceIndex', 'kind', 'parameterIndex', 'catalogGeneration', 'fingerprint']);
    track(value.track);
    requireValue(integer(value.catalogGeneration) && integer(value.parameterIndex, 65535)
      && typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fingerprint));
    requireValue(['device-param', 'volume', 'pan', 'send'].includes(value.kind));
    if (value.kind === 'device-param') requireValue(integer(value.deviceIndex, 65535));
    else {
      requireValue(value.deviceIndex === null);
      if (value.kind !== 'send') requireValue(value.parameterIndex === 0);
      requireValue(value.track.kind !== 'master' || value.kind !== 'send');
    }
  }
  function slot(value) {
    shape(value, ['slot', 'descriptor', 'target', 'mode', 'amount', 'min', 'max', 'enabled']);
    requireValue(integer(value.slot, 11) && DESCRIPTORS.includes(value.descriptor));
    target(value.target);
    requireValue(['remote', 'modulate'].includes(value.mode) && bool(value.enabled)
      && number(value.amount, -1, 1) && number(value.min, 0, 1) && number(value.max, value.min, 1));
    // Eligibility, polarity and physical ownership are verified by the device,
    // not asserted by a caller adding a capability flag to this object.
  }
  function snapshot(value) {
    shape(value, ['instanceId', 'deviceId', 'revision', 'enabled', 'settings', 'slots',
      'bpm', 'tempoAvailable', 'profile', 'needsRelink']);
    requireValue(uuid(value.instanceId) && uuid(value.deviceId) && integer(value.revision)
      && bool(value.enabled) && bool(value.tempoAvailable) && bool(value.needsRelink)
      && number(value.bpm, 1, 1000) && value.profile === 'native-fast-v1');
    settings(value.settings);
    requireValue(Array.isArray(value.slots) && value.slots.length <= 12);
    const seen = new Set();
    for (const entry of value.slots) { slot(entry); requireValue(!seen.has(entry.slot)); seen.add(entry.slot); }
  }
  function change(value) {
    requireValue(value && typeof value === 'object');
    if (value.kind === 'settings') { shape(value, ['kind', 'patch']); settings(value.patch, true); }
    else if (value.kind === 'enabled') { shape(value, ['kind', 'enabled']); requireValue(bool(value.enabled)); }
    else if (value.kind === 'prepare-slot') { shape(value, ['kind', 'slot']); slot(value.slot); }
    else if (value.kind === 'commit-slot') { shape(value, ['kind', 'preparedId']); requireValue(uuid(value.preparedId)); }
    else if (value.kind === 'remove-slot') { shape(value, ['kind', 'slot']); requireValue(integer(value.slot, 11)); }
    else requireValue(false);
  }
  function ack(value) {
    shape(value, ['commandId', 'ok', 'code', 'snapshot'], ['preparedId']);
    requireValue(uuid(value.commandId) && bool(value.ok)
      && typeof value.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.code));
    if (own(value, 'preparedId')) requireValue(uuid(value.preparedId));
    snapshot(value.snapshot);
  }
  function exchange(value) {
    shape(value, ['version', 'hostEpoch', 'instanceId'], ['pairNonce', 'frame', 'snapshot', 'ack']);
    requireValue(value.version === VERSION && uuid(value.hostEpoch) && uuid(value.instanceId));
    if (own(value, 'pairNonce')) requireValue(integer(value.pairNonce, 16777215));
    if (own(value, 'frame')) {
      frame(value.frame);
      requireValue(value.frame.instanceId === value.instanceId && value.frame.hostEpoch === value.hostEpoch);
    }
    if (own(value, 'snapshot')) { snapshot(value.snapshot); requireValue(value.snapshot.instanceId === value.instanceId); }
    if (own(value, 'ack')) { ack(value.ack); requireValue(value.ack.snapshot.instanceId === value.instanceId); }
  }
  root.NativeAudioContract = Object.freeze({ VERSION, DESCRIPTORS,
    validateFrame: (input) => decode(input, frame, 'invalid_frame'),
    validateExchange: (input) => decode(input, exchange, 'invalid_exchange'),
    validateChange: (input) => decode(input, change, 'invalid_change'),
  });
})(typeof window !== 'undefined' ? window : globalThis);
