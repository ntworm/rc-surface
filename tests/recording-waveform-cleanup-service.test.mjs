// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openNodeFile } from '../src/live/recording-waveform-file.ts';
import { RecordingWaveform } from '../src/live/recording-waveform.ts';

const OWN = 'rc-surface-waveform-';
const CLIP = { handle: { id: 'clip-1' }, name: 'Clip 1', startTime: 0, endTime: 4 };
const TRACK = { handle: { id: 'track-1' }, name: 'Track 1', arrangementClips: [CLIP] };
const SONG = { tracks: [TRACK] };
const REQUEST = {
  scope: 'scope-1',
  track: { index: 0, id: 'track-1', name: 'Track 1' },
  clip: { index: 0, id: 'clip-1', name: 'Clip 1', startTime: 0, endTime: 4 },
  startTime: 0,
  endTime: 4,
};
const CONTEXT = { isCurrent: () => true };
const isAudioTrack = (value) => typeof value === 'object' && value !== null && Array.isArray(value.arrangementClips);
const isAudioClip = (value) => typeof value === 'object' && value !== null && typeof value.name === 'string';
const OBSERVED = () => ({ fresh: true, value: false, observedAt: 1 });
const stopped = () => ({ connected: true, isPlaying: OBSERVED(), recordMode: OBSERVED() });

/** A real 16 bit PCM WAV of one channel. */
function wavBytes(frames = 512) {
  const dataSize = frames * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(frame / 16) * 12000), 44 + frame * 2);
  }
  return buffer;
}

/** One own temp root. */
async function makeRoot() {
  return realpath(await mkdtemp(path.join(tmpdir(), OWN)));
}

/** The guarded recursive cleanup of one own root. */
async function removeRoot(root) {
  const resolved = await realpath(root);
  const base = await realpath(tmpdir());
  assert.ok(resolved.startsWith(base + path.sep), 'the root is outside the temp directory');
  assert.ok(path.basename(resolved).startsWith(OWN), 'the root is not an own root');
  await rm(resolved, { recursive: true, force: true });
}

async function exists(file) {
  return stat(file).then(() => true, () => false);
}

/** The rendered WAV of one own root. */
async function writeWav(root, name = 'rendered.wav') {
  const file = path.join(root, name);
  await writeFile(file, wavBytes());
  return file;
}

/** A promise and the function that settles it. */
function deferred() {
  const box = {};
  box.promise = new Promise((done) => { box.resolve = done; });
  return box;
}

/** One service with the fixtures of the request. */
function makeService(root, options = {}) {
  const state = { scope: REQUEST.scope };
  const deps = {
    getSong: () => SONG,
    getScope: () => state.scope,
    getTransport: async () => stopped(),
    getAttemptActive: () => false,
    getTempDirectory: () => root,
    render: options.render ?? (async () => options.file),
    isAudioTrack, isAudioClip, ...options.deps,
  };
  return { service: new RecordingWaveform(deps), state };
}

