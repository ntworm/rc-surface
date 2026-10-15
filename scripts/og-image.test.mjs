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
  assert.equal(pngTextEntries(image).get('SurfacePages'),'PERF,MIX,SNP,SNS,AUD,VID,REC');
  assert.equal(pngTextEntries(image).get('Toggles'),'T1,T2,T3,T4,T5,T6,T7,T8');
  assert.equal(pngTextEntries(image).get('XYHeaderMode'),'AUT');
});

test('social-card plan generator draws all seven tabs and eight labeled toggles with AUT on both XY',()=>{
  const source=fs.readFileSync(generatorPath,'utf8');
  assert.match(source,/tabs = \["PERF", "MIX", "SNP", "SNS", "AUD", "VID", "REC"\]/);
  assert.match(source,/rows_per_column = 4/);assert.match(source,/for column in range\(2\):\s*for row in range\(rows_per_column\)/);
  assert.match(source,/label = f"T\{row \* 2 \+ column \+ 1\}"/);
  assert.match(source,/draw\.text\(\(xy_x \+ 5, y0 \+ 5\), "AUT"/);
});
