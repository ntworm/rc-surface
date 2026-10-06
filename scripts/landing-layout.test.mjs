// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (name) => fs.readFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), 'utf8');
const html = read('docs/index.html');
const rule = (selector) => {
  const at = html.indexOf(selector + '{');
  assert.ok(at >= 0, `missing CSS rule ${selector}`);
  return html.slice(at, html.indexOf('}', at) + 1);
};
const families = ['performance', 'continuous', 'snapshots', 'sensors', 'vision', 'mapping'];

test('the control deck is only as tall as the family it shows', () => {
  // Stacked in one grid cell, every family took the height of the tallest one
  // and left an empty band of up to 1100px under the short ones on a phone.
  assert.match(rule('.control-sheet'), /position:absolute/);
  assert.doesNotMatch(rule('.control-sheet'), /grid-area/);
  assert.match(rule('.control-deck'), /position:relative/);
  const shown = html.slice(html.indexOf(`#control-select-performance:checked ~ .control-layout [data-control-family="performance"]`));
  const active = shown.slice(0, shown.indexOf('}') + 1);
  for (const id of families) assert.ok(active.includes(`[data-control-family="${id}"]`), id);
  assert.match(active, /position:relative;visibility:visible/);
});

test('print and no-script readers still get every control family in sequence', () => {
  assert.match(html, /@media print\{[\s\S]*?\.control-sheet\{position:static!important;visibility:visible!important/);
  const noscript = html.slice(html.indexOf('<noscript>', html.indexOf('data-control-viewer')));
  assert.match(noscript.slice(0, noscript.indexOf('</noscript>')), /\.control-sheet\{position:static;visibility:visible/);
});

test('odd cards close their row instead of leaving an empty cell', () => {
  const count = (open) => {
    const block = html.slice(html.indexOf(open));
    const body = block.slice(0, block.indexOf('\n      </div>'));
    return (body.match(/<(?:div class="card"|article class="story")/g) || []).length;
  };
  assert.equal(count('<div class="cards c2">') % 2, 1, 'the rule exists for an odd troubleshooting list');
  assert.equal(count('<div class="stories">') % 2, 1, 'the rule exists for an odd scenario list');
  assert.match(html, /\.cards\.c2 > \.card:last-child:nth-child\(odd\),\s*\.stories > \.story:last-child:nth-child\(odd\)\{grid-column:1 \/ -1\}/);
  assert.equal((html.match(/<div class="pf-card"/g) || []).length, 5);
  assert.match(html, /@media \(max-width:1000px\)\{\s*\.pf\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(html, /\.pf-card:nth-child\(n\+4\)\{grid-column:span 3\}/);
  assert.match(html, /@media \(max-width:640px\)\{[\s\S]*?\.pf-card:last-child:nth-child\(odd\)\{grid-column:1 \/ -1\}/);
});

test('a scenario arrow always stays with the parameter it points at', () => {
  const lines = [...html.matchAll(/<div class="mapline">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.equal(lines.length, 5);
  for (const line of lines) {
    const arrows = (line.match(/&rarr;/g) || []).length;
    const grouped = (line.match(/<span class="to"><span>&rarr;<\/span><span[^>]*>[^<]+<\/span><\/span>/g) || []).length;
    assert.ok(arrows > 0);
    assert.equal(grouped, arrows, line);
  }
});
