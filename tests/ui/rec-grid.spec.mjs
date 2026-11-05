// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {test,expect} from '@playwright/test';

/** The five surfaces of the phone and the two languages of the page. */
const VIEWPORTS = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 851, height: 393 },
  { width: 932, height: 430 },
  { width: 1280, height: 800 },
];
const LOCALES = ['en', 'pt-BR'];
const MODES = ['record', 'arrangement', 'clip', 'record'];

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
    // The ruler belongs to the editor of the Arrangement.
    await page.locator('#rec-arrangement-mode').click();await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
    const grid=page.locator('#rec-grid');
    await expect(grid.locator('.rec-grid-bar').first()).toBeAttached();
    // Markers stay clickable: the ruler never takes pointer events.
    expect(await grid.evaluate(node=>getComputedStyle(node).pointerEvents)).toBe('none');
    const labels=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes.map(node=>node.textContent).filter(Boolean));
    expect(labels[0]).toBe('1');
    // Verse at beat 32 sits on the line of bar 9.
    const verse=await page.locator('.rec-marker[data-index="1"]').boundingBox();
    const bar9=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>{const node=nodes.find(item=>item.textContent==='9');return node?node.getBoundingClientRect().x:null;});
    expect(bar9,'the bar line of beat 32 exists').not.toBeNull();
    expect(Math.abs(verse.x+verse.width/2-bar9)).toBeLessThanOrEqual(2);
    // Chorus at beat 64 sits on the line of bar 17: every marker of the
    // catalog shares the one measured line of the ruler.
    const chorus=await page.locator('.rec-marker[data-index="2"]').boundingBox();
    const bar17=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>{const node=nodes.find(item=>item.textContent==='17');return node?node.getBoundingClientRect().x:null;});
    expect(bar17,'the bar line of beat 64 exists').not.toBeNull();
    expect(Math.abs(chorus.x+chorus.width/2-bar17)).toBeLessThanOrEqual(2);
    const barWidth=()=>grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes[1].getBoundingClientRect().x-nodes[0].getBoundingClientRect().x);
    const before=await barWidth();
    await page.locator('#rec-zoom').fill('8');
    await expect.poll(barWidth).toBeGreaterThan(before*4);
    // Zoomed in, beats sit between the bars.
    await expect.poll(()=>grid.locator('.rec-grid-beat').count()).toBeGreaterThan(0);
    const after=await grid.locator('.rec-grid-bar').evaluateAll(nodes=>nodes.map(node=>node.textContent).filter(Boolean));
    expect(after).toContain('9');
  });

/** The geometry of the combined band: the arming controls on the left, the
 * ruler on the right and the footer of the band. */
async function bandGeometry(page) {
  return page.evaluate(() => {
    const box = id => document.getElementById(id).getBoundingClientRect();
    const band = box('rec-combined-band'), controls = box('rec-combined-controls');
    const editor = box('rec-combined-editor'), footer = box('rec-combined-footer');
    return { bandHeight: band.height, bandLeft: band.left, controlsWidth: controls.width,
      controlsHeight: controls.height, editorLeft: editor.left, footerHeight: footer.height,
      rulerHeight: box('rec-timeline').height, sessionHeight: box('rec-combined-session').height };
  });
}

/** The combined band: the arming controls and the ruler share one row of 44
 * and the footer of 12, in every destination and on every surface. */
