// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanSearch, CANDIDATE_WINDOW_MS, ARRIVAL_PAUSE_MS } from '../src/server/lan-search.ts';

const row = (ip, level, id = `Ethernet|${ip}`) => ({ id, ip, level, public: false });
const list = [row('192.168.100.200', 3), row('192.168.0.10', 5), row('192.168.137.1', 6)];

function harness({ candidates = list, covered = async () => true, ownAddresses = ['192.168.100.200', '192.168.0.10', '192.168.137.1', '172.18.96.1'] } = {}) {
  const clock = { now: 1000, timers: [] };
  const finished = [];
  const search = createLanSearch({
    now: () => clock.now,
    candidates: () => candidates,
    ownAddresses: () => ownAddresses,
    ensureCovered: covered,
    onChange: () => {},
    onFinish: outcome => finished.push(outcome),
    setTimer: (fn, ms) => { const t = { fn, at: clock.now + ms }; clock.timers.push(t); return t; },
    clearTimer: t => { t.cleared = true; },
  });
  const advance = async ms => {
    const end = clock.now + ms;
    for (;;) {
      const next = clock.timers.filter(t => !t.cleared && !t.fired && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      clock.now = next.at;
      next.fired = true;
      await next.fn();
    }
    clock.now = end;
  };
  return { search, clock, advance, finished };
}

test('the windows are 25 s and the pause is 45 s', () => {
  assert.equal(CANDIDATE_WINDOW_MS, 25_000);
  assert.equal(ARRIVAL_PAUSE_MS, 45_000);
});

test('walks levels 1 to 6 in order, 25 s each, and reports where it is', async () => {
  const { search, advance } = harness();
  await search.start();
  assert.deepEqual({ state: search.view().state, ip: search.view().ip, position: search.view().position, total: search.view().total, deadline: search.view().deadline },
    { state: 'running', ip: '192.168.100.200', position: 1, total: 3, deadline: 26_000 });
  await advance(25_000);
  assert.equal(search.view().ip, '192.168.0.10');
  assert.equal(search.view().position, 2);
  await advance(25_000);
  assert.equal(search.view().ip, '192.168.137.1');
});

test('virtual, VPN, link-local and public rows are never offered', async () => {
  const { search } = harness({ candidates: [row('10.0.0.2', 7), row('25.1.1.1', 8), row('192.168.0.10', 5)] });
  await search.start();
  assert.equal(search.view().total, 1);
  assert.equal(search.view().ip, '192.168.0.10');
});

test('ends exhausted after the last candidate and reports it', async () => {
  const { search, advance, finished } = harness({ candidates: [row('192.168.0.10', 5)] });
  await search.start();
  await advance(25_000);
  assert.equal(search.view().state, 'exhausted');
  assert.equal(search.active(), false);
  assert.deepEqual(finished, ['exhausted']);
});

test('nothing to offer ends exhausted at once', async () => {
  const { search, finished } = harness({ candidates: [] });
  await search.start();
  assert.equal(search.view().state, 'exhausted');
  assert.deepEqual(finished, ['exhausted']);
});

test('next skips at once and restarts the 25 s', async () => {
  const { search, advance, clock } = harness();
  await search.start();
  await advance(10_000);
  assert.equal(await search.next(), true);
  assert.equal(search.view().ip, '192.168.0.10');
  assert.equal(search.view().deadline, clock.now + 25_000);
  await advance(24_000);
  assert.equal(search.view().ip, '192.168.0.10');
});

test('next is refused outside a search', async () => {
  const { search, advance } = harness({ candidates: [row('192.168.0.10', 5)] });
  assert.equal(await search.next(), false);
  await search.start();
  await advance(25_000);
  assert.equal(await search.next(), false);
});

test('an outside TCP connection pauses 45 s once per candidate, many connections included', async () => {
  const { search, advance } = harness();
  await search.start();
  await advance(5_000);
  search.noteArrival('192.168.100.200', '::ffff:192.168.100.50');
  assert.equal(search.view().state, 'arrived');
  await advance(10_000);
  search.noteArrival('192.168.100.200', '192.168.100.50');
  search.noteArrival('192.168.100.200', '192.168.100.51');
  await advance(34_999);
  assert.equal(search.view().state, 'arrived');
  await advance(1);
  assert.equal(search.view().state, 'running');
  assert.equal(search.view().ip, '192.168.100.200');
  search.noteArrival('192.168.100.200', '192.168.100.50');
  assert.equal(search.view().state, 'running');
  await advance(20_000);
  assert.equal(search.view().ip, '192.168.0.10');
});

test('an arrival on an earlier address returns the QR to it', async () => {
  const { search, advance } = harness();
  await search.start();
  await advance(25_000);
  search.noteArrival('192.168.100.200', '192.168.100.50');
  assert.equal(search.view().state, 'arrived');
  assert.equal(search.view().ip, '192.168.100.200');
});

test('an arrival on an earlier address does not walk the list again', async () => {
  const { search, advance, clock } = harness();
  await search.start();
  await advance(30_000);
  assert.equal(search.view().ip, '192.168.0.10');
  search.noteArrival('192.168.100.200', '192.168.100.50');
  assert.equal(search.view().position, 1);
  await advance(45_000);
  assert.equal(search.view().state, 'running');
  assert.equal(search.view().ip, '192.168.0.10');
  assert.equal(search.view().position, 2);
  assert.equal(search.view().deadline, clock.now + 20_000);
  await advance(20_000);
  assert.equal(search.view().ip, '192.168.137.1');
  assert.equal(search.view().position, 3);
});

test('next during a pause on an earlier address moves on from the row under test', async () => {
  const { search, advance } = harness();
  await search.start();
  await advance(25_000);
  search.noteArrival('192.168.100.200', '192.168.100.50');
  assert.equal(await search.next(), true);
  assert.equal(search.view().ip, '192.168.137.1');
  assert.equal(search.view().position, 3);
});

test('a connection from this PC, loopback or an address outside the list changes nothing', async () => {
  const { search } = harness();
  await search.start();
  for (const [local, remote] of [['192.168.100.200', '192.168.100.200'], ['192.168.100.200', '192.168.0.10'], ['127.0.0.1', '127.0.0.1'], ['192.168.100.200', '::1'], ['172.18.96.1', '172.18.96.9'], [undefined, undefined]]) {
    search.noteArrival(local, remote);
  }
  assert.equal(search.view().state, 'running');
});

test('a proof finishes the search as proved, also during a pause', async () => {
  const { search, advance, finished } = harness();
  await search.start();
  search.noteArrival('192.168.100.200', '192.168.100.50');
  await advance(1000);
  search.noteProof('192.168.100.200');
  assert.equal(search.view().state, 'proved');
  assert.equal(search.active(), false);
  assert.deepEqual(finished, ['proved']);
  await advance(100_000);
  assert.equal(search.view().state, 'proved');
});

test('a candidate whose certificate cannot be issued is skipped and named', async () => {
  const { search } = harness({ covered: async ip => ip !== '192.168.100.200' });
  await search.start();
  assert.equal(search.view().ip, '192.168.0.10');
  assert.deepEqual([...search.view().skipped], ['192.168.100.200']);
  assert.equal(search.view().position, 2);
});

test('the QR of a candidate waits for its certificate', async () => {
  let release;
  const { search } = harness({ covered: () => new Promise(resolve => { release = resolve; }) });
  const starting = search.start();
  assert.equal(search.view().state, 'preparing');
  assert.equal(search.view().ip, '192.168.100.200');
  release(true);
  await starting;
  assert.equal(search.view().state, 'running');
});

test('stop cancels without a report and start begins again', async () => {
  const { search, advance, finished } = harness();
  await search.start();
  search.stop();
  assert.equal(search.view(), null);
  assert.equal(search.active(), false);
  await advance(100_000);
  assert.equal(search.view(), null);
  assert.deepEqual(finished, ['stopped']);
  await search.start();
  assert.equal(search.view().position, 1);
});

test('a stop during certificate work does not bring the search back', async () => {
  let release;
  const { search, finished, clock } = harness({ covered: () => new Promise(resolve => { release = resolve; }) });
  const starting = search.start();
  search.stop();
  release(true);
  await starting;
  assert.equal(search.view(), null);
  assert.equal(clock.timers.filter(t => !t.cleared).length, 0);
  assert.deepEqual(finished, ['stopped']);
});

test('a proof during certificate work is final', async () => {
  let release;
  const { search, finished } = harness({ covered: () => new Promise(resolve => { release = resolve; }) });
  const starting = search.start();
  search.noteProof('192.168.100.200');
  release(true);
  await starting;
  assert.equal(search.view().state, 'proved');
  assert.deepEqual(finished, ['proved']);
});

test('a stop after the search ended clears the report without a second finish', async () => {
  const { search, finished } = harness({ candidates: [] });
  await search.start();
  search.stop();
  assert.equal(search.view(), null);
  assert.deepEqual(finished, ['exhausted']);
});

test('next during a pause moves on and the moved candidate gets its own 25 s', async () => {
  const { search, clock } = harness();
  await search.start();
  search.noteArrival('192.168.100.200', '192.168.100.50');
  assert.equal(await search.next(), true);
  assert.equal(search.view().state, 'running');
  assert.equal(search.view().ip, '192.168.0.10');
  assert.equal(search.view().deadline, clock.now + 25_000);
});

test('the search is already over when onFinish runs', async () => {
  const seen = [];
  const search = createLanSearch({
    now: () => 0, candidates: () => [], ownAddresses: () => [], ensureCovered: async () => true,
    onChange: () => {}, onFinish: () => seen.push(search.active()),
    setTimer: () => 1, clearTimer: () => {},
  });
  await search.start();
  assert.deepEqual(seen, [false]);
});

test('the search keeps its frozen list even if the live list changes', async () => {
  const live = [...list];
  const { search, advance } = harness({ candidates: live });
  await search.start();
  live.length = 0;
  await advance(25_000);
  assert.equal(search.view().ip, '192.168.0.10');
  assert.equal(search.view().total, 3);
});
