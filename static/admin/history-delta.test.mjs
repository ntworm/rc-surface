// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('prototype-named history deltas do not discard the rest of a dashboard update', () => {
  let socket;
  const window = { location: { protocol: 'https:', host: 'localhost:8731', search: '' } };
  class WebSocket {
    constructor() { socket = this; }
  }
  vm.runInNewContext(fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8'), {
    window, WebSocket, URLSearchParams,
    document: { getElementById: () => null },
    setInterval() {},
  });
  const send = (historyFields, value) => socket.onmessage({ data: JSON.stringify({
    type: 'client_update',
    client: { client_id: 'phone', status: 'active', last_seen: Date.now() },
    latest: { sensors: { motion_reading: { acceleration_including_gravity: { x: value, y: 0, z: 0 } } } },
    ...historyFields,
  }) });
  send({ history: {} }, 0);
  const names = ['__proto__', 'constructor', 'toString'];
  for (const [index, name] of names.entries()) {
    send({ historyDelta: { [name]: [[100, 0.5]] } }, index + 1);
  }
  const samples = window.__abletonRcAdmin.sensorHistoryByClient.get('phone')['aig.x'];
  assert.deepEqual(Array.from(samples, (sample) => sample[1]), [0, 1, 2, 3]);
});
