// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// modules/snapshots.js — Snapshots & Vector Morphing Engine for RC Surface phone client.
// Extracted from controls.js.

(function () {
  'use strict';
  const T = (k, fallback) => (typeof window !== 'undefined' && window.RcSurfaceI18n)
    ? window.RcSurfaceI18n.t(k) : (fallback ?? k);

  window.RCSurface = window.RCSurface || {};

  const SNAPSHOT_COUNT = 8;
  const emptySnapshots = () => Array.from({ length: SNAPSHOT_COUNT }, () => null);
  let snapshots = emptySnapshots();
  let morphRafId = null;
  let morphMode = 'grid';
  let snapshotCaptureMode = false;
  let morphDurationSec = 1.0;
  let morphTimeSync = false;
  let morphSubdivIndex = 4;

  // Quarter-note beats, not bars: keep stored durations unchanged in 3/4, 7/8,
  // etc. Labels must not promise meter-aware lengths the engine does not use.
  const MORPH_SUBDIVISIONS = [
    { beats: 16, label: '16 beats' },
    { beats: 8, label: '8 beats' },
    { beats: 4, label: '4 beats' },
    { beats: 2, label: '2 beats' },
    { beats: 1, label: '1 beat' },
    { beats: 0.5, label: '1/2 beat' },
    { beats: 0.25, label: '1/4 beat' },
    { beats: 0.125, label: '1/8 beat' },
    { beats: 0.0625, label: '1/16 beat' },
  ];

  // One place decides how long a morph lasts, so the slider, the sync toggle
  // and the recall path cannot drift apart.
  function resolveMorphDurationSec() {
    if (!morphTimeSync) return morphDurationSec;
    const entry = MORPH_SUBDIVISIONS[morphSubdivIndex] || MORPH_SUBDIVISIONS[4];
    const bpm = Number(window.currentBpm);
    // Live has not reported a tempo yet: fall back rather than divide by zero
    // and hand startLinearMorph an Infinity.
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    return entry.beats * (60 / safeBpm);
  }

  function morphTimeLabel() {
    if (morphTimeSync) {
      const entry = MORPH_SUBDIVISIONS[morphSubdivIndex] || MORPH_SUBDIVISIONS[4];
      return entry.label.replace(/beats?$/, T(entry.beats > 1 ? 'sync.beatsUnit' : 'sync.beatUnit', entry.beats > 1 ? 'beats' : 'beat'));
    }
    return `${morphDurationSec.toFixed(1)}s`;
  }

  function getLfoStates() {
    return window.lfoStates || (typeof lfoStates !== 'undefined' ? lfoStates : null);
  }

  function getStutterStates() {
    return window.stutterStates || (typeof stutterStates !== 'undefined' ? stutterStates : null);
  }

  function cloneControlStates() {
    const states = JSON.parse(JSON.stringify(window.currentControlStates || {}));
    const lfos = getLfoStates();
    if (lfos && typeof lfos.entries === 'function') {
      for (const [name, state] of lfos.entries()) {
        states[name] = state.active ? 1.0 : 0.0;
      }
    }
    const stutters = getStutterStates();
    if (stutters && typeof stutters.entries === 'function') {
      for (const [name, state] of stutters.entries()) {
        states[name] = state.pressed ? 1.0 : 0.0;
        if (typeof state.depth === 'number' && Number.isFinite(state.depth)) {
          states[`${name}.depth`] = state.depth;
        }
        if (typeof state.rate === 'number' && Number.isFinite(state.rate)) {
          states[`${name}.rate`] = state.rate;
        }
        if (typeof state.count === 'number' && Number.isFinite(state.count)) {
          states[`${name}.count`] = state.count;
        }
      }
    }
    return states;
  }

  function loadSnapshots() {
    try {
      if (typeof localStorage === 'undefined') return;
      const saved = localStorage.getItem('ableton-rc:snapshots');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      snapshots = Array.isArray(parsed) && parsed.length === SNAPSHOT_COUNT ? parsed : emptySnapshots();
    } catch {
      snapshots = emptySnapshots();
    }
  }

  function saveSnapshots() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('ableton-rc:snapshots', JSON.stringify(snapshots));
    } catch {}
  }

  function updateSnapshotButton(btn, idx) {
    if (!btn || idx < 0 || idx >= snapshots.length) return;
    const isEmpty = !snapshots[idx];
    btn.classList.toggle('empty', isEmpty);
    const label = btn.querySelector('.status-indicator');
    if (label) {
      if (isEmpty) {
        label.textContent = T('js.empty', 'Empty');
      } else {
        label.textContent = btn.dataset.flashSaved === 'true'
          ? T('snp.saved', 'Saved') : T('snp.ready', 'Ready');
      }
    }
  }

  function updateSnapshotSlotUI() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.snapshot-slot').forEach((btn) => {
      updateSnapshotButton(btn, Number(btn.dataset.slot) - 1);
    });
    document.querySelectorAll('.perf-snapshot-slot').forEach((btn) => {
      updateSnapshotButton(btn, Number(btn.dataset.perfSnapshotSlot) - 1);
    });
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new Event('ableton-rc:snapshots-updated'));
    }
  }

  function setSnapshotCaptureMode(active) {
    snapshotCaptureMode = !!active;
    if (typeof document === 'undefined') return;
    [
      document.getElementById('btn-snapshot-capture'),
      document.getElementById('btn-perf-snapshot-capture'),
    ].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('active', snapshotCaptureMode);
      btn.setAttribute('aria-pressed', snapshotCaptureMode ? 'true' : 'false');
    });
  }

  function clearMorphingSlots() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.snapshot-slot').forEach((btn) => btn.classList.remove('morphing'));
    document.querySelectorAll('.perf-snapshot-slot').forEach((btn) => btn.classList.remove('morphing'));
  }

  function cancelMorph() {
    if (morphRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(morphRafId);
      morphRafId = null;
    }
    clearMorphingSlots();
  }

  function applyControlValue(key, value) {
    if (window.controlSetters && Object.keys(window.controlSetters).length > 0) {
      if (typeof window.controlSetters[key] === 'function') {
        try {
          window.controlSetters[key](value);
        } catch {}
      }
      return;
    }
    if (typeof window.onControl === 'function') {
      try {
        window.onControl({ name: key, value });
      } catch {}
    }
  }

  function isModulatorGateKey(key) {
    return /^toggle-\d+$/.test(key) || /^button-\d+$/.test(key);
  }

  function resolveMorphValue(key, startVal, targetVal, progress) {
    if (!isModulatorGateKey(key)) {
      return startVal + (targetVal - startVal) * progress;
    }
    const targetActive = Number(targetVal) > 0.5;
    if (targetActive) return 1;
    const startActive = Number(startVal) > 0.5;
    return startActive && progress < 1 ? 1 : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getSnapshotNumber(targetState, key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(targetState, key)) return fallback;
    const value = Number(targetState[key]);
    return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
  }

  function collectSnapshotModulatorNames(targetState, prefix) {
    const names = new Set();
    const pattern = prefix === 'toggle'
      ? /^(toggle-\d+)(?:\.(?:rate|depth))?$/
      : /^(button-\d+)(?:\.(?:rate|depth|count))?$/;
    for (const key of Object.keys(targetState)) {
      const match = key.match(pattern);
      if (match) names.add(match[1]);
    }
    return names;
  }

  function emitSnapshotMorphModulatorTargets(targetState, durationMs) {
    const morphMs = Math.max(0, Math.round(Number(durationMs) || 0));
    const lfos = getLfoStates();
    const stutters = getStutterStates();
    const sendLfo = window.sendLfoState || (typeof sendLfoState !== 'undefined' ? sendLfoState : null);
    const sendStutter = window.sendStutterState || (typeof sendStutterState !== 'undefined' ? sendStutterState : null);

    if (lfos && typeof sendLfo === 'function') {
      for (const name of collectSnapshotModulatorNames(targetState, 'toggle')) {
        const state = lfos.get(name);
        if (!state) continue;
        const active = Object.prototype.hasOwnProperty.call(targetState, name)
          ? Number(targetState[name]) > 0.5
          : !!state.active;
        sendLfo(name, {
          active,
          rate: getSnapshotNumber(targetState, `${name}.rate`, state.rate),
          depth: getSnapshotNumber(targetState, `${name}.depth`, state.depth),
        }, { morphMs });
      }
    }

    if (stutters && typeof sendStutter === 'function') {
      for (const name of collectSnapshotModulatorNames(targetState, 'button')) {
        const state = stutters.get(name);
        if (!state) continue;
        const pressed = Object.prototype.hasOwnProperty.call(targetState, name)
          ? Number(targetState[name]) > 0.5
          : !!state.pressed;
        const payload = { pressed };
        if (Object.prototype.hasOwnProperty.call(targetState, `${name}.rate`)) {
          const r = Number(targetState[`${name}.rate`]);
          if (Number.isFinite(r)) payload.rate = clamp(r, 0, 1);
        } else if (state.rate !== undefined && Number.isFinite(Number(state.rate))) {
          payload.rate = state.rate;
        }
        if (Object.prototype.hasOwnProperty.call(targetState, `${name}.count`)) {
          const c = Number(targetState[`${name}.count`]);
          if (Number.isFinite(c)) payload.count = c;
        } else if (state.count !== undefined && Number.isFinite(Number(state.count))) {
          payload.count = state.count;
        }
        if (Object.prototype.hasOwnProperty.call(targetState, `${name}.depth`)) {
          const d = Number(targetState[`${name}.depth`]);
          if (Number.isFinite(d)) payload.depth = clamp(d, 0, 1);
        } else if (state.depth !== undefined && Number.isFinite(Number(state.depth))) {
          payload.depth = state.depth;
        }
        sendStutter(name, payload, { morphMs });
      }
    }
  }

  function startLinearMorph(targetState, durationSec = 1.0, onComplete) {
    cancelMorph();
    const durationMs = Math.max(50, (Number(durationSec) || 1.0) * 1000);
    emitSnapshotMorphModulatorTargets(targetState, durationMs);
    const startState = cloneControlStates();
    const startTime = Date.now();

    const keys = new Set([
      ...Object.keys(startState),
      ...Object.keys(targetState || {}),
    ]);

    function step() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      const applyStep = () => {
        for (const key of keys) {
          const startVal = Number(startState[key]) || 0;
          const targetVal = Object.prototype.hasOwnProperty.call(targetState, key)
            ? Number(targetState[key])
            : startVal;
          const currentVal = resolveMorphValue(key, startVal, targetVal, progress);
          applyControlValue(key, currentVal);
        }
      };

      if (typeof window.withModulatorEmitSuppressed === 'function') {
        window.withModulatorEmitSuppressed(applyStep);
      } else {
        applyStep();
      }

      if (progress < 1.0) {
        morphRafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(step) : null;
      } else {
        morphRafId = null;
        clearMorphingSlots();
        if (typeof onComplete === 'function') onComplete();
      }
    }

    step();
  }

  function handleSnapshotSlot(idx, btn) {
    if (idx < 0 || idx >= snapshots.length) return;
    if (snapshotCaptureMode) {
      snapshots[idx] = cloneControlStates();
      saveSnapshots();

      const targetSlot = idx + 1;
      if (typeof document !== 'undefined') {
        document.querySelectorAll(`.snapshot-slot[data-slot="${targetSlot}"], .perf-snapshot-slot[data-perf-snapshot-slot="${targetSlot}"]`)
          .forEach(btnEl => {
            btnEl.dataset.flashSaved = 'true';
          });
      }

      updateSnapshotSlotUI();

      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.querySelectorAll(`.snapshot-slot[data-slot="${targetSlot}"], .perf-snapshot-slot[data-perf-snapshot-slot="${targetSlot}"]`)
            .forEach(btnEl => {
              delete btnEl.dataset.flashSaved;
            });
        }
        updateSnapshotSlotUI();
      }, 1500);

      setSnapshotCaptureMode(false);
      return;
    }

    const snap = snapshots[idx];
    if (!snap) return;
    startLinearMorph(snap, resolveMorphDurationSec(), () => {
      if (btn) btn.classList.remove('morphing');
    });
    if (btn) btn.classList.add('morphing');
  }

  let snapshotsInitialized = false;

  function setupSnapshots() {
    loadSnapshots();

    if (typeof document === 'undefined') return;
    if (snapshotsInitialized) {
      updateSnapshotSlotUI();
      return;
    }
    snapshotsInitialized = true;

    [
      document.getElementById('btn-snapshot-capture'),
      document.getElementById('btn-perf-snapshot-capture'),
    ].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => setSnapshotCaptureMode(!snapshotCaptureMode));
    });

    document.querySelectorAll('.snapshot-slot').forEach((btn) => {
      const slotIdx = Number(btn.dataset.slot) - 1;
      btn.addEventListener('click', () => handleSnapshotSlot(slotIdx, btn));
    });

    document.querySelectorAll('.perf-snapshot-slot').forEach((btn) => {
      const slotIdx = Number(btn.dataset.perfSnapshotSlot) - 1;
      btn.addEventListener('click', () => handleSnapshotSlot(slotIdx, btn));
    });

    wireTransitionTime();
    wireMorphMode();
    wireClearSlots();

    updateSnapshotSlotUI();
  }

  // ── wiring for the controls that used to be decorative ──────────────────
  function syncTimeUI() {
    const label = document.getElementById('morph-time-val');
    if (label) label.textContent = morphTimeLabel();
    const slider = document.getElementById('slider-morph-time');
    if (slider) {
      if (morphTimeSync) {
        slider.min = '0';
        slider.max = String(MORPH_SUBDIVISIONS.length - 1);
        slider.step = '1';
        slider.value = String(morphSubdivIndex);
      } else {
        slider.min = '0.1';
        slider.max = '5.0';
        slider.step = '0.1';
        slider.value = morphDurationSec.toFixed(1);
      }
      const progress = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style?.setProperty('--range-progress', `${progress * 100}%`);
      slider.setAttribute?.('aria-valuetext', morphTimeLabel());
    }
    document.querySelectorAll('[data-morph-sync]').forEach((btn) => {
      const on = (btn.dataset.morphSync === 'sync') === morphTimeSync;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function wireTransitionTime() {
    const slider = document.getElementById('slider-morph-time');
    if (slider) {
      slider.addEventListener('input', () => {
        if (morphMode === 'vector' || slider.disabled) return;
        const raw = Number(slider.value);
        if (!Number.isFinite(raw)) return;
        if (morphTimeSync) {
          morphSubdivIndex = Math.min(
            MORPH_SUBDIVISIONS.length - 1,
            Math.max(0, Math.round(raw)),
          );
        } else {
          morphDurationSec = Math.min(5, Math.max(0.1, raw));
        }
        syncTimeUI();
      });
      slider.addEventListener('keydown', (e) => {
        if (morphMode === 'vector' || slider.disabled) {
          e.preventDefault?.();
        }
      });
    }
    document.querySelectorAll('[data-morph-sync]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (morphMode === 'vector' || btn.disabled) return;
        morphTimeSync = btn.dataset.morphSync === 'sync';
        syncTimeUI();
      });
    });
    syncTimeUI();
  }

  function setMorphMode(mode) {
    morphMode = mode === 'vector' ? 'vector' : 'grid';
    const isVector = morphMode === 'vector';
    const vector = document.getElementById('snp-vector-container');
    const grid = document.getElementById('snp-grid-container');
    // The pad in controls.js sizes itself from its own bounding box, so it has
    // to be visible before it measures — un-hide first, then let it resize.
    if (vector) vector.classList.toggle('hidden', !isVector);
    if (grid) grid.classList.toggle('hidden', isVector);
    document.querySelectorAll('[data-morph-mode]').forEach((btn) => {
      const on = btn.dataset.morphMode === morphMode;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });

    // Disable Transition Time controls in Vector mode (F-005)
    const slider = document.getElementById('slider-morph-time');
    if (slider) {
      slider.disabled = isVector;
      if (isVector) {
        slider.setAttribute?.('disabled', '');
      } else {
        slider.removeAttribute?.('disabled');
      }
    }
    document.querySelectorAll('[data-morph-sync]').forEach((btn) => {
      btn.disabled = isVector;
      btn.classList.toggle('disabled', isVector);
      if (isVector) {
        btn.setAttribute?.('disabled', '');
      } else {
        btn.removeAttribute?.('disabled');
      }
    });
    const transGroup = document.getElementById('morph-transition-group');
    if (transGroup) {
      transGroup.classList.toggle('disabled', isVector);
    }
    const timeCtrl = document.querySelector?.('.morph-time-control');
    if (timeCtrl) {
      timeCtrl.classList.toggle('disabled', isVector);
    }

    if (typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('ableton-rc:morph-mode-change'));
      if (isVector) {
        window.dispatchEvent(new Event('resize'));
      }
    }
  }

  function wireMorphMode() {
    document.querySelectorAll('[data-morph-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMorphMode(btn.dataset.morphMode));
    });
    setMorphMode(morphMode);
  }

  function wireClearSlots() {
    const btn = document.getElementById('btn-snapshot-clear');
    if (!btn) return;
    btn.addEventListener('click', () => {
      cancelMorph();
      snapshots = emptySnapshots();
      saveSnapshots();
      updateSnapshotSlotUI();
    });
  }

  // Public API
  window.RCSurface.snapshots = {
    loadSnapshots,
    saveSnapshots,
    getSnapshots: () => snapshots,
    setSnapshotCaptureMode,
    isCaptureMode: () => snapshotCaptureMode,
    handleSnapshotSlot,
    startLinearMorph,
    cancelMorph,
    setupSnapshots,
    updateSnapshotSlotUI,
    getMorphMode: () => morphMode,
    setMorphMode,
    isTimeSynced: () => morphTimeSync,
    getMorphDurationSec: resolveMorphDurationSec,
    getSubdivisions: () => MORPH_SUBDIVISIONS.slice(),
  };
})();
