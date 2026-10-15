// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
(function (root) {
  'use strict';
  const WRITES = new Set(['recordingSelectTrack','recordingSetPoint','recordingLocator','recordingArm','recordingPrepare','recordingStart','recordingStop','recordingAudition','recordingClick','recordingMark']);
  const t = (key, params) => root.RcSurfaceI18n?.t('rec.' + key, params) || key;
  function positionToBeats(bar, beat, meter) {
    const numerator = meter?.numerator, denominator = meter?.denominator;
    if (!Number.isInteger(bar) || bar < 1 || !Number.isFinite(beat) || beat < 1 || !Number.isInteger(numerator) || numerator < 1
      || ![1,2,4,8,16,32].includes(denominator) || beat >= numerator + 1) throw Error('REC:POSITION');
    return ((bar - 1) * numerator + beat - 1) * 4 / denominator;
  }
  function beatsToPosition(beats, meter) {
    const units = beats * meter.denominator / 4;
    return { bar: Math.floor(units / meter.numerator) + 1, beat: Math.round((units % meter.numerator + 1) * 1000) / 1000 };
  }
  /** Callbacks only confirm the state the host observed. No queued/replayed
   * writes; STOP retires prior callbacks and remains available while busy. */
  function createClient({send, render = () => {}, timeoutMs = 12000}) {
    let connected = false, role = 'viewer', state = null, busy = false, generation = 0, error = null, receivedAt = 0;
    const view = () => {
      let observed = state;
      if (state?.transport && Date.now() - receivedAt > 2000) {
        observed = {...state, transport:{...state.transport}};
        for (const key of ['isPlaying','recordMode','songTimeBeats','metronome']) observed.transport[key] = {...state.transport[key],fresh:false};
      }
      return {connected, role, state:observed, busy, error, writable: connected && ['controller','admin'].includes(role)};
    };
    const notify = () => render(view());
    function session(open, nextRole = 'viewer') {
      generation++; connected = open; role = nextRole; state = null; busy = false; error = null; notify();
    }
    function command(name, args = {}) {
      if (!connected || (WRITES.has(name) && !view().writable)) return Promise.reject(Error('REC:SESSION'));
      if (busy && name !== 'recordingStop') return Promise.reject(Error('REC:BUSY'));
      if (name === 'recordingStop') generation++;
      const epoch = generation;
      busy = true; error = null; notify();
      return new Promise((resolve, reject) => {
        let settled = false;
        function finish(response) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (epoch !== generation) { reject(Error('REC:SESSION')); return; }
          busy = false;
          if (response?.ok && response.result) { state = response.result; receivedAt = Date.now(); error = state.error || null; notify(); resolve(state); }
          else { error = response?.error || 'REC:UNKNOWN'; state = null; notify(); reject(Error(error)); }
        }
        const timer = setTimeout(() => finish({ok:false, error:'REC:UNKNOWN'}), timeoutMs);
        try { send(name, args, finish); } catch { finish({ok:false, error:'REC:UNKNOWN'}); }
      });
    }
    async function retry() {
      const epoch = generation;
      await command('recordingArm',{enabled:true});
      if (epoch !== generation) throw Error('REC:SESSION');
      return command('recordingPrepare');
    }
    return {view, session, command, retry};
  }
  function setup() {
    const doc = root.document, page = doc.getElementById('page-recording');
    if (!page) return;
    const elements = Object.fromEntries([
      'rec-status','rec-track','rec-arm','rec-refresh','rec-bar','rec-beat','rec-point','rec-previous','rec-next',
      'rec-locators','rec-prepare','rec-start','rec-stop','rec-audition','rec-retry','rec-click','rec-good','rec-review',
      'rec-mark','rec-arms','rec-conditions',
    ].map(id => [id.slice(4),doc.getElementById(id)]));
    const el = id => elements[id];
    let appliedPoint = null, selectedSignature = '', refreshTimer = null;
    const client = createClient({send: (name,args,cb) => root.sendPhoneCommand(name,args,cb), render});
    const invoke = (name, args) => client.command(name,args).catch(() => {});
    function render(view) {
      const state = view.state, write = view.writable, stopped = state?.transport?.isPlaying?.fresh && state.transport.isPlaying.value === false
        && state.transport.recordMode.fresh && state.transport.recordMode.value === false;
      const unknown = !state || !state.transport.connected || !state.transport.recordMode.fresh || !state.transport.isPlaying.fresh;
      const recording = !unknown && state.transport.recordMode.value === true;
      const playing = !unknown && state.transport.isPlaying.value === true;
      el('status').textContent = view.error ? reason(view.error) : t(unknown ? 'unknown' : recording ? 'recordObserved' : playing ? 'playing' : state.preparedToken ? 'prepared' : 'stopped');
      el('status').dataset.recording = String(recording);
      el('stop').disabled = !write; // Always independent of preflight/pending.
      el('refresh').disabled = !view.connected || view.busy;
      const editable = write && !view.busy && stopped;
      for (const id of ['track','arm','bar','beat','point','previous','next','locators','prepare']) el(id).disabled = !editable;
      el('start').disabled = !editable || !state?.preparedToken;
      el('audition').disabled = !editable || !state?.selected || state?.point == null;
      el('retry').disabled = !editable || !state?.selected || state?.point == null;
      el('click').disabled = !write || view.busy || !state?.transport?.metronome?.fresh;
      el('click').textContent = t('click') + ' · ' + (state?.transport?.metronome?.fresh ? t(state.transport.metronome.value ? 'on' : 'off') : '?');
      for (const id of ['good','review']) el(id).disabled = !write || view.busy || !state?.lastAttempt?.stopped;
      el('mark').textContent = state?.lastAttempt?.mark ? t('mark.' + state.lastAttempt.mark) : '';
      el('arm').textContent = t(state?.tracks?.find(track => track.index === state.selected?.index)?.arm === true ? 'disarm' : 'arm');
      el('arms').textContent = t('armedTracks') + ': ' + (state ? state.tracks.filter(track => track.arm === true).map(track => track.name).join(', ') || t('none') : '?');
      el('conditions').textContent = state ? Object.entries(state.safety).map(([key,value]) => t('condition.' + key) + ': ' + (value === null ? '?' : t(value ? 'on' : 'off'))).join(' · ') : '';
      if (!state) return;
      const signature = JSON.stringify(state.tracks.map(track => [track.index,track.id,track.name,track.canArm]));
      if (selectedSignature !== signature) {
        selectedSignature = signature; el('track').replaceChildren();
        const empty = doc.createElement('option'); empty.value = ''; empty.textContent = t('chooseTrack'); el('track').appendChild(empty);
        for (const track of state.tracks) {
          const option = doc.createElement('option'); option.value = String(track.index); option.textContent = (track.index+1) + ' · ' + track.name;
          option.disabled = track.canArm !== true; el('track').appendChild(option);
        }
      }
      el('track').value = state.selected ? String(state.selected.index) : '';
      if (state.point !== null && state.point !== appliedPoint) {
        appliedPoint = state.point;
        const pos = beatsToPosition(state.point,state.meter); el('bar').value = pos.bar; el('beat').value = pos.beat;
      }
      const cues = el('locators');
      cues.replaceChildren();
      const empty = doc.createElement('option'); empty.value = ''; empty.textContent = t('locators'); cues.appendChild(empty);
      state.locators.forEach((cue, index) => { const option = doc.createElement('option'); option.value = String(index); option.textContent = cue.name + ' · ' + cue.time; cues.appendChild(option); });
    }
    function reason(error) {
      const code = String(error).match(/REC:([A-Z_]+)/)?.[1];
      const translated = code ? t('reason.' + code) : '';
      return translated && translated !== 'rec.reason.' + code ? translated : t('checkLive');
    }
    el('track').addEventListener('change', () => {
      const value = el('track').value, track = client.view().state?.tracks.find(track => String(track.index) === value);
      if (track) invoke('recordingSelectTrack',{index:track.index,id:track.id,name:track.name});
    });
    el('arm').addEventListener('click', () => {
      const state = client.view().state, track = state?.tracks.find(track => track.index === state.selected?.index);
      if (track) invoke('recordingArm',{enabled:track.arm !== true});
    });
    el('point').addEventListener('click', () => {
      try { invoke('recordingSetPoint',{beats:positionToBeats(Number(el('bar').value),Number(el('beat').value),client.view().state?.meter)}); }
      catch { el('status').textContent = t('reason.POSITION'); }
    });
    for (const direction of ['previous','next']) el(direction).addEventListener('click', () => invoke('recordingLocator',{direction}));
    el('locators').addEventListener('change', () => {
      const value = el('locators').value, cue = value !== '' && client.view().state?.locators[Number(value)];
      if (cue) invoke('recordingSetPoint',{beats:cue.time});
    });
    el('prepare').addEventListener('click', () => invoke('recordingPrepare'));
    el('start').addEventListener('click', () => invoke('recordingStart',{token:client.view().state?.preparedToken}));
    el('stop').addEventListener('click', () => invoke('recordingStop'));
    el('audition').addEventListener('click', () => invoke('recordingAudition',{disarm:true}));
    el('retry').addEventListener('click', async () => {
      try { await client.retry(); } catch { /* Explicit action only; never retry a failed command. */ }
    });
    el('click').addEventListener('click', () => invoke('recordingClick',{enabled:!client.view().state?.transport.metronome.value}));
    for (const mark of ['good','review']) el(mark).addEventListener('click', () => invoke('recordingMark',{mark}));
    el('refresh').addEventListener('click', () => invoke('getRecordingState'));
    function poll() {
      clearTimeout(refreshTimer);
      if (doc.body.dataset.page !== 'recording' || doc.hidden || !client.view().connected) return;
      if (!client.view().busy) invoke('getRecordingState');
      refreshTimer = setTimeout(poll,2000);
    }
    root.addEventListener('ableton-rc:phone-client-id', event => { client.session(true,event.detail?.role || 'viewer'); poll(); });
    root.addEventListener('ableton-rc:phone-ws-close', () => { client.session(false); clearTimeout(refreshTimer); });
    root.addEventListener('ableton-rc:page-change', poll);
    doc.addEventListener('visibilitychange', poll);
    doc.addEventListener('rcsurface:languagechange', () => { selectedSignature = ''; render(client.view()); });
    render(client.view());
    return client;
  }
  root.RcRecording = Object.freeze({createClient, positionToBeats, beatsToPosition, setup});
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded',setup,{once:true});
    else setup();
  }
})(typeof window !== 'undefined' ? window : globalThis);
