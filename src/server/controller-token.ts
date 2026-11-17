// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getExtensionContext } from "../context.js";
import { stripWslDrivePrefix } from "../util/helpers.js";

/** The file that holds the controller token, inside the session directory. */
const TOKEN_FILE = "controller-token";

/** A controller token is 16 random bytes, written as hex. */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The controller token of the server, kept between starts.
 *
 * The token is what turns a phone into a controller, and a phone that was
 * already paired should stay one when Ableton restarts. The admin token is
 * not stored: it belongs to the run that issued it (see regenerateTokens).
 *
 * Returns null when the token cannot be kept — no storage directory, a file
 * that cannot be read, or a storage that cannot be written. The caller then
 * uses a temporary token that rotates on every start.
 */
export async function loadControllerToken(): Promise<string | null> {
  const storageDirectory = getExtensionContext()?.environment?.storageDirectory;
  if (!storageDirectory) {
    console.warn(
      "[ableton-rc-surface] no storage directory: the controller token is not " +
        "persisted and rotates on every start",
    );
    return null;
  }

  const sessionDir = path.join(stripWslDrivePrefix(storageDirectory), "session");
  const tokenPath = path.join(sessionDir, TOKEN_FILE);

  try {
    // The session directory is created before anything is written into it.
    await fs.mkdir(sessionDir, { recursive: true });
    const stored = await readStoredToken(tokenPath);
    if (stored !== null && TOKEN_PATTERN.test(stored)) return stored;
    // No token yet, or a file that does not hold one: a new token is drawn.
    return await writeToken(sessionDir, tokenPath);
  } catch (err) {
    console.warn(
      `[ableton-rc-surface] the persisted controller token is unavailable (${errorCode(err)}); ` +
        "a temporary one is used for this run",
    );
    return null;
  }
}

/**
 * The token in the file, or null when there is no file yet. Any other
 * failure is raised: a file that cannot be read is not a token.
 */
async function readStoredToken(tokenPath: string): Promise<string | null> {
  try {
    return (await fs.readFile(tokenPath, "utf8")).trim();
  } catch (err) {
    if (errorCode(err) === "ENOENT") return null;
    throw err;
  }
}

/**
 * Draws a new controller token and stores it. The token is written to a
 * temporary file and renamed over the old one, so a reader never sees a
 * half-written token; the temporary file is created exclusively ('wx') and
 * with owner-only permissions (0o600).
 */
async function writeToken(sessionDir: string, tokenPath: string): Promise<string> {
  const token = crypto.randomBytes(16).toString("hex");
  const tempPath = path.join(sessionDir, `${TOKEN_FILE}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    await fs.writeFile(tempPath, token, { flag: "wx", mode: 0o600 });
    await fs.rename(tempPath, tokenPath);
    return token;
  } finally {
    // A failed write leaves nothing behind.
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

/**
 * The code of a failed call, and nothing else: the message of a filesystem
 * error repeats the full path, and a log line must not carry it.
 */
function errorCode(err: unknown): string {
  return String((Object(err) as { code?: unknown }).code);
}
