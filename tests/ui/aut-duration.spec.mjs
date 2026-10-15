// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

for(const locale of ['en','pt-BR'])test(`AUT duration slider and five bar choices persist without passive axis output (${locale})`,async({page},testInfo)=>{
  const messages=[];
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const message=JSON.parse(raw);messages.push(message);
    if(message.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'aut-duration-test',role:'controller'}));
    if(message.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(message.cmd)socket.send(JSON.stringify({id:message.id,ok:true,result:message.cmd==='getMappings'?{mappings:{}}:{}}));
  }));
  await page.setViewportSize({width:851,height:393});
  await page.goto('/?lang='+locale);
  await page.locator('#btn-aut-mode').click();
  await page.locator('.xy-pad[data-name="xy-1"]').click({button:'right'});
  const menu=page.locator('#automation-config-menu');
  await expect(menu).toHaveAttribute('data-cfg-open-for','xy-1');
  await expect(menu.locator('.cfg-segment-group').nth(1).locator('button')).toHaveText(['1','2','3','4','5']);
  const capture=()=>page.evaluate(()=>window.PerformanceSettings.capture().automation.xy['xy-1']);
  const defaults=await capture();expect(defaults).toMatchObject({timing:'sync',bars:2,seconds:10});
  await menu.locator('[data-value="free"]').click();
  const slider=menu.locator('input[type="range"]'),value=menu.locator('.cfg-slider-value');
  await expect(slider).toHaveAttribute('min','1');await expect(slider).toHaveAttribute('max','30');await expect(slider).toHaveAttribute('step','1');
  await expect(value).toHaveText('10 s');
  expect((await slider.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(slider).toHaveCSS('appearance','none');
  await slider.focus();await slider.press('Home');await expect(value).toHaveText('1 s');
  await slider.press('ArrowRight');await expect(value).toHaveText('2 s');
  await slider.press('End');await expect(value).toHaveText('30 s');
  expect(await slider.evaluate(el=>el.matches(':focus-visible'))).toBe(true);
  await expect(slider).toHaveCSS('outline-style','solid');
  expect(await capture()).toMatchObject({seconds:30});
  await expect.poll(()=>messages.filter(message=>message.cmd==='saveProjectClientState').at(-1)?.args?.preferences?.performance?.automation?.xy?.['xy-1']?.seconds).toBe(30);
  await menu.screenshot({path:testInfo.outputPath('aut-free-'+locale+'.png')});
  const box=await slider.boundingBox();
  await page.mouse.move(box.x+box.width-9,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height/2,{steps:6});await page.mouse.up();
  const dragged=Number(await slider.inputValue());expect(dragged).toBeGreaterThan(1);expect(dragged).toBeLessThan(30);
  expect(await capture()).toMatchObject({seconds:dragged});await expect(value).toHaveText(dragged+' s');
  await slider.press('End');
  await menu.locator('[data-value="sync"]').click();
  for(const bars of [3,5]) {
    await menu.locator('.cfg-segment-group').nth(1).locator(`[data-value="${bars}"]`).click();
    expect(await capture()).toMatchObject({timing:'sync',bars,seconds:30});
  }
  await menu.screenshot({path:testInfo.outputPath('aut-sync-'+locale+'.png')});
  await page.reload();
  expect(await capture()).toMatchObject({timing:'sync',bars:5,seconds:30});
  expect(await page.evaluate(()=>window.XYAutomation.get('xy-1').stage)).toBe('stopped');
  const outputs=messages.flatMap(message=>message.type==='control'?[message.control || message]:message.type==='controls'?message.controls || []:[]);
  expect(outputs.filter(control=>/^xy-[12](\.[xy])?$/.test(control.name || ''))).toEqual([]);
});
