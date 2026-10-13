// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  const pages = ['performance', 'mixer', 'snapshots', 'audio', 'video', 'sensors'];
  const supports = page => ['performance', 'audio', 'video', 'sensors'].includes(page);
  const resolvePage = (page, previous = 'performance') => pages.includes(page) ? page : previous;
  function policy(value, restored = false) {
    if (value == null) return {version: 1, mode: restored ? 'hold' : 'timeout', timeoutMs: 10000, legacy: restored};
    if (value.version !== 1 || !['hold','timeout','release'].includes(value.mode)
      || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 100 || value.timeoutMs > 30000
      || value.timeoutMs % 100 !== 0 || typeof value.legacy !== 'boolean'
      || (value.legacy && value.mode !== 'hold')) throw Error('Invalid vision loss policy');
    return {...value};
  }
  function setup({renderSync}) {
    const doc = root.document, gear = doc.getElementById('btn-sync-settings');
    const overlay = doc.getElementById('page-settings-overlay'), sync = doc.getElementById('sync-settings-overlay');
    if (!gear || !overlay || !sync) return;
    let page = resolvePage(doc.body.dataset.page), moved = [];
    const t = key => root.RcSurfaceI18n?.t('settings.' + key) || key;
    function close(focus = true) {
      const wasOpen = !overlay.classList.contains('hidden') || !sync.classList.contains('hidden');
      overlay.classList.add('hidden'); sync.classList.add('hidden');
      for (const [node, marker] of moved) { marker.replaceWith(node); }
      moved = [];
      if (focus && wasOpen && !gear.hidden) gear.focus();
    }
    function move(id, slot) {
      const node = doc.getElementById(id), dest = doc.getElementById(slot);
      if (!node || !dest) return;
      const marker = doc.createComment('settings return'); node.before(marker);
      moved.push([node, marker]); dest.appendChild(node);
    }
    function render() {
      page = resolvePage(doc.body.dataset.page, page);
      gear.hidden = !supports(page);
      gear.setAttribute('aria-label', t(page)); gear.title = t(page);
      doc.getElementById('page-settings-title').textContent = t(page);
      for (const name of ['audio','video','sensors']) doc.getElementById('page-settings-' + name).hidden = page !== name;
      const current = root.VisionSettings?.getPolicy?.() || policy();
      doc.getElementById('vision-loss-mode').value = current.mode;
      doc.getElementById('vision-loss-timeout').value = current.timeoutMs / 1000;
      doc.getElementById('vision-loss-timeout-row').hidden = current.mode !== 'timeout';
      doc.getElementById('vision-loss-legacy').hidden = !current.legacy;
      doc.getElementById('vision-engine-summary').textContent = root.VisionSettings?.summary?.() || '';
      doc.getElementById('settings-sensor-status').textContent = root.sensorSettingsSummary?.() || t('sensorUnavailable');
    }
    function open(syncOnly = false) {
      page = resolvePage(doc.body.dataset.page, page);
      if (!supports(page) || (syncOnly && page !== 'performance')) return;
      close(false); render();
      if (page === 'performance') { sync.classList.remove('hidden'); renderSync(); doc.getElementById('btn-sync-settings-close')?.focus(); }
      else {
        if (page === 'audio') {
          move('audio-input-device', 'settings-audio-input');
          move('audio-detector-controls', 'settings-audio-analysis');
        }
        overlay.classList.remove('hidden'); doc.getElementById('page-settings-close').focus();
      }
    }
    gear.addEventListener('click', () => open());
    doc.getElementById('page-settings-close').addEventListener('click', () => close());
    doc.getElementById('btn-sync-settings-close').addEventListener('click', () => close());
    for (const node of [overlay, sync]) node.addEventListener('click', event => { if (event.target === node) close(); });
    doc.addEventListener('keydown', event => {
      if (overlay.classList.contains('hidden') && sync.classList.contains('hidden')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const container = overlay.classList.contains('hidden') ? sync : overlay;
        const controls = [...container.querySelectorAll('button,select,input')].filter(node => !node.disabled && node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    root.addEventListener('ableton-rc:page-change', event => {
      const hadModalFocus = overlay.contains(doc.activeElement) || sync.contains(doc.activeElement);
      close(false); page = resolvePage(event.detail?.page, page); render();
      if (hadModalFocus) doc.querySelector(`.tabs .tab[data-page="${page}"]`)?.focus();
    });
    doc.addEventListener('rcsurface:languagechange', render);
    root.addEventListener('ableton-rc:vision-settings', render);
    for (const [target, source] of [['settings-vision-confidence','vision-confidence'], ['settings-vision-preset','vision-recognition-preset']]) {
      const copy = doc.getElementById(target), original = doc.getElementById(source);
      copy.addEventListener('change', () => { original.value = copy.value; original.dispatchEvent(new Event('change')); });
      original.addEventListener('change', () => { copy.value = original.value; });
      gear.addEventListener('click', () => { copy.value = original.value; });
    }
    for (const id of ['vision-loss-mode','vision-loss-timeout']) doc.getElementById(id).addEventListener('change', () => {
      const value = {version: 1, mode: doc.getElementById('vision-loss-mode').value,
        timeoutMs: Math.round(Number(doc.getElementById('vision-loss-timeout').value) * 1000), legacy: false};
      try { root.VisionSettings?.setPolicy(policy(value)); doc.getElementById('settings-error').textContent = ''; }
      catch { doc.getElementById('settings-error').textContent = t('invalid'); }
      render();
    });
    doc.getElementById('settings-enable-sensors').addEventListener('click', () => doc.getElementById('permission-activate')?.click());
    doc.getElementById('settings-calibrate-sensors').addEventListener('click', () => { close(); root.PageCalibration?.start('sensors'); });
    render();
    return {open, close, render};
  }
  root.RcPageSettings = Object.freeze({supports, resolvePage, policy, setup});
})(typeof window !== 'undefined' ? window : globalThis);
