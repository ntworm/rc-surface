// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Arrangement rows UI: the lane of an ordinary track, the real catalog
// clips the bounded rows model read, the per-row actions and the explicit
// waveform preview. It never writes to Live.
//
// The DOM of a row is bound to the world it was painted for: the epoch, the
// scope, the role, the track and the very card and lane that hold it.
(function (root) {
  'use strict';

  const namespace = root.RcRecordingArrangement || (root.RcRecordingArrangement = {});
  const MAX_PREVIEW_RANGE = 128;
  const NEAR_VIEWPORT = 240;
  const MAX_STATES = 32;
  const MAX_PEAK_INTERVALS = 16;
  const MAX_PEAK_VALUES = 512;
  const BAR_BUTTONS = [
    ['load', 'arrangementLoad'], ['refresh', 'arrangementRefresh'], ['back', 'arrangementBack'],
    ['more', 'arrangementMore'], ['takes', 'arrangementTakes']
  ];

  function text(key, params) {
    const name = 'rec.' + key;
    const value = root.RcSurfaceI18n?.t(name, params);
    return value && value !== name ? value : name;
  }

  function isGroup(entry) {
    return Boolean(entry && entry.card && entry.card.dataset && entry.card.dataset.group === 'true');
  }

  function inViewport(card) {
    try {
      const rect = card.getBoundingClientRect && card.getBoundingClientRect();
      if (!rect) return true;
      // A hidden row has no box at all: it is never read and never painted.
      if (rect.width === 0 && rect.height === 0) return false;
      const height = Number(root.innerHeight) || 0;
      return rect.bottom > -NEAR_VIEWPORT && rect.top < height + NEAR_VIEWPORT;
    } catch { return true; }
  }

  function laneWidth(lane) {
    try {
      const rect = lane.getBoundingClientRect && lane.getBoundingClientRect();
      if (rect && rect.width) return rect.width;
      return Number(lane.clientWidth) || 0;
    } catch {
      return 0;
    }
  }

  /** The ordinary tracks the reader sees: a group owns no clips. */
  function visibleEntries(context) {
    const list = [];
    const cards = context.cards;
    if (!cards || typeof cards.forEach !== 'function') return list;
    cards.forEach((entry) => {
      if (!entry?.card || !entry.lane || !entry.track) return;
      if (isGroup(entry) || entry.card.hidden || !inViewport(entry.card)) return;
      list.push(entry);
    });
    return list;
  }

  /** The world a row belongs to: a new epoch, scope or role is a new world. */
  function worldKey(view) {
    const state = (view && view.state) || {};
    const epoch = state.connectionEpoch !== undefined ? state.connectionEpoch : (view && view.connectionEpoch);
    return [epoch, state.scope || '', state.role || (view && view.role) || ''].join('|');
  }

  function trackKey(track) { return track ? [track.index, track.id, track.name].join('|') : ''; }
  function clipKey(clip) { return clip ? clip.index + ':' + clip.id : ''; }

  /** The full identity of a clip: the key alone survives a rename. */
  function clipIdentity(clip) {
    return clip ? [clip.index, clip.id, clip.name, clip.startTime, clip.endTime].join('|') : '';
  }

  function geometry(context) {
    const value = context.getGeometry();
    if (!value || !Number.isFinite(value.trackWidth) || value.trackWidth <= 0) return null;
    if (!Number.isFinite(value.end) || value.end <= value.start) return null;
    return value;
  }

  /** One frame, one render: a local change never recurses into the render. */
  function schedule(context) {
    if (context.scheduled) return; context.scheduled = true;
    const run = () => { context.scheduled = false; context.onChange(); };
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run); else setTimeout(run, 0);
  }

  function createButton(context, className, title) {
    const button = context.doc.createElement('button');
    button.type = 'button'; button.className = className; button.textContent = title;
    return button;
  }

  function createState(context, entry) {
    context.sequence += 1;
    return { trackKey: trackKey(entry.track), trackId: String(entry.track.id),
      track: entry.track, entry, card: entry.card, lane: entry.lane, clips: new Map(),
      bar: null, container: null, containerOwned: false, status: null, buttons: {},
      wave: '', generation: 0, disposed: false, order: context.sequence, world: context.world };
  }

  /** The state of a row is rebuilt when the card or the lane changed. */
  function stateOf(context, entry) {
    const key = trackKey(entry.track);
    const found = context.states.get(key);
    if (found && found.card === entry.card && found.lane === entry.lane) {
      found.track = entry.track; found.entry = entry; found.order = ++context.sequence;
      return found;
    }
    if (found) disposeState(context, found);
    const state = createState(context, entry);
    context.states.set(key, state);
    return state;
  }

  /** A retired state leaves no widget and no pending answer behind. */
  function disposeState(context, state) {
    state.generation += 1; state.disposed = true; state.wave = '';
    if (state.bar && state.bar.parentNode) state.bar.parentNode.removeChild(state.bar);
    const container = state.container;
    if (state.containerOwned && container && container.parentNode) container.parentNode.removeChild(container);
    state.clips.forEach((item) => {
      if (item.node && item.node.parentNode) item.node.parentNode.removeChild(item.node);
    });
    context.states.delete(state.trackKey);
  }

  /** A new world retires every row before the new ones are painted. */
  function resetWorld(context, world) {
    if (context.world === world) return;
    context.world = world;
    Array.from(context.states.values()).forEach((state) => disposeState(context, state));
  }

  /** A row of a track that is gone leaves no state and no DOM behind. */
  function dropStaleStates(context) {
    const live = new Set(), cards = context.cards;
    if (cards && typeof cards.forEach === 'function') cards.forEach((entry) => { if (entry?.track) live.add(trackKey(entry.track)); });
    Array.from(context.states.values()).forEach((state) => { if (!live.has(state.trackKey)) disposeState(context, state); });
  }

  /** The bound drops the oldest rows: the ones that left the screen go
   * first, so a long session never starves the row in front of the user. */
  function boundStates(context) {
    const states = Array.from(context.states.values()).sort((a, b) => b.order - a.order);
    states.slice(MAX_STATES).forEach((state) => disposeState(context, state));
  }

  /** The entry that holds the row right now: a retired row reads no stale
   * card, no stale lane and no stale track. */
  function currentEntry(context, state) {
    if (state.disposed || state.world !== context.world) return null;
    const cards = context.cards;
    if (!cards || typeof cards.forEach !== 'function') return null;
    let found = null;
    cards.forEach((entry) => {
      if (!found && entry && entry.track && String(entry.track.id) === state.trackId) found = entry;
    });
    if (!found || trackKey(found.track) !== state.trackKey) return null;
    if (found.card !== state.card || found.lane !== state.lane) return null;
    return found;
  }

  function ensureBar(context, entry, state) {
    if (state.bar && state.bar.parentNode) return state.bar;
    const bar = context.doc.createElement('div');
    bar.className = 'rec-arrangement-bar';
    const status = context.doc.createElement('span');
    status.className = 'rec-arrangement-status'; status.setAttribute('role', 'status');
    bar.appendChild(status);
    const buttons = {};
    BAR_BUTTONS.forEach(([name, label]) => {
      const button = createButton(context, 'rec-arrangement-' + name, text(label));
      button.addEventListener('click', () => rowAction(context, state, name));
      bar.appendChild(button); buttons[name] = button;
    });
    entry.lane.appendChild(bar);
    state.bar = bar; state.status = status; state.buttons = buttons;
    return bar;
  }

  function rowAction(context, state, name) {
    const entry = currentEntry(context, state);
    if (!entry) return;
    const model = context.model;
    if (name === 'takes') { activate(context, state, null); return; }
    if (name === 'load') { model.load(entry.track); return; }
    if (name === 'refresh') { model.refresh(entry.track); return; }
    if (name === 'back') { model.back(entry.track); return; }
    model.more(entry.track);
  }

  /** A canvas and a hidden row never show their children: the clips need a
   * real container to be seen and to be clicked. */
  function hidden(node) {
    if (!node) return false;
    if (String(node.tagName || '').toUpperCase() === 'CANVAS') return true;
    return Boolean(node.getAttribute && node.getAttribute('aria-hidden') === 'true');
  }

  function ensureContainer(context, entry, state) {
    if (state.container && state.container.parentNode) return state.container;
    if (hidden(entry.lane)) return null;
    const found = entry.lane.querySelector ? entry.lane.querySelector('.rec-track-clips') : null;
    if (found && !hidden(found)) { state.container = found; state.containerOwned = false; return found; }
    const container = context.doc.createElement('div'); container.className = 'rec-track-clips';
    if (found && found.parentNode) found.parentNode.removeChild(found);
    entry.lane.appendChild(container);
    state.container = container; state.containerOwned = true;
    return container;
  }

  /** Only the generic texts reach the row: a raw code, a path or a message
   * of the model is never painted. */
  function statusLabel(snapshot) {
    const view = snapshot || {};
    if (view.status === 'loading') return text('arrangementLoading');
    if (view.status === 'error') return text('arrangementError');
    if (view.status === 'empty') return text('arrangementEmpty');
    if (view.status === 'ready') return text('arrangementPage', {count: (view.clips || []).length, page: (view.page?.offset || 0) / 64 + 1});
    return text('arrangementIdle');
  }

  function paintStatus(context, state, snapshot) {
    const view = snapshot || {};
    const label = statusLabel(view);
    const full = state.wave ? label + ' · ' + state.wave : label;
    if (state.status.textContent !== full) state.status.textContent = full;
    const buttons = state.buttons; const busy = view.status === 'loading';
    buttons.load.disabled = busy || view.status === 'ready';
    buttons.refresh.disabled = busy; buttons.back.disabled = busy || !(view.page && view.page.offset > 0);
    buttons.more.disabled = busy || !(view.page && Number.isFinite(view.page.next));
    buttons.takes.disabled = false;
    // The lane controls belong to the Arrangement: another destination owns none.
    BAR_BUTTONS.forEach(([name]) => { if (buttons[name]) buttons[name].hidden = !context.active; });
    BAR_BUTTONS.forEach(([name, key]) => { if (buttons[name]) buttons[name].textContent = text(key); });
  }

  function findClip(context, track, key) {
    let snapshot = null;
    try { snapshot = context.model.row(track); } catch { return null; }
    const clips = (snapshot && snapshot.clips) || [];
    for (const clip of clips) if (clipKey(clip) === key) return clip;
    return null;
  }

  /** The source of the row: the exact clip of the cached catalog of the
   * exact track of the world that is on screen. The predicate never reads
   * again, never polls and never takes an identity from a painted name. */
  function hasSource(context, track, clip) {
    const state = context.states.get(trackKey(track));
    const entry = state ? currentEntry(context, state) : null;
    if (!entry) return false;
    const found = findClip(context, entry.track, clipKey(clip));
    return Boolean(found) && clipIdentity(found) === clipIdentity(clip);
  }

  /** The seam receives the track and the clip of the latest page, never the
   * ones captured when the node was built. */
  function activate(context, state, key) {
    if (typeof context.focusHandler !== 'function') return;
    const entry = currentEntry(context, state);
    if (!entry) return;
    const clip = key ? findClip(context, entry.track, key) : null;
    context.focusHandler({track: entry.track, clip: clip ? {...clip} : null});
  }

  function createClip(context, state, clip) {
    const key = clipKey(clip);
    const node = context.doc.createElement('div');
    node.className = 'rec-arrangement-clip';
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    const name = context.doc.createElement('span');
    name.className = 'rec-arrangement-clip-name'; name.textContent = clip.name;
    const wave = createButton(context, 'rec-arrangement-clip-wave', text('arrangementWave'));
    wave.addEventListener('click', (event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      requestPreview(context, state, key);
    });
    node.appendChild(name); node.appendChild(wave);
    node.addEventListener('click', (event) => {
      const target = event && event.target;
      if (target && target === wave) return;
      activate(context, state, key);
    });
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target && event.target !== node) return;
      event.preventDefault();
      activate(context, state, key);
    });
    return {node, name, wave, key, clip, identity: clipIdentity(clip), peakBoxes: [], peakSigns: [], peakSign: ''};
  }

  /** The peaks sit inside the clip: their offset and width are measured. */
  function peakPlan(interval, clip, g) {
    const span = g.end - g.start;
    const left = (interval.startTime - clip.startTime) / span * g.trackWidth;
    const width = (interval.endTime - interval.startTime) / span * g.trackWidth;
    const values = (interval.peaks || []).slice(0, MAX_PEAK_VALUES).map((value) => Number(value) || 0);
    return {left, width, values, signature: left + '|' + width + '|' + values.join(',')};
  }

  function peakBox(context, plan) {
    const box = context.doc.createElement('div');
    box.className = 'rec-arrangement-peaks';
    box.style.left = plan.left + 'px'; box.style.width = Math.max(0, plan.width) + 'px';
    plan.values.forEach((value) => {
      const bar = context.doc.createElement('i');
      bar.className = 'rec-arrangement-peak';
      bar.style.height = Math.round(Math.abs(value) * 100) + '%';
      box.appendChild(bar);
    });
    return box;
  }

  /** One tracked set of boxes: the intervals are replaced only when they
   * really change, so a poll never grows the DOM. */
  function paintPeaks(context, state, clip, item, g) {
    const intervals = g ? context.model.peaksFor(state.track, clip) : [];
    const list = (intervals || []).slice(0, MAX_PEAK_INTERVALS);
    const plans = list.map((interval) => peakPlan(interval, clip, g));
    const signature = plans.map((plan) => plan.signature).join('|');
    if (item.peakSign === signature) return;
    item.peakSign = signature;
    plans.forEach((plan, index) => {
      const box = item.peakBoxes[index];
      if (box && item.peakSigns[index] === plan.signature) return;
      if (box && box.parentNode) box.parentNode.removeChild(box);
      const built = peakBox(context, plan); item.node.appendChild(built);
      item.peakBoxes[index] = built; item.peakSigns[index] = plan.signature;
    });
    for (let index = plans.length; index < item.peakBoxes.length; index += 1) {
      const box = item.peakBoxes[index];
      if (box && box.parentNode) box.parentNode.removeChild(box);
      item.peakBoxes[index] = null; item.peakSigns[index] = '';
    }
  }

  function paintClip(context, state, clip, item, g) {
    const identity = clipIdentity(clip);
    if (item.identity !== identity) { item.identity = identity; state.generation += 1; state.wave = ''; }
    item.clip = clip;
    if (item.name.textContent !== clip.name) item.name.textContent = clip.name;
    const label = String(clip.name);
    if (item.node.getAttribute('aria-label') !== label) item.node.setAttribute('aria-label', label);
    if (g) {
      const span = g.end - g.start;
      const left = (clip.startTime - g.start) / span * g.trackWidth;
      const width = (clip.endTime - clip.startTime) / span * g.trackWidth;
      item.node.style.left = left + 'px'; item.node.style.width = Math.max(2, width) + 'px';
    }
    paintPeaks(context, state, clip, item, g);
  }

  function paintClips(context, entry, state, snapshot, g) {
    const container = ensureContainer(context, entry, state);
    if (!container) return;
    if (g) { container.style.left = g.trackLeft + 'px'; container.style.width = g.trackWidth + 'px'; }
    const seen = new Set();
    const clips = (snapshot && snapshot.clips) || [];
    clips.forEach((clip) => {
      const key = clipKey(clip);
      seen.add(key);
      let item = state.clips.get(key);
      if (!item) { item = createClip(context, state, clip); state.clips.set(key, item); }
      if (!item.node.parentNode) container.appendChild(item.node);
      paintClip(context, state, clip, item, g);
    });
    state.clips.forEach((item, key) => {
      if (seen.has(key)) return;
      if (item.node.parentNode) item.node.parentNode.removeChild(item.node);
      state.clips.delete(key);
    });
  }

  /** The visible part of the clip: the lane origin is already visual. */
  function visibleRange(entry, g) {
    const span = g.end - g.start;
    const width = laneWidth(entry.lane);
    const from = g.start - g.trackLeft / g.trackWidth * span;
    const to = g.start + (width - g.trackLeft) / g.trackWidth * span;
    return {from, to};
  }

  /** A preview belongs to the generation that asked for it: a new world, a
   * new row or a new clip retires the pending answer. */
  function previewAlive(context, state, generation, key, identity) {
    if (state.disposed) return false;
    if (state.generation !== generation) return false;
    const entry = currentEntry(context, state);
    if (!entry || entry.lane !== state.lane || entry.card !== state.card) return false;
    const item = state.clips.get(key);
    return Boolean(item && item.identity === identity && item.node.parentNode);
  }

  async function requestPreview(context, state, key) {
    const entry = currentEntry(context, state);
    if (!entry) return;
    const clip = findClip(context, entry.track, key);
    const g = geometry(context);
    if (!clip || !g) return;
    const range = visibleRange(entry, g);
    const from = Math.max(clip.startTime, range.from);
    const to = Math.min(clip.endTime, range.to);
    if (!(to > from)) { state.wave = text('arrangementPreviewOutside'); schedule(context); return; }
    if (to - from > MAX_PREVIEW_RANGE) { state.wave = text('arrangementPreviewLimit'); schedule(context); return; }
    const generation = state.generation;
    const identity = clipIdentity(clip);
    state.wave = text('arrangementPreviewReading');
    schedule(context);
    const result = await context.model.waveform(entry.track, clip, from, to);
    if (!previewAlive(context, state, generation, key, identity)) return;
    state.wave = result ? text('arrangementPreviewRange', {from, to}) : text('arrangementPreviewUnavailable');
    schedule(context);
  }

  function paintRow(context, entry, state) {
    ensureBar(context, entry, state);
    const snapshot = context.model.row(state.track);
    paintStatus(context, state, snapshot);
    paintClips(context, entry, state, snapshot, geometry(context));
  }

  function updateRows(context, view, nextCards, options) {
    context.cards = nextCards || new Map();
    const config = options && typeof options === 'object' ? options : { active: Boolean(options) };
    // The focus owns the surface while it is open: the automatic row reads
    // pause, so no hidden row is read; a changed world still retires its rows.
    context.paused = Boolean(config.paused);context.active = Boolean(config.active);
    const list = context.paused ? [] : visibleEntries(context);
    context.model.update(view, list.map((entry) => entry.track), config.paused ? false : Boolean(config.active));
    resetWorld(context, worldKey(view));
    dropStaleStates(context);
    if (config.paused) return;
    list.forEach((entry) => { paintRow(context, entry, stateOf(context, entry)); });
    boundStates(context);
  }

  function geometryChanged(context) {
    // A paused surface owns no row geometry: a hidden row is never measured.
    if (context.paused) return;
    visibleEntries(context).forEach((entry) => { paintRow(context, entry, stateOf(context, entry)); });
  }

  /** The cancel retires the pending answers, the statuses and the peaks of
   * the rows: the transport is never held back by it. */
  function cancelRows(context) {
    context.model.cancel();
    Array.from(context.states.values()).forEach((state) => {
      state.generation += 1; state.wave = '';
      state.clips.forEach((item) => {
        item.peakBoxes.forEach((box) => { if (box && box.parentNode) box.parentNode.removeChild(box); });
        item.peakBoxes = []; item.peakSigns = []; item.peakSign = '';
      });
      if (!state.status) return;
      let label = null; try { label = statusLabel(context.model.row(state.track)); } catch { label = null; }
      if (label !== null && state.status.textContent !== label) state.status.textContent = label;
    });
  }

  function setupRows(options) {
    const config = options || {};
    const client = config.client;
    const doc = config.doc;
    const empty = {update() {}, geometryChanged() {}, extent() { return 0; }, setFocusHandler() {}, hasSource() { return false; }, cancel() {}};
    if (!client || !doc) return empty;
    // The bounded model owns the cache, the paging and the budgets.
    const context = {
      doc,
      model: namespace.createRowsModel({
        reads: client.arrangement, getView: () => client.view(), onChange: () => schedule(context)
      }),
      states: new Map(), cards: new Map(), sequence: 0, world: '', focusHandler: null, scheduled: false, paused: false, active: false,
      getGeometry: typeof config.getGeometry === 'function' ? config.getGeometry : () => null,
      onChange: typeof config.onChange === 'function' ? config.onChange : () => {}
    };
    return {
      update: (view, cards, update) => updateRows(context, view, cards, update),
      geometryChanged: () => geometryChanged(context),
      extent: () => context.model.extent(),
      setFocusHandler(handler) { context.focusHandler = typeof handler === 'function' ? handler : null; },
      hasSource: (track, clip) => hasSource(context, track, clip),
      cancel: () => cancelRows(context)
    };
  }

  namespace.setupRows = setupRows;
}(typeof globalThis !== 'undefined' ? globalThis : this));
