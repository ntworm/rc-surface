// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (global) {
  'use strict';
  const groups = ['attacks', 'tone', 'texture', 'bands'];
  // One control decides what the graph draws. The cards are always all there,
  // so nothing is hidden behind a second menu.
  const views = ['amplitude'].concat(groups, ['all']);
  // A few knobs per group, never per detector: attacks share how they are
  // triggered and how they fall, the reading groups share their smoothing.
  const ms = (v) => Math.round(v) + ' ms';
  // Gain travels in octaves so unity sits mid-dial instead of at one tenth of
  // the sweep; the setting itself stays a plain multiplier.
  const gainKnob = (key) => ({
    key, label: 'GAIN', min: -2, max: 3, step: 0.05,
    toSetting: (v) => Number((2 ** v).toFixed(3)),
    fromSetting: (g) => Math.log2(Number(g) || 1),
    format: (v) => '\u00d7' + (2 ** v).toFixed(2),
  });
  const KNOBS = Object.freeze({
    attacks: Object.freeze([
      { key: 'sensitivity', label: 'SENS', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
      { key: 'releaseMs', label: 'RELEASE', min: 10, max: 500, step: 5, format: ms },
      { key: 'curve', label: 'CURVE', min: 0.3, max: 3, step: 0.05, format: (v) => v.toFixed(2) },
      gainKnob('attacksGain'),
    ]),
    tone: Object.freeze([
      { key: 'toneMs', label: 'SMOOTH', min: 0, max: 200, step: 5, format: ms },
      gainKnob('toneGain'),
    ]),
    texture: Object.freeze([
      { key: 'textureMs', label: 'SMOOTH', min: 0, max: 200, step: 5, format: ms },
      gainKnob('textureGain'),
    ]),
    bands: Object.freeze([
      { key: 'bandsMs', label: 'SMOOTH', min: 0, max: 200, step: 5, format: ms },
      gainKnob('bandsGain'),
    ]),
  });
  let controller = null;
  let renderedSyncMode;
  const controlRefreshers = [];
  let activeView = 'amplitude';
  const T = (key, fallback) => {
    const value = global.RcSurfaceI18n?.t('aud.' + key);
    return !value || value === 'aud.' + key ? fallback : value;
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function create() {
    const bank = document.getElementById('audio-detector-bank');
    if (!bank) return;
    for (const group of groups) {
      const panel = element('section', 'audio-descriptor-group');
      panel.id = 'audio-group-' + group;
      panel.dataset.group = group;
      panel.style.setProperty('--group-color', global.AudioDescriptorFamilies?.[group] || 'var(--accent)');
      panel.setAttribute('aria-label', T(group, group));
      panel.append(element('h3', '', T(group, group)));
      if (group === 'bands') panel.querySelector('h3').title = T('bandsMeasurement', 'K-weighted loudness (BS.1770) · 0 = −50 LU, 1 = −5 LU');
      for (const entry of global.AudioDescriptorCatalog.filter((item) => item.group === group)) {
        const card = element('div', 'audio-detector-card');
        card.dataset.name = entry.name;
        card.style.setProperty('--descriptor-color', entry.color);
        card.append(element('strong', 'audio-detector-label', T(entry.field, entry.label)));
        const value = element('output', 'audio-detector-value', entry.hzScale ? '0 Hz' : '0.000');
        value.id = 'lbl-audio-' + entry.field;
        card.append(value, element('span', 'audio-detector-hint', T(entry.field + 'Hint', entry.hint)));
        const meter = element('span', 'audio-detector-meter');
        meter.setAttribute('aria-hidden', 'true');
        const fill = element('span', 'audio-detector-fill');
        fill.id = 'bar-audio-' + entry.field;
        meter.append(fill);
        card.append(meter);
        panel.append(card);
      }
      bank.append(panel);
    }
    global.RcSurfaceI18n?.subscribe(() => {
      for (const group of groups) {
        const panel = document.getElementById('audio-group-' + group);
        panel.querySelector('h3').textContent = T(group, group);
        panel.setAttribute('aria-label', T(group, group));
        if (group === 'bands') panel.querySelector('h3').title = T('bandsMeasurement', 'K-weighted loudness (BS.1770) · 0 = −50 LU, 1 = −5 LU');
      }
      for (const entry of global.AudioDescriptorCatalog) {
        const card = bank.querySelector('[data-name="' + entry.name + '"]');
        card.querySelector('.audio-detector-label').textContent = T(entry.field, entry.label);
        card.querySelector('.audio-detector-hint').textContent = T(entry.field + 'Hint', entry.hint);
      }
    });
  }
  function knobsFor(view) {
    // In the combined view a bare "SMOOTH" says nothing: every knob carries
    // the group it belongs to, and its colour.
    if (view === 'all') {
      return groups.flatMap((group) => KNOBS[group].map((knob) => ({ ...knob, group })));
    }
    return (KNOBS[view] || []).map((knob) => ({ ...knob, group: view }));
  }

  function timedKnob(knob, settings) {
    const timing = global.AudioDetectorTiming;
    const clock = controller.clock?.() || {};
    const preference = timing?.KEYS[knob.key];
    if (!preference || clock.syncMode !== 'sync') return knob;
    const choices = timing.steps(knob.key);
    return { ...knob, settingKey: preference, min: 0, max: choices.length - 1, step: 1,
      fromSetting: () => choices.indexOf(settings[preference]),
      toSetting: (index) => choices[index],
      format: (index) => timing.label(choices[index], controller.clock?.().bpm),
      reset: knob.key === 'releaseMs' ? 0 : choices.indexOf(0),
    };
  }

  function renderControls() {
    const host = document.getElementById('audio-detector-controls');
    if (!host || !controller) return;
    host.replaceChildren();
    controlRefreshers.length = 0;
    renderedSyncMode = controller.clock?.().syncMode;
    const settings = controller.get();
    const panels = new Map();
    for (const spec of knobsFor(activeView)) {
      const knob = timedKnob(spec, settings);
      if (!panels.has(knob.group)) {
        const panel = element('section', 'audio-control-group');
        panel.dataset.group = knob.group;
        panel.style.setProperty('--group-color', global.AudioDescriptorFamilies?.[knob.group] || 'var(--accent)');
        panel.append(element('h3', '', T(knob.group, knob.group)));
        const row = element('div', 'audio-control-group-knobs');
        panel.append(row);
        panels.set(knob.group, row);
        host.append(panel);
      }
      const control = element('label', 'audio-analysis-control');
      control.dataset.detectorKnob = knob.key;
      control.dataset.detectorGroup = knob.group;
      control.style.setProperty('--group-color', global.AudioDescriptorFamilies?.[knob.group] || 'var(--accent)');
      const head = element('span', 'audio-analysis-control-head');
      head.append(element('b', '', T('knob.' + knob.key, knob.label)));
      const stored = knob.fromSetting ? knob.fromSetting(settings[knob.key]) : settings[knob.key];
      const value = element('output', '', knob.format(stored));
      head.append(value);
      const dial = element('span', 'audio-analysis-dial');
      dial.dataset.detectorDial = knob.key;
      dial.append(element('span', 'audio-analysis-dial-face'));
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'audio-analysis-input';
      input.min = String(knob.min);
      input.max = String(knob.max);
      input.step = String(knob.step);
      input.value = String(stored);
      input.setAttribute('aria-label', T(knob.group, knob.group) + ' · ' + T('knob.' + knob.key, knob.label));
      input.setAttribute('aria-valuetext', value.textContent);
      controlRefreshers.push(() => {
        value.textContent = knob.format(Number(input.value));
        input.setAttribute('aria-valuetext', value.textContent);
      });
      dial.append(input);
      control.append(head, dial);
      panels.get(knob.group).append(control);
      const paint = (current) => {
        const progress = Math.max(0, Math.min(1, (current - knob.min) / (knob.max - knob.min)));
        dial.style.setProperty('--audio-dial-progress', String(progress));
        dial.style.setProperty('--audio-dial-angle', progress * 270 + 'deg');
      };
      const commit = (raw) => {
        const clamped = Math.min(knob.max, Math.max(knob.min, Number(raw)));
        const stepped = Math.round((clamped - knob.min) / knob.step) * knob.step + knob.min;
        input.value = String(stepped);
        value.textContent = knob.format(stepped);
        input.setAttribute('aria-valuetext', value.textContent);
        paint(stepped);
        controller.set(knob.settingKey || knob.key, knob.toSetting ? knob.toSetting(stepped) : stepped);
      };
      paint(Number(input.value));
      input.addEventListener('input', () => commit(input.value));
      let pointer = null;
      let startY = 0;
      let startValue = Number(input.value);
      dial.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        input.focus({ preventScroll: true });
        pointer = event.pointerId;
        startY = event.clientY;
        startValue = Number(input.value);
        dial.setPointerCapture?.(pointer);
      });
      dial.addEventListener('pointermove', (event) => {
        if (pointer !== event.pointerId) return;
        commit(startValue + ((startY - event.clientY) / 120) * (knob.max - knob.min));
      });
      const release = (event) => {
        if (pointer !== event.pointerId) return;
        pointer = null;
        dial.releasePointerCapture?.(event.pointerId);
      };
      dial.addEventListener('pointerup', release);
      dial.addEventListener('pointercancel', release);
      dial.addEventListener('dblclick', () => {
        const fallback = global.AudioDescriptors?.DEFAULT_SETTINGS?.[knob.key] ?? knob.min;
        commit(knob.reset ?? (knob.fromSetting ? knob.fromSetting(fallback) : fallback));
      });
    }
    // The analysis window belongs to every group, so it is always offered.
    const windowControl = element('div', 'audio-window-control');
    windowControl.dataset.detectorKnob = 'window';
    const windowHead = element('span', 'audio-analysis-control-head');
    windowHead.append(element('b', '', T('knob.window', 'JANELA')));
    windowHead.append(element('output', '', String(settings.window * 512) + ' @48k'));
    const picker = element('span', 'audio-window-picker');
    for (const step of [1, 2, 4]) {
      const button = element('button', '', 'x' + step);
      button.type = 'button';
      button.dataset.detectorWindow = String(step);
      button.setAttribute('aria-pressed', String(settings.window === step));
      button.addEventListener('click', () => controller.set('window', step));
      picker.append(button);
    }
    windowControl.append(windowHead, picker);
    const clockLabel = element('span', 'audio-controls-clock');
    const refreshClock = () => {
      const clock = controller.clock?.() || {};
      clockLabel.textContent = clock.syncMode === 'sync' ? 'SYNC · ' + (Number(clock.bpm) || 120) + ' BPM' : 'FREE · ms';
      clockLabel.title = T('timingHint', 'SYNC: 1/128 a 1/1, T = tercina, D = pontuada. SMOOTH também tem OFF. FREE mantém milissegundos.');
    };
    refreshClock();
    controlRefreshers.push(refreshClock);
    windowControl.append(clockLabel);
    host.prepend(windowControl);
  }

  function refreshTiming() {
    // Tempo automation changes labels, not the nodes under a user's pointer.
    if (renderedSyncMode !== controller?.clock?.().syncMode) renderControls();
    else controlRefreshers.forEach((refresh) => refresh());
  }

  function connectControls(api) {
    controller = api;
    renderControls();
    global.RcSurfaceI18n?.subscribe(renderControls);
  }

  function connectGraph(timeline) {
    const host = document.getElementById('audio-graph-views');
    const legend = document.getElementById('audio-graph-legend');
    if (!host || !legend || !timeline) return;
    const buttons = views.map((view) => {
      const button = element('button', '');
      button.type = 'button';
      button.dataset.audioView = view;
      button.setAttribute('aria-controls', 'audio-timeline');
      button.addEventListener('click', () => { timeline.setView(view); sync(); });
      host.append(button);
      return button;
    });
    const sync = () => {
      buttons.forEach((button, index) => {
        button.textContent = T(views[index], views[index]);
        button.setAttribute('aria-pressed', String(views[index] === timeline.view));
      });
      if (activeView !== timeline.view) {
        activeView = timeline.view;
        renderControls();
      }
      legend.replaceChildren();
      for (const entry of timeline.getSeries()) {
        const button = element('button', '', T(entry.field, entry.label));
        button.type = 'button';
        button.dataset.audioSeries = entry.field;
        button.style.setProperty('--descriptor-color', entry.color);
        button.setAttribute('aria-pressed', String(entry.enabled));
        button.addEventListener('click', () => {
          const enabled = button.getAttribute('aria-pressed') !== 'true';
          timeline.setSeries(entry.field, enabled);
          button.setAttribute('aria-pressed', String(enabled));
        });
        legend.append(button);
      }
    };
    global.RcSurfaceI18n?.subscribe(sync);
    sync();
  }
  global.AudioWorkspace = Object.freeze({ create, connectGraph, connectControls, renderControls, refreshTiming });
})(typeof window !== 'undefined' ? window : globalThis);
