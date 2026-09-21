// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// modules/playhead.js — Playhead Simulation UI for RC Surface phone client.
// Extracted from controls.js setupPlayheadUI().

(function () {
  'use strict';

  window.RCSurface = window.RCSurface || {};

  window.RCSurface.setupPlayhead = function setupPlayhead() {
    const btn = document.getElementById('btn-play-sim');
    if (!btn) return;
    const renderState = () => {
      const playing = Boolean(window.playheadActive);
      btn.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    };
    renderState();
    btn.addEventListener('click', () => {
      if (window.phoneWs && window.phoneWs.readyState === 1) {
        window.phoneWs.send(JSON.stringify({ type: 'toggle_play' }));
      } else {
        // Fallback for offline/development test
        window.playheadActive = !window.playheadActive;
        if (window.playheadActive) {
          window.playheadStartTime = Date.now();
        } else {
          window.playheadBaseTimeMs = (window.playheadBaseTimeMs || 0) + (Date.now() - (window.playheadStartTime || Date.now()));
        }
        renderState();
      }
    });
  };
})();
