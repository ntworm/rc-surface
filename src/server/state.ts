// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import * as http from "node:http";
import * as https from "node:https";
import { type AddressInfo } from "node:net";
import { loadCerts, useHttps, httpsOptions } from "./cert.js";
import { handleHttp } from "./http.js";
import { handleUpgrade, wssInit, stopAllWsClients } from "./ws.js";
import { regenerateTokens } from "./session-auth.js";
import { getLanAddresses } from "../util/helpers.js";

export { useHttps } from "./cert.js";

/**
 * Deterministic default listen port.
 *
 * This MUST NOT be 0 (OS-assigned). A random port changes on every extension
 * start, which strands every already-open phone page: the page keeps retrying
 * the old, dead port and shows "RETRY 30s" forever while camera and microphone
 * — both browser-local — continue to look healthy. Binding a stable port lets a
 * page that was open before the restart reconnect on its own.
 *
 * If a sibling extension (e.g. RC Setlist) already owns it, startup falls back
 * to an OS-assigned port rather than failing.
 */
export const DEFAULT_PREFERRED_PORT = 8730;

export let actualPort: number | null = null;
export let actualHttpsPort: number | null = null;
export let serverInstance: http.Server | null = null;
export let httpsServerInstance: https.Server | null = null;

let serverGeneration = 0;
let startingServer: Promise<void> | null = null;
let stoppingServer: Promise<void> | null = null;

/** Capture before delayed autostart work; every Stop invalidates that intent. */
export function getServerGeneration(): number { return serverGeneration; }

export function setActualPort(p: number | null) { actualPort = p; }
export function setActualHttpsPort(p: number | null) { actualHttpsPort = p; }

interface ListenableServer {
  listen(port: number, hostname: string): unknown;
  once(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
  once(event: "listening", listener: () => void): unknown;
  off(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
  off(event: "listening", listener: () => void): unknown;
  address(): AddressInfo | string | null;
}

/**
 * Auxiliary helper to bind a server to a preferred port or fallback to a random port
 * if the address is already in use (EADDRINUSE).
 *
 * Behaviour:
 *   1. Try to bind on `preferredPort`.
 *   2. On EADDRINUSE + `fallbackOnAddrInUse`, immediately re-bind on port 0
 *      (OS-assigned) and resolve with the chosen port. Any other error rejects.
 *   3. After bind succeeds, `cleanup()` detaches the helper's own
 *      once-listeners, but the caller is responsible for re-installing
 *      any *persistent* "error" listener on the server. The helper does
 *      not leave a permanent error listener behind, so an emitter
 *      closure that fires on later runtime errors would be invisible.
 *      The startup function (`startServer`) installs its own `handleError`
 *      after the helper returns to make that visible.
 */
export function listenOnPreferredOrRandom(
  srv: ListenableServer,
  preferredPort: number,
  host: string,
  fallbackOnAddrInUse = false,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let fallbackTried = false;

    const cleanup = () => {
      srv.off("error", onError);
      srv.off("listening", onListening);
    };

    const onListening = () => {
      cleanup();
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("server.address() returned null"));
        return;
      }
      resolve(addr.port);
    };

    const onError = (err: NodeJS.ErrnoException) => {
      if (fallbackOnAddrInUse && err.code === "EADDRINUSE" && !fallbackTried) {
        fallbackTried = true;
        cleanup();
        // Re-arm listeners for the fallback listen attempt so the helper
        // can still resolve / reject on its outcome. Without this, a
        // second error on the fallback bind would be silently swallowed
        // by the original once-listeners (already consumed above).
        srv.once("error", onError);
        srv.once("listening", onListening);
        srv.listen(0, host);
        return;
      }
      cleanup();
      reject(err);
    };

    srv.once("error", onError);
    srv.once("listening", onListening);
    srv.listen(preferredPort, host);
  });
}

export async function startServer(): Promise<void> {
  const generation = serverGeneration;
  if (stoppingServer) {
    await stoppingServer;
    // Another Stop may also cancel a Start queued behind socket cleanup.
    if (generation !== serverGeneration) return;
  }
  if (startingServer) return startingServer;
  if (serverInstance !== null) {
    console.log("[ableton-rc-surface] startServer: already running");
    return;
  }
  const starting = initializeServer(generation);
  startingServer = starting;
  try {
    await starting;
  } finally {
    if (startingServer === starting) startingServer = null;
  }
}

async function closeServer(srv: http.Server | https.Server | null): Promise<void> {
  if (!srv) return;
  // Stop accepting first, then evict keep-alive connections. Node also invokes
  // the callback for an unbound server, which startup cleanup can own.
  await new Promise<void>((resolve) => {
    srv.close(() => resolve());
    srv.closeAllConnections?.();
  });
}

