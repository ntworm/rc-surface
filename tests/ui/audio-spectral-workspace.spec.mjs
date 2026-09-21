// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { test, expect } from '@playwright/test';
const VIEWS = ['amplitude', 'attacks', 'tone', 'texture', 'bands', 'all'];
test('retired AUD controls have no active layout rules', async ({ page }) => {
  await page.goto('/?lang=en');
  const retired = await page.evaluate(() => {
    const selectors = [];
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText && /follow-|velocity-|audio-stats|audio-extra|fn-key-use|audio-diagnostic|audio-timeline-modes|data-mode="decisions"/.test(rule.selectorText)) {
          selectors.push(rule.selectorText);
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
    return selectors;
  });
  expect(retired, 'retired controls must not return to the active cascade').toEqual([]);
});
for (const viewport of [{ width: 568, height: 320 }, { width: 851, height: 300 }, { width: 851, height: 393 }, { width: 1024, height: 900 }, { width: 1133, height: 1000 }, { width: 1280, height: 960 }, { width: 1920, height: 1200 }]) {
  test('every descriptor and graph control stays reachable at ' + viewport.width + 'x' + viewport.height, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/?lang=pt-BR');
    await page.locator('.tab[data-page="audio"]').click();
    const roomy = viewport.width >= 1000 && viewport.height >= 650;
    for (const stage of [false, true]) {
      await page.evaluate((active) => document.body.classList.toggle('stage-mode', active), stage);
      // Twelve cards, always present: no group is hidden behind a second menu.
      await expect(page.locator('.audio-detector-card')).toHaveCount(12);
      await expect(page.locator('.audio-detector-card:visible')).toHaveCount(12);
      await expect(page.locator('#audio-detector-groups')).toHaveCount(0);
      for (const view of VIEWS) {
        const button = page.locator('[data-audio-view="' + view + '"]');
        await expect(button).toBeVisible();
        // Roomy screens get controls you can actually hit; short phones keep
        // them small so the curve is not squeezed out of the graph.
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(roomy ? 24 : 16);
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#audio-timeline')).toHaveAttribute('data-view', view);
        await expect(page.locator('#audio-graph-legend button')).toHaveCount(view === 'all' ? 12 : view === 'amplitude' ? 2 : 3);
        const layout = await page.evaluate(() => {
          const bank = document.querySelector('#audio-detector-bank').getBoundingClientRect();
          const overflowing = (node) => node.scrollWidth > node.clientWidth + 1;
          return {
            pageScroll: document.documentElement.scrollHeight > innerHeight + 1
              || document.documentElement.scrollWidth > innerWidth + 1,
            sideways: [...document.querySelectorAll('.audio-detector-card,.audio-detector-value,.audio-detector-label,.audio-graph-views button,#audio-graph-legend button')]
              .filter((node) => node.getClientRects().length && overflowing(node)).map((node) => node.textContent),
            outside: [...document.querySelectorAll('.audio-detector-card')]
              .map((node) => node.getBoundingClientRect())
              .filter((box) => box.top >= bank.top - 1 && box.bottom <= bank.bottom + 1)
              .filter((box) => box.right > innerWidth + 1 || box.bottom > innerHeight + 1).length,
            hiddenRows: document.querySelector('#audio-detector-bank').scrollHeight
              > document.querySelector('#audio-detector-bank').clientHeight + 1,
          };
        });
        const legendFit = await page.evaluate(() => {
          const legend = document.querySelector('#audio-graph-legend');
          const timeline = document.querySelector('#audio-timeline').getBoundingClientRect();
          return {
            // Twelve toggles wrap onto a second line: the row has to grow,
            // not swallow the names that do not fit.
            clipped: legend.scrollHeight > legend.clientHeight + 1,
            outside: [...legend.children].filter((chip) => chip.getBoundingClientRect().bottom > timeline.bottom + 1).length,
            missing: [...legend.children].filter((chip) => !chip.getClientRects().length).length,
          };
        });
        expect(legendFit.clipped).toBe(false);
        expect(legendFit.outside).toBe(0);
        expect(legendFit.missing).toBe(0);
        expect(layout.pageScroll).toBe(false);
        expect(layout.sideways).toEqual([]);
        expect(layout.outside).toBe(0);
        const controlsFit = await page.evaluate(() => {
          const strip = document.querySelector('#audio-detector-controls');
          const root = document.querySelector('.media-card-audio');
          const analysis = document.querySelector('.audio-analysis-grid').getBoundingClientRect();
          const style = getComputedStyle(root);
          return {
            clipped: strip.scrollHeight > strip.clientHeight + 1,
            cardClips: [...strip.children].filter((card) => card.scrollHeight > card.clientHeight + 1
              || card.scrollWidth > card.clientWidth + 1).map((card) => card.textContent),
            bottomGap: root.getBoundingClientRect().bottom - analysis.bottom
              - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth),
            canvasHeight: document.querySelector('#audio-timeline-canvas').getBoundingClientRect().height,
            dialWidths: [...strip.querySelectorAll('.audio-analysis-dial')].map((dial) => dial.getBoundingClientRect().width),
          };
        });
        expect(controlsFit.clipped, view + ': no vertically clipped knob/window row').toBe(false);
        expect(controlsFit.cardClips, view + ': entire knob labels and values fit').toEqual([]);
        expect(Math.abs(controlsFit.bottomGap), view + ': no retired empty row below analysis').toBeLessThanOrEqual(1);
        expect(controlsFit.canvasHeight, view + ': preserve the signal area').toBeGreaterThanOrEqual(28);
        for (const width of controlsFit.dialWidths) expect(width).toBeGreaterThanOrEqual(roomy ? 36 : 30);
        // On short screens the strip scrolls horizontally, never hides the
        // window picker or steals multiple rows from the signal.
        const windowButton = page.locator('[data-detector-window="4"]');
        await windowButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-detector-window="4"]')).toHaveAttribute('aria-pressed', 'true');
        // A roomy screen shows the twelve rows at once; small ones may scroll.
        if (roomy) expect(layout.hiddenRows).toBe(false);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('audio-workspace.png') });
  });
}
test('spectral groups expose twelve real mapping sources with physical units and selectable graph channels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="audio"]').click();
  await expect(page.locator('.audio-detector-card')).toHaveCount(12);
  await page.evaluate(() => {
    window.AudioProcessor = class {
      constructor() { window.testAudioProcessor = this; }
      setAnalysisSettings() {}
      async start() { return true; }
      stop() {}
    };
  });
  await page.locator('#chk-audio-enable').check({ force: true });
  await page.evaluate(() => window.testAudioProcessor.onDescriptorUpdate({
    transient: .9, kick: .8, snare: .1, brightness: .4, centroid: .1, flux: .2,
    flatness: .3, spread: .1, rolloff: .2, low: .6, mid: .4, high: .2,
  }));
  await expect(page.locator('#lbl-audio-centroid')).toHaveText('2000 Hz');
  await expect(page.locator('#lbl-audio-spread')).toHaveText('1000 Hz');
  await expect(page.locator('#lbl-audio-rolloff')).toHaveText('4000 Hz');
  await expect(page.locator('#lbl-audio-flatness')).toHaveText('0.300');
  await page.locator('[data-audio-view="all"]').click();
  await expect(page.locator('#audio-timeline')).toHaveAttribute('data-view', 'all');
  await expect(page.locator('#audio-graph-legend button')).toHaveCount(12);
  // The axis says what it was drawn against instead of silently rescaling.
  await expect(page.locator('#audio-graph-scale')).toHaveText(/^0–[01]\.\d\d$/);
  const legend = page.locator('[data-audio-series="flatness"]');
  await expect(legend).toHaveAttribute('aria-pressed', 'true');
  await legend.click();
  await expect(legend).toHaveAttribute('aria-pressed', 'false');
  // The single view control is the only chooser: picking a group keeps the
  // twelve cards and only narrows the curves.
  await page.locator('[data-audio-view="texture"]').click();
  await expect(page.locator('#audio-graph-legend button')).toHaveCount(3);
  await expect(page.locator('.audio-detector-card')).toHaveCount(12);
  await page.locator('#chk-audio-enable').uncheck({ force: true });
  await expect(page.locator('#audio-timeline')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('#audio-timeline-status')).toHaveText('AUDIO OFF');
  await expect(page.locator('#lbl-audio-centroid')).toHaveText('0 Hz');
  for (const field of ['centroid', 'flatness', 'flux', 'spread', 'rolloff', 'low', 'mid', 'high']) {
    if (await page.locator('#btn-map-mode').getAttribute('aria-pressed') !== 'true') await page.locator('#btn-map-mode').click();
    await page.locator('[data-name="sensor.audio.' + field + '"].audio-detector-card').click();
    await expect.poll(() => page.evaluate(() => window.mobileMappingState.selectedControl)).toBe('sensor.audio.' + field);
    await page.locator('#btn-map-mode').click();
  }
});