for (const viewport of VIEWPORTS) {
  for (const locale of LOCALES) {
    test(`REC the combined band holds the arming controls and the ruler (${viewport.width}x${viewport.height} ${locale})`, async ({ page }, testInfo) => {
      test.setTimeout(120000);
      await liveMock(page);
      await page.setViewportSize(viewport);
      await page.goto('/?lang=' + locale);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.tab[data-page="recording"]').click();
      await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
      const label = viewport.width + 'x' + viewport.height + ' (' + locale + ')';
      for (const mode of MODES) {
        await page.locator('#rec-' + mode + '-mode').click();
        await expect(page.locator('#page-recording')).toHaveAttribute('data-rec-mode', mode);
        await page.waitForTimeout(150);
        const band = await bandGeometry(page);
        // The band is the ruler of the capture and the footer of 12: the
        // ruler is taller than a finger row and a short surface keeps a
        // shorter one.
        const ruler = viewport.height <= 400 ? 56 : 64;
        expect(band.bandHeight, label + ' ' + mode + ' band').toBeCloseTo(ruler + 12, 0);
        expect(band.controlsWidth, label + ' ' + mode + ' control column').toBeCloseTo(244, 0);
        expect(band.controlsHeight, label + ' ' + mode + ' control column').toBeGreaterThanOrEqual(44);
        expect(band.footerHeight, label + ' ' + mode + ' footer').toBeCloseTo(12, 0);
        expect(band.editorLeft, label + ' ' + mode + ' the ruler starts after the controls')
          .toBeGreaterThan(band.bandLeft + 244);
        // One context per destination: the ruler of the Record and of the
        // Arrangement, the Session context of the Clip. The ruler of the
        // Clip is hidden and measures zero: the Session context is the one
        // context of the Clip.
        if (mode === 'clip') {
          await expect(page.locator('#rec-arrangement-panel')).toBeHidden();
          await expect(page.locator('#rec-combined-session')).toBeVisible();
          expect(band.sessionHeight, label + ' ' + mode + ' session context').toBeGreaterThanOrEqual(44);
        } else {
          await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
          await expect(page.locator('#rec-combined-session')).toBeHidden();
          await expect(page.locator('#rec-takes')).toBeHidden();
          expect(band.rulerHeight, label + ' ' + mode + ' ruler').toBeGreaterThanOrEqual(44);
        }
      }
      await page.locator('#rec-record-mode').click();
      await page.waitForTimeout(200);
      const name = 'rec-band-' + viewport.width + '-' + locale + '.png';
      await page.screenshot({ path: testInfo.outputPath(name) });
      await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
    });
  }
}

/** The budget of the surface: the fixed bands and the shortest list of the
 * Record mode fit in the space under the global header. */
test('REC the fixed bands and the list fit in the height of the surface', async ({ page }) => {
  await liveMock(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
  const budget = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const style = getComputedStyle(document.getElementById('page-recording'));
    return { padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      config: box('#rec-capture-band').height, band: box('#rec-combined-band').height,
      line: box('#rec-header-modes').height,
      available: window.innerHeight - box('header.topbar').height - box('#rec-header-modes').height };
  });
  // The destination bar left the page for the header: the thin line under
  // the top bar and the taller ruler of the capture take its place, and the
  // page keeps two gaps of 4 between its three bands.
  const fixed = budget.padding + budget.config + budget.band + 8;
  expect(fixed + 48, 'the fixed bands and the shortest list').toBeLessThanOrEqual(236);
  expect(fixed + 48, 'the page keeps its budget').toBeGreaterThanOrEqual(217);
  expect(budget.available, 'the space under the global header').toBeLessThanOrEqual(236);
});

/** The range of the Record mode opens the Arrangement on the same axis: the
 * chosen markers are the ones the editor shows. */
test('the range of the Record mode opens the Arrangement on the same axis', async ({ page }) => {
  await liveMock(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="recording"]').click();
  await expect(page.locator('#rec-track-grid .rec-track-row')).toHaveCount(1);
  await page.locator('#rec-start-marker').selectOption('1');
  await page.locator('#rec-end-marker').selectOption('2');
  await page.waitForTimeout(400);
  await page.locator('#rec-arrangement-mode').click();
  await expect(page.locator('#rec-arrangement-panel')).toBeVisible();
  await page.waitForTimeout(400);
  const measured = await page.evaluate(() => {
    const timeline = document.getElementById('rec-timeline');
    const track = document.getElementById('rec-timeline-track').getBoundingClientRect();
    const markers = [...document.querySelectorAll('.rec-marker')];
    // The track and the markers share the one scrolled axis: the scroll of
    // the timeline is already inside both boxes and is never added twice.
    const at = index => {
      const box = markers[index].getBoundingClientRect();
      return (box.x + box.width / 2 - track.x) / track.width;
    };
    return { start: at(1), end: at(2), scrollLeft: timeline.scrollLeft };
  });
  expect(measured.scrollLeft, 'the Arrangement opens on the chosen range').toBeGreaterThan(0);
  // The markers of the range keep their place on the one measured axis.
  expect(measured.start, 'the start marker keeps its time on the ruler').toBeCloseTo(32 / 68, 2);
  expect(measured.end, 'the end marker keeps its time on the ruler').toBeCloseTo(64 / 68, 2);
});
