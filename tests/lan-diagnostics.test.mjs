// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWindowsFirewall, parseMacFirewall, runNetworkCheck, WINDOWS_FIREWALL_SCRIPT } from '../src/server/lan-diagnostics.ts';

const exe = 'C:\\ProgramData\\Ableton\\Live 12 Beta\\Program\\ExtensionHost\\node.exe';
const report = overrides => JSON.stringify({ profile: 'Private', rules: [{ action: 'Allow', profiles: 'Private, Public' }], products: [], ...overrides });
const item = (items, id) => items.find(entry => entry.id === id);

test('Windows: an allow rule on the current profile is OK', () => {
  const items = evaluateWindowsFirewall(report({}), exe);
  assert.equal(item(items, 'firewall').status, 'ok');
  assert.equal(item(items, 'firewall').profile, 'Private');
  assert.equal(items.length, 1);
});

test('Windows: no rule for the current profile warns and gives the command to copy', () => {
  const items = evaluateWindowsFirewall(report({ profile: 'Public', rules: [{ action: 'Allow', profiles: 'Private' }] }), exe);
  assert.equal(item(items, 'firewall').status, 'warn');
  assert.equal(item(items, 'firewall').reason, 'no-rule');
  assert.ok(item(items, 'firewall').command.includes(`"${exe}"`));
  assert.ok(item(items, 'firewall').command.startsWith('New-NetFirewallRule'));
});

test('Windows: a block rule wins over an allow rule', () => {
  const items = evaluateWindowsFirewall(report({ rules: [{ action: 'Allow', profiles: 'Any' }, { action: 'Block', profiles: 'Private' }] }), exe);
  assert.equal(item(items, 'firewall').status, 'warn');
  assert.equal(item(items, 'firewall').reason, 'blocked');
});

test('Windows: Any and DomainAuthenticated are understood', () => {
  assert.equal(item(evaluateWindowsFirewall(report({ rules: [{ action: 'Allow', profiles: 'Any' }] }), exe), 'firewall').status, 'ok');
  assert.equal(item(evaluateWindowsFirewall(report({ profile: 'DomainAuthenticated', rules: [{ action: 'Allow', profiles: 'Domain' }] }), exe), 'firewall').status, 'ok');
});

test('Windows: a third party firewall is named only when enabled', () => {
  const items = evaluateWindowsFirewall(report({ products: [{ name: 'Kaspersky', state: 0x41000 }, { name: 'Kaspersky', state: 0x40000 }, { name: 'Windows Defender Firewall', state: 0x41000 }] }), exe);
  const third = item(items, 'third-party-firewall');
  assert.equal(third.status, 'warn');
  assert.deepEqual([...third.products], ['Kaspersky']);
  assert.equal(evaluateWindowsFirewall(report({ products: [{ name: 'Kaspersky', state: 0x40000 }] }), exe).length, 1);
});

test('Windows: a missing profile or an unreadable report is not checked, never OK', () => {
  assert.equal(item(evaluateWindowsFirewall(report({ profile: null }), exe), 'firewall').status, 'unknown');
  for (const bad of ['', 'not json', '[]', 'null']) {
    assert.equal(item(evaluateWindowsFirewall(bad, exe), 'firewall').status, 'unknown');
  }
});

test('the PowerShell body is fixed text and takes its values from the environment', () => {
  assert.match(WINDOWS_FIREWALL_SCRIPT, /\$env:RC_SURFACE_EXE/);
  assert.match(WINDOWS_FIREWALL_SCRIPT, /\$env:RC_SURFACE_ADDRESS/);
  assert.doesNotMatch(WINDOWS_FIREWALL_SCRIPT, /Set-|New-|Remove-|Enable-|Disable-|Invoke-/);
});

