// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
// Phone-side WebSocket + sensor capture.
// Negotiated realtime control frames are independent of visual snapshots.
// Hosts without controlStreamVersion retain the legacy snapshot protocol.

(function () {
  'use strict';
  // The fallback keeps the English wording readable in the source and serves
  // when the catalog has not loaded; params fill {name} slots either way.
  const T = (k, fallback, params) => (typeof window !== 'undefined' && window.RcSurfaceI18n)
    ? window.RcSurfaceI18n.t(k, params)
    : String(fallback ?? k).replace(/\{(\w+)\}/g, (whole, key) =>
      (params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole));

  const TICK_MS = 33;          // ~30 Hz
  const DEBUG_LEN = 240;       // single-line debug; truncate

  // A saved posture is not evidence of calibration in a new browser session.
  const calibration = { offsets: { alpha: 0, beta: 0, gamma: 0 }, active: false };

  // Per-sensor status tags + live readings + always-on diagnostic
  // (context, network). Status is the closed set from server/protocol.py.
  const state = {
    controls: [],
    touches: [],
    motion: null,
    orient: null,
    offsets: { matrix: null, active: false },
    calibration,
    sensors: {
      motion: 'unknown',
      orientation: 'unknown',
      audio: 'inactive',
      vision: 'inactive',
      audio_reading: null,
      vision_reading: null,
      motion_reading: null,
      orientation_reading: null,
      orientation_reading_raw: null,
      context: {
        secure_context: window.isSecureContext,
        scheme: window.location.protocol.replace(':', ''),
      },
      network: {
        online: navigator.onLine,
        type: null,
        downlink: null,
        rtt: null,
        save_data: null,
      },
    },
    // Local-only: per-sensor visibility (UI affordance; does NOT
    // affect the wire payload or names sent to the server).
    localToggles: {
      motion: true,
      orientation: true,
    },
    vision: {
      enabled: false,
      hand: { active: false, x: 0.5, y: 0.5, z: 0, fist: false, pinch: false, victory: false, open: false, rotateVal: 0.5, thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0, fingers: 0, palmSize: 0, facing: 0, handedness: null, handReal: null, palmPoseOk: null, indexCurved: null, otherFingersExtended: null, pinch_engaged: false, pinch_x: 0.5, pinch_y: 0.5, pinch_z: 0.5, handLostTime: 0 }
    },
  };
  // Expor state globalmente para que mÃ³dulos carregados tardiamente
  // (ex: vision-processor) possam escrever mÃ©tricas de latÃªncia sem
  // precisar receber `state` por import circular. Leitura Ã© null-safe
  // nos consumidores.
  window.state = state;

  // Per-channel mode picker. Channels match the keys emitted on the wire
  // (without the `sensor.vision.{side}.` prefix). 'A' = momentary (default),
  // 'B' = hold last position when the hand drops, 'C' = toggle on rising edge.
  // Gesto channels only support A/C (B makes no semantic sense for a binary);
  // position channels (x/y/z) only support A/B (toggle-on-position is
  // disorienting). The defaults below match the buttons rendered in the HUD.
  state.visionModes = loadVisionModes();
  // Per-channel toggle latched state for mode C. Once the rising edge fires
  // the latch stays put until the next rising edge on the same channel,
  // independent of whether the hand is currently performing the gesture.
  state.visionToggle = { fist: 0, pinch: 0, victory: 0, open: 0 };
  // Per-channel previous-frame detection flags so each rising-edge
  // transition is detected independently. Reset on hand-loss so a hand
  // re-entering the frame always counts as a fresh rising edge.
  state.visionPrev = { fist: 0, pinch: 0, victory: 0, open: 0 };

  function loadVisionModes() {
    const defaults = { x: 'A', y: 'A', z: 'A', fist: 'A', pinch: 'A', victory: 'A', open: 'A' };
    try {
      const raw = localStorage.getItem('ableton-rc:vision_modes');
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      // Merge so newly added channels default to 'A' instead of becoming undefined.
      return Object.assign({}, defaults, parsed);
    } catch {
      return defaults;
    }
  }

  function saveVisionModes() {
    try {
      localStorage.setItem('ableton-rc:vision_modes', JSON.stringify(state.visionModes));
    } catch {}
  }

  if (typeof window !== 'undefined' && typeof window.RCSurface?.setupWakeLock === 'function') {
    window.RCSurface.setupWakeLock();
  }

  async function requestWakeLock() {
    if (typeof window !== 'undefined' && typeof window.RCSurface?.requestWakeLock === 'function') {
      return await window.RCSurface.requestWakeLock();
    }
    return null;
  }

  function showToast(message, type = 'info') {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      return window.showToast(message, type);
    }
    if (typeof window !== 'undefined' && typeof window.RCSurface?.showToast === 'function') {
      return window.RCSurface.showToast(message, type);
    }
    console.log(`[Toast] [${type}] ${message}`);
  }

  // Test-only hook: expose the state so Playwright tests can inject
  // realistic sensor readings without going through the real browser APIs.
  if (typeof window !== 'undefined') {
    window.__abletonRc = {
      state,
      requestWakeLock,
      calibrateHorizon,
    };
  }
  // Local monotonic clock; never compared with host epoch time. Each API
  // (motion, orientation) gets its own tracker so one denied permission
  // never poisons the other.
  // ---- Sensor capability trackers (see sensor-capabilities.js) ----
  const sensorNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const motionTracker = window.RcSensorCapabilities?.create({
    apiPresent: typeof DeviceMotionEvent !== 'undefined',
    secureContext: window.isSecureContext === true,
    permissionRequired: typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function',
    now: sensorNow,
  });
  const orientationTracker = window.RcSensorCapabilities?.create({
    apiPresent: typeof DeviceOrientationEvent !== 'undefined',
    secureContext: window.isSecureContext === true,
    permissionRequired: typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function',
    now: sensorNow,
  });

  // Legacy diagnostic vocabulary kept for the wire snapshot: the tracker's
  // richer statuses collapse into the four strings the protocol already
  // documents. New UI messages use the tracker state directly.
  function legacySensorStatus(status) {
    switch (status) {
      case 'ready': return 'available';
      case 'denied': return 'permission-denied';
      case 'unsupported':
      case 'insecure': return 'unavailable';
      default: return 'unknown';
    }
  }

  // Axes that carried a real reading recently. On ready->lost each one gets
  // a single {name, value:0, lost:true} emission so Safe loss owns the
  // destination instead of a stale phone value.
  const activeMotionAxes = new Set();
  const activeOrientAxes = new Set();
  let motionWasReady = false;
  let orientWasReady = false;

  // Status pills follow the tracker on every tick, not only on snapshot
  // renders: a page with no WS hello still shows honest sensor state.
  function renderSensorStatusPills() {
    const motionStatus = document.querySelector('[data-sensor-status="motion"]');
    if (motionStatus) {
      const st = motionTracker?.getState().status;
      motionStatus.textContent = st || state.sensors.motion || '-';
      motionStatus.classList.toggle('ok', st === 'ready');
      motionStatus.classList.toggle('off', !!st && st !== 'ready' && st !== 'waiting' && st !== 'no-readings');
      motionStatus.classList.toggle('warn', st === 'lost' || st === 'no-readings' || st === 'denied' || st === 'error');
    }
    const orientStatus = document.querySelector('[data-sensor-status="orientation"]');
    if (orientStatus) {
      const st = orientationTracker?.getState().status;
      orientStatus.textContent = st || state.sensors.orientation || '-';
      orientStatus.classList.toggle('ok', st === 'ready');
      orientStatus.classList.toggle('off', !!st && st !== 'ready' && st !== 'waiting' && st !== 'no-readings');
      orientStatus.classList.toggle('warn', st === 'lost' || st === 'no-readings' || st === 'denied' || st === 'error');
    }
  }

  function syncSensorTrackers() {
    if (!motionTracker || !orientationTracker) return;
    motionTracker.tick();
    orientationTracker.tick();
    const ms = motionTracker.getState();
    const os = orientationTracker.getState();
    state.sensors.motion = legacySensorStatus(ms.status);
    state.sensors.orientation = legacySensorStatus(os.status);

    if (motionWasReady && ms.status !== 'ready') {
      // Any exit from ready (lost, denied, error) discards pending samples
      // and emits one {lost:true} frame per previously-active axis.
      for (const name of activeMotionAxes) {
        if (typeof window.onControl === 'function') window.onControl({ name, value: 0, lost: true });
      }
      activeMotionAxes.clear();
      state.motion = null;
    }
    motionWasReady = ms.status === 'ready';

    if (orientWasReady && os.status !== 'ready') {
      for (const name of activeOrientAxes) {
        if (typeof window.onControl === 'function') window.onControl({ name, value: 0, lost: true });
      }
      activeOrientAxes.clear();
      state.orient = null;
    }
    orientWasReady = os.status === 'ready';
    renderSensorStatusPills();
  }

  // Suspension: hidden pages never keep streaming stale sensor values. On
  // return the trackers wait for real readings and never re-open a prompt.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      motionTracker?.suspend();
      orientationTracker?.suspend();
      syncSensorTrackers();
      window.PageCalibration?.invalidate('sensors');
    } else {
      motionTracker?.resume();
      orientationTracker?.resume();
      syncSensorTrackers();
    }
  });

  // Test-only hooks: node tests drive tracker state transitions directly.
  if (typeof window !== 'undefined' && window.__abletonRc) {
    window.__abletonRc.__sensorTrackers = { motion: motionTracker, orientation: orientationTracker };
    window.__abletonRc.__syncSensorTrackers = syncSensorTrackers;
    window.__abletonRc.__emitSensorControls = emitSensorControls;
  }

  window.currentControlStates = {};

  window.currentControlLost = window.currentControlLost || {};
  let applyingRemoteControls = false;
  const controlStream = window.RcControlStream?.create({
    getConnection: () => ({
      socket: window.phoneWs,
      clientId: window.getPhoneClientId?.(),
      enabled: window.phoneWs?.controlStreamVersion === 1,
    }),
  });
  window.onControl = (ctrl) => {
    // The UI may display physical units (Hz), but the
    // mapping engine has one input contract: finite 0..1 values. Normalize at
    // this single boundary so curve previews, persisted live state, and the
    // server all see the same value without mutating the raw analysis object.
    ctrl = window.MappingInputContract?.normalizeControl(ctrl) ?? ctrl;
    if (ctrl.name) {
      // A `lost` control carries a placeholder, not a measurement. Writing it
      // into currentControlStates made the MAP curve read 0.00 while Live —
      // correctly honouring Safe loss = hold — kept the real value. Keep the
      // last true reading and record that the signal is gone, so the UI can
      // say so instead of drawing a number that is not happening.
      const lost = ctrl.lost === true;
      if (ctrl.x !== undefined && ctrl.y !== undefined) {
        window.currentControlLost[ctrl.name + '.x'] = lost;
        window.currentControlLost[ctrl.name + '.y'] = lost;
        if (!lost) {
          window.currentControlStates[ctrl.name + '.x'] = ctrl.x;
          window.currentControlStates[ctrl.name + '.y'] = ctrl.y;
        }
      } else if (ctrl.value !== undefined) {
        window.currentControlLost[ctrl.name] = lost;
        if (!lost) window.currentControlStates[ctrl.name] = ctrl.value;
      }
    }
    const idx = state.controls.findIndex(c => c.name === ctrl.name);
    if (idx >= 0) state.controls[idx] = ctrl;
    else state.controls.push(ctrl);
    if (!applyingRemoteControls) controlStream?.push(ctrl);
  };

  window.onModulatorState = (modulator) => {
    sendImmediateModulatorState(modulator);
  };
  window.addEventListener('ableton-rc:phone-ws-close', () => controlStream?.reset());

  const pointerContacts = new Map();
  const rememberPointerContact = (e) => {
    pointerContacts.set(e.pointerId, {
      pressure: e.pressure,
      x: e.clientX,
      y: e.clientY,
    });
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        rememberPointerContact(e);
      }
    }, { passive: true });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        rememberPointerContact(e);
      }
    }, { passive: true });
    window.addEventListener('pointerup', (e) => {
      pointerContacts.delete(e.pointerId);
    }, { passive: true });
    window.addEventListener('pointercancel', (e) => {
      pointerContacts.delete(e.pointerId);
    }, { passive: true });
  }

  // ---- Touch capture ----
  const touchHandler = (e) => {
    state.touches = [];
    const unmatchedPointers = Array.from(pointerContacts.values());
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      let pointerPressure = null;
      let closestIndex = -1;
      let closestDistanceSquared = 48 * 48;
      for (let j = 0; j < unmatchedPointers.length; j++) {
        const pointer = unmatchedPointers[j];
        const dx = pointer.x - t.clientX;
        const dy = pointer.y - t.clientY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= closestDistanceSquared) {
          closestIndex = j;
          closestDistanceSquared = distanceSquared;
        }
      }
      if (closestIndex >= 0) {
        pointerPressure = unmatchedPointers.splice(closestIndex, 1)[0].pressure;
      }
      state.touches.push({
        id: t.identifier,
        x: t.clientX / window.innerWidth,
        y: t.clientY / window.innerHeight,
        force: t.force || pointerPressure || null,
      });
    }
  };
  document.addEventListener('touchstart', touchHandler, { passive: true });
  document.addEventListener('touchmove', touchHandler, { passive: true });
  document.addEventListener('touchend', touchHandler, { passive: true });
  document.addEventListener('touchcancel', touchHandler, { passive: true });

  // ---- Motion (capability-tracked, v3) ----
  let motionListenerAttached = false;
  function attachMotion() {
    if (!motionTracker) { state.sensors.motion = 'unavailable'; return; }
    if (motionTracker.getState().status === 'unsupported'
      || motionTracker.getState().status === 'insecure') {
      syncSensorTrackers();
      return;
    }
    motionTracker.start();
    if (motionListenerAttached) return; // one listener per API, ever
    motionListenerAttached = true;
    try {
      window.addEventListener('devicemotion', (e) => {
        const axis = (v) => (v === null || v === undefined) ? null : v;
        const a = e.accelerationIncludingGravity || {};
        const r = e.rotationRate || {};
        const accel = e.acceleration;
        const buildVec = (src) => {
          if (!src) return null;
          const x = axis(src.x), y = axis(src.y), z = axis(src.z);
          if (x === null && y === null && z === null) return null;
          return { x, y, z };
        };

        // Only finite axes feed the tracker; null/NaN/Infinity are not readings.
        motionTracker.sample({
          ax: axis(a.x), ay: axis(a.y), az: axis(a.z),
          gx: axis(r.alpha), gy: axis(r.beta), gz: axis(r.gamma),
        });
        if (motionTracker.getState().status === 'ready') {
          state.motion = { ...motionTracker.getState().values };
        }

        state.sensors.motion_reading = {
          acceleration: buildVec(accel),
          acceleration_including_gravity: buildVec(a),
          rotation_rate: buildVec(r),
          interval: axis(e.interval),
        };
        syncSensorTrackers();
      });
    } catch {
      state.sensors.motion = 'unavailable';
      return;
    }
  }

  function deviceOrientationToRotationMatrix(alpha, beta, gamma) {
    const d2r = Math.PI / 180;
    const a = (alpha || 0) * d2r;
    const b = (beta || 0) * d2r;
    const g = (gamma || 0) * d2r;

    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);

    // R = Rz(a) * Rx(b) * Ry(g)
    const r00 = ca * cg - sa * sb * sg;
    const r01 = -sa * cb;
    const r02 = ca * sg + sa * sb * cg;

    const r10 = sa * cg + ca * sb * sg;
    const r11 = ca * cb;
    const r12 = sa * sg - ca * sb * cg;

    const r20 = -cb * sg;
    const r21 = sb;
    const r22 = cb * cg;

    return [
      [r00, r01, r02],
      [r10, r11, r12],
      [r20, r21, r22]
    ];
  }

  // ---- Orientation (calibrated, wrap-safe, capability-tracked v3) ----
  let orientationListenerAttached = false;
  function attachOrientation() {
    if (!orientationTracker) { state.sensors.orientation = 'unavailable'; return; }
    if (orientationTracker.getState().status === 'unsupported'
      || orientationTracker.getState().status === 'insecure') {
      syncSensorTrackers();
      return;
    }
    orientationTracker.start();
    if (orientationListenerAttached) return; // one listener per API, ever
    orientationListenerAttached = true;
    try {
      window.addEventListener('deviceorientation', (e) => {
        const axis = (v) => (v === null || v === undefined) ? null : v;

        const rawAlpha = axis(e.alpha);
        const rawBeta = axis(e.beta);
        const rawGamma = axis(e.gamma);

        // Partial orientation still counts as a real reading for freshness
        // (the tracker accepts any finite axis), but the mapped control and
        // SNS calibration only exist when all three axes are finite.
        orientationTracker.sample({ alpha: rawAlpha, beta: rawBeta, gamma: rawGamma });

        if (rawAlpha === null || rawBeta === null || rawGamma === null) {
          syncSensorTrackers();
          return;
        }

        let beta = rawBeta;
        let gamma = rawGamma;

        if (state.motion && typeof state.motion.ax === 'number' && typeof state.motion.ay === 'number' && typeof state.motion.az === 'number') {
          let angle = 0;
          if (typeof window !== 'undefined') {
            if (window.orientation !== undefined) angle = window.orientation;
            else if (window.screen && window.screen.orientation) angle = window.screen.orientation.angle;
          }

          if (angle === 90 || angle === -90 || angle === 270) {
            if (angle === 90) {
              beta = -state.motion.az * 9.18;
              gamma = state.motion.ay * 18.36;
            } else {
              beta = state.motion.az * 9.18;
              gamma = -state.motion.ay * 18.36;
            }
          } else {
            beta = -state.motion.az * 9.18;
            gamma = state.motion.ax * 18.36;
          }

          beta = Math.max(-90, Math.min(90, beta));
          gamma = Math.max(-180, Math.min(180, gamma));
        }

        const R = deviceOrientationToRotationMatrix(rawAlpha, rawBeta, rawGamma);
        let alpha = (Math.atan2(R[1][1], R[0][1]) * 180 / Math.PI - 90 + 360) % 360;
        alpha = Math.round(alpha * 10000) / 10000;
        alpha = (360 - alpha) % 360;

        // Calibration consumes only readings that the tracker considers current.
        if (orientationTracker.getState().status === 'ready') {
          window.PageCalibration?.feed('sensors', { alpha, beta, gamma });
        }

        const hasOffset = state.calibration && (state.calibration.active ||
          state.calibration.offsets.alpha !== 0 ||
          state.calibration.offsets.beta !== 0 ||
          state.calibration.offsets.gamma !== 0
        );

        if (hasOffset) {
          alpha = (alpha - state.calibration.offsets.alpha + 180 + 360) % 360;
          beta = beta - state.calibration.offsets.beta;
          gamma = gamma - state.calibration.offsets.gamma;
        }

        state.orient = {
          alpha,
          beta,
          gamma,
        };
        state.sensors.orientation_reading = {
          alpha,
          beta,
          gamma,
          absolute: axis(e.absolute),
        };

        const bubble = document.getElementById('level-bubble');
        if (bubble) {
          const pitch = Math.max(-45, Math.min(45, beta));
          const roll = Math.max(-45, Math.min(45, gamma));
          const tx = (roll / 45) * 50;
          const ty = (pitch / 45) * 50; 
          bubble.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
        }
        syncSensorTrackers();
      });
    } catch {
      state.sensors.orientation = 'unavailable';
      return;
    }
  }

  // ---- Network ----
  function attachNetwork() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const update = () => {
      if (conn) {
        state.sensors.network = {
          online: navigator.onLine,
          type: conn.effectiveType || null,
          downlink: conn.downlink ?? null,
          rtt: conn.rtt ?? null,
          save_data: conn.saveData ?? null,
        };
      } else {
        state.sensors.network = {
          online: navigator.onLine,
          type: null,
          downlink: null,
          rtt: null,
          save_data: null,
        };
      }
    };
    if (conn) conn.addEventListener('change', update);
    // Network online/offline is now handled by session.js via initSession().
    // We only need to update the local state.sensors.network here.
    window.addEventListener('online', () => { state.sensors.network.online = true; });
    window.addEventListener('offline', () => { state.sensors.network.online = false; });
    update();
  }

  // ---- Permission UX (iOS 13+ requires a user gesture) ----
  // Each API is requested independently inside the SAME synchronous gesture
  // callback, before any promise is awaited. Motion and orientation trackers
  // never share a verdict: one denied API does not poison the other.
  function maybeRequestPermissions() {
    const motionNeedsRequest = typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function';
    const orientationNeedsRequest = typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
    const needsRequest = motionNeedsRequest || orientationNeedsRequest;
    if (needsRequest) {
      const banner = document.getElementById('permission-banner');
      const btn = document.getElementById('permission-activate');
      banner.classList.remove('hidden');
      btn.addEventListener('click', () => {
        // Fire every request synchronously while the gesture is still active.
        const motionRequest = motionNeedsRequest ? DeviceMotionEvent.requestPermission() : null;
        const orientationRequest = orientationNeedsRequest ? DeviceOrientationEvent.requestPermission() : null;

        const handleMotion = (result) => {
          motionTracker.permission(result);
          if (result === 'granted') attachMotion();
        };
        const handleOrientation = (result) => {
          orientationTracker.permission(result);
          if (result === 'granted') attachOrientation();
        };

        if (motionRequest) {
          motionRequest.then(
            (r) => handleMotion(r === 'granted' ? 'granted' : 'denied'),
            () => handleMotion('error'),
          );
        } else if (motionTracker && motionTracker.getState().status !== 'unsupported') {
          attachMotion();
        }
        if (orientationRequest) {
          orientationRequest.then(
            (r) => handleOrientation(r === 'granted' ? 'granted' : 'denied'),
            () => handleOrientation('error'),
          );
        } else if (orientationTracker && orientationTracker.getState().status !== 'unsupported') {
          attachOrientation();
        }
        syncSensorTrackers();
        banner.classList.add('hidden');
      }, { once: true });
    } else {
      attachMotion();
      attachOrientation();
    }
    attachNetwork();
  }

  // ---- Modulator immediate send (uses session.js WS) ----
  function isImmediateModulatorState(modulator) {
    if (!modulator || typeof modulator !== 'object') return false;
    if (modulator.kind !== 'lfo' && modulator.kind !== 'pulse') return false;
    if (typeof modulator.name !== 'string') return false;
    if (!/^toggle-[1-8]$/.test(modulator.name)) return false;
    return true;
  }

  function sendImmediateModulatorState(modulator) {
    if (!isImmediateModulatorState(modulator)) return;
    const _ws = window.phoneWs;
    const _clientId = window.getPhoneClientId ? window.getPhoneClientId() : null;
    if (!_ws || _ws.readyState !== WebSocket.OPEN || !_clientId) return;
    const allowedClockSources = new Set(['osc', 'sdk', 'free']);
    const allowedLfoShapes = new Set(['sine', 'triangle', 'ramp_up', 'ramp_down', 'square']);
    const payload = {
      kind: modulator.kind,
      name: modulator.name,
      active: !!modulator.active,
      rate: typeof modulator.rate === 'number' ? modulator.rate : undefined,
      depth: typeof modulator.depth === 'number' ? modulator.depth : undefined,
      count: typeof modulator.count === 'number' ? modulator.count : undefined,
      morphMs: typeof modulator.morphMs === 'number' ? modulator.morphMs : undefined,
      syncMode: modulator.syncMode === 'free' ? 'free' : 'sync',
      clockSource: allowedClockSources.has(modulator.clockSource) ? modulator.clockSource : undefined,
      syncSubdivisionBeats: modulator.syncSubdivisionBeats === null
        ? null : typeof modulator.syncSubdivisionBeats === 'number' ? modulator.syncSubdivisionBeats : undefined,
      phaseOffsetBeats: typeof modulator.phaseOffsetBeats === 'number' ? modulator.phaseOffsetBeats : undefined,
      shape: allowedLfoShapes.has(modulator.shape) ? modulator.shape : undefined,
      swing: modulator.kind === 'pulse' && typeof modulator.swing === 'number' ? modulator.swing : undefined,
    };
    _ws.send(JSON.stringify({
      type: 'modulator',
      client_id: _clientId,
      ts: Date.now(),
      modulator: payload,
    }));
  }

  // ---- Client name editor (uses session.js APIs) ----
  function setupClientName() {
    const el = document.getElementById('status');
    if (!el) return;
    el.addEventListener('click', () => {
      const current = localStorage.getItem('ableton-rc:display_name') || '';
      const newName = prompt('Client name (display):', current);
      if (newName === null) return;
      const trimmed = newName.trim();
      const _ws = window.phoneWs;
      const _clientId = window.getPhoneClientId ? window.getPhoneClientId() : null;
      const _setStatus = window.RCSurface?._setStatus;
      if (trimmed) {
        localStorage.setItem('ableton-rc:display_name', trimmed);
        if (typeof _setStatus === 'function') _setStatus(`\u26A1 ${trimmed}`, 'connected');
        if (_ws && _ws.readyState === WebSocket.OPEN && _clientId) {
          _ws.send(JSON.stringify({ type: 'set_display_name', client_id: _clientId, display_name: trimmed }));
        }
      } else {
        localStorage.removeItem('ableton-rc:display_name');
        if (typeof _setStatus === 'function') _setStatus(`\u26A1 ${_clientId ? _clientId.slice(0, 8) : ''}`, 'connected');
        if (_ws && _ws.readyState === WebSocket.OPEN && _clientId) {
          _ws.send(JSON.stringify({ type: 'set_display_name', client_id: _clientId, display_name: '' }));
        }
      }
    });
  }

  // Emit orient/motion sensor values as mapping controls. Called from both
  // the rAF loop (display-synced, 60/90/120Hz when tab visible) and the
  // 30Hz setInterval (always-on fallback). The admin/mappings page surfaces
  // these as mappable targets; without this emission the orient and motion
  // values reach the wire but never become user-bindable controls.
  function emitSensorControls() {
    if (typeof window.onControl !== 'function') return;

    // Only tracker-current readings are emitted. A lost/denied/unsupported
    // tracker emits nothing here: the ready->lost transition already sent one
    // {lost:true} frame per previously-active axis via syncSensorTrackers.
    const ms = motionTracker?.getState();
    const m = ms?.status === 'ready' ? state.motion : null;
    if (m) {
      if (typeof m.ax === 'number') {
        window.onControl({ name: 'sensor.motion.ax', value: (Math.max(-20, Math.min(20, m.ax)) + 20) / 40 });
        activeMotionAxes.add('sensor.motion.ax');
      }
      if (typeof m.ay === 'number') {
        window.onControl({ name: 'sensor.motion.ay', value: (Math.max(-20, Math.min(20, m.ay)) + 20) / 40 });
        activeMotionAxes.add('sensor.motion.ay');
      }
      if (typeof m.az === 'number') {
        window.onControl({ name: 'sensor.motion.az', value: (Math.max(-20, Math.min(20, m.az)) + 20) / 40 });
        activeMotionAxes.add('sensor.motion.az');
      }
      if (typeof m.gx === 'number') {
        window.onControl({ name: 'sensor.motion.gx', value: (Math.max(-360, Math.min(360, m.gx)) + 360) / 720 });
        activeMotionAxes.add('sensor.motion.gx');
      }
      if (typeof m.gy === 'number') {
        window.onControl({ name: 'sensor.motion.gy', value: (Math.max(-360, Math.min(360, m.gy)) + 360) / 720 });
        activeMotionAxes.add('sensor.motion.gy');
      }
      if (typeof m.gz === 'number') {
        window.onControl({ name: 'sensor.motion.gz', value: (Math.max(-360, Math.min(360, m.gz)) + 360) / 720 });
        activeMotionAxes.add('sensor.motion.gz');
      }
    }

    const os = orientationTracker?.getState();
    const o = os?.status === 'ready' ? state.orient : null;
    if (o) {
      if (typeof o.alpha === 'number') {
        window.onControl({ name: 'sensor.orient.alpha', value: Math.max(0, Math.min(360, o.alpha)) / 360 });
        activeOrientAxes.add('sensor.orient.alpha');
      }
      if (typeof o.beta === 'number') {
        window.onControl({ name: 'sensor.orient.beta', value: (Math.max(-90, Math.min(90, o.beta)) + 90) / 180 });
        activeOrientAxes.add('sensor.orient.beta');
      }
      if (typeof o.gamma === 'number') {
        window.onControl({ name: 'sensor.orient.gamma', value: (Math.max(-180, Math.min(180, o.gamma)) + 180) / 360 });
        activeOrientAxes.add('sensor.orient.gamma');
      }
    }
  }

  /**
   * Move controls to values that came from the server — either the initial
   * state in `hello`, or another performer's move arriving as `control_sync`.
   *
   * Momentary controls are skipped in the modes where they are momentary: in A
   * and D a pad, LFO toggle or pulse button is held, not latched, so driving
   * one from a message would fire a trigger nobody's finger asked for.
   *
   * Modulator emission is suppressed for the duration: an LFO's configuration
   * belongs to the host, and re-announcing it from here would have this phone's
   * local rate and depth overwrite what the other performer just set.
   */
  function applyRemoteControlValues(values) {
    if (!values || typeof values !== 'object') return;
    if (!window.controlSetters) return;
    const currentMode = document.body.dataset.padMode || 'A';

    const apply = () => {
      for (const [k, v] of Object.entries(values)) {
        if (typeof window.controlSetters[k] !== 'function') continue;
        const base=k.split('.')[0];
        const mode=window.getControlMode?.(base) || window.RcControlConfig?.get(base,'mode',currentMode) || currentMode;
        if ((mode==='A' || mode==='D') && /^(?:pad|toggle|button)-\d+$/.test(k)) continue;
        controlStream?.discard(k);
        try {
          window.controlSetters[k](v);
          const ctrlEl = document.querySelector(`[data-name="${k}"]`);
          if (ctrlEl) {
            ctrlEl.dataset.active = 'true';
            if (ctrlEl._activeTimeout) clearTimeout(ctrlEl._activeTimeout);
            ctrlEl._activeTimeout = setTimeout(() => { ctrlEl.dataset.active = 'false'; }, 200);
          }
        } catch {}
      }
    };

    const wasApplying = applyingRemoteControls;
    applyingRemoteControls = true;
    try {
      if (typeof window.withModulatorEmitSuppressed === 'function') window.withModulatorEmitSuppressed(apply);
      else apply();
    } finally { applyingRemoteControls = wasApplying; }
  }
  window.applyRemoteControlValues = applyRemoteControlValues;

  // Snapshot throttle state (was previously in the WS block, now local to this module)
  let lastSnapshotSentAt = 0;

  function sendLoop() {
    setInterval(() => {
      // Smooth-decay the hand's x/y/z back to neutral (0.5, 0.5, 0) over
      // 300ms once it stops being detected.
      // Mode B (hold) freezes the position per-axis so the performer's last
      // hand pose stays mapped until they re-enter the frame.
      if (state.vision && state.vision.enabled) {
        const h = state.vision.hand;
        if (h && !h.active) {
          // No spatial tracking, so no x/y/z to decay: just zero the
          // remaining discrete channels and let the wire stay quiet.
          h.fist = false;
          h.pinch = false;
          h.victory = false;
          h.open = false;
          h.rotateVal = 0.5;
          h.thumb = 0;
          h.index = 0;
          h.middle = 0;
          h.ring = 0;
          h.pinky = 0;
          h.fingers = 0;

          if (state.sensors.vision_reading) {
            const r = state.sensors.vision_reading;
            r.fist = false;
            r.pinch = false;
            r.victory = false;
            r.open = false;
            r.rotateVal = 0.5;
            r.thumb = 0;
            r.index = 0;
            r.middle = 0;
            r.ring = 0;
            r.pinky = 0;
            r.fingers = 0;
          }

          if (window.onControl) {
            for (const detector of ['fist', 'pinch', 'victory', 'open']) {
              if (isVisionDetectorEnabled(detector)) {
                window.onControl({ name: `sensor.vision.${detector}`, value: 0, lost: true });
              }
            }
            // This is an absent-hand heartbeat, not a measurement. Keep it
            // marked lost so Safe loss — rather than this phone — owns the
            // destination for continuous rotate mappings.
            if (isVisionDetectorEnabled('victory')) {
              window.onControl({ name: 'sensor.vision.rotateVal', value: 0.5, lost: true });
            }
          }
        }

        // Update HUD for the single tracked hand
        const lblGesture = document.getElementById('lbl-vision-gesture');
        if (lblGesture) lblGesture.textContent = getVisionGestureLabel(state.vision.hand);
        renderVisionReadouts();
      }

      // Orient + motion emit (rAF drives these at display rate normally;
      // this is the always-on fallback so background tabs and slow displays
      // still see fresh values).
      syncSensorTrackers();
      emitSensorControls();

      const now = Date.now();
      const throttleActive = window.RCSurface.getMappingModeActive() || window.RCSurface.getTelemetryThrottleUntil() > now;
      const minSnapshotInterval = throttleActive ? 500 : TICK_MS;
      if (now - lastSnapshotSentAt < minSnapshotInterval) return;
      lastSnapshotSentAt = now;

      const _ws = window.phoneWs;
      const _clientId = window.getPhoneClientId ? window.getPhoneClientId() : null;
      // MAP throttles visual telemetry only. Negotiated snapshots cannot
      // actuate Live; legacy hosts retain their snapshot fallback.
      if (_ws && _ws.readyState === WebSocket.OPEN && _clientId && !(_ws.bufferedAmount > 0)) {
        const msg = {
          type: 'snapshot',
          client_id: _clientId,
          display_name: localStorage.getItem('ableton-rc:display_name') || undefined,
          ts: Date.now(),
          data: {
            controlsRealtime: controlStream?.isActive() === true,
            controls: state.controls,
            touches: state.touches,
            motion: state.motion,
            orient: state.orient,
            sensors: state.sensors,
            network: state.sensors.network,
          },
        };
        _ws.send(JSON.stringify(msg));
        renderDebug(msg.data);
        renderSensorReadout();
      }
    }, TICK_MS);

    // Display-synced sensor emit for performance: rAF runs at the display's
    // native rate (60/90/120Hz). When the tab is visible the orient/motion
    // controls arrive at that rate â€” minimum-latency feel. The setInterval
    // above is the always-on fallback when rAF is throttled, unavailable
    // (node test env), or the tab is hidden.
    if (typeof requestAnimationFrame === 'function') {
      let lastFpsMeasureTime = performance.now();
      let frameCount = 0;
      function rafEmit() {
        syncSensorTrackers();
        emitSensorControls();
        
        frameCount++;
        const now = performance.now();
        if (now - lastFpsMeasureTime >= 1000) {
          const fps = Math.round((frameCount * 1000) / (now - lastFpsMeasureTime));
          state.sensors.network.fps = fps;
          frameCount = 0;
          lastFpsMeasureTime = now;
        }
        
        requestAnimationFrame(rafEmit);
      }
      requestAnimationFrame(rafEmit);
    }

    // Heartbeat ping is now handled by modules/session.js
  }

  function fmtVec(v, decimals = 1) {
    if (!v) return '-';
    return `${v.x.toFixed(decimals)}/${v.y.toFixed(decimals)}/${v.z.toFixed(decimals)}`;
  }
  function fmtNum(n, decimals = 0) {
    if (n === null || n === undefined || Number.isNaN(n)) return '-';
    return n.toFixed(decimals);
  }

  function setSensorVisual(key, value) {
    const finite = typeof value === 'number' && Number.isFinite(value);
    const motionRange = key && key.startsWith('aig.') ? 20 : 1;

    document.querySelectorAll(`[data-sensor-bar="${key}"]`).forEach((bar) => {
      const card = bar.closest('.sensor-axis-card');
      if (!finite) {
        bar.style.setProperty('--sensor-level', '0');
        bar.classList.remove('neg');
        if (card) card.classList.remove('active');
        return;
      }
      const level = Math.min(1, Math.abs(value) / motionRange);
      bar.style.setProperty('--sensor-level', level.toFixed(3));
      bar.classList.toggle('neg', value < 0);
      if (card) card.classList.toggle('active', level > 0.02);
    });

    document.querySelectorAll(`[data-sensor-orbit="${key}"]`).forEach((orbit) => {
      const card = orbit.closest('.sensor-axis-card');
      if (!finite) {
        orbit.style.setProperty('--sensor-angle', '0deg');
        orbit.classList.remove('active');
        if (card) card.classList.remove('active');
        return;
      }
      let angle = value;
      if (key === 'ori.alpha') angle = ((value % 360) + 360) % 360;
      orbit.style.setProperty('--sensor-angle', `${angle.toFixed(1)}deg`);
      orbit.classList.add('active');
      if (card) card.classList.add('active');
    });
  }

  function renderDebug(d) {
    const s = d.sensors || {};
    const ctx = s.context || {};
    const net = s.network || {};
    const mR = s.motion_reading || null;
    const oR = s.orientation_reading || null;

    const aig = mR && mR.acceleration_including_gravity;
    const rot = mR && mR.rotation_rate;
    const intervalSeg = (mR && mR.interval !== null && mR.interval !== undefined)
      ? ` Î”${fmtNum(mR.interval, 0)}ms` : '';
    const mSeg = aig
      ? `ax:${fmtNum(aig.x, 1)} ay:${fmtNum(aig.y, 1)} az:${fmtNum(aig.z, 1)}`
        + (rot ? ` rot:${fmtVec(rot, 1)}` : '') + intervalSeg
      : '-';
    const oSeg = oR
      ? `${fmtNum(oR.alpha, 0)}/${fmtNum(oR.beta, 0)}/${fmtNum(oR.gamma, 0)}`
      : '-';
    const ctxSeg = `ctx:${ctx.secure_context ? 'secure' : 'http'} ${ctx.scheme || ''}`.trim();
    const netType = net.online ? (net.type || 'on') : 'off';
    const netSeg = `net:${netType}${net.downlink ? ` ${net.downlink}Mb` : ''}${net.rtt ? ` ${net.rtt}ms` : ''}`;
    const tSeg = d.touches && d.touches.length > 0 ? `t:${d.touches.length}` : 't:-';

    const line = `m:${s.motion || '?'} ${mSeg} | ori:${s.orientation || '?'} ${oSeg} | ${tSeg} | ${ctxSeg} | ${netSeg}`;
    const el = document.getElementById('debug');
    if (!el) return;
    el.textContent = line.length > DEBUG_LEN ? line.slice(0, DEBUG_LEN - 1) + 'â€¦' : line;
  }

  // ---- Sensor readout on Sensors page ----
  function renderSensorReadout() {
    const m = state.sensors.motion_reading;
    const o = state.sensors.orientation_reading;

    function setVal(sel, v, decimals = 2) {
      const el = document.querySelector(sel);
      if (!el) return;
      el.textContent = (v === null || v === undefined || Number.isNaN(v)) ? '-' : v.toFixed(decimals);
      const key = el.dataset && el.dataset.sensorVal;
      if (key) setSensorVisual(key, v);
    }

    if (m) {
      // ACCEL (aig) is what we use for the row
      const aig = m.acceleration_including_gravity || { x: null, y: null, z: null };
      setVal('[data-sensor-val="aig.x"]', aig.x);
      setVal('[data-sensor-val="aig.y"]', aig.y);
      setVal('[data-sensor-val="aig.z"]', aig.z);
      // AIG (g-force) shows acceleration (no gravity) when available
      const a = m.acceleration || { x: null, y: null, z: null };
      setVal('[data-sensor-val="aig.x2"]', a.x);
      setVal('[data-sensor-val="aig.y2"]', a.y);
      setVal('[data-sensor-val="aig.z2"]', a.z);
    } else {
      ['aig.x', 'aig.y', 'aig.z', 'aig.x2', 'aig.y2', 'aig.z2'].forEach((k) => {
        setVal(`[data-sensor-val="${k}"]`, null);
      });
    }
    if (o) {
      setVal('[data-sensor-val="ori.alpha"]', o.alpha, 0);
      setVal('[data-sensor-val="ori.beta"]', o.beta, 0);
      setVal('[data-sensor-val="ori.gamma"]', o.gamma, 0);
    } else {
      ['ori.alpha', 'ori.beta', 'ori.gamma'].forEach((k) => {
        setVal(`[data-sensor-val="${k}"]`, null);
      });
    }

    // Status hints follow the tracker on every tick (renderSensorStatusPills);
    // the snapshot render just refreshes them along with the readouts.
    renderSensorStatusPills();
  }

  // ---- Local sensor visibility toggles (no server effect) ----
  function setupSensorToggles() {
    document.querySelectorAll('[data-sensor-enable]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.sensorEnable;
        state.localToggles[key] = el.checked;
      });
    });
  }

  function calibrateHorizon() {
    return window.PageCalibration?.start('sensors');
  }

  function setupCalibration() {
    const reset = () => {
      state.calibration.offsets = { alpha: 0, beta: 0, gamma: 0 };
      state.calibration.active = false;
      try { localStorage.removeItem('ableton-rc:sensor_offsets'); } catch {}
    };
    window.PageCalibration?.register('sensors', {
      // Calibration only starts with the three finite axes fresh in the
      // tracker. An API that merely exists (desktop, no hardware) is not a
      // reading and cannot enable SNS calibration.
      source: () => {
        const st = orientationTracker?.getState();
        if (!st || st.status !== 'ready') return null;
        const v = st.values;
        if (typeof v.alpha !== 'number' || typeof v.beta !== 'number' || typeof v.gamma !== 'number') return null;
        return window;
      },
      noSourceReason: () => {
        const st = orientationTracker?.getState();
        if (!st) return 'noMotion';
        if (st.status === 'permission-required') return 'enable.sensors';
        if (st.status === 'denied') return 'sensorsDenied';
        if (st.status === 'error') return 'sensorError';
        return 'noMotion';
      },
      apply: (offsets) => { state.calibration.offsets = offsets; state.calibration.active = true; },
      reset,
    });
    for (const id of ['btn-zero-orientation', 'btn-zero-orientation-perf', 'btn-calibrate-sensors']) {
      document.getElementById(id)?.addEventListener('click', calibrateHorizon);
    }
    document.getElementById('btn-reset-orientation')?.addEventListener('click', () => window.PageCalibration?.reset('sensors'));
  }



  function setupConfigMode() {
    if (!window.RcConfigMode || !window.RcControlConfig) return;
    const cfg = window.RcConfigMode.create({
      controlConfig: window.RcControlConfig.create({ storage: window.localStorage }),
    });
    const burstDivisions=[[32,'8'],[16,'4'],[8,'2'],[4,'1'],[2,'1/2'],[1,'1/4'],[.5,'1/8'],[.25,'1/16'],[.125,'1/32'],[.0625,'1/64']];
    // Register MIX builders: knob / fader / XY1 / XY2.
    cfg.register(/^knob-\d+$/, (name) => {
      const isMacro = (document.querySelector(`[data-name="${name}"]`)?.classList || { contains: () => false }).contains('macro');
      const current = (val, fallback) => window.RcControlConfig.get(name, val, fallback);
      const range = current('knobRange', isMacro ? 220 : 150);
      return [
        { slider: { label: 'Sensitivity (rangePx)', min: 100, max: 400, step: 10, get: () => range, set: (v) => window.RcControlConfig.set(name, { knobRange: v }), format: (v) => `${v}px` } },
        { action: { label: 'Reset to default', danger: false, run: () => window.RcControlConfig.set(name, { knobRange: isMacro ? 220 : 150 }) } },
        { action: { label: 'Clear this control', danger: true, run: () => window.RcControlConfig.clear(name) } },
      ];
    });
    cfg.register(/^fader-\d+$/, (name) => {
      const el = document.querySelector(`[data-name="${name}"]`);
      const isBipolar = (el?.classList || { contains: () => false }).contains('bipolar');
      const fallback = isBipolar ? 0.5 : 0.85;
      const current = window.RcControlConfig.get(name, 'resetValue', fallback);
      return [
        { info: { text: isBipolar ? 'Bipolar fader' : 'Unipolar fader' } },
        { slider: { label: 'Reset value (double-tap)', min: 0, max: 1, step: 0.01, get: () => current, set: (v) => window.RcControlConfig.set(name, { resetValue: v }), format: (v) => v.toFixed(2) } },
        { action: { label: 'Clear this control', danger: true, run: () => window.RcControlConfig.clear(name) } },
      ];
    });
    cfg.register(/^xy-[12]$/, name => {
      const cc = window.RcControlConfig;
      const tr = (key, fallback) => window.RcSurfaceI18n?.t(key) ?? fallback;
      const physics = cc.get(name,'behavior','static') === 'physics';
      return [
        {segment: {label: tr('cfg.xyBehavior','Behavior'), options: [
          {label: tr('cfg.xyStatic','Static'), value:'static'},
          {label: tr('cfg.xyPhysics','Physics'), value:'physics'}],
          refresh: true, get: () => cc.get(name,'behavior','static'), set: value => cc.set(name,{behavior:value})}},
        ...(physics ? [['friction', 'cfg.frictionLabel', 'Friction', .002, .05, .001, .012],
          ['bounce','cfg.bounceLabel','Bounce',0,.95,.05,.75],
          ['speed','cfg.xySpeed','Speed',.1,4,.1,1]].map(([key,label,fallback,min,max,step,initial]) => ({slider: {
            label: tr(label,fallback), min,max,step, get: () => cc.get(name,key,initial),
            set: value => cc.set(name,{[key]:value}), format: value => value.toFixed(3),
          }})) : []),
        {action: {label:tr('cfg.resetToDefault','Reset to default'), run:()=>cc.clear(name)}},
      ];
    });
    // PERF builders (mode / shape / pulse).
    cfg.register(/^pad-\d+$/, (name) => {
      const cc=window.RcControlConfig;
      const tr=(key,fallback)=>window.RcSurfaceI18n?.t(key) ?? fallback;
      const get=(key,fallback)=>cc.get(name,key,fallback);
      const global={label:tr('cfg.global','Global'),value:'Global'};
      const choice=(key,label,options,fallback='Global')=>({segment:{label,options,refresh:true,
        get:()=>get(key,fallback),set:value=>cc.set(name,{[key]:value==='Global'?null:value})}});
      const slider=(key,label,min,max,step,fallback,format=value=>value.toFixed(2))=>({slider:{
        label,min,max,step,refresh:true,get:()=>get(key,fallback),set:value=>cc.set(name,{[key]:value}),format}});
      const mode=window.getControlMode?.(name) || get('mode',document.body.dataset.padMode || 'A');
      const rows=[choice('mode',tr('cfg.mode','Mode'),[global,...['A','B','C','D'].map(value=>({label:value,value}))])];
      if(mode!=='D') {
        rows.push(choice('padRange',tr('cfg.padRange','Drag travel'),[[60,'veryShort','Very short'],[100,'short','Short'],[150,'medium','Medium'],[300,'long','Long']]
          .map(([value,key,label])=>({value,label:tr('cfg.'+key,label)})),150),
          choice('padCurve',tr('cfg.padCurve','Response'),[['linear','Linear'],['fine','Fine'],['fast','Fast']].map(([value,label])=>({value,label:tr('cfg.'+value,label)})),'linear'));
        if(mode==='A') rows.push(choice('padTouchValue',tr('cfg.touchLevel','Touch level'),[[0,'zero','Zero'],[.25,'low','Low'],[.5,'medium','Medium'],[1,'maximum','Maximum']]
          .map(([value,key,label])=>({value,label:tr('cfg.'+key,label)})),0));
        if(mode==='B') rows.push(choice('padLatchTapReset',tr('cfg.tapAction','Tap without drag'),[
          {label:tr('cfg.keepValue','Keep value'),value:false},{label:tr('cfg.resetZero','Reset to zero'),value:true}],false));
        if(mode==='C') {
          rows.push({segment:{label:tr('cfg.toggleOn','On level'),refresh:true,
            options:[{label:tr('cfg.rememberLevel','Remember last'),value:'memory'},{label:tr('cfg.fixedLevel','Fixed'),value:'fixed'}],
            get:()=>get('padToggleValue',null)===null?'memory':'fixed',set:value=>cc.set(name,{padToggleValue:value==='memory'?null:1})}});
          if(get('padToggleValue',null)!==null)rows.push(slider('padToggleValue',tr('cfg.toggleOn','On level'),.01,1,.01,1));
        }
      } else {
        rows.push(choice('syncMode',tr('cfg.clock','Timing'),[global,{label:'SYNC',value:'sync'},{label:'FREE',value:'free'}]));
        if(get('syncMode',window.syncMode)==='sync') {
          const values=burstDivisions;
          const beats=get('burstSubdivision',window.syncSettings.burstSubdivision);
          const label=values.find(([value])=>value===beats)?.[1] || String(beats);
          rows.push({details:{label:`${tr('cfg.burstLength','Burst length')} · ${label}`,items:[
            choice('burstSubdivision',tr('cfg.division','Subdivision'),[global,...values.map(([value,label])=>({value,label}))]),
          ]}});
        }
        else rows.push(slider('burstDurationMs',tr('cfg.burstDuration','Duration (ms)'),40,10000,10,520,value=>`${value}ms`));
        rows.push(slider('burstAttackRatio',tr('cfg.burstAttack','Attack'),.05,.5,.005,
          get('syncMode',window.syncMode)==='sync'?window.syncSettings.burstAttackRatio:70/520,value=>`${Math.round(value*100)}%`),
        slider('burstPeak',tr('cfg.burstPeak','Peak level'),.15,1,.01,1));
      }
      rows.push({action:{label:tr('cfg.resetToDefault','Reset to default'),run:()=>cc.clear(name)}});
      return rows;
    });
    cfg.register(/^toggle-[1-8]$/, (name) => {
      const cc = window.RcControlConfig;
      const tr = (key, fallback) => window.RcSurfaceI18n?.t(key) ?? fallback;
      const shape = window.getModulatorShape?.(name) || 'sine';
      const pulse = shape === 'square';
      const global = {label:tr('cfg.global','Global'),value:'Global'};
      const choices = (key,label,options) => ({segment:{label,options,refresh:true,
        get: () => {
          const value=cc.get(name,key,'Global');
          if(key==='subdivision' && typeof value==='number' && value>0) return window.getModulatorSubdivision(name);
          return value;
        },
        set:value => cc.set(name,{[key]:value==='Global'?null:value}),
      }});
      const slider = (key,label,min,max,step,fallback) => ({slider:{
        label,min,max,step,get:()=>cc.get(name,key,fallback),
        set:value=>cc.set(name,{[key]:value}),format:value=>value.toFixed(2),
      }});
      const rows = [
        choices('shape',tr('cfg.waveform','Waveform'),[global,
          ...['sine','triangle','ramp_up','ramp_down','square'].map(value=>({
            label:tr({sine:'sync.sine',triangle:'sync.triangle',ramp_up:'sync.rampUp',ramp_down:'sync.rampDn',square:'sync.square'}[value],value),value,
          })),
        ]),
        choices('mode',tr('cfg.mode','Mode'),[global,...['A','B','C','D'].map(value=>({label:value,value}))]),
        choices('syncMode',tr('cfg.clock','Timing'),[global,{label:'SYNC',value:'sync'},{label:'FREE',value:'free'}]),
      ];
      if((cc.get(name,'syncMode',window.syncMode))==='sync') {
        // Group the motor's actual rhythm choices, without adding unsupported
        // values or altering a saved pin merely by opening the editor.
        const rhythms = window.getModulatorRhythms(name);
        const groups = new Map();
        for(const option of rhythms) {
          const feel = option.label.endsWith(' D') ? 'dotted' : option.label.endsWith(' T') ? 'triplet' : 'straight';
          const base = option.label.replace(/ [DT]$/,'');
          if(!groups.has(base)) groups.set(base,new Map());
          groups.get(base).set(feel,option.value);
        }
        const pin = cc.get(name,'subdivision','Global');
        const effective = window.getModulatorSubdivision(name);
        const selected = rhythms.find(option=>Math.abs(option.value-effective)<1e-8) || rhythms[0];
        const base = selected.label.replace(/ [DT]$/,'');
        const feel = selected.label.endsWith(' D') ? 'dotted' : selected.label.endsWith(' T') ? 'triplet' : 'straight';
        const explicit = typeof pin === 'number' && pin > 0;
        const status = pin === 'Global' ? global.label : pin === 0 ? tr('sync.auto','Auto') : selected.label;
        rows.push({details:{label:`${tr('cfg.division','Subdivision')} · ${status}`,items:[
          choices('subdivision','',[global,{label:tr('sync.auto','Auto'),value:0}]),
          {grid:{label:tr('cfg.noteValue','Note value'),refresh:true,
            options:Array.from(groups.keys(),value=>({label:value,value})),get:()=>explicit?base:null,
            set:value=>{
              const variants=groups.get(value);
              cc.set(name,{subdivision:variants.get(feel) ?? variants.get('straight') ?? variants.values().next().value});
            }}},
          {segment:{label:tr('cfg.noteFeel','Rhythm'),refresh:true,
            options:[['straight',tr('cfg.straight','Straight')],['dotted',tr('cfg.dotted','Dotted')],['triplet',tr('cfg.triplet','Triplet')]]
              .map(([value,label])=>({value,label,disabled:!groups.get(base).has(value)})),
            get:()=>explicit?feel:null,set:value=>cc.set(name,{subdivision:groups.get(base).get(value)})}},
        ]}});
      }
      if(window.getControlMode?.(name)==='D') {
        const sync=cc.get(name,'syncMode',window.syncMode)==='sync';
        const beats=cc.get(name,'burstSubdivision',window.syncSettings.burstSubdivision);
        const value=sync ? burstDivisions.find(([value])=>value===beats)?.[1] || String(beats)
          : `${cc.get(name,'burstDurationMs',520)}ms`;
        const items=sync ? [choices('burstSubdivision',tr('cfg.division','Subdivision'),[global,...burstDivisions.map(([value,label])=>({value,label}))])]
          : [slider('burstDurationMs',tr('cfg.burstDuration','Duration (ms)'),40,10000,10,520)];
        items.push(slider('burstAttackRatio',tr('cfg.burstAttack','Attack'),.05,.5,.005,
          sync?window.syncSettings.burstAttackRatio:70/520));
        rows.push({details:{label:`${tr('cfg.burstLength','Burst length')} · ${value}`,items}});
      }
      const advanced=[slider('phaseOffset',tr('cfg.phase','Phase (beats)'),-4,4,.125,
        pulse?window.syncSettings.pulsePhaseOffset:window.syncSettings.lfoPhaseOffset)];
      if(pulse) advanced.push(
        slider('swing',tr('sync.swing','Swing'),0,.66,.01,window.syncSettings.pulseSwing),
        choices('count',tr('cfg.ratchet','Ratchet'),[1,2,3,4].map((n,i)=>({label:String(n),value:i/3}))),
      );
      rows.push({details:{label:tr('cfg.advanced','Advanced'),items:advanced}});
      rows.push({ action: { label: tr('cfg.resetModulator', 'Restore shared defaults'), danger: false, run: () => cc.clear(name) } });
      return rows;
    });
    cfg.attach();

    const t = (key, fallback) => (window.RcSurfaceI18n ? window.RcSurfaceI18n.t(key) : (fallback ?? key));

    function refreshBadges() {
      const cc = window.RcControlConfig;
      if (!cc) return;
      document.querySelectorAll('[data-name]').forEach((el) => {
        el.querySelectorAll('.mode-badge,.shape-badge,.pad-mode-tag').forEach((b) => b.remove());
        const name = el.getAttribute('data-name');
        if (!name) return;
        const mode = cc.get(name, 'mode', null);
        const shape = cc.get(name, 'shape', null);
        const subdiv = cc.get(name, 'subdivision', null);
        const isPad = name.startsWith('pad-');
        if (/^toggle-[1-8]$/.test(name)) return;
        // P01 (rc-surface-cfg-pad-pulse-polish-2026-09-18): pads use
        // .pad-mode-tag (the inline letter beside .num) for their mode
        // override. Appending a .mode-badge on top would create a duplicate
        // and overlap the number; skip it. The mode badge still applies to
        // pulse buttons, toggles, knobs and faders.
        if (mode && !isPad) {
          const b = document.createElement('span');
          b.className = 'mode-badge';
          b.textContent = mode;
          el.appendChild(b);
        }
        if (shape) {
          const b = document.createElement('span');
          b.className = 'shape-badge mode-badge';
          b.textContent = shape.slice(0, 4);
          el.appendChild(b);
        }
        if (subdiv !== null && subdiv !== undefined) {
          const b = document.createElement('span');
          b.className = 'mode-badge';
          b.textContent = String(subdiv);
          el.appendChild(b);
        }
        // P01 (rc-surface-cfg-pad-pulse-polish-2026-09-18): render a small
        // letter tag next to .pad .num when this pad carries a mode override
        // (A/B/C/D). The tag flows inline in the parent .pad flex layout so
        // the pad number and the mode letter sit side by side without
        // overlapping. Removed (line above) when the override clears on the
        // next refresh.
        if (isPad && mode && /^[A-D]$/.test(mode)) {
          const tag = document.createElement('span');
          tag.className = 'pad-mode-tag mode-' + mode.toLowerCase();
          tag.textContent = mode;
          el.appendChild(tag);
        }
      });
    }

    if (window.RcControlConfig && typeof window.RcControlConfig.subscribe === 'function') {
      window.RcControlConfig.subscribe(refreshBadges);
      let saveTimer;
      const savePerformance=() => {
        if(window.PerformanceSettings?.applying) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          window.sendPhoneCommand?.('saveProjectClientState', {
            preferences: { performance: window.PerformanceSettings.capture() },
          });
        }, 250);
      };
      window.RcControlConfig.subscribe(({name})=>{
        if(/^(?:toggle-[1-8]|xy-[12]|pad-(?:[1-9]|1[0-2]))$/.test(name)) savePerformance();
      });
      window.addEventListener('ableton-rc:performance-settings-change',savePerformance);
    }
    refreshBadges();

    // Long-press (600 ms) on the CFG header button opens an "overrides + Clear all" menu.
    let pressTimer = null;
    const btn = document.getElementById('btn-cfg-mode');
    if (btn) {
      const startPress = () => {
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          if (!window.RcControlConfig) return;
          const list = window.RcControlConfig.listOverrides();
          const menu = document.getElementById('control-config-menu');
          if (!menu) return;
          if (!list.length) {
            cfg.open && cfg.open('__cfg__', { left: window.innerWidth / 2, top: 64, right: window.innerWidth / 2, bottom: 64, width: 0, height: 0 });
            const body = menu.querySelector('.cfg-menu-body') || menu;
            body.innerHTML = '<div class="cfg-info">' + t('cfg.overridesEmpty', 'No control overrides yet.') + '</div>';
            menu.classList.remove('hidden');
            return;
          }
          // Two-tap confirmation: first long-press shows the list, the user taps
          // the "Clear all" action to confirm.
          cfg.open && cfg.open('__cfg__', { left: window.innerWidth / 2, top: 64, right: window.innerWidth / 2, bottom: 64, width: 0, height: 0 });
          const body = menu.querySelector('.cfg-menu-body') || menu;
          body.innerHTML = '';
          list.forEach((it) => {
            const row = document.createElement('div');
            row.className = 'cfg-info';
            row.textContent = it.name + ': ' + it.summary;
            body.appendChild(row);
          });
          const sep = document.createElement('div');
          sep.className = 'cfg-info';
          sep.textContent = t('cfg.confirmClear', 'Tap again to confirm');
          body.appendChild(sep);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cfg-action danger';
          btn.textContent = t('cfg.clearAll', 'Clear all control config');
          btn.addEventListener('click', () => {
            window.RcControlConfig.clearAll();
            cfg.close && cfg.close();
          });
          body.appendChild(btn);
          menu.classList.remove('hidden');
        }, 600);
      };
      const cancelPress = () => clearTimeout(pressTimer);
      btn.addEventListener('pointerdown', startPress);
      btn.addEventListener('pointerup', cancelPress);
      btn.addEventListener('pointercancel', cancelPress);
      btn.addEventListener('pointerleave', cancelPress);
    }

    window.RcConfigModeInstance = cfg;
  }

  function setupAudioUI() {
    window.AudioWorkspace?.create();
    const chk = document.getElementById('chk-audio-enable');
    let inputSelector = null;
    const showInputError = (key) => {
      const label = document.getElementById('lbl-audio-path');
      if (label) label.textContent = T(key);
    };
    const lblRms = document.getElementById('lbl-audio-rms');
    const lblEnvelope = document.getElementById('lbl-audio-envelope');
    const lblGate = document.getElementById('lbl-audio-gate');
    const barRms = document.getElementById('bar-audio-rms');
    const AUDIO_DESCRIPTOR_CONTROLS = window.AudioDescriptorCatalog.map(({ field, name }) => [field, name]);
    const descriptorDisplays = window.AudioDescriptorCatalog.map(({ field, hzScale }) => ({
      value: document.getElementById('lbl-audio-' + field),
      meter: document.getElementById('bar-audio-' + field),
      hzScale,
    }));
    const publishAudioDescriptors = (data, lost = false) => {
      const controls = AUDIO_DESCRIPTOR_CONTROLS.map(([field, name]) => {
        const raw = Number(data?.[field]);
        return {
          name,
          value: Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0,
          lost: lost === true,
        };
      });

      // Keep display state while publishing the twelve measurements together
      // through the shared realtime clock (no extra independent audio budget).
      // The old exact descriptor packet remains a mixed-version fallback.
      if (window.onControl) {
        const publish = () => controls.forEach(control => window.onControl(control));
        if (controlStream) controlStream.batch(publish);
        else publish();
      }
      const socket = window.phoneWs;
      const clientId = window.getPhoneClientId ? window.getPhoneClientId() : null;
      // An immediate frame is useful only while current. Keep the latest
      // fallback state above, but never queue attacks behind a backed-up link.
      try {
        if (!controlStream?.isActive() && socket && socket.readyState === WebSocket.OPEN && clientId && !(socket.bufferedAmount > 0)) {
          socket.send(JSON.stringify({
            type: 'controls',
            client_id: clientId,
            ts: Date.now(),
            controls,
          }));
        }
      } catch {
        // A connection closing between the readyState check and send must not
        // stop microphone analysis. Reconnect/snapshot owns recovery.
      }
      // Render after publication; disconnected pages still receive raw readouts.
      if (!lost) audioTimeline?.pushDescriptors?.({ ...data, timestamp: Date.now() });
      else if (!audioProcessor) audioTimeline?.setState('off');
      else if (audioTimeline?.view !== 'amplitude') audioTimeline?.setState('waiting');
      controls.forEach((control, index) => {
        const display = descriptorDisplays[index];
        if (display.value) display.value.textContent = display.hzScale
          ? Math.round(control.value * display.hzScale) + ' Hz' : control.value.toFixed(3);
        if (display.meter) display.meter.style.transform = 'scaleX(' + control.value + ')';
      });
    };
    const audioTimeline = window.AudioSignalTimeline
      ? new window.AudioSignalTimeline({
          canvas: document.getElementById('audio-timeline-canvas'),
          root: document.getElementById('audio-timeline'),
          status: document.getElementById('audio-timeline-status'),
          scale: document.getElementById('audio-graph-scale'),
          windowMs: 2500,
        })
      : null;
    window.AudioWorkspace?.connectGraph(audioTimeline);
    // Register current amplitude/descriptor sources as lost until capture starts.
    if (window.onControl) {
      window.onControl({ name: 'sensor.audio.rms',            value: 0,   lost: true });
      window.onControl({ name: 'sensor.audio.envelope',       value: 0,   lost: true });
      window.onControl({ name: 'sensor.audio.attack',         value: 0,   lost: true });
      window.onControl({ name: 'sensor.audio.gate',           value: 0,   lost: true });
      for (const [, name] of AUDIO_DESCRIPTOR_CONTROLS) {
        window.onControl({ name, value: 0, lost: true });
      }
    }
    if (!chk) return;

    let audioProcessor = null;
    let smoothedRms = 0;
    let calibratedAudioGain = null;
    window.PageCalibration?.register('audio', {
      source: () => chk.checked ? audioProcessor : null,
      apply: ({ gain }) => { calibratedAudioGain = gain; },
      reset: () => { calibratedAudioGain = null; smoothedRms = 0; },
    });
    const AUDIO_SIGNAL_TIMEOUT_MS = 180;
    let lastAudioFrameAt = 0;
    let lastDescriptorFrameAt = 0;
    let audioLossActive = false;
    let descriptorLossSent = false;
    const makeAudioSignal = (neutral, outlierDelta = 0.65) => {
      if (window.SafeInputLayer?.SafeSignal) {
        return new window.SafeInputLayer.SafeSignal({
          neutral, holdMs: 150, releaseMs: 1200, outlierDelta,
          attack: 1, release: 1, recovery: 0.18,
        });
      }
      // Compatibility for partial embeds/tests that load app.js alone.
      return {
        value: neutral,
        ingest(value) { this.value = value; return { value, state: 'active' }; },
        markLost() {},
        tick() { return { value: this.value, state: 'lost' }; },
      };
    };
    const audioSafety = {
      rms: { signal: makeAudioSignal(0, 0.75), scale: 1, control: 'sensor.audio.rms' },
      envelope: { signal: makeAudioSignal(0, 0.75), scale: 1, control: 'sensor.audio.envelope' },
      // One value per note, already settled by the time it gets here, so it
      // is not smoothed again — smoothing a step would blur the attack this
      // channel exists to measure.
      attack: { signal: makeAudioSignal(0), scale: 1, control: 'sensor.audio.attack' },
    };
    const safeAudioValue = (channel, value, timestamp = Date.now(), confidence = 1) => {
      const entry = audioSafety[channel];
      return entry.signal.ingest(value / entry.scale, timestamp, confidence).value * entry.scale;
    };
    // RMS uses the adaptive smoother from audio-smoothing.js: heavy
    // smoothing on quiet signals (anti-jitter) and fast tracking on loud
    // signals (transients pass through). envelope stays raw for now; can
    // be migrated the same way once we've validated the RMS behaviour.

    const DETECTOR_STORAGE = 'ableton-rc:audio_detectors';
    const readDetectorSettings = () => {
      try { return JSON.parse(localStorage.getItem(DETECTOR_STORAGE) || 'null'); } catch { return null; }
    };
    // Partial embeds and unit tests load app.js without the DSP modules.
    const detectorClock = () => ({ syncMode: window.syncMode, bpm: window.currentBpm });
    const normalizeDetectors = (patch) => ({
      ...(window.AudioDescriptors?.normalizeSettings?.(patch)
        ?? { sensitivity: 0.65, releaseMs: 45, curve: 1, window: 2, toneMs: 0, textureMs: 0, bandsMs: 0, ...(patch || {}) }),
      ...window.AudioDetectorTiming?.preferences(patch, window.currentBpm),
    });
    let detectorSettings = normalizeDetectors(readDetectorSettings());
    // Persist migrated subdivisions separately from the untouched FREE times.
    try { localStorage.setItem(DETECTOR_STORAGE, JSON.stringify(detectorSettings)); } catch { /* private mode */ }
    const resolvedDetectors = () => window.AudioDetectorTiming?.resolve(detectorSettings, detectorClock()) ?? detectorSettings;
    let detectorClockKey = '';
    window.refreshAudioDetectorTiming = () => {
      const key = window.syncMode + ':' + (window.syncMode === 'sync' ? window.currentBpm : 'free');
      if (key === detectorClockKey) return;
      detectorClockKey = key;
      audioProcessor?.setDescriptorSettings?.(resolvedDetectors());
      window.AudioWorkspace?.refreshTiming?.();
    };
    window.AudioWorkspace?.connectControls({
      get: () => detectorSettings,
      clock: detectorClock,
      set: (key, value) => {
        detectorSettings = normalizeDetectors({ ...detectorSettings, [key]: value });
        try { localStorage.setItem(DETECTOR_STORAGE, JSON.stringify(detectorSettings)); } catch { /* private mode */ }
        audioProcessor?.setDescriptorSettings?.(resolvedDetectors());
        // The window readout and the pressed state belong to the same strip.
        if (key === 'window') window.AudioWorkspace?.renderControls?.();
      },
    });
    window.refreshAudioDetectorTiming();

    const startAudio = async () => {
      audioTimeline?.setState('waiting');
      if (!audioProcessor) {
        lastAudioFrameAt = Date.now();
        lastDescriptorFrameAt = lastAudioFrameAt;
        descriptorLossSent = false;
        audioProcessor = new window.AudioProcessor();
        const ownedProcessor = audioProcessor;
        audioProcessor.onCaptureEnded = () => {
          if (audioProcessor !== ownedProcessor) return;
          stopAudio();
          state.sensors.audio = 'lost';
          showInputError('aud.inputEnded');
          inputSelector?.refresh();
        };
        audioProcessor.setDescriptorSettings?.(resolvedDetectors());
        audioProcessor.onDescriptorModeChange = (mode) => {
          const label = document.getElementById('lbl-audio-path');
          if (label) label.textContent = mode === 'worklet' ? T('aud.continuous', 'Continuous capture')
            : mode === 'compatibility' ? T('aud.compatibility', 'Compatibility capture') : '';
        };
        audioProcessor.onDescriptorUpdate = (data) => {
          if (audioProcessor !== ownedProcessor) return;
          lastDescriptorFrameAt = Date.now();
          state.sensors.audio = 'available';
          descriptorLossSent = false;
          publishAudioDescriptors(data);
        };
        audioProcessor.onAnalysisUpdate = (data) => {
          if (audioProcessor !== ownedProcessor) return;
          window.PageCalibration?.feed('audio', { rms: data.rms });
          const audioTimestamp = Date.now();
          lastAudioFrameAt = audioTimestamp;
          state.sensors.audio = 'available';
          // RMS-specific: amplify input 3x (raw mic is 0.01â€“0.05 for everyday
          // signals), clamp saturated peaks, then smooth with adaptive alpha.
          // alpha computed from raw, not the gained value, so silence still gets
          // heavy noise suppression. See audio-smoothing.js for the formula.
          smoothedRms = window.AudioSmoothing.gainSmoothedRms(smoothedRms, data.rms,
            0.08 + Math.min(0.5, data.rms * 2), calibratedAudioGain ?? undefined);
          
          const dispRms = parseFloat(safeAudioValue('rms', smoothedRms, audioTimestamp).toFixed(3));
          const safeEnvelope = safeAudioValue('envelope',
            Math.min(1, data.envelope * (calibratedAudioGain ?? 1)), audioTimestamp);
          audioLossActive = false;
          audioTimeline?.push({
            timestamp: audioTimestamp,
            rms: data.rms,
            envelope: data.envelope,
            gate: data.gate,
            gateThreshold: data.gateThreshold,
          });

          if (barRms) {
            const pct = Math.min(100, Math.round(dispRms * 250));
            barRms.style.width = pct + '%';
          }
          if (lblRms) lblRms.textContent = dispRms.toFixed(3);
          if (lblEnvelope) lblEnvelope.textContent = safeEnvelope.toFixed(3);
          if (lblGate) lblGate.textContent = data.gate ? 'ON' : 'OFF';
          for (const [element, active] of [[lblGate, data.gate]]) {
            element?.parentElement?.classList.toggle('active', Boolean(active));
          }

          if (window.onControl) {
            window.onControl({ name: 'sensor.audio.rms',            value: dispRms });
            window.onControl({ name: 'sensor.audio.attack',         value: Math.max(0, Math.min(1, Number(data.attack) || 0)) });
            window.onControl({ name: 'sensor.audio.envelope',       value: safeEnvelope });
            window.onControl({ name: 'sensor.audio.gate',           value: data.gate });
          }

          state.sensors.audio_reading = {
            rms: dispRms,
            envelope: safeEnvelope,
            ...Object.fromEntries(AUDIO_DESCRIPTOR_CONTROLS.map(([field, name]) =>
              [field, Number(window.currentControlStates?.[name]) || 0])),
            gate: data.gate
          };

        };
      }
      const startingProcessor = audioProcessor;
      try {
        const started = await startingProcessor.start(inputSelector?.deviceId || '');
        if (audioProcessor !== startingProcessor || !chk.checked || started === false) return;
        state.sensors.audio = 'available';
        inputSelector?.refresh();
      } catch (err) {
        if (audioProcessor !== startingProcessor || !chk.checked) return;
        console.error('Failed to start audio processor:', err);
        state.sensors.audio = 'error';
        chk.checked = false;
        audioTimeline?.setState('off');
        showInputError('aud.inputFailed');
      }
    };

    const stopAudio = () => {
      window.PageCalibration?.invalidate('audio');
      if (audioProcessor) {
        audioProcessor.stop();
        audioProcessor = null;
      }
      chk.checked = false;
      state.sensors.audio = 'inactive';
      state.sensors.audio_reading = null;
      smoothedRms = 0;
      audioTimeline?.setState('off');
      if (lblGate) lblGate.textContent = T('js.off', 'OFF');

      const lostAt = Date.now();
      audioLossActive = true;
      publishAudioDescriptors(null, true);
      descriptorLossSent = true;
      if (window.onControl) {
        for (const entry of Object.values(audioSafety)) {
          entry.signal.markLost(lostAt);
          const safe = entry.signal.tick(lostAt);
          window.onControl({ name: entry.control, value: safe.value * entry.scale, lost: true });
        }
        window.onControl({ name: 'sensor.audio.gate',           value: 0, lost: true });
      }
    };

    // Mobile browsers can suspend AudioContext/rAF without a final callback.
    // Hold briefly, then release continuous channels to neutral. Discrete
    // gates release immediately once the timeout is confirmed.
    const audioWatchdog = setInterval(() => {
      const now = Date.now();
      // Independent producers must not keep each other's stale values alive:
      // the Worklet can run while rAF is paused, or fail while rAF still runs.
      const descriptorFresh = audioProcessor
        && now - lastDescriptorFrameAt <= AUDIO_SIGNAL_TIMEOUT_MS;
      if (audioProcessor && !descriptorFresh && !descriptorLossSent) {
        audioProcessor?.resetDescriptors();
        publishAudioDescriptors(null, true);
        descriptorLossSent = true;
      }
      if ((!audioProcessor && !audioLossActive) || (!lastAudioFrameAt && !audioLossActive)) return;
      if (!audioLossActive && now - lastAudioFrameAt <= AUDIO_SIGNAL_TIMEOUT_MS) return;
      const lostAt = audioLossActive ? now : lastAudioFrameAt + AUDIO_SIGNAL_TIMEOUT_MS;
      if (window.onControl) {
        let allIdle = true;
        for (const entry of Object.values(audioSafety)) {
          entry.signal.markLost(lostAt);
          const safe = entry.signal.tick(now);
          window.onControl({ name: entry.control, value: safe.value * entry.scale, lost: true });
          if (safe.state !== 'idle') allIdle = false;
        }
        const releasedRms = audioSafety.rms.signal.value;
        const releasedEnvelope = audioSafety.envelope.signal.value;
        if (barRms) barRms.style.width = `${Math.min(100, Math.round(releasedRms * 250))}%`;
        if (lblRms) lblRms.textContent = releasedRms.toFixed(3);
        if (lblEnvelope) lblEnvelope.textContent = releasedEnvelope.toFixed(3);
        window.onControl({ name: 'sensor.audio.gate', value: 0, lost: true });
        if (lblGate) lblGate.textContent = T('js.off', 'OFF');
        lblGate?.parentElement?.classList.remove('active');
        if (allIdle) audioLossActive = false;
      }
      if (audioProcessor) {
        state.sensors.audio = descriptorFresh ? 'available'
          : document.visibilityState === 'hidden' ? 'suspended' : 'lost';
        if (!descriptorFresh || audioTimeline?.view === 'amplitude') audioTimeline?.setState('waiting');
      }
    }, 50);
    if (audioWatchdog && typeof audioWatchdog.unref === 'function') audioWatchdog.unref();

    chk.checked = false;

    inputSelector = window.AudioInputSelector?.create({
      select: document.getElementById('audio-input-device'),
      translate: T,
      onChange() {
        const wasEnabled = chk.checked;
        stopAudio();
        if (wasEnabled) {
          chk.checked = true;
          startAudio();
        }
      },
    });
    chk.addEventListener('change', () => {
      if (chk.checked) {
        startAudio();
      } else {
        stopAudio();
      }
    });
    window.addEventListener('pagehide', stopAudio);
  }

  function getVisionGestureLabel(h) {
    if (!h || !h.active) return 'No hand';
    return typeof state.vision.describeHand === 'function' ? state.vision.describeHand(h) : 'Hand tracked';
  }

  function renderVisionGestureBadges(h) {
    document.querySelectorAll('[data-vision-gesture]').forEach((badge) => {
      const key = badge.dataset && badge.dataset.visionGesture;
      if (!key) return;
      const enabled = badge.getAttribute('aria-pressed') === 'true';
      let active = false;
      active = !!h && h.active && !!h[key];
      badge.classList.toggle('active', enabled && active);
    });
  }

  function isVisionDetectorEnabled(name) {
    return document.querySelector(`[data-vision-gesture="${name}"]`)?.getAttribute?.('aria-pressed') === 'true';
  }

  // The VID readouts expose the raw palm measurement and signed facing
  // diagnostic, but mapping inputs must stay in the shared 0..1 range.
  function normalizeVisionPalm(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  }

  function normalizeVisionFace(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, (number + 1) / 2)) : 0.5;
  }

  // Readouts repaint on every inference frame. Writing an unchanged string
  // still replaces the text node and invalidates layout, so skip it.
  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function renderVisionReadouts() {
    const h = state.vision && state.vision.hand;
    if (!h) return;

    const gesture = getVisionGestureLabel(h);
    const lblGesture = document.getElementById('lbl-vision-gesture');
    setTextIfChanged(lblGesture, gesture);
    for (const channel of ['x', 'y', 'z']) {
      const value = document.getElementById(`vision-value-${channel}`);
      setTextIfChanged(value, Number(h[channel] ?? (channel === 'z' ? 0 : 0.5)).toFixed(2));
    }
    // The number the Z window is cut from. Shown so the window can be set by
    // measurement on the actual phone rather than copied from other optics.
    const palm = document.getElementById('vision-value-palm');
    // Two decimals, not three: palm size runs roughly 0.10 to 0.35, so 0.01 is
    // ample to cut a Z window from, and the shorter string is what lets the
    // chip sit on one row with the other four.
    setTextIfChanged(palm, Number(h.palmSize ?? 0).toFixed(2));
    const facing = document.getElementById('vision-value-facing');
    if (facing) {
      const signedFacing = Number(h.facing ?? 0);
      setTextIfChanged(facing, `${signedFacing < 0 ? '-' : '+'}${Math.abs(signedFacing).toFixed(2)}`);
    }
    // The clutch was only observable on the wire, which meant the one thing
    // worth checking on the phone — did it engage, and does it hold when I
    // let go — could not be seen from the phone at all.
    const clutchState = document.getElementById('vision-clutch-state');
    if (clutchState) {
      const engaged = Boolean(h.pinch_engaged);
      setTextIfChanged(clutchState, engaged ? 'HELD' : 'OFF');
      clutchState.classList.toggle('is-engaged', engaged);
    }
    for (const axis of ['x', 'y', 'z']) {
      const cell = document.getElementById(`vision-value-pinch-${axis}`);
      setTextIfChanged(cell, Number(h[`pinch_${axis}`] ?? 0.5).toFixed(2));
    }
    renderVisionGestureBadges(h);
  }

  function setupVisionUI() {
    window.sensorSettingsSummary = () => ['motion', 'orientation'].map(name => `${name}: ${document.querySelector(`[data-sensor-status="${name}"]`)?.textContent || '-'}`).join(' · ');
    const chk = document.getElementById('chk-vision-enable');
    const hud = document.getElementById('vision-hud');
    const video = document.getElementById('vision-video');
    const canvas = document.getElementById('vision-canvas');
    const lblGesture = document.getElementById('lbl-vision-gesture');
    const performanceBadge = document.getElementById('vision-performance-badge');
    let badgePose = null;
    let badgeTrackingLost = false;
    let badgeNoteState = null;
    let badgeLossState = null;
    let badgeLossDeadline = null;
    let visionTrackingSeq = 0;
    const visionPoseActivations = new Map();
    const liveGestureSlots = new Set();
    const renderPerformanceBadge = () => {
      if (!performanceBadge) return;
      const parts = [];
      if (badgePose) parts.push(`${badgePose} · ${badgeTrackingLost
        ? T('vid.poseLastKnown', 'LAST KNOWN') : T('vid.poseHeld', 'HELD')}`);
      if (badgeNoteState) parts.push(`${T('vid.noteBadge', 'NOTE')}: ${badgeNoteState}`);
      const lossLabel = {holding: T('settings.holding', 'LAST KNOWN'), tracking: T('settings.tracking', 'TRACKING'), released: T('settings.released', 'RELEASED')}[badgeLossState];
      if (lossLabel) parts.push(lossLabel
        + (badgeLossState === 'holding' && badgeLossDeadline !== null ? ` · ${Math.max(0, (badgeLossDeadline - performance.now()) / 1000).toFixed(1)} s` : ''));
      setTextIfChanged(performanceBadge, parts.join(' · '));
      const tracking = badgeTrackingLost ? 'lost' : 'live';
      if (performanceBadge.dataset && performanceBadge.dataset.tracking !== tracking) {
        performanceBadge.dataset.tracking = tracking;
      }
      performanceBadge.classList.toggle('hidden', parts.length === 0);
    };
    window.onVisionTriggerNoteState = (message) => {
      if (!String(message?.control || '').startsWith('sensor.vision.')) return;
      if (badgePose && /^sensor\.vision\.gesture\.(?:[1-9]|1[0-5])$/.test(message.control)
        && badgePose !== `G${String(message.control).split('.').at(-1)}`) return;
      const next = String(message.state || '');
      badgeNoteState = ['pending', 'held', 'sent', 'cancelled', 'unavailable'].includes(next)
        ? next.toUpperCase() : null;
      renderPerformanceBadge();
    };
    const confidenceSelect = document.getElementById('vision-confidence');
    const gesturePresetSelect = document.getElementById('vision-recognition-preset');
    const cameraStage = document.querySelector('.vision-camera-stage');
    const cameraStateTitle = document.getElementById('vision-camera-state-title');
    const cameraStateDetail = document.getElementById('vision-camera-state-detail');
    const detectorButtons = Array.from(document.querySelectorAll('[data-vision-gesture]'))
      .filter((button) => button?.dataset?.visionGesture);
    const gestureSlotCards = Array.from(document.querySelectorAll('[data-gesture-slot]'))
      .filter((card) => card?.dataset?.gestureSlot);
    if (typeof window.VisionControlState !== 'function') return;

    const VISION_LOSS_CHANNELS = Object.freeze([
      { name: 'sensor.vision.x', value: 0.5 },
      { name: 'sensor.vision.y', value: 0.5 },
      { name: 'sensor.vision.z', value: 0 },
      { name: 'sensor.vision.pinch_x', value: 0.5 },
      { name: 'sensor.vision.pinch_y', value: 0.5 },
      { name: 'sensor.vision.pinch_z', value: 0.5 },
      ...Array.from({length:15},(_,i)=>({name:`sensor.vision.gesture.${i+1}`,value:0})),
    ]);
    const emitVisionSignalLoss = (includePoses = true) => {
      if (!window.onControl) return;
      for (const channel of VISION_LOSS_CHANNELS) {
        if (!includePoses && channel.name.startsWith('sensor.vision.gesture.')) continue;
        window.onControl({ ...channel, lost: true });
      }
    };
    const VISION_DETECTOR_NAMES = Object.freeze(['fist', 'pinch', 'victory', 'open']);
    const emitEnabledVisionDetectorLoss = () => {
      if (!window.onControl) return;
      for (const detector of VISION_DETECTOR_NAMES) {
        if (visionControls.detectorEnabled(detector)) {
          window.onControl({ name: `sensor.vision.${detector}`, value: 0, lost: true });
        }
      }
      if (visionControls.detectorEnabled('victory')) {
        window.onControl({ name: 'sensor.vision.rotateVal', value: 0.5, lost: true });
      }
    };

    // Same pattern as audio: emit the vision channels at zero BEFORE the
    // user enables the camera. Lets the user bind sensor.vision.* channels
    // to a Live parameter in advance; the mapping starts working the
    // moment the camera is enabled.
    // Same reasoning as the audio pre-arm: registering the channels, not
    // measuring them, so flag the absence rather than publishing a value.
    if (window.onControl) {
      window.onControl({ name: 'sensor.vision.active', value: 0 });
      emitVisionSignalLoss();
    }

    // Wire the per-channel mode buttons. The picker only offers the modes
    // each channel semantically supports (x/y/z â†’ A/B; gestures â†’ A/C) but
    // the data model and localStorage happily carry any letter, so a future
    // B-for-gesture or C-for-position could be enabled without UI surgery.
    // Tests mount the script into a minimal DOM stub, so skip any element
    // that lacks the expected data attribute rather than crashing the suite.
    document.querySelectorAll('#vision-modes .vision-mode-row').forEach((row) => {
      const channel = row.dataset && row.dataset.channel;
      if (!channel) return;
      const buttons = row.querySelectorAll('.vision-mode-btn');
      const apply = () => {
        buttons.forEach((btn) => {
          btn.classList.toggle('active', state.visionModes[channel] === btn.dataset.mode);
        });
      };
      apply();
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          state.visionModes[channel] = btn.dataset.mode;
          saveVisionModes();
          apply();
        });
      });
    });

    if (!chk || !video || !canvas || !hud) return;
    if (cameraStage?.appendChild) {
      cameraStage.appendChild(hud);
    }

    const GESTURE_PRESETS = {
      precision: { threshold: 0.11, ambiguityRatio: 1.4, minimumConfidence: 0.66, captureStabilityThreshold: 0.075, holdMs: 260, releaseMs: 240, releaseRatio: 1.25, unknownGraceMs: 80 },
      balanced: { threshold: 0.16, ambiguityRatio: 1.25, minimumConfidence: 0.52, captureStabilityThreshold: 0.10, holdMs: 160, releaseMs: 220, releaseRatio: 1.4, unknownGraceMs: 140 },
      performance: { threshold: 0.176, ambiguityRatio: 1.25, minimumConfidence: 0.52, captureStabilityThreshold: 0.10, holdMs: 120, releaseMs: 140, releaseRatio: 1.10, unknownGraceMs: 140 },
      flexible: { threshold: 0.20, ambiguityRatio: 1.15, minimumConfidence: 0.44, captureStabilityThreshold: 0.125, holdMs: 120, releaseMs: 200, releaseRatio: 1.6, unknownGraceMs: 200 },
    };
    const POSE_CAPTURE_MS = 900;
    const POSE_PREPARE_TIMEOUT_MS = 6000;

    // Saved takes are what the recogniser learns its tolerance from.
    // The descriptor already removes position, uniform scale and planar wrist
    // rotation. Ask for differences it really retains: finger curl and palm
    // yaw/pitch. Those are the variations a performer will reproduce across
    // rooms and camera angles, so the takes teach a useful range.
    const POSE_TAKE_GUIDANCE = [
      ['vid.take.natural', 'make the gesture naturally'],
      ['vid.take.curl', 'repeat it with a looser or tighter curl'],
      ['vid.take.palm', 'turn the palm slightly toward or away from the camera'],
      ['vid.take.angle', 'repeat from another comfortable palm angle'],
      ['vid.take.distance', 'vary distance a little while keeping the same finger shape'],
      ['vid.take.combine', 'combine a comfortable curl with another palm angle'],
    ];
    const poseTakeHint = (taken) => T(...POSE_TAKE_GUIDANCE[
      Math.min(Math.max(0, taken), POSE_TAKE_GUIDANCE.length - 1)]);

    let visionProcessor = null;
    let calibrationFrameContext = null;
    let lastCalibrationFrame = -Infinity;
    let calibrationVideoTime = -1;
    window.PageCalibration?.register('video', {
      source: () => {
        const track = visionProcessor?.video?.srcObject?.getVideoTracks?.()[0];
        return visionProcessor?.active && track?.readyState === 'live' ? track : null;
      },
      apply: () => {},
      reset: () => { lastCalibrationFrame = -Infinity; calibrationVideoTime = -1; },
    });
    let visionStartGeneration = 0;
    let visionGestureTestSlot = null;
    let visionGestureLearnSlot = null;
    let poseCaptureTimer = null;
    let gestureTestFeedbackTimer = null;
    let visionSafetyConfig = null;
    try {
      visionSafetyConfig = JSON.parse(localStorage.getItem('ableton-rc:vision_safety') || 'null');
    } catch {}
    const restoredVisionProfile = !!visionSafetyConfig;
    let visionLoss;
    try { visionLoss = window.RcPageSettings?.policy(visionSafetyConfig?.visionLoss, restoredVisionProfile); }
    catch { visionLoss = window.RcPageSettings?.policy(undefined, true); }
    visionSafetyConfig = visionSafetyConfig || {
      version: 2,
      confidence: 'medium',
      gestures: { version: 9, templates: [] },
      gestureOptions: {},
      gesturePreset: 'balanced',
      visionControls: {},
    };
    let incompatibleGestureNames = new Set();
    const migrateGestureConfig = (gestures, options = {}) => {
      const library = window.SafeInputLayer?.GestureLibrary?.fromJSON?.(gestures, options);
      incompatibleGestureNames = new Set(library?.getIncompatibleNames?.() || []);
      return library?.toJSON?.() || gestures || { version: 9, templates: [] };
    };
    visionSafetyConfig.gestureOptions = { ...visionSafetyConfig.gestureOptions, maxTakes: 6 };
    visionSafetyConfig.gestures = migrateGestureConfig(visionSafetyConfig.gestures, visionSafetyConfig.gestureOptions);
    const normalizeGestureTemplates = window.normalizeVisionGestureTemplates || ((templates) => templates || []);
    visionSafetyConfig.gestures = {
      ...(visionSafetyConfig.gestures || { version: 1 }),
      templates: normalizeGestureTemplates(visionSafetyConfig.gestures?.templates),
    };

    let visionControls = new window.VisionControlState(
      visionSafetyConfig?.visionControls || {},
      visionSafetyConfig?.gestures?.templates || [],
    );
    state.vision.describeHand = (hand) => visionControls.describeHand(hand);

    const gestureTemplateFor = (name) => {
      const templates = visionProcessor?.exportSafetyConfig?.().gestures?.templates
        || visionSafetyConfig?.gestures?.templates || [];
      return templates.find((template) => template.name === name) || null;
    };
    const samplesForGesture = (name) => {
      return Math.min(6, gestureTemplateFor(name)?.samples?.length || 0);
    };
    const captureCap = () => 6;
    const gestureKindFor = (name) => {
      const kind = visionProcessor?.gestureKind?.(name) || gestureTemplateFor(name)?.kind || '';
      return kind ? 'POSE' : '';
    };

    const dismissedPoseWarnings = new Set();
    const poseWarnings = new Map();
    const renderVisionControlState = () => {
      detectorButtons.forEach((button) => {
        const enabled = visionControls.detectorEnabled(button.dataset.visionGesture);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        button.classList.toggle('enabled', enabled);
      });
      gestureSlotCards.forEach((card) => {
        const id = Number(card.dataset.gestureSlot);
        const slot = visionControls.slots[id - 1];
        const status = card.querySelector('.vision-slot-status');
        const countLabel = card.querySelector('header strong');
        const learnButton = card.querySelector('.vision-slot-learn');
        const testButton = card.querySelector('.vision-slot-test');
        const retakeButton = card.querySelector('.vision-slot-retake');
        const deleteButton = card.querySelector('.vision-slot-delete');
        const samples = samplesForGesture(slot?.name || '');
        const max = captureCap();
        const kind = gestureKindFor(slot?.name || '');
        const kindPrefix = kind ? `${kind} · ` : '';
        const library = visionProcessor?.gestures || window.SafeInputLayer?.GestureLibrary?.fromJSON?.(
          visionSafetyConfig.gestures, visionSafetyConfig.gestureOptions);
        const warning = dismissedPoseWarnings.has(slot?.name) ? null : library?.takeConsistency?.(slot?.name);
        poseWarnings.set(slot?.name, warning);
        const warningBox = card.querySelector('.vision-slot-consistency');
        warningBox?.classList.toggle('hidden', !warning);
        const warningMessage = warningBox?.querySelector('.vision-consistency-message');
        if (warningMessage && warning) warningMessage.textContent = T('vid.takeOutlier',
          'Take {n} differs from the others', { n: warning.index + 1 });
        if (countLabel) countLabel.textContent = `${samples} / ${max}`;
        if (learnButton) learnButton.disabled = samples >= max;
        if (testButton) testButton.disabled = samples < 3;
        if (retakeButton) retakeButton.disabled = samples === 0;
        if (deleteButton) deleteButton.disabled = samples === 0 && !incompatibleGestureNames.has(slot?.name);
        if (status && !card.classList.contains('recording') && !card.classList.contains('testing')) {
          status.textContent = samples === 0 && incompatibleGestureNames.has(slot?.name)
            ? T('vid.recaptureRequired', 'RECAPTURE REQUIRED · camera proportions were corrected; capture the pose again')
            : samples === 0 ? T('vid.emptyCapture', 'Empty · capture at least {min} examples', { min: 3 })
            : samples >= 3 ? kindPrefix + T('vid.slotReady', 'Ready · press TEST to validate')
              : kindPrefix + T('vid.slotPartial', '{n}/{max} saved · capture {left} more', { n: samples, max, left: 3 - samples });
        }
      });
    };

    const persistVisionSafety = () => {
      if (visionProcessor?.exportSafetyConfig) {
        const gesturePreset = visionSafetyConfig?.gesturePreset || gesturePresetSelect?.value || 'balanced';
        visionSafetyConfig = { ...visionProcessor.exportSafetyConfig(), gesturePreset };
        incompatibleGestureNames = new Set(visionProcessor.gestures?.getIncompatibleNames?.() || []);
      }
      if (visionSafetyConfig) {
        visionSafetyConfig.visionLoss = visionLoss;
        visionSafetyConfig.visionControls = visionControls.toJSON();
        try { localStorage.setItem('ableton-rc:vision_safety', JSON.stringify(visionSafetyConfig)); } catch {}
        if (typeof window.sendPhoneCommand === 'function') {
          window.sendPhoneCommand('saveProjectClientState', {
            camera: {
              confidence: visionSafetyConfig.confidence,
            },
            gestures: visionSafetyConfig.gestures,
            preferences: {
              visionGestureOptions: visionSafetyConfig.gestureOptions,
              visionGesturePreset: visionSafetyConfig.gesturePreset || 'balanced',
              visionControls: visionControls.toJSON(),
            },
          });
        }
      }
    };

    window.applyProjectClientState = (clientState) => {
      if (!clientState) return;
      window.PerformanceSettings?.applyHost(clientState.preferences?.performance);
      try { visionLoss = window.RcPageSettings?.policy(clientState.preferences?.visionLoss, true); } catch { /* retain valid host state */ }
      const restoredGestureOptions = {
        ...(clientState.preferences?.visionGestureOptions || visionSafetyConfig?.gestureOptions || {}),
        maxTakes: 6,
      };
      const restoredGestures = migrateGestureConfig(
        clientState.gestures || visionSafetyConfig?.gestures || { version: 1, templates: [] },
        restoredGestureOptions,
      );
      visionSafetyConfig = {
        version: 2,
        confidence: clientState.camera?.confidence || visionSafetyConfig?.confidence || 'medium',
        gestures: { ...restoredGestures, templates: normalizeGestureTemplates(restoredGestures.templates) },
        gestureOptions: restoredGestureOptions,
        gesturePreset: clientState.preferences?.visionGesturePreset || visionSafetyConfig?.gesturePreset || 'balanced',
        visionControls: clientState.preferences?.visionControls || visionSafetyConfig?.visionControls || {},
        visionLoss,
      };
      visionControls = new window.VisionControlState(visionSafetyConfig.visionControls, visionSafetyConfig.gestures?.templates || []);
      syncGestureSlotCards();
      if (confidenceSelect) {
        let conf = visionSafetyConfig.confidence;
        if (conf === 0.2) conf = 'low';
        else if (conf === 0.7) conf = 'high';
        else if (conf === 0.5) conf = 'medium';
        confidenceSelect.value = conf || 'medium';
      }
      if (gesturePresetSelect) gesturePresetSelect.value = visionSafetyConfig.gesturePreset;
      visionProcessor?.importSafetyConfig(visionSafetyConfig);
      visionProcessor?.setGestureOptions(GESTURE_PRESETS[visionSafetyConfig.gesturePreset] || GESTURE_PRESETS.balanced);
      renderVisionControlState();
      if (clientState.pages?.activePage && typeof window.showPhonePage === 'function') {
        const activePage = clientState.pages.activePage === 'media' ? 'audio' : clientState.pages.activePage;
        window.showPhonePage(activePage);
      }
      try { localStorage.setItem('ableton-rc:vision_safety', JSON.stringify(visionSafetyConfig)); } catch {}
      window.dispatchEvent(new Event('ableton-rc:vision-settings'));
    };
    const saveLossLocally = () => {
      visionSafetyConfig.visionLoss = visionLoss;
      try { localStorage.setItem('ableton-rc:vision_safety', JSON.stringify(visionSafetyConfig)); } catch {}
      window.dispatchEvent(new Event('ableton-rc:vision-settings'));
    };
    window.VisionSettings = {
      getPolicy: () => visionLoss || window.RcPageSettings?.policy(),
      summary: () => {
        const options = GESTURE_PRESETS[visionSafetyConfig.gesturePreset] || GESTURE_PRESETS.balanced;
        return `${T('settings.confirmation', 'Pose confirmation')}: ${options.holdMs} ms · ${T('settings.transition', 'Pose transition')}: ${options.releaseMs} ms · ${T('settings.grace', 'Tracking tolerance')}: ${options.unknownGraceMs} ms · 3–6`;
      },
      setPolicy: value => {
        const next = window.RcPageSettings.policy(value);
        const previous = visionLoss;
        if (window.phoneWs?.readyState === 1) {
          window.sendPhoneCommand('saveProjectClientState', {preferences: {visionLoss: next}}, response => {
            if (response?.ok) { visionLoss = window.RcPageSettings.policy(response.result?.preferences?.visionLoss || next); saveLossLocally(); }
            else { visionLoss = previous; saveLossLocally(); showToast(T('settings.saveFailed', 'Could not save settings. Last valid setting retained.'), 'error'); }
          });
        } else { visionLoss = next; saveLossLocally(); }
      },
      applyHost: preferences => { try { visionLoss = window.RcPageSettings.policy(preferences?.visionLoss, true); saveLossLocally(); } catch {} },
      feedback: message => {
        const slot = Number(String(message.control).split('.').at(-1));
        if (!state.vision.enabled || !liveGestureSlots.has(slot) || badgePose !== `G${slot}`
          || (Number.isSafeInteger(message.sequence) && message.sequence < (visionPoseActivations.get(slot) || 0))) return;
        badgeLossState = message.state;
        badgeLossDeadline = message.remainingMs === null ? null : performance.now() + message.remainingMs;
        badgeTrackingLost = message.state !== 'tracking';
        if (message.state === 'released') {
          liveGestureSlots.delete(slot);
          visionPoseActivations.delete(slot);
          if (visionControls.slotForGesture(visionProcessor?.gestures?.activeName)?.id === slot) visionProcessor.gestures.resetRecognition();
          document.querySelector(`[data-gesture-slot="${slot}"]`)?.classList.remove('recognized');
          badgeNoteState = null;
        }
        renderPerformanceBadge();
      },
    };
    setInterval(() => { if (badgeLossState === 'holding' && badgeLossDeadline !== null) renderPerformanceBadge(); }, 100);
    const updateGestureOptions = () => {
      const preset = gesturePresetSelect?.value || 'balanced';
      const options = { ...(GESTURE_PRESETS[preset] || GESTURE_PRESETS.balanced), maxTakes: captureCap() };
      visionProcessor?.setGestureOptions(options);
      visionSafetyConfig = { ...(visionSafetyConfig || {}), gestureOptions: options, gesturePreset: preset };
      persistVisionSafety();
      renderVisionControlState();
    };
    if (gesturePresetSelect) {
      gesturePresetSelect.value = visionSafetyConfig.gesturePreset || 'balanced';
      gesturePresetSelect.addEventListener('change', updateGestureOptions);
    }

    if (confidenceSelect) {
      let conf = visionSafetyConfig?.confidence;
      if (conf === 0.2) conf = 'low';
      else if (conf === 0.7) conf = 'high';
      else if (conf === 0.5) conf = 'medium';
      confidenceSelect.value = conf || 'medium';
      confidenceSelect.addEventListener('change', () => {
        visionProcessor?.setConfidence?.(confidenceSelect.value);
        visionSafetyConfig = { ...(visionSafetyConfig || {}), confidence: confidenceSelect.value };
        persistVisionSafety();
      });
    }
    detectorButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (document.body.classList.contains('mapping-mode')) return;
        const detector = button.dataset.visionGesture;
        const enabled = !visionControls.detectorEnabled(detector);
        visionControls.setDetector(detector, enabled);
        if (!enabled && window.onControl) {
          window.onControl({ name: `sensor.vision.${detector}`, value: 0 });
        }
        if (!enabled && state.sensors.vision_reading) {
          delete state.sensors.vision_reading[detector];
          if (detector === 'pinch') delete state.sensors.vision_reading.pinchVal;
        }
        renderVisionControlState();
        renderVisionReadouts();
        persistVisionSafety();
      });
    });

    const stopGestureTest = () => {
      if (gestureTestFeedbackTimer) clearTimeout(gestureTestFeedbackTimer);
      gestureTestFeedbackTimer = null;
      visionProcessor?.endGestureTest?.();
      visionGestureTestSlot = null;
      gestureSlotCards.forEach((card) => {
        card.classList.remove('testing', 'recognized');
        card.querySelector('.vision-slot-neighbor')?.classList.add('hidden');
        const button = card.querySelector('.vision-slot-test');
        button?.setAttribute('aria-pressed', 'false');
        button?.classList.remove('active');
      });
      renderVisionControlState();
    };

    const removeStoredTake = (name, index = samplesForGesture(name) - 1) => {
      if (!name) return 0;
      dismissedPoseWarnings.delete(name);
      if (visionProcessor) return visionProcessor.gestures?.removeTake(name, index) || 0;
      const template = visionSafetyConfig.gestures?.templates?.find((entry) => entry.name === name);
      if (!template?.samples?.length) return 0;
      template.samples.splice(index, 1);
      template.takeSpreads?.splice(index, 1);
      // `spread` aggregates every retained take, so it cannot survive a
      // removal. Round-trip through the same library used by the live camera
      // to rebuild it from the remaining prototypes and per-take statistics.
      delete template.spread;
      const samples = template.samples.length;
      visionSafetyConfig.gestures = migrateGestureConfig(
        visionSafetyConfig.gestures,
        visionSafetyConfig.gestureOptions,
      );
      return samples;
    };

    const deleteStoredGesture = (name) => {
      if (!name) return false;
      incompatibleGestureNames.delete(name);
      if (visionProcessor) return visionProcessor.deleteGesture(name);
      const templates = visionSafetyConfig.gestures?.templates || [];
      const next = templates.filter((entry) => entry.name !== name);
      const incompatibleNames = (visionSafetyConfig.gestures?.incompatibleNames || []).filter(entry => entry !== name);
      visionSafetyConfig.gestures = { ...(visionSafetyConfig.gestures || {}), templates: next, incompatibleNames };
      return next.length !== templates.length;
    };

    const finishGestureCapture = (timedOut = false) => {
      const slotId = visionGestureLearnSlot;
      if (slotId === null) return;
      const slot = visionControls.slots[slotId - 1];
      const card = gestureSlotCards.find((entry) => Number(entry.dataset.gestureSlot) === slotId);
      const learnButton = card?.querySelector('.vision-slot-learn');
      const status = card?.querySelector('.vision-slot-status');
      poseCaptureTimer = null;

      let samples = samplesForGesture(slot?.name);
      let failure = '';
      try {
        samples = visionProcessor?.finishGestureLearn?.() || samples;
        dismissedPoseWarnings.delete(slot?.name);
        if (samples > 0) incompatibleGestureNames.delete(slot?.name);
      } catch (error) {
        samples = samplesForGesture(slot?.name);
        failure = error?.message || T('vid.holdStillRetry', 'Hold the pose still and try again');
      }

      visionGestureLearnSlot = null;
      if (learnButton) {
        learnButton.textContent = T('js.capturePose', 'CAPTURE POSE');
        learnButton.disabled = false;
      }
      card?.classList.remove('recording');
      persistVisionSafety();
      renderVisionControlState();
      // renderVisionControlState restores the default slot summary after the
      // recording class is removed. Write the outcome afterwards so timeout
      // and stability errors stay visible long enough to guide the performer.
      if (status) {
        if (failure) status.textContent = failure;
        else if (timedOut) status.textContent = T('vid.noStablePose', 'NO STABLE POSE FOUND · keep the whole hand visible and try again');
        else if (samples > 0) status.textContent = samples >= captureCap()
          ? T('vid.poseComplete', 'POSE · {max}/{max} complete · press TEST', { max: captureCap() })
          : samples >= 3 ? T('vid.poseReadyMore', 'POSE · {n}/{max} ready · TEST or capture more', { n: samples, max: captureCap() })
          : T('vid.poseNextTake', 'POSE · {n}/{max} saved · next take {hint}', { n: samples, hint: poseTakeHint(samples), max: captureCap() });
      }
    };

    const beginGestureCaptureWindow = (name) => {
      const slotId = visionGestureLearnSlot;
      if (slotId === null) return;
      const slot = visionControls.slots[slotId - 1];
      if (!slot?.name || slot.name !== name) return;
      if (poseCaptureTimer) clearTimeout(poseCaptureTimer);
      const card = gestureSlotCards.find((entry) => Number(entry.dataset.gestureSlot) === slotId);
      const learnButton = card?.querySelector('.vision-slot-learn');
      const status = card?.querySelector('.vision-slot-status');
      if (learnButton) learnButton.textContent = T('js.capturing', 'CAPTURING…');
      if (status) status.textContent = T('vid.holdPose', 'HOLD POSE · {hint} · {take}/{max} · LIVE BLOCKED',
        { hint: poseTakeHint(samplesForGesture(name)), take: samplesForGesture(name) + 1, max: captureCap() });
      poseCaptureTimer = setTimeout(() => finishGestureCapture(false), POSE_CAPTURE_MS);
    };

    function bindGestureSlotCard(card) {
      if(card.dataset.poseBound) return;
      card.dataset.poseBound='1';
      const slotId = Number(card.dataset.gestureSlot);
      const learnButton = card.querySelector('.vision-slot-learn');
      const testButton = card.querySelector('.vision-slot-test');
      const retakeButton = card.querySelector('.vision-slot-retake');
      const deleteButton = card.querySelector('.vision-slot-delete');
      const status = card.querySelector('.vision-slot-status');

      learnButton?.addEventListener('click', () => {
        if (!visionProcessor) return showToast(T('vid.enableCameraFirst', 'Enable camera before gesture Learn'), 'warning');
        if (visionGestureLearnSlot !== null) {
          return showToast(T('vid.finishCaptureFirst', 'Finish Gesture {n} capture first', { n: visionGestureLearnSlot }), 'warning');
        }
        const name = visionControls.slots[slotId - 1]?.name || `Gesture ${slotId}`;
        if (samplesForGesture(name) >= captureCap()) return showToast(T('vid.poseFull', 'This pose already has {max} examples · use DELETE LAST first', { max: captureCap() }), 'warning');
        stopGestureTest();
        visionGestureLearnSlot = slotId;
        visionProcessor.beginGestureLearn(name);
        learnButton.textContent = T('js.waiting', 'WAITING…');
        learnButton.disabled = true;
        card.classList.add('recording');
        if (status) status.textContent = T('vid.preparePose', 'PREPARE · {hint} · WAITING FOR STABLE HAND',
          { hint: poseTakeHint(samplesForGesture(name)) });
        poseCaptureTimer = setTimeout(
          () => finishGestureCapture(true),
          POSE_PREPARE_TIMEOUT_MS,
        );
      });

      testButton?.addEventListener('click', () => {
        const slot = visionControls.slots[slotId - 1];
        if (!slot?.name || samplesForGesture(slot.name) < 3) return showToast(T('vid.captureThreeFirst', 'Capture at least three pose examples before testing'), 'warning');
        const shouldStart = visionGestureTestSlot !== slotId;
        stopGestureTest();
        if (!shouldStart) return;
        visionGestureTestSlot = slotId;
        visionProcessor?.beginGestureTest?.(slot.name);
        card.classList.add('testing');
        testButton.setAttribute('aria-pressed', 'true');
        testButton.classList.add('active');
        if (status) status.textContent = T('js.holdLearnedPose', 'HOLD THE LEARNED POSE · waiting for a stable match');
        gestureTestFeedbackTimer = setTimeout(() => {
          if (visionGestureTestSlot === slotId && status) {
            status.textContent = T('js.noPoseMatch', 'NO POSE MATCH YET · adjust your hand and hold it still');
          }
        }, 6000);
      });

      retakeButton?.addEventListener('click', () => {
        const slot = visionControls.slots[slotId - 1];
        if (!slot?.name) return;
        stopGestureTest();
        const samples = removeStoredTake(slot.name);
        if (status) status.textContent = T('vid.recordReplacement', '{n}/{max} saved · record one replacement', { n: samples, max: captureCap() });
        persistVisionSafety();
        renderVisionControlState();
      });

      card.querySelector('.vision-consistency-retake')?.addEventListener('click', () => {
        const slot = visionControls.slots[slotId - 1];
        const warning = poseWarnings.get(slot?.name);
        if (!warning) return;
        stopGestureTest();
        removeStoredTake(slot.name, warning.index);
        persistVisionSafety();
        renderVisionControlState();
      });
      card.querySelector('.vision-consistency-keep')?.addEventListener('click', () => {
        const name = visionControls.slots[slotId - 1]?.name;
        if (!name) return;
        dismissedPoseWarnings.add(name);
        renderVisionControlState();
      });

      deleteButton?.addEventListener('click', () => {
        const slot = visionControls.slots[slotId - 1];
        stopGestureTest();
        if (slot?.name) deleteStoredGesture(slot.name);
        persistVisionSafety();
        renderVisionControlState();
      });
    }
    function syncGestureSlotCards() {
      const container=document.querySelector('.vision-pose-grid');
      const template=gestureSlotCards[0];
      if(!container || !template) return;
      for(const card of [...gestureSlotCards]) if(Number(card.dataset.gestureSlot)>visionControls.slots.length) {
        card.remove();gestureSlotCards.splice(gestureSlotCards.indexOf(card),1);
      }
      for(const slot of visionControls.slots) {
        if(gestureSlotCards.some(card=>Number(card.dataset.gestureSlot)===slot.id)) continue;
        const card=template.cloneNode(true);
        card.dataset.gestureSlot=String(slot.id);card.dataset.name=`sensor.vision.gesture.${slot.id}`;
        delete card.dataset.poseBound;
        card.querySelector('header span').textContent=`G${slot.id}`;
        card.classList.remove('recording','testing','recognized');
        const learn=card.querySelector('.vision-slot-learn');
        if(learn) learn.textContent=T('js.capturePose', 'CAPTURE POSE');
        const test=card.querySelector('.vision-slot-test');
        test?.classList.remove('active');test?.setAttribute('aria-pressed','false');
        card.querySelector('.vision-slot-neighbor')?.classList.add('hidden');
        container.appendChild(card);gestureSlotCards.push(card);bindGestureSlotCard(card);
      }
      const add=document.getElementById('btn-add-learned-pose');
      if(add) add.disabled=visionControls.slots.length>=window.VISION_MAX_LEARNED_POSES;
    }
    gestureSlotCards.forEach(bindGestureSlotCard);
    syncGestureSlotCards();
    document.getElementById('btn-add-learned-pose')?.addEventListener('click',()=>{
      if(!visionControls.addSlot()) return;
      syncGestureSlotCards();persistVisionSafety();renderVisionControlState();
      gestureSlotCards.at(-1)?.scrollIntoView?.({block:'nearest'});
    });
    renderVisionControlState();

    const startVision = async () => {
      const startGeneration = ++visionStartGeneration;
      state.vision.enabled = true;
      const h = state.vision.hand;
      h.active = false;
      h.x = 0.5;
      h.y = 0.5;
      h.z = 0;
      h.fist = false;
      h.pinch = false;
      h.victory = false;
      h.open = false;
      h.rotateVal = 0.5;
      h.thumb = 0;
      h.index = 0;
      h.middle = 0;
      h.ring = 0;
      h.pinky = 0;
      h.fingers = 0;
      if (!visionProcessor) {
        visionProcessor = new window.VisionProcessor();
        const ownedVisionProcessor = visionProcessor;
        window.currentVisionProcessor = visionProcessor;
        if (visionSafetyConfig && visionProcessor.importSafetyConfig) {
          visionProcessor.importSafetyConfig(visionSafetyConfig);
        }
        // setConfidence before the camera starts so the very first
        // hands.send() already uses the chosen MediaPipe threshold.
        visionProcessor.setConfidence?.(confidenceSelect?.value || visionSafetyConfig?.confidence || 'medium');
        visionProcessor.setGestureOptions(GESTURE_PRESETS[gesturePresetSelect?.value || 'balanced'] || GESTURE_PRESETS.balanced);

        // Apply a hand reading onto state, vision_reading payload, HUD,
        // and the wire. Returns true if the hand was newly activated (so the
        // caller can distinguish "first frame after a gap" from "ongoing").
        function applyHandReading(data) {
          const h = state.vision.hand;
          const wasActive = h.active;
          h.active = true;
          h.x = data.x;
          h.y = data.y;
          h.z = data.z;

          // Detect rising edges per gesture BEFORE writing h.fist/pinch/etc
          // so prev-vs-current comparisons reflect the previous frame.
          // Only gestures that support mode C get this treatment.
          const gestureChannels = ['fist', 'pinch', 'victory', 'open'];
          for (const ch of gestureChannels) {
            const cur = data[ch] ? 1 : 0;
            const prev = state.visionPrev[ch];
            if (cur === 1 && prev === 0 && state.visionModes[ch] === 'C') {
              // Rising edge while in toggle mode â†’ flip the latch.
              state.visionToggle[ch] = state.visionToggle[ch] ? 0 : 1;
            }
            state.visionPrev[ch] = cur;
          }

          h.fist = data.fist;
          h.pinch = data.pinch;
          h.victory = data.victory;
          h.open = data.open;
          h.rotateVal = data.rotateVal;
          h.thumb = data.thumb;
          h.index = data.index;
          h.middle = data.middle;
          h.ring = data.ring;
          h.pinky = data.pinky;
          h.fingers = data.fingers;
          // applyHandReading copies field by field, so anything not named here
          // never reaches the HUD. palmSize and the clutch were both computed
          // correctly and both read as zero on the phone for exactly this
          // reason — the readout was wired to a field nobody was filling.
          h.palmSize = data.palmSize;
          h.facing = data.facing;
          h.handedness = data.handedness;
          h.handReal = data.handReal;
          h.palmPoseOk = data.palmPoseOk;
          h.indexCurved = data.indexCurved;
          h.otherFingersExtended = data.otherFingersExtended;
          h.pinch_engaged = data.pinch_engaged;
          h.pinch_x = data.pinch_x;
          h.pinch_y = data.pinch_y;
          h.pinch_z = data.pinch_z;

          const visibleReading = {
            active: true, x: data.x, y: data.y, z: data.z,
            palm: normalizeVisionPalm(data.palmSize),
            face: normalizeVisionFace(data.facing),
            fingers: data.fingers,
            confidence: data.confidence, trackingState: data.trackingState,
          };
          for (const detector of ['fist', 'pinch', 'victory', 'open']) {
            if (visionControls.detectorEnabled(detector)) visibleReading[detector] = data[detector];
          }
          if (visionControls.detectorEnabled('pinch')) visibleReading.pinchVal = data.pinchVal;
          // rotateVal rides on the Victory pose: always exposed on the HUD
          // so the user can see the wrist angle as they twist, even before
          // the gesture latches. The wire output (below) only carries the
          // live reading while Victory is active; otherwise it stays pinned
          // at the 0.5 neutral.
          if (visionControls.detectorEnabled('victory')) visibleReading.rotateVal = data.rotateVal;
          state.sensors.vision_reading = visibleReading;
          badgeTrackingLost = Boolean(badgePose) && data.poseQualified !== true;
          renderPerformanceBadge();
          renderVisionReadouts();

          if (window.onControl) {
            // Resolve the value sent on the wire for each gesture channel:
            // mode A â†’ momentary boolean, mode C â†’ latched toggle state.
            const gestureValue = (ch) => state.visionModes[ch] === 'C'
              ? state.visionToggle[ch]
              : (data[ch] ? 1 : 0);

            window.onControl({ name: 'sensor.vision.active', value: 1 });
            window.onControl({ name: 'sensor.vision.x', value: data.x });
            window.onControl({ name: 'sensor.vision.y', value: data.y });
            window.onControl({ name: 'sensor.vision.z', value: data.z });
            if (visionControls.detectorEnabled('fist')) {
              window.onControl({ name: 'sensor.vision.fist', value: gestureValue('fist') });
            }
            // Pinch is special: it carries the analog pinchVal (0.0â€“1.0) in
            // mode A so the wire exposes the continuous control surface. Mode
            // C replaces it with the latched toggle.
            if (visionControls.detectorEnabled('pinch')) {
              if (state.visionModes.pinch === 'C') {
                window.onControl({ name: 'sensor.vision.pinch', value: state.visionToggle.pinch });
              } else {
                window.onControl({ name: 'sensor.vision.pinch', value: data.pinchVal ?? 0 });
              }
            }
            // The clutch: pinch to engage, then the hand's travel drives three
            // channels until you let go. They hold where they were left, so
            // the next pinch carries on instead of snapping back.
            //
            // Emitted outside the 'pinch' detector gate on purpose. These are
            // spatial channels like x/y/z, not a detector reading, and they are
            // pre-armed unconditionally further up. Gating them here would
            // announce three tiles in the panel that stay dead until the
            // performer happens to switch on a detector nothing tells them about.
            window.onControl({ name: 'sensor.vision.pinch_x', value: data.pinch_x ?? 0.5 });
            window.onControl({ name: 'sensor.vision.pinch_y', value: data.pinch_y ?? 0.5 });
            window.onControl({ name: 'sensor.vision.pinch_z', value: data.pinch_z ?? 0.5 });
            if (visionControls.detectorEnabled('victory')) {
              window.onControl({ name: 'sensor.vision.victory', value: gestureValue('victory') });
            }
            // rotateVal follows the Victory gate: the analog wrist rotation
            // travels on the wire only while Victory is held, otherwise it
            // anchors at the 0.5 neutral so panel mappings don't drift.
            if (visionControls.detectorEnabled('victory')) {
              const rotateValue = data.victory ? (data.rotateVal ?? 0.5) : 0.5;
              window.onControl({ name: 'sensor.vision.rotateVal', value: rotateValue });
            }
            if (visionControls.detectorEnabled('open')) {
              window.onControl({ name: 'sensor.vision.open', value: gestureValue('open') });
            }
          }

          return !wasActive;
        }

        let poseMissingSince = null;
        const lostPoseChannels = new Set();
        function markHandLost(timestamp = performance.now()) {
          if (poseMissingSince === null) poseMissingSince = timestamp;
          if (timestamp - poseMissingSince > (visionProcessor.gestures?.unknownGraceMs ?? 140)) {
            for (const channel of VISION_LOSS_CHANNELS) {
              if (!channel.name.startsWith('sensor.vision.gesture.') || lostPoseChannels.has(channel.name)) continue;
              window.onControl?.({ ...channel, lost: true });
              lostPoseChannels.add(channel.name);
            }
          }
          const h = state.vision.hand;
          if (!h.active) return;
          h.active = false;
          badgeTrackingLost = true;
          gestureSlotCards.forEach(card => {
            if (!liveGestureSlots.has(Number(card.dataset.gestureSlot))) card.classList.remove('recognized');
          });
          // TEST/capture deliberately reset the FSM. Retire prior LIVE output
          // only in that case; an active learned pose survives missing hands.
          if (!visionProcessor.gestures?.activeName) {
            badgePose = null;
            for (const id of liveGestureSlots) {
              window.onControl?.({ name: visionControls.controlForSlot(id), value: 0 });
              document.querySelector(`[data-gesture-slot="${id}"]`)?.classList.remove('recognized');
            }
            liveGestureSlots.clear();
          }
          renderPerformanceBadge();
          h.handLostTime = Date.now();
          if (state.sensors.vision_reading) {
            state.sensors.vision_reading.active = false;
          }
          renderVisionReadouts();
          if (window.onControl) {
            // Report the loss, don't invent a reading. The value is only a
            // placeholder for the HUD; `lost: true` tells the server to apply
            // each target's Safe loss policy (hold / zero / center / initial /
            // custom / release / reconcile) instead of taking it literally.
            window.onControl({ name: 'sensor.vision.active', value: 0, lost: true });
            emitVisionSignalLoss(false);
            emitEnabledVisionDetectorLoss();
          }
        }

        visionProcessor.onHandUpdate = (handData, timestamp = performance.now()) => {
          if (visionProcessor !== ownedVisionProcessor) return;
          // Measure the camera image, never the annotated/filtered UI canvas.
          // Only real inference callbacks contribute, including missing hands.
          if (window.PageCalibration?.isCollecting('video')) {
            const timestamp = performance.now();
            if (timestamp - lastCalibrationFrame >= 100 && video.currentTime !== calibrationVideoTime) {
              lastCalibrationFrame = timestamp;
              calibrationVideoTime = video.currentTime;
              try {
                if (!calibrationFrameContext) {
                  const samplingCanvas = document.createElement('canvas');
                  samplingCanvas.width = 32; samplingCanvas.height = 24;
                  calibrationFrameContext = samplingCanvas.getContext('2d', { willReadFrequently: true });
                }
                const light = window.CalibrationCore.frameLight(video, calibrationFrameContext);
                if (light) window.PageCalibration.feed('video',
                  { ...light, hand: visionProcessor.wasHandPresent === true }, timestamp);
              } catch { window.PageCalibration.invalidate('video'); }
            }
          }
          if (handData && handData.active) {
            // Presence alone cannot revive last-known learned pose output.
            poseMissingSince = null;
            lostPoseChannels.clear();
            applyHandReading(handData);
          } else {
            markHandLost(timestamp);
          }
        };
        let lastQualifiedTimestamp = -Infinity;
        visionProcessor.onGestureTracking = (sample) => {
          if (visionProcessor !== ownedVisionProcessor || sample.timestamp <= lastQualifiedTimestamp || visionGestureTestSlot !== null) return;
          lastQualifiedTimestamp = sample.timestamp;
          const slot = visionControls.slotForGesture(sample.name);
          if (!slot || !liveGestureSlots.has(slot.id)) return;
          window.onControl?.({name: visionControls.controlForSlot(slot.id), value: 1,
            tracking: {seq: ++visionTrackingSeq, qualified: sample.qualified, graceMs: sample.graceMs, activation: false}});
          if (!sample.qualified) { badgeTrackingLost = true; renderPerformanceBadge(); }
        };
        visionProcessor.onGestureLearnReady = beginGestureCaptureWindow;
        visionProcessor.onGestureProgress = (evaluation) => {
          if (visionProcessor !== ownedVisionProcessor) return;
          if (visionGestureTestSlot === null) return;
          const slot = visionControls.slots[visionGestureTestSlot - 1];
          if (!slot?.name) return;
          const target = evaluation?.candidates?.find((candidate) => candidate.name === slot.name);
          if (!target) return;
          const card = document.querySelector(`[data-gesture-slot="${slot.id}"]`);
          const status = card?.querySelector('.vision-slot-status');
          const percent = Math.round((target.confidence || 0) * 100);
          if (status) {
            const state = evaluation?.recognitionState;
            if (evaluation.name === slot.name && evaluation.fingerUncertain) {
              status.textContent = T('vid.fingersUnclear', 'FINGERS UNCLEAR · adjust angle or recapture');
            } else if (evaluation.name === slot.name && evaluation.contradiction) {
              status.textContent = T('vid.fingerMismatch', 'FINGER SHAPE DIFFERS · check each finger');
            } else if (state === 'held') {
              status.textContent = T('vid.poseStateHeld', 'HELD · release slightly to retrigger', { percent });
            } else if (state === 'releasing') {
              status.textContent = T('vid.poseStateReleasing', 'RELEASING · almost ready to retrigger');
            } else if (state === 'ready') {
              status.textContent = T('vid.poseStateReady', 'READY · ready to trigger');
            } else if (evaluation.accepted && evaluation.name === slot.name) {
              status.textContent = T('vid.poseMatchHold', 'POSE MATCH {percent}% · hold still to confirm', { percent });
            } else {
              status.textContent = T('vid.poseMatchAdjust', 'POSE MATCH {percent}% · adjust your hand', { percent });
            }
          }
          const neighbor = card?.querySelector('.vision-slot-neighbor');
          if (neighbor && Number.isInteger(target.nearestTake) && target.entryRadius > 0) {
            neighbor.textContent = T('vid.nearestTake', 'nearest: take {n} · {percent}% of radius',
              { n: target.nearestTake + 1, percent: Math.round(target.kthDistance / target.entryRadius * 100) });
            neighbor.classList.remove('hidden');
          }
        };
        visionProcessor.onGesture = (match) => {
          if (visionProcessor !== ownedVisionProcessor) return;
          const slot = visionControls.slotForGesture(match.name);
          if (!slot) return;
          if (visionGestureTestSlot !== null && visionGestureTestSlot !== slot.id) return;
          const card = document.querySelector(`[data-gesture-slot="${slot.id}"]`);
          const status = card?.querySelector('.vision-slot-status');
          const percent = Math.round(match.confidence * 100);
          card?.classList.add('recognized');
          if (visionGestureTestSlot !== null) {
            if (gestureTestFeedbackTimer) clearTimeout(gestureTestFeedbackTimer);
            gestureTestFeedbackTimer = null;
            visionGestureTestSlot = null;
            visionProcessor?.endGestureTest?.();
            card?.classList.remove('testing');
            const testButton = card?.querySelector('.vision-slot-test');
            testButton?.setAttribute('aria-pressed', 'false');
            testButton?.classList.remove('active');
            if (status) status.textContent = T('vid.testPassed',
              '✓ TEST PASSED · {percent}% confidence · release and show the pose again to retrigger', { percent });
            setTimeout(() => {
              if (visionProcessor === ownedVisionProcessor && !liveGestureSlots.has(slot.id)) card?.classList.remove('recognized');
            }, 1600);
            return;
          }
          if (status) status.textContent = T('vid.poseRecognized', '✓ {name} recognized · {percent}%', { name: match.name, percent });
          badgePose = `G${slot.id}`;
          badgeTrackingLost = false;
          badgeLossState = null;
          badgeLossDeadline = null;
          renderPerformanceBadge();
          if (!window.onControl) return;
          const control = visionControls.controlForSlot(slot.id);
          const activationSeq = ++visionTrackingSeq;
          visionPoseActivations.set(slot.id, activationSeq);
          // Emit ON edge. OFF is emitted by onGestureRelease (FSM transition)
          // when a different visible pose is confirmed. Missing hands keep it held.
          window.onControl({ name: control, value: 1, tracking: {seq: activationSeq, qualified: true, activation: true,
            graceMs: visionProcessor.gestures?.unknownGraceMs ?? 140} });
          liveGestureSlots.add(slot.id);
        };
        visionProcessor.onGestureRelease = (name) => {
          if (visionProcessor !== ownedVisionProcessor) return;
          const slot = visionControls.slotForGesture(name);
          if (!slot) return;
          document.querySelector(`[data-gesture-slot="${slot.id}"]`)?.classList.remove('recognized');
          if (badgePose === `G${slot.id}`) badgePose = null;
          renderPerformanceBadge();
          if (!liveGestureSlots.delete(slot.id) || !window.onControl) return;
          visionPoseActivations.delete(slot.id);
          const control = visionControls.controlForSlot(slot.id);
          window.onControl({ name: control, value: 0 });
        };
      }
      const processor = visionProcessor;
      if (typeof URL === 'function' && window.location?.href
        && new URL(window.location.href).searchParams.get('probe') === 'drift') {
        import('./vision-gesture-drift-probe.mjs').then(({ attachDriftProbe }) => {
          if (visionProcessor !== processor) return;
          window.RCDriftProbe?.uninstall?.();
          const probe = attachDriftProbe(processor, { safeInputLayer: window.SafeInputLayer });
          window.RCDriftProbe = {
            ...probe,
            download: () => {
              const url = URL.createObjectURL(new Blob([probe.exportJSONL()], { type: 'application/x-ndjson' }));
              const link = document.createElement('a');
              link.href = url;
              link.download = 'rc-pose-session.jsonl';
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            },
          };
        }).catch((error) => console.warn('Pose diagnostic unavailable:', error));
      }
      const setCameraStageState = (stateName, title, detail) => {
        cameraStage?.classList?.remove('camera-active', 'camera-starting', 'camera-error');
        if (stateName) cameraStage?.classList?.add(`camera-${stateName}`);
        if (cameraStateTitle) cameraStateTitle.textContent = title;
        if (cameraStateDetail) cameraStateDetail.textContent = detail;
      };
      // Render the pipeline's real state. "Camera shows video" and "MediaPipe
      // is inferring" are independent — the preview can look perfect while
      // inference is dead — so never assert the latter from the former.
      const renderVisionStage = (status) => {
        if (!status || processor !== visionProcessor) return;
        if (status.stage === 'error') {
          setCameraStageState('error', 'VISION ERROR', status.lastError || 'MediaPipe inference failed.');
        } else if (status.stage === 'hand-detected') {
          setCameraStageState('active', 'HAND DETECTED', 'Hand detected — vision controls are live');
        } else if (status.stage === 'waiting-hand') {
          setCameraStageState('active', 'CAMERA ACTIVE', 'MediaPipe running — waiting for hand');
        } else if (status.stage === 'camera-ready') {
          hud.classList.remove('hidden');
          setCameraStageState('active', 'CAMERA ACTIVE', 'Video ready — loading hand tracking…');
        } else if (status.stage === 'starting') {
          setCameraStageState('starting', 'STARTING CAMERA', 'Waiting for the browser video source…');
        }
      };
      processor.onVisionStatus = renderVisionStage;

      try {
        setCameraStageState('starting', 'STARTING CAMERA', 'Waiting for the browser video source…');
        await processor.start(video, canvas);
        if (startGeneration !== visionStartGeneration || processor !== visionProcessor || !chk.checked) return;
        processor.video?.srcObject?.getVideoTracks?.()[0]?.addEventListener?.('ended', () => {
          if (visionProcessor === processor) window.PageCalibration?.invalidate('video');
        }, { once: true });
        hud.classList.remove('hidden');
        renderVisionStage(processor.visionStatus);
        state.sensors.vision = 'available';
      } catch (err) {
        if (startGeneration !== visionStartGeneration || processor !== visionProcessor || !chk.checked || err?.name === 'AbortError') return;
        console.error('Failed to start vision processor:', err);
        processor.stop();
        if (visionProcessor === processor) {
          visionProcessor = null;
          window.currentVisionProcessor = null;
        }
        state.sensors.vision = 'error';
        state.sensors.vision_reading = null;
        state.vision.enabled = false;
        chk.checked = false;
        hud.classList.add('hidden');
        const errorName = err?.name || '';
        const CAMERA_ERRORS = {
          NotAllowedError: ['CAMERA BLOCKED', 'Allow camera access in browser settings, then retry.'],
          SecurityError: ['CAMERA BLOCKED', 'Open this page over HTTPS and allow camera access.'],
          NotFoundError: ['NO CAMERA', 'No usable camera was found on this device.'],
          NotReadableError: ['CAMERA BUSY', 'Close the other camera app, then tap CAMERA again.'],
        };
        const unknownCameraDetail = [errorName || 'Error', err?.message || 'Unknown camera error']
          .join(': ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
        const [title, detail] = CAMERA_ERRORS[errorName]
          || ['CAMERA COULD NOT START', unknownCameraDetail || 'Tap CAMERA to retry.'];
        setCameraStageState('error', title, detail);
      }
    };

    const stopVision = () => {
      liveGestureSlots.clear();
      badgePose = null;
      badgeNoteState = null;
      badgeTrackingLost = false;
      badgeLossState = null;
      badgeLossDeadline = null;
      renderPerformanceBadge();
      window.PageCalibration?.invalidate('video');
      visionStartGeneration += 1;
      stopGestureTest();
      if (poseCaptureTimer) clearTimeout(poseCaptureTimer);
      poseCaptureTimer = null;
      visionGestureLearnSlot = null;
      gestureSlotCards.forEach((card) => {
        card.classList.remove('recording', 'recognized');
        const button = card.querySelector('.vision-slot-learn');
        if (button) {
          button.textContent = T('js.capturePose', 'CAPTURE POSE');
          button.disabled = false;
        }
      });
      if (visionProcessor) {
        persistVisionSafety();
        visionProcessor.stop();
        visionProcessor = null;
        window.currentVisionProcessor = null;
      }
      state.sensors.vision = 'inactive';
      state.sensors.vision_reading = null;
      state.vision.enabled = false;
      const h = state.vision.hand;
      h.active = false;
      h.x = 0.5;
      h.y = 0.5;
      h.z = 0;
      h.fist = false;
      h.pinch = false;
      h.victory = false;
      h.open = false;
      h.rotateVal = 0.5;
      h.thumb = 0;
      h.index = 0;
      h.middle = 0;
      h.ring = 0;
      h.pinky = 0;
      h.fingers = 0;
      h.palmSize = 0;
      h.facing = 0;
      h.handedness = null;
      h.handReal = null;
      h.palmPoseOk = null;
      h.indexCurved = null;
      h.otherFingersExtended = null;
      hud.classList.add('hidden');
      cameraStage?.classList?.remove('camera-active', 'camera-starting', 'camera-error');
      if (cameraStateTitle) cameraStateTitle.textContent = T('js.cameraOff', 'CAMERA OFF');
      if (cameraStateDetail) cameraStateDetail.textContent = T('js.enableCamera', 'Enable Camera to begin');
      hud.style.borderColor = '';
      hud.style.boxShadow = '';
      if (lblGesture) lblGesture.textContent = '--';
      renderVisionReadouts();

      if (window.onControl) {
        // Camera off is a lost signal, same as the hand leaving the frame:
        // flag it so each target's Safe loss policy decides, instead of
        // slamming every mapped parameter to a value chosen here.
        window.onControl({ name: 'sensor.vision.active', value: 0 });
        emitVisionSignalLoss();
        emitEnabledVisionDetectorLoss();
      }
    };

    chk.checked = false;

    chk.addEventListener('change', () => {
      if (chk.checked) {
        return startVision();
      } else {
        return stopVision();
      }
    });
    window.addEventListener('pagehide', stopVision);
  }

  function setupBattery() {
    if (!navigator.getBattery) return;

    navigator.getBattery().then((battery) => {
      const updateBattery = () => {
        state.sensors.network.battery = {
          level: battery.level,
          charging: battery.charging,
        };

        // Keep telemetry only; avoid disruptive alerts during performances.
        document.body.classList.remove('critical-battery');
      };

      updateBattery();

      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);
    }).catch(() => {});
  }

  const applyIncomingPlayheadState = (msg) => {
    if (msg.playheadActive === undefined) return;
    window.playheadActive = msg.playheadActive;
    window.playheadBaseTimeMs = msg.playheadTimeMs ?? 0;
    window.playheadStartTime = Date.now();
    if (typeof window.updateHeaderPlayState === 'function') {
      window.updateHeaderPlayState(msg.playheadActive);
    }
  };

  // Initialise session via modules/session.js (manages WS, reconnect, heartbeat).
  // Guard: if session.js isn't loaded (unit-test environment), provide a no-op stub
  // so the remaining init functions can run without crashing.
  if (!window.RCSurface || typeof window.RCSurface.initSession !== 'function') {
    // Unit tests load app.js directly without session.js; stub out session APIs.
    window.RCSurface = window.RCSurface || {};
    window.RCSurface.initSession = () => {};
    window.RCSurface.getMappingModeActive = () => false;
    window.RCSurface.getTelemetryThrottleUntil = () => 0;
    window.RCSurface._setStatus = () => {};
    window.RCSurface._connect = () => {};
    window.isPhoneMappingModeActive = () => false;
    window.setPhoneMappingModeActive = () => {};
    window.throttlePhoneTelemetry = () => {};
    window.getPhoneClientId = () => null;
    window.sendPhoneCommand = () => false;
    window.phoneWs = null;
  }
  window.RCSurface.initSession({
    onMessage: (msg) => {
      // The onMessage handler in session.js delivers only post-hello/post-pong messages.
      // For the phone client, session.js already handled hello (clientId persist + status).
      // Additional hello data (tempo, signature, values, projectConfig) is handled below.
      if (msg.type === 'hello') {
        if (window.state) window.state.role = msg.role || 'viewer';
        if (typeof msg.tempo === 'number') {
          window.lastSessionBpm = msg.tempo;
          if (window.syncMode === 'sync') {
            window.currentBpm = msg.tempo;
            const bpmEl = document.getElementById('live-bpm');
            if (bpmEl) bpmEl.textContent = `${msg.tempo.toFixed(1)} BPM`;
            window.refreshAudioDetectorTiming?.();
          }
        }
        if (msg.signature) {
          const sigParts = msg.signature.split('/');
          if (sigParts.length === 2) {
            const num = parseInt(sigParts[0], 10);
            const den = parseInt(sigParts[1], 10);
            if (Number.isFinite(num) && num > 0) window.currentNumerator = num;
            if (Number.isFinite(den) && den > 0) window.currentDenominator = den;
          }
          const sigEl = document.getElementById('live-sig');
          if (sigEl) sigEl.textContent = `${window.currentNumerator || 4}/${window.currentDenominator || 4}`;
        }
        if (msg.clock) {
          window.triggerNoteClockSnapshot = {...msg.clock,receivedAt:performance.now()};
        }
        if (typeof window.updateTriggerNoteClockUI === 'function') {
          window.updateTriggerNoteClockUI();
        }
        applyIncomingPlayheadState(msg);
        if (msg.values && typeof msg.values === 'object') {
          applyRemoteControlValues(msg.values);
        }
        // A fader bound to pan is centred, not half open. The host knows the
        // target type; without this the same rectangle has to mean both.
        if (Array.isArray(msg.bipolarControls)) {
          document.querySelectorAll('.fader.bipolar').forEach((el) => el.classList.remove('bipolar'));
          for (const nome of msg.bipolarControls) {
            const el = document.querySelector(`.fader[data-name="${nome}"]`);
            if (el) el.classList.add('bipolar');
          }
          if (typeof window.refreshFaderRendering === 'function') window.refreshFaderRendering();
        }
        if (msg.projectConfig?.clientState && typeof window.applyProjectClientState === 'function') {
          window.applyProjectClientState({
            ...msg.projectConfig.clientState,
            preferences: msg.projectConfig.preferences || {},
          });
        }
        return;
      }
      if (msg.type === 'project_preferences') {
        window.VisionSettings?.applyHost(msg.preferences);
        window.PerformanceSettings?.applyHost(msg.preferences?.performance);
      } else if (msg.type === 'vision_loss_state') {
        window.VisionSettings?.feedback(msg);
      } else if (msg.type === 'control_sync') {
        // Another performer moved something on the shared surface. The server
        // never sends a client its own move back, so anything arriving here
        // belongs to someone else's hand.
        applyRemoteControlValues(msg.controls);
      } else if (msg.type === 'safe_input_state') {
        if (typeof window.updateSafeInputFeedback === 'function') {
          window.updateSafeInputFeedback(msg.control, msg);
        }
      } else if (msg.type === 'trigger_note_state') {
        window.onVisionTriggerNoteState?.(msg);
        if (typeof window.handleTriggerNoteState === 'function') {
          window.handleTriggerNoteState(msg);
        }
      } else if (msg.type === 'clip_launch_state') {
        // Launch Clip state as Live reports it; MAP draws it.
        if (typeof window.handleClipLaunchState === 'function') {
          window.handleClipLaunchState(msg);
        }
      } else if (msg.type === 'tempo') {
        if (typeof msg.tempo === 'number') {
          window.lastSessionBpm = msg.tempo;
          if (window.syncMode === 'sync') {
            window.currentBpm = msg.tempo;
            const bpmEl = document.getElementById('live-bpm');
            if (bpmEl) bpmEl.textContent = `${msg.tempo.toFixed(1)} BPM`;
            window.refreshAudioDetectorTiming?.();
          }
          if (typeof window.updateTriggerNoteClockUI === 'function') {
            window.updateTriggerNoteClockUI();
          }
        }
      } else if (msg.type === 'live_state') {
        if (typeof msg.tempo === 'number') {
          window.lastSessionBpm = msg.tempo;
          if (window.syncMode === 'sync') {
            window.currentBpm = msg.tempo;
            const bpmEl = document.getElementById('live-bpm');
            if (bpmEl) bpmEl.textContent = `${msg.tempo.toFixed(1)} BPM`;
            window.refreshAudioDetectorTiming?.();
          }
        }
        if (msg.signature) {
          const sigParts = msg.signature.split('/');
          if (sigParts.length === 2) {
            const num = parseInt(sigParts[0], 10);
            const den = parseInt(sigParts[1], 10);
            if (Number.isFinite(num) && num > 0) window.currentNumerator = num;
            if (Number.isFinite(den) && den > 0) window.currentDenominator = den;
          }
          const sigEl = document.getElementById('live-sig');
          if (sigEl) sigEl.textContent = `${window.currentNumerator || 4}/${window.currentDenominator || 4}`;
        }
        applyIncomingPlayheadState(msg);
        if (typeof window.updateTriggerNoteClockUI === 'function') {
          window.updateTriggerNoteClockUI();
        }
      } else if (msg.type === 'playhead_state') {
        applyIncomingPlayheadState(msg);
      } else if (msg.type === 'transport_state') {
        const state = msg.state;
        if (msg.clock) {
          window.triggerNoteClockSnapshot = {...msg.clock,receivedAt:performance.now()};
          if (typeof window.updateTriggerNoteClockUI === 'function') {
            window.updateTriggerNoteClockUI(msg.clock);
          }
        }
        if (state) {
          window.oscConnected = Boolean(state.connected);
          if (typeof state.signatureNumerator === 'number' && state.signatureNumerator > 0) {
            window.currentNumerator = state.signatureNumerator;
          }
          if (typeof state.signatureDenominator === 'number' && state.signatureDenominator > 0) {
            window.currentDenominator = state.signatureDenominator;
          }
          const sigEl = document.getElementById('live-sig');
          if (sigEl) sigEl.textContent = `${window.currentNumerator || 4}/${window.currentDenominator || 4}`;
          if (state.locators && typeof window.updateTransportLocators === 'function') {
            window.updateTransportLocators(state.locators);
          }
          if (typeof window.updateOscStatus === 'function') {
            window.updateOscStatus(state.available, state.connected);
          }
          if (state.isPlaying !== undefined) {
            window.oscIsPlaying = state.isPlaying;
            if (typeof window.updateHeaderPlayState === 'function') {
              window.updateHeaderPlayState(state.isPlaying);
            }
            if (state.connected) {
              window.playheadActive = state.isPlaying;
              if (typeof state.currentSongTimeBeats === 'number' && typeof state.tempo === 'number') {
                const timeMs = (state.currentSongTimeBeats * 60 * 1000) / state.tempo;
                window.playheadBaseTimeMs = timeMs;
                window.playheadStartTime = Date.now();
              }
            }
          }
          if (typeof state.tempo === 'number' && state.connected) {
            window.lastSessionBpm = state.tempo;
            if (window.syncMode === 'sync') {
              window.currentBpm = state.tempo;
              const bpmEl = document.getElementById('live-bpm');
              if (bpmEl) bpmEl.textContent = `${state.tempo.toFixed(1)} BPM`;
              window.refreshAudioDetectorTiming?.();
            }
          }
        }
        if (typeof window.updateTriggerNoteClockUI === 'function') {
          window.updateTriggerNoteClockUI();
        }
      } else if (msg.type === 'beat') {
        if (typeof window.triggerMetronomePulse === 'function') {
          window.triggerMetronomePulse(msg.beat, msg.beatInBar);
        }
      } else if (msg.type === 'highlight') {
        const el = document.querySelector(`[data-name="${msg.control}"]`);
        if (el) {
          el.classList.add('discovery-highlight');
          setTimeout(() => el.classList.remove('discovery-highlight'), msg.durationMs || 2000);
        }
      }
    },
  });
  sendLoop();
  maybeRequestPermissions();
  setupSensorToggles();
  setupCalibration();
  setupAudioUI();
  setupVisionUI();
  setupBattery();
  setupClientName();
  setupConfigMode();
})();
