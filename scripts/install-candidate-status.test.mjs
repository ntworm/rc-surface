import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('installation guides distinguish source version from a published release', () => {
  for (const file of ['docs/INSTALL.md', 'docs/INSTALL.pt-BR.md']) {
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:current release is|atual é a)\s+\*\*v1\.0\.0/);
    assert.match(source, /candidat[ae]/i);
  }
});
