// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordingWaveform } from '../src/live/recording-waveform.ts';

/** The SDK keeps the handle in `handle.id`; the fixtures use the real shape. */
class FakeAudioTrack {
  constructor(id, name, clips = []) {
    Object.assign(this, { handle: { id }, name, arrangementClips: clips });
  }
}

class FakeAudioClip {
  constructor(id, name, startTime, endTime) {
    Object.assign(this, { handle: { id }, name, startTime, endTime });
  }
}

/** The injected audio predicates stand in for the SDK class guards. */
const isAudioTrack = value => value instanceof FakeAudioTrack;
const isAudioClip = value => value instanceof FakeAudioClip;

/** The fresh stopped observation of the host, with its real wrappers. */
function stopped() {
  const off = { value: false, fresh: true, observedAt: 1 };
  return { connected: true, isPlaying: off, recordMode: off };
}

function wav(values) {
  const body = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => body.writeInt16LE(Math.round(value * 32767), index * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + body.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(48000, 24);
  head.writeUInt32LE(96000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(body.length, 40);
  return Buffer.concat([head, body]);
}

async function tempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'rc-surface-waveform-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

/** The service of one fixture state. */
function buildService(state, overrides = {}) {
  return new RecordingWaveform({
    getSong: () => state.song,
    getScope: () => state.scope,
    getTransport: async () => state.transport,
    getAttemptActive: () => state.attemptActive,
    getTempDirectory: () => state.temp,
    render: (host, startTime, endTime) => state.render(host, startTime, endTime),
    isAudioTrack,
    isAudioClip,
    ...overrides,
  });
}

function fixture(root, overrides = {}) {
  const clip = new FakeAudioClip('clip-1', 'Take', 0, 8);
  const track = new FakeAudioTrack('track-1', 'Guitar', [clip]);
  const rendered = [];
  const state = {
    song: { tracks: [track] },
    clip,
    track,
    scope: 'scope-1',
    temp: root,
    transport: stopped(),
    attemptActive: false,
    render: async (host, startTime, endTime) => {
      rendered.push({ host, startTime, endTime });
      const path = join(root, `render-${rendered.length}.wav`);
      await writeFile(path, wav([0.5, -0.5, 0.25, 0]));
      return path;
    },
  };
  const request = {
    scope: 'scope-1',
    track: { index: 0, id: 'track-1', name: 'Guitar' },
    clip: { index: 0, id: 'clip-1', name: 'Take', startTime: 0, endTime: 8 },
    startTime: 0,
    endTime: 4,
  };
  return { service: buildService(state, overrides), state, rendered, request, context: { isCurrent: () => true } };
}

test('the waveform of one exact clip interval is read and bounded', async t => {
  const root = await tempRoot(t);
  const { service, state, rendered, request, context } = fixture(root);
  const result = await service.get(request, context);
  assert.deepEqual(Object.keys(result).sort(), ['clip', 'endTime', 'peaks', 'scope', 'startTime', 'track']);
  assert.equal(result.scope, 'scope-1');
  assert.deepEqual(result.track, { index: 0, id: 'track-1', name: 'Guitar' });
  assert.deepEqual(result.clip, { index: 0, id: 'clip-1', name: 'Take', startTime: 0, endTime: 8 });
  assert.equal(result.startTime, 0);
  assert.equal(result.endTime, 4);
  assert.ok(result.peaks.length <= 512);
  for (const peak of result.peaks) assert.ok(Number.isFinite(peak) && peak >= 0 && peak <= 1);
  assert.ok(Math.max(...result.peaks) > 0.49);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].host, state.track, 'the verified track reaches the renderer');
  assert.equal(rendered[0].startTime, 0);
  assert.equal(rendered[0].endTime, 4);
  assert.equal('filePath' in state.clip, false, 'the original clip file is never read');
});

test('the transport is observed before the render and before the publication', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  let reads = 0;
  let readsAtRender = 0;
  const original = state.render;
  state.render = async (host, startTime, endTime) => {
    readsAtRender = reads;
    return original(host, startTime, endTime);
  };
  const service = buildService(state, {
    getTransport: async () => {
      reads += 1;
      return stopped();
    },
  });
  await service.get(request, context);
  assert.ok(readsAtRender >= 1, 'the stopped observation is awaited before the render');
  assert.ok(reads >= 3, 'the transport is observed before the render, before the file and before the publication');
});

