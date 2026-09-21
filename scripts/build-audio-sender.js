// Build the standalone RC-Audio-Sender.amxd (not Browser AUD / Native Track).
//
// Why a Max device at all: the Extensions SDK exposes no audio. It has track
// names, devices and parameters, and one offline arrangement render. There is
// no meter and no buffer, so nothing running in the extension can hear a
// track. Only something inside Live's audio path can, and that is a Max
// device.
//
// Cross-track messages stay inside Max. The chosen Receiver v2 explicitly
// enables Audio Sender input; other Receivers ignore this local bus by default.
//
// The patcher schema is copied from the receiver rather than written from
// memory: same fileversion, same appversion, same box shape.
import { readPatch, writePatch, listObjects } from './amxd.js';

const RECEIVER = process.argv[2];
const OUT = process.argv[3];

const base = readPatch(RECEIVER);

let nextId = 0;
const boxes = [];
const lines = [];

function obj(text, rect, { numinlets = 1, numoutlets = 1, outlettype } = {}) {
  nextId += 1;
  const id = `obj-${nextId}`;
  boxes.push({
    box: {
      id,
      maxclass: 'newobj',
      numinlets,
      numoutlets,
      outlettype: outlettype || new Array(numoutlets).fill(''),
      patching_rect: rect,
      text,
    },
  });
  return id;
}

function comment(text, rect, fontsize = 12, extra = {}) {
  nextId += 1;
  boxes.push({
    box: {
      id: `obj-${nextId}`,
      maxclass: 'comment',
      numinlets: 1,
      numoutlets: 0,
      patching_rect: rect,
      text,
      fontsize,
      ...extra,
    },
  });
}

function message(text, rect) {
  nextId += 1;
  const id = `obj-${nextId}`;
  boxes.push({
    box: {
      id,
      maxclass: 'message',
      numinlets: 2,
      numoutlets: 1,
      outlettype: [''],
      patching_rect: rect,
      text,
    },
  });
  return id;
}

function numberBox(rect, extra = {}) {
  nextId += 1;
  const id = `obj-${nextId}`;
  boxes.push({
    box: {
      id,
      maxclass: 'number',
      numinlets: 1,
      numoutlets: 2,
      outlettype: ['', 'bang'],
      parameter_enable: 0,
      patching_rect: rect,
      ...extra,
    },
  });
  return id;
}

function connect(from, outlet, to, inlet) {
  lines.push({ patchline: { destination: [to, inlet], source: [from, outlet] } });
}

// ---------------------------------------------------------------------------
// The signal path.

comment('RC AUDIO SENDER', [20, 8, 180, 20], 13, {
  presentation: 1,
  presentation_rect: [10, 10, 160, 18],
});
comment('Put this on the audio track you want to listen to. Put RC-Midi-Receiver.amxd '
  + 'on the MIDI track that should play. Enable Audio Sender input on that Receiver v2 only.',
  [20, 28, 460, 34], 10);
comment('LOCAL MAX / NO UDP', [200, 8, 140, 18], 10, {
  presentation: 1,
  presentation_rect: [10, 28, 150, 16],
});

const plugin = obj('plugin~', [20, 70, 60, 22], { numinlets: 1, numoutlets: 2, outlettype: ['signal', 'signal'] });
const plugout = obj('plugout~', [100, 70, 70, 22], { numinlets: 2, numoutlets: 0 });

// fzero~ reports Max messages, not MSP signals: frequency from outlet 0,
// analysis-buffer amplitude from outlet 1, and onset from outlet 2. It has no
// clarity output. Frequency goes straight to the note path; a separate
// periodic peak report owns the gate so silence can close and reset it.
const fzero = obj('fzero~ @threshold 0.015', [20, 110, 170, 22], {
  numinlets: 1,
  numoutlets: 3,
  outlettype: ['', '', 'bang'],
});
const peak = obj('peakamp~ 50', [220, 110, 90, 22], {
  numinlets: 1, numoutlets: 1, outlettype: [''],
});
const levelGate = obj('>= 0.015', [220, 190, 70, 22], { numinlets: 2, numoutlets: 1, outlettype: [''] });
const gateClosed = obj('sel 0', [300, 190, 50, 22], {
  numinlets: 2, numoutlets: 2, outlettype: ['bang', ''],
});
const resetPitch = message('set -1', [300, 230, 60, 22]);

// Hz to a MIDI note, rounded. split rejects estimates outside the musical
// range; clip would turn bad low estimates into a real A-1 note.
const ftom = obj('ftom', [20, 190, 50, 22], { numinlets: 1, numoutlets: 1, outlettype: [''] });
const round = obj('round 1', [20, 230, 70, 22], { numinlets: 2, numoutlets: 1, outlettype: [''] });
const noteRange = obj('split 21 108', [20, 270, 85, 22], { numinlets: 1, numoutlets: 2, outlettype: ['int', 'int'] });
const invalidCandidate = obj('t b b', [120, 270, 50, 22], {
  numinlets: 1, numoutlets: 2, outlettype: ['bang', 'bang'],
});
const resetCandidate = message('set -2', [185, 270, 60, 22]);

