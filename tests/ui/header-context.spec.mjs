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
  // STAGE deliberately folds the connection badge away; EXIT must stay reachable.
  const always=stage?['btn-trn-mode','btn-stage-mode','btn-header-play']:['btn-trn-mode','btn-stage-mode','status','btn-header-play'];
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
