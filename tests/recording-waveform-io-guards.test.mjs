// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';

import { RecordingWaveform } from '../src/live/recording-waveform.js';
import { openNodeFile, readBoundedFile } from '../src/live/recording-waveform-file.js';

/** The prefix of every temp root this file creates. */
const OWN_PREFIX = 'rc-surface-waveform-io-';
/** The header of a 16 bit mono PCM WAV. */
const WAV_HEADER_BYTES = 44;
/** One chunk of the bounded read. */
const CHUNK_BYTES = 1024 * 1024;
/** The size of a rendered wave that needs two bounded chunks. */
const WAV_BYTES = CHUNK_BYTES + 4096;

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/** An audio track of the shape the host hands out. */
function makeTrack(id, name, clips) {
  return { handle: { id }, name, arrangementClips: clips };
}

/** An audio clip of the shape the host hands out. */
function makeClip(id, name, startTime, endTime) {
  return { handle: { id }, name, startTime, endTime };
}

/** The runtime proof that a value is a real audio track of the host. */
function isAudioTrack(value) {
  return isObject(value) && isObject(value.handle)
    && typeof value.handle.id === 'string' && Array.isArray(value.arrangementClips);
}

/** The runtime proof that a value is a real audio clip of the host. */
function isAudioClip(value) {
  return isObject(value) && isObject(value.handle)
    && typeof value.handle.id === 'string' && typeof value.name === 'string';
}

/** One stopped observation of the host. */
function stoppedObservation() {
  return { fresh: true, value: false, observedAt: Date.now() };
}

/** The stopped transport of the host. */
function stoppedTransport() {
  return { connected: true, isPlaying: stoppedObservation(), recordMode: stoppedObservation() };
}

/** A real 16 bit PCM mono WAV, big enough for two bounded chunks. */
function buildWav(totalBytes) {
  const samples = totalBytes - WAV_HEADER_BYTES;
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(totalBytes - 8, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples, 40);
  const body = Buffer.alloc(samples);
  for (let index = 0; index < samples; index += 2) {
    body.writeInt16LE(Math.round(9000 * Math.sin(index / 41)), index);
  }
  return Buffer.concat([header, body]);
}

/** A temp root of this test, and the proof that it alone may be removed. */
async function makeOwnTempRoot(t) {
  const root = resolve(await mkdtemp(join(tmpdir(), OWN_PREFIX)));
  const base = resolve(tmpdir());
  const own = () => root.startsWith(base + sep) && root.slice(base.length + 1).startsWith(OWN_PREFIX);
  assert.ok(own(), 'the temp root must live inside the system temp directory');
  t.after(async () => {
    assert.ok(own(), 'refusing to remove a path this test did not create');
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

/** The service, the request and the world the service observes. */
function makeHarness(root, filePath) {
  const world = {
    scope: 'scope-1',
    attemptActive: false,
    contextCurrent: true,
    track: null,
    clip: makeClip('clip-1', 'Clip 1', 0, 16),
    reads: 0,
  };
  world.track = makeTrack('track-1', 'Track 1', [world.clip]);
  world.song = { tracks: [world.track] };
  const request = {
    scope: 'scope-1',
    track: { index: 0, id: 'track-1', name: 'Track 1' },
    clip: { index: 0, id: 'clip-1', name: 'Clip 1', startTime: 0, endTime: 16 },
    startTime: 0,
    endTime: 8,
  };
  const context = { isCurrent: () => world.contextCurrent };
  let changeWorld = () => undefined;
  const openFile = async path => {
    const handle = await openNodeFile(path);
    return {
      stat: () => handle.stat(),
      read: async (buffer, offset, length, position) => {
        world.reads += 1;
        const result = await handle.read(buffer, offset, length, position);
        changeWorld();
        return result;
      },
      close: () => handle.close(),
    };
  };
  const service = new RecordingWaveform({
    getSong: () => world.song,
    getScope: () => world.scope,
    getTransport: async () => stoppedTransport(),
    getAttemptActive: () => world.attemptActive,
    getTempDirectory: () => root,
    render: async () => filePath,
    isAudioTrack,
    isAudioClip,
    openFile,
  });
  return {
    service,
    world,
    request,
    context,
    onRead: fn => { changeWorld = fn; },
  };
}

/** The outcome of one request, successful or not. */
async function outcomeOf(promise) {
  return promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
}

test('a real rendered wave is read in two bounded chunks and publishes peaks', async (t) => {
  const root = await makeOwnTempRoot(t);
  const filePath = join(root, 'rendered.wav');
  await writeFile(filePath, buildWav(WAV_BYTES));
  const harness = makeHarness(root, filePath);
  const outcome = await outcomeOf(harness.service.get(harness.request, harness.context));
  assert.equal(outcome.ok, true, `the wave must be published: ${outcome.error?.message}`);
  assert.equal(harness.world.reads, 2, 'the wave must be read in two chunks');
  assert.ok(outcome.value.peaks.length > 0, 'the real wave must publish peaks');
  assert.ok(outcome.value.peaks.every(Number.isFinite), 'every peak must be a real amplitude');
});

const RETIREMENTS = [
  {
    name: 'the scope changes',
    code: 'REC:WAVEFORM_SCOPE',
    change: world => { world.scope = 'scope-2'; },
  },
  {
    name: 'the context is retired',
    code: 'REC:WAVEFORM_CONTEXT',
    change: world => { world.contextCurrent = false; },
  },
  {
    name: 'an attempt takes over',
    code: 'REC:WAVEFORM_ACTIVE',
    change: world => { world.attemptActive = true; },
  },
  {
    name: 'the track is replaced',
    code: 'REC:WAVEFORM_IDENTITY',
    change: world => { world.song = { tracks: [makeTrack('track-2', 'Track 2', [makeClip('clip-2', 'Clip 2', 0, 16)])] }; },
  },
];

test('a world change between the file chunks retires the wave', async (t) => {
  for (const retirement of RETIREMENTS) {
    await t.test(retirement.name, async (inner) => {
      const root = await makeOwnTempRoot(inner);
      const filePath = join(root, 'rendered.wav');
      await writeFile(filePath, buildWav(WAV_BYTES));
      const harness = makeHarness(root, filePath);
      harness.onRead(() => retirement.change(harness.world));
      const outcome = await outcomeOf(harness.service.get(harness.request, harness.context));
      assert.equal(outcome.ok, false, 'no peaks may be published');
      assert.equal(outcome.error.message, retirement.code);
      assert.equal(harness.world.reads, 1, 'the second chunk must never be read');
    });
  }
});

test('the bounded read throws before it returns bytes of a retired world', async () => {
  let retired = false;
  const handle = {
    stat: async () => ({ isFile: () => true, size: 4, dev: 1, ino: 1 }),
    read: async (buffer, offset, length, position) => {
      await new Promise(done => setImmediate(done));
      assert.equal(position, offset, 'the read must start at the offset');
      buffer.write('abcd', offset, 'ascii');
      retired = true;
      return { bytesRead: Math.min(length, 4) };
    },
    close: async () => undefined,
  };
  const outcome = await outcomeOf(readBoundedFile(handle, 4, () => {
    if (retired) throw new Error('REC:WAVEFORM_SCOPE');
  }));
  assert.equal(outcome.ok, false, 'no bytes may be returned');
  assert.equal(outcome.error.message, 'REC:WAVEFORM_SCOPE');
});
