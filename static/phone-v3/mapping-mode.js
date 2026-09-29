// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
(function () {
  'use strict';
  const T = (k, fallback, params) => (typeof window !== 'undefined' && window.RcSurfaceI18n)
    ? window.RcSurfaceI18n.t(k, params)
    : String(fallback ?? k).replace(/\{(\w+)\}/g, (whole, key) =>
      (params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole));

  const state = {
    open: false,
    previousPage: 'performance',
    loaded: false,
    allTargets: [],
    currentMappings: {},
    clients: [],
    presets: [],
    currentPreset: 'Default',
    selectedControl: null,
    selectedTargetIndex: 0,
    busy: false,
    error: '',
    pickerMode: null,
    midiTargetMode: 'trigger_note',
    pickerFilter: '',
    pendingConflict: null,
    changeTargetIndex: null,
  };

  let triggerFeedbackState = {
    control: null,
    targetIndex: null,
    state: 'ready',
    targetBeat: null,
    reason: null,
  };

  window.handleTriggerNoteState = function (msg) {
    if (!msg || msg.type !== 'trigger_note_state') return;
    const currentKey = mappingKey(state.selectedControl);
    const msgControl = msg.control;
    const msgTarget = Number(msg.target);
    if (msgControl === currentKey && (Number.isNaN(msgTarget) || msgTarget === state.selectedTargetIndex)) {
      triggerFeedbackState = {
        control: msgControl,
        targetIndex: state.selectedTargetIndex,
        state: msg.state || 'ready',
        targetBeat: msg.targetBeat,
        reason: msg.reason,
      };
      updateTriggerFeedbackUI();
    }
  };

  function updateLiveLine(liveLine, syncWarning) {
    if (!liveLine) return;
    const bpm = typeof window.lastSessionBpm === 'number' ? window.lastSessionBpm : (window.currentBpm || 120);
    const num = (window.currentNumerator && window.currentNumerator > 0) ? window.currentNumerator : 4;
    const den = (window.currentDenominator && window.currentDenominator > 0) ? window.currentDenominator : 4;
    const wsConnected = window.phoneWs?.readyState === 1;
    const clockSnap = window.triggerNoteClockSnapshot;
    const clockValid = clockSnap?.valid === true;
    const clockReason = clockSnap?.reason;

    let syncText = '';
    if (clockValid) {
      syncText = T('mm.clockOscOk', 'CLOCK OSC OK');
      liveLine.dataset.syncState = 'ok';
    } else if (clockReason) {
      syncText = T('mm.clockOscInvalid', 'NO OSC CLOCK ({reason})', { reason: clockReason });
      liveLine.dataset.syncState = 'invalid';
    } else if (!window.oscConnected) {
      syncText = T('mm.clockOscDisconnected', 'OSC DISCONNECTED');
      liveLine.dataset.syncState = 'disconnected';
    } else {
      syncText = T('mm.clockOscWaiting', 'WAITING OSC');
      liveLine.dataset.syncState = 'waiting';
    }

    liveLine.textContent = `LIVE ${bpm.toFixed(1)}BPM · ${num}/${den} · WS ${wsConnected ? 'OK' : 'OFFLINE'} · ${syncText}`;

    if (syncWarning) {
      if (clockValid) {
        syncWarning.style.display = 'none';
      } else {
        syncWarning.style.display = '';
        syncWarning.textContent = clockReason === 'stopped'
          ? T('mm.syncStartPlayback', 'Start Live playback to use Beat or Bar.')
          : T('mm.syncConnectClock', 'Beat and Bar need a connected OSC clock and Live playback.');
      }
    }
  }

  window.updateTriggerNoteClockUI = function updateTriggerNoteClockUI(snapshot) {
    if (snapshot) window.triggerNoteClockSnapshot = snapshot;
    const liveLine = document.querySelector('.map-timing-live-status');
    const syncWarning = document.querySelector('.map-timing-sync-warning');
    updateLiveLine(liveLine, syncWarning);
  };

  function updateTriggerFeedbackUI(el = document.getElementById('map-trigger-feedback')) {
    if (!el) return;
    const sameTarget = triggerFeedbackState.control === mappingKey(state.selectedControl)
      && triggerFeedbackState.targetIndex === state.selectedTargetIndex;
    const { state: fbState, targetBeat, reason } = sameTarget ? triggerFeedbackState : { state: 'ready' };
    el.hidden = ['ready', 'released'].includes(fbState);
    el.dataset.state = fbState;
    if (fbState === 'pending') {
      const beatStr = typeof targetBeat === 'number' ? ` ${targetBeat.toFixed(1)}` : '';
      el.textContent = `${T('mm.statePending', 'SCHEDULED {beat}', { beat: beatStr })}`.trim();
    } else if (fbState === 'held') {
      el.textContent = T('mm.stateHeld', 'HELD');
    } else if (fbState === 'sent') {
      el.textContent = T('mm.stateSent', 'SENT');
    } else if (fbState === 'unavailable') {
      const reasonStr = reason ? ` (${reason})` : '';
      el.textContent = reason === 'duration_clock'
        ? T('mm.durationNoClock', 'Musical duration needs Live BPM and meter.')
        : `${T('mm.stateUnavailable', 'NO SYNC')}${reasonStr}`;
    } else if (fbState === 'missed') {
      el.textContent = T('mm.stateMissed', 'MISSED (>20ms)');
    } else if (fbState === 'cancelled') {
      const reasonStr = reason ? ` (${reason})` : '';
      el.textContent = `${T('mm.stateCancelled', 'CANCELLED')}${reasonStr}`;
    } else if (fbState === 'error') {
      const reasonStr = reason ? ` (${reason})` : '';
      el.textContent = `${T('mm.stateError', 'ERROR')}${reasonStr}`;
    } else {
      el.textContent = T('mm.stateReady', 'READY');
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, kind = '') {
    const el = $('map-mobile-status');
    if (el) {
      el.textContent = text;
      el.dataset.kind = kind;
    }
    const inlineEl = document.querySelector('.map-detail-status');
    if (inlineEl) {
      inlineEl.textContent = text;
      inlineEl.dataset.kind = kind;
    }
  }

  const CONTROL_GROUPS = window.MappingInputContract.getControlGroups();

  function rawControlName(name) {
    return String(name || '').split('::').pop();
  }

  function controlLabel(name) {
    const raw = rawControlName(name);
    if (raw === 'xy-1.x') return 'XY 1 - X Axis (Horizontal)';
    if (raw === 'xy-1.y') return 'XY 1 - Y Axis (Vertical)';
    if (raw === 'xy-2.x') return 'XY 2 - X Axis (Horizontal)';
    if (raw === 'xy-2.y') return 'XY 2 - Y Axis (Vertical)';
    const pad = raw.match(/^pad-(\d+)$/);
    if (pad) return `Pad ${pad[1]}`;
    const knob = raw.match(/^knob-(\d+)$/);
    if (knob) return `Knob ${knob[1]}`;
    const fader = raw.match(/^fader-(\d+)$/);
    if (fader) return `Fader ${fader[1]}`;
    const lfo = raw.match(/^toggle-(\d+)$/);
    if (lfo) return `LFO ${lfo[1]}`;
    const stutter = raw.match(/^button-(\d+)$/);
    if (stutter) return `Stutter ${stutter[1]}`;
    return raw.replace(/^sensor\./, '').replace(/\./g, ' ');
  }

  function mappingKey(control) {
    return control;
  }

  function legacyMappingKey(control) {
    return state.selectedClient ? `${state.selectedClient}::${control}` : null;
  }

  function targetsForControl(control) {
    const clientKey = state.selectedClient ? `${state.selectedClient}::${control}` : null;
    if (state.currentMappings[control]) return state.currentMappings[control];
    if (clientKey && state.currentMappings[clientKey]) return state.currentMappings[clientKey];
    return [];
  }

  function targetLabel(target, includeMode = true) {
    if (!target) return '';
    if (target.type === 'tempo') return 'Song Tempo';
    const targetKind = target.trackKind || 'track';
    const track = state.allTargets.find((item) => item.trackIndex === target.trackIndex && (item.trackKind || 'track') === targetKind);
    const trackName = track ? track.name : `Track ${(target.trackIndex ?? 0) + 1}`;
    if (target.mode === 'trigger_note') return includeMode ? `${trackName} · ${T('mm.triggerNote', 'Trigger Note')}` : trackName;
    if (target.type === 'mixer_volume') return `${trackName} -> Volume`;
    if (target.type === 'mixer_pan') return `${trackName} -> Pan`;
    if (target.type === 'mixer_send') return `${trackName} -> Send ${(target.sendIndex ?? 0) + 1}`;
    if (target.type === 'track_mute') return `${trackName} -> Mute`;
    if (target.type === 'track_solo') return `${trackName} -> Solo`;
    if (target.type === 'track_arm') return `${trackName} -> Arm`;
    if (target.type === 'device_param') {
      const device = track && track.devices ? track.devices.find((d) => d.index === target.deviceIndex) : null;
      const param = device && device.params ? device.params[target.paramIndex] : null;
      return `${trackName} -> ${device ? device.name : `Device ${target.deviceIndex}`} -> ${param ? param.label : `P${target.paramIndex}`}`;
    }
    return target.type;
  }

  function isSameTarget(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    const aKind = a.trackKind || 'track';
    const bKind = b.trackKind || 'track';
    if (aKind !== bKind) return false;
    const aTrigger = a.mode === 'trigger_note';
    const bTrigger = b.mode === 'trigger_note';
    if (aTrigger !== bTrigger) return false;
    if (aTrigger && bTrigger) {
      return (a.trackIndex ?? 0) === (b.trackIndex ?? 0)
        && (a.midiNote ?? 'C3') === (b.midiNote ?? 'C3');
    }
    return (a.trackIndex ?? 0) === (b.trackIndex ?? 0)
      && (a.deviceIndex ?? 0) === (b.deviceIndex ?? 0)
      && (a.paramIndex ?? 0) === (b.paramIndex ?? 0)
      && (a.sendIndex ?? 0) === (b.sendIndex ?? 0);
  }

  function findConflict(target) {
    const selectedKey = mappingKey(state.selectedControl);
    const legacySelectedKey = state.selectedClient ? `${state.selectedClient}::${state.selectedControl}` : null;
    for (const [control, targets] of Object.entries(state.currentMappings)) {
      if (control === state.selectedControl || control === selectedKey || control === legacySelectedKey) continue;
      if (!Array.isArray(targets)) continue;
      if (targets.some((candidate) => isSameTarget(candidate, target))) return control;
    }
    return null;
  }

  async function saveTargetsForSelected(targets, refresh = true) {
    if (!state.selectedControl) return { ok: false, error: 'No selected control' };
    const key = mappingKey(state.selectedControl);
    const prevTargets = state.currentMappings[key] ? [...state.currentMappings[key]] : undefined;
    const finalTargets = Array.isArray(targets) ? targets : [];
    state.currentMappings[key] = finalTargets;
    const response = await command('setMapping', { control: key, targets: finalTargets });
    if (response && response.ok !== false) {
      const legacyKey = state.selectedClient ? `${state.selectedClient}::${state.selectedControl}` : null;
      if (legacyKey && legacyKey !== key && state.currentMappings[legacyKey]) {
        delete state.currentMappings[legacyKey];
        await command('removeMapping', { control: legacyKey });
      }
      if (refresh) await loadMobileMappingData();
    } else {
      if (prevTargets === undefined) {
        delete state.currentMappings[key];
      } else {
        state.currentMappings[key] = prevTargets;
      }
      setStatus(response?.error || 'Failed to save mapping target.', 'error');
    }
    return response;
  }

  async function removeMobileMappingTarget(index) {
    if (!state.selectedControl) return;
    const key = mappingKey(state.selectedControl);
    const targets = targetsForControl(state.selectedControl).slice();
    targets.splice(index, 1);
    if (targets.length === 0) {
      const legacyKey = legacyMappingKey(state.selectedControl);
      delete state.currentMappings[key];
      delete state.currentMappings[state.selectedControl];
      if (legacyKey) delete state.currentMappings[legacyKey];
      await command('removeMapping', { control: key });
      if (legacyKey && legacyKey !== key) await command('removeMapping', { control: legacyKey });
      renderAll();
      return;
    }
    await saveTargetsForSelected(targets);
  }

  async function clearSelectedMobileControl() {
    if (!state.selectedControl) return;
    const key = mappingKey(state.selectedControl);
    const legacyKey = legacyMappingKey(state.selectedControl);
    delete state.currentMappings[key];
    delete state.currentMappings[state.selectedControl];
    if (legacyKey) delete state.currentMappings[legacyKey];
    await command('removeMapping', { control: key });
    if (legacyKey && legacyKey !== key) await command('removeMapping', { control: legacyKey });
    renderAll();
  }

  /**
   * Wipe every mapping in one shot. Clearing a whole set used to mean walking
   * each control group by hand; `clearMappings` already existed on the server
   * and in the desktop panel, it was just never reachable from the phone.
   */
  async function clearAllMobileMappings() {
    if (window.confirm && !window.confirm('Clear ALL mappings? This cannot be undone.')) return;
    const response = await command('clearMappings', {});
    if (response && response.ok === false) {
      setStatus(response.error || 'Could not clear mappings', 'error');
      return response;
    }
    state.currentMappings = {};
    state.selectedTargetIndex = 0;
    setStatus('All mappings cleared.', 'ok');
    renderAll();
    return response;
  }

  async function clearMobileMappingCategory(groupName) {
    const group = CONTROL_GROUPS.find((candidate) => candidate.group === groupName);
    if (!group) return;
    for (const control of group.items) {
      const key = mappingKey(control);
      const legacyKey = legacyMappingKey(control);
      if (state.currentMappings[key] || state.currentMappings[control] || (legacyKey && state.currentMappings[legacyKey])) {
        delete state.currentMappings[key];
        delete state.currentMappings[control];
        if (legacyKey) delete state.currentMappings[legacyKey];
        await command('removeMapping', { control: key });
        if (legacyKey && legacyKey !== key) await command('removeMapping', { control: legacyKey });
      }
    }
    renderAll();
  }

  async function replaceMobileMappingConflict(oldControl, target) {
    const oldTargets = (state.currentMappings[oldControl] || []).filter((candidate) => !isSameTarget(candidate, target));
    let response;
    if (oldTargets.length === 0) {
      delete state.currentMappings[oldControl];
      response = await command('removeMapping', { control: oldControl });
    } else {
      state.currentMappings[oldControl] = oldTargets;
      response = await command('setMapping', { control: oldControl, targets: oldTargets });
    }
    if (response && response.ok === false) {
      setStatus(response.error || 'Failed to replace existing mapping.', 'error');
      return response;
    }
    const current = targetsForControl(state.selectedControl).slice();
    current.push(target);
    return saveTargetsForSelected(current, false);
  }

  const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function parseMidiNoteToNumber(value) {
    const text = String(value || '').trim().toUpperCase();
    if (!text) return null;
    const match = text.match(/^([A-G]#?)(-?\d+)$/);
    if (match) {
      const pitch = match[1];
      const oct = parseInt(match[2], 10);
      const pIdx = PITCHES.indexOf(pitch);
      if (pIdx === -1 || oct < -2 || oct > 8) return null;
      const num = (oct + 2) * 12 + pIdx;
      if (num < 0 || num > 127) return null; // Reject G#8+ and < C-2
      return num;
    }
    const rawNum = parseInt(text, 10);
    if (Number.isFinite(rawNum) && rawNum >= 0 && rawNum <= 127) {
      return rawNum;
    }
    return null;
  }

  function midiNumberToNoteName(num) {
    if (!Number.isFinite(num) || num < 0 || num > 127) return 'C3';
    const oct = Math.floor(num / 12) - 2;
    const pitch = PITCHES[num % 12];
    return `${pitch}${oct}`;
  }

  function normalizeMidiNote(value) {
    const num = parseMidiNoteToNumber(value);
    if (num === null) return null;
    const text = String(value || '').trim().toUpperCase();
    if (/^[A-G]#?-?\d+$/.test(text)) return text;
    return midiNumberToNoteName(num);
  }

  const NUMERIC_TARGET_FIELDS = ['inMin', 'inMax', 'outMin', 'outMax', 'threshold',
    'drive', 'compressor', 'smooth', 'idleValue', 'neutralValue', 'noteDurationMs'];

  async function updateMobileTargetField(field, value, opts = {}) {
    if (!state.selectedControl) return;
    const targets = targetsForControl(state.selectedControl).slice();
    const target = { ...(targets[state.selectedTargetIndex] || {}) };
    if (field === 'midiNote') {
      const note = normalizeMidiNote(value);
      if (!note) return;
      target[field] = note;
    } else if (field === 'midiVelocity') {
      target[field] = Math.max(1, Math.min(127, Math.round(Number(value) || 1)));
    } else if (field === 'noteTiming') {
      if (!['immediate', 'beat', 'bar'].includes(value)) return;
      if (value !== 'immediate' && !['beat', 'bar'].includes(target.noteTiming)) {
        target.noteDurationMode = 'grid';
        target.noteDurationBars = 0.25;
      }
      target[field] = value;
      if (['beat', 'bar'].includes(value) && target.noteGate === 'hold') {
        target.noteGate = 'pulse';
      }
    } else if (field === 'noteGate') {
      if (!['pulse', 'hold'].includes(value)) return;
      if (value === 'hold') {
        target.noteTiming = 'immediate';
        target.noteDurationMode = 'ms';
      }
      target[field] = value;
    } else if (field === 'noteDurationMs') {
      const ms = Math.max(20, Math.min(2000, Math.round(Number(value) || 80)));
      target[field] = ms;
    } else if (field === 'noteDurationMode') {
      if (!['ms', 'grid'].includes(value) || (value === 'grid' && target.noteGate !== 'pulse')) return;
      target[field] = value;
      if (value === 'grid' && !target.noteDurationBars) target.noteDurationBars = 0.25;
    } else if (field === 'noteDurationBars') {
      const bars = Number(value);
      if (![1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4].includes(bars)) return;
      target[field] = bars;
    } else if (NUMERIC_TARGET_FIELDS.includes(field)) {
      // Editor sliders hand over input.value, which is a string. A target that
      // keeps the string reaches Live as "0.35": the mapping is rejected and
      // the editor it was opened from disappears with it.
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      target[field] = numeric;
    } else if (field === 'mode') {
      if (!['continuous', 'toggle', 'trigger_note'].includes(value)) return;
      target[field] = value;
      if (value === 'trigger_note' && !target.midiNote) {
        target.midiNote = 'C3';
      }
    } else {
      target[field] = value;
    }
    if (field === 'neutralPolicy' && state.selectedControl.startsWith('sensor.vision.')) {
      target.visionSafeLossVersion = 2;
    }
    targets[state.selectedTargetIndex] = target;
    if (window.currentControlMappings && state.selectedControl) {
      window.currentControlMappings[state.selectedControl] = targets;
    }
    await saveTargetsForSelected(targets, opts.refresh !== false);
  }

  function openTargetPicker() {
    state.pickerMode = 'target';
    renderDetail();
  }

  function closePicker() {
    state.pickerMode = null;
    state.midiTargetMode = 'trigger_note';
    state.pendingConflict = null;
    state.changeTargetIndex = null;
    state.pickerFilter = '';
    renderDetail();
  }

  async function bindMobileTarget(target) {
    if (!state.selectedControl) return false;
    const normalized = { ...target };
    delete normalized.label;
    const conflict = findConflict(normalized);
    if (conflict) {
      state.pendingConflict = { owner: conflict, target: normalized };
      state.pickerMode = null;
      renderDetail();
      return false;
    }
    const targets = targetsForControl(state.selectedControl).slice();
    if (targets.some((candidate) => isSameTarget(candidate, normalized))) {
      setStatus('Este parâmetro já está mapeado para este controle.', 'error');
      return false;
    }
    const vision = state.selectedControl.startsWith('sensor.vision.');
    targets.push({ curve: 'linear', inMin: 0, inMax: 1, outMin: 0, outMax: 1,
      neutralPolicy: vision ? 'hold' : 'release', ...(vision ? { visionSafeLossVersion: 2 } : {}), ...normalized });
    const response = await saveTargetsForSelected(targets);
    if (response && response.ok !== false) {
      return true;
    }
    return false;
  }

  window.clearAllMobileMappings = clearAllMobileMappings;
  window.updateMobileTargetField = updateMobileTargetField;
  window.bindMobileTarget = bindMobileTarget;
  window.removeMobileMappingTarget = removeMobileMappingTarget;
  window.clearSelectedMobileControl = clearSelectedMobileControl;
  window.clearMobileMappingCategory = clearMobileMappingCategory;
  window.replaceMobileMappingConflict = replaceMobileMappingConflict;

  async function saveMobileMappingPreset(name) {
    const clean = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!clean) return;
    const response = await command('savePreset', { name: clean });
    if (response.ok) await loadMobileMappingData();
    else setStatus(response.error || 'Could not save preset', 'error');
  }

  async function loadMobileMappingPreset(name) {
    if (!name) return;
    const response = await command('loadPreset', { name });
    if (response.ok) await loadMobileMappingData();
    else setStatus(response.error || 'Could not load preset', 'error');
  }

  async function deleteMobileMappingPreset(name) {
    if (!name || name === 'Default') return;
    const response = await command('deletePreset', { name });
    if (response.ok) await loadMobileMappingData();
    else setStatus(response.error || 'Could not delete preset', 'error');
  }

  async function createMobileMidiTarget(track) {
    if (!state.selectedControl || !track || typeof track.trackIndex !== 'number') return false;
    const targetMode = 'trigger_note';
    state.busy = true;
    renderDetail();
    const install = await command('addUdpReceiverToTrack', { trackIndex: track.trackIndex });
    state.busy = false;
    if (!install.ok || !install.result || !install.result.success) {
      const reason = install.result?.reason;
      setStatus(reason === 'receiver_upgrade_required'
        ? T('map.receiverUpgrade', 'Replace the old Receiver on this track with RC-Midi-Receiver v2 (SDK / LOCAL MAX — NO UDP), then retry.')
        : reason === 'receiver_ambiguous'
          ? T('map.receiverAmbiguous', 'More than one Receiver was found on this track. Keep only one Receiver v2 and retry.')
        : reason === 'receiver_missing'
        ? 'RC-Midi-Receiver.amxd não está nessa track. Coloque o dispositivo nela no Live e tente novamente.'
        : (install.error || 'Não foi possível verificar RC-Midi-Receiver.amxd nessa track.'), 'error');
      renderDetail();
      return false;
    }
    const targets = targetsForControl(state.selectedControl).slice();
    const existingIndex = targets.findIndex((t) => t.mode === targetMode && t.trackIndex === track.trackIndex && (t.midiNote ?? 'C3') === 'C3');
    const target = {
      type: 'device_param',
      trackIndex: track.trackIndex,
      mode: targetMode,
      midiVelocity: 100,
      noteTiming: 'immediate',
      noteGate: 'hold',
      noteDurationMs: 80,
    };
    if (targetMode === 'trigger_note') target.midiNote = 'C3';
    if (existingIndex >= 0) {
      targets[existingIndex] = target;
    } else {
      targets.push(target);
    }
    return saveTargetsForSelected(targets);
  }

  async function createMobileTriggerNoteTarget(track) {
    return createMobileMidiTarget(track, 'trigger_note');
  }

  function openMidiTrackPicker() {
    state.pickerMode = 'midi';
    state.midiTargetMode = 'trigger_note';
    renderDetail();
  }

  window.createMobileTriggerNoteTarget = createMobileTriggerNoteTarget;
  window.saveMobileMappingPreset = saveMobileMappingPreset;
  window.loadMobileMappingPreset = loadMobileMappingPreset;
  window.deleteMobileMappingPreset = deleteMobileMappingPreset;

  function command(cmd, args = {}) {
    return new Promise((resolve) => {
      if (typeof window.sendPhoneCommand !== 'function') {
        resolve({ ok: false, error: 'Phone command bridge is not ready' });
        return;
      }
      window.sendPhoneCommand(cmd, args, resolve);
    });
  }

  function normalizeMappings(raw) {
    const out = {};
    for (const [key, value] of Object.entries(raw || {})) {
      out[key] = Array.isArray(value) ? value : [value];
    }
    return out;
  }

  async function loadMobileMappingData() {
    state.busy = true;
    state.error = '';
    setStatus('Loading...', 'loading');
    if (typeof window.throttlePhoneTelemetry === 'function') {
      window.throttlePhoneTelemetry(2000);
    }

    const [targets, mappings, clients, presets, projectStatus] = await Promise.all([
      command('getTargets'),
      command('getMappings'),
      command('getClients'),
      command('listPresets'),
      command('getProjectConfigStatus'),
    ]);

    // Report which command failed and why. Collapsing all five into a single
    // "Could not load mapping data" hid the actual cause in the field — an
    // expired session and a dead server port both produced the same opaque
    // string, leaving no way to tell the user what to do about it.
    const required = [
      ['getTargets', targets],
      ['getMappings', mappings],
      ['getClients', clients],
      ['listPresets', presets],
    ];
    const failures = required.filter(([, response]) => !response || !response.ok);
    if (failures.length > 0) {
      state.busy = false;
      state.error = failures
        .map(([name, response]) => `${name}: ${(response && response.error) || 'no response'}`)
        .join(' | ');
      setStatus(state.error, 'error');
      renderAll();
      return;
    }

    state.allTargets = targets.result.targets || [];
    state.currentMappings = normalizeMappings(mappings.result.mappings || {});
    state.clients = clients.result.clients || [];
    state.presets = presets.result.presets || [];
    state.currentPreset = presets.result.current || 'Default';
    state.loaded = true;
    state.busy = false;
    const report = projectStatus.result?.report;
    setStatus(report
      ? `Loaded ${report.loaded}; relinked ${report.relinked}; review ${report.review + report.ambiguous}; missing ${report.missing}`
      : 'Loaded', (report?.missing || report?.review || report?.ambiguous) ? 'warning' : 'ok');
    renderAll();
  }

  function openMappingMode() {
    if (state.open) return;
    state.previousPage = document.body.dataset.page || 'performance';
    state.open = true;
    // Initialise selectedClient eagerly so getActiveMappingKey() is correct from the first load.
    if (!state.selectedClient && typeof window.getPhoneClientId === 'function') {
      state.selectedClient = window.getPhoneClientId() || null;
    }
    document.body.classList.add('mapping-mode');
    const btn = $('btn-map-mode');
    if (btn) {
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
    }
    if (typeof window.setPhoneMappingModeActive === 'function') {
      window.setPhoneMappingModeActive(true);
    }
    // CFG mode is exclusive with MAP: opening MAP must close CFG.
    if (window.RcConfigModeInstance && typeof window.RcConfigModeInstance.off === 'function') {
      window.RcConfigModeInstance.off();
    }
    // MAP is an overlay, not a page. Routing it through showPhonePage() made
    // the layout persist "mapping" as the active page; restoring that on the
    // next load hid every real page and opened the app on a black screen.
    // Mark the body directly and leave the page router out of it.
    document.body.dataset.page = 'mapping';
    // Restore the visibility of the previous page so user sees real interface
    const prevPageEl = document.querySelector(`.page[data-page="${state.previousPage}"]`);
    if (prevPageEl) prevPageEl.classList.remove('hidden');

    const overlay = $('mapping-mode');
    if (overlay) overlay.classList.remove('hidden');
    syncOverlayPresentation();
    setStatus('Loading...', 'loading');
    if (typeof setTimeout === 'function' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    }
    return loadMobileMappingData();
  }

  function updatePageControlHighlights() {
    document.querySelectorAll('[data-name].selected-control').forEach((el) => {
      el.classList.remove('selected-control');
    });
    if (state.selectedControl) {
      const base = state.selectedControl.split('.')[0];
      const el = document.querySelector(`[data-name="${base}"]`);
      if (el) {
        el.classList.add('selected-control');
      }
    }
  }

  function renderAll() {
    renderPresets();
    renderControls();
    renderDetail();
    syncOverlayPresentation();
    updatePageControlHighlights();
  }

  function syncOverlayPresentation() {
    const editing = Boolean(state.selectedControl);
    const overlay = $('mapping-mode');
    const armedStrip = $('map-armed-strip');
    const detail = $('map-mobile-detail');
    const detailPane = detail?.closest('.map-pane-right');
    if (overlay) overlay.dataset.state = editing ? 'editing' : 'armed';
    if (armedStrip) armedStrip.classList.toggle('hidden', editing);
    if (detailPane) detailPane.classList.toggle('hidden', !editing);
  }

  function closeMappingMode() {
    if (!state.open) return;
    state.open = false;
    state.selectedControl = null;
    state.pickerMode = null;
    state.pendingConflict = null;
    document.body.classList.remove('mapping-mode');
    const btn = $('btn-map-mode');
    if (btn) {
      btn.classList.remove('on');
      btn.setAttribute('aria-pressed', 'false');
    }
    if (typeof window.setPhoneMappingModeActive === 'function') {
      window.setPhoneMappingModeActive(false);
    }
    const overlay = $('mapping-mode');
    if (overlay) overlay.classList.add('hidden');
    syncOverlayPresentation();
    const previousPage = state.previousPage || 'performance';
    if (typeof window.showPhonePage === 'function') {
      window.showPhonePage(previousPage);
    }
    document.querySelectorAll('[data-name].selected-control').forEach((el) => {
      el.classList.remove('selected-control');
    });
    if (typeof setTimeout === 'function' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    }
  }
  function renderPresets() {
    const el = $('map-mobile-presets');
    if (!el) return;
    el.innerHTML = '';
    const select = document.createElement('select');
    select.className = 'map-preset-select';
    for (const preset of state.presets) {
      const option = document.createElement('option');
      option.value = preset;
      option.textContent = preset;
      option.selected = preset === state.currentPreset;
      select.appendChild(option);
    }
    select.addEventListener('change', () => loadMobileMappingPreset(select.value));
    el.appendChild(select);

    const name = document.createElement('input');
    name.className = 'map-preset-name';
    name.type = 'text';
    name.setAttribute('aria-label', 'Preset name');
    name.autocapitalize = 'none';
    el.appendChild(name);

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = T('mm.save', 'Save');
    save.addEventListener('click', () => saveMobileMappingPreset(name.value));
    el.appendChild(save);

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = T('mm.delete', 'Delete');
    del.addEventListener('click', () => {
      if (window.confirm && !window.confirm(`Delete preset "${select.value}"?`)) return;
      deleteMobileMappingPreset(select.value);
    });
    el.appendChild(del);

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'map-action-danger';
    clearAll.textContent = T('mm.clearAll', 'Clear All');
    clearAll.addEventListener('click', () => { void clearAllMobileMappings(); });
    el.appendChild(clearAll);
  }

  function renderControls() {
    const el = $('map-mobile-controls');
    if (!el) return;
    el.innerHTML = '';
    const filter = (($('map-mobile-search') && $('map-mobile-search').value) || '').trim().toLowerCase();

    for (const group of CONTROL_GROUPS) {
      const matches = group.items.filter((name) => !filter || name.toLowerCase().includes(filter) || controlLabel(name).toLowerCase().includes(filter));
      if (matches.length === 0) continue;
      const groupEl = document.createElement('section');
      groupEl.className = 'map-control-group';
      const head = document.createElement('h3');
      head.textContent = group.group;
      groupEl.appendChild(head);
      for (const name of matches) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'map-control-row';
        row.dataset.control = name;
        row.classList.toggle('selected', state.selectedControl === name);
        const targets = targetsForControl(name);
        row.textContent = `${controlLabel(name)} ${targets.length ? `(${targets.length})` : ''}`;
        row.addEventListener('click', () => {
          state.selectedControl = name;
          state.selectedTargetIndex = 0;
          renderAll();
        });
        groupEl.appendChild(row);
      }
      el.appendChild(groupEl);
    }
  }

  function renderPresetsInline(container) {
    container.innerHTML = '';
    const select = document.createElement('select');
    select.className = 'map-preset-select';
    for (const preset of state.presets) {
      const option = document.createElement('option');
      option.value = preset;
      option.textContent = preset;
      option.selected = preset === state.currentPreset;
      select.appendChild(option);
    }
    select.addEventListener('change', () => loadMobileMappingPreset(select.value));
    container.appendChild(select);

    const name = document.createElement('input');
    name.className = 'map-preset-name';
    name.type = 'text';
    name.placeholder = 'New Preset...';
    name.setAttribute('aria-label', 'Preset name');
    name.autocapitalize = 'none';
    container.appendChild(name);

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'map-mini-btn';
    save.textContent = T('mm.save', 'Save');
    save.addEventListener('click', () => {
      saveMobileMappingPreset(name.value);
      name.value = '';
    });
    container.appendChild(save);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'map-mini-btn';
    del.textContent = T('mm.delete', 'Delete');
    del.addEventListener('click', () => {
      if (window.confirm && !window.confirm(`Delete preset "${select.value}"?`)) return;
      deleteMobileMappingPreset(select.value);
    });
    container.appendChild(del);


  }

  function renderDetail() {
    const el = $('map-mobile-detail');
    if (!el) return;
    el.innerHTML = '';
    
    // Toggle details pane visibility based on selectedControl
    const pane = el.closest('.map-pane-right');
    if (pane) {
      if (state.selectedControl) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    }

    if (state.pickerMode === 'target') {
      renderTargetPicker(el);
      return;
    }
    if (state.pickerMode === 'midi') {
      renderMidiPicker(el);
      return;
    }
    if (!state.selectedControl) {
      el.textContent = T('mm.selectControl', 'Select a control');
      return;
    }

    const targets = targetsForControl(state.selectedControl);
    const isNoteEditor = targets[state.selectedTargetIndex]?.mode === 'trigger_note';
    if (pane) pane.classList.add('map-note-pane');
    const management = document.createElement('details');
    management.className = 'map-note-management';
    const summary = document.createElement('summary');
    summary.textContent = T('mm.presets', 'Presets');
    management.appendChild(summary);

    // Status and refresh row
    const statusRow = document.createElement('div');
    statusRow.className = 'map-detail-header-row';
    const statusEl = document.createElement('div');
    statusEl.className = 'map-detail-status';
    const originalStatus = $('map-mobile-status');
    statusEl.textContent = originalStatus ? originalStatus.textContent : 'Ready';
    statusEl.dataset.kind = originalStatus ? originalStatus.dataset.kind : '';
    statusRow.appendChild(statusEl);

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'map-mini-btn';
    refreshBtn.textContent = T('mm.refresh', 'Refresh');
    refreshBtn.addEventListener('click', loadMobileMappingData);
    statusRow.appendChild(refreshBtn);
    management.appendChild(statusRow);

    // Presets inline
    const presetsRow = document.createElement('div');
    presetsRow.className = 'map-detail-presets-row';
    renderPresetsInline(presetsRow);
    management.appendChild(presetsRow);

    const title = document.createElement('h2');
    title.className = 'map-detail-title';
    title.textContent = controlLabel(state.selectedControl);

    const deselectBtn = document.createElement('button');
    deselectBtn.type = 'button';
    deselectBtn.className = 'map-mini-btn';
    deselectBtn.textContent = T('mm.close', 'Close');
    deselectBtn.style.float = 'right';
    deselectBtn.addEventListener('click', () => {
      state.selectedControl = null;
      renderAll();
    });
    title.appendChild(deselectBtn);
    el.appendChild(title);
    const actions = document.createElement('div');
    actions.className = 'map-detail-actions';
    el.appendChild(actions);

    if (state.selectedControl && (state.selectedControl.startsWith('xy-1.') || state.selectedControl.startsWith('xy-2.'))) {
      const base = state.selectedControl.split('.')[0];
      const activeAxis = state.selectedControl.split('.')[1] || 'x';

      const axisSelector = document.createElement('div');
      axisSelector.className = 'map-xy-axis-selector';

      const btnX = document.createElement('button');
      btnX.type = 'button';
      btnX.className = `map-axis-tab${activeAxis === 'x' ? ' active' : ''}`;
      btnX.textContent = T('mm.xAxis', 'X Axis (Horizontal)');
      btnX.addEventListener('click', () => {
        state.selectedControl = `${base}.x`;
        state.selectedTargetIndex = 0;
        renderAll();
      });

      const btnY = document.createElement('button');
      btnY.type = 'button';
      btnY.className = `map-axis-tab${activeAxis === 'y' ? ' active' : ''}`;
      btnY.textContent = T('mm.yAxis', 'Y Axis (Vertical)');
      btnY.addEventListener('click', () => {
        state.selectedControl = `${base}.y`;
        state.selectedTargetIndex = 0;
        renderAll();
      });

      axisSelector.appendChild(btnX);
      axisSelector.appendChild(btnY);
      el.appendChild(axisSelector);
    }

    if (state.selectedControl && ['sensor.vision.x', 'sensor.vision.y', 'sensor.vision.z'].includes(state.selectedControl)) {
      const filterConfig = document.createElement('div');
      filterConfig.className = 'map-vision-filter-panel';

      const filterTitle = document.createElement('div');
      filterTitle.className = 'map-vision-filter-title';
      filterTitle.textContent = T('mm.visionFilter', 'VISION SENSOR FILTER (1€)');
      filterConfig.appendChild(filterTitle);

      const isDepth = state.selectedControl === 'sensor.vision.z';
      const getAxisFilters = () => window.currentVisionProcessor?.positionFilters;

      const createSliderRow = (label, prop, min, max, step) => {
        const row = document.createElement('div');
        row.className = 'map-vision-filter-row';
        const lbl = document.createElement('span');
        lbl.className = 'map-vision-filter-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'morph-slider map-vision-slider';
        input.min = min;
        input.max = max;
        input.step = step;
        const valSpan = document.createElement('span');
        valSpan.className = 'map-vision-filter-value';

        function paintProgress(el) {
          const mn = Number(el.min) || 0;
          const mx = Number(el.max) || 1;
          const vl = Number(el.value) || 0;
          const pct = (mx - mn) === 0 ? 0 : ((vl - mn) / (mx - mn)) * 100;
          if (typeof el.style.setProperty === 'function') {
            el.style.setProperty('--range-progress', `${Number.isFinite(pct) ? pct : 0}%`);
          }
        }

        const updateUI = () => {
          const filters = getAxisFilters();
          if (!filters) {
            valSpan.textContent = '-';
            return;
          }
          const f = isDepth ? filters.z : filters.x;
          input.value = f[prop];
          paintProgress(input);
          valSpan.textContent = Number(f[prop]).toFixed(1);
        };
        updateUI();

        input.addEventListener('input', () => {
          paintProgress(input);
          const filters = getAxisFilters();
          if (filters) {
            const v = Number(input.value);
            if (isDepth) {
               filters.z[prop] = v;
            } else {
               filters.x[prop] = v;
               filters.y[prop] = v;
            }
            valSpan.textContent = v.toFixed(1);
          }
        });
        row.appendChild(lbl);
        row.appendChild(input);
        row.appendChild(valSpan);
        return row;
      };

      filterConfig.appendChild(createSliderRow('minCutoff', 'minCutoff', '0.1', '5.0', '0.1'));
      filterConfig.appendChild(createSliderRow('beta', 'beta', '0.0', '10.0', '0.1'));
      el.appendChild(filterConfig);
    }

    if (state.pendingConflict) {
      const banner = document.createElement('div');
      banner.className = 'map-conflict';
      banner.textContent = `Already mapped to ${controlLabel(state.pendingConflict.owner)}`;
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.textContent = T('mm.replace', 'Replace');
      replace.addEventListener('click', async () => {
        const conflict = state.pendingConflict;
        if (!conflict) return;
        replace.disabled = true;
        setStatus(`Replacing ${controlLabel(conflict.owner)}...`, 'loading');
        const response = await replaceMobileMappingConflict(conflict.owner, conflict.target);
        if (response && response.ok === false) {
          replace.disabled = false;
          renderDetail();
          return;
        }
        state.pendingConflict = null;
        state.selectedTargetIndex = Math.max(0, targetsForControl(state.selectedControl).length - 1);
        setStatus(`Replaced mapping from ${controlLabel(conflict.owner)}.`, 'ok');
        renderAll();
      });
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = T('mm.cancel', 'Cancel');
      cancel.addEventListener('click', () => { state.pendingConflict = null; renderDetail(); });
      banner.appendChild(replace);
      banner.appendChild(cancel);
      el.appendChild(banner);
    }

    const list = document.createElement('div');
    list.className = 'map-bound-list';
    for (let i = 0; i < targets.length; i += 1) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'map-bound-target';
      row.dataset.targetIndex = String(i);
      row.classList.toggle('selected', i === state.selectedTargetIndex);
      row.setAttribute('aria-pressed', String(i === state.selectedTargetIndex));
      const type = document.createElement('span');
      type.className = 'map-bound-type';
      type.textContent = targets[i].mode === 'trigger_note' ? T('mm.triggerNote', 'Trigger Note') : T('mm.bind', 'Bind');
      const destination = document.createElement('span');
      destination.className = 'map-bound-destination';
      destination.textContent = targetLabel(targets[i], false);
      row.appendChild(type);
      row.appendChild(destination);
      row.addEventListener('click', () => {
        state.selectedTargetIndex = i;
        renderDetail();
      });
      list.appendChild(row);
    }
    if (targets.length && (!isNoteEditor || targets.length > 1)) {
      const group = document.createElement('section');
      group.className = 'map-control-mappings';
      group.setAttribute('aria-label', `${controlLabel(state.selectedControl)} · ${T('mm.controlMappings', 'Mappings')}`);
      const heading = document.createElement('h3');
      heading.className = 'map-control-mappings-title';
      heading.textContent = T('mm.controlMappings', 'Mappings');
      const count = document.createElement('span');
      count.className = 'map-control-mappings-count';
      count.textContent = String(targets.length);
      heading.appendChild(count);
      group.appendChild(heading);
      group.appendChild(list);
      el.appendChild(group);
    }

    if (targets[state.selectedTargetIndex]) {
      renderTargetEditor(el, targets[state.selectedTargetIndex]);
    }

    const bind = document.createElement('button');
    bind.type = 'button';
    bind.textContent = T('mm.bind', 'Bind');
    bind.addEventListener('click', openTargetPicker);
    actions.appendChild(bind);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = T('mm.triggerNote', 'Trigger Note');
    trigger.addEventListener('click', () => openMidiTrackPicker('trigger_note'));
    actions.appendChild(trigger);

    const unbind = document.createElement('button');
    unbind.type = 'button';
    unbind.className = 'map-action-danger';
    unbind.disabled = !targets.length;
    unbind.textContent = T('mm.unbindTarget', 'Unbind Target');
    unbind.addEventListener('click', async () => {
      if (window.confirm && !window.confirm('Remove this mapping?')) return;
      await removeMobileMappingTarget(state.selectedTargetIndex);
      state.selectedTargetIndex = 0;
      renderDetail();
    });
    actions.appendChild(unbind);

    const clearControl = document.createElement('button');
    clearControl.type = 'button';
    clearControl.className = 'map-action-danger';
    clearControl.disabled = !targets.length;
    clearControl.textContent = T('mm.clearControl', 'Clear Control');
    clearControl.addEventListener('click', async () => {
      if (window.confirm && !window.confirm('Clear all mappings for this control?')) return;
      await clearSelectedMobileControl();
      state.selectedTargetIndex = 0;
      renderDetail();
    });
    actions.appendChild(clearControl);

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'map-action-danger map-action-clear-all';
    clearAll.textContent = T('mm.clearAllMappings', 'Clear All Mappings');
    clearAll.addEventListener('click', () => { void clearAllMobileMappings(); });
    actions.appendChild(clearAll);
    bind.classList.toggle('active', targets.length > 0 && !isNoteEditor);
    trigger.classList.toggle('active', isNoteEditor);

    if (!targets.length) {
      const entry = document.createElement('div');
      entry.className = 'map-entry';
      const heading = document.createElement('h3');
      heading.textContent = T('mm.chooseMapping', 'What should this control do?');
      entry.appendChild(heading);
      for (const [kind, label, description, action] of [
        ['bind', T('mm.bind', 'Bind'), T('mm.bindDescription', 'Control a Live parameter, continuously or as a toggle.'), openTargetPicker],
        ['note', T('mm.triggerNote', 'Trigger Note'), T('mm.noteDescription', 'Play a MIDI note when this control activates.'), () => openMidiTrackPicker('trigger_note')],
      ]) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'map-entry-choice';
        choice.dataset.kind = kind;
        const icon = document.createElement('span');
        icon.className = `map-choice-icon map-icon-${kind}`;
        icon.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.textContent = label;
        const explanation = document.createElement('span');
        explanation.className = 'map-entry-description';
        explanation.textContent = description;
        choice.appendChild(icon);
        choice.appendChild(name);
        choice.appendChild(explanation);
        choice.addEventListener('click', action);
        entry.appendChild(choice);
      }
      el.appendChild(entry);
    }
    el.appendChild(management);

  }

  function renderMidiPicker(container) {
    container.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'map-picker-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = T('mm.back', 'Back');
    back.addEventListener('click', closePicker);
    head.appendChild(back);
    const title = document.createElement('strong');
    title.textContent = T('mm.triggerNote', 'Trigger Note');
    head.appendChild(title);
    container.appendChild(head);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'map-picker-search';
    search.placeholder = 'Search MIDI tracks…';
    search.value = state.pickerFilter || '';
    search.addEventListener('input', () => {
      state.pickerFilter = search.value;
      populateMidiList();
    });
    container.appendChild(search);

    const statusRow = document.createElement('div');
    statusRow.className = 'map-detail-header-row';
    const statusEl = document.createElement('div');
    statusEl.className = 'map-detail-status';
    const originalStatus = $('map-mobile-status');
    statusEl.textContent = originalStatus ? originalStatus.textContent : 'Ready';
    statusEl.dataset.kind = originalStatus ? originalStatus.dataset.kind : '';
    statusRow.appendChild(statusEl);
    container.appendChild(statusRow);

    const list = document.createElement('div');
    list.className = 'map-picker-list';
    container.appendChild(list);

    function populateMidiList() {
      list.innerHTML = '';
      const filter = (state.pickerFilter || '').toLowerCase().trim();
      const tracks = state.allTargets.filter((item) => {
        if (!item.isMidi) return false;
        if (item.trackKind && item.trackKind !== 'track') return false;
        if (!filter) return true;
        const name = (item.name || `Track ${item.trackIndex + 1}`).toLowerCase();
        return name.includes(filter);
      });
      for (const track of tracks) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'map-picker-row';
        row.disabled = state.busy;
        row.textContent = state.busy ? 'Installing...' : (track.name || `Track ${track.trackIndex + 1}`);
        row.addEventListener('click', async () => {
          if (state.changeTargetIndex !== null && state.changeTargetIndex !== undefined) {
            const targets = targetsForControl(state.selectedControl).slice();
            const target = targets[state.changeTargetIndex];
            if (target) {
              state.busy = true;
              renderDetail();
              const install = await command('addUdpReceiverToTrack', { trackIndex: track.trackIndex });
              state.busy = false;
              if (!install.ok || !install.result || !install.result.success) {
                const reason = install.result?.reason;
                setStatus(reason === 'receiver_upgrade_required'
                  ? T('map.receiverUpgrade', 'Replace the old Receiver on this track with RC-Midi-Receiver v2 (SDK / LOCAL MAX — NO UDP), then retry.')
                  : reason === 'receiver_ambiguous'
                    ? T('map.receiverAmbiguous', 'More than one Receiver was found on this track. Keep only one Receiver v2 and retry.')
                  : reason === 'receiver_missing'
                  ? 'RC-Midi-Receiver.amxd não está nessa track. Coloque o dispositivo nela no Live e tente novamente.'
                  : (install.error || 'Não foi possível verificar RC-Midi-Receiver.amxd nessa track.'), 'error');
                renderDetail();
                return;
              }
              target.trackIndex = track.trackIndex;
              target.trackKind = 'track';
              await saveTargetsForSelected(targets);
              state.changeTargetIndex = null;
              closePicker();
              return;
            }
          }
          const result = await createMobileMidiTarget(track, state.midiTargetMode);
          if (result === false || result?.ok === false) return;
          closePicker();
        });
        list.appendChild(row);
      }
    }

    populateMidiList();
  }

  function addEditorSelect(container, label, field, value, options) {
    const wrap = document.createElement('label');
    wrap.className = 'map-editor-field';
    const span = document.createElement('span');
    span.textContent = label;
    const select = document.createElement('select');
    for (const option of options) {
      const optionValue = typeof option === 'string' ? option : option.value;
      const optionLabel = typeof option === 'string' ? option : option.label;
      const item = document.createElement('option');
      item.value = optionValue;
      item.textContent = optionLabel;
      item.selected = optionValue === value;
      select.appendChild(item);
    }
    select.addEventListener('change', () => updateMobileTargetField(field, select.value));
    wrap.appendChild(span);
    wrap.appendChild(select);
    container.appendChild(wrap);
  }

  function addEditorNumber(container, label, field, value, min, max, step) {
    const wrap = document.createElement('label');
    wrap.className = 'map-editor-field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => updateMobileTargetField(field, input.value, { refresh: false }));
    input.addEventListener('change', () => updateMobileTargetField(field, input.value));
    wrap.appendChild(span);
    wrap.appendChild(input);
    container.appendChild(wrap);
  }

  let activeAnimationId = null;

  function getActiveTarget() {
    if (!state.selectedControl) return null;
    const targets = targetsForControl(state.selectedControl);
    return targets[state.selectedTargetIndex] || null;
  }

  function startCanvasAnimation(canvas, readoutEl) {
    if (activeAnimationId) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }

    if (typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const run = () => {
      if (!state.open || !state.selectedControl || state.pickerMode) {
        activeAnimationId = null;
        return;
      }

      const activeTarget = getActiveTarget();
      if (!activeTarget) {
        activeAnimationId = null;
        return;
      }

      const rawVal = window.currentControlStates ? (window.currentControlStates[state.selectedControl] ?? 0.5) : 0.5;
      
      let hostVal = null;
      if (activeTarget.takeoverMode === 'pickup') {
        const feedback = window.currentSafeFeedback ? window.currentSafeFeedback[state.selectedControl] : null;
        if (feedback && feedback.hostValue !== undefined) {
          hostVal = Number(feedback.hostValue);
        }
      }
      
      // Keep the drawing and pointer geometry in CSS pixels at every drawer size.
      const width = Math.round(canvas.clientWidth || canvas.width);
      if (canvas.width !== width) canvas.width = width;
      drawCurve(canvas, ctx, activeTarget, rawVal, readoutEl, hostVal);
      activeAnimationId = requestAnimationFrame(run);
    };

    activeAnimationId = requestAnimationFrame(run);
  }

  function curvePlotGeometry(canvas) {
    // Reserve room for the complete handles, strokes and live marker at 0/1.
    // Rendering and pointer interaction must use the same inset transform.
    const padding = 14;
    const width = Math.max(1, canvas.width - padding * 2);
    const height = Math.max(1, canvas.height - padding * 2);
    const clamp = (value) => Math.max(0, Math.min(1, value));
    return {
      x: (value) => padding + clamp(value) * width,
      y: (value) => padding + (1 - clamp(value)) * height,
      valueAtY: (pixel) => clamp(1 - (pixel - padding) / height),
    };
  }

  function curveBaseValue(value, curve) {
    if (curve === 'exponential') return value * value;
    if (curve === 'logarithmic') return Math.sqrt(Math.max(0, value));
    if (curve === 's-curve') return 0.5 * (1 - Math.cos(value * Math.PI));
    return value;
  }

  function curvePreviewInput(input, target) {
    const inMin = target.inMin ?? 0;
    const inMax = target.inMax ?? 1;
    return inMax > inMin
      ? Math.max(0, Math.min(1, (input - inMin) / (inMax - inMin)))
      : input >= inMin ? 1 : 0;
  }

  function curvePreviewShape(value, target) {
    if (!Number.isFinite(value)) return 0;
    let result = curveBaseValue(value, target.curve);
    const drive = target.drive ?? 0;
    if (drive !== 0) result = Math.max(0, Math.min(1, result + drive));
    // Match src/live/curves.ts, including the safe compander bounds.
    const compressor = Math.max(-0.99, Math.min(0.99, target.compressor ?? 0));
    if (compressor < 0) return result * (1 + compressor) - 0.5 * compressor;
    if (compressor > 0) {
      const diff = result - 0.5;
      return 0.5 + Math.sign(diff) * 0.5 * Math.pow(Math.abs(diff) * 2, 1 - compressor * 0.8);
    }
    return result;
  }

  function curvePreviewOutput(input, target) {
    const outMin = target.outMin ?? 0;
    const outMax = target.outMax ?? 1;
    return outMin + curvePreviewShape(curvePreviewInput(input, target), target) * (outMax - outMin);
  }

  function inverseCurveCompression(value, target) {
    const compressor = Math.max(-0.99, Math.min(0.99, target.compressor ?? 0));
    let result = value;
    if (compressor < 0) result = (value + 0.5 * compressor) / (1 + compressor);
    else if (compressor > 0) {
      const diff = Math.max(0, Math.min(1, value)) - 0.5;
      result = 0.5 + Math.sign(diff) * 0.5 * Math.pow(Math.abs(diff) * 2, 1 / (1 - compressor * 0.8));
    }
    return Math.max(0, Math.min(1, result));
  }

  function curveHandlePositions(canvas, target, plot = curvePlotGeometry(canvas)) {
    const inMin = target.inMin ?? 0;
    const inMax = target.inMax ?? 1;
    return [['outMin', inMin], ['outMax', inMax], ['drive', (inMin + inMax) / 2]].map(([name, input]) => ({
      name,
      x: plot.x(input),
      y: plot.y(curvePreviewOutput(input, target)),
    }));
  }

  function drawCurve(canvas, ctx, target, currentInput, readoutEl, hostVal) {
    const w = canvas.width;
    const h = canvas.height;
    const plot = curvePlotGeometry(canvas);

    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    for (let i = 0.25; i < 1; i += 0.25) {
      ctx.beginPath();
      ctx.moveTo(plot.x(i), plot.y(0));
      ctx.lineTo(plot.x(i), plot.y(1));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(plot.x(0), plot.y(i));
      ctx.lineTo(plot.x(1), plot.y(i));
      ctx.stroke();
    }

    const inMin = target.inMin ?? 0;
    const inMax = target.inMax ?? 1;

    ctx.strokeStyle = '#ffa133';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    // Sample the handle inputs explicitly so the polyline passes through them.
    const samples = Array.from({ length: 61 }, (_, i) => i / 60);
    samples.push(inMin, inMax, (inMin + inMax) / 2);
    samples.sort((a, b) => a - b);
    for (const [i, pct] of samples.entries()) {
      const yVal = curvePreviewOutput(pct, target);
      const cx = plot.x(pct);
      const cy = plot.y(yVal);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    const scaledOutput = curvePreviewOutput(currentInput, target);

    const dotX = plot.x(currentInput);
    const dotY = plot.y(scaledOutput);

    ctx.fillStyle = 'rgba(255, 149, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff9500';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();

    if (hostVal !== null && hostVal !== undefined) {
      const hostY = plot.y(hostVal);
      // Draw horizontal dashed line
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x(0), hostY);
      ctx.lineTo(plot.x(1), hostY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw ghost dot at the current sensor X but host Y
      ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
      ctx.beginPath();
      ctx.arc(dotX, hostY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw 3 curve editing handles: left (outMin), right (outMax), middle (drive / transition)
    const handleRadius = 8;
    const [leftHandle, rightHandle, midHandle] = curveHandlePositions(canvas, target, plot);

    // Draw left handle (outMin)
    ctx.fillStyle = '#ffa133';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(leftHandle.x, leftHandle.y, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw right handle (outMax)
    ctx.fillStyle = '#ffa133';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rightHandle.x, rightHandle.y, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw middle handle (shape / transition drive)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffa133';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(midHandle.x, midHandle.y, handleRadius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (readoutEl) {
      // Say when the number is the last known reading rather than a live one,
      // so a held parameter never looks like it dropped to zero.
      const lost = window.currentControlLost && state.selectedControl
        ? window.currentControlLost[state.selectedControl] === true
        : false;
      const values = { in: currentInput.toFixed(2), out: scaledOutput.toFixed(2) };
      readoutEl.textContent = lost
        ? T('mm.inOutLost', 'NO SIGNAL — last In: {in} | Out: {out}', values)
        : T('mm.inOutLive', 'In: {in} | Out: {out}', values);
    }
  }

  function formatSliderValue(val, step, unit) {
    const num = Number(val) || 0;
    const isInt = step >= 1 && Number.isInteger(step);
    const formatted = isInt ? Math.round(num).toString() : num.toFixed(2);
    return unit ? `${formatted}${unit}` : formatted;
  }

  function paintProgress(el) {
    const mn = Number(el.min) || 0;
    const mx = Number(el.max) || 1;
    const vl = Number(el.value) || 0;
    const pct = (mx - mn) === 0 ? 0 : ((vl - mn) / (mx - mn)) * 100;
    if (typeof el.style?.setProperty === 'function') {
      el.style.setProperty('--range-progress', `${Number.isFinite(pct) ? pct : 0}%`);
    }
  }

  const EDITOR_SLIDER_DEFAULTS = Object.freeze({
    inMin: 0,
    inMax: 1,
    outMin: 0,
    outMax: 1,
    idleValue: 0,
    neutralValue: 0,
    drive: 0,
    compressor: 0,
    smooth: 0,
    threshold: 0.5,
    midiVelocity: 100,
    noteDurationMs: 80,
  });

  function syncSliderDOM(field, value) {
    const input = document.querySelector(`.map-editor-slider-input[data-field="${field}"]`);
    if (!input) return;
    input.value = String(value);
    paintProgress(input);
    const wrap = input.closest?.('.map-editor-slider-wrap');
    const valEl = wrap?.querySelector?.('.map-editor-slider-value');
    if (valEl) {
      const step = Number(input.step) || 0.01;
      const unit = field === 'noteDurationMs' ? 'ms' : '';
      valEl.textContent = formatSliderValue(value, step, unit);
    }
  }

  function addEditorSlider(container, labelText, field, value, min, max, step, unit = '') {
    const wrap = document.createElement('div');
    wrap.className = 'map-editor-slider-wrap';
    wrap.dataset.field = field;

    const labelRow = document.createElement('div');
    labelRow.className = 'map-editor-slider-label-row';

    const label = document.createElement('span');
    label.className = 'map-editor-slider-label';
    label.textContent = labelText;

    const valEl = document.createElement('span');
    valEl.className = 'map-editor-slider-value';
    valEl.textContent = formatSliderValue(value, step, unit);

    labelRow.appendChild(label);
    labelRow.appendChild(valEl);
    wrap.appendChild(labelRow);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.className = 'morph-slider map-editor-slider-input';
    input.dataset.field = field;
    input.setAttribute('aria-label', labelText);

    paintProgress(input);

    input.addEventListener('input', () => {
      paintProgress(input);
      valEl.textContent = formatSliderValue(input.value, step, unit);
      updateMobileTargetField(field, input.value, { refresh: false });
    });
    input.addEventListener('change', () => {
      paintProgress(input);
      updateMobileTargetField(field, input.value);
    });

    const resetToDefault = () => {
      const defaultVal = EDITOR_SLIDER_DEFAULTS[field];
      if (defaultVal === undefined) return;
      input.value = String(defaultVal);
      paintProgress(input);
      valEl.textContent = formatSliderValue(defaultVal, step, unit);
      updateMobileTargetField(field, defaultVal);
      setStatus(`${labelText} resetado para default (${formatSliderValue(defaultVal, step, unit)})`, 'ok');
    };

    // Double-click reset (mouse / pointer)
    input.addEventListener('dblclick', (e) => {
      e.preventDefault();
      resetToDefault();
    });
    wrap.addEventListener('dblclick', (e) => {
      if (e.target === input) return;
      e.preventDefault();
      resetToDefault();
    });

    // Touch: track taps with strict timing (60-320ms) and distance (<12px) to prevent accidental double-tap resets
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    wrap.addEventListener('touchend', (e) => {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const now = Date.now();
      const dt = now - lastTapTime;
      const dx = Math.abs(touch.clientX - lastTapX);
      const dy = Math.abs(touch.clientY - lastTapY);
      if (dt > 60 && dt < 320 && dx < 12 && dy < 12) {
        lastTapTime = 0;
        resetToDefault();
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
      }
    }, { passive: true });

    wrap.appendChild(input);
    container.appendChild(wrap);
  }

  function renderTriggerNoteEditor(container, target) {
    const wrap = document.createElement('div');
    wrap.className = 'map-trigger-editor';
    const section = (key, title) => {
      const block = document.createElement('section');
      block.className = 'map-note-section';
      block.dataset.section = key;
      const heading = document.createElement('h3');
      heading.className = 'map-note-section-title';
      heading.textContent = title;
      block.appendChild(heading);
      wrap.appendChild(block);
      return block;
    };
    const destinationSection = section('destination', T('mm.destination', 'Destination'));
    const noteSection = section('note', T('mm.noteLabel', 'Note'));
    const triggerSection = section('trigger', T('mm.triggerSection', 'Trigger'));

    // 1. Header with Destination Track and [TROCAR] button
    const header = document.createElement('div');
    header.className = 'map-trigger-header';
    const targetKind = target.trackKind || 'track';
    const track = state.allTargets.find((item) => item.trackIndex === target.trackIndex && (item.trackKind || 'track') === targetKind);
    const trackName = track ? (track.name || `Track ${(target.trackIndex ?? 0) + 1}`) : `Track ${(target.trackIndex ?? 0) + 1}`;

    const trackLabel = document.createElement('div');
    trackLabel.className = 'map-trigger-track-label';
    trackLabel.textContent = trackName;
    header.appendChild(trackLabel);

    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'map-btn-change-target';
    changeBtn.textContent = T('mm.changeTarget', 'Change');
    changeBtn.addEventListener('click', () => {
      state.changeTargetIndex = state.selectedTargetIndex;
      openMidiTrackPicker();
    });
    header.appendChild(changeBtn);
    destinationSection.appendChild(header);

    // 2. Receiver v2 Status Badge
    const receiverBadge = document.createElement('div');
    receiverBadge.className = 'map-receiver-badge';
    receiverBadge.textContent = T('mm.receiverReady', 'RECEIVER v2: READY');
    destinationSection.appendChild(receiverBadge);

    command('addUdpReceiverToTrack', { trackIndex: target.trackIndex ?? 0 }).then((res) => {
      if (res && res.ok && res.result && res.result.success) {
        receiverBadge.className = 'map-receiver-badge ready';
        receiverBadge.textContent = T('mm.receiverReady', 'RECEIVER v2: READY');
      } else {
        const reason = res?.result?.reason;
        if (reason === 'receiver_upgrade_required') {
          receiverBadge.className = 'map-receiver-badge upgrade';
          receiverBadge.textContent = T('mm.receiverUpgrade', 'RECEIVER v2: UPGRADE REQUIRED');
        } else if (reason === 'receiver_ambiguous') {
          receiverBadge.className = 'map-receiver-badge ambiguous';
          receiverBadge.textContent = T('mm.receiverAmbiguous', 'RECEIVER v2: AMBIGUOUS');
        } else {
          receiverBadge.className = 'map-receiver-badge missing';
          receiverBadge.textContent = T('mm.receiverMissing', 'RECEIVER v2: MISSING');
        }
      }
    }).catch(() => {
      receiverBadge.className = 'map-receiver-badge missing';
      receiverBadge.textContent = T('mm.receiverMissing', 'RECEIVER v2: MISSING');
    });

    // 3. Note & Octave & MIDI number row
    const noteRow = document.createElement('div');
    noteRow.className = 'map-trigger-note-row';

    const currentNote = target.midiNote || 'C2';
    const match = currentNote.trim().toUpperCase().match(/^([A-G]#?)(-?\d+)$/);
    const currentPitch = match ? match[1] : 'C';
    const currentOctave = match ? match[2] : '2';

    // Pitch Select
    const pitchWrap = document.createElement('div');
    pitchWrap.className = 'map-trigger-note-field';
    const pitchTitle = document.createElement('span');
    pitchTitle.className = 'map-trigger-field-title';
    pitchTitle.textContent = T('mm.noteLabel', 'Note');
    pitchWrap.appendChild(pitchTitle);

    const pitchSelect = document.createElement('select');
    pitchSelect.className = 'map-midi-pitch-select';

    // Octave Select
    const octWrap = document.createElement('div');
    octWrap.className = 'map-trigger-note-field';
    const octTitle = document.createElement('span');
    octTitle.className = 'map-trigger-field-title';
    octTitle.textContent = T('mm.octaveLabel', 'Octave');
    octWrap.appendChild(octTitle);

    const octaveSelect = document.createElement('select');
    octaveSelect.className = 'map-midi-octave-select';

    // MIDI badge
    const midiBadge = document.createElement('div');
    midiBadge.className = 'map-midi-number-badge';

    const refreshPitchOptions = () => {
      const selectedOct = parseInt(octaveSelect.value || currentOctave, 10);
      const prevPitch = pitchSelect.value || currentPitch;
      pitchSelect.innerHTML = '';
      for (const p of PITCHES) {
        // If octave is 8, only C through G are valid (<= 127). Reject G#8+!
        const midi = (selectedOct + 2) * 12 + PITCHES.indexOf(p);
        if (midi > 127) continue;
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        if (p === prevPitch) opt.selected = true;
        pitchSelect.appendChild(opt);
      }
      pitchSelect.value = prevPitch;
    };

    const octaves = ['-2', '-1', '0', '1', '2', '3', '4', '5', '6', '7', '8'];
    octaveSelect.value = currentOctave;
    for (const o of octaves) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      opt.selected = o === currentOctave;
      octaveSelect.appendChild(opt);
    }

    refreshPitchOptions();

    const updateNoteFromSelects = () => {
      const newPitch = pitchSelect.value;
      const newOct = octaveSelect.value;
      const noteStr = `${newPitch}${newOct}`;
      const midiNum = parseMidiNoteToNumber(noteStr);
      if (midiNum === null) {
        setStatus('Invalid MIDI note range (C-2 to G8 allowed)', 'error');
        return;
      }
      midiBadge.textContent = `MIDI ${midiNum}`;
      updateMobileTargetField('midiNote', noteStr);
    };

    const initialMidiNum = parseMidiNoteToNumber(currentNote) ?? 48;
    midiBadge.textContent = `MIDI ${initialMidiNum}`;

    pitchSelect.addEventListener('change', () => {
      updateNoteFromSelects();
    });
    octaveSelect.addEventListener('change', () => {
      refreshPitchOptions();
      updateNoteFromSelects();
    });

    pitchWrap.appendChild(pitchSelect);
    octWrap.appendChild(octaveSelect);
    noteRow.appendChild(pitchWrap);
    noteRow.appendChild(octWrap);
    noteRow.appendChild(midiBadge);
    noteSection.appendChild(noteRow);

    // 4. Velocity Slider (1..127)
    addEditorSlider(noteSection, T('mm.velocityLabel', 'Velocity'), 'midiVelocity', target.midiVelocity ?? 100, 1, 127, 1);

    // 5. Timing Segmented Control (AGORA, PRÓX. TEMPO, COMPASSO)
    const timingWrap = document.createElement('div');
    timingWrap.className = 'map-trigger-note-field';
    const timingTitle = document.createElement('span');
    timingTitle.className = 'map-trigger-field-title';
    timingTitle.textContent = T('mm.whenLabel', 'When');
    timingWrap.appendChild(timingTitle);

    const currentTiming = target.noteTiming || 'immediate';
    const timingGroup = document.createElement('div');
    timingGroup.className = 'map-segmented-control';

    const timingOptions = [
      { id: 'immediate', label: T('mm.timingImmediate', 'Now') },
      { id: 'beat', label: T('mm.timingBeat', 'Next Beat') },
      { id: 'bar', label: T('mm.timingBar', 'Bar') },
    ];

    for (const opt of timingOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-segmented-btn${currentTiming === opt.id ? ' active' : ''}`;
      btn.textContent = opt.label;
      btn.dataset.value = opt.id;
      btn.addEventListener('click', async () => {
        for (const b of timingGroup.children) b.classList.toggle('active', b === btn);
        await updateMobileTargetField('noteTiming', opt.id);
        renderDetail();
      });
      timingGroup.appendChild(btn);
    }
    timingWrap.appendChild(timingGroup);

    // Live transport line under timing
    const liveLine = document.createElement('div');
    liveLine.className = 'map-timing-live-status';
    liveLine.hidden = !['beat', 'bar'].includes(target.noteTiming);
    timingWrap.appendChild(liveLine);

    let syncWarning = null;
    if (['beat', 'bar'].includes(target.noteTiming)) {
      syncWarning = document.createElement('div');
      syncWarning.className = 'map-timing-sync-warning';
      timingWrap.appendChild(syncWarning);
    }
    triggerSection.appendChild(timingWrap);

    updateLiveLine(liveLine, syncWarning);

    // 6. Gate Segmented Control (CURTA, ENQUANTO PRESSIONADO)
    const gateWrap = document.createElement('div');
    gateWrap.className = 'map-trigger-note-field';
    const gateTitle = document.createElement('span');
    gateTitle.className = 'map-trigger-field-title';
    gateTitle.textContent = T('mm.durationLabel', 'Duration');
    gateWrap.appendChild(gateTitle);

    const isSync = ['beat', 'bar'].includes(target.noteTiming);
    const currentGate = isSync ? 'pulse' : (target.noteGate || 'hold');
    const gateGroup = document.createElement('div');
    gateGroup.className = 'map-segmented-control';

    const gateOptions = [
      { id: 'pulse', label: T('mm.gatePulse', 'Short') },
      { id: 'hold', label: T('mm.gateHold', 'While Held') },
    ];

    for (const opt of gateOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-segmented-btn${currentGate === opt.id ? ' active' : ''}`;
      btn.textContent = opt.label;
      btn.dataset.value = opt.id;
      if (opt.id === 'hold' && isSync) {
        btn.disabled = true;
        btn.title = T('mm.syncRequiresPulse', 'Quantized trigger requires short pulse gate');
      }
      btn.addEventListener('click', async () => {
        if (opt.id === 'hold' && ['beat', 'bar'].includes(target.noteTiming)) {
          setStatus(T('mm.syncRequiresPulse', 'Quantized trigger requires short pulse gate'), 'error');
          return;
        }
        for (const b of gateGroup.children) b.classList.toggle('active', b === btn);
        target.noteGate = opt.id;
        await updateMobileTargetField('noteGate', opt.id);
        renderDetail();
      });
      gateGroup.appendChild(btn);
    }
    gateWrap.appendChild(gateGroup);
    triggerSection.appendChild(gateWrap);

    // 7. Duration: musical bar fraction or legacy free milliseconds.
    if (currentGate === 'pulse') {
      const durationWrap = document.createElement('div');
      durationWrap.className = 'map-trigger-duration';
      const mode = document.createElement('div');
      mode.className = 'map-duration-mode map-segmented-control';
      mode.setAttribute('aria-label', T('mm.durationLabel', 'Duration'));
      for (const [value, label] of [['grid', T('mm.durationMusical', 'Musical')], ['ms', 'ms']]) {
        const button = document.createElement('button');
        button.type = 'button';
        const selected = (target.noteDurationMode || 'ms') === value;
        button.className = `map-segmented-btn map-duration-mode-btn${selected ? ' active' : ''}`;
        button.dataset.durationMode = value;
        button.setAttribute('aria-pressed', String(selected));
        button.textContent = label;
        button.addEventListener('click', async () => {
          await updateMobileTargetField('noteDurationMode', value);
          renderDetail();
        });
        mode.appendChild(button);
      }
      durationWrap.appendChild(mode);
      if (target.noteDurationMode === 'grid') {
        const unit = document.createElement('span');
        unit.className = 'map-trigger-field-title';
        unit.textContent = T('mm.durationGrid', 'Bars');
        durationWrap.appendChild(unit);
        const bars = document.createElement('div');
        bars.className = 'map-duration-bars';
        bars.setAttribute('aria-label', T('mm.durationGrid', 'Bars'));
        for (const value of [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4]) {
          const button = document.createElement('button');
          button.type = 'button';
          const selected = (target.noteDurationBars ?? 0.25) === value;
          button.className = `map-segmented-btn${selected ? ' active' : ''}`;
          button.dataset.durationBars = String(value);
          button.setAttribute('aria-pressed', String(selected));
          button.textContent = value < 1 ? `1/${Math.round(1 / value)}` : String(value);
          button.addEventListener('click', async () => {
            await updateMobileTargetField('noteDurationBars', value);
            renderDetail();
          });
          bars.appendChild(button);
        }
        durationWrap.appendChild(bars);
      } else {
        addEditorSlider(durationWrap, T('mm.durationLabel', 'Duration'), 'noteDurationMs', target.noteDurationMs ?? 80, 20, 2000, 10, 'ms');
      }
      triggerSection.appendChild(durationWrap);
    }

    // 9. Feedback Status readout
    const feedbackBox = document.createElement('div');
    feedbackBox.id = 'map-trigger-feedback';
    feedbackBox.className = 'map-trigger-feedback';
    feedbackBox.dataset.state = triggerFeedbackState.state || 'ready';
    triggerSection.appendChild(feedbackBox);
    updateTriggerFeedbackUI(feedbackBox);

    // 10. Collapsible Advanced section
    const advanced = document.createElement('details');
    advanced.className = 'map-editor-advanced';
    const summary = document.createElement('summary');
    summary.textContent = T('mm.advanced', 'Advanced');
    advanced.appendChild(summary);

    const advBody = document.createElement('div');
    advBody.className = 'map-advanced-body';

    // Threshold slider
    addEditorSlider(advBody, T('mm.triggerThreshold', 'Trigger threshold'), 'threshold', target.threshold ?? 0.5, 0, 1, 0.01);

    // Safe loss notice
    const safeLossNotice = document.createElement('div');
    safeLossNotice.className = 'map-safe-loss-note';
    safeLossNotice.textContent = state.selectedControl?.startsWith('sensor.vision.') && (target.neutralPolicy || 'hold') === 'hold'
      ? T('mm.safeLossVisionHold', 'Hand lost: keep the last state. Camera OFF and Panic stop the note.')
      : T('mm.safeLossNote', 'Signal loss releases active notes and cancels pending triggers.');
    advBody.appendChild(safeLossNotice);

    advanced.appendChild(advBody);
    wrap.appendChild(advanced);

    container.appendChild(wrap);
  }

  function renderTargetEditor(container, target) {
    if (!target) return;

    const editor = document.createElement('div');
    editor.className = 'map-target-editor-rich';

    if (target.relinkStatus && target.relinkStatus !== 'loaded') {
      const relink = document.createElement('div');
      relink.className = `map-relink-status map-relink-${target.relinkStatus}`;
      relink.textContent = `${target.relinkStatus} ${Math.round((target.relinkConfidence || 0) * 100)}%`;
      editor.appendChild(relink);
      for (const [candidateIndex, candidate] of (target.relinkCandidates || []).entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-mini-btn map-relink-candidate';
        const signature = candidate.target?.signature || {};
        button.textContent = `${Math.round(candidate.confidence * 100)}% ${signature.trackName || ''} › ${signature.deviceName || ''} › ${signature.parameterName || candidate.target?.type}`;
        button.addEventListener('click', async () => {
          const result = await command('confirmProjectRelink', {
            control: mappingKey(state.selectedControl),
            targetIndex: state.selectedTargetIndex,
            candidateIndex,
          });
          if (!result.ok) return setStatus(result.error || 'Relink failed', 'error');
          await loadMobileMappingData();
        });
        editor.appendChild(button);
      }
    }

    const mode = target.mode || 'continuous';

    if (mode === 'trigger_note') {
      renderTriggerNoteEditor(editor, target);
      container.appendChild(editor);
      return;
    }

    editor.classList.add('map-bind-editor');
    function choices(label, field, items, selected, dataKey) {
      const row = document.createElement('div');
      row.className = 'map-bind-choice-row';
      const title = document.createElement('span');
      title.className = 'map-trigger-field-title';
      title.textContent = label;
      row.appendChild(title);
      const group = document.createElement('div');
      group.className = `map-segmented-control map-bind-${field}`;
      group.setAttribute('aria-label', label);
      for (const [value, text] of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `map-segmented-btn${selected === value ? ' active' : ''}`;
        button.dataset[dataKey] = value;
        button.setAttribute('aria-pressed', String(selected === value));
        const icon = document.createElement('span');
        icon.className = `map-choice-icon map-icon-${value}`;
        icon.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.textContent = text;
        button.appendChild(icon);
        button.appendChild(name);
        button.addEventListener('click', async () => {
          await updateMobileTargetField(field, value);
          renderDetail();
        });
        group.appendChild(button);
      }
      row.appendChild(group);
      editor.appendChild(row);
    }
    choices(T('mm.bindMode', 'Mode'), 'mode', [
      ['continuous', T('mm.modeContinuous', 'Continuous')], ['toggle', T('mm.modeToggle', 'Toggle')],
    ], mode, 'bindMode');
    choices(T('mm.curve', 'Curve'), 'curve', [
      ['linear', T('mm.curveLinear', 'Linear')], ['exponential', T('mm.curveExp', 'Exp')],
      ['logarithmic', T('mm.curveLog', 'Log')], ['s-curve', T('mm.curveS', 'S')],
    ], target.curve || 'linear', 'bindCurve');
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'map-curve-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 180;
    canvas.className = 'map-curve-canvas';
    canvasWrap.appendChild(canvas);
    
    const readout = document.createElement('div');
    readout.className = 'map-curve-readout';
    readout.textContent = T('mm.inOut', 'In: 0.00 | Out: 0.00');
    canvasWrap.appendChild(readout);
    editor.appendChild(canvasWrap);

    // 3 draggable handles on the curve graph:
    // Left handle: outMin (0..1)
    // Right handle: outMax (0..1)
    // Middle handle: transition form / drive (-1..1)
    let activeDragHandle = null;

    function getCanvasCoords(e) {
      if (typeof canvas.getBoundingClientRect !== 'function') {
        return { x: e.offsetX ?? 0, y: e.offsetY ?? 0 };
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const clientX = e.clientX ?? (rect.left + (e.offsetX ?? 0));
      const clientY = e.clientY ?? (rect.top + (e.offsetY ?? 0));
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    function findHandleAt(pos) {
      const target = getActiveTarget();
      if (!target) return null;
      const handles = curveHandlePositions(canvas, target);
      const nearest = handles.map((handle) => ({
        name: handle.name,
        distance: Math.hypot(pos.x - handle.x, pos.y - handle.y),
      })).sort((a, b) => a.distance - b.distance || (a.name === 'drive' ? -1 : b.name === 'drive' ? 1 : 0))[0];
      return nearest && nearest.distance <= 24 ? nearest.name : null;
    }

    canvas.addEventListener('pointerdown', (e) => {
      const pos = getCanvasCoords(e);
      const handle = findHandleAt(pos);
      if (handle) {
        activeDragHandle = handle;
        try { canvas.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault?.();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!activeDragHandle) {
        const pos = getCanvasCoords(e);
        const handle = findHandleAt(pos);
        canvas.style.cursor = handle ? 'pointer' : 'default';
        return;
      }
      const target = getActiveTarget();
      if (!target) return;
      const pos = getCanvasCoords(e);
      const normY = curvePlotGeometry(canvas).valueAtY(pos.y);

      if (activeDragHandle === 'outMin') {
        const shaped = curvePreviewShape(curvePreviewInput(target.inMin ?? 0, target), target);
        const influence = 1 - shaped;
        if (Math.abs(influence) < 1e-8) return;
        const value = (normY - shaped * (target.outMax ?? 1)) / influence;
        const rounded = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
        target.outMin = rounded;
        updateMobileTargetField('outMin', rounded, { refresh: false });
        syncSliderDOM('outMin', rounded);
      } else if (activeDragHandle === 'outMax') {
        const shaped = curvePreviewShape(curvePreviewInput(target.inMax ?? 1, target), target);
        if (Math.abs(shaped) < 1e-8) return;
        const value = (normY - (1 - shaped) * (target.outMin ?? 0)) / shaped;
        const rounded = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
        target.outMax = rounded;
        updateMobileTargetField('outMax', rounded, { refresh: false });
        syncSliderDOM('outMax', rounded);
      } else if (activeDragHandle === 'drive') {
        const outMin = target.outMin ?? 0;
        const outMax = target.outMax ?? 1;
        const range = outMax - outMin;
        if (Math.abs(range) < 1e-8) return;
        const desiredNorm = inverseCurveCompression((normY - outMin) / range, target);
        const midInput = ((target.inMin ?? 0) + (target.inMax ?? 1)) / 2;
        const baseMid = curveBaseValue(curvePreviewInput(midInput, target), target.curve);
        const desiredDrive = Math.max(-1, Math.min(1, desiredNorm - baseMid));
        const rounded = Math.round(desiredDrive * 100) / 100;
        target.drive = rounded;
        updateMobileTargetField('drive', rounded, { refresh: false });
        syncSliderDOM('drive', rounded);
      }
    });

    const finishDrag = () => {
      if (!activeDragHandle) return;
      const target = getActiveTarget();
      if (target) {
        if (activeDragHandle === 'outMin') updateMobileTargetField('outMin', target.outMin);
        else if (activeDragHandle === 'outMax') updateMobileTargetField('outMax', target.outMax);
        else if (activeDragHandle === 'drive') updateMobileTargetField('drive', target.drive);
      }
      activeDragHandle = null;
    };
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);

    canvas.addEventListener('dblclick', (e) => {
      e.preventDefault?.();
      const target = getActiveTarget();
      if (!target) return;
      const pos = getCanvasCoords(e);
      const handle = findHandleAt(pos);
      if (handle === 'outMin') {
        target.outMin = 0;
        updateMobileTargetField('outMin', 0);
        syncSliderDOM('outMin', 0);
        setStatus(T('mm.handleResetOutMin', 'Out Min restored to default (0.00)'), 'ok');
      } else if (handle === 'outMax') {
        target.outMax = 1;
        updateMobileTargetField('outMax', 1);
        syncSliderDOM('outMax', 1);
        setStatus(T('mm.handleResetOutMax', 'Out Max restored to default (1.00)'), 'ok');
      } else if (handle === 'drive') {
        target.drive = 0;
        updateMobileTargetField('drive', 0);
        syncSliderDOM('drive', 0);
        setStatus(T('mm.handleResetDrive', 'Drive restored to default (0.00)'), 'ok');
      } else {
        target.outMin = 0;
        target.outMax = 1;
        target.drive = 0;
        updateMobileTargetField('outMin', 0, { refresh: false });
        updateMobileTargetField('outMax', 1, { refresh: false });
        updateMobileTargetField('drive', 0);
        syncSliderDOM('outMin', 0);
        syncSliderDOM('outMax', 1);
        syncSliderDOM('drive', 0);
        setStatus(T('mm.handleResetAll', 'Curve restored to defaults (Out Min: 0.00, Out Max: 1.00, Drive: 0.00)'), 'ok');
      }
    });

    const slidersGrid = document.createElement('div');
    slidersGrid.className = 'map-editor-sliders-grid';

    addEditorSlider(slidersGrid, T('mm.outMin', 'Output min'), 'outMin', target.outMin ?? 0, 0, 1, 0.01);
    addEditorSlider(slidersGrid, T('mm.outMax', 'Output max'), 'outMax', target.outMax ?? 1, 0, 1, 0.01);
    addEditorSlider(slidersGrid, 'Drive', 'drive', target.drive ?? 0, -1, 1, 0.01);
    addEditorSlider(slidersGrid, T('mm.compression', 'Compression'), 'compressor', target.compressor ?? 0, -1, 1, 0.01);
    addEditorSlider(slidersGrid, T('mm.smoothing', 'Smoothing'), 'smooth', target.smooth ?? 0, 0, 1, 0.01);

    if (mode !== 'continuous') {
      addEditorSlider(slidersGrid, 'Threshold', 'threshold', target.threshold ?? 0.5, 0, 1, 0.01);
    }

    editor.appendChild(slidersGrid);
    const advanced = document.createElement('details');
    advanced.className = 'map-editor-advanced';
    const summary = document.createElement('summary');
    summary.textContent = T('mm.advanced', 'Advanced');
    advanced.appendChild(summary);
    const advancedBody = document.createElement('div');
    advancedBody.className = 'map-advanced-body';
    const selects = document.createElement('div');
    selects.className = 'map-editor-row-selects';
    addEditorSelect(selects, T('mm.targetScale', 'Target scale'), 'targetScale', target.targetScale || 'auto', ['auto', 'linear', 'geometric']);
    addEditorSelect(selects, T('mm.takeover', 'Takeover'), 'takeoverMode', target.takeoverMode || 'scale', ['scale', 'pickup', 'jump']);
    addEditorSelect(selects, T('mm.safeLoss', 'Safe loss'), 'neutralPolicy', target.neutralPolicy ||
      (state.selectedControl?.startsWith('sensor.vision.') ? 'hold' : 'release'), ['release', 'hold', 'zero', 'center', 'custom']);
    advancedBody.appendChild(selects);
    const extra = document.createElement('div');
    extra.className = 'map-editor-sliders-grid';
    addEditorSlider(extra, T('mm.inMin', 'Input min'), 'inMin', target.inMin ?? 0, 0, 1, 0.01);
    addEditorSlider(extra, T('mm.inMax', 'Input max'), 'inMax', target.inMax ?? 1, 0, 1, 0.01);
    addEditorSlider(extra, T('mm.idleValue', 'Idle value'), 'idleValue', target.idleValue ?? 0, 0, 1, 0.01);
    addEditorSlider(extra, T('mm.neutralValue', 'Neutral'), 'neutralValue', target.neutralValue ?? 0, 0, 1, 0.01);
    advancedBody.appendChild(extra);
    advanced.appendChild(advancedBody);
    editor.appendChild(advanced);
    container.appendChild(editor);
    startCanvasAnimation(canvas, readout);
  }

  function renderTargetPicker(container) {
    container.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'map-picker-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'map-mini-btn';
    back.textContent = T('mm.back', 'Back');
    back.addEventListener('click', closePicker);
    head.appendChild(back);
    const title = document.createElement('strong');
    title.textContent = T('mm.pickTarget', 'Pick Target');
    head.appendChild(title);
    container.appendChild(head);

    const statusRow = document.createElement('div');
    statusRow.className = 'map-detail-header-row';
    const statusEl = document.createElement('div');
    statusEl.className = 'map-detail-status';
    const originalStatus = $('map-mobile-status');
    statusEl.textContent = originalStatus ? originalStatus.textContent : 'Ready';
    statusEl.dataset.kind = originalStatus ? originalStatus.dataset.kind : '';
    statusRow.appendChild(statusEl);
    container.appendChild(statusRow);

    const searchWrap = document.createElement('div');
    searchWrap.className = 'map-picker-search-wrap';
    searchWrap.style.display = 'flex';
    searchWrap.style.gap = '6px';
    searchWrap.style.alignItems = 'center';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Filter targets...';
    searchInput.className = 'map-picker-search';
    searchInput.style.flex = '1';
    searchInput.value = state.pickerFilter || '';
    searchWrap.appendChild(searchInput);

    const btnUseSelected = document.createElement('button');
    btnUseSelected.type = 'button';
    btnUseSelected.className = 'map-mini-btn';
    btnUseSelected.textContent = T('mm.selectedInLive', 'Selected in Live');
    btnUseSelected.style.whiteSpace = 'nowrap';
    btnUseSelected.style.height = '28px';
    btnUseSelected.style.fontSize = '10px';
    btnUseSelected.style.padding = '0 6px';
    btnUseSelected.style.margin = '0';

    btnUseSelected.addEventListener('click', async () => {
      const res = await command('getTransportLiteState');
      if (res && res.ok !== false) {
        const trnState = res.result || res;
        if (trnState.connected && trnState.selectedTrackIndex !== undefined) {
          const trackIdx = trnState.selectedTrackIndex;
          const deviceIdx = trnState.selectedDeviceIndex;
          
          const track = state.allTargets.find(t => t.trackIndex === trackIdx);
          if (track) {
            const trackName = track.name || `Track ${trackIdx + 1}`;
            let filterText = trackName;
            
            if (deviceIdx !== undefined && track.devices) {
              const device = track.devices.find(d => d.index === deviceIdx);
              if (device) {
                filterText = `${trackName} > ${device.name}`;
              }
            }
            
            searchInput.value = filterText;
            state.pickerFilter = filterText;
            doRenderTree();
          } else {
            setStatus(`Track index ${trackIdx} not found in options`, 'error');
          }
        } else {
          setStatus('AbletonOSC is not connected or selection info unavailable', 'error');
        }
      } else {
        setStatus('Failed to fetch host selection state', 'error');
      }
    });

    searchWrap.appendChild(btnUseSelected);
    container.appendChild(searchWrap);

    const treeContainer = document.createElement('div');
    treeContainer.className = 'map-picker-tree';
    container.appendChild(treeContainer);

    const doRenderTree = () => {
      treeContainer.innerHTML = '';
      const filter = searchInput.value.trim().toLowerCase();

      // Group: Song / Main / Master
      const tempoTarget = { type: 'tempo', label: 'Song Tempo' };
      const showTempo = !filter || 'song tempo'.includes(filter) || 'tempo'.includes(filter);
      const mainTrackData = state.allTargets.find(t => t.trackKind === 'main');
      
      renderTrackGroup(T('mm.songMain', 'Song / Main / Master'),
        mainTrackData ? [mainTrackData] : [], filter, treeContainer,
        showTempo ? [{ label: 'Tempo', target: tempoTarget }] : []);

      // Normal Tracks
      const normalTracks = state.allTargets.filter(t => t.trackKind === 'track');
      renderTrackGroup('Tracks', normalTracks, filter, treeContainer);

      // Return Tracks
      const returnTracks = state.allTargets.filter(t => t.trackKind === 'return');
      renderTrackGroup('Return Tracks', returnTracks, filter, treeContainer);
    };

    searchInput.addEventListener('input', () => {
      state.pickerFilter = searchInput.value;
      doRenderTree();
    });

    doRenderTree();
  }

  function createPickerRow(labelText, target) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'map-picker-row';
    row.textContent = labelText;
    row.addEventListener('click', async () => {
      const success = await bindMobileTarget(target);
      if (success) {
        closePicker();
      }
    });
    return row;
  }

  function renderTrackGroup(groupTitleText, tracks, filter, parentContainer, leadingItems = []) {
    const trackBlocks = [];
    
    let filterTrack = null;
    let filterDevice = null;
    const cleanFilter = filter.trim().toLowerCase();
    if (cleanFilter.includes(' > ')) {
      const parts = cleanFilter.split(' > ');
      filterTrack = parts[0].trim();
      filterDevice = parts[1].trim();
    }
    
    const isFiltered = cleanFilter.length > 0;

    for (const track of tracks) {
      const trackName = track.name || `Track ${track.trackIndex + 1}`;
      const trackMatchedMixer = [];
      const trackMatchedDevices = [];

      for (const mixer of track.mixer || []) {
        let matches = false;
        if (filterTrack) {
          matches = trackName.toLowerCase() === filterTrack;
        } else {
          matches = !filter || mixer.label.toLowerCase().includes(cleanFilter) || trackName.toLowerCase().includes(cleanFilter);
        }
        if (matches) {
          trackMatchedMixer.push(mixer);
        }
      }

      for (const device of track.devices || []) {
        const matchedParams = [];
        for (const param of device.params || []) {
          let matches = false;
          if (filterTrack && filterDevice) {
            matches = trackName.toLowerCase() === filterTrack && device.name.toLowerCase() === filterDevice;
          } else if (filterTrack) {
            matches = trackName.toLowerCase() === filterTrack;
          } else {
            matches = !filter || param.label.toLowerCase().includes(cleanFilter) || device.name.toLowerCase().includes(cleanFilter) || trackName.toLowerCase().includes(cleanFilter);
          }
          if (matches) {
            matchedParams.push(param);
          }
        }
        if (matchedParams.length > 0 || (!filter && device.params?.length === 0)) {
          trackMatchedDevices.push({ name: device.name, params: matchedParams });
        }
      }

      if (trackMatchedMixer.length > 0 || trackMatchedDevices.length > 0) {
        const trackBlock = document.createElement('div');
        trackBlock.className = 'map-picker-track-block';
        
        const trackHeader = document.createElement('div');
        trackHeader.className = 'map-picker-track-header';
        trackHeader.style.cursor = 'pointer';
        
        const trackContent = document.createElement('div');
        trackContent.className = 'map-picker-track-content';
        
        const trackExpanded = isFiltered;
        trackContent.classList.toggle('hidden', !trackExpanded);
        
        const trackIndicator = document.createElement('span');
        trackIndicator.className = 'map-picker-indicator';
        trackIndicator.textContent = trackExpanded ? '▼ ' : '▶ ';
        trackHeader.appendChild(trackIndicator);
        
        const trackTitleSpan = document.createElement('span');
        trackTitleSpan.textContent = trackName;
        trackHeader.appendChild(trackTitleSpan);
        
        trackHeader.addEventListener('click', () => {
          const isHidden = trackContent.classList.contains('hidden');
          trackContent.classList.toggle('hidden', !isHidden);
          trackIndicator.textContent = isHidden ? '▼ ' : '▶ ';
        });
        
        trackBlock.appendChild(trackHeader);

        if (trackMatchedMixer.length > 0) {
          const mixerSection = document.createElement('div');
          mixerSection.className = 'map-picker-track-section';
          for (const mixer of trackMatchedMixer) {
            mixerSection.appendChild(createPickerRow(`Mixer > ${mixer.label}`, mixer));
          }
          trackContent.appendChild(mixerSection);
        }

        if (trackMatchedDevices.length > 0) {
          for (const dev of trackMatchedDevices) {
            const devBlock = document.createElement('div');
            devBlock.className = 'map-picker-device-block';
            
            const devHeader = document.createElement('div');
            devHeader.className = 'map-picker-device-header';
            devHeader.style.cursor = 'pointer';
            
            const devContent = document.createElement('div');
            devContent.className = 'map-picker-device-content';
            
            const devExpanded = isFiltered;
            devContent.classList.toggle('hidden', !devExpanded);
            
            const devIndicator = document.createElement('span');
            devIndicator.className = 'map-picker-indicator';
            devIndicator.textContent = devExpanded ? '▼ ' : '▶ ';
            devHeader.appendChild(devIndicator);
            
            const devTitleSpan = document.createElement('span');
            devTitleSpan.textContent = dev.name;
            devHeader.appendChild(devTitleSpan);
            
            devHeader.addEventListener('click', (e) => {
              e.stopPropagation();
              const isHidden = devContent.classList.contains('hidden');
              devContent.classList.toggle('hidden', !isHidden);
              devIndicator.textContent = isHidden ? '▼ ' : '▶ ';
            });
            
            devBlock.appendChild(devHeader);

            const paramsSection = document.createElement('div');
            paramsSection.className = 'map-picker-device-section';
            for (const param of dev.params) {
              paramsSection.appendChild(createPickerRow(param.label, param));
            }
            devContent.appendChild(paramsSection);
            devBlock.appendChild(devContent);
            trackContent.appendChild(devBlock);
          }
        }
        trackBlock.appendChild(trackContent);
        trackBlocks.push(trackBlock);
      }
    }

    if (trackBlocks.length > 0 || leadingItems.length > 0) {
      const groupEl = document.createElement('div');
      groupEl.className = 'map-picker-group';
      const title = document.createElement('h4');
      title.textContent = groupTitleText;
      groupEl.appendChild(title);
      for (const item of leadingItems) groupEl.appendChild(createPickerRow(item.label, item.target));
      for (const block of trackBlocks) {
        groupEl.appendChild(block);
      }
      parentContainer.appendChild(groupEl);
    }
  }

  window.mobileMappingState = state;
  window.openMobileMappingMode = openMappingMode;
  window.closeMobileMappingMode = closeMappingMode;
  window.loadMobileMappingData = loadMobileMappingData;
  window.renderDetail = renderDetail;
  window.renderMobileDetail = renderDetail;

  function init() {
    const btn = $('btn-map-mode');
    const back = $('btn-map-back');
    const refresh = $('btn-map-refresh');
    if (btn) btn.addEventListener('click', () => state.open ? closeMappingMode() : openMappingMode());
    if (back) back.addEventListener('click', closeMappingMode);
    if (refresh) refresh.addEventListener('click', loadMobileMappingData);

    const search = $('map-mobile-search');
    if (search) search.addEventListener('input', renderControls);

    // Event interception for mapping selection
    const handleIntercept = (e) => {
      if (!state.open) return;
      if (e.target.closest('#mapping-mode')) return;
      if (e.target.closest('.tabs')) return;

      const target = e.target.closest('[data-name]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();

        let controlName = target.getAttribute('data-name');
        if (controlName) {
          if (controlName === 'xy-1' || controlName === 'xy-2') {
            controlName = controlName + '.x';
          }
          state.selectedControl = controlName;
          state.selectedTargetIndex = 0;
          renderAll();
        }
      }
    };

    window.addEventListener('touchstart', handleIntercept, { capture: true, passive: false });
    window.addEventListener('mousedown', handleIntercept, { capture: true });
    window.addEventListener('click', handleIntercept, { capture: true });

    window.addEventListener('ableton-rc:phone-ws-open', () => {
      if (state.open) loadMobileMappingData();
    });
    window.addEventListener('ableton-rc:phone-client-id', (event) => {
      state.selectedClient = event.detail && event.detail.clientId ? event.detail.clientId : state.selectedClient;
    });
    window.addEventListener('ableton-rc:phone-ws-close', () => {
      // A bare "Disconnected" told the user nothing. The panel reloads itself
      // on 'phone-ws-open', so say that the retry is automatic and what to do
      // if it never succeeds (the server port moves when Ableton restarts).
      if (state.open) {
        setStatus('Connection lost — reconnecting automatically. If this persists, rescan the QR code.', 'error');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
