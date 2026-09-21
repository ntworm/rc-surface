// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { handleHttp } from "../src/server/http.ts";
import { sanitizeRequestUrl } from "../src/server/session-auth.ts";

async function serve(t) {
  const server = http.createServer(handleHttp);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("request logs redact percent-encoded credential keys without a URL global", (t) => {
  t.mock.property(globalThis, "URL", undefined);
  for (const key of ["token", "%74oken", "admin%54oken", "password", "controller_token"]) {
    assert.equal(sanitizeRequestUrl(`/diag?${key}=private-value&mode=test`),
      `/diag?${key}=[REDACTED]&mode=test`);
  }
  assert.equal(sanitizeRequestUrl("/diag?monkey=banana&%ZZ=x"), "/diag?monkey=banana&%ZZ=x");
  assert.equal(sanitizeRequestUrl(undefined), "/");
});

test("the diagnostic copy report omits page credentials but still probes with them", async (t) => {
  const base = await serve(t);
  const html = await (await fetch(`${base}/diag`)).text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = { out: {}, verdict: {} };
  const requested = [];
  const location = new URL(`${base}/diag?token=private-value#private-fragment`);
  class WebSocket {
    constructor(url) {
      requested.push(url);
      queueMicrotask(() => {
        this.onopen();
        this.onmessage({ data: JSON.stringify({ type: "hello", role: "controller", tokenStatus: "valid" }) });
      });
    }
    close() {}
  }
  await vm.runInNewContext(script, {
    location, URLSearchParams, WebSocket, setTimeout, clearTimeout,
    document: { getElementById: (id) => elements[id] },
    navigator: { onLine: true },
    fetch: async (url) => {
      requested.push(url);
      return { json: async () => ({ originCheck: { ok: true } }) };
    },
  });
  const report = JSON.parse(elements.out.textContent);
  assert.equal(report.pageUrl, `${base}/diag`);
  assert.doesNotMatch(elements.out.textContent, /private-value|private-fragment/);
  assert.equal(report.webSocketProbe.helloRole, "controller");
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.includes("token=private-value")));
});

test("forwarded WebView logs redact credentials from their page URL", async (t) => {
  const base = await serve(t);
  const messages = [];
  t.mock.method(console, "log", (...args) => messages.push(args.join(" ")));
  const response = await fetch(`${base}/log`, {
    method: "POST",
    body: JSON.stringify({ level: "log", parts: ["connection failed"], url: `${base}/phone?%74oken=private-value` }),
  });
  assert.equal(response.status, 204);
  const message = messages.find((entry) => entry.startsWith("[WebView"));
  assert.match(message, /connection failed/);
  assert.doesNotMatch(message, /private-value/);
});
