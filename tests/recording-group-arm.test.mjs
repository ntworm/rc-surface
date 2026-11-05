// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as oscCodec from 'osc-min';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { RecordingCoordinator } from '../src/live/recording-coordinator.ts';
import { CMD, GET, REC, REC_PREFLIGHT, CLIP } from '../src/osc-tokens.ts';

/** The fake host of one Set: it answers the getters an ARM read needs. */
function groupFixture(t) {
  const osc = new OSCTransport();
  Object.assign(osc.state, { available: true, connected: true });
  const song = { tracks: [], cuePoints: [] };
  const values = { playing: false, record: false };
  let blocked = null;
  const reply = (address, args) => {
    if (address === CLIP.getTrackNames) return song.tracks.map(track => track.name);
    if (address === GET.isPlaying) return [values.playing];
    if (address === REC.getRecordMode) return [values.record];
    if (address === REC_PREFLIGHT.trackCanArm) return [args[0].value, song.tracks[args[0].value].canArm ?? true];
    if (address === REC_PREFLIGHT.trackArm) return [args[0].value, song.tracks[args[0].value].arm];
    return undefined;
  };
  osc.send = (address, args = []) => {
    if (address === CMD.stopPlaying) values.playing = false;
    if (address === REC.setRecordMode) values.record = args[0].value === 1;
    if (address === blocked) return;
    const response = reply(address, args);
    if (!response) return;
    queueMicrotask(() => osc.handleIncoming(oscCodec.fromBuffer(oscCodec.toBuffer({ address,
      args: response.map(value => ({ type: typeof value === 'boolean' ? (value ? 'true' : 'false')
        : typeof value === 'string' ? 'string' : value === null ? 'null'
        : Number.isInteger(value) ? 'integer' : 'float', value })) }))));
  };
  // A Song that vanishes mid-write is a real failure of the host: the
  // coordinator must survive it, so the fixture can break its provider.
  let broken = false;
  const coordinator = new RecordingCoordinator(osc, () => {
    if (broken) throw Error('the Song is gone');
    return song;
  });
  t.after(() => { coordinator.dispose(); osc.dispose(); });
  return { osc, coordinator, song, values, context: { clientId: 'phone-a', isCurrent: () => true },
    block: address => { blocked = address; },
    breakSong: () => { broken = true; }, mendSong: () => { broken = false; } };
}

/** One Set with a group, a group inside it, and one loose track. */
function groupSong() {
  const group = { name: 'Group', handle: { id: 'g1' }, arm: null, solo: false, mute: false, canArm: false };
  const inner = { name: 'Inner', handle: { id: 'g2' }, arm: null, solo: false, mute: false, canArm: false, groupTrack: group };
  const drums = { name: 'Drums', handle: { id: 't1' }, arm: false, solo: false, mute: false, canArm: true, groupTrack: group };
  const bass = { name: 'Bass', handle: { id: 't2' }, arm: false, solo: false, mute: false, canArm: true, groupTrack: inner };
  const keys = { name: 'Keys', handle: { id: 't3' }, arm: false, solo: false, mute: false, canArm: true };
  return { tracks: [group, inner, drums, bass, keys] };
}

const refs = {
  group: { index: 0, id: 'g1', name: 'Group' },
  inner: { index: 1, id: 'g2', name: 'Inner' },
  drums: { index: 2, id: 't1', name: 'Drums' },
  bass: { index: 3, id: 't2', name: 'Bass' },
  keys: { index: 4, id: 't3', name: 'Keys' },
};
const armRequest = (scope, group, tracks, enabled = true, armMode = 'multi') => ({ scope, group, tracks, enabled, armMode });

test('a group arm reaches its own descendants and never the group itself', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const state = await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context);
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, true, true, false]);
  assert.equal(state.tracks[0].arm, null, 'a group has no ARM value of its own');
  assert.equal(state.tracks[2].arm, true);
});

test('an all-cohort arm reaches every armable normal track and skips the groups', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), null, [refs.drums, refs.bass, refs.keys]), f.context);
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, true, true, true]);
});