test('runNetworkCheck on Windows passes hostile paths only through the environment', async () => {
  const hostile = 'C:\\x"; Remove-Item C:\\ -Recurse; $(calc)\\node.exe';
  const calls = [];
  const items = await runNetworkCheck({
    platform: 'win32', address: '192.168.100.200', httpsPort: 8731, execPath: hostile,
    readCertificate: async () => 'IP Address:192.168.100.200',
    run: async (file, args, options) => { calls.push({ file, args, options }); return report({}); },
  });
  assert.equal(calls[0].file, 'powershell');
  assert.deepEqual([...calls[0].args.slice(0, 3)], ['-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(calls[0].args[3], WINDOWS_FIREWALL_SCRIPT);
  assert.equal(calls[0].args.join(' ').includes('Remove-Item'), false);
  assert.equal(calls[0].options.env.RC_SURFACE_EXE, hostile);
  assert.equal(calls[0].options.env.RC_SURFACE_ADDRESS, '192.168.100.200');
  assert.equal(calls[0].options.timeout, 8000);
  assert.equal(calls[0].options.windowsHide, true);
  assert.ok(!calls[0].options.shell);
  assert.equal(item(items, 'server').status, 'ok');
  assert.equal(item(items, 'certificate').status, 'ok');
  assert.equal(item(items, 'firewall').status, 'ok');
});

test('macOS reads three argv calls and classifies them', async () => {
  assert.equal(parseMacFirewall({ global: 'Firewall is disabled. (State = 0)', blockAll: '', app: '' }).status, 'ok');
  assert.equal(parseMacFirewall({ global: 'Firewall is enabled. (State = 1)', blockAll: 'Block all DISABLED!', app: 'The application is permitted' }).status, 'ok');
  assert.equal(parseMacFirewall({ global: 'Firewall is enabled. (State = 1)', blockAll: 'Block all ENABLED!', app: '' }).reason, 'block-all');
  assert.equal(parseMacFirewall({ global: 'Firewall is enabled. (State = 1)', blockAll: 'Block all DISABLED!', app: 'The application is blocked from incoming' }).reason, 'blocked');
  assert.equal(parseMacFirewall({ global: 'something else', blockAll: '', app: '' }).status, 'unknown');
  const calls = [];
  const items = await runNetworkCheck({
    platform: 'darwin', address: '10.0.1.5', httpsPort: 8731, execPath: '/Apps/Live/node',
    readCertificate: async () => 'IP Address:10.0.1.5',
    run: async (file, args) => { calls.push([file, ...args]); return 'Firewall is disabled. (State = 0)'; },
  });
  assert.equal(calls[0][0], '/usr/libexec/ApplicationFirewall/socketfilterfw');
  assert.deepEqual(calls.map(call => call[1]), ['--getglobalstate', '--getblockall', '--getappblocked']);
  assert.equal(calls[2][2], '/Apps/Live/node');
  assert.equal(item(items, 'firewall').status, 'ok');
});

test('a failed or impossible command is not checked; server and certificate still report', async () => {
  for (const run of [async () => { throw new Error('ENOENT'); }, null]) {
    const items = await runNetworkCheck({ platform: 'win32', address: '192.168.100.200', httpsPort: 8731, execPath: exe, run,
      readCertificate: async () => 'IP Address:192.168.100.200' });
    assert.equal(item(items, 'firewall').status, 'unknown');
    assert.equal(item(items, 'server').status, 'ok');
    assert.equal(item(items, 'certificate').status, 'ok');
  }
});

test('the server item warns when HTTPS is off, and the rest is not checked', async () => {
  const items = await runNetworkCheck({ platform: 'win32', address: '192.168.100.200', httpsPort: null, execPath: exe, run: async () => report({}),
    readCertificate: async () => { throw new Error('no server'); } });
  assert.equal(item(items, 'server').status, 'warn');
  assert.equal(item(items, 'certificate').status, 'unknown');
});

test('a certificate that does not name the address warns; no address is not checked', async () => {
  const wrong = await runNetworkCheck({ platform: 'linux', address: '192.168.100.200', httpsPort: 8731, execPath: exe, run: null,
    readCertificate: async () => 'IP Address:10.0.0.1, IP Address:192.168.100.2000' });
  assert.equal(item(wrong, 'certificate').status, 'warn');
  const none = await runNetworkCheck({ platform: 'linux', address: '', httpsPort: 8731, execPath: exe, run: null,
    readCertificate: async () => '' });
  assert.equal(item(none, 'certificate').status, 'unknown');
  assert.equal(item(none, 'firewall').status, 'unknown');
});
