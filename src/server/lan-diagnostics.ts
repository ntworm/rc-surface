// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * What can be read about why a phone does not reach this machine.
 *
 * Everything here runs on demand and only reads. A check that cannot run is
 * reported as not checked, never as OK.
 */

import * as tls from "node:tls";
import { loadCommandRunner, type CommandRunner } from "./lan-probe.js";

/** Fixed text: the path and the address reach it through the environment,
 *  so nothing in them can change what PowerShell runs. */
export const WINDOWS_FIREWALL_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
  "$category = $null",
  "$ip = Get-NetIPAddress -IPAddress $env:RC_SURFACE_ADDRESS -AddressFamily IPv4 | Select-Object -First 1",
  "if ($ip) { $net = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex | Select-Object -First 1; if ($net) { $category = [string]$net.NetworkCategory } }",
  "$rules = @()",
  "foreach ($filter in @(Get-NetFirewallApplicationFilter -Program $env:RC_SURFACE_EXE)) { foreach ($rule in @(Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $filter)) { if ([string]$rule.Enabled -eq 'True' -and [string]$rule.Direction -eq 'Inbound') { $rules += [pscustomobject]@{ action = [string]$rule.Action; profiles = [string]$rule.Profile } } } }",
  "$products = @()",
  "foreach ($item in @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName FirewallProduct)) { $products += [pscustomobject]@{ name = [string]$item.displayName; state = [int]$item.productState } }",
  "[pscustomobject]@{ profile = $category; rules = $rules; products = $products } | ConvertTo-Json -Compress -Depth 3",
].join("; ");

export type NetworkCheckStatus = "ok" | "warn" | "unknown";

export interface NetworkCheckItem {
  id: "server" | "certificate" | "firewall" | "third-party-firewall";
  status: NetworkCheckStatus;
  reason?: string;
  profile?: string;
  command?: string;
  products?: string[];
}

export interface NetworkCheckOptions {
  platform: string;
  address: string;
  httpsPort: number | null;
  execPath: string;
  run?: CommandRunner | null;
  readCertificate?: (address: string, port: number) => Promise<string>;
}

/** The macOS firewall answers three questions, one after the other. */
const MAC_FIREWALL = "/usr/libexec/ApplicationFirewall/socketfilterfw";
const TIMEOUT_MS = 8000;
const MAC_OPTIONS = { timeout: TIMEOUT_MS, windowsHide: true, encoding: "utf8" } as const;

/** The escape character of PowerShell, for the command the panel offers. */
const ESCAPE = "`";

/** A firewall that cannot be read is not checked, never OK. */
const NOT_CHECKED: NetworkCheckItem = { id: "firewall", status: "unknown", reason: "not-checked" };

