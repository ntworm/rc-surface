// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const row = (ip, overrides = {}) => ({
  id: `Ethernet|${ip}/24`, ip, interfaceName: 'Ethernet', kind: 'ethernet', gateway: null, defaultRoute: false,
  proven: false, provenUntil: null, level: 5, linkLocal: false, public: false, reasons: ['no-gateway'], ...overrides,
});
const wired = row('192.168.100.200', { gateway: '192.168.100.1', defaultRoute: true, level: 3, reasons: ['default-route', 'gateway'] });
const lumikit = row('192.168.0.10');
const hyperV = row('172.18.96.1', { interfaceName: 'vEthernet', kind: 'virtual', level: 7, reasons: ['no-gateway', 'virtual'] });
const phoneUrl = ip => `https://${ip}:8731/?token=fixture&lang=en`;
const view = (overrides = {}) => ({ mode: 'auto', pinnedId: null, pinMissing: false, ambiguous: false, needsPublicChoice: false, certificatePending: false, certificateFailed: false, candidates: [wired, lumikit, hyperV], ...overrides });
const info = (overrides = {}, net = {}) => ({
  isRunning: true, port: 9880, httpsPort: 8731, useHttps: true, statusText: 'Running', primaryIp: wired.ip, otherIps: [lumikit.ip],
  phoneUrl: phoneUrl(wired.ip), adminUrl: 'http://127.0.0.1:9880/static/admin/?token=admin-fixture', certificatePending: false,
  search: null, check: null, network: view(net), ...overrides,
});
const search = overrides => ({ state: 'running', ip: lumikit.ip, position: 2, total: 2, deadline: Date.now() + 18_000, skipped: [], phoneUrl: phoneUrl(lumikit.ip), ...overrides });
const NETWORK_COMMANDS = ['getNetworkInfo', 'setNetworkChoice', 'runNetworkCheck', 'startNetworkSearch', 'stopNetworkSearch', 'nextNetworkAddress'];

async function open(page, first, { locale } = {}) {
  const fixture = { current: first, sent: [], locale: locale ?? 'en' };
  const pinned = id => {
    const chosen = fixture.current.network.candidates.find(candidate => candidate.id === id);
    fixture.current = info({ primaryIp: chosen.ip, otherIps: [], phoneUrl: phoneUrl(chosen.ip) }, { mode: 'pinned', pinnedId: id });
  };
  await page.routeWebSocket('**/admin/ws*', socket => socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (!message.cmd) return;
    fixture.sent.push(message.cmd);
    if (message.cmd === 'setNetworkChoice') {
      if (message.args?.mode === 'pinned') pinned(message.args.id);
      else fixture.current = info();
    }
    if (message.cmd === 'getLocale') socket.send(JSON.stringify({ id: message.id, ok: true, result: { locale: fixture.locale } }));
    else socket.send(JSON.stringify({ id: message.id, ok: true, result: ['getServerInfo', ...NETWORK_COMMANDS].includes(message.cmd) ? fixture.current : {} }));
  }));
  await page.route('**/static/panel/index.html*', async route => {
    const html = await fs.readFile('static/panel/index.html', 'utf8');
    const start = fixture.current;
    const globals = `<script>window.INITIAL_IS_RUNNING=${start.isRunning};window.INITIAL_PORT=9880;window.INITIAL_HTTPS_PORT=8731;window.INITIAL_PRIMARY_IP=${JSON.stringify(start.primaryIp)};window.INITIAL_OTHER_IPS=[];window.INITIAL_PHONE_URL=${JSON.stringify(start.phoneUrl)};</script>`;
    await route.fulfill({ body: html.replace('</head>', globals + '</head>'), contentType: 'text/html' });
  });
  await page.goto('/static/panel/index.html');
  return fixture;
}

const networkTab = page => page.locator('.tab-btn[data-tab="network"]');
const now = page => page.locator('#net-now');

for (const [locale, title] of [['en', 'Network'], ['pt-BR', 'Rede']]) {
  test(`the Network tab opens in ${locale} with no page error`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, info(), { locale });
    await expect(networkTab(page).locator('.tab-text')).toHaveText(title);
    await networkTab(page).click();
    await expect(page.locator('#tab-network')).toHaveClass(/active/);
    await expect(page.locator('#net-ip')).toHaveText(wired.ip);
    await expect(page.locator('#net-rows .net-row')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

test('USE changes the QR in both places and survives a reload', async ({ page }) => {
  await open(page, info());
  await networkTab(page).click();
  await page.locator('#net-rows .net-row', { hasText: lumikit.ip }).locator('button').click();
  await expect(page.locator('#net-ip')).toHaveText(lumikit.ip);
  await expect(page.locator('#net-qr')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip));
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip), { timeout: 7000 });
  await page.reload();
  await expect(page.locator('#network-address')).toHaveValue(lumikit.id);
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip));
});

