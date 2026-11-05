// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import assert from 'node:assert/strict';
import {
  lstat, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, unlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

import { locateOwnFile, removeOwnRenderedFile } from '../src/live/recording-waveform-file.ts';

/** One own temp root with a rendered file and an unrelated sibling. */
async function makeFixture() {
  const base = await mkdtemp(join(tmpdir(), 'rc-surface-wave-'));
  const root = resolve(join(base, 'own'));
  await mkdir(root);
  const rootReal = await realpath(root);
  const filePath = join(root, 'rendered.wav');
  await writeFile(filePath, 'rendered-bytes');
  const siblingPath = join(root, 'unrelated.txt');
  await writeFile(siblingPath, 'unrelated-bytes');
  const location = await locateOwnFile(root, rootReal, filePath);
  assert.ok(location);
  return { base, root, rootReal, filePath, siblingPath, location };
}

/** The fixture is removed only when it really lives inside the temp root. */
async function removeFixture(base) {
  const inside = relative(resolve(tmpdir()), resolve(base));
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) return;
  await rm(base, { recursive: true, force: true });
}

/** Remove the captured file of the fixture with the plain unlink. */
async function removeCaptured(fixture, tempDirectory) {
  return removeOwnRenderedFile(
    fixture.root,
    fixture.rootReal,
    fixture.location,
    tempDirectory ?? (() => fixture.root),
  );
}

test('removes only the owned rendered file', async () => {
  const fixture = await makeFixture();
  try {
    const removed = await removeCaptured(fixture);
    assert.equal(removed, true);
    await assert.rejects(readFile(fixture.filePath, 'utf8'));
    assert.equal(await readFile(fixture.siblingPath, 'utf8'), 'unrelated-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('removes exactly the captured path', async () => {
  const fixture = await makeFixture();
  try {
    const seen = [];
    const removed = await removeOwnRenderedFile(
      fixture.root,
      fixture.rootReal,
      fixture.location,
      () => fixture.root,
      async (path) => {
        seen.push(path);
        await unlink(path);
      },
    );
    assert.equal(removed, true);
    assert.deepEqual(seen, [fixture.location.filePath]);
    await assert.rejects(readFile(fixture.filePath, 'utf8'));
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps a file that replaced the captured one', async () => {
  const fixture = await makeFixture();
  try {
    const movedPath = join(fixture.root, 'moved.wav');
    await rename(fixture.filePath, movedPath);
    await writeFile(fixture.filePath, 'replacement-bytes');
    const removed = await removeCaptured(fixture);
    assert.equal(removed, false);
    assert.equal(await readFile(fixture.filePath, 'utf8'), 'replacement-bytes');
    assert.equal(await readFile(movedPath, 'utf8'), 'rendered-bytes');
    assert.equal(await readFile(fixture.siblingPath, 'utf8'), 'unrelated-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps a symbolic link and the file it points at', async (t) => {
  const fixture = await makeFixture();
  try {
    const targetPath = join(fixture.base, 'outside.bin');
    await writeFile(targetPath, 'outside-bytes');
    await rm(fixture.filePath);
    let linked = false;
    try {
      await symlink(targetPath, fixture.filePath, 'file');
      linked = true;
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    }
    if (!linked) {
      t.skip('symbolic links are not permitted on this machine');
      return;
    }
    const removed = await removeCaptured(fixture);
    assert.equal(removed, false);
    assert.equal((await lstat(fixture.filePath)).isSymbolicLink(), true);
    assert.equal(await readFile(targetPath, 'utf8'), 'outside-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps a file outside the own temp root', async () => {
  const fixture = await makeFixture();
  try {
    const outsidePath = join(fixture.base, 'outside.bin');
    await writeFile(outsidePath, 'outside-bytes');
    const outsideLocation = {
      filePath: outsidePath,
      info: await lstat(outsidePath),
      fileReal: await realpath(outsidePath),
    };
    const removed = await removeOwnRenderedFile(
      fixture.root,
      fixture.rootReal,
      outsideLocation,
      () => fixture.root,
    );
    assert.equal(removed, false);
    assert.equal(await readFile(outsidePath, 'utf8'), 'outside-bytes');
    assert.equal(await readFile(fixture.filePath, 'utf8'), 'rendered-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps the file when the temp directory is not the own root', async () => {
  const fixture = await makeFixture();
  try {
    const otherTemp = resolve(join(fixture.base, 'other'));
    await mkdir(otherTemp);
    const removed = await removeCaptured(fixture, otherTemp);
    assert.equal(removed, false);
    assert.equal(await readFile(fixture.filePath, 'utf8'), 'rendered-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps the file when the own root is not the same root', async () => {
  const fixture = await makeFixture();
  try {
    const staleRootReal = resolve(join(fixture.base, 'stale-root'));
    const removed = await removeOwnRenderedFile(
      fixture.root,
      staleRootReal,
      fixture.location,
      () => fixture.root,
    );
    assert.equal(removed, false);
    assert.equal(await readFile(fixture.filePath, 'utf8'), 'rendered-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('keeps the file when it is already gone', async () => {
  const fixture = await makeFixture();
  try {
    await rm(fixture.filePath);
    const removed = await removeCaptured(fixture);
    assert.equal(removed, false);
    assert.equal(await readFile(fixture.siblingPath, 'utf8'), 'unrelated-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});

test('reports false and does not retry when the removal fails', async () => {
  const fixture = await makeFixture();
  try {
    let calls = 0;
    const removed = await removeOwnRenderedFile(
      fixture.root,
      fixture.rootReal,
      fixture.location,
      () => fixture.root,
      async () => {
        calls += 1;
        throw new Error('removal refused');
      },
    );
    assert.equal(removed, false);
    assert.equal(calls, 1);
    assert.equal(await readFile(fixture.filePath, 'utf8'), 'rendered-bytes');
  } finally {
    await removeFixture(fixture.base);
  }
});
