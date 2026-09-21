// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
/* ── RC Surface — Shared Mappings Core Logic ──────────────── */

window.phoneControls = window.MappingInputContract.getControlGroups();

window.currentMappings = {};
window.mappings = window.currentMappings;
window.allTargets = [];
window.selectedControl = null;
window.liveControls = new Map();

window.connectedClients = new Map();
window.allSeenClients = new Map();
window.selectedClient = null;
window.stickySelectedClient = null;

let ws = null;
let wsReconnectTimer = null;
const pendingCallbacks = new Map();
let msgId = 0;

window.getFriendlyClientName = function(client) {
  const ua = client.user_agent || '';
  const shortId = (client.client_id || '').slice(0, 6);
  let os = 'Unknown Device';
  if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Windows')) os = 'Windows PC';
  else if (ua.includes('Macintosh')) os = 'Mac';
  
  const displayName = client.display_name;
  if (displayName) {
    return displayName + ' · ' + os + ' (' + shortId + ')';
  }
  return os + ' (' + shortId + ')';
};

window.getMappingKey = function(client, name) {
  if (client) {
    return client + '::' + name;
  }
  return name;
};

window.getMappingForControl = function(name) {
  const clientKey = window.getMappingKey(window.selectedClient, name);
  if (window.currentMappings[clientKey]) {
    return { key: clientKey, targets: window.currentMappings[clientKey], isClientSpecific: true };
  }
  if (window.currentMappings[name]) {
    return { key: name, targets: window.currentMappings[name], isClientSpecific: false };
  }
  return null;
};

window.sendWS = function(cmd, args, cb) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const statusEl = document.getElementById('status-info');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Not connected to server</span>';
    return;
  }
  msgId++;
  const id = "dlg-" + msgId;
  if (cb) pendingCallbacks.set(id, cb);
  ws.send(JSON.stringify({ id, cmd, args }));
};

window.targetLabel = function(t, targetsList = window.allTargets) {
  if (!t) return '';
  if (t.type === 'tempo') return 'Song Tempo';
  const trk = targetsList.find(x => x.trackIndex === t.trackIndex);
  const tName = trk ? trk.name : 'Track '+(t.trackIndex+1);
  if (t.type === 'mixer_volume') return tName+' → Vol';
  if (t.type === 'mixer_pan') return tName+' → Pan';
  if (t.type === 'mixer_send') return tName+' → Send '+(t.sendIndex+1);
  if (t.type === 'track_mute') return tName+' → Mute';
  if (t.type === 'track_solo') return tName+' → Solo';
  if (t.type === 'track_arm') return tName+' → Arm';
  if (t.type === 'device_param') {
    const dev = trk && trk.devices ? trk.devices.find(d => d.index === t.deviceIndex) : null;
    const dName = dev ? dev.name : 'Dev '+t.deviceIndex;
    const pName = dev && dev.params[t.paramIndex] ? dev.params[t.paramIndex].label : 'P'+t.paramIndex;
    return tName+' → '+dName+' → '+pName;
  }
  return t.type;
};

window.connectCoreWS = function(wsUrl, onOpen, onClose, onClientUpdate, onCustomMessage) {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  let socket;
  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    ws = null;
    const statusEl = document.getElementById('status-info');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Not connected to server</span>';
    console.error('[RC Surface] admin WebSocket instantiation error:', err);
    if (onClose) onClose();
    wsReconnectTimer = setTimeout(() => window.connectCoreWS(wsUrl, onOpen, onClose, onClientUpdate, onCustomMessage), 2000);
    return;
  }
  ws = socket;
  
  socket.onopen = () => {
    if (onOpen) onOpen();
  };
  
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (onClose) onClose();
    wsReconnectTimer = setTimeout(() => window.connectCoreWS(wsUrl, onOpen, onClose, onClientUpdate, onCustomMessage), 2000);
  };
  
  socket.onerror = () => {
    try { socket.close(); } catch {}
  };
  
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.id && pendingCallbacks.has(msg.id)) {
        const cb = pendingCallbacks.get(msg.id);
        pendingCallbacks.delete(msg.id);
        cb(msg);
      }
      if (msg.type === 'client_update') {
        window.handleLiveClientUpdateCore(msg);
        if (onClientUpdate) onClientUpdate(msg);
      }
      if (onCustomMessage) {
        onCustomMessage(msg);
      }
    } catch {}
  };
};

window.handleLiveClientUpdateCore = function(msg) {
  if (!msg.client || !msg.client.client_id) return;
  const cid = msg.client.client_id;
  
  if (msg.client.status === 'stale' || msg.client.last_seen === 0) {
    window.connectedClients.delete(cid);
  } else {
    window.connectedClients.set(cid, msg.client);
    window.allSeenClients.set(cid, msg.client);
  }
  
  const lastData = msg.latest;
  if (!lastData || !lastData.controls) return;
  
  // Auto-select client if none selected
  if (!window.selectedClient && cid) {
    window.selectedClient = cid;
    window.stickySelectedClient = cid;
  }
  
  const now = Date.now();
  
  for (const ctrl of lastData.controls) {
    if (ctrl && ctrl.name) {
      if (ctrl.x !== undefined && ctrl.y !== undefined) {
        const keyX = ctrl.name + '.x';
        const keyY = ctrl.name + '.y';
        
        const mapKeyX = cid + '::' + keyX;
        const mapKeyY = cid + '::' + keyY;
        
        window.liveControls.set(mapKeyX, { val: ctrl.x, ts: now });
        window.liveControls.set(mapKeyY, { val: ctrl.y, ts: now });
      } else if (ctrl.value !== undefined) {
        const key = ctrl.name;
        const mapKey = cid + '::' + key;
        window.liveControls.set(mapKey, { val: ctrl.value, ts: now });
      }
    }
  }
};

window.fetchCoreData = function(onTargets, onMappings, onClients) {
  window.sendWS('getTargets', {}, (res) => {
    if (res.ok && res.result) {
      window.allTargets.length = 0;
      window.allTargets.push(...(res.result.targets || []));
      if (onTargets) onTargets(res.result.targets || []);
    }
  });
  window.sendWS('getMappings', {}, (res) => {
    if (res.ok && res.result) {
      for (const k of Object.keys(window.currentMappings)) delete window.currentMappings[k];
      const received = res.result.mappings || {};
      for (const [k, v] of Object.entries(received)) {
        window.currentMappings[k] = Array.isArray(v) ? v : [v];
      }
      if (onMappings) onMappings(window.currentMappings);
    }
  });
  window.sendWS('getClients', {}, (res) => {
    if (res.ok && res.result && res.result.clients) {
      window.connectedClients.clear();
      for (const client of res.result.clients) {
        if (client.status !== 'stale') {
          window.connectedClients.set(client.client_id, client);
          window.allSeenClients.set(client.client_id, client);
        }
      }
      if (onClients) onClients(window.connectedClients);
    }
  });
  window.sendWS('getProjectConfigStatus', {}, (res) => {
    if (!res.ok || !res.result) return;
    const report = res.result.report;
    const status = document.getElementById('status-info');
    if (status && report) {
      status.textContent = `Set profile: ${report.loaded} loaded, ${report.relinked} relinked, ${report.review + report.ambiguous} review, ${report.missing} missing`;
      status.dataset.kind = (report.review || report.ambiguous || report.missing) ? 'warning' : 'ok';
    }
  });
};
