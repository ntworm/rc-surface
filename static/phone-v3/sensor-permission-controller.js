// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Sensor permission startup.
//
// Some browsers only deliver motion/orientation readings after an explicit
// requestPermission() call, and that call must run inside a user gesture.
// The page therefore never opens that prompt by itself: the boot attaches
// the APIs that need no gesture and waits for the rest, only a confirmed
// "granted" starts a listener, a request starts every API before anything
// is awaited, and each API owns its outcome. Attaching is idempotent and a
// denied or failed request can be retried from the next gesture.
//
// Every API carries its own revision: a request takes the ownership of its
// API the moment it starts, so a permission query that was still in flight
// when the user acted can never override the newer outcome.

(function (root) {
  'use strict';

  const API_NAMES = ['motion', 'orientation'];

  // A permission outcome is only ever "granted" or "denied". Anything else
  // (unknown, prompt, a browser specific word) is an error, never a grant.
  function outcomeOf(result) {
    if (result === 'granted') return 'granted';
    if (result === 'denied') return 'denied';
    return 'error';
  }

  function apiFor(ctx, name) {
    const api = ctx.apis[name];
    return api && typeof api === 'object' ? api : { present: false, request: null };
  }

  function trackerFor(ctx, name) {
    return ctx.trackers[name] || null;
  }

  function needsRequest(ctx, name) {
    const api = apiFor(ctx, name);
    return api.present === true && typeof api.request === 'function';
  }

  function tellChange(ctx, name, outcome) {
    if (typeof ctx.onChange === 'function') ctx.onChange(name, outcome);
  }

  // Attaching twice would deliver every reading twice, so the page listener
  // is installed once per API and never removed. It returns true when the
  // listener is in place, null when there is nothing to install and false
  // when the callback is missing or throws: a failure claims nothing and
  // leaves the API retryable.
  function attachOnce(ctx, name) {
    const entry = ctx.state[name];
    if (entry.attached) return true;
    if (apiFor(ctx, name).present !== true) return null;
    const tracker = trackerFor(ctx, name);
    if (tracker && typeof tracker.getState === 'function') {
      const status = tracker.getState().status;
      if (status === 'unsupported' || status === 'insecure') return null;
    }
    const install = ctx.attach[name];
    if (typeof install !== 'function') return false;
    entry.attached = true;
    try {
      install();
    } catch {
      entry.attached = false;
    }
    return entry.attached;
  }

  // The tracker owns the vocabulary: granted, denied and anything else
  // become waiting, denied and error. A listener that does not install is
  // never a grant: the API stays retryable and reports an error.
  function applyOutcome(ctx, name, outcome) {
    const entry = ctx.state[name];
    entry.outcome = outcome;
    const tracker = trackerFor(ctx, name);
    if (tracker && typeof tracker.permission === 'function') tracker.permission(outcome);
    if (outcome === 'granted' && attachOnce(ctx, name) === false) {
      entry.outcome = 'error';
      if (tracker && typeof tracker.permission === 'function') tracker.permission('error');
      tellChange(ctx, name, 'error');
      return;
    }
    tellChange(ctx, name, outcome);
  }

  // The permission may already have been granted before this page asked.
  // Only that confirmed state starts a listener; prompt, denied and unknown
  // keep waiting for a gesture. The revision is read before the await, so a
  // request that starts meanwhile keeps the ownership of the API.
  function confirmExistingPermission(ctx, name) {
    if (typeof ctx.queryPermission !== 'function') return;
    const entry = ctx.state[name];
    const revision = entry.revision;
    let pending = null;
    try {
      pending = ctx.queryPermission(name);
    } catch {
      return;
    }
    if (!pending || typeof pending.then !== 'function') return;
    pending.then((result) => {
      if (entry.revision !== revision) return;  // a request owns the API now
      if (entry.outcome !== 'unknown') return;  // an explicit outcome won
      if (result !== 'granted') return;
      if (entry.attached) return;
      applyOutcome(ctx, name, 'granted');
    }, () => {});
  }

  // A request takes the ownership of its API the moment it starts: the
  // revision moves forward and every older query becomes stale.
  function startRequest(ctx, name) {
    const entry = ctx.state[name];
    if (entry.pending) return entry.pending;  // one request per API
    entry.revision += 1;
    const revision = entry.revision;
    let promise = null;
    try {
      // Synchronous: the gesture is still active here.
      promise = apiFor(ctx, name).request();
    } catch {
      applyOutcome(ctx, name, 'error');
      return null;
    }
    if (!promise || typeof promise.then !== 'function') {
      applyOutcome(ctx, name, 'error');
      return null;
    }
    const settled = promise.then(
      (result) => { settleRequest(ctx, name, revision, outcomeOf(result)); },
      () => { settleRequest(ctx, name, revision, 'error'); },
    );
    entry.pending = settled;
    return settled;
  }

  function settleRequest(ctx, name, revision, outcome) {
    const entry = ctx.state[name];
    if (entry.revision !== revision) return;
    entry.pending = null;
    applyOutcome(ctx, name, outcome);
  }

  // Boot: attach what needs no gesture, ask for nothing.
  function startAll(ctx) {
    for (const name of API_NAMES) {
      if (apiFor(ctx, name).present !== true) {
        ctx.state[name].outcome = 'unsupported';
        continue;
      }
      ctx.state[name].needsRequest = needsRequest(ctx, name);
      if (!ctx.state[name].needsRequest) {
        if (attachOnce(ctx, name) === false) applyOutcome(ctx, name, 'error');
        continue;
      }
      confirmExistingPermission(ctx, name);
    }
  }

  // Called from a user gesture: every request starts before anything is
  // awaited, and each API settles on its own.
  function requestAll(ctx) {
    const pending = [];
    for (const name of API_NAMES) {
      if (apiFor(ctx, name).present !== true) continue;
      if (!needsRequest(ctx, name)) {
        if (attachOnce(ctx, name) === false) applyOutcome(ctx, name, 'error');
        continue;
      }
      if (ctx.state[name].attached) continue; // already running
      const promise = startRequest(ctx, name);
      if (promise) pending.push(promise);
    }
    return Promise.all(pending);
  }

  function statusOf(ctx) {
    const out = {};
    for (const name of API_NAMES) {
      const tracker = trackerFor(ctx, name);
      out[name] = {
        attached: ctx.state[name].attached,
        needsRequest: ctx.state[name].needsRequest,
        outcome: ctx.state[name].outcome,
        tracker: tracker && typeof tracker.getState === 'function' ? tracker.getState().status : null,
      };
    }
    return out;
  }

  /**
   * Creates a sensor permission controller.
   *
   * @param {object} options
   * @param {object} options.apis Per API: { present, request } where request
   *   is the permission call or null when the API needs no gesture.
   * @param {object} options.trackers Per API: the capability tracker.
   * @param {object} options.attach Per API: installs the page listener.
   * @param {(name: string) => Promise<string>|null} [options.queryPermission]
   *   Optional lookup of an already granted permission.
   * @param {(name: string, outcome: string) => void} [options.onChange]
   *   Called after every outcome so the host can refresh its UI.
   */
  function createSensorPermissionController(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('createSensorPermissionController requires an options object');
    }
    const ctx = {
      apis: options.apis || {},
      trackers: options.trackers || {},
      attach: options.attach || {},
      queryPermission: options.queryPermission || null,
      onChange: options.onChange || null,
      state: {},
    };
    for (const name of API_NAMES) {
      ctx.state[name] = {
        attached: false, needsRequest: false, outcome: 'unknown', revision: 0, pending: null,
      };
    }
    return {
      start: () => startAll(ctx),
      request: () => requestAll(ctx),
      status: () => statusOf(ctx),
    };
  }

  root.RcSensorPermissions = { create: createSensorPermissionController, API_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
