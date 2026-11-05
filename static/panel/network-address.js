// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (global) {
  'use strict';

  // One description of what the panel knows about the network, shared by the
  // Main tab (the selector and its reason line) and the Network tab (the
  // address, the buttons and the rows). Both draw from this model, so the
  // two places can never disagree about the state of the machine.
  const EM_DASH = '—';
  const DOT = ' · ';
  const ACTIVE_SEARCH = ['preparing', 'running', 'arrived'];

  // The reason codes a row can carry, in the order the panel reads them.
  // "pinned" and "proven" are states of the row rather than reasons: they
  // are drawn elsewhere.
  const REASON_CODES = ['gateway', 'no-gateway', 'route-unchecked', 'default-route',
    'virtual', 'vpn', 'hotspot', 'link-local', 'public'];

  // The shape every state answers with: a state fills what it knows and
  // leaves the rest at its default.
  function model(state, fields) {
    return Object.assign({
      state, ip: '', ipKey: null, off: false, why: [], note: null, actions: [], qr: null,
    }, fields);
  }

  function candidatesOf(info) {
    const net = info?.network;
    return net?.candidates ?? [];
  }

  // A why part: the key to translate, the values to fill in and the tone to
  // draw it with. A part may carry a row instead, which reads as the detail
  // of that row.
  function part(key, options) {
    const out = { key };
    if (options?.params) out.params = options.params;
    if (options?.tone) out.tone = options.tone;
    return out;
  }

  function secondsLeft(deadline, now) {
    if (typeof deadline !== 'number') return 0;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }

  // The row the machine published: the candidate behind the current address.
  function selectedRow(info) {
    const ip = info?.primaryIp;
    if (!ip) return null;
    return candidatesOf(info).find(row => row.ip === ip) || null;
  }

  function skippedPart(search) {
    const skipped = search.skipped;
    if (!skipped || skipped.length === 0) return null;
    return part('panel.net.skipped', { params: { list: skipped.join(', ') } });
  }

  function pinnedName(pinnedId) {
    return typeof pinnedId === 'string' ? pinnedId.replace('|', ' ') : '';
  }

  function provenDate(provenUntil) {
    const locale = global.RcSurfaceI18n?.getLocale?.();
    return new Date(provenUntil).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  }

  function firstIp(rows) {
    const first = rows[0];
    return first ? first.ip : '';
  }

  // ── The states ───────────────────────────────────────────────
  function stoppedModel() {
    return model('stopped', {
      ip: EM_DASH, off: true, why: [part('panel.net.startServer')], actions: ['start'],
    });
  }

  function httpsOffModel() {
    return model('https-off', {
      ip: EM_DASH, off: true, why: [part('panel.net.httpsOff', { tone: 'warn' })],
    });
  }

  function arrivedModel(search, now) {
    const why = [part('panel.net.arrived', { tone: 'on' }), part('panel.net.acceptWarning')];
    const skipped = skippedPart(search);
    if (skipped) why.push(skipped);
    return model('arrived', {
      ip: search.ip, why, actions: ['stop', 'next'], qr: search.phoneUrl ?? null,
      note: { key: 'panel.net.pausedFor', params: { seconds: secondsLeft(search.deadline, now) } },
    });
  }

  // While the search walks the candidates, the tab shows the candidate under
  // test, not the address the machine published.
  function searchModel(info, now) {
    const search = info.search;
    if (!search) return null;
    if (search.state === 'arrived') return arrivedModel(search, now);
    if (search.state !== 'preparing' && search.state !== 'running') return null;
    const why = [
      part('panel.net.searching', { params: { position: search.position, total: search.total }, tone: 'bold' }),
      part('panel.net.searchHelp'),
    ];
    const skipped = skippedPart(search);
    if (skipped) why.push(skipped);
    const preparing = search.state === 'preparing';
    const note = preparing
      ? { key: 'panel.net.preparingQr' }
      : { key: 'panel.net.nextIn', params: { seconds: secondsLeft(search.deadline, now) } };
    return model('search', {
      ip: search.ip, off: preparing, why, note, actions: ['stop', 'next'], qr: search.phoneUrl ?? null,
    });
  }

  function noNetworkModel() {
    return model('no-network', {
      ipKey: 'panel.net.noNetwork', off: true, why: [part('panel.net.whyNoNetwork')],
      note: { key: 'panel.net.checkingEvery' },
    });
  }

  function exhaustedModel(info) {
    return model('exhausted', {
      ip: info.primaryIp || '', why: [part('panel.net.exhausted', { tone: 'warn' }), part('panel.net.exhaustedHelp')],
      actions: ['retry'], qr: info.phoneUrl || null,
    });
  }

  function publicOnlyModel() {
    return model('public-only', {
      ipKey: 'panel.net.noQr', off: true, why: [part('panel.net.publicOnly', { tone: 'warn' })],
    });
  }

  function preparingModel(rows) {
    return model('preparing', {
      ip: firstIp(rows), off: true, why: [part('panel.net.preparing')],
      note: { key: 'panel.net.preparingNote' },
    });
  }

  function certificateFailedModel(rows) {
    return model('certificate-failed', {
      ip: firstIp(rows), off: true, why: [part('panel.net.certificateFailed', { tone: 'warn' })],
      actions: ['find'],
    });
  }

  function isExhausted(info) {
    return Boolean(info.search && info.search.state === 'exhausted');
  }

  function isPreparingCertificate(info, net) {
    if (info.phoneUrl) return false;
    return Boolean(info.certificatePending || (net && net.certificatePending));
  }

  function isPublicOnly(net, info) {
    return Boolean(net && net.needsPublicChoice && !info.primaryIp);
  }

  // The states where the machine has no address to show yet.
  function middleModel(info) {
    const net = info.network;
    const rows = candidatesOf(info);
    if (net && !rows.length) return noNetworkModel();
    if (isExhausted(info)) return exhaustedModel(info);
    if (isPublicOnly(net, info)) return publicOnlyModel();
    if (isPreparingCertificate(info, net)) return preparingModel(rows);
    if (net && net.certificateFailed && !info.phoneUrl) return certificateFailedModel(rows);
    return null;
  }

  // ── The steady states ────────────────────────────────────────
  function pinnedWhy(row) {
    const why = [part('panel.net.pinned', { tone: 'bold' })];
    if (row) why.push({ row });
    return why;
  }

  function automaticWhy(row) {
    const why = [part('panel.net.auto', { tone: 'bold' })];
    if (row) why.push({ row });
    return why;
  }

  function ambiguousWhy() {
    return [part('panel.net.auto', { tone: 'bold' }), part('panel.net.ambiguous', { tone: 'warn' })];
  }

  function baseWhy(net, row) {
    if (net.pinMissing) {
      return [part('panel.net.pinMissing', { params: { network: pinnedName(net.pinnedId) }, tone: 'warn' })];
    }
    if (net.mode === 'pinned') return pinnedWhy(row);
    if (net.ambiguous) return ambiguousWhy();
    return automaticWhy(row);
  }

  function steadyWhy(net, row) {
    const why = baseWhy(net, row);
    if (row && row.public) why.push(part('panel.net.publicWarning', { tone: 'warn' }));
    if (row && row.proven && row.provenUntil) {
      why.push(part('panel.net.provenUntil', { tone: 'on', params: { date: provenDate(row.provenUntil) } }));
    }
    return why;
  }

  function steadyState(net) {
    if (net.pinMissing) return 'pin-missing';
    if (net.mode === 'pinned') return 'pinned';
    if (net.ambiguous) return 'ambiguous';
    return 'automatic';
  }

  function steadyActions(net) {
    if (net.pinMissing || net.mode === 'pinned') return ['auto'];
    return ['find'];
  }

  // The steady states: the machine has an address and the phone may reach it.
  function steadyModel(info, connected) {
    const net = info.network || {};
    const row = selectedRow(info);
    return model(steadyState(net), {
      ip: info.primaryIp || '', why: steadyWhy(net, row), actions: steadyActions(net),
      qr: info.phoneUrl || null, note: connected ? { key: 'panel.net.phoneConnected' } : null,
    });
  }

  function describeNetwork(info, { now = Date.now(), connected = false } = {}) {
    if (!info || !info.isRunning) return stoppedModel();
    if (info.httpsPort === null) return httpsOffModel();
    const during = searchModel(info, now);
    if (during) return during;
    const middle = middleModel(info);
    if (middle) return middle;
    return steadyModel(info, connected);
  }

  // ── The rows ─────────────────────────────────────────────────
  function rowDetail(row, t) {
    const parts = [row.interfaceName ?? ''];
    for (const code of REASON_CODES) {
      if (!row.reasons?.includes(code)) continue;
      parts.push(code === 'gateway'
        ? t('panel.net.reason.gateway', { ip: row.gateway })
        : t('panel.net.reason.' + code));
    }
    return parts.join(DOT);
  }

  function describeRows(info, t) {
    const search = info.search;
    const searching = Boolean(search && ACTIVE_SEARCH.includes(search.state));
    const selectedIp = searching ? search.ip : (info.primaryIp || '');
    return candidatesOf(info).map(row => {
      const selected = row.ip === selectedIp;
      return {
        id: row.id,
        ip: row.ip,
        kindKey: 'panel.net.kind.' + row.kind,
        detail: rowDetail(row, t),
        selected,
        dim: (row.level ?? 0) >= 7,
        action: selected ? (searching ? 'testing' : 'in-use') : 'use',
      };
    });
  }

  // ── The Main tab ─────────────────────────────────────────────
  function partText(part, t) {
    if (part.row) return rowDetail(part.row, t);
    return t(part.key, part.params);
  }

  // The one sentence that says why the panel shows what it shows.
  function reasonLine(info, t) {
    const described = describeNetwork(info);
    if (described.state === 'stopped') return '';
    return described.why.map(part => partText(part, t)).join(' ');
  }

  // The selector offers Automatic plus every candidate, and only when there
  // is more than one address to choose from.
  function selectorOptions(info) {
    const rows = candidatesOf(info);
    if (!info?.isRunning || rows.length < 2) return [];
    const options = [{ value: 'auto', labelKey: 'panel.net.automatic' }];
    for (const row of rows) {
      const option = { value: row.id, label: `${row.ip}${DOT}${row.interfaceName ?? ''}` };
      if (row.public) option.warnKey = 'panel.net.publicWarning';
      options.push(option);
    }
    return options;
  }

  function selectedValue(info) {
    const net = info?.network;
    if (net?.mode === 'pinned' && net.pinnedId) return net.pinnedId;
    return 'auto';
  }

  // How long a choice the user just made waits for the machine to answer
  // it. Past that the selector shows what the machine says again.
  const PENDING_TIMEOUT_MS = 10000;

  // The choice the user made, while the machine has not answered it yet:
  // null when there is none, when it is stale, or when the address it names
  // is not on the list any more.
  function pendingChoice(select, options) {
    const pending = select.dataset.pending;
    if (!pending) return null;
    if (!options.some(option => option.value === pending)) return null;
    const at = Number(select.dataset.pendingAt);
    if (!Number.isFinite(at)) return null;
    if (Date.now() - at >= PENDING_TIMEOUT_MS) return null;
    return pending;
  }

  function clearPending(select) {
    delete select.dataset.pending;
    delete select.dataset.pendingAt;
  }

  function choiceFor(value) {
    if (!value || value === 'auto') return { mode: 'auto' };
    return { mode: 'pinned', id: value };
  }

  function replaceOptions(select, nodes) {
    if (typeof select.replaceChildren === 'function') {
      select.replaceChildren(...nodes);
      return;
    }
    while (select.firstChild) select.removeChild(select.firstChild);
    for (const node of nodes) select.appendChild(node);
  }

  // A public address warns before the click, as it does in the Network tab.
  function optionLabel(option, translate) {
    if (option.labelKey) return translate(option.labelKey);
    return option.warnKey ? `${option.label}${DOT}${translate(option.warnKey)}` : option.label;
  }

  function renderSelector(select, options, info, onChoose, translate) {
    const labels = options.map(option => optionLabel(option, translate));
    const signature = JSON.stringify(options.map((option, index) => [option.value, labels[index]]));
    if (select.dataset.options !== signature) {
      select.dataset.options = signature;
      replaceOptions(select, options.map((option, index) => {
        const node = global.document.createElement('option');
        node.value = option.value;
        node.textContent = labels[index];
        return node;
      }));
    }
    const current = selectedValue(info);
    const pending = pendingChoice(select, options);
    if (pending !== null && pending !== current) {
      // The machine has not answered the choice yet: it stays on the screen,
      // or the refresh every 3 s would throw it away.
      select.value = pending;
    } else {
      clearPending(select);
      select.value = current;
    }
    if (select.dataset.bound) return;
    select.dataset.bound = '1';
    select.addEventListener('change', () => {
      select.dataset.pending = select.value;
      select.dataset.pendingAt = String(Date.now());
      onChoose(choiceFor(select.value));
    });
  }

  function render(info, onChoose, translate) {
    const doc = global.document;
    if (!doc) return;
    const options = selectorOptions(info);
    const field = doc.getElementById('network-address-field');
    if (field) field.classList.toggle('hidden', options.length === 0);
    const select = doc.getElementById('network-address');
    if (select) renderSelector(select, options, info, onChoose, translate);
    const reason = doc.getElementById('network-reason');
    if (!reason) return;
    const line = reasonLine(info, translate);
    reason.textContent = line;
    reason.classList.toggle('hidden', !line);
  }

  global.RcSurfaceNetwork = {
    describeNetwork, describeRows, rowDetail, reasonLine,
    selectorOptions, selectedValue, choiceFor, render,
  };
})(typeof window === 'undefined' ? globalThis : window);
