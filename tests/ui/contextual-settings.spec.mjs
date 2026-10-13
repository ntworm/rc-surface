import { test, expect } from '@playwright/test';
test.beforeEach(async ({page})=>{await page.setViewportSize({width:851,height:393});});
for (const locale of ['en', 'pt-BR']) {
  test(`settings route tabs without activating inputs (${locale})`, async ({page},testInfo) => {
    await page.goto('/?lang=' + locale);
    const gear = page.locator('#btn-sync-settings');
    await gear.click();
    await expect(page.locator('#sync-settings-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    for (const name of ['video', 'audio', 'sensors']) {
      await page.locator(`.tab[data-page="${name}"]`).click();
      await gear.click();
      await expect(page.locator('#page-settings-overlay')).toBeVisible();
      await expect(page.locator(`#page-settings-${name}`)).toBeVisible();
      await expect(page.locator('#sync-settings-overlay')).toBeHidden();
      if (name === 'video') await page.screenshot({path:testInfo.outputPath('video-settings-'+locale+'.png'),animations:'disabled'});
      await page.keyboard.press('Escape');
      await expect(gear).toBeFocused();
    }
    for (const id of ['chk-audio-enable', 'chk-vision-enable']) await expect(page.locator('#' + id)).not.toBeChecked();
    for (const name of ['mixer', 'snapshots']) {
      await page.locator(`.tab[data-page="${name}"]`).click();
      await expect(gear).toBeHidden();
    }
  });
}
for(const locale of ['en','pt-BR']) test(`Receiver errors and duplicate notice use ${locale}`,async({page})=>{
  await page.goto('/?lang='+locale);
  for(const reason of ['receiver_missing','receiver_upgrade_required','receiver_ambiguous','unknown']) {
    await page.evaluate(async reason=>{
      window.sendPhoneCommand=(cmd,args,cb)=>{cb({ok:false,error:'Erro em português que não pertence à UI inglesa',result:{reason}});return true;};
      window.mobileMappingState.selectedControl='pad-1';
      await window.createMobileTriggerNoteTarget({trackIndex:0,isMidi:true});
    },reason);
    const key={receiver_missing:'map.receiverMissing',receiver_upgrade_required:'map.receiverUpgrade',receiver_ambiguous:'map.receiverAmbiguous',unknown:'map.receiverVerifyFailed'}[reason];
    const expected=await page.evaluate(key=>window.RcSurfaceI18n.t(key),key);
    await expect(page.locator('#map-mobile-status')).toHaveText(expected);
  }
  await page.evaluate(async()=>{
    window.mobileMappingState.currentMappings={'pad-1':[{type:'tempo'}]};
    await window.bindMobileTarget({type:'tempo'});
  });
  await expect(page.locator('#map-mobile-status')).toHaveText(await page.evaluate(()=>window.RcSurfaceI18n.t('map.duplicateParameter')));
});
test('VID preferences restore host authority, retain six captures and close overlays on programmatic navigation',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('ableton-rc:vision_safety',JSON.stringify({gestureOptions:{maxTakes:3},gestures:{version:9,templates:[]}})));
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="video"]').click();await page.locator('#btn-sync-settings').click();
  await expect(page.locator('#vision-loss-mode')).toHaveValue('hold');await expect(page.locator('#vision-loss-legacy')).toBeVisible();
  await page.evaluate(()=>window.VisionSettings.setPolicy({version:1,mode:'timeout',timeoutMs:10000,legacy:false}));
  await expect(page.locator('#vision-loss-mode')).toHaveValue('timeout');await expect(page.locator('#vision-loss-timeout')).toHaveValue('10');
  await page.evaluate(()=>window.applyProjectClientState({preferences:{visionLoss:{version:1,mode:'release',timeoutMs:10000,legacy:false}}}));
  await expect(page.locator('#vision-loss-mode')).toHaveValue('release');await expect(page.locator('#vision-loss-timeout-row')).toBeHidden();
  await expect(page.locator('.vision-gesture-slot header strong').first()).toHaveText('0 / 6');
  await page.evaluate(()=>window.showPhonePage('audio'));
  await expect(page.locator('#page-settings-overlay')).toBeHidden();await expect(page.locator('.tab[data-page="audio"]')).toBeFocused();
});
test('SYNC long press is PERF-only and MAP/TRN preserve the underlying video context',async({page})=>{
  await page.goto('/?lang=en');await page.locator('.tab[data-page="video"]').click();
  await page.locator('#btn-sync-mode').dispatchEvent('mousedown');await page.waitForTimeout(650);await page.locator('#btn-sync-mode').dispatchEvent('mouseup');
  await expect(page.locator('#sync-settings-overlay')).toBeHidden();
  await page.locator('#btn-map-mode').click();
  await page.evaluate(()=>document.getElementById('btn-sync-settings').click());
  await expect(page.locator('#page-settings-video')).toBeVisible();await page.keyboard.press('Escape');
});
test('PERF long press consumes only its click; short tap, cancel and keyboard keep normal SYNC toggle',async({page})=>{
  await page.goto('/?lang=en');await page.clock.install();
  await page.evaluate(()=>{window.testModulatorEmits=0;window.emitAllModulatorStates=()=>window.testModulatorEmits++;});
  const button=page.locator('#btn-sync-mode'), overlay=page.locator('#sync-settings-overlay');
  const before=await page.evaluate(()=>window.syncMode);
  await button.dispatchEvent('touchstart');await page.clock.runFor(650);await button.dispatchEvent('touchend');await button.dispatchEvent('click');
  await expect(overlay).toBeVisible();expect(await page.evaluate(()=>window.syncMode)).toBe(before);
  expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(0);
  await page.keyboard.press('Escape');
  await button.dispatchEvent('touchstart');await page.clock.runFor(50);await button.dispatchEvent('touchend');await button.dispatchEvent('click');
  expect(await page.evaluate(()=>window.syncMode)).not.toBe(before);expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(1);
  await button.dispatchEvent('touchstart');await page.clock.runFor(100);await button.dispatchEvent('touchcancel');await page.clock.runFor(650);
  await expect(overlay).toBeHidden();
  await button.focus();await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>window.syncMode)).toBe(before);expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(2);
  await button.dispatchEvent('mousedown');await page.clock.runFor(650);await button.dispatchEvent('mouseup');await button.dispatchEvent('click');
  await expect(overlay).toBeVisible();expect(await page.evaluate(()=>window.syncMode)).toBe(before);expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(2);
  await page.keyboard.press('Escape');await page.locator('#btn-sync-settings').click();await page.keyboard.press('Escape');
  await button.click();expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(3);
  const mode=await page.evaluate(()=>window.syncMode);
  await button.dispatchEvent('touchstart');await page.clock.runFor(650);await button.dispatchEvent('touchend');
  await button.dispatchEvent('mousedown');await button.dispatchEvent('mouseup');await button.dispatchEvent('click');
  await expect(overlay).toBeVisible();expect(await page.evaluate(()=>window.syncMode)).toBe(mode);expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(3);
  await button.dispatchEvent('touchcancel');await page.keyboard.press('Escape');await button.click();expect(await page.evaluate(()=>window.testModulatorEmits)).toBe(4);
});
for(const locale of ['en','pt-BR']) test(`mapping confirmations show ${locale}; cancel preserves mappings and emits no RPC`,async({page})=>{
  await page.goto('/?lang='+locale);
  const name='Studio <safe> "A"';
  await page.evaluate(async name=>{
    window.testMappingCalls=[];
    const fixtures={getTargets:{targets:[]},getMappings:{mappings:{'pad-1':[{type:'tempo'}]}},getClients:{clients:[]},listPresets:{presets:[name],current:name},getProjectConfigStatus:{report:{loaded:1,relinked:0,review:0,ambiguous:0,missing:0},clientState:{}}};
    window.sendPhoneCommand=(cmd,args,callback)=>{window.testMappingCalls.push({cmd,args});callback({ok:true,result:fixtures[cmd]||{}});return true;};
    window.mobileMappingState.selectedControl='pad-1';await window.openMobileMappingMode();
  },name);
  await expect(page.locator('.map-preset-select')).toHaveCount(2);
  await page.evaluate(name=>{document.querySelectorAll('.map-preset-select').forEach(select=>select.value=name);window.testMappingCalls=[];},name);
  const prompts=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
  await page.evaluate(()=>window.clearAllMobileMappings());
  for(const [root,labelKey]of [['map-mobile-presets','mm.delete'],['map-mobile-detail','mm.delete'],['map-mobile-detail','mm.unbindTarget'],['map-mobile-detail','mm.clearControl']]){
    const label=await page.evaluate(key=>window.RcSurfaceI18n.t(key),labelKey);
    await page.locator('#'+root).getByText(label,{exact:true}).dispatchEvent('click');
  }
  const expected=locale==='en'
    ? ['Clear ALL mappings? This cannot be undone.',`Delete preset "${name}"?`,`Delete preset "${name}"?`,'Remove this mapping?','Clear all mappings for this control?']
    : ['Apagar TODOS os mapeamentos? Esta ação não pode ser desfeita.',`Apagar o preset "${name}"?`,`Apagar o preset "${name}"?`,'Remover este mapeamento?','Apagar todos os mapeamentos deste controle?'];
  expect(prompts).toEqual(expected);expect(await page.evaluate(()=>window.testMappingCalls.length)).toBe(0);
  expect(await page.evaluate(()=>window.mobileMappingState.currentMappings['pad-1'])).toEqual([{type:'tempo'}]);
});
