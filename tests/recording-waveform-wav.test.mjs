// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePeaks, parseWav } from '../src/live/recording-waveform-wav.ts';

const SUBTYPE_TAIL = Buffer.from([0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71]);

function chunk(id, body) {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body, body.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function riff(chunks, sizeOverride) {
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(sizeOverride ?? body.length + 4, 4);
  head.write('WAVE', 8, 'ascii');
  return Buffer.concat([head, body]);
}

function fmt(options) {
  const encoding = options.encoding ?? 1;
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 48000;
  const bits = options.bits ?? 16;
  const subtype = options.subtype;
  const body = Buffer.alloc(subtype === undefined ? 16 : 40);
  body.writeUInt16LE(encoding, 0);
  body.writeUInt16LE(channels, 2);
  body.writeUInt32LE(sampleRate, 4);
  body.writeUInt32LE(options.byteRate ?? sampleRate * channels * (bits / 8), 8);
  body.writeUInt16LE(options.blockAlign ?? channels * (bits / 8), 12);
  body.writeUInt16LE(bits, 14);
  if (subtype !== undefined) {
    body.writeUInt16LE(22, 16);
    body.writeUInt16LE(options.validBits ?? bits, 18);
    body.writeUInt32LE(0, 20);
    body.writeUInt32LE(subtype, 24);
    SUBTYPE_TAIL.copy(body, 28);
  }
  return chunk('fmt ', body);
}

/** An extensible header with an own size and an own extension block size. */
function extensibleFmt(extraBytes = 0, cbSize = 22) {
  const body = Buffer.alloc(40 + extraBytes);
  body.writeUInt16LE(0xfffe, 0);
  body.writeUInt16LE(1, 2);
  body.writeUInt32LE(48000, 4);
  body.writeUInt32LE(96000, 8);
  body.writeUInt16LE(2, 12);
  body.writeUInt16LE(16, 14);
  body.writeUInt16LE(cbSize, 16);
  body.writeUInt16LE(16, 18);
  body.writeUInt32LE(0, 20);
  body.writeUInt32LE(1, 24);
  SUBTYPE_TAIL.copy(body, 28);
  return chunk('fmt ', body);
}

function pcm(values, bits) {
  const bytes = bits / 8;
  const body = Buffer.alloc(values.length * bytes);
  values.forEach((value, index) => {
    const offset = index * bytes;
    if (bits === 8) body.writeUInt8(Math.max(0, Math.min(255, Math.round(value * 128) + 128)), offset);
    else if (bits === 16) body.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32768))), offset);
    else if (bits === 24) {
      const raw = Math.round(value * 8388607);
      const unsigned = raw < 0 ? raw + 16777216 : raw;
      body.writeUInt8(unsigned % 256, offset);
      body.writeUInt8(Math.floor(unsigned / 256) % 256, offset + 1);
      body.writeUInt8(Math.floor(unsigned / 65536) % 256, offset + 2);
    } else body.writeInt32LE(Math.round(value * 2147483647), offset);
  });
  return body;
}

function floats(values, bits) {
  const body = Buffer.alloc(values.length * (bits / 8));
  values.forEach((value, index) => {
    if (bits === 32) body.writeFloatLE(value, index * 4);
    else body.writeDoubleLE(value, index * 8);
  });
  return body;
}

function wave(options = {}) {
  const encoding = options.encoding ?? 1;
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 48000;
  const bits = options.bits ?? 16;
  const values = options.values ?? [0];
  const data = chunk('data', encoding === 3 ? floats(values, bits) : pcm(values, bits));
  const format = fmt({ encoding, channels, sampleRate, bits, subtype: options.subtype, validBits: options.validBits });
  const chunks = options.order === 'data-first' ? [data, format] : [format, ...(options.extra ?? []), data];
  return riff(chunks);
}

test('a PCM16 wave decodes into real samples and real amplitudes', () => {
  const audio = parseWav(wave({ values: [-1, 0, 0.5, 1] }));
  assert.equal(audio.format.encoding, 'pcm');
  assert.equal(audio.format.channels, 1);
  assert.equal(audio.format.sampleRate, 48000);
  assert.equal(audio.format.bitsPerSample, 16);
  assert.equal(audio.format.frames, 4);
  assert.equal(audio.samples.length, 4);
  assert.ok(Math.abs(audio.samples[0] + 1) < 1e-6);
  assert.equal(audio.samples[1], 0);
  assert.ok(Math.abs(audio.samples[2] - 0.5) < 1e-4);
  const peaks = computePeaks(audio);
  assert.equal(peaks.length, 4);
  assert.ok(Math.abs(peaks[0] - 1) < 1e-4);
  assert.equal(peaks[1], 0);
  assert.ok(Math.abs(peaks[2] - 0.5) < 1e-4);
  assert.ok(peaks[3] > 0.99 && peaks[3] <= 1);
});

