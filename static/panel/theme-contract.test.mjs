// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const contractPath = path.resolve(import.meta.dirname, '../../internal/THEME_CONTRACT.md');

test('theme contract preserves the current visual language', () => {
  const contract = fs.readFileSync(contractPath, 'utf8');

  assert.doesNotMatch(
    contract,
    /glassmorphism|#00d2ff|#ff7700|backdrop-filter:\s*blur\(12px\)/i,
  );
  assert.doesNotMatch(contract, /font-family:\s*['"]?(Inter|JetBrains)/i);
  assert.doesNotMatch(contract, /Primary Font Family/i);
  assert.match(contract, /Departure Mono/);
  assert.match(contract, /#ffa133/i);
  assert.match(contract, /\bInter\b/);
  assert.match(contract, /\bOutfit\b/);
  assert.match(contract, /\bJetBrains Mono\b/);
});
