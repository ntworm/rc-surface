// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of the
// License at https://polyformproject.org/licenses/noncommercial/1.0.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import {
  buildControls,
  createControlCache,
  recordFrameControl,
  seedFromSnapshot,
} from '../src/server/snapshot-controls.ts';
import { CACHE_MAX_ENTRIES } from '../src/server/ws-bounds.ts';
import { startServer, stopServer, actualPort } from '../src/server/state.ts';
import { trackedClients } from '../src/server/ws.ts';
import { getControllerToken } from '../src/server/session-auth.ts';
import { setExtensionContext, clearExtensionContext } from '../src/context.ts';
import { controlMappings } from '../src/live/mappings.ts';

// The integration test at the end of this file starts a server of its own, so
// the file claims a port of its own: every suite runs in its own process and
// two of them must not fight over the same port. The HTTPS and certificate
// ports follow this one, so the three of them stay free.
process.env.RC_SURFACE_PORT = '16194';

test('a keyframe seeds the list and a frame updates the entry it names', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [
    { name: 'pad-1', value: 1, lost: false },
    { name: 'xy-1', x: 0.2, y: 0.9 },
  ]);
  assert.deepEqual(buildControls(cache), [
    { name: 'pad-1', value: 1, lost: false },
    { name: 'xy-1', x: 0.2, y: 0.9 },
  ]);

  recordFrameControl(cache, { name: 'pad-1', value: 0.5 });
  recordFrameControl(cache, { name: 'xy-1', x: 0.3, y: 0.4 });
  const built = buildControls(cache);
  assert.deepEqual(built[0], { name: 'pad-1', value: 0.5 }, 'a scalar control keeps its shape');
  assert.deepEqual(built[1], { name: 'xy-1', x: 0.3, y: 0.4 }, 'an XY control keeps its shape');
  assert.equal(built[1].value, undefined, 'a frame never turns an XY control into a scalar');
});

test('a keyframe replaces the list instead of merging into it', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [{ name: 'pad-1', value: 1 }]);
  seedFromSnapshot(cache, [{ name: 'pad-2', value: 1 }]);
  assert.deepEqual(buildControls(cache), [{ name: 'pad-2', value: 1 }]);
});

test('every build hands out a new array a reader cannot write into', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [{ name: 'pad-1', value: 1 }]);
  const first = buildControls(cache);
  const second = buildControls(cache);
  assert.notEqual(first, second, 'every build is a new array');

  first[0].value = 99;
  first.push({ name: 'pad-2', value: 1 });
  assert.deepEqual(buildControls(cache), [{ name: 'pad-1', value: 1 }],
    'a write into the built list cannot leak into the next build');
});

test('the list is bounded and the oldest entry is the one that goes', () => {
  const cache = createControlCache();
  for (let i = 0; i < CACHE_MAX_ENTRIES + 1; i += 1) {
    recordFrameControl(cache, { name: `fader-${i}`, value: 0.5 });
  }
  const built = buildControls(cache);
  assert.equal(built.length, CACHE_MAX_ENTRIES);
  assert.equal(built[0].name, 'fader-1', 'the oldest entry was evicted');
  assert.equal(built.at(-1).name, `fader-${CACHE_MAX_ENTRIES}`);
});

test('a malformed control never enters the list', () => {
  const cache = createControlCache();
  seedFromSnapshot(cache, [null, { value: 1 }, { name: 'pad-1', value: 1 }]);
  recordFrameControl(cache, undefined);
  recordFrameControl(cache, { name: '', value: 1 });
  assert.deepEqual(buildControls(cache), [{ name: 'pad-1', value: 1 }]);
});

test('every client gets a list of its own', () => {
  const first = createControlCache();
  const second = createControlCache();
  seedFromSnapshot(first, [{ name: 'pad-1', value: 1 }]);
  assert.deepEqual(buildControls(second), [], 'a fresh list knows nothing of the other client');
  assert.equal(buildControls(first).length, 1);
});

// ---- Integration: the real server and the real socket --------------------
//
// The unit tests above drive the control cache directly. The test below
// drives the path a phone walks: a negotiated socket, a keyframe, a realtime
// frame and the snapshots that follow. The host keeps the list, so the panel
// and the admin see the controls of a client that stopped repeating them.