test('silence stays zero and no bin is invented', () => {
  const audio = parseWav(wave({ values: [0, 0, 0, 0, 0, 0] }));
  const peaks = computePeaks(audio);
  assert.equal(peaks.length, 6);
  for (const peak of peaks) assert.equal(peak, 0);
});

test('the bins are bounded, real and correlated with the samples', () => {
  const frames = 1024;
  const values = Array.from({ length: frames }, (_, index) => Math.sin((index / frames) * Math.PI * 2) * 0.5);
  const audio = parseWav(wave({ values }));
  const peaks = computePeaks(audio);
  assert.equal(peaks.length, 512);
  for (const peak of peaks) assert.ok(Number.isFinite(peak) && peak >= 0 && peak <= 1);
  assert.ok(Math.max(...peaks) > 0.49 && Math.max(...peaks) <= 0.5);
  // A quieter section stays quieter than a louder one.
  const quiet = computePeaks(parseWav(wave({ values: values.map(value => value * 0.1) })));
  assert.ok(Math.max(...quiet) < Math.max(...peaks));
  assert.ok(Math.max(...quiet) > 0.049);
});

test('a short file never reports more bins than it has frames', () => {
  const audio = parseWav(wave({ values: [0.5, -0.5] }));
  assert.equal(computePeaks(audio).length, 2);
});

test('the usual sample formats decode exactly', () => {
  const pcm8 = parseWav(wave({ bits: 8, values: [-1, 0, 1] }));
  assert.equal(pcm8.format.bitsPerSample, 8);
  assert.ok(Math.abs(pcm8.samples[0] + 1) < 1e-6);
  assert.ok(Math.abs(pcm8.samples[2] - 1) < 0.01, 'eight bit full scale is 127/128');
  const pcm24 = parseWav(wave({ bits: 24, values: [-1, 0.25, 1] }));
  assert.equal(pcm24.format.bitsPerSample, 24);
  assert.ok(Math.abs(pcm24.samples[1] - 0.25) < 1e-6);
  const pcm32 = parseWav(wave({ bits: 32, values: [-1, 0.5, 1] }));
  assert.equal(pcm32.format.bitsPerSample, 32);
  assert.ok(Math.abs(pcm32.samples[1] - 0.5) < 1e-6);
  const float32 = parseWav(wave({ encoding: 3, bits: 32, values: [-0.25, 0.75] }));
  assert.equal(float32.format.encoding, 'float');
  assert.equal(float32.samples[1], 0.75);
  const float64 = parseWav(wave({ encoding: 3, bits: 64, values: [-0.25, 0.75] }));
  assert.equal(float64.format.bitsPerSample, 64);
  assert.equal(float64.samples[0], -0.25);
});

