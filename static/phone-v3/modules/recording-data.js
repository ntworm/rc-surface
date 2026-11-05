// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The isolated data path of REC.
//
// Three commands live here and nowhere else: two reads of Live's own object
// graph - the take-lane catalog and the reserved Return/send diagnostic - and
// one write that names a take-lane clip.
//
// The data path is deliberately apart from the coordinator path. A read here
// answers a question about Live's objects; it is not an observation of the
// transport and must never become one. So no reply of this path replaces the
// coordinator's state, its generation, its busy flag or its pending command:
// the REC page keeps showing exactly what the coordinator observed.
//
// The write is narrow: one clip, one name, one attempt, on its own latch. It
// never queues and never retries. A write that was already issued may still
// land, but it can no longer report success.
(function (root) {
  'use strict';

  const READS = Object.freeze(['getRecordingTakes', 'getRecordingCueState']);
  const WRITES = Object.freeze(['recordingMarkTake']);
  const NAMES = new Set(READS.concat(WRITES));
  const NOTE_KEYS = Object.freeze(['scope', 'track', 'lane', 'clip', 'mark']);
  const REF_KEYS = Object.freeze(['index', 'id', 'name']);
  const CLIP_KEYS = Object.freeze(['index', 'id', 'name', 'startTime', 'endTime', 'reference']);
  const TAKES_KEYS = Object.freeze(['scope', 'track', 'laneOffset', 'clipOffset']);
  const CUE_KEYS = Object.freeze(['scope', 'returnTrack', 'offset']);
  /** An issued write nobody answered: the name in Live may have changed
   * even though the phone never learned about it. */
  const UNKNOWN_OUTCOME = new Set(['UNKNOWN', 'NOTE_CANCELED', 'SESSION', 'IDENTITY']);

  function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function exactKeys(value, keys) {
    const own = Object.keys(value);
    return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
  }

  function isDataName(name) {
    return NAMES.has(name);
  }

  /** A viewer may read: the catalog needs no OSC link and no write. */
  function canRead(view) {
    if (!view || !view.connected || !view.state) return false;
    return typeof view.state.scope === 'string' && view.state.scope.length > 0;
  }

  function hasWriteRole(view) {
    if (!view || !view.connected) return false;
    return view.role === 'controller' || view.role === 'admin';
  }

  /** Fresh and known: without both, nothing may be written. */
  function isKnown(view) {
    if (!view || !view.fresh || !view.state) return false;
    const transport = view.state.transport;
    if (!transport || transport.connected !== true) return false;
    return isKnownFlag(transport.isPlaying) && isKnownFlag(transport.recordMode);
  }

  /** One observed boolean: fresh, and really a boolean. */
  function isKnownFlag(field) {
    return Boolean(field && field.fresh === true && typeof field.value === 'boolean');
  }

  function isStopped(view) {
    if (!isKnown(view)) return false;
    const transport = view.state.transport;
    return transport.isPlaying.value === false && transport.recordMode.value === false;
  }

  /** No attempt, no pre-roll, no Session attempt, no pending main work. */
  function isIdle(view) {
    const state = view && view.state;
    if (!state || view.busy) return false;
    if (state.pending || state.attemptActive || state.preRoll) return false;
    return !(state.session && state.session.active);
  }

  function canWrite(view) {
    return hasWriteRole(view) && isStopped(view) && isIdle(view);
  }

  function refOf(value) {
    if (!isPlainObject(value) || !exactKeys(value, REF_KEYS)) return null;
    if (!Number.isSafeInteger(value.index) || value.index < 0) return null;
    if (typeof value.id !== 'string' || !value.id) return null;
    if (typeof value.name !== 'string') return null;
    return { index: value.index, id: value.id, name: value.name };
  }

  function clipOf(value) {
    if (!isPlainObject(value) || !exactKeys(value, CLIP_KEYS)) return null;
    const base = refOf({ index: value.index, id: value.id, name: value.name });
    if (!base) return null;
    if (!isSpan(value.startTime, value.endTime)) return null;
    if (typeof value.reference !== 'string' || !value.reference) return null;
    return { index: base.index, id: base.id, name: base.name, startTime: value.startTime, endTime: value.endTime, reference: value.reference };
  }

  /** A clip spans a real, ordered interval of beats. */
  function isSpan(startTime, endTime) {
    if (typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime < 0) return false;
    if (typeof endTime !== 'number' || !Number.isFinite(endTime) || endTime < startTime) return false;
    return true;
  }

  function isScope(value) {
    return typeof value === 'string' && value.length > 0;
  }

  /** The mark is the one exact value the command accepts. */
  function isMark(value) {
    return value === null || value === 'good' || value === 'review';
  }

  function noteOf(args) {
    if (!isPlainObject(args) || !exactKeys(args, NOTE_KEYS)) return null;
    if (!isScope(args.scope)) return null;
    if (!isMark(args.mark)) return null;
    const track = refOf(args.track), lane = refOf(args.lane), clip = clipOf(args.clip);
    if (!track || !lane || !clip) return null;
    return { scope: args.scope, track, lane, clip, mark: args.mark };
  }

  function takesOf(args) {
    if (!isPlainObject(args) || !exactKeys(args, TAKES_KEYS)) return null;
    if (typeof args.scope !== 'string' || !args.scope) return null;
    const track = refOf(args.track);
    if (!track) return null;
    if (!Number.isSafeInteger(args.laneOffset) || args.laneOffset < 0) return null;
    if (!Number.isSafeInteger(args.clipOffset) || args.clipOffset < 0) return null;
    return { scope: args.scope, track, laneOffset: args.laneOffset, clipOffset: args.clipOffset };
  }

  /** The CUE route takes exactly its own request: a scope, an optional exact
   * Return track and a page offset. Nothing else is understood. */
  function cueOf(args) {
    if (!isPlainObject(args) || !exactKeys(args, CUE_KEYS)) return null;
    if (!isScope(args.scope)) return null;
    if (args.returnTrack !== null && !refOf(args.returnTrack)) return null;
    if (!Number.isSafeInteger(args.offset) || args.offset < 0) return null;
    return { scope: args.scope, returnTrack: args.returnTrack, offset: args.offset };
  }

  /** Did an issued write leave without an answer? Then only Live knows the
   * name: the phone must ask for it instead of guessing. */
  function isUnknownOutcome(error) {
    if (!error || error.emitted !== true) return false;
    const code = String(error.message || '').match(/REC:([A-Z_]+)/)?.[1];
    return UNKNOWN_OUTCOME.has(code);
  }

  /**
   * The data path of one REC session.
   *
   * It owns its own single-flight latch, so a take can be marked while the
   * rest of the surface keeps working, and it never takes the coordinator's
   * operation slot.
   */
  class DataClient {
    constructor({ send, getView, notify = null, timeoutMs = 12000 }) {
      this.send = send;
      this.getView = getView;
      this.notifyFn = typeof notify === 'function' ? notify : null;
      this.timeoutMs = timeoutMs;
      this.pending = null;
      this.result = null;
      this.error = null;
      this.notifying = false;
    }

    /** The coordinator's own view is the only truth about the world here. */
    current() {
      if (typeof this.getView !== 'function') return null;
      try { return this.getView() || null; } catch { return null; }
    }

    /** One repaint, never a loop: a repaint reads the view, and reading the
     * view may retire a note, but a retirement inside a repaint stays quiet. */
    notify() {
      if (!this.notifyFn || this.notifying) return;
      this.notifying = true;
      try { this.notifyFn(); } finally { this.notifying = false; }
    }

    handles(name) {
      return isDataName(name);
    }

    command(name, args) {
      if (name === 'getRecordingTakes') return this.readTakes(args);
      if (name === 'getRecordingCueState') return this.readCue(args);
      if (name === 'recordingMarkTake') return this.mark(args);
      return Promise.reject(Error('REC:UNKNOWN'));
    }

    /** The take-lane catalog of one exact track: viewer-safe and exact. */
    readTakes(args) {
      const request = takesOf(args);
      if (!request) return Promise.reject(Error('REC:ARGUMENTS'));
      const view = this.current();
      if (!canRead(view)) return Promise.reject(Error('REC:SESSION'));
      if (request.scope !== view.state.scope) return Promise.reject(Error('REC:SESSION'));
      return this.exchange('getRecordingTakes', request, this.binding(view, request.scope, request.track));
    }

    /** The reserved CUE read route. It has no interface yet: the route
     * exists so a later read-only panel can use it without a new write. */
    readCue(args) {
      const request = cueOf(args);
      if (!request) return Promise.reject(Error('REC:ARGUMENTS'));
      const view = this.current();
      if (!canRead(view)) return Promise.reject(Error('REC:SESSION'));
      if (request.scope !== view.state.scope) return Promise.reject(Error('REC:SESSION'));
      return this.exchange('getRecordingCueState', request, this.binding(view, request.scope, null));
    }

    /** What a reply must still match: the connection, the scope, the role
     * and, for a track, that very track. */
    binding(view, scope, track) {
      return { epoch: view.connectionEpoch, scope, role: view.role, track: track || null };
    }

    /** One guarded name write on one addressed clip. */
    mark(args) {
      const request = noteOf(args);
      if (!request) return Promise.reject(Error('REC:ARGUMENTS'));
      const view = this.current();
      if (!hasWriteRole(view)) return Promise.reject(Error('REC:SESSION'));
      if (this.pending) return Promise.reject(Error('REC:BUSY'));
      if (!view.state || request.scope !== view.state.scope) return Promise.reject(Error('REC:SESSION'));
      if (!isKnown(view)) return Promise.reject(Error('REC:UNKNOWN'));
      if (!isStopped(view)) return Promise.reject(Error('REC:NOT_STOPPED'));
      if (!isIdle(view)) return Promise.reject(Error('REC:STOP_REQUIRED'));
      return this.write(request, view);
    }

    write(request, view) {
      return new Promise((resolve, reject) => {
        const note = {
          epoch: view.connectionEpoch,
          scope: request.scope,
          track: request.track,
          settled: false,
          timer: null,
          resolve,
          reject,
        };
        this.pending = note;
        this.result = null;
        this.error = null;
        this.notify();
        note.timer = setTimeout(() => this.finish(note, { ok: false, error: 'REC:UNKNOWN' }), this.timeoutMs);
        try { this.send('recordingMarkTake', request, response => this.finish(note, response)); }
        catch { this.finish(note, { ok: false, error: 'REC:UNKNOWN' }); }
      });
    }

    /** One reply decides the outcome, and only while the world still holds:
     * the same connection, scope, role and target, and a Live that is still
     * stopped and idle. */
    finish(note, response) {
      if (note.settled) return;
      note.settled = true;
      clearTimeout(note.timer);
      if (this.pending === note) this.pending = null;
      if (!response || !response.ok) {
        const message = (response && response.error) || 'REC:UNKNOWN';
        this.error = message;
        note.reject(this.failure(message));
        this.notify();
        return;
      }
      const view = this.current();
      if (!this.coherent(view, note) || !canWrite(view)) {
        this.error = 'REC:SESSION';
        note.reject(this.failure('REC:SESSION'));
        this.notify();
        return;
      }
      this.result = response.result;
      this.error = null;
      note.resolve(response.result);
      this.notify();
    }

    /** The epoch, the scope, the role and the track must all still hold. */
    coherent(view, note) {
      if (!hasWriteRole(view)) return false;
      if (view.connectionEpoch !== note.epoch) return false;
      if (!view.state || view.state.scope !== note.scope) return false;
      const tracks = view.state.tracks || [];
      return tracks.some(track => track.index === note.track.index
        && track.id === note.track.id && track.name === note.track.name);
    }

    /** A failed write says that it was already sent: it may still have
     * landed in Live, so its outcome is unknown. */
    failure(message) {
      const error = Error(message);
      error.emitted = true;
      return error;
    }

    /** Retire a pending note. A write that was already issued may still
     * land, but it can never write twice and never reports success. */
    retire(reason) {
      const note = this.pending;
      if (!note) return false;
      note.settled = true;
      clearTimeout(note.timer);
      this.pending = null;
      this.result = null;
      this.error = reason;
      note.reject(this.failure(reason));
      this.notify();
      return true;
    }

    /** A priority STOP retires the pending note before the transport stops. */
    cancel() {
      return this.retire('REC:NOTE_CANCELED');
    }

    /** A new session or a new role retires everything this path holds. */
    session() {
      this.result = null;
      this.error = null;
      if (this.pending) this.retire('REC:SESSION');
    }

    /** Called whenever the coordinator's view is read: a changed epoch, a
     * changed scope, a changed role or a changed track retires the note. */
    sync(view) {
      if (!this.pending) return;
      if (!this.coherent(view, this.pending)) this.retire('REC:SESSION');
    }

    view(view) {
      return {
        noteBusy: Boolean(this.pending),
        noteResult: this.result,
        noteError: this.error,
        noteWritable: canWrite(view),
      };
    }

    /** A plain read: the reply is the answer, never a new observation, and
     * only while the world it was asked in still holds. */
    exchange(name, args, binding) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        const finish = response => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!response || !response.ok) {
            reject(Error((response && response.error) || 'REC:UNKNOWN'));
            return;
          }
          if (!this.holds(binding) || !this.answers(binding, response.result)) {
            reject(Error('REC:SESSION'));
            return;
          }
          resolve(response.result);
        };
        timer = setTimeout(() => finish({ ok: false, error: 'REC:UNKNOWN' }), this.timeoutMs);
        try { this.send(name, args, finish); } catch { finish({ ok: false, error: 'REC:UNKNOWN' }); }
      });
    }

    /** The world the read was asked in: the same connection, the same
     * scope, the same role and the same exact track. */
    holds(binding) {
      const view = this.current();
      if (!view || !view.connected) return false;
      if (view.connectionEpoch !== binding.epoch) return false;
      if (view.role !== binding.role) return false;
      if (!view.state || view.state.scope !== binding.scope) return false;
      if (!binding.track) return true;
      const tracks = view.state.tracks || [];
      return tracks.some(track => track.index === binding.track.index
        && track.id === binding.track.id && track.name === binding.track.name);
    }

    /** The reply answers the exact question that was asked. */
    answers(binding, result) {
      if (!isPlainObject(result)) return false;
      if (result.scope !== binding.scope) return false;
      if (!binding.track) return true;
      const track = result.track;
      if (!isPlainObject(track)) return false;
      return track.index === binding.track.index && track.id === binding.track.id
        && track.name === binding.track.name;
    }
  }

  root.RcRecordingData = Object.freeze({
    createDataClient: options => new DataClient(options || {}),
    isDataName,
    isUnknownOutcome,
    canRead,
    hasWriteRole,
    isStopped,
    isIdle,
    canWrite,
  });
})(typeof window !== 'undefined' ? window : globalThis);
