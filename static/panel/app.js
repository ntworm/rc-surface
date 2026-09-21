// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
/* ── RC Surface — Panel Client App v0.4 ──────────────── */

const clientsMap = new Map();
window.clientsMap = clientsMap;
let currentTab = "main";
let serverInfo = null;

// Family accents per control group. Used by the Main tab activity
// indicators (A2) — each group's color shows on the strip on the
// left of the header, plus the live pulse ring and signal bar gauge.
// Pads / XY / etc. are blue/amber, mix knobs/faders are cyan/yellow,
// sensors are green, audio is rose-red, vision is violet.
const GROUP_ACCENTS = {
  "SENSORS":   "#34c759",
  "HANDS":     "#af52de",
  "AUDIO":     "#ff375f",
  "PADS":      "#0a84ff",
  "XY PADS":   "#ff9f0a",
  "LFOs":      "#5e5ce6",
  "STUTTERS":  "#ff9500",
  "KNOBS":     "#5ac8fa",
  "FADERS":    "#ffd60a",
};

// History buffer for sparklines
const sensorHistory = {};
window.sensorHistory = sensorHistory;
const sensorHistoryMax = 30;

// Define the 12 primary sensors for the Connect grid
const gridSensors = [
  { key: "sensor.orient.alpha", name: "Yaw (Alpha)", min: 0, max: 360, group: "orientation" },
  { key: "sensor.orient.beta", name: "Pitch (Beta)", min: -90, max: 90, group: "orientation" },
  { key: "sensor.orient.gamma", name: "Roll (Gamma)", min: -90, max: 90, group: "orientation" },
  { key: "sensor.motion.ax", name: "Accel X", min: -20, max: 20, group: "motion" },
  { key: "sensor.motion.ay", name: "Accel Y", min: -20, max: 20, group: "motion" },
  { key: "sensor.motion.az", name: "Accel Z", min: -20, max: 20, group: "motion" },
  { key: "sensor.audio.rms", name: "Audio RMS", min: 0, max: 1, group: "audio" },
  { key: "sensor.audio.transient", name: "Audio Transient", min: 0, max: 1, group: "audio" },
  { key: "sensor.vision.pinch", name: "Pinch", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.rotateVal", name: "Victory Rotate", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_x", name: "Pinch Clutch X", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_y", name: "Pinch Clutch Y", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_z", name: "Pinch Clutch Z", min: 0, max: 1, group: "vision" }
];
window.gridSensors = gridSensors;

const allSensorMetadataList = [
  { key: "sensor.orient.alpha", name: "Yaw (Alpha)", min: 0, max: 360, group: "orientation" },
  { key: "sensor.orient.beta", name: "Pitch (Beta)", min: -90, max: 90, group: "orientation" },
  { key: "sensor.orient.gamma", name: "Roll (Gamma)", min: -90, max: 90, group: "orientation" },
  { key: "sensor.motion.ax", name: "Accel X", min: -20, max: 20, group: "motion" },
  { key: "sensor.motion.ay", name: "Accel Y", min: -20, max: 20, group: "motion" },
  { key: "sensor.motion.az", name: "Accel Z", min: -20, max: 20, group: "motion" },
  { key: "sensor.motion.gx", name: "Gyro X", min: -200, max: 200, group: "motion" },
  { key: "sensor.motion.gy", name: "Gyro Y", min: -200, max: 200, group: "motion" },
  { key: "sensor.motion.gz", name: "Gyro Z", min: -200, max: 200, group: "motion" },
  { key: "sensor.audio.rms", name: "Audio RMS", min: 0, max: 1, group: "audio" },
  { key: "sensor.audio.envelope", name: "Audio Envelope", min: 0, max: 1, group: "audio" },
  { key: "sensor.audio.gate", name: "Audio Gate", min: 0, max: 1, group: "audio" },
  { key: "sensor.audio.attack", name: "Audio Attack", min: 0, max: 1, group: "audio" },
  ...window.AudioDescriptorCatalog.map(({ name: key, label }) => ({
    key, name: "Audio " + label, min: 0, max: 1, group: "audio",
  })),
  // Live hand position from the camera — the DIRECT MAP X/Y/Z readout on the
  // phone's VID page. Already normalised to 0..1 by the vision processor.
  { key: "sensor.vision.x", name: "Hand X", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.y", name: "Hand Y", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.z", name: "Hand Z (Depth)", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch", name: "Pinch", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.rotateVal", name: "Victory Rotate", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_x", name: "Pinch Clutch X", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_y", name: "Pinch Clutch Y", min: 0, max: 1, group: "vision" },
  { key: "sensor.vision.pinch_z", name: "Pinch Clutch Z", min: 0, max: 1, group: "vision" }
];

function getControlMetadata(key) {
  const known = allSensorMetadataList.find(s => s.key === key);
  if (known) return known;

  if (key.startsWith("pad-")) {
    const num = key.split("-")[1];
    return { key, name: `Pad ${num}`, min: 0, max: 1, group: "controls" };
  }
  if (key.startsWith("knob-")) {
    const num = key.split("-")[1];
    return { key, name: `Knob ${num}`, min: 0, max: 1, group: "controls" };
  }
  if (key.startsWith("fader-")) {
    const num = key.split("-")[1];
    return { key, name: `Fader ${num}`, min: 0, max: 1, group: "controls" };
  }
  if (key.startsWith("xy-")) {
    const parts = key.split(".");
    return { key, name: `XY ${parts[0].split("-")[1]} ${parts[1].toUpperCase()}`, min: 0, max: 1, group: "controls" };
  }

  return { key, name: key.toUpperCase(), min: 0, max: 1, group: "sensors" };
}

const defaultRecentKeys = [
  "sensor.orient.alpha", "sensor.orient.beta", "sensor.orient.gamma",
  "sensor.motion.ax", "sensor.motion.ay", "sensor.motion.az",
  "sensor.audio.rms", "sensor.audio.transient",
  "sensor.vision.pinch"
];

window.markSensorRecent = function(key) {
  if (!key || typeof key !== 'string') return;

  let recent = [];
  try {
    const saved = localStorage.getItem("ableton-rc:recent-sensors");
    if (saved) {
      recent = JSON.parse(saved);
    }
  } catch {}

  if (!recent || !Array.isArray(recent)) {
    recent = [];
  }

  recent = recent.filter(k => k !== key);
  recent.unshift(key);

  const uniqueRecent = [...new Set(recent)];
  for (const defKey of defaultRecentKeys) {
    if (uniqueRecent.length >= 12) break;
    if (!uniqueRecent.includes(defKey)) {
      uniqueRecent.push(defKey);
    }
  }

  const finalKeys = uniqueRecent.slice(0, 12);
  localStorage.setItem("ableton-rc:recent-sensors", JSON.stringify(finalKeys));
};

