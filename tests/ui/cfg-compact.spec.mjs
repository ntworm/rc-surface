// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

for(const locale of ['en','pt-BR'])for(const viewport of [{width:568,height:320},{width:851,height:393}])
  test(`CFG popover is compact on PERF and MIX and keeps every option (${locale} ${viewport.width}x${viewport.height})`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/?lang='+locale);
    const menu=page.locator('#control-config-menu');
    for(const [tab,control] of [['performance','toggle-2'],['mixer','fader-1']]){
      await page.locator(`.tab[data-page="${tab}"]`).click();
      await page.locator('#btn-cfg-mode').click();
      await page.locator(`.page:not(.hidden) [data-name="${control}"]`).first().click();
      await expect(menu).toBeVisible();
      const box=await menu.boundingBox();
      expect(box.width,'leaves the surface around it in view').toBeLessThanOrEqual(viewport.width*0.55);
      const heights=await menu.locator('.cfg-segment-btn, .cfg-grid-btn, .cfg-action, .cfg-details > summary').evaluateAll(list=>list.filter(item=>item.getClientRects().length).map(item=>item.getBoundingClientRect().height));
      expect(heights.length,tab+' menu has controls').toBeGreaterThan(0);
      for(const height of heights)expect(height).toBeLessThanOrEqual(30);
      const body=menu.locator('.cfg-menu-body');
      expect(await body.evaluate(element=>getComputedStyle(element).overflowY)).toBe('auto');
      expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
      await page.keyboard.press('Escape');await page.locator('#btn-cfg-mode').click();
    }
  });

test('Deep Sync sliders are flat, keyboard-operable and show their value',async({page})=>{
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang=en');
  await page.locator('#btn-sync-settings').click();
  for(const id of ['lfo-phase-offset','pulse-swing','pulse-phase-offset']){
    const slider=page.locator('#'+id);
    expect(await slider.evaluate(element=>getComputedStyle(element).appearance),id).toBe('none');
    expect((await slider.boundingBox()).height,id).toBeLessThanOrEqual(26);
  }
  const swing=page.locator('#pulse-swing');await swing.scrollIntoViewIfNeeded();await swing.focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await expect(swing).toHaveValue('0.1');await expect(page.locator('#pulse-swing-val')).toHaveText('0.10');
  await expect.poll(()=>swing.evaluate(element=>element.style.getPropertyValue('--range-progress'))).toMatch(/^15\.15\d*%$/);
  expect(await page.evaluate(()=>window.syncSettings.pulseSwing)).toBe(0.1);
  const phase=page.locator('#pulse-phase-offset');await phase.focus();await page.keyboard.press('End');
  await expect(phase).toHaveValue('2');await expect.poll(()=>phase.evaluate(element=>element.style.getPropertyValue('--range-progress'))).toBe('100%');
  const panel=page.locator('#sync-settings-overlay .transport-modal');
  expect((await panel.boundingBox()).height).toBeLessThanOrEqual(393);
});
