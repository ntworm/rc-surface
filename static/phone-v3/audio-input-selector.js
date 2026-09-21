// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Device discovery is UI-only. Never opens a microphone or substitutes another
// input when a saved explicit device is hidden, unplugged or permission-gated.
(function (global) {
  'use strict';
  const STORAGE_KEY = 'ableton-rc:audio-input-device';
  function create({ select, onChange, translate }) {
    if (!select) return null;
    const media = global.navigator.mediaDevices;
    let selected = '';
    let devices = [];
    let revision = 0;
    try { selected = global.localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    const text = translate;
    function render() {
      const options = [{ deviceId: '', label: text('aud.browserDefault', 'Browser default') }, ...devices];
      if (selected && !options.some((device) => device.deviceId === selected)) {
        options.push({ deviceId: selected, label: text('aud.inputUnavailable', 'Unavailable / permission required') });
      }
      select.replaceChildren(...options.map((device) => {
        const option = global.document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label;
        return option;
      }));
      select.value = selected;
    }
    async function refresh() {
      const request = ++revision;
      if (!media?.enumerateDevices) return;
      try {
        const all = await media.enumerateDevices();
        if (request !== revision) return;
        const seen = new Set(['', 'default']);
        devices = all.filter((device) => {
          if (device.kind !== 'audioinput' || seen.has(device.deviceId)) return false;
          seen.add(device.deviceId);
          return true;
        }).map((device, i) => ({
          deviceId: device.deviceId,
          label: device.label || text('aud.unnamedInput', 'Audio input') + ' ' + (i + 1),
        }));
        render();
      } catch {
        // Permission/visibility restrictions on enumeration must not erase the
        // chosen ID or interrupt a healthy stream. getUserMedia reports failure.
      }
    }
    select.addEventListener('change', () => {
      selected = select.value;
      try { global.localStorage.setItem(STORAGE_KEY, selected); } catch {}
      onChange();
    });
    media?.addEventListener?.('devicechange', refresh);
    global.document.addEventListener('visibilitychange', () => {
      if (global.document.visibilityState === 'visible') refresh();
    });
    global.RcSurfaceI18n?.subscribe?.(() => { render(); refresh(); });
    render();
    refresh();
    return { get deviceId() { return selected; }, refresh };
  }
  global.AudioInputSelector = Object.freeze({ create });
})(window);
