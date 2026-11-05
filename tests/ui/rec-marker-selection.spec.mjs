// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The range of a capture is a local decision of the reader: the markers of
// the Arrangement are chosen on the phone and the host is never asked to
// seek. The page is the real one and the host is a WebSocket mock, so the
// test proves the client boundaries only.

import { test, expect } from '@playwright/test';

const field = value => ({ value, fresh: true, observedAt: Date.now() });

const LOCATORS = [
  { name: 'Intro', time: 0 },
  { name: 'Verse', time: 16 },
  { name: 'Chorus', time: 32 },
];

// The writes a local selection must never send.
const WRITE_COMMANDS = ['recordingSeekMarker', 'recordingRecord', 'recordingSetPoint', 'recordingPrepare', 'recordingStart', 'recordingArm'];

const TEXT = {
  en: {
    next: 'Next marker',
    untilStop: 'Until STOP',
    editStart: 'Tap the marker that becomes the new start',
    noNext: 'No marker follows the start. Choose another end or Until STOP.',
    endMissing: 'That end marker is gone. Choose another end or Until STOP.',
    startAmbiguous: 'Two markers share that start. Choose another one.',
  },
  'pt-BR': {
    next: 'Próximo marcador',
    untilStop: 'Até STOP',
    editStart: 'Toque no marcador que vira o novo início',
    noNext: 'Nenhum marcador vem depois do início. Escolha outro fim ou Até STOP.',
    endMissing: 'Esse marcador final sumiu. Escolha outro fim ou Até STOP.',
    startAmbiguous: 'Dois marcadores compartilham esse início. Escolha outro.',
  },
};

function snapshot(locators, overrides = {}) {
  return {
    scope: 'song-scope',
    trackTreeValid: true,
    transport: {
      connected: true,
      isPlaying: field(false),
      recordMode: field(false),
      songTimeBeats: field(0),
      metronome: field(false),
    },
    tracks: [{ index: 0, id: 'track-0', name: 'Guitar', arm: true, canArm: true, solo: false, mute: false }],
    locators,
    meter: { numerator: 4, denominator: 4 },
    pending: null,
    range: null,
    safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [], active: false },
    ...overrides,
  };
}

/** The mock host answers the reads of the page and records every command.
 * The overrides are the state of the host itself: they change while the
 * page is open, exactly like the catalog does. */
async function openRecPage(page, locale, state, overrides = {}) {
  const commands = [];
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'range-test', role: 'controller' }));
      return;
    }
    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }
    if (!message.cmd) return;
    commands.push(message);
    if (message.cmd === 'getMappings') {
      socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } }));
      return;
    }
    const result = ['getRecordingState', 'getSessionRecordingState'].includes(message.cmd)
      ? snapshot(state.locators, overrides)
      : {};
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=' + locale);
  await page.locator('.tab[data-page="recording"]').click();
  // The page opens in the compact Record mode: the editor is chosen
  // explicitly before the range of the Arrangement is tested.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', 'arrangement');
  await expect(page.locator('.rec-marker')).toHaveCount(state.locators.length);
  return commands;
}

/** A tap of a marker of the timeline: the event goes to the marker itself,
 * never to whatever the ruler paints above it. */
async function tapMarker(page, index) {
  await page.locator('.rec-marker').nth(index).dispatchEvent('click');
}

/** A real tap takes the focus away from the open selector. */
async function blur(page) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

