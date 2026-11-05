// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The adversarial review found five defects. Four live in a module and are
// guarded by that module's own test. This one is the opposite: a block that
// draws something the page no longer has, so the guard is that the dead
// code stays dead.
//
// The block filled #iface-list with http://<ip>:<http port>/ addresses for
// the other interfaces of the machine. The markup went away in A1 and the
// HTTP listener binds 127.0.0.1 only, so those links could never work.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const panelRoot = path.resolve(import.meta.dirname);
const read = name => fs.readFileSync(path.join(panelRoot, name), 'utf8');

test('the dead list of other interfaces stays dead', () => {
  const app = read('app.js');
  assert.equal(app.includes('iface-list'), false,
    'the #iface-list block is dead: the markup is gone and the HTTP listener binds 127.0.0.1 only');
  assert.equal(app.includes('iface-primary-ip'), true,
    'the primary address is still drawn on the Main tab');
  const css = read('style.css');
  assert.equal(css.includes('.iface-list'), false, 'the .iface-list rule only styled the dead list');
  assert.equal(css.includes('.iface-row'), false, 'the .iface-row rules only styled the dead list');
  assert.equal(css.includes('.iface-primary'), true, 'the primary address keeps its own rules');
});
