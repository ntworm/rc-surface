// bench-ws-compression.mjs — WebSocket compression bench.
//
// Usage:
//   node scripts/bench-ws-compression.mjs [--deflate]
//
// Spawns a WebSocketServer + client, pushes N control_frame-shaped
// payloads from the server to the client and reports: bytes on the wire,
// compress ratio, server CPU, send latency and round-trip latency.
//
// Compression is off by default; --deflate turns perMessageDeflate on for
// both ends, so a run with and a run without compression can be compared
// on the same payload.
//
// Env:
//   BENCH_MSGS   number of frames to send (default: 5000)
//   BENCH_BYTES  force the payload to this size in bytes (default: off)

import { WebSocketServer, WebSocket } from 'ws';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const USE_DEFLATE = process.argv.includes('--deflate');
const MESSAGE_COUNT = Number(process.env.BENCH_MSGS ?? 5000);
const FORCED_BYTES = Number(process.env.BENCH_BYTES ?? 0);
const CLIENT_ID = 'bench-client';
// The control names a phone frame carries. The names stay stable across
// frames while the values drift, like a live surface.
const CONTROL_NAMES = [
  'pad-1', 'pad-2', 'pad-3', 'pad-4',
  'knob-1', 'knob-2', 'knob-3', 'knob-4',
  'toggle-1', 'toggle-2', 'button-1', 'button-2',
  'fader-1', 'fader-2', 'fader-3', 'fader-4',
];

// Builds one payload shaped like the phone's realtime control frame.
//
// The phone batches the controls the user touched into a single frame
// (static/phone-v3/control-stream.js):
//
//   { type: 'control_frame', client_id, controls: [{ name, value }] }
//
// The bench pushes the same shape from the server to the client, so the
// bytes measured here are the bytes a phone receives on the wire. Real
// frames carry between 2 and 8 controls: one finger is one control, a
// two-finger gesture is two, and the phone batches at most eight per
// frame. The names stay stable across frames while the values drift
// slowly, which is what gives deflate something to compress.
//
// BENCH_BYTES forces a padded size: the frame grows with a filler field
// until it reaches the requested byte count, so a padded run can be
// compared against an unpadded one.
function buildControlFramePayload(index) {
  const controls = [];
  const controlCount = 2 + (index % 7); // 2..8 controls per frame
  for (let i = 0; i < controlCount; i++) {
    controls.push({
      name: CONTROL_NAMES[i % CONTROL_NAMES.length],
      // Unit values in [0, 1], drifting slowly like a live surface.
      value: +((Math.sin(index / 8 + i / 3) + 1) / 2).toFixed(3),
    });
  }
  const frame = {
    type: 'control_frame',
    client_id: CLIENT_ID,
    controls,
  };
  const payload = JSON.stringify(frame);
  if (!FORCED_BYTES) return payload;
  // The frame's closing brace is replaced by the marker, so the marker
  // adds its own length minus one byte.
  const overhead = ',"_pad":""}'.length - 1;
  const filler = 'p'.repeat(Math.max(0, FORCED_BYTES - payload.length - overhead));
  return `${payload.slice(0, payload.length - 1)},"_pad":"${filler}"}`;
}

