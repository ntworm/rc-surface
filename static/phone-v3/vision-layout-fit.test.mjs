// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Structural assertions for the redesigned Vision page layout.
//
// These tests guard the layout contract that keeps the page usable on a
// phone held sideways: the three learned-pose slots are the highest
// priority, the camera and its controls are second, and everything else
// (detectors, readouts) compresses or hides when space is tight.
//
// They assert structural CSS properties — not pixel measurements — so they
// protect against the class of bug that produced the original overlap
// (text escaping its row, secondary sections stealing height) without
// being brittle to minor spacing tweaks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.join(import.meta.dirname, file), 'utf8');

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : '';
}

test('the top row reserves usable height for the studio and keeps the deck out of its column', () => {
  const css = read('style.css');
  const workspace = cssBlock(css, '.vision-workspace');
  const column = cssBlock(css, '.vision-right-column');

  assert.match(workspace, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(column, /display:\s*grid/, 'right column uses grid for row priority');
  assert.match(
    column,
    /grid-template-rows:\s*minmax\(136px,\s*1fr\)\s+auto/,
    'studio has a non-zero floor and only competes with detectors',
  );
  assert.match(column, /min-height:\s*0/);
  assert.match(column, /overflow:\s*hidden/);
});

test('a slot is contained and cannot spill out of its row', () => {
  const css = read('style.css');
  const slot = cssBlock(css, '.vision-gesture-slot');

  assert.match(slot, /overflow:\s*hidden/, 'nothing may draw outside the slot');
  assert.match(slot, /min-width:\s*0/);
  assert.match(slot, /min-height:\s*0/);
  assert.match(slot, /display:\s*flex/, 'slot uses flex for horizontal row layout');
});

test('the slot status truncates and cannot overflow', () => {
  const css = read('style.css');
  const status = cssBlock(css, '.vision-slot-status');

  assert.match(status, /white-space:\s*nowrap/);
  assert.match(status, /overflow:\s*hidden/);
  assert.match(status, /text-overflow:\s*ellipsis/);
});

test('the secondary sections cannot squeeze the slots out', () => {
  const css = read('style.css');

  assert.match(cssBlock(css, '.vision-detector-section'), /overflow:\s*hidden/);
  assert.match(cssBlock(css, '.vision-signal-strip'), /overflow:\s*hidden/);
  assert.match(cssBlock(css, '.vision-sensor-deck .vision-readout-card'), /min-height:\s*0/);
  assert.match(cssBlock(css, '.vision-sensor-deck .vision-readout-card'), /overflow:\s*hidden/);
});

test('the three slots share the studio width instead of splitting its scarce height', () => {
  const css = read('style.css');
  for (const selector of ['.vision-gesture-slots', '.vision-pose-grid']) {
    const block = cssBlock(css, selector);
    assert.match(
      block,
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
      `${selector} must give each slot an equal, shrinkable column`,
    );
    assert.doesNotMatch(block, /grid-template-rows:\s*repeat\(3,/);
  }
});

test('the four slot actions are arranged in a 2x2 grid to maximize touch targets', () => {
  const css = read('style.css');
  const actions = cssBlock(css, '.vision-slot-actions');
  const buttons = cssBlock(css, '.vision-slot-actions button');

  assert.match(actions, /grid-template-columns:\s*repeat\(2,/);
  assert.match(actions, /grid-template-rows:\s*repeat\(2,/);
  assert.match(actions, /min-width:\s*0/);
  assert.match(buttons, /min-width:\s*63px/, 'each action preserves the measured phone-width target');
  assert.match(buttons, /min-height:\s*47px/, 'each action preserves the measured phone-height target');
});

test('compact card labels and controls survive the primary short-screen layout', () => {
  const css = read('style.css');
  const shortScreen = css.match(/@media \(max-height: 460px\)\s*\{([\s\S]*?)\n\}/);

  assert.ok(shortScreen, 'a short-screen rule must exist');
  assert.doesNotMatch(
    shortScreen[1],
    /\.vision-readout-card em\s*\{\s*display:\s*none/,
    'every readout card must remain identifiable on the real device',
  );
  assert.doesNotMatch(
    shortScreen[1],
    /vision-slot-actions/,
    'the slot action buttons must survive every breakpoint',
  );
});

test('the focused readout deck spans the workspace in one two-card row', () => {
  const css = read('style.css');
  const deck = cssBlock(css, '.vision-sensor-deck');
  const grid = cssBlock(css, '.vision-sensor-deck .vision-readout-grid');

  assert.match(deck, /grid-column:\s*1\s*\/\s*-1/);
  assert.match(deck, /grid-row:\s*2/);
  assert.match(grid, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(grid, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(cssBlock(css, '.vision-sensor-deck .vision-readout-card:nth-child(1)'), /grid-column:\s*1/);
  assert.match(cssBlock(css, '.vision-sensor-deck .vision-readout-card:nth-child(2)'), /grid-column:\s*2/);
  assert.equal(cssBlock(css, '.vision-sensor-deck .vision-readout-card:nth-child(3)'), '');
});

test('MAP and CLUTCH use explicit track counts instead of content-driven auto-fit', () => {
  const css = read('style.css');

  assert.match(
    cssBlock(css, '.vision-readout-card:nth-child(1) .vision-axis-chips'),
    /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    cssBlock(css, '.vision-readout-card:nth-child(2) .vision-axis-chips'),
    /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
});

test('the page itself still refuses to scroll', () => {
  const css = read('style.css');
  assert.match(css, /\.page-video\s*\{[^}]*overflow:\s*hidden/);
  assert.match(cssBlock(css, '.vision-workspace'), /overflow:\s*hidden/);
});

test('the camera and its controls are still in the left column', () => {
  const html = read('index.html');
  assert.match(html, /<div class="vision-left-column">[\s\S]*vision-command-bar/);
  assert.match(html, /<div class="vision-left-column">[\s\S]*vision-camera-stage/);
  assert.match(html, /id="chk-vision-enable"/);
  assert.match(html, /id="vision-confidence"/);
  assert.match(html, /id="vision-recognition-preset"/);
  assert.equal((html.match(/class="vision-gesture-slot"/g) || []).length, 3);
});

test('gesture studio comes before detectors in the right column', () => {
  const html = read('index.html');
  const studioPos = html.indexOf('vision-gesture-studio');
  const detectorPos = html.indexOf('vision-detector-section');
  assert.ok(studioPos > 0, 'gesture studio must exist');
  assert.ok(detectorPos > 0, 'detector section must exist');
  assert.ok(
    studioPos < detectorPos,
    'gesture studio must come before detector section in DOM order',
  );
});

test('the sensor deck is a workspace row, not a child of the right column', () => {
  const html = read('index.html');
  assert.match(
    html,
    /<div class="vision-right-column">[\s\S]*vision-detector-section[\s\S]*?<\/div>\s*<div class="vision-sensor-deck/,
  );
});
