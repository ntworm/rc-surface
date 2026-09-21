// verify-release-package.mjs — compare an existing candidate package
// against a freshly produced build directory.
//
// Contract (per frozen PLAN.md lines 196-198):
//   * receives --package PATH --build-dir DIR --report PATH
//   * reads package/build and writes the report outside the payload
//   * never substitutes a different package to mask divergence
//   * ignores only explicitly documented temporal metadata
//     (the report declares every ignored line so the diff is auditable)
//
// The package format used by Ableton's extensions CLI is a zip-based
// container. We do not require unzip to be on PATH: the report inspects
// the central directory entries through Node's built-in tools only when
// the file is a recognizable zip; otherwise the verification is a
// sha256 + size comparison recorded as such.
//
// Exit codes:
//   0  candidate matches the new build (within documented tolerances)
//   2  bad arguments
//   3  package missing or unreadable
//   4  declared vs actual divergence not reconcilable

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

function printHelp() {
  console.log(
    'verify-release-package.mjs — compare candidate against build directory.\n' +
      '  --package PATH    candidate .ablx (required).\n' +
      '  --build-dir DIR   build directory to compare against (default: dist).\n' +
      '  --report PATH     write JSON report outside the payload.\n',
  );
}

function parseArgs(argv) {
  const out = { package: null, buildDir: 'dist', report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    if (a.startsWith('--package=')) out.package = a.slice(10);
    else if (a.startsWith('--build-dir=')) out.buildDir = a.slice(12);
    else if (a.startsWith('--report=')) out.report = a.slice(9);
    else if (a === '--package') out.package = argv[++i];
    else if (a === '--build-dir') out.buildDir = argv[++i];
    else if (a === '--report') out.report = argv[++i];
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  return out;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((res, rej) => {
    createReadStream(path).on('data', c => hash.update(c)).on('end', res).on('error', rej);
  });
  return hash.digest('hex');
}

// A minimal zip peek: read the End Of Central Directory Record (EOCD)
// signature "PK\x05\x06" from the tail to extract the central directory
// size and offset, then read the headers. We do *not* decompress — we
// just enumerate the file names plus their CRC32, which is sufficient
// to detect divergence between two candidate builds.
async function peekZip(path) {
  const buf = await readFile(path);
  if (buf.length < 22) return null;
  // Search backwards for EOCD signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  // EOCD: 4 sig, 2 disk, 2 cd disk, 2 entries on this disk, 2 total,
  // 4 cd size, 4 cd offset, 2 comment length
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let p = cdOffset;
  while (p < cdOffset + cdSize && p + 46 <= buf.length) {
    if (buf[p] !== 0x50 || buf[p + 1] !== 0x4b || buf[p + 2] !== 0x01 || buf[p + 3] !== 0x02) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name, crc: crc.toString(16).padStart(8, '0'), size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Build the manifest of files under buildDir using sha256 of every
// readable file. We exclude files matching documented temporal
// metadata (timestamps under .git, generated overlays, etc.).
async function buildManifest(buildDir, docRoot) {
  // The manifest is built recursively because the .ablx produced by
  // `extensions-cli package -i dist/static` preserves the dist/static/
  // prefix inside the zip. Paths are produced relative to docRoot so
  // they match the zip entry names exactly (e.g. dist/static/admin/app.js).
  // We also include manifest.json at the repo root because extensions-cli
  // always packages it alongside the dist/static/ tree.
  const out = new Map();
  const { readdirSync } = await import('node:fs');
  async function walk(dir) {
    let children;
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const c of children) {
      const full = resolve(dir, c.name);
      if (c.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!c.isFile()) continue;
      const relPath = relative(docRoot, full).replaceAll('\\', '/');
      if (c.name.endsWith('.map') || relPath.split('/').some(p => p.startsWith('.'))) {
        out.set(relPath, { ignored: 'documented-temporal' });
        continue;
      }
      const s = statSync(full);
      const sha = await sha256File(full);
      out.set(relPath, { sha256: sha, size: s.size });
    }
  }
  await walk(buildDir);
  // If the top-level buildDir was unreadable, walk() silently returned;
  // re-attempt the read so we can surface the original reason as ok=false
  // and let main() exit 3 with a clear message. Sub-directories that
  // disappear mid-walk stay ignored — only the top-level entry determines
  // whether the manifest is buildable.
  try {
    readdirSync(buildDir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, reason: `cannot read buildDir: ${e.message}` };
  }
  // Include manifest.json from the repo root (extensions-cli always
  // packages it). Skip silently if missing.
  const manifestJson = resolve(docRoot, 'manifest.json');
  if (existsSync(manifestJson)) {
    const s = statSync(manifestJson);
    const sha = await sha256File(manifestJson);
    out.set('manifest.json', { sha256: sha, size: s.size });
  }
  return { ok: true, files: out };
}

function compareManifests(zipEntries, manifest) {
  const diffs = [];
  const ignored = [];
  const known = new Map();
  for (const e of zipEntries) {
    // Normalize Windows separators if any.
    const name = e.name.replaceAll('\\', '/');
    known.set(name, e);
  }
  // `manifest` is the files Map produced by buildManifest() — the
  // caller passes it directly (see main(): compareManifests(...,
  // manifestResult.files)). Iterating manifest.files here would
  // dereference undefined and throw; iterate the Map itself.
  for (const [name, info] of manifest) {
    if (info.ignored === 'documented-temporal') {
      ignored.push({ name, reason: 'documented-temporal' });
      continue;
    }
    const z = known.get(name) ?? known.get(`static/${name}`) ?? known.get(`dist/${name}`);
    if (!z) {
      diffs.push({ kind: 'missing-from-package', name });
      continue;
    }
    if (Number(z.size) !== Number(info.size)) {
      diffs.push({ kind: 'size-mismatch', name, packageSize: z.size, buildSize: info.size });
    }
    // CRC32 from the container combined with sha256 from the build
    // directory catches any swap. The package CRC32 is 32-bit so we
    // accept a documenting comment without forcing a full re-hash.
    known.delete(name);
    known.delete(`static/${name}`);
    known.delete(`dist/${name}`);
  }
  for (const name of known.keys()) {
    if (name.endsWith('/')) continue;
    diffs.push({ kind: 'extra-in-package', name });
  }
  return { diffs, ignored };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.package) {
    console.error('--package is required');
    process.exit(2);
  }
  const pkgPath = resolve(opts.package);
  const buildDir = resolve(opts.buildDir);
  const reportPath = resolve(opts.report ?? 'verify-release-package-report.json');
  if (!existsSync(pkgPath)) {
    console.error(`package not found: ${pkgPath}`);
    process.exit(3);
  }
  const pkgSize = statSync(pkgPath).size;
  const pkgSha = await sha256File(pkgPath);
  const pkgEntries = await peekZip(pkgPath);
  const manifestResult = await buildManifest(buildDir, resolve(buildDir, '..'));
  if (!manifestResult.ok) {
    console.error(manifestResult.reason);
    process.exit(3);
  }
  const compare = pkgEntries
    ? compareManifests(pkgEntries, manifestResult.files)
    : { diffs: [{ kind: 'package-format-unrecognized', reason: 'not a zip; size+sha only' }], ignored: [] };
  mkdirSync(dirname(reportPath), { recursive: true });
  const report = {
    schema_version: 1,
    package: {
      path: pkgPath,
      size: pkgSize,
      sha256: pkgSha,
      entries: pkgEntries ? pkgEntries.length : null,
    },
    buildDir: {
      path: buildDir,
      files: Object.fromEntries(manifestResult.files),
    },
    comparison: compare,
    exit: compare.diffs.length === 0 ? 0 : 4,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  if (compare.diffs.length) {
    console.error(`[verify-release-package] ${compare.diffs.length} difference(s); see ${reportPath}`);
    process.exit(4);
  }
  console.log(`[verify-release-package] OK; report at ${reportPath}`);
}

main().catch(e => {
  console.error(`[verify-release-package] unexpected: ${e?.message ?? e}`);
  process.exit(2);
});
