// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Stereo bench only: L=220 isolated pulses; R=quiet constant DC. Route to
// recording only, NEVER speakers. Separating channels in Live is intentional.
export function createLatencyFixture({ sampleRate = 48000 } = {}) {
  if (![44100, 48000, 96000].includes(sampleRate)) throw Error('invalid_fixture_rate');
  const frames = sampleRate * 112, bytes = frames * 4;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF'); out.writeUInt32LE(36 + bytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(bytes, 40);
  for (let n = 0; n < frames; n++) out.writeInt16LE(2048, 46 + n * 4);
  for (let hit = 0; hit < 220; hit++) {
    const start = sampleRate + Math.round(hit * sampleRate / 2);
    for (let n = 0; n < Math.round(sampleRate / 1000); n++) out.writeInt16LE(16384, 44 + (start + n) * 4);
  }
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) { process.stderr.write('Usage: node scripts/generate-native-latency-fixture.mjs <new-output.wav>\n'); process.exitCode = 1; }
  else fs.writeFile(path.resolve(process.argv[2]), createLatencyFixture(), { flag: 'wx' })
    .then(() => process.stdout.write('Bench WAV generated: L pulses / R DC — recording only, never speakers.\n'))
    .catch(() => { process.stderr.write('Fixture destination unavailable or already exists.\n'); process.exitCode = 1; });
}
