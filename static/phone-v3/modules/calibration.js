// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (root) {
  'use strict';
  const core = root.CalibrationCore;
  const adapters = {};
  const states = Object.fromEntries(['sensors', 'audio', 'video'].map(page => [page, { phase: 'idle' }]));
  let job = null, timer = null, revision = 0;
  const cameraBusy = new WeakSet();
  const button = document.getElementById('btn-calibrate-sensors-header');
  const strip = document.getElementById('calibration-strip');
  const message = document.getElementById('calibration-message');
  const resetButton = document.getElementById('calibration-reset');
  const closeButton = document.getElementById('calibration-close');
  const now = () => performance.now();
  const t = key => root.RcSurfaceI18n?.t('cal.' + key) || key;
  const pageNow = () => document.body.dataset.page;

  function render() {
    if (!button || !strip) return;
    const page = pageNow(), s = states[page];
    button.hidden = !s;
    strip.hidden = !s || s.dismissed || (s.phase === 'idle' && !s.error);
    if (!s) return;
    const busy = s.phase === 'running';
    button.dataset.calibration = s.phase;
    button.textContent = busy ? t('cancel') : s.phase === 'done' ? t('done') : t('action');
    button.setAttribute('aria-busy', String(busy));
    button.title = t(page) + ': ' + (busy ? t('collecting') : s.phase === 'done' ? t('done') : t('idle'))
      + ' · ' + t('guide.' + page);
    message.textContent = t(page) + ' · ' + (s.error ? t(s.error)
      : busy ? t('guide.' + page) + ' ' + Math.floor((s.progress || 0) * 100) + '%'
        : s.phase === 'done' ? t(page === 'video' ? (s.cameraChanged ? 'videoAdjusted' : 'videoChecked') : 'success.' + page)
          : t('idle') + ' · ' + t('guide.' + page));
    resetButton.hidden = s.phase !== 'done';
    resetButton.textContent = t('reset');
    closeButton.setAttribute('aria-label', t('close'));
    for (const tab of document.querySelectorAll('.tab[data-page]')) {
      const state = states[tab.dataset.page];
      if (state) tab.title = t(tab.dataset.page) + ': ' + t(state.phase === 'done' ? 'done' : state.phase === 'running' ? 'collecting' : 'idle');
    }
  }

  async function restoreCamera(restore, page, source) {
    if (!restore) return;
    const targetState = states[page];
    cameraBusy.add(source);
    try { await restore(); } catch {
      if (states[page] === targetState) targetState.error = 'cameraRestore';
    }
    finally { cameraBusy.delete(source); render(); }
  }

  function cancel(error = 'cancelled') {
    revision++;
    if (!job) return;
    const old = job;
    job = null;
    clearInterval(timer);
    timer = null;
    states[old.page] = { phase: 'idle', error };
    // An in-flight preparation observes the job identity before taking ownership.
    if (old.camera) void restoreCamera(old.camera.restore, old.page, old.source);
    render();
  }

  function reset(page) {
    if (job?.page === page) cancel();
    const previous = states[page];
    if (!previous) return;
    states[page] = { phase: 'idle' };
    adapters[page]?.reset?.();
    if (previous.restore) void restoreCamera(previous.restore, page, previous.source);
    render();
  }

  async function start(page = pageNow()) {
    if (!states[page]) return;
    if (job) { cancel(); return; }
    const request = ++revision;
    const adapter = adapters[page];
    const source = adapter?.source();
    if (!source) {
      // Short, honest reason: neutral on desktops without readings,
      // permission text only when a permission is actually required.
      states[page].error = typeof adapter?.noSourceReason === 'function'
        ? adapter.noSourceReason()
        : ('enable.' + page);
      render();
      return;
    }
    if (page === 'video' && cameraBusy.has(source)) { states[page].error = 'cameraBusy'; render(); return; }
    // Recalibration replaces this page only; never touch another input's state.
    if (states[page].restore) {
      const restore = states[page].restore;
      states[page] = { phase: 'idle' };
      await restoreCamera(restore, page, source);
      if (request !== revision || pageNow() !== page || adapter.source() !== source || states[page].error) return;
    }
    adapter.reset?.();
    states[page] = { phase: 'running', progress: 0 };
    const owned = job = { page, source, collector: core.createCollector(page), start: now(), last: now(), ready: page !== 'video' };
    timer = setInterval(() => {
      if (job !== owned) return;
      if (adapter.source() !== source) { cancel('sourceLost'); return; }
      if (now() - owned.start > owned.collector.duration + 3000
        || (owned.ready && now() - owned.last > 1200)) { cancel('readings'); return; }
      render();
    }, 100);
    render();
    if (page === 'video') {
      cameraBusy.add(source);
      try {
        const camera = await core.prepareCamera(source);
        if (job !== owned || adapter.source() !== source) {
          await camera.restore();
          return;
        }
        owned.camera = camera;
        owned.ready = true;
        owned.start = owned.last = now();
      } catch {
        if (job === owned) cancel('cameraRestore');
      } finally { cameraBusy.delete(source); }
    }
  }

  function feed(page, sample, timestamp = now()) {
    if (!job || job.page !== page || !job.ready) return;
    const owned = job;
    if (adapters[page].source() !== owned.source) { cancel('sourceLost'); return; }
    const result = owned.collector.add(sample, timestamp);
    owned.last = timestamp;
    if (!result.done) { states[page].progress = result.progress; return; }
    if (!result.ok) { cancel(result.error); return; }
    try { adapters[page].apply(result.value); } catch { cancel('applyFailed'); return; }
    job = null;
    clearInterval(timer);
    timer = null;
    states[page] = { phase: 'done', cameraChanged: !!owned.camera?.changed, restore: owned.camera?.restore, source: owned.source };
    render();
  }

  const api = root.PageCalibration = {
    register(page, adapter) { adapters[page] = adapter; },
    start, feed, reset,
    invalidate: reset,
    isCollecting: page => job?.page === page && job.ready,
  };
  button?.addEventListener('click', () => { void start(); });
  resetButton?.addEventListener('click', () => reset(pageNow()));
  closeButton?.addEventListener('click', () => {
    cancel();
    if (states[pageNow()]) states[pageNow()].dismissed = true;
    render();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !strip?.hidden) closeButton?.click();
  });
  root.addEventListener('ableton-rc:page-change', () => { cancel(); render(); });
  document.addEventListener('rcsurface:languagechange', render);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  root.addEventListener('pagehide', () => { for (const page of Object.keys(states)) api.invalidate(page); });
  root.addEventListener('orientationchange', () => api.invalidate('sensors'));
  render();
})(window);
