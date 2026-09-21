// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Max legacy js: low-priority configuration/identity only, never sample DSP.
// Gate A prototype. No auto-arm, no persistent target, no remote network arm.
autowatch = 0;
inlets = 1;
outlets = 4; // DSP coefficients; native IDs; safe status; Node probe identity.
var rate = 48000, sensitivity = .65, releaseMs = 45, curve = 1;
var deviceId = '', instanceId = '', initialized = false;
var selectedPath = '', prepared = null, selectedMode = 0;
var active = true;
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function uuid() {
  // Identification, NOT a credential. Bridge authentication uses Node crypto.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
function valid(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
function status(code) { outlet(2, 'status', code); }
function off() { outlet(1, 'release'); outlet(0, 'reset'); status('off'); }
function deviceenabled(value) { active = value === 1; if (!active) off(); }
function init() {
  off();
  if (!uuidPattern.test(deviceId)) { deviceId = uuid(); notifyclients(); }
  if (!initialized) { instanceId = uuid(); initialized = true; }
  coefficients();
  outlet(3, 'identity', deviceId, instanceId);
}
function getvalueof() { return deviceId; }
function announce() { if (initialized) outlet(3, 'identity', deviceId, instanceId); }
function setvalueof(value) {
  off(); prepared = null;
  if (typeof value === 'string' && uuidPattern.test(value)) deviceId = value;
  else deviceId = uuid();
  notifyclients();
  if (initialized) outlet(3, 'identity', deviceId, instanceId);
}
function coefficients() {
  outlet(0, 'fast-slide', 1 / (1 - Math.exp(-1 / (rate * .001))));
  outlet(0, 'slow-slide', 1 / (1 - Math.exp(-1 / (rate * .030))));
  outlet(0, 'release-slide', 1 / (1 - Math.exp(-1 / (rate * releaseMs / 1000))));
  var knee = .6 - .57 * sensitivity;
  outlet(0, 'knee', knee); outlet(0, 'denominator', 1 - knee); outlet(0, 'curve', curve);
}
function samplerate(value) { if (valid(value, 8000, 384000)) { rate = value; coefficients(); } }
function settings(s, r, c) {
  if (!valid(s, 0, 1) || !valid(r, 1.25, 360000) || !valid(c, .3, 3)) { status('invalid_settings'); return; }
  sensitivity = s; releaseMs = r; curve = c; coefficients();
}
function targetpath() {
  off(); prepared = null;
  var p = arrayfromargs(arguments).join(' ');
  // Prototype only accepts top-level device parameters and mixer volume/pan.
  if (!/^live_set (tracks [0-9]+|return_tracks [0-9]+|master_track) (devices [0-9]+ parameters [0-9]+|mixer_device (volume|panning))$/.test(p)) {
    selectedPath = ''; status('target_ineligible'); return;
  }
  selectedPath = p; status('target_path_set');
}
function scalar(api, key) { var value = api.get(key); return value instanceof Array ? value[0] : value; }
function eligible(api) {
  return api && Number(api.id) > 0 && api.type === 'DeviceParameter'
    && Number(scalar(api, 'is_enabled')) === 1 && Number(scalar(api, 'is_quantized')) === 0
    && valid(Number(scalar(api, 'min')), -1e9, 1e9) && valid(Number(scalar(api, 'max')), -1e9, 1e9)
    && Number(scalar(api, 'max')) > Number(scalar(api, 'min'));
}
function prepare() {
  off(); prepared = null;
  try {
    if (!selectedPath) { status('target_ineligible'); return; }
    var api = new LiveAPI(null, selectedPath);
    if (!eligible(api)) { status('target_ineligible'); return; }
    prepared = { api: api, id: Number(api.id), path: api.unquotedpath };
    status('target_prepared');
  } catch (e) { status('target_unavailable'); }
}
function mode(value) {
  off(); selectedMode = value === 0 ? 0 : 1;
  status(selectedMode ? 'modulation_kind_unsupported' : 'remote_selected');
}
function arm() {
  outlet(1, 'release');
  if (!active) { status('device_disabled'); return; }
  // LOM min/max alone does NOT establish modulation polarity. No production
  // allowlist has passed Gate A, so Modulate remains visibly unavailable.
  if (selectedMode !== 0) { status('modulation_kind_unsupported'); return; }
  try {
    if (!prepared || Number(prepared.api.id) !== prepared.id || prepared.api.unquotedpath !== prepared.path || !eligible(prepared.api)) {
      prepared = null; status('target_unavailable'); return;
    }
    outlet(0, 'reset'); outlet(1, 'remote', prepared.id); status('remote_active');
  } catch (e) { prepared = null; status('target_unavailable'); }
}
function freebang() { outlet(1, 'release'); }
