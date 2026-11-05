// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(import.meta.dirname, 'modules/session.js'), 'utf8');

function loadSession(WebSocketImpl, { onLine = true, fetchImpl = null, locale = null } = {}) {
  const listeners = new Map();
  let reconnectCallback = null;
  let reconnectDelay = null;
  const status = { textContent: '', className: '', title: '' };
  const events = [];
  const sockets = [];
  const persisted = [];
  // Every socket the module creates is kept, so a test can deliver the
  // queued events of a socket that was already replaced.
  class TrackedWebSocket extends WebSocketImpl {
    constructor(url) { super(url); sockets.push(this); }
  }
  const context = {
    fetch: fetchImpl || (() => Promise.reject(new Error('no fetch in this harness'))),
    window: null,
    navigator: { onLine },
    location: {
      protocol: 'https:',
      host: '192.168.1.50:4444',
      href: 'https://192.168.1.50:4444/static/phone-v3/?token=controller-token',
      search: '?token=controller-token',
    },
    document: { getElementById: (id) => id === 'status' ? status : null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    PhoneIdentity: { load: () => null, persist: (id) => { persisted.push(id); } },
    WebSocket: TrackedWebSocket,
    URLSearchParams,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent: (event) => { events.push(event); },
    addEventListener: (type, cb) => listeners.set(type, cb),
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (cb, delay) => { reconnectCallback = cb; reconnectDelay = delay; return 1; },
    clearTimeout: () => {},
    console,
  };
  context.window = context;
  context.globalThis = context;
  if (locale) {
    vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../shared/i18n-catalog.js'), 'utf8'), context);
    // Use the actual catalog, with a minimal translator boundary.
    context.RcSurfaceI18n = { t: (key) => context.RcSurfaceI18nCatalog?.[key]?.[locale] ?? key };
  }
  vm.runInNewContext(source, context, { filename: 'session.js' });
  return {
    context,
    status,
    events,
    sockets,
    persisted,
    getReconnect: () => ({ callback: reconnectCallback, delay: reconnectDelay }),
  };
}

test('session reconnects cleanly when WebSocket construction is rejected', () => {
  class ThrowingWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor() { throw new Error('certificate/origin rejected'); }
  }

  const env = loadSession(ThrowingWebSocket);
  assert.doesNotThrow(() => env.context.RCSurface.initSession());
  assert.match(env.status.textContent, /RETRY/);
  assert.equal(env.status.className, 'status disconnected');
  assert.equal(env.getReconnect().delay, 1000);
  assert.equal(env.context.phoneWs, null);
});

for (const locale of ['en', 'pt-BR']) {
  test('session recovery messages follow the selected locale: ' + locale, () => {
    class Socket {
      static OPEN = 1; static CONNECTING = 0;
      constructor() { this.readyState = 1; }
      send() {} close() {}
    }
    const env = loadSession(Socket, { locale });
    env.context.RCSurface.initSession();
    const socket = env.context.phoneWs;
    socket.onopen();
    socket.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'test-client', role: 'viewer', tokenStatus: 'stale' }) });
    assert.match(env.status.textContent, locale === 'en' ? /SESSION EXPIRED/ : /SESSÃO EXPIRADA/);
    socket.onclose({ code: 4009 });
    assert.match(env.status.textContent, locale === 'en' ? /ANOTHER TAB/ : /OUTRA ABA/);
    assert.equal(env.getReconnect().callback, null, 'replacement must not enter reconnect ping-pong');
  });
}

test('session builds the WebSocket URL from the page origin and keeps the controller token', () => {
  class WebSocketMock {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = WebSocketMock.CONNECTING; }
    send() {}
  }

  const env = loadSession(WebSocketMock);
  env.context.RCSurface.initSession();
  assert.equal(env.context.phoneWs.url, 'wss://192.168.1.50:4444/ws?token=controller-token');
});