test('the request schema is refused before the host is asked', async t => {
  const root = await tempRoot(t);
  const { service, rendered, request, context } = fixture(root);
  for (const bad of [
    {},
    { ...request, extra: true },
    { ...request, scope: 7 },
    { ...request, track: { index: -1, id: 'track-1', name: 'Guitar' } },
    { ...request, track: { index: 0, id: '', name: 'Guitar' } },
    { ...request, track: { index: 0, id: 'track-1' } },
    { ...request, clip: { index: 0, id: 'clip-1', name: 'Take', startTime: 0 } },
    { ...request, startTime: '0' },
    { ...request, endTime: 0 },
  ]) {
    await assert.rejects(() => service.get(bad, context), /REC:ARGUMENTS/);
  }
  await assert.rejects(() => service.get(request), /REC:WAVEFORM_CONTEXT/);
  await assert.rejects(() => service.get(request, { isCurrent: () => false }), /REC:WAVEFORM_CONTEXT/);
  assert.equal(rendered.length, 0, 'a refused request never renders');
});

test('the interval must be finite, ordered and inside the current clip', async t => {
  const root = await tempRoot(t);
  const { service, rendered, request, context } = fixture(root);
  await assert.rejects(() => service.get({ ...request, startTime: -1 }, context), /REC:WAVEFORM_INTERVAL/);
  await assert.rejects(() => service.get({ ...request, endTime: 9 }, context), /REC:WAVEFORM_INTERVAL/);
  await assert.rejects(() => service.get({ ...request, startTime: 0, endTime: 129 }, context), /REC:WAVEFORM_INTERVAL/);
  await assert.rejects(() => service.get({ ...request, startTime: 0, endTime: 128 }, context), /REC:WAVEFORM_INTERVAL/);
  assert.equal(rendered.length, 0);
});

test('a stale scope, a foreign track or a foreign clip is refused', async t => {
  const root = await tempRoot(t);
  const { service, state, rendered, request, context } = fixture(root);
  await assert.rejects(() => service.get({ ...request, scope: 'other-scope' }, context), /REC:WAVEFORM_SCOPE/);
  await assert.rejects(() => service.get({ ...request, track: { index: 0, id: 'other', name: 'Guitar' } }, context), /REC:WAVEFORM_IDENTITY/);
  await assert.rejects(() => service.get({ ...request, track: { index: 0, id: 'track-1', name: 'Other' } }, context), /REC:WAVEFORM_IDENTITY/);
  await assert.rejects(() => service.get({ ...request, clip: { index: 0, id: 'clip-1', name: 'Take', startTime: 1, endTime: 8 } }, context), /REC:WAVEFORM_IDENTITY/);
  state.song = { tracks: [new FakeAudioTrack('track-2', 'Guitar', [new FakeAudioClip('clip-1', 'Take', 0, 8)])] };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_IDENTITY/);
  assert.equal(rendered.length, 0);
});

test('a duplicate handle id is refused', async t => {
  const root = await tempRoot(t);
  const { service, state, rendered, request, context } = fixture(root);
  state.song = { tracks: [state.track, new FakeAudioTrack('track-1', 'Guitar', [])] };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_IDENTITY/);
  const twin = fixture(root);
  twin.state.track.arrangementClips = [twin.state.clip, new FakeAudioClip('clip-1', 'Take', 0, 8)];
  await assert.rejects(() => twin.service.get(twin.request, twin.context), /REC:WAVEFORM_IDENTITY/);
  assert.equal(rendered.length, 0);
});

