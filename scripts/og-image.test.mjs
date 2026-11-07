// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const generatorPath = path.join(import.meta.dirname, 'render-og-image.mjs');
const templatePath = path.join(import.meta.dirname, 'og-image-template.html');
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

test('social-card renderer is package-version-driven and keeps its build-only font', () => {
  assert.ok(fs.existsSync(generatorPath), 'scripts/render-og-image.mjs must be committed');
  assert.ok(fs.existsSync(templatePath), 'scripts/og-image-template.html must be committed');
  assert.ok(fs.existsSync(fontPath), 'the card font must live outside static/');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /package\.json/);
  assert.match(source, /JSON\.parse/);
  assert.doesNotMatch(source, /v\d+\.\d+\.\d+/);
  const template = fs.readFileSync(templatePath, 'utf8');
  assert.match(template, /\{\{VERSION\}\}/);
  assert.doesNotMatch(template, /v\d+\.\d+\.\d+/);
});

test('committed social card matches package metadata and Open Graph dimensions', () => {
  const image = fs.readFileSync(imagePath);
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.equal(pngTextEntries(image).get('Release'), `v${packageJson.version}`);
  assert.equal(pngTextEntries(image).get('Screen'), 'PERF 844x390');
});

test('social card shows the real PERF page on a phone of its true proportion', () => {
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /viewport: \{ width: 844, height: 390 \}/);
  const template = fs.readFileSync(templatePath, 'utf8');
  // The screen keeps the 844:390 proportion of the capture.
  const screen = /\.screen\{[^}]*width:(\d+)px;height:(\d+)px/.exec(template);
  assert.ok(screen, 'the template must size the phone screen');
  assert.ok(Math.abs(Number(screen[1]) / Number(screen[2]) - 844 / 390) < 0.01);
});