test('session still attempts the local WebSocket when browser reports offline', () => {
  let constructed = 0;
  class WebSocketMock {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) {
      constructed += 1;
      this.url = url;
      this.readyState = WebSocketMock.CONNECTING;
    }
    send() {}
  }

  const env = loadSession(WebSocketMock, { onLine: false });
  env.context.RCSurface.initSession();

  assert.equal(constructed, 1);
  assert.equal(env.context.phoneWs.url, 'wss://192.168.1.50:4444/ws?token=controller-token');
});

// ── Root cause R2 (client half) ─────────────────────────────────────────────
// Tokens are regenerated on every Ableton restart. A page left open reconnects
// with a token the server no longer knows and is downgraded to viewer, so every
// transport / pad / knob write is silently rejected. The status bar must say so.

function connectAndSayHello(hello) {
  const sockets = [];
  class WebSocketMock {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 1; sockets.push(this); }
    send() {}
    close() {}
  }
  const env = loadSession(WebSocketMock);
  env.context.RCSurface.initSession();
  const socket = sockets[0];
  socket.onopen();
  socket.onmessage({ data: JSON.stringify(hello) });
  return env;
}

test('session reports an expired session when the server flags a stale token', () => {
  const env = connectAndSayHello({
    type: 'hello',
    client_id: 'abcdef01-2345-6789-abcd-ef0123456789',
    role: 'viewer',
    tokenStatus: 'stale',
  });
  assert.match(
    env.status.textContent,
    /EXPIRED/i,
    `expected an actionable expired-session status, got: ${env.status.textContent}`,
  );
  assert.match(env.status.textContent, /RESCAN/i);
});

test('session shows the normal connected status when the token is valid', () => {
  const env = connectAndSayHello({
    type: 'hello',
    client_id: 'abcdef01-2345-6789-abcd-ef0123456789',
    role: 'controller',
    tokenStatus: 'valid',
  });
  assert.equal(env.status.className, 'status connected');
  assert.doesNotMatch(env.status.textContent, /EXPIRED/i);
});

test('session does not cry "expired" for a viewer that never presented a token', () => {
  const env = connectAndSayHello({
    type: 'hello',
    client_id: 'abcdef01-2345-6789-abcd-ef0123456789',
    role: 'viewer',
    tokenStatus: 'none',
  });
  assert.doesNotMatch(env.status.textContent, /EXPIRED/i);
  assert.match(env.status.textContent, /Viewer/);
});

// ── Root cause R5 ───────────────────────────────────────────────────────────
// A refused WebSocket upgrade reaches the browser as a bare
// "WebSocket connection failed" with no close code, because the server
// destroys the socket. The user is left staring at "RETRY 30s" with no cause.
// When the handshake never completes, ask the server why and show the answer.

test('session asks the server why the handshake failed and shows the reason', async () => {
  class FailingWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 0; FailingWebSocket.instance = this; }
    send() {}
    close() {}
  }
  let probedUrl = null;
  let probedMethod = null;
  const fetchImpl = (url, opts) => {
    probedUrl = url;
    probedMethod = opts && opts.method;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        originCheck: {
          ok: false,
          reason: 'non-http-origin-scheme',
          originValue: 'chrome-extension://abcdef',
          hostValue: '192.168.1.50:4444',
        },
      }),
    });
  };

  const env = loadSession(FailingWebSocket, { fetchImpl });
  env.context.RCSurface.initSession();
  // The socket is destroyed by the server: onclose with no prior hello.
  FailingWebSocket.instance.onclose({ code: 1006, reason: '', wasClean: false });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(String(probedUrl), /\/diag\/echo/, `probe URL was: ${probedUrl}`);
  assert.equal(probedMethod, 'POST', 'must POST so the server sees the Origin header');
  assert.match(
    env.status.textContent,
    /non-http-origin-scheme/,
    `status must carry the server's reason, got: ${env.status.textContent}`,
  );
});

test('session does not nag about origin when the server says the origin is fine', async () => {
  class FailingWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 0; FailingWebSocket.instance = this; }
    send() {}
    close() {}
  }
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ originCheck: { ok: true, reason: 'exact-host-match' } }),
  });

  const env = loadSession(FailingWebSocket, { fetchImpl });
  env.context.RCSurface.initSession();
  FailingWebSocket.instance.onclose({ code: 1006, reason: '', wasClean: false });
  await new Promise((resolve) => setImmediate(resolve));

  assert.doesNotMatch(env.status.textContent, /origin/i, `got: ${env.status.textContent}`);
  assert.match(env.status.textContent, /RETRY/);
});