test('a stereo wave keeps its channels and its frames apart', () => {
  const body = Buffer.alloc(8);
  body.writeInt16LE(16384, 0);
  body.writeInt16LE(-16384, 2);
  body.writeInt16LE(0, 4);
  body.writeInt16LE(32767, 6);
  const audio = parseWav(riff([fmt({ channels: 2 }), chunk('data', body)]));
  assert.equal(audio.format.channels, 2);
  assert.equal(audio.format.frames, 2);
  assert.equal(audio.samples.length, 4);
  assert.ok(Math.abs(audio.samples[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(audio.samples[1] + 0.5) < 1e-3);
});

test('a data chunk before the format chunk is still read', () => {
  const audio = parseWav(wave({ order: 'data-first', values: [0.25, -0.25] }));
  assert.equal(audio.format.channels, 1);
  assert.equal(audio.format.frames, 2);
  assert.ok(Math.abs(audio.samples[0] - 0.25) < 1e-4);
});

test('an odd chunk is padded and read', () => {
  const audio = parseWav(wave({ values: [0.5], extra: [chunk('junk', Buffer.from([1, 2, 3]))] }));
  assert.equal(audio.format.frames, 1);
  assert.ok(Math.abs(audio.samples[0] - 0.5) < 1e-4);
});

test('an extensible header is read only when its subtype is validated', () => {
  const extensible = parseWav(wave({ encoding: 0xfffe, subtype: 1, values: [0.5, -0.5] }));
  assert.equal(extensible.format.encoding, 'pcm');
  assert.equal(extensible.format.frames, 2);
  const extensibleFloat = parseWav(wave({ encoding: 0xfffe, subtype: 3, bits: 32, values: [0.5, -0.5] }));
  assert.equal(extensibleFloat.format.encoding, 'float');
  assert.throws(() => parseWav(wave({ encoding: 0xfffe, subtype: 6, values: [0.5] })), /WAV:ENCODING/);
  const broken = wave({ encoding: 0xfffe, subtype: 1, values: [0.5] });
  broken[24 + 28] = 0x99;
  assert.throws(() => parseWav(broken), /WAV:ENCODING/);
  assert.throws(() => parseWav(wave({ encoding: 0xfffe, subtype: 1, validBits: 12, values: [0.5] })), /WAV:FMT/);
});

test('an extensible header with an inconsistent extension block is refused', () => {
  // The extension block must have the exact size the format demands.
  assert.throws(() => parseWav(riff([extensibleFmt(0, 20), chunk('data', pcm([0.5], 16))])), /WAV:FMT/);
  // The chunk must not carry more bytes than its own extension block.
  assert.throws(() => parseWav(riff([extensibleFmt(4, 22), chunk('data', pcm([0.5], 16))])), /WAV:FMT/);
  // The real extension block is read.
  const audio = parseWav(riff([extensibleFmt(0, 22), chunk('data', pcm([0.5], 16))]));
  assert.equal(audio.format.encoding, 'pcm');
  assert.equal(audio.format.frames, 1);
});

test('a malformed or truncated wave is refused', () => {
  assert.throws(() => parseWav(Buffer.alloc(4)), /WAV:TRUNCATED/);
  assert.throws(() => parseWav(Buffer.from('RIFX....WAVE')), /WAV:RIFF/);
  assert.throws(() => parseWav(Buffer.from('RIFF....WAVX')), /WAV:WAVE/);
  const complete = wave({ values: [0.5, 0.5] });
  assert.throws(() => parseWav(complete.subarray(0, complete.length - 4)), /WAV:TRUNCATED/);
  // A data chunk that claims more than the RIFF holds.
  const overrun = wave({ values: [0.5] });
  overrun.writeUInt32LE(4096, 40);
  assert.throws(() => parseWav(overrun), /WAV:CHUNK/);
  // A missing padding byte after an odd chunk.
  const odd = riff([chunk('junk', Buffer.from([1, 2, 3]))]);
  const withoutPad = odd.subarray(0, odd.length - 1);
  withoutPad.writeUInt32LE(withoutPad.length - 8, 4);
  assert.throws(() => parseWav(withoutPad), /WAV:PADDING/);
  // A frame that does not fit the declared block alignment.
  const ragged = riff([fmt({}), chunk('data', Buffer.alloc(5))]);
  assert.throws(() => parseWav(ragged), /WAV:ALIGN/);
  // A header that does not describe itself.
  assert.throws(() => parseWav(riff([fmt({ encoding: 6 }), chunk('data', pcm([0.5], 16))])), /WAV:ENCODING/);
  assert.throws(() => parseWav(riff([fmt({ blockAlign: 4 }), chunk('data', pcm([0.5], 16))])), /WAV:ALIGN/);
  assert.throws(() => parseWav(riff([fmt({ byteRate: 1234 }), chunk('data', pcm([0.5], 16))])), /WAV:RATE/);
  assert.throws(() => parseWav(riff([fmt({ channels: 0 }), chunk('data', pcm([0.5], 16))])), /WAV:CHANNELS/);
  assert.throws(() => parseWav(riff([fmt({ channels: 64 }), chunk('data', pcm([0.5], 16))])), /WAV:CHANNELS/);
  assert.throws(() => parseWav(riff([fmt({ sampleRate: 0 }), chunk('data', pcm([0.5], 16))])), /WAV:RATE/);
  assert.throws(() => parseWav(riff([fmt({ bits: 12 }), chunk('data', pcm([0.5], 16))])), /WAV:BITS/);
  assert.throws(() => parseWav(riff([fmt({})])), /WAV:DATA/);
  assert.throws(() => parseWav(riff([chunk('data', pcm([0.5], 16))])), /WAV:FMT/);
  assert.throws(() => parseWav(riff([fmt({}), chunk('data', Buffer.alloc(0))])), /WAV:DATA/);
});

test('a declared size that does not describe the file is refused', () => {
  // The RIFF size is smaller than the bytes the file really holds.
  const shorter = wave({ values: [0.5] });
  shorter.writeUInt32LE(shorter.length - 10, 4);
  assert.throws(() => parseWav(shorter), /WAV:SIZE/);
  // A trailing partial chunk header is not a file the reader may guess.
  const partial = wave({ values: [0.5] });
  const withTail = Buffer.concat([partial, Buffer.from([1, 2, 3, 4])]);
  withTail.writeUInt32LE(withTail.length - 8, 4);
  assert.throws(() => parseWav(withTail), /WAV:TRUNCATED/);
});

test('a file above the bound of the reader is refused', () => {
  assert.throws(() => parseWav(Buffer.alloc(33 * 1024 * 1024)), /WAV:SIZE/);
});

test('a non finite float sample is refused', () => {
  const body = Buffer.alloc(8);
  body.writeFloatLE(Number.NaN, 0);
  body.writeFloatLE(0.5, 4);
  assert.throws(() => parseWav(riff([fmt({ encoding: 3, bits: 32 }), chunk('data', body)])), /WAV:NONFINITE/);
});