// A raw candidate must remain unchanged for 70 ms before it is committed.
// Brief estimator wobble therefore restarts the timer instead of becoming a
// note. A second change remembers committed notes so a rejected wobble cannot
// retrigger the same note when the estimator returns to it.
const gateNote = obj('gate', [20, 310, 60, 22], { numinlets: 2, numoutlets: 1, outlettype: [''] });
const candidateChanged = obj('change', [20, 350, 60, 22], { numinlets: 1, numoutlets: 1, outlettype: [''] });
const debounceTrigger = obj('t b b i', [20, 390, 65, 22], {
  numinlets: 1, numoutlets: 3, outlettype: ['bang', 'bang', 'int'],
});
const pendingNote = obj('i', [160, 430, 30, 22], { numinlets: 2, numoutlets: 1, outlettype: ['int'] });
const stopPending = message('stop', [90, 430, 50, 22]);
const stableDelay = obj('delay 70', [20, 430, 60, 22], { numinlets: 2, numoutlets: 1, outlettype: ['bang'] });
const committedChanged = obj('change', [20, 470, 60, 22], { numinlets: 1, numoutlets: 1, outlettype: [''] });

// Note on with a fixed velocity, and the previous note released first — the
// receiver plays a monophonic voice and two note-ons without a note-off in
// between leave it stuck.
const makenote = obj('makenote 100 200', [20, 510, 110, 22], { numinlets: 3, numoutlets: 2, outlettype: ['', ''] });
// Only the leftmost inlet of pack causes output. makenote sends right to left,
// so the velocity is already sitting in the cold inlet when the pitch arrives
// in the hot one and produces the pair.
const packMsg = obj('pack 0 0', [20, 550, 90, 22], { numinlets: 2, numoutlets: 1, outlettype: [''] });
// Standard MIDI byte list on an in-process Max bus; no network boundary.
const status = obj('prepend 144', [20, 590, 100, 22], { numinlets: 1, numoutlets: 1, outlettype: [''] });
const send = obj('send rc-midi-audio-v2', [20, 630, 190, 22], { numinlets: 1, numoutlets: 0, outlettype: [] });

comment('DETECTED NOTE', [200, 270, 100, 18], 10, {
  presentation: 1,
  presentation_rect: [10, 51, 96, 16],
});
const noteView = numberBox([200, 290, 60, 22], {
  presentation: 1,
  presentation_rect: [110, 48, 50, 22],
});

connect(plugin, 0, fzero, 0);
connect(plugin, 0, peak, 0);
connect(plugin, 0, plugout, 0);
connect(plugin, 1, plugout, 1);
connect(fzero, 0, ftom, 0);
connect(peak, 0, levelGate, 0);
connect(ftom, 0, round, 0);
connect(round, 0, noteRange, 0);
connect(noteRange, 0, gateNote, 1);
connect(noteRange, 1, invalidCandidate, 0);
connect(invalidCandidate, 1, stopPending, 0);
connect(invalidCandidate, 0, resetCandidate, 0);
connect(resetCandidate, 0, candidateChanged, 0);
connect(levelGate, 0, gateNote, 0);
connect(levelGate, 0, gateClosed, 0);
connect(gateClosed, 0, resetPitch, 0);
connect(gateClosed, 0, stopPending, 0);
connect(resetPitch, 0, candidateChanged, 0);
connect(resetPitch, 0, committedChanged, 0);
connect(gateNote, 0, candidateChanged, 0);
connect(candidateChanged, 0, debounceTrigger, 0);
connect(debounceTrigger, 2, pendingNote, 1);
connect(debounceTrigger, 1, stopPending, 0);
connect(stopPending, 0, stableDelay, 0);
connect(debounceTrigger, 0, stableDelay, 0);
connect(stableDelay, 0, pendingNote, 0);
connect(pendingNote, 0, committedChanged, 0);
connect(committedChanged, 0, makenote, 0);
connect(committedChanged, 0, noteView, 0);
connect(makenote, 1, packMsg, 1);
connect(makenote, 0, packMsg, 0);
connect(packMsg, 0, status, 0);
connect(status, 0, send, 0);

// Everything structural from the receiver — fileversion, appversion, the
// compatibility fields Live checks — and none of its own runtime state.
const herdado = { ...base.patcher };
delete herdado.oscreceiveudpport;
delete herdado.parameters;
const patch = {
  patcher: {
    ...herdado,
    rect: [100, 100, 560, 740],
    openrect: [0, 0, 180, 90],
    boxes,
    lines,
  },
};

const size = writePatch(OUT, patch, 'audio');
console.log('escrito:', OUT, size, 'bytes');
console.log('objetos:', listObjects(readPatch(OUT)).join(' | '));
