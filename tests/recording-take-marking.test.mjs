// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK,
  hostClip,
  hostLane,
  hostTrack,
  delayedClip,
  throwingClip,
  silentClip,
  makeDeferred,
  makeWorld,
  context,
} from './recording-take-marking-fixtures.mjs';

test('a marked clip carries the chosen prefix and only that clip changes', async () => {
  const world = makeWorld();
  const result = await world.marking.mark(world.request('good'), context());
  assert.equal(result.scope, 'scope-1');
  assert.equal(result.track.id, 'track-1');
  assert.equal(result.lane.id, 'lane-1');
  assert.equal(result.clip.name, '[RC:GOOD] Take 1');
  assert.equal(result.clip.mark, 'good');
  assert.equal(result.clip.id, 'clip-1');
  assert.equal(result.clip.startTime, 0);
  assert.equal(result.clip.endTime, 4);
  assert.equal(result.clip.reference, world.request('good').clip.reference);
  assert.deepEqual(world.writes, ['clip.name'], 'exactly one write');
  assert.equal(world.clips[1].name, 'Take 2', 'the other clip is untouched');
  assert.equal(world.lane.name, 'Lane 1');
  assert.equal(world.track.name, 'Input');
});

test('a review mark replaces a good mark and keeps the original name', async () => {
  const world = makeWorld();
  await world.marking.mark(world.request('good'), context());
  const result = await world.marking.mark(world.request('review'), context());
  assert.equal(result.clip.name, '[RC:REVIEW] Take 1');
  assert.equal(result.clip.mark, 'review');
  assert.deepEqual(world.writes, ['clip.name', 'clip.name']);
});

test('clearing a mark removes only the known prefix', async () => {
  const world = makeWorld();
  await world.marking.mark(world.request('review'), context());
  const result = await world.marking.mark(world.request(null), context());
  assert.equal(result.clip.name, 'Take 1');
  assert.equal(result.clip.mark, null);
  assert.deepEqual(world.writes, ['clip.name', 'clip.name']);
});

test('the same note and a name without a prefix write nothing at all', async () => {
  const world = makeWorld();
  await world.marking.mark(world.request('good'), context());
  const same = await world.marking.mark(world.request('good'), context());
  assert.equal(same.clip.name, '[RC:GOOD] Take 1');
  assert.deepEqual(world.writes, ['clip.name'], 'the same note is a no-op');
  const cleared = await world.marking.mark(world.request(null), context());
  assert.equal(cleared.clip.name, 'Take 1');
  assert.deepEqual(world.writes, ['clip.name', 'clip.name'], 'clearing an unmarked name is a no-op');
});

test('a hostile name is plain text and is preserved byte for byte', async () => {
  const world = makeWorld();
  const hostile = '<img src=x onerror="alert(1)">';
  world.clips[0].state.name = hostile;
  const result = await world.marking.mark(world.request('good'), context());
  assert.equal(result.clip.name, '[RC:GOOD] ' + hostile);
  const cleared = await world.marking.mark(world.request(null), context());
  assert.equal(cleared.clip.name, hostile, 'the original name comes back unchanged');
});

test('a stacked prefix, a control character and an overlong name are refused', async () => {
  const world = makeWorld();
  world.clips[0].state.name = '[RC:GOOD] [RC:REVIEW] Take 1';
  await assert.rejects(() => world.marking.mark(world.request('review'), context()), /REC:TAKE_NAME/);
  world.clips[0].state.name = 'Take' + String.fromCharCode(1) + ' 1';
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:TAKE_NAME/);
  world.clips[0].state.name = 'x'.repeat(1020);
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:TAKE_NAME/);
  world.clips[0].state.name = '[RC:GOOD] ';
  await assert.rejects(() => world.marking.mark(world.request('review'), context()), /REC:TAKE_NAME/);
  assert.deepEqual(world.writes, [], 'a refused name changes nothing');
});

