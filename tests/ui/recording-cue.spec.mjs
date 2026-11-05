// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

const SCOPE = 'song-scope-42';

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

function trackRefs() {
  return [{ index: 0, id: 'track-0', name: 'Track 1' }, { index: 1, id: 'track-1', name: 'Track 2' }];
}

function newCueState() {
  return { commands: [], scope: SCOPE, volumes: { 0: 0.5, 1: 0.25 } };
}

function snapshot(state) {
  return {
    scope: state.scope,
    transport: { connected: true, isPlaying: field(false), recordMode: field(false), songTimeBeats: field(0), metronome: field(false) },
    tracks: trackRefs().map(track => ({ ...track, arm: false, canArm: true, solo: false, mute: false, volume: state.volumes[track.index], volumeDefault: 0.73 })),
    locators: [], meter: { numerator: 4, denominator: 4 }, pending: null, range: null, safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] },
  };
}

async function setupSocket(page, state, options = {}) {
  state.connections = 0;
  await page.routeWebSocket('**/ws*', socket => {
    state.connections += 1;
    state.socket = socket;
    socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') {
        socket.send(JSON.stringify({ type: 'hello', client_id: 'test-client', role: options.role || 'controller' }));
        return;
      }
      if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
      if (!message.cmd) return;
      state.commands.push(message);
      if (message.cmd === 'getMappings') { socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } })); return; }
      if (message.cmd === 'recordingTrackVolume') noteVolume(state, message);
      socket.send(JSON.stringify({ id: message.id, ok: true, result: snapshot(state) }));
    });
  });
}

async function openRec(page, locale = 'en') {
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=' + locale);
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(2);
}

function diagnosticReads(state) {
  return state.commands.filter(command => /cue|return/i.test(command.cmd));
}

/** The native volume level the host confirmed, never an invented one. */
function noteVolume(state, message) {
  const args = message.args || {};
  if (typeof args.track?.index === 'number' && typeof args.volume === 'number') state.volumes[args.track.index] = args.volume;
}

function writes(state) {
  return state.commands.filter(command => command.cmd.startsWith('recording'));
}

for (const locale of ['en', 'pt-BR']) {
  test(`the REC page has no CUE switch, no Return selector and no diagnostic read (${locale})`, async ({ page }) => {
    const state = newCueState();
    await setupSocket(page, state);
    await openRec(page, locale);
    const rec = page.locator('#page-recording');
    await expect(rec.locator('#rec-local-mix')).toHaveCount(0);
    await expect(rec.locator('#rec-local-cue')).toHaveCount(0);
    await expect(rec.locator('#rec-cue-return')).toHaveCount(0);
    await expect(rec.locator('#rec-cue-destination')).toHaveCount(0);
    await expect(page.locator('.rec-track-cue')).toHaveCount(0);
    expect(diagnosticReads(state)).toEqual([]);
    expect(writes(state)).toEqual([]);
    // The main MIX page and its tab are untouched by REC.
    await expect(page.locator('.page-mixer')).toBeHidden();
    await expect(page.locator('.tab[data-page="mixer"]')).toBeVisible();
  });
}

test('the native track volume still writes the observed mixer level', async ({ page }) => {
  const state = newCueState();
  await setupSocket(page, state);
  await openRec(page);
  const fader = page.locator('.rec-track-vol').first();
  await expect(fader).toHaveAttribute('aria-valuenow', '0.5');
  await expect(fader).toHaveAttribute('aria-valuetext', '50%');
  await fader.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => writes(state).filter(command => command.cmd === 'recordingTrackVolume').length).toBe(1);
  const issued = writes(state).at(-1).args;
  expect(issued.track).toEqual({ index: 0, id: 'track-0', name: 'Track 1' });
  expect(issued.volume).toBeCloseTo(0.52);
  await expect.poll(() => state.volumes[0]).toBeCloseTo(0.52);
  expect(diagnosticReads(state)).toEqual([]);
});

test('a viewer reads the REC state and never writes a volume', async ({ page }) => {
  const state = newCueState();
  await setupSocket(page, state, { role: 'viewer' });
  await openRec(page);
  const fader = page.locator('.rec-track-vol').first();
  await expect(fader).toHaveAttribute('aria-disabled', 'true');
  const before = state.commands.length;
  await fader.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  expect(state.commands.length).toBe(before);
  expect(writes(state)).toEqual([]);
});

test('a reconnect keeps the role guard and never replays a volume write', async ({ page }) => {
  const state = newCueState();
  await setupSocket(page, state);
  await openRec(page);
  await page.locator('.rec-track-vol').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => writes(state).filter(command => command.cmd === 'recordingTrackVolume').length).toBe(1);
  await state.socket.close();
  await expect.poll(() => state.connections, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  const before = state.commands.length;
  await page.waitForTimeout(300);
  expect(writes(state).filter(command => command.cmd === 'recordingTrackVolume').length).toBe(1);
  expect(diagnosticReads(state)).toEqual([]);
  expect(state.commands.length).toBeGreaterThanOrEqual(before);
});
