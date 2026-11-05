// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8'), context);
  return context.RcSurfaceNetwork;
}

// The Main selector needs a document: a <select>, the field that holds it and
// the line that says why. This is the little of the DOM the module touches.
function fakeNode() {
  const listeners = new Map();
  const classes = new Set();
  return {
    dataset: {},
    value: '',
    textContent: '',
    addEventListener: (name, fn) => { listeners.set(name, fn); },
    dispatch: (name) => { const fn = listeners.get(name); if (fn) fn(); },
    replaceChildren: () => {},
    classList: { toggle: (name, force) => { if (force) classes.add(name); else classes.delete(name); } },
  };
}

/** The module with a fake document and a clock the test controls. */
function loadPanel() {
  const clock = { now: 1_700_000_000_000 };
  class FakeDate extends Date { static now() { return clock.now; } }
  const select = fakeNode();
  const nodes = {
    'network-address': select,
    'network-address-field': fakeNode(),
    'network-reason': fakeNode(),
  };
  const context = {
    Date: FakeDate,
    document: { getElementById: id => nodes[id] ?? null, createElement: () => fakeNode() },
  };
  vm.runInNewContext(fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8'), context);
  return { network: context.RcSurfaceNetwork, select, clock };
}

const network = load();
const plain = value => JSON.parse(JSON.stringify(value));
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);
const row = (ip, overrides = {}) => ({
  id: `Ethernet|${ip}/24`, ip, interfaceName: 'Ethernet', kind: 'ethernet', gateway: null, defaultRoute: false,
  proven: false, provenUntil: null, level: 5, linkLocal: false, public: false, reasons: ['no-gateway'], ...overrides,
});
const wired = row('192.168.100.200', { gateway: '192.168.100.1', defaultRoute: true, level: 3, reasons: ['default-route', 'gateway'] });
const lumikit = row('192.168.0.10');
const hyperV = row('172.18.96.1', { id: 'vEthernet (Default Switch)|172.18.96.0/20', interfaceName: 'vEthernet (Default Switch)', kind: 'virtual', level: 7, reasons: ['no-gateway', 'virtual'] });
const view = (overrides = {}) => ({ mode: 'auto', pinnedId: null, pinMissing: false, ambiguous: false, needsPublicChoice: false, certificatePending: false, certificateFailed: false, candidates: [wired, lumikit, hyperV], ...overrides });
const base = (overrides = {}, netOverrides = {}) => ({
  isRunning: true, httpsPort: 8731, useHttps: true, primaryIp: '192.168.100.200', otherIps: ['192.168.0.10'],
  phoneUrl: 'https://192.168.100.200:8731/?token=x&lang=en', certificatePending: false, search: null, check: null,
  network: view(netOverrides), ...overrides,
});
const search = (overrides = {}) => ({ state: 'running', ip: '192.168.0.10', position: 2, total: 2, deadline: 61_000, skipped: [], phoneUrl: 'https://192.168.0.10:8731/?token=x&lang=en', ...overrides });
const keys = model => model.why.map(part => part.key);

test('the tab and the Main panel read one description of each state', () => {
  const cases = [
    ['stopped', base({ isRunning: false, phoneUrl: null, primaryIp: '' }), ['start'], null],
    ['https-off', base({ httpsPort: null, phoneUrl: null }), [], null],
    ['no-network', base({ primaryIp: '', phoneUrl: null, otherIps: [] }, { candidates: [] }), [], null],
    ['public-only', base({ primaryIp: '', phoneUrl: null, otherIps: [] }, { needsPublicChoice: true, candidates: [row('25.1.1.1', { public: true, level: 8 })] }), [], null],
    ['preparing', base({ primaryIp: '', phoneUrl: null, certificatePending: true }, { certificatePending: true }), [], null],
    ['certificate-failed', base({ primaryIp: '', phoneUrl: null }, { certificateFailed: true }), ['find'], null],
    ['automatic', base(), ['find'], base().phoneUrl],
    ['ambiguous', base({}, { ambiguous: true }), ['find'], base().phoneUrl],
    ['pinned', base({}, { mode: 'pinned', pinnedId: wired.id }), ['auto'], base().phoneUrl],
    ['pin-missing', base({}, { pinnedId: 'Wi-Fi|10.0.0.0/24', pinMissing: true }), ['auto'], base().phoneUrl],
    ['search', base({ search: search() }), ['stop', 'next'], search().phoneUrl],
    ['arrived', base({ search: search({ state: 'arrived' }) }), ['stop', 'next'], search().phoneUrl],
    ['search', base({ search: search({ state: 'preparing', phoneUrl: null }) }), ['stop', 'next'], null],
    ['exhausted', base({ search: search({ state: 'exhausted', phoneUrl: null }) }), ['retry'], base().phoneUrl],
    ['automatic', base({ search: search({ state: 'proved', phoneUrl: null }) }), ['find'], base().phoneUrl],
  ];
  for (const [state, info, actions, qr] of cases) {
    const model = network.describeNetwork(info, { now: 50_000 });
    assert.equal(model.state, state);
    assert.deepEqual(plain(model.actions), actions, state);
    assert.equal(model.qr, qr, state);
  }
});