test('a multi cohort preserves the tracks outside it and an exclusive one clears them', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  f.song.tracks[4].arm = true;
  await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context);
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, true, true, true], 'multi keeps the outside');
  await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass], true, 'exclusive'), f.context);
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, true, true, false], 'exclusive clears the outside');
});

test('a cohort that is not the current one is refused before any write', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const scope = f.coordinator.scopeToken();
  for (const tracks of [[refs.drums, refs.keys], [refs.bass, refs.drums], [refs.drums, refs.drums], []]) {
    await assert.rejects(f.coordinator.armTracks(armRequest(scope, refs.group, tracks), f.context), /IDENTITY|NO_ARMED/);
  }
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, false, false, false]);
});

test('a changed topology or identity is refused instead of a new child', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const scope = f.coordinator.scopeToken();
  f.song.tracks[3].groupTrack = undefined;
  await assert.rejects(f.coordinator.armTracks(armRequest(scope, refs.group, [refs.drums, refs.bass]), f.context), /IDENTITY/);
  f.song.tracks[3].groupTrack = f.song.tracks[1];
  f.song.tracks[2].handle.id = 'replaced';
  await assert.rejects(f.coordinator.armTracks(armRequest(scope, refs.group, [refs.drums, refs.bass]), f.context), /IDENTITY/);
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, false, false, false]);
});

test('a STOP cancels a pending cohort write before any setter runs', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  f.block(REC_PREFLIGHT.trackArm);
  const action = f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context);
  const rejected = assert.rejects(action, /STOPPED/);
  await f.coordinator.stop(f.context);
  await rejected;
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, false, false, false]);
});

test('a native setter that disarms a peer fails and never rolls back', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  f.song.tracks[4].arm = true;
  const drums = f.song.tracks[2];
  let armed = false;
  Object.defineProperty(drums, 'arm', { get: () => armed, set: value => {
    armed = value; if (value) f.song.tracks[4].arm = false;
  }, configurable: true });
  await assert.rejects(f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context), /ARM_COLLATERAL_DISARM/);
  assert.equal(armed, true);
  assert.equal(f.song.tracks[4].arm, false, 'the host disarmed the peer and nothing is replayed');
});

test('a cohort arm never changes the preference of Live itself', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  f.song.exclusiveArm = true;
  await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context);
  assert.equal(f.song.exclusiveArm, true);
});

test('the snapshot reports the hierarchy it read, and admits when it cannot', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const state = f.coordinator.snapshot();
  assert.equal(state.trackTreeValid, true);
  assert.deepEqual(state.tracks.map(track => [track.groupId, track.isGroup]), [
    [null, true], ['g1', true], ['g1', false], ['g2', false], [null, false],
  ]);
  f.song.tracks[3].groupTrack = { name: 'Foreign', handle: { id: 'foreign' } };
  const unknown = f.coordinator.snapshot();
  assert.equal(unknown.trackTreeValid, false);
  assert.deepEqual(unknown.tracks.map(track => [track.groupId, track.isGroup]), [
    [null, false], [null, false], [null, false], [null, false], [null, false],
  ]);
});

test('the cohort request has one exact schema, one exact scope and one exact cohort', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const scope = f.coordinator.scopeToken();
  const base = armRequest(scope, refs.group, [refs.drums, refs.bass]);
  const bad = [
    {}, { ...base, extra: true }, { ...base, armMode: 'both' }, { ...base, enabled: 'yes' },
    { ...base, scope: 'other' }, { ...base, group: { index: 0, id: 'g1' } },
    { ...base, tracks: [{ index: 2, id: 't1', name: 'Drums', extra: true }] },
  ];
  for (const request of bad) {
    await assert.rejects(f.coordinator.armTracks(request, f.context), /ARGUMENTS|SCOPE|IDENTITY/);
  }
  assert.deepEqual(f.song.tracks.map(track => track.arm), [null, null, false, false, false]);
});

/** An ARM setter the test can count; it may change the host on the way. */
function armSetter(track, onSet) {
  let value = track.arm;
  const state = { writes: 0, get value() { return value; } };
  Object.defineProperty(track, 'arm', {
    get: () => value,
    set: next => { state.writes++; value = next; onSet?.(next); },
    configurable: true,
  });
  return state;
}

