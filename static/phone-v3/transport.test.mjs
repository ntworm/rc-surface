// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'modules', 'transport.js'), 'utf8');

test('header transport exposes play state through class and ARIA without rewriting icon text', () => {
  const classes = new Set();
  const attributes = new Map();
  const headerPlay = {
    textContent: '',
    classList: {
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name); },
    addEventListener() {},
  };
  const context = {
    window: { RCSurface: {} },
    document: {
      getElementById(id) {
        return id === 'btn-header-play' ? headerPlay : null;
      },
    },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'modules/transport.js' });
  context.window.RCSurface.setupTransport();

  context.window.updateHeaderPlayState(true);

  assert.equal(headerPlay.classList.contains('is-playing'), true);
  assert.equal(headerPlay.getAttribute('aria-pressed'), 'true');
  assert.equal(headerPlay.getAttribute('aria-label'), 'Pause');
  assert.equal(headerPlay.textContent, '', 'CSS geometry must remain untouched by state changes');

  context.window.updateHeaderPlayState(false);
  assert.equal(headerPlay.classList.contains('is-playing'), false);
  assert.equal(headerPlay.getAttribute('aria-pressed'), 'false');
  assert.equal(headerPlay.getAttribute('aria-label'), 'Play');
});

// ---------------------------------------------------------------------------
// The downbeat is a position in the bar, not a beat number.

function pulseFor(beat, beatInBar, numerator) {
  // Runs the real body of triggerMetronomePulse over a fake button, so the
  // class it lands on is observed rather than read off the source.
  const inicio = source.indexOf('window.triggerMetronomePulse = (beat, beatInBar) => {');
  assert.ok(inicio > 0, 'triggerMetronomePulse must take the bar position');
  const abre = source.indexOf('{', inicio + 'window.triggerMetronomePulse = ('.length);
  const fecha = source.indexOf('\n    };', abre);
  assert.ok(fecha > abre, 'the handler must close');
  const corpo = source.slice(abre + 1, fecha);
  const classes = new Set();
  const btn = {
    offsetWidth: 1,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
    },
  };
  new Function('beat', 'beatInBar', 'btnTrnMode', 'window', corpo)(
    beat, beatInBar, btn, { currentNumerator: numerator },
  );
  return classes.has('metronome-pulse-first') ? 'first' : 'other';
}

test('the metronome marks every downbeat, not the second beat of a take', () => {
  // AbletonOSC reports an absolute beat count from the start of playback. The
  // client compared it to 1, which matched the second pulse of a take and
  // nothing after it: green once, blue forever, and green again on the next
  // play because the count restarts.
  const emQuatro = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((b) => pulseFor(b, b % 4, 4));
  assert.deepEqual(emQuatro, [
    'first', 'other', 'other', 'other',
    'first', 'other', 'other', 'other',
    'first',
  ]);
});

test('a server that does not send the bar position still gets it right', () => {
  // Derived from the signature rather than falling back to a fixed beat number.
  const semPosicao = [0, 1, 2, 3, 4].map((b) => pulseFor(b, undefined, 4));
  assert.deepEqual(semPosicao, ['first', 'other', 'other', 'other', 'first']);
  // And it follows the signature, not a hardcoded four.
  const emTres = [0, 1, 2, 3, 4, 5, 6].map((b) => pulseFor(b, undefined, 3));
  assert.deepEqual(emTres, ['first', 'other', 'other', 'first', 'other', 'other', 'first']);
});
