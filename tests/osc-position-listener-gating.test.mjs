// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// AbletonOSC's current_song_time listener pushes every playhead change, about
// a hundred messages a second while Live plays, and its generic property
// handler logs each one on Live's main thread (93 % of a four-hour Log.txt on
// a MacBook Air). The beat listener sends one message per beat and logs
// nothing per tick. Only Launch Clip needs a playhead fresher than the 500 ms
// position recovery of pollTick (clip-launch.ts, SONG_TIME_FRESH_MS = 300), so
// the position listener now exists only while Launch Clip is active.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OSCTransport } from '../src/live/osc-transport.ts';

const LISTEN_SONG_TIME = '/live/song/start_listen/current_song_time';
const UNLISTEN_SONG_TIME = '/live/song/stop_listen/current_song_time';
const LISTEN_BEAT = '/live/song/start_listen/beat';
const GET_SONG_TIME = '/live/song/get/current_song_time';

function recordingTransport() {
  const transport = new OSCTransport();
  const sent = [];
  transport.send = (address) => { sent.push(address); transport.expectReply(address); };
  return { transport, sent };
}

test('without Launch Clip the listener set keeps beat and leaves the playhead out', () => {
  const { transport, sent } = recordingTransport();
  transport.registerListeners();
  assert.ok(sent.includes(LISTEN_BEAT), 'the beat listener stays');
  assert.ok(!sent.includes(LISTEN_SONG_TIME), 'no per-tick playhead push without a consumer that needs it');
});

test('turning Launch Clip on asks for the playhead listener and re-registration keeps it', () => {
  const { transport, sent } = recordingTransport();
  transport.setClipLaunchActive(true);
  assert.ok(sent.includes(LISTEN_SONG_TIME), 'Launch Clip needs a playhead fresher than 300 ms');
  sent.length = 0;
  transport.registerListeners();
  assert.ok(sent.includes(LISTEN_SONG_TIME));
  assert.ok(sent.includes(LISTEN_BEAT));
});

test('turning Launch Clip off stops the playhead listener and later registrations leave it out', () => {
  const { transport, sent } = recordingTransport();
  transport.setClipLaunchActive(true);
  sent.length = 0;
  transport.setClipLaunchActive(false);
  assert.ok(sent.includes(UNLISTEN_SONG_TIME), 'AbletonOSC keeps a listener until told to stop');
  sent.length = 0;
  transport.registerListeners();
  assert.ok(!sent.includes(LISTEN_SONG_TIME));
});

test('a playing set with only beat pushes still gets its position every 500 ms', (t) => {
  const { transport, sent } = recordingTransport();
  t.mock.timers.enable({ apis: ['Date'], now: 50_000 });
  const push = (address, value) => transport.handleIncoming({ oscType: 'message', address, args: [{ value }] });
  transport.state.isPlaying = true;
  push(GET_SONG_TIME, 0);
  for (let elapsed = 500; elapsed <= 8000; elapsed += 500) {
    t.mock.timers.setTime(50_000 + elapsed);
    // 140 BPM: a beat push lands inside every 500 ms turn.
    push('/live/song/get/beat', Math.floor(elapsed / 428));
    sent.length = 0;
    transport.pollTick(Date.now());
    assert.ok(sent.includes(GET_SONG_TIME), `position read at ${elapsed} ms`);
    t.mock.timers.setTime(50_020 + elapsed);
    push(GET_SONG_TIME, elapsed / 428);
    push('/live/song/get/is_playing', 1);
    assert.equal(transport.lastSongTimeUpdateAt, Date.now(), 'the reply refreshes the clock');
  }
});

test('a stopped transport with Launch Clip off never registers the playhead listener', () => {
  const { transport, sent } = recordingTransport();
  transport.setClipLaunchActive(true);
  transport.dispose();
  sent.length = 0;
  transport.registerListeners();
  assert.ok(!sent.includes(LISTEN_SONG_TIME), 'a new session starts without Launch Clip');
});
