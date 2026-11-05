// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Reading what the machine is really using to reach the outside world.
 *
 * Two signals, both best-effort: the route table, which names the gateways
 * the system would send traffic through, and a UDP connect, which tells
 * which local address the kernel would pick for it. Neither sends a packet.
 */

import { networkInterfaces } from "node:os";
import { createSocket, type Socket } from "node:dgram";
import type { LanInterfaceMap, LanSignals } from "./lan-candidates.js";

export type CommandRunner = (
  file: string,
  args: string[],
  options: {
    timeout: number;
    windowsHide: boolean;
    encoding: "latin1" | "utf8";
    env?: Record<string, string | undefined>;
  },
) => Promise<string>;

export interface RouteSignals {
  gateways: string[];
  routeChecked: boolean;
}

export interface LanWatcherDeps {
  readInterfaces?: () => LanInterfaceMap;
  probeUdp?: () => Promise<string | null>;
  readRoutes?: () => Promise<RouteSignals>;
  onUpdate: (update: { interfaces: LanInterfaceMap; signals: LanSignals }) => void;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export interface LanWatcher {
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  stop: () => void;
}

type TimerHandle = NodeJS.Timeout | number;

const TICK_INTERVAL_MS = 5000;
const ROUTE_TIMEOUT_MS = 2000;
const PROBE_TIMEOUT_MS = 1000;
const PROBE_PORT = 53;
const PROBE_TARGETS = ["8.8.8.8", "1.1.1.1"];

/** The gateway column of the Windows route table, once per gateway. */
export function parseWindowsRoutes(text: string): string[] {
  return gatewaysOf(text, fields => fields[0] === "0.0.0.0" && fields[1] === "0.0.0.0", 2);
}

/** The gateway of every default route on macOS, once per gateway. */
export function parseMacRoutes(text: string): string[] {
  return gatewaysOf(text, fields => fields[0] === "default", 1);
}

function gatewaysOf(text: string, isDefault: (fields: string[]) => boolean, column: number): string[] {
  const gateways: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const gateway = fields[column];
    if (!gateway || !isDefault(fields)) continue;
    if (!isDottedIpv4(gateway)) continue;
    if (!gateways.includes(gateway)) gateways.push(gateway);
  }
  return gateways;
}

export async function loadCommandRunner(): Promise<CommandRunner | null> {
  const childProcess = await loadChildProcess();
  if (!childProcess) return null;
  const execFile = childProcess.execFile;
  if (typeof execFile !== "function") return null;
  return (file, args, options) =>
    new Promise<string>((resolve, reject) => {
      execFile(file, args, { ...options, shell: false }, (error, stdout) => {
        if (error) reject(error);
        else resolve(String(stdout));
      });
    });
}

export async function readRouteGateways(
  options: { platform?: string; run?: CommandRunner | null } = {},
): Promise<RouteSignals> {
  const platform = options.platform ?? process.platform;
  const runner = options.run === undefined ? await loadCommandRunner() : options.run;
  if (!runner) return { gateways: [], routeChecked: false };
  try {
    if (platform === "win32") {
      const text = await runner("route", ["print", "-4"], routeOptions());
      return { gateways: parseWindowsRoutes(text), routeChecked: true };
    }
    if (platform === "darwin") {
      const text = await runner("netstat", ["-rn", "-f", "inet"], routeOptions());
      return { gateways: parseMacRoutes(text), routeChecked: true };
    }
  } catch {
    // A machine that will not talk about its routes has no routes to report.
  }
  return { gateways: [], routeChecked: false };
}

/** The address the kernel would send to the outside through. A UDP connect
 *  sends nothing, it only asks the routing table which local address wins. */
export async function probeDefaultRoute(): Promise<string | null> {
  for (const target of PROBE_TARGETS) {
    const address = await probeTarget(target);
    if (address) return address;
  }
  return null;
}

/** Watches the machine and reports every change worth telling the panel
 *  about. One changed reading is noise, so a change has to be read twice
 *  before the routes are read again and the panel is told. */
export function createLanWatcher(deps: LanWatcherDeps): LanWatcher {
  const readInterfaces = deps.readInterfaces ?? (() => networkInterfaces());
  const probeUdp = deps.probeUdp ?? probeDefaultRoute;
  const readRoutes = deps.readRoutes ?? readRouteGateways;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => {
    // The watcher must never keep the process alive on its own.
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return timer;
  });
  const clearTimer = deps.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle));
  const onUpdate = deps.onUpdate;
  let timer: TimerHandle | null = null;
  let stopped = false;
  let remembered: string | null = null;
  let candidate: string | null = null;

  async function start(): Promise<void> {
    stopped = false;
    await refresh();
    schedule();
  }

  async function refresh(): Promise<void> {
    const reading = await readReading(readInterfaces, probeUdp);
    const routes = await readRoutes();
    onUpdate({ interfaces: reading.interfaces, signals: toSignals(reading.probe, routes) });
    remembered = reading.signature;
    candidate = null;
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const current = (await readReading(readInterfaces, probeUdp)).signature;
      if (current === remembered) candidate = null;
      else if (current === candidate) await refresh();
      else candidate = current;
    } catch {
      // A reading that fails is no reading at all; the next tick tries again.
    }
    schedule();
  }

  function schedule(): void {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => tick(), TICK_INTERVAL_MS);
  }

  function stop(): void {
    stopped = true;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return { start, refresh, stop };
}

/** One reading of the machine: the adapters, the probe and its signature. */
async function readReading(
  readInterfaces: () => LanInterfaceMap,
  probe: () => Promise<string | null>,
): Promise<{ interfaces: LanInterfaceMap; probe: string | null; signature: string }> {
  const interfaces = readInterfaces();
  let result: string | null = null;
  try {
    result = await probe();
  } catch {
    // A probe that fails is a reading without a probe.
    result = null;
  }
  const adapters = Object.keys(interfaces).sort()
    .map(name => [name, (interfaces[name] ?? []).map(entry => entry.address)]);
  return { interfaces, probe: result, signature: JSON.stringify([adapters, result]) };
}

function routeOptions(): { timeout: number; windowsHide: boolean; encoding: "latin1" } {
  return { timeout: ROUTE_TIMEOUT_MS, windowsHide: true, encoding: "latin1" };
}

function toSignals(probe: string | null, routes: RouteSignals): LanSignals {
  return { defaultRouteIp: probe, gateways: routes.gateways, routeChecked: routes.routeChecked };
}

function isDottedIpv4(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  return match.slice(1).every(part => Number(part) <= 255);
}

/** The child process module, loaded where it is used. A build that cannot
 *  carry it simply has no way to run a command, and says so. */
async function loadChildProcess(): Promise<typeof import("node:child_process") | null> {
  if (typeof require === "function") {
    try {
      const load = require;
      return load("node:child_process") as typeof import("node:child_process");
    } catch {
      return null;
    }
  }
  try {
    return await import("node:child_process");
  } catch {
    return null;
  }
}

function probeTarget(target: string): Promise<string | null> {
  return new Promise(resolve => {
    let socket: Socket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (socket !== null) {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
      }
      resolve(value);
    };
    timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    try {
      socket = createSocket("udp4");
      socket.on("error", () => finish(null));
      socket.connect(PROBE_PORT, target, () => finish(localAddress(socket)));
    } catch {
      finish(null);
    }
  });
}

function localAddress(socket: Socket | null): string | null {
  try {
    return socket?.address().address ?? null;
  } catch {
    return null;
  }
}