async function openWs(url) {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on('message', (data) => {
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {
      // ignore
    }
  });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  const start = Date.now();
  while (!messages.some((m) => m && m.type === 'hello') && Date.now() - start < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { ws, helloMsg: messages.find((m) => m && m.type === 'hello') || null };
}

// The server answers on its own schedule: a short wait lets the socket
// message land and the mapping write settle before the assertions run.
const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

// A Live that records every parameter write: the only way to tell "the
// snapshot actuated nothing" from "nothing was mapped at all".
function fakeLive(parameterWrites) {
  const parameter = (name) => ({
    name, min: 0, max: 1, getValue: async () => 0.5,
    setValue: async (value) => { parameterWrites.push(value); },
  });
  return {
    application: {
      song: {
        tempo: 120,
        tracks: [{ name: 'Track 1', devices: [{ name: 'Device 1', parameters: [parameter('a'), parameter('b')] }] }],
        scenes: [{ signatureNumerator: 4, signatureDenominator: 4 }],
      },
    },
  };
}

function sendSnapshot(ws, data) {
  ws.send(JSON.stringify({ type: 'snapshot', data }));
}

// The list the host must rebuild: the frame moved the fader, the keyframe
// entry of the XY pad stayed where it was.
const REBUILT_LIST = [
  { name: 'fader-1', value: 0.7 },
  { name: 'xy-1', x: 0.1, y: 0.9 },
];

test('the host keeps the control list of a realtime client that stopped repeating it', async () => {
  const parameterWrites = [];
  controlMappings.clear();
  setExtensionContext(fakeLive(parameterWrites));
  await startServer();
  try {
    const port = actualPort;
    assert.ok(port, 'the server must be running');
    const { ws, helloMsg } = await openWs(`ws://127.0.0.1:${port}/ws?token=${getControllerToken()}`);
    assert.equal(helloMsg.controlStreamVersion, 1, 'the phone negotiated the realtime control stream');
    const client = Array.from(trackedClients.values())[0];
    controlMappings.set('fader-1', [{ type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 0, takeoverMode: 'jump' }]);
    controlMappings.set('xy-1.x', [{ type: 'device_param', trackIndex: 0, deviceIndex: 0, paramIndex: 1, takeoverMode: 'jump' }]);
    // 1. The keyframe: the whole list, once.
    sendSnapshot(ws, {
      controlsRealtime: true,
      controls: [{ name: 'fader-1', value: 0.2 }, { name: 'xy-1', x: 0.1, y: 0.9 }],
    });
    await settle();
    assert.deepEqual(parameterWrites, [], 'a realtime snapshot never actuates Live');
    assert.deepEqual(client.lastData.controls, [
      { name: 'fader-1', value: 0.2 },
      { name: 'xy-1', x: 0.1, y: 0.9 },
    ], 'the host keeps the list the keyframe carried');
    // 2. The frame: one control moves, the rest of the list stays put.
    ws.send(JSON.stringify({ type: 'control_frame', controls: [{ name: 'fader-1', value: 0.7 }] }));
    await settle();
    assert.deepEqual(parameterWrites, [0.7], 'the frame actuates the mapped parameter');
    // 3. The next snapshot carries no list: the host rebuilds it.
    sendSnapshot(ws, { controlsRealtime: true });
    await settle();
    assert.deepEqual(client.lastData.controls, REBUILT_LIST,
      'the rebuilt list carries the frame value and the untouched keyframe entry');
    const held = client.lastData.controls;
    held.push({ name: 'injected', value: 1 });
    sendSnapshot(ws, { controlsRealtime: true });
    await settle();
    assert.notEqual(client.lastData.controls, held, 'every snapshot hands out a new array');
    assert.equal(client.lastData.controls.find((control) => control.name === 'injected'), undefined,
      'a write into the list of one snapshot cannot reach the next');
    assert.deepEqual(client.lastData.controls, REBUILT_LIST);
    // 4. A mixed snapshot replaces the list and applies nothing to Live.
    sendSnapshot(ws, { controlsRealtime: true, controls: [{ name: 'knob-9', value: 0.5 }] });
    await settle();
    assert.deepEqual(client.lastData.controls, [{ name: 'knob-9', value: 0.5 }],
      'a mixed snapshot replaces the list instead of merging into it');
    assert.deepEqual(parameterWrites, [0.7], 'a mixed snapshot never actuates Live');
    assert.equal(client.history['knob-9'], undefined, 'a mixed snapshot never reaches the mapping engine');
    ws.close();
  } finally {
    await stopServer();
    controlMappings.clear();
    clearExtensionContext();
  }
});