const allControlsGrouped = {
  SENSORS: [
    "sensor.orient.alpha", "sensor.orient.beta", "sensor.orient.gamma",
    "sensor.motion.ax", "sensor.motion.ay", "sensor.motion.az",
    "sensor.motion.gx", "sensor.motion.gy", "sensor.motion.gz"
  ],
  AUDIO: [
    // The pitch lane (pitch, note, bpm, clarity, whistle bend) is dormant: it
    // is no longer offered for new mappings, stored ones stay inert.
    "sensor.audio.rms", "sensor.audio.envelope", "sensor.audio.gate", "sensor.audio.attack",
    ...window.AudioDescriptorCatalog.map(({ name }) => name)
  ],
  VISION: [
    "sensor.vision.x", "sensor.vision.y", "sensor.vision.z",
    "sensor.vision.fist", "sensor.vision.pinch", "sensor.vision.victory", "sensor.vision.rotateVal", "sensor.vision.open",
    "sensor.vision.pinch_x", "sensor.vision.pinch_y", "sensor.vision.pinch_z",
    "sensor.vision.gesture.1", "sensor.vision.gesture.2", "sensor.vision.gesture.3"
  ],

  Pads: [
    "pad-1", "pad-2", "pad-3", "pad-4", "pad-5", "pad-6", "pad-7", "pad-8", "pad-9", "pad-10", "pad-11", "pad-12"
  ],
  Knobs: [
    "knob-1", "knob-2", "knob-3", "knob-4", "knob-5", "knob-6", "knob-7", "knob-8"
  ],
  Faders: [
    "fader-1", "fader-2", "fader-3", "fader-4", "fader-5", "fader-6", "fader-7", "fader-8"
  ],
  "XY Pads": [
    "xy-1.x", "xy-1.y", "xy-2.x", "xy-2.y"
  ],
  LFOs: [
    "toggle-1", "toggle-2", "toggle-3", "toggle-4"
  ],
  Buttons: [
    "button-1", "button-2", "button-3", "button-4"
  ]
};
window.allControlsGrouped = allControlsGrouped;

function getControlDisplayName(ctrl) {
  if (ctrl.startsWith("pad-")) {
    return `Pad ${ctrl.slice(4)}`;
  }
  if (ctrl.startsWith("knob-")) {
    return `Knob ${ctrl.slice(5)}`;
  }
  if (ctrl.startsWith("fader-")) {
    return `Fader ${ctrl.slice(6)}`;
  }
  if (ctrl.startsWith("toggle-")) {
    const num = parseInt(ctrl.slice(7));
    if (num <= 4) return `L${num} (LFO)`;
    return `LFO ${num}`;
  }
  if (ctrl.startsWith("button-")) {
    const num = parseInt(ctrl.slice(7));
    if (num <= 4) return `S${num} (Stutter)`;
    return `Button ${num}`;
  }
  if (ctrl.startsWith("xy-")) {
    const parts = ctrl.split(".");
    const num = parts[0].slice(3);
    const axis = (parts[1] || "").toUpperCase();
    return `XY ${num} ${axis}`;
  }
  if (ctrl.startsWith("gate-")) {
    return `Gate ${ctrl.slice(5)}`;
  }
  if (ctrl.startsWith("scene-")) {
    return `Scene ${ctrl.slice(6)}`;
  }
  if (ctrl.startsWith("sensor.audio.")) {
    const prop = ctrl.slice("sensor.audio.".length);
    const labels = {
      rms: "RMS",
      pitch: "Pitch",
      bpm: "BPM",
      note: "MIDI Note",
      clarity: "Clarity",
      "whistle.bend": "Bend",
      envelope: "Envelope",
      gate: "Audio Gate",
      attack: "Attack",
      ...Object.fromEntries(window.AudioDescriptorCatalog.map(({ field, label }) => [field, label])),
    };
    return `Audio ${labels[prop] || prop.toUpperCase()}`;
  }
  if (ctrl.startsWith("sensor.vision.")) {
    const prop = ctrl.slice("sensor.vision.".length);
    const labels = {
      active:  "Active",
      x:       "X",
      y:       "Y",
      z:       "Z (Depth)",
      palm:    "Palm Size",
      face:    "Palm Facing",
      fist:    "Fist",
      pinch:   "Pinch",
      victory: "Victory",
      rotateVal: "Victory Rotate",
      open:    "Open",
      fingers: "Fingers",
      "gesture.1": "Gesture Slot 1",
      "gesture.2": "Gesture Slot 2",
      "gesture.3": "Gesture Slot 3",
      "color.r": "Color R",
      "color.g": "Color G",
      "color.b": "Color B",
    };
    if (labels[prop]) {
      return `Hand ${labels[prop]}`;
    }
    return `Vision ${ctrl.slice(14)}`;
  }
  if (ctrl.startsWith("sensor.orient.")) {
    return `Orient ${ctrl.slice(14)}`;
  }
  if (ctrl.startsWith("sensor.motion.")) {
    return `Motion ${ctrl.slice(14)}`;
  }
  if (ctrl.startsWith("gesture.")) {
    return `Gesture ${ctrl.slice(8)}`;
  }
  return ctrl;
}

// ── Init & Resize ────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Initialize serverInfo from server-injected globals (when served via HTTP)
  // or fallback to window.location inference (legacy / data: URI path).
  const isRunning = window.INITIAL_IS_RUNNING !== undefined
    ? window.INITIAL_IS_RUNNING
    : (window.location.port ? true : false);
  const port = window.INITIAL_PORT !== undefined
    ? window.INITIAL_PORT
    : (window.location.port ? parseInt(window.location.port) : null);

  serverInfo = {
    isRunning: isRunning,
    port: port,
    httpsPort: window.INITIAL_HTTPS_PORT ?? null,
    statusText: window.INITIAL_STATUS_TEXT || (isRunning ? "Running" : "Stopped"),
    phoneUrl: window.INITIAL_PHONE_URL ?? null,
    primaryIp: window.INITIAL_PRIMARY_IP ?? "\u2014",
    otherIps: window.INITIAL_OTHER_IPS ?? [],
    adminToken: window.INITIAL_ADMIN_TOKEN ?? null,
  };
  updateServerUI();

  initTabs();
  initCopyButtons();
  initFooterActions();
  initAutostartToggle();
  buildCtrlGroups();
  connectWS();
  checkMigrationNotice();

  // Poll server state and VU meter regularly
  setInterval(updateVUMeter, 1000);
  setInterval(refreshServerInfo, 3000);
});

/**
 * Check whether the mappings file exists. If not, show a one-line notice
 * pointing the user to the kit's Migrate-RC-Surface-Data script. The notice
 * is informational only — the extension never reads outside its storage folder.
 */
function checkMigrationNotice() {
  if (typeof sendWS !== "function") return;
  // Wait briefly for WS to be ready, then query project config status.
  const tryQuery = () => {
    sendWS("getProjectConfigStatus", {}, (res) => {
      if (!res || !res.result) return;
      const status = res.result;
      if (status.mappingsFileExists === false) {
        showMigrationNotice();
      }
    });
  };
  // Small delay so connectWS finishes setting up the message handler.
  setTimeout(tryQuery, 1500);
}

