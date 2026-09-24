// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// What a search engine or an AI crawler reads about the project: the head of
// both landing pages, the Portuguese page as its own URL, the sitemap and the
// llms files. None of it fails to render when it goes stale — it just goes
// stale in someone else's index — so the drift is asserted here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildSite } from './build-site.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SITE = 'https://ntworm.github.io/rc-surface/';

test('the generated site files match their sources', () => {
  for (const [rel, content] of Object.entries(buildSite())) {
    assert.ok(fs.existsSync(path.join(root, rel)), `${rel} is missing — run npm run build:site`);
    assert.ok(read(rel) === content, `${rel} is stale — run npm run build:site`);
  }
});

function head(html) {
  return html.slice(0, html.indexOf('</head>'));
}

function jsonLd(html) {
  const m = head(html).match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
  assert.ok(m, 'JSON-LD block missing');
  return JSON.parse(m[1]);
}

test('each landing page names itself and its sibling in the other language', () => {
  const pages = { en: [read('docs/index.html'), SITE], 'pt-BR': [read('docs/pt-br.html'), SITE + 'pt-br.html'] };
  for (const [locale, [html, url]] of Object.entries(pages)) {
    const h = head(html);
    assert.match(html, new RegExp(`<html lang="${locale}"`));
    assert.ok(h.includes(`<link rel="canonical" href="${url}">`), `${locale} canonical`);
    for (const [lang, href] of [['en', SITE], ['pt-BR', SITE + 'pt-br.html'], ['x-default', SITE]]) {
      assert.ok(h.includes(`<link rel="alternate" hreflang="${lang}" href="${href}">`), `${locale} → ${lang}`);
    }
    assert.equal((h.match(/<title>/g) || []).length, 1, `${locale} has one title`);
    const description = h.match(/<meta name="description" content="([^"]+)">/)[1];
    // Google shows about 160 characters; past that the pitch is cut mid-word.
    assert.ok(description.length >= 120 && description.length <= 170, `${locale} description length ${description.length}`);
  }
  // The Portuguese page opens in Portuguese even for a browser that last chose English.
  assert.match(pages['pt-BR'][0], /<html lang="pt-BR" data-default-locale="pt-BR">/);
});

test('the structured data describes the product and repeats only the FAQ the page shows', () => {
  for (const rel of ['docs/index.html', 'docs/pt-br.html']) {
    const html = read(rel);
    const graph = jsonLd(html)['@graph'];
    const app = graph.find((node) => node['@type'] === 'SoftwareApplication');
    assert.equal(app.name, 'RC Surface');
    assert.equal(app.softwareVersion, JSON.parse(read('package.json')).version);
    assert.ok(app.featureList.length >= 8);
    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 6, `${rel}: the sheet asks six questions`);
    const body = html.slice(html.indexOf('id="faq"'), html.indexOf('id="docs"'));
    for (const question of faq.mainEntity) {
      assert.ok(body.includes(question.name.replace(/&/g, '&amp;')), `${rel}: "${question.name}" is not on the page`);
    }
  }
});

test('the sitemap lists both landing pages as a language pair', () => {
  const sitemap = read('docs/sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [SITE, SITE + 'pt-br.html']);
  assert.equal((sitemap.match(/hreflang="pt-BR"/g) || []).length, 2);
});

test('llms.txt only points at files that exist', () => {
  const llms = read('docs/llms.txt');
  assert.match(llms, /^# RC Surface\n\n> /, 'llms.txt opens with the name and a one-paragraph summary');
  const raw = [...llms.matchAll(/https:\/\/raw\.githubusercontent\.com\/ntworm\/rc-surface\/main\/([^)\s]+)/g)].map((m) => m[1]);
  const site = [...llms.matchAll(/https:\/\/ntworm\.github\.io\/rc-surface\/([^)\s]*)/g)].map((m) => m[1] || 'index.html');
  assert.ok(raw.length >= 10);
  for (const rel of raw) assert.ok(fs.existsSync(path.join(root, rel)), `llms.txt links a missing ${rel}`);
  for (const rel of site) assert.ok(fs.existsSync(path.join(root, 'docs', rel)), `llms.txt links a missing docs/${rel}`);
});

test('the IndexNow key file proves the key it is named after', () => {
  const keys = fs.readdirSync(path.join(root, 'docs')).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
  assert.equal(keys.length, 1, 'exactly one IndexNow key file in docs/');
  assert.equal(read('docs/' + keys[0]), keys[0].slice(0, -4));
});
