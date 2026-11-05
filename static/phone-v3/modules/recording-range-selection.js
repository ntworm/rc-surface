// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/** Pure recording range selection reducer for the phone Surface: no DOM or timers, real references only. */
(function (root) {
  "use strict";

  const MAX_TIME = 10000000;
  const END_MODES = ["stop", "next", "marker"];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasExactKeys(value, keys) {
    const own = Object.keys(value);
    if (own.length !== keys.length) {
      return false;
    }
    return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function isValidTime(time) {
    return typeof time === "number" && Number.isFinite(time) && time >= 0 && time <= MAX_TIME;
  }

  function isMarkerRef(ref) {
    return isObject(ref) && hasExactKeys(ref, ["name", "time"]) && typeof ref.name === "string" &&
      isValidTime(ref.time);
  }

  function isCursorRef(ref) {
    return isObject(ref) && hasExactKeys(ref, ["source", "time"]) && ref.source === "cursor" &&
      isValidTime(ref.time);
  }

  function isRef(ref) {
    return isMarkerRef(ref) || isCursorRef(ref);
  }

  function copyRef(ref) {
    if (isMarkerRef(ref)) {
      return { name: ref.name, time: ref.time };
    }
    return isCursorRef(ref) ? { source: "cursor", time: ref.time } : null;
  }

  function isCatalogMarker(marker) {
    return isObject(marker) && typeof marker.name === "string" && isValidTime(marker.time);
  }

  function catalogOf(markers) {
    const list = Array.isArray(markers) ? markers : [];
    return list.filter((marker) => isCatalogMarker(marker));
  }

  function findMatches(markers, ref) {
    return catalogOf(markers).filter((marker) => marker.name === ref.name && marker.time === ref.time);
  }

  function uniqueMarker(markers, ref) {
    const found = findMatches(markers, ref);
    if (found.length !== 1) {
      return null;
    }
    return { name: found[0].name, time: found[0].time };
  }

  function isSameMarker(start, marker) {
    return isMarkerRef(start) && start.name === marker.name && start.time === marker.time;
  }

  function emptySelection() {
    return { start: null, endMode: "stop", end: null, editingStart: false };
  }

  function normalizeState(state) {
    const next = emptySelection();
    if (!isObject(state)) {
      return next;
    }
    next.start = isRef(state.start) ? copyRef(state.start) : null;
    // Unknown modes stay visible: they must never widen the range to stop.
    next.endMode = typeof state.endMode === "string" ? state.endMode : "stop";
    next.end = isMarkerRef(state.end) ? copyRef(state.end) : null;
    next.editingStart = state.editingStart === true;
    return next;
  }

  function applyStart(state, action) {
    if (action.value !== null && !isRef(action.value)) {
      return state;
    }
    state.start = action.value === null ? null : copyRef(action.value);
    state.editingStart = false;
    return state;
  }

  function applyEnd(state, action) {
    if (END_MODES.indexOf(action.mode) === -1) {
      return state;
    }
    if (action.mode === "marker" && !isMarkerRef(action.value)) {
      return state;
    }
    state.end = action.mode === "marker" ? copyRef(action.value) : null;
    state.endMode = action.mode;
    state.editingStart = false;
    return state;
  }

  function applyTap(state, action, markers) {
    const clicked = isMarkerRef(action.value) ? uniqueMarker(markers, action.value) : null;
    const start = state.start;
    if (clicked === null) {
      return state;
    }
    if (state.editingStart) {
      state.start = clicked;
      state.editingStart = false;
      return state;
    }
    if (start === null || clicked.time < start.time) {
      state.start = clicked;
    } else if (isSameMarker(start, clicked)) {
      state.editingStart = true;
    } else if (clicked.time > start.time) {
      state.end = clicked;
      state.endMode = "marker";
    }
    return state;
  }

  function updateSelection(state, action, markers) {
    const current = normalizeState(state);
    if (!isObject(action) || typeof action.type !== "string") {
      return current;
    }
    if (action.type === "start") {
      return applyStart(current, action);
    }
    if (action.type === "end") {
      return applyEnd(current, action);
    }
    if (action.type === "tap") {
      return applyTap(current, action, markers);
    }
    return current;
  }

  function checkStart(start, markers) {
    if (start === null) {
      return { ok: false, reason: "START_MISSING" };
    }
    if (isCursorRef(start)) {
      return { ok: true, start: start };
    }
    if (!isMarkerRef(start)) {
      return { ok: false, reason: "START_MISSING" };
    }
    const count = findMatches(markers, start).length;
    if (count !== 1) {
      return { ok: false, reason: count === 0 ? "START_MISSING" : "START_AMBIGUOUS" };
    }
    return { ok: true, start: start };
  }

  function checkMarkerEnd(end, start, markers) {
    if (!isMarkerRef(end)) {
      return { ok: false, reason: "END_MISSING" };
    }
    const count = findMatches(markers, end).length;
    if (count !== 1) {
      return { ok: false, reason: count === 0 ? "END_MISSING" : "END_AMBIGUOUS" };
    }
    if (!(end.time > start.time)) {
      return { ok: false, reason: "END_ORDER" };
    }
    return { ok: true, end: { name: end.name, time: end.time } };
  }

  function checkNextEnd(start, markers) {
    const later = catalogOf(markers).filter((marker) => marker.time > start.time);
    if (later.length === 0) {
      return { ok: false, reason: "NO_NEXT" };
    }
    const earliest = later.reduce((acc, marker) => (marker.time < acc ? marker.time : acc), later[0].time);
    const candidates = later.filter((marker) => marker.time === earliest);
    if (candidates.length !== 1) {
      return { ok: false, reason: "END_AMBIGUOUS" };
    }
    return { ok: true, end: { name: candidates[0].name, time: candidates[0].time } };
  }

  function checkEnd(state, start, markers) {
    if (state.endMode === "stop") {
      return { ok: true, end: null };
    }
    if (state.endMode === "marker") {
      return checkMarkerEnd(state.end, start, markers);
    }
    if (state.endMode === "next") {
      return checkNextEnd(start, markers);
    }
    return { ok: false, reason: "END_MISSING" };
  }

  function resolveSelection(state, markers) {
    const current = normalizeState(state);
    const result = {
      start: current.start,
      end: null,
      endMode: current.endMode,
      editingStart: current.editingStart,
      valid: false,
      reason: null
    };
    const start = checkStart(current.start, markers);
    if (!start.ok) {
      result.reason = start.reason;
      return result;
    }
    const end = checkEnd(current, start.start, markers);
    if (!end.ok) {
      result.reason = end.reason;
      return result;
    }
    result.end = end.end;
    result.valid = true;
    return result;
  }

  root.RcRecordingRange = Object.freeze({
    emptySelection: emptySelection,
    updateSelection: updateSelection,
    resolveSelection: resolveSelection
  });
})(typeof window !== "undefined" ? window : globalThis);