test('a replaced song, track or clip is refused even with the same handle id', async t => {
  const root = await tempRoot(t);
  const late = async (state, change) => {
    state.render = async () => {
      change();
      const path = join(root, 'late.wav');
      await writeFile(path, wav([0.5]));
      return path;
    };
  };
  const replacedSong = fixture(root);
  await late(replacedSong.state, () => {
    replacedSong.state.song = { tracks: [new FakeAudioTrack('track-1', 'Guitar', [new FakeAudioClip('clip-1', 'Take', 0, 8)])] };
  });
  await assert.rejects(() => replacedSong.service.get(replacedSong.request, replacedSong.context), /REC:WAVEFORM_IDENTITY/);
  const replacedTrack = fixture(root);
  await late(replacedTrack.state, () => {
    replacedTrack.state.song = { tracks: [new FakeAudioTrack('track-1', 'Guitar', [replacedTrack.state.clip])] };
  });
  await assert.rejects(() => replacedTrack.service.get(replacedTrack.request, replacedTrack.context), /REC:WAVEFORM_IDENTITY/);
  const replacedClip = fixture(root);
  await late(replacedClip.state, () => {
    replacedClip.state.track.arrangementClips = [new FakeAudioClip('clip-1', 'Take', 0, 8)];
  });
  await assert.rejects(() => replacedClip.service.get(replacedClip.request, replacedClip.context), /REC:WAVEFORM_IDENTITY/);
});

test('a MIDI track and a MIDI clip are refused', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  const never = async () => { throw Error('the renderer must not be reached'); };
  const midi = { handle: { id: 'track-1' }, name: 'Guitar', arrangementClips: [] };
  const service2 = buildService({ ...state, song: { tracks: [midi] } }, { render: never });
  await assert.rejects(() => service2.get(request, context), /REC:WAVEFORM_TRACK/);
  const midiClip = { handle: { id: 'clip-1' }, name: 'Take', startTime: 0, endTime: 8 };
  const mixed = { tracks: [new FakeAudioTrack('track-1', 'Guitar', [midiClip])] };
  const service3 = buildService({ ...state, song: mixed }, { render: never });
  await assert.rejects(() => service3.get(request, context), /REC:WAVEFORM_CLIP/);
});

test('a playing, recording, disconnected or stale host is refused', async t => {
  const root = await tempRoot(t);
  const { service, state, rendered, request, context } = fixture(root);
  state.transport = { ...stopped(), isPlaying: { value: true, fresh: true, observedAt: 2 } };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_PLAYING/);
  state.transport = { ...stopped(), isPlaying: { value: false, fresh: false, observedAt: null } };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_PLAYING/);
  state.transport = { ...stopped(), isPlaying: { value: false, fresh: true, observedAt: null } };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_PLAYING/);
  state.transport = { ...stopped(), isPlaying: false };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_PLAYING/);
  state.transport = { ...stopped(), recordMode: { value: true, fresh: true, observedAt: 2 } };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_RECORDING/);
  state.transport = { ...stopped(), recordMode: false };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_RECORDING/);
  state.transport = { ...stopped(), connected: false };
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_TRANSPORT/);
  state.transport = stopped();
  state.attemptActive = true;
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_ACTIVE/);
  assert.equal(rendered.length, 0, 'a refused transport never renders');
});

test('a stale context, a running attempt or a failed read is refused after the read', async t => {
  const root = await tempRoot(t);
  const stale = fixture(root);
  let checks = 0;
  const staleContext = { isCurrent: () => checks++ < 2 };
  await assert.rejects(() => stale.service.get(stale.request, staleContext), /REC:WAVEFORM_CONTEXT/);
  assert.equal(stale.rendered.length, 0, 'a stale context never renders');
  const busy = fixture(root);
  let attempts = 0;
  const busyService = buildService(busy.state, {
    getAttemptActive: () => {
      attempts += 1;
      return attempts > 1;
    },
  });
  await assert.rejects(() => busyService.get(busy.request, busy.context), /REC:WAVEFORM_ACTIVE/);
  assert.equal(busy.rendered.length, 0, 'a running attempt never renders');
  const failed = fixture(root);
  const failedService = buildService(failed.state, {
    getTransport: async () => { throw new Error('the note lane did not answer'); },
  });
  await assert.rejects(() => failedService.get(failed.request, failed.context), /REC:WAVEFORM_TRANSPORT/);
  assert.equal(failed.rendered.length, 0, 'a failed read never renders');
});