test('AUD flat arc knobs keep group accents, drag, keyboard and reset', async ({ page }) => {
  await page.setViewportSize({ width: 1133, height: 1000 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="audio"]').click();
  await page.locator('[data-audio-view="attacks"]').click();
  const dial = page.locator('[data-detector-dial="sensitivity"]');
  const input = dial.locator('input');
  const initial = await input.inputValue();
  const skin = await dial.evaluate((node) => {
    const style = getComputedStyle(node);
    const pointer = getComputedStyle(node.querySelector('.audio-analysis-dial-face'), '::after');
    return {
      background: style.backgroundImage, border: style.borderTopWidth, shadow: style.boxShadow,
      pointerWidth: pointer.width, pointerHeight: pointer.height,
      pointerColor: pointer.backgroundColor, ring: getComputedStyle(node, '::before').backgroundImage,
    };
  });
  expect(skin.background).not.toContain('radial-gradient');
  expect(skin.shadow).toBe('none');
  expect(skin.pointerWidth).toBe('3px');
  expect(skin.pointerHeight).toBe('10px');
  expect(skin.pointerColor).toBe('rgb(255, 55, 95)');
  expect(skin.ring).toContain('conic-gradient');
  await input.focus();
  await page.keyboard.press('ArrowUp');
  await expect(input).not.toHaveValue(initial);
  await expect(dial).toHaveCSS('outline-color', skin.pointerColor);
  const afterKey = Number(await input.inputValue());
  const box = await dial.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 4 });
  await page.mouse.up();
  expect(Number(await input.inputValue())).toBeGreaterThan(afterKey);
  await dial.dblclick();
  await expect(input).toHaveValue(initial);
  await page.locator('[data-audio-view="all"]').click();
  await expect(page.locator('.audio-control-group')).toHaveCount(4);
  for (const group of ['attacks', 'tone', 'texture', 'bands']) {
    const section = page.locator('.audio-control-group[data-group="' + group + '"]');
    await expect(section.locator('h3')).toHaveCount(1);
    await expect(section.locator('.audio-analysis-dial')).toHaveCount(group === 'attacks' ? 4 : 2);
  }
  await expect(page.locator('.audio-control-group [data-detector-knob="window"]')).toHaveCount(0);
});

