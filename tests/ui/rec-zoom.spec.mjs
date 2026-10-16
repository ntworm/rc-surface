// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';

for (const locale of ['en', 'pt-BR']) {
  test(`REC zoom is flat, keyboard visible and keeps native range interaction (${locale})`, async ({ page }, testInfo) => {
    // Optional negative proof changes the response only, never product files.
    const mutation = process.env.RC_REC_ZOOM_MUTATION ? JSON.parse(process.env.RC_REC_ZOOM_MUTATION) : null;
    if (mutation) await page.route('**/recording.css', async route => {
      const response = await route.fetch(), source = await response.text();
      if (!source.includes(mutation.from)) throw new Error('Missing zoom mutation target');
      await route.fulfill({ response, body: source.replace(mutation.from, mutation.to) });
    });
    const commands = [];
    await page.routeWebSocket('**/ws*', socket => socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'resume') socket.send(JSON.stringify({ type: 'hello', client_id: 'zoom-test', role: 'controller' }));
      if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      if (!message.cmd) return;
      commands.push(message.cmd);
      const observed = value => ({ value, fresh: true, observedAt: Date.now() });
      const result = ['getRecordingState','recordingSeekMarker'].includes(message.cmd) ? {
        transport: { connected: true, isPlaying: observed(false), recordMode: observed(false),
          songTimeBeats: observed(8), metronome: observed(false) },
        tracks: [{ index: 0, id: 'zoom-track', name: 'Drums', arm: false, canArm: true, solo: false, mute: false }],
        locators: [{ name: 'Verse', time: 8 }, { name: 'Chorus', time: 24 }, { name: 'End', time: 40 }],
        meter: { numerator: 4, denominator: 4 },
      } : message.cmd === 'getMappings' ? { mappings: {} } : {};
      socket.send(JSON.stringify({ id: message.id, ok: true, result }));
    }));
    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto('/?lang=' + locale);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.tab[data-page="recording"]').click();
    await expect(page.locator('.rec-marker')).toHaveCount(3);
    const zoom = page.locator('#rec-zoom'), track = page.locator('#rec-timeline-track');
    await expect(zoom).toHaveAttribute('type', 'range');
    await expect(zoom).toHaveAttribute('min', '1');
    await expect(zoom).toHaveAttribute('max', '300');
    await expect(zoom).toHaveAttribute('step', '1');

    for (const viewport of [{ width: 851, height: 393 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await zoom.focus();
      await zoom.press('Home');
      await page.locator('#rec-position').click();
      await page.locator('.rec-marker-strip').screenshot({ path: testInfo.outputPath(`rec-zoom-${locale}-${viewport.width}-idle.png`) });
      const geometry = await zoom.evaluate(el => ({ width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height, appearance: getComputedStyle(el).appearance,
        radius: getComputedStyle(el).borderRadius, background: getComputedStyle(el).backgroundColor }));
      expect(geometry.width, 'compact phone range, full desktop range').toBe(viewport.width<=950?72:100);
      expect(geometry.height, 'range has a full touch interaction area').toBeGreaterThanOrEqual(44);
      expect(geometry.appearance, 'replace the browser-default rounded slider').toBe('none');
      expect(geometry.radius).toBe('0px');
      expect(geometry.background).toBe('rgba(0, 0, 0, 0)');

      await zoom.focus();
      await zoom.press('ArrowRight');
      await expect(zoom).toHaveValue('2');
      await expect(track).toHaveAttribute('style', /width: calc\(200% - 96px\)/);
      await expect(zoom).toBeFocused();
      expect(await zoom.evaluate(el => el.matches(':focus-visible'))).toBe(true);
      await expect(zoom).toHaveCSS('outline-style', 'solid');
      await expect(zoom).toHaveCSS('outline-width', '2px');
      await expect(zoom).toHaveCSS('outline-color', 'rgb(255, 161, 51)');
      await page.locator('.rec-marker-strip').screenshot({ path: testInfo.outputPath(`rec-zoom-${locale}-${viewport.width}-focus.png`) });
      await zoom.press('End');
      await expect(zoom).toHaveValue('300');
      await expect(track).toHaveAttribute('style', /width: calc\(30000% - 96px\)/);
      await zoom.press('ArrowRight');
      await expect(zoom).toHaveValue('300');
      await zoom.press('Home');
      await expect(zoom).toHaveValue('1');

      const box = await zoom.boundingBox();
      await page.mouse.move(box.x + 6, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .75, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const value = Number(await zoom.inputValue());
      expect(value, 'native pointer drag changes the zoom').toBeGreaterThan(1);
      expect(value).toBeLessThanOrEqual(300);
      await expect(track).toHaveAttribute('style', new RegExp('width: calc\\(' + value * 100 + '% - 96px\\)'));
      await expect(page.locator('.rec-marker')).toHaveCount(3);
    }
    expect(commands.filter(command => command.startsWith('recording')), 'zoom never sends host writes').toEqual([]);
    // Chorus is also the midpoint of Verse..End: both must stay at the
    // viewport center even when the selected interval no longer fits.
    for (const selection of [{start:'1',end:''},{start:'0',end:'2'}]) {
      await page.locator('#rec-start-marker').selectOption(selection.start);
      await page.locator('#rec-end-marker').selectOption(selection.end);
      const before=commands.length;
      await zoom.evaluate(el=>{el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await expect.poll(()=>page.evaluate(()=>{
        const timeline=document.getElementById('rec-timeline').getBoundingClientRect();
        const marker=document.querySelectorAll('.rec-marker')[1].getBoundingClientRect();
        return Math.abs(marker.x+marker.width/2-(timeline.x+timeline.width/2));
      })).toBeLessThan(3);
      expect(commands.slice(before).filter(command=>command.startsWith('recording'))).toEqual([]);
    }
  });
}