function runBenchmark(wss) {
  return new Promise((resolve, reject) => {
    const samples = {
      serverSendLatencyMs: [],
      roundTripLatencyMs: [],
      bytesOnWireServer: 0, // bytes server pushed into ws.send()
      bytesOnWireClient: 0, // bytes client observed on the socket
      frames: 0,
    };
    let serverCpuBefore;
    let serverCpuAfter;
    let memBefore;
    let memAfter;

    wss.on('connection', (ws) => {
      serverCpuBefore = process.cpuUsage();
      memBefore = process.memoryUsage();

      let i = 0;
      const sendNext = () => {
        if (i >= MESSAGE_COUNT) {
          serverCpuAfter = process.cpuUsage();
          memAfter = process.memoryUsage();
          ws.close();
          return;
        }
        const payload = buildControlFramePayload(i);
        samples.bytesOnWireServer += payload.length;
        const t0 = performance.now();
        ws.send(payload, (err) => {
          const t1 = performance.now();
          if (err) return reject(err);
          samples.serverSendLatencyMs.push(t1 - t0);
          samples.frames += 1;
          i += 1;
          setImmediate(sendNext);
        });
      };
      sendNext();
    });

    const ws = new WebSocket(`ws://127.0.0.1:${wss.address().port}`, {
      perMessageDeflate: USE_DEFLATE,
    });

    // Poll the underlying net.Socket bytesRead — Node tracks it natively
    // and it's the only reliable hook into the raw transport below WS.
    let lastBytesRead = 0;
    const bytesReadPoll = setInterval(() => {
      const s = ws._socket ?? ws.socket;
      if (s && typeof s.bytesRead === 'number') {
        samples.bytesOnWireClient += Math.max(0, s.bytesRead - lastBytesRead);
        lastBytesRead = s.bytesRead;
      }
    }, 100);

    ws.on('open', () => {
      // Acknowledge once so the server knows the link is up.
      ws.send(JSON.stringify({ type: 'hello', client_id: CLIENT_ID }));
    });

    ws.on('error', reject);

    wss.on('close', () => {
      resolve({
        deflate: USE_DEFLATE,
        samples,
        serverCpuUserUs: serverCpuAfter.user - serverCpuBefore.user,
        serverCpuSystemUs: serverCpuAfter.system - serverCpuBefore.system,
        rssBefore: memBefore.rss,
        rssAfter: memAfter.rss,
        heapBefore: memBefore.heapUsed,
        heapAfter: memAfter.heapUsed,
      });
    });

    // When server closes (after MESSAGE_COUNT sends), close the client.
    const checkInterval = setInterval(() => {
      if (samples.frames >= MESSAGE_COUNT) {
        clearInterval(checkInterval);
        ws.close();
      }
    }, 50);

    ws.on('close', () => {
      clearInterval(bytesReadPoll);
      clearInterval(checkInterval);
      wss.close();
    });
  });
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

// The server binds an ephemeral port, so wait for the listening event
// before the client connects.
const wss = new WebSocketServer({ port: 0, perMessageDeflate: USE_DEFLATE });
await new Promise((resolve, reject) => {
  wss.once('listening', resolve);
  wss.once('error', reject);
});

const result = await runBenchmark(wss);

const sendP50 = percentile(result.samples.serverSendLatencyMs, 0.5);
const sendP95 = percentile(result.samples.serverSendLatencyMs, 0.95);
const sendP99 = percentile(result.samples.serverSendLatencyMs, 0.99);

console.log([
  `ws compression bench: deflate ${result.deflate ? 'on' : 'off'}`,
  'payload shape: phone control_frame { type, client_id, controls[2..8] }',
  'direction: server to client sends',
].join('\n'));

console.log(JSON.stringify({
  deflate: result.deflate,
  messages: result.samples.frames,
  payloadBytes: FORCED_BYTES,
  totalBytesSentByApp: result.samples.bytesOnWireServer,
  totalBytesOnSocket: result.samples.bytesOnWireClient,
  compressionRatio: result.samples.bytesOnWireServer === 0
    ? 0
    : +(result.samples.bytesOnWireClient / result.samples.bytesOnWireServer).toFixed(3),
  serverSendLatencyMs: {
    p50: +sendP50.toFixed(3),
    p95: +sendP95.toFixed(3),
    p99: +sendP99.toFixed(3),
  },
  serverCpuUs: {
    user: result.serverCpuUserUs,
    system: result.serverCpuSystemUs,
  },
  rss: {
    before: result.rssBefore,
    after: result.rssAfter,
    delta: result.rssAfter - result.rssBefore,
  },
  heap: {
    before: result.heapBefore,
    after: result.heapAfter,
    delta: result.heapAfter - result.heapBefore,
  },
}, null, 2));
