// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(path.join(import.meta.dirname, file), 'utf8');

// Pull a `function name(...) { ... }` out of the dashboard by brace
// matching, so the tests evaluate the shipped code instead of a copy.
function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} function exists`);

  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Could not extract ${name}`);
}

// The touch badge template the dashboard writes into innerHTML.
function extractTouchTemplate(source) {
  const match = source.match(/`<span class="touch">[\s\S]*?<\/span>`/);
  assert.ok(match, 'the touch badge template exists');
  return match[0];
}

test('admin touch badges escape the touch id and coerce the coordinates', () => {
  const source = read('app.js');
  const escSource = extractFunction(source, 'esc');
  const template = extractTouchTemplate(source);

  assert.match(template, /esc\(t\.id\)/,
    'the touch id must be escaped before it reaches innerHTML');

  const context = { render: null };
  vm.createContext(context);
  vm.runInContext(`${escSource}\nrender = (t) => ${template};`, context);

  const html = context.render({ id: '<img src=x onerror=alert(1)>', x: 0, y: 0, force: 0 });
  assert.doesNotMatch(html, /<img\b/i, 'a touch id must never reach innerHTML as markup');
  assert.match(html, /&lt;img/, 'the touch id stays visible as escaped text');

  assert.doesNotThrow(() => context.render({ id: '1', x: 'abc', y: 'def' }),
    'a non-numeric coordinate must not throw while rendering');
});

test('admin control rows escape the name and coerce the numbers', () => {
  const source = read('app.js');
  const escSource = extractFunction(source, 'esc');
  const cleanSource = extractFunction(source, 'cleanControlName');
  const rowSource = extractFunction(source, 'controlRow');

  const context = { row: null };
  vm.createContext(context);
  vm.runInContext(`${escSource}\n${cleanSource}\n${rowSource}\nrow = controlRow;`, context);

  let named = '';
  assert.doesNotThrow(() => { named = context.row({ name: '<img src=x onerror=alert(1)>', value: 1 }); });
  assert.doesNotMatch(named, /<img\b/i, 'a control name must never reach innerHTML as markup');
  assert.match(named, /&lt;img/, 'the control name stays visible as escaped text');

  let xy = '';
  assert.doesNotThrow(() => { xy = context.row({ name: 'pad-1', x: 'abc', y: 'def' }); });
  assert.match(xy, /x:NaN y:NaN/, 'a non-numeric coordinate renders as NaN instead of throwing');
});
