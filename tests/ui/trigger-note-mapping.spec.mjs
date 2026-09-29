import { test, expect } from '@playwright/test';

async function setupTriggerNotePage(page, viewport) {
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  await page.goto('/?lang=pt-BR');
  // Isolate the drawer's responsive layout from the app's landscape-only guard.
  await page.addStyleTag({ content: 'body > :not(#orientation-warning) { filter: none !important; pointer-events: auto !important; }' });
  await page.waitForFunction(() => window.openMobileMappingMode && window.phoneWs?.readyState === 1);
  await page.evaluate(() => {
    const triggerTarget = {
      type: 'device_param',
      trackIndex: 0,
      trackKind: 'track',
      mode: 'trigger_note',
      midiNote: 'C2',
      midiVelocity: 100,
      noteTiming: 'beat',
      noteGate: 'pulse',
      noteDurationMs: 80,
    };
    window.sendPhoneCommand = (cmd, args, cb) => {
      if (cmd === 'getTargets') {
        cb?.({
          ok: true,
          result: {
            targets: [
              {
                name: 'Chords Track',
                trackKind: 'track',
                trackIndex: 0,
                isMidi: true,
                devices: [{ name: 'RcReceiver v2', params: [] }],
              },
              {
                name: 'Lead Synth Track',
                trackKind: 'track',
                trackIndex: 1,
                isMidi: true,
                devices: [{ name: 'RcReceiver v2', params: [] }],
              },
            ],
          },
        });
        return true;
      }
      if (cmd === 'getMappings') {
        cb?.({
          ok: true,
          result: {
            mappings: {
              'sensor.vision.gesture.1': [triggerTarget],
            },
          },
        });
        return true;
      }
      if (cmd === 'addUdpReceiverToTrack') {
        cb?.({ ok: true, result: { success: true } });
        return true;
      }
      if (cmd === 'setMapping' && args?.control === 'sensor.vision.gesture.1') {
        Object.assign(triggerTarget, args.targets[0]);
        cb?.({ ok: true, result: { control: args.control, targets: args.targets } });
        return true;
      }
      cb?.({ ok: true, result: { mappings: {}, clients: [], presets: ['Default'], current: 'Default' } });
      return true;
    };
  });

  await page.evaluate(async () => {
    const warn = document.getElementById('orientation-warning');
    if (warn) warn.remove();
    if (window.openMobileMappingMode) await window.openMobileMappingMode();
    window.mobileMappingState.selectedControl = 'sensor.vision.gesture.1';
    window.mobileMappingState.selectedTargetIndex = 0;
    if (typeof window.renderDetail === 'function') window.renderDetail();
  });
}

