// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const PHONE = 'https://192.168.100.200:8731/?token=fixture&lang=en';
const ADMIN = 'http://127.0.0.1:9880/static/admin/?token=admin-fixture';
const CERT = 'http://192.168.100.200:8732/';
const candidate = {
  id: 'Ethernet|192.168.100.200/24', ip: '192.168.100.200', interfaceName: 'Ethernet', kind: 'ethernet',
  gateway: '192.168.100.1', defaultRoute: true, proven: false, provenUntil: null, level: 3, linkLocal: false,
  public: false, reasons: ['default-route', 'gateway'],
};
const info = {
  isRunning: true, port: 9880, httpsPort: 8731, useHttps: true, statusText: 'Running', primaryIp: candidate.ip,
  otherIps: [], phoneUrl: PHONE, adminUrl: ADMIN, certUrl: CERT, certificatePending: false, search: null, check: null,
  network: { mode: 'auto', pinnedId: null, pinMissing: false, ambiguous: false, needsPublicChoice: false,
    certificatePending: false, certificateFailed: false, candidates: [candidate] },
};

async function open(page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.routeWebSocket('**/admin/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (!message.cmd) return;
    const result = message.cmd === 'getLocale' ? { locale: 'en' } : info;
    socket.send(JSON.stringify({ id: message.id, ok: true, result }));
  }));
  await page.route('**/static/panel/index.html*', async route => {
    const html = await fs.readFile('static/panel/index.html', 'utf8');
    const globals = `<script>window.INITIAL_IS_RUNNING=true;window.INITIAL_PORT=9880;window.INITIAL_HTTPS_PORT=8731;window.INITIAL_PRIMARY_IP="${candidate.ip}";window.INITIAL_OTHER_IPS=[];window.INITIAL_PHONE_URL=${JSON.stringify(PHONE)};</script>`;
    await route.fulfill({ body: html.replace('</head>', globals + '</head>'), contentType: 'text/html' });
  });
  await page.goto('/static/panel/index.html');
}

const clipboard = page => page.evaluate(() => navigator.clipboard.readText());

test('a click on the QR address copies it', async ({ page }) => {
  await open(page);
  await expect(page.locator('#url-perf')).toContainText('192.168.100.200');
  await page.locator('#url-perf').click();
  expect(await clipboard(page)).toBe((await page.locator('#url-perf').textContent()).trim());
  await expect(page.locator('#url-perf')).toHaveClass(/copied/);
});

test('a click on the admin link copies its address', async ({ page }) => {
  await open(page);
  await expect(page.locator('#link-admin')).toHaveAttribute('href', ADMIN);
  const popup = page.waitForEvent('popup').catch(() => null);
  await page.locator('#link-admin').click();
  expect(await clipboard(page)).toBe(ADMIN);
  const opened = await popup;
  if (opened) await opened.close();
});

test('the certificate address copies with one click and CERT names the local CA', async ({ page }) => {
  await open(page);
  await page.locator('.tab-btn[data-tab="network"]').click();
  await expect(page.locator('#net-cert-url')).toHaveText(CERT);
  await page.locator('#net-cert-url').click();
  expect(await clipboard(page)).toBe(CERT);
  await expect(page.locator('#mode-cert')).toHaveText('Local CA');
});
