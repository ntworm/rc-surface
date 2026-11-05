// Copyright Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source:https://github.com/ntworm/rc-surface
//
// Recording arrangement rows model.
//
// The model keeps a small local cache of native clip pages and waveform
// intervals for the ordinary tracks the caller reports as visible. It only
// reads through the frozen reads API, never writes, never polls and never
// mutates the coordinator view. The later DOM module owns visibility.
(function (root) {
  'use strict';

  const namespace = root.RcRecordingArrangement || (root.RcRecordingArrangement = {});

  const MAX_ROWS = 32;
  const MAX_WAVEFORMS = 16;
  const PAGE_SIZE = 64;
  const MAX_OFFSET = 4095;
  const MAX_INFLIGHT = 4;
  const MAX_PREVIEW_RANGE = 128;
  const CANCELLED = 'REC_CANCELLED';

  function copyRef(ref) {
    if (!ref) return { index: null, id: '', name: '' };
    const id = typeof ref.id === 'string' ? ref.id : String(ref.id);
    return { index: ref.index, id, name: ref.name };
  }

  function copyClip(clip) {
    return Object.assign({}, clip);
  }

  const identityOf = (ref) => [ref.index, ref.id, ref.name].map((part) => String(part)).join('|');

  function worldOf(view) {
    if (!view) return '';
    const state = view.state || {};
    return [view.connectionEpoch, state.scope, view.role].map((part) => String(part)).join('|');
  }

  function stopped(observation) {
    if (!observation || observation.fresh !== true) return false;
    return observation.value === false;
  }

  function previewAllowed(view) {
    if (!view || view.connected !== true || view.fresh !== true) return false;
    const state = view.state || {};
    if (state.attemptActive) return false;
    const transport = state.transport || {};
    if (transport.connected === false) return false;
    return stopped(transport.isPlaying) && stopped(transport.recordMode);
  }

  function currentClip(row, clip) {
    if (!clip) return null;
    for (const item of row.clips) {
      if (item && String(item.id) === String(clip.id) && item.index === clip.index) return item;
    }
    return null;
  }

  function previewRange(clip, startTime, endTime) {
    const start = Number(startTime);
    const end = Number(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end < start) return null;
    if (end - start > MAX_PREVIEW_RANGE) return null;
    const clipStart = Number(clip.startTime);
    const clipEnd = Number(clip.endTime);
    if (!Number.isFinite(clipStart) || !Number.isFinite(clipEnd)) return null;
    if (start < clipStart || end > clipEnd) return null;
    return { start, end };
  }

  // A preview belongs to the whole clip: a renamed or moved clip is another.
  function clipIdentity(clip) {
    return [clip.name, clip.startTime, clip.endTime].map((part) => String(part)).join('|');
  }

  function waveformKey(row, clip, range) {
    const track = row.track;
    return [row.world, track.index, track.id, track.name, clip.index, clip.id,
      clip.name, clip.startTime, clip.endTime, range.start, range.end].join('|');
  }

  function intervalOf(entry) {
    return entry ? { startTime: entry.startTime, endTime: entry.endTime, peaks: entry.peaks.slice() } : null;
  }

  function rowSnapshot(row, ref) {
    if (!row) return { track: copyRef(ref), clips: [], page: null, status: 'idle', error: null, waveformBusy: false };
    return {
      track: copyRef(row.track),
      clips: row.clips.map(copyClip),
      page: row.page ? { offset: row.page.offset, next: row.page.next } : null,
      status: row.status,
      error: row.error ? { code: row.error.code, message: row.error.message } : null,
      waveformBusy: row.waveformBusy
    };
  }

  function waveformEntry(key, row, clip, result) {
    if (!result || !Array.isArray(result.peaks)) return null;
    const start = Number(result.startTime);
    const end = Number(result.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return {
      key, world: row.world, trackKey: row.key, clipIndex: clip.index,
      clipId: String(clip.id), clipIdentity: clipIdentity(clip),
      startTime: start, endTime: end,
      peaks: result.peaks.slice()
    };
  }

  function ignoreError(fn) {
    try {
      fn();
    } catch {
      // A failing listener or backend call must not break the local state.
    }
  }

  class RowsModel {
    constructor(options) {
      const config = options || {};
      this.reads = config.reads;
      this.getView = typeof config.getView === 'function' ? config.getView : () => null;
      this.onChange = typeof config.onChange === 'function' ? config.onChange : () => {};
      const max = config.maxAutomatic;
      this.maxAutomatic = typeof max === 'number' && max >= 0 ? Math.floor(max) : 8;
      this.rows = new Map();
      this.waveforms = new Map();
      this.autoAttempted = new Set();
      this.world = '';
      this.autoBudget = this.maxAutomatic;
      this.inflight = 0;
      this.wasActive = false;
    }

    notify() {
      ignoreError(() => this.onChange());
    }

    isCurrent(row, generation, identity) {
      return this.rows.get(row.key) === row && row.generation === generation && row.identity === identity;
    }

    touch(row) {
      this.rows.delete(row.key);
      this.rows.set(row.key, row);
    }

    dropWaveforms(trackKey) {
      for (const [key, entry] of this.waveforms) {
        if (entry.trackKey === trackKey) this.waveforms.delete(key);
      }
    }

    enforceRowLimit() {
      while (this.rows.size > MAX_ROWS) {
        const victim = this.evictable();
        if (!victim) return;
        this.rows.delete(victim.key);
        this.dropWaveforms(victim.key);
      }
    }

    // A row that is still reading or previewing keeps its place.
    evictable() {
      return [...this.rows.values()].find((row) => !row.pending && !row.waveformBusy) || null;
    }
    trimWaveforms() {
      while (this.waveforms.size > MAX_WAVEFORMS) {
        const oldest = this.waveforms.keys().next();
        if (oldest.done) return;
        this.waveforms.delete(oldest.value);
      }
    }

    ensureRow(ref) {
      if (!ref || ref.id === undefined || ref.id === null) return null;
      const key = this.world + '::' + String(ref.id);
      const identity = identityOf(ref);
      let row = this.rows.get(key);
      if (!row) {
        // The cache is bounded even when every row is busy: a row that does
        // not fit is refused, never admitted above the cap.
        if (this.rows.size >= MAX_ROWS && !this.evictable()) return null;        row = {
          key, world: this.world, track: copyRef(ref), identity,
          generation: 0, pendingToken: 0,
          status: 'idle', error: null, clips: [], page: null,
          pending: null, waveformBusy: false
        };
        this.rows.set(key, row);
        this.enforceRowLimit();
        return row;
      }
      if (row.identity !== identity) this.retireRow(row, ref, identity);
      this.touch(row);
      return row;
    }

    retireRow(row, ref, identity) {
      row.generation += 1;
      row.pending = null;
      row.status = 'idle';
      row.error = null;
      row.clips = [];
      row.page = null;
      row.waveformBusy = false;
      row.track = copyRef(ref);
      row.identity = identity;
      this.dropWaveforms(row.key);
    }

    findRow(ref) {
      if (!ref || ref.id === undefined || ref.id === null) return null;
      const row = this.rows.get(this.world + '::' + String(ref.id));
      if (!row || row.identity !== identityOf(ref)) return null;
      this.touch(row);
      return row;
    }

    startCatalogRead(row, offset) {
      const generation = row.generation;
      const identity = row.identity;
      row.status = 'loading';
      row.error = null;
      this.inflight += 1;
      row.pendingToken += 1;
      const token = row.pendingToken;
      let promise;
      try {
        promise = Promise.resolve(this.reads.readArrangement(copyRef(row.track), offset));
      } catch (err) {
        promise = Promise.reject(err);
      }
      const settle = (handler) => (value) => {
        this.releaseSlot();
        if (row.pendingToken === token) row.pending = null;
        return handler(value);
      };
      const settled = promise.then(
        settle((result) => this.applyCatalog(row, generation, identity, result)),
        settle((err) => this.applyCatalogError(row, generation, identity, err))
      );
      row.pending = settled;
      return settled;
    }

    releaseSlot() {
      this.inflight = Math.max(0, this.inflight - 1);
    }

    applyCatalog(row, generation, identity, result) {
      if (!this.isCurrent(row, generation, identity)) return null;
      if (!result || !Array.isArray(result.clips) || !result.page) {
        row.status = 'error';
        row.error = { code: 'REC_INVALID', message: 'invalid arrangement page' };
        this.notify();
        return null;
      }
      if (result.track && String(result.track.id) !== String(row.track.id)) return null;
      row.clips = result.clips.map(copyClip);
      row.page = { offset: result.page.offset, next: result.page.next === undefined ? null : result.page.next };
      row.status = row.clips.length ? 'ready' : 'empty';
      row.error = null;
      this.notify();
      return rowSnapshot(row);
    }

    applyCatalogError(row, generation, identity, err) {
      if (!this.isCurrent(row, generation, identity)) return null;
      const code = (err && err.code) || 'REC_ERROR';
      if (code === CANCELLED) {
        row.status = row.page ? (row.clips.length ? 'ready' : 'empty') : 'idle';
        row.error = null;
        return null;
      }
      row.status = 'error';
      row.error = { code, message: (err && err.message) || String(err) };
      this.notify();
      return null;
    }

    resetWorld(world) {
      this.rows.forEach((row) => {
        row.generation += 1;
        row.pending = null;
      });
      this.rows.clear();
      this.waveforms.clear();
      this.world = world;
      this.inflight = 0;
      this.wasActive = false;
      this.startEntry();
    }

    startEntry() {
      this.autoBudget = this.maxAutomatic;
      this.autoAttempted.clear();
    }

    update(view, visibleTracks, active) {
      const world = worldOf(view);
      if (world !== this.world) this.resetWorld(world);
      const list = Array.isArray(visibleTracks) ? visibleTracks : [];
      list.forEach((ref) => { this.ensureRow(ref); });
      const isActive = Boolean(active);
      if (isActive !== this.wasActive) {
        if (isActive) this.startEntry();
        this.wasActive = isActive;
      }
      if (!isActive) return;
      this.autoLoadVisible(view, list);
    }

    autoLoadVisible(view, list) {
      if (!view || view.connected === false) return;
      for (const ref of list) {
        if (this.autoBudget <= 0) return;
        if (this.inflight >= MAX_INFLIGHT) return;
        this.autoLoadTrack(ref);
      }
    }

    autoLoadTrack(ref) {
      if (!ref || ref.id === undefined || ref.id === null) return;
      const id = String(ref.id);
      if (this.autoAttempted.has(id)) return;
      const row = this.ensureRow(ref);
      if (!row) return;
      this.autoAttempted.add(id);
      if (row.pending) return;
      if (row.status === 'ready' || row.status === 'empty') return;
      this.autoBudget -= 1;
      this.startCatalogRead(row, 0);
    }

    row(ref) {
      return rowSnapshot(this.findRow(ref), ref);
    }

    load(ref) {
      const row = this.ensureRow(ref);
      if (!row) return Promise.resolve(null);
      if (row.pending) return row.pending;
      if (row.status === 'ready' || row.status === 'empty') return Promise.resolve(rowSnapshot(row));
      if (this.inflight >= MAX_INFLIGHT) return Promise.resolve(null);
      return this.startCatalogRead(row, 0);
    }

    refresh(ref) {
      const row = this.ensureRow(ref);
      if (!row) return Promise.resolve(null);
      if (row.pending) return row.pending;
      if (this.inflight >= MAX_INFLIGHT) return Promise.resolve(null);
      return this.startCatalogRead(row, 0);
    }

    more(ref) {
      const row = this.findRow(ref);
      if (!row || !row.page) return Promise.resolve(null);
      const next = Number(row.page.next);
      if (!Number.isFinite(next) || next <= row.page.offset || next > MAX_OFFSET) return Promise.resolve(null);
      if (row.pending) return row.pending;
      if (this.inflight >= MAX_INFLIGHT) return Promise.resolve(null);
      return this.startCatalogRead(row, next);
    }

    back(ref) {
      const row = this.findRow(ref);
      if (!row || !row.page) return Promise.resolve(null);
      const offset = Math.max(0, row.page.offset - PAGE_SIZE);
      if (offset === row.page.offset) return Promise.resolve(null);
      if (row.pending) return row.pending;
      if (this.inflight >= MAX_INFLIGHT) return Promise.resolve(null);
      return this.startCatalogRead(row, offset);
    }

    safeView() {
      try {
        return this.getView();
      } catch {
        return null;
      }
    }

    waveform(ref, clip, startTime, endTime) {
      if (!previewAllowed(this.safeView())) return Promise.resolve(null);
      const row = this.findRow(ref);
      if (!row) return Promise.resolve(null);
      const current = currentClip(row, clip);
      if (!current) return Promise.resolve(null);
      const range = previewRange(current, startTime, endTime);
      if (!range) return Promise.resolve(null);
      if (row.waveformBusy) return Promise.resolve(null);
      const key = waveformKey(row, current, range);
      const cached = this.waveforms.get(key);
      if (cached) return Promise.resolve(intervalOf(cached));
      return this.requestWaveform(row, current, range, key);
    }

    requestWaveform(row, clip, range, key) {
      const generation = row.generation;
      const identity = row.identity;
      row.waveformBusy = true;
      let promise;
      try {
        promise = Promise.resolve(this.reads.readWaveform(copyRef(row.track), copyClip(clip), range.start, range.end));
      } catch (err) {
        promise = Promise.reject(err);
      }
      return promise.then(
        (result) => this.applyWaveform(row, generation, identity, key, clip, result),
        (err) => this.applyWaveformError(row, generation, identity, err)
      );
    }

    applyWaveform(row, generation, identity, key, clip, result) {
      if (!this.isCurrent(row, generation, identity)) return null;
      row.waveformBusy = false;
      // A clip that changed while the preview was in flight keeps no peaks.
      const current = currentClip(row, clip);
      if (!current || clipIdentity(current) !== clipIdentity(clip)) return null;
      const entry = waveformEntry(key, row, clip, result);
      if (entry) {
        this.waveforms.delete(key);
        this.waveforms.set(key, entry);
        this.trimWaveforms();
      }
      this.notify();
      return entry ? intervalOf(entry) : null;
    }

    applyWaveformError(row, generation, identity, err) {
      if (!this.isCurrent(row, generation, identity)) return null;
      row.waveformBusy = false;
      const code = (err && err.code) || 'REC_ERROR';
      if (code !== CANCELLED) this.notify();
      return null;
    }

    peaksFor(ref, clip) {
      const row = this.findRow(ref);
      if (!row || !row.page || !clip) return [];
      const current = currentClip(row, clip);
      if (!current) return [];
      const found = [];
      this.waveforms.forEach((entry) => {
        if (entry.world !== row.world) return;
        if (entry.trackKey !== row.key) return;
        if (entry.clipIndex !== current.index || entry.clipId !== String(current.id)) return;
        // The peaks belong to the clip as it is now: a renamed or moved clip
        // never revives the peaks of its former self.
        if (entry.clipIdentity !== clipIdentity(current)) return;        found.push(intervalOf(entry));
      });
      return found;
    }

    extent() {
      let max = 0;
      this.rows.forEach((row) => {
        if (!row.page) return;
        row.clips.forEach((clip) => {
          const end = Number(clip.endTime);
          if (Number.isFinite(end) && end > max) max = end;
        });
      });
      return max;
    }

    cancel() {
      this.rows.forEach((row) => {
        row.generation += 1;
        row.pending = null;
        row.waveformBusy = false;
        if (row.status === 'loading') {
          row.status = row.page ? (row.clips.length ? 'ready' : 'empty') : 'idle';
        }
      });
      this.waveforms.clear();
      this.inflight = 0;
      this.wasActive = false;
      this.startEntry();
      ignoreError(() => this.reads.cancel());
      this.notify();
    }
  }

  function createRowsModel(options) {
    return new RowsModel(options);
  }

  namespace.createRowsModel = createRowsModel;
}(typeof globalThis !== 'undefined' ? globalThis : this));
