// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const landing = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'index.html'), 'utf8');
const guide = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'USER-GUIDE.md'), 'utf8');

function figure(id, nextId) {
  const start = landing.indexOf(`id="${id}"`);
  const end = nextId ? landing.indexOf(`id="${nextId}"`, start) : landing.length;
  assert.ok(start >= 0 && end > start, `${id} must exist before ${nextId || 'EOF'}`);
  return landing.slice(start, end);
}

function controlFamily(id, nextId) {
  return figure(`control-family-${id}`, nextId ? `control-family-${nextId}` : null);
}

test('Fig. 5 documents the real live AUD history widget', () => {
  const aud = figure('surface-map-aud', 'surface-map-vid');
  assert.doesNotMatch(aud, /sheet-only|not a runtime widget/i);
  assert.match(aud, /2\.5[- ]second/i);
  assert.match(aud, /live[^<]*(?:RMS|history)|(?:RMS|history)[^<]*live/i);
  assert.match(aud, /SENS/);
  assert.match(aud, /RELEASE/);
  assert.match(aud, /WINDOW/);
  for (const name of ['transient', 'kick', 'snare', 'brightness', 'centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high']) {
    assert.ok(aud.includes('sensor.audio.' + name), `AUD must document the public ${name} source`);
  }
  assert.doesNotMatch(aud, /rather than opening another analyser/i);
});

test('landing audio illustration and translations contain no retired tonal controls', () => {
  const audioPanel = landing.match(/data-audio-layout="readouts-timeline-controls"[\s\S]*?(?=data-i18n="lp.audio.timing")/)[0];
  assert.doesNotMatch(audioPanel, />(?:PITCH|NOTE|BPM|GATE)<|ui-gate|pitch lock|tempo avg/);
  const catalog = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'site-i18n.js'), 'utf8');
  assert.doesNotMatch(catalog, /preserved only for future work|preservado apenas para trabalho futuro|dashed red = gate threshold|vermelho tracejado = limiar do gate/);
});

test('Fig. 6 matches the focused VID surface and exact detector count', () => {
  const vid = figure('surface-map-vid', 'surface-map-map');
  assert.match(vid, /four built-in detectors/i);
  assert.match(vid, /MAP[^<]*(?:X\/Y\/Z|X, Y, and Z)/i);
  assert.match(vid, /CLUTCH[^<]*(?:X\/Y\/Z|X, Y, and Z)/i);
  assert.doesNotMatch(vid, />FINGERS<|AMBIENT|sensor\.vision\.fingers|sensor\.vision\.color/i);
  assert.match(vid, /PALM[^<]*FACE|FACE[^<]*PALM/i);
  assert.match(vid, /diagnostic/i);
});

test('landing no longer presents retired passive vision channels as mappings', () => {
  assert.doesNotMatch(landing, /sensor\.vision\.(?:fingers|color\.[rgb])/i);
  assert.doesNotMatch(landing, /PALM, FACE[^<]*(?:mappable|mapping targets)/i);
  assert.doesNotMatch(landing, /five built-in/i);
});

test('user guides document removal and twelve public audio descriptors', () => {
  assert.match(guide, /have been removed after\s+unreliable musical results/i);
  assert.doesNotMatch(guide, /preserved as dormant|pitch lane is dormant/i);
  for (const name of ['transient', 'kick', 'snare', 'brightness', 'centroid', 'flux', 'flatness', 'spread', 'rolloff', 'low', 'mid', 'high']) {
    assert.ok(guide.includes('sensor.audio.' + name));
  }
  assert.match(guide, /2\.5-second timeline/i);
  assert.match(guide, /RELEASE/);
  assert.match(guide, /WINDOW/);
});

test('the guide documents every detector knob the phone offers', () => {
  // A knob nobody documented reads as the detector being wrong.
  const read = (...p) => fs.readFileSync(path.join(import.meta.dirname, '..', ...p), 'utf8');
  const guide = read('docs', 'USER-GUIDE.md');
  const guidePt = read('docs', 'USER-GUIDE.pt-BR.md');
  const workspace = read('static', 'phone-v3', 'audio-workspace.js');
  const knobs = [...workspace.matchAll(/key: '(\w+)', label:/g)].map((match) => match[1]);
  assert.deepEqual(knobs, ['sensitivity', 'releaseMs', 'curve', 'toneMs', 'textureMs', 'bandsMs']);
  for (const group of ['attacks', 'tone', 'texture', 'bands']) {
    assert.ok(workspace.includes(`gainKnob('${group}Gain')`), group + ' needs an output gain');
  }
  for (const rotulo of ['SENS', 'RELEASE', 'CURVE', 'SMOOTH', 'GAIN', 'WINDOW']) {
    assert.ok(guide.includes(rotulo), `${rotulo} is on screen and not in the guide`);
  }
  for (const rotulo of ['SENS', 'RELEASE', 'CURVA', 'SUAVE', 'GANHO', 'JANELA']) {
    assert.ok(guidePt.includes(rotulo), `${rotulo} is on screen and not in the PT-BR guide`);
  }
  const phone = read('static', 'phone-v3', 'index.html');
  assert.equal([...phone.matchAll(/data-audio-setting="([^"]+)"/g)].length, 0,
    'the pitch dials left the surface with the dormant lane');
});

