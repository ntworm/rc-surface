// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ASSOCIATION_MS = 100;
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const check = (condition) => { if (!condition) throw Error('invalid_latency_input'); };

function edges(samples, threshold, refractory) {
  const found = [];
  let above = false, last = -Infinity;
  for (let n = 0; n < samples.length; n++) {
    check(Number.isFinite(samples[n]));
    const next = Math.abs(samples[n]) >= threshold;
    if (next && !above && n - last >= refractory) { found.push(n); last = n; }
    above = next;
  }
  return found;
}
export function measureOnsets({ reference, response, sampleRate, threshold, minGapMs }) {
  check(reference instanceof Float32Array && response instanceof Float32Array
    && reference.length === response.length && reference.byteLength <= MAX_BYTES
    && finite(sampleRate, 8000, 384000) && finite(threshold, Number.EPSILON, 32)
    && finite(minGapMs, 0, 10000));
  const gap = Math.max(1, Math.ceil(minGapMs * sampleRate / 1000));
  const refs = edges(reference, threshold, gap), responses = edges(response, threshold, gap);
  const window = sampleRate * MAX_ASSOCIATION_MS / 1000;
  // Assign each response to its nearest reference (ties: earlier). Keep only
  // the closest response per reference. Isolated >=250ms fixtures avoid period
  // ambiguity; the meter cannot infer cycle identity from a dense pulse train.
  const matches = new Map();
  let cursor = 0;
  for (const onset of responses) {
    if (!refs.length) break;
    while (cursor + 1 < refs.length && Math.abs(refs[cursor + 1] - onset) < Math.abs(refs[cursor] - onset)) cursor++;
    const delta = onset - refs[cursor];
    if (Math.abs(delta) <= window && (!matches.has(cursor) || Math.abs(delta) < Math.abs(matches.get(cursor)))) {
      matches.set(cursor, delta);
    }
  }
  const delays = Array.from(matches.values(), delta => delta * 1000 / sampleRate).sort((a, b) => a - b);
  const n = delays.length;
  return { count: n, misses: refs.length - n, falsePositives: responses.length - n,
    medianMs: n ? (delays[Math.floor((n - 1) / 2)] + delays[Math.floor(n / 2)]) / 2 : null,
    p95Ms: n ? delays[Math.ceil(.95 * n) - 1] : null, maxMs: n ? delays[n - 1] : null };
}

export function decodeWav(buffer) {
  check(Buffer.isBuffer(buffer) && buffer.length >= 44 && buffer.length <= MAX_BYTES);
  check(buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
    && buffer.readUInt32LE(4) + 8 === buffer.length);
  let fmt, data;
  for (let offset = 12; offset < buffer.length;) {
    check(offset + 8 <= buffer.length);
    const name = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + length, next = end + length % 2;
    check(next <= buffer.length);
    if (name === 'fmt ') { check(!fmt && length >= 16); fmt = buffer.subarray(start, end); }
    if (name === 'data') { check(!data); data = buffer.subarray(start, end); }
    offset = next;
  }
  check(fmt && data);
  const format = fmt.readUInt16LE(0), channels = fmt.readUInt16LE(2), sampleRate = fmt.readUInt32LE(4);
  const byteRate = fmt.readUInt32LE(8), align = fmt.readUInt16LE(12), bits = fmt.readUInt16LE(14);
  check((format === 1 && [16, 24, 32].includes(bits)) || (format === 3 && bits === 32));
  check(channels >= 1 && channels <= 32 && finite(sampleRate, 8000, 384000)
    && align === channels * bits / 8 && byteRate === sampleRate * align && data.length % align === 0);
  const size = data.length / align, output = Array.from({ length: channels }, () => new Float32Array(size));
  for (let n = 0; n < size; n++) for (let c = 0; c < channels; c++) {
    const at = n * align + c * bits / 8;
    const v = format === 3 ? data.readFloatLE(at) : data.readIntLE(at, bits / 8) / 2 ** (bits - 1);
    check(Number.isFinite(v)); output[c][n] = v;
  }
  return { sampleRate, channels: output };
}

async function main(args) {
  const names = ['--wav', '--reference-channel', '--response-channel', '--threshold', '--min-gap-ms', '--out-dir'];
  const options = {};
  check(args.length === names.length * 2);
  for (let n = 0; n < args.length; n += 2) {
    check(names.includes(args[n]) && !Object.hasOwn(options, args[n]) && args[n + 1]);
    options[args[n]] = args[n + 1];
  }
  const handle = await fs.open(options['--wav'], 'r');
  let raw;
  try { check((await handle.stat()).size <= MAX_BYTES); raw = await handle.readFile(); } finally { await handle.close(); }
  const wav = decodeWav(raw);
  const referenceChannel = Number(options['--reference-channel']), responseChannel = Number(options['--response-channel']);
  check(Number.isInteger(referenceChannel) && Number.isInteger(responseChannel)
    && referenceChannel >= 1 && responseChannel >= 1 && referenceChannel !== responseChannel
    && referenceChannel <= wav.channels.length && responseChannel <= wav.channels.length);
  const threshold = Number(options['--threshold']), minGapMs = Number(options['--min-gap-ms']);
  const result = measureOnsets({ reference: wav.channels[referenceChannel - 1], response: wav.channels[responseChannel - 1],
    sampleRate: wav.sampleRate, threshold, minGapMs });
  const report = { version: 1, input: { sha256: createHash('sha256').update(raw).digest('hex'), bytes: raw.length },
    measurement: { sampleRate: wav.sampleRate, referenceChannel, responseChannel, threshold, minGapMs,
      maxAssociationMs: MAX_ASSOCIATION_MS, association: 'nearest-reference; closest response; signed; no offset subtraction' }, result };
  const out = path.resolve(options['--out-dir']);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'latency.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { process.stderr.write('Native audio measurement failed: invalid input or evidence destination.\n'); process.exitCode = 1; });
}