/** The report the PowerShell body prints, or nothing when it cannot be read. */
function parseReport(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The network category of the interface, as PowerShell names it. */
function readProfile(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "DomainAuthenticated" ? "Domain" : text;
}

/** What the Windows firewall has to say about the current profile. */
function firewallItem(parsed: Record<string, unknown>, exe: string): NetworkCheckItem {
  const profile = readProfile(parsed.profile);
  if (!profile) return { id: "firewall", status: "unknown", reason: "no-profile" };
  const rules = parsed.rules as Array<Record<string, unknown>>;
  const action = (rule: Record<string, unknown>): string =>
    typeof rule.action === "string" ? rule.action.trim().toLowerCase() : "";
  // A rule holds for the profile it lists, and for every profile when Any.
  const applying = rules.filter(rule => {
    const profiles = rule.profiles;
    if (typeof profiles !== "string") return false;
    const text = profiles.trim();
    if (text === "Any") return true;
    return text.split(",").map(part => part.trim()).includes(profile);
  });
  if (applying.some(rule => action(rule) === "block")) return { id: "firewall", status: "warn", reason: "blocked", profile };
  if (applying.some(rule => action(rule) === "allow")) return { id: "firewall", status: "ok", profile };
  // Every character that could end the quoted path ends the string first.
  const path = exe.replace(/[`$"]/g, character => `${ESCAPE}${character}`);
  const command = `New-NetFirewallRule -DisplayName "RC Surface" -Direction Inbound -Action Allow -Protocol TCP -Program "${path}" -Profile ${profile}`;
  return { id: "firewall", status: "warn", reason: "no-rule", profile, command };
}

/** The third party firewalls that are switched on, each name once. */
function thirdPartyProducts(parsed: Record<string, unknown>): string[] {
  const products = parsed.products;
  if (!Array.isArray(products)) return [];
  const names: string[] = [];
  for (const product of products) {
    if (!product || typeof product !== "object") continue;
    const entry = product as Record<string, unknown>;
    const state = typeof entry.state === "number" ? entry.state : 0;
    if (((state >> 12) & 0xf) !== 1) continue;
    const name = typeof entry.name === "string" ? entry.name : "";
    if (/windows|defender/i.test(name)) continue;
    if (names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

/** Reads the report of the Windows firewall and names what it says. */
export function evaluateWindowsFirewall(json: string, exe: string): NetworkCheckItem[] {
  const parsed = parseReport(json);
  if (!parsed || !Array.isArray(parsed.rules)) return [{ id: "firewall", status: "unknown", reason: "unreadable" }];
  const items: NetworkCheckItem[] = [firewallItem(parsed, exe)];
  const products = thirdPartyProducts(parsed);
  if (products.length > 0) items.push({ id: "third-party-firewall", status: "warn", products });
  return items;
}

/** Reads the three answers of the macOS firewall. */
export function parseMacFirewall(output: { global: string; blockAll: string; app: string }): NetworkCheckItem {
  if (/disabled|State = 0/i.test(output.global)) return { id: "firewall", status: "ok" };
  if (!/enabled|State = [12]/i.test(output.global)) return { id: "firewall", status: "unknown", reason: "unreadable" };
  if (/block all enabled/i.test(output.blockAll)) return { id: "firewall", status: "warn", reason: "block-all" };
  if (/is blocked/i.test(output.app)) return { id: "firewall", status: "warn", reason: "blocked" };
  if (/permitted/i.test(output.app)) return { id: "firewall", status: "ok" };
  return { id: "firewall", status: "unknown", reason: "unreadable" };
}

/** The certificate the server presents, read without trusting it. */
function readPeerCertificate(address: string, port: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = tls.connect({ host: address, port, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("certificate timeout"));
    }, TIMEOUT_MS);
    socket.on("secureConnect", () => {
      clearTimeout(timer);
      resolve(socket.getPeerCertificate().subjectaltname ?? "");
      socket.destroy();
    });
    socket.on("error", error => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

/** The certificate has to name the address the phone will use. */
async function certificateItem(options: NetworkCheckOptions): Promise<NetworkCheckItem> {
  const port = options.httpsPort;
  if (!options.address || port === null) return { id: "certificate", status: "unknown" };
  const read = options.readCertificate ?? readPeerCertificate;
  try {
    const text = await read(options.address, port);
    if (text.split(/,\s*/).includes(`IP Address:${options.address}`)) return { id: "certificate", status: "ok" };
    return { id: "certificate", status: "warn", reason: "not-covered" };
  } catch {
    return { id: "certificate", status: "unknown" };
  }
}

/** Reads the firewall of this machine, if it has one that can be read. */
async function firewallItems(options: NetworkCheckOptions, runner: CommandRunner | null): Promise<NetworkCheckItem[]> {
  if (!options.address || !runner) return [NOT_CHECKED];
  try {
    if (options.platform === "win32") {
      const output = await runner("powershell", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FIREWALL_SCRIPT], {
        timeout: TIMEOUT_MS,
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, RC_SURFACE_EXE: options.execPath, RC_SURFACE_ADDRESS: options.address },
      });
      return evaluateWindowsFirewall(output, options.execPath);
    }
    if (options.platform === "darwin") {
      const global = await runner(MAC_FIREWALL, ["--getglobalstate"], MAC_OPTIONS);
      const blockAll = await runner(MAC_FIREWALL, ["--getblockall"], MAC_OPTIONS);
      const app = await runner(MAC_FIREWALL, ["--getappblocked", options.execPath], MAC_OPTIONS);
      return [parseMacFirewall({ global, blockAll, app })];
    }
  } catch {
    return [NOT_CHECKED];
  }
  return [NOT_CHECKED];
}

/** Reads everything that can be read about this machine, on demand. */
export async function runNetworkCheck(options: NetworkCheckOptions): Promise<NetworkCheckItem[]> {
  const server: NetworkCheckItem = options.httpsPort === null
    ? { id: "server", status: "warn", reason: "https-off" }
    : { id: "server", status: "ok" };
  const runner = options.run === undefined ? await loadCommandRunner() : options.run;
  return [server, await certificateItem(options), ...(await firewallItems(options, runner))];
}
