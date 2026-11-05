// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
(function (root) {
  'use strict';

  function hasWriteAuthority(view) {
    if (!view || !view.connected) return false;
    return view.role === 'controller' || view.role === 'admin';
  }

  function isFreshBoolean(field) {
    return Boolean(field && field.fresh === true && typeof field.value === 'boolean');
  }

  function hasLiveTransport(transport) {
    return Boolean(
      transport &&
      transport.connected === true &&
      isFreshBoolean(transport.isPlaying) &&
      isFreshBoolean(transport.recordMode)
    );
  }

  function resolveScope(state, args) {
    const scope = state && typeof state.scope === 'string' ? state.scope : '';
    if (!scope) return { ok: false, error: 'REC:UNKNOWN' };
    if (args && args.scope !== undefined && args.scope !== scope) {
      return { ok: false, error: 'REC:SESSION' };
    }
    return { ok: true, scope };
  }

  function validateMarker(current, args) {
    if (!hasWriteAuthority(current)) return { ok: false, error: 'REC:SESSION' };
    if (!current.fresh || !hasLiveTransport(current.state && current.state.transport)) {
      return { ok: false, error: 'REC:UNKNOWN' };
    }
    return resolveScope(current.state, args);
  }

  function canAddMarker(view) {
    if (!view || view.markerBusy) return false;
    return validateMarker(view).ok;
  }

  function isCoherent(nowView, expectedEpoch, expectedScope) {
    if (!hasWriteAuthority(nowView)) return false;
    if (nowView.connectionEpoch !== expectedEpoch) return false;
    return Boolean(nowView.state && nowView.state.scope === expectedScope);
  }

  function extractMarkerResult(response) {
    if (!response || !response.ok || !response.result) return null;
    return response.result.markerResult || null;
  }

  function extractError(response) {
    return response && typeof response.error === 'string' && response.error ? response.error : 'REC:UNKNOWN';
  }

  function markerStatusText(view, t) {
    if (view.markerBusy) return t('markerAdding');
    if (view.markerResult) {
      const key = view.markerResult.existing ? 'markerExisting' : 'markerObserved';
      return t(key, { name: view.markerResult.name });
    }
    return view.markerError ? t('checkMarkers') : '';
  }

  function renderMarker(view, statusEl, t) {
    if (!statusEl) return;
    statusEl.textContent = markerStatusText(view, t);
  }

  class MarkerRequests {
    constructor({ send, getView, notify = () => {}, timeoutMs = 12000 }) {
      this.send = send;
      this.getView = getView;
      this.notify = notify;
      this.timeoutMs = timeoutMs;
      this.markerBusy = false;
      this.markerResult = null;
      this.markerError = null;
      this.resultEpoch = 0;
      this.resultScope = null;
      this.active = null;
      this.disconnectedWhileBusy = false;
      this.readingView = false;
    }

    clearResult() {
      this.markerResult = null;
      this.resultEpoch = 0;
      this.resultScope = null;
    }

    retireActive(errorCode, rejectError) {
      const req = this.active;
      this.active = null;
      this.markerBusy = false;
      this.clearResult();
      this.markerError = errorCode;
      if (req) req.abort(rejectError);
    }

    readCurrentView() {
      if (this.readingView || !this.getView) return null;
      this.readingView = true;
      try {
        return this.getView();
      } finally {
        this.readingView = false;
      }
    }

    sync(current) {
      if (!current) return;
      if (this.active && !isCoherent(current, this.active.epoch, this.active.scope)) {
        this.retireActive('REC:SESSION', Error('REC:SESSION'));
      }
      if (this.markerResult && !isCoherent(current, this.resultEpoch, this.resultScope)) {
        this.clearResult();
      }
    }

    view(current) {
      this.sync(current || this.readCurrentView());
      return {
        markerBusy: this.markerBusy,
        markerResult: this.markerResult,
        markerError: this.markerError,
      };
    }

    cancel(_reason = 'cancelled') {
      if (this.active) {
        this.retireActive('REC:UNKNOWN', Error('REC:MARKER_CANCELED'));
        this.notify();
        return;
      }
      this.markerBusy = false;
      this.clearResult();
    }

    session(open, _nextRole) {
      this.clearResult();
      if (this.active) {
        this.disconnectedWhileBusy = !open;
        this.retireActive('REC:SESSION', Error('REC:SESSION'));
        return;
      }
      this.markerBusy = false;
      if (!this.disconnectedWhileBusy) this.markerError = null;
      if (open) this.disconnectedWhileBusy = false;
    }

    createMarker(args = {}) {
      const current = this.readCurrentView();
      if (this.markerBusy) return Promise.reject(Error('REC:BUSY'));
      this.clearResult();
      const validation = validateMarker(current, args);
      if (!validation.ok) {
        this.markerError = validation.error;
        this.notify();
        return Promise.reject(Error(validation.error));
      }
      return this.startRequest(current.connectionEpoch, validation.scope);
    }

    startRequest(expectedEpoch, expectedScope) {
      this.markerBusy = true;
      this.markerError = null;
      return new Promise((resolve, reject) => {
        const req = {
          epoch: expectedEpoch,
          scope: expectedScope,
          settled: false,
          timer: null,
          resolve,
          reject,
          abort: err => {
            if (req.settled) return;
            req.settled = true;
            clearTimeout(req.timer);
            req.reject(err || Error('REC:MARKER_CANCELED'));
          },
        };
        this.active = req;
        this.notify();
        req.timer = setTimeout(() => this.finishRequest(req, { ok: false, error: 'REC:UNKNOWN' }), this.timeoutMs);
        try {
          this.send('recordingCreateMarker', { scope: expectedScope }, res => this.finishRequest(req, res));
        } catch {
          this.finishRequest(req, { ok: false, error: 'REC:UNKNOWN' });
        }
      });
    }

    failRequest(req, message) {
      this.clearResult();
      this.markerError = message;
      this.notify();
      req.reject(Error(message));
    }

    finishRequest(req, response) {
      if (req.settled || this.active !== req) return;
      req.settled = true;
      clearTimeout(req.timer);
      this.active = null;
      this.markerBusy = false;

      if (!isCoherent(this.readCurrentView(), req.epoch, req.scope)) {
        this.failRequest(req, 'REC:SESSION');
        return;
      }
      const markerResult = extractMarkerResult(response);
      if (!markerResult) {
        this.failRequest(req, extractError(response));
        return;
      }
      this.markerResult = markerResult;
      this.resultEpoch = req.epoch;
      this.resultScope = req.scope;
      this.markerError = null;
      this.notify();
      req.resolve(markerResult);
    }
  }

  function createRequests(options) {
    const store = new MarkerRequests(options);
    return {
      view: current => store.view(current),
      cancel: reason => store.cancel(reason),
      session: (open, nextRole) => store.session(open, nextRole),
      createMarker: args => store.createMarker(args),
    };
  }

  root.RcRecordingRequests = Object.freeze({
    createRequests,
    validateMarker,
    canAddMarker,
    renderMarker,
  });
})(typeof window !== 'undefined' ? window : globalThis);