for (const locale of ['en', 'pt-BR']) {
  test(`REC selects the range locally and never seeks the host (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    // The end of the range knows Until STOP and the next marker.
    await expect(page.locator('#rec-end-marker option[value="next"]')).toHaveText(text.next);
    await expect(page.locator('#rec-end-marker option[value=""]')).toHaveText(text.untilStop);

    // The default start is the cursor at the stop position.
    await expect(page.locator('#rec-start-marker')).toHaveValue('cursor');

    // A later marker becomes the explicit end of the local range.
    await tapMarker(page, 2);
    await expect(page.locator('#rec-end-marker')).toHaveValue('2');
    await expect(page.locator('.rec-marker').nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.rec-marker').nth(2)).toHaveAttribute('data-end', 'true');

    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd)), 'a local selection never writes to the host').toEqual([]);
  });

  test(`REC arms the current start and moves it with the next tap (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    await page.locator('#rec-start-marker').selectOption('1');
    await expect(page.locator('#rec-start-marker')).toHaveValue('1');
    await blur(page);

    // The tap of the current start arms the start and says what to do.
    await tapMarker(page, 1);
    await expect(page.locator('#rec-range-note')).toHaveText(text.editStart);

    // The next tap moves the start to the chosen marker.
    await tapMarker(page, 2);
    await expect(page.locator('#rec-start-marker')).toHaveValue('2');
    await expect(page.locator('#rec-range-note')).not.toHaveText(text.editStart);
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC moves the start with an earlier marker and the end with a later one (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);

    await page.locator('#rec-start-marker').selectOption('2');
    await blur(page);
    await tapMarker(page, 0);
    await expect(page.locator('#rec-start-marker')).toHaveValue('0');
    await tapMarker(page, 1);
    await expect(page.locator('#rec-end-marker')).toHaveValue('1');
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC follows the start with the next marker and blocks the last one (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    await page.locator('#rec-start-marker').selectOption('0');
    await page.locator('#rec-end-marker').selectOption('next');
    await expect(page.locator('#rec-end-marker')).toHaveValue('next');
    await expect(page.locator('.rec-marker').nth(1)).toHaveAttribute('data-end', 'true');
    await expect(page.locator('#rec-start')).toBeEnabled();

    // The last marker has no next: the capture stays blocked.
    await page.locator('#rec-start-marker').selectOption('2');
    await expect(page.locator('#rec-range-note')).toHaveText(text.noNext);
    await expect(page.locator('#rec-start')).toBeDisabled();
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC never picks an unusable marker as the next one (${locale})`, async ({ page }) => {
    // A marker beyond the range of the host is not a marker of the catalog.
    const state = { locators: [
      { name: 'Intro', time: 0 },
      { name: 'Far', time: 10000001 },
      { name: 'Nan', time: null },
      { name: 'Inf', time: null },
    ] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    await page.locator('#rec-start-marker').selectOption('0');
    await page.locator('#rec-end-marker').selectOption('next');
    await expect(page.locator('#rec-range-note')).toHaveText(text.noNext);
    await expect(page.locator('#rec-start')).toBeDisabled();
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC blocks a removed end until another end is chosen (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    await page.locator('#rec-start-marker').selectOption('0');
    await page.locator('#rec-end-marker').selectOption('2');
    await expect(page.locator('#rec-start')).toBeEnabled();

    // The end marker disappears from the Set.
    state.locators = LOCATORS.filter(cue => cue.name !== 'Chorus');
    await expect.poll(() => page.locator('#rec-range-note').textContent(), { timeout: 8000 }).toBe(text.endMissing);
    await expect(page.locator('#rec-start')).toBeDisabled();

    // Until STOP frees the capture again.
    await page.locator('#rec-end-marker').selectOption('');
    await expect(page.locator('#rec-range-note')).toHaveText('');
    await expect(page.locator('#rec-start')).toBeEnabled();
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC blocks an ambiguous marker (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    await openRecPage(page, locale, state);
    const text = TEXT[locale];

    // Two markers with the same name and position cannot own a range.
    state.locators = [...LOCATORS, { name: 'Chorus', time: 32 }];
    await expect.poll(() => page.locator('.rec-marker').count(), { timeout: 8000 }).toBe(4);
    await page.locator('#rec-start-marker').selectOption('3');
    await expect(page.locator('#rec-range-note')).toHaveText(text.startAmbiguous);
    await expect(page.locator('#rec-start')).toBeDisabled();
  });

  test(`REC keeps the identity of a selection when the catalog is reordered (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);

    await page.locator('#rec-start-marker').selectOption('1');
    await expect(page.locator('#rec-start-marker')).toHaveValue('1');

    // A reordered catalog keeps the chosen marker, not its old position.
    state.locators = [LOCATORS[2], LOCATORS[0], LOCATORS[1]];
    await blur(page);
    await expect.poll(() => page.locator('#rec-start-marker').inputValue(), { timeout: 8000 }).toBe('2');
    await expect(page.locator('.rec-marker').nth(2)).toHaveAttribute('aria-pressed', 'true');
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC never selects a marker with a moved gesture (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const marker = page.locator('.rec-marker').nth(2);

    // A pan that ends on a marker never selects it.
    await marker.dispatchEvent('pointerdown', { clientX: 100, clientY: 100 });
    await marker.dispatchEvent('click', { clientX: 180, clientY: 140 });
    await expect(page.locator('#rec-end-marker')).toHaveValue('');

    // A tap without movement selects it.
    await marker.dispatchEvent('pointerdown', { clientX: 100, clientY: 100 });
    await marker.dispatchEvent('click', { clientX: 104, clientY: 102 });
    await expect(page.locator('#rec-end-marker')).toHaveValue('2');
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC keeps the identity of the option an open selector displays (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);

    // The reader opens the start selector: it shows the markers of the Set.
    await page.locator('#rec-start-marker').focus();
    await expect(page.locator('#rec-start-marker option[value="0"]')).toContainText('Intro');

    // The Set gains a marker ahead of the catalog while the selector is open.
    const reads = commands.length;
    state.locators = [{ name: 'New', time: 4 }, ...LOCATORS];
    await expect.poll(() => commands.length, { timeout: 8000 }).toBeGreaterThan(reads);
    await expect(page.locator('#rec-start-marker option[value="0"]')).toContainText('Intro');

    // The option the reader sees is the marker he chooses: the capture
    // starts at the marker of that option, not at the one now at its index.
    await page.locator('#rec-start-marker').selectOption('0');
    await blur(page);
    await expect(page.locator('#rec-start-marker')).toHaveValue('1');
    await expect(page.locator('.rec-marker').nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC shows the range the host froze while it captures (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const overrides = {};
    const commands = await openRecPage(page, locale, state, overrides);

    // The reader asks for the next marker after the start.
    await page.locator('#rec-start-marker').selectOption('0');
    await page.locator('#rec-end-marker').selectOption('next');
    await expect(page.locator('#rec-end-marker')).toHaveValue('next');

    // The host takes the capture and freezes the range it owns.
    overrides.pending = 'record';
    overrides.range = { start: { name: 'Intro', time: 0 }, end: { name: 'Chorus', time: 32 }, loop: true };
    overrides.capture = { phase: 'recording', pass: 1, total: 2 };
    await expect.poll(() => page.locator('.rec-marker').nth(2).getAttribute('data-end'), { timeout: 8000 }).toBe('true');

    // A new marker arrives in the Set: the capture of the host does not move.
    state.locators = [{ name: 'Intro', time: 0 }, { name: 'New', time: 16 }, { name: 'Chorus', time: 32 }];
    await expect.poll(() => page.locator('.rec-marker').nth(1).textContent(), { timeout: 8000 }).toContain('New');
    await expect(page.locator('.rec-marker').nth(2)).toHaveAttribute('data-end', 'true');
    await expect(page.locator('.rec-marker').nth(1)).toHaveAttribute('data-end', 'false');
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });

  test(`REC moves the selection with the keyboard after a pointer gesture (${locale})`, async ({ page }) => {
    const state = { locators: [...LOCATORS] };
    const commands = await openRecPage(page, locale, state);
    const text = TEXT[locale];

    // The reader arms the start with the pointer.
    await page.locator('#rec-start-marker').selectOption('1');
    await blur(page);
    const marker = page.locator('.rec-marker').nth(1);
    await marker.dispatchEvent('pointerdown', { clientX: 100, clientY: 100 });
    await marker.dispatchEvent('click', { clientX: 100, clientY: 100 });
    await expect(page.locator('#rec-range-note')).toHaveText(text.editStart);

    // A pointer that stays down on that marker never blocks the keyboard.
    await marker.dispatchEvent('pointerdown', { clientX: 100, clientY: 100 });
    await page.locator('.rec-marker').nth(2).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#rec-start-marker')).toHaveValue('2');
    await expect(page.locator('#rec-range-note')).not.toHaveText(text.editStart);
    expect(commands.filter(command => WRITE_COMMANDS.includes(command.cmd))).toEqual([]);
  });
}
