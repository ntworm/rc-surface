// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

for(const locale of ['en','pt-BR'])test(`REC inline track rename keeps polling focus, requires Enter and rejects a stale edit (${locale})`,async({page},testInfo)=>{
  const track={index:0,id:'rename-track',name:'Drums',arm:false,canArm:true,solo:false,mute:false};
  const writes=[];let polls=0,attemptActive=false;
  const snapshot=()=>{
    const field=value=>({value,fresh:true,observedAt:Date.now()});
    return {transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},
      tracks:[track],locators:[{name:'Verse',time:8},{name:'End',time:24}],meter:{numerator:4,denominator:4},attemptActive};
  };
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const message=JSON.parse(raw);
    if(message.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'rename-test',role:'controller'}));
    if(message.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(!message.cmd)return;
    let result=message.cmd==='getMappings'?{mappings:{}}:{},error;
    if(message.cmd==='getRecordingState'){polls++;result=snapshot();}
    if(message.cmd.startsWith('recording')) {
      writes.push(message);
      if(message.cmd==='recordingRenameTrack') {
        const ref=message.args.track;
        if(ref.index!==track.index || ref.id!==track.id || ref.name!==track.name)error='REC:IDENTITY';
        else {track.name=message.args.name.trim();result=snapshot();}
      }
    }
    socket.send(JSON.stringify({id:message.id,ok:!error,...error?{error}:{result}}));
  }));
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang='+locale);
  await page.locator('.tab[data-page="recording"]').click();
  const card=page.locator('.rec-track-card').first(),name=card.locator('.rec-track-name'),input=card.locator('.rec-track-name-input');
  await expect(name).toHaveText('1 · Drums');
  expect((await name.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await name.click();expect(writes).toHaveLength(0);await expect(input).toHaveCount(0);
  await name.dblclick();await expect(input).toBeFocused();
  await input.fill('Unsaved draft');const before=polls;
  await expect.poll(()=>polls).toBeGreaterThan(before);
  await expect(input).toHaveValue('Unsaved draft');await expect(input).toBeFocused();
  await page.locator('#rec-position').click();expect(writes).toHaveLength(0);
  await input.press('Escape');await expect(input).toHaveCount(0);await expect(name).toHaveText('1 · Drums');
  await name.dblclick();await input.fill('Drum Bus');
  expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await card.screenshot({path:testInfo.outputPath('rec-rename-'+locale+'-editing.png')});
  await input.press('Enter');await expect(name).toHaveText('1 · Drum Bus');await expect(input).toHaveCount(0);
  expect(writes).toHaveLength(1);expect(writes[0].args).toEqual({track:{index:0,id:'rename-track',name:'Drums'},name:'Drum Bus'});
  await card.screenshot({path:testInfo.outputPath('rec-rename-'+locale+'-success.png')});
  await name.dblclick();await input.fill('Keep this draft');track.name='External';
  await expect(name).toHaveAttribute('aria-label',new RegExp('External$'));
  await expect(input).toHaveValue('Keep this draft');await expect(input).toBeFocused();
  await input.press('Enter');await expect(page.locator('#rec-status')).toContainText(locale==='en'?'identity':'identidade');
  await expect(input).toHaveValue('Keep this draft');expect(writes.at(-1).args.track.name).toBe('Drum Bus');
  await input.press('Escape');await expect(name).toHaveText('1 · External');
  attemptActive=true;await expect(name).toHaveAttribute('aria-disabled','true');
  // A queued event cannot bypass the now-disabled ownership guard.
  await name.dispatchEvent('dblclick');await expect(input).toHaveCount(0);
  expect(writes.map(message=>message.cmd)).toEqual(['recordingRenameTrack','recordingRenameTrack']);
});