function showMigrationNotice() {
  if (document.getElementById("migration-notice")) return;
  const t = (key) => {
    if (window.RcSurfaceI18n && typeof window.RcSurfaceI18n.t === "function") {
      return window.RcSurfaceI18n.t(key);
    }
    return key;
  };
  const div = document.createElement("div");
  div.id = "migration-notice";
  div.className = "migration-notice";
  div.setAttribute("role", "status");
  div.textContent = t("panel.migrationNotice");
  // Insert near the top of the main panel body.
  const target = document.querySelector("main") || document.body;
  target.insertBefore(div, target.firstChild);
}


// ── Tab Navigation ───────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `tab-${tab}`));

  if (tab === "mappings") {
    renderMappingsTab();
  }
}

// ── WebSocket Communications ─────────────────────────────────
function connectWS() {
  const port = serverInfo ? serverInfo.port : null;
  if (!port) {
    // If not running, show offline placeholder
    updateServerUI();
    return;
  }
  const search = typeof window !== "undefined" && window.location ? window.location.search : "";
  const token = (typeof URLSearchParams !== "undefined" ? new URLSearchParams(search).get("token") : null) || (serverInfo ? serverInfo.adminToken : "");
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  const wsUrl = `ws://127.0.0.1:${port}/admin/ws${tokenQuery}`;
  window.connectCoreWS(
    wsUrl,
    // onOpen
    () => {
      refreshServerInfo();
      fetchTargets();
      fetchMappings();
    },
    // onClose
    () => {
      // managed by core
    },
    // onClientUpdate
    (msg) => {
      const clientId = msg.client.client_id;
      if (msg.client.status === "stale") {
        clientsMap.delete(clientId);
      } else {
        clientsMap.set(clientId, msg);
      }
      updateClientsStrip();
      updatePerformanceStatus();
      processClientSensors(msg);
    },
    // onCustomMessage
    () => {}
  );
}

// sendWS is provided globally by mappings-core.js (window.sendWS)
let languageReady = false;
function refreshServerInfo() {
  if (!languageReady) { languageReady = true; setupLanguageSelector(); }
  sendWS("getServerInfo", {}, (res) => {
    if (res.ok) {
      serverInfo = res.result;
      updateServerUI();
    }
  });
}

function fetchTargets() {
  sendWS("getTargets", {}, (res) => {
    if (res.ok) {
      window.allTargetsRaw = res.result.targets || [];
      // Flatten target structures
      window.allTargets = [];
      window.allTargetsRaw.forEach(t => {
        if (t.type === "tempo") {
          window.allTargets.push(t);
        } else {
          // Track mixer params
          if (t.mixer) t.mixer.forEach(m => window.allTargets.push(m));
          // Device params
          if (t.devices) {
            t.devices.forEach(d => {
              if (d.params) d.params.forEach(p => {
                p.trackName = t.name;
                p.deviceName = d.name;
                window.allTargets.push(p);
              });
            });
          }
        }
      });
    }
  });
}

function fetchMappings() {
  sendWS("getMappings", {}, (res) => {
    if (res.ok) {
      window.currentMappings = res.result.mappings || {};
      const count = res.result.total || 0;
      document.getElementById("badge-mappings").textContent = count;
      if (currentTab === "mappings") {
        window.renderMappingsTab();
      }
    }
  });
}

// ── Connect Tab UI ───────────────────────────────────────────

const controlCellRefs = new Map();

function safeDomId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function unregisterControlCellScope(scope) {
  for (const [key, refs] of controlCellRefs.entries()) {
    for (const ref of [...refs]) {
      if (ref.scope === scope) refs.delete(ref);
    }
    if (refs.size === 0) controlCellRefs.delete(key);
  }
}

function registerControlCell(key, ref) {
  if (!controlCellRefs.has(key)) controlCellRefs.set(key, new Set());
  controlCellRefs.get(key).add(ref);
}

function controlCellName(key, fallbackName) {
  if (fallbackName) return fallbackName.toUpperCase();
  if (key.startsWith("pad-")) return `PAD ${key.slice(4)}`;
  if (key.startsWith("knob-")) return `KNOB ${key.slice(5)}`;
  if (key.startsWith("fader-")) return `FADER ${key.slice(6)}`;
  if (key.startsWith("toggle-")) return `L${key.slice(7)} LFO`;
  if (key.startsWith("button-")) return `S${key.slice(7)} STUTTER`;
  if (key.startsWith("xy-")) {
    const [pad, axis = ""] = key.split(".");
    return `XY ${pad.slice(3)} ${axis.toUpperCase()}`;
  }
  const gridSensor = gridSensors.find(sensor => sensor.key === key);
  if (gridSensor) return gridSensor.name.toUpperCase();
  return getControlDisplayName(key).toUpperCase();
}

function controlCellRange(key, minVal, maxVal) {
  if (Number.isFinite(minVal) && Number.isFinite(maxVal)) {
    return { min: minVal, max: maxVal };
  }
  if (key.endsWith(".fingers")) {
    return { min: 0, max: 5 };
  }
  const meta = getControlMetadata(key);
  if (meta) return { min: meta.min, max: meta.max };
  return { min: 0, max: 1 };
}