test('a changed scope, song, clip or context retires the render', async t => {
  const root = await tempRoot(t);
  const late = async (state, change) => {
    state.render = async () => {
      change();
      const path = join(root, 'late.wav');
      await writeFile(path, wav([0.5]));
      return path;
    };
  };
  const scoped = fixture(root);
  await late(scoped.state, () => { scoped.state.scope = 'scope-2'; });
  await assert.rejects(() => scoped.service.get(scoped.request, scoped.context), /REC:WAVEFORM_SCOPE/);
  const changed = fixture(root);
  await late(changed.state, () => { changed.state.clip.startTime = 1; });
  await assert.rejects(() => changed.service.get(changed.request, changed.context), /REC:WAVEFORM_IDENTITY/);
  const renamed = fixture(root);
  await late(renamed.state, () => { renamed.state.track.name = 'Renamed'; });
  await assert.rejects(() => renamed.service.get(renamed.request, renamed.context), /REC:WAVEFORM_IDENTITY/);
  const stale = fixture(root);
  await late(stale.state, () => {});
  let checks = 0;
  await assert.rejects(() => stale.service.get(stale.request, { isCurrent: () => (checks++ === 0) }), /REC:WAVEFORM_CONTEXT/);
});

test('only a file of this job inside the own temp root is read', async t => {
  const root = await tempRoot(t);
  const outside = await mkdtemp(join(tmpdir(), 'rc-surface-waveform-outside-'));
  t.after(async () => {
    await rm(outside, { recursive: true, force: true });
  });
  const outsideFile = join(outside, 'other.wav');
  await writeFile(outsideFile, wav([0.5]));
  const service = fixture(root);
  service.state.render = async () => outsideFile;
  await assert.rejects(() => service.service.get(service.request, service.context), /REC:WAVEFORM_FILE/);
  const sibling = join(root, '..', `${root.split(/[\\/]/).pop()}-sibling`);
  await mkdir(sibling, { recursive: true });
  const siblingFile = join(sibling, 'other.wav');
  await writeFile(siblingFile, wav([0.5]));
  const siblingService = fixture(root);
  siblingService.state.render = async () => siblingFile;
  await assert.rejects(() => siblingService.service.get(siblingService.request, siblingService.context), /REC:WAVEFORM_FILE/);
  const relative = fixture(root);
  relative.state.render = async () => 'render.wav';
  await assert.rejects(() => relative.service.get(relative.request, relative.context), /REC:WAVEFORM_FILE/);
});

test('a symlinked file and a redirected directory are refused', async t => {
  const root = await tempRoot(t);
  const outside = await mkdtemp(join(tmpdir(), 'rc-surface-waveform-link-'));
  t.after(async () => {
    await rm(outside, { recursive: true, force: true });
  });
  const target = join(outside, 'other.wav');
  await writeFile(target, wav([0.5]));
  // A file symlink needs a privilege that a Windows host does not grant to
  // every process: the proof is only claimed where the host allows it.
  let link;
  try {
    link = join(root, 'link.wav');
    await symlink(target, link);
  } catch {
    link = undefined;
    t.diagnostic('this host does not allow file symlinks');
  }
  if (link) {
    const linked = fixture(root);
    linked.state.render = async () => link;
    await assert.rejects(() => linked.service.get(linked.request, linked.context), /REC:WAVEFORM_FILE/);
  }
  // A directory junction is available on a Windows host without a privilege.
  const redirect = join(root, 'redirect');
  await symlink(outside, redirect, 'junction');
  const redirected = fixture(root);
  redirected.state.render = async () => join(redirect, 'other.wav');
  await assert.rejects(() => redirected.service.get(redirected.request, redirected.context), /REC:WAVEFORM_FILE/);
});

test('a replaced, oversized or unreadable file is refused', async t => {
  const root = await tempRoot(t);
  const replaced = fixture(root, {
    openFile: async () => ({
      stat: async () => ({ isFile: () => true, size: 44, dev: 1, ino: 987654 }),
      read: async () => ({ bytesRead: 0 }),
      close: async () => {},
    }),
  });
  await assert.rejects(() => replaced.service.get(replaced.request, replaced.context), /REC:WAVEFORM_FILE/);
  const bigPath = join(root, 'big.wav');
  await writeFile(bigPath, '');
  await truncate(bigPath, 33 * 1024 * 1024);
  const big = fixture(root);
  big.state.render = async () => bigPath;
  await assert.rejects(() => big.service.get(big.request, big.context), /REC:WAVEFORM_SIZE/);
  const junk = fixture(root);
  junk.state.render = async () => {
    const path = join(root, 'junk.wav');
    await writeFile(path, Buffer.from('not a wave at all'));
    return path;
  };
  await assert.rejects(() => junk.service.get(junk.request, junk.context), /REC:WAVEFORM_PARSE/);
});