// ── Retired sockets ────────────────────────────────────────────────────────
// A socket that was replaced can still deliver the events it had queued: the
// current session owns the page, so an event of a retired socket is ignored
// before it can send, persist a client id or notify the caller.

function socketHarness() {
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; }
    send(data) { this.sent.push(data); }
    close() {}
  }
  const env = loadSession(Socket);
  env.context.RCSurface.initSession();
  return env;
}

test('session ignores a retired socket: its late hello, open and response never reach the new session', () => {
  const env = socketHarness();
  const first = env.sockets[0];
  first.onopen();
  first.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'client-one', role: 'controller', tokenStatus: 'valid' }) });
  assert.equal(env.context.getPhoneClientId(), 'client-one');

  // A command is still waiting when the host drops the socket.
  let answered = 0;
  env.context.sendPhoneCommand('recordingArm', {}, () => { answered += 1; });
  first.onclose({ code: 1006 });
  assert.equal(answered, 1, 'the pending callback fails once when the socket drops');
  assert.equal(env.context.getPhoneClientId(), null, 'a dropped session owns no client id');

  // The bounded retry opens a new socket and restores the session.
  const retry = env.getReconnect();
  assert.equal(retry.delay, 1000, 'the first retry waits one second');
  retry.callback();
  const second = env.sockets[1];
  assert.notEqual(second, first);
  second.onopen();
  second.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'client-two', role: 'controller', tokenStatus: 'valid' }) });
  assert.equal(env.context.getPhoneClientId(), 'client-two');

  const clientIdEvents = () => env.events.filter(event => event.type === 'ableton-rc:phone-client-id');
  const commandEvents = () => env.events.filter(event => event.type === 'ableton-rc:phone-command-response');
  const announced = clientIdEvents().length;
  const notified = commandEvents().length;
  const identities = env.persisted.length;
  const sent = first.sent.length;

  // The retired socket delivers the events it had queued.
  first.onopen();
  first.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'stale-client', role: 'admin', tokenStatus: 'valid' }) });
  first.onmessage({ data: JSON.stringify({ id: 'phone-map-1', ok: true, result: {} }) });

  assert.equal(first.sent.length, sent, 'a retired socket never sends a resume');
  assert.equal(env.context.getPhoneClientId(), 'client-two', 'a retired hello never claims the session');
  assert.equal(clientIdEvents().length, announced, 'a retired hello never announces a client id');
  assert.equal(env.persisted.length, identities, 'a retired hello never persists an identity');
  assert.equal(commandEvents().length, notified, 'a retired response never notifies the caller');
  assert.equal(answered, 1, 'the failed callback is never called twice');
  assert.equal(env.status.className, 'status connected', 'the current session keeps its status');
});

test('session retries an ordinary close with a bounded delay and follows the role the server grants', () => {
  const env = socketHarness();
  const first = env.sockets[0];
  first.onopen();
  first.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'client-one', role: 'controller', tokenStatus: 'valid' }) });
  first.onclose({ code: 1006 });

  assert.match(env.status.textContent, /RETRY/);
  const retry = env.getReconnect();
  assert.equal(retry.delay, 1000, 'the first retry waits one second');
  retry.callback();
  const second = env.sockets[1];
  second.onopen();
  // The server downgrades the new session: the page follows the server.
  second.onmessage({ data: JSON.stringify({ type: 'hello', client_id: 'client-two', role: 'viewer', tokenStatus: 'stale' }) });

  const session = env.context.RCSurface.getPhoneSession();
  assert.equal(session.clientId, 'client-two');
  assert.equal(session.role, 'viewer', 'the role of the new hello is authoritative');
  assert.match(env.status.textContent, /EXPIRED/i, 'a stale token stays an expired session');
});