function createEl(tagName, className, text) {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Tiny helper used by updateServerUI() and friends so a missing ID —
// caused by an HTML-side edit that did not propagate to the JS callers
// — does not silently throw and freeze the rest of the render. The
// presence of a real DOM node is verified before assignment.
function setTextIfPresent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Wire a single .copy-btn (or any button) so a click copies whatever
// `btn.dataset.url` happens to contain at click-time. Re-binding via
// `btn.onclick =` (rather than addEventListener) means later calls
// overwrite cleanly without stacking handlers, so this is safe to call
// from both initCopyButtons() and updateServerUI() — the latter
// deliberately rebinds after rewriting `dataset.url` so the contract is
// resilient against changes to markup between page load and first
// serverInfo.
function bindCopyButton(btn) {
  if (!btn) return;
  btn.onclick = (e) => {
    e.stopPropagation();
    copyText(btn.dataset.url || "", btn);
  };
}

function buildControlCell(key, options = {}) {
  const scope = options.scope || "control";
  const instanceId = safeDomId(options.instanceId || `${scope}-${key}`);
  const range = controlCellRange(key, options.min, options.max);

  const cell = createEl("div", `sensor-cell inactive${options.className ? ` ${options.className}` : ""}`);
  cell.id = options.id || `ctrl-cell-${instanceId}`;
  cell.dataset.controlKey = key;
  cell.dataset.cellScope = scope;

  const badge = createEl("span", "off-badge", "OFF");
  const nameEl = createEl("div", "cell-name", controlCellName(key, options.name));
  const valueEl = createEl("div", "cell-value", "0.00");
  valueEl.id = `val-ctrl-${safeDomId(key)}-${instanceId}`;

  const progress = createEl("div", "cell-progress-container");
  const barEl = createEl("div", "cell-progress-bar");
  barEl.id = `bar-ctrl-${safeDomId(key)}-${instanceId}`;
  progress.appendChild(barEl);

  const spark = createEl("div", "cell-sparkline");
  const svg = document.createElement("svg");
  svg.setAttribute("viewBox", "0 0 120 20");
  svg.setAttribute("preserveAspectRatio", "none");
  const sparkPath = document.createElement("path");
  sparkPath.id = `spark-ctrl-${safeDomId(key)}-${instanceId}`;
  sparkPath.setAttribute("d", "M0,10");
  svg.appendChild(sparkPath);
  spark.appendChild(svg);

  cell.appendChild(badge);

  if (options.editIndex !== undefined) {
    const editBtn = createEl("button", "cell-edit-btn", "✎");
    editBtn.title = "Configurar Slot";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSlotEditor(options.editIndex, editBtn);
    });
    editBtn.addEventListener("mouseenter", () => {
      editBtn.style.color = "var(--text)";
      editBtn.style.background = "rgba(255,255,255,0.08)";
    });
    editBtn.addEventListener("mouseleave", () => {
      editBtn.style.color = "var(--text3)";
      editBtn.style.background = "transparent";
    });
    cell.appendChild(editBtn);
    nameEl.style.paddingRight = "12px";
  }

  cell.appendChild(nameEl);
  cell.appendChild(valueEl);
  cell.appendChild(progress);
  cell.appendChild(spark);

  cell.addEventListener("click", () => {
    window.selectedControl = key;
    selectedControl = key;
    if (typeof window.markSensorRecent === "function") {
      window.markSensorRecent(key);
    }
    switchTab("mappings");
  });

  registerControlCell(key, {
    key,
    scope,
    cell,
    badge,
    valueEl,
    barEl,
    sparkPath,
    min: range.min,
    max: range.max,
    historyKey: `cell-${instanceId}`
  });

  return cell;
}