test('a wrong scope, a stale session or a wrong schema is refused', async () => {
  const world = makeWorld();
  await assert.rejects(() => world.marking.mark(world.request('good', { scope: 'other' }), context()), /REC:SCOPE/);
  await assert.rejects(() => world.marking.mark(world.request('good'), { clientId: 'x', isCurrent: () => false }), /REC:SESSION/);
  await assert.rejects(() => world.marking.mark(undefined, context()), /REC:ARGUMENTS/);
  await assert.rejects(() => world.marking.mark(world.request('good', { extra: true }), context()), /REC:ARGUMENTS/);
  await assert.rejects(() => world.marking.mark(world.request('good', { mark: 'maybe' }), context()), /REC:ARGUMENTS/);
  await assert.rejects(() => world.marking.mark(world.request('good', { clip: { index: 0, id: 'clip-1', name: 'Take 1', startTime: 0, endTime: 4 } }), context()), /REC:ARGUMENTS/);
  assert.deepEqual(world.writes, []);
});

test('a stale, unknown or running transport is refused before any write', async () => {
  for (const transport of [{ fresh: false }, { recordMode: null }, { isPlaying: true }, { recordMode: true }]) {
    const world = makeWorld({ transport });
    await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:(UNKNOWN|NOT_STOPPED)/);
    assert.deepEqual(world.writes, []);
  }
});

test('an active REC attempt is refused and the transport is only observed', async () => {
  const world = makeWorld({ attemptActive: true });
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:STOP_REQUIRED/);
  assert.deepEqual(world.writes, []);
  const idle = makeWorld();
  await idle.marking.mark(idle.request('good'), context());
  assert.ok(idle.readTransport.calls.length >= 1, 'the transport is read');
  assert.deepEqual([...new Set(idle.readTransport.calls)], ['read'], 'the transport is never driven');
});

test('a second mark while one runs is refused', async () => {
  const world = makeWorld();
  const first = world.marking.mark(world.request('good'), context());
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:BUSY/);
  await first;
  assert.deepEqual(world.writes, ['clip.name']);
});

test('an external rename, move, reorder or delete is refused', async () => {
  const renamed = makeWorld();
  const renamedArgs = renamed.request('good');
  renamed.clips[0].state.name = 'Renamed';
  await assert.rejects(() => renamed.marking.mark(renamedArgs, context()), /REC:IDENTITY/);
  const moved = makeWorld();
  const movedArgs = moved.request('good');
  moved.clips[0].state.startTime = 8;
  await assert.rejects(() => moved.marking.mark(movedArgs, context()), /REC:IDENTITY/);
  const reordered = makeWorld();
  const reorderedArgs = reordered.request('good');
  reordered.lane.clips.reverse();
  await assert.rejects(() => reordered.marking.mark(reorderedArgs, context()), /REC:IDENTITY/);
  const deleted = makeWorld();
  const deletedArgs = deleted.request('good');
  deleted.lane.clips.splice(0, 1);
  await assert.rejects(() => deleted.marking.mark(deletedArgs, context()), /REC:IDENTITY/);
  assert.deepEqual(renamed.writes, []);
  assert.deepEqual(moved.writes, []);
});

test('a clip that reuses the handle, the name and the span is refused before the setter', async () => {
  const world = makeWorld();
  const args = world.request('good');
  world.lane.clips[0] = hostClip('clip-1', 'Take 1', 0, 4, world.writes);
  await assert.rejects(() => world.marking.mark(args, context()), /REC:IDENTITY/);
  assert.deepEqual(world.writes, [], 'the replaced clip is never written');
});

test('a mark needs the reference of the very same chain', async () => {
  const world = makeWorld();
  const listed = world.catalog.list({ scope: 'scope-1', track: { ...TRACK }, laneOffset: 0, clipOffset: 0 });
  const args = world.request('good');
  assert.equal(args.clip.reference, listed.lanes[0].clips[0].reference);
  const result = await world.marking.mark(args, context());
  assert.equal(result.clip.reference, listed.lanes[0].clips[0].reference);
  const foreign = world.request('good');
  foreign.clip.reference = 'scope-1#someone-else';
  await assert.rejects(() => world.marking.mark(foreign, context()), /REC:IDENTITY/);
});

