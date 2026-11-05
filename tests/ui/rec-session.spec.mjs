// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

// The writes of the page: a local view never sends one of them.
const WRITE_COMMANDS=['recordingReturnToArrangement','recordingSessionRecord','recordingSessionStop','recordingSelectTrack','recordingSetPoint','recordingLocator','recordingArm','recordingArmTracks','recordingTrackControl','recordingRenameTrack','recordingTrackVolume','recordingPrepare','recordingStart','recordingRecord','recordingSeekMarker','recordingStop','recordingAudition','recordingClick','recordingMark','recordingCreateMarker','recordingMarkTake'];

for(const locale of ['en','pt-BR'])test('REC Session selects a complete empty scene, keeps native CFG, owns STOP and preserves polling focus ('+locale+')',async({page},testInfo)=>{
  const tracks=Array.from({length:10},(_,index)=>({index,id:'track-'+index,name:'Input '+(index+1),arm:true,canArm:true,monitor:1,solo:false,mute:false}));
  const scenes=Array.from({length:10},(_,index)=>({index,id:'scene-'+index,name:'Scene '+(index+1)}));
  const locators=Array.from({length:202},(_,index)=>({name:'Água > [bpm 121] · '+index,time:index*16}));
  const slots=tracks.map(track=>scenes.map(scene=>({index:scene.index,id:'slot-'+track.index+'-'+scene.index,clip:scene.index===0?{id:'old-'+track.index,name:'Existing '+(track.index+1)}:null,state:'stopped'})));
  const writes=[];let offset=0,active=false,polls=0,queued=false,stopping=false,backToArranger=false,meterStale=false,playingAfterStop=false;
  const snapshot=()=>{
    const field=value=>({value,fresh:true,observedAt:Date.now()});
    return {transport:{connected:true,isPlaying:field(playingAfterStop||active&&!queued&&!stopping),recordMode:field(false),songTimeBeats:field(8),metronome:field(false)},pending:null,attemptActive:active,tracks,safety:{backToArranger},locators,meter:meterStale?{numerator:null,denominator:null}:{numerator:4,denominator:4},
      session:{songId:'song-test',offset,totalScenes:10,active,stopping,scenes:scenes.slice(offset,offset+8),rows:tracks.map(track=>({track:{index:track.index,id:track.id,name:track.name},ready:!active,slots:slots[track.index].slice(offset,offset+8)})),owned:active?tracks.map(track=>({track,scene:1,state:stopping?'queued':queued?'queued':'recording'})):[]}};
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
        active=true;queued=true;backToArranger=true;slots.forEach(row=>{row[1].state='queued';});
      }
      else if(message.cmd==='recordingSessionStop'){stopping=true;playingAfterStop=true;error='REC:SESSION_STOP_PENDING';}
      else if(message.cmd==='recordingReturnToArrangement'){backToArranger=false;}
      else if(message.cmd==='recordingTrackControl')tracks[message.args.track.index][message.args.property]=message.args.enabled;
      else if(message.cmd==='recordingRenameTrack')tracks[message.args.track.index].name=message.args.name;
      else if(!['recordingClick','recordingRecord','recordingSeekMarker'].includes(message.cmd))error='Unexpected command';
      result=snapshot();
    }
    socket.send(JSON.stringify({id:message.id,ok:!error,...error?{error}:{result}}));
  }));
  const mobile=testInfo.project.name.includes('Mobile');await page.setViewportSize({width:mobile?851:1280,height:mobile?393:800});
  await page.goto('/?lang='+locale);await page.locator('.tab[data-page="recording"]').click();await expect(page.locator('.rec-track-card')).toHaveCount(10);
  await page.locator('#rec-clip-mode').click();await expect(page.locator('#rec-session-grid .rec-session-cell')).toHaveCount(80);
  await expect(page.locator('#rec-arrangement-panel')).toBeHidden();await expect(page.locator('#rec-session-panel')).toBeVisible();expect(writes).toHaveLength(0);
  // The native length and quantization moved into the config slots of the
  // capture band: the Clip content keeps only the matrix.
  await expect(page.locator('#rec-session-bars')).toBeVisible();await expect(page.locator('#rec-session-quantization')).toBeVisible();await expect(page.locator('#rec-session-settings')).toHaveCount(0);await expect(page.locator('#rec-start')).toBeDisabled();
  await expect(page.locator('#rec-session-bars option')).toHaveText(['1','2','4','8','16']);await page.locator('#rec-session-bars').selectOption('8');await page.locator('#rec-session-quantization').selectOption('beat');
  expect(writes).toHaveLength(0);
  await page.locator('#rec-session-grid [data-scene="0"]').click();await expect(page.locator('#rec-start')).toBeDisabled();
  const scene=page.locator('#rec-session-grid [data-scene="1"]');await scene.click();await expect(page.locator('#rec-start')).toBeEnabled();
  // The native scene owns its own click: the track rows of the page never
  // stand between the reader and the session.
  await page.evaluate(()=>document.querySelector('#rec-session-grid [data-scene="1"]').scrollIntoView({block:'center'}));
  const hit=await page.evaluate(()=>{
    const cell=document.querySelector('#rec-session-grid [data-scene="1"]');
    const box=cell.getBoundingClientRect();
    const top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return {row:Boolean(top&&top.closest&&top.closest('.rec-tracks')),owned:Boolean(top&&(top===cell||cell.contains(top)))};
  });
  expect(hit.row,'the track rows never stand over the native session').toBe(false);
  expect(hit.owned,'the native scene cell owns its own click').toBe(true);
  await page.keyboard.press('Tab');await scene.focus();const before=polls;await expect.poll(()=>polls).toBeGreaterThan(before);await expect(scene).toBeFocused();
  expect(await scene.evaluate(node=>getComputedStyle(node).outlineColor)).toBe('rgb(255, 161, 51)');
  expect(await page.locator('.rec-session-cell').first().evaluate(node=>getComputedStyle(node).borderRadius)).toBe('0px');
  expect((await scene.boundingBox()).height).toBeGreaterThanOrEqual(mobile?28:44);
  const scroll=page.locator('.rec-session-scroll');expect(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  // The matrix owns its horizontal axis only: it is never capped at 240px
  // and the vertical overflow belongs to the editor content around it.
  expect(await scroll.evaluate(node=>node.scrollHeight<=node.clientHeight+2)).toBe(true);
  await scroll.evaluate(node=>node.scrollLeft=node.scrollWidth);await expect(page.locator('.rec-session-cell').nth(9)).toBeInViewport();
  await expect.poll(()=>polls).toBeGreaterThan(before+1);expect(await scroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);expect(writes).toHaveLength(0);
  await scroll.evaluate(node=>node.scrollLeft=0);
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-session-'+locale+'-ready.png')});
  await page.locator('#rec-start').click();await expect(page.locator('#rec-clip-mode')).toBeDisabled();await expect(page.locator('#rec-arrangement-mode')).toBeDisabled();await expect(page.locator('#rec-record-mode')).toBeDisabled();await expect(page.locator('#rec-stop')).toBeEnabled();
  expect(writes[0].cmd).toBe('recordingSessionRecord');expect(writes[0].args.bars).toBe(8);expect(writes[0].args.quantization).toBe('beat');expect(writes[0].args.targets).toHaveLength(10);expect(writes[0].args.targets.at(-1).track.index).toBe(9);
  expect(writes[0].args.scene).toEqual(scenes[1]);expect(writes[0].args.songId).toBe('song-test');
  await expect(page.locator('.rec-track-actions [data-property="arm"]').first()).toBeDisabled();await expect(page.locator('.rec-track-actions [data-property="solo"]').first()).toBeEnabled();
  await expect(page.locator('#rec-arm-mode')).toBeDisabled();
  queued=false;slots.forEach(row=>{row[1].state='recording';row[1].clip={id:'new-'+row[1].id,name:'Take'};});
  await expect(page.locator('#rec-status')).toHaveText('REC');
  expect(await page.locator('.rec-session-cell[data-state="recording"]').first().evaluate(node=>getComputedStyle(node).opacity)).toBe('1');
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-session-'+locale+'-recording.png')});
  await page.locator('#rec-stop').click();expect(writes.at(-1).cmd).toBe('recordingSessionStop');await expect(page.locator('#rec-arrangement-mode')).toBeDisabled();await expect(page.locator('#rec-record-mode')).toBeDisabled();
  active=false;queued=false;stopping=false;slots.forEach(row=>{row[1].state='stopped';});
  await expect(page.locator('#rec-arrangement-mode')).toBeEnabled();await expect(page.locator('#rec-record-mode')).toBeEnabled();await expect(page.locator('.rec-track-actions [data-property="arm"]').first()).toBeDisabled();
  const fresh=page.locator('#rec-session-grid [data-scene="2"]');await fresh.click();await expect(page.locator('#rec-start')).toBeEnabled();
  playingAfterStop=false;await expect(page.locator('#rec-arm-mode')).toBeEnabled();await expect(page.locator('.rec-track-actions [data-property="arm"]').first()).toBeEnabled();
  await expect(page.locator('#rec-return-arrangement')).toBeEnabled();const stoppedWrites=writes.length;await expect.poll(()=>polls).toBeGreaterThan(before+2);expect(writes).toHaveLength(stoppedWrites);
  // The local Arrangement is a view of the page and never the native return:
  // the switch writes nothing and the native button stays available.
  const writesBefore=writes.filter(command=>WRITE_COMMANDS.includes(command.cmd)).length;
  await page.locator('#rec-arrangement-mode').click();await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode','arrangement');
  await expect(page.locator('#rec-return-arrangement')).toBeVisible();await expect(page.locator('#rec-return-arrangement')).toBeEnabled();
  expect(writes.filter(command=>WRITE_COMMANDS.includes(command.cmd)),'a local destination never writes').toHaveLength(writesBefore);
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-return-'+locale+'-ready.png')});
  // The native return is the only way back: one explicit click, one write.
  await page.locator('#rec-return-arrangement').click();
  await expect.poll(()=>writes.filter(command=>command.cmd==='recordingReturnToArrangement').length).toBe(1);
  // The destination is chosen here: the local view changes without a host write.
  const afterReturn=writes.length;await page.locator('#rec-arrangement-mode').click();expect(writes).toHaveLength(afterReturn);
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  // The host withdrew the native return: the button is gone again.
  await expect(page.locator('#rec-return-arrangement')).toBeHidden();
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-return-'+locale+'.png')});
  await page.locator('#rec-clip-mode').click();
  await page.locator('#rec-session-next').click();await expect(page.locator('#rec-session-grid [data-scene="8"]')).toBeVisible();await expect(page.locator('#rec-session-grid .rec-session-cell')).toHaveCount(20);
  const count=writes.length;await page.locator('#rec-arrangement-mode').click();await expect(page.locator('#rec-arrangement-panel')).toBeVisible();await expect(page.locator('#rec-session-panel')).toBeHidden();expect(writes).toHaveLength(count);
  const markerMenu=page.locator('#rec-start-marker');
  // The start selector shows the real catalog of the host: the marker it
  // displays is the marker it means.
  await expect(markerMenu.locator('option')).toHaveCount(206);
  await expect(markerMenu.locator('option').nth(4)).toContainText('Água > [bpm 121] · 0');
  // The marker selection is local: it never asks the host to seek.
  const markerWrites=writes.length;await markerMenu.selectOption('123');expect(writes).toHaveLength(markerWrites);await expect(markerMenu).toBeEnabled();await markerMenu.focus();
  meterStale=true;await expect(page.locator('#rec-position')).toHaveAttribute('data-meter-stale','true');await expect(markerMenu).toBeFocused();await expect(markerMenu).toHaveValue('123');
  await expect(markerMenu.locator('option:checked')).toHaveText('Água > [bpm 121] · 123 · 493.1');
  const noPassiveWrites=writes.length;await page.locator('#page-recording').screenshot({path:testInfo.outputPath('rec-markers-'+locale+'-stale.png')});expect(writes).toHaveLength(noPassiveWrites);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
