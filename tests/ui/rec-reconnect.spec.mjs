// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// A focused browser regression for the REC page across a dropped socket.
// The page loads the actual session and recording modules of this
// repository and the host is a WebSocket mock: neither Ableton nor a Live
// server are involved, so the test proves the client boundaries only.
//
// The harness loads no translation module: the labels are the raw keys.

import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const repoRoot = new URL('../../', import.meta.url);
const readModule = name => fs.readFileSync(new URL(`static/phone-v3/modules/${name}`, repoRoot), 'utf8');
const sessionSource = readModule('session.js');
const rangeSource = readModule('recording-range-selection.js');
const recordingSource = readModule('recording.js');

// The REC page needs its own elements; the harness carries exactly the ones
// the recording module reads, and no catalog or waveform is ever touched.
const HARNESS = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>REC reconnect harness</title></head>
<body data-page="recording">
<div id="status"></div>
<div id="page-recording">
  <div id="rec-status"></div>
  <div id="rec-track-grid"></div>
  <button id="rec-start" type="button">start</button>
  <button id="rec-stop" type="button">stop</button>
  <button id="rec-click" type="button">click</button>
  <button id="rec-return-arrangement" type="button">return</button>
  <button id="rec-arm-mode" type="button">arm mode</button>
  <button id="rec-arm-all" type="button">arm all</button>
  <select id="rec-start-marker"></select>
  <select id="rec-end-marker"></select>
  <button id="rec-passages" type="button">passages</button>
  <span id="rec-passages-value"></span>
  <div id="rec-free-mode"></div>
  <div id="rec-end-field"></div>
  <div id="rec-range-note"></div>
  <div id="rec-timeline"><div id="rec-timeline-track"></div></div>
  <div id="rec-grid"></div>
  <div id="rec-markers"></div>
  <div id="rec-cursor"></div>
  <div id="rec-region"></div>
  <input id="rec-zoom" type="number" value="1">
  <div id="rec-position"></div>
  <button id="rec-add-marker" type="button">add marker</button>
  <div id="rec-marker-status"></div>
  <button id="rec-pre-roll-inline" type="button">pre-roll</button>
  <span id="rec-pre-roll-value"></span>
  <button id="rec-record-mode" type="button">record</button>
  <button id="rec-arrangement-mode" type="button">arrangement</button>
  <button id="rec-clip-mode" type="button">clip</button>
  <div id="rec-arrangement-panel"></div>
  <div id="rec-session-panel"></div>
  <div id="rec-session-target"></div>
  <button id="rec-session-prev" type="button">prev</button>
  <button id="rec-session-next" type="button">next</button>
  <button id="rec-session-cfg" type="button">session</button>
  <div id="rec-session-settings"></div>
  <input id="rec-session-bars" type="number" value="4">
  <select id="rec-session-quantization"><option value="global">global</option></select>
  <div id="rec-session-grid"></div>
