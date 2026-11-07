// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Renders docs/og-image.png: the social card of the landing page.
//
// The card shows the real PERF page, captured from the UI test server on a
// phone held in landscape (844 x 390 CSS pixels at three times the density),
// inside a phone of the same proportion. The release printed on the card and
// stored in its metadata comes from package.json, so the committed card and
// the package cannot drift.
//
//   node scripts/render-og-image.mjs [output.png]

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'docs', 'og-image.png'));
const templatePath = path.join(import.meta.dirname, 'og-image-template.html');
const fontPath = path.join(import.meta.dirname, 'assets', 'fonts', 'DepartureMono-Regular.otf');
const SERVER = 'http://localhost:9880';

/** The release the card prints. */
async function packageVersion() {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

/** Waits for the UI test server to answer. */
async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER}/?lang=en`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`UI test server did not answer at ${SERVER}`);
}

/** A PNG text chunk, so the card says which release it shows. */
function textChunk(keyword, text) {
  const data = Buffer.from(`${keyword}\0${text}`, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const type = Buffer.from('tEXt', 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0);
  return Buffer.concat([length, type, data, crc]);
}

/** Puts text chunks right after the header chunk of a PNG. */
function withText(png, entries) {
  const headerEnd = 8 + 4 + 4 + png.readUInt32BE(8) + 4;
  const chunks = entries.map(([keyword, text]) => textChunk(keyword, text));
  return Buffer.concat([png.subarray(0, headerEnd), ...chunks, png.subarray(headerEnd)]);
}

const version = await packageVersion();
const server = spawn(process.execPath, ['tests/ui/test-server.mjs'], {
  cwd: root,
  stdio: 'ignore',
});
const browser = await chromium.launch();
try {
  await waitForServer();
  const phone = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await phone.newPage();
  await page.goto(`${SERVER}/?lang=en`);
  await page.getByText('PERF', { exact: true }).first().waitFor();
  await page.waitForTimeout(800);
  const screen = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  await phone.close();

  const font = await fs.readFile(fontPath);
  const html = (await fs.readFile(templatePath, 'utf8'))
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{FONT_DATA_URI}}', `data:font/otf;base64,${font.toString('base64')}`)
    .replaceAll('{{SCREEN_DATA_URI}}', `data:image/png;base64,${screen.toString('base64')}`);
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await card.setContent(html, { waitUntil: 'load' });
  await card.evaluate(() => globalThis.document.fonts.ready);
  const png = await card.screenshot({ animations: 'disabled', caret: 'hide' });
  await fs.writeFile(
    output,
    withText(png, [
      ['Release', `v${version}`],
      ['Screen', 'PERF 844x390'],
    ]),
  );
  process.stdout.write(`wrote ${path.relative(root, output)} (v${version})\n`);
} finally {
  await browser.close();
  server.kill();
}
