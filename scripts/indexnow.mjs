#!/usr/bin/env node
// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver — and through
 * Bing, ChatGPT search and DuckDuckGo) that the landing pages changed, so they
 * recrawl within hours instead of whenever they next pass by. Google does not
 * take part in IndexNow; it reads docs/sitemap.xml through Search Console.
 *
 * The key is public by design: docs/<key>.txt proves this host owns it.
 *
 *   node scripts/indexnow.mjs            submit every URL in docs/sitemap.xml
 *   node scripts/indexnow.mjs --dry-run  print the request instead
 */
import fs from 'node:fs';
import path from 'node:path';

const docs = path.resolve(import.meta.dirname, '..', 'docs');
const SITE = 'https://ntworm.github.io/rc-surface/';

const keyFile = fs.readdirSync(docs).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) throw new Error('docs/<32 hex>.txt, the IndexNow key file, is missing');
const key = keyFile.slice(0, -4);
if (fs.readFileSync(path.join(docs, keyFile), 'utf8').trim() !== key) {
  throw new Error(`${keyFile} must contain exactly its own name`);
}

const sitemap = fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const body = {
  host: new URL(SITE).host,
  key,
  keyLocation: SITE + keyFile,
  urlList,
};

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify(body, null, 2));
} else {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200 and 202 both mean accepted; anything else is worth reading in the log.
  console.log(`IndexNow ${response.status} for ${urlList.length} URLs`);
  if (response.status !== 200 && response.status !== 202) {
    console.error(await response.text());
    process.exit(1);
  }
}