</div>
</body>
</html>`;

/** A host that answers the handshake and the reads of the actual modules. */
class FakeHost {
  constructor() {
    this.connections = [];
    this.commands = [];
    this.answerReads = true;
    this.role = 'controller';
    this.clientId = 'client-one';
    this.armed = true;
    this.holdHello = false;
  }

  snapshot() {
    const field = value => ({ value, fresh: true, observedAt: Date.now() });
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
      tracks: [{
        index: 0,
        id: 't-0',
        name: 'Track0',
        arm: this.armed,
        canArm: true,
        solo: false,
        mute: false,
        volume: 0.5,
        volumeDefault: 0.73,
        groupId: null,
        isGroup: false,
      }],
      locators: [{ name: 'Intro', time: 0 }, { name: 'End', time: 32 }],
      meter: { numerator: 4, denominator: 4 },
      pending: null,
      range: null,
      safety: {},
      session: { rows: [], scenes: [], totalScenes: 0, active: false },
    };
  }

  /** The handshake of the waiting connection is sent now. */
  releaseHello() {
    this.holdHello = false;
    const connection = this.waiting;
    this.waiting = null;
    if (!connection) return;
    connection.route.send(JSON.stringify({
      type: 'hello',
      client_id: this.clientId,
      role: this.role,
      tokenStatus: 'valid',
    }));
  }

  async attach(page) {
    await page.routeWebSocket('**/ws**', route => {
      // The route is the socket itself: it sends, closes and reports messages.
      const connection = { opened: Date.now(), closed: 0, route };
      this.connections.push(connection);
      route.onMessage(raw => {
        const text = typeof raw === 'string' ? raw : raw.toString();
        let message;
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }
        if (message.type === 'resume') {
          if (this.holdHello) {
            this.waiting = connection;
            return;
          }
          route.send(JSON.stringify({
            type: 'hello',
            client_id: this.clientId,
            role: this.role,
            tokenStatus: 'valid',
          }));
          return;
        }
        if (typeof message.id !== 'string') return;
        this.commands.push(message.cmd);
        if (!this.answerReads && message.cmd === 'getRecordingState') return;
        route.send(JSON.stringify({ id: message.id, ok: true, result: this.snapshot() }));
      });
    });
  }
}

function baseUrl() {
  const configured = test.info().project.use.baseURL;
  return configured || 'http://127.0.0.1:9880';
}

async function openRecPage(page, token) {
  await page.route('**/rec-harness.html**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: HARNESS,
  }));
  await page.goto(`${baseUrl()}/rec-harness.html?token=${encodeURIComponent(token)}`);
  // The actual modules of this repository, loaded in the order of the page.
  await page.addScriptTag({ content: sessionSource });
  await page.addScriptTag({ content: rangeSource });
  await page.addScriptTag({ content: recordingSource });
  await page.evaluate(() => { window.RCSurface.initSession({}); });
}

const status = page => page.locator('#rec-status');
const start = page => page.locator('#rec-start');
const click = page => page.locator('#rec-click');
const arm = page => page.locator('#rec-track-grid .rec-track-actions button[data-property="arm"]');

test('REC recovers its state after the host drops the socket', async ({ page }) => {
  test.setTimeout(60000);
  const host = new FakeHost();
  await host.attach(page);
  await openRecPage(page, 'controller-token');

  // The controller session and its known state arrive.
  await expect.poll(() => status(page).textContent()).toBe('freeReady');
  await expect.poll(() => start(page).isDisabled()).toBe(false);
  await expect.poll(() => click(page).isDisabled()).toBe(false);
  await expect.poll(() => arm(page).getAttribute('aria-pressed')).toBe('true');

  // The host drops the socket and holds the next handshake: the old session
  // is retired and the client stays blocked until the host answers.
  host.holdHello = true;
  host.connections[0].closed = Date.now();
  await host.connections[0].route.close();
  await expect.poll(() => status(page).textContent(), { timeout: 20000 }).toBe('unknown');
  await expect.poll(() => start(page).isDisabled(), { timeout: 20000 }).toBe(true);

  // The bounded retry opens a new socket that waits for its handshake.
  await expect.poll(() => host.connections.length, { timeout: 20000 }).toBe(2);
  const gap = host.connections[1].opened - host.connections[0].closed;
  expect(gap).toBeLessThan(10000);

  // The session comes back without an armed track: REC stays disabled on a
  // fresh connection.
  host.armed = false;
  host.releaseHello();
  await expect.poll(() => arm(page).getAttribute('aria-pressed'), { timeout: 20000 }).toBe('false');
  await expect.poll(() => start(page).isDisabled(), { timeout: 20000 }).toBe(true);

  // A fresh poll with an armed track enables REC again: the recovery is real.
  host.armed = true;
  await expect.poll(() => arm(page).getAttribute('aria-pressed'), { timeout: 20000 }).toBe('true');
  await expect.poll(() => start(page).isDisabled(), { timeout: 20000 }).toBe(false);
  await expect.poll(() => click(page).isDisabled(), { timeout: 20000 }).toBe(false);
  await expect.poll(() => status(page).textContent(), { timeout: 20000 }).toBe('freeReady');
  const url = await page.evaluate(() => window.phoneWs && window.phoneWs.url);
  expect(url).toContain('token=controller-token');
});

test('REC CLICK stays unavailable while the metronome observation is unknown', async ({ page }) => {
  test.setTimeout(60000);
  const host = new FakeHost();
  await host.attach(page);
  await openRecPage(page, 'controller-token');
  await expect.poll(() => status(page).textContent()).toBe('freeReady');
  await expect.poll(() => click(page).isDisabled()).toBe(false);

  // The host stops answering: the observation ages and becomes unknown.
  host.answerReads = false;
  await expect.poll(() => click(page).isDisabled(), { timeout: 20000 }).toBe(true);
  await expect.poll(() => status(page).textContent(), { timeout: 20000 }).toBe('unknown');
  expect(await click(page).textContent()).toContain('?');

  // The handler refuses the click as well: nothing reaches the host.
  await page.evaluate(() => {
    document.getElementById('rec-click').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(host.commands.filter(command => command === 'recordingClick')).toHaveLength(0);
});

test('a reopened page uses the token and the role the server grants', async ({ page, context }) => {
  test.setTimeout(60000);
  const viewer = new FakeHost();
  viewer.role = 'viewer';
  await viewer.attach(page);
  await openRecPage(page, 'controller-token');

  // A viewer session reads, but never writes.
  await expect.poll(() => status(page).textContent()).toBe('freeReady');
  await expect.poll(() => start(page).isDisabled()).toBe(true);
  await expect.poll(() => click(page).isDisabled()).toBe(true);
  const firstUrl = await page.evaluate(() => window.phoneWs && window.phoneWs.url);
  expect(firstUrl).toContain('token=controller-token');

  // A second page on the same origin uses the same token and the current role.
  const reopened = await context.newPage();
  const controller = new FakeHost();
  controller.clientId = 'client-two';
  await controller.attach(reopened);
  await openRecPage(reopened, 'controller-token');
  await expect.poll(() => status(reopened).textContent()).toBe('freeReady');
  await expect.poll(() => start(reopened).isDisabled()).toBe(false);
  await expect.poll(() => click(reopened).isDisabled()).toBe(false);
  const secondUrl = await reopened.evaluate(() => window.phoneWs && window.phoneWs.url);
  expect(secondUrl).toContain('token=controller-token');
});
