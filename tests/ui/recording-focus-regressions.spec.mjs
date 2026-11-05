// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { test, expect } from '@playwright/test';

const TRACKS = 45;

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

/** A long session: more tracks than the rows of the surface can hold at
 * once. */
function tracks() {
  const list = [];
  for (let index = 0; index < TRACKS; index += 1) {
    list.push({
      index, id: 't-' + index, name: 'Track ' + index, arm: false, canArm: true,
      solo: false, mute: false, volume: 0.5, volumeDefault: 0.73, groupId: null, isGroup: false,
    });
  }
  return list;
}

function snapshot() {
  return {
    scope: 'song-scope-45', trackTreeValid: true,
    transport: {
      connected: true, isPlaying: field(false), recordMode: field(false),
      songTimeBeats: field(0), metronome: field(false),
    },
    tracks: tracks(),
    locators: [{ name: 'Intro', time: 0 }],
    meter: { numerator: 4, denominator: 4 }, pending: null, range: null, safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] },
  };
}

/** The catalog of the clips of one track: every track owns one clip. */
function catalog(args) {
  return {
    scope: 'song-scope-45',
    track: args.track,
    clips: [{ index: 0, id: 'clip-' + args.track.index, name: 'Clip ' + args.track.index, startTime: 0, endTime: 32 }],
    page: { offset: 0, next: null },
  };
}

/** The take lanes of one track: one lane with one take. */
function takes(args) {
  return {
    scope: args.scope,
    track: { ...args.track },
    lanes: [{
      index: 0, id: 'lane-0', name: 'Lane 1',
      clips: [{ index: 0, id: 'take-0', name: 'Take 1', startTime: 0, endTime: 32, mark: null, reference: 'ref-0' }],
    }],
    page: { laneOffset: 0, clipOffset: 0, next: null },
  };
}

async function setupSocket(page, log) {
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'regression', role: 'controller' }));
      return;
    }
    if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
    if (!message.cmd) return;
    log.commands.push(message);
    const args = message.args || {};
    let result = {};
    if (message.cmd === 'getMappings') result = { mappings: {} };
    else if (message.cmd === 'getRecordingState') result = snapshot();
    else if (message.cmd === 'getRecordingArrangement') result = catalog(args);
    else if (message.cmd === 'getRecordingTakes') result = takes(args);
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
}

const polls = log => log.commands.filter(command => command.cmd === 'getRecordingState').length;
const catalogs = log => log.commands.filter(command => command.cmd === 'getRecordingArrangement').length;

/** The focus of a clip stays open while the rows are hidden. The hidden rows
 * are never read and never painted, so the cached source of the focus
 * survives its own panel and the reader comes back to the rows. */
test('a long session keeps its focus open while the track rows are hidden', async ({ page }) => {
  const log = { commands: [] };
  await setupSocket(page, log);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(TRACKS);
  // The focus belongs to the editor of the Arrangement: the Record mode
  // stays the default and never reads a hidden row.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  const clip = page.locator('#rec-track-grid .rec-arrangement-clip').first();
  await expect(clip).toBeVisible();
  await clip.click();
  await expect(page.locator('#rec-focus')).toBeVisible();
  const source = await page.locator('#rec-focus-interval').textContent();
  const reads = catalogs(log);
  const before = polls(log);
  // Two real polls of the state, never an arbitrary sleep.
  await expect.poll(() => polls(log)).toBeGreaterThan(before + 1);
  await expect(page.locator('#rec-focus')).toBeVisible();
  expect(await page.locator('#rec-focus-interval').textContent()).toBe(source);
  expect(catalogs(log), 'the hidden rows read no catalog').toBe(reads);
  // The reader comes back to the rows.
  await page.locator('#rec-focus-all-tracks').click();
  await expect(page.locator('#rec-focus')).toBeHidden();
  await expect(page.locator('#rec-track-grid .rec-track-row').first()).toBeVisible();
});
