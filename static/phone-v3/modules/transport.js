// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// modules/transport.js — Transport UI controls (play/stop/locators/OSC status)
// Extracted from controls.js bootstrapControls → setupTransportLiteUI().
// Exposes window.RCSurface.setupTransport() called by controls.js.

(function () {
  'use strict';
  const T = (k, fallback) => (typeof window !== 'undefined' && window.RcSurfaceI18n)
    ? window.RcSurfaceI18n.t(k) : (fallback ?? k);

  window.RCSurface = window.RCSurface || {};

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
