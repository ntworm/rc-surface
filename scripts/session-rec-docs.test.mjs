// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('REC public EN/PT documents and landing expose implemented Session mode without promising comp or global STOP',()=>{
  const context={};vm.runInNewContext(read('docs/site-i18n.js'),context);const catalog=context.RcSurfaceSiteCatalog;
  for(const [locale,suffix,file] of [['en','','docs/index.html'],['pt-BR','.pt-BR','docs/pt-br.html']]) {
    const guide=read('docs/USER-GUIDE'+suffix+'.md'),contract=read('docs/CONTRACTS'+suffix+'.md'),html=read(file);
    assert.match(guide,/ARRANGEMENT \/ CLIP/);assert.match(guide,/1 \/ 2 \/ 4 \/ 8 \/ 16/);assert.match(guide,/STOP/);assert.match(guide,/SDK\/OSC/);
    for(const cmd of ['recordingSessionRecord','recordingSessionStop','getSessionRecordingState'])assert.ok(contract.includes(cmd),cmd);
    assert.match(contract,/0\/4\/7/);assert.match(contract,/SESSION_STOP_PENDING/);assert.match(contract,/ClipSlot.*playing_status/);
    assert.match(html,/data-rec-destination="arrangement-clip"/);assert.match(html,/data-i18n="lp.rec.clipFlow"/);
    assert.ok(html.includes(catalog['lp.rec.clipFlow'][locale]));assert.match(catalog['lp.rec.clipFlow'][locale],/1\/2\/4\/8\/16/);assert.match(catalog['lp.rec.clipFlow'][locale],/comp/);
    assert.match(read('README'+suffix+'.md'),/ARRANGEMENT \/ CLIP/);
  }
  assert.match(read('.github/release-notes/v2.0.0.md'),/CLIP in REC/);assert.match(read('.github/release-notes/v2.0.0.md'),/CLIP dentro de REC/);
});
