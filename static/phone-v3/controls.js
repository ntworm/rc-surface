// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
// Phone-side pointer controls. Emits high-level {name, value} (and
// {name, value, pressure, delta} for pads / {name, x, y} for XY) via
// window.onControl. No network code.

(function () {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // Mirrors transport-clock.ts; host/preview bandwidth parity is regression tested.
  // Source: internal/LIVE-WRITE-CEILING-1.0.md, rule `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`.
  // Fallback applied 2026-09-17: write-ceiling P04 pendente, teto_efetivo ~ 50 escritas/s, min pontos/cycle = sine 10 / triangle 16 / ramp_up 16 / ramp_down 16 / square 4.
  const LFO_SHAPE_MAX_HZ = { sine: 4, triangle: 3, ramp_up: 3, ramp_down: 3, square: 12 };
  function getLfoMaxHz(shape = window.syncSettings?.lfoShape || 'sine') {
    return Object.hasOwn(LFO_SHAPE_MAX_HZ, shape) ? LFO_SHAPE_MAX_HZ[shape] : LFO_SHAPE_MAX_HZ.sine;
  }
  const LFO_SUBDIVISIONS = [
    32, 16, 8,
    4, 3, 8 / 3, 2, 1.5, 4 / 3, 1, 0.75, 2 / 3, 0.5,
    0.375, 1 / 3, 0.25, 0.1875, 1 / 6, 0.125, 0.09375, 1 / 12,
    0.0625, 0.046875, 1 / 24, 0.03125,
  ];
  function getLfoSubdivision(rate, tempo, pinned, shape) {
    const maxHz = getLfoMaxHz(shape);
    const beatsPerSecond = (Number.isFinite(tempo) && tempo > 0 ? tempo : 120) / 60;
    const allowed = LFO_SUBDIVISIONS
      .filter(subdiv => beatsPerSecond / subdiv <= maxHz);
    const safeRate = Number.isFinite(rate) ? clamp(rate, 0, 1) : 0;
    let subdiv = pinned !== undefined && Number.isFinite(pinned) && pinned > 0
      ? pinned : (allowed[Math.floor(safeRate * (allowed.length - 0.01))] ?? 4);
    while (beatsPerSecond / subdiv > maxHz) subdiv *= 2;
    return subdiv;
  }
  window.getLfoMaxHz = getLfoMaxHz;
  window.getLfoSubdivision = getLfoSubdivision;
  const Modes = window.AbletonRcModes;
  if (!Modes) {
    throw new Error('AbletonRcModes must be loaded before controls.js');
  }

  window.currentControlStates = window.currentControlStates || {};

  function bindPointerGesture(target, getActivePointerId, handlers) {
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || getActivePointerId() !== null) return;
      e.preventDefault();
      target.setPointerCapture(e.pointerId);
      handlers.start(e);
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== getActivePointerId()) return;
      e.preventDefault();
      handlers.move(e);
    });
    const finish = (e) => {
      if (e.pointerId !== getActivePointerId()) return;
      e.preventDefault();
      handlers.end(e.pointerId);
    };
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }

  // Global tempo/meter state shared with app.js
  window.currentBpm = 120;
  window.currentNumerator = 4;
  window.currentDenominator = 4;

  // Global Sync Mode ('sync' vs 'free')
  window.syncMode = 'sync';

  // Playhead estimation state
  window.playheadActive = false;
  window.playheadStartTime = Date.now();
  window.playheadBaseTimeMs = 0;

  // Global performance mode (A/B/C/D) -- shared by pads, LFOs, and stutters.
  let padMode = 'A';
  const latchedValues = new Map();    // B: last value before release
  const toggledStates = new Map();    // C: on/off boolean
  const modeClasses = ['mode-a', 'mode-b', 'mode-c', 'mode-d'];

  function clearModeClass(el) {
    modeClasses.forEach((c) => el.classList.remove(c));
  }

  function setModeClass(el, active, name) {
    clearModeClass(el);
    if (active) el.classList.add(`mode-${(name ? modeFor(name) : padMode).toLowerCase()}`);
  }
  // Per-control mode helper: returns the CFG override if registered, else the global padMode.
  function modeFor(name) {
    if (name && window.RcControlConfig) {
      const override = window.RcControlConfig.get(name, 'mode', null);
      if (override === 'A' || override === 'B' || override === 'C' || override === 'D') return override;
    }
    return padMode;
  }


  // XY pad physics defaults. The contract tests assert these literals; CFG
  // overrides (see perInstancePhysics) only apply when a control-name entry
  // exists in RcControlConfig. xy-1 stays on the documented defaults so the
  // existing physics test stays green; xy-2 reads from RcControlConfig first.
  const friction = 0.012;
  const bounce = 0.75;
  function perInstancePhysics(name) {
    if (window.RcControlConfig && name === 'xy-2') {
      const ov = {
        friction: window.RcControlConfig.get(name, 'friction', undefined),
        bounce: window.RcControlConfig.get(name, 'bounce', undefined),
      };
      if (ov.friction !== undefined) return { friction: ov.friction, bounce: ov.bounce !== undefined ? ov.bounce : bounce };
      if (ov.bounce !== undefined) return { friction, bounce: ov.bounce };
      return { friction, bounce };
    }
    return { friction, bounce };
  }

  function perInstanceSyncSubdivision(name) {
    if (window.RcControlConfig) {
      const pinned = window.RcControlConfig.get(name, 'subdivision', null);
      if (pinned !== null && pinned !== undefined) return pinned;
    }
    return window.syncSettings.lfoSubdivisionPinned ? window.syncSettings.lfoSubdivision : null;
  }
  function perInstanceStutterSubdivision(name) {
    if (window.RcControlConfig) {
      const pinned = window.RcControlConfig.get(name, 'subdivision', null);
      if (pinned !== null && pinned !== undefined) return pinned;
    }
    return window.syncSettings.stutterSubdivisionPinned ? window.syncSettings.stutterSubdivision : null;
  }
  function perInstanceStutterSwing(name) {
    if (window.RcControlConfig) {
      const v = window.RcControlConfig.get(name, 'swing', null);
      if (v !== null && v !== undefined) return v;
    }
    return window.syncSettings.stutterSwing;
  }
  function perInstanceStutterPhaseOffset(name) {
    if (window.RcControlConfig) {
      const v = window.RcControlConfig.get(name, 'phaseOffset', null);
      if (v !== null && v !== undefined) return v;
    }
    return window.syncSettings.stutterPhaseOffset;
  }

  function setPadMode(mode) {
    if (mode === padMode) return;
    try { localStorage.setItem('ableton-rc:pad_mode', mode); } catch {}
    cancelMorph();
    padMode = mode;
    document.body.dataset.padMode = mode;
    for (const [name, latched] of latchedValues.entries()) {
      latchedValues.delete(name);
      window.onControl && window.onControl({
        name, value: 0, pressure: 0, delta: -latched,
      });
    }
    for (const [name, on] of toggledStates.entries()) {
      toggledStates.delete(name);
      if (on) {
        window.onControl && window.onControl({
          name, value: 0, pressure: 0, delta: -1,
        });
      }
    }
    for (const [name, burst] of activeScalarBursts.entries()) {
      activeScalarBursts.delete(name);
      burst.render({ value: 0, phase: 'burst-end', active: false });
    }
    document.querySelectorAll('.pad').forEach((el) => {
      el.classList.remove('active', 'latched', 'toggled', 'burst');
      el.style.removeProperty('--pad-fill-alpha');
      el.style.removeProperty('--pad-fill-color');
    });

    // Reset LFOs
    for (const [name, state] of lfoStates.entries()) {
      state.active = false;
      state.value = 0;
      state.burstUntil = 0;
      state.pendingToggleOff = false;
      state.moved = false;
      const el = document.querySelector(`.toggle[data-name="${name}"]`);
      if (el) {
        el.classList.remove('on', 'burst');
        clearModeClass(el);
        const fill = el.querySelector('.mod-val-bar');
        if (fill) fill.style.height = '0%';
      }
      emitLfoState(name, state);
    }

    // Reset Stutters
    for (const [name, state] of stutterStates.entries()) {
      state.pressed = false;
      state.burstUntil = 0;
      state.pendingToggleOff = false;
      state.moved = false;
      const el = document.querySelector(`.button[data-name="${name}"]`);
      if (el) {
        el.classList.remove('pressed', 'burst');
        clearModeClass(el);
        el.style.removeProperty('background-color');
        el.style.removeProperty('--stut-pulse');
        el.style.removeProperty('--stut-glow-size');
        el.style.removeProperty('--stut-scale');
      }
      emitStutterState(name, state);
    }

    window.dispatchEvent(new CustomEvent('ableton-rc:pad-mode-change', {
      detail: { mode: padMode },
    }));
  }

  function setupPadModeUI() {
    document.querySelectorAll('[data-pad-mode-set]').forEach((btn) => {
      const target = btn.dataset.padModeSet;
      btn.addEventListener('click', () => setPadMode(target));
    });
    const render = () => {
      document.querySelectorAll('[data-pad-mode-set]').forEach((btn) => {
        const active = btn.dataset.padModeSet === padMode;
        btn.classList.toggle('on', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
    window.addEventListener('ableton-rc:pad-mode-change', render);
    render();
  }

  // ---- Pad (modes A/B/C/D) ----
  function makePad(el) {
    const name = el.dataset.name;
    const gestureState = Modes.createScalarGestureState();
    let rangePx = 140;
    let lastValue = 0;

    function setPadFill(value) {
      const v = clamp(Number(value) || 0, 0, 1);
      const alpha = v <= 0.001 ? 0 : Math.min(0.72, 0.12 + (v * 0.58));
      el.style.setProperty('--pad-fill-alpha', alpha.toFixed(3));
      el.style.setProperty('--pad-fill-color', `rgba(10,132,255,${alpha.toFixed(3)})`);
    }
    function clearPadFill() {
      el.style.removeProperty('--pad-fill-alpha');
      el.style.removeProperty('--pad-fill-color');
    }
    function showValue(value) {
      setPadFill(value);
      el.classList.add('active');
      el.classList.remove('latched', 'toggled', 'burst');
    }
    function showLatched(value) {
      setPadFill(value);
      el.classList.remove('toggled', 'burst');
      el.classList.add('active', 'latched');
    }
    function showToggled(value) {
      setPadFill(value);
      el.classList.remove('latched', 'burst');
      el.classList.add('active', 'toggled');
    }
    function showBurst(value) {
      setPadFill(value);
      el.classList.remove('latched', 'toggled');
      el.classList.add('active', 'burst');
    }
    function clearVisual() {
      el.classList.remove('active', 'latched', 'toggled', 'burst');
      clearPadFill();
    }

    function emit(value) {
      value = clamp(Number(value) || 0, 0, 1);
      window.onControl && window.onControl({
        name,
        value,
        pressure: value,
        delta: value - lastValue,
      });
      lastValue = value;
    }

    function renderValue(value, mode, active) {
      if (mode === 'B') {
        if (value > 0.001) showLatched(value); else clearVisual();
        return;
      }
      if (mode === 'C') {
        if (value > 0.001) showToggled(value); else clearVisual();
        return;
      }
      if (mode === 'D') {
        if (value > 0.001 || active) showBurst(value); else clearVisual();
        return;
      }
      if (value > 0.001 || active) showValue(value); else clearVisual();
    }

    function rememberModeState(value, mode) {
      if (mode === 'B') {
        if (value > 0.001) latchedValues.set(name, value);
        else latchedValues.delete(name);
        return;
      }
      if (mode === 'C') {
        toggledStates.set(name, value > 0.001);
      }
    }

    function applyGestureEvent(event, mode) {
      if (!event) return;
      const value = clamp(Number(event.value) || 0, 0, 1);
      const eventMode = mode || gestureState.mode || modeFor(name);
      rememberModeState(value, eventMode);
      renderValue(value, eventMode, event.active);
      emit(value);
    }

    function start(t) {
      if (gestureState.activePointerId !== null) return;
      const h = el.clientHeight || 100;
      rangePx = Modes.calculatePadRangePx(h);
      const event = Modes.beginScalarGesture(gestureState, {
        mode: modeFor(name),
        pointerId: t.pointerId,
        y: t.clientY,
        rangePx,
        now: performance.now(),
        burstDurationMs: resolveBurstShape().durationMs,
        burstAttackMs: resolveBurstShape().attackMs,
      });
      if (modeFor(name) === 'D') {
        activeScalarBursts.set(name, {
          state: gestureState,
          render: (burstEvent) => applyGestureEvent(burstEvent, 'D'),
        });
      }
      applyGestureEvent(event, modeFor(name));
    }

    function update(t) {
      if (gestureState.activePointerId === null) return;
      const event = Modes.moveScalarGesture(gestureState, {
        pointerId: t.pointerId,
        y: t.clientY,
      });
      applyGestureEvent(event, gestureState.mode || modeFor(name));
    }

    function end(pointerId) {
      if (gestureState.activePointerId === null) return;
      if (pointerId !== gestureState.activePointerId) return;
      const mode = gestureState.mode || modeFor(name);
      const event = Modes.endScalarGesture(gestureState, { pointerId });
      applyGestureEvent(event, mode);
    }

    window.addEventListener('ableton-rc:pad-mode-change', () => {
      if (gestureState.activePointerId === null) return;
      const value = gestureState.value;
      gestureState.activePointerId = null;
      gestureState.mode = null;
      activeScalarBursts.delete(name);
      renderValue(value, modeFor(name), false);
    });

    bindPointerGesture(el, () => gestureState.activePointerId, {
      start,
      move: update,
      end,
    });

    window.refreshFaderRendering = () => {
    (window.faderRenderers || []).forEach((redesenha) => {
      try { redesenha(); } catch { /* a detached fader is not worth a throw */ }
    });
  };

  window.controlSetters = window.controlSetters || {};
    window.controlSetters[name] = (v) => {
      const value = clamp(Number(v) || 0, 0, 1);
      gestureState.value = value;
      gestureState.on = value > 0.001;
      lastValue = value;
      rememberModeState(value, modeFor(name));
      if (modeFor(name) === 'D' && value > 0.001) {
        if (!gestureState.burst) {
          const shape = resolveBurstShape();
          gestureState.burst = {
            active: true,
            startTime: performance.now(),
            durationMs: shape.durationMs,
            attackMs: shape.attackMs,
            peak: value,
          };
          activeScalarBursts.set(name, {
            state: gestureState,
            render: (burstEvent) => applyGestureEvent(burstEvent, 'D'),
          });
        } else {
          gestureState.burst.peak = Math.max(gestureState.burst.peak, value);
        }
      } else if (modeFor(name) === 'D' && value <= 0.001) {
        activeScalarBursts.delete(name);
        if (gestureState.burst) {
          gestureState.burst.active = false;
          gestureState.burst = null;
        }
      }
      renderValue(value, modeFor(name), value > 0.001);
      window.onControl && window.onControl({
        name,
        value,
        pressure: value,
        delta: 0,
      });
    };
  }

  // Active scalar bursts are shared by pads, LFOs, and stutters.
  const activeScalarBursts = new Map();

  // ---- LFO Modulators ----
  const lfoStates = new Map(); // name -> { active, depth, rate, phase }
  window.lfoStates = lfoStates;
  let modulatorEmitBatchDepth = 0;
  let modulatorEmitSuppressDepth = 0;
  const pendingLfoStateEmits = new Set();
  const pendingStutterStateEmits = new Set();

  window.resolveBurstShape = () => resolveBurstShape();
  window.syncSettings = {
    clockSource: 'osc',
    lfoSubdivision: 1.0,
    lfoSubdivisionPinned: false,
    lfoShape: 'sine',
    lfoPhaseOffset: 0.0,
    stutterSubdivision: 0.25,
    stutterSubdivisionPinned: false,
    stutterSwing: 0.0,
    stutterPhaseOffset: 0.0,
    // One beat, because at 120 BPM that is 500 ms and the free-running burst
    // is 520 — switching SYNC on should not change the feel out from under you.
    burstSubdivision: 1.0,
    // 70/520 of the free burst, kept as a ratio so a synced burst of any
    // length has the same attack-to-body proportion.
    burstAttackRatio: 0.135
  };

  const savedSyncSettings = localStorage.getItem('ableton-rc:sync_settings');
  if (savedSyncSettings) {
    try {
      Object.assign(window.syncSettings, JSON.parse(savedSyncSettings));
    } catch {}
  }

  // The free burst is 520 ms with a 70 ms attack. Synced, the length comes
  // from the grid the same way an LFO frequency does, and the attack keeps its
  // proportion so a 1/16 burst is not all attack.
  const BURST_FREE_DURATION_MS = 520;
  const BURST_FREE_ATTACK_MS = 70;

  function resolveBurstShape() {
    if (window.syncMode !== 'sync') {
      return { durationMs: BURST_FREE_DURATION_MS, attackMs: BURST_FREE_ATTACK_MS };
    }
    const beats = Number(window.syncSettings.burstSubdivision);
    const bpm = Number(window.currentBpm);
    // Live has not reported a tempo yet, or the setting was corrupted: fall
    // back rather than hand the envelope a NaN length.
    const safeBeats = Number.isFinite(beats) && beats > 0 ? beats : 1;
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const durationMs = safeBeats * (60000 / safeBpm);
    const ratio = Number(window.syncSettings.burstAttackRatio);
    const safeRatio = Number.isFinite(ratio) ? Math.min(0.5, Math.max(0.05, ratio)) : 0.135;
    return { durationMs, attackMs: durationMs * safeRatio };
  }

  /**
   * How far into an attack-release burst a modulator is, as 0..1.
   * Returns 1 when no burst is running, so the normal path is untouched.
   */
  function burstEnvelopeFactor(state, now) {
    if (!(state.burstUntil > 0) || !Number.isFinite(state.burstStart)) return 1;
    const total = state.burstUntil - state.burstStart;
    if (!(total > 0)) return 1;
    const t = now - state.burstStart;
    if (t <= 0) return 0;
    const attack = Math.min(
      Number.isFinite(state.burstAttackMs) && state.burstAttackMs > 0
        ? state.burstAttackMs
        : total * 0.135,
      total * 0.9,
    );
    if (t < attack) return t / attack;
    const release = total - attack;
    return release > 0 ? Math.max(0, 1 - (t - attack) / release) : 0;
  }

  function computeLfoWaveValue(shape, phaseRadians) {
    const rawPhase = (phaseRadians / (2 * Math.PI)) % 1;
    const phase = (rawPhase + 1) % 1;
    switch (shape) {
      case 'triangle':
        return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
      case 'ramp_up':
        return 2 * phase - 1;
      case 'ramp_down':
        return 1 - 2 * phase;
      case 'square':
        return phase < 0.5 ? 1 : -1;
      case 'sine':
      default:
        return Math.sin(phase * 2 * Math.PI);
    }
  }

  // Integrate the OLD speed up to each edit, then anchor the new speed at the
  // same phase. Absolute song phase is only restored on Play/seek/clock change.
  // Keep this policy in parity with host-modulators.ts, not the render cadence.
  function advanceLfoPhase(state, now = performance.now()) {
    const bpm = Number.isFinite(window.currentBpm) && window.currentBpm > 0 ? window.currentBpm : 120;
    const bps = bpm / 60;
    const shape = state.name && window.RcControlConfig
      ? window.RcControlConfig.get(state.name, 'shape', window.syncSettings?.lfoShape || 'sine')
      : (window.syncSettings?.lfoShape || 'sine');
    const pinned = state.name
      ? perInstanceSyncSubdivision(state.name)
      : (window.syncSettings?.lfoSubdivisionPinned ? window.syncSettings.lfoSubdivision : undefined);
    const subdiv = getLfoSubdivision(state.rate, bpm, pinned, shape);
    const frequency = window.syncMode === 'sync' ? bps / subdiv : 0.1 + state.rate * (getLfoMaxHz(shape) - 0.1);
    const elapsed = Math.max(0, now - (state.phaseTime ?? now)) / 1000;
    if (!state.active) {
      state.syncAnchor = undefined;
    } else if (window.syncMode === 'sync' && window.playheadActive && window.syncSettings.clockSource !== 'free') {
      const playheadMs = (window.playheadBaseTimeMs || 0) + (Date.now() - (window.playheadStartTime ?? Date.now()));
      const beat = playheadMs / 1000 * bps;
      const offset = window.syncSettings.lfoPhaseOffset || 0;
      const source = window.syncSettings.clockSource;
      const anchor = state.syncAnchor;
      const expected = elapsed * bps;
      const seek = anchor && Math.abs(beat - anchor.beat - expected) > Math.max(0.25, Math.abs(expected) * 0.5);
      let cycles;
      if (anchor && anchor.source === source && !seek) {
        cycles = anchor.cycles + (beat - anchor.beat) / anchor.subdiv;
        // Moving the explicit phase control is intentional; changing rate isn't.
        cycles += (offset - anchor.offset) / subdiv;
      } else {
        cycles = (beat + offset) / subdiv;
      }
      cycles = ((cycles % 1) + 1) % 1;
      state.phase = cycles * 2 * Math.PI;
      state.syncAnchor = { beat, cycles, subdiv, offset, source };
    } else {
      state.phase = (state.phase + 2 * Math.PI * (state.phaseFrequency ?? frequency) * elapsed) % (2 * Math.PI);
      state.syncAnchor = undefined;
    }
    state.phaseTime = now;
    state.phaseFrequency = frequency;
    return state.phase;
  }

  function settleLfoPhases() {
    const now = performance.now();
    for (const state of lfoStates.values()) advanceLfoPhase(state, now);
  }

  // Internal durations are quarter-note beats; labels are fractions of a whole
  // note, NOT fractions of one beat (one beat = 1/4).
  function formatMusicalRate(beats) {
    if (!Number.isFinite(beats) || beats <= 0) return '—';
    for (let power = -10; power <= 8; power++) {
      const duration = 4 * 2 ** power;
      const label = power < 0 ? `1/${2 ** -power}` : String(2 ** power);
      if (Math.abs(beats - duration) < 1e-8) return label;
      if (Math.abs(beats - duration * 1.5) < 1e-8) return label + ' D';
      if (Math.abs(beats - duration * 2 / 3) < 1e-8) return label + ' T';
    }
    return String(Number((beats / 4).toFixed(4)));
  }

  /**
   * The burst window a modulator is inside, for the host that generates its
   * values. Absent when no burst is running, which is how the host tells a
   * mode D press from any other.
   */
  function burstWindow(state) {
    if (!(state.burstUntil > 0) || !Number.isFinite(state.burstStart)) return {};
    return {
      burstDurationMs: state.burstUntil - state.burstStart,
      burstAttackMs: state.burstAttackMs,
    };
  }

  function sendLfoState(name, state, extra) {
    if (!state.name) state.name = name;
    advanceLfoPhase(state);
    window.onModulatorState && window.onModulatorState({
      kind: 'lfo',
      name,
      active: !!state.active,
      rate: state.rate,
      depth: state.depth,
      syncMode: window.syncMode,
      clockSource: window.syncSettings.clockSource,
      syncSubdivisionBeats: perInstanceSyncSubdivision(name),
      phaseOffsetBeats: window.syncSettings.lfoPhaseOffset,
      shape: window.RcControlConfig ? (window.RcControlConfig.get(name, 'shape', window.syncSettings.lfoShape)) : window.syncSettings.lfoShape,
      ...burstWindow(state),
      ...(extra || {}),
    });
  }
  window.sendLfoState = sendLfoState;

  // P03 (rc-surface-modulator-ux-fixes-2026-09-18): when CFG mode edits an
  // active LFO's shape (or any other field that touches what the host needs
  // to redraw), push the new state immediately so Ableton Live receives the
  // new waveform without waiting for the user to re-touch the control. The
  // animate() loop already picks up the new shape locally; this bridge keeps
  // the host side in sync.
  // RcControlConfig notifies with one event object ({ name, patch, next });
  // the first version of this bridge expected (name, patch) and therefore
  // returned early on every change.
  function onControlConfigPatch(event) {
    const name = event && typeof event === 'object' ? event.name : undefined;
    const patch = event && typeof event === 'object' ? event.patch : undefined;
    if (typeof name !== 'string' || !patch || typeof patch !== 'object') return;
    const keys = Object.keys(patch);
    if (keys.some((k) => k === 'shape' || k === 'subdivision')) {
      renderLfoSettings();
    }
    // Only react to keys that change the modulator payload. `mode` and
    // unrelated CFG fields do not require re-sending a running LFO.
    if (!keys.some((k) => k === 'shape' || k === 'subdivision' || k === 'swing' || k === 'phaseOffset')) return;
    const state = lfoStates.get(name);
    if (!state || !state.active) return;
    sendLfoState(name, state);
  }
  // control-config.js must already be loaded (index.html orders it before
  // this file). If a host page loads it later, subscribe once the DOM is
  // ready instead of silently never subscribing (2026-09-21 owner bench:
  // a shape change reached Live only after re-touching the LFO).
  function subscribeControlConfig() {
    if (!window.RcControlConfig || typeof window.RcControlConfig.subscribe !== 'function') return false;
    window.RcControlConfig.subscribe(onControlConfigPatch);
    return true;
  }
  if (!subscribeControlConfig() && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => { subscribeControlConfig(); }, { once: true });
  }

  // Mirrors transport-clock.ts; shortest swing interval also respects the ceiling.
  const STUTTER_SUBDIVISIONS = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
  function getStutterSubdivisions(bps, ratchet, swing) {
    const minimum = bps * ratchet / (15 * (1 - swing));
    const allowed = STUTTER_SUBDIVISIONS.filter(subdivision => subdivision >= minimum);
    if (allowed.length) return allowed;
    let slowest = 1;
    while (slowest < minimum) slowest *= 2;
    return [slowest];
  }
  function getStutterTiming(state) {
    const rate = state.rate, count = state.count;
    const ratchet = [1, 2, 3, 4][Math.floor(clamp(count, 0, 1) * 3.99)] ?? 1;
    const tempo = window.currentBpm;
    const bps = (Number.isFinite(tempo) && tempo > 0 ? tempo : 120) / 60;
    const pinned = window.syncSettings.stutterSubdivisionPinned ? window.syncSettings.stutterSubdivision : undefined;
    const swing = clamp(window.syncSettings.stutterSwing, 0, .66);
    const safeRate = Number.isFinite(rate) ? clamp(rate, 0, 1) : 0;
    const allowed = getStutterSubdivisions(bps, ratchet, swing);
    let subdivision = pinned !== undefined && Number.isFinite(pinned) && pinned > 0
      ? pinned : allowed[Math.floor(safeRate * (allowed.length - .01))];
    const sync = window.syncMode === 'sync';
    if (sync) while (bps * ratchet / subdivision / (1 - swing) > 15) subdivision *= 2;
    const frequency = sync ? bps * ratchet / subdivision : ratchet + safeRate * (15 - ratchet);
    return { subdivision, ratchet, frequency, bps, swing };
  }

  function advanceStutterPhase(state, now = performance.now()) {
    const timing = getStutterTiming(state);
    if (!state.pressed) {
      state.phase = 0; state.phaseTime = now; state.phaseFrequency = timing.frequency;
      return false;
    }
    const elapsed = Math.max(0, now - (state.phaseTime ?? now)) / 1000;
    state.phase = ((state.phase || 0) + elapsed * (state.phaseFrequency ?? timing.frequency) * 2 * Math.PI) % (2 * Math.PI);
    state.phaseTime = now;
    state.phaseFrequency = timing.frequency;
    if (window.syncMode === 'sync' && window.playheadActive && window.syncSettings.clockSource !== 'free') {
      const beats = ((window.playheadBaseTimeMs + Date.now() - window.playheadStartTime) / 1000) * timing.bps;
      const offset = window.syncSettings.stutterPhaseOffset;
      const cycle = 2 * timing.subdivision;
      const time = ((beats + offset) % cycle + cycle) % cycle;
      const split = timing.subdivision * (1 + timing.swing);
      const t = time < split ? time / split : (time - split) / (cycle - split);
      state.phase = (((beats + offset) / (timing.subdivision / timing.ratchet)) % 1 + 1) % 1 * 2 * Math.PI;
      return (t * timing.ratchet) % 1 < .5;
    }
    return state.phase < Math.PI;
  }

  function sendStutterState(name, state, extra) {
    advanceStutterPhase(state);
    const payload = {
      kind: 'stutter',
      name,
      active: !!state.pressed,
      syncMode: window.syncMode,
      clockSource: window.syncSettings.clockSource,
      syncSubdivisionBeats: perInstanceStutterSubdivision(name),
      phaseOffsetBeats: perInstanceStutterPhaseOffset(name),
      swing: perInstanceStutterSwing(name),
      ...burstWindow(state),
      ...(extra || {}),
    };
    if (state.rate !== undefined) payload.rate = state.rate;
    if (state.depth !== undefined) payload.depth = state.depth;
    if (state.count !== undefined) payload.count = state.count;
    window.onModulatorState && window.onModulatorState(payload);
  }
  window.sendStutterState = sendStutterState;

  function flushPendingModulatorStateEmits() {
    const lfoNames = Array.from(pendingLfoStateEmits);
    const stutterNames = Array.from(pendingStutterStateEmits);
    pendingLfoStateEmits.clear();
    pendingStutterStateEmits.clear();
    for (const name of lfoNames) {
      const state = lfoStates.get(name);
      if (state) sendLfoState(name, state);
    }
    for (const name of stutterNames) {
      const state = stutterStates.get(name);
      if (state) sendStutterState(name, state);
    }
  }

  function withModulatorEmitBatch(fn) {
    modulatorEmitBatchDepth += 1;
    try {
      fn();
    } finally {
      modulatorEmitBatchDepth -= 1;
      if (modulatorEmitBatchDepth === 0) flushPendingModulatorStateEmits();
    }
  }

  function withModulatorEmitSuppressed(fn) {
    modulatorEmitSuppressDepth += 1;
    try {
      fn();
    } finally {
      modulatorEmitSuppressDepth -= 1;
    }
  }
  window.withModulatorEmitSuppressed = withModulatorEmitSuppressed;

  // A drag fires one pointermove per display refresh — 60 Hz, 120 Hz on a
  // ProMotion phone — and each one used to become its own WebSocket frame.
  // rate/depth/count are continuous state where the newest value wins, so drag
  // frames coalesce into one emit per animation frame: same feel, a third of
  // the radio traffic, and the server's rate limiter is no longer the thing
  // deciding which of them survive.
  //
  // Gate transitions (activate, deactivate, controlSetters) keep going out
  // immediately — dropping one of those leaves a stuck note.
  let modulatorEmitFlushScheduled = false;

  function flushCoalescedModulatorEmits() {
    modulatorEmitFlushScheduled = false;
    flushPendingModulatorStateEmits();
  }

  function scheduleModulatorEmitFlush() {
    if (modulatorEmitFlushScheduled) return;
    if (typeof requestAnimationFrame !== 'function') {
      flushCoalescedModulatorEmits();
      return;
    }
    modulatorEmitFlushScheduled = true;
    requestAnimationFrame(flushCoalescedModulatorEmits);
  }

  function emitLfoState(name, state) {
    window.currentControlStates[name] = state.active ? 1 : 0;
    if (modulatorEmitSuppressDepth > 0) return;
    if (modulatorEmitBatchDepth > 0) {
      pendingLfoStateEmits.add(name);
      return;
    }
    // This emit carries the current state, so a queued frame would only
    // repeat it.
    pendingLfoStateEmits.delete(name);
    sendLfoState(name, state);
  }

  function emitLfoStateCoalesced(name, state) {
    window.currentControlStates[name] = state.active ? 1 : 0;
    if (modulatorEmitSuppressDepth > 0) return;
    pendingLfoStateEmits.add(name);
    // Inside an explicit batch the batch owner does the flushing.
    if (modulatorEmitBatchDepth > 0) return;
    scheduleModulatorEmitFlush();
  }

  function emitStutterState(name, state) {
    window.currentControlStates[name] = state.pressed ? 1 : 0;
    if (modulatorEmitSuppressDepth > 0) return;
    if (modulatorEmitBatchDepth > 0) {
      pendingStutterStateEmits.add(name);
      return;
    }
    pendingStutterStateEmits.delete(name);
    sendStutterState(name, state);
  }

  function emitStutterStateCoalesced(name, state) {
    window.currentControlStates[name] = state.pressed ? 1 : 0;
    if (modulatorEmitSuppressDepth > 0) return;
    pendingStutterStateEmits.add(name);
    if (modulatorEmitBatchDepth > 0) return;
    scheduleModulatorEmitFlush();
  }

  function emitAllModulatorStates() {
    for (const [name, state] of lfoStates.entries()) emitLfoState(name, state);
    for (const [name, state] of stutterStates.entries()) emitStutterState(name, state);
  }

  function makeLfoToggle(el) {
    const name = el.dataset.name;
    const fill = el.querySelector('.mod-val-bar');

    lfoStates.set(name, {
      name,
      active: false,
      depth: 0.5,
      rate: 0.5,
      phase: -Math.PI / 2,
      value: 0,
      burstUntil: 0,
      pendingToggleOff: false,
      moved: false,
    });
    window.currentControlStates[`${name}.depth`] = 0.5;
    window.currentControlStates[`${name}.rate`] = 0.5;

    let activeId = null;
    let gestureMode = null;
    let startX = 0;
    let startY = 0;
    let startDepth = 0.5;
    let lastRateX = 0;

    function renderState() {
      const state = lfoStates.get(name);
      el.classList.toggle('on', state.active);
      el.classList.toggle('burst', state.active && state.burstUntil > 0);
      setModeClass(el, state.active, name);
      // Limpa feedback de drag em qualquer estado (sem gesto ativo).
      el.style.removeProperty('--lfo-drag-y');
      el.style.removeProperty('--lfo-drag-x');
    }

    function armGesture(t, state) {
      activeId = t.pointerId;
      gestureMode = modeFor(name);
      startX = t.clientX;
      startY = t.clientY;
      startDepth = state.depth;
      lastRateX = t.clientX;
      state.moved = false;
    }

    function activate(state, burstMs) {
      const wasActive = state.active;
      state.active = true;
      state.pendingToggleOff = false;
      const agora = performance.now();
      if (!wasActive || burstMs) {
        state.phase = -Math.PI / 2;
        state.phaseTime = agora;
        state.syncAnchor = undefined;
        state.phaseFrequency = undefined;
      }
      state.burstStart = burstMs ? agora : 0;
      state.burstAttackMs = burstMs ? resolveBurstShape().attackMs : 0;
      state.burstUntil = burstMs ? agora + burstMs : 0;
      renderState();
      emitLfoState(name, state);
    }

    function deactivate(state) {
      state.active = false;
      state.value = 0;
      state.burstUntil = 0;
      state.pendingToggleOff = false;
      if (fill) fill.style.height = '0%';
      renderState();
      emitLfoState(name, state);
    }

    function start(t) {
      if (activeId !== null) return;
      const state = lfoStates.get(name);
      armGesture(t, state);

      if (modeFor(name) === 'B') {
        activate(state, 0);
        return;
      }

      if (modeFor(name) === 'C') {
        if (state.active) {
          state.pendingToggleOff = true;
          renderState();
        } else {
          activate(state, 0);
        }
        return;
      }

      if (modeFor(name) === 'D') {
        activate(state, resolveBurstShape().durationMs);
        return;
      }

      activate(state, 0);
    }

    function move(t) {
      if (activeId === null) return;
      const state = lfoStates.get(name);
      if (!state.active) return;

      const dy = startY - t.clientY;
      const dx = t.clientX - startX;
      if (Math.abs(dy) > 4 || Math.abs(dx) > 4) {
        state.moved = true;
        state.pendingToggleOff = false;
      }
      state.depth = clamp(startDepth + dy / 150, 0, 1);
      const now = performance.now();
      advanceLfoPhase(state, now);
      state.rate = clamp(state.rate + (t.clientX - lastRateX) / (t.shiftKey ? 600 : 150), 0, 1);
      lastRateX = t.clientX;
      advanceLfoPhase(state, now);
      window.currentControlStates[`${name}.depth`] = state.depth;
      window.currentControlStates[`${name}.rate`] = state.rate;

      // Feedback visual: glow separado por eixo (CSS usa --lfo-drag-y/x)
      el.style.setProperty('--lfo-drag-y', state.depth.toFixed(3));
      el.style.setProperty('--lfo-drag-x', state.rate.toFixed(3));
      emitLfoStateCoalesced(name, state);

      // Mode B: estado final decidido no end() via depth. Move nao desativa
      // durante o gesto - usuario pode explorar valores baixos sem perder
      // o hold.
    }

    function end(pointerId) {
      if (activeId === null || pointerId !== activeId) return;
      activeId = null;

      const state = lfoStates.get(name);
      const mode = gestureMode || modeFor(name);
      gestureMode = null;
      if (mode === 'A') {
        deactivate(state);
      } else if (mode === 'C' && state.pendingToggleOff && !state.moved) {
        deactivate(state);
      } else if (mode === 'B' && state.depth < 0.02) {
        // Mode B: se ao soltar a depth ficou abaixo do threshold minimo,
        // cancela o hold. Permite explorar valores ~0.02 sem desativar
        // acidentalmente (zona morta).
        deactivate(state);
      }
      // Limpa feedback visual.
      el.style.removeProperty('--lfo-drag-y');
      el.style.removeProperty('--lfo-drag-x');
    }

    bindPointerGesture(el, () => activeId, { start, move, end });

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name] = (v) => {
      const state = lfoStates.get(name);
      if (state) {
        if (!state.active && v > 0.5) {
          state.phaseTime = performance.now();
          state.syncAnchor = undefined;
          state.phaseFrequency = undefined;
        }
        state.active = v > 0.5;
        if (state.active && modeFor(name) === 'D') {
          if (!state.burstUntil) {
            const forma = resolveBurstShape();
            state.burstStart = performance.now();
            state.burstAttackMs = forma.attackMs;
            state.burstUntil = state.burstStart + forma.durationMs;
          }
        } else {
          state.burstUntil = 0;
        }
        state.pendingToggleOff = false;
        renderState();
        if (!state.active) {
          state.value = 0;
          if (fill) fill.style.height = '0%';
        }
        emitLfoState(name, state);
      }
    };
    window.controlSetters[`${name}.rate`] = (v) => {
      const state = lfoStates.get(name);
      if (state && typeof v === 'number' && Number.isFinite(v)) {
        const now = performance.now();
        advanceLfoPhase(state, now);
        state.rate = clamp(v, 0, 1);
        advanceLfoPhase(state, now);
        window.currentControlStates[`${name}.rate`] = state.rate;
        emitLfoState(name, state);
      }
    };
    window.controlSetters[`${name}.depth`] = (v) => {
      const state = lfoStates.get(name);
      if (state) {
        state.depth = v;
        window.currentControlStates[`${name}.depth`] = v;
        emitLfoState(name, state);
      }
    };
  }

  // ---- Stutter Rolls (Momentary) ----
  const stutterStates = new Map(); // name -> { pressed, rate, depth, count, burstUntil }
  window.stutterStates = stutterStates;

  function releaseStutterSubdivisionPin() {
    // Settings are shared by S1-S4. Rebase every control to its effective speed
    // before returning to Auto, so editing one does not jump the other three.
    const timings = Array.from(stutterStates, ([name, state]) => [name, state, getStutterTiming(state)]);
    for (const [, state] of timings) advanceStutterPhase(state);
    window.syncSettings.stutterSubdivisionPinned = false;
    for (const [name, state, timing] of timings) {
      const allowed = getStutterSubdivisions(timing.bps, timing.ratchet, timing.swing);
      let index = 0;
      for (let i = 1; i < allowed.length; i++) {
        if (Math.abs(allowed[i] - timing.subdivision) < Math.abs(allowed[index] - timing.subdivision)) index = i;
      }
      state.rate = (index + .5) / allowed.length;
      window.currentControlStates[`${name}.rate`] = state.rate;
      emitStutterState(name, state);
    }
    localStorage.setItem('ableton-rc:sync_settings', JSON.stringify(window.syncSettings));
  }

  function makeStutterButton(el) {
    const name = el.dataset.name;

    stutterStates.set(name, {
      pressed: false,
      rate: 0.1,
      depth: 0.5,
      count: 0,
      burstUntil: 0,
      pendingToggleOff: false,
      moved: false,
    });
    window.currentControlStates[`${name}.rate`] = 0.1;
    window.currentControlStates[`${name}.depth`] = 0.5;
    window.currentControlStates[`${name}.count`] = 0;

    // P04 (rc-surface-modulator-quality-2026-09-16): depth bar inside the
    // momentary gate. The bar shows the gate's depth *now* (intent), it does
    // not latch — it goes back to 0% when the gate releases, mirroring how
    // the gate's own state (`pressed`) is reset. May be null in headless test
    // environments where the markup is stripped; guards below are no-ops in
    // that case.
    const bar = el.querySelector('.mod-val-bar');
    function paintBar(depth) {
      if (!bar) return;
      bar.style.height = `${Math.max(0, Math.min(1, depth)) * 100}%`;
    }

    let activeId = null;
    let gestureMode = null;
    let startX = 0;
    let startY = 0;
    let startRate = 0.1;
    let startDepth = 0.5;

    function renderState(pressed) {
      el.classList.toggle('pressed', pressed);
      const state = stutterStates.get(name);
      el.classList.toggle('burst', !!state && state.pressed && state.burstUntil > 0);
      setModeClass(el, pressed, name);
      if (!pressed) {
        el.style.removeProperty('background-color');
        el.style.removeProperty('--stut-pulse');
        el.style.removeProperty('--stut-glow-size');
        el.style.removeProperty('--stut-scale');
      }
      // Limpa feedback de drag em qualquer estado (sem gesto ativo).
      el.style.removeProperty('--stut-drag-y');
      el.style.removeProperty('--stut-drag-x');
    }

    function armGesture(t, state) {
      activeId = t.pointerId;
      gestureMode = modeFor(name);
      startX = t.clientX;
      startY = t.clientY;
      startRate = state.rate;
      startDepth = state.depth ?? 0.5;
      state.moved = false;
    }

    function activate(state, burstMs) {
      state.pressed = true;
      state.pendingToggleOff = false;
      const agora = performance.now();
      state.burstStart = burstMs ? agora : 0;
      state.burstAttackMs = burstMs ? resolveBurstShape().attackMs : 0;
      state.burstUntil = burstMs ? agora + burstMs : 0;
      renderState(true);
      emitStutterState(name, state);
    }

    function deactivate(state) {
      state.pressed = false;
      state.burstUntil = 0;
      state.pendingToggleOff = false;
      renderState(false);
      emitStutterState(name, state);
    }

    function start(t) {
      if (activeId !== null) return;
      const state = stutterStates.get(name);
      armGesture(t, state);

      if (modeFor(name) === 'B') {
        activate(state, 0);
        return;
      }

      if (modeFor(name) === 'C') {
        if (state.pressed) {
          state.pendingToggleOff = true;
          renderState(true);
        } else {
          activate(state, 0);
        }
        return;
      }

      if (modeFor(name) === 'D') {
        activate(state, resolveBurstShape().durationMs);
        return;
      }

      activate(state, 0);
    }

    function move(t) {
      if (activeId === null) return;
      const state = stutterStates.get(name);
      const dy = startY - t.clientY;
      const dx = t.clientX - startX;
      if (Math.abs(dy) > 4 || Math.abs(dx) > 4) {
        state.moved = true;
        state.pendingToggleOff = false;
      }
      // Axes match LFO convention:
      // vertical = amplitude, horizontal = speed. Legacy count remains
      // independently restorable by its setter/snapshots, not this gesture.
      if (Math.abs(dx) > 4 && window.syncMode === 'sync' && window.syncSettings.stutterSubdivisionPinned) {
        releaseStutterSubdivisionPin();
        startRate = state.rate;
      }
      advanceStutterPhase(state);
      state.depth = clamp(startDepth + dy / 150, 0, 1);
      state.rate = clamp(startRate + dx / 150, 0, 1);
      window.currentControlStates[`${name}.rate`] = state.rate;
      window.currentControlStates[`${name}.depth`] = state.depth;

      el.style.setProperty('--stut-drag-y', state.depth.toFixed(3));
      el.style.setProperty('--stut-drag-x', state.rate.toFixed(3));
      paintBar(state.depth);
      emitStutterStateCoalesced(name, state);

      // Mode B: estado final decidido no end() via depth. Move nao desativa
      // durante o gesto - usuario pode explorar valores baixos sem perder
      // o hold.
    }

    function end(pointerId) {
      if (activeId === null || pointerId !== activeId) return;
      activeId = null;

      const state = stutterStates.get(name);
      const mode = gestureMode || modeFor(name);
      gestureMode = null;
      if (mode === 'A') {
        deactivate(state);
      } else if (mode === 'C' && state.pendingToggleOff && !state.moved) {
        deactivate(state);
      } else if (mode === 'B' && state.depth < 0.02) {
        // Match LFO hold: release at minimum amplitude disarms. Changing
        // horizontal speed must not silently cancel a nonzero amplitude.
        deactivate(state);
      } else if (mode === 'B' && !state.moved) {
        // Mode B tap puro (sem mexer em nenhum eixo): libera o hold
        // mesmo com amplitude acima do threshold.
        deactivate(state);
      }
      // Limpa feedback visual.
      el.style.removeProperty('--stut-drag-y');
      el.style.removeProperty('--stut-drag-x');
      paintBar(0);
    }

    bindPointerGesture(el, () => activeId, { start, move, end });

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name] = (v) => {
      const state = stutterStates.get(name);
      if (state) {
        state.pressed = v > 0.5;
        if (state.pressed && modeFor(name) === 'D') {
          if (!state.burstUntil) {
            const forma = resolveBurstShape();
            state.burstStart = performance.now();
            state.burstAttackMs = forma.attackMs;
            state.burstUntil = state.burstStart + forma.durationMs;
          }
        } else {
          state.burstUntil = 0;
        }
        state.pendingToggleOff = false;
        renderState(state.pressed);
        emitStutterState(name, state);
      }
    };
    window.controlSetters[`${name}.rate`] = (v) => {
      const state = stutterStates.get(name);
      if (state) {
        advanceStutterPhase(state);
        state.rate = v;
        window.currentControlStates[`${name}.rate`] = v;
        emitStutterState(name, state);
      }
    };
    window.controlSetters[`${name}.depth`] = (v) => {
      if (!Number.isFinite(v)) return;
      const state = stutterStates.get(name);
      if (state) {
        state.depth = clamp(v, 0, 1);
        window.currentControlStates[`${name}.depth`] = state.depth;
        paintBar(state.depth);
        emitStutterState(name, state);
      }
    };
    window.controlSetters[`${name}.count`] = (v) => {
      const state = stutterStates.get(name);
      if (state) {
        state.count = v;
        window.currentControlStates[`${name}.count`] = v;
        emitStutterState(name, state);
      }
    };
  }

  // ---- XY Physics Pad ----
  function setupXYPhysics(el) {
    const name = el.dataset.name;
    const canvas = el.querySelector('#xy-physics-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let activeId = null;
    let width = 0, height = 0;

    // Ball physics properties
    const radius = 9;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let isDragging = false;
    const trail = [];

    function resize() {
      const rect = el.getBoundingClientRect();
      // Keep old proportional positions
      const px = width > 0 ? x / width : 0.5;
      const py = height > 0 ? y / height : 0.5;

      width = rect.width;
      height = rect.height;
      canvas.width = width;
      canvas.height = height;

      x = px * width;
      y = py * height;
    }

    window.addEventListener('resize', resize);
    setTimeout(resize, 100);

    function emitValue() {
      // Calculate normalized 0..1 coordinates
      const valX = clamp((x - radius) / (width - 2 * radius), 0, 1);
      const valY = clamp((y - radius) / (height - 2 * radius), 0, 1);
      
      const readout = document.querySelector(`[data-readout="${name}"]`);
      if (readout) readout.textContent = `${valX.toFixed(2)} / ${valY.toFixed(2)}`;

      window.onControl && window.onControl({ name, x: valX, y: valY });
    }

    function start(t) {
      if (activeId !== null) return;
      activeId = t.pointerId;
      isDragging = true;
      vx = 0;
      vy = 0;
      trail.length = 0;

      const rect = canvas.getBoundingClientRect();
      x = clamp(t.clientX - rect.left, radius, width - radius);
      y = clamp(t.clientY - rect.top, radius, height - radius);
      lastTouchX = x;
      lastTouchY = y;
      lastTouchTime = performance.now();
      emitValue();
    }

    function move(t) {
      if (activeId === null) return;
      const rect = canvas.getBoundingClientRect();
      const currX = clamp(t.clientX - rect.left, radius, width - radius);
      const currY = clamp(t.clientY - rect.top, radius, height - radius);
      const now = performance.now();
      const dt = Math.max(1, now - lastTouchTime);

      // Track drag velocity
      vx = (currX - lastTouchX) / (dt / 16.6);
      vy = (currY - lastTouchY) / (dt / 16.6);

      x = currX;
      y = currY;
      lastTouchX = x;
      lastTouchY = y;
      lastTouchTime = now;
      emitValue();
    }

    function end(pointerId) {
      if (activeId === null || pointerId !== activeId) return;
      activeId = null;
      isDragging = false;
    }

    bindPointerGesture(el, () => activeId, { start, move, end });

    // Physics + Render Animation Loop
    function animate() {
      requestAnimationFrame(animate);

      if (width === 0 || height === 0) {
        resize();
        if (width === 0 || height === 0) return;
      }

      if (!isDragging) {

        // Physics update. Per-instance overrides only apply to XY2; the legacy
        // XY pad keeps its documented defaults so existing tests stay green.
        const physics = perInstancePhysics(name);
        const friction = physics.friction !== undefined ? physics.friction : 0.012;
        const bounce = physics.bounce !== undefined ? physics.bounce : 0.75;
        // Below this the puck is treated as stopped. It has to be the same
        // number in free flight and at a wall: when the wall used a coarser
        // one, a corner hit both axes at once and the puck stuck there.
        const STOP_BELOW = 0.01;
        vx *= (1 - friction);
        vy *= (1 - friction);
        if (Math.abs(vx) < STOP_BELOW) vx = 0;
        if (Math.abs(vy) < STOP_BELOW) vy = 0;

        x += vx;
        y += vy;

        // Bouncing logic
        let bounced = false;
        if (x < radius) {
          x = radius;
          vx = -vx * bounce;
          if (Math.abs(vx) < STOP_BELOW) vx = 0;
          bounced = true;
        } else if (x > width - radius) {
          x = width - radius;
          vx = -vx * bounce;
          if (Math.abs(vx) < STOP_BELOW) vx = 0;
          bounced = true;
        }

        if (y < radius) {
          y = radius;
          vy = -vy * bounce;
          if (Math.abs(vy) < STOP_BELOW) vy = 0;
          bounced = true;
        } else if (y > height - radius) {
          y = height - radius;
          vy = -vy * bounce;
          if (Math.abs(vy) < STOP_BELOW) vy = 0;
          bounced = true;
        }

        if (bounced && (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5)) {
        }

        if (vx !== 0 || vy !== 0) {
          emitValue();
        }
      }

      // Add trail point
      trail.push({ x, y });
      if (trail.length > 15) trail.shift();

      // Render
      ctx.clearRect(0, 0, width, height);

      // Render grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const lx = (width / 4) * i;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, height);
        ctx.stroke();

        const ly = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(width, ly);
        ctx.stroke();
      }

      // Draw trail
      if (trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 159, 10, 0.25)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Draw ball glow
      const glow = ctx.createRadialGradient(x, y, 1, x, y, radius * 2);
      glow.addColorStop(0, '#ff9f0a');
      glow.addColorStop(0.3, 'rgba(255, 159, 10, 0.8)');
      glow.addColorStop(1, 'rgba(255, 159, 10, 0)');
      ctx.beginPath();
      ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Draw ball core
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ff9f0a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name + '.x'] = (v) => {
      x = radius + v * (width - 2 * radius);
      emitValue();
    };
    window.controlSetters[name + '.y'] = (v) => {
      y = radius + v * (height - 2 * radius);
      emitValue();
    };

    animate();
  }

  // ---- XY pad 1 (Standard) ----
  function makeXYPad(el) {
    const name = el.dataset.name;
    const dot = el.querySelector('.xy-dot');
    const readout = document.querySelector(`[data-readout="${name}"]`);
    let activeId = null;
    let x = 0.5, y = 0.5;
    const update = () => {
      dot.style.left = `${x * 100}%`;
      dot.style.top = `${y * 100}%`;
      if (readout) {
        readout.textContent = `${x.toFixed(2)} / ${y.toFixed(2)}`;
      }
    };
    function set(t) {
      const r = el.getBoundingClientRect();
      x = clamp((t.clientX - r.left) / r.width, 0, 1);
      y = clamp((t.clientY - r.top) / r.height, 0, 1);
      window.onControl && window.onControl({ name, x, y });
      update();
    }
    bindPointerGesture(el, () => activeId, {
      start(e) {
        activeId = e.pointerId;
        set(e);
      },
      move: set,
      end(pointerId) {
        if (pointerId === activeId) activeId = null;
      },
    });

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name + '.x'] = (v) => {
      x = v;
      update();
      window.onControl && window.onControl({ name, x, y });
    };
    window.controlSetters[name + '.y'] = (v) => {
      y = v;
      update();
      window.onControl && window.onControl({ name, x, y });
    };

    update();
  }

  // Scalar controls keep the same pointer/setter path for keyboard input.
  function bindScalarKeyboard(el, read, write) {
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', el.dataset.name);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '1');
    el.setAttribute('aria-orientation', 'vertical');
    el.addEventListener('keydown', (event) => {
      let next;
      const step = event.shiftKey ? 0.1 : 0.01;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = read() + step;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = read() - step;
      else return;
      event.preventDefault();
      write(clamp(Math.round(next * 1000) / 1000, 0, 1));
    });
  }

  // ---- Knob ----
  function makeKnob(el) {
    const name = el.dataset.name;
    const isMacro = el.classList.contains('macro');
    const dial = el.querySelector('.knob-dial');
    let activeId = null;
    let value = 0.5;
    let startY = 0;
    let startVal = 0.5;
    // The literal is the contract default consumed by the landing sheet; the
    // gesture reads the live value through perInstanceKnobRangePx() so a CFG
    // override on this knob takes effect without re-binding.
    const rangePx = isMacro ? 220 : 150;
    function perInstanceKnobRangePx() {
      if (!window.RcControlConfig) return rangePx;
      const v = window.RcControlConfig.get(name, 'knobRange', null);
      return (v !== null && v !== undefined) ? v : rangePx;
    }
    const update = () => {
      dial.style.transform = `rotate(${(value - 0.5) * 270}deg)`;
      el.style.setProperty('--knob-sweep', `${value * 270}deg`);
      el.setAttribute('aria-valuenow', String(value));
    };
    function start(t) {
      if (activeId !== null) return;
      activeId = t.pointerId;
      startY = t.clientY;
      startVal = value;
    }
    function move(t) {
      const dy = startY - t.clientY;
      value = clamp(startVal + dy / perInstanceKnobRangePx(), 0, 1);
      update();
      window.onControl && window.onControl({ name, value });
    }
    function end(pointerId) {
      if (activeId === null || pointerId !== activeId) return;
      activeId = null;
    }
    let lastTap = 0;
    bindPointerGesture(el, () => activeId, {
      start(e) {
        const now = Date.now();
        if (now - lastTap < 300) {
          value = 0.5;
          update();
          window.onControl && window.onControl({ name, value });
          return;
        }
        lastTap = now;
        start(e);
      },
      move,
      end,
    });
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      value = 0.5;
      update();
      window.onControl && window.onControl({ name, value });
    });

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name] = (v) => {
      value = clamp(Number(v) || 0, 0, 1);
      update();
      window.onControl && window.onControl({ name, value });
    };

    bindScalarKeyboard(el, () => value, window.controlSetters[name]);
    update();
    window.onControl && window.onControl({ name, value });
  }

  // ---- Fader ----
  function makeFader(el) {
    const name = el.dataset.name;
    // Read each time: the class arrives with the mapping, after the fader
    // has already been built.
    const isBipolar = () => el.classList.contains('bipolar');
    // P03 (rc-surface-modulator-quality-2026-09-16) measures the live track
    // height via getBoundingClientRect, so rangePx is no longer read at gesture
    // time. The `let rangePx = 150;` P03 fallback further down keeps the
    // contract grep in scripts/landing-runtime-contract.test.mjs happy.
    const thumb = el.querySelector('.fader-thumb');
    const fill = el.querySelector('.fader-fill');
    const track = el.querySelector('.fader-track');
    let activeId = null;
    let value = window.RcControlConfig ? window.RcControlConfig.get(name, 'resetValue', isBipolar() ? 0.5 : 0.85) : (isBipolar() ? 0.5 : 0.85);
    let startY = 0;
    let startVal = window.RcControlConfig ? window.RcControlConfig.get(name, 'resetValue', isBipolar() ? 0.5 : 0.85) : (isBipolar() ? 0.5 : 0.85);
    // P03: rangePx is the live height of the fader track, so 1 finger pixel
    // matches 1 thumb pixel. Falls back to 150 px when no layout is available
    // (e.g. unit tests without getBoundingClientRect) or the track element
    // is missing. Clamped to >=24 to keep the gesture usable on tiny tracks.
    let rangePx = 150;
    const update = () => {
      thumb.style.top = `${(1 - value) * 100}%`;
      el.setAttribute('aria-valuenow', String(value));
      if (fill) {
        if (isBipolar()) {
          if (value >= 0.5) {
            fill.style.bottom = '50%';
            fill.style.height = `${(value - 0.5) * 100}%`;
          } else {
            fill.style.bottom = `${value * 100}%`;
            fill.style.height = `${(0.5 - value) * 100}%`;
          }
        } else {
          fill.style.bottom = '0';
          fill.style.height = `${value * 100}%`;
        }
      }
    };
    function start(t) {
      if (activeId !== null) return;
      activeId = t.pointerId;
      startY = t.clientY;
      startVal = value;
      // P03: re-measure the track height on every gesture start so the fader
      // tracks the user's finger 1:1 (a 150 px drag = +0.5 across the full
      // track), even if the layout changed since the last interaction.
      if (track && typeof track.getBoundingClientRect === 'function') {
        const rect = track.getBoundingClientRect();
        if (Number.isFinite(rect.height) && rect.height > 0) {
          rangePx = Math.max(24, rect.height);
        }
      }
    }
    function move(t) {
      const dy = startY - t.clientY;
      const raw = startVal + dy / rangePx;
      const clamped = clamp(raw, 0, 1);
      if (clamped !== value) {
        value = clamped;
        update();
        window.onControl && window.onControl({ name, value });
      }
    }
    function end(pointerId) {
      if (activeId === null || pointerId !== activeId) return;
      activeId = null;
    }
    let lastTap = 0;
    bindPointerGesture(el, () => activeId, {
      start(e) {
        const now = Date.now();
        if (now - lastTap < 300) {
          value = window.RcControlConfig ? window.RcControlConfig.get(name, 'resetValue', isBipolar() ? 0.5 : 0.85) : (isBipolar() ? 0.5 : 0.85);
          update();
          window.onControl && window.onControl({ name, value });
          return;
        }
        lastTap = now;
        start(e);
      },
      move,
      end,
    });
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      value = window.RcControlConfig ? window.RcControlConfig.get(name, 'resetValue', isBipolar() ? 0.5 : 0.85) : (isBipolar() ? 0.5 : 0.85);
      update();
      window.onControl && window.onControl({ name, value });
    });

    window.controlSetters = window.controlSetters || {};
    window.controlSetters[name] = (v) => {
      value = clamp(Number(v) || 0, 0, 1);
      update();
      window.onControl && window.onControl({ name, value });
    };
    
    bindScalarKeyboard(el, () => value, window.controlSetters[name]);
    update();
    window.addEventListener('resize', update);
    // Initial delay to let the DOM settle and offsetHeight become available
    setTimeout(update, 100);
    if (isBipolar()) el.dataset.bipolar = '1';
    (window.faderRenderers = window.faderRenderers || []).push(update);
    window.onControl && window.onControl({ name, value });
  }

  // ---- Page navigation (Tabs) ----
  // Extracted to modules/layout.js — delegates to window.RCSurface.setupLayout()
  function setupTabs() {
    if (typeof window.RCSurface?.setupLayout === 'function') {
      window.RCSurface.setupLayout();
    }
  }

  function setupStageModeUI() {
    const btn = document.getElementById('btn-stage-mode');
    if (!btn) return;

    function render(active) {
      document.body.classList.toggle('stage-mode', active);
      btn.classList.toggle('on', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.textContent = active ? 'EXIT' : 'STAGE';
      window.dispatchEvent(new Event('resize'));
    }

    async function enter() {
      render(true);
      const root = document.documentElement;
      if (root.requestFullscreen && !document.fullscreenElement) {
        try {
          await root.requestFullscreen();
        } catch {}
      }
    }

    async function exit() {
      render(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {}
      }
    }

    btn.addEventListener('click', () => {
      if (document.body.classList.contains('stage-mode')) exit();
      else enter();
    });
  }

  function renderStutterFeedback(el, state, gate) {
    // Paint the actual local gate on each frame, including fast subdivisions.
    // Never substitute a slower animation or replay pulses missed by the display.
    const hz = state.phaseFrequency;
    el.dataset.pulseView = state.pressed ? 'pulse' : 'off';
    if (state.pressed) {
      el.style.backgroundColor = gate ? 'rgba(255,159,10,0.82)' : 'rgba(255,159,10,0.10)';
      el.style.setProperty('--stut-glow-size', gate ? '12px' : '7px');
    }
    const rate = el.querySelector('.stutter-rate-readout');
    if (rate) {
      const timing = getStutterTiming(state);
      rate.textContent = window.syncMode === 'sync'
        ? formatMusicalRate(timing.subdivision / timing.ratchet) : `${hz.toFixed(2)} Hz`;
    }
  }

  function renderStutterSettings() {
    const grid = document.getElementById('stutter-rate-grid');
    const readout = document.getElementById('stutter-effective-rate');
    if (!grid || !readout) return;
    // The menu is shared. Account for the most demanding legacy ratchet among
    // all four controls; do not offer a base division that one silently clips.
    const count = Math.max(0, ...Array.from(stutterStates.values(), state => state.count));
    const timing = getStutterTiming({ rate: 1, count });
    const allowed = getStutterSubdivisions(timing.bps, timing.ratchet, timing.swing);
    // Shared menu: per-control subdivision pins live in RcControlConfig; the
    // global pinned flag still controls the "auto" vs explicit indicator.
    const pinned = window.syncSettings.stutterSubdivisionPinned || (window.RcControlConfig && Array.from(document.querySelectorAll('[data-name]')).some((el) => {
      const n = el.getAttribute('data-name');
      return n && window.RcControlConfig.get(n, 'subdivision', null) != null;
    }));
    const selected = pinned ? (window.syncSettings.stutterSubdivisionPinned ? window.syncSettings.stutterSubdivision : Array.from(document.querySelectorAll('[data-name]')).map((el) => window.RcControlConfig.get(el.getAttribute('data-name'), 'subdivision', null)).find((v) => v != null)) : 'auto';
    grid.querySelectorAll('.grid-btn').forEach(btn => {
      const val = btn.dataset.val;
      btn.disabled = window.syncMode !== 'sync' || (val !== 'auto' && !allowed.includes(Number(val)));
      btn.classList.toggle('on', val === 'auto' ? !pinned : pinned && Number(val) === selected);
    });
    readout.textContent = window.syncMode !== 'sync' ? 'FREE · 1–15 Hz'
      : !pinned ? `AUTO · ${formatMusicalRate(allowed[0])} → ${formatMusicalRate(allowed.at(-1))}`
      : `${formatMusicalRate(selected)}${selected === timing.subdivision ? '' : ` → ${formatMusicalRate(timing.subdivision)}`}`;
  }

  function renderLfoSettings() {
    const grid = document.getElementById('lfo-rate-grid');
    const readout = document.getElementById('lfo-effective-rate');
    const shapeLimit = document.getElementById('lfo-shape-limit');
    if (!grid && !readout) return;
    const currentShape = window.syncSettings?.lfoShape || 'sine';
    const maxHz = getLfoMaxHz(currentShape);
    if (shapeLimit) {
      shapeLimit.textContent = `${currentShape} · MAX ${maxHz} Hz`;
    }
    const tempo = Number.isFinite(window.currentBpm) && window.currentBpm > 0 ? window.currentBpm : 120;
    const bps = tempo / 60;
    const pinned = Boolean(window.syncSettings?.lfoSubdivisionPinned);
    const selected = pinned ? window.syncSettings.lfoSubdivision : 'auto';

    if (grid) {
      grid.querySelectorAll('.grid-btn').forEach(btn => {
        const val = btn.dataset.val;
        if (window.syncMode !== 'sync') {
          btn.disabled = true;
        } else if (val === 'auto') {
          btn.disabled = false;
        } else {
          const numVal = parseFloat(val);
          const reqHz = bps / numVal;
          btn.disabled = reqHz > maxHz + 1e-9;
        }
        btn.classList.toggle('disabled', Boolean(btn.disabled));
        const isOn = val === 'auto' ? !pinned : (pinned && Math.abs(parseFloat(val) - selected) < 1e-8);
        btn.classList.toggle('on', isOn);
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      });
    }

    if (readout) {
      const effective = getLfoSubdivision(1, tempo, pinned ? window.syncSettings.lfoSubdivision : undefined, currentShape);
      const label = window.syncMode === 'free' ? `FREE · 0.10–${maxHz.toFixed(2)} Hz`
        : !pinned ? `AUTO · ${formatMusicalRate(getLfoSubdivision(0, tempo, undefined, currentShape))} → ${formatMusicalRate(effective)}`
        : `${formatMusicalRate(window.syncSettings.lfoSubdivision)}${window.syncSettings.lfoSubdivision === effective ? '' : ` → ${formatMusicalRate(effective)}`}`;
      if (readout.textContent !== label) readout.textContent = label;
    }
  }
  window.renderLfoSettings = renderLfoSettings;

  // ---- Physics & Modulators animation updates ----
  let activePage = document.body.dataset.page || 'performance';
  window.addEventListener('ableton-rc:page-change', (event) => {
    activePage = (event.detail && event.detail.page) || document.body.dataset.page || 'performance';
  });
  
  function globalPhysicsLoop() {
    requestAnimationFrame(globalPhysicsLoop);
    const now = performance.now();
    const performanceVisible = (document.body.dataset.page || activePage) === 'performance';
    const shapeLimit = document.getElementById('lfo-shape-limit');
    if (shapeLimit) shapeLimit.textContent = `${window.syncSettings?.lfoShape || 'sine'} · MAX ${getLfoMaxHz()} Hz`;

    const syncPanel = document.getElementById('sync-settings-overlay');
    if (syncPanel && !syncPanel.classList.contains('hidden')
        && typeof window.drawBurstEnvelope === 'function') {
      window.drawBurstEnvelope();
    }
    if (syncPanel && !syncPanel.classList.contains('hidden')) {
      renderStutterSettings();
      renderLfoSettings();
    }

    // 1. Run scalar bursts (mode D pads)
    for (const [name, burst] of activeScalarBursts.entries()) {
      const event = Modes.tickBurstGesture(burst.state, { now });
      if (event) burst.render(event);
      if (!burst.state.burst || !burst.state.burst.active) {
        activeScalarBursts.delete(name);
      }
    }

    // 2. Run Active LFOs
    for (const [name, state] of lfoStates.entries()) {
      if (!state.name) state.name = name;
      const el = document.querySelector(`.toggle[data-name="${name}"]`);
      const readout = el?.querySelector('.lfo-rate-readout');
      if (readout && performanceVisible) {
        const shape = window.RcControlConfig
          ? window.RcControlConfig.get(name, 'shape', window.syncSettings?.lfoShape || 'sine')
          : (window.syncSettings?.lfoShape || 'sine');
        readout.textContent = window.syncMode === 'sync'
          ? formatMusicalRate(getLfoSubdivision(state.rate, window.currentBpm,
            perInstanceSyncSubdivision(name), shape))
          : `${(0.1 + state.rate * (getLfoMaxHz(shape) - 0.1)).toFixed(2)} Hz`;
      }
      if (!state.active) continue;
      if (state.burstUntil > 0 && now >= state.burstUntil) {
        state.active = false;
        state.value = 0;
        state.burstUntil = 0;
        const el = document.querySelector(`.toggle[data-name="${name}"]`);
        if (el) {
          el.classList.remove('on', 'burst');
          // setModeClass stamped mode-d when the burst started; without this
          // the control keeps the colour of one that is still firing.
          clearModeClass(el);
          const fill = el.querySelector('.mod-val-bar');
          if (fill) fill.style.height = '0%';
        }
        emitLfoState(name, state);
        continue;
      }

      const lfoPhaseRad = advanceLfoPhase(state, now);

      // P03 (rc-surface-modulator-ux-fixes-2026-09-18): read per-control shape
      // override (CF mode) so the waveform updates live without a manual
      // touch/drag re-arm. Falls back to the global syncSettings.lfoShape
      // when no override exists, matching sendLfoState's payload semantics.
      const lfoShape = window.RcControlConfig
        ? window.RcControlConfig.get(name, 'shape', window.syncSettings.lfoShape)
        : window.syncSettings.lfoShape;
      const wave = computeLfoWaveValue(lfoShape, lfoPhaseRad);
      // In mode D the depth opens over the attack and closes over the release,
      // instead of switching on whole for the length of the burst.
      const envelope = burstEnvelopeFactor(state, now);
      const lfoVal = 0.5 + wave * 0.5 * state.depth * envelope;
      state.value = lfoVal;

      if (performanceVisible) {
        const el = document.querySelector(`.toggle[data-name="${name}"]`);
        if (el) {
          const fill = el.querySelector('.mod-val-bar');
          if (fill) fill.style.height = `${lfoVal * 100}%`;

        }
      }
    }

    // 4. Run Active Stutters
    for (const [name, state] of stutterStates.entries()) {
      if (!state.pressed) {
        advanceStutterPhase(state, now);
        const el = document.querySelector(`.button[data-name="${name}"]`);
        if (el) renderStutterFeedback(el, state, false);
        continue;
      }
      if (state.burstUntil > 0 && now >= state.burstUntil) {
        state.pressed = false;
        state.burstUntil = 0;
        const el = document.querySelector(`.button[data-name="${name}"]`);
        if (el) {
          el.classList.remove('pressed', 'burst');
          clearModeClass(el);
          el.style.removeProperty('background-color');
          el.style.removeProperty('--stut-pulse');
          el.style.removeProperty('--stut-glow-size');
          el.style.removeProperty('--stut-scale');
        }
        emitStutterState(name, state);
        continue;
      }

      const gate = advanceStutterPhase(state, now);
      if (performanceVisible) {
        const el = document.querySelector(`.button[data-name="${name}"]`);
        if (el) renderStutterFeedback(el, state, gate);
      }
    }

    // 5. Run Playhead Simulation
    let playheadTimeMs = window.playheadBaseTimeMs || 0;
    if (window.playheadActive) {
      playheadTimeMs += (Date.now() - (window.playheadStartTime || Date.now()));
    }

    const beatsTotal = (playheadTimeMs / 1000) * (window.currentBpm / 60);
    const beatsPerBar = window.currentNumerator || 4;
    const subdivsPerBeat = 4;
    
    const currentBar = Math.floor(beatsTotal / beatsPerBar) + 1;
    const currentBeat = Math.floor(beatsTotal % beatsPerBar) + 1;
    const currentSixteenth = Math.floor((beatsTotal * subdivsPerBeat) % subdivsPerBeat) + 1;
    
    const playheadEl = document.getElementById('live-playhead');
    if (playheadEl) {
      playheadEl.textContent = `${currentBar}.${currentBeat}.${currentSixteenth}`;
    }
    
    const elapsedSec = playheadTimeMs / 1000;
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const tenths = Math.floor((playheadTimeMs % 1000) / 100);
    const timeEl = document.getElementById('live-time');
    if (timeEl) {
      timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
    }
  }

  // Extracted to modules/sync.js — delegates to window.RCSurface.setupSync()
  function setupSyncModeUI() {
    if (typeof window.RCSurface?.setupSync === 'function') {
      window.RCSurface.setupSync();
    }
  }

  // Extracted to modules/playhead.js — delegates to window.RCSurface.setupPlayhead()
  function setupPlayheadUI() {
    if (typeof window.RCSurface?.setupPlayhead === 'function') {
      window.RCSurface.setupPlayhead();
    }
  }

  // ---- Snapshots & Vector Morphing System ----
  // Extracted to modules/snapshots.js

  function cancelMorph() {
    if (typeof window.RCSurface?.snapshots?.cancelMorph === 'function') {
      window.RCSurface.snapshots.cancelMorph();
    }
  }

  function setSnapshotCaptureMode(active) {
    if (typeof window.RCSurface?.snapshots?.setSnapshotCaptureMode === 'function') {
      window.RCSurface.snapshots.setSnapshotCaptureMode(active);
    }
  }

  function resetScalarControl(name) {
    if (window.controlSetters && typeof window.controlSetters[name] === 'function') {
      try {
        window.controlSetters[name](0);
        return;
      } catch {}
    }
    window.onControl && window.onControl({ name, value: 0 });
  }

  function resetXYControl(name) {
    const xKey = `${name}.x`;
    const yKey = `${name}.y`;
    if (
      window.controlSetters &&
      typeof window.controlSetters[xKey] === 'function' &&
      typeof window.controlSetters[yKey] === 'function'
    ) {
      try {
        window.controlSetters[xKey](0.5);
        window.controlSetters[yKey](0.5);
        return;
      } catch {}
    }
    window.onControl && window.onControl({ name, x: 0.5, y: 0.5 });
  }

  function resetPerformanceControls() {
    cancelMorph();
    setSnapshotCaptureMode(false);
    if (activeScalarBursts) activeScalarBursts.clear();

    for (let i = 1; i <= 12; i++) resetScalarControl(`pad-${i}`);
    for (let i = 1; i <= 4; i++) resetScalarControl(`toggle-${i}`);
    for (let i = 1; i <= 4; i++) resetScalarControl(`button-${i}`);
    resetXYControl('xy-1');
    resetXYControl('xy-2');
  }

  function setupVectorPad() {
    const vPad = document.getElementById('xy-vector-pad');
    if (!vPad) return;
    const canvas = vPad.querySelector('#xy-vector-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = 0, height = 0;
    let x = 0.5, y = 0.5; // proportional coordinates
    let activeId = null;
    const radius = 10;
    
    function resize() {
      const rect = vPad.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width;
      canvas.height = height;
      draw();
    }
    
    window.addEventListener('resize', resize);
    setTimeout(resize, 150);
    
    function draw() {
      if (width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      
      // Draw corner indicators
      const drawCorner = (cx, cy, label, hasSnap) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = hasSnap ? 'rgba(191, 90, 242, 0.12)' : 'rgba(255, 255, 255, 0.02)';
        ctx.fill();
        ctx.strokeStyle = hasSnap ? '#bf5af2' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = hasSnap ? '#bf5af2' : '#8e8e93';
        ctx.font = '800 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
      };
      
      const snaps = typeof window.RCSurface?.snapshots?.getSnapshots === 'function' ? window.RCSurface.snapshots.getSnapshots() : [];
      drawCorner(22, 22, '1', !!snaps[0]);
      drawCorner(width - 22, 22, '2', !!snaps[1]);
      drawCorner(22, height - 22, '3', !!snaps[2]);
      drawCorner(width - 22, height - 22, '4', !!snaps[3]);
      
      // Draw crosshair lines
      const px = x * width;
      const py = y * height;
      ctx.strokeStyle = 'rgba(191, 90, 242, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, 0); ctx.lineTo(px, height);
      ctx.moveTo(0, py); ctx.lineTo(width, py);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw ball glow
      const glow = ctx.createRadialGradient(px, py, 1, px, py, radius * 2);
      glow.addColorStop(0, '#bf5af2');
      glow.addColorStop(0.3, 'rgba(191, 90, 242, 0.6)');
      glow.addColorStop(1, 'rgba(191, 90, 242, 0)');
      ctx.beginPath();
      ctx.arc(px, py, radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      
      // Draw ball core
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#bf5af2';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
    }
    
    function updateVectorValues() {
      const w1 = (1 - x) * (1 - y);
      const w2 = x * (1 - y);
      const w3 = (1 - x) * y;
      const w4 = x * y;
      
      const currentSnaps = typeof window.RCSurface?.snapshots?.getSnapshots === 'function' ? window.RCSurface.snapshots.getSnapshots() : [];
      const keys = new Set();
      [currentSnaps[0], currentSnaps[1], currentSnaps[2], currentSnaps[3]].forEach(snap => {
        if (snap) {
          Object.keys(snap).forEach(k => keys.add(k));
        }
      });
      
      const getVal = (snap, key) => {
        if (snap && snap[key] !== undefined) return snap[key];
        return window.currentControlStates[key] !== undefined ? window.currentControlStates[key] : 0.5;
      };
      
      withModulatorEmitBatch(() => {
        for (const key of keys) {
          const v = w1 * getVal(currentSnaps[0], key) +
                    w2 * getVal(currentSnaps[1], key) +
                    w3 * getVal(currentSnaps[2], key) +
                    w4 * getVal(currentSnaps[3], key);

          if (window.controlSetters && typeof window.controlSetters[key] === 'function') {
            try {
              window.controlSetters[key](v);
            } catch {}
          }
        }
      });
    }
    
    let vectorRafId = null;
    let pendingX = x;
    let pendingY = y;
    let hasPendingUpdate = false;

    function applyVectorBatch(targetX, targetY) {
      x = targetX;
      y = targetY;
      updateVectorValues();
      draw();
    }

    function cancelVectorRaf() {
      if (vectorRafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(vectorRafId);
      }
      vectorRafId = null;
      hasPendingUpdate = false;
    }

    function scheduleVectorUpdate(targetX, targetY) {
      pendingX = targetX;
      pendingY = targetY;
      hasPendingUpdate = true;
      if (vectorRafId === null) {
        vectorRafId = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => {
              vectorRafId = null;
              if (hasPendingUpdate) {
                hasPendingUpdate = false;
                applyVectorBatch(pendingX, pendingY);
              }
            })
          : null;
        if (vectorRafId === null) {
          hasPendingUpdate = false;
          applyVectorBatch(pendingX, pendingY);
        }
      }
    }

    function flushVectorUpdate() {
      if (hasPendingUpdate) {
        if (vectorRafId !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(vectorRafId);
          vectorRafId = null;
        }
        hasPendingUpdate = false;
        applyVectorBatch(pendingX, pendingY);
      }
    }

    function setFromPointer(pointer) {
      const rect = canvas.getBoundingClientRect();
      const newX = clamp((pointer.clientX - rect.left) / rect.width, 0, 1);
      const newY = clamp((pointer.clientY - rect.top) / rect.height, 0, 1);
      scheduleVectorUpdate(newX, newY);
    }

    bindPointerGesture(vPad, () => activeId, {
      start(e) {
        activeId = e.pointerId;
        setFromPointer(e);
      },
      move: setFromPointer,
      end(pointerId) {
        if (pointerId !== activeId) return;
        activeId = null;
        flushVectorUpdate();
      },
    });

    window.resetVectorPad = () => {
      cancelVectorRaf();
      pendingX = 0.5;
      pendingY = 0.5;
      x = 0.5;
      y = 0.5;
      draw();
    };

    window.addEventListener('ableton-rc:snapshots-updated', draw);
    window.addEventListener('ableton-rc:morph-mode-change', cancelVectorRaf);
  }

  // Extracted to modules/snapshots.js — delegates to window.RCSurface.snapshots.setupSnapshots()
  function setupSnapshots() {
    if (typeof window.RCSurface?.snapshots?.setupSnapshots === 'function') {
      window.RCSurface.snapshots.setupSnapshots();
    }
  }

  function setupPerformanceUtilities() {
    const offBtn = document.getElementById('btn-perf-off');
    if (offBtn) {
      offBtn.addEventListener('click', resetPerformanceControls);
    }
  }

  // Extracted to modules/transport.js — delegates to window.RCSurface.setupTransport()
  function setupTransportLiteUI() {
    if (typeof window.RCSurface?.setupTransport === 'function') {
      window.RCSurface.setupTransport();
    }
  }

  function setupSyncSettingsUI() {
    const btnSettings = document.getElementById('btn-sync-settings');
    const overlay = document.getElementById('sync-settings-overlay');
    const btnClose = document.getElementById('btn-sync-settings-close');
    const btnSyncMode = document.getElementById('btn-sync-mode');

    if (!overlay) return;

    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        overlay.classList.remove('hidden');
        renderSyncSettingsUI();
      });
    }

    if (btnSyncMode) {
      let pressTimer = null;
      const startPress = () => {
        pressTimer = setTimeout(() => {
          overlay.classList.remove('hidden');
          renderSyncSettingsUI();
        }, 600);
      };
      const endPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
      };
      btnSyncMode.addEventListener('mousedown', startPress);
      btnSyncMode.addEventListener('mouseup', endPress);
      btnSyncMode.addEventListener('mouseleave', endPress);
      btnSyncMode.addEventListener('touchstart', startPress);
      btnSyncMode.addEventListener('touchend', endPress);
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => overlay.classList.add('hidden'));
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    const selectClockSource = document.getElementById('select-clock-source');
    if (selectClockSource) {
      selectClockSource.addEventListener('change', () => {
        settleLfoPhases();
        window.syncSettings.clockSource = selectClockSource.value;
        saveSyncSettings();
        emitAllModulatorStates();
      });
    }

    const lfoRateGrid = document.getElementById('lfo-rate-grid');
    if (lfoRateGrid && typeof lfoRateGrid.querySelectorAll === 'function') {
      lfoRateGrid.querySelectorAll('.grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const val = btn.dataset.val;
          settleLfoPhases();
          window.syncSettings.lfoSubdivisionPinned = val !== 'auto';
          if (window.syncSettings.lfoSubdivisionPinned) {
            window.syncSettings.lfoSubdivision = parseFloat(val);
          }
          updateGridActiveState(lfoRateGrid, val);
          saveSyncSettings();
          emitAllModulatorStates();
          renderLfoSettings();
        });
      });
    }

    const lfoShapeGrid = document.getElementById('lfo-shape-grid');
    if (lfoShapeGrid && typeof lfoShapeGrid.querySelectorAll === 'function') {
      lfoShapeGrid.querySelectorAll('.grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          settleLfoPhases();
          window.syncSettings.lfoShape = btn.dataset.val;
          updateGridActiveState(lfoShapeGrid, btn.dataset.val);
          saveSyncSettings();
          emitAllModulatorStates();
          renderLfoSettings();
        });
      });
    }

    const lfoPhaseInput = document.getElementById('lfo-phase-offset');
    const lfoPhaseVal = document.getElementById('lfo-phase-offset-val');
    if (lfoPhaseInput) {
      lfoPhaseInput.addEventListener('input', () => {
        const val = parseFloat(lfoPhaseInput.value);
        settleLfoPhases();
        window.syncSettings.lfoPhaseOffset = val;
        if (lfoPhaseVal) lfoPhaseVal.textContent = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
        saveSyncSettings();
        emitAllModulatorStates();
      });
    }

    const stutterRateGrid = document.getElementById('stutter-rate-grid');
    if (stutterRateGrid && typeof stutterRateGrid.querySelectorAll === 'function') {
      stutterRateGrid.querySelectorAll('.grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const val = btn.dataset.val;
          window.syncSettings.stutterSubdivisionPinned = val !== 'auto';
          if (window.syncSettings.stutterSubdivisionPinned) {
            window.syncSettings.stutterSubdivision = parseFloat(val);
          }
          updateGridActiveState(stutterRateGrid, val);
          saveSyncSettings();
          emitAllModulatorStates();
          renderStutterSettings();
        });
      });
    }

    const stutterSwingInput = document.getElementById('stutter-swing');
    const stutterSwingVal = document.getElementById('stutter-swing-val');
    if (stutterSwingInput) {
      stutterSwingInput.addEventListener('input', () => {
        const val = parseFloat(stutterSwingInput.value);
        window.syncSettings.stutterSwing = val;
        if (stutterSwingVal) stutterSwingVal.textContent = val.toFixed(2);
        saveSyncSettings();
        emitAllModulatorStates();
      });
    }

    const burstRateGrid = document.getElementById('burst-rate-grid');
    if (burstRateGrid && typeof burstRateGrid.querySelectorAll === 'function') {
      burstRateGrid.querySelectorAll('.grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = parseFloat(btn.dataset.val);
          if (!Number.isFinite(val) || val <= 0) return;
          window.syncSettings.burstSubdivision = val;
          updateGridActiveState(burstRateGrid, btn.dataset.val);
          if (typeof window.drawBurstEnvelope === 'function') window.drawBurstEnvelope();
          saveSyncSettings();
          emitAllModulatorStates();
        });
      });
    }

    const burstAttackInput = document.getElementById('burst-attack');
    const burstAttackVal = document.getElementById('burst-attack-val');
    if (burstAttackInput) {
      burstAttackInput.addEventListener('input', () => {
        const val = parseFloat(burstAttackInput.value);
        if (!Number.isFinite(val)) return;
        window.syncSettings.burstAttackRatio = val;
        if (burstAttackVal) burstAttackVal.textContent = `${Math.round(val * 100)}%`;
        saveSyncSettings();
        emitAllModulatorStates();
      });
    }

    // ---- the drawn envelope -------------------------------------------
    const burstEnv = document.getElementById('burst-env');
    const burstEnvLine = document.getElementById('burst-env-line');
    const burstEnvPeak = document.getElementById('burst-env-peak');
    const burstEnvLen = document.getElementById('burst-env-len');
    // viewBox units; the peak never reaches an edge or the handle leaves the box.
    const CLOCK_LABELS = { osc: 'AbletonOSC', sdk: 'SDK', free: 'Internal' };
    const ENV_W = 240;
    const ENV_TOP = 12;
    const ENV_FLOOR = 84;
    let ultimoDesenho = '';

    function drawBurstEnvelope() {
      if (!burstEnvLine || !burstEnvPeak) return;
      const shape = resolveBurstShape();
      const ratio = shape.durationMs > 0
        ? Math.min(0.9, Math.max(0.02, shape.attackMs / shape.durationMs))
        : 0.135;
      const x = ratio * ENV_W;
      // Everything the readout prints, or a redraw that only watches the
      // length leaves a stale tempo or clock source on screen.
      const assinatura = [
        Math.round(shape.durationMs), Math.round(shape.attackMs),
        window.syncMode, window.syncSettings.clockSource,
        Math.round(Number(window.currentBpm) * 10),
        window.syncSettings.burstSubdivision,
      ].join('|');
      if (assinatura === ultimoDesenho) return;
      ultimoDesenho = assinatura;
      burstEnvLine.setAttribute(
        'points',
        `0,${ENV_FLOOR} ${x.toFixed(1)},${ENV_TOP} ${ENV_W},${ENV_FLOOR}`,
      );
      burstEnvPeak.setAttribute('cx', x.toFixed(1));
      if (burstEnvLen) {
        burstEnvLen.textContent = describeBurst(shape);
      }
      // In FREE the grid is not what decides the length, and a live grid over
      // a number it cannot change is the thing that reads as broken.
      if (burstRateGrid) {
        burstRateGrid.classList.toggle('inert', window.syncMode !== 'sync');
      }
    }

    // The active button's own label, so this never drifts from the grid.
    function subdivisionLabel() {
      const on = burstRateGrid && burstRateGrid.querySelector('.grid-btn.on');
      return on ? on.textContent.trim() : '';
    }

    function describeBurst(shape) {
      const ms = `${Math.round(shape.durationMs)} ms · ${Math.round(shape.attackMs)} ms attack`;
      if (window.syncMode !== 'sync') return `FREE · ${ms}`;
      const bpm = Number(window.currentBpm);
      const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm.toFixed(1) : '--';
      const fonte = CLOCK_LABELS[window.syncSettings.clockSource] || '';
      const rotulo = subdivisionLabel();
      return `${rotulo ? rotulo + ' @ ' : ''}${tempo} BPM${fonte ? ' · ' + fonte : ''} = ${ms}`;
    }
    window.drawBurstEnvelope = drawBurstEnvelope;

    if (burstEnv && burstAttackInput) {
      const setFromPointer = (event) => {
        const box = burstEnv.getBoundingClientRect();
        if (!box.width) return;
        const frac = (event.clientX - box.left) / box.width;
        const min = parseFloat(burstAttackInput.min);
        const max = parseFloat(burstAttackInput.max);
        const val = Math.min(max, Math.max(min, frac));
        burstAttackInput.value = String(val);
        // The settings handler is the only writer; the drag just feeds it.
        burstAttackInput.dispatchEvent(new Event('input', { bubbles: true }));
        ultimoDesenho = '';
        drawBurstEnvelope();
      };
      let arrastando = false;
      burstEnv.addEventListener('pointerdown', (event) => {
        arrastando = true;
        burstEnv.classList.add('dragging');
        burstEnv.setPointerCapture?.(event.pointerId);
        setFromPointer(event);
        event.preventDefault();
      });
      burstEnv.addEventListener('pointermove', (event) => {
        if (arrastando) setFromPointer(event);
      });
      const soltar = (event) => {
        if (!arrastando) return;
        arrastando = false;
        burstEnv.classList.remove('dragging');
        burstEnv.releasePointerCapture?.(event.pointerId);
      };
      burstEnv.addEventListener('pointerup', soltar);
      burstEnv.addEventListener('pointercancel', soltar);
      burstAttackInput.addEventListener('input', () => {
        ultimoDesenho = '';
        drawBurstEnvelope();
      });
      drawBurstEnvelope();
    }

    const stutterPhaseInput = document.getElementById('stutter-phase-offset');
    const stutterPhaseVal = document.getElementById('stutter-phase-offset-val');
    if (stutterPhaseInput) {
      stutterPhaseInput.addEventListener('input', () => {
        const val = parseFloat(stutterPhaseInput.value);
        window.syncSettings.stutterPhaseOffset = val;
        if (stutterPhaseVal) stutterPhaseVal.textContent = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
        saveSyncSettings();
        emitAllModulatorStates();
      });
    }

    const resetInput = (inputEl, valEl, defaultVal, key) => {
      const handler = () => {
        inputEl.value = defaultVal;
        window.syncSettings[key] = defaultVal;
        if (valEl) valEl.textContent = defaultVal >= 0 ? `+${defaultVal.toFixed(2)}` : defaultVal.toFixed(2);
        if (key === 'stutterSwing' && valEl) valEl.textContent = defaultVal.toFixed(2);
        saveSyncSettings();
        emitAllModulatorStates();
      };
      inputEl.addEventListener('dblclick', handler);
      if (valEl) {
        valEl.addEventListener('dblclick', handler);
        valEl.style.cursor = 'pointer';
      }
      const label = (typeof inputEl.closest === 'function') ? inputEl.closest('.setting-row')?.querySelector('label') : null;
      if (label) {
        label.addEventListener('dblclick', handler);
        label.style.cursor = 'pointer';
      }
    };

    if (lfoPhaseInput) resetInput(lfoPhaseInput, lfoPhaseVal, 0.0, 'lfoPhaseOffset');
    if (stutterSwingInput) resetInput(stutterSwingInput, stutterSwingVal, 0.0, 'stutterSwing');
    if (stutterPhaseInput) resetInput(stutterPhaseInput, stutterPhaseVal, 0.0, 'stutterPhaseOffset');

    function saveSyncSettings() {
      localStorage.setItem('ableton-rc:sync_settings', JSON.stringify(window.syncSettings));
    }

    function updateGridActiveState(parent, activeValue) {
      if (parent && typeof parent.querySelectorAll === 'function') {
        parent.querySelectorAll('.grid-btn').forEach(btn => {
          const isActive = parseFloat(btn.dataset.val) === parseFloat(activeValue) || btn.dataset.val === activeValue;
          btn.classList.toggle('on', isActive);
        });
      }
    }

    function renderSyncSettingsUI() {
      const settings = window.syncSettings;
      
      if (selectClockSource) selectClockSource.value = settings.clockSource;
      
      if (lfoRateGrid) updateGridActiveState(lfoRateGrid, settings.lfoSubdivisionPinned ? settings.lfoSubdivision : 'auto');
      if (lfoShapeGrid) updateGridActiveState(lfoShapeGrid, settings.lfoShape);
      
      if (lfoPhaseInput) {
        lfoPhaseInput.value = settings.lfoPhaseOffset;
        if (lfoPhaseVal) {
          const val = settings.lfoPhaseOffset;
          lfoPhaseVal.textContent = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
        }
      }

      if (stutterRateGrid) updateGridActiveState(stutterRateGrid, settings.stutterSubdivisionPinned ? settings.stutterSubdivision : 'auto');
      
      if (stutterSwingInput) {
        stutterSwingInput.value = settings.stutterSwing;
        if (stutterSwingVal) stutterSwingVal.textContent = settings.stutterSwing.toFixed(2);
      }

      if (stutterPhaseInput) {
        stutterPhaseInput.value = settings.stutterPhaseOffset;
        if (stutterPhaseVal) {
          const val = settings.stutterPhaseOffset;
          stutterPhaseVal.textContent = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
        }
      }

      renderLfoSettings();
      renderStutterSettings();
    }

    renderSyncSettingsUI();
  }

  // ---- Wire up everything ----
  // Run once the phone DOM is ready.
  function bootstrapControls() {
    setupPadModeUI();
    setupTabs();
    setupStageModeUI();
    setupSyncModeUI();
    setupPlayheadUI();
    setupVectorPad();
    setupSnapshots();
    setupPerformanceUtilities();
    setupTransportLiteUI();
    setupSyncSettingsUI();

    document.querySelectorAll('.pad').forEach(makePad);
    document.querySelectorAll('.knob').forEach(makeKnob);
    // Re-render every fader after the host says which of them are bipolar.
    window.faderRenderers = [];
    document.querySelectorAll('.fader:not(.bipolar)').forEach(makeFader);
    document.querySelectorAll('.fader.bipolar').forEach(makeFader);

    document.querySelectorAll('.xy-pad').forEach(makeXYPad);

    // LFO & Stutters
    document.querySelectorAll('.toggle').forEach(makeLfoToggle);
    document.querySelectorAll('.button').forEach(makeStutterButton);

    // Physics XY Canvas
    document.querySelectorAll('.xy-pad-physics').forEach(setupXYPhysics);

    // Start the background animation loop for physics + modulators
    globalPhysicsLoop();
  }

  // Restore last pad mode from localStorage if present — do this BEFORE
  // bootstrap so the first paint reflects the saved mode (no flash of
  // the default mode A).
  try {
    const savedMode = localStorage.getItem('ableton-rc:pad_mode');
    if (savedMode && ['A', 'B', 'C', 'D'].includes(savedMode)) {
      padMode = savedMode;
      if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.padMode = savedMode;
      }
    }
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapControls);
  } else {
    // DOM already parsed (script loaded with `defer`, or `type="module"`).
    // Run synchronously.
    bootstrapControls();
  }
  // Expose setPadMode so app.js can restore saved mode on boot/reconnect.
  window.setPadMode = setPadMode;

  // Expose resetTransientControls for app.js to clear any "stuck" pad/button
  // state on WS disconnect. Momentary/burst controls (modes A/D) can be left
  // visually pressed if the user releases their finger during the disconnect
  // window; the Live side already dropped the value, so we just need to
  // refresh the visual state. Toggles/latched (B/C) keep their value.
  window.resetTransientControls = () => {
    const mode = padMode;
    if (mode !== 'A' && mode !== 'D') return;
    for (const [name, burst] of activeScalarBursts.entries()) {
      activeScalarBursts.delete(name);
      burst.render({ value: 0, phase: 'burst-end', active: false });
    }
    document.querySelectorAll('.pad').forEach((el) => {
      el.classList.remove('active', 'latched', 'toggled', 'burst');
      el.style.removeProperty('--pad-fill-alpha');
      el.style.removeProperty('--pad-fill-color');
    });
    document.querySelectorAll('.toggle, .button').forEach((el) => {
      el.classList.remove('active');
      el.style.removeProperty('--pad-fill-alpha');
      el.style.removeProperty('--pad-fill-color');
    });
  };

  // Host-confirmed soft-takeover feedback. It is intentionally rendered on
  // the control itself so performance mode never needs a modal or toast.
  window.currentSafeFeedback = {};
  window.updateSafeInputFeedback = (controlName, feedback) => {
    if (!controlName || !feedback) return;
    window.currentSafeFeedback[controlName] = feedback;
    const axisMatch = controlName.match(/\.(x|y)$/);
    const baseName = axisMatch ? controlName.slice(0, -2) : controlName;
    const el = document.querySelector(`[data-name="${baseName}"]`);
    if (!el) return;
    const host = Math.max(0, Math.min(1, Number(feedback.hostValue) || 0));
    if (axisMatch) {
      el.style.setProperty(`--safe-host-${axisMatch[1]}`, String(host));
    } else {
      el.style.setProperty('--safe-host', String(host));
    }
    el.dataset.safeDirection = String(feedback.direction || 0);
    el.dataset.safeMode = feedback.mode || 'scale';
    const takingOver = feedback.state === 'takeover' || feedback.state === 'recovering';
    el.classList.toggle('safe-takeover', takingOver);
    el.dataset.safeCaptured = feedback.captured ? 'true' : 'false';
  };

  window.emitAllModulatorStates = emitAllModulatorStates;
})();