test('the own temp root may not change or vanish while the job runs', async t => {
  const root = await tempRoot(t);
  const other = await tempRoot(t);
  const { state, rendered, request, context } = fixture(root);
  state.render = async () => {
    state.temp = other;
    const path = join(root, 'late.wav');
    await writeFile(path, wav([0.5]));
    return path;
  };
  await assert.rejects(() => buildService(state).get(request, context), /REC:WAVEFORM_TEMP/);
  const missing = fixture(root);
  missing.state.temp = undefined;
  await assert.rejects(() => buildService(missing.state).get(missing.request, missing.context), /REC:WAVEFORM_TEMP/);
  assert.equal(missing.rendered.length, 0, 'a missing temp root never renders');
});

test('a synchronous host failure is sanitized', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  state.render = () => { throw new Error('the renderer failed on C:\\secret\\path\\render.wav'); };
  await assert.rejects(() => buildService(state).get(request, context), (error) => {
    assert.equal(error.message, 'REC:WAVEFORM_RENDER');
    assert.ok(!error.message.includes('secret'), 'no path of the host reaches the client');
    assert.ok(!String(error.stack).includes('secret'), 'no stack of the host reaches the client');
    return true;
  });
});

test('one render is in flight and a cancelled render is retired', async t => {
  const root = await tempRoot(t);
  const { service, state, request, context } = fixture(root);
  let release;
  const hung = new Promise(resolve => {
    release = resolve;
  });
  state.render = async () => {
    await hung;
    const path = join(root, 'late.wav');
    await writeFile(path, wav([0.9]));
    return path;
  };
  const pending = service.get(request, context);
  const rejected = assert.rejects(() => pending, /REC:WAVEFORM_CANCELLED/);
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_BUSY/, 'two calls never pass the preflight together');
  service.cancel();
  await rejected;
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_BUSY/, 'the latch is held until the host job settles');
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  const result = await service.get(request, context);
  assert.ok(Math.max(...result.peaks) > 0.49, 'the late reply was retired and the new render is published');
});

test('a hung transport and a hung render are abandoned by the deadline', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  state.render = () => new Promise(() => {});
  const rendered = buildService(state, { render: () => state.render(), deadlineMs: 20 });
  await assert.rejects(() => rendered.get(request, context), /REC:WAVEFORM_TIMEOUT/);
  const transport = buildService(state, {
    getTransport: () => new Promise(() => {}),
    render: async () => { throw Error('the renderer must not be reached'); },
    deadlineMs: 20,
  });
  await assert.rejects(() => transport.get(request, context), /REC:WAVEFORM_TIMEOUT/);
});

test('a file read that never answers is abandoned by the deadline', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  const service = buildService(state, {
    deadlineMs: 40,
    openFile: async path => {
      const info = await lstat(path);
      return {
        stat: async () => ({ isFile: () => true, size: info.size, dev: info.dev, ino: info.ino }),
        read: () => new Promise(() => {}),
        close: async () => {},
      };
    },
  });
  await assert.rejects(() => service.get(request, context), /REC:WAVEFORM_TIMEOUT/);
});

test('a late host reply is retired and never published', async t => {
  const root = await tempRoot(t);
  const { state, request, context } = fixture(root);
  let release;
  const hung = new Promise(resolve => {
    release = resolve;
  });
  const original = state.render;
  state.render = async () => {
    await hung;
    const path = join(root, 'late.wav');
    await writeFile(path, wav([0.9]));
    return path;
  };
  const late = buildService(state, { deadlineMs: 20 });
  await assert.rejects(() => late.get(request, context), /REC:WAVEFORM_TIMEOUT/);
  await assert.rejects(() => late.get(request, context), /REC:WAVEFORM_BUSY/, 'the latch is held until the host job settles');
  release();
  await new Promise(resolve => setTimeout(resolve, 30));
  state.render = original;
  const result = await late.get(request, context);
  assert.ok(result.peaks.length > 0, 'the late reply was retired and a new render is published');
});
