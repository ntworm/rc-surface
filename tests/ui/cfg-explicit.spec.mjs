// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({width:851,height:393});
});

test('performance holds cannot enter CFG; the header button enables configuration', async ({ page }) => {
  await page.goto('/?lang=en');
  const menu=page.locator('#control-config-menu');
  for(const name of ['pad-1','xy-1','toggle-2']) {
    const control=page.locator(`.page[data-page="performance"] [data-name="${name}"]`).first();
    // Mobile browsers deliver contextmenu after a stationary touch hold.
    await control.dispatchEvent('contextmenu',{ bubbles:true,cancelable:true });
    await expect(page.locator('#btn-cfg-mode')).toHaveAttribute('aria-pressed','false');
    await expect(menu).toBeHidden();
  }
  await page.locator('#btn-cfg-mode').click();
  await page.locator('.page[data-page="performance"] [data-name="toggle-2"]').first().click();
  await expect(menu).toHaveAttribute('data-cfg-open-for','toggle-2');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('#btn-cfg-mode')).toHaveAttribute('aria-pressed','true');
  await page.locator('#btn-cfg-mode').click();
  await page.locator('#btn-aut-mode').click();
  await expect(page.locator('#btn-aut-mode')).toHaveAttribute('aria-pressed','true');
  await page.locator('.xy-pad[data-name="xy-1"]').dispatchEvent('contextmenu',{bubbles:true,cancelable:true});
  await expect(page.locator('#automation-config-menu')).toHaveAttribute('data-cfg-open-for','xy-1');
  await expect(menu).toBeHidden();
});

test('stopped SYNC shows one temporary yellow toast and no footer text', async ({ page }, testInfo) => {
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const message=JSON.parse(raw);
    if(message.type==='resume') socket.send(JSON.stringify({type:'hello',client_id:'aut-warning-test',role:'controller'}));
    if(message.type==='ping') socket.send(JSON.stringify({type:'pong'}));
    if(message.cmd) socket.send(JSON.stringify({id:message.id,ok:true,result:message.cmd==='getMappings'?{mappings:{}}:{}}));
  }));
  await page.goto('/?lang=en');
  await page.locator('#btn-aut-mode').click();
  await page.locator('.xy-pad[data-name="xy-1"]').click();
  await expect(page.locator('#aut-message')).toHaveCount(0);
  await expect(page.locator('#toast-container')).toHaveAttribute('role','status');
  const message=page.locator('#toast-container .toast-warning');
  await expect(message).toHaveCount(1);
  await expect(message).toContainText('SYNC needs Live playback');
  await message.screenshot({path:testInfo.outputPath('aut-single-toast.png')});
  await expect(message).toHaveCount(0,{timeout:4000});
  await page.locator('.xy-pad[data-name="xy-1"]').click();
  await expect(message).toContainText('SYNC needs Live playback');
  await page.locator('#btn-aut-mode').click();
  await expect(message).toHaveCount(0,{timeout:4000});
});
