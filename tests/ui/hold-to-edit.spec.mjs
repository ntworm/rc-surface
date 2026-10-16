// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

// Synthetic touch PointerEvents in the real page: they reach the same
// listeners a phone touch reaches, without the browser's own scroll.
async function touch(locator,type,x,y){
  await locator.evaluate((element,[type,x,y])=>element.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:7,isPrimary:true,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true})),[type,x,y]);
}

async function openCurve(page){
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang=en');
  await page.waitForFunction(()=>window.openMobileMappingMode&&window.phoneWs?.readyState===1);
  await page.evaluate(async()=>{
    const mappings={'fader-1':[{type:'tempo',mode:'continuous',curve:'linear',outMin:0.2,outMax:0.9,drive:0}]};
    window.sendPhoneCommand=(cmd,args,cb)=>{
      if(cmd==='getMappings'){cb?.({ok:true,result:{mappings}});return true;}
      if(cmd==='setMapping'){mappings[args.control]=args.targets;cb?.({ok:true});return true;}
      cb?.({ok:true,result:{mappings:{},clients:[],presets:['Default'],current:'Default',targets:[]}});return true;
    };
    document.getElementById('orientation-warning')?.remove();
    await window.openMobileMappingMode();
    window.mobileMappingState.currentMappings=mappings;window.currentControlMappings=mappings;
    window.mobileMappingState.selectedControl='fader-1';window.mobileMappingState.selectedTargetIndex=0;window.renderDetail();
  });
  const canvas=page.locator('#map-mobile-detail .map-curve-canvas');
  await canvas.scrollIntoViewIfNeeded();
  // Left handle (outMin) at input 0: plot x/y use the editor's 14px inset.
  const at=output=>canvas.evaluate((element,output)=>{const r=element.getBoundingClientRect();
    return {x:r.left+14*r.width/element.width,y:r.top+(14+(1-output)*(element.height-28))*r.height/element.height};},output);
  const outMin=()=>page.evaluate(()=>window.mobileMappingState.currentMappings['fader-1'][0].outMin);
  return {canvas,at,outMin};
}

test('MAP curve on a phone: tap or scroll never edits; hold, drag and release edits one handle',async({page})=>{
  const {canvas,at,outMin}=await openCurve(page);
  expect(await canvas.evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
  const scroller=await canvas.evaluate(element=>{let node=element.parentElement;while(node&&!/(auto|scroll)/.test(getComputedStyle(node).overflowY))node=node.parentElement;return node?.id||node?.className||null;});
  expect(scroller,'a scrolling panel owns the vertical pan').not.toBeNull();
  const start=await at(0.2),target=await at(0.6);
  // Quick tap with a short wobble.
  await touch(canvas,'pointerdown',start.x,start.y);await touch(canvas,'pointermove',start.x+2,start.y+2);await touch(canvas,'pointerup',start.x,start.y);
  // A scroll-like swipe that starts on the handle.
  await touch(canvas,'pointerdown',start.x,start.y);await touch(canvas,'pointermove',start.x,target.y);await page.waitForTimeout(700);
  await touch(canvas,'pointermove',start.x,target.y-10);await touch(canvas,'pointerup',start.x,target.y-10);
  // Touch on the background far from all three handles.
  const background=await at(0.95);
  await touch(canvas,'pointerdown',background.x+120,background.y);await page.waitForTimeout(700);
  await touch(canvas,'pointermove',background.x+120,target.y);await touch(canvas,'pointerup',background.x+120,target.y);
  expect(await outMin()).toBe(0.2);
  await expect(canvas).not.toHaveAttribute('data-hold-edit');
  // Hold, see the selection, drag, release.
  await touch(canvas,'pointerdown',start.x,start.y);await page.waitForTimeout(700);
  await expect(canvas).toHaveAttribute('data-hold-edit','outMin');
  await touch(canvas,'pointermove',start.x,target.y);await touch(canvas,'pointerup',start.x,target.y);
  await expect.poll(outMin).toBe(0.6);
  await expect(canvas).not.toHaveAttribute('data-hold-edit');
  const outMax=await page.evaluate(()=>window.mobileMappingState.currentMappings['fader-1'][0].outMax);
  expect(outMax,'only the held handle changed').toBe(0.9);
  // Cancel mid-drag restores the value the handle had when it was selected.
  const now=await at(0.6),other=await at(0.3);
  await touch(canvas,'pointerdown',now.x,now.y);await page.waitForTimeout(700);
  await touch(canvas,'pointermove',now.x,other.y);
  await touch(canvas,'pointercancel',now.x,other.y);
  await expect.poll(outMin).toBe(0.6);
  await expect(canvas).not.toHaveAttribute('data-hold-edit');
});

test('MAP editor is compact on a phone: small action rows and a short curve',async({page})=>{
  const {canvas}=await openCurve(page);
  const buttons=await page.locator('#map-mobile-detail .map-detail-actions button').evaluateAll(list=>list.map(button=>button.getBoundingClientRect().height));
  expect(buttons.length).toBeGreaterThanOrEqual(6);
  for(const height of buttons)expect(height).toBeLessThanOrEqual(30);
  expect((await canvas.boundingBox()).height).toBeLessThanOrEqual(90);
  for(const label of ['Bind','Trigger Note','Launch Clip','Unbind Target','Clear Control','Clear All Mappings'])
    await expect(page.locator('#map-mobile-detail .map-detail-actions').getByRole('button',{name:label,exact:true})).toBeVisible();
});

test('Burst envelope on a phone: scroll passes through, holding the peak edits attack',async({page})=>{
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang=en');
  await page.locator('#btn-sync-settings').click();
  const env=page.locator('#burst-env');await env.scrollIntoViewIfNeeded();
  expect(await env.evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
  expect((await env.boundingBox()).height).toBeLessThanOrEqual(66);
  const peak=await page.locator('#burst-env-peak').evaluate(circle=>{const r=circle.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,round:Math.abs(r.width-r.height)<1.5};});
  expect(peak.round,'peak stays a circle in the short strip').toBe(true);
  const attack=()=>page.locator('#burst-attack').inputValue();
  const before=await attack(),box=await env.boundingBox();
  await touch(env,'pointerdown',peak.x,peak.y);await touch(env,'pointermove',peak.x+60,peak.y);await touch(env,'pointerup',peak.x+60,peak.y);
  await touch(env,'pointerdown',box.x+box.width*0.8,peak.y);await page.waitForTimeout(700);await touch(env,'pointerup',box.x+box.width*0.8,peak.y);
  expect(await attack()).toBe(before);
  await touch(env,'pointerdown',peak.x,peak.y);await page.waitForTimeout(700);
  await touch(env,'pointermove',box.x+box.width*0.3,peak.y);await touch(env,'pointerup',box.x+box.width*0.3,peak.y);
  await expect.poll(attack).not.toBe(before);
  expect(Number(await attack())).toBeCloseTo(0.3,1);
});
