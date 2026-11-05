// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// A page in a background tab gets its timers run about once a minute. The
// heartbeat pings every 5 s and closes the socket when the last pong is older
// than 12 s, so a throttled tick always found a stale pong and the page closed
// its own healthy socket: reconnections exactly every 60 s, measured on a Mac
// and on Windows. Every close also stops the host LFOs of that client. A tick
// that arrives late proves only that the page was throttled; it pings and
// waits for the next tick instead of closing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'modules/session.js'), 'utf8');

function heartbeatHarness() {
  let now = 0;
  const intervals = [];
  const sockets = [];
  class Socket {
    static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.closes = 0; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.closes += 1; }
  }
  const status = { textContent: '', className: '', title: '' };
  const context = {
    Date: { now: () => now },
    fetch: () => Promise.reject(new Error('no fetch in this harness')),
    window: null,
    navigator: { onLine: true },
    location: { protocol: 'https:', host: '192.168.1.50:4444', href: 'https://192.168.1.50:4444/static/phone-v3/', search: '' },
    document: { getElementById: (id) => id === 'status' ? status : null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    PhoneIdentity: { load: () => null, persist: () => {} },
    WebSocket: Socket,
    URLSearchParams,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent: () => {},
    addEventListener: () => {},
    setInterval: (cb, ms) => { intervals.push({ cb, ms }); return intervals.length; },
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    console,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'session.js' });
  context.RCSurface.initSession();
  const socket = sockets[0];
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'phone-a', role: 'controller', tokenStatus: 'valid' }) });
  const heartbeat = intervals.find((entry) => entry.ms === 5000);
  assert.ok(heartbeat, 'the heartbeat runs on a 5 s interval');
  return {
    socket,
    tickAt(ms) { now = ms; heartbeat.cb(); },
    pongAt(ms) { now = ms; socket.onmessage({ data: JSON.stringify({ type: 'pong', ts: ms - 20 }) }); },
    pings: () => socket.sent.filter((message) => message.type === 'ping').length,
  };
}

test('a tick throttled to once a minute pings instead of closing a healthy socket', () => {
  const h = heartbeatHarness();
  h.tickAt(5000); h.pongAt(5020);
  h.tickAt(10000); h.pongAt(10020);
  const before = h.pings();
  h.tickAt(70000);
  assert.equal(h.socket.closes, 0, 'a late tick is the page being throttled, not the link dropping');
  assert.equal(h.pings(), before + 1, 'it still pings so the next tick can judge the link');
  h.pongAt(70040);
  h.tickAt(130000);
  assert.equal(h.socket.closes, 0, 'a page that stays in the background keeps its socket');
});

test('a link that stops answering is still closed at the normal rhythm', () => {
  const h = heartbeatHarness();
  h.tickAt(5000); h.pongAt(5020);
  h.tickAt(10000); h.pongAt(10020);
  h.tickAt(15000);
  h.tickAt(20000);
  assert.equal(h.socket.closes, 0, 'under 12 s without a pong is still fine');
  h.tickAt(25000);
  assert.equal(h.socket.closes, 1, 'over 12 s without a pong at a normal tick closes');
});

test('after a throttled tick, the next normal tick closes a link that never answered', () => {
  const h = heartbeatHarness();
  h.tickAt(5000); h.pongAt(5020);
  h.tickAt(65000);
  assert.equal(h.socket.closes, 0);
  h.tickAt(70000);
  assert.equal(h.socket.closes, 1, 'the ping of the late tick went unanswered for a whole normal interval');
});
