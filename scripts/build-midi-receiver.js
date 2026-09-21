// Receiver v2.2: API-visible SDK packet, armed automatically after load; no network.
import { readPatch, writePatch } from './amxd.js';

const base = readPatch(process.argv[2]).patcher;
const boxes = [], lines = [];
function box(id, maxclass, extra) {
  boxes.push({ box: { id, maxclass, numinlets: 1, numoutlets: 1,
    patching_rect: [20, boxes.length * 30, 200, 22], ...extra } });
  return id;
}
const obj = (id, text, extra = {}) => box(id, 'newobj', { text, ...extra });
const wire = (source, outlet, destination, inlet = 0) => lines.push({ patchline: {
  source: [source, outlet], destination: [destination, inlet],
} });
box('title', 'comment', { text: 'RC MIDI RECEIVER v2.2', numoutlets: 0,
  presentation: 1, presentation_rect: [10, 8, 280, 20] });
box('subtitle', 'comment', { text: 'SDK / LOCAL MAX — NO UDP', numoutlets: 0,
  presentation: 1, presentation_rect: [10, 30, 230, 18] });
box('packet', 'live.numbox', {
  numoutlets: 2, outlettype: ['', 'float'], parameter_enable: 1,
  varname: 'RC MIDI Packet v2', hidden: 1, ignoreclick: 1,
  saved_attribute_attributes: { valueof: {
    // DeviceParameter.name exposes the short name. Both must match the host
    // contract; a visual abbreviation made a valid Receiver look outdated.
    parameter_longname: 'RC MIDI Packet v2', parameter_shortname: 'RC MIDI Packet v2',
    // Max Int supports only 256 values; a wide command must use Float + Int units.
    parameter_type: 0, parameter_unitstyle: 0,
    parameter_mmin: 0, parameter_mmax: 4194303,
    parameter_initial_enable: 1, parameter_initial: [0],
    // Device.parameters excludes non-automatable modes, even "Visible".
    // This value CAN be stored/automated: manual, non-parameter arming below
    // is mandatory. Do not automate/map the internal command while armed.
    parameter_invisible: 0,
    parameter_speedlim: 0, parameter_defer: 0,
  } },
});
obj('round', 'round 1');
obj('sdk-gate', 'gate 1 0', { numinlets: 2 });
box('sdk-enable', 'toggle', { parameter_enable: 0,
  presentation: 1, presentation_rect: [10, 55, 20, 20] });
box('sdk-label', 'comment', { numoutlets: 0, text: 'SDK Notes (ON after load; Panic turns OFF)',
  presentation: 1, presentation_rect: [38, 55, 255, 22] });
// Right-to-left: close first, clear the stored value without output, flush held
// notes, then apply the explicit user choice. Enabling must never bang packet.
obj('sdk-switch', 't i b b b', { numoutlets: 4 });
box('sdk-close', 'message', { text: '0', numinlets: 2 });
box('packet-clear', 'message', { text: 'set 0', numinlets: 2 });
wire('sdk-enable', 0, 'sdk-switch');
wire('sdk-switch', 3, 'sdk-close'); wire('sdk-close', 0, 'sdk-gate');
wire('sdk-switch', 2, 'packet-clear'); wire('packet-clear', 0, 'packet');
wire('sdk-switch', 1, 'flush'); wire('sdk-switch', 0, 'sdk-gate');
obj('valid', 'split 16384 4194303', { numoutlets: 2 });
obj('order', 't i i', { numoutlets: 2 });
obj('velocity', '% 128', { numinlets: 2 });
obj('note', 'expr ($i1 / 128) % 128');
obj('pair', 'pack 0 0', { numinlets: 2 });
obj('status', 'prepend 144');
wire('packet', 0, 'round'); wire('round', 0, 'sdk-gate', 1);
wire('sdk-gate', 0, 'valid'); wire('valid', 0, 'order');
wire('order', 1, 'velocity'); wire('velocity', 0, 'pair', 1);
wire('order', 0, 'note'); wire('note', 0, 'pair'); wire('pair', 0, 'status');

