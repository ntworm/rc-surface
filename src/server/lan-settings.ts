// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * What the user decided about the network, and what the phones proved.
 *
 * The choice is a pin: the adapter and the subnet to announce, named so it
 * survives a new DHCP lease. The proofs are the networks a phone has already
 * reached this machine on, which is what tells a hotspot from a cable.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { stripWslDrivePrefix } from "../util/helpers.js";
import { PROOF_TTL_MS, type LanChoice, type LanProof } from "./lan-candidates.js";

const MAX_PROOFS = 32;

let filePath: string | null = null;
let choice: LanChoice = { mode: "auto" };
let proofs: LanProof[] = [];

export function getNetworkChoice(): LanChoice {
  return choice;
}

/** Stores the choice. Anything that is not a real choice is refused, and a
 *  refused change leaves the stored one alone. */
export async function setNetworkChoice(value: unknown): Promise<void> {
  const parsed = parseChoice(value);
  if (!parsed) throw new Error("[ableton-rc-surface] invalid network choice");
  choice = parsed;
  await persist();
}

/** The proofs that are still worth something, newest last. */
export function getNetworkProofs(now: number): LanProof[] {
  return proofs.filter(proof => now - proof.at < PROOF_TTL_MS).map(proof => ({ key: proof.key, at: proof.at }));
}

/** Remembers that a phone reached this machine on this network. */
export async function recordNetworkProof(key: string, at: number): Promise<void> {
  const next = proofs.filter(proof => proof.key !== key);
  next.push({ key, at });
  next.sort((left, right) => left.at - right.at);
  while (next.length > MAX_PROOFS) next.shift();
  proofs = next;
  await persist();
}

/** Points the store at its file and loads whatever is there. Best-effort, the
 *  same way the autostart setting treats a missing directory. */
export async function configureNetworkStorage(
  storageDir: string | null | undefined,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  if (!storageDir) {
    filePath = null;
    return;
  }
  filePath = path.join(stripWslDrivePrefix(storageDir), "network.json");
  const loadingPath = filePath;
  try {
    const raw = await fs.readFile(loadingPath, "utf8");
    if (!isCurrent() || filePath !== loadingPath) return;
    const parsed = (JSON.parse(raw) as { choice?: unknown; proofs?: unknown }) ?? {};
    choice = parseChoice(parsed.choice) ?? { mode: "auto" };
    proofs = parseProofs(parsed.proofs);
  } catch {
    // No file yet, or an unreadable one. The defaults stand and the next
    // change writes a good one.
  }
}

/** Test seam: forget the file and go back to the shipped defaults. */
export function resetNetworkSettingsForTests(): void {
  choice = { mode: "auto" };
  proofs = [];
  filePath = null;
}

async function persist(): Promise<void> {
  if (!filePath) return;
  try {
    await fs.writeFile(filePath, JSON.stringify({ choice, proofs }, null, 2), "utf8");
  } catch (err) {
    // A read-only or missing storage directory must not take the server down.
    // The choice holds for this session; it just will not survive a restart.
    console.warn(
      `[ableton-rc-surface] could not persist network settings: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function parseChoice(value: unknown): LanChoice | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { mode?: unknown; id?: unknown };
  if (record.mode === "auto") return { mode: "auto" };
  if (record.mode === "pinned" && typeof record.id === "string" && record.id.length > 0) {
    return { mode: "pinned", id: record.id };
  }
  return null;
}

function parseProofs(value: unknown): LanProof[] {
  if (!Array.isArray(value)) return [];
  const parsed: LanProof[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { key?: unknown; at?: unknown };
    if (typeof record.key !== "string" || record.key.length === 0) continue;
    if (typeof record.at !== "number" || !Number.isFinite(record.at)) continue;
    parsed.push({ key: record.key, at: record.at });
  }
  return parsed;
}