test.describe('Trigger Note Mapping Editor UI', () => {
  test('C20: curve handles stay on the line with Drive/Compression and real pointer drag', async ({ page }, testInfo) => {
    await setupTriggerNotePage(page, { width: 1280, height: 960 });
    await page.evaluate(() => {
      const mappings = { 'sensor.vision.gesture.1': [{ type: 'tempo', mode: 'continuous', curve: 'exponential', outMin: 0, outMax: 1, drive: 0.32, compressor: 0 }] };
      const send = window.sendPhoneCommand;
      window.sendPhoneCommand = (cmd, args, cb) => {
        if (cmd === 'getMappings') { cb?.({ ok: true, result: { mappings } }); return true; }
        if (cmd === 'setMapping') { mappings[args.control] = args.targets; cb?.({ ok: true }); return true; }
        return send(cmd, args, cb);
      };
      // Record the real canvas frame while preserving every native drawing call.
      const proto = CanvasRenderingContext2D.prototype;
      const fillRect = proto.fillRect;
      proto.fillRect = function (...args) {
        if (this.canvas.classList.contains('map-curve-canvas')) this.canvas.testFrame = { arcs: [], points: [] };
        return fillRect.apply(this, args);
      };
      for (const name of ['arc', 'moveTo', 'lineTo']) {
        const original = proto[name];
        proto[name] = function (...args) {
          const frame = this.canvas.testFrame;
          if (frame) frame[name === 'arc' ? 'arcs' : 'points'].push({ x: args[0], y: args[1] });
          return original.apply(this, args);
        };
      }
      window.mobileMappingState.currentMappings = mappings;
      window.currentControlMappings = mappings;
      window.renderDetail();
    });
    const detail = page.locator('#map-mobile-detail');
    const canvas = detail.locator('.map-curve-canvas');
    const assertAligned = async () => {
      await expect.poll(() => canvas.evaluate((element) => {
        const frame = element.testFrame;
        if (!frame || frame.arcs.length < 5) return Infinity;
        return Math.max(...frame.arcs.slice(-3).map((arc) => Math.min(...frame.points.map((p) => Math.hypot(p.x - arc.x, p.y - arc.y)))));
      })).toBeLessThan(0.001);
    };
    await assertAligned();
    if (testInfo.project.name === 'Desktop Chrome') await detail.screenshot({ path: 'test-results/curve-drive-positive.png' });
    await page.evaluate(() => window.updateMobileTargetField('drive', -0.25));
    await assertAligned();
    if (testInfo.project.name === 'Desktop Chrome') await detail.screenshot({ path: 'test-results/curve-drive-negative.png' });
    await page.evaluate(() => window.updateMobileTargetField('compressor', -0.5));
    await assertAligned();
    await canvas.scrollIntoViewIfNeeded();
    const position = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const center = element.testFrame.arcs.at(-1);
      return { x: rect.left + center.x * rect.width / element.width, y: rect.top + center.y * rect.height / element.height, desiredY: rect.top + (14 + 0.4 * (element.height - 28)) * rect.height / element.height };
    });
    await page.mouse.move(position.x, position.y);
    await page.mouse.down();
    await page.mouse.move(position.x, position.desiredY, { steps: 4 });
    await page.mouse.up();
    await expect(detail.locator('input[data-field="drive"]')).toHaveValue('0.45');
    await assertAligned();
  });
  test('C19: maintenance sits under the title and typed mappings keep editor selection', async ({ page }, testInfo) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    const detail = page.locator('#map-mobile-detail');
    await expect(detail.locator('.map-detail-title + .map-detail-actions')).toHaveCount(1);
    for (const button of await detail.locator('.map-detail-actions button').all()) await expect(button).toBeInViewport();
    await page.evaluate(() => {
      const mappings = window.mobileMappingState.currentMappings;
      mappings['sensor.vision.gesture.1'].push({ type: 'tempo', mode: 'continuous', curve: 'linear' });
      window.currentControlMappings = mappings;
      window.renderDetail();
    });
    const group = detail.locator('.map-control-mappings');
    await expect(group).toHaveAccessibleName(/vision gesture 1/i);
    await expect(group.locator('.map-bound-target')).toHaveCount(2);
    await expect(group.locator('.map-bound-type')).toHaveText(['Trigger Note', 'Bind']);
    await expect(group.locator('.map-bound-destination')).toHaveText(['Chords Track', 'Song Tempo']);
    await group.locator('[data-target-index="1"]').click();
    await expect(group.locator('[data-target-index="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('.map-curve-canvas')).toBeVisible();
    if (testInfo.project.name === 'Desktop Chrome') {
      await page.setViewportSize({ width: 1280, height: 960 });
      await detail.screenshot({ path: 'test-results/top-mappings-bind.png' });
    }
    await group.locator('[data-target-index="0"]').click();
    await expect(group.locator('[data-target-index="0"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('.map-note-section')).toHaveCount(3);
    if (testInfo.project.name === 'Desktop Chrome') await detail.screenshot({ path: 'test-results/top-mappings-note.png' });
    await page.evaluate(() => { window.mobileMappingState.currentMappings['sensor.vision.gesture.1'] = []; window.renderDetail(); });
    await expect(detail.locator('.map-detail-title + .map-detail-actions')).toHaveCount(1);
    await expect(detail.locator('.map-detail-actions button')).toHaveCount(5);
    await expect(detail.locator('.map-entry-choice')).toHaveCount(2);
  });
  for (const vp of [
    { name: 'mobile-portrait', width: 360, height: 740 },
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'desktop', width: 1280, height: 800 },
  ]) {
    test(`renders trigger_note editor correctly on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await setupTriggerNotePage(page, { width: vp.width, height: vp.height });

      const detail = page.locator('#map-mobile-detail');
      await expect(detail).toBeVisible();

      // Destination track header & receiver badge
      await expect(detail.locator('.map-trigger-track-label')).toContainText('Chords Track');
      await expect(detail.locator('.map-receiver-badge')).toBeVisible();
      await expect(detail.locator('.map-bound-list')).toHaveCount(0);
      await expect(detail.locator('.map-note-section-title')).toHaveText(['Destino', 'Nota', 'Disparo']);
      await expect(detail.locator('.map-editor-advanced')).not.toHaveAttribute('open', '');
      await expect(detail.locator('.map-note-management')).not.toHaveAttribute('open', '');

      // Note and Octave selects
      await expect(detail.locator('.map-midi-pitch-select')).toBeVisible();
      await expect(detail.locator('.map-midi-octave-select')).toBeVisible();
      await expect(detail.locator('.map-midi-number-badge')).toContainText('MIDI 48');

      // Continuous controls must NOT be visible
      await expect(detail.locator('.map-curve-canvas')).toBeHidden();
      await expect(detail.locator('.map-editor-sliders-grid')).toBeHidden();

      // Timing & Gate options
      const timingBtns = detail.locator('.map-segmented-btn[data-value="beat"]');
      await expect(timingBtns.first()).toBeVisible();

      // C14: only configuration controls and real note feedback remain.
      await expect(detail.locator('.map-btn-for-chords, .map-btn-for-chords-hold, .map-btn-test-note')).toHaveCount(0);

      // Feedback display
      const feedback = detail.locator('.map-trigger-feedback');
      await expect(feedback).toHaveCount(1);
    });
  }

  test('feedback updates when receiving trigger_note_state events', async ({ page }) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });

    const feedback = page.locator('#map-trigger-feedback');
    await expect(feedback).toHaveCount(1);

    // Emulate incoming trigger_note_state
    await page.evaluate(() => {
      window.handleTriggerNoteState?.({
        type: 'trigger_note_state',
        control: 'sensor.vision.gesture.1',
        target: '0',
        state: 'pending',
        targetBeat: 25.0,
      });
    });
    await expect(feedback).toHaveAttribute('data-state', 'pending');
    await expect(feedback).toContainText('25.0');

    await page.evaluate(() => {
      window.handleTriggerNoteState?.({
        type: 'trigger_note_state',
        control: 'sensor.vision.gesture.1',
        target: '0',
        state: 'sent',
      });
    });
    await expect(feedback).toHaveAttribute('data-state', 'sent');
  });

  test('C16: direct bar fractions persist without dropdown or estimated milliseconds', async ({ page }) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('[data-duration-mode="grid"]').click();
    await expect(detail.locator('.map-duration-bars')).toBeVisible();
    await detail.locator('[data-duration-bars="0.5"]').click();
    await expect(detail.locator('[data-duration-bars="0.5"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('select.map-duration-bars, .map-duration-preview')).toHaveCount(0);
    const target = await page.evaluate(() => window.mobileMappingState.currentMappings['sensor.vision.gesture.1'][0]);
    expect(target.noteDurationMode).toBe('grid');
    expect(target.noteDurationBars).toBe(0.5);
    await page.evaluate(() => {
      window.triggerNoteClockSnapshot = { valid: true };
      window.currentNumerator = 3;
      window.currentDenominator = 4;
      window.lastSessionBpm = 120;
      window.updateTriggerNoteClockUI();
    });
    await expect(detail.locator('.map-timing-live-status')).toContainText('120.0BPM');
    await page.evaluate(() => { window.lastSessionBpm = 60; window.updateTriggerNoteClockUI(); });
    await expect(detail.locator('.map-timing-live-status')).toContainText('60.0BPM');
    const overflow = await detail.locator('.map-trigger-duration').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.right > window.innerWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test('camera badge consumes actual note state and ignores unrelated controls', async ({ page }) => {
    await setupTriggerNotePage(page, { width: 844, height: 390 });
    const badge = page.locator('#vision-performance-badge');
    await page.evaluate(() => window.onVisionTriggerNoteState?.({ control: 'sensor.vision.gesture.1', state: 'pending' }));
    await expect(badge).toContainText('NOTA: PENDING');
    await page.evaluate(() => window.onVisionTriggerNoteState?.({ control: 'pad-1', state: 'sent' }));
    await expect(badge).toContainText('PENDING');
    await page.evaluate(() => window.onVisionTriggerNoteState?.({ control: 'sensor.vision.gesture.1', state: 'cancelled' }));
    await expect(badge).toContainText('CANCELLED');
  });

  test('C14/C15: hold-to-sync defaults to musical and ms occupies its own full-width row', async ({ page }, testInfo) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('[data-value="immediate"]').click();
    await detail.locator('[data-value="hold"]').click();
    await expect(detail.locator('.map-timing-live-status')).toBeHidden();
    await expect(detail.locator('.map-safe-loss-note')).toBeHidden();
    await detail.locator('.map-editor-advanced > summary').click();
    await expect(detail.locator('.map-safe-loss-note')).toContainText('mantém o último estado');
    await detail.locator('.map-editor-advanced > summary').click();
    await detail.locator('[data-value="beat"]').click();
    await expect(detail.locator('[data-duration-mode="grid"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('[data-duration-bars="0.25"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('.map-timing-live-status')).toBeVisible();
    if (testInfo.project.name === 'Desktop Chrome') {
      await detail.screenshot({ path: 'test-results/note-editor-musical.png' });
    }
    await detail.locator('[data-duration-mode="ms"]').click();
    await expect(detail.locator('[data-duration-mode="ms"]')).toHaveAttribute('aria-pressed', 'true');
    const layout = await detail.locator('.map-trigger-duration').evaluate((element) => {
      const mode = element.querySelector('.map-duration-mode').getBoundingClientRect();
      const slider = element.querySelector('.map-editor-slider-input').getBoundingClientRect();
      return { separateRows: slider.top >= mode.bottom, fits: slider.right <= element.getBoundingClientRect().right + 1, width: slider.width };
    });
    expect(layout.separateRows).toBe(true);
    expect(layout.fits).toBe(true);
    expect(layout.width).toBeGreaterThan(200);
    if (testInfo.project.name === 'Desktop Chrome') {
      await detail.screenshot({ path: 'test-results/note-editor-ms.png' });
    }
  });

  test('C16/C18: Now musical and maintenance stay accessible while presets are collapsed', async ({ page }, testInfo) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    const detail = page.locator('#map-mobile-detail');
    await detail.locator('[data-value="immediate"]').click();
    await detail.locator('[data-duration-mode="grid"]').click();
    await detail.locator('[data-duration-bars="2"]').click();
    await page.evaluate(() => window.renderDetail());
    await expect(detail.locator('[data-duration-bars="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('[data-value="immediate"]')).toHaveClass(/active/);
    await expect(detail.locator('.map-note-mode-select')).toHaveCount(0);
    await expect(detail.locator('.map-note-management')).not.toHaveAttribute('open', '');
    const actions = detail.locator('.map-detail-actions');
    await expect(actions.locator('button')).toHaveCount(5);
    for (const button of await actions.locator('button').all()) await expect(button).toBeInViewport();
    const hiddenButtons = detail.locator('.map-note-management .map-detail-actions');
    await expect(hiddenButtons).toHaveCount(0);
    if (testInfo.project.name === 'Desktop Chrome') {
      await page.setViewportSize({ width: 1280, height: 960 });
      await detail.evaluate((element) => { element.scrollTop = 0; });
      await detail.screenshot({ path: 'test-results/note-editor-now-musical.png' });
    }
  });

  test('C16: note feedback remains meaningful after editor rerenders', async ({ page }) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    await page.evaluate(() => {
      window.handleTriggerNoteState({ type: 'trigger_note_state', control: 'sensor.vision.gesture.1', target: '0', state: 'sent' });
      window.renderDetail();
    });
    await expect(page.locator('#map-trigger-feedback')).toContainText(/\S/);
    await page.evaluate(() => {
      window.handleTriggerNoteState({ type: 'trigger_note_state', control: 'sensor.vision.gesture.1', target: '0', state: 'released' });
    });
    await expect(page.locator('#map-trigger-feedback')).toBeHidden();
    await page.evaluate(() => {
      window.handleTriggerNoteState({ type: 'trigger_note_state', control: 'sensor.vision.gesture.1', target: '0', state: 'unavailable', reason: 'duration_clock' });
    });
    await expect(page.locator('#map-trigger-feedback')).toContainText('BPM e compasso');
  });

  test('C17/C18: Bind has direct modes and curves, wide graph and collapsed uncommon settings', async ({ page }, testInfo) => {
    await setupTriggerNotePage(page, { width: 360, height: 740 });
    await page.evaluate(() => {
      const mappings = { 'sensor.vision.gesture.1': [{ type: 'tempo', mode: 'continuous', curve: 'linear', neutralPolicy: 'hold' }] };
      const send = window.sendPhoneCommand;
      window.sendPhoneCommand = (cmd, args, cb) => {
        if (cmd === 'getMappings') { cb?.({ ok: true, result: { mappings } }); return true; }
        if (cmd === 'setMapping') { mappings[args.control] = args.targets; cb?.({ ok: true }); return true; }
        return send(cmd, args, cb);
      };
      window.mobileMappingState.currentMappings = mappings;
      window.currentControlMappings = mappings;
      window.renderDetail();
    });
    const detail = page.locator('#map-mobile-detail');
    await expect(detail.locator('[data-bind-mode]')).toHaveCount(2);
    await expect(detail.locator('[data-bind-curve]')).toHaveCount(4);
    await expect(detail.locator('select[data-field="mode"]')).toHaveCount(0);
    await expect(detail.locator('.map-editor-advanced')).not.toHaveAttribute('open', '');
    await expect(detail.locator('.map-preset-select')).toBeHidden();
    await expect(detail.locator('.map-editor-slider-input[data-field="inMin"]')).toBeHidden();
    await expect(detail.locator('.map-editor-slider-input[data-field="outMin"]')).toBeVisible();
    const geometry = await detail.locator('.map-curve-canvas').evaluate((canvas) => ({
      width: canvas.getBoundingClientRect().width,
      parentWidth: canvas.parentElement.getBoundingClientRect().width,
      sliderHitHeight: document.querySelector('.map-editor-slider-input').getBoundingClientRect().height,
    }));
    expect(geometry.width / geometry.parentWidth).toBeGreaterThan(0.9);
    expect(geometry.sliderHitHeight).toBeGreaterThanOrEqual(32);
    await detail.locator('[data-bind-mode="toggle"]').click();
    await expect(detail.locator('[data-bind-mode="toggle"]')).toHaveAttribute('aria-pressed', 'true');
    await detail.locator('[data-bind-curve="exponential"]').click();
    await expect(detail.locator('[data-bind-curve="exponential"]')).toHaveAttribute('aria-pressed', 'true');
    await detail.locator('.map-editor-advanced > summary').click();
    await expect(detail.locator('[data-field="neutralValue"]').first()).toBeVisible();
    await detail.locator('.map-editor-advanced > summary').click();
    if (testInfo.project.name === 'Desktop Chrome') await page.setViewportSize({ width: 1280, height: 960 });
    await detail.evaluate((element) => { element.scrollTop = 0; });
    if (testInfo.project.name === 'Desktop Chrome') await detail.screenshot({ path: 'test-results/bind-editor.png' });
    await page.evaluate(() => {
      window.mobileMappingState.currentMappings['sensor.vision.gesture.1'] = [];
      window.currentControlMappings['sensor.vision.gesture.1'] = [];
      window.renderDetail();
    });
    await detail.evaluate((element) => { element.scrollTop = 0; });
    await expect(detail.locator('.map-entry-choice')).toHaveCount(2);
    if (testInfo.project.name === 'Desktop Chrome') await detail.screenshot({ path: 'test-results/mapping-entry.png' });
    await detail.locator('.map-entry-choice[data-kind="bind"]').click();
    await expect(detail.locator('.map-picker-tree')).toBeVisible();
  });
});
