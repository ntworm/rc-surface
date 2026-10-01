import { test, expect } from '@playwright/test';

const CLIP_TARGETS = {
  tracks: [
    { trackIndex: 0, name: 'Keys', sessionId: '11', clips: [{ slotIndex: 0, name: 'Chords', sessionId: '12' }] },
    { trackIndex: 1, name: 'Drums', sessionId: '1071830035832904214785262397353859593604694139', clips: [
      { slotIndex: 0, name: 'Base', sessionId: '22' },
      { slotIndex: 1, name: 'Variação', sessionId: '1071830035832904214785262397353859593604694140' },
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
    window.__mapTargets = [];
    window.__clipTargets = clipTargets;
    window.sendPhoneCommand = (cmd, args, cb) => {
      window.__launchCalls.push({ cmd, args });
      if (cmd === 'getTargets' && window.__refreshError) { cb?.({ ok: false, error: window.__refreshError }); return true; }
      if (cmd === 'getTargets') { cb?.({ ok: true, result: { targets: window.__mapTargets } }); return true; }
      if (cmd === 'getMappings') { cb?.({ ok: true, result: { mappings } }); return true; }
      if (cmd === 'setMapping' && window.__launchSaveError) { cb?.({ ok: false, error: window.__launchSaveError }); return true; }
      if (cmd === 'setMapping') { mappings[args.control] = args.targets; cb?.({ ok: true }); return true; }
      if (cmd === 'getClipTargets') { cb?.({ ok: true, result: window.__clipTargets }); return true; }
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

async function expectCompactMaintenance(detail) {
  const buttons = detail.locator('.map-detail-actions .map-action-danger');
  await expect(buttons).toHaveCount(3);
  const boxes = await Promise.all((await buttons.all()).map((button) => button.boundingBox()));
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(1);
  }
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
  expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x);
  expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

for (const lang of ['en', 'pt-BR']) {
  test(`${lang}: an unmapped control offers only entry cards and one compact maintenance row`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page, lang);
    await page.evaluate(() => { window.__mapTargets = window.mobileMappingState.allTargets = [{ trackIndex: 0, name: 'Keys', isMidi: true }]; });
    const detail = page.locator('#map-mobile-detail');
    await expect(detail.locator('.map-detail-actions button')).toHaveText(lang === 'en'
      ? ['Unbind Target', 'Clear Control', 'Clear All Mappings']
      : ['Desfazer o bind', 'Limpar o controle', 'Limpar todos os mapeamentos']);
    await expect(detail.locator('.map-entry-choice')).toHaveCount(3);
    await expectCompactMaintenance(detail);
    if (lang === 'en' && testInfo.project.name === 'Desktop Chrome') {
      await detail.screenshot({ path: 'test-results/map-empty-compact.png' });
    }
    // Each creation flow remains available through its original card.
    for (const [kind, picker] of [['bind', '.map-picker-tree'], ['note', '.map-picker-list'], ['clip', '.map-picker-list']]) {
      await detail.locator(`.map-entry-choice[data-kind="${kind}"]`).click();
      await expect(detail.locator(picker)).toBeVisible();
      await detail.locator('.map-picker-head button').first().click();
      await expect(detail.locator('.map-entry-choice')).toHaveCount(3);
    }
  });

  test(`${lang}: a mapped control keeps shortcuts that add another mapping without replacing the clip`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page, lang);
    await page.evaluate(() => { window.__mapTargets = window.mobileMappingState.allTargets = [{ trackIndex: 0, name: 'Keys', isMidi: true }]; });
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('.map-entry-choice[data-kind="clip"]').click();
    await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
    await detail.locator('.map-picker-row', { hasText: 'Base' }).click();
    const original = await page.evaluate(() => structuredClone(window.mobileMappingState.currentMappings['sensor.vision.gesture.2'][0]));
    const actions = detail.locator('.map-detail-actions');
    await expect(actions.locator('button')).toHaveCount(6);
    await expect(detail.locator('.map-entry-choice')).toHaveCount(0);
    await expectCompactMaintenance(detail);
    if (lang === 'en' && testInfo.project.name === 'Desktop Chrome') {
      await detail.screenshot({ path: 'test-results/map-bound-compact.png' });
    }
    for (const [name, picker] of [['Trigger Note', '.map-picker-list'], ['Launch Clip', '.map-picker-list']]) {
      await actions.getByRole('button', { name, exact: true }).click();
      await expect(detail.locator(picker)).toBeVisible();
      await detail.locator('.map-picker-head button').first().click();
    }
    await actions.getByRole('button', { name: 'Bind', exact: true }).click();
    await detail.locator('.map-picker-tree').getByRole('button', { name: 'Tempo', exact: true }).click();
    const targets = await page.evaluate(() => window.__launchCalls.filter((call) => call.cmd === 'setMapping').at(-1).args.targets);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual(original);
    expect(targets[1].type).toBe('tempo');
    await expect(detail.locator('.map-bound-target')).toHaveCount(2);
    await expect(actions.locator('button')).toHaveCount(6);
    await expectCompactMaintenance(detail);
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
      track: { trackIndex: 1, trackName: 'Drums', trackSessionId: '1071830035832904214785262397353859593604694139' },
      launchMode: 'clip', clip: { slotIndex: 1, clipName: 'Variação', clipSessionId: '1071830035832904214785262397353859593604694140' },
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


for (const lang of ['en', 'pt-BR']) {
  test(`${lang}: a save error is visible in both Launch Clip pickers and retry succeeds`, async ({ page }) => {
    await setup(page, lang);
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('.map-entry-choice[data-kind="clip"]').click();
    await page.evaluate(() => { window.__launchSaveError = 'Live rejected destination'; window.mobileMappingState.clipPickerPurpose = 'stop'; });
    await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
    const prefix = lang === 'en' ? 'Could not save Launch Clip: ' : 'Não foi possível salvar Lançar clip: ';
    await expect(detail.locator('.map-detail-status')).toHaveText(prefix + 'Live rejected destination');
    await expect(detail.locator('.map-detail-status')).toHaveAttribute('data-kind', 'error');
    await page.evaluate(() => { window.mobileMappingState.clipPickerPurpose = 'new'; });
    await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
    await detail.locator('.map-picker-row', { hasText: 'Base' }).click();
    await expect(detail.locator('.map-detail-status')).toHaveText(prefix + 'Live rejected destination');
    await expect(detail.locator('.map-clip-editor')).toHaveCount(0);
    await page.evaluate(() => { window.__launchSaveError = null; });
    await detail.locator('.map-picker-row', { hasText: 'Base' }).click();
    await expect(detail.locator('.map-clip-editor')).toBeVisible();
  });
}


for (const kind of ['bind', 'note']) {
  test(`${kind}: Refresh updates Live tracks and keeps the filter and selected control`, async ({ page }) => {
    await setup(page, 'pt-BR');
    await page.evaluate(async () => {
      const track = (index, name) => ({ trackIndex: index, name, trackKind: 'track', isMidi: true,
        mixer: [{ label: 'Volume', target: { type: 'volume', trackIndex: index } }], devices: [] });
      window.__mapTargets = [track(0, 'Keys old'), track(1, 'Deleted')];
      await window.loadMobileMappingData();
    });
    const detail = page.locator('#map-mobile-detail');
    await detail.locator(`.map-entry-choice[data-kind="${kind}"]`).click();
    const search = detail.locator('.map-picker-search');
    await search.fill('Keys');
    const refresh = detail.locator('.map-picker-head').getByRole('button', { name: 'Atualizar', exact: true });
    await expect(refresh).toBeVisible();
    expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => {
      window.__mapTargets = [{ trackIndex: 2, name: 'Keys renamed', trackKind: 'track', isMidi: true,
        mixer: [{ label: 'Volume', target: { type: 'volume', trackIndex: 2 } }], devices: [] },
      { trackIndex: 3, name: 'New MIDI', trackKind: 'track', isMidi: true, mixer: [], devices: [] }];
    });
    await refresh.click();
    await expect(search).toHaveValue('Keys');
    await expect(detail).toContainText('Keys renamed');
    await expect(detail).not.toContainText('Keys old');
    await expect(detail).not.toContainText('Deleted');
    expect(await page.evaluate(() => window.mobileMappingState.selectedControl)).toBe('sensor.vision.gesture.2');
    expect(await page.evaluate(() => window.mobileMappingState.selectedTargetIndex)).toBe(0);
    await search.fill('');
    if (kind === 'note') await expect(detail).toContainText('New MIDI');
    await page.evaluate(() => { window.__refreshError = 'Live unavailable'; });
    await refresh.click();
    await expect(detail.locator('.map-detail-status')).toHaveAttribute('data-kind', 'error');
    await expect(detail.locator('.map-detail-status')).toContainText('Live unavailable');
    await expect(detail).toContainText('Keys renamed');
    await expect(refresh).toBeEnabled();
  });
}

test('Launch Clip: Refresh discovers clips from an empty Set and keeps the chosen track by identity', async ({ page }) => {
  await setup(page, 'en');
  await page.evaluate(() => { window.__clipTargets.tracks = []; });
  const detail = page.locator('#map-mobile-detail');
  await detail.locator('.map-entry-choice[data-kind="clip"]').click();
  await expect(detail).toContainText('No track with Session clips');
  const refresh = detail.locator('.map-picker-head').getByRole('button', { name: 'Refresh', exact: true });
  await expect(refresh).toBeVisible();
  expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => { window.__clipTargets.tracks = [{ trackIndex: 0, name: 'Drums', sessionId: '101',
    clips: [{ slotIndex: 0, name: 'Base', sessionId: '102' }] }]; });
  await refresh.click();
  await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
  await expect(refresh).toBeVisible();
  expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => { window.__clipTargets.tracks = [{ trackIndex: 0, name: 'Other', sessionId: '201', clips: [] },
    { trackIndex: 2, name: 'Renamed Drums', sessionId: '101', clips: [{ slotIndex: 3, name: 'New Base', sessionId: '103' }] }]; });
  await refresh.click();
  await expect(detail.locator('.map-picker-row')).toHaveText(['Slot 4 · New Base']);
  await expect(detail.locator('.map-picker-head')).toContainText('Renamed Drums');
  await detail.locator('.map-picker-row').click();
  const saved = await page.evaluate(() => window.__launchCalls.filter((c) => c.cmd === 'setMapping').at(-1).args.targets[0]);
  expect(saved.track).toEqual({ trackIndex: 2, trackName: 'Renamed Drums', trackSessionId: '101' });
  expect(saved.clip).toEqual({ slotIndex: 3, clipName: 'New Base', clipSessionId: '103' });
});

test('Launch Clip: refreshing a deleted track never substitutes the track at its old index', async ({ page }) => {
  await setup(page, 'en');
  const detail = page.locator('#map-mobile-detail');
  await detail.locator('.map-entry-choice[data-kind="clip"]').click();
  await detail.locator('.map-picker-row', { hasText: 'Drums' }).click();
  await page.evaluate(() => { window.__clipTargets.tracks = [{ trackIndex: 1, name: 'Replacement', sessionId: '999',
    clips: [{ slotIndex: 0, name: 'Unrelated clip', sessionId: '1000' }] }]; });
  await detail.locator('.map-picker-head').getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(detail.locator('.map-picker-row')).toHaveCount(0);
  await expect(detail.locator('.map-detail-status')).toHaveAttribute('data-kind', 'error');
  await expect(detail).not.toContainText('Unrelated clip');
  expect(await page.evaluate(() => window.__launchCalls.filter((c) => c.cmd === 'setMapping').length)).toBe(0);
});
