// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const generatorPath = path.join(import.meta.dirname, 'generate-og-image.py');
const fontPath = path.join(import.meta.dirname, 'assets', 'fonts', 'DepartureMono-Regular.otf');
const imagePath = path.join(root, 'docs', 'og-image.png');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function pngTextEntries(buffer) {
  const entries = new Map();
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === 'tEXt') {
      const separator = buffer.indexOf(0, dataStart);
      if (separator >= dataStart && separator < dataEnd) {
        entries.set(
          buffer.toString('latin1', dataStart, separator),
          buffer.toString('latin1', separator + 1, dataEnd),
        );
      }
    }
    offset = dataEnd + 4;
  }
  return entries;
}

test('social-card generator is package-version-driven and keeps its build-only font', () => {
  assert.ok(fs.existsSync(generatorPath), 'scripts/generate-og-image.py must be committed');
  assert.ok(fs.existsSync(fontPath), 'the generator OTF must live outside static/');

  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /package\.json/);
  assert.match(source, /json\.load/);
  assert.doesNotMatch(source, /v0\.\d+\.\d+/);
});

test('committed social card matches package metadata and Open Graph dimensions', () => {
  const image = fs.readFileSync(imagePath);
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.equal(pngTextEntries(image).get('Release'), `v${packageJson.version}`);
});
