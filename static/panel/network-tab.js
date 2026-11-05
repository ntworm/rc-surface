// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function (global) {
  'use strict';

  // The Network tab: the address the phone should use, the buttons that move
  // the machine to another address and the diagnosis of what stands between
  // them. It reads the network on its own clock, but only while the tab is
  // open and the server is running: a closed tab costs the machine nothing.
  const ACTIVE_SEARCH = ['preparing', 'running', 'arrived'];
  const PRIMARY_ACTIONS = ['find', 'stop', 'retry', 'start'];
  const READ_FAST = 1000;
  const READ_SLOW = 3000;
  const ROW_LABELS = {
    use: 'panel.net.use',
    'in-use': 'panel.net.inUse',
    testing: 'panel.net.testing',
  };

  function isActive(state) {
    return ACTIVE_SEARCH.includes(state);
  }

  function searchState(result) {
    return result?.search?.state ?? null;
  }

  // The clock of the reader: it keeps one timer at a time and asks the
  // machine again on it.
  function createClock(options, state, readable) {
    const send = options.send;
    const onInfo = options.onInfo;
    const setTimer = options.setTimer ?? ((fn, ms) => global.setTimeout(fn, ms));
    const clearTimer = options.clearTimer ?? (timer => global.clearTimeout(timer));

    function stop() {
      if (state.timer === null) return;
      clearTimer(state.timer);
      state.timer = null;
    }

    function arm(delay) {
      stop();
      if (!readable()) return;
      state.timer = setTimer(() => {
        state.timer = null;
        // The machine may not answer at all: the clock keeps one timer
        // armed so the reading goes on even without an answer.
        arm(READ_SLOW);
        send('getNetworkInfo', {}, handle);
      }, delay);
    }

    // Every answer, good or bad, leaves one timer armed: a failed reading
    // must not stop the panel from trying again.
    function handle(answer) {
      const previous = state.lastState;
      if (answer && answer.ok) {
        state.lastState = searchState(answer.result);
        onInfo(answer.result);
        // A search that ended without reaching the phone leaves a question
        // behind, and the answer is a fresh check.
        if (isActive(previous) && state.lastState === 'exhausted') send('runNetworkCheck', {}, handle);
      }
      arm(isActive(state.lastState) ? READ_FAST : READ_SLOW);
    }

    return { arm, handle, stop };
  }

  // The reader: it asks the machine for the network only while the tab is
  // open and the server is running.
  function createPoller(options) {
    const state = { visible: false, running: false, timer: null, lastState: null };
    const readable = () => state.visible && state.running;
    const clock = createClock(options, state, readable);

    function setReadable(next, setter) {
      const was = readable();
      setter(Boolean(next));
      const now = readable();
      if (was === now) return;
      if (now) {
        clock.arm(READ_SLOW);
        options.send('getNetworkInfo', {}, clock.handle);
        options.send('runNetworkCheck', {}, clock.handle);
      } else {
        clock.stop();
      }
    }

    function run(cmd, args, after) {
      options.send(cmd, args || {}, (answer) => {
        clock.handle(answer);
        if (typeof after === 'function') after();
      });
    }

    return {
      setVisible: next => setReadable(next, value => { state.visible = value; }),
      setRunning: next => setReadable(next, value => { state.running = value; }),
      run,
    };
  }

  // ── The tab ──────────────────────────────────────────────────
  let deps = null;
  let poller = null;
  let serverInfo = null;
  let networkInfo = null;
  let connected = false;

  function init(options) {
    deps = options || null;
    if (!deps) return;
    poller = createPoller({
      send: (cmd, args, callback) => deps.send(cmd, args, callback),
      onInfo: info => {
        networkInfo = info;
        redraw();
      },
    });
  }

  function setServerInfo(info) {
    if (!deps) return;
    serverInfo = info || null;
    // A stopped server has no network to talk about: what the last run
    // found would only be stale news.
    if (!serverInfo || !serverInfo.isRunning) networkInfo = null;
    poller.setRunning(Boolean(serverInfo && serverInfo.isRunning));
    redraw();
  }

  function setVisible(visible) {
    if (!deps) return;
    poller.setVisible(visible);
    redraw();
  }

  function setConnected(next) {
    if (!deps) return;
    const value = Boolean(next);
    if (value === connected) return;
    connected = value;
    redraw();
  }

  // ── The drawing ──────────────────────────────────────────────
  function translate(key, params) {
    return deps.translate(key, params);
  }

  function element(id) {
    return global.document?.getElementById(id) ?? null;
  }

  function create(tag, className, text) {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mergedInfo() {
    return Object.assign({}, serverInfo, networkInfo);
  }

  function drawIp(model) {
    const el = element('net-ip');
    if (!el) return;
    el.textContent = model.ip || (model.ipKey ? translate(model.ipKey) : '');
    el.classList.toggle('off', Boolean(model.off));
  }

  // A why part draws as plain text, as a bold phrase, or as a coloured one.
  function whyNode(part) {
    if (part.row) {
      return global.document.createTextNode(global.RcSurfaceNetwork.rowDetail(part.row, translate));
    }
    const text = translate(part.key, part.params);
    if (part.tone === 'bold') return create('b', '', text);
    if (part.tone) return create('span', part.tone, text);
    return global.document.createTextNode(text);
  }

  function drawWhy(model) {
    const el = element('net-why');
    if (!el) return;
    const nodes = [];
    model.why.forEach((part, index) => {
      if (index > 0) nodes.push(global.document.createTextNode(' '));
      nodes.push(whyNode(part));
    });
    el.replaceChildren(...nodes);
  }

  function runAction(id) {
    if (id === 'find' || id === 'retry') poller.run('startNetworkSearch', {});
    else if (id === 'stop') poller.run('stopNetworkSearch', {});
    else if (id === 'next') poller.run('nextNetworkAddress', {});
    else if (id === 'auto') poller.run('setNetworkChoice', { mode: 'auto' }, deps.refreshServer);
    else if (id === 'start') deps.startServer();
  }

  function drawActions(model) {
    const el = element('net-actions');
    if (!el) return;
    const labels = model.actions.map(id => [id, translate('panel.net.action.' + id)]);
    const signature = JSON.stringify(labels);
    if (el.dataset.actions === signature) return;
    el.dataset.actions = signature;
    el.replaceChildren(...labels.map(([id, label], index) => {
      const button = create('button', 'btn', label);
      button.dataset.netAction = id;
      if (index === 0 && PRIMARY_ACTIONS.includes(id)) button.classList.add('primary');
      button.addEventListener('click', () => runAction(id));
      return button;
    }));
  }

  function drawNote(model) {
    const el = element('net-note');
    if (!el) return;
    el.textContent = model.note ? translate(model.note.key, model.note.params) : '';
  }

  function drawQr(model) {
    const frame = element('net-qr');
    if (!frame) return;
    if (model.qr) deps.ensureQr(frame, model.qr);
    else deps.clearQr(frame);
  }

  function drawPort(info) {
    const el = element('net-port');
    if (!el) return;
    el.textContent = info.httpsPort ? translate('panel.net.port', { port: info.httpsPort }) : '';
  }

  function drawRows(info) {
    const el = element('net-rows');
    if (!el) return;
    const rows = global.RcSurfaceNetwork.describeRows(info, translate);
    const signature = JSON.stringify(rows);
    if (el.dataset.rows === signature) return;
    el.dataset.rows = signature;
    el.replaceChildren(...rows.map(rowNode));
  }

  function rowNode(row) {
    const node = create('div', 'net-row');
    if (row.selected) node.classList.add('sel');
    if (row.dim) node.classList.add('dim');
    node.appendChild(create('span', 'a', row.ip));
    node.appendChild(create('span', 'k', translate(row.kindKey)));
    node.appendChild(create('span', 'd', row.detail));
    const button = create('button', 'btn sm', translate(ROW_LABELS[row.action]));
    button.disabled = row.action !== 'use';
    if (row.action === 'use') {
      button.addEventListener('click', () => {
        poller.run('setNetworkChoice', { mode: 'pinned', id: row.id }, deps.refreshServer);
      });
    }
    node.appendChild(button);
    return node;
  }

  function drawDiag(info) {
    const el = element('net-diag');
    if (!el) return;
    const check = info.check;
    if (!check) {
      const waiting = translate('panel.net.checking');
      const signature = JSON.stringify([null, waiting]);
      if (el.dataset.diag === signature) return;
      el.dataset.diag = signature;
      el.replaceChildren(
        create('span', 's wait', '…'),
        create('span', '', waiting),
      );
      return;
    }
    const nodes = [];
    const texts = [];
    for (const item of check.items ?? []) {
      const text = diagText(info, check, item);
      if (!text) continue;
      const statusText = translate('panel.net.status.' + item.status);
      texts.push(statusText, text);
      nodes.push(create('span', `s ${statusClass(item.status)}`, statusText));
      nodes.push(create('span', '', text));
      if (item.command) {
        const copyText = translate('panel.net.copy');
        texts.push(copyText);
        nodes.push(create('code', '', item.command));
        const copy = create('button', 'btn sm', copyText);
        copy.dataset.url = item.command;
        deps.bindCopy(copy);
        nodes.push(copy);
      }
    }
    const signature = JSON.stringify([check.items ?? [], texts]);
    if (el.dataset.diag === signature) return;
    el.dataset.diag = signature;
    el.replaceChildren(...nodes);
  }

  function statusClass(status) {
    if (status === 'ok') return 'ok';
    if (status === 'warn') return 'warn';
    return 'wait';
  }

  function diagText(info, check, item) {
    if (item.id === 'server') {
      if (item.status === 'ok') return translate('panel.net.diag.server.ok', { port: info.httpsPort });
      if (item.status === 'warn') return translate('panel.net.diag.server.warn');
      return null;
    }
    if (item.id === 'certificate') {
      const address = check.address;
      if (item.status === 'ok') return translate('panel.net.diag.certificate.ok', { address });
      if (item.status === 'warn') return translate('panel.net.diag.certificate.warn', { address });
      return translate('panel.net.diag.certificate.unknown');
    }
    if (item.id === 'firewall') return firewallText(item);
    if (item.id === 'third-party-firewall') return thirdPartyText(item);
    return null;
  }

  function thirdPartyText(item) {
    if (item.status !== 'warn') return null;
    return translate('panel.net.diag.third-party-firewall.warn', { names: (item.products ?? []).join(', ') });
  }

  function firewallText(item) {
    const profile = item.profile ? translate('panel.net.profile.' + item.profile) : null;
    if (item.status === 'ok') {
      return profile
        ? translate('panel.net.diag.firewall.ok', { profile })
        : translate('panel.net.diag.firewall.okPlain');
    }
    if (item.status === 'warn') {
      const key = 'panel.net.diag.firewall.' + (item.reason ?? 'unknown');
      return profile ? translate(key, { profile }) : translate(key);
    }
    return translate('panel.net.diag.firewall.unknown');
  }

  function redraw() {
    if (!deps) return;
    const info = mergedInfo();
    const model = global.RcSurfaceNetwork.describeNetwork(info, { connected });
    drawIp(model);
    drawWhy(model);
    drawActions(model);
    drawNote(model);
    drawQr(model);
    drawPort(info);
    drawRows(info);
    drawDiag(info);
  }

  global.RcSurfaceNetworkTab = { createPoller, init, setServerInfo, setVisible, setConnected };
})(typeof window === 'undefined' ? globalThis : window);
