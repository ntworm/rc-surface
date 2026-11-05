// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * A pure reader for the RIFF/WAVE files the host renders into the extension
 * temp directory.
 *
 * The reader validates the declared sizes, the chunk boundaries and the
 * sample alignment before it decodes a single frame, and it never touches the
 * filesystem: the bytes arrive from the caller. It knows the usual PCM and
 * IEEE float encodings and refuses everything it cannot describe exactly.
 */

export type WavEncoding = 'pcm' | 'float';

export interface WavFormat {
  encoding: WavEncoding;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  blockAlign: number;
  frames: number;
}

export interface WavAudio {
  format: WavFormat;
  /** Interleaved samples in [-1,1], one frame per channel. */
  samples: Float32Array;
}

/** The same bound the service uses on the file itself. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_CHANNELS = 8;
const MAX_SAMPLES = 4 * 1024 * 1024;
const MAX_SAMPLE_RATE = 768000;
const MAX_PEAKS = 512;
/** The size of the extension block of a WAVE_FORMAT_EXTENSIBLE header. */
const EXTENSIBLE_CB_SIZE = 22;
/** The tail of the two KSDATAFORMAT_SUBTYPE GUIDs a WAVE_FORMAT_EXTENSIBLE
 * header may carry. */
const SUBTYPE_TAIL = [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
const PCM_BITS = [8, 16, 24, 32];
const FLOAT_BITS = [32, 64];

interface FormatFields {
  encoding: WavEncoding;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  blockAlign: number;
  byteRate: number;
}

interface ChunkScan {
  format: FormatFields | undefined;
  dataOffset: number;
  dataSize: number;
}

interface ChunkHeader {
  id: string;
  body: number;
  size: number;
  next: number;
}

function fail(code: string): never {
  throw new Error(code);
}

function tag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** The view of the buffer, after the file bound was checked. */
function openView(data: Uint8Array): DataView {
  if (!(data instanceof Uint8Array)) fail('WAV:DATA');
  if (data.byteLength > MAX_FILE_BYTES) fail('WAV:SIZE');
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * The end of the RIFF chunk. The declared size must describe the buffer
 * exactly: a bigger or a smaller declaration is an inconsistent file.
 */
function readRiffHeader(view: DataView, length: number): number {
  if (length < 12) fail('WAV:TRUNCATED');
  if (tag(view, 0) !== 'RIFF') fail('WAV:RIFF');
  if (tag(view, 8) !== 'WAVE') fail('WAV:WAVE');
  const riffSize = view.getUint32(4, true);
  if (riffSize < 4) fail('WAV:SIZE');
  const riffEnd = 8 + riffSize;
  if (riffEnd > length) fail('WAV:TRUNCATED');
  if (riffEnd !== length) fail('WAV:SIZE');
  return riffEnd;
}

/** Walk the chunks of the RIFF chunk and collect the format and the data. */
function readChunks(view: DataView, riffEnd: number): ChunkScan {
  const scan: ChunkScan = { format: undefined, dataOffset: -1, dataSize: 0 };
  let position = 12;
  while (position < riffEnd) {
    const chunk = readChunkHeader(view, position, riffEnd);
    if (chunk.id === 'fmt ' && scan.format === undefined) scan.format = readFormat(view, chunk.body, chunk.size);
    if (chunk.id === 'data' && scan.dataOffset < 0) {
      scan.dataOffset = chunk.body;
      scan.dataSize = chunk.size;
    }
    position = chunk.next;
  }
  return scan;
}

/**
 * Read one chunk header. A header that does not fit is a truncated file, a
 * chunk that claims more than the RIFF holds is an oversized chunk and an
 * odd chunk without its padding byte is an incomplete file.
 */
function readChunkHeader(view: DataView, position: number, riffEnd: number): ChunkHeader {
  if (riffEnd - position < 8) fail('WAV:TRUNCATED');
  const id = tag(view, position);
  const size = view.getUint32(position + 4, true);
  const body = position + 8;
  if (size > riffEnd - body) fail('WAV:CHUNK');
  const padded = body + size + (size % 2);
  if (size % 2 === 1 && padded > riffEnd) fail('WAV:PADDING');
  return { id, body, size, next: padded };
}

/** Read one fmt chunk and refuse every header that does not describe itself
 * exactly. */
function readFormat(view: DataView, offset: number, size: number): FormatFields {
  if (size < 16) fail('WAV:FMT');
  const code = view.getUint16(offset, true);
  const encoding = readEncoding(view, offset, size, code);
  const channels = view.getUint16(offset + 2, true);
  const sampleRate = view.getUint32(offset + 4, true);
  const byteRate = view.getUint32(offset + 8, true);
  const blockAlign = view.getUint16(offset + 12, true);
  const bitsPerSample = view.getUint16(offset + 14, true);
  checkChannels(channels);
  checkSampleRate(sampleRate);
  checkBits(bitsPerSample, encoding);
  if (blockAlign !== channels * (bitsPerSample / 8)) fail('WAV:ALIGN');
  if (byteRate !== sampleRate * blockAlign) fail('WAV:RATE');
  return { encoding, sampleRate, channels, bitsPerSample, blockAlign, byteRate };
}

/** The encoding of the format code. */
function readEncoding(view: DataView, offset: number, size: number, code: number): WavEncoding {
  if (code === 0xfffe) return readExtensible(view, offset, size);
  if (code === 1) return 'pcm';
  if (code === 3) return 'float';
  fail('WAV:ENCODING');
}

/**
 * Read an extensible header. Its extension block must have the exact size the
 * format demands, its valid bits must match the sample size and its subtype
 * GUID must be one of the two real ones.
 */
function readExtensible(view: DataView, offset: number, size: number): WavEncoding {
  if (size < 18 + EXTENSIBLE_CB_SIZE) fail('WAV:FMT');
  const cbSize = view.getUint16(offset + 16, true);
  if (cbSize !== EXTENSIBLE_CB_SIZE) fail('WAV:FMT');
  if (size !== 18 + cbSize) fail('WAV:FMT');
  const validBits = view.getUint16(offset + 18, true);
  if (validBits !== view.getUint16(offset + 14, true)) fail('WAV:FMT');
  const subtype = view.getUint32(offset + 24, true);
  if (subtype !== 1 && subtype !== 3) fail('WAV:ENCODING');
  checkSubtypeGuid(view, offset);
  return subtype === 1 ? 'pcm' : 'float';
}

/** The tail of the subtype GUID must be the real one. */
function checkSubtypeGuid(view: DataView, offset: number): void {
  for (let index = 0; index < SUBTYPE_TAIL.length; index += 1) {
    if (view.getUint8(offset + 28 + index) !== SUBTYPE_TAIL[index]) fail('WAV:ENCODING');
  }
}

function checkChannels(channels: number): void {
  if (channels < 1) fail('WAV:CHANNELS');
  if (channels > MAX_CHANNELS) fail('WAV:CHANNELS');
}

function checkSampleRate(sampleRate: number): void {
  if (sampleRate < 1) fail('WAV:RATE');
  if (sampleRate > MAX_SAMPLE_RATE) fail('WAV:RATE');
}

function checkBits(bitsPerSample: number, encoding: WavEncoding): void {
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1) fail('WAV:BITS');
  const allowed = encoding === 'pcm' ? PCM_BITS : FLOAT_BITS;
  if (!allowed.includes(bitsPerSample)) fail('WAV:BITS');
}

/** Decode one 24 bit sample without a bitwise operator. */
function decode24(view: DataView, offset: number): number {
  const low = view.getUint8(offset);
  const middle = view.getUint8(offset + 1);
  const high = view.getUint8(offset + 2);
  const raw = low + middle * 256 + high * 65536;
  const signed = raw >= 8388608 ? raw - 16777216 : raw;
  return signed / 8388608;
}

/** Decode one float sample and refuse a value that is not a number. */
function decodeFloat(view: DataView, offset: number, bits: number): number {
  const value = bits === 64 ? view.getFloat64(offset, true) : view.getFloat32(offset, true);
  if (!Number.isFinite(value)) fail('WAV:NONFINITE');
  return value;
}

/** Decode one sample of the declared encoding. */
function decodeSample(view: DataView, offset: number, format: FormatFields): number {
  if (format.encoding === 'float') return decodeFloat(view, offset, format.bitsPerSample);
  if (format.bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128;
  if (format.bitsPerSample === 16) return view.getInt16(offset, true) / 32768;
  if (format.bitsPerSample === 24) return decode24(view, offset);
  if (format.bitsPerSample === 32) return view.getInt32(offset, true) / 2147483648;
  fail('WAV:BITS');
}

/** Decode every frame of the data chunk. */
function decodeFrames(view: DataView, scan: ChunkScan, format: FormatFields, frames: number): Float32Array {
  const bytesPerSample = format.bitsPerSample / 8;
  const samples = new Float32Array(frames * format.channels);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const index = frame * format.channels + channel;
      samples[index] = decodeSample(view, scan.dataOffset + index * bytesPerSample, format);
    }
  }
  return samples;
}

