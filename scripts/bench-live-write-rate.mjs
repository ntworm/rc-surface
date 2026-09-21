// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// bench-live-write-rate — admin client for `benchDeviceParamWrites`.
//
// Usage:
//   node scripts/bench-live-write-rate.mjs --port <port> --token <admin-token> \
//     --track 0 --device 0 --param 0 --seconds 10
//   node scripts/bench-live-write-rate.mjs --port 59065 --token <hex> --track 0 --device 0 --param 0 --matrix
//   node scripts/bench-live-write-rate.mjs --port <port> --token <hex> --track 0 --device 0 --param 0 --list
//   node scripts/bench-live-write-rate.mjs --help
//
// Connects to the admin WebSocket endpoint and runs the live-write-ceiling
// bench on a real DeviceParameter. The matrix runner covers single-mode and
// parallel modes at 2/4/8 in-flight writes; each cell is reported with its
// started/completed/failed counts, mean/p95/max latency, and effective rate.

import { WebSocket } from "ws";
import { argv, exit } from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const HELP = `bench-live-write-rate — measure Live DeviceParameter.setValue write rate

Required:
  --port <n>           admin WS port (from getServerInfo)
  --token <hex>        admin token (from the panel ?token= query param)
  --track <n>          track index
  --device <n>         device index within the track
  --param <n>          parameter index within the device

Optional:
  --seconds <n>        seconds per cell (default 10, max 30)
  --matrix             run the full matrix (single + parallel 2/4/8, stairs)
  --list               call getDeviceParams and print the available parameters
  --host <ip>          WS host (default 127.0.0.1)
  --insecure           use ws:// instead of wss://
  --json <path>        write the JSON results to <path> (default test-results/write-ceiling/<timestamp>.json)
  --help, -h           print this help

Each --matrix cell is reported with started, completed, failed, skipped,
meanMs, p50Ms, p95Ms, maxMs, ratePerSecond.`;

