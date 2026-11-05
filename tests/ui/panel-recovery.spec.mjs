// Copyright Ãƒâ€šÃ‚Â© 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { showPanelDialog } from '../../src/ui/panel.ts';
import { setAutostartEnabled } from '../../src/server/autostart.ts';

for (const bridge of ['webkit', 'webview']) test(`offline panel dispatches real controls through ${bridge}`, async ({ page }) => {
  globalThis.__dirname = path.resolve('.');
  setAutostartEnabled(false);
  let uri;
  await showPanelDialog({ ui: { showModalDialog: async value => { uri = value; return 'close'; } } }, {});
  expect(Buffer.byteLength(uri)).toBeLessThan(2 * 1024 * 1024);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(kind => {
    window.hostActions = [];
    const postMessage = message => window.hostActions.push(message);
    if (kind === 'webkit') window.webkit = { messageHandlers: { live: { postMessage } } };
    else window.chrome = { webview: { postMessage } };
  }, bridge);
  await page.goto(uri);
  await page.locator('#btn-autostart').click();
  expect(await page.evaluate(() => window.hostActions.at(-1)?.params)).toEqual(['autostart-on']);
  await page.locator('#btn-start').click();
  expect(await page.evaluate(() => window.hostActions.at(-1)?.params)).toEqual(['start']);
  // Live closes/reopens the modal after Start; a pending footer is deliberately disabled.
  await page.goto(uri);
  await page.locator('#btn-close').click();
  expect(await page.evaluate(() => window.hostActions.at(-1)?.params)).toEqual(['close']);
  expect(errors).toEqual([]);
});

for (const denyStorage of [false, true]) test(`panel address choice lives on the server with storage denied=${denyStorage}`, async ({ page }) => {
  if (denyStorage) await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }));
  const row = ip => ({ id: `Ethernet|${ip}/24`, ip, interfaceName: 'Ethernet', kind: 'ethernet', gateway: null, defaultRoute: false,
    proven: false, provenUntil: null, level: 5, linkLocal: false, public: false, reasons: ['no-gateway'] });
  const url = ip => `https://${ip}:8731/?token=fixture&lang=pt-BR#keep`;
  const adminUrl = 'http://127.0.0.1:9880/static/admin/?token=admin-fixture';
  let candidates = [row('192.168.64.1'), row('10.0.1.5')];
  let choice = { mode: 'auto' };
  const serverInfo = () => {
    const pinned = choice.mode === 'pinned' ? candidates.find(candidate => candidate.id === choice.id) : null;
    const primaryIp = (pinned ?? candidates[0]).ip;
    return { isRunning: true, port: 9880, httpsPort: 8731, useHttps: true, primaryIp,
      otherIps: candidates.map(candidate => candidate.ip).filter(ip => ip !== primaryIp),
      phoneUrl: url(primaryIp), adminUrl, certificatePending: false, search: null, check: null,
      network: { mode: pinned ? 'pinned' : 'auto', pinnedId: pinned ? pinned.id : null, pinMissing: false, ambiguous: false,
        needsPublicChoice: false, certificatePending: false, certificateFailed: false, candidates } };
  };
  await page.routeWebSocket('**/admin/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (!message.cmd) return;
    if (message.cmd === 'setNetworkChoice') choice = message.args;
    socket.send(JSON.stringify({ id: message.id, ok: true,
      result: ['getServerInfo', 'getNetworkInfo', 'setNetworkChoice'].includes(message.cmd) ? serverInfo() : {} }));
  }));
  await page.route('**/static/panel/index.html*', async route => {
    const html = await fs.readFile('static/panel/index.html', 'utf8');
    const info = serverInfo();
    const globals = `<script>window.INITIAL_IS_RUNNING=true;window.INITIAL_PORT=9880;window.INITIAL_HTTPS_PORT=8731;window.INITIAL_PRIMARY_IP=${JSON.stringify(info.primaryIp)};window.INITIAL_OTHER_IPS=${JSON.stringify(info.otherIps)};window.INITIAL_PHONE_URL=${JSON.stringify(info.phoneUrl)};</script>`;
    await route.fulfill({ body: html.replace('</head>', globals + '</head>'), contentType: 'text/html' });
  });
  await page.goto('/static/panel/index.html');
  const select = page.locator('#network-address');
  const lumikit = candidates[1];
  await select.selectOption(lumikit.id);
  const expected = url(lumikit.ip);
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', expected);
  await expect(page.locator('#open-perf')).toHaveAttribute('href', expected);
  await expect(page.locator('#copy-primary')).toHaveAttribute('data-url', expected);
  await expect(page.locator('#link-admin')).toHaveAttribute('href', adminUrl);
  expect(new URL(page.url()).hostname).toBe('localhost');
  await page.reload();
  await expect(select).toHaveValue(lumikit.id);
  await select.selectOption('auto');
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', url('192.168.64.1'));
  candidates = [candidates[0]];
  await expect(select).toBeHidden({ timeout: 7000 });
});
