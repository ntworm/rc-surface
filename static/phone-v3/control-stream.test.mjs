import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  let time = 0;
  let timerId = 0;
  const timers = new Map();
  const sent = [];
  const socket = { readyState: 1, bufferedAmount: 0, send: raw => sent.push(JSON.parse(raw)), close() { this.readyState = 3; } };
  let connection = { socket, clientId: 'a', enabled: true };
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('./control-stream.js', import.meta.url), 'utf8'), context);
  const stream = context.window.RcControlStream.create({
    getConnection: () => connection, now: () => time,
    setTimer(fn, ms) { const id = ++timerId; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  const tick = ms => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  };
  return { stream, socket, sent, tick, timers, reconnect(next) { connection = next; } };
}

test('first gesture sends now; sustained XY sends latest every 8ms, including its final value', () => {
  const f = fixture();
  f.stream.push({ name: 'xy-1', x: 0, y: 1 });
  assert.equal(f.sent.length, 1);
  for (let i = 1; i <= 23; i++) {
    f.tick(1); f.stream.push({ name: 'xy-1', x: i / 23, y: 1 - i / 23 });
  }
  assert.equal(f.sent.length, 3, 'must stream during gesture, not debounce until stop');
  f.tick(1);
  assert.deepEqual(f.sent.at(-1).controls, [{ name: 'xy-1', x: 1, y: 0 }]);
  assert.equal(f.timers.size, 0);
});

test('all continuous sources share the frame budget, with no axis/channel starvation', () => {
  const f = fixture();
  for (let i = 0; i < 1000; i++) {
    for (const name of ['knob-1', 'fader-8', 'sensor.motion.ax', 'sensor.audio.transient']) {
      f.stream.push({ name, value: i / 999 });
    }
    f.tick(1);
  }
  f.tick(8);
  assert.ok(f.sent.length <= 127, `shared controls/audio budget: ${f.sent.length}`);
  assert.equal(f.sent.at(-1).controls.length, 4);
  assert.ok(f.sent.at(-1).controls.every(c => c.value === 1));
});

test('pad press/release survive inside one interval; repeated identical heartbeats do not flood', () => {
  const f = fixture();
  for (const value of [1, 1, 0, 0, 1, 0]) f.stream.push({ name: 'pad-1', value });
  f.tick(8);
  assert.deepEqual(f.sent.flatMap(m => m.controls.map(c => c.value)), [1, 0, 1, 0]);
});

test('backpressure retains only fresh continuous positions; expired moves never replay', () => {
  const f = fixture(); f.socket.bufferedAmount = 1;
  f.stream.push({ name: 'fader-1', value: 0.1 });
  f.tick(8); f.stream.push({ name: 'fader-1', value: 0.9 });
  f.socket.bufferedAmount = 0; f.tick(8);
  assert.deepEqual(f.sent[0].controls, [{ name: 'fader-1', value: 0.9 }]);
  f.socket.bufferedAmount = 1; f.stream.push({ name: 'fader-1', value: 0.2 });
  f.tick(200); f.socket.bufferedAmount = 0; f.tick(8);
  assert.equal(f.sent.length, 1);
  assert.equal(f.timers.size, 0);
});

test('reconnect and remote updates discard pending values, never echoing or replaying', () => {
  const f = fixture();
  f.stream.push({ name: 'xy-1', x: 0, y: 0 });
  f.stream.push({ name: 'xy-1', x: 1, y: 1 });
  f.stream.discard('xy-1.x'); f.tick(8);
  assert.equal(f.sent.length, 1);
  f.stream.push({ name: 'fader-1', value: 0.2 });
  f.stream.push({ name: 'fader-1', value: 0.9 });
  f.reconnect({ socket: { ...f.socket }, clientId: 'b', enabled: true });
  f.tick(8);
  assert.equal(f.sent.length, 2);
});

test('old hosts keep the legacy snapshot path; malformed frames never reach the wire', () => {
  const f = fixture();
  f.reconnect({ socket: f.socket, clientId: 'a', enabled: false });
  assert.equal(f.stream.push({ name: 'fader-1', value: 1 }), false);
  assert.equal(f.stream.isActive(), false);
  f.reconnect({ socket: f.socket, clientId: 'a', enabled: true });
  for (const control of [{ name: 'x', value: Infinity }, { name: 'x', x: 1 }, { name: 'x', value: 2 }]) f.stream.push(control);
  assert.equal(f.sent.length, 0);
});

test('a descriptor measurement is published atomically and equal sensor samples keep filters progressing', () => {
  const f = fixture();
  const publish = () => f.stream.batch(() => {
    for (const name of ['sensor.audio.transient', 'sensor.audio.kick', 'sensor.audio.snare', 'sensor.audio.brightness']) f.stream.push({ name, value: 0.5 });
  });
  publish();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].controls.length, 4);
  f.tick(8); publish();
  assert.equal(f.sent.length, 2, 'equal measurements are new samples, not duplicate edges');
});

test('congested/overflowing discrete events close for host safe loss rather than replay stale presses', () => {
  const f = fixture(); f.socket.bufferedAmount = 1;
  f.stream.push({ name: 'pad-1', value: 1 });
  f.stream.push({ name: 'pad-1', value: 0 });
  f.tick(128);
  assert.equal(f.socket.readyState, 3);
  assert.equal(f.sent.length, 0);
  assert.equal(f.timers.size, 0);
  const flood = fixture(); flood.socket.bufferedAmount = 1;
  for (let i = 0; i < 140; i++) flood.stream.push({ name: 'pad-1', value: i % 2 });
  assert.equal(flood.socket.readyState, 3);
});
