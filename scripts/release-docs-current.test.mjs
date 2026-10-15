// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const context={};vm.runInNewContext(read('docs/site-i18n.js'),context);const catalog=context.RcSurfaceSiteCatalog;
const pages=['perf','mix','snp','sns','aud','vid','rec'],plans=[...pages,'map'];
const figure=(html,id)=>html.match(new RegExp('<figure class="surface-sheet" id="surface-map-'+id+'"[\\s\\S]*?</figure>'))?.[0];

test('both landing editions expose seven real pages plus MAP, with matching radio/reveal/header contracts',()=>{
  const phone=read('static/phone-v3/index.html');
  assert.deepEqual([...phone.matchAll(/<button class="tab[^"]*"[^>]*>([^<]+)<\/button>/g)].map(match=>match[1]),pages.map(value=>value.toUpperCase()));
  for(const locale of ['en','pt-BR']) {
    const html=read(locale==='en'?'docs/index.html':'docs/pt-br.html');
    assert.deepEqual([...html.matchAll(/<figure class="surface-sheet"[^>]*data-surface-plan="([^"]+)"/g)].map(match=>match[1]),plans);
    for(const id of plans) {
      assert.match(html,new RegExp('id="surface-select-'+id+'"[^>]*aria-controls="surface-map-'+id+'"'));
      assert.match(html,new RegExp('id="surface-label-'+id+'" for="surface-select-'+id+'"'));
      assert.ok(html.includes('#surface-select-'+id+':checked ~ .surface-deck [data-surface-plan="'+id+'"]'));
      const sheet=figure(html,id);assert.ok(sheet,id);
      assert.deepEqual([...sheet.matchAll(/data-page-tab="([^"]+)"/g)].map(match=>match[1]),pages);
      assert.match(sheet,/data-header-mode="aut">AUT<\/text>/);
    }
    assert.doesNotMatch(html,/id="surface-select-aut"/,'AUT is a header mode, never a product page');
    assert.match(figure(html,'rec'),/>Fig\. 7<\/span>/);assert.match(figure(html,'map'),/>Fig\. 8<\/span>/);
  }
});

test('REC plan draws a scaled timeline with end gutters, complete controls and track actions above its workflow table',()=>{
  for(const file of ['docs/index.html','docs/pt-br.html']) {
    const rec=figure(read(file),'rec'),svg=rec.slice(rec.indexOf('<svg'),rec.indexOf('</svg>'));
    for(const label of ['REC','STOP','CLICK','LOOP','PRE-ROLL','OFF','EXCLUSIVE'])assert.ok(svg.includes(label),label);
    assert.match(svg,/ZOOM/);assert.match(svg,/data-end-gutters="both"/);
    assert.deepEqual([...svg.matchAll(/<text x="\d+" y="279"[^>]*>([^<]+)<\/text>/g)].map(match=>match[1]),['OFF','1','2','4']);
    const cards=[...svg.matchAll(/<rect x="(\d+)" y="148" width="64"/g)].map(match=>Number(match[1]));
    assert.deepEqual(cards,[416,704,992]);assert.equal(cards[1]-cards[0],cards[2]-cards[1]);
    assert.ok(cards[0]>400&&cards.at(-1)+64<1070,'both marker cards stay within the timeline frame');
    for(const [bar,x] of [['9.1',425],['13.1',713],['17.1',1001]])assert.match(svg,new RegExp('x="'+x+'" y="164"[^>]*>'+bar.replace('.','\\.')+'<'));
    for(const action of ['arm','solo','mute'])assert.equal([...svg.matchAll(new RegExp('data-rec-track-action="'+action+'"','g'))].length,4);
    for(const key of ['timeline','range','preRoll','tracks','transport'])assert.match(rec,new RegExp('data-i18n="lp.rec.'+key+'Flow"'));
  }
  assert.match(catalog['lp.rec.preRollFlow'].en,/read-only native count-in/);
  assert.match(catalog['lp.rec.transportFlow'].en,/only still-owned state/);
  assert.match(catalog['lp.rec.tracksFlow'].en,/exactly the visible armed set|exact armed set|verifies exactly the visible armed set/);
});

test('PERF AUT and VID plan describe the accepted source options rather than retired page/bank inventories',()=>{
  const automation={};vm.runInNewContext(read('static/phone-v3/xy-automation.js'),automation);
  const {validate,create}=automation.RcXYAutomation;
  assert.equal(create().saved.bars,2);assert.equal(create().saved.seconds,10);
  for(const timing of ['sync','free'])for(const [bars,seconds] of [[1,1],[3,15],[5,30]]) {
    const settings={timing,bars,seconds};assert.equal(JSON.stringify(validate(settings)),JSON.stringify(settings));
  }
  for(const settings of [{timing:'sync',bars:6,seconds:10},{timing:'free',bars:2,seconds:31},{timing:'free',bars:2,seconds:1.5}])assert.throws(()=>validate(settings));
  for(const file of ['docs/index.html','docs/pt-br.html']) {
    const perf=figure(read(file),'perf'),vid=figure(read(file),'vid');
    assert.match(perf,/data-aut-xy-controls="independent"/);assert.match(perf,/AUT · XY 1/);assert.match(perf,/AUT · XY 2/);
    assert.match(perf,/data-i18n="lp.map.autFlow"/);
    assert.match(vid,/data-pose-add="15"/);assert.match(vid,/data-pose-bank="15"/);assert.match(vid,/0 \/ 6/);
    assert.match(vid,/RETAKE\/KEEP/);assert.match(vid,/data-direct-map="xyz-palm-face"/);
    assert.doesNotMatch(vid,/CAMERA DIAGNOSTICS|PALM[^<]*not mapping|PALM[^<]*stay local/);
    assert.match(vid,/PALM 0\.28/);assert.match(vid,/FACE -0\.60/);
  }
  for(const locale of ['en','pt-BR']) {
    assert.match(catalog['lp.map.autFlow'][locale],/SYNC.*1–5.*FREE.*1–30/);
    assert.match(catalog['lp.map.131'][locale],/0–1/);assert.match(catalog['lp.map.131'][locale],/Safe loss/);
  }
});

test('2.0 public upgrade instructions and storage contracts cannot suggest the historical 1.x migrator',()=>{
  for(const suffix of ['.md','.pt-BR.md']) {
    const install=read('docs/INSTALL'+suffix),guide=read('docs/USER-GUIDE'+suffix),custom=read('docs/CUSTOMIZATION'+suffix),contracts=read('docs/CONTRACTS'+suffix);
    for(const text of [install,custom,contracts])assert.match(text,/surface-v2/);
    assert.match(install,/schema 2/);assert.doesNotMatch(install,/Migrate-RC-Surface-Data|Migrate RC Surface Data/);
    assert.doesNotMatch(guide,/six tabs|seis abas|as três linhas/);
    assert.match(guide,/\| REC\s*\|/);assert.match(guide,/ARM MULTI/);assert.match(guide,/EXCLUSIVE/);
    assert.match(contracts,/getPulseTiming/);assert.match(contracts,/\| square \| 15 \|/);assert.match(contracts,/count_in_duration/);
    assert.doesNotMatch(custom,/toggle-4`|button-1`/);
  }
  for(const file of ['README.md','README.pt-BR.md','docs/index.html','docs/pt-br.html'])assert.doesNotMatch(read(file),/e930ebe|523b7d93/,'operator acceptance details belong to the internal record');
  assert.match(read('internal/RELEASE-CANDIDATE-CHECKLIST.pt-BR.md'),/523b7d93/);
});

test('site generation replaces a stale English fallback from its catalog before deriving both language pages',async()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rc-site-catalog-'));try {
    fs.mkdirSync(path.join(fixture,'scripts'));fs.mkdirSync(path.join(fixture,'docs'));
    fs.writeFileSync(path.join(fixture,'scripts/build-site.mjs'),read('scripts/build-site.mjs'));
    fs.writeFileSync(path.join(fixture,'package.json'),read('package.json'));
    fs.writeFileSync(path.join(fixture,'docs/site-i18n.js'),read('docs/site-i18n.js'));
    const source=read('docs/index.html').replace(/(data-i18n="lp.rec.title">)[^<]+/,'$1STALE ENGLISH FALLBACK');
    assert.match(source,/STALE ENGLISH FALLBACK/);fs.writeFileSync(path.join(fixture,'docs/index.html'),source);
    for(const file of ['README.md','docs/INSTALL.md','docs/USER-GUIDE.md','docs/FAQ.md','docs/CUSTOMIZATION.md','docs/COMPATIBILITY.md','docs/SECURITY.md','docs/PRIVACY.md','docs/CONTRACTS.md'])fs.writeFileSync(path.join(fixture,file),read(file));
    const module=await import(pathToFileURL(path.join(fixture,'scripts/build-site.mjs')).href),generated=module.buildSite();
    assert.ok(generated['docs/index.html'].includes('data-i18n="lp.rec.title">'+catalog['lp.rec.title'].en+'<'));
    assert.ok(generated['docs/pt-br.html'].includes('data-i18n="lp.rec.title">'+catalog['lp.rec.title']['pt-BR']+'<'));
    assert.doesNotMatch(generated['docs/index.html'],/STALE ENGLISH FALLBACK/);
    for(const html of [generated['docs/index.html'],generated['docs/pt-br.html']]) {
      const graph=JSON.parse(html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/)[1])['@graph'];
      const app=graph.find(node=>node['@type']==='SoftwareApplication');assert.equal(app.softwareVersion,'2.0.0');
      for(const feature of ['AUT','REC','PALM/FACE'])assert.ok(app.featureList.some(text=>text.includes(feature)),feature);
    }
  } finally {fs.rmSync(fixture,{recursive:true,force:true});}
});
