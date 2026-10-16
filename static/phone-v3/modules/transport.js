// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// modules/transport.js — Transport UI controls (play/stop/locators/OSC status)
// Extracted from controls.js bootstrapControls → setupTransportLiteUI().
// Exposes window.RCSurface.setupTransport() called by controls.js.

(function () {
  'use strict';
  const T = (k, fallback) => (typeof window !== 'undefined' && window.RcSurfaceI18n)
    ? window.RcSurfaceI18n.t(k) : (fallback ?? k);

  window.RCSurface = window.RCSurface || {};

  // Song.clip_trigger_quantization values 0..13, same order as the host's
  // SONG_QUANTIZATION_LABELS and the MAP Launch Clip editor.
  const QUANT_LABELS = ['None', '8 Bars', '4 Bars', '2 Bars', '1 Bar', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32'];
  const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, key) => (params[key] ?? ''));
  const tp = (key, fallback, params = {}) => {
    const value = window.RcSurfaceI18n?.t(key, params);
    return fill(value && value !== key ? value : fallback, params);
  };
  function quantizationLabel(value) {
    if (value === 0) return tp('lc.quantNone', 'None');
    if (value === 4) return tp('lc.quantOneBar', '1 Bar');
    if (value >= 1 && value <= 3) return tp('lc.quantBars', '{n} Bars', { n: [0, 8, 4, 2][value] });
    return QUANT_LABELS[value] || tp('lc.quantUnknown', 'Waiting for Live');
  }

  /**
   * TRN settings: Live's global quantization and the metronome. Both are
   * native Set state; this panel keeps no local copy. Values shown are the
   * last ones Live confirmed (getClipLaunchStatus / getRecordingState), a
   * write is one explicit command whose result is read back, and nothing is
   * replayed after a reconnect. REC CLICK drives the same metronome.
   */
  function setupTransportSettings(overlay) {
    const panel = document.getElementById('trn-settings');
    const select = document.getElementById('trn-quantization');
    const quantStatus = document.getElementById('trn-quantization-status');
    const click = document.getElementById('trn-metronome');
    const clickStatus = document.getElementById('trn-metronome-status');
    if (!panel || !select || !click) return;
    let connected = false, quant = null, quantBusy = false, quantError = '', metronome = null, clickBusy = false, clickError = '';
    let timer = null, epoch = 0;
    const writable = () => connected && ['controller', 'admin'].includes(window.state?.role);
    const send = (cmd, args, cb) => (typeof window.sendPhoneCommand === 'function' ? window.sendPhoneCommand(cmd, args, cb) : false);

    function renderOptions() {
      const current = select.value;
      select.replaceChildren();
      const unknown = document.createElement('option');
      unknown.value = ''; unknown.disabled = true;
      unknown.textContent = tp('lc.quantUnknown', 'Waiting for Live');
      select.appendChild(unknown);
      QUANT_LABELS.forEach((_, value) => {
        const option = document.createElement('option');
        option.value = String(value); option.textContent = quantizationLabel(value);
        select.appendChild(option);
      });
      select.value = current;
    }
    function render() {
      const linked = Boolean(quant?.available && quant?.connected);
      const confirmed = Number.isInteger(quant?.value) && quant.value >= 0 && quant.value <= 13;
      const pending = quantBusy || Boolean(quant?.pending);
      if (!pending) select.value = linked && confirmed ? String(quant.value) : '';
      select.disabled = !writable() || !linked || pending;
      const label = confirmed ? quantizationLabel(quant.value) : tp('lc.quantUnknown', 'Waiting for Live');
      if (quantStatus) {
        quantStatus.dataset.state = !linked || quantError ? 'error' : pending ? 'pending' : confirmed ? 'confirmed' : 'waiting';
        // The selector itself shows the confirmed value or "Waiting for Live";
        // this line only speaks when something needs attention.
        quantStatus.textContent = !connected ? ''
          : !linked ? tp('lc.quantOffline', 'Connect AbletonOSC to change the Set global quantization.')
          : quantError ? tp('lc.quantError', 'Could not change global quantization: {error}', { error: quantError })
          : pending ? tp('lc.quantPending', 'Waiting for Live… Current: {label}', { label }) : '';
      }
      const known = typeof metronome === 'boolean';
      click.disabled = !writable() || !known || clickBusy;
      click.setAttribute('aria-pressed', known ? String(metronome) : 'mixed');
      click.textContent = tp('rec.click', 'CLICK') + ' · ' + (known ? tp(metronome ? 'rec.on' : 'rec.off', metronome ? 'ON' : 'OFF') : '?');
      if (clickStatus) {
        clickStatus.textContent = clickError ? tp('trn.metronomeError', 'Live did not confirm the metronome: {error}', { error: clickError })
          : !connected ? ''
          : !writable() ? tp('trn.viewer', 'Viewer: read only') : '';
      }
    }
    function acceptRecording(result) {
      const field = result?.transport?.metronome;
      metronome = result?.transport?.connected && field?.fresh && typeof field.value === 'boolean' ? field.value : null;
    }
    function refresh() {
      if (!connected) { render(); return; }
      const current = epoch;
      send('getClipLaunchStatus', {}, (response) => {
        if (current !== epoch) return;
        quant = response?.ok ? response.result?.globalQuantization || null : null;
        render();
      });
      send('getRecordingState', {}, (response) => {
        if (current !== epoch) return;
        if (response?.ok) acceptRecording(response.result); else metronome = null;
        render();
      });
    }
    const open = () => !panel.hidden && overlay && !overlay.classList.contains('hidden') && !document.hidden;
    function schedule() {
      clearTimeout(timer); timer = null;
      if (!open()) return;
      refresh();
      timer = setTimeout(schedule, 1000);
    }
    document.getElementById('btn-trn-mode')?.addEventListener('click', () => setTimeout(schedule, 0));
    select.addEventListener('change', () => {
      const value = Number(select.value);
      if (select.disabled || !Number.isInteger(value) || value < 0 || value > 13) return;
      quantBusy = true; quantError = ''; render();
      const current = epoch;
      const sent = send('setGlobalClipQuantization', { quantization: value }, (response) => {
        if (current !== epoch) return;
        quantBusy = false;
        if (!response?.ok) quantError = response?.error || 'No Live confirmation';
        refresh();
      });
      if (!sent) { quantBusy = false; quantError = 'Not connected'; render(); }
    });
    click.addEventListener('click', () => {
      if (click.disabled || typeof metronome !== 'boolean') return;
      clickBusy = true; clickError = ''; render();
      const current = epoch;
      const sent = send('recordingClick', { enabled: !metronome }, (response) => {
        if (current !== epoch) return;
        clickBusy = false;
        if (response?.ok) acceptRecording(response.result);
        else { clickError = response?.error || 'No Live confirmation'; metronome = null; }
        render();
        refresh();
      });
      if (!sent) { clickBusy = false; clickError = 'Not connected'; render(); }
    });
    window.addEventListener('ableton-rc:phone-client-id', () => { epoch++; connected = true; quantBusy = false; clickBusy = false; schedule(); render(); });
    window.addEventListener('ableton-rc:phone-ws-close', () => {
      // A dropped socket retires pending callbacks and every observed value.
      epoch++; connected = false; quant = null; metronome = null; quantBusy = false; clickBusy = false;
      clearTimeout(timer); timer = null; render();
    });
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('rcsurface:languagechange', () => { renderOptions(); render(); });
    if (window.RCSurface.getPhoneSession?.()) connected = true;
    renderOptions(); render();
  }

  /**
   * setupTransport — Wire up the transport overlay (play, stop, prev/next
   * locator, locator search) and the header transport buttons.
   * Exposes:
   *   window.updateHeaderPlayState(isPlaying)
   *   window.updateOscStatus(available, connected)
   *   window.updateTransportLocators(locators)
   *   window.triggerMetronomePulse(beat)
   */
  window.RCSurface.setupTransport = function setupTransport() {
    const btnTrnMode   = document.getElementById('btn-trn-mode');
    const overlay      = document.getElementById('transport-lite-overlay');
    const btnTrnClose  = document.getElementById('btn-trn-close');
    const btnPlay      = document.getElementById('btn-trn-play');
    const btnStop      = document.getElementById('btn-trn-stop');
    const btnPrev      = document.getElementById('btn-trn-prev');
    const btnNext      = document.getElementById('btn-trn-next');
    const btnRefresh   = document.getElementById('btn-trn-refresh');
    const searchInput  = document.getElementById('locator-search');
    const locatorList  = document.getElementById('locator-list');
    const statusEl     = document.getElementById('osc-status');

    let allLocators = [];

    if (btnTrnMode && overlay) {
      btnTrnMode.addEventListener('click', () => {
        overlay.classList.remove('hidden');
        if (window.sendPhoneCommand) {
          window.sendPhoneCommand('refreshTransportLocators');
          window.sendPhoneCommand('getTransportLiteState', {}, (res) => {
            if (res && res.ok !== false) {
              const state = res.result || res;
              if (state.locators) window.updateTransportLocators(state.locators);
              window.updateOscStatus(state.available, state.connected);
            }
          });
        }
      });
    }

    if (overlay && btnTrnClose) {
      btnTrnClose.addEventListener('click', () => {
        overlay.classList.add('hidden');
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    }

    const sendCmd = (cmd, args = {}) => {
      if (window.sendPhoneCommand) {
        window.sendPhoneCommand(cmd, args);
      }
    };

    if (btnPlay)    btnPlay.addEventListener('click',    () => sendCmd('transportPlay'));
    if (btnStop)    btnStop.addEventListener('click',    () => sendCmd('transportStop'));
    if (btnPrev)    btnPrev.addEventListener('click',    () => sendCmd('transportPrevLocator'));
    if (btnNext)    btnNext.addEventListener('click',    () => sendCmd('transportNextLocator'));
    if (btnRefresh) btnRefresh.addEventListener('click', () => sendCmd('refreshTransportLocators'));

    const headerPlay = document.getElementById('btn-header-play');
    const headerPrev = document.getElementById('btn-header-prev');
    const headerNext = document.getElementById('btn-header-next');
    if (headerPlay) headerPlay.addEventListener('click', () => sendCmd('transportToggle'));
    if (headerPrev) headerPrev.addEventListener('click', () => sendCmd('transportPrevLocator'));
    if (headerNext) headerNext.addEventListener('click', () => sendCmd('transportNextLocator'));

    window.updateHeaderPlayState = (isPlaying) => {
      if (headerPlay) {
        const playing = Boolean(isPlaying);
        headerPlay.classList.toggle('is-playing', playing);
        headerPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
        headerPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderLocators();
      });
    }

    setupTransportSettings(overlay);

    window.updateOscStatus = (available, connected) => {
      if (!statusEl) return;
      const indicator = document.getElementById('osc-indicator');
      if (indicator) {
        if (connected) {
          indicator.hidden = true;
        } else if (available) {
          indicator.hidden = false;
          indicator.textContent = T('js.oscSdk', 'OSC: SDK');
          indicator.className = 'osc-indicator osc-indicator-sdk';
        } else {
          indicator.hidden = false;
          indicator.textContent = T('js.oscOff', 'OSC: OFF');
          indicator.className = 'osc-indicator osc-indicator-free';
        }
      }
      if (connected) {
        statusEl.textContent = T('js.synced', 'SYNCED');
        statusEl.className = 'osc-status synced';
      } else if (available) {
        statusEl.textContent = T('js.sdk', 'SDK');
        statusEl.className = 'osc-status sdk';
      } else {
        statusEl.textContent = T('js.free', 'FREE');
        statusEl.className = 'osc-status free';
      }
    };

    window.updateTransportLocators = (locators) => {
      if (!Array.isArray(locators)) return;
      allLocators = locators;
      renderLocators();
    };

    window.triggerMetronomePulse = (beat, beatInBar) => {
      if (!btnTrnMode) return;
      btnTrnMode.classList.remove('metronome-pulse-first', 'metronome-pulse-other');
      void btnTrnMode.offsetWidth;
      // The beat is an absolute count, so it is the position inside the bar
      // that says whether this is the downbeat. Older servers do not send it;
      // derive it from the signature rather than falling back to a fixed 1,
      // which only ever matched the second pulse of a take.
      const perBar = Number(window.currentNumerator) > 0 ? Number(window.currentNumerator) : 4;
      const posicao = Number.isFinite(beatInBar)
        ? beatInBar
        : ((Math.round(Number(beat)) % perBar) + perBar) % perBar;
      const isFirst = (posicao === 0);
      btnTrnMode.classList.add(isFirst ? 'metronome-pulse-first' : 'metronome-pulse-other');
    };

    function renderLocators() {
      if (!locatorList) return;
      locatorList.innerHTML = '';

      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const filtered = allLocators.filter((c) => c.name.toLowerCase().includes(query));

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = '#8e8e93';
        empty.style.fontSize = '12px';
        empty.style.padding = '12px';
        empty.style.textAlign = 'center';
        empty.textContent = T('js.noLocators', 'No locators found');
        locatorList.appendChild(empty);
        return;
      }

      filtered.forEach((loc) => {
        const item = document.createElement('div');
        item.className = 'locator-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'locator-name';
        nameSpan.textContent = loc.name;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'locator-time';
        timeSpan.textContent = `beat ${loc.time.toFixed(1)}`;

        item.appendChild(nameSpan);
        item.appendChild(timeSpan);

        item.addEventListener('click', () => {
          sendCmd('transportJumpToLocator', { indexOrName: loc.name });
          overlay.classList.add('hidden');
        });

        locatorList.appendChild(item);
      });
    }
  };
})();
