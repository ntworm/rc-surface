// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Gate A heartbeat/capability probe only. NO audio processing or target writes.
'use strict';
const fs = require('node:fs/promises');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
require('./native-audio-contract.cjs');

function createProbeClient(maxApi) {
  let rendezvous = null, instanceId = '', deviceId = '', pairNonce = 0, pending = null, generation = 0;
  const status = code => maxApi.outlet('status', code);
  function stop() { generation++; rendezvous = null; if (pending) pending.destroy(); pending = null; }
  return {
    identity(device, instance) {
      if (!/^[0-9a-f-]{36}$/.test(device) || !/^[0-9a-f-]{36}$/.test(instance)) return;
      deviceId = device; instanceId = instance;
    },
    nonce(value) { if (Number.isInteger(value) && value >= 0 && value <= 16777215) pairNonce = value; },
    async connect(file) {
      stop(); const ticket = generation;
      if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error('invalid_probe_file');
      const handle = await fs.open(file, 'r'); let data;
      try { if ((await handle.stat()).size > 2048) throw Error('invalid_probe_file'); data = JSON.parse(await handle.readFile('utf8')); }
      finally { await handle.close(); }
      if (!data || data.version !== 1 || data.kind !== 'rc-native-capability-probe' || data.host !== '127.0.0.1'
        || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535
        || typeof data.token !== 'string' || !/^[0-9a-f]{64}$/.test(data.token)
        || typeof data.hostEpoch !== 'string' || !/^[0-9a-f-]{36}$/.test(data.hostEpoch)) throw Error('invalid_probe_file');
      if (ticket !== generation) return;
      rendezvous = data; pairNonce = crypto.randomInt(1, 16777216);
      maxApi.outlet('pairnonce', pairNonce); status('probe_ready');
    },
    async ping() {
      if (!rendezvous || !instanceId || !deviceId || pending) return;
      const ticket = generation, config = rendezvous;
      const exchange = globalThis.NativeAudioContract.validateExchange({ version: 1,
        hostEpoch: config.hostEpoch, instanceId, pairNonce });
      const body = JSON.stringify(exchange);
      await new Promise(resolve => {
        let done = false;
        const finish = code => { if (done) return; done = true;
          if (ticket === generation) { pending = null; status(code); } resolve(); };
        const request = http.request({ hostname: '127.0.0.1', port: config.port, path: '/native-audio/probe', method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token,
            'Content-Length': Buffer.byteLength(body) } }, response => {
          let size = 0; const chunks = [];
          response.on('data', chunk => { size += chunk.length; if (size > 1024) { request.destroy(); finish('probe_failed'); } else chunks.push(chunk); });
          response.on('end', () => {
            try { const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              finish(response.statusCode === 200 && reply.version === 1 && reply.hostEpoch === config.hostEpoch ? 'probe_connected' : 'probe_failed');
            } catch { finish('probe_failed'); }
          });
          response.on('error', () => finish('probe_failed'));
        });
        pending = request;
        request.setTimeout(2000, () => { request.destroy(); finish('probe_failed'); });
        request.on('error', () => finish('probe_failed'));
        request.end(body);
      });
    },
    stop,
  };
}
module.exports = { createProbeClient };
