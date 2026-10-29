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

for (const denyStorage of [false, true]) test(`panel address choice preserves session with storage denied=${denyStorage}`, async ({ page }) => {
  if (denyStorage) await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }));
  let info = { isRunning: true, port: 9880, httpsPort: 8731, useHttps: true,
    primaryIp: '192.168.64.1', otherIps: ['10.0.1.5'],
    phoneUrl: 'https://192.168.64.1:8731/?token=fixture&lang=pt-BR#keep',
    adminUrl: 'http://127.0.0.1:9880/static/admin/?token=admin-fixture' };
  await page.routeWebSocket('**/admin/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.cmd) socket.send(JSON.stringify({ id: message.id, ok: true,
      result: message.cmd === 'getServerInfo' ? info : {} }));
  }));
  await page.route('**/static/panel/index.html*', async route => {
    const html = await fs.readFile('static/panel/index.html', 'utf8');
    const globals = `<script>window.INITIAL_IS_RUNNING=true;window.INITIAL_PORT=9880;window.INITIAL_HTTPS_PORT=8731;window.INITIAL_PRIMARY_IP="192.168.64.1";window.INITIAL_OTHER_IPS=["10.0.1.5"];window.INITIAL_PHONE_URL=${JSON.stringify(info.phoneUrl)};</script>`;
    await route.fulfill({ body: html.replace('</head>', globals + '</head>'), contentType: 'text/html' });
  });
  await page.goto('/static/panel/index.html');
  const select = page.locator('#network-address');
  await select.selectOption('10.0.1.5');
  const expected = 'https://10.0.1.5:8731/?token=fixture&lang=pt-BR#keep';
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', expected);
  await expect(page.locator('#open-perf')).toHaveAttribute('href', expected);
  await expect(page.locator('#copy-primary')).toHaveAttribute('data-url', expected);
  await expect(page.locator('#link-admin')).toHaveAttribute('href', info.adminUrl);
  expect(new URL(page.url()).hostname).toBe('localhost');
  await page.reload();
  await expect(select).toHaveValue(denyStorage ? '192.168.64.1' : '10.0.1.5');
  await select.selectOption('10.0.1.5');
  info = { ...info, primaryIp: '192.168.64.1', otherIps: [] };
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', info.phoneUrl, { timeout: 7000 });
  await expect(select).toBeHidden();
});