// Grouped control categories: PADS, XY PADS, LFOs, STUTTERS, KNOBS, FADERS, SENSORS.
// Each category is a clickable header showing name + count. Click expands
// the same big cells used by the top Connect grid.
function buildCtrlGroups() {
  const container = document.getElementById("ctrl-groups");
  if (!container) return;

  unregisterControlCellScope("SENSORS");
  unregisterControlCellScope("HANDS");
  unregisterControlCellScope("AUDIO");
  unregisterControlCellScope("PADS");
  unregisterControlCellScope("XY PADS");
  unregisterControlCellScope("LFOs");
  unregisterControlCellScope("STUTTERS");
  unregisterControlCellScope("KNOBS");
  unregisterControlCellScope("FADERS");

  // Hardcoded list so the SENSORS accordion stays "physical sensor" only
  // (orientation + motion). Vision controls live in their own HANDS group,
  // and audio controls live in their own AUDIO group.
  const sensorsKeys = [
    "sensor.orient.alpha", "sensor.orient.beta", "sensor.orient.gamma",
    "sensor.motion.ax", "sensor.motion.ay", "sensor.motion.az"
  ];
  const handsKeys = [
    // Hand position first: it is the continuous signal most worth mapping,
    // and it mirrors the DIRECT MAP X/Y/Z readout on the phone's VID page.
    "sensor.vision.x", "sensor.vision.y", "sensor.vision.z",
    "sensor.vision.fist", "sensor.vision.pinch", "sensor.vision.victory", "sensor.vision.rotateVal", "sensor.vision.open",
    "sensor.vision.pinch_x", "sensor.vision.pinch_y", "sensor.vision.pinch_z",
    "sensor.vision.gesture.1", "sensor.vision.gesture.2", "sensor.vision.gesture.3"
  ];
  const audioKeys = [
    // The pitch lane (pitch, note, bpm, clarity, whistle bend) is dormant: it
    // is no longer offered for new mappings, stored ones stay inert.
    "sensor.audio.rms", "sensor.audio.envelope", "sensor.audio.gate", "sensor.audio.attack",
    ...window.AudioDescriptorCatalog.map(({ name }) => name)
  ];

  const groups = [
    { id: "SENSORS", label: "SENSORS", keys: sensorsKeys },
    { id: "HANDS", label: "HANDS", keys: handsKeys },
    { id: "AUDIO", label: "AUDIO", keys: audioKeys },
    { id: "PADS", label: "PADS", keys: allControlsGrouped.Pads || [] },
    { id: "XY PADS", label: "XY PADS", keys: allControlsGrouped["XY Pads"] || [] },
    { id: "LFOs", label: "LFOs", keys: allControlsGrouped.LFOs || [] },
    { id: "STUTTERS", label: "STUTTERS", keys: allControlsGrouped.Buttons || [] },
    { id: "KNOBS", label: "KNOBS", keys: allControlsGrouped.Knobs || [] },
    { id: "FADERS", label: "FADERS", keys: allControlsGrouped.Faders || [] },
  ];

  container.innerHTML = "";

  groups.forEach(group => {
    if (!group.keys || group.keys.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = "ctrl-group";
    wrap.dataset.group = group.label;
    wrap.dataset.count = String(group.keys.length);
    // A2: family accent applied as a CSS var so the color tab, pulse
    // ring, signal bar, and active counter all derive from the same
    // source without per-element inline style. Guarded for FakeElement
    // test stubs that don't implement HTMLElement.style.
    if (wrap.style && typeof wrap.style.setProperty === 'function') {
      wrap.style.setProperty("--group-accent", GROUP_ACCENTS[group.label] || "var(--accent)");
    }

    const header = document.createElement("button");
    header.className = "ctrl-group-header";
    header.type = "button";

    const colorTab = createEl("span", "ctrl-group-color");
    const pulse = createEl("span", "ctrl-group-pulse");
    const signal = createEl("span", "ctrl-group-signal");
    const title = createEl("span", "ctrl-group-title", group.label);
    const status = createEl("span", "ctrl-group-status", "Inactive");
    const meta = createEl("span", "ctrl-group-meta");
    const activeCount = createEl("span", "ctrl-group-active", "0/" + group.keys.length);
    const count = createEl("span", "ctrl-group-count", String(group.keys.length));
    const chevron = createEl("span", "ctrl-group-chevron", "▸");
    meta.appendChild(activeCount);
    meta.appendChild(count);
    meta.appendChild(chevron);

    // Header visual order: [color][pulse][title]......[status][signal][active/count/chev]
    header.appendChild(colorTab);
    header.appendChild(pulse);
    header.appendChild(title);
    header.appendChild(status);
    header.appendChild(signal);
    header.appendChild(meta);

    // Default dataset state — bumps to "1" the first time a live value
    // arrives for any control in this family; falls back to "0" after the
    // shared bumpGroupActivity() decay window (1.5s) passes with no data.
    wrap.dataset.active = "0";

    const list = document.createElement("div");
    list.className = "ctrl-group-list hidden";
    list.dataset.group = group.label;

    group.keys.forEach((key) => {
      list.appendChild(buildControlCell(key, {
        scope: group.label,
        instanceId: `${group.label}-${key}`,
        min: gridSensors.find(s => s.key === key)?.min,
        max: gridSensors.find(s => s.key === key)?.max,
        name: gridSensors.find(s => s.key === key)?.name,
      }));
    });

    header.onclick = () => {
      const isHidden = list.classList.toggle("hidden");
      if (chevron) chevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(90deg)";
    };

    wrap.appendChild(header);
    wrap.appendChild(list);
    container.appendChild(wrap);
  });
}

function updateClientsStrip() {
  const countEl = document.getElementById("conn-count");
  const count = clientsMap.size;
  if (countEl) countEl.textContent = String(count);
  const pulse = document.getElementById("conn-pulse");
  if (pulse) pulse.classList.toggle("active", count > 0);

}

// Latest CPU reading from getServerInfo.cpuUsage (0-100). Used by the
// shared VU meter to display server load.
let lastCpuUsage = 0;

function updateVUMeter() {
  const fill = document.getElementById("vu-fill");
  if (!fill) return;
  fill.style.width = Math.max(0, Math.min(100, lastCpuUsage)) + "%";
  if (lastCpuUsage < 50) {
    fill.style.background = "var(--accent)";
  } else if (lastCpuUsage < 80) {
    fill.style.background = "#f5a623";
  } else {
    fill.style.background = "#e74c3c";
  }
}

function hasDedicatedSensorReading(controlName, latest) {
  if (!controlName || !controlName.startsWith("sensor.")) return false;
  const sensors = latest?.sensors || {};
  const isActive = (status) => status === "available" || status === "active";

  if (controlName.startsWith("sensor.orient.")) {
    return isActive(sensors.orientation) && !!sensors.orientation_reading;
  }
  if (controlName.startsWith("sensor.motion.")) {
    return isActive(sensors.motion) && (!!sensors.motion_reading || !!latest?.motion);
  }
  if (controlName.startsWith("sensor.audio.")) {
    return isActive(sensors.audio) && !!sensors.audio_reading;
  }
  if (controlName.startsWith("sensor.vision.")) {
    return isActive(sensors.vision) && !!sensors.vision_reading;
  }
  return false;
}

function processClientSensors(msg) {
  const latest = msg.latest;
  if (!latest) return;

  // Track sensor status configurations
  const statuses = latest.sensors || {};

  // Extract control values
  const controls = latest.controls || [];
  const controlsMap = new Map();
  controls.forEach(c => {
    if (c.x !== undefined && c.y !== undefined) {
      controlsMap.set(c.name + ".x", c.x);
      controlsMap.set(c.name + ".y", c.y);
    } else {
      controlsMap.set(c.name, c.value);
    }
  });

  // Update liveControls Map & DOM rows for physical controls (with XY pads support)
  for (const ctrl of controls) {
    if (ctrl.x !== undefined && ctrl.y !== undefined) {
      const nameX = ctrl.name + ".x";
      const nameY = ctrl.name + ".y";

      const prevX = liveControls.get(nameX);
      if (prevX === undefined || Math.abs(prevX - ctrl.x) > 0.001) {
        liveControls.set(nameX, ctrl.x);
        updateControlRowValue(nameX, ctrl.x);
        updateControlCell(nameX, ctrl.x, true);
      }

      const prevY = liveControls.get(nameY);
      if (prevY === undefined || Math.abs(prevY - ctrl.y) > 0.001) {
        liveControls.set(nameY, ctrl.y);
        updateControlRowValue(nameY, ctrl.y);
        updateControlCell(nameY, ctrl.y, true);
      }
    } else {
      if (hasDedicatedSensorReading(ctrl.name, latest)) {
        updateControlRowValue(ctrl.name, ctrl.value);
        continue;
      }
      const prev = liveControls.get(ctrl.name);
      if (prev === undefined || Math.abs(prev - ctrl.value) > 0.001) {
        liveControls.set(ctrl.name, ctrl.value);
        updateControlRowValue(ctrl.name, ctrl.value);
        updateControlCell(ctrl.name, ctrl.value, true);
      }
    }
  }

  // Extract readings
  const motion = latest.sensors?.motion_reading || {};
  const orient = latest.sensors?.orientation_reading || {};
  const audio = latest.sensors?.audio_reading || {};
  const visionReading = latest.sensors?.vision_reading || {};

  // For sensors, update liveControls and DOM rows too
  if (statuses.orientation === "available" || statuses.orientation === "active") {
    if (typeof orient.alpha === 'number') {
      updateSensorLiveControl("sensor.orient.alpha", orient.alpha);
      updateSensorLiveControl("sensor.orient.beta", orient.beta);
      updateSensorLiveControl("sensor.orient.gamma", orient.gamma);
    }
  }
  if (statuses.motion === "available" || statuses.motion === "active") {
    const lm = latest.motion || {};
    if (lm.ax !== undefined) {
      updateSensorLiveControl("sensor.motion.ax", lm.ax);
      updateSensorLiveControl("sensor.motion.ay", lm.ay);
      updateSensorLiveControl("sensor.motion.az", lm.az);
    } else {
      const a = motion.acceleration;
      if (a) {
        updateSensorLiveControl("sensor.motion.ax", a.x);
        updateSensorLiveControl("sensor.motion.ay", a.y);
        updateSensorLiveControl("sensor.motion.az", a.z);
      }
    }
    const rot = latest.sensors?.motion_reading?.rotation_rate || latest.motion;
    if (rot) {
      updateSensorLiveControl("sensor.motion.gx", rot.gx ?? rot.x ?? 0);
      updateSensorLiveControl("sensor.motion.gy", rot.gy ?? rot.y ?? 0);
      updateSensorLiveControl("sensor.motion.gz", rot.gz ?? rot.z ?? 0);
    }
  }
  if (statuses.audio === "available" || statuses.audio === "active") {
    if (typeof audio.rms === 'number') {
      updateSensorLiveControl("sensor.audio.rms", audio.rms);
      updateSensorLiveControl("sensor.audio.envelope", audio.envelope ?? 0);
      updateSensorLiveControl("sensor.audio.gate", audio.gate ?? 0);
      updateSensorLiveControl("sensor.audio.attack", controlsMap.get("sensor.audio.attack") ?? audio.attack ?? 0);
    }
    for (const { name, field } of window.AudioDescriptorCatalog) {
      updateSensorLiveControl(name, controlsMap.get(name) ?? audio[field] ?? 0);
    }
  }
  if (statuses.vision === "available" || statuses.vision === "active") {
    if (visionReading) {
      // Prioritize controlsMap values (which contain modes A/B/C and analog/latch states processed on the phone)
      updateSensorLiveControl("sensor.vision.active", controlsMap.get("sensor.vision.active") ?? (visionReading.active ? 1 : 0));
      // Hand position. Without these three the tiles render but never move,
      // so the panel could not show — or usefully map — the DIRECT MAP X/Y/Z
      // the phone's VID page displays.
      updateSensorLiveControl("sensor.vision.x", controlsMap.get("sensor.vision.x") ?? (visionReading.x ?? 0.5));
      updateSensorLiveControl("sensor.vision.y", controlsMap.get("sensor.vision.y") ?? (visionReading.y ?? 0.5));
      updateSensorLiveControl("sensor.vision.z", controlsMap.get("sensor.vision.z") ?? (visionReading.z ?? 0));
      updateSensorLiveControl("sensor.vision.fist", controlsMap.get("sensor.vision.fist") ?? (visionReading.fist ? 1 : 0));
      // Pinch value can be continuous (pinchVal) or toggle (latched) from the phone, fallback to pinchVal if available
      updateSensorLiveControl("sensor.vision.pinch", controlsMap.get("sensor.vision.pinch") ?? (visionReading.pinchVal ?? (visionReading.pinch ? 1 : 0)));
      updateSensorLiveControl("sensor.vision.victory", controlsMap.get("sensor.vision.victory") ?? (visionReading.victory ? 1 : 0));
      // rotateVal rides on the Victory pose: the phone anchors the
      // analog value at 0.5 while Victory is inactive, and exposes the
      // live 0.0–1.0 reading while it is. The panel mirrors whatever
      // the wire payload carries.
      updateSensorLiveControl("sensor.vision.rotateVal", controlsMap.get("sensor.vision.rotateVal") ?? (visionReading.rotateVal ?? 0.5));
      updateSensorLiveControl("sensor.vision.open", controlsMap.get("sensor.vision.open") ?? (visionReading.open ? 1 : 0));
      // The clutch axes come off the wire only. visibleReading carries no
      // pinch_* field, so a `?? (visionReading.pinch_x ?? 0.5)` fallback like
      // the lines above would be permanently undefined. Without these three the
      // tiles render and then sit frozen for the whole session: every
      // sensor.vision.* key counts as having a dedicated reading, so the
      // generic fallback loop skips them.
      updateSensorLiveControl("sensor.vision.pinch_x", controlsMap.get("sensor.vision.pinch_x") ?? 0.5);
      updateSensorLiveControl("sensor.vision.pinch_y", controlsMap.get("sensor.vision.pinch_y") ?? 0.5);
      updateSensorLiveControl("sensor.vision.pinch_z", controlsMap.get("sensor.vision.pinch_z") ?? 0.5);
      for (let slot = 1; slot <= 3; slot += 1) {
        const key = `sensor.vision.gesture.${slot}`;
        updateSensorLiveControl(key, controlsMap.get(key) ?? 0);
      }
      if (visionReading.color) {
        updateSensorLiveControl("sensor.vision.color.r", controlsMap.get("sensor.vision.color.r") ?? visionReading.color.r);
        updateSensorLiveControl("sensor.vision.color.g", controlsMap.get("sensor.vision.color.g") ?? visionReading.color.g);
        updateSensorLiveControl("sensor.vision.color.b", controlsMap.get("sensor.vision.color.b") ?? visionReading.color.b);
      }
    }
  }


  // If selected control in mappings tab is active, update details
  if (currentTab === "mappings" && selectedControl) {
    let activeVal = 0;
    if (selectedControl.startsWith("sensor.orient.")) {
      activeVal = orient[selectedControl.split(".").pop()] ?? 0;
    } else if (selectedControl.startsWith("sensor.motion.")) {
      const axis = selectedControl.split(".").pop();
      const cleanAxis = axis === "ax" ? "x" : (axis === "ay" ? "y" : (axis === "az" ? "z" : axis));
      if (latest.motion && latest.motion[axis] !== undefined) {
        activeVal = latest.motion[axis] ?? 0;
      } else {
        activeVal = motion.acceleration?.[cleanAxis] ?? 0;
      }
    } else if (selectedControl.startsWith("sensor.audio.")) {
      const prop = selectedControl.slice("sensor.audio.".length);
      const mappedProp = prop.replace(/\./g, "_");
      activeVal = audio[mappedProp] ?? 0;
    } else if (selectedControl.startsWith("sensor.vision.")) {
      const parts = selectedControl.split(".");
      if (parts[2] === "color" && visionReading && visionReading.color) {
        activeVal = controlsMap.get(selectedControl) ?? (visionReading.color[parts[3]] ?? 0);
      } else if (visionReading) {
        activeVal = controlsMap.get(selectedControl) ?? (parts[2] === "pinch" ? (visionReading.pinchVal ?? (visionReading.pinch ? 1 : 0)) : (visionReading[parts[2]] ?? 0));
      } else {
        activeVal = 0;
      }
    } else {
      activeVal = controlsMap.get(selectedControl) ?? 0;
    }
    updateMappingDetailLive(selectedControl, activeVal);
  }
}

function updateSensorLiveControl(name, value) {
  if (typeof value !== 'number') return;
  const prev = liveControls.get(name);
  if (prev === undefined || Math.abs(prev - value) > 0.001) {
    liveControls.set(name, value);
    updateControlRowValue(name, value);
    updateControlCell(name, value, true);
  }
}

function updateControlRowValue(name, val) {
  const row = document.querySelector(`.map-item[data-ctrl="${name}"] .live-val`);
  if (row) row.textContent = val.toFixed(3);
}

function updateControlCell(key, value, available = true, minVal, maxVal) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const refs = controlCellRefs.get(key);
  if (!refs) return;
  for (const ref of refs) {
    updateControlCellRef(ref, value, available, minVal, maxVal);
  }
  // A2: bump the group header's active count + signal. Cheap — the
  // closest('header') lookup runs at most once per cell update. Signal
  // decay is throttled to fire at most every 250ms so the gauge does
  // not dance under high-rate sensors.
  bumpGroupActivity(key, value);
}

