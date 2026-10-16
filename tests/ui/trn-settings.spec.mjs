// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

function liveMock(page,{role='controller'}={}){
  const live={quantization:4,metronome:false,linked:true},writes=[],sockets=[];
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const recording=()=>({transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(live.metronome)},
    tracks:[{index:0,id:'d',name:'Drums',arm:false,canArm:true,solo:false,mute:false,volume:.5}],locators:[{name:'A',time:0}],
    meter:{numerator:4,denominator:4},pending:null,range:null,capture:null,safety:{},session:{songId:'s',scenes:[],rows:[],owned:[]}});
  const quant=()=>({value:live.linked?live.quantization:null,label:null,pending:false,available:live.linked,connected:live.linked});
  return {live,writes,sockets,ready:page.routeWebSocket('**/ws*',socket=>{sockets.push(socket);socket.onMessage(raw=>{
    const m=JSON.parse(raw);
    if(m.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'trn',role}));
    if(m.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(!m.cmd)return;
    let result={ok:true};
    if(['setGlobalClipQuantization','recordingClick'].includes(m.cmd))writes.push(m);
    if(m.cmd==='getClipLaunchStatus')result={statuses:[],diagnostics:[],globalQuantization:quant()};
    else if(m.cmd==='setGlobalClipQuantization'){live.quantization=m.args.quantization;result={quantization:live.quantization};}
    else if(m.cmd==='getRecordingState')result=recording();
    else if(m.cmd==='recordingClick'){live.metronome=m.args.enabled;result=recording();}
    else if(m.cmd==='getTransportLiteState')result={available:true,connected:true,locators:[{name:'A',time:0},{name:'B',time:8}]};
    else if(m.cmd==='getMappings')result={mappings:{}};
    socket.send(JSON.stringify({id:m.id,ok:true,result}));
  });})};
}

for(const locale of ['en','pt-BR'])test(`TRN shows and changes Live global quantization and the shared metronome (${locale})`,async({page})=>{
  const mock=liveMock(page);await mock.ready;
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang='+locale);
  const t=key=>page.evaluate(key=>window.RcSurfaceI18n.t(key),key);
  await page.locator('#btn-trn-mode').click();
  for(const id of ['btn-trn-play','btn-trn-stop','btn-trn-prev','btn-trn-next','btn-trn-refresh','locator-search'])await expect(page.locator('#'+id)).toBeVisible();
  await expect(page.locator('#btn-trn-settings')).toHaveCount(0);
  await expect(page.locator('#trn-settings')).toBeVisible();
  const select=page.locator('#trn-quantization'),click=page.locator('#trn-metronome');
  await expect(select).toHaveValue('4');await expect(select).toBeEnabled();
  await expect(page.locator('#trn-quantization-status')).toContainText(await t('lc.quantOneBar'));
  await expect(click).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#locator-list')).toContainText('B');
  await select.selectOption('7');
  await expect.poll(()=>mock.writes.filter(m=>m.cmd==='setGlobalClipQuantization').map(m=>m.args)).toEqual([{quantization:7}]);
  await expect(select).toHaveValue('7');await expect(page.locator('#trn-quantization-status')).toContainText('1/4');
  await click.click();
  await expect.poll(()=>mock.writes.filter(m=>m.cmd==='recordingClick').map(m=>m.args)).toEqual([{enabled:true}]);
  await expect(click).toHaveAttribute('aria-pressed','true');await expect(click).toContainText(await t('rec.on'));
  // A change made in Live reaches the open panel without a write from here.
  mock.live.quantization=9;mock.live.metronome=false;
  await expect(select).toHaveValue('9',{timeout:4000});await expect(click).toHaveAttribute('aria-pressed','false',{timeout:4000});
  expect(mock.writes).toHaveLength(2);
  // REC CLICK is the same metronome: toggled there, TRN follows.
  await page.locator('#btn-trn-close').click();await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-click')).toContainText(await t('rec.off'));
  await page.locator('#rec-click').click();
  await expect(page.locator('#rec-click')).toContainText(await t('rec.on'));
  await page.locator('#btn-trn-mode').click();
  await expect(page.locator('#trn-metronome')).toHaveAttribute('aria-pressed','true',{timeout:4000});
  expect(mock.writes.filter(m=>m.cmd==='recordingClick').map(m=>m.args)).toEqual([{enabled:true},{enabled:true}]);
});

test('TRN settings: viewer reads without writing; disconnect clears state and never replays a write',async({page})=>{
  const mock=liveMock(page,{role:'viewer'});await mock.ready;
  await page.setViewportSize({width:568,height:320});await page.goto('/?lang=en');
  await page.locator('#btn-trn-mode').click();
  await expect(page.locator('#trn-quantization')).toHaveValue('4');
  await expect(page.locator('#trn-quantization')).toBeDisabled();await expect(page.locator('#trn-metronome')).toBeDisabled();
  await expect(page.locator('#trn-metronome-status')).toContainText('Viewer');
  const box=await page.locator('#trn-settings').boundingBox();
  expect(box.x+box.width).toBeLessThanOrEqual(568);
  mock.live.linked=false;
  await expect(page.locator('#trn-quantization')).toHaveValue('',{timeout:4000});
  await expect(page.locator('#trn-quantization-status')).toContainText('AbletonOSC');
  mock.live.linked=true;
  await mock.sockets.at(-1).close();
  await expect(page.locator('#trn-metronome')).toHaveAttribute('aria-pressed','mixed');
  await expect(page.locator('#trn-metronome')).toContainText('?');
  await expect(page.locator('#trn-quantization')).toBeDisabled();
  await expect(page.locator('#trn-quantization')).toHaveValue('4',{timeout:8000});
  expect(mock.writes).toHaveLength(0);
});

for(const locale of ['en','pt-BR'])for(const viewport of [{width:568,height:320},{width:851,height:393},{width:1280,height:800}])
  test(`TRN CLICK and quantization stay in the main row before REFRESH (${locale} ${viewport.width})`,async({page})=>{
    const mock=liveMock(page);await mock.ready;await page.setViewportSize(viewport);await page.goto('/?lang='+locale);
    await page.locator('#btn-trn-mode').click();await expect(page.locator('#trn-quantization')).toHaveValue('4');
    await expect(page.locator('#btn-trn-settings')).toHaveCount(0);
    const ids=['btn-trn-play','btn-trn-stop','btn-trn-prev','btn-trn-next','trn-metronome','trn-quantization','btn-trn-refresh'];
    let previous=null;
    for(const id of ids){
      const control=page.locator('#'+id);await expect(control).toBeVisible();
      const box=await control.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
      if(previous){expect(box.x).toBeGreaterThanOrEqual(previous.x+previous.width-1);expect(Math.abs(box.y+box.height/2-previous.y-previous.height/2)).toBeLessThanOrEqual(1);}
      previous=box;
    }
    await expect(page.locator('#locator-search')).toBeVisible();await expect(page.locator('#locator-list')).toContainText('B');
  });