obj('local', 'receive rc-midi-audio-v2');
obj('local-gate', 'gate 1 0', { numinlets: 2 });
box('local-enable', 'toggle', { parameter_enable: 0,
  presentation: 1, presentation_rect: [10, 83, 20, 20] });
box('local-label', 'comment', { numoutlets: 0,
  text: 'Audio Sender input (OFF at load)', presentation: 1,
  presentation_rect: [38, 83, 255, 22] });
obj('local-switch', 't i b', { numoutlets: 2 });
wire('local', 0, 'local-gate', 1); wire('local-enable', 0, 'local-switch');
wire('local-switch', 0, 'local-gate');

obj('activity-trigger', 't l b', { numoutlets: 2 });
box('activity', 'button', { parameter_enable: 0,
  presentation: 1, presentation_rect: [10, 114, 20, 20] });
box('activity-label', 'comment', { text: 'Activity', numoutlets: 0,
  presentation: 1, presentation_rect: [38, 114, 100, 20] });
obj('bytes', 'iter');
obj('flush', 'midiflush');
obj('output', 'midiout', { numoutlets: 0 });
box('panic', 'button', { parameter_enable: 0,
  presentation: 1, presentation_rect: [160, 114, 20, 20] });
box('panic-label', 'comment', { text: 'Panic', numoutlets: 0,
  presentation: 1, presentation_rect: [188, 114, 100, 20] });
box('warning', 'comment', { numoutlets: 0,
  text: 'Internal packet: do not automate / nao automatizar',
  presentation: 1, presentation_rect: [10, 141, 285, 20] });
// Gates are closed at construction, before any restored parameter emits.
// live.thisdevice is a post-initialization notification: once it fires, the
// restored packet has already been discarded by the closed gate, so arming
// through sdk-enable (close, clear without output, flush, open) is exactly
// the manual click the owner used to make after every load (2026-09-21
// bench: "the final version cannot need that click"). Device On=0 disarms
// and flushes; Device On=1 re-arms the same way. Panic disarms and stays
// OFF until clicked. Recalling a preset on an armed instance still restores
// the packet before the notification arrives, as with automation: disarm
// first. The Audio Sender input stays an explicit opt-in.
obj('boot', 'loadbang');
obj('lifecycle', 'live.thisdevice', { numoutlets: 3, outlettype: ['bang', 'int', 'int'] });
obj('disabled', 'sel 0', { numinlets: 2, numoutlets: 2 });
box('reset', 'message', { text: '0', numinlets: 2 });
box('arm', 'message', { text: '1', numinlets: 2 });
wire('boot', 0, 'reset'); wire('lifecycle', 0, 'arm');
wire('lifecycle', 1, 'disabled'); wire('disabled', 0, 'reset'); wire('disabled', 1, 'arm');
wire('reset', 0, 'sdk-enable'); wire('reset', 0, 'local-enable');
wire('arm', 0, 'sdk-enable');
obj('free', 'freebang');
wire('status', 0, 'activity-trigger'); wire('local-gate', 0, 'activity-trigger');
wire('activity-trigger', 1, 'activity'); wire('activity-trigger', 0, 'bytes');
wire('bytes', 0, 'flush'); wire('flush', 0, 'output');
wire('local-switch', 1, 'flush'); wire('panic', 0, 'reset'); wire('free', 0, 'flush');

const { oscreceiveudpport: _oldPort, parameters: _oldParameters, ...shell } = base;
writePatch(process.argv[3], { patcher: {
  ...shell, rect: [80, 80, 720, 1700], openrect: [0, 0, 305, 166],
  openinpresentation: 1, boxes, lines,
  parameters: { packet: ['RC MIDI Packet v2', 'RC MIDI Packet v2', 0],
    parameterbanks: {}, inherited_shortname: 1 },
} }, 'midi');
console.log('Built network-free MIDI Receiver v2.2 (SDK Notes armed after load)');
