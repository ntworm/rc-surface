// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const defaults = Object.freeze({ behavior: 'static', friction: .012, bounce: 0.75, speed: 1 });
  const STOP_BELOW = .0006;
  function create() { return { x: .5, y: .5, vx: 0, vy: 0, dragging: false, time: null }; }
  function stop(state) { state.vx = 0; state.vy = 0; }
  function move(state, x, y, now) {
    x = clamp(x, 0, 1); y = clamp(y, 0, 1);
    const dt = Math.max(1, now - (state.time ?? now)) / 1000;
    state.vx = clamp((x - state.x) / dt, -4, 4);
    state.vy = clamp((y - state.y) / dt, -4, 4);
    state.x = x; state.y = y; state.time = now;
  }
  function tick(state, settings, now) {
    const dt = clamp(now - (state.time ?? now), 0, 50) / 1000;
    state.time = now;
    if (settings.behavior !== 'physics') { stop(state); return false; }
    if (state.dragging || dt === 0 || (!state.vx && !state.vy)) return false;
    const damping = (1 - settings.friction) ** (dt * 60);
    for (const axis of ['x', 'y']) {
      const velocity = 'v' + axis;
      state[velocity] *= damping;
      if (Math.abs(state[velocity]) < STOP_BELOW) state[velocity] = 0;
      state[axis] += state[velocity] * settings.speed * dt;
      if (state[axis] < 0 || state[axis] > 1) {
        state[axis] = clamp(state[axis], 0, 1);
        state[velocity] *= -settings.bounce;
        if (Math.abs(state[velocity]) < STOP_BELOW) state[velocity] = 0;
      }
    }
    return true;
  }
  root.RcXYEngine = Object.freeze({ defaults, create, move, tick, stop });
}(globalThis));