export function parseArgs(argvList) {
  const args = {
    host: "127.0.0.1",
    port: null,
    token: null,
    secure: true,
    seconds: 10,
    matrix: false,
    list: false,
    help: false,
    track: null,
    device: null,
    param: null,
    json: null,
  };
  for (let i = 0; i < argvList.length; i += 1) {
    const a = argvList[i];
    const next = () => argvList[++i];
    if (a === "--host") args.host = next();
    else if (a === "--port") args.port = Number(next());
    else if (a === "--token") args.token = next();
    else if (a === "--insecure") args.secure = false;
    else if (a === "--seconds") args.seconds = Number(next());
    else if (a === "--matrix") args.matrix = true;
    else if (a === "--list") args.list = true;
    else if (a === "--track") args.track = Number(next());
    else if (a === "--device") args.device = Number(next());
    else if (a === "--param") args.param = Number(next());
    else if (a === "--json") args.json = next();
    else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

/** Build the matrix of cells to run. Exported for the test. */
export function buildMatrix({ matrix, mode, parallel, intervalMs, pattern, hz }) {
  const cells = [];
  if (matrix) {
    cells.push({ mode: "single", pattern: "stairs", label: "single-stairs" });
    cells.push({ mode: "parallel", parallel: 2, intervalMs: 5, pattern: "stairs", label: "parallel-2-stairs" });
    cells.push({ mode: "parallel", parallel: 4, intervalMs: 5, pattern: "stairs", label: "parallel-4-stairs" });
    cells.push({ mode: "parallel", parallel: 8, intervalMs: 5, pattern: "stairs", label: "parallel-8-stairs" });
    return cells;
  }
  cells.push({ mode: mode ?? "single", parallel, intervalMs, pattern: pattern ?? "stairs", hz, label: "single-cell" });
  return cells;
}

/** Format one row of the results table. Exported for the test. */
export function formatRow(cell, result) {
  const mode = result.mode;
  const parallel = result.parallel > 1 ? `parallel-${result.parallel}` : "single";
  const pattern = result.pattern;
  const started = String(result.started).padStart(6);
  const completed = String(result.completed).padStart(6);
  const failed = String(result.failed).padStart(4);
  const rate = result.ratePerSecond.toFixed(1).padStart(7);
  const mean = result.meanMs.toFixed(2).padStart(7);
  const p95 = result.p95Ms.toFixed(2).padStart(7);
  const max = result.maxMs.toFixed(2).padStart(7);
  const skipped = String(result.skipped).padStart(5);
  return `${cell.label.padEnd(20)} ${mode.padEnd(8)} ${parallel.padEnd(11)} ${pattern.padEnd(7)} ${started} ${completed} ${failed} ${skipped} ${rate} ${mean} ${p95} ${max}`;
}

/** Format the full results table. Exported for the test. */
export function formatTable(results) {
  const header = "cell                 mode     parallel     pattern started compl. fail skip   rate/s meanMs  p95Ms  maxMs";
  const sep = "-".repeat(header.length);
  const rows = results.map((r) => formatRow(r.cell, r.result));
  return [header, sep, ...rows].join("\n");
}

/** Connect to the admin WS and return a promise-based RPC client. */
export function connectAdmin({ host, port, token, secure }) {
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`--port must be a positive integer, got: ${String(port)}`);
  }
  if (typeof token !== "string" || token.length < 8) {
    throw new Error(`--token must be a hex string of at least 8 chars, got: ${String(token)}`);
  }
  const proto = secure ? "wss" : "ws";
  const url = `${proto}://${host}:${port}/admin/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url, { rejectUnauthorized: false });
  let nextId = 1;
  const pending = new Map();
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    ws.once("error", onError);
    ws.once("open", () => {
      ws.off("error", onError);
      const client = {
        send(cmd, args = {}) {
          // The server only echoes string ids (src/server/ws.ts dispatch);
          // a numeric id would come back undefined and never resolve.
          const id = `bench-${nextId++}`;
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, cmd, args }));
          });
        },
        close() { ws.close(); },
      };
      ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (msg && typeof msg.id === "string" && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.ok) entry.resolve(msg.result);
          else entry.reject(new Error(msg.error || `cmd ${msg.cmd} failed`));
        }
      });
      ws.on("error", (err) => {
        for (const entry of pending.values()) entry.reject(err);
        pending.clear();
      });
      resolve(client);
    });
  });
}

/** Build the default JSON output path under test-results/write-ceiling/. */
export function defaultJsonPath(timestamp) {
  return `test-results/write-ceiling/bench-${timestamp}.json`;
}

/** Ensure the parent directory of a file path exists. */
export function ensureDirForFile(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function isHelp(argvList) {
  return argvList.includes("--help") || argvList.includes("-h");
}

/**
 * Programmatic entry point used by the CLI and by the test. Runs the full
 * matrix (or the single cell) and returns the JSON-serializable results.
 */
export async function runBench(args) {
  if (isHelp([args.help])) {
    console.error(HELP);
    return { help: true };
  }
  const port = args.port;
  const token = args.token;
  const trackIndex = args.track;
  const deviceIndex = args.device;
  const paramIndex = args.param;
  if (args.list) {
    const client = await connectAdmin({ host: args.host, port, token, secure: args.secure });
    try {
      const result = await client.send("getDeviceParams", { trackIndex, deviceIndex });
      return { list: result };
    } finally { client.close(); }
  }
  const seconds = Math.min(30, Math.max(1, Math.floor(Number(args.seconds) || 10)));
  const cells = buildMatrix({
    matrix: !!args.matrix,
    mode: "single",
    parallel: undefined,
    intervalMs: undefined,
    pattern: "stairs",
    hz: undefined,
    seconds,
  });
  const client = await connectAdmin({ host: args.host, port, token, secure: args.secure });
  const results = [];
  try {
    for (const cell of cells) {
      const cmdArgs = {
        trackIndex,
        deviceIndex,
        paramIndex,
        seconds,
        mode: cell.mode,
        pattern: cell.pattern,
      };
      if (cell.mode === "parallel") {
        cmdArgs.parallel = cell.parallel;
        cmdArgs.intervalMs = cell.intervalMs;
      }
      const result = await client.send("benchDeviceParamWrites", cmdArgs);
      results.push({ cell: { label: cell.label, ...cell }, result });
    }
  } finally {
    client.close();
  }
  return { results };
}

async function main() {
  const args = parseArgs(argv);
  if (args.help) { console.error(HELP); exit(0); }
  if (!args.port || !args.token) {
    console.error("missing required args: --port and --token\n\n" + HELP);
    exit(2);
  }
  const out = await runBench(args);
  if (out.help) return;
  if (out.list) {
    console.log(JSON.stringify(out.list, null, 2));
    return;
  }
  console.log(formatTable(out.results));
  const jsonPath = args.json || defaultJsonPath(new Date().toISOString().replace(/[:.]/g, "-"));
  ensureDirForFile(jsonPath);
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.error(`\nJSON written to: ${jsonPath}`);
}

const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain) {
  main().catch((err) => {
    console.error("bench failed:", err.message);
    exit(1);
  });
}