function isMeaningfulGroupActivity(key, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;

  if (key.startsWith("sensor.vision.")) {
    if (key === "sensor.vision.active") return value > 0.5;
    return (liveControls.get("sensor.vision.active") || 0) > 0.5;
  }

  if (key.startsWith("sensor.audio.")) {
    return Math.abs(value) > 0.01;
  }

  return true;
}

function bumpGroupActivity(key, value) {
  if (!isMeaningfulGroupActivity(key, value)) return;

  const wraps = new Set();
  const refs = controlCellRefs.get(key);
  if (refs) {
    for (const ref of refs) {
      const wrap = ref.cell && ref.cell.closest ? ref.cell.closest('.ctrl-group[data-group]') : null;
      if (wrap) wraps.add(wrap);
    }
  }
  for (const wrap of wraps) bumpGroupWrap(wrap);
}

function bumpGroupWrap(wrap) {
  if (!wrap) return;
  // Activity state belongs to the group element and decays after silence.
  if (!wrap._activity) {
    wrap._activity = { active: 0, alive: false, decayTimer: null };
  }
  const a = wrap._activity;
  a.active += 1;
  // Switch the family to "Active" the first time we see fresh data, and
  // keep the badge in sync. data-active="1" stays until the decay timer
  // marks the family "Inactive" again (5s window). The old `data-has-data`
  // attribute stays so the existing pulse/signal CSS rules still fire —
  // the new attribute is the explicit source of truth for the badge.
  wrap.dataset.active = "1";
  wrap.dataset.hasData = "1";
  const statusEl = wrap.querySelector(".ctrl-group-status");
  if (statusEl) statusEl.textContent = "Active";
  const pulse = wrap.querySelector('.ctrl-group-pulse');
  if (pulse) {
    pulse.style.animation = 'none';
    // Force reflow to restart the animation cleanly.
    void pulse.offsetWidth;
    pulse.style.animation = '';
  }
  const activeEl = wrap.querySelector('.ctrl-group-active');
  const total = wrap.dataset.count;
  if (activeEl) activeEl.textContent = `${Math.min(a.active, parseInt(total, 10))}/${total}`;
  const signal = wrap.querySelector('.ctrl-group-signal');
  if (signal) {
    // Rolling per-cell max. Pct of active / total, scaled with 5 active of 12 = 42%.
    const pct = Math.min(100, (a.active / parseInt(total, 10)) * 100 * 2);
    signal.style.setProperty('--sig', `${pct}%`);
  }
  // Decay active count + reset signal after quiet window. Cap so we do
  // not stack timers when updates arrive faster than the decay.
  if (a.decayTimer) clearTimeout(a.decayTimer);
  a.decayTimer = setTimeout(() => {
    a.active = 0;
    wrap.dataset.active = "0";
    delete wrap.dataset.hasData;
    if (signal) signal.style.setProperty('--sig', '0%');
    if (activeEl) activeEl.textContent = `0/${total}`;
    if (statusEl) statusEl.textContent = "Inactive";
  }, 1500);
}

