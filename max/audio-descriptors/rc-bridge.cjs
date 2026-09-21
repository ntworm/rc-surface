// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Node for Max entry: register even when an external runner requires this file.
// Keep the dependency-free client separate for tests; no require.main assumption.
'use strict';
const maxApi = require('max-api');
const { createProbeClient } = require('./rc-probe-client.cjs');
const client = createProbeClient(maxApi);
maxApi.addHandler('identity', (device, instance) => { client.identity(device, instance); client.ping().catch(() => maxApi.outlet('status', 'probe_failed')); });
maxApi.addHandler('nonce', value => client.nonce(value));
maxApi.addHandler('connect', file => client.connect(file).catch(() => maxApi.outlet('status', 'probe_failed')));
maxApi.addHandler('stop', () => client.stop());
maxApi.post('RC native probe / Node ' + process.versions.node + ' / ' + process.platform + ' ' + process.arch);
