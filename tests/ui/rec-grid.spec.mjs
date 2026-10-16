// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

function liveMock(page){
  const field=value=>({value,fresh:true,observedAt:Date.now()});
  const recording=()=>({transport:{connected:true,isPlaying:field(false),recordMode:field(false),songTimeBeats:field(0),metronome:field(false)},
    tracks:[{index:0,id:'d',name:'Drums',arm:false,canArm:true,solo:false,mute:false,volume:.5}],
    locators:[{name:'Intro',time:0},{name:'Verse',time:32},{name:'Chorus',time:64}],
    meter:{numerator:4,denominator:4},pending:null,range:null,capture:null,safety:{},session:{songId:'s',scenes:[],rows:[],owned:[]}});
  return page.routeWebSocket('**/ws*',socket=>{socket.onMessage(raw=>{
    const m=JSON.parse(raw);
    if(m.type==='resume')socket.send(JSON.stringify({type:'hello',client_id:'grid',role:'controller'}));
    if(m.type==='ping')socket.send(JSON.stringify({type:'pong'}));
    if(!m.cmd)return;
    let result={ok:true};
    if(m.cmd==='getRecordingState')result=recording();
    else if(m.cmd==='getMappings')result={mappings:{}};
    socket.send(JSON.stringify({id:m.id,ok:true,result}));
  });});
}

for(const viewport of [{width:851,height:393},{width:1280,height:800}])
  test(`REC timeline shows a bar/beat grid behind the markers (${viewport.width})`,async({page})=>{
    await liveMock(page);await page.setViewportSize(viewport);await page.goto('/?lang=en');
    await page.locator('.tab[data-page="recording"]').click();
    const grid=page.locator('#rec-grid');
    await expect(grid.locator('.rec-grid-bar').first()).toBeAttached();
    // Markers stay clickable: the ruler never takes pointer events.
    expect(await grid.evaluate(node=>getComputedStyle(node).pointerEvents)).toBe('none');
    const labels=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes.map(node=>node.textContent).filter(Boolean));
    expect(labels[0]).toBe('1');
    // Verse at beat 32 sits on the line of bar 9.
    const verse=await page.locator('.rec-marker[data-index="1"]').boundingBox();
    const bar9=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>{const node=nodes.find(item=>item.textContent==='9');return node?node.getBoundingClientRect().x:null;});
    if(bar9!==null)expect(Math.abs(verse.x+verse.width/2-bar9)).toBeLessThanOrEqual(2);
    const barWidth=()=>grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes[1].getBoundingClientRect().x-nodes[0].getBoundingClientRect().x);
    const before=await barWidth();
    await page.locator('#rec-zoom').fill('8');
    await expect.poll(barWidth).toBeGreaterThan(before*4);
    // Zoomed in, beats sit between the bars.
    await expect.poll(()=>grid.locator('.rec-grid-beat').count()).toBeGreaterThan(0);
    const after=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes.map(node=>node.textContent).filter(Boolean));
    expect(after).toContain('9');
  });
