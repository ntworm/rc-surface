import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildZip } from './package-tester-kit.mjs';
const kit = join(import.meta.dirname, 'assets', 'kit');
test('Windows migration preserves nested destination and copies missing files', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-migration-'));
  try {
    const base = join(root, 'Ableton', 'Extensions Data');
    const src = join(base, 'worm.ableton-rc-surface', 'presets');
    const dst = join(base, 'worm.rc-surface', 'presets');
    await mkdir(src, { recursive: true }); await mkdir(dst, { recursive: true });
    await writeFile(join(src, 'default.json'), 'old');
    await writeFile(join(src, 'missing.json'), 'copy');
    await writeFile(join(dst, 'default.json'), 'new');
    const run = () => spawnSync('cmd.exe', ['/d', '/c', '.\\Migrate-RC-Surface-Data.cmd'], { cwd: kit, env: { ...process.env, LOCALAPPDATA: root }, encoding: 'utf8', input: '\n' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(dst, 'default.json'), 'utf8'), 'new');
    assert.equal(await readFile(join(dst, 'missing.json'), 'utf8'), 'copy');
    assert.equal(await readFile(join(src, 'default.json'), 'utf8'), 'old');
    assert.match(run().stdout, /Copied 0 file\(s\).*Skipped 2/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('mac migration does not suppress copying errors', async () => {
  const script = await readFile(join(kit, 'Migrate RC Surface Data.command'), 'utf8');
  assert.doesNotMatch(script, /\|\| true/);
  assert.doesNotMatch(script, /2>\/dev\/null/);
});
test('kit ZIP gives mac launcher executable Unix permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-kit-mode-'));
  try {
    const src = join(root, 'src'); await mkdir(src);
    await writeFile(join(src, 'Migrate RC Surface Data.command'), '#!/bin/bash\n');
    const out = join(root, 'kit.zip'); await buildZip(src, out);
    const zip = await readFile(out);
    const offset = zip.readUInt32LE(zip.length - 6);
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    assert.equal(zip.readUInt16LE(offset + 4) >> 8, 3);
    assert.equal((zip.readUInt32LE(offset + 38) >>> 16) & 0o777, 0o755);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('landing and social card use RC Surface branding and trademark notice', async () => {
  const root = join(import.meta.dirname, '..');
  const html = await readFile(join(root, 'docs/index.html'), 'utf8');
  const catalog = await readFile(join(root, 'docs/site-i18n.js'), 'utf8');
  const generator = await readFile(join(root, 'scripts/generate-og-image.py'), 'utf8');
  assert.match(html, /Ableton and Live are trademarks of Ableton AG/);
  assert.match(catalog, /Ableton e Live são marcas comerciais da Ableton AG/);
  assert.doesNotMatch(catalog, /Ableton <b>RC Surface/);
  assert.doesNotMatch(generator, /draw\.text\([^\n]*"ABLETON"/);
});

test('mac launcher preserves nested data, counts skips and propagates copy failures', async (t) => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  const probe = spawnSync(bash, ['--version'], { encoding: 'utf8' });
  if (probe.error) return t.skip('bash unavailable');
  const root = await mkdtemp(join(tmpdir(), 'rc-mac-migration-'));
  try {
    const base = join(root, 'Library/Application Support/Ableton/Extensions Data');
    const src = join(base, 'worm.ableton-rc-surface/presets');
    const dst = join(base, 'worm.rc-surface/presets');
    await mkdir(src, { recursive: true }); await mkdir(dst, { recursive: true });
    await writeFile(join(src, 'default.json'), 'old');
    await writeFile(join(src, 'missing.json'), 'copy');
    await writeFile(join(dst, 'default.json'), 'new');
    const script = join(kit, 'Migrate RC Surface Data.command').replaceAll('\\', '/');
    const run = (fail = false) => spawnSync(bash, ['--noprofile', '--norc', '-c', 'export HOME="$1"; if [ "$3" = fail ]; then cp() { return 7; }; export -f cp; fi; bash "$2"', 'migration', root.replaceAll('\\', '/'), script, fail ? 'fail' : 'ok'], { encoding: 'utf8' });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Copied 1 file\(s\).*Skipped 1/);
    assert.equal(await readFile(join(dst, 'default.json'), 'utf8'), 'new');
    assert.match(run().stdout, /Copied 0 file\(s\).*Skipped 2/);
    await writeFile(join(src, 'failure.json'), 'new');
    const failure = run(true);
    assert.equal(failure.status, 7, failure.stderr);
    assert.doesNotMatch(failure.stdout, /Done\./);
  } finally { await rm(root, { recursive: true, force: true }); }
});