test('the Main selector changes the QR in both places and goes back to Automatic', async ({ page }) => {
  const fixture = await open(page, info());
  const select = page.locator('#network-address');
  await expect(select).toBeVisible();
  await select.selectOption(lumikit.id);
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip));
  await networkTab(page).click();
  await expect(page.locator('#net-qr')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip));
  await page.locator('[data-tab="main"]').click();
  await select.selectOption('auto');
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(wired.ip));
  expect(fixture.sent.filter(cmd => cmd === 'setNetworkChoice')).toHaveLength(2);
});

test('the Main selector warns about a public address before it is picked', async ({ page }) => {
  const publicRow = row('25.1.1.1', { public: true, level: 8, reasons: ['public'] });
  await open(page, info({}, { candidates: [wired, publicRow] }));
  await expect(page.locator('#network-address option')).toHaveCount(3);
  const labels = await page.locator('#network-address option').allTextContents();
  expect(labels.filter(label => label.includes('Public address'))).toEqual(['25.1.1.1 · Ethernet · Public address: the QR carries the control password.']);
});

test('the selector stays hidden with fewer than two addresses', async ({ page }) => {
  await open(page, info({}, { candidates: [wired] }));
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(wired.ip));
  await expect(page.locator('#network-address')).toBeHidden();
});

const STATES = [
  ['no network', info({ primaryIp: '', phoneUrl: null, otherIps: [] }, { candidates: [] }), 'No network'],
  ['public only', info({ primaryIp: '', phoneUrl: null, otherIps: [] }, { needsPublicChoice: true, candidates: [row('25.1.1.1', { public: true, level: 8 })] }), 'No QR'],
  ['preparing certificate', info({ primaryIp: '', phoneUrl: null, certificatePending: true }, { certificatePending: true }), wired.ip],
  ['certificate failed', info({ primaryIp: '', phoneUrl: null }, { certificateFailed: true }), wired.ip],
  ['HTTPS unavailable', info({ httpsPort: null, phoneUrl: null }), '—'],
  ['automatic', info(), wired.ip],
  ['ambiguous', info({}, { ambiguous: true }), wired.ip],
  ['pinned', info({}, { mode: 'pinned', pinnedId: wired.id }), wired.ip],
  ['pin missing', info({}, { pinnedId: 'Wi-Fi|10.0.0.0/24', pinMissing: true }), wired.ip],
  ['search', info({ search: search() }), lumikit.ip],
  ['phone arrived', info({ search: search({ state: 'arrived' }) }), lumikit.ip],
  ['search over', info({ search: search({ state: 'exhausted', phoneUrl: null }) }), wired.ip],
];