test('every state says its address, or says why there is none', () => {
  const say = (info) => network.describeNetwork(info, { now: 50_000 });
  assert.equal(say(base()).ip, '192.168.100.200');
  assert.equal(say(base()).off, false);
  assert.equal(say(base({ isRunning: false, phoneUrl: null, primaryIp: '' })).off, true);
  assert.equal(say(base({ primaryIp: '', phoneUrl: null, otherIps: [] }, { candidates: [] })).ipKey, 'panel.net.noNetwork');
  assert.equal(say(base({ primaryIp: '', phoneUrl: null, otherIps: [] }, { needsPublicChoice: true, candidates: [row('25.1.1.1', { public: true, level: 8 })] })).ipKey, 'panel.net.noQr');
  const preparing = say(base({ primaryIp: '', phoneUrl: null, certificatePending: true }, { certificatePending: true }));
  assert.equal(preparing.ip, '192.168.100.200');
  assert.equal(preparing.off, true);
  assert.equal(say(base({ search: search() })).ip, '192.168.0.10');
});

test('the why text names the reason of each state', () => {
  const say = info => keys(network.describeNetwork(info, { now: 50_000 }));
  assert.ok(say(base()).includes('panel.net.auto'));
  assert.ok(say(base({}, { ambiguous: true })).includes('panel.net.ambiguous'));
  assert.ok(say(base({}, { mode: 'pinned', pinnedId: wired.id })).includes('panel.net.pinned'));
  assert.ok(say(base({ httpsPort: null, phoneUrl: null })).includes('panel.net.httpsOff'));
  assert.ok(say(base({ search: search({ state: 'exhausted', phoneUrl: null }) })).includes('panel.net.exhausted'));
  assert.ok(say(base({ search: search({ state: 'arrived' }) })).includes('panel.net.arrived'));
  const pinMissing = network.describeNetwork(base({}, { pinnedId: 'Wi-Fi|10.0.0.0/24', pinMissing: true }), { now: 0 });
  const missing = pinMissing.why.find(part => part.key === 'panel.net.pinMissing');
  assert.equal(missing.params.network, 'Wi-Fi 10.0.0.0/24');
  const running = network.describeNetwork(base({ search: search() }), { now: 50_000 });
  assert.deepEqual(plain(running.why[0].params), { position: 2, total: 2 });
});

test('a public address in use carries the same warning everywhere', () => {
  const open = row('25.1.1.1', { public: true, level: 1, reasons: ['pinned', 'public'] });
  const info = base({ primaryIp: '25.1.1.1' }, { mode: 'pinned', pinnedId: open.id, candidates: [open, wired] });
  assert.ok(keys(network.describeNetwork(info, { now: 0 })).includes('panel.net.publicWarning'));
  assert.ok(network.reasonLine(info, t).includes('panel.net.publicWarning'));
});

test('the note gives the seconds left, the proof date and a phone on the line', () => {
  const left = network.describeNetwork(base({ search: search({ deadline: 61_000 }) }), { now: 50_000 });
  assert.equal(left.note.key, 'panel.net.nextIn');
  assert.equal(left.note.params.seconds, 11);
  const paused = network.describeNetwork(base({ search: search({ state: 'arrived', deadline: 95_000 }) }), { now: 50_000 });
  assert.equal(paused.note.key, 'panel.net.pausedFor');
  assert.equal(paused.note.params.seconds, 45);
  const late = network.describeNetwork(base({ search: search({ deadline: 40_000 }) }), { now: 50_000 });
  assert.equal(late.note.params.seconds, 0);
  assert.equal(network.describeNetwork(base(), { now: 0, connected: true }).note.key, 'panel.net.phoneConnected');
  const proven = row('192.168.100.200', { proven: true, provenUntil: 2_000_000_000_000, level: 2, reasons: ['proven', 'gateway'] });
  const model = network.describeNetwork(base({}, { candidates: [proven, lumikit] }), { now: 0 });
  assert.ok(keys(model).includes('panel.net.provenUntil'));
  assert.ok(model.why.find(part => part.key === 'panel.net.provenUntil').params.date);
});

