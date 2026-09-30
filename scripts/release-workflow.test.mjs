// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile as readFileRaw } from "node:fs/promises";
import { join } from "node:path";

// Windows checkouts may carry CRLF; every assertion below is written for LF.
const readFile = async (path, encoding) => (await readFileRaw(path, encoding)).replace(/\r\n/g, "\n");

const repoRoot = join(import.meta.dirname, "..");
const validatorPath = join(repoRoot, "scripts", "validate-release-tag.mjs");
const workflowPath = join(repoRoot, ".github", "workflows", "release.yml");
const ciWorkflowPath = join(repoRoot, ".github", "workflows", "ci.yml");
const testBuildWorkflowPath = join(repoRoot, ".github", "workflows", "test-build.yml");
const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const expectedTag = `v${pkg.version}`;

function runValidator(tag) {
  const args = [validatorPath];
  if (tag !== undefined) args.push(tag);
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function jobBlock(workflow, jobName) {
  const marker = `\n  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing ${jobName} job`);
  const bodyStart = start + marker.length;
  const remainder = workflow.slice(bodyStart);
  const nextJob = remainder.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
}

test("release tag validator accepts exactly the package version tag", () => {
  const result = runValidator(expectedTag);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`validated ${expectedTag.replaceAll(".", "\\.")}`));
});

test("release tag validator rejects mismatched, empty, and padded tags", () => {
  const invalidTags = [
    `v${pkg.version}-rc.1`,
    "v0.0.0",
    "",
    undefined,
    ` ${expectedTag} `,
  ];

  for (const tag of invalidTags) {
    const result = runValidator(tag);
    assert.notEqual(result.status, 0, `unexpectedly accepted ${JSON.stringify(tag)}`);
  }
});

test("release workflow validates first and runs full CI on all supported hosts", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const validateJob = jobBlock(workflow, "validate-tag");
  const ciJob = jobBlock(workflow, "ci-multiplatform");

  assert.match(validateJob, /runs-on: ubuntu-latest/);
  assert.match(validateJob, /ref: refs\/tags\/\$\{\{ inputs\.tag \}\}/);
  assert.match(validateJob, /node scripts\/validate-release-tag\.mjs "\$RELEASE_TAG"/);
  assert.match(ciJob, /needs: validate-tag/);
  assert.match(ciJob, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ciJob, /run: npm run ci/);
  assert.match(ciJob, /npx playwright install --with-deps chromium/);
  assert.match(ciJob, /npx playwright install chromium/);
});

test("release workflow packages once after CI and publishes one generic asset", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const buildJob = jobBlock(workflow, "build-asset");
  const releaseJob = jobBlock(workflow, "create-release");

  assert.match(buildJob, /needs: ci-multiplatform/);
  assert.match(buildJob, /runs-on: windows-latest/);
  assert.match(buildJob, /run: npm run build:prod-ablx/);
  assert.match(
    buildJob,
    /path: \|\n\s+RC-Surface-\$\{\{ steps\.package\.outputs\.version \}\}\.ablx\n\s+RC-Midi-Receiver\.amxd\n\s+RC-Audio-Sender\.amxd\n\s+SHA256SUMS\.txt\n/,
  );
  assert.match(buildJob, /Copy-Item static\/RC-Midi-Receiver\.amxd, static\/RC-Audio-Sender\.amxd/);
  assert.match(buildJob, /Get-FileHash -Algorithm SHA256/);
  assert.match(releaseJob, /needs: build-asset/);
  assert.match(
    releaseJob,
    /files: \|\n\s+dist-release\/RC-Surface-\$\{\{ needs\.build-asset\.outputs\.version \}\}\.ablx\n\s+dist-release\/RC-Midi-Receiver\.amxd\n\s+dist-release\/RC-Audio-Sender\.amxd\n\s+dist-release\/SHA256SUMS\.txt\n/,
  );
  assert.match(releaseJob, /body_path: \.github\/release-notes\/\$\{\{ inputs\.tag \}\}\.md/);
  assert.match(releaseJob, /draft: true/, 'the owner publishes the release');
  assert.doesNotMatch(releaseJob, /generate_release_notes: true/);
  assert.equal((workflow.match(/npm run build:prod-ablx/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /RC-Surface-.*-(?:Windows|macOS)\.ablx/);
  assert.doesNotMatch(workflow, /ablx-\$\{\{ matrix\.os \}\}/);
});

test("workflows default to read-only tokens and pin every action by commit", async () => {
  for (const path of [ciWorkflowPath, workflowPath, testBuildWorkflowPath]) {
    const workflow = await readFile(path, "utf8");
    const jobsIndex = workflow.indexOf("\njobs:\n");
    assert.notEqual(jobsIndex, -1, `${path} must define jobs`);

    const workflowHeader = workflow.slice(0, jobsIndex);
    assert.match(
      workflowHeader,
      /\npermissions:\n  contents: read\n/,
      `${path} must deny write access by default`,
    );

    const actionUses = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(\S+))?\s*$/gm)];
    assert.ok(actionUses.length > 0, `${path} must use at least one action`);
    for (const match of actionUses) {
      const action = match[1];
      const versionComment = match[2];
      assert.match(
        action,
        /^[^@\s]+@[0-9a-f]{40}$/,
        `${path} must pin ${action} to an immutable 40-character commit`,
      );
      assert.match(
        versionComment ?? "",
        /^v\d+\.\d+\.\d+$/,
        `${path} must retain a readable release version beside ${action}`,
      );
    }
  }

  const releaseWorkflow = await readFile(workflowPath, "utf8");
  const createReleaseJob = jobBlock(releaseWorkflow, "create-release");
  assert.match(createReleaseJob, /\n    permissions:\n      contents: write\n/);
});

test("CI installs Playwright system dependencies only on Linux", async () => {
  const workflow = await readFile(ciWorkflowPath, "utf8");

  assert.match(
    workflow,
    /name: Install Playwright browser and Linux dependencies\n        if: runner\.os == 'Linux'\n        run: npx playwright install --with-deps chromium/,
  );
  assert.match(
    workflow,
    /name: Install Playwright browser\n        if: runner\.os != 'Linux'\n        run: npx playwright install chromium/,
  );
  assert.equal((workflow.match(/--with-deps/g) ?? []).length, 1);
});

test("test builds stay private to the workflow and never touch Live or releases", async () => {
  const workflow = await readFile(testBuildWorkflowPath, "utf8");
  assert.match(workflow, /ABLETON_RC_DEV_SYNC: '0'/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.match(workflow, /retention-days: 14/);
  assert.doesNotMatch(workflow, /action-gh-release|contents: write|gh release/);
  assert.equal((workflow.match(/npm run build:prod-ablx/g) ?? []).length, 1);
});

test("the release for the current version has hand-written notes and the tag job requires them", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(jobBlock(workflow, "validate-tag"), /test -s "\.github\/release-notes\/\$\{RELEASE_TAG\}\.md"/);
  const notes = await readFile(join(repoRoot, ".github", "release-notes", `${expectedTag}.md`), "utf8");
  assert.match(notes, new RegExp(`RC Surface ${pkg.version.replaceAll(".", "\\.")}`));
  assert.match(notes, new RegExp(`RC-Surface-${pkg.version.replaceAll(".", "\\.")}\\.ablx`));
  assert.match(notes, /SHA256SUMS\.txt/);
  assert.match(notes, /USER-GUIDE\.pt-BR\.md/, "the notes link the Portuguese guide");
});
