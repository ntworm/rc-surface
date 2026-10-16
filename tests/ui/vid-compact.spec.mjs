// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

const box=(page,selector)=>page.locator(selector).first().boundingBox();

for(const locale of ['en','pt-BR'])for(const viewport of [{width:568,height:320},{width:851,height:393}])
  test(`VID puts + ADD POSE beside REC and gives the freed height to pose cards (${locale} ${viewport.width}x${viewport.height})`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/?lang='+locale);
    await page.locator('.tab[data-page="video"]').click();
    const add=await box(page,'#btn-add-learned-pose'),rec=await box(page,'#vision-recognition-preset'),bar=await box(page,'.vision-command-bar');
    expect(add.y,'same row as the REC selector').toBeGreaterThanOrEqual(bar.y-0.5);
    expect(add.y+add.height).toBeLessThanOrEqual(bar.y+bar.height+0.5);
    expect(add.x,'to the right of REC').toBeGreaterThanOrEqual(rec.x+rec.width-0.5);
    expect(add.x+add.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('.vision-studio-head'),'no bar is left holding only the button').toBeHidden();
    // Pose card G1 is no longer clipped by the old button bar.
    const grid=await box(page,'.vision-pose-grid'),slot=await box(page,'.vision-gesture-slot');
    expect(slot.y+slot.height,'first pose card fits').toBeLessThanOrEqual(grid.y+grid.height+1);
    for(const selector of ['.vision-gesture-list button','.vision-sensor-deck .vision-readout-card'])
      expect((await box(page,selector)).height,selector+' is about half its old height').toBeLessThanOrEqual(26);
    for(const name of ['open','fist','pinch','victory'])await expect(page.locator(`[data-vision-gesture="${name}"]`)).toBeVisible();
    for(const id of ['vision-value-x','vision-value-y','vision-value-z','vision-clutch-state','vision-value-pinch-x','vision-value-pinch-y','vision-value-pinch-z'])
      await expect(page.locator('#'+id)).toBeVisible();
    // Narrow phones keep both selects readable next to the new button.
    for(const id of ['vision-confidence','vision-recognition-preset']){
      const fits=await page.locator('#'+id).evaluate(select=>select.scrollWidth<=select.clientWidth+1||select.clientWidth>=64);
      expect(fits,id+' readable').toBe(true);
    }
    await page.locator('#btn-add-learned-pose').click();
    await expect(page.locator('.vision-gesture-slot')).toHaveCount(await page.locator('.vision-gesture-slot').count());
  });

test('desktop VID keeps the learned-pose header copy and the button in the command row',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await page.goto('/?lang=en');
  await page.locator('.tab[data-page="video"]').click();
  await expect(page.locator('.vision-studio-head')).toContainText('LEARNED POSES');
  await expect(page.locator('.vision-command-bar #btn-add-learned-pose')).toBeVisible();
});
