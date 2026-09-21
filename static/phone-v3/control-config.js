// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// RC Surface per-control configuration store.
//
// Pure UMD module (no DOM, no network). `storage` and `clock` are injectable so
// tests can use an in-memory storage and freeze time. In production the module
// reads `window.localStorage` and `Date.now()` via the default factory.
//
// Persistence key: `ableton-rc:control_config`
// Wire shape: { [controlName]: { mode?, shape?, subdivision?, swing?, friction?,
//   bounce?, resetValue?, knobRange? } }
//
// Validation is strict: unknown keys are discarded, out-of-range numbers are
// clamped to documented ranges, enum strings are validated against the fixed
// lists. An empty patch or one that removes every key deletes the control entry
// from the store.
(function (root, factory) {
  if (typeof module === "object" && module && module.exports) {
    module.exports = factory();
  } else {
    root.RcControlConfig = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const STORAGE_KEY = "ableton-rc:control_config";

  const VALID_MODES = new Set(["A", "B", "C", "D"]);
  const VALID_SHAPES = new Set(["sine", "triangle", "ramp_up", "ramp_down", "square"]);
  const VALID_KEYS = new Set([
    "mode",
    "shape",
    "subdivision",
    "swing",
    "phaseOffset",
    "friction",
    "bounce",
    "resetValue",
    "knobRange",
  ]);
  const NUMERIC_RANGES = {
    friction: [0.002, 0.05],
    bounce: [0, 0.95],
    knobRange: [100, 400],
    resetValue: [0, 1],
    swing: [0, 0.66],
    phaseOffset: [0, 4],
    subdivision: [0.03125, 32],
  };

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return null;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function validateEntry(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const key of Object.keys(raw)) {
      if (!VALID_KEYS.has(key)) continue;
      const value = raw[key];
      if (key === "mode") {
        if (typeof value !== "string" || !VALID_MODES.has(value)) continue;
        out.mode = value;
      } else if (key === "shape") {
        if (typeof value !== "string" || !VALID_SHAPES.has(value)) continue;
        out.shape = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        const range = NUMERIC_RANGES[key];
        if (!range) continue;
        const clamped = clamp(value, range[0], range[1]);
        if (clamped === null) continue;
        out[key] = clamped;
      }
    }
    return out;
  }

  function validatePatch(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { set: {}, remove: [] };
    const setFields = {};
    const remove = [];
    for (const key of Object.keys(patch)) {
      if (!VALID_KEYS.has(key)) continue;
      const raw = patch[key];
      if (raw === null || raw === undefined) {
        remove.push(key);
        continue;
      }
      if (key === "mode") {
        if (typeof raw !== "string" || !VALID_MODES.has(raw)) continue;
        setFields.mode = raw;
      } else if (key === "shape") {
        if (typeof raw !== "string" || !VALID_SHAPES.has(raw)) continue;
        setFields.shape = raw;
      } else if (typeof raw === "number" && Number.isFinite(raw)) {
        const range = NUMERIC_RANGES[key];
        if (!range) continue;
        const clamped = clamp(raw, range[0], range[1]);
        if (clamped === null) continue;
        setFields[key] = clamped;
      }
    }
    return { set: setFields, remove };
  }

  function defaultStorage() {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
    return null;
  }

  function defaultClock() {
    if (typeof Date !== "undefined" && typeof Date.now === "function") return () => Date.now();
    return () => 0;
  }

  function createControlConfig(options) {
    const opts = options || {};
    const storage = opts.storage !== undefined ? opts.storage : defaultStorage();
    const clock = opts.clock || defaultClock();
    const subscribers = new Set();

    function load() {
      if (!storage) return {};
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (_) {
        return {};
      }
      if (!raw) return {};
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        return {};
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out = {};
      for (const name of Object.keys(parsed)) {
        const entry = validateEntry(parsed[name]);
        if (Object.keys(entry).length > 0) out[name] = entry;
      }
      return out;
    }

    function save(store) {
      if (!storage) return;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch (_) {
        // storage may be full or disabled; persistence is best-effort.
      }
    }

    let store = load();

    function emit(name, patch, next) {
      for (const fn of subscribers) {
        try {
          fn({ name, patch, next });
        } catch (_) {
          // a buggy subscriber must not break the store.
        }
      }
    }

    function get(name, key, fallback) {
      const entry = store[name];
      if (!entry) return fallback;
      if (key === undefined) {
        return Object.assign({}, entry);
      }
      if (!Object.prototype.hasOwnProperty.call(entry, key)) return fallback;
      return entry[key];
    }

    function set(name, patch) {
      if (typeof name !== "string" || !name) return;
      const validated = validatePatch(patch);
      const current = store[name] ? Object.assign({}, store[name]) : {};
      for (const key of validated.remove) {
        delete current[key];
      }
      Object.assign(current, validated.set);
      if (Object.keys(current).length === 0) {
        const had = Object.prototype.hasOwnProperty.call(store, name);
        if (had) {
          delete store[name];
          save(store);
          emit(name, validated.set, undefined);
        }
        return;
      }
      store[name] = current;
      save(store);
      emit(name, validated.set, current);
    }

    function clear(name) {
      if (!Object.prototype.hasOwnProperty.call(store, name)) return;
      delete store[name];
      save(store);
      emit(name, undefined, undefined);
    }

    function clearAll() {
      const names = Object.keys(store);
      store = {};
      save(store);
      for (const name of names) emit(name, undefined, undefined);
    }

    function listOverrides() {
      const names = Object.keys(store).sort();
      const items = [];
      for (const name of names) {
        const entry = store[name];
        const parts = [];
        if (entry.mode) parts.push("mode " + entry.mode);
        if (entry.shape) parts.push(entry.shape);
        if (entry.subdivision !== undefined) parts.push("subdiv " + entry.subdivision);
        if (entry.swing !== undefined) parts.push("swing " + entry.swing);
        if (entry.friction !== undefined) parts.push("friction " + entry.friction);
        if (entry.bounce !== undefined) parts.push("bounce " + entry.bounce);
        if (entry.resetValue !== undefined) parts.push("reset " + entry.resetValue);
        if (entry.knobRange !== undefined) parts.push("rangePx " + entry.knobRange);
        items.push({ name, summary: parts.join(", ") || "(empty)" });
      }
      return items;
    }

    function subscribe(fn) {
      if (typeof fn !== "function") return function () {};
      subscribers.add(fn);
      return function unsubscribe() {
        subscribers.delete(fn);
      };
    }

    function size() {
      return Object.keys(store).length;
    }

    return {
      STORAGE_KEY,
      get,
      set,
      clear,
      clearAll,
      listOverrides,
      subscribe,
      size,
    };
  }

  // The global must be a live store instance: controls.js, app.js and
  // config-mode.js call window.RcControlConfig.get/set/clear/listOverrides
  // directly. Keep `.create` for tests and isolated instances.
  const singleton = createControlConfig();
  singleton.create = createControlConfig;
  return singleton;
}));
