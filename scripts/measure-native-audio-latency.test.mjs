// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { measureOnsets, decodeWav } from './measure-native-audio-latency.mjs';

const signal = (positions, size = 48000) => {
  const result = new Float32Array(size);
  for (const p of positions) result[p] = 1;
  return result;
};
const measure = (a, b, options = {}) => measureOnsets({ reference: signal(a), response: signal(b),
  sampleRate: 48000, threshold: .5, minGapMs: 10, ...options });

test('known 240-sample offset measures 5ms, with one response per reference', () => {
  const positions = Array.from({ length: 46 }, (_, n) => 1000 + n * 1000);
  const r = measure(positions, positions.map(p => p + 240));
  assert.deepEqual(r, { count: 46, misses: 0, falsePositives: 0, medianMs: 5, p95Ms: 5, maxMs: 5 });
});

test('silence never passes as latency evidence and missing/unrelated pulses are counted', () => {
  assert.deepEqual(measure([], []), { count: 0, misses: 0, falsePositives: 0, medianMs: null, p95Ms: null, maxMs: null });
  assert.equal(measure([1000], []).misses, 1);
  const result = measure([1000, 20000, 40000], [1240, 30000, 40240]);
  assert.equal(result.count, 2); assert.equal(result.misses, 1); assert.equal(result.falsePositives, 1);
  assert.equal(measure([1000], [5801]).count, 0, '>100ms is not silently accepted');
});

test('negative route offsets stay signed, P95 is nearest rank and extras cannot rematch', () => {
  assert.equal(measure([5000, 20000], [4760, 19760]).medianMs, -5);
  const positions = [5000, 15000, 25000, 35000];
  const r = measure(positions, [5048, 15096, 25144, 35480]);
  assert.equal(r.medianMs, 2.5); assert.equal(r.p95Ms, 10); assert.equal(r.maxMs, 10);
  const duplicate = measure([5000], [5048, 6000]);
  assert.equal(duplicate.count, 1); assert.equal(duplicate.falsePositives, 1);
});

test('refractory time suppresses chatter without suppressing the next separated rising edge', () => {
  const reference = signal([1000, 1001, 1003, 2000]);
  const response = signal([1240, 1241, 1244, 2240]);
  const r = measureOnsets({ reference, response, sampleRate: 48000, threshold: .5, minGapMs: 10 });
  assert.equal(r.count, 2); assert.equal(r.p95Ms, 5);
});

test('meter rejects unequal, nonfinite and invalid measurement input', () => {
  for (const patch of [{ sampleRate: 0 }, { threshold: 0 }, { threshold: NaN }, { minGapMs: -1 },
    { reference: new Float32Array(2) }, { response: [1] }, { reference: new Float32Array(48000).fill(NaN) }]) {
    assert.throws(() => measure([], [], patch));
  }
});

// Literal two-channel RIFF builder is test-only, independent of the decoder.
function wav(format = 1, bits = 16, frames = [[.5, -.5], [0, .25]]) {
  const bytes = bits / 8, dataSize = frames.length * 2 * bytes;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF'); out.writeUInt32LE(36 + dataSize, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(format, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48000, 24); out.writeUInt32LE(48000 * 2 * bytes, 28);
  out.writeUInt16LE(2 * bytes, 32); out.writeUInt16LE(bits, 34); out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  frames.flat().forEach((v, i) => {
    const at = 44 + i * bytes;
    if (format === 3) out.writeFloatLE(v, at);
    else out.writeIntLE(Math.round(v * 2 ** (bits - 1)), at, bytes);
  });
  return out;
}
test('RIFF decoder reads PCM16/24/32 and float32 with exact channel separation', () => {
  for (const [format, bits] of [[1, 16], [1, 24], [1, 32], [3, 32]]) {
    const result = decodeWav(wav(format, bits));
    assert.equal(result.sampleRate, 48000);
    assert.deepEqual(Array.from(result.channels[0]), [.5, 0]);
    assert.deepEqual(Array.from(result.channels[1]), [-.5, .25]);
  }
});
test('RIFF rejects unsupported/truncated/contradictory containers and nonfinite PCM', () => {
  const invalid = [wav(6), wav(1).subarray(0, 45), wav(3, 32, [[NaN, 0]])];
  const alignment = wav(); alignment.writeUInt16LE(8, 32); invalid.push(alignment);
  const padded = wav(); padded.writeUInt16LE(8, 32); padded.writeUInt32LE(384000, 28); invalid.push(padded);
  const trailing = Buffer.concat([wav(), Buffer.from([1])]); invalid.push(trailing);
  const declared = wav(); declared.writeUInt32LE(declared.length - 12, 4); invalid.push(declared);
  const riff = wav(); riff.write('RF64'); invalid.push(riff);
  const partial = wav(); partial.writeUInt32LE(7, 40); invalid.push(partial);
  const fmt = wav(); fmt.writeUInt32LE(200, 16); invalid.push(fmt);
  for (const value of invalid) assert.throws(() => decodeWav(value));
});

test('CLI requires explicit channels/output, hashes source and never overwrites evidence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-native-meter-'));
  try {
    const frames = Array.from({ length: 10000 }, () => [0, 0]);
    frames[1000][0] = .75; frames[1240][1] = .75;
    const file = path.join(dir, 'recording.wav'); await fs.writeFile(file, wav(1, 16, frames));
    const output = path.join(dir, 'evidence');
    const args = ['scripts/measure-native-audio-latency.mjs', '--wav', file,
      '--reference-channel', '1', '--response-channel', '2', '--threshold', '.5', '--min-gap-ms', '10', '--out-dir', output];
    const run = () => spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    const report = JSON.parse(await fs.readFile(path.join(output, 'latency.json'), 'utf8'));
    assert.equal(report.result.p95Ms, 5); assert.equal(report.result.count, 1);
    assert.match(report.input.sha256, /^[0-9a-f]{64}$/);
    assert.equal(report.measurement.referenceChannel, 1);
    assert.equal(report.measurement.maxAssociationMs, 100);
    assert.equal(run().status, 1, 'do not replace an existing evidence report');
    const missing = spawnSync(process.execPath, args.slice(0, -2), { encoding: 'utf8', windowsHide: true });
    assert.equal(missing.status, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
