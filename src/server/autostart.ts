// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Whether the bridge comes up on its own when Live loads the extension.
 *
 * The reason to turn it off is other RC extensions: they bind their own ports
 * and open their own sockets, and someone running two of them wants to choose
 * which one takes the network on any given session rather than fighting over
 * it at launch. Off does not disable anything — the panel's Start button still
 * works, and the panel itself renders from disk when no server is listening,
 * so the setting can always be reached and reversed.
 *
 * Default is on, which is what every install did before this existed.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { stripWslDrivePrefix } from "../util/helpers.js";

export const DEFAULT_AUTOSTART = true;

let current: boolean = DEFAULT_AUTOSTART;
let filePath: string | null = null;

export function isAutostartEnabled(): boolean {
  return current;
}

/**
 * Returns the value actually in force. Anything that is not a boolean leaves
 * the setting alone rather than silently flipping it to the default.
 */
export function setAutostartEnabled(value: unknown): boolean {
  if (typeof value === "boolean" && value !== current) {
    current = value;
    void persist();
  }
  return current;
}

async function persist(): Promise<void> {
  if (!filePath) return;
  try {
    await fs.writeFile(filePath, JSON.stringify({ autostart: current }, null, 2), "utf8");
  } catch (err) {
    // A read-only or missing storage directory must not take the server down.
    // The choice holds for this session; it just will not survive a restart.
    console.warn(
      `[ableton-rc-surface] could not persist autostart: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Points the store at its file and loads whatever is there. Best-effort, the
 * same way mapping and locale storage treat a missing directory.
 */
export async function configureAutostartStorage(
  storageDir: string | null | undefined,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (!isCurrent()) return current;
  if (!storageDir) {
    filePath = null;
    return current;
  }
  filePath = path.join(stripWslDrivePrefix(storageDir), "autostart.json");
  const loadingPath = filePath;
  try {
    const raw = await fs.readFile(loadingPath, "utf8");
    if (!isCurrent() || filePath !== loadingPath) return current;
    const parsed = (JSON.parse(raw) as { autostart?: unknown })?.autostart;
    if (typeof parsed === "boolean") current = parsed;
  } catch {
    // No file yet, or an unreadable one. The default stands and the next
    // change writes a good one.
  }
  return current;
}

/** Test seam: forget the file and go back to the shipped default. */
export function resetAutostartForTests(): void {
  current = DEFAULT_AUTOSTART;
  filePath = null;
}