test('a delayed reflection is confirmed', async () => {
  const world = makeWorld();
  world.lane.clips[0] = delayedClip('clip-1', 'Take 1', world.writes);
  const result = await world.marking.mark(world.request('good'), context());
  assert.equal(result.clip.name, '[RC:GOOD] Take 1');
  assert.deepEqual(world.writes, ['clip.name']);
});

test('a setter that throws after it applied leaves the outcome unknown', async () => {
  const world = makeWorld();
  world.lane.clips[0] = throwingClip('clip-1', 'Take 1', world.writes);
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:UNKNOWN/);
  assert.deepEqual(world.writes, ['clip.name'], 'the write is never retried');
  assert.equal(world.lane.clips[0].name, '[RC:GOOD] Take 1', 'the applied name is not rolled back');
});

test('a name that never reflects ends as unknown and is never repeated', async () => {
  const world = makeWorld();
  world.lane.clips[0] = silentClip('clip-1', 'Take 1', world.writes);
  await assert.rejects(() => world.marking.mark(world.request('good'), context()), /REC:UNKNOWN/);
  assert.deepEqual(world.writes, ['clip.name'], 'the write is never repeated');
});

test('a cancelled mark never writes and never reports success', async () => {
  const world = makeWorld();
  const pending = world.marking.mark(world.request('good'), context());
  world.marking.cancel();
  await assert.rejects(() => pending, /REC:/);
  assert.deepEqual(world.writes, []);
});

test('a lost session ends the mark without a write', async () => {
  const world = makeWorld();
  let current = true;
  const pending = world.marking.mark(world.request('good'), { clientId: 'phone', isCurrent: () => current });
  current = false;
  await assert.rejects(() => pending, /REC:/);
  assert.deepEqual(world.writes, []);
});