/** Parse one bounded WAVE buffer into interleaved samples. */
export function parseWav(data: Uint8Array): WavAudio {
  const view = openView(data);
  const riffEnd = readRiffHeader(view, data.byteLength);
  const scan = readChunks(view, riffEnd);
  if (!scan.format) fail('WAV:FMT');
  if (scan.dataOffset < 0) fail('WAV:DATA');
  if (scan.dataSize <= 0) fail('WAV:DATA');
  if (scan.dataSize % scan.format.blockAlign !== 0) fail('WAV:ALIGN');
  const frames = scan.dataSize / scan.format.blockAlign;
  if (frames * scan.format.channels > MAX_SAMPLES) fail('WAV:SIZE');
  return {
    format: {
      encoding: scan.format.encoding,
      sampleRate: scan.format.sampleRate,
      channels: scan.format.channels,
      bitsPerSample: scan.format.bitsPerSample,
      blockAlign: scan.format.blockAlign,
      frames,
    },
    samples: decodeFrames(view, scan, scan.format, frames),
  };
}

/** Aggregate the real samples into at most `maxBins` magnitudes.
 *
 * Every bin reports the larger of the smallest and the largest magnitude it
 * holds, so a silent interval stays zero and a real waveform keeps its shape.
 * No bin is ever invented. */
export function computePeaks(audio: WavAudio, maxBins = MAX_PEAKS): number[] {
  const frames = audio.format.frames;
  if (frames <= 0) return [];
  const bins = Math.min(Math.max(1, Math.floor(maxBins)), frames);
  const peaks: number[] = new Array(bins);
  for (let bin = 0; bin < bins; bin += 1) {
    peaks[bin] = binMagnitude(audio, bin, bins);
  }
  return peaks;
}

/** The magnitude of one bin of real samples. */
function binMagnitude(audio: WavAudio, bin: number, bins: number): number {
  const frames = audio.format.frames;
  const channels = audio.format.channels;
  const from = Math.floor((bin * frames) / bins);
  const to = Math.floor(((bin + 1) * frames) / bins);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let frame = from; frame < to; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = audio.samples[frame * channels + channel];
      if (value === undefined || !Number.isFinite(value)) fail('WAV:NONFINITE');
      if (value < lowest) lowest = value;
      if (value > highest) highest = value;
    }
  }
  const magnitude = Math.max(Math.abs(lowest), Math.abs(highest));
  return Number.isFinite(magnitude) ? Math.min(1, Math.max(0, magnitude)) : 0;
}
