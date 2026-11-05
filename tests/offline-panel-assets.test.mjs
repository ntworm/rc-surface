// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildOfflinePanel } from '../src/ui/offline-panel.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-offline-'));
  for (const directory of ['panel', 'shared', 'fonts']) await fs.mkdir(path.join(root, directory));
  await fs.writeFile(path.join(root, 'fonts/DepartureMono-Regular.woff2'), 'fixture');
  await fs.writeFile(path.join(root, 'panel/style.css'), 'a{background:transparent}');
  return { root, panel: path.join(root, 'panel') };
}

test('new offline dependencies preserve script strings, replacement tokens and initialization globals', async () => {
  const { root, panel } = await fixture();
  try {
    await fs.writeFile(path.join(panel, 'index.html'), '<head><link rel="stylesheet" href="style.css"></head><body><script src="../shared/extra.js"></script></body>');
    await fs.writeFile(path.join(root, 'shared/extra.js'), 'window.extra = "$& </script> </SCRIPT>";');
    const html = await buildOfflinePanel(panel, false);
    assert.doesNotMatch(html, /<script src=/);
    const context = { window: {} };
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(match[1], context);
    assert.equal(context.window.extra, '$& </script> </SCRIPT>');
    assert.equal(context.window.INITIAL_PORT, null);
    assert.equal(context.window.INITIAL_IS_RUNNING, false);
    assert.equal(context.window.INITIAL_AUTOSTART, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('offline script references cannot read outside the static asset directory', async () => {
  const { root, panel } = await fixture();
  try {
    await fs.writeFile(path.join(panel, 'index.html'), '<body><script src="../../outside.js"></script></body>');
    await assert.rejects(buildOfflinePanel(panel, true), /outside static directory/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
