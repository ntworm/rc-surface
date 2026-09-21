// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// Sensor capability tracker for the phone surface.
//
// One pure state machine per sensor API (motion, orientation). The host page
// feeds it real events, permission outcomes and clock ticks; the tracker never
// touches the DOM, the wire or Date.now. The local monotonic clock comes from
// `options.now` and is never compared against host epoch time.
//
// Status vocabulary (the tracker's own words):
//   unsupported         the API is absent on this browser
//   insecure            not a secure context; readings cannot be trusted
//   permission-required the API demands a user gesture before it emits
//   waiting             started; waiting for the first real sample
//   no-readings         2000 ms of waiting elapsed without any sample
//   ready               at least one finite axis arrived recently
//   lost                a previously-ready source stopped delivering
//   denied              the user explicitly denied the permission prompt
//   error               the permission call itself failed; retry is explicit
//
// A sample only counts when at least one axis is a finite number. Zero is a
// valid reading. A 2000 ms gap turns `waiting` into `no-readings` and `ready`
// into `lost`; both are reversible when a later real sample arrives.
(function (root) {
  'use strict';

  const NO_READINGS_MS = 2000;
  const LOST_MS = 2000;

  const ACTIVE_STATUSES = new Set(['waiting', 'no-readings', 'ready', 'lost']);

  function finiteValues(values) {
    const out = {};
    if (!values || typeof values !== 'object') return out;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  }

  /**
   * Creates a sensor capability tracker.
   *
   * @param {object} options
   * @param {boolean} options.apiPresent Whether the sensor API exists on this browser.
   * @param {boolean} options.secureContext Whether the page is a secure context.
   * @param {boolean} options.permissionRequired Whether the API requires an explicit permission call.
   * @param {() => number} options.now Monotonic local clock, e.g. performance.now.
   */
  function create(options) {
    const apiPresent = options.apiPresent === true;
    const secureContext = options.secureContext === true;
    const permissionRequired = options.permissionRequired === true;
    const now = options.now;

    let status = !secureContext
      ? 'insecure'
      : !apiPresent
        ? 'unsupported'
        : permissionRequired
          ? 'permission-required'
          : 'waiting';

    let lastValidAt = null;
    let values = {};
    let everRead = false;
    let waitAnchor = null;
    let suspended = false;
    let granted = false;

    function start() {
      suspended = false;
      if (!secureContext) { status = 'insecure'; return; }
      if (!apiPresent) { status = 'unsupported'; return; }
      if (permissionRequired && !granted) { status = 'permission-required'; return; }
      if (!ACTIVE_STATUSES.has(status)) { status = 'waiting'; }
      waitAnchor = now();
    }

    function permission(result) {
      suspended = false;
      if (!secureContext) { status = 'insecure'; return; }
      if (!apiPresent) { status = 'unsupported'; return; }
      if (result === 'granted') {
        granted = true;
        status = 'waiting';
        waitAnchor = now();
      } else if (result === 'denied') {
        granted = false;
        status = 'denied';
        values = {};
      } else {
        granted = false;
        status = 'error';
      }
    }

    function sample(rawValues) {
      if (suspended) return;
      if (!secureContext || !apiPresent) return;
      if (!ACTIVE_STATUSES.has(status)) return; // denied/error/permission-required ignore stray events
      const finite = finiteValues(rawValues);
      if (Object.keys(finite).length === 0) return; // no finite axis: not a reading
      values = finite;
      lastValidAt = now();
      everRead = true;
      status = 'ready';
    }

    function tick() {
      if (suspended) return;
      if (status === 'waiting' && waitAnchor !== null && now() - waitAnchor >= NO_READINGS_MS) {
        status = 'no-readings'; // never denied: silence is not a refusal
      } else if (status === 'ready' && lastValidAt !== null && now() - lastValidAt >= LOST_MS) {
        status = 'lost';
        values = {}; // stale samples are discarded, not replayed
      }
    }

    // Page suspension: readings collected while hidden are invalid, and stale
    // values must not keep flowing. Resume waits for fresh real readings and
    // never opens a permission prompt by itself.
    function suspend() {
      if (status === 'ready' || status === 'waiting' || status === 'no-readings') {
        if (status === 'ready') {
          status = 'lost';
          values = {};
        }
      }
      suspended = true;
    }

    function resume() {
      suspended = false;
      if (!secureContext || !apiPresent) return;
      if (permissionRequired && !granted) { status = 'permission-required'; return; }
      if (status !== 'denied' && status !== 'error') {
        status = 'waiting';
        waitAnchor = now();
      }
    }

    function getState() {
      return {
        status,
        lastValidAt,
        values: { ...values },
        everRead,
      };
    }

    return { start, permission, sample, tick, suspend, resume, getState };
  }

  root.RcSensorCapabilities = { create, NO_READINGS_MS, LOST_MS };
})(typeof window !== 'undefined' ? window : globalThis);
