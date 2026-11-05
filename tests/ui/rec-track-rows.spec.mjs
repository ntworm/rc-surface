// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

const SCOPE = 'song-scope-42';
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 851, height: 393 }, { width: 320, height: 640 }];

function field(value) {
  return { value, fresh: true, observedAt: Date.now() };
}

/** A tree with a group, a nested group and plain tracks. */
function tracks() {
  return [
    { index: 0, id: 't-0', name: 'Drums', arm: false, canArm: true, solo: false, mute: false, volume: 0.5, volumeDefault: 0.73, groupId: null, isGroup: false },
    { index: 1, id: 'g-a', name: 'Group A', arm: false, canArm: false, solo: false, mute: false, volume: 0.4, volumeDefault: 0.73, groupId: null, isGroup: true },
    { index: 2, id: 't-2', name: 'Kick', arm: false, canArm: true, solo: false, mute: false, volume: 0.3, volumeDefault: 0.73, groupId: 'g-a', isGroup: false },
    { index: 3, id: 't-3', name: 'Snare', arm: false, canArm: true, solo: false, mute: false, volume: 0.2, volumeDefault: 0.73, groupId: 'g-a', isGroup: false },
    { index: 4, id: 'g-b', name: 'Sub Group', arm: false, canArm: false, solo: false, mute: false, volume: 0.2, volumeDefault: 0.73, groupId: 'g-a', isGroup: true },
    { index: 5, id: 't-5', name: 'Bass', arm: false, canArm: true, solo: false, mute: false, volume: 0.1, volumeDefault: 0.73, groupId: 'g-b', isGroup: false },
    { index: 6, id: 't-6', name: 'Guitar', arm: false, canArm: true, solo: false, mute: false, volume: 0.6, volumeDefault: 0.73, groupId: null, isGroup: false },
  ];
}

function newState() {
  return { commands: [], scope: SCOPE, treeValid: true, playing: false, role: 'controller' };
}

function snapshot(state) {
  return {
    scope: state.scope,
    trackTreeValid: state.treeValid,
    transport: {
      connected: true, isPlaying: field(state.playing), recordMode: field(false),
      songTimeBeats: field(0), metronome: field(false),
    },
    tracks: tracks(),
    locators: [], meter: { numerator: 4, denominator: 4 }, pending: null, range: null, safety: {},
    session: { songId: 'song-1', scenes: [], rows: [], owned: [] },
  };
}

async function setupSocket(page, state) {
  await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'resume') {
      socket.send(JSON.stringify({ type: 'hello', client_id: 'rows', role: state.role }));
      return;
    }
    if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
    if (!message.cmd) return;
    state.commands.push(message);
    if (message.cmd === 'getMappings') { socket.send(JSON.stringify({ id: message.id, ok: true, result: { mappings: {} } })); return; }
    socket.send(JSON.stringify({ id: message.id, ok: true, result: snapshot(state) }));
  }));
}

async function openRec(page, viewport = { width: 851, height: 393 }) {
  // The phone guard owns the portrait: the Arrangement is entered in the
  // supported landscape and only the geometry of the narrow surface is
  // measured afterwards.
  await page.setViewportSize({ width: 851, height: 393 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(7);
  // The lane of a row belongs to the editor of the Arrangement. The Record
  // mode stays the default and never reads a hidden row.
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  // The surface is measured after the Arrangement is open: the rotation
  // never asks the orientation guard for a decision.
  await page.setViewportSize(viewport);
}

function writes(state) {
  return state.commands.filter(command => command.cmd.startsWith('recording'));
}

test('every track row is a full-width row with a reserved clip lane', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  for (const viewport of VIEWPORTS) {
    await openRec(page, viewport);
    // The rows settle after the resize: the lane and the ruler share the
    // measured axis again before the geometry is read.
    await expect.poll(() => page.evaluate(() => {
      const controlProblems = (row, rowBox) => {
        const found = [];
        for (const control of row.querySelectorAll('button, .rec-track-vol, .rec-track-name')) {
          const box = control.getBoundingClientRect();
          if (!box.width && !box.height) continue;
          const outside = box.left < rowBox.left - 1 || box.right > rowBox.right + 1;
          if (outside) found.push('overflow:' + (control.id || control.className));
        }
        return found;
      };
      const laneProblems = (row, rowBox) => {
        const found = [];
        const lane = row.querySelector('.rec-track-lane');
        if (!lane) { found.push('no-lane:' + row.dataset.id); return found; }
        if (lane.getBoundingClientRect().right > rowBox.right + 1) found.push('lane:' + row.dataset.id);
        const clips = row.querySelector('.rec-track-clips');
        if (!clips || clips.tagName !== 'DIV') found.push('no-clips:' + row.dataset.id);
        return found;
      };
      const rowProblems = (row, gridBox) => {
        const found = [];
        const rowBox = row.getBoundingClientRect();
        if (Math.abs(rowBox.width - gridBox.width) > 2) found.push('row-width:' + row.dataset.id);
        found.push(...controlProblems(row, rowBox));
        found.push(...laneProblems(row, rowBox));
        return found;
      };
      const problems = [];
      const grid = document.querySelector('#rec-track-grid');
      const gridBox = grid.getBoundingClientRect();
      for (const row of grid.querySelectorAll('.rec-track-row')) problems.push(...rowProblems(row, gridBox));
      const surface = document.querySelector('#page-recording');
      if (surface.scrollWidth > surface.clientWidth + 2) problems.push('page-overflow');
      return problems;
    })).toEqual([]);
    // The transport stays reachable: the page shows it and never scrolls it away.
    const stop = await page.locator('#rec-stop').boundingBox();
    expect(stop, 'the REC page shows its transport').not.toBeNull();
    await expect(page.locator('#rec-stop')).toBeInViewport();
  }
});

test('a group owns a disclosure button and hides its children locally', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  await openRec(page);
  const group = page.locator('.rec-track-row[data-id="g-a"]');
  const toggle = group.locator('.rec-track-group-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The disclosure and the controls keep a real touch target.
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox.width, 'the disclosure keeps a 44px hit target').toBeGreaterThanOrEqual(44);
  expect(toggleBox.height, 'the disclosure keeps a 44px hit target').toBeGreaterThanOrEqual(44);
  const armBox = await group.locator('[data-property="arm"]').boundingBox();
  expect(armBox.width, 'the controls keep a 44px hit target').toBeGreaterThanOrEqual(44);
  expect(armBox.height, 'the controls keep a 44px hit target').toBeGreaterThanOrEqual(44);
  await expect(page.locator('.rec-track-row[data-id="t-2"]')).toBeVisible();
  await expect(page.locator('.rec-track-row[data-id="t-5"]')).toBeVisible();
  const before = state.commands.length;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.rec-track-row[data-id="t-2"]')).toBeHidden();
  await expect(page.locator('.rec-track-row[data-id="t-3"]')).toBeHidden();
  await expect(page.locator('.rec-track-row[data-id="t-5"]')).toBeHidden();
  await expect(page.locator('.rec-track-row[data-id="t-6"]')).toBeVisible();
  expect(state.commands.length).toBe(before);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rec-track-row[data-id="t-2"]')).toBeVisible();
  expect(state.commands.length).toBe(before);
});