test('the proof date follows the language of the panel', () => {
  const context = { RcSurfaceI18n: { getLocale: () => 'pt-BR' } };
  vm.runInNewContext(fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8'), context);
  const until = Date.UTC(2026, 10, 29, 12);
  const proven = row('192.168.100.200', { proven: true, provenUntil: until, level: 2, reasons: ['proven', 'gateway'] });
  const model = context.RcSurfaceNetwork.describeNetwork(base({}, { candidates: [proven, lumikit] }), { now: 0 });
  assert.equal(model.why.find(part => part.key === 'panel.net.provenUntil').params.date, '29/11');
});

test('a skipped candidate is named during the search', () => {
  const model = network.describeNetwork(base({ search: search({ skipped: ['192.168.0.10'] }) }), { now: 50_000 });
  assert.ok(model.why.some(part => part.key === 'panel.net.skipped' && part.params.list === '192.168.0.10'));
});

test('the rows follow the published address, and the candidate during a search', () => {
  const rows = network.describeRows(base(), t);
  assert.deepEqual(plain(rows.map(entry => [entry.ip, entry.selected, entry.action, entry.dim])), [
    ['192.168.100.200', true, 'in-use', false],
    ['192.168.0.10', false, 'use', false],
    ['172.18.96.1', false, 'use', true],
  ]);
  const during = network.describeRows(base({ search: search() }), t);
  assert.deepEqual(plain(during.map(entry => [entry.selected, entry.action])), [[false, 'use'], [true, 'testing'], [false, 'use']]);
});

test('a row reads as interface, route and reach', () => {
  assert.equal(network.rowDetail(wired, t), 'Ethernet · panel.net.reason.gateway{"ip":"192.168.100.1"} · panel.net.reason.default-route');
  assert.equal(network.rowDetail(lumikit, t), 'Ethernet · panel.net.reason.no-gateway');
  assert.equal(network.rowDetail(row('10.0.0.2', { reasons: ['route-unchecked'] }), t), 'Ethernet · panel.net.reason.route-unchecked');
  assert.equal(network.rowDetail(hyperV, t), 'vEthernet (Default Switch) · panel.net.reason.no-gateway · panel.net.reason.virtual');
  assert.equal(plain(network.describeRows(base(), t)[0]).kindKey, 'panel.net.kind.ethernet');
});

test('the Main selector offers Automatic plus every candidate, and only with two addresses', () => {
  const options = network.selectorOptions(base());
  assert.deepEqual(plain(options.map(option => option.value)), ['auto', wired.id, lumikit.id, hyperV.id]);
  assert.equal(options[0].labelKey, 'panel.net.automatic');
  assert.equal(options[1].label, '192.168.100.200 · Ethernet');
  assert.equal(network.selectorOptions(base({}, { candidates: [wired] })).length, 0);
  assert.equal(network.selectorOptions(base({ isRunning: false })).length, 0);
  assert.equal(network.selectorOptions({ isRunning: true }).length, 0);
});

test('a public address warns in the Main selector before anyone picks it', () => {
  const open = row('25.1.1.1', { public: true, level: 8, reasons: ['public'] });
  const options = network.selectorOptions(base({}, { candidates: [wired, open] }));
  assert.equal(options[1].warnKey, undefined);
  assert.equal(options[2].warnKey, 'panel.net.publicWarning');
});

test('the selector shows the stored choice and sends a real one', () => {
  assert.equal(network.selectedValue(base()), 'auto');
  assert.equal(network.selectedValue(base({}, { mode: 'pinned', pinnedId: lumikit.id })), lumikit.id);
  assert.equal(network.selectedValue(base({}, { pinnedId: 'Wi-Fi|10.0.0.0/24', pinMissing: true })), 'auto');
  assert.deepEqual(plain(network.choiceFor('auto')), { mode: 'auto' });
  assert.deepEqual(plain(network.choiceFor(lumikit.id)), { mode: 'pinned', id: lumikit.id });
});

test('the reason line is the one sentence the tab shows', () => {
  assert.equal(network.reasonLine(base(), t), 'panel.net.auto Ethernet · panel.net.reason.gateway{"ip":"192.168.100.1"} · panel.net.reason.default-route');
  assert.equal(network.reasonLine(base({ isRunning: false, phoneUrl: null }), t), '');
  assert.equal(network.reasonLine(base({ primaryIp: '', phoneUrl: null, otherIps: [] }, { candidates: [] }), t), 'panel.net.whyNoNetwork');
});

test('the selector keeps the choice the user just made until the machine answers', () => {
  const { network, select } = loadPanel();
  const chosen = [];
  const choose = (choice) => { chosen.push(choice); };
  network.render(base(), choose, t);
  assert.equal(select.value, 'auto', 'the selector shows what the machine published');

  // The user picks another address; the machine has not answered yet.
  select.value = lumikit.id;
  select.dispatch('change');
  assert.deepEqual(plain(chosen.at(-1)), { mode: 'pinned', id: lumikit.id });

  // The refresh every 3 s still carries the old answer: the choice must not
  // jump back before the machine has answered it.
  network.render(base(), choose, t);
  assert.equal(select.value, lumikit.id, 'REGRESSION: the refresh threw the choice away');

  // The machine answers: the choice is published, and the pending mark is gone.
  network.render(base({}, { mode: 'pinned', pinnedId: lumikit.id }), choose, t);
  assert.equal(select.value, lumikit.id);
  assert.equal(select.dataset.pending, undefined);
});

test('a choice the machine never answers goes away after ten seconds', () => {
  const { network, select, clock } = loadPanel();
  const choose = () => {};
  network.render(base(), choose, t);
  select.value = lumikit.id;
  select.dispatch('change');

  clock.now += 9000;
  network.render(base(), choose, t);
  assert.equal(select.value, lumikit.id, 'the choice is still waiting for an answer');

  clock.now += 2000;
  network.render(base(), choose, t);
  assert.equal(select.value, 'auto', 'an unanswered choice goes back to what the machine says');
  assert.equal(select.dataset.pending, undefined);
});

test('an old server without network data draws the old way', () => {
  const info = { isRunning: true, httpsPort: 8731, primaryIp: '192.168.1.50', otherIps: [], phoneUrl: 'https://192.168.1.50:8731/' };
  const model = network.describeNetwork(info, { now: 0 });
  assert.equal(model.state, 'automatic');
  assert.equal(model.qr, info.phoneUrl);
  assert.equal(network.describeRows(info, t).length, 0);
});

test('every text the panel asks for exists in the catalog in both languages', () => {
  const source = fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('./network-tab.js', import.meta.url), 'utf8');
  const catalog = fs.readFileSync(new URL('../shared/i18n-catalog.js', import.meta.url), 'utf8');
  // Keys built from a code end at their family; the families are checked below.
  const families = /^panel\.net\.(reason|kind|action|status|profile|diag(\.[a-z-]+)?)$/;
  const asked = [...new Set(source.match(/panel\.net\.[a-zA-Z.-]+[a-zA-Z]/g))].filter(key => !families.test(key));
  assert.ok(asked.length > 25);
  for (const key of asked) {
    const line = catalog.split('\n').find(text => text.includes(`'${key}':`));
    assert.ok(line, `missing ${key}`);
  }
  for (const reason of ['default-route', 'gateway', 'no-gateway', 'route-unchecked', 'virtual', 'vpn', 'hotspot', 'link-local', 'public']) {
    assert.ok(catalog.includes(`'panel.net.reason.${reason}':`), reason);
  }
  for (const kind of ['ethernet', 'wifi', 'virtual', 'vpn', 'hotspot', 'other']) {
    assert.ok(catalog.includes(`'panel.net.kind.${kind}':`), kind);
  }
  for (const action of ['find', 'stop', 'next', 'auto', 'retry', 'start']) {
    assert.ok(catalog.includes(`'panel.net.action.${action}':`), action);
  }
  for (const status of ['ok', 'warn', 'unknown']) assert.ok(catalog.includes(`'panel.net.status.${status}':`), status);
  for (const profile of ['Private', 'Public', 'Domain']) assert.ok(catalog.includes(`'panel.net.profile.${profile}':`), profile);
  for (const diag of ['server.ok', 'server.warn', 'certificate.ok', 'certificate.warn', 'certificate.unknown',
    'firewall.ok', 'firewall.okPlain', 'firewall.no-rule', 'firewall.blocked', 'firewall.block-all', 'firewall.unknown', 'third-party-firewall.warn']) {
    assert.ok(catalog.includes(`'panel.net.diag.${diag}':`), diag);
  }
});
