// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(new URL('./network-address.js', import.meta.url), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(new URL('./network-tab.js', import.meta.url), 'utf8'), context);
  return context.RcSurfaceNetworkTab;
}

function rig(reply = {}) {
  const state = { sent: [], timers: [], infos: [], reply: { search: null, ...reply } };
  const poller = load().createPoller({
    send: (cmd, args, callback) => { state.sent.push(cmd); callback({ ok: true, result: state.reply }); },
    onInfo: info => state.infos.push(info),
    setTimer: (fn, ms) => { const timer = { fn, ms }; state.timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; },
  });
  const armed = () => state.timers.filter(timer => !timer.cleared && !timer.fired);
  const fire = () => { const [timer] = armed(); timer.fired = true; timer.fn(); };
  return { poller, state, armed, fire };
}

const count = (state, cmd) => state.sent.filter(name => name === cmd).length;
const running = { search: { state: 'running' } };

test('a hidden tab sends nothing', () => {
  const { poller, state, armed } = rig();
  poller.setRunning(true);
  assert.deepEqual(state.sent, []);
  assert.equal(armed().length, 0);
  assert.ok(poller);
});

test('a stopped server gets no command, even with the tab open', () => {
  const { poller, state, armed } = rig();
  poller.setVisible(true);
  poller.setRunning(false);
  assert.deepEqual(state.sent, []);
  assert.equal(armed().length, 0);
});

test('the tab reads every 3 s and every 1 s during a search', () => {
  const { poller, state, armed, fire } = rig();
  poller.setRunning(true);
  poller.setVisible(true);
  assert.equal(count(state, 'getNetworkInfo'), 1);
  assert.equal(armed()[0].ms, 3000);
  state.reply = running;
  fire();
  assert.equal(count(state, 'getNetworkInfo'), 2);
  assert.equal(armed()[0].ms, 1000);
  state.reply = { search: { state: 'exhausted' } };
  fire();
  assert.equal(armed()[0].ms, 3000);
  assert.equal(armed().length, 1);
});

test('hiding the tab stops the reading at once', () => {
  const { poller, state, armed } = rig();
  poller.setRunning(true);
  poller.setVisible(true);
  const sent = state.sent.length;
  poller.setVisible(false);
  assert.equal(armed().length, 0);
  assert.equal(state.sent.length, sent);
});

test('opening the tab runs one check, and only a new opening runs another', () => {
  const { poller, state, fire } = rig();
  poller.setRunning(true);
  poller.setVisible(true);
  fire();
  fire();
  assert.equal(count(state, 'runNetworkCheck'), 1);
  poller.setVisible(false);
  poller.setVisible(true);
  assert.equal(count(state, 'runNetworkCheck'), 2);
});

test('a search that ends empty runs one more check', () => {
  const { poller, state, fire } = rig();
  poller.setRunning(true);
  poller.setVisible(true);
  state.reply = running;
  fire();
  state.reply = { search: { state: 'exhausted' } };
  fire();
  fire();
  assert.equal(count(state, 'runNetworkCheck'), 2);
});

test('a command refreshes the tab right away', () => {
  const { poller, state, armed } = rig();
  poller.setRunning(true);
  poller.setVisible(true);
  state.reply = running;
  poller.run('startNetworkSearch');
  assert.equal(count(state, 'startNetworkSearch'), 1);
  assert.equal(state.infos.at(-1).search.state, 'running');
  assert.equal(armed().length, 1);
  assert.equal(armed()[0].ms, 1000);
});

test('a reading that gets no answer keeps the clock running', () => {
  const state = { sent: [], timers: [] };
  const poller = load().createPoller({
    send: cmd => { state.sent.push(cmd); },
    onInfo: () => {},
    setTimer: (fn, ms) => { const timer = { fn, ms }; state.timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; },
  });
  poller.setRunning(true);
  poller.setVisible(true);
  const armed = () => state.timers.filter(timer => !timer.cleared && !timer.fired);
  assert.equal(armed().length, 1);
  const [first] = armed();
  first.fired = true;
  first.fn();
  assert.equal(armed().length, 1);
  assert.equal(state.sent.filter(cmd => cmd === 'getNetworkInfo').length, 2);
});

test('a failed reading keeps the last info and keeps polling', () => {
  const { poller, state, armed } = rig();
  poller.setRunning(true);
  const failing = load().createPoller({
    send: (cmd, args, callback) => { state.sent.push(cmd); callback({ ok: false }); },
    onInfo: info => state.infos.push(info),
    setTimer: (fn, ms) => { const timer = { fn, ms }; state.timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; },
  });
  failing.setRunning(true);
  failing.setVisible(true);
  assert.equal(state.infos.length, 0);
  assert.equal(armed().length, 1);
});
