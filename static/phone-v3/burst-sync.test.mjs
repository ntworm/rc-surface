// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// Pad mode D fired a fixed 520 ms envelope with a 70 ms attack, hardcoded at
// two call sites, while LFOs and stutters both took their length from Live's
// tempo under SYNC. A burst is the one modulator where being off the grid is
// audible immediately, so it now resolves its length the same way — and, like
// the others, only while SYNC is on.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.join(import.meta.dirname, 'controls.js'),
  'utf8',
);
const markup = fs.readFileSync(
  path.join(import.meta.dirname, 'index.html'),
  'utf8',
);

// The resolver is a pure function of syncMode, syncSettings and currentBpm, so
// it can be lifted out and exercised without a DOM.
function resolver({ syncMode, burstSubdivision, burstAttackRatio, currentBpm }) {
  const body = source.match(
    /function resolveBurstShape\(\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(body, 'resolveBurstShape must exist in controls.js');
  const free = source.match(/BURST_FREE_DURATION_MS = (\d+)/);
  const freeAttack = source.match(/BURST_FREE_ATTACK_MS = (\d+)/);
  assert.ok(free && freeAttack, 'the free envelope must stay named');
  const fn = new Function(
    'window',
    'BURST_FREE_DURATION_MS',
    'BURST_FREE_ATTACK_MS',
    `${body[0]} return resolveBurstShape();`,
  );
  return fn(
    { syncMode, syncSettings: { burstSubdivision, burstAttackRatio }, currentBpm },
    Number(free[1]),
    Number(freeAttack[1]),
  );
}

test('FREE keeps the burst exactly as it was', () => {
  const shape = resolver({
    syncMode: 'free',
    burstSubdivision: 0.25,
    burstAttackRatio: 0.5,
    currentBpm: 174,
  });
  // Neither the subdivision nor the tempo may reach a free-running burst.
  assert.equal(shape.durationMs, 520);
  assert.equal(shape.attackMs, 70);
});

test('SYNC takes the length from the grid and the tempo', () => {
  // One beat at 120 BPM is 500 ms.
  const beat = resolver({
    syncMode: 'sync',
    burstSubdivision: 1,
    burstAttackRatio: 0.135,
    currentBpm: 120,
  });
  assert.equal(beat.durationMs, 500);
  assert.ok(Math.abs(beat.attackMs - 67.5) < 1e-9);

  // One bar at 120 is four times that.
  const bar = resolver({
    syncMode: 'sync',
    burstSubdivision: 4,
    burstAttackRatio: 0.135,
    currentBpm: 120,
  });
  assert.equal(bar.durationMs, 2000);

  // The attack is a proportion, so a short burst is not all attack.
  const short = resolver({
    syncMode: 'sync',
    burstSubdivision: 0.0625,
    burstAttackRatio: 0.135,
    currentBpm: 120,
  });
  assert.ok(
    short.attackMs < short.durationMs / 2,
    'attack must stay a fraction of the body at any length',
  );
});

test('a tempo change moves the burst', () => {
  const at120 = resolver({ syncMode: 'sync', burstSubdivision: 1, burstAttackRatio: 0.135, currentBpm: 120 });
  const at60 = resolver({ syncMode: 'sync', burstSubdivision: 1, burstAttackRatio: 0.135, currentBpm: 60 });
  assert.equal(at60.durationMs, at120.durationMs * 2, 'half the tempo is twice the beat');
});

test('missing or nonsense inputs fall back instead of producing NaN', () => {
  for (const bad of [0, -1, NaN, undefined, null, 'x']) {
    const shape = resolver({
      syncMode: 'sync',
      burstSubdivision: 1,
      burstAttackRatio: 0.135,
      currentBpm: bad,
    });
    assert.ok(
      Number.isFinite(shape.durationMs) && shape.durationMs > 0,
      `tempo ${String(bad)} must not reach the envelope`,
    );
    assert.equal(shape.durationMs, 500, 'falls back to 120 BPM');
  }
  for (const bad of [0, -2, NaN, undefined]) {
    const shape = resolver({
      syncMode: 'sync',
      burstSubdivision: bad,
      burstAttackRatio: 0.135,
      currentBpm: 120,
    });
    assert.ok(Number.isFinite(shape.durationMs) && shape.durationMs > 0);
  }
  // An out-of-range attack is clamped, never inverted or past the body.
  const wide = resolver({ syncMode: 'sync', burstSubdivision: 1, burstAttackRatio: 9, currentBpm: 120 });
  assert.ok(wide.attackMs <= wide.durationMs / 2);
  const tiny = resolver({ syncMode: 'sync', burstSubdivision: 1, burstAttackRatio: -3, currentBpm: 120 });
  assert.ok(tiny.attackMs > 0);
});

test('neither call site hardcodes the envelope any more', () => {
  assert.doesNotMatch(
    source,
    /burstDurationMs:\s*\d/,
    'the gesture call site must ask the resolver',
  );
  assert.doesNotMatch(source, /attackMs:\s*70\b/, 'the mapping call site too');
  // Two call sites, one resolver: that is the whole point.
  const calls = source.match(/resolveBurstShape\(\)/g) || [];
  assert.ok(calls.length >= 3, `expected the resolver at both call sites, saw ${calls.length}`);
});

test('the panel exposes the burst the way it exposes the other families', () => {
  assert.match(markup, /BURST CONFIG \(PAD MODE D\)/);
  assert.match(markup, /id="burst-rate-grid"/);
  assert.match(markup, /id="burst-attack"/);
  // Wired, not decorative — the failure that shipped on the snapshots page.
  assert.ok(source.includes("getElementById('burst-rate-grid')"));
  assert.ok(source.includes("getElementById('burst-attack')"));
  assert.ok(source.includes('burstSubdivision'), 'the grid must write the setting');
  assert.ok(source.includes('burstAttackRatio'));
  // And it says when it applies, because FREE ignores all of it.
  assert.match(markup, /Applies while SYNC is on/);
});

// ---------------------------------------------------------------------------
// A burst has to end the same way it started, everywhere it can be started.

function classListDe(classes) {
  const set = new Set(classes);
  return {
    set,
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
  };
}

// Lifts one loop body out of the frame tick and runs it over a fake element,
// so the cleanup is observed rather than read.
const GUARDA = 'if (state.burstUntil > 0 && now >= state.burstUntil) {';

function expirar(marcador, classesIniciais, estado) {
  // Sliced rather than matched: the block is full of braces and regex
  // metacharacters, and a pattern that silently stops matching would turn this
  // into a test that passes by finding nothing.
  const desde = source.indexOf(`// ${marcador}`);
  assert.ok(desde > 0, `${marcador}: section marker must exist`);
  const abre = source.indexOf(GUARDA, desde);
  assert.ok(abre > 0, `${marcador}: expiry guard must exist`);
  const corpo = abre + GUARDA.length;
  const fecha = source.indexOf('\n      }', corpo);
  assert.ok(fecha > corpo, `${marcador}: expiry block must close`);
  const bloco = [null, source.slice(corpo, fecha)];
  const el = { classList: classListDe(classesIniciais), style: { removeProperty() {}, setProperty() {} },
    querySelector: () => ({ style: {} }) };
  // The block ends in `continue`, which only parses inside a loop.
  const fn = new Function(
    'state', 'now', 'document', 'name', 'clearModeClass', 'emitLfoState', 'emitStutterState',
    `for (let uma = 0; uma < 1; uma += 1) {${bloco[1]}\n}\nreturn state;`,
  );
  fn(estado, 10_000, { querySelector: () => el }, 'lfo-1',
     (e) => ['mode-a', 'mode-b', 'mode-c', 'mode-d'].forEach((c) => e.classList.remove(c)),
     () => {}, () => {});
  return el.classList.set;
}

test('an expired LFO burst leaves no mode class behind', () => {
  // setModeClass stamps mode-d on the element when the burst starts. The
  // expiry removed 'on' and 'burst' and left mode-d, so the control kept the
  // colour of a control that is still firing after it had stopped emitting.
  const restou = expirar('2. Run Active LFOs', ['on', 'burst', 'mode-d'],
    { active: true, burstUntil: 1, value: 1 });
  assert.ok(!restou.has('mode-d'), `mode-d survived the burst: ${[...restou]}`);
  assert.ok(!restou.has('on') && !restou.has('burst'), `stale state: ${[...restou]}`);
});

test('an expired stutter burst leaves no mode class behind', () => {
  const restou = expirar('4. Run Active Stutters', ['pressed', 'burst', 'mode-d'],
    { pressed: true, burstUntil: 1 });
  assert.ok(!restou.has('mode-d'), `mode-d survived the burst: ${[...restou]}`);
  assert.ok(!restou.has('pressed') && !restou.has('burst'), `stale state: ${[...restou]}`);
});

test('every mode D burst takes its length from the one resolver', () => {
  // LFOs and stutters carried a hardcoded 1100 ms at four call sites, so the
  // burst length configured under SYNC governed pads only and the same press
  // lasted two different times depending on which control it landed on.
  const literais = [...source.matchAll(/burstUntil\s*=\s*performance\.now\(\)\s*\+\s*(\d+)/g)]
    .map((m) => m[1]);
  assert.deepEqual(literais, [], 'a burst length must never be a literal');
  const activateLiteral = [...source.matchAll(/activate\(state,\s*(\d+)\)/g)]
    .map((m) => m[1])
    .filter((n) => n !== '0');
  assert.deepEqual(activateLiteral, [], 'activate() must be handed a resolved length');
});

// ---------------------------------------------------------------------------
// The settings panel has to describe the burst it will actually produce.

test('the burst grid gives every length its own label', () => {
  // Two buttons both read 1/2: one was two beats and the other half a beat, a
  // factor of four apart with nothing on screen to tell them apart.
  const grid = markup.slice(
    markup.indexOf('id="burst-rate-grid"'),
    markup.indexOf('</div>', markup.indexOf('id="burst-rate-grid"')),
  );
  const botoes = [...grid.matchAll(/data-val="([^"]+)"[^>]*>([^<]+)</g)]
    .map((m) => ({ val: m[1], rotulo: m[2].trim() }));
  assert.ok(botoes.length >= 7, 'the grid must still offer its lengths');
  const rotulos = botoes.map((b) => b.rotulo);
  assert.equal(new Set(rotulos).size, rotulos.length,
    `two lengths share a label: ${rotulos.join(', ')}`);
  const valores = botoes.map((b) => Number(b.val));
  assert.ok(valores.every((v) => Number.isFinite(v) && v > 0), 'every length is a number of beats');
});

test('the attack is set on a drawing, not as a percentage', () => {
  // A percentage asks the reader to imagine the shape it describes. The shape
  // is what is being set, so it is drawn and the peak is dragged.
  assert.match(markup, /id="burst-env"/, 'the envelope must be drawn');
  assert.match(markup, /id="burst-env-line"/);
  assert.match(markup, /id="burst-env-peak"/);
  assert.match(markup, /id="burst-env-len"/, 'the resolved length must be shown');
  // Kept in the DOM, hidden, so the control stays reachable by keyboard and
  // stays the single place the value is written.
  assert.match(markup, /<input type="range" id="burst-attack" class="visually-hidden"/);
  assert.doesNotMatch(markup, /Attack \(% of length\)/, 'the percentage label is gone');
  assert.match(source, /burstAttackInput\.dispatchEvent\(new Event\('input'/,
    'the drag must write through the input, not around it');
});

test('the drawing follows the tempo it depends on', () => {
  // The length comes from Live's tempo, so a picture drawn once is wrong as
  // soon as the tempo moves — which is the state that made the whole setting
  // look broken.
  assert.match(source, /function drawBurstEnvelope\(\)/);
  assert.match(source, /drawBurstEnvelope\(\)[\s\S]{0,80}resolveBurstShape\(\)/,
    'the drawing must read the resolver, not a stored value');
  assert.match(source, /sync-settings-overlay[\s\S]{0,200}drawBurstEnvelope/,
    'it must redraw while the panel is open');
  assert.match(source, /burstSubdivision = val;[\s\S]{0,200}drawBurstEnvelope/,
    'changing the subdivision must redraw');
});

// ---------------------------------------------------------------------------
// A burst is a shape, not a timer.

function envelopeFactor(state, now) {
  const inicio = source.indexOf('function burstEnvelopeFactor(state, now) {');
  assert.ok(inicio > 0, 'burstEnvelopeFactor must exist');
  const fim = source.indexOf('\n  }', inicio);
  const corpo = source.slice(source.indexOf('{', inicio) + 1, fim);
  return new Function('state', 'now', corpo)(state, now);
}

test('a mode D LFO opens over the attack and closes over the release', () => {
  // Pad mode D on a pad rises then falls. On an LFO the same press only opened
  // a gate: the modulator switched on at full depth, ran, and stopped, so the
  // attack setting governed pads and nothing else.
  const st = { burstStart: 0, burstUntil: 1000, burstAttackMs: 200 };
  assert.equal(envelopeFactor(st, 0), 0, 'starts closed');
  assert.ok(Math.abs(envelopeFactor(st, 100) - 0.5) < 1e-9, 'half way up the attack');
  assert.equal(envelopeFactor(st, 200), 1, 'open at the end of the attack');
  assert.ok(Math.abs(envelopeFactor(st, 600) - 0.5) < 1e-9, 'half way down the release');
  assert.equal(envelopeFactor(st, 1000), 0, 'closed at the end');
  // No burst running must not touch the normal path.
  assert.equal(envelopeFactor({ burstUntil: 0, burstStart: 0 }, 500), 1);
});

test('the LFO depth is what the envelope scales', () => {
  assert.match(source, /state\.depth \* envelope/,
    'the envelope must reach the depth, or the burst is still just a gate');
  // Both activate paths and both controlSetter paths must record the shape,
  // or the envelope has no start time to measure from.
  const starts = (source.match(/state\.burstStart = /g) || []).length;
  assert.ok(starts >= 4, `every burst entry point must record its start, saw ${starts}`);
  const attacks = (source.match(/state\.burstAttackMs = /g) || []).length;
  assert.ok(attacks >= 4, `and its attack, saw ${attacks}`);
});
