#!/usr/bin/env node
// P03 data migrator: copies worm.ableton-rc-surface → worm.rc-surface
// without moving or overwriting. Never moves. --dry-run prints plan.
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Resolve the default Extensions Data root for the current platform.
 * Windows: %LOCALAPPDATA%\Ableton\Extensions Data
 * macOS:   ~/Library/Application Support/Ableton/Extensions Data
 */
export function defaultRoot() {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) return join(local, "Ableton", "Extensions Data");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Ableton", "Extensions Data");
  }
  throw new Error(`Unsupported platform: ${process.platform}. Use --root to specify the data directory.`);
}

/**
 * Copy a single file from src to dst. If dst exists, skip (never overwrite).
 * Returns { copied: bool, skipped: bool }.
 */
function copyFileSkip(src, dst, dryRun, fs) {
  if (fs.existsSync(dst)) return { copied: false, skipped: true };
  if (dryRun) return { copied: false, skipped: false, planned: true };
  fs.mkdirSync(dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return { copied: true, skipped: false };
}

/**
 * Recursively copy contents of srcDir into dstDir. Never overwrites.
 * Returns { copied: number, skipped: number, missing: bool }.
 */
export function migrate({
  root,
  source = "worm.ableton-rc-surface",
  dest = "worm.rc-surface",
  dryRun = false,
  fs = { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, dirname },
} = {}) {
  const resolvedRoot = root ?? defaultRoot();
  const srcDir = join(resolvedRoot, source);
  const dstDir = join(resolvedRoot, dest);

  if (!fs.existsSync(srcDir)) {
    return {
      root: resolvedRoot,
      source: srcDir,
      dest: dstDir,
      copied: 0,
      skipped: 0,
      missing: true,
      dryRun,
      message: `source not found: ${srcDir}`,
    };
  }

  if (!fs.existsSync(dstDir)) {
    if (!dryRun) fs.mkdirSync(dstDir, { recursive: true });
  }

  const result = { copied: 0, skipped: 0 };
  const srcStat = fs.statSync(srcDir);
  if (!srcStat.isDirectory()) {
    throw new Error(`source is not a directory: ${srcDir}`);
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      // recurse manually
      const sub = migrate({
        root: resolvedRoot,
        source: join(source, entry.name),
        dest: join(dest, entry.name),
        dryRun,
        fs,
      });
      result.copied += sub.copied;
      result.skipped += sub.skipped;
    } else {
      const r = copyFileSkip(srcPath, dstPath, dryRun, fs);
      if (r.copied) result.copied++;
      if (r.skipped) result.skipped++;
    }
  }

  return {
    root: resolvedRoot,
    source: srcDir,
    dest: dstDir,
    copied: result.copied,
    skipped: result.skipped,
    missing: false,
    dryRun,
    message: dryRun
      ? `dry-run: would copy ${result.copied} file(s), skip ${result.skipped}`
      : `copied ${result.copied} file(s), skipped ${result.skipped} existing`,
  };
}

// CLI entry point
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` ||
    import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--root") opts.root = args[++i];
    else if (a === "--source") opts.source = args[++i];
    else if (a === "--dest") opts.dest = args[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node migrate-data.mjs [--root <dir>] [--source <name>] [--dest <name>] [--dry-run]");
      process.exit(0);
    }
  }
  const result = migrate(opts);
  console.log(JSON.stringify(result, null, 2));
  // Exit 0 even when source is missing (informational)
  process.exit(0);
}