test('a reparenting that keeps the cohort is refused before the next setter', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const group = f.song.tracks[0], bass = f.song.tracks[3];
  // The cohort below the group stays the same, the hierarchy does not.
  const drums = armSetter(f.song.tracks[2], value => { if (value) bass.groupTrack = group; });
  await assert.rejects(f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context), /IDENTITY/);
  assert.equal(drums.writes, 1, 'the first setter of the cohort ran');
  assert.equal(bass.arm, false, 'the second setter of the cohort never runs');
});

test('a topology change during the final confirmation is refused', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const group = f.song.tracks[0], bass = f.song.tracks[3];
  const drums = armSetter(f.song.tracks[2]);
  const send = f.osc.send;
  f.osc.send = (address, args = []) => {
    // The hierarchy changes under the confirmation that follows the write.
    if (address === REC_PREFLIGHT.trackArm && drums.writes > 0) bass.groupTrack = group;
    return send(address, args);
  };
  await assert.rejects(f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context), /IDENTITY/);
  assert.equal(drums.writes, 1);
  assert.equal(bass.arm, true, 'the cohort was written before the topology changed');
});

test('a peer disarmed by the host leaves the ARM unknown and is never replayed', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const keys = f.song.tracks[4];
  keys.arm = true;
  const drums = armSetter(f.song.tracks[2], value => { if (value) keys.arm = false; });
  const bass = armSetter(f.song.tracks[3]);
  await assert.rejects(f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context), /ARM_COLLATERAL_DISARM/);
  const state = f.coordinator.snapshot();
  assert.deepEqual(state.tracks.map(track => track.arm), [null, null, null, null, null], 'the ARM vector is unknown');
  assert.equal(drums.writes, 1, 'the failed write is never replayed');
  assert.equal(bass.writes, 1);
  assert.equal(keys.arm, false, 'the host disarmed the peer and nothing replays it');
});

test('a setter that throws after it applied leaves the ARM unknown', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const drums = armSetter(f.song.tracks[2], () => { throw Error('the host refused the write'); });
  await assert.rejects(f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context), /the host refused the write/);
  const state = f.coordinator.snapshot();
  assert.deepEqual(state.tracks.map(track => track.arm), [null, null, null, null, null], 'the ARM vector is unknown');
  assert.equal(drums.writes, 1, 'the write is never retried');
  assert.equal(drums.value, true, 'the applied write is not rolled back');
});

test('a vanished Song never masks the error that failed the write', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const original = Error('the host refused the write');
  // The setter applies and then the Song itself disappears: the cleanup of
  // the failed write must not report the vanished Song instead.
  const drums = armSetter(f.song.tracks[2], () => { f.breakSong(); throw original; });
  const failure = await f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context)
    .then(() => null, error => error);
  assert.equal(failure, original, 'the error that failed the write is the one reported');
  assert.equal(drums.writes, 1, 'the write is never retried');
  assert.equal(drums.value, true, 'the applied write is not rolled back');
  f.mendSong();
});

test('a STOP that takes over keeps the ARM observations it owns', async t => {
  const f = groupFixture(t);
  f.song.tracks = groupSong().tracks;
  const drums = armSetter(f.song.tracks[2]);
  let stop = null;
  const incoming = f.osc.handleIncoming.bind(f.osc);
  f.osc.handleIncoming = message => {
    incoming(message);
    // The STOP arrives with the last answer of the confirmation.
    if (!stop && drums.writes > 0
      && message.address === REC_PREFLIGHT.trackArm && message.args[0]?.value === 4) stop = f.coordinator.stop(f.context);
  };
  const action = f.coordinator.armTracks(
    armRequest(f.coordinator.scopeToken(), refs.group, [refs.drums, refs.bass]), f.context);
  await assert.rejects(action, /STOPPED/);
  assert.ok(stop, 'the STOP took the write over');
  const state = f.coordinator.snapshot();
  assert.deepEqual(state.tracks.map(track => track.arm), [null, null, true, true, false],
    'the ARM observed after the STOP is not erased by the aborted write');
  await stop;
});