test('rename of track and lane during transport read rejects before setter', async () => {
  const deferredTrack = makeDeferred();
  const worldTrack = makeWorld({
    readTransport: async () => {
      await deferredTrack.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingTrack = worldTrack.marking.mark(worldTrack.request('good'), context());
  worldTrack.track.state.name = 'Renamed Track';
  deferredTrack.resolve();
  await assert.rejects(() => pendingTrack, /REC:IDENTITY/);
  assert.deepEqual(worldTrack.writes, [], 'number of name setters=0 before conflict, no other host writes');

  const deferredLane = makeDeferred();
  const worldLane = makeWorld({
    readTransport: async () => {
      await deferredLane.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingLane = worldLane.marking.mark(worldLane.request('good'), context());
  worldLane.lane.state.name = 'Renamed Lane';
  deferredLane.resolve();
  await assert.rejects(() => pendingLane, /REC:IDENTITY/);
  assert.deepEqual(worldLane.writes, [], 'number of name setters=0 before conflict, no other host writes');
});

test('track and lane handle changes while pending reject before setter', async () => {
  const deferredTrackHandle = makeDeferred();
  const worldTrackHandle = makeWorld({
    readTransport: async () => {
      await deferredTrackHandle.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingTrackHandle = worldTrackHandle.marking.mark(worldTrackHandle.request('good'), context());
  worldTrackHandle.track.handle = { id: 'track-replaced' };
  deferredTrackHandle.resolve();
  await assert.rejects(() => pendingTrackHandle, /REC:IDENTITY/);
  assert.deepEqual(worldTrackHandle.writes, []);

  const deferredLaneHandle = makeDeferred();
  const worldLaneHandle = makeWorld({
    readTransport: async () => {
      await deferredLaneHandle.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingLaneHandle = worldLaneHandle.marking.mark(worldLaneHandle.request('good'), context());
  worldLaneHandle.lane.handle = { id: 'lane-replaced' };
  deferredLaneHandle.resolve();
  await assert.rejects(() => pendingLaneHandle, /REC:IDENTITY/);
  assert.deepEqual(worldLaneHandle.writes, []);
});

test('duplicate track and lane handle IDs while pending reject before setter', async () => {
  const deferredTrackDup = makeDeferred();
  const worldTrackDup = makeWorld({
    readTransport: async () => {
      await deferredTrackDup.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingTrackDup = worldTrackDup.marking.mark(worldTrackDup.request('good'), context());
  worldTrackDup.song.tracks.push(hostTrack([], { id: 'track-1' }, worldTrackDup.writes));
  deferredTrackDup.resolve();
  await assert.rejects(() => pendingTrackDup, /REC:IDENTITY/);
  assert.deepEqual(worldTrackDup.writes, []);

  const deferredLaneDup = makeDeferred();
  const worldLaneDup = makeWorld({
    readTransport: async () => {
      await deferredLaneDup.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pendingLaneDup = worldLaneDup.marking.mark(worldLaneDup.request('good'), context());
  worldLaneDup.track.takeLanes.push(hostLane('lane-1', 'Duplicate Lane', [], worldLaneDup.writes));
  deferredLaneDup.resolve();
  await assert.rejects(() => pendingLaneDup, /REC:IDENTITY/);
  assert.deepEqual(worldLaneDup.writes, []);
});

test('replaced chain while transport read is pending rejects before setter', async () => {
  const deferred = makeDeferred();
  const world = makeWorld({
    readTransport: async () => {
      await deferred.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pending = world.marking.mark(world.request('good'), context());
  world.track.takeLanes[0] = hostLane('lane-1', 'Lane 1', world.clips, world.writes);
  deferred.resolve();
  await assert.rejects(() => pending, /REC:IDENTITY/);
  assert.deepEqual(world.writes, [], 'no host writes before setter');
});

test('scope loss while transport read is pending rejects before setter', async () => {
  const deferred = makeDeferred();
  const world = makeWorld({
    readTransport: async () => {
      await deferred.promise;
      return {
        recordMode: { value: false, observedAt: Date.now(), fresh: true },
        isPlaying: { value: false, observedAt: Date.now(), fresh: true },
      };
    },
  });
  const pending = world.marking.mark(world.request('good'), context());
  world.setScope('scope-lost');
  deferred.resolve();
  await assert.rejects(() => pending, /REC:SCOPE/);
  assert.deepEqual(world.writes, [], 'no host writes before setter');
});

test('delayed name reflection with transport start during confirmation leaves exactly 1 write and unknown', async () => {
  const transportState = { recordMode: false, isPlaying: false, fresh: true };
  const readTransport = async () => ({
    recordMode: { value: transportState.recordMode, observedAt: Date.now(), fresh: transportState.fresh },
    isPlaying: { value: transportState.isPlaying, observedAt: Date.now(), fresh: transportState.fresh },
  });
  const world = makeWorld({ readTransport });
  world.lane.clips[0] = delayedClip('clip-1', 'Take 1', world.writes, 50);
  const pending = world.marking.mark(world.request('good'), context());
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(world.writes, ['clip.name']);
  transportState.isPlaying = true;
  await assert.rejects(() => pending, /REC:UNKNOWN/);
  assert.deepEqual(world.writes, ['clip.name'], 'exactly 1 unknown after issuance, no other host writes');
});

test('hung transport read is bounded by confirm deadline and fails with unknown', async () => {
  const hungTransport = () => new Promise(() => {});
  const world = makeWorld({ readTransport: hungTransport, confirmMs: 50 });
  const pending = world.marking.mark(world.request('good'), context());
  await assert.rejects(() => pending, /REC:UNKNOWN/);
  assert.deepEqual(world.writes, [], 'no host writes when read hangs');
});

test('STOP cancellation after setter before reflection leaves exactly 1 write and cancels', async () => {
  const world = makeWorld();
  world.lane.clips[0] = delayedClip('clip-1', 'Take 1', world.writes, 80);
  const pending = world.marking.mark(world.request('good'), context());
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(world.writes, ['clip.name']);
  world.marking.cancel();
  await assert.rejects(() => pending, /REC:MARK_CANCELED/);
  assert.deepEqual(world.writes, ['clip.name'], 'exactly 1 unknown after issuance, no retry/rollback');
});

test('same-mark malformed names reject before setter and valid identical mark is setter-free', async () => {
  const malformed = [
    { name: '[RC:GOOD] [RC:REVIEW] Take 1', mark: 'good' },
    { name: '[RC:GOOD] Take\x01 1', mark: 'good' },
    { name: '[RC:GOOD] ', mark: 'good' },
    { name: '[RC:GOOD] ' + 'x'.repeat(1020), mark: 'good' },
    { name: '[RC:REVIEW] [RC:GOOD] Take 1', mark: 'review' },
    { name: 'Take\x02 1', mark: null },
    { name: '', mark: null },
    { name: 'x'.repeat(1025), mark: null },
  ];
  for (const { name, mark } of malformed) {
    const world = makeWorld();
    world.clips[0].state.name = name;
    await assert.rejects(
      () => world.marking.mark(world.request(mark), context()),
      /REC:TAKE_NAME/,
      `expected REC:TAKE_NAME for ${JSON.stringify(name)}`,
    );
    assert.deepEqual(world.writes, [], 'no host writes for malformed name');
  }

  const validWorld = makeWorld();
  validWorld.clips[0].state.name = '[RC:GOOD] Take 1';
  const result = await validWorld.marking.mark(validWorld.request('good'), context());
  assert.equal(result.clip.name, '[RC:GOOD] Take 1');
  assert.deepEqual(validWorld.writes, [], 'valid identical mark is setter-free');
});

test('an already-expired or already-aborted operation does not issue a new transport read', async () => {
  const expiredWorld = makeWorld({ confirmMs: 0 });
  await assert.rejects(
    () => expiredWorld.marking.mark(expiredWorld.request('good'), context()),
    /REC:UNKNOWN/,
  );
  assert.equal(expiredWorld.readTransport.calls.length, 0, 'expired deadline issues no transport read');
  assert.deepEqual(expiredWorld.writes, []);

  const abortedWorld = makeWorld();
  let readsAfterWrite = 0;
  let writtenName = null;
  abortedWorld.lane.clips[0] = {
    get name() {
      if (writtenName === null) return 'Take 1';
      readsAfterWrite += 1;
      if (readsAfterWrite === 2) abortedWorld.marking.cancel();
      return writtenName;
    },
    set name(value) {
      abortedWorld.writes.push('clip.name');
      writtenName = value;
    },
    get startTime() { return 0; },
    get endTime() { return 4; },
    handle: { id: 'clip-1' },
  };
  await assert.rejects(
    () => abortedWorld.marking.mark(abortedWorld.request('good'), context()),
    /REC:MARK_CANCELED/,
  );
  assert.equal(abortedWorld.readTransport.calls.length, 2, 'aborted confirmation issues no new transport read');
  assert.deepEqual(abortedWorld.writes, ['clip.name']);
});

test('late rejected transport reads after timeout or cancel do not cause unhandledRejection', async () => {
  const timeoutDeferred = makeDeferred();
  const timeoutWorld = makeWorld({
    confirmMs: 15,
    readTransport: () => timeoutDeferred.promise,
  });
  await assert.rejects(
    () => timeoutWorld.marking.mark(timeoutWorld.request('good'), context()),
    /REC:UNKNOWN/,
  );
  timeoutDeferred.reject(new Error('late transport error after timeout'));

  const cancelDeferred = makeDeferred();
  const cancelWorld = makeWorld({
    readTransport: () => cancelDeferred.promise,
  });
  const pendingCancel = cancelWorld.marking.mark(cancelWorld.request('good'), context());
  cancelWorld.marking.cancel();
  await assert.rejects(() => pendingCancel, /REC:MARK_CANCELED/);
  cancelDeferred.reject(new Error('late transport error after cancel'));

  const immediateAbortDeferred = makeDeferred();
  const immediateAbortWorld = makeWorld({
    readTransport: () => {
      immediateAbortWorld.marking.cancel();
      return immediateAbortDeferred.promise;
    },
  });
  await assert.rejects(
    () => immediateAbortWorld.marking.mark(immediateAbortWorld.request('good'), context()),
    /REC:MARK_CANCELED/,
  );
  immediateAbortDeferred.reject(new Error('late transport error after immediate abort'));

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(timeoutWorld.writes, []);
  assert.deepEqual(cancelWorld.writes, []);
  assert.deepEqual(immediateAbortWorld.writes, []);
});
