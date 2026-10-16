// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

for(const locale of ['en','pt-BR'])test(`Reviewed mobile candidate preserves native volume gestures and AUT geometry (${locale})`,async({page},testInfo)=>{
  const tracks=[{index:0,id:'track-a',name:'Lead Vocal',arm:true,canArm:true,solo:false,mute:false,volume:0.17,volumeDefault:0.73},
    ...Array.from({length:9},(_,index)=>({index:index+1,id:'track-'+index,name:'Instrument '+index,arm:false,canArm:true,solo:false,mute:false,volume:0.4,volumeDefault:0.73}))];
  const writes=[];let songId='original';
  const snapshot=()=>{
    const field=value=>({value,fresh:true,observedAt:Date.now()});
    return {transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(4067),metronome:field(false)},
      tracks,locators:[{name:'Intro',time:0},{name:'DRUM IN',time:4067},{name:'SOLO IN',time:4099},{name:'End',time:9396}],
      meter:{numerator:4,denominator:4},pending:null,range:null,safety:{},session:{songId,scenes:[],rows:[],owned:[]}};
  };
  await page.routeWebSocket('**/ws*',socket=>socket.onMessage(raw=>{
    const message=JSON.parse(raw);
    if(message.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'review',role:'controller'}));
    if(message.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(!message.cmd)return;
    if(message.cmd.startsWith('recording'))writes.push(message);
    if(message.cmd==='recordingTrackVolume')tracks[message.args.track.index].volume=message.args.volume;
    const result=message.cmd==='getMappings'?{mappings:{}}:['getRecordingState','getSessionRecordingState','recordingTrackVolume'].includes(message.cmd)?snapshot():{};
    // Model real asynchronous host latency, so the final pointer sample matters.
    setTimeout(()=>socket.send(JSON.stringify({id:message.id,ok:true,result})),message.cmd==='recordingTrackVolume'?80:0);
  }));
  await page.setViewportSize({width:851,height:393});await page.goto('/?lang='+locale);await page.evaluate(()=>document.fonts.ready);
  await page.locator('.tab[data-page="recording"]').click();await expect(page.locator('.rec-track-card')).toHaveCount(10);
  for(const viewport of [{width:568,height:320},{width:667,height:375},{width:851,height:393},{width:932,height:430},{width:1280,height:800}]) {
    await page.setViewportSize(viewport);
    const boxes=await page.locator('.rec-track-card').first().evaluate(card=>({card:card.getBoundingClientRect().toJSON(),
      controls:[...card.querySelectorAll('.rec-track-vol,button')].map(node=>node.getBoundingClientRect().toJSON())}));
    for(const control of boxes.controls){expect(control.left).toBeGreaterThanOrEqual(boxes.card.left);expect(control.right).toBeLessThanOrEqual(boxes.card.right);}
    await expect(page.locator('.rec-track-vol-val').first()).toBeHidden();
    expect((await page.locator('.rec-track-vol-dial').first().boundingBox()).width).toBe(26);
    if(viewport.width<=950) {
      const geometry=await page.evaluate(()=>{
        const mode=document.querySelector('.rec-destination').getBoundingClientRect(),buttons=[...document.querySelectorAll('.rec-destination button')].map(node=>node.getBoundingClientRect());
        return {modeCenter:mode.x+mode.width/2,buttonsCenter:(buttons[0].left+buttons[1].right)/2,
          record:document.querySelector('#rec-start').getBoundingClientRect().toJSON(),markerFont:parseFloat(getComputedStyle(document.querySelector('.rec-marker')).fontSize)};
      });
      expect(Math.abs(geometry.modeCenter-geometry.buttonsCenter)).toBeLessThan(2);
      expect(geometry.record.width).toBeLessThanOrEqual(100);expect(geometry.record.height).toBe(44);expect(geometry.markerFont).toBeGreaterThanOrEqual(11);
      const row=await page.locator('#rec-pre-roll-inline').boundingBox();expect(Math.abs(row.y-geometry.record.y)).toBeLessThan(1);
    }
    await expect(page.locator('#rec-stop')).toBeInViewport();
  }
  await page.setViewportSize({width:851,height:393});
  const volume=page.locator('.rec-track-vol').first();await expect(volume).toHaveAttribute('aria-valuetext','17%');
  for(const value of [0,0.5,1]) {
    tracks[0].volume=value;await expect(volume).toHaveAttribute('aria-valuenow',String(value));
    const arc=await volume.locator('.rec-track-vol-dial').evaluate(node=>({sweep:parseFloat(node.style.getPropertyValue('--rec-volume-sweep')),paint:getComputedStyle(node,'::before').backgroundImage}));
    expect(arc.sweep).toBeCloseTo(value*270);expect(arc.paint).toContain('conic-gradient');
    await expect(volume.locator('.rec-track-vol-val')).toBeHidden();
  }
  tracks[0].volume=0.17;await expect(volume).toHaveAttribute('aria-valuenow','0.17');
  const box=await volume.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-30,{steps:12});await page.mouse.up();
  await expect.poll(()=>tracks[0].volume).toBeGreaterThan(0.4);
  expect(writes.every(message=>message.cmd==='recordingTrackVolume'&&message.args.track.id==='track-a')).toBe(true);
  tracks[0].volume=0.24;await expect(volume).toHaveAttribute('aria-valuetext','24%');
  await page.locator('#rec-start-marker').selectOption('1');await page.locator('#rec-end-marker').selectOption('2');
  await expect(page.locator('#rec-zoom')).toHaveValue('212');
  const fit=await page.evaluate(()=>{
    const viewport=document.querySelector('#rec-timeline').getBoundingClientRect(),markers=[...document.querySelectorAll('.rec-marker')].slice(1,3).map(node=>node.getBoundingClientRect());
    return {fraction:(markers[1].left-markers[0].left)/viewport.width,left:markers[0].left-viewport.left,right:viewport.right-markers[1].left};
  });
  expect(fit.fraction).toBeGreaterThan(0.6);expect(fit.fraction).toBeLessThan(0.85);expect(fit.left).toBeGreaterThan(0);expect(fit.right).toBeGreaterThan(0);
  await page.locator('#page-recording').screenshot({path:testInfo.outputPath('review-rec-'+locale+'.png')});
  await page.locator('.tab[data-page="performance"]').click();
  for(const viewport of [{width:568,height:320},{width:851,height:393},{width:1280,height:800}]) {
    await page.setViewportSize(viewport);
    const pads=page.locator('.xy-pad[data-name]'),before=await pads.evaluateAll(nodes=>nodes.map(node=>({width:node.offsetWidth,height:node.offsetHeight})));
    await page.locator('#btn-aut-mode').click();
    expect(await pads.evaluateAll(nodes=>nodes.map(node=>({width:node.offsetWidth,height:node.offsetHeight})))).toEqual(before);
    await pads.first().click({button:'right'});await expect(page.locator('#automation-config-menu')).toHaveAttribute('data-cfg-open-for','xy-1');
    expect(await pads.evaluateAll(nodes=>nodes.map(node=>({width:node.offsetWidth,height:node.offsetHeight})))).toEqual(before);
    await page.keyboard.press('Escape');
    if(await page.locator('#btn-aut-mode').getAttribute('aria-pressed')==='true')await page.locator('#btn-aut-mode').click();
  }
});
