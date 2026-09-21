// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WebSocketConnectionLimiter,
  WebSocketHeartbeatMonitor,
} from '../src/server/ws-bounds.ts';

test('connection limiter enforces both per-IP and global caps', () => {
  const limiter = new WebSocketConnectionLimiter(3, 2);

  assert.equal(limiter.tryAcquire('10.0.0.1'), true);
  assert.equal(limiter.tryAcquire('10.0.0.1'), true);
  assert.equal(limiter.tryAcquire('10.0.0.1'), false, 'third socket from one IP is refused');
  assert.equal(limiter.tryAcquire('10.0.0.2'), true);
  assert.equal(limiter.tryAcquire('10.0.0.3'), false, 'global fourth socket is refused');

  limiter.release('10.0.0.1');
  assert.equal(limiter.tryAcquire('10.0.0.3'), true, 'closing a socket releases capacity');
});

test('heartbeat monitor terminates a socket that misses a pong', () => {
  const monitor = new WebSocketHeartbeatMonitor();
  const socket = {
    pings: 0,
    terminations: 0,
    ping() { this.pings += 1; },
    terminate() { this.terminations += 1; },
  };

  monitor.add(socket);
  monitor.sweep([socket]);
  assert.equal(socket.pings, 1);
  assert.equal(socket.terminations, 0);

  monitor.sweep([socket]);
  assert.equal(socket.terminations, 1, 'a second sweep without pong terminates the socket');

  monitor.add(socket);
  monitor.markAlive(socket);
  monitor.sweep([socket]);
  assert.equal(socket.pings, 2, 'a pong keeps the socket alive for the next probe');
});