test('ARM ALL is one collective write over every armable track', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  await openRec(page);
  const armAll = page.locator('#rec-arm-all');
  await expect(armAll).toBeEnabled();
  await expect(armAll).toHaveAttribute('aria-pressed', 'false');
  await armAll.click();
  await expect.poll(() => state.commands.filter(command => command.cmd === 'recordingArmTracks').length).toBe(1);
  const args = state.commands.filter(command => command.cmd === 'recordingArmTracks')[0].args;
  expect(args.scope).toBe(SCOPE);
  expect(args.group).toBeNull();
  expect(args.enabled).toBe(true);
  expect(args.armMode).toBe('multi');
  expect(args.tracks).toEqual([
    { index: 0, id: 't-0', name: 'Drums' },
    { index: 2, id: 't-2', name: 'Kick' },
    { index: 3, id: 't-3', name: 'Snare' },
    { index: 5, id: 't-5', name: 'Bass' },
    { index: 6, id: 't-6', name: 'Guitar' },
  ]);
  // One collective write: never one command per track.
  expect(writes(state).filter(command => command.cmd === 'recordingTrackControl')).toHaveLength(0);
});

test('a group arms its own descendants in one collective write', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  await openRec(page);
  const groupArm = page.locator('.rec-track-row[data-id="g-a"] [data-property="arm"]');
  await expect(groupArm).toBeEnabled();
  await groupArm.click();
  await expect.poll(() => state.commands.filter(command => command.cmd === 'recordingArmTracks').length).toBe(1);
  const args = state.commands.filter(command => command.cmd === 'recordingArmTracks')[0].args;
  expect(args.group).toEqual({ index: 1, id: 'g-a', name: 'Group A' });
  expect(args.enabled).toBe(true);
  expect(args.tracks).toEqual([
    { index: 2, id: 't-2', name: 'Kick' },
    { index: 3, id: 't-3', name: 'Snare' },
    { index: 5, id: 't-5', name: 'Bass' },
  ]);
  expect(writes(state).filter(command => command.cmd === 'recordingTrackControl')).toHaveLength(0);
});

test('the collective ARM is disabled while the tree, the transport or the role is not ready', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  await openRec(page);
  const armAll = page.locator('#rec-arm-all');
  await expect(armAll).toBeEnabled();
  state.treeValid = false;
  await expect(armAll).toBeDisabled();
  state.treeValid = true;
  await expect(armAll).toBeEnabled();
  state.playing = true;
  await expect(armAll).toBeDisabled();
  state.playing = false;
  await expect(armAll).toBeEnabled();
  state.role = 'viewer';
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ableton-rc:phone-client-id', { detail: { role: 'viewer' } })));
  await expect(armAll).toBeDisabled();
});

test('a group keeps its own native solo and mute and never fans out', async ({ page }) => {
  const state = newState();
  await setupSocket(page, state);
  await openRec(page);
  const group = page.locator('.rec-track-row[data-id="g-a"]');
  await group.locator('[data-property="solo"]').click();
  await expect.poll(() => state.commands.filter(command => command.cmd === 'recordingTrackControl').length).toBe(1);
  const args = state.commands.filter(command => command.cmd === 'recordingTrackControl')[0].args;
  expect(args.track).toEqual({ index: 1, id: 'g-a', name: 'Group A' });
  expect(args.property).toBe('solo');
  expect(state.commands.filter(command => command.cmd === 'recordingArmTracks')).toHaveLength(0);
});
