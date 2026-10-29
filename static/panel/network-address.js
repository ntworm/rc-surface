// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (global) {
  'use strict';
  const storageKey = 'rc-surface:panel-lan-ip';
  let preferredIp = null;
  try { preferredIp = global.localStorage.getItem(storageKey); } catch { /* storage may be denied */ }

  function isPrivateIp(ip) {
    if (typeof ip !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
    const parts = ip.split('.').map(Number);
    if (parts.some(part => part > 255)) return false;
    return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
  }

  function addresses(info) {
    const others = Array.isArray(info.otherIps) ? info.otherIps : [];
    return [...new Set([info.primaryIp, ...others])].filter(isPrivateIp);
  }

  function performanceUrl(info, ip) {
    if (!info.phoneUrl || !addresses(info).includes(ip)) return info.phoneUrl;
    try {
      const url = new URL(info.phoneUrl);
      if (url.protocol !== 'https:') return info.phoneUrl;
      url.hostname = ip;
      return url.href;
    } catch { return info.phoneUrl; }
  }

  function updateSelector(ips, selected, onChange) {
    const select = global.document.getElementById('network-address');
    const field = global.document.getElementById('network-address-field');
    if (!select || !field) return;
    field.classList.toggle('hidden', ips.length < 2);
    const signature = JSON.stringify(ips);
    if (select.dataset.addresses !== signature) {
      select.replaceChildren(...ips.map(ip => {
        const option = global.document.createElement('option');
        option.value = ip; option.textContent = ip;
        return option;
      }));
      select.dataset.addresses = signature;
    }
    select.value = selected || '';
    if (select.dataset.bound) return;
    select.dataset.bound = '1';
    select.addEventListener('change', () => {
      preferredIp = select.value;
      try { global.localStorage.setItem(storageKey, preferredIp); } catch { /* retain in memory */ }
      onChange();
    });
  }

  function render(info, onChange) {
    const ips = info.isRunning && info.phoneUrl ? addresses(info) : [];
    // Do not discard the preference while the server is merely stopped.
    const selected = ips.includes(preferredIp) ? preferredIp : ips[0];
    updateSelector(ips, selected, onChange);
    return { primaryIp: selected || info.primaryIp, phoneUrl: performanceUrl(info, selected) };
  }

  global.RcSurfaceNetwork = { addresses, performanceUrl, render };
})(typeof window === 'undefined' ? globalThis : window);
