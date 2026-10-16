// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

for(const locale of ['en','pt-BR'])test(`REC free cursor, optional end and total passes stay explicit (${locale})`,async({page},testInfo)=>{
  let position=16,playing=false,range=null,capture=null;
  let locators=[{name:'DRUMMING',time:8},{name:'SOLO IN',time:32},{name:'END',time:48},{name:'TAIL',time:64}];
  const writes=[],tracks=[{index:0,id:'drum',name:'Drums',arm:true,canArm:true,solo:false,mute:false,volume:.6}];
  const snapshot=()=>{const field=value=>({value,fresh:true,observedAt:Date.now()});return {
    transport:{connected:true,isPlaying:field(playing),recordMode:field(playing),songTimeBeats:field(position),metronome:field(false)},
    tracks,locators,
    meter:{numerator:4,denominator:4},pending:null,range,capture,safety:{},session:{songId:'capture',scenes:[],rows:[],owned:[]},
  };};
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const m=JSON.parse(raw);
    if(m.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'capture',role:'controller'}));
    if(m.type==='ping')socket.send(JSON.stringify({type:'pong'}));if(!m.cmd)return;
    if(m.cmd.startsWith('recording'))writes.push(m);
    if(m.cmd==='recordingRecord'){range=m.args.range;playing=true;capture=range.end?{phase:'recording',pass:1,total:m.args.passes}:null;}
    if(m.cmd==='recordingStop'){playing=false;position=40;capture=null;}
    if(m.cmd==='recordingSeekMarker')position=m.args.time;
    socket.send(JSON.stringify({id:m.id,ok:true,result:m.cmd==='getMappings'?{mappings:{}}:snapshot()}));
  }));
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang='+locale);await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-start')).toBeEnabled();await expect(page.locator('#rec-loop')).toHaveCount(0);
  await expect(page.locator('#rec-end-marker')).toHaveValue('');await expect(page.locator('#rec-free-mode')).toBeVisible();
  await page.locator('#rec-start').click();await expect.poll(()=>writes.filter(m=>m.cmd==='recordingRecord').length).toBe(1);
  expect(writes.at(-1).args).toMatchObject({range:{start:{source:'cursor',time:16},end:null,loop:false},passes:null});
  await expect(page.locator('#rec-stop')).toBeEnabled();await page.locator('#rec-stop').click();await expect(page.locator('#rec-start')).toBeEnabled();
  await page.locator('#rec-start').click();expect(writes.at(-1).args.range.start.time).toBe(16);
  await page.locator('#rec-stop').click();await expect(page.locator('#rec-start')).toBeEnabled();
  await page.locator('#rec-end-marker').selectOption('1');await expect(page.locator('#rec-passages')).toHaveValue('1');
  await page.locator('#rec-passages').selectOption('4');await page.locator('#rec-start').click();
  expect(writes.at(-1).args).toMatchObject({passes:4,range:{start:{source:'cursor',time:16},end:{name:'SOLO IN',time:32},loop:true}});
  await expect(page.locator('#rec-status')).toContainText('1/4');await expect(page.locator('#rec-passages')).toBeDisabled();
  await page.reload();await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-passages')).toHaveValue('4');await expect(page.locator('#rec-passages')).toBeDisabled();
  await page.locator('#rec-stop').click();await expect(page.locator('#rec-start')).toBeEnabled();
  await page.locator('#rec-start-marker').selectOption('2');await expect(page.locator('#rec-start')).toBeDisabled();
  await expect(page.locator('#rec-end-marker')).toHaveValue('1');
  await page.locator('#rec-end-marker').selectOption('');await expect(page.locator('#rec-start')).toBeEnabled();
  await page.locator('#rec-start-marker').selectOption('use-current');await expect(page.locator('#rec-start-marker')).toHaveValue('cursor');
  await page.locator('#rec-end-marker').selectOption('3');await expect(page.locator('#rec-passages')).toHaveValue('1');
  await page.locator('#rec-passages').selectOption('infinite');await page.locator('#rec-start').click();
  expect(writes.at(-1).args).toMatchObject({passes:null,range:{start:{source:'cursor',time:48},end:{name:'TAIL',time:64},loop:true}});
  await page.locator('#rec-stop').click();locators=locators.filter(cue=>cue.name!=='TAIL');
  await page.reload();await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-end-marker')).toHaveValue('missing');await expect(page.locator('#rec-free-mode')).toBeHidden();
  await expect(page.locator('#rec-start')).toBeDisabled();await expect(page.locator('#rec-start-marker option[value="cursor"]')).toContainText('13.1');
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('capture-'+locale+'.png')});
});