test('the guide separates audio descriptors from the preserved Max Sender path', () => {
  const read = (...p) => fs.readFileSync(path.join(import.meta.dirname, '..', ...p), 'utf8');
  const guide = read('docs', 'USER-GUIDE.md');
  const guidePt = read('docs', 'USER-GUIDE.pt-BR.md');
  const install = read('docs', 'INSTALL.md');
  const installPt = read('docs', 'INSTALL.pt-BR.md');
  // Each of these is a decision the detector makes on the user's behalf, and
  // an undocumented one reads as the detector being wrong.
  for (const assunto of [/sensor\.audio\.attack/, /RC-Audio-Sender/, /spectral heuristics/i, /not a measured microphone-to-Live latency/i]) {
    assert.match(guide, assunto, `the guide must cover ${assunto}`);
  }
  assert.match(guide, /v2 field acceptance is pending/i);
  assert.match(guide, /Earlier F3\/stereo tests used the UDP/);
  assert.match(guidePt, /aceite em campo do v2 está pendente/i);
  assert.match(guidePt, /testes anteriores de F3\/estéreo/i);
  assert.match(install, /Transport v2 awaits a new Live test/i);
  assert.match(installPt, /transporte v2 aguarda novo teste no Live/i);
  for (const text of [guide, guidePt, install, installPt]) {
    assert.match(text, /Audio Sender input/);
    assert.match(text, /OFF/);
    assert.doesNotMatch(text, /Field-verified in Ableton Live 12|Verificado em campo no Ableton Live 12/i,
      'previous UDP acceptance must not be presented as verification of v2');
  }
});

test('every English document has its Portuguese sibling in step', () => {
  const dir = path.join(import.meta.dirname, '..', 'docs');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f.endsWith('.pt-BR.md')) continue;
    const pt = path.join(dir, f.replace(/\.md$/, '.pt-BR.md'));
    assert.ok(fs.existsSync(pt), `${f} has no translation`);
    // Not a size match — Portuguese runs longer — but a translation less than
    // two thirds the length has lost sections rather than been condensed.
    const en = fs.statSync(path.join(dir, f)).size;
    const size = fs.statSync(pt).size;
    assert.ok(size > en * 0.66,
      `${f}: the translation is ${size} against ${en}, which is a missing section`);
  }
});

