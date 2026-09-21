// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * The interface language, held by the extension rather than by each browser.
 *
 * A per-device preference would be the simpler build, and it is what the
 * sibling Setlist extension does. It does not work here: the panel and the
 * phone are different browsers on different machines, so a choice made in the
 * panel would never reach the phone. The panel is the operator's console, so
 * the extension owns the setting and every surface follows it — the phone
 * learns it from the URL it is opened with, and again over the socket when it
 * changes, so a page that is already open does not have to be reloaded.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { stripWslDrivePrefix } from "../util/helpers.js";

export const SUPPORTED_LOCALES = ["en", "pt-BR"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

let current: Locale = DEFAULT_LOCALE;
let filePath: string | null = null;

/**
 * Accepts what a browser or a URL might carry — `pt`, `pt-br`, `PT_BR`,
 * `pt-BR,en;q=0.9` — and answers with a locale we actually ship, or null when
 * it is none of them. Callers decide whether null means "keep" or "default".
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const head = value.split(",")[0]?.trim().replace("_", "-").toLowerCase() ?? "";
  if (!head) return null;
  if (head === "pt" || head.startsWith("pt-")) return "pt-BR";
  if (head === "en" || head.startsWith("en-")) return "en";
  return null;
}

export function getLocale(): Locale {
  return current;
}

/** Returns the locale actually in force, which is unchanged for junk input. */
export function setLocale(value: unknown): Locale {
  const next = normalizeLocale(value);
  if (next && next !== current) {
    current = next;
    void persist();
  }
  return current;
}

async function persist(): Promise<void> {
  if (!filePath) return;
  try {
    await fs.writeFile(filePath, JSON.stringify({ locale: current }, null, 2), "utf8");
  } catch (err) {
    // A read-only or missing storage directory must not take the server down:
    // the language still works for this session, it just will not survive a
    // restart.
    console.warn(
      `[ableton-rc-surface] could not persist locale: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Points the store at its file and loads whatever is there. Best-effort by
 * design, matching how mapping storage treats a missing directory.
 */
export async function configureLocaleStorage(
  storageDir: string | null | undefined,
  isCurrent: () => boolean = () => true,
): Promise<Locale> {
  if (!isCurrent()) return current;
  if (!storageDir) {
    filePath = null;
    return current;
  }
  filePath = path.join(stripWslDrivePrefix(storageDir), "locale.json");
  const loadingPath = filePath;
  try {
    const raw = await fs.readFile(loadingPath, "utf8");
    if (!isCurrent() || filePath !== loadingPath) return current;
    const parsed = normalizeLocale((JSON.parse(raw) as { locale?: unknown })?.locale);
    if (parsed) current = parsed;
  } catch {
    // No file yet, or an unreadable one. Either way the default stands and the
    // next change writes a good one.
  }
  return current;
}

/** Test seam: forget the file and go back to the shipped default. */
export function resetLocaleForTests(): void {
  current = DEFAULT_LOCALE;
  filePath = null;
}