async function initializeServer(generation: number): Promise<void> {
  await loadCerts();
  if (generation !== serverGeneration) return;
  // A stopped server is a closed security session. Rotate before opening the
  // next listener so URLs, cookies, and still-open pages from the prior run
  // become stale even when Live reuses this module instance.
  regenerateTokens();

  let srv: http.Server | null = null;
  let httpsSrv: https.Server | null = null;
  let published = false;
  try {
    srv = http.createServer(async (req, res) => {
      try {
        await handleHttp(req, res);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[ableton-rc-surface] http error: ${detail}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`server error: ${detail}\n`);
        }
      }
    });

    if (useHttps && httpsOptions) {
      httpsSrv = https.createServer(httpsOptions, async (req, res) => {
        try {
          await handleHttp(req, res);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error(`[ableton-rc-surface] https error: ${detail}`);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(`server error: ${detail}\n`);
          }
        }
      });
    }

    wssInit();

    srv.on("upgrade", (req, socket, head) => handleUpgrade(req, socket, head));
    if (httpsSrv) {
      httpsSrv.on("upgrade", (req, socket, head) => handleUpgrade(req, socket, head));
    }

    // An obsolete listener must never clear a newer session's state.
    const handleRuntimeError = (err: Error) => {
      console.error(`[ableton-rc-surface] server runtime error: ${err.message}`);
      if (generation !== serverGeneration) return;
      void stopServer().catch((error) => console.error("[ableton-rc-surface] runtime cleanup failed", error));
    };

    // Honor RC_SURFACE_PORT when set; otherwise claim the deterministic default
    // so the port survives an Ableton restart and open phone pages reconnect by
    // themselves. Both paths fall back to an OS-assigned port on EADDRINUSE.
    const envPortRaw = process.env.RC_SURFACE_PORT;
    const envPort = envPortRaw ? Number(envPortRaw) : NaN;
    const preferredPort = Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_PREFERRED_PORT;

    // Await each bind sequentially so any failure throws and is visible
    // to the caller (showPanelDialog) — no more silent rejections from
    // nested .then() chains that aren't wired to the outer Promise.
    const port = await listenOnPreferredOrRandom(srv, preferredPort, "127.0.0.1", true);
    srv.on("error", handleRuntimeError);
    if (generation !== serverGeneration) return;

    let httpsPort: number | null = null;
    if (httpsSrv) {
      const targetHttpsPort = port + 1;
      try {
        httpsPort = await listenOnPreferredOrRandom(httpsSrv, targetHttpsPort, "0.0.0.0", true);
        httpsSrv.on("error", handleRuntimeError);
      } catch (httpsErr) {
        // HTTPS bind failed: continue HTTP-only. Log but don't abort.
        const detail = httpsErr instanceof Error ? httpsErr.message : String(httpsErr);
        console.warn(`[ableton-rc-surface] HTTPS bind failed (HTTP-only mode): ${detail}`);
        await closeServer(httpsSrv);
        httpsSrv = null;
      }
    }

    if (generation !== serverGeneration) return;
    actualPort = port;
    actualHttpsPort = httpsPort;
    serverInstance = srv;
    httpsServerInstance = httpsSrv;
    published = true;
    printListenInfo();
  } finally {
    // Until publication this invocation owns its sockets, including a bind
    // that completed after Stop. Stop awaits this cleanup before a new Start.
    if (!published) {
      stopAllWsClients();
      await Promise.all([closeServer(srv), closeServer(httpsSrv)]);
    }
  }

  function printListenInfo(): void {
    const ips = getLanAddresses();
    console.log(`[ableton-rc-surface] HTTP listening on http://127.0.0.1:${actualPort}`);
    if (actualHttpsPort) {
      console.log(`[ableton-rc-surface] HTTPS listening on https://0.0.0.0:${actualHttpsPort}`);
    }
    console.log(`[ableton-rc-surface]   Local Mappings URL: http://127.0.0.1:${actualPort}/static/admin/mappings.html`);
    for (const ip of ips) {
      if (actualHttpsPort) {
        console.log(`[ableton-rc-surface]   LAN phone URL: https://${ip}:${actualHttpsPort}/`);
      } else {
        console.warn(`[ableton-rc-surface]   LAN phone unavailable: HTTPS did not start (${ip})`);
      }
    }
  }
}


export async function stopServer(): Promise<void> {
  serverGeneration++;
  if (stoppingServer) return stoppingServer;
  const starting = startingServer;
  const srv = serverInstance;
  const httpsSrv = httpsServerInstance;
  if (!srv && !httpsSrv && !starting) return;
  serverInstance = null;
  httpsServerInstance = null;
  actualPort = null;
  actualHttpsPort = null;

  stopAllWsClients();

  const stopping = Promise.all([
    closeServer(srv), closeServer(httpsSrv),
    // The Start caller still receives initialization errors. Stop only waits
    // for the failed/cancelled attempt to release its resources.
    starting?.catch(() => {}),
  ]).then(() => {});
  stoppingServer = stopping;
  try {
    await stopping;
  } finally {
    if (stoppingServer === stopping) stoppingServer = null;
  }
  console.log("[ableton-rc-surface] server stopped");
}