/** The real handle with one observed close. */
function wrapHandle(handle, close) {
  return new Proxy(handle, {
    get: (real, property) => {
      if (property === 'close') return close;
      const value = Reflect.get(real, property, real);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

test('the own rendered file is removed and the sibling is kept', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const sibling = path.join(root, 'sibling.txt');
    await writeFile(sibling, 'keep me');
    const { service } = makeService(root, { file });
    const result = await service.get(REQUEST, CONTEXT);
    assert.ok(result.peaks.length > 0);
    assert.ok(result.peaks.every((value) => Number.isFinite(value)));
    assert.equal(await exists(file), false);
    assert.equal(await exists(sibling), true);
  } finally {
    await removeRoot(root);
  }
});

test('a broken render is closed before it is removed', async () => {
  const root = await makeRoot();
  try {
    const file = path.join(root, 'broken.wav');
    await writeFile(file, Buffer.from('this is not a wav file'));
    const order = [];
    const { service } = makeService(root, {
      file,
      deps: {
        openFile: async (target) => {
          const handle = await openNodeFile(target);
          return wrapHandle(handle, async () => { order.push('close'); return handle.close(); });
        },
        removeFile: async (target) => { order.push('remove'); await unlink(target); },
      },
    });
    await assert.rejects(service.get(REQUEST, CONTEXT), (error) => error.message === 'REC:WAVEFORM_PARSE');
    assert.deepEqual(order, ['close', 'remove']);
    assert.equal(await exists(file), false);
  } finally {
    await removeRoot(root);
  }
});

test('a failed close keeps the own file', async () => {
  const root = await makeRoot();
  let opened = null;
  try {
    const file = await writeWav(root);
    const { service } = makeService(root, {
      file,
      deps: {
        openFile: async (target) => {
          opened = await openNodeFile(target);
          return wrapHandle(opened, async () => { throw new Error('the close failed'); });
        },
      },
    });
    const result = await service.get(REQUEST, CONTEXT);
    assert.ok(result.peaks.length > 0);
    assert.equal(await exists(file), true);
  } finally {
    if (opened) await opened.close().catch(() => undefined);
    await removeRoot(root);
  }
});

test('a cancelled render is removed after the job settled', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const started = deferred();
    const gate = deferred();
    const removed = deferred();
    const { service } = makeService(root, {
      render: async () => { started.resolve(); await gate.promise; return file; },
      deps: { removeFile: async (target) => { await unlink(target); removed.resolve(); } },
    });
    const pending = service.get(REQUEST, CONTEXT);
    await started.promise;
    service.cancel();
    await assert.rejects(pending, (error) => error.message === 'REC:WAVEFORM_CANCELLED');
    gate.resolve();
    await removed.promise;
    assert.equal(await exists(file), false);
  } finally {
    await removeRoot(root);
  }
});

test('a render after the deadline is removed', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const started = deferred();
    const gate = deferred();
    const removed = deferred();
    const { service } = makeService(root, {
      render: async () => { started.resolve(); await gate.promise; return file; },
      deps: {
        deadlineMs: 25,
        removeFile: async (target) => { await unlink(target); removed.resolve(); },
      },
    });
    const pending = service.get(REQUEST, CONTEXT);
    await started.promise;
    await assert.rejects(pending, (error) => error.message === 'REC:WAVEFORM_TIMEOUT');
    gate.resolve();
    await removed.promise;
    assert.equal(await exists(file), false);
  } finally {
    await removeRoot(root);
  }
});

test('a scope change during the cleanup publishes nothing', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const started = deferred();
    const gate = deferred();
    const { service, state } = makeService(root, {
      file,
      deps: {
        removeFile: async (target) => { started.resolve(); await gate.promise; await unlink(target); },
      },
    });
    const pending = service.get(REQUEST, CONTEXT);
    await started.promise;
    state.scope = 'scope-2';
    gate.resolve();
    await assert.rejects(pending, (error) => error.message === 'REC:WAVEFORM_SCOPE');
  } finally {
    await removeRoot(root);
  }
});

test('a failing unlink keeps the valid peaks', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const { service } = makeService(root, {
      file,
      deps: { removeFile: async () => { throw new Error('the unlink failed'); } },
    });
    const result = await service.get(REQUEST, CONTEXT);
    assert.ok(result.peaks.length > 0);
    assert.equal(await exists(file), true);
  } finally {
    await removeRoot(root);
  }
});

test('the latch stays busy while the cleanup runs', async () => {
  const root = await makeRoot();
  try {
    const file = await writeWav(root);
    const started = deferred();
    const gate = deferred();
    const removed = deferred();
    const { service } = makeService(root, {
      file,
      deps: {
        removeFile: async (target) => {
          started.resolve();
          await gate.promise;
          await unlink(target);
          removed.resolve();
        },
      },
    });
    const pending = service.get(REQUEST, CONTEXT);
    await started.promise;
    await assert.rejects(service.get(REQUEST, CONTEXT), (error) => error.message === 'REC:WAVEFORM_BUSY');
    service.cancel();
    await assert.rejects(pending, (error) => error.message === 'REC:WAVEFORM_CANCELLED');
    gate.resolve();
    await removed.promise;
    assert.equal(await exists(file), false);
  } finally {
    await removeRoot(root);
  }
});