function updateControlCellRef(ref, value, available, minVal, maxVal) {
  const { cell, badge, valueEl, barEl, sparkPath } = ref;
  if (!cell) return;
  // Toggle active/inactive states
  cell.classList.toggle("inactive", !available);
  if (badge) badge.hidden = available;

  // Finger count travels on the wire normalized to 0.0–1.0 (see
  // vision-processor.computeHandData). The PC display shows the actual
  // 0–5 integer so the user reads what their hand is actually doing.
  const isFingers = ref.historyKey && (ref.historyKey.endsWith(".fingers") || ref.historyKey.endsWith("-fingers"));
  const displayValue = isFingers ? value * 5 : value;
  const displayDecimals = isFingers ? 0 : 2;
  const displayText = displayValue.toFixed(displayDecimals);
  const visualValue = Number(displayText);
  const min = Number.isFinite(minVal) ? minVal : ref.min;
  const max = Number.isFinite(maxVal) ? maxVal : ref.max;
  const range = max - min;
  const highlightThreshold = isFingers
    ? 0.5
    : (Number.isFinite(range) && range > 0 ? range * 0.05 : 0.05);

  // Update value text
  if (valueEl) {
    const prevStr = valueEl.textContent;
    const newStr = displayText;
    valueEl.textContent = newStr;

    // Trigger brief highlighting on shifts > 5% of this control's display
    // range so wide sensors do not flicker from normal measurement noise.
    if (prevStr !== newStr) {
      const prev = parseFloat(prevStr);
      if (!isNaN(prev) && Math.abs(visualValue - prev) > highlightThreshold) {
        cell.classList.add("highlight");
        setTimeout(() => cell.classList.remove("highlight"), 200);
      }
    }
  }

  // Update progress bar
  if (barEl) {
    const normalized = range === 0 ? 0.5 : (visualValue - min) / range;
    const pct = Math.max(0, Math.min(100, normalized * 100));
    barEl.style.width = pct + "%";
  }

  // Push values and redraw sparklines
  const historyKey = ref.historyKey;
  if (!sensorHistory[historyKey]) sensorHistory[historyKey] = [];
  sensorHistory[historyKey].push(visualValue);
  if (sensorHistory[historyKey].length > sensorHistoryMax) sensorHistory[historyKey].shift();

  if (available && sparkPath) {
    drawSparkline(sparkPath, sensorHistory[historyKey], min, max);
  }
}

function drawSparkline(pathEl, values, minVal, maxVal) {
  if (values.length < 2) return;
  const width = 120;
  const height = 16;
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * width;
    const range = maxVal - minVal;
    const normalized = range === 0 ? 0.5 : (values[i] - minVal) / range;
    const y = height - Math.max(0, Math.min(1, normalized)) * height;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  pathEl.setAttribute("d", d);
}

// ── Mappings Tab UI ──────────────────────────────────────────
// Handled by mappings.js

// ── Interfaces Tab UI ────────────────────────────────────────
function ensureQRCode(frame, url) {
  if (!frame || !url) return;
  frame.onclick = null;
  delete frame.dataset.url;
  frame.style.cursor = "default";
  if (frame.dataset.qrUrl === url) return;

  frame.innerHTML = "";
  frame.dataset.qrUrl = url;
  new QRCode(frame, {
    text: url,
    width: 140,
    height: 140,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.L
  });
}

function clearQRCode(frame) {
  if (!frame) return;
  frame.onclick = null;
  delete frame.dataset.url;
  delete frame.dataset.qrUrl;
  frame.innerHTML = "";
}