test('AUD times follow Live SYNC, retain FREE settings and never use detected BPM', async ({ page }) => {
  let socket;
  await page.routeWebSocket('**/ws*', (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'resume') ws.send(JSON.stringify({ type: 'hello', client_id: 'audio-timing-test', role: 'controller', tempo: 120, signature: '4/4' }));
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
    });
  });
  await page.addInitScript(() => localStorage.setItem('ableton-rc:audio_detectors', JSON.stringify({
    releaseMs: 65, toneMs: 75, textureMs: 55, bandsMs: 0,
    releaseBeats: 4, toneBeats: 1, textureBeats: .5, bandsBeats: 0,
  })));
  await page.setViewportSize({ width: 1133, height: 1000 });
  await page.goto('/?lang=en');
  await page.locator('.tab[data-page="audio"]').click();
  await page.locator('[data-audio-view="all"]').click();
  const output = (key) => page.locator('[data-detector-knob="' + key + '"] output');
  await expect(output('releaseMs')).toHaveText('1/1 · 2000 ms');
  await expect(page.locator('.audio-controls-clock')).toHaveAttribute('title', /1\/128.*triplet.*dotted/i);
  await expect(output('toneMs')).toHaveText('1/4 · 500 ms');
  await expect(output('bandsMs')).toHaveText('OFF');
  await page.evaluate(() => {
    const Processor = window.AudioProcessor;
    window.AudioProcessor = class extends Processor {
      constructor() { super(); window.testAudioTiming = this; }
      async start() { return true; } // Only hardware capture is substituted.
    };
  });
  await page.locator('#chk-audio-enable').check({ force: true });
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.releaseMs)).toBe(2000);
  const input = page.locator('[data-detector-dial="toneMs"] input');
  await input.focus();
  socket.send(JSON.stringify({ type: 'tempo', tempo: 60 }));
  await expect(output('releaseMs')).toHaveText('1/1 · 4000 ms');
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.toneMs)).toBe(1000);
  // Repeated state packets must not replace an active dial and steal capture/focus.
  await input.focus();
  socket.send(JSON.stringify({ type: 'live_state', tempo: 60 }));
  await expect(input).toBeFocused();
  await page.locator('#btn-sync-mode').click();
  await expect(output('releaseMs')).toHaveText('65 ms');
  await expect(output('toneMs')).toHaveText('75 ms');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.releaseMs)).toBe(65);
  await page.evaluate(() => window.testAudioTiming.onAnalysisUpdate({
    pitch: 0, midiNote: 0, bpm: 177, rms: 0, clarity: 0, whistleBend: .5, envelope: 0, attack: 0, gate: 0,
  }));
  expect(await page.evaluate(() => window.currentBpm)).toBe(60);
  socket.send(JSON.stringify({ type: 'tempo', tempo: 90 }));
  await expect(output('toneMs')).toHaveText('75 ms');
  await page.locator('#btn-sync-mode').click();
  await expect(output('toneMs')).toHaveText('1/4 · 667 ms');
  socket.send(JSON.stringify({ type: 'transport_state', state: { connected: true, tempo: 30 } }));
  await expect(output('releaseMs')).toHaveText('1/1 · 8000 ms');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.releaseMs)).toBe(8000);
  await input.focus();
  await page.keyboard.press('Home');
  await expect(output('toneMs')).toHaveText('OFF');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.toneMs)).toBe(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ableton-rc:audio_detectors')));
  expect(saved.toneMs).toBe(75);
  expect(saved.toneBeats).toBe(0);

  // The new low end must reach the actual processor, not just change labels.
  socket.send(JSON.stringify({ type: 'tempo', tempo: 120 }));
  await input.focus();
  await page.keyboard.press('ArrowRight'); // OFF -> 1/128 triplet.
  await expect(output('toneMs')).toHaveText('1/128 T · 10 ms');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.toneMs))
    .toBeCloseTo(10.4166666667, 8);
  await page.keyboard.press('ArrowRight'); // Straight 1/128.
  await expect(output('toneMs')).toHaveText('1/128 · 16 ms');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.toneMs)).toBe(15.625);
  await page.keyboard.press('ArrowRight'); // 1/64 T (20.833ms) precedes 1/128 D.
  await expect(output('toneMs')).toHaveText('1/64 T · 21 ms');
  await page.keyboard.press('ArrowRight'); // Dotted 1/128.
  await expect(output('toneMs')).toHaveText('1/128 D · 23 ms');
  const release = page.locator('[data-detector-dial="releaseMs"] input');
  await release.focus();
  await page.keyboard.press('Home');
  socket.send(JSON.stringify({ type: 'tempo', tempo: 240 }));
  await expect(output('releaseMs')).toHaveText('1/128 T · 5 ms');
  await expect.poll(() => page.evaluate(() => window.testAudioTiming.descriptorSettings.releaseMs))
    .toBeCloseTo(5.2083333333, 8);
  await expect(release).toBeFocused();
  await page.locator('#btn-sync-mode').click();
  await expect(output('releaseMs')).toHaveText('65 ms');
  await expect(output('toneMs')).toHaveText('75 ms');
  await release.focus();
  await page.keyboard.press('Home');
  await expect(output('releaseMs')).toHaveText('10 ms');
  await page.keyboard.press('End');
  await expect(output('releaseMs')).toHaveText('500 ms');
});

test('card and legend swatches match all twelve solid curve shades', async ({ page }) => {
  await page.setViewportSize({ width: 1133, height: 1000 });
  await page.goto('/?lang=pt-BR');
  await page.locator('.tab[data-page="audio"]').click();
  await page.locator('[data-audio-view="all"]').click();
  const swatches = await page.evaluate(() => window.AudioDescriptorCatalog.map((entry) => {
    const card = document.querySelector('[data-name="' + entry.name + '"] .audio-detector-label');
    const legend = document.querySelector('[data-audio-series="' + entry.field + '"]');
    return {
      cardStyle: getComputedStyle(card).borderBottomStyle,
      legendStyle: getComputedStyle(legend).borderBottomStyle,
      cardColor: getComputedStyle(card).borderBottomColor,
      legendColor: getComputedStyle(legend).borderBottomColor,
      label: legend.textContent,
    };
  }));
  expect(new Set(swatches.map((swatch) => swatch.cardColor)).size).toBe(12);
  for (const swatch of swatches) {
    expect(swatch.cardStyle).toBe('solid');
    expect(swatch.legendStyle).toBe('solid');
    expect(swatch.cardColor).toBe(swatch.legendColor);
    expect(swatch.label.length).toBeGreaterThan(0);
  }
});
