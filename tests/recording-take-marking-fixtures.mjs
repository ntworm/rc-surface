// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { RecordingTakeMarking } from '../src/live/recording-take-marking.ts';
import { RecordingTakeNotes } from '../src/live/recording-take-notes.ts';

export const TRACK = { index: 0, id: 'track-1', name: 'Input' };
export const LANE = { index: 0, id: 'lane-1', name: 'Lane 1' };

/** Every write the fake host would accept is recorded instead of performed. */
export function hostClip(id, name, startTime = 0, endTime = 4, writes = []) {
  const state = { name, startTime };
  const clip = {
    get name() { return state.name; },
    set name(value) { writes.push('clip.name'); state.name = value; },
    get startTime() { return state.startTime; },
    get endTime() { return endTime; },
    handle: { id },
  };
  clip.state = state;
  return clip;
}

export function hostLane(id, name, clips = [], writes = []) {
  const state = { name };
  return {
    get name() { return state.name; },
    set name(value) { writes.push('lane.name'); state.name = value; },
    handle: { id },
    clips,
    state,
  };
}

export function hostTrack(takeLanes = [], options = {}, writes = []) {
  const state = { name: options.name ?? 'Input' };
  return {
    get name() { return state.name; },
    set name(value) { writes.push('track.name'); state.name = value; },
    handle: { id: options.id ?? 'track-1' },
    takeLanes,
    state,
  };
}

/** A clip whose name only reflects after the host had time to answer. */
export function delayedClip(id, name, writes, delay = 30) {
  let current = name;
  return {
    get name() { return current; },
    set name(value) { writes.push('clip.name'); setTimeout(() => { current = value; }, delay); },
    get startTime() { return 0; },
    get endTime() { return 4; },
    handle: { id },
  };
}

/** A setter that applies the name and then fails: the outcome is unknown. */
export function throwingClip(id, name, writes) {
  let current = name;
  return {
    get name() { return current; },
    set name(value) { writes.push('clip.name'); current = value; throw new Error('host refused'); },
    get startTime() { return 0; },
    get endTime() { return 4; },
    handle: { id },
  };
}

/** A setter that never reflects the name back. */
export function silentClip(id, name, writes) {
  return {
    get name() { return name; },
    set name(value) { writes.push('clip.name'); },
    get startTime() { return 0; },
    get endTime() { return 4; },
    handle: { id },
  };
}

/** The transport is only ever observed, never driven. */
export function fakeTransport(options = {}) {
  const state = { recordMode: false, isPlaying: false, fresh: true, ...options };
  const calls = [];
  const read = async () => {
    calls.push('read');
    return {
      recordMode: { value: state.recordMode, observedAt: Date.now(), fresh: state.fresh },
      isPlaying: { value: state.isPlaying, observedAt: Date.now(), fresh: state.fresh },
    };
  };
  read.calls = calls;
  return read;
}

export function makeDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function makeWorld(options = {}) {
  const writes = [];
  const clips = [hostClip('clip-1', 'Take 1', 0, 4, writes), hostClip('clip-2', 'Take 2', 8, 12, writes)];
  const lane = hostLane('lane-1', 'Lane 1', clips, writes);
  const track = hostTrack([lane], {}, writes);
  const song = { tracks: [track] };
  let scope = options.scope ?? 'scope-1';
  const getScope = () => (options.getScope ? options.getScope() : scope);
  const catalog = new RecordingTakeNotes(() => song, getScope);
  const readTransport = options.readTransport ?? fakeTransport(options.transport);
  const marking = new RecordingTakeMarking(
    () => song, getScope, catalog.identities, readTransport, () => Boolean(options.attemptActive),
    options.confirmMs,
  );
  const request = (mark, overrides = {}) => {
    const currentScope = getScope();
    const view = catalog.list({ scope: currentScope, track: { ...TRACK }, laneOffset: 0, clipOffset: 0 });
    const clip = view.lanes[0].clips[0];
    return {
      scope: currentScope,
      track: { ...TRACK },
      lane: { ...LANE },
      clip: {
        index: clip.index, id: clip.id, name: clip.name,
        startTime: clip.startTime, endTime: clip.endTime, reference: clip.reference,
      },
      mark,
      ...overrides,
    };
  };
  return {
    writes, clips, lane, track, song, catalog, marking, readTransport, request,
    setScope: (s) => { scope = s; },
  };
}

export const context = () => ({ clientId: 'phone', isCurrent: () => true });
