// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

for(const locale of ['en','pt-BR'])test('REC Session selects a complete empty scene, keeps native CFG, owns STOP and preserves polling focus ('+locale+')',async({page},testInfo)=>{
  const tracks=Array.from({length:10},(_,index)=>({index,id:'track-'+index,name:'Input '+(index+1),arm:true,canArm:true,monitor:1,solo:false,mute:false}));
  const scenes=Array.from({length:10},(_,index)=>({index,id:'scene-'+index,name:'Scene '+(index+1)}));
  const slots=tracks.map(track=>scenes.map(scene=>({index:scene.index,id:'slot-'+track.index+'-'+scene.index,clip:scene.index===0?{id:'old-'+track.index,name:'Existing '+(track.index+1)}:null,state:'stopped'})));
  const writes=[];let offset=0,active=false,polls=0,queued=false;
  const snapshot=()=>{
    const field=value=>({value,fresh:true,observedAt:Date.now()});
    return {transport:{connected:true,isPlaying:field(active&&!queued),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},pending:null,attemptActive:active,tracks,locators:[{name:'Verse',time:8}],meter:{numerator:4,denominator:4},
      session:{songId:'song-test',offset,totalScenes:10,active,stopping:false,scenes:scenes.slice(offset,offset+8),rows:tracks.map(track=>({track:{index:track.index,id:track.id,name:track.name},ready:!active,slots:slots[track.index].slice(offset,offset+8)})),owned:active?tracks.map(track=>({track,scene:1,state:queued?'queued':'recording'})):[]}};
  };
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const message=JSON.parse(raw);
    if(message.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'session-ui',role:'controller'}));
    if(message.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(!message.cmd)return;let result=message.cmd==='getMappings'?{mappings:{}}:{},error;
    if(message.cmd==='getRecordingState')result=snapshot();
    if(message.cmd==='getSessionRecordingState'){polls++;offset=message.args.offset;result=snapshot();}
    if(message.cmd.startsWith('recording')) {
      writes.push(message);
      if(message.cmd==='recordingSessionRecord'){
        active=true;queued=true;slots.forEach(row=>{row[1].state='queued';});
      }
      else if(message.cmd==='recordingSessionStop'){active=false;queued=false;slots.forEach(row=>{row[1].state='stopped';});}
      else if(message.cmd==='recordingTrackControl')tracks[message.args.track.index][message.args.property]=message.args.enabled;
      else if(message.cmd==='recordingRenameTrack')tracks[message.args.track.index].name=message.args.name;
      else if(!['recordingClick','recordingRecord'].includes(message.cmd))error='Unexpected command';
      result=snapshot();
    }
    socket.send(JSON.stringify({id:message.id,ok:!error,...error?{error}:{result}}));
  }));
  const mobile=testInfo.project.name.includes('Mobile');await page.setViewportSize({width:mobile?851:1280,height:mobile?393:800});
  await page.goto('/?lang='+locale);await page.locator('.tab[data-page="recording"]').click();await expect(page.locator('.rec-track-card')).toHaveCount(10);
  await page.locator('#rec-clip-mode').click();await expect(page.locator('#rec-session-grid .rec-session-cell')).toHaveCount(80);
  await expect(page.locator('#rec-arrangement-panel')).toBeHidden();await expect(page.locator('#rec-session-panel')).toBeVisible();expect(writes).toHaveLength(0);
  await expect(page.locator('#rec-session-settings')).toBeHidden();await expect(page.locator('#rec-start')).toBeDisabled();
  await page.locator('#rec-session-cfg').click();await expect(page.locator('#rec-session-settings')).toBeVisible();
  await expect(page.locator('#rec-session-bars option')).toHaveText(['1','2','4','8','16']);await page.locator('#rec-session-bars').selectOption('8');await page.locator('#rec-session-quantization').selectOption('beat');
  expect(writes).toHaveLength(0);
  await page.locator('#rec-session-grid [data-scene="0"]').click();await expect(page.locator('#rec-start')).toBeDisabled();
  const scene=page.locator('#rec-session-grid [data-scene="1"]');await scene.click();await expect(page.locator('#rec-start')).toBeEnabled();
  await page.keyboard.press('Tab');await scene.focus();const before=polls;await expect.poll(()=>polls).toBeGreaterThan(before);await expect(scene).toBeFocused();
  expect(await scene.evaluate(node=>getComputedStyle(node).outlineColor)).toBe('rgb(255, 161, 51)');
  expect(await page.locator('.rec-session-cell').first().evaluate(node=>getComputedStyle(node).borderRadius)).toBe('0px');
  expect((await scene.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const scroll=page.locator('.rec-session-scroll');expect(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  expect(await scroll.evaluate(node=>node.clientHeight)).toBeLessThanOrEqual(240);
  await scroll.evaluate(node=>node.scrollLeft=node.scrollWidth);await expect(page.locator('.rec-session-cell').nth(9)).toBeInViewport();
  await expect.poll(()=>polls).toBeGreaterThan(before+1);expect(await scroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);expect(writes).toHaveLength(0);
  await scroll.evaluate(node=>node.scrollLeft=0);
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-session-'+locale+'-ready.png')});
  await page.locator('#rec-start').click();await expect(page.locator('#rec-clip-mode')).toBeDisabled();await expect(page.locator('#rec-arrangement-mode')).toBeDisabled();await expect(page.locator('#rec-stop')).toBeEnabled();
  expect(writes[0].cmd).toBe('recordingSessionRecord');expect(writes[0].args.bars).toBe(8);expect(writes[0].args.quantization).toBe('beat');expect(writes[0].args.targets).toHaveLength(10);expect(writes[0].args.targets.at(-1).track.index).toBe(9);
  expect(writes[0].args.scene).toEqual(scenes[1]);expect(writes[0].args.songId).toBe('song-test');
  await expect(page.locator('.rec-track-actions [data-property="arm"]').first()).toBeDisabled();await expect(page.locator('.rec-track-actions [data-property="solo"]').first()).toBeEnabled();
  await expect(page.locator('#rec-arm-mode')).toBeDisabled();
  queued=false;slots.forEach(row=>{row[1].state='recording';row[1].clip={id:'new-'+row[1].id,name:'Take'};});
  await expect(page.locator('#rec-status')).toHaveText('REC');
  expect(await page.locator('.rec-session-cell[data-state="recording"]').first().evaluate(node=>getComputedStyle(node).opacity)).toBe('1');
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-session-'+locale+'-recording.png')});
  await page.locator('#rec-stop').click();expect(writes.at(-1).cmd).toBe('recordingSessionStop');await expect(page.locator('#rec-arrangement-mode')).toBeEnabled();
  await page.locator('#rec-session-next').click();await expect(page.locator('#rec-session-grid [data-scene="8"]')).toBeVisible();await expect(page.locator('#rec-session-grid .rec-session-cell')).toHaveCount(20);
  const count=writes.length;await page.locator('#rec-arrangement-mode').click();await expect(page.locator('#rec-arrangement-panel')).toBeVisible();await expect(page.locator('#rec-session-panel')).toBeHidden();expect(writes).toHaveLength(count);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
