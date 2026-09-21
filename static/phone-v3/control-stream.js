// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One control clock, independent of MAP, telemetry, and paint. Discrete events
// retain order; continuous channels retain only their newest position. The
// first frame is immediate; the trailing timer is a throttle, never a debounce.
(function (root) {
  'use strict';
  const INTERVAL_MS = 8;
  const MAX_CONTROLS = 128;
  const MAX_AGE_MS = 120;
  const DISCRETE = /^(?:pad|toggle|button)-|^sensor\.vision\.gesture\.|\.(?:active|fist|pinch|victory|open|gate)$/;
  function create({ getConnection, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    const pending = new Map();
    const events = [];
    const seen = new Map();
    let socket, clientId, timer = null, lastSent = -Infinity, batchDepth = 0;
    function reset() {
      if (timer !== null) clearTimer(timer);
      timer = null; pending.clear(); events.length = 0; seen.clear(); lastSent = -Infinity;
    }
    function connection() {
      const c = getConnection();
      if (c?.socket !== socket || c?.clientId !== clientId || !c?.enabled || c.socket?.readyState !== 1) {
        reset(); socket = c?.socket; clientId = c?.clientId;
      }
      return !!(c?.enabled && socket?.readyState === 1 && clientId);
    }
    function schedule() {
      if (timer === null && (pending.size || events.length)) {
        timer = setTimer(() => { timer = null; flush(); }, Math.max(1, INTERVAL_MS - (now() - lastSent)));
      }
    }
    function failClosed() {
      reset();
      // Do not replay stale note edges after congestion. Closing invokes the
      // host's existing per-client safe-loss/note-release path.
      try { socket?.close(4000, 'Control stream congested'); } catch {}
    }
    function flush() {
      if (!connection()) return;
      const time = now();
      if (events.length && time - events[0].at > MAX_AGE_MS) { failClosed(); return; }
      for (const [name, item] of pending) {
        if (time - item.at > MAX_AGE_MS) { pending.delete(name); seen.delete(name); }
      }
      if (!pending.size && !events.length) return;
      if (time - lastSent < INTERVAL_MS) { schedule(); return; }
      if (socket.bufferedAmount > 0) {
        if (socket.bufferedAmount > 65536 && events.length) { failClosed(); return; }
        // Poll only while a fresh position/edge exists, without spinning at 1ms.
        if (timer === null) timer = setTimer(() => { timer = null; flush(); }, INTERVAL_MS);
        return;
      }
      const controls = events.map(item => item.control).concat([...pending.values()].map(item => item.control));
      try {
        socket.send(JSON.stringify({ type: 'control_frame', client_id: clientId, controls }));
        lastSent = time; pending.clear(); events.length = 0;
      } catch { failClosed(); }
    }
    function push(raw) {
      if (!connection()) return false;
      if (!raw || typeof raw.name !== 'string' || !raw.name.length || raw.name.length > 128) return true;
      const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
      const control = { name: raw.name };
      if (raw.x !== undefined || raw.y !== undefined) {
        if (!unit(raw.x) || !unit(raw.y)) return true;
        control.x = raw.x; control.y = raw.y;
      } else {
        if (!unit(raw.value)) return true;
        control.value = raw.value;
      }
      if (raw.lost !== undefined) {
        if (typeof raw.lost !== 'boolean') return true;
        control.lost = raw.lost;
      }
      const signature = JSON.stringify(control);
      // Sensor filters/recovery need fresh equal-valued measurements too.
      // Deduplicate only discrete heartbeats, never sustained measurements.
      if (DISCRETE.test(control.name) && seen.get(control.name) === signature) return true;
      if (seen.size >= MAX_CONTROLS && !seen.has(control.name)) return true;
      seen.set(control.name, signature);
      const item = { control, at: now() };
      if (DISCRETE.test(control.name)) events.push(item);
      else pending.set(control.name, item);
      if (events.length + pending.size > MAX_CONTROLS) { failClosed(); return true; }
      if (!batchDepth) { flush(); schedule(); }
      return true;
    }
    function discard(name) {
      const base = name.replace(/\.[xy]$/, '');
      for (const key of [name, base]) { pending.delete(key); seen.delete(key); }
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].control.name === name || events[i].control.name === base) events.splice(i, 1);
      }
    }
    function batch(fn) {
      batchDepth++;
      try { fn(); } finally {
        batchDepth--;
        if (!batchDepth) { flush(); schedule(); }
      }
    }
    return { push, batch, reset, discard, isActive: connection };
  }
  root.RcControlStream = Object.freeze({ create, INTERVAL_MS });
})(typeof window !== 'undefined' ? window : globalThis);
