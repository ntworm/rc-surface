/*
 * Copyright © 2026 Gabriel Worm
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Source: https://github.com/ntworm/rc-surface
 */
(function (root) {
  'use strict';

  const MAX_CLIPS_PER_PAGE = 64;
  const MAX_CLIPS_PER_TRACK = 4096;
  const MAX_NAME_LENGTH = 256;
  const MAX_PEAKS = 512;
  const MAX_WAVEFORM_BEATS = 128;
  const MAX_PENDING_CATALOG = 8;
  const MAX_PENDING_WAVEFORM = 1;
  const DEFAULT_TIMEOUT_MS = 12000;
  const TRACK_KEYS = ['index', 'id', 'name'];
  const CLIP_KEYS = ['index', 'id', 'name', 'startTime', 'endTime'];
  const ARRANGEMENT_KEYS = ['scope', 'track', 'clips', 'page'];
  const PAGE_KEYS = ['offset', 'next'];
  const WAVEFORM_KEYS = ['scope', 'track', 'clip', 'startTime', 'endTime', 'peaks'];

  const MESSAGES = {
    REC_BAD_REQUEST: 'Read request is not valid.', REC_DISCONNECTED: 'Live link is disconnected.',
    REC_SCOPE_MISSING: 'No Live set scope is available.', REC_TRACK_FOREIGN: 'Track is not part of the current Live set.',
    REC_TRACK_REORDERED: 'Track order changed while reading.', REC_TRACK_RENAMED: 'Track was renamed while reading.',
    REC_TRANSPORT_PLAYING: 'Transport is playing.', REC_TRANSPORT_UNFRESH: 'Transport state is not fresh.',
    REC_ATTEMPT_ACTIVE: 'A recording attempt is active.', REC_BUSY: 'Too many reads are already pending.',
    REC_TIMEOUT: 'Read timed out.', REC_CANCELLED: 'Read was cancelled.',
    REC_PROTOCOL: 'Live returned an unexpected read response.', REC_MISMATCH: 'Live returned a stale read response.',
    REC_FAILED: 'Live rejected the read.', REC_SEND_FAILED: 'Read could not be sent.'
  };

  const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const isFiniteNumber = (value) => typeof value === 'number' && isFinite(value);
  const isValidId = (value) => typeof value === 'string' && value.length > 0;
  const isPlainName = (value) => typeof value === 'string' && value.length <= MAX_NAME_LENGTH;
  const idKey = (value) => typeof value + ':' + String(value);
  const isAmplitude = (value) => isFiniteNumber(value) && value >= 0 && value <= 1;
  const copyTrack = (track) => ({ index: track.index, id: track.id, name: track.name });
  const copyClip = (clip) => ({ index: clip.index, id: clip.id, name: clip.name, startTime: clip.startTime, endTime: clip.endTime });
  const viewState = (view) => (isObject(view) && isObject(view.state) ? view.state : null);
  const viewTransport = (state) => (state && isObject(state.transport) ? state.transport : null);
  const viewScope = (state) => (state && typeof state.scope === 'string' && state.scope.length > 0 ? state.scope : null);
  const viewRole = (view) => (isObject(view) && typeof view.role === 'string' ? view.role : null);
  const viewEpoch = (view) => (isObject(view) ? (view.connectionEpoch === undefined ? null : view.connectionEpoch) : null);
  const observation = (raw) => (isObject(raw) && typeof raw.value === 'boolean' ? { value: raw.value, fresh: raw.fresh === true } : null);
  const observationKey = (obs) => (!obs ? 'u' : (obs.fresh ? 'f' : 's') + (obs.value ? '1' : '0'));

  function readError(code, reason) {
    const error = new Error(MESSAGES[code] || 'Read failed.');
    error.code = code;
    if (reason) error.reason = reason;
    return error;
  }
  function errorCode(error, fallback) {
    if (isObject(error) && typeof error.code === 'string' && hasOwn(MESSAGES, error.code)) return error.code;
    return fallback;
  }
  function attemptActiveOf(state) {
    const raw = state ? state.attemptActive : undefined;
    if (typeof raw === 'boolean') return raw;
    if (isObject(raw)) return !(raw.fresh === true && raw.value === false);
    return true;
  }
  function viewConnected(view, transport) {
    if (!isObject(view) || view.connected !== true) return false;
    return !!transport && transport.connected === true;
  }
  function captureWorld(view) {
    const state = viewState(view);
    const transport = viewTransport(state);
    const epoch = viewEpoch(view);
    const scope = viewScope(state);
    const role = viewRole(view);
    const connected = viewConnected(view, transport);
    const playing = transport ? observation(transport.isPlaying) : null;
    const recordMode = transport ? observation(transport.recordMode) : null;
    const attemptActive = attemptActiveOf(state);
    const sessionKey = String(epoch) + '|' + String(scope) + '|' + String(role);
    const key = sessionKey + '|' + (connected ? '1' : '0') + '|' + observationKey(playing)
      + '|' + observationKey(recordMode) + '|' + (attemptActive ? '1' : '0');
    return { epoch, scope, role, connected, playing, recordMode, attemptActive, sessionKey, key };
  }
  function hasExactKeys(value, keys) {
    if (!isObject(value)) return false;
    if (Object.keys(value).length !== keys.length) return false;
    return keys.every((key) => hasOwn(value, key));
  }
  function sameTrack(left, right) {
    if (!hasExactKeys(left, TRACK_KEYS)) return false;
    return left.index === right.index && left.id === right.id && left.name === right.name;
  }
  function sameClip(left, right) {
    if (!hasExactKeys(left, CLIP_KEYS)) return false;
    return left.index === right.index && left.id === right.id && left.name === right.name
      && left.startTime === right.startTime && left.endTime === right.endTime;
  }
  function trackIndexOf(tracks, index) {
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      if (isObject(track) && track.index === index) return track;
    }
    return null;
  }
  function hasTrackId(tracks, id, index) {
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      if (isObject(track) && track.id === id && track.index !== index) return true;
    }
    return false;
  }
  function trackRef(track, exact) {
    if (!isObject(track)) return null;
    if (exact && !hasExactKeys(track, TRACK_KEYS)) return null;
    if (!Number.isInteger(track.index) || track.index < 0) return null;
    if (!isValidId(track.id)) return null;
    if (!isPlainName(track.name)) return null;
    return copyTrack(track);
  }
  function trackMismatch(tracks, wanted, ref) {
    if (wanted.id !== ref.id) {
      return hasTrackId(tracks, wanted.id, ref.index) ? 'REC_TRACK_REORDERED' : 'REC_TRACK_FOREIGN';
    }
    if (wanted.name !== ref.name) return 'REC_TRACK_RENAMED';
    return null;
  }
  function resolveTrack(view, wanted) {
    const request = trackRef(wanted, true);
    if (!request) return { ok: false, code: 'REC_BAD_REQUEST' };
    const state = viewState(view);
    const tracks = state && Array.isArray(state.tracks) ? state.tracks : null;
    if (!tracks) return { ok: false, code: 'REC_TRACK_FOREIGN' };
    const live = trackIndexOf(tracks, request.index);
    if (!live) return { ok: false, code: 'REC_TRACK_FOREIGN' };
    const ref = trackRef(live, false);
    if (!ref) return { ok: false, code: 'REC_TRACK_FOREIGN' };
    const mismatch = trackMismatch(tracks, request, ref);
    if (mismatch) return { ok: false, code: mismatch };
    return { ok: true, track: ref };
  }
  function safeView(state) {
    try {
      return state.getView();
    } catch (error) {
      state.viewErrorCode = errorCode(error, 'REC_DISCONNECTED');
      return null;
    }
  }
  function resolveTimers(host) {
    const globalObject = typeof globalThis === 'object' && globalThis !== null ? globalThis : null;
    if (globalObject && typeof globalObject.setTimeout === 'function' && typeof globalObject.clearTimeout === 'function') {
      return globalObject;
    }
    if (host && typeof host.setTimeout === 'function' && typeof host.clearTimeout === 'function') return host;
    return null;
  }
  function applyWorld(state, next) {
    if (!next) return;
    if (!state.world || state.world.key === next.key) {
      state.world = next;
      return;
    }
    const reason = next.sessionKey !== state.world.sessionKey ? 'session' : 'world';
    state.world = next;
    retireAll(state, reason);
  }
  function retireAll(state, reason) {
    const entries = [];
    state.pending.forEach((entry) => entries.push(entry));
    entries.forEach((entry) => settle(state, entry, readError('REC_CANCELLED', reason), null));
  }
  function emit(state, entry, status, code) {
    if (!state.notify || state.notifying) return;
    state.notifying = true;
    const event = { kind: entry.kind, status, code: code || null, scope: entry.world.scope, trackIndex: entry.track.index };
    try {
      state.notify(event);
    } catch (error) {
      state.notifyErrorCode = errorCode(error, 'REC_PROTOCOL');
    }
    state.notifying = false;
  }
  function settle(state, entry, error, data) {
    if (state.pending.get(entry.id) !== entry) return;
    state.pending.delete(entry.id);
    if (entry.timer !== null && state.timers) state.timers.clearTimeout(entry.timer);
    if (!error) {
      entry.resolve(data);
      emit(state, entry, 'ok', null);
      return;
    }
    entry.reject(error);
    if (error.code !== 'REC_CANCELLED') emit(state, entry, 'error', error.code);
  }
  function canStart(state, kind) {
    let catalog = 0;
    let waveform = 0;
    state.pending.forEach((entry) => {
      if (entry.kind === 'waveform') waveform += 1;
      else catalog += 1;
    });
    return kind === 'waveform' ? waveform < MAX_PENDING_WAVEFORM : catalog < MAX_PENDING_CATALOG;
  }
  function catalogRefError(result, request) {
    if (result.scope !== request.scope) return 'REC_MISMATCH';
    if (!sameTrack(result.track, request.track)) return 'REC_MISMATCH';
    if (isObject(result.page) && result.page.offset !== request.offset) return 'REC_MISMATCH';
    return null;
  }
  function waveformRefError(result, request) {
    if (result.scope !== request.scope) return 'REC_MISMATCH';
    if (!sameTrack(result.track, request.track)) return 'REC_MISMATCH';
    if (!sameClip(result.clip, request.clip)) return 'REC_MISMATCH';
    if (result.startTime !== request.startTime) return 'REC_MISMATCH';
    if (result.endTime !== request.endTime) return 'REC_MISMATCH';
    return null;
  }
  function resultShape(result, kind) {
    if (!isObject(result)) return false;
    return hasExactKeys(result, kind === 'waveform' ? WAVEFORM_KEYS : ARRANGEMENT_KEYS);
  }
  function responseFailure(response) {
    if (!isObject(response) || typeof response.ok !== 'boolean') return readError('REC_PROTOCOL');
    if (response.ok !== true) return readError('REC_FAILED');
    return null;
  }
  function worldFailure(entry, world) {
    if (!world || world.key !== entry.world.key) return readError('REC_CANCELLED', 'world');
    if (entry.kind === 'waveform' && transportBlocked(world)) return readError('REC_CANCELLED', 'transport');
    return null;
  }
  function refFailure(entry, result) {
    if (!resultShape(result, entry.kind)) return 'REC_PROTOCOL';
    if (entry.kind === 'waveform') return waveformRefError(result, entry.payload);
    return catalogRefError(result, entry.payload);
  }
  function handleResponse(state, entry, response, validate) {
    if (state.pending.get(entry.id) !== entry) return;
    try {
      const failure = responseFailure(response);
      if (failure) { settle(state, entry, failure, null); return; }
      const view = safeView(state);
      const stale = worldFailure(entry, captureWorld(view));
      if (stale) { settle(state, entry, stale, null); return; }
      const result = response.result;
      const bad = refFailure(entry, result);
      if (bad) { settle(state, entry, readError(bad), null); return; }
      const resolved = resolveTrack(view, entry.track);
      if (!resolved.ok) { settle(state, entry, readError('REC_MISMATCH'), null); return; }
      const data = validate(result, entry.payload);
      settle(state, entry, data ? null : readError('REC_PROTOCOL'), data);
    } catch (error) {
      state.responseErrorCode = errorCode(error, 'REC_PROTOCOL');
      settle(state, entry, readError('REC_PROTOCOL'), null);
    }
  }
  function issue(state, kind, name, payload, validate) {
    return new Promise((resolve, reject) => {
      if (!state.timers) { reject(readError('REC_TIMEOUT', 'timers')); return; }
      if (!canStart(state, kind)) { reject(readError('REC_BUSY')); return; }
      const entry = { id: state.nextId, kind, world: state.world, track: payload.track, payload, resolve, reject, timer: null };
      state.nextId += 1;
      state.pending.set(entry.id, entry);
      entry.timer = state.timers.setTimeout(() => settle(state, entry, readError('REC_TIMEOUT'), null), state.timeoutMs);
      try {
        state.send(name, payload, (response) => handleResponse(state, entry, response, validate));
      } catch (error) {
        settle(state, entry, readError(errorCode(error, 'REC_SEND_FAILED')), null);
      }
    });
  }
  function validateClip(raw, expectedIndex) {
    if (!hasExactKeys(raw, CLIP_KEYS)) return null;
    if (raw.index !== expectedIndex) return null;
    if (!isValidId(raw.id)) return null;
    if (!isPlainName(raw.name)) return null;
    if (!isFiniteNumber(raw.startTime) || raw.startTime < 0) return null;
    if (!isFiniteNumber(raw.endTime) || raw.endTime <= raw.startTime) return null;
    return copyClip(raw);
  }
  function validateClips(raw, offset) {
    if (!Array.isArray(raw)) return null;
    if (raw.length > MAX_CLIPS_PER_PAGE) return null;
    if (offset + raw.length > MAX_CLIPS_PER_TRACK) return null;
    const clips = [];
    const ids = new Set();
    for (let i = 0; i < raw.length; i += 1) {
      const clip = validateClip(raw[i], offset + i);
      if (!clip) return null;
      if (ids.has(idKey(clip.id))) return null;
      ids.add(idKey(clip.id));
      clips.push(clip);
    }
    return clips;
  }
  function isValidNext(next, offset, count) {
    if (!isFiniteNumber(next)) return false;
    if (next !== offset + count) return false;
    if (!(next > offset)) return false;
    return next < MAX_CLIPS_PER_TRACK;
  }
  function validatePage(raw, offset, count) {
    if (!hasExactKeys(raw, PAGE_KEYS)) return null;
    if (raw.offset !== offset) return null;
    if (raw.next === null) return { offset, next: null };
    if (!isValidNext(raw.next, offset, count)) return null;
    return { offset, next: raw.next };
  }
  function validateArrangement(result, request) {
    if (!hasExactKeys(result, ARRANGEMENT_KEYS) || !Array.isArray(result.clips)) return null;
    const clips = validateClips(result.clips, request.offset);
    if (!clips) return null;
    const page = validatePage(result.page, request.offset, clips.length);
    if (!page) return null;
    return { scope: request.scope, track: copyTrack(request.track), clips, page };
  }
  function validatePeaks(raw) {
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0 || raw.length > MAX_PEAKS) return null;
    const peaks = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (!isAmplitude(raw[i])) return null;
      peaks.push(raw[i]);
    }
    return peaks;
  }
  function validateWaveform(result, request) {
    if (!hasExactKeys(result, WAVEFORM_KEYS)) return null;
    const peaks = validatePeaks(result.peaks);
    if (!peaks) return null;
    const head = { scope: request.scope, track: copyTrack(request.track), clip: copyClip(request.clip) };
    return { scope: head.scope, track: head.track, clip: head.clip, startTime: request.startTime, endTime: request.endTime, peaks };
  }
  function normalizeOffset(offset) {
    if (offset === undefined) return 0;
    if (!isFiniteNumber(offset)) return null;
    if (!Number.isInteger(offset) || offset < 0 || offset >= MAX_CLIPS_PER_TRACK) return null;
    return offset;
  }
  function validTimeRange(start, end) {
    if (!isFiniteNumber(start) || start < 0) return false;
    if (!isFiniteNumber(end) || end <= start) return false;
    return true;
  }
  function validClipRef(clip) {
    if (!hasExactKeys(clip, CLIP_KEYS)) return null;
    if (!Number.isInteger(clip.index) || clip.index < 0) return null;
    if (!isValidId(clip.id)) return null;
    if (!isPlainName(clip.name)) return null;
    if (!validTimeRange(clip.startTime, clip.endTime)) return null;
    return copyClip(clip);
  }
  function buildWaveformRequest(scope, track, clip, startTime, endTime) {
    const ref = validClipRef(clip);
    if (!ref) return null;
    if (!isFiniteNumber(startTime) || !isFiniteNumber(endTime)) return null;
    if (endTime <= startTime) return null;
    if (startTime < ref.startTime || endTime > ref.endTime) return null;
    if (endTime - startTime > MAX_WAVEFORM_BEATS) return null;
    return { scope, track: copyTrack(track), clip: ref, startTime, endTime };
  }
  function transportBlocked(world) {
    if (world.attemptActive) return 'REC_ATTEMPT_ACTIVE';
    if (!world.playing || !world.playing.fresh) return 'REC_TRANSPORT_UNFRESH';
    if (world.playing.value) return 'REC_TRANSPORT_PLAYING';
    if (!world.recordMode || !world.recordMode.fresh) return 'REC_TRANSPORT_UNFRESH';
    if (world.recordMode.value) return 'REC_TRANSPORT_PLAYING';
    return null;
  }
  function readArrangement(state, track, offset) {
    const start = normalizeOffset(offset);
    if (start === null) return Promise.reject(readError('REC_BAD_REQUEST'));
    const view = safeView(state);
    const world = captureWorld(view);
    applyWorld(state, world);
    if (!world.connected) return Promise.reject(readError('REC_DISCONNECTED'));
    if (!world.scope) return Promise.reject(readError('REC_SCOPE_MISSING'));
    const resolved = resolveTrack(view, track);
    if (!resolved.ok) return Promise.reject(readError(resolved.code));
    const payload = { scope: world.scope, track: resolved.track, offset: start };
    return issue(state, 'arrangement', 'getRecordingArrangement', payload, validateArrangement);
  }
  function readWaveform(state, track, clip, startTime, endTime) {
    const view = safeView(state);
    const world = captureWorld(view);
    applyWorld(state, world);
    if (!world.connected) return Promise.reject(readError('REC_DISCONNECTED'));
    if (!world.scope) return Promise.reject(readError('REC_SCOPE_MISSING'));
    const blocked = transportBlocked(world);
    if (blocked) return Promise.reject(readError(blocked));
    const resolved = resolveTrack(view, track);
    if (!resolved.ok) return Promise.reject(readError(resolved.code));
    const payload = buildWaveformRequest(world.scope, resolved.track, clip, startTime, endTime);
    if (!payload) return Promise.reject(readError('REC_BAD_REQUEST'));
    return issue(state, 'waveform', 'getRecordingWaveform', payload, validateWaveform);
  }
  function syncWorld(state, view) {
    applyWorld(state, captureWorld(view));
    return sessionInfo(state);
  }
  function sessionInfo(state) {
    if (!state.world) return null;
    return { connectionEpoch: state.world.epoch, scope: state.world.scope, role: state.world.role };
  }
  function endSession(state) {
    const info = sessionInfo(state);
    retireAll(state, 'session');
    state.world = null;
    return info;
  }
  function createState(options) {
    const opts = isObject(options) ? options : {};
    if (typeof opts.send !== 'function' || typeof opts.getView !== 'function') {
      throw new TypeError('createReads requires send and getView functions.');
    }
    return {
      send: opts.send, getView: opts.getView,
      notify: typeof opts.notify === 'function' ? opts.notify : null,
      timeoutMs: isFiniteNumber(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS,
      timers: resolveTimers(root),
      pending: new Map(), nextId: 1, world: null, notifying: false,
      viewErrorCode: null, notifyErrorCode: null, responseErrorCode: null
    };
  }
  function createReads(options) {
    const state = createState(options);
    return {
      readArrangement: (track, offset) => readArrangement(state, track, offset),
      readWaveform: (track, clip, startTime, endTime) => readWaveform(state, track, clip, startTime, endTime),
      sync: (view) => syncWorld(state, view),
      session: () => endSession(state),
      cancel: () => retireAll(state, 'cancel')
    };
  }

  if (!isObject(root.RcRecordingArrangement)) root.RcRecordingArrangement = {};
  root.RcRecordingArrangement.createReads = createReads;
})(typeof window !== 'undefined' ? window : globalThis);
