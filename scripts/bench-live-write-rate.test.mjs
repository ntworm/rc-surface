// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";

import { WebSocketServer } from "ws";

import {
  parseArgs,
  buildMatrix,
  formatRow,
  formatTable,
  defaultJsonPath,
  connectAdmin,
} from "./bench-live-write-rate.mjs";

test("parseArgs extracts all CLI flags with correct defaults", () => {
  const args = parseArgs([
    "--port", "59065",
    "--token", "deadbeef0123",
    "--track", "0",
    "--device", "1",
    "--param", "2",
    "--seconds", "5",
    "--matrix",
  ]);
  assert.equal(args.host, "127.0.0.1");
  assert.equal(args.port, 59065);
  assert.equal(args.token, "deadbeef0123");
  assert.equal(args.track, 0);
  assert.equal(args.device, 1);
  assert.equal(args.param, 2);
  assert.equal(args.seconds, 5);
  assert.equal(args.matrix, true);
  assert.equal(args.secure, true);
  assert.equal(args.help, false);
});

test("parseArgs honors --insecure, --host, --json and --list", () => {
  const args = parseArgs([
    "--port", "59065",
    "--token", "deadbeef0123",
    "--host", "192.168.100.2",
    "--insecure",
    "--list",
    "--json", "/tmp/bench.json",
  ]);
  assert.equal(args.host, "192.168.100.2");
  assert.equal(args.secure, false);
  assert.equal(args.list, true);
  assert.equal(args.json, "/tmp/bench.json");
});

test("parseArgs sets help=true for --help or -h", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["--port", "1"]).help, false);
});

test("buildMatrix returns single + parallel 2/4/8 stairs cells when --matrix is set", () => {
  const cells = buildMatrix({ matrix: true, pattern: "stairs", seconds: 10 });
  assert.equal(cells.length, 4);
  assert.equal(cells[0].mode, "single");
  assert.equal(cells[0].pattern, "stairs");
  assert.equal(cells[1].mode, "parallel");
  assert.equal(cells[1].parallel, 2);
  assert.equal(cells[1].intervalMs, 5);
  assert.equal(cells[2].parallel, 4);
  assert.equal(cells[3].parallel, 8);
  for (const cell of cells) assert.equal(cell.pattern, "stairs");
});

test("buildMatrix returns one single-cell entry when --matrix is not set", () => {
  const cells = buildMatrix({ matrix: false, mode: "single", pattern: "stairs", seconds: 5 });
  assert.equal(cells.length, 1);
  assert.equal(cells[0].mode, "single");
  assert.equal(cells[0].pattern, "stairs");
});

test("formatRow produces a stable aligned row with all numeric columns padded", () => {
  const result = {
    mode: "single",
    parallel: 1,
    pattern: "stairs",
    started: 65,
    completed: 65,
    failed: 0,
    skipped: 0,
    ratePerSecond: 65.1,
    meanMs: 15.2,
    p95Ms: 16.1,
    maxMs: 17.3,
  };
  const row = formatRow({ label: "single-stairs" }, result);
  assert.match(row, /single-stairs\s+single\s+single\s+stairs\s+65\s+65\s+0\s+0\s+65\.1\s+15\.20\s+16\.10\s+17\.30/);
});

test("formatTable joins header + separator + rows with newlines", () => {
  const results = [
    {
      cell: { label: "single-stairs" },
      result: { mode: "single", parallel: 1, pattern: "stairs", started: 65, completed: 65, failed: 0, skipped: 0, ratePerSecond: 65.1, meanMs: 15.2, p95Ms: 16.1, maxMs: 17.3 },
    },
    {
      cell: { label: "parallel-4-stairs" },
      result: { mode: "parallel", parallel: 4, pattern: "stairs", started: 200, completed: 200, failed: 0, skipped: 0, ratePerSecond: 200.1, meanMs: 14.8, p95Ms: 15.6, maxMs: 18.0 },
    },
  ];
  const table = formatTable(results);
  const lines = table.split("\n");
  assert.equal(lines.length, 4); // header + sep + 2 rows
  assert.match(lines[0], /cell\s+mode\s+parallel\s+pattern/);
  assert.match(lines[2], /single-stairs/);
  assert.match(lines[3], /parallel-4-stairs/);
});

test("defaultJsonPath writes under test-results/write-ceiling/ with an ISO timestamp", () => {
  const path = defaultJsonPath("2026-09-17T00-00-00-000Z");
  assert.equal(path, "test-results/write-ceiling/bench-2026-09-17T00-00-00-000Z.json");
});

test("connectAdmin sends string ids, which is the only id shape the server echoes back", async () => {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const seen = [];
  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      seen.push(msg);
      // Mirror src/server/ws.ts dispatch: a non-string id is dropped.
      const id = typeof msg.id === "string" ? msg.id : undefined;
      socket.send(JSON.stringify({ id, ok: true, result: { echoed: msg.cmd } }));
    });
  });
  await new Promise((resolve) => wss.once("listening", resolve));
  const { port } = wss.address();
  const client = await connectAdmin({ host: "127.0.0.1", port, token: "deadbeef0123", secure: false });
  try {
    const result = await Promise.race([
      client.send("getState", {}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("reply never matched the request id")), 2000)),
    ]);
    assert.deepEqual(result, { echoed: "getState" });
    assert.equal(typeof seen[0].id, "string");
  } finally {
    client.close();
    await new Promise((resolve) => wss.close(resolve));
  }
});