function updateServerUI() {
  if (!serverInfo) return;

  const active = serverInfo.isRunning;
  const dot = document.getElementById("footer-dot");
  dot.className = `server-dot ${active ? 'on' : 'off'}`;
  document.getElementById("footer-status").textContent = serverInfo.statusText || (active ? "Running" : "Stopped");

  // Show start/stop buttons accordingly
  document.getElementById("btn-start").classList.toggle("hidden", active);
  document.getElementById("btn-stop").classList.toggle("hidden", !active);

  // Interfaces info — primary IP/URL live on the Main tab now. The
  // "Other Interfaces" sub-list was migrated away in A1 (now displayed
  // inline under Network); keep the function null-safe in case server
  // still sends otherIps for diagnostic purposes.
  const primaryIp = serverInfo.primaryIp || "—";
  document.getElementById("iface-primary-ip").textContent = primaryIp;
  document.getElementById("iface-primary-url").textContent = serverInfo.phoneUrl || "Server not running";

  const otherList = document.getElementById("iface-list");
  if (otherList) {
    otherList.innerHTML = "";
    if (serverInfo.otherIps && serverInfo.otherIps.length > 0) {
      serverInfo.otherIps.forEach(ip => {
        const url = `http://${ip}:${serverInfo.port}/`;
        const row = document.createElement("div");
        row.className = "iface-row";
        row.innerHTML = `
          <span class="ip">${url}</span>
          <button class="btn sm copy-btn" data-url="${url}">Copy</button>
        `;
        otherList.appendChild(row);
      });
      // Bind new copies
      initCopyButtons();
    } else {
      otherList.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:8px">No other interfaces detected</div>`;
    }
  }

  // Connection mode info — IDs must exist in the active HTML. A1 keeps
  // them inside the Main tab's Network block; the null-safety here is
  // defence-in-depth for any future HTML restructuring that drops the
  // elements before the JS is updated to match.
  setTextIfPresent("mode-proto", serverInfo.useHttps ? "HTTPS" : "HTTP");
  setTextIfPresent("mode-port", serverInfo.port != null ? String(serverInfo.port) : "—");
  setTextIfPresent("mode-cert", serverInfo.useHttps ? "Self-signed" : "n/a");

  // Server CPU usage (consumed by the conn-strip VU meter via lastCpuUsage)
  lastCpuUsage = typeof serverInfo.cpuUsage === "number" ? serverInfo.cpuUsage : 0;
  updateVUMeter();

  // Connect QR
  const qrPerf = document.getElementById("qr-perf");
  const urlPerf = document.getElementById("url-perf");

  const row = document.getElementById("qr-row");
  const placeholder = document.getElementById("qr-placeholder");

  if (active && serverInfo.phoneUrl) {
    if (row) row.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");

    ensureQRCode(qrPerf, serverInfo.phoneUrl);

    if (urlPerf) urlPerf.textContent = serverInfo.phoneUrl;

    const openPerf = document.getElementById("open-perf");
    if (openPerf) openPerf.href = serverInfo.phoneUrl;

    const copyPrimary = document.getElementById("copy-primary");
    if (copyPrimary) {
      copyPrimary.dataset.url = serverInfo.phoneUrl;
      bindCopyButton(copyPrimary);
    }

    const adminLink = document.getElementById("link-admin");
    if (adminLink) adminLink.href = serverInfo.adminUrl;
  } else {
    if (row) row.classList.add("hidden");
    if (placeholder) placeholder.classList.remove("hidden");
    clearQRCode(qrPerf);
    if (urlPerf) urlPerf.textContent = "";
  }
}

// ── Copy to Clipboard & Actions ──────────────────────────────
function initCopyButtons() {
  document.querySelectorAll("[data-url]").forEach(bindCopyButton);
}

function copyText(text, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showCopied(btn)).catch(() => fallbackCopy(text, btn));
  } else {
    fallbackCopy(text, btn);
  }
}

function fallbackCopy(text, btn) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showCopied(btn);
  } catch {}
  document.body.removeChild(ta);
}

function showCopied(btn) {
  const oldText = btn.textContent;
  btn.textContent = "Copied!";
  btn.classList.add("copied");
  setTimeout(() => {
    btn.textContent = oldText;
    btn.classList.remove("copied");
  }, 1200);
}

function readAutostart() {
  if (typeof window.INITIAL_AUTOSTART === "boolean") return window.INITIAL_AUTOSTART;
  const q = new URLSearchParams(window.location.search).get("autostart");
  if (q === "1") return true;
  if (q === "0") return false;
  // Neither channel answered: say what the extension does by default rather
  // than showing a state the user might act on.
  return true;
}

function initAutostartToggle() {
  const btn = document.getElementById("btn-autostart");
  if (!btn) return;
  const on = readAutostart();
  // Through data-i18n, like every other label here: the panel has no T().
  btn.setAttribute("data-i18n", on ? "common.on" : "common.off");
  btn.textContent = on ? "On" : "Off";
  window.RcSurfaceI18n?.apply?.();
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    sendHostAction(on ? "autostart-off" : "autostart-on");
  });
}

function initFooterActions() {
  document.querySelectorAll(".footer .btn[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      // Immediately enter a pending state so the user gets visual feedback
      // and cannot trigger the same action twice before the host responds.
      setFooterPending(action);
      sendHostAction(action);
    });
  });
}

/**
 * Show a transient "pending" label on the footer while the host is
 * processing the action (start / stop / restart). The host will close
 * and re-open the panel once the action completes, so the pending state
 * only needs to last long enough to prevent a double-click.
 */
function setFooterPending(action) {
  const statusEl = document.getElementById("footer-status");
  const dot = document.getElementById("footer-dot");

  // Disable all action buttons to prevent re-entry.
  document.querySelectorAll(".footer .btn[data-action]").forEach(b => {
    b.disabled = true;
    b.style.opacity = "0.5";
  });

  if (action === "start" || action === "restart") {
    if (dot) dot.className = "server-dot starting";
    if (statusEl) statusEl.textContent = "Starting\u2026";
  } else if (action === "stop") {
    if (dot) dot.className = "server-dot off";
    if (statusEl) statusEl.textContent = "Stopping\u2026";
  }
}




function sendHostAction(action) {
  // Use postMessage bridge back to Live host
  const m = { method: "close_and_send", params: [action] };
  if (window.webkit?.messageHandlers?.live) {
    window.webkit.messageHandlers.live.postMessage(m);
  } else if (window.chrome?.webview) {
    window.chrome.webview.postMessage(m);
  }
}

function updatePerformanceStatus() {
  const card = document.getElementById("perf-status-card");
  if (!card) return;

  const activeClients = Array.from(clientsMap.values()).filter(c => c.client && c.client.status === "active");
  if (activeClients.length === 0) {
    card.style.display = "none";
    return;
  }

  const c = activeClients[0];
  card.style.display = "flex";

  const deviceName = c.client.display_name || c.client.user_agent || "Connected Phone";
  document.getElementById("perf-device").textContent = deviceName;

  const latest = c.latest || {};
  const network = latest.network || {};

  const fps = typeof network.fps === "number" ? `${network.fps} FPS` : "—";
  document.getElementById("perf-fps").textContent = fps;

  const rtt = typeof network.rtt === "number" ? `${network.rtt} ms` : "—";
  document.getElementById("perf-rtt").textContent = rtt;

  const mpLatency = typeof network.mpLatency === "number" ? `${network.mpLatency} ms` : "—";
  document.getElementById("perf-mediapipe").textContent = mpLatency;
}

/* ── interface language ───────────────────────────────────────────────────
   The extension holds the setting, so the panel reads it on connect rather
   than trusting whatever this browser happened to store, and writes it back
   on every change. The phone picks the change up over its own socket; the
   panel does not talk to the phone directly. */
function setupLanguageSelector() {
  const i18n = window.RcSurfaceI18n;
  if (!i18n) return;

  i18n.bindSelector(document.querySelector('.lang-select'), (locale) => {
    sendWS('setLocale', { locale }, () => {});
  });

  sendWS('getLocale', {}, (res) => {
    if (res && res.ok && res.result && res.result.locale) {
      i18n.adoptFromServer(res.result.locale);
    }
  });

  i18n.apply();
}
