// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
(function (global) {
  'use strict';

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function createScalarGestureState(initialValue) {
    const value = typeof initialValue === 'number' ? clamp(initialValue, 0, 1) : 0;
    return {
      value,
      on: value > 0,
      activePointerId: null,
      mode: null,
      startY: 0,
      startValue: value,
      rangePx: 100,
      curve: 'linear',
      latchTapReset: false,
      pendingToggleOff: false,
      moved: false,
      burst: null,
      lastToggleValue: value > 0 ? value : 1,
    };
  }

  function changedValue(state, value, phase, active) {
    const next = clamp(value, 0, 1);
    const rounded = roundValue(next);
    state.value = rounded;
    state.on = next > 0;
    return { value: rounded, phase, active };
  }

  function roundValue(v) {
    return Math.round(v * 10000) / 10000;
  }

  function calculatePadRangePx(_height) {
    // Match the LFO / stutter / fader / knob range (150px) so the vertical
    // drag depth of a pad feels identical to the other vertical controls.
    return 150;
  }

  // The surface emits at 30 Hz; one frame is the shortest thing it can send.
  const EMIT_FRAME_MS = 1000 / 30;

  function calculatePadDragDelta(dy, rangePx, curve = 'linear') {
    if (!Number.isFinite(dy) || dy === 0) return 0;
    const range = Number.isFinite(rangePx) && rangePx > 0 ? rangePx : 150;
    const magnitude = Math.min(1, Math.abs(dy / range));
    const shaped = curve === 'fine' ? magnitude * magnitude
      : curve === 'fast' ? Math.sqrt(magnitude) : magnitude;
    return Math.sign(dy) * shaped;
  }

  function valueFromDrag(state, y) {
    const dy = state.startY - y;
    return clamp(state.startValue + calculatePadDragDelta(dy, state.rangePx, state.curve), 0, 1);
  }

  function beginScalarGesture(state, opts) {
    if (state.activePointerId !== null) return null;

    const mode = opts.mode || 'A';
    const rangePx = Number.isFinite(opts.rangePx) && opts.rangePx > 0 ? Math.max(1, opts.rangePx) : 100;
    state.mode = mode;
    state.activePointerId = opts.pointerId;
    state.startY = opts.y;
    state.rangePx = rangePx;
    state.curve = ['linear', 'fine', 'fast'].includes(opts.curve) ? opts.curve : 'linear';
    state.latchTapReset = opts.latchTapReset === true;
    state.pendingToggleOff = false;
    state.moved = false;
    state.burst = null;

    if (mode === 'A') {
      state.startValue = Number.isFinite(opts.touchValue) ? clamp(opts.touchValue, 0, 1) : 0;
      return changedValue(state, state.startValue, 'start', true);
    }

    if (mode === 'B') {
      state.startValue = state.value;
      state.on = state.value > 0;
      return { value: roundValue(state.value), phase: 'start', active: true };
    }

    if (mode === 'C') {
      if (state.on) {
        state.startValue = state.value;
        state.pendingToggleOff = true;
        return null;
      }

      const defaultValue = Number.isFinite(opts.defaultToggleValue)
        ? opts.defaultToggleValue
        : state.lastToggleValue;
      state.startValue = clamp(state.value > 0 ? state.value : defaultValue, 0, 1);
      const event = changedValue(state, state.startValue, 'toggle-on', true);
      if (state.value > 0) state.lastToggleValue = state.value;
      return event;
    }

    if (mode === 'D') {
      // Phones restate their whole control set at 30 Hz, so a burst shorter
      // than one frame cannot be transmitted however the envelope is shaped.
      // Anything above that is a musical value and is left alone: a floor of
      // 80 ms used to swallow every subdivision below a quarter beat, and at a
      // fast tempo all of them, so the seven lengths in the settings arrived as
      // one and Live's tempo stopped reaching the burst.
      const asked = Number(opts.burstDurationMs);
      const durationMs = Math.max(
        EMIT_FRAME_MS,
        Number.isFinite(asked) && asked > 0 ? asked : 520,
      );
      const askedAttack = Number(opts.burstAttackMs);
      const attackMs = Math.max(1, Math.min(
        Number.isFinite(askedAttack) && askedAttack > 0 ? askedAttack : 70,
        durationMs * 0.9,
      ));
      state.startValue = 0;
      const configuredPeak = Number.isFinite(opts.burstPeak) ? clamp(opts.burstPeak, 0.15, 1) : null;
      state.burst = {
        active: true,
        startTime: opts.now || 0,
        durationMs,
        attackMs,
        peak: configuredPeak ?? 1,
        dragPeakBase: configuredPeak ?? 0.75,
      };
      return changedValue(state, 0, 'burst-start', true);
    }

    state.startValue = 0;
    return changedValue(state, 0, 'start', true);
  }

  function moveScalarGesture(state, opts) {
    if (state.activePointerId !== opts.pointerId) return null;

    if (state.mode === 'D') {
      if (state.burst) {
        const dy = state.startY - opts.y;
        const delta = calculatePadDragDelta(dy, state.rangePx, state.curve);
        state.burst.peak = clamp(state.burst.dragPeakBase + delta, 0.15, 1);
      }
      state.moved = true;
      return null;
    }

    const dy = Math.abs(state.startY - opts.y);
    if (dy > 4) {
      state.moved = true;
      state.pendingToggleOff = false;
    }

    const next = valueFromDrag(state, opts.y);
    if (roundValue(next) === roundValue(state.value)) return null;
    // A value-changing B drag must latch even below C's 4px tap slop.
    if (state.mode === 'B') state.moved = true;

    const event = changedValue(state, next, 'move', true);
    if (state.mode === 'C') {
      if (state.value > 0) state.lastToggleValue = state.value;
      else state.on = false;
    }
    return event;
  }

  function endScalarGesture(state, opts) {
    if (state.activePointerId !== opts.pointerId) return null;

    const mode = state.mode;
    const wasMoved = state.moved;
    const shouldToggleOff = state.pendingToggleOff && !wasMoved;
    state.activePointerId = null;
    state.mode = null;
    state.pendingToggleOff = false;
    state.moved = false;

    if (mode === 'A') {
      return changedValue(state, 0, 'release', false);
    }

    if (mode === 'B' && state.latchTapReset && !wasMoved && !opts.cancelled) {
      return changedValue(state, 0, 'release', false);
    }

    if (mode === 'C' && shouldToggleOff && state.on) {
      if (state.value > 0) state.lastToggleValue = state.value;
      return changedValue(state, 0, 'toggle-off', false);
    }

    return null;
  }

  function tickBurstGesture(state, opts) {
    if (!state.burst || !state.burst.active) return null;

    const elapsed = Math.max(0, (opts.now || 0) - state.burst.startTime);
    const duration = state.burst.durationMs;
    const attack = state.burst.attackMs;
    const peak = state.burst.peak;

    if (elapsed >= duration) {
      state.burst.active = false;
      state.burst = null;
      state.activePointerId = null;
      return changedValue(state, 0, 'burst-end', false);
    }

    let value;
    if (elapsed <= attack) {
      value = peak * (elapsed / attack);
    } else {
      value = peak * (1 - ((elapsed - attack) / (duration - attack)));
    }

    return changedValue(state, value, 'burst', true);
  }

  global.AbletonRcModes = {
    clamp,
    calculatePadRangePx,
    calculatePadDragDelta,
    createScalarGestureState,
    beginScalarGesture,
    moveScalarGesture,
    endScalarGesture,
    tickBurstGesture,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
