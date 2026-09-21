// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// single-client-docs.test.mjs
// Verification suite for single-client documentation and Section 10 morph mode rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '../..');
const docsDir = path.join(rootDir, 'docs');

function readDoc(relPath) {
  return fs.readFileSync(path.join(docsDir, relPath), 'utf8');
}

test('USER-GUIDE.md documents single controller exclusivity and section 10 morph mode rules', () => {
  const content = readDoc('USER-GUIDE.md');
  assert.match(content, /phone or desktop,\s*never both simultaneously/i, 'must state phone or desktop exclusivity');
  assert.match(content, /one controller at a time/i, 'must state 1.0 supports one controller at a time');

  const sec10Match = content.match(/## 10\.[^\n]+[\s\S]*?(?=\n## 11|$)/);
  assert.ok(sec10Match, 'Section 10 must exist');
  const sec10 = sec10Match[0];
  assert.match(sec10, /Vector XY/i, 'must describe Vector XY');
  assert.match(sec10, /direct/i, 'must describe Vector XY as direct');
  assert.match(sec10, /without Transition Time|no Transition Time/i, 'must state Vector XY has no Transition Time');
  assert.match(sec10, /(Free\s*\/\s*Sync|Transition Time)[\s\S]*?(Grid|only)/i, 'must state Free/Sync or Transition Time applies only to Grid');
  assert.match(sec10, /disabled.*Vector/i, 'must state Transition Time is disabled in Vector mode');
});

test('USER-GUIDE.pt-BR.md documents single controller exclusivity and section 10 morph mode rules', () => {
  const content = readDoc('USER-GUIDE.pt-BR.md');
  assert.match(content, /celular ou desktop,\s*nunca ambos simultaneamente/i, 'must state phone or desktop exclusivity');
  assert.match(content, /um controlador por vez/i, 'must state single controller in 1.0');

  const sec10Match = content.match(/## 10\.[^\n]+[\s\S]*?(?=\n## 11|$)/);
  assert.ok(sec10Match, 'Section 10 must exist');
  const sec10 = sec10Match[0];
  assert.match(sec10, /Vetor XY/i, 'must describe Vetor XY');
  assert.match(sec10, /diret[oa]/i, 'must describe Vetor XY as direto');
  assert.match(sec10, /sem Transition Time/i, 'must state Vetor XY has sem Transition Time');
  assert.match(sec10, /(Free\s*\/\s*Sync|Tempo de transição|tempo de morph)[\s\S]*?(Grade|somente)/i, 'must state Free/Sync applies only to Grade');
  assert.match(sec10, /desabilitado.*Vetor/i, 'must state Transition Time is disabled in Vetor mode');
});

test('FAQ.md documents single controller limitation and phone/desktop exclusivity', () => {
  const content = readDoc('FAQ.md');
  assert.match(content, /phone or desktop,\s*never both simultaneously/i, 'must state phone or desktop exclusivity');
  assert.match(content, /one controller at a time/i, 'must state 1.0 supports one controller at a time');
});

test('FAQ.pt-BR.md documents single controller limitation and phone/desktop exclusivity', () => {
  const content = readDoc('FAQ.pt-BR.md');
  assert.match(content, /celular ou desktop,\s*nunca ambos simultaneamente/i, 'must state phone or desktop exclusivity');
  assert.match(content, /um controlador por vez/i, 'must state 1.0 supports one controller at a time');
});

test('INSTALL.md documents single controller limitation and phone/desktop exclusivity', () => {
  const content = readDoc('INSTALL.md');
  assert.match(content, /phone or desktop,\s*never both simultaneously/i, 'must state phone or desktop exclusivity');
  assert.match(content, /one controller at a time/i, 'must state 1.0 supports one controller at a time');
});

test('INSTALL.pt-BR.md documents single controller limitation and phone/desktop exclusivity', () => {
  const content = readDoc('INSTALL.pt-BR.md');
  assert.match(content, /celular ou desktop,\s*nunca ambos simultaneamente/i, 'must state phone or desktop exclusivity');
  assert.match(content, /um controlador por vez/i, 'must state 1.0 supports one controller at a time');
});

test('LFO shape configuration docs do not mention long-press and point to CFG mode', () => {
  for (const file of ['USER-GUIDE.md', 'USER-GUIDE.pt-BR.md']) {
    const content = readDoc(file);
    const lfoSection = content.match(/## 3\. LFO[\s\S]*?(?=\n## 4)/i)?.[0] || '';
    assert.doesNotMatch(lfoSection, /long-press|long press|toque longo|pressão longa/i, `should not mention long press in LFO section of ${file}`);
    assert.match(lfoSection, /CFG/, `should mention CFG in LFO section of ${file}`);
  }
});