test('control viewer uses six faithful behavioral illustrations', () => {
  const performance = controlFamily('performance', 'continuous');
  assert.match(performance, /data-control-illustration="performance"/);
  for (const symbol of ['release', 'hold', 'toggle', 'burst', 'beat']) {
    assert.match(performance, new RegExp(`data-symbol="${symbol}"`));
    assert.match(performance, new RegExp(`data-envelope="${symbol}"`));
  }
  assert.match(performance, /VALUE[\s\S]*TIME[\s\S]*TOUCH[\s\S]*UP/);
  assert.match(performance, /70 ms[\s\S]*450 ms/);

  const continuous = controlFamily('continuous', 'snapshots');
  assert.match(continuous, /data-control-illustration="continuous"/);
  // This panel used to be three widget portraits: a knob face, a fader rail and
  // a ball, each with a caption asserting a behaviour that was nowhere drawn.
  // It reads as a fake screenshot, and a hand-drawn imitation of a UI always
  // loses to the real one. It now draws the two gesture models the header has
  // always claimed, so the picture carries the argument instead of the caption.
  assert.match(continuous, /data-gesture-model="relative-drag"/);
  assert.match(continuous, /data-gesture-model="physics"/);
  assert.match(continuous, /data-xy-model="physics-canvas"/);
  assert.match(continuous, /data-real-control="knob"/);
  assert.match(continuous, /data-real-control="fader"/);
  assert.match(continuous, /relative vertical drag/i);
  assert.match(continuous, /15-POINT TRAIL/i);
  // The claims that make each model worth a panel at all.
  // Case-insensitive: the claims are sentence case in the markup and uppercased
  // by CSS, so the source stays readable text rather than shouted content.
  assert.match(continuous, /the touch point is never the value/i);
  assert.match(continuous, /release does not stop it/i);
  assert.match(continuous, /value = start \+ dy \/ rangePx/);
  // Gradients and a radial glow were the only ones on a sheet that is otherwise
  // flat and 1-bit, and they were most of why the panel read as mockup gloss.
  assert.doesNotMatch(continuous, /Gradient|url\(#[a-z-]*glow/i);

  const snapshots = controlFamily('snapshots', 'sensors');
  assert.match(snapshots, /data-control-illustration="snapshots"/);
  assert.match(snapshots, /data-concept="capture-recall"/);
  assert.match(snapshots, /data-concept="vector-morph"/);
  for (let slot = 1; slot <= 8; slot += 1) {
    assert.match(snapshots, new RegExp(`data-snapshot-slot="${slot}"`));
  }

  const sensors = controlFamily('sensors', 'vision');
  assert.match(sensors, /data-control-illustration="sensors"/);
  assert.match(sensors, /CALIBRATE[\s\S]*RMS[\s\S]*ENV/);
  assert.match(sensors, /SENS[\s\S]*RELEASE[\s\S]*WINDOW/);
  assert.match(sensors, /data-audio-layout="readouts-timeline-controls"/);
  assert.match(sensors, /SIGNAL \/ 2\.5s[\s\S]*LIVE/);

  const vision = controlFamily('vision', 'mapping');
  assert.match(vision, /data-control-illustration="vision"/);
  // The hand is a licensed glyph, not hand-authored path data. Three drawn
  // attempts were rejected for reading as organic shapes rather than a hand;
  // a professionally drawn set glyph reads as a pinch immediately. Assert the
  // provenance so nobody quietly replaces it with another hand-drawn attempt,
  // and assert the attribution so the CC BY-SA credit cannot be dropped.
  assert.match(vision, /data-role="pinch-glyph"/);
  // The CC BY-SA credit moved out of the colophon and into NOTICE, which the
  // colophon links. The credit itself is asserted in the typography test.
  assert.match(landing, /blob\/main\/NOTICE/);
  // One pinching hand and one open hand, each used once: the pinch engages on
  // the left, the hand opens on the right, and between them the mapped value
  // runs idle, then follows, then freezes. Repeating the same emoji across
  // cells read as decoration rather than as a sequence.
  assert.match(vision, /data-source="openmoji\/pinching-hand"/);
  assert.match(vision, /data-source="openmoji\/raised-hand"/);
  assert.match(vision, /1 &#183; ENGAGE[\s\S]*2 &#183; MOVE[\s\S]*3 &#183; RELEASE/);
  assert.match(vision, /contact rises past \.75[\s\S]*contact drops below \.55/);
  // The loop is the point: the value is left somewhere and picked up later.
  assert.match(vision, /PINCH AGAIN[\s\S]*RESUMES FROM THE SAVED VALUE/);
  // Those two numbers are the real constants in vision-processor.js
  // (CLUTCH_GATE_LOW and CLUTCH_GATE_HIGH). If they change there, this fails.
  // Poses, detectors and the direct-versus-clutch channels used to be drawn
  // inside the illustration as extra rows. They were duplicating the control
  // inventory while crowding the drawing into four competing rhythms, so they
  // now live only where they are actually consulted. Nothing was dropped —
  // assert both homes so a future edit cannot quietly lose them.
  assert.match(vision, /G1(?:&#8211;|–)G3 and the four built-in detectors/);
  assert.match(vision, /PALM and FACE remain local camera diagnostics/);
  const inventory = figure('controls', 'scenarios');
  assert.match(inventory, /Open \/ Fist \/ Pinch \/ Victory/);
  assert.match(inventory, /Pinch Clutch[\s\S]{0,120}pinch_x/);

  const mapping = controlFamily('mapping');
  assert.match(mapping, /data-control-illustration="mapping"/);
  assert.match(mapping, /data-role="curve-plot"/);
  assert.match(mapping, /NORMALIZE[\s\S]*CLAMP[\s\S]*TARGET RANGE/);
  assert.match(mapping, /BIND[\s\S]*TRIGGER NOTE/);
  assert.doesNotMatch(mapping, />FOLLOW DETECTED NOTE</);
  assert.match(mapping, /data-layout="source-transform-target"/);
  assert.match(mapping, /data-role="transform-desk"/);
});

test('the section numbering the sheet cross-references stays intact', () => {
  // Every section renders a visible ordinal eyebrow, and the prose refers to
  // sections by that number. The two halves have to move together: a reference
  // to 2.1 is only meaningful while a heading claims 2.1. Assert both, because
  // deleting one half leaves the other pointing at nothing on the page.
  const eyebrows = landing.match(/<div class="n">\d+\.\d+<\/div>/g) || [];
  assert.equal(eyebrows.length, 8, 'expected eight numbered sections');
  assert.deepEqual(
    eyebrows.map((tag) => tag.replace(/\D*(\d+\.\d+)\D*/, '$1')),
    ['1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0'],
  );
  assert.match(landing, /<h3[^>]*>2\.1 &#183; Clock source<\/h3>/);

  // Each cross-reference names a number and links to the section carrying it.
  for (const [anchor, shown] of [
    ['clock', '2.1'],
    ['chain', '2.0'],
    ['controls', '4.0'],
  ]) {
    assert.match(landing, new RegExp(`<a href="#${anchor}">${shown}</a>`));
    assert.match(landing, new RegExp(`id="${anchor}"`));
  }
  // No reference may point at a number no heading or eyebrow claims.
  const referenced = [...landing.matchAll(/<a href="#[a-z-]+">(\d+\.\d+)<\/a>/g)]
    .map((m) => m[1]);
  const declared = new Set([...eyebrows.map((t) => t.replace(/\D*(\d+\.\d+)\D*/, '$1')), '2.1']);
  for (const ref of referenced) {
    assert.ok(declared.has(ref), `reference to undeclared section ${ref}`);
  }
});

test('the sheet is set in one face, embedded, with hierarchy from size', () => {
  // It carried two: a pixel mono for the instrument layer and a proportional
  // face for prose. On a page that is almost entirely tables, drawings and
  // identifiers, the second face survived in eight paragraphs — rare enough
  // that every appearance read as a mistake rather than as a system. One face
  // now, with size and colour carrying the hierarchy instead.
  const face = '@font-face{font-family:"Departure Mono";src:url(data:font/woff2;base64,';
  assert.ok(landing.includes(face), 'Departure Mono must be embedded as a data URI');
  assert.doesNotMatch(landing, /IBM Plex/, 'the second face and its payload are gone');
  assert.doesNotMatch(landing, /var\(--sans\)/, 'nothing may still ask for the second face');
  // Embedded, not linked: the colophon claims no tracking, and a webfont
  // fetched from a third party would quietly make that claim false.
  assert.doesNotMatch(
    landing,
    /@import|<link[^>]+fonts\.(googleapis|gstatic)\.com/,
    'no remote font requests',
  );
  assert.match(landing, /p,\.lede,\.tnote,\.muted,dd,\.why\{font-family:var\(--mono\)\}/);
  assert.doesNotMatch(landing, /font-family:inherit/);

  // Attribution lives in NOTICE, linked from the colophon. A face that is no
  // longer shipped must not still be credited as bundled.
  assert.match(landing, /href="https:\/\/github\.com\/ntworm\/rc-surface\/blob\/main\/NOTICE"/);
  const notice = fs.readFileSync(path.join(import.meta.dirname, '..', 'NOTICE'), 'utf8');
  assert.ok(notice.includes('Departure Mono'), 'NOTICE must credit Departure Mono');
  assert.ok(!notice.includes('IBM Plex'), 'NOTICE must not credit a face we do not ship');

  // h3 was 11px: the exact size of td, th and .tnote, so a subsection heading
  // and a footnote arrived at identical weight and the sheet read as one flat
  // texture. With a single face, size is most of what hierarchy is left.
  const h3 = landing.match(/h3\{\s*font-size:(\d+(?:\.\d+)?)px/);
  const note = landing.match(/\.tnote\{font-size:(\d+(?:\.\d+)?)px/);
  assert.ok(h3 && note, 'h3 and .tnote sizes must be readable from the CSS');
  assert.ok(
    Number(h3[1]) - Number(note[1]) >= 2,
    `h3 (${h3[1]}px) must outrank .tnote (${note[1]}px)`,
  );
});

test('sections open on their content, not on a line about their content', () => {
  // These used to open with a `why` paragraph naming the section's job. Read in
  // sequence they were commentary about the sheet rather than the sheet, so the
  // owner cut all seven. Assert the decision: a reinstated opener would put the
  // padding back one section at a time.
  const sections = ['chain', 'map', 'controls', 'scenarios', 'install', 'trouble', 'docs'];
  for (const id of sections) {
    const start = landing.indexOf(`id="${id}"`);
    assert.ok(start > 0, `${id} must exist`);
  }
  assert.doesNotMatch(landing, /<p class="why"[ >]/, 'section openers were cut on purpose');
  // The hero still states the job once, in its lede.
  const hero = landing.slice(landing.indexOf('id="surface"'), landing.indexOf('id="chain"'));
  assert.match(hero, /class="lede"/);
});

test('the continuous panel quotes the real constants from controls.js', () => {
  // The drawing states rangePx, the rebound factor and the trail length as
  // fact. If someone tunes the feel in controls.js and nobody redraws, the
  // sheet starts lying with confidence, which is worse than saying nothing.
  const controls = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'static', 'phone-v3', 'controls.js'),
    'utf8',
  );
  // The family ids also appear earlier as tab labels, so the end marker has to
  // be searched from the illustration onward or the slice comes back empty.
  const from = landing.indexOf('data-control-illustration="continuous"');
  const figure = landing.slice(from, landing.indexOf('control-family-snapshots', from));
  assert.ok(figure.length > 500, 'continuous figure slice must not be empty');

  const knob = controls.match(/const rangePx = isMacro \? (\d+) : (\d+);/);
  assert.ok(knob, 'knob rangePx must be readable from controls.js');
  // P03 (rc-surface-modulator-quality-2026-09-16): the fader now measures the
  // live .fader-track height, so rangePx is `let` (re-bound on each gesture
  // start). Match either `const` or `let` and accept any numeric literal.
  const fader = controls.match(/function makeFader[\s\S]{0,900}?(?:const|let) rangePx = (\d+);/);
  assert.ok(fader, 'fader rangePx must be readable from controls.js');
  const bounce = controls.match(/const bounce = ([\d.]+);/);
  assert.ok(bounce, 'bounce must be readable from controls.js');
  const trail = controls.match(/if \(trail\.length > (\d+)\) trail\.shift\(\);/);
  assert.ok(trail, 'trail cap must be readable from controls.js');

  assert.ok(
    figure.includes(`KNOB ${knob[2]}`) && figure.includes(`MACRO KNOB ${knob[1]}`),
    `drawing must state knob ${knob[2]} and macro ${knob[1]}`,
  );
  assert.ok(figure.includes(`FADER ${fader[1]}`), `drawing must state fader ${fader[1]}`);
  assert.ok(figure.includes(bounce[1]), `drawing must state the ${bounce[1]} rebound`);
  // Stated once, in the footer. It used to be asserted twice, which forced the
  // same number into a caption that no longer depicts discrete samples: the
  // travelled path is drawn as one continuous line now.
  assert.ok(
    figure.includes(`${trail[1]}-POINT TRAIL`),
    `drawing must state the ${trail[1]}-sample trail`,
  );
});

test('control illustrations are HTML, with only real geometry left in SVG', () => {
  // Every label used to live inside a 760-unit SVG scaled into a ~660px box, so
  // a 9px label arrived near 7px on a desktop and near 4px on a phone. Labels
  // are HTML now and keep their own size; plots, curves and the licensed hand
  // glyphs stay SVG because they are actual geometry.
  assert.doesNotMatch(
    landing,
    /<svg[^>]*class="control-illustration"/,
    'no illustration may go back to being one big SVG',
  );
  for (const family of ['performance', 'continuous', 'snapshots', 'sensors', 'vision', 'mapping']) {
    const at = landing.indexOf(`data-control-illustration="${family}"`);
    assert.ok(at > 0, `${family} illustration must exist`);
    const open = landing.slice(landing.lastIndexOf('<', at), at);
    assert.ok(
      open.startsWith('<div'),
      `${family} must be an HTML element, not "${open.slice(0, 12)}"`,
    );
  }

  // `.feature-figure svg{width:100%;height:auto}` is (0,1,1) and sits late in
  // the sheet, so a one-class rule on a plot never wins and the plot silently
  // inflates to full width. Twice already: the sensor dials rendered as
  // full-card circles and the physics plot overflowed its own box. Any fixed
  // size has to be bound through a parent.
  for (const [sel, why] of [
    ['.gm-panel .ph-track', 'physics track'],
    ['.sn-dial-body .sn-knob', 'sensor dials'],
    ['.sn-signal .sn-trace', 'signal trace'],
    ['.sn-panel .sn-phone', 'motion phone'],
    ['.vs-wrap .vs-glyph', 'clutch glyphs'],
  ]) {
    assert.ok(landing.includes(sel), `${why} must be bound as "${sel}"`);
  }
});

test('illustration text stays on the mono grid at illustration sizes', () => {
  // Two separate regressions here. First, the blanket rule that put prose on
  // the proportional face also caught every caption inside a drawing, so ten of
  // them arrived in a different typeface from the labels beside them. Second,
  // .sn-note had no rule of its own and fell through to p{font-size:15px},
  // rendering body-sized inside a figure whose labels are 9px.
  assert.match(
    landing,
    /\[data-control-illustration\],\[data-control-illustration\] \*\{font-family:var\(--mono\)\}/,
    'illustrations must pin the mono face for everything inside them',
  );

  // Every class used on a <p> inside a figure needs its own size rule, or it
  // inherits the body prose size.
  const missing = [];
  for (const m of landing.matchAll(/<p class="([a-z-]+)"/g)) {
    const cls = m[1];
    if (!/^(pf|gm|snp|sn|mp|vs|rd|ph)-/.test(cls)) continue;
    if (!landing.includes(`.${cls}{`)) missing.push(cls);
  }
  assert.deepEqual(missing, [], `illustration <p> classes with no rule: ${missing.join(', ')}`);
});

test('every number the sheet states is one the program actually defines', () => {
  // Four claims were invented or stale and read as fact: a "wall ×0.75" naming
  // an object the product has no word for, a BPM window given as "8.0 s" over
  // "2–20 sec" when the setting is a count of onset intervals defaulting to 5
  // over 2–12, a pitch source range of "82–2093 Hz" that appears nowhere in the
  // source, and curve names ("GEOMETRIC", "SHAPED") that match none of the four
  // the mapping contract declares. Read the values, do not restate them.
  const read = (...parts) =>
    fs.readFileSync(path.join(import.meta.dirname, '..', ...parts), 'utf8');
  const controls = read('static', 'phone-v3', 'controls.js');
  const maps = read('src', 'live', 'mappings.ts');
  const phone = read('static', 'phone-v3', 'index.html');

  const one = (src, re, what) => {
    const m = src.match(re);
    assert.ok(m, `could not read ${what} from source`);
    return m[1];
  };

  // The sheet now prints the detector knobs, so the defaults it states have to
  // come from the detector source, not from the dormant pitch lane.
  const descriptors = read('static', 'phone-v3', 'audio-descriptors.js');
  const sens = one(descriptors, /sensitivity: ([\d.]+),/, 'sensitivity default');
  const release = one(descriptors, /const RELEASE_MS = (\d+);/, 'release default');
  const windowDefault = one(descriptors, /window: (\d+),/, 'window default');
  // The sheet's millisecond range describes FREE, not the wider DSP safety
  // bound needed for a whole note at slow Live tempos.
  const workspace = read('static', 'phone-v3', 'audio-workspace.js');
  const releaseLo = one(workspace, /key: 'releaseMs', label: 'RELEASE', min: (\d+)/, 'FREE release min');
  const releaseHi = one(workspace, /key: 'releaseMs', label: 'RELEASE', min: \d+, max: (\d+)/, 'FREE release max');
  assert.ok(landing.includes(`<b>${sens}</b>`), `SENS must show ${sens}`);
  assert.ok(landing.includes(`<b>${release} ms</b>`), `RELEASE must show ${release} ms`);
  assert.ok(landing.includes(`<b class="is-selected">x${windowDefault}</b>`), `WINDOW must select x${windowDefault}`);
  assert.ok(landing.includes(`${releaseLo}&#8211;${releaseHi}`),
    `release range must read ${releaseLo}-${releaseHi}`);

  // These moved to named constants when pad mode D gained a synced length:
  // the numbers the sheet prints are the free-running envelope.
  const attack = one(controls, /BURST_FREE_ATTACK_MS = (\d+)/, 'burst attack');
  const dur = one(controls, /BURST_FREE_DURATION_MS = (\d+)/, 'burst duration');
  assert.ok(landing.includes(`${attack} ms attack`), `burst attack must read ${attack} ms`);
  assert.ok(
    landing.includes(`${Number(dur) - Number(attack)} ms release`),
    `burst release must read ${Number(dur) - Number(attack)} ms`,
  );

  const bounce = one(controls, /const bounce = ([\d.]+);/, 'bounce');
  assert.ok(landing.includes(`&#215;${bounce}`), `rebound must read x${bounce}`);
  // The bounce happens at the edge of the pad. There is no "wall" in the product.
  assert.doesNotMatch(landing, /\bwall\b/i, 'the sheet must not invent a "wall"');

  for (const curve of maps.match(/curve\?: ([^;]+);/)[1].split('|')) {
    const name = curve.trim().replace(/'/g, '').toUpperCase();
    assert.ok(landing.includes(name), `curve list must name ${name}`);
  }
  assert.doesNotMatch(landing, /GEOMETRIC|&#183; SHAPED/, 'no invented curve names');

  // No fabricated source range: the mapping contract lets the user set it.
  assert.doesNotMatch(landing, /82&#8211;2093|82-2093/, 'pitch range is not declared anywhere');
  assert.ok(maps.includes('inMin') && maps.includes('inMax'));
  assert.ok(landing.includes('inMin &#8211; inMax'));

  const morph = phone.match(/morph-time"\s*min="([\d.]+)"\s*max="([\d.]+)"/);
  assert.ok(morph, 'morph-time bounds must be readable');
  assert.ok(
    landing.includes(`${morph[1]}&#8211;${morph[2]} s`),
    `recall range must read ${morph[1]}-${morph[2]} s`,
  );
});

test('the guide states the subdivisions the code actually offers', () => {
  // Both synced lengths shipped as code before they existed in prose. A table
  // in a guide is a claim like any other, so it reads from the source rather
  // than repeating it: change a subdivision and this fails.
  const read = (...p) => fs.readFileSync(path.join(import.meta.dirname, '..', ...p), 'utf8');
  const guide = read('docs', 'USER-GUIDE.md');
  const snaps = read('static', 'phone-v3', 'modules', 'snapshots.js');
  const phone = read('static', 'phone-v3', 'index.html');
  const controls = read('static', 'phone-v3', 'controls.js');

  // Snapshot transition: every label the code offers must be in the guide.
  const labels = [...snaps.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(labels.length >= 9, `expected the morph subdivisions, saw ${labels.length}`);
  // Against the table row, not the whole document: several of these labels
  // also occur in prose, so "somewhere in the guide" would pass a table that
  // had quietly lost half its columns.
  const row = (guide.match(new RegExp('^ *\\| 16 beats \\|.*$', 'm')) || [])[0];
  assert.ok(row, 'the guide must carry the transition table');
  const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
  assert.deepEqual(cells, labels, 'the table must list exactly what the code offers');
  assert.match(guide, /\*\*Free \/ Sync\*\*|\*\*Free\*\*[\s\S]{0,400}\*\*Sync\*\*/);

  // Burst: the grid in the markup and the guide have to agree it exists and
  // that FREE ignores it.
  const grid = phone.slice(phone.indexOf('id="burst-rate-grid"'));
  const vals = [...grid.slice(0, 700).matchAll(/data-val="([\d.]+)"/g)].map((m) => m[1]);
  assert.deepEqual(vals, ['4', '2', '1', '0.5', '0.25', '0.125', '0.0625']);
  assert.match(guide, /Burst Config \(Pad Mode D\)/);
  assert.match(guide, /Length \(Subdivision\)/);
  // The attack is set by dragging the drawn envelope; the guide must say so,
  // and must not describe the percentage slider it replaced.
  assert.match(guide, /Drag the peak along the drawn envelope/);
  assert.doesNotMatch(guide, /Attack \(% of length\)/,
    'the guide still describes the control that was replaced');
  assert.match(phone, /id="burst-env"/, 'and the envelope must actually be there');

  // The free envelope the guide quotes is the one the code names.
  const dur = controls.match(/BURST_FREE_DURATION_MS = (\d+)/);
  const atk = controls.match(/BURST_FREE_ATTACK_MS = (\d+)/);
  assert.ok(dur && atk);
  assert.ok(
    guide.includes(`${atk[1]} ms`) && guide.includes(`${dur[1]} ms`),
    'the guide must quote the free envelope the code declares',
  );

  // SYNC is the switch for all three families, and the section says so.
  assert.match(guide, /LFO and Stutter rates[\s\S]{0,260}burst[\s\S]{0,200}snapshot transition/i);
});

// ---------------------------------------------------------------------------
// Translation contract
//
// The sheet has no server, so its Portuguese comes from two files loaded by the
// page itself. Both can drift out of the markup without anything failing to
// render — the page just quietly falls back to English — so the binding is
// asserted here rather than left to a visual pass.

const siteCatalogSource = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'docs', 'site-i18n.js'), 'utf8');

function loadSiteCatalog() {
  const scope = {};
  new Function('globalThis', siteCatalogSource)(scope);
  return scope.RcSurfaceSiteCatalog;
}

function landingHandles() {
  const found = new Set();
  for (const m of landing.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) found.add(m[1]);
  return found;
}

test('the sheet ships the runtime it asks for', () => {
  // GitHub Pages serves docs/ as the site root, so ../static is unreachable
  // from the published page: the runtime has to exist beside index.html.
  const copy = path.join(import.meta.dirname, '..', 'docs', 'i18n.js');
  const origin = path.join(import.meta.dirname, '..', 'static', 'shared', 'i18n.js');
  assert.ok(fs.existsSync(copy), 'docs/i18n.js must exist');
  assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(origin, 'utf8'),
    'docs/i18n.js has drifted from static/shared/i18n.js — copy it again');
  assert.match(landing, /<script src="i18n\.js"><\/script>/);
  assert.match(landing, /<script src="site-i18n\.js"><\/script>/);
});

test('every handle in the sheet has a Portuguese string behind it', () => {
  const catalog = loadSiteCatalog();
  const missing = [...landingHandles()].filter((key) => !catalog[key]);
  assert.deepEqual(missing, [], 'handles with no catalog entry');
  const untranslated = Object.entries(catalog)
    .filter(([, entry]) => !entry['pt-BR'])
    .map(([key]) => key);
  assert.deepEqual(untranslated, [], 'catalog entries with no pt-BR');
});

test('the language selector is present and wired', () => {
  assert.match(landing, /class="lang-select"/);
  assert.match(landing, /data-set-locale="en"/);
  assert.match(landing, /data-set-locale="pt-BR"/);
  assert.match(landing, /bindSelector\(document\.querySelector\("\.lang-select"\)\)/);
});

test('the passages that carry inline markup are replaced whole', () => {
  // A sentence split by <b> or <code> lands in the DOM as several text nodes,
  // and Portuguese does not keep English word order across the cut. These have
  // to use data-i18n-html so the whole sentence is swapped at once.
  const catalog = loadSiteCatalog();
  const wrongKind = [];
  for (const m of landing.matchAll(/data-i18n="([^"]+)"/g)) {
    const entry = catalog[m[1]];
    if (entry && /<\w/.test(entry.en)) wrongKind.push(m[1]);
  }
  assert.deepEqual(wrongKind, [],
    'these carry markup and need data-i18n-html, not data-i18n');
});

test('the chain diagram keeps its column grid in both languages', () => {
  // Every annotation line inside the box drawing is padded to a fixed width so
  // the return-path bar that follows lands in one column. Nothing about a
  // shorter or longer translation fails loudly — the drawing just goes ragged —
  // so the width is asserted rather than eyeballed.
  const catalog = loadSiteCatalog();
  const LARGURA = 44;
  for (const key of ['lp.chain.003', 'lp.chain.004', 'lp.chain.005']) {
    for (const locale of ['en', 'pt-BR']) {
      assert.equal(catalog[key][locale].length, LARGURA,
        `${key} [${locale}] must be exactly ${LARGURA} characters`);
    }
    assert.equal(catalog[key].en.indexOf('\u25bc'), catalog[key]['pt-BR'].indexOf('\u25bc'),
      `${key}: the arrow must sit in the same column in both languages`);
  }
});

test('the four 1.0 features stay documented where the long answers live', () => {
  // The landing page used to carry a "New in 1.0" card repeating all four.
  // The owner cut it: a release-notes panel ages into the top of an operator
  // sheet that is otherwise version-neutral. The features still have to be
  // documented, so assert the homes that outlive a release.
  const landing = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'index.html'), 'utf8');
  assert.doesNotMatch(landing, /class="card highlights"/, 'the 1.0 highlights card was cut on purpose');
  assert.doesNotMatch(landing, /data-i18n(-html)?="lp\.highlights\./, 'no highlights handle may linger');
  // CFG still has to be reachable from the sheet, as a control rather than as news.
  assert.match(landing, /data-i18n(-html)?="lp\.controls\.148"/, 'CFG must stay in the header cards');
  // The USER-GUIDE must have a CFG chapter in both languages
  const en = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'USER-GUIDE.md'), 'utf8');
  const pt = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'USER-GUIDE.pt-BR.md'), 'utf8');
  assert.match(en, /^## 9\.5 Config Mode \(CFG\)\r?$/m, 'USER-GUIDE.md must include the CFG chapter');
  assert.match(pt, /^## 9\.5 Modo Config \(CFG\)\r?$/m, 'USER-GUIDE.pt-BR.md must include the CFG chapter');
  // 9.5 must sit between 9 and 10 to preserve the contiguity claim in both languages.
  const m9pt = pt.search(/^## 9\. /m);
  const m95pt = pt.search(/^## 9\.5 /m);
  const m10pt = pt.search(/^## 10\. /m);
  assert.ok(m9pt >= 0 && m95pt > m9pt && m10pt > m95pt,
    'CFG chapter 9.5 must be between chapter 9 and chapter 10 in USER-GUIDE.pt-BR.md');
  // The README must mention the four 1.0 features
  const readme = fs.readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8');
  assert.match(readme, /## 1\.0 Highlights/, 'README.md must include the 1.0 Highlights section');
  assert.match(readme, /Config Mode \(CFG\)/, 'README.md must mention Config Mode (CFG)');
  assert.match(readme, /LFO waveform preview/, 'README.md must mention the LFO waveform preview');
  assert.match(readme, /Desktop keyboard control/, 'README.md must mention desktop keyboard control');
  assert.match(readme, /K-weighted loudness/, 'README.md must mention K-weighted loudness');
});

test('quoted figures use the separator the app actually prints', () => {
  // The phone formats with toFixed and never localizes, so every number the
  // sheet quotes from a readout is a dot on screen. A translated decimal comma
  // reads as correct Portuguese and still misquotes the interface.
  const catalog = loadSiteCatalog();
  const withComma = Object.entries(catalog)
    .filter(([, entry]) => /\d,\d/.test(entry['pt-BR']))
    .map(([key]) => key);
  assert.deepEqual(withComma, [], 'decimal commas do not match the app readouts');
});

test('the sheet names the clock readout the way the app labels it', () => {
  // The app shows SINCRONIZADO in Portuguese; a sheet that says SYNCED sends
  // the reader looking for a word that is not on their screen.
  const catalog = loadSiteCatalog();
  const stale = Object.entries(catalog)
    .filter(([, entry]) => /\bSYNCED\b/.test(entry['pt-BR']))
    .map(([key]) => key);
  assert.deepEqual(stale, [], 'these still say SYNCED in Portuguese');
});

test('no English sentence is left outside the translation handles', () => {
  // Every earlier check compared the catalog against itself: it could tell
  // that each entry had a Portuguese string and that each handle had an entry,
  // and it was blind to a paragraph carrying no handle at all. That is the
  // shape of the whole class of miss — a sentence rendering in English on a
  // page set to Portuguese, and nothing failing.
  //
  // Short labels stay English on purpose: the drawings reproduce a screen, and
  // control keys, Live parameter names and readouts are quoted, not written.
  // A run of lowercase words is the thing that cannot be any of those.
  const body = landing.slice(landing.indexOf('<body'));
  const uncovered = [];
  let depth = 0;          // how deep inside an element carrying a handle
  let stack = [];
  let skip = null;        // inside <script>/<style>/<noscript>
  const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>|([^<]+)/g;
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'path',
    'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'stop', 'ellipse', 'col']);
  for (const m of body.matchAll(token)) {
    if (m[5] !== undefined) {
      if (!skip && depth === 0) {
        const text = m[5].replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
        if (/(?:^|\s)[a-z]{2,}(?:\s+[a-z]{2,}){2,}/.test(text)) uncovered.push(text.slice(0, 60));
      }
      continue;
    }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      if (skip === tag) skip = null;
      const was = stack.pop();
      if (was) depth -= 1;
      continue;
    }
    if (['script', 'style', 'noscript'].includes(tag)) { skip = skip || tag; continue; }
    if (VOID.has(tag) || m[4] === '/') continue;
    const handled = /\sdata-i18n(?:-html)?=/.test(m[3]);
    stack.push(handled);
    if (handled) depth += 1;
  }
  assert.deepEqual(uncovered, [], 'these render in English on the Portuguese page');
});

test('the sheet sends readers to the documents in their own language', () => {
  // The reference docs exist as sibling files, so the destination is part of
  // the translation. A Portuguese sheet linking the English file is the same
  // defect as an untranslated sentence, just harder to see.
  const catalog = loadSiteCatalog();
  const marcados = [...landing.matchAll(/data-i18n-href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(marcados.length, 6, 'every reference document link must carry one');
  for (const key of marcados) {
    const entry = catalog[key];
    assert.ok(entry, `${key} must exist in the catalog`);
    assert.match(entry.en, /^\.\/[A-Z-]+\.md$/, `${key} en`);
    assert.equal(entry['pt-BR'], entry.en.replace(/\.md$/, '.pt-BR.md'), `${key} pt-BR`);
    // And the file it promises has to be there.
    for (const locale of ['en', 'pt-BR']) {
      const rel = entry[locale].replace(/^\.\//, '');
      assert.ok(fs.existsSync(path.join(import.meta.dirname, '..', 'docs', rel)),
        `${key} [${locale}] points at a missing file: ${rel}`);
    }
  }
});

test('every reference document has a Portuguese sibling', () => {
  const dir = path.join(import.meta.dirname, '..', 'docs');
  const ingles = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.endsWith('.pt-BR.md'));
  const semPar = ingles.filter((f) => !fs.existsSync(path.join(dir, f.replace(/\.md$/, '.pt-BR.md'))));
  assert.deepEqual(semPar, [], 'these have no translation');
});
