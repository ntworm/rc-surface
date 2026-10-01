import { test, expect } from '@playwright/test';

const CLIP_TARGETS = {
  tracks: [
    { trackIndex: 0, name: 'Keys', sessionId: '11', clips: [{ slotIndex: 0, name: 'Chords', sessionId: '12' }] },
    { trackIndex: 1, name: 'Drums', sessionId: '21', clips: [
      { slotIndex: 0, name: 'Base', sessionId: '22' },
      { slotIndex: 1, name: 'Variação', sessionId: '23' },
      { slotIndex: 2, name: 'Virada', sessionId: '24' },
    ] },
  ],
  osc: { available: true, connected: true },
};

async function setup(page, lang) {
  await page.goto(`/?lang=${lang}`);
  await page.addStyleTag({ content: 'body > :not(#orientation-warning) { filter: none !important; pointer-events: auto !important; }' });
  await page.waitForFunction(() => window.openMobileMappingMode && window.phoneWs?.readyState === 1);
  await page.evaluate((clipTargets) => {
    const mappings = {};
    window.__launchCalls = [];
    window.sendPhoneCommand = (cmd, args, cb) => {
      window.__launchCalls.push({ cmd, args });
      if (cmd === 'getTargets') { cb?.({ ok: true, result: { targets: [] } }); return true; }
      if (cmd === 'getMappings') { cb?.({ ok: true, result: { mappings } }); return true; }
      if (cmd === 'setMapping') { mappings[args.control] = args.targets; cb?.({ ok: true }); return true; }
      if (cmd === 'getClipTargets') { cb?.({ ok: true, result: clipTargets }); return true; }
      if (cmd === 'getClipLaunchStatus') {
        cb?.({ ok: true, result: { statuses: [{ control: 'sensor.vision.gesture.2', targetIndex: 0, state: 'idle', quantization: { source: 'global', label: '1 Bar' } }], diagnostics: [] } });
        return true;
      }
      cb?.({ ok: true, result: { mappings: {}, clients: [], presets: ['Default'], current: 'Default' } });
      return true;
    };
  }, CLIP_TARGETS);
  await page.evaluate(async () => {
    document.getElementById('orientation-warning')?.remove();
    await window.openMobileMappingMode();
    window.mobileMappingState.selectedControl = 'sensor.vision.gesture.2';
    window.mobileMappingState.selectedTargetIndex = 0;
    window.renderDetail();
  });
}

test.describe('Launch Clip in MAP', () => {
  test('pt-BR: pose → Launch Clip → track → clip, then the editor reports only what Live says', async ({ page }) => {
    await setup(page, 'pt-BR');
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('.map-entry-choice[data-kind="clip"]').click();
    await expect(detail.locator('.map-picker-row')).toHaveText(['Keys', 'Drums']);
    await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
    await expect(detail.locator('.map-picker-row')).toHaveText(['Slot 1 · Base', 'Slot 2 · Variação', 'Slot 3 · Virada']);
    await detail.locator('.map-picker-row', { hasText: 'Variação' }).click();

    const editor = detail.locator('.map-clip-editor');
    await expect(editor).toBeVisible();
    await expect(editor.locator('.map-trigger-track-label').first()).toHaveText('Drums · Variação · Slot 2');
    await expect(editor.locator('.map-note-section-title')).toHaveText(['Destino', 'Escolha', 'Quantização', 'Depois que entra']);
    await expect(editor.locator('.map-clip-quantization')).toHaveText('Global do Live: 1 Bar');
    await expect(editor.locator('.map-clip-status')).toHaveText('Pronto');
    await page.evaluate(() => window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.2', targetIndex: 0, state: 'queued' }));
    await expect(editor.locator('.map-clip-status')).toHaveText('Aguardando no Live (próximo limite)');
    await page.evaluate(() => window.handleClipLaunchState({ type: 'clip_launch_state', control: 'sensor.vision.gesture.2', targetIndex: 0, state: 'playing' }));
    await expect(editor.locator('.map-clip-status')).toHaveText('Tocando');

    const saved = await page.evaluate(() => window.__launchCalls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0]);
    expect(saved).toEqual({
      type: 'clip_launch', trackIndex: 1,
      track: { trackIndex: 1, trackName: 'Drums', trackSessionId: '21' },
      launchMode: 'clip', clip: { slotIndex: 1, clipName: 'Variação', clipSessionId: '23' },
    });

    await editor.locator('.map-segmented-btn[data-clip-then="stop"]').click();
    await expect(detail.locator('.map-clip-rule-label')).toHaveText('Regra do RC Surface. Não lê nem altera as Follow Actions do Live.');
    await expect(detail.locator('.map-clip-warning', { hasText: 'Follow Action' })).toBeVisible();
  });

  test('en: the editor fits the phone width with 44 px touch targets', async ({ page }, testInfo) => {
    await setup(page, 'en');
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('.map-entry-choice[data-kind="clip"]').click();
    await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
    await detail.locator('.map-picker-row', { hasText: 'Virada' }).click();
    const editor = detail.locator('.map-clip-editor');
    await expect(editor.locator('.map-note-section-title')).toHaveText(['Destination', 'Choice', 'Quantization', 'After it starts']);
    await expect(editor.locator('.map-clip-status')).toHaveText('Ready');
    const overflow = await editor.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const testButton = await editor.locator('.map-clip-test').boundingBox();
    expect(testButton.height).toBeGreaterThanOrEqual(44);
    await editor.locator('.map-segmented-btn[data-clip-mode="list"]').click();
    await expect(detail.locator('.map-clip-list-item')).toHaveCount(2);
    await expect(detail.locator('.map-clip-rule-label')).toHaveCount(0);
    if (testInfo.project.name === 'Mobile Chrome Landscape') {
      await detail.screenshot({ path: 'test-results/launch-clip-editor-mobile.png' });
    }
  });
});
