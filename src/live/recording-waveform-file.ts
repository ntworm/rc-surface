// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The bounded file access of the waveform service.
 *
 * Every read happens inside the extension's own temp root, on a regular file
 * that is still the very same file when it is opened and when it is read.
 * The module never decides what a failure means: it reports the facts and the
 * service turns them into its own codes.
 */

/** No rendered wave may be larger than this. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
/** The file is read in bounded chunks, never in one gulp. */
export const READ_CHUNK_BYTES = 1024 * 1024;

export interface WaveformFileStat {
  isFile(): boolean;
  size: number;
  dev: number;
  ino: number;
}

export interface WaveformPathStat extends WaveformFileStat {
  isSymbolicLink(): boolean;
}

export interface WaveformFileHandle {
  stat(): Promise<WaveformFileStat>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

/** The file the host rendered, with the facts that were proven about it. */
export interface WaveformFileLocation {
  filePath: string;
  info: WaveformPathStat;
  fileReal: string;
}

/** The verdict on the opened file. */
export type OpenVerdict = { ok: true; size: number } | { ok: false; reason: 'file' | 'size' };

/** Is the candidate a strict descendant of the root? */
function isInside(root: string, candidate: string): boolean {
  const inside = relative(root, candidate);
  if (!inside || isAbsolute(inside)) return false;
  return inside !== '..' && !inside.startsWith('..' + sep);
}

/** The status of a path, or nothing when the path cannot be read. */
export async function lstatOf(path: string): Promise<WaveformPathStat | undefined> {
  try {
    return await lstat(path);
  } catch {
    return undefined;
  }
}

/** The physical path of a path, or nothing when it cannot be resolved. */
export async function realpathOf(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

/** Open one file for reading. */
export async function openNodeFile(path: string): Promise<WaveformFileHandle> {
  const handle = await open(path, 'r');
  return {
    stat: async () => handle.stat(),
    read: async (buffer, offset, length, position) => {
      const result = await handle.read(buffer, offset, length, position);
      return { bytesRead: result.bytesRead };
    },
    close: async () => {
      await handle.close();
    },
  };
}

/** Is the path a real regular file and not a link? */
function isRegularFile(info: WaveformPathStat): boolean {
  return info.isFile() && !info.isSymbolicLink();
}

/** The own temp root of the host. It must be an absolute path. */
export function captureTempRoot(temp: string | undefined): string | undefined {
  if (typeof temp !== 'string' || !temp) return undefined;
  if (!isAbsolute(temp)) return undefined;
  return resolve(temp);
}

/** Open one file for reading, or nothing when the host refuses to open it. */
export async function openSafely(
  opener: (path: string) => Promise<WaveformFileHandle>,
  path: string,
): Promise<WaveformFileHandle | undefined> {
  try {
    return await opener(path);
  } catch {
    return undefined;
  }
}

/** Is every component between the root and the file a real directory or the
 * real file itself? A symbolic link or a directory junction would move the
 * read out of the root, so it is refused.
 */
export async function hasNoSymlinkPath(root: string, file: string): Promise<boolean> {
  const inside = relative(root, file);
  if (!inside || isAbsolute(inside)) return false;
  const parts = inside.split(sep);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    const info = await lstatOf(current);
    if (!info) return false;
    if (info.isSymbolicLink()) return false;
  }
  return true;
}

/** The absolute path of the rendered file inside the own temp root. */
function resolveOwnPath(root: string, path: string): string | undefined {
  if (typeof path !== 'string' || !path) return undefined;
  if (!isAbsolute(path)) return undefined;
  const filePath = resolve(path);
  if (!isInside(root, filePath)) return undefined;
  return filePath;
}

/**
 * Is the own temp root still the very same root? The path and its physical
 * target must not have changed while the job was running.
 */
export async function isOwnTempRoot(root: string, rootReal: string, temp: string | undefined): Promise<boolean> {
  if (typeof temp !== 'string' || !temp) return false;
  if (resolve(temp) !== root) return false;
  const currentReal = await realpathOf(root);
  return currentReal !== undefined && currentReal === rootReal;
}

/**
 * Locate the file the host rendered. It must be an absolute path inside the
 * own temp root, it must be a real regular file and it must not be reached
 * through a symbolic link or a directory junction.
 */
export async function locateOwnFile(
  root: string,
  rootReal: string,
  path: string,
): Promise<WaveformFileLocation | undefined> {
  const filePath = resolveOwnPath(root, path);
  if (!filePath) return undefined;
  if (!await hasNoSymlinkPath(root, filePath)) return undefined;
  const info = await lstatOf(filePath);
  if (!info || !isRegularFile(info)) return undefined;
  const fileReal = await realpathOf(filePath);
  if (!fileReal || !isInside(rootReal, fileReal)) return undefined;
  return { filePath, info, fileReal };
}

/** The opened file must be the file that was validated. */
export async function verifyOpenedFile(handle: WaveformFileHandle, info: WaveformPathStat): Promise<OpenVerdict> {
  const stat = await handle.stat();
  if (!stat.isFile()) return { ok: false, reason: 'file' };
  if (stat.dev !== info.dev || stat.ino !== info.ino) return { ok: false, reason: 'file' };
  if (stat.size <= 0) return { ok: false, reason: 'file' };
  if (stat.size > MAX_FILE_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, size: stat.size };
}

/** The path must still point at the very same file. */
export async function isPathUnchanged(location: WaveformFileLocation): Promise<boolean> {
  const after = await lstatOf(location.filePath);
  if (!after || !isRegularFile(after)) return false;
  if (after.dev !== location.info.dev || after.ino !== location.info.ino) return false;
  if (after.size !== location.info.size) return false;
  const afterReal = await realpathOf(location.filePath);
  return afterReal !== undefined && afterReal === location.fileReal;
}

/** Do the fresh facts and the captured snapshot describe the very same file? */
function isSameFileSnapshot(fresh: WaveformFileLocation, original: WaveformFileLocation): boolean {
  return (
    fresh.info.dev === original.info.dev &&
    fresh.info.ino === original.info.ino &&
    fresh.info.size === original.info.size &&
    fresh.fileReal === original.fileReal
  );
}

/**
 * Remove the file the host rendered, but only while it is still the very same
 * file inside the own temp root.
 *
 * The location was captured earlier from the path the SDK returned, so every
 * ownership fact comes from that capture. The own temp root must still be the
 * own temp root, the fresh location must describe the same file and the path
 * must still point at the captured file. Any doubt is a refusal and never an
 * error: the file is kept and the call reports false.
 *
 * This is a best effort cleanup of the own temp files of the extension. It is
 * not an atomic unlink against an active attacker.
 */
export async function removeOwnRenderedFile(
  root: string,
  rootReal: string,
  location: WaveformFileLocation,
  getTempDirectory: () => string | undefined,
  removeFile: (path: string) => Promise<void> = unlink,
): Promise<boolean> {
  try {
    if (!await isOwnTempRoot(root, rootReal, getTempDirectory())) return false;
    const fresh = await locateOwnFile(root, rootReal, location.filePath);
    if (!fresh || !isSameFileSnapshot(fresh, location)) return false;
    if (!await isOwnTempRoot(root, rootReal, getTempDirectory())) return false;
    if (!await isPathUnchanged(location)) return false;
    await removeFile(location.filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a bounded regular file in chunks. The check runs before and after
 * every chunk, so a retired job stops the read at the next chunk boundary
 * and never hands bytes of a world that no longer exists to the parser.
 * Nothing is returned when the file ends before its own size.
 */
export async function readBoundedFile(
  handle: WaveformFileHandle,
  size: number,
  check: () => void,
): Promise<Buffer | undefined> {
  if (!Number.isInteger(size) || size < 0 || size > MAX_FILE_BYTES) return undefined;
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    check();
    const length = Math.min(READ_CHUNK_BYTES, size - offset);
    const read = await handle.read(buffer, offset, length, offset);
    check();
    if (!read || read.bytesRead <= 0) return undefined;
    offset += read.bytesRead;
  }
  return buffer;
}
