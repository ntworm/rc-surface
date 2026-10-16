// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

// AUT only on PERF (XY loops), CFG only on PERF/MIX, MAP everywhere except REC.
const MATRIX={performance:[true,true,true],mixer:[false,true,true],snapshots:[false,false,true],sensors:[false,false,true],
  audio:[false,false,true],video:[false,false,true],recording:[false,false,false]};
const ORDER=Object.keys(MATRIX);

async function expectHeader(page,name,viewport,stage=false){
  const [aut,cfg,map]=MATRIX[name];
  for(const [id,visible] of [['btn-aut-mode',aut],['btn-cfg-mode',cfg],['btn-map-mode',map]])
    await expect(page.locator('#'+id),name+' '+id).toBeVisible({visible});
  const always=['btn-trn-mode','btn-stage-mode','status','btn-header-play'];
  for(const id of always)await expect(page.locator('#'+id),name+' '+id).toBeVisible();
  for(const tab of ORDER)await expect(page.locator(`.tab[data-page="${tab}"]`)).toBeVisible();
  // STAGE/EXIT and the connection status must end inside the screen, not be clipped.
  for(const id of always.filter(id=>['btn-stage-mode','status'].includes(id))){
    const box=await page.locator('#'+id).boundingBox();
    expect(box.x+box.width,name+' '+id+' right edge').toBeLessThanOrEqual(viewport.width+0.5);
  }
}

for(const locale of ['en','pt-BR'])for(const viewport of [{width:568,height:320},{width:851,height:393},{width:1280,height:800}])
  test(`header shows AUT/CFG/MAP only where they act (${locale} ${viewport.width}x${viewport.height})`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/?lang='+locale);
    for(const name of ORDER){await page.locator(`.tab[data-page="${name}"]`).click();await expectHeader(page,name,viewport);}
    for(const name of [...ORDER].reverse()){await page.locator(`.tab[data-page="${name}"]`).click();await expectHeader(page,name,viewport);}
    await page.locator('.tab[data-page="video"]').click();
    await page.locator('#btn-stage-mode').click();
    await expect(page.locator('#btn-stage-mode')).toHaveText(await page.evaluate(()=>window.RcSurfaceI18n.t('hdr.exit')));
    await expectHeader(page,'video',viewport,true);
    await page.locator('#btn-stage-mode').click();
  });

for(const locale of ['en','pt-BR'])for(const viewport of [{width:568,height:320},{width:851,height:393},{width:1280,height:800}])
  test(`header common controls keep their geometry across every tab (${locale} ${viewport.width})`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/?lang='+locale);
    await page.evaluate(()=>document.fonts.ready);
    for(const stage of [false,true]){
      if(stage)await page.locator('#btn-stage-mode').click();
      const boxes=new Map();
      for(const name of [...ORDER,...ORDER.slice().reverse()]){
        await page.locator(`.tab[data-page="${name}"]`).click();await page.locator('#status').evaluate((el,locale)=>{el.textContent=locale==='pt-BR'?'CONECTADO · TESTE':'CONNECTED · TEST';},locale);
        await expectHeader(page,name,viewport,stage);
        const panel=await page.locator('.ableton-panel').boundingBox(),status=await page.locator('#status').boundingBox();
        expect(panel.x+panel.width).toBeLessThanOrEqual(status.x);
        const tabs=await page.locator('.tab').all();const lastTab=await tabs.at(-1).boundingBox(),sync=await page.locator('.sync-mode-block').boundingBox();
        expect(lastTab.x+lastTab.width).toBeLessThanOrEqual(sync.x);
        for(const id of ['live-bpm','btn-header-prev','btn-header-play','btn-header-next','btn-trn-mode','btn-map-mode','btn-aut-mode','btn-cfg-mode','btn-stage-mode','status']){
          const control=page.locator('#'+id);if(!await control.isVisible())continue;
          const box=await control.boundingBox();
          expect(box.x,name+' '+id+' left').toBeGreaterThanOrEqual(0);
          expect(box.x+box.width,name+' '+id+' right').toBeLessThanOrEqual(viewport.width+0.5);
          expect(box.y+box.height,name+' '+id+' bottom').toBeLessThanOrEqual(viewport.height);
          if(boxes.has(id))for(const axis of ['x','y','width','height'])expect(Math.abs(box[axis]-boxes.get(id)[axis]),`${name} ${id} ${axis} stage=${stage}`).toBeLessThanOrEqual(1);
          else boxes.set(id,box);
        }
      }
      if(stage)await page.locator('#btn-stage-mode').click();
    }
  });

test('header context survives reload, language change and closes incompatible AUT/CFG/MAP state',async({page})=>{
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang=en');
  await page.locator('#btn-aut-mode').click();await expect(page.locator('#btn-aut-mode')).toHaveAttribute('aria-pressed','true');
  await page.locator('.tab[data-page="mixer"]').click();
  await expect(page.locator('#btn-aut-mode')).toBeHidden();await expect(page.locator('#btn-cfg-mode')).toBeVisible();
  await page.locator('.tab[data-page="performance"]').click();
  await expect(page.locator('#btn-aut-mode')).toHaveAttribute('aria-pressed','false');
  await page.locator('#btn-cfg-mode').click();await expect(page.locator('#btn-cfg-mode')).toHaveAttribute('aria-pressed','true');
  await page.locator('.tab[data-page="video"]').click();
  await expect(page.locator('#btn-cfg-mode')).toBeHidden();
  await page.locator('.tab[data-page="mixer"]').click();await expect(page.locator('#btn-cfg-mode')).toHaveAttribute('aria-pressed','false');
  await page.locator('#btn-map-mode').click();await expect(page.locator('#mapping-mode')).toBeVisible();
  await expect(page.locator('#btn-cfg-mode'),'MAP overlay keeps the MIX header context').toBeVisible();
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#mapping-mode')).toBeHidden();await expect(page.locator('#btn-map-mode')).toBeHidden();
  await expect(page.locator('#page-recording')).toBeVisible();
  expect(await page.evaluate(()=>window.mobileMappingState.open)).toBe(false);
  await page.evaluate(()=>window.RcSurfaceI18n.setLocale?.('pt-BR'));
  await expect(page.locator('#btn-aut-mode')).toBeHidden();await expect(page.locator('#btn-cfg-mode')).toBeHidden();
  await page.reload();
  await expect(page.locator('#btn-aut-mode')).toBeVisible();await expect(page.locator('#btn-cfg-mode')).toBeVisible();
  await page.locator('.tab[data-page="audio"]').click();
  await expect(page.locator('#btn-aut-mode')).toBeHidden();await expect(page.locator('#btn-cfg-mode')).toBeHidden();
  await expect(page.locator('#btn-map-mode')).toBeVisible();
});