for (const [name, state, text] of STATES) {
  test(`state: ${name}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, state);
    await networkTab(page).click();
    await expect(page.locator('#net-ip')).toHaveText(text);
    await expect(page.locator('#net-why')).not.toBeEmpty();
    await expect(page.locator('#net-why')).not.toContainText('panel.net');
    expect(errors).toEqual([]);
  });
}

test('a proven address shows its date and a phone on the line', async ({ page }) => {
  const proven = { ...wired, proven: true, provenUntil: Date.now() + 86_400_000, level: 2, reasons: ['proven', 'gateway'] };
  await open(page, info({}, { candidates: [proven, lumikit] }));
  await networkTab(page).click();
  await expect(page.locator('#net-why')).toContainText('Proven');
});

test('a stopped server asks for Start and sends no network command', async ({ page }) => {
  const stopped = info({ isRunning: false, port: null, phoneUrl: null, primaryIp: '' });
  const fixture = await open(page, stopped);
  await networkTab(page).click();
  await expect(now(page)).toContainText('Start the server');
  await page.waitForTimeout(3500);
  expect(fixture.sent.filter(cmd => NETWORK_COMMANDS.includes(cmd))).toEqual([]);
});

test('no network on Main is not the stopped-server notice', async ({ page }) => {
  await open(page, info({ primaryIp: '', phoneUrl: null, otherIps: [] }, { candidates: [] }));
  await expect(page.locator('#network-reason')).toContainText('No adapter');
  await expect(page.locator('#qr-placeholder')).not.toContainText('Start the server');
});

test('the search keeps the Main QR and shows the candidate QR in the tab', async ({ page }) => {
  await open(page, info({ search: search() }));
  await expect(page.locator('#qr-perf')).toHaveAttribute('data-qr-url', phoneUrl(wired.ip));
  await networkTab(page).click();
  await expect(page.locator('#net-qr')).toHaveAttribute('data-qr-url', phoneUrl(lumikit.ip));
  await expect(page.locator('#net-note')).toContainText('s');
});

test('the search buttons send their commands', async ({ page }) => {
  const fixture = await open(page, info());
  await networkTab(page).click();
  await page.locator('[data-net-action="find"]').click();
  await expect.poll(() => fixture.sent.includes('startNetworkSearch')).toBe(true);
  fixture.current = info({ search: search() });
  await page.locator('[data-net-action="next"]').click();
  await expect.poll(() => fixture.sent.includes('nextNetworkAddress')).toBe(true);
  await page.locator('[data-net-action="stop"]').click();
  await expect.poll(() => fixture.sent.includes('stopNetworkSearch')).toBe(true);
});

test('the buttons stay the same elements while the tab reads, so no click is lost', async ({ page }) => {
  const check = { at: 1, address: wired.ip, items: [{ id: 'firewall', status: 'warn', reason: 'no-rule', profile: 'Public', command: 'New-NetFirewallRule' }] };
  await open(page, info({ search: search(), check }));
  await networkTab(page).click();
  const stop = page.locator('[data-net-action="stop"]');
  const copy = page.locator('#net-diag .btn');
  await stop.evaluate(node => { node.dataset.kept = '1'; });
  await copy.evaluate(node => { node.dataset.kept = '1'; });
  await page.waitForTimeout(2300);
  await expect(stop).toHaveAttribute('data-kept', '1');
  await expect(copy).toHaveAttribute('data-kept', '1');
});

test('a phone update that changes nothing does not redraw the tab', async ({ page }) => {
  await open(page, info());
  await networkTab(page).click();
  const find = page.locator('[data-net-action="find"]');
  await find.evaluate(node => { node.dataset.kept = '1'; });
  await page.evaluate(() => { for (let index = 0; index < 50; index += 1) window.RcSurfaceNetworkTab.setConnected(false); });
  await expect(find).toHaveAttribute('data-kept', '1');
  await page.evaluate(() => window.RcSurfaceNetworkTab.setConnected(true));
  await expect(page.locator('#net-note')).toContainText('Phone connected');
});

test('opening the tab runs the diagnosis, and a firewall finding gives the command to copy', async ({ page }) => {
  const command = 'New-NetFirewallRule -DisplayName "RC Surface" -Direction Inbound -Action Allow -Protocol TCP -Program "C:\\Live\\node.exe" -Profile Public';
  const check = { at: 1, address: wired.ip, items: [
    { id: 'server', status: 'ok' }, { id: 'certificate', status: 'ok' },
    { id: 'firewall', status: 'warn', reason: 'no-rule', profile: 'Public', command },
    { id: 'third-party-firewall', status: 'warn', products: ['Kaspersky'] },
  ] };
  const fixture = await open(page, info({ check }));
  await networkTab(page).click();
  await expect.poll(() => fixture.sent.includes('runNetworkCheck')).toBe(true);
  await expect(page.locator('#net-diag')).toContainText('Kaspersky');
  await expect(page.locator('#net-diag code')).toHaveText(command);
});

test('a check not done reads as not checked, never as OK', async ({ page }) => {
  const check = { at: 1, address: wired.ip, items: [{ id: 'firewall', status: 'unknown', reason: 'not-checked' }] };
  await open(page, info({ check }));
  await networkTab(page).click();
  await expect(page.locator('#net-diag')).toContainText('Not checked');
  await expect(page.locator('#net-diag .ok')).toHaveCount(0);
});

test('changing the language draws the tab again', async ({ page }) => {
  await open(page, info());
  await networkTab(page).click();
  await expect(page.locator('#net-why')).toContainText('Automatic');
  await page.locator('[data-set-locale="pt-BR"]').click();
  await expect(page.locator('#net-why')).toContainText('Automático');
});
