// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// A control that renders and does nothing is the failure mode this project
// keeps rediscovering: the snapshots page shipped three of them while every
// test was green, because nothing compared the markup against the scripts that
// are supposed to drive it. This walks every browser client and asserts that
// each interactive element is reachable from the code that page actually
// loads — by id, or through event delegation on an attribute.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.join(import.meta.dirname, '..');

const PAGES = [
  'static/phone-v3/index.html',
  'static/panel/index.html',
  'static/admin/mappings.html',
];

// Elements driven by a delegated listener rather than by their own id. The
// attribute is what the listener selects on, so its presence is the binding.
const DELEGATED = ['data-action', 'data-set-locale', 'data-val', 'data-tab', 'data-page'];

function scriptsFor(pagePath) {
  const dir = path.dirname(pagePath);
  const html = fs.readFileSync(path.join(root, pagePath), 'utf8');
  let code = '';
  for (const m of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
    const resolved = path.join(root, dir, m[1]);
    if (fs.existsSync(resolved)) code += `${fs.readFileSync(resolved, 'utf8')}\n`;
  }
  for (const m of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)) {
    code += `${m[1]}\n`;
  }
  // Modules a page pulls in at runtime rather than through a tag.
  const modules = path.join(root, dir, 'modules');
  if (fs.existsSync(modules)) {
    for (const f of fs.readdirSync(modules)) {
      if (f.endsWith('.js') && !f.includes('.test.')) {
        code += `${fs.readFileSync(path.join(modules, f), 'utf8')}\n`;
      }
    }
  }
  return { html, code };
}

for (const page of PAGES) {
  test(`${page} has no control wired to nothing`, () => {
    const { html, code } = scriptsFor(page);
    const inertes = [];
    for (const m of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)) {
      const attrs = m[2];
      const id = /\bid="([^"]+)"/.exec(attrs);
      if (!id) continue;
      if (code.includes(id[1])) continue;
      if (DELEGATED.some((a) => attrs.includes(a))) continue;
      inertes.push(`${m[1]}#${id[1]}`);
    }
    assert.deepEqual(inertes, [],
      `these render but no script reaches them:\n  ${inertes.join('\n  ')}`);
  });
}

test('the audit itself would notice a dead control', () => {
  // A guard that cannot fail is worse than none: prove the matcher sees one.
  const html = '<div><input type="range" id="totalmente-solto"></div>';
  const code = 'document.getElementById("outra-coisa");';
  const inertes = [];
  for (const m of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[2]);
    if (id && !code.includes(id[1]) && !DELEGATED.some((a) => m[2].includes(a))) {
      inertes.push(id[1]);
    }
  }
  assert.deepEqual(inertes, ['totalmente-solto']);
});

test('the browser code is actually linted', () => {
  // static/ is the phone, the panel and the admin window — most of what runs.
  // No config block matched it, so ESLint applied an empty ruleset to all of
  // it, and a call to an undefined T() passed lint, threw at load, and killed
  // every initialiser after it in the panel: the panel showed zero clients
  // with a phone plainly connected. no-undef is what catches that.
  const config = fs.readFileSync(path.join(root, 'eslint.config.js'), 'utf8');
  const bloco = config.slice(config.indexOf('"static/**/*.js"'));
  assert.ok(bloco.length > 0, 'a config block must match the browser code');
  assert.match(bloco.slice(0, 1200), /"no-undef":\s*"error"/,
    'no-undef must be an error there: an undefined name is a crash, not a style');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.lint, /\bstatic\b/, 'and lint must actually visit it');
});
