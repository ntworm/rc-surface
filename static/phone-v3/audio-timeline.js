// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

(function (global) {
  'use strict';

  // How far the newest reading may be held out to the right edge.
  const HOLD_LIMIT_MS = 120;

  const COLORS = Object.freeze({
    background: '#101012',
    grid: '#29292e',
    rms: '#5ac8fa',
    envelope: '#30d158',
  });

  const STATE_LABELS = Object.freeze({
    off: 'AUDIO OFF',
    waiting: 'WAITING FOR SIGNAL',
    active: 'LIVE',
  });

  const clampUnit = (value) => Math.max(0, Math.min(1, value));

  class AudioSignalTimeline {
    constructor({ canvas, root, status, scale, windowMs = 2500 } = {}) {
      this.canvas = canvas || null;
      this.root = root || null;
      this.status = status || null;
      this.scaleLabel = scale || null;
      this.windowMs = Math.max(250, Number(windowMs) || 2500);
      this.history = [];
      this.descriptorHistory = [];
      this.view = 'amplitude';
      this.disabledSeries = new Set();
      this.mode = 'signal';
      this.state = 'off';
      this.frameId = null;
      this.destroyed = false;
      if (this.root?.dataset) this.root.dataset.mode = this.mode;
      this.setState('off');
    }

    setState(nextState) {
      if (this.destroyed) return;
      const state = Object.hasOwn(STATE_LABELS, nextState) ? nextState : 'waiting';
      const unchanged = this.state === state;
      this.state = state;
      if (this.root?.dataset) this.root.dataset.state = state;
      if (this.status) this.status.textContent = STATE_LABELS[state];
      if (state === 'off') {
        this.history.length = 0;
        this.descriptorHistory.length = 0;
      }
      if (!unchanged || state === 'off') this._schedulePaint();
    }

    _announceScale(visualMax) {
      const text = visualMax.toFixed(2);
      if (this.root?.dataset) this.root.dataset.scale = text;
      if (this.scaleLabel) this.scaleLabel.textContent = '0–' + text;
    }

    setView(view) {
      if (this.destroyed) return;
      this.view = ['amplitude', 'attacks', 'tone', 'texture', 'bands', 'all'].includes(view) ? view : 'amplitude';
      if (this.root?.dataset) this.root.dataset.view = this.view;
      this._schedulePaint();
    }

    getSeries() {
      const amplitude = [
        { field: 'rms', label: 'RMS', color: COLORS.rms },
        { field: 'envelope', label: 'ENV', color: COLORS.envelope },
      ];
      // One card group per view, plus the combined view that keeps all twelve
      // curves in a single window with per-name legend toggles.
      const series = this.view === 'amplitude' ? amplitude : (global.AudioDescriptorCatalog || []).filter((entry) =>
        this.view === 'all' || entry.group === this.view);
      return series.map((entry) => ({ ...entry, enabled: !this.disabledSeries.has(entry.field) }));
    }

    setSeries(field, enabled) {
      if (this.destroyed || !this.getSeries().some((entry) => entry.field === field)) return;
      if (enabled) this.disabledSeries.delete(field);
      else this.disabledSeries.add(field);
      this._schedulePaint();
    }

    pushDescriptors(data = {}) {
      if (this.destroyed) return;
      const timestamp = Number.isFinite(data.timestamp) ? data.timestamp : Date.now();
      const previous = this.descriptorHistory.at(-1);
      if (previous && timestamp < previous.timestamp) return;
      const sample = { timestamp };
      for (const { field } of global.AudioDescriptorCatalog || []) {
        sample[field] = Number.isFinite(data[field]) ? clampUnit(data[field]) : 0;
      }
      this.descriptorHistory.push(sample);
      while (this.descriptorHistory.length > 512 ||
        this.descriptorHistory[0].timestamp < timestamp - this.windowMs) this.descriptorHistory.shift();
      if (this.view !== 'amplitude') this.setState('active');
      this._schedulePaint();
    }

    push({ timestamp, rms, envelope } = {}) {
      if (this.destroyed || !Number.isFinite(rms) || !Number.isFinite(envelope)) return;
      const sampleAt = Number.isFinite(timestamp)
        ? timestamp
        : (global.performance?.now?.() ?? Date.now());
      const sample = {
        timestamp: sampleAt,
        rms: clampUnit(rms),
        envelope: clampUnit(envelope),
      };
      this.history.push(sample);
      const cutoff = sampleAt - this.windowMs;
      while (this.history.length && this.history[0].timestamp < cutoff) this.history.shift();
      if (this.view === 'amplitude') {
        this.state = 'active';
        if (this.root?.dataset) {
          this.root.dataset.state = 'active';
        }
        if (this.status) this.status.textContent = STATE_LABELS.active;
      }
      this._schedulePaint();
    }

    destroy() {
      if (this.frameId !== null) global.cancelAnimationFrame?.(this.frameId);
      this.frameId = null;
      this.destroyed = true;
      this.history.length = 0;
      this.descriptorHistory.length = 0;
    }

    _schedulePaint() {
      if (this.destroyed || this.frameId !== null || !global.requestAnimationFrame) return;
      this.frameId = global.requestAnimationFrame(() => {
        this.frameId = null;
        this._paint();
      });
    }

    /** Paints as if it were `nowMs`. The scheduler passes nothing and gets now. */
    paintAt(nowMs) {
      this._paintNow = Number.isFinite(nowMs) ? nowMs : null;
      this._paint();
      this._paintNow = null;
    }

    _paint() {
      const canvas = this.canvas;
      const ctx = canvas?.getContext?.('2d');
      if (!canvas || !ctx) return;

      const width = Math.max(1, canvas.clientWidth || canvas.width || 320);
      const height = Math.max(1, canvas.clientHeight || canvas.height || 100);
      const dpr = Math.max(1, Number(global.devicePixelRatio) || 1);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, width, height);

      const latest = this.history[this.history.length - 1];
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let division = 1; division < 4; division += 1) {
        const x = (width * division) / 4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      if (this.view !== 'amplitude') {
        const newest = this.descriptorHistory.at(-1)?.timestamp;
        if (newest === undefined) return;
        // A wide analysis window reports far less often than the screen
        // repaints. Anchor the right edge to the clock and hold the last
        // reading out to it, so the curve scrolls at screen rate and never
        // pretends to have measured something it did not.
        const painted = Number.isFinite(this._paintNow) ? this._paintNow : Date.now();
        // Bounded hold: the curve keeps moving between analysis frames, and a
        // stream that actually stopped freezes instead of scrolling away.
        const rightAt = Math.min(Math.max(newest, painted), newest + HOLD_LIMIT_MS);
        const shown = this.getSeries().filter((entry) => entry.enabled);
        // Quiet descriptors would otherwise crawl along the bottom of a fixed
        // 0..1 axis. Scale to what is on screen and publish the ceiling.
        let loudest = 0;
        for (const sample of this.descriptorHistory) {
          for (const entry of shown) loudest = Math.max(loudest, sample[entry.field]);
        }
        const visualMax = Math.max(0.05, Math.min(1, loudest * 1.12));
        this._announceScale(visualMax);
        for (const entry of shown) {
          ctx.strokeStyle = entry.color;
          ctx.lineWidth = 2;
          // Descriptor curves stay continuous; identity is the labelled shade.
          ctx.beginPath();
          let lastY = 0;
          this.descriptorHistory.forEach((sample, index) => {
            const x = (sample.timestamp - rightAt + this.windowMs) / this.windowMs * width;
            lastY = height * (1 - Math.min(1, sample[entry.field] / visualMax));
            if (index === 0) ctx.moveTo(x, lastY);
            else ctx.lineTo(x, lastY);
          });
          if (rightAt > newest) ctx.lineTo(width, lastY);
          ctx.stroke();
        }
        // Keep the scroll going while capture is live: the analysis hop, not
        // the screen, decides how often a new value arrives.
        if (this.state === 'active') this._schedulePaint();
        return;
      }

      if (!latest) return;
      const peak = this.history.reduce(
        (max, sample) => Math.max(max, sample.rms, sample.envelope),
        0,
      );
      const visualMax = Math.max(0.05, peak * 1.18);
      this._announceScale(visualMax);
      const yFor = (value) => height - Math.min(height, (value / visualMax) * height);
      const rightAt = latest.timestamp;
      const leftAt = rightAt - this.windowMs;
      const xFor = (timestamp) => ((timestamp - leftAt) / this.windowMs) * width;

      const drawSeries = (key, color) => {
        if (this.disabledSeries.has(key)) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.history.forEach((sample, index) => {
          const x = xFor(sample.timestamp);
          const y = yFor(sample[key]);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };
      drawSeries('rms', COLORS.rms);
      drawSeries('envelope', COLORS.envelope);
    }

  }

  global.AudioSignalTimeline = AudioSignalTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
