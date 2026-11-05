// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
(function (root) {
  'use strict';
  const t = (key, params) => root.RcSurfaceI18n?.t('rec.' + key, params) || key;

  /** The take focus is a local view of one track of the Arrangement. It
   * never writes to Live, never seeks and never plays: it shows the native
   * take lanes of that track and the local inspection of a whole clip or of
   * a phrase of it.
   *
   * The take list owns the native read and its adapter owns the focus: the
   * panel opens only after the adapter confirms the exact track and range.
   * A refused or missing adapter leaves every track row visible and opens
   * nothing: the focus is never a guess. The lanes and the selection are
   * read from the adapter alone, never from the painted DOM, so a localized
   * name is never an identity. */

  function readUi(doc) {
    return {
      root: doc.getElementById('rec-focus'),
      track: doc.getElementById('rec-focus-track'),
      clip: doc.getElementById('rec-focus-clip'),
      interval: doc.getElementById('rec-focus-interval'),
      back: doc.getElementById('rec-focus-all-tracks'),
      whole: doc.getElementById('rec-focus-whole'),
      phrase: doc.getElementById('rec-focus-phrase'),
      fields: doc.getElementById('rec-focus-phrase-fields'),
      start: doc.getElementById('rec-focus-phrase-start'),
      end: doc.getElementById('rec-focus-phrase-end'),
      listen: doc.getElementById('rec-focus-listen'),
      listenReason: doc.getElementById('rec-focus-listen-reason'),
      status: doc.getElementById('rec-focus-status'),
      note: doc.getElementById('rec-focus-note'),
      list: doc.getElementById('rec-takes-list'),
      details: doc.getElementById('rec-takes'),
      workspace: doc.querySelector('#page-recording .rec-workspace'), content: doc.getElementById('rec-content'),
    };
  }
  function emptyState() {
    return {
      open: false, track: null, clip: null, range: null, mode: 'whole',
      phrase: null, inspection: null, scope: '', epoch: 0, role: '', detailsOpen: false,
    };
  }
  function createContext(options) {
    const doc = options.doc || root.document;
    return {
      doc,
      client: options.client || null,
      takes: options.takes || null,
      getGeometry: typeof options.getGeometry === 'function' ? options.getGeometry : () => ({ start: 0, end: 0, trackWidth: 0, trackLeft: 0, scrollLeft: 0 }),
      onChange: typeof options.onChange === 'function' ? options.onChange : () => {},
      cancelVolumes: typeof options.cancelVolumes === 'function' ? options.cancelVolumes : () => {},
      hasSource: typeof options.hasSource === 'function' ? options.hasSource : null,
      ui: readUi(doc),
      state: emptyState(),
    };
  }
  const clientView = ctx => (ctx.client && typeof ctx.client.view === 'function' ? ctx.client.view() : {});
  const scopeOf = value => String(value?.scope ?? value?.session?.songId ?? '');
  const refOf = track => ({ index: track.index, id: track.id, name: track.name });
  const isRef = value => !!value && Number.isInteger(value.index) && typeof value.id === 'string' && typeof value.name === 'string';
  const clipRef = clip => ({ index: clip.index, id: clip.id, name: clip.name, startTime: clip.startTime, endTime: clip.endTime });
  const intervalText = (from, to) => t('focusInterval', { from: String(from), to: String(to) });
  function intervalOf(clip) {
    if (!clip || !Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime)) return null;
    if (!(clip.endTime > clip.startTime)) return null;
    return { startTime: clip.startTime, endTime: clip.endTime };
  }
  /** The adapter is the only source of the lanes, of the focus state and of
   * the selection. Without it there is no focus at all. */
  function adapterOf(ctx) {
    return ctx.takes && typeof ctx.takes.openFocus === 'function' ? ctx.takes : null;
  }
  function takeState(ctx) {
    const adapter = adapterOf(ctx);
    if (!adapter || typeof adapter.focusState !== 'function') return null;
    const state = adapter.focusState();
    return state && typeof state === 'object' ? state : null;
  }
  function laneData(ctx) {
    const adapter = adapterOf(ctx);
    if (!adapter || typeof adapter.visibleLanes !== 'function') return [];
    const lanes = adapter.visibleLanes();
    if (!Array.isArray(lanes)) return [];
    return lanes.map(lane => ({
      index: lane?.index, id: lane?.id, name: lane?.name,
      clips: Array.isArray(lane?.clips) ? lane.clips : [],
    }));
  }

  function showListen(ctx) {
    if (!ctx.ui.listen) return;
    const reason = t('focusListenUnavailable');
    ctx.ui.listen.disabled = true;
    ctx.ui.listen.title = reason;
    ctx.ui.listen.setAttribute('aria-label', reason);
    if (ctx.ui.listenReason && ctx.ui.listenReason.textContent !== reason) ctx.ui.listenReason.textContent = reason;
  }
  function showHeader(ctx) {
    const ui = ctx.ui;
    if (ui.track) ui.track.textContent = ctx.state.track.name;
    if (ui.clip) ui.clip.textContent = ctx.state.clip ? ctx.state.clip.name : t('focusAllTakes');
    if (ui.interval) ui.interval.textContent = ctx.state.range ? intervalText(ctx.state.range.startTime, ctx.state.range.endTime) : '';
  }
  function showFocus(ctx, message) {
    const ui = ctx.ui;
    if (ui.root) ui.root.hidden = false;
    if (ui.workspace) ui.workspace.dataset.focus = 'open';
    // The take list belongs to the focus: the overview of the Arrangement
    // shows no empty list of its own. The focus opens at the top of its content.
    if (ui.details) { ui.details.hidden = false; ui.details.open = true; }
    if (ui.content) ui.content.scrollTop = 0;
    showHeader(ctx);
    showListen(ctx);
    if (ui.status) ui.status.textContent = message || '';
  }
  function hideFocus(ctx) {
    const ui = ctx.ui;
    if (ui.root) ui.root.hidden = true;
    if (ui.workspace) ui.workspace.dataset.focus = 'close';
    if (ui.details) { ui.details.hidden = true; ui.details.open = Boolean(ctx.state.detailsOpen); }
    if (ui.status) ui.status.textContent = '';
    if (ui.note) ui.note.textContent = '';
  }
  function teardownFocus(ctx) {
    if (ctx.takes && typeof ctx.takes.setInspectionRange === 'function') ctx.takes.setInspectionRange(null);
    if (ctx.takes && typeof ctx.takes.closeFocus === 'function') ctx.takes.closeFocus();
    if (ctx.client && typeof ctx.client.cancelData === 'function') ctx.client.cancelData();
  }

  function focusTarget(detail) {
    const track = detail && detail.track;
    if (!isRef(track)) return null;
    const clip = detail.clip || null;
    const range = clip ? intervalOf(clip) : null;
    if (clip && !range) return null;
    return { track: refOf(track), clip: clip ? clipRef(clip) : null, range };
  }
  function sameTarget(state, target) {
    if (state.track.index !== target.track.index || state.track.id !== target.track.id) return false;
    if (!target.clip) return !state.clip;
    if (!state.clip) return false;
    return state.clip.index === target.clip.index && state.clip.id === target.clip.id && state.clip.name === target.clip.name;
  }
  /** The adapter opens the focus of one exact track and range. It answers
   * whether it did: a refusal opens nothing and leaves every row visible. */
  function openTakeFocus(ctx, target) {
    const adapter = adapterOf(ctx);
    if (!adapter) return false;
    if (!adapter.openFocus({ track: target.track, range: target.range })) return false;
    if (typeof adapter.setInspectionRange === 'function') adapter.setInspectionRange(null);
    return true;
  }
  /** Opening a focus retires the previous one: a second track never
   * inherits the selection, the phrase or the range of the first. */
  function openFocus(ctx, detail) {
    const target = focusTarget(detail);
    if (!target) return false;
    if (!adapterOf(ctx)) return false;
    if (ctx.state.open && sameTarget(ctx.state, target)) return true;
    const detailsOpen = ctx.state.open ? ctx.state.detailsOpen : Boolean(ctx.ui.details && ctx.ui.details.open);
    if (ctx.state.open) teardownFocus(ctx);
    ctx.state = emptyState();
    ctx.state.detailsOpen = detailsOpen;
    if (!openTakeFocus(ctx, target)) { hideFocus(ctx); ctx.onChange(); return false; }
    const current = clientView(ctx);
    ctx.state = {
      open: true, track: target.track, clip: target.clip, range: target.range,
      mode: 'whole', phrase: null, inspection: null,
      scope: scopeOf(current.state), epoch: current.connectionEpoch, role: current.role,
      detailsOpen,
    };
    ctx.cancelVolumes();
    showFocus(ctx);
    updatePhrase(ctx);
    paintFocus(ctx);
    ctx.onChange();
    return true;
  }
  function closeFocus(ctx) {
    if (!ctx.state.open) return false;
    const detailsOpen = ctx.state.detailsOpen;
    teardownFocus(ctx);
    ctx.state = emptyState();
    ctx.state.detailsOpen = detailsOpen;
    hideFocus(ctx);
    ctx.onChange();
    return true;
  }

  function identityChanged(ctx, current) {
    if (current.connectionEpoch !== ctx.state.epoch) return true;
    if (current.role !== ctx.state.role) return true;
    if (scopeOf(current.state) !== ctx.state.scope) return true;
    const tracks = current.state?.tracks;
    const found = Array.isArray(tracks)
      ? tracks.find(item => item && item.index === ctx.state.track.index && item.id === ctx.state.track.id)
      : null;
    if (!found) return true;
    if (typeof found.name === 'string' && found.name !== ctx.state.track.name) return true;
    return false;
  }
  function takeIdentityChanged(ctx) {
    const focus = takeState(ctx);
    if (!focus || !focus.track) return false;
    const ref = focus.track;
    if (ref.index !== ctx.state.track.index || ref.id !== ctx.state.track.id) return true;
    return typeof ref.name === 'string' && ref.name !== ctx.state.track.name;
  }
  /** The source clip is the one the cached catalog of the Arrangement still
   * holds: the rows answer with the exact clip of the current world. The
   * answer is a cache, never a live observation: a change in Live becomes
   * visible only after the catalog is read again. */
  function sourceChanged(ctx) {
    if (!ctx.state.clip) return false;
    if (typeof ctx.hasSource !== 'function') return false;
    return !ctx.hasSource(ctx.state.track, ctx.state.clip);
  }
  /** The focus is retired, never substituted: a different scope, role,
   * epoch or track identity closes it. */
  function retired(ctx, current) {
    if (!ctx.state.open) return false;
    if (identityChanged(ctx, current)) return true;
    if (takeIdentityChanged(ctx)) return true;
    return sourceChanged(ctx);
  }

  /** The lanes are the ones the take list already drew: they are wrapped
   * into rows, never copied, so every click still reaches the same clip. */
  function rebuildLanes(ctx) {
    const list = ctx.ui.list;
    if (!list) return;
    const children = Array.from(list.children);
    const headers = children.filter(node => node.classList && node.classList.contains('rec-takes-lane'));
    if (!headers.length) return;
    const groups = [];
    let current = null;
    for (const node of children) {
      if (node.classList && node.classList.contains('rec-takes-lane')) {
        current = { header: node, clips: [] };
        groups.push(current);
      } else if (current) {
        current.clips.push(node);
      }
    }
    const rows = groups.map(group => laneRow(ctx, group));
    list.replaceChildren(...rows);
  }
  function laneRow(ctx, group) {
    const row = ctx.doc.createElement('div');
    row.className = 'rec-focus-lane';
    const axis = ctx.doc.createElement('div');
    axis.className = 'rec-focus-axis';
    const clips = ctx.doc.createElement('div');
    clips.className = 'rec-focus-clips';
    axis.appendChild(clips);
    row.appendChild(group.header);
    row.appendChild(axis);
    for (const clip of group.clips) clips.appendChild(clip);
    return row;
  }
  function positionClips(ctx, holder, lane, geometry) {
    const start = Number(geometry.start) || 0;
    const span = (Number(geometry.end) || 0) - start;
    const width = Number(geometry.trackWidth) || 0;
    const buttons = Array.from(holder.querySelectorAll('.rec-takes-clip'));
    buttons.forEach((button, index) => {
      const clip = lane && lane.clips ? lane.clips[index] : null;
      if (!clip) return;
      const from = Number(clip.startTime);
      const to = Number(clip.endTime);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;
      const label = button.querySelector('.rec-takes-clip-pos');
      if (label) label.textContent = intervalText(from, to);
      button.title = String(clip.name || '') + ' · ' + intervalText(from, to);
      if (!(span > 0) || !(width > 0)) return;
      // The holder carries the measured origin of the ruler: a take and a
      // marker of the same time share one position.
      button.style.left = ((from - start) / span * width) + 'px';
      button.style.width = Math.max(2, (to - from) / span * width) + 'px';
    });
  }
  function paintRange(ctx, holder, geometry) {
    let box = holder.querySelector('.rec-focus-range');
    const range = ctx.state.inspection;
    const start = Number(geometry.start) || 0;
    const span = (Number(geometry.end) || 0) - start;
    const width = Number(geometry.trackWidth) || 0;
    if (!range || !(span > 0) || !(width > 0)) { if (box) box.remove(); return; }
    if (!box) {
      box = ctx.doc.createElement('div');
      box.className = 'rec-focus-range';
      holder.appendChild(box);
    }
    box.style.left = ((range.startTime - start) / span * width) + 'px';
    box.style.width = Math.max(2, (range.endTime - range.startTime) / span * width) + 'px';
  }
  function positionLanes(ctx) {
    const list = ctx.ui.list;
    if (!list) return;
    const geometry = ctx.getGeometry() || {};
    const lanes = laneData(ctx);
    const rows = Array.from(list.querySelectorAll('.rec-focus-lane'));
    rows.forEach((row, index) => {
      const axis = row.querySelector('.rec-focus-axis');
      const holder = row.querySelector('.rec-focus-clips');
      if (!axis || !holder) return;
      // The holder carries the measured axis of the ruler: the same origin
      // and the same width, so the take lanes and the markers share one
      // time line and one scroll.
      holder.style.left = (Number(geometry.trackLeft) || 0) + 'px';
      holder.style.width = (Number(geometry.trackWidth) || 0) + 'px';
      positionClips(ctx, holder, lanes[index] || null, geometry);
      paintRange(ctx, holder, geometry);
    });
  }
  function paintFocus(ctx) {
    if (!ctx.state.open || !ctx.ui.list) return;
    rebuildLanes(ctx);
    positionLanes(ctx);
  }

  /** The range the adapter holds for the focus, or null. */
  function heldRange(ctx) {
    const focus = takeState(ctx);
    if (!focus) return null;
    return focus.inspectionRange || null;
  }

  /** The take the adapter has chosen, or null. */
  function chosenClip(ctx) {
    const focus = takeState(ctx);
    if (!focus || !focus.selection || !focus.selection.clip) return null;
    return focus.selection.clip;
  }

  /** True when the chosen take really holds the range. */
  function insideClip(clip, range) {
    if (!clip || !range) return false;
    if (!Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime)) return false;
    return range.startTime >= clip.startTime && range.endTime <= clip.endTime;
  }

  /** The adapter owns the inspection range of the focus. When it drops the
   * phrase of a previous take, the outline and the phrase fields go with
   * it: the local view follows the adapter and never the other way round.
   * The REC range and the transport are never touched here. */
  function syncInspection(ctx) {
    if (ctx.state.mode !== 'phrase') return false;
    const local = ctx.state.inspection;
    if (!local) return false;
    const held = heldRange(ctx);
    if (held && held.startTime === local.startTime && held.endTime === local.endTime) return false;
    if (insideClip(chosenClip(ctx), local)) return false;
    ctx.state.mode = 'whole';
    if (ctx.ui.start) ctx.ui.start.value = '';
    if (ctx.ui.end) ctx.ui.end.value = '';
    applyRange(ctx, null);
    updatePhrase(ctx);
    return true;
  }

  /** Choosing a take is a local outline: it never sends a request. The
   * chosen take is the exact one of the adapter: the lane and the clip are
   * matched by index and by id, never by one of them alone. */
  function selectedClip(ctx, lanes, laneRef, clipRefValue) {
    if (!laneRef || !clipRefValue) return null;
    const laneIndex = lanes.findIndex(lane => lane && laneRef.index === lane.index && laneRef.id === lane.id);
    if (laneIndex < 0) return null;
    const clips = lanes[laneIndex].clips || [];
    const clipIndex = clips.findIndex(clip => clip && clipRefValue.index === clip.index && clipRefValue.id === clip.id);
    if (clipIndex < 0) return null;
    return { lane: laneIndex, clip: clipIndex };
  }
  function updateSelection(ctx) {
    const list = ctx.ui.list;
    if (!list) return;
    syncInspection(ctx);
    const focus = takeState(ctx);
    const selection = focus && focus.selection ? focus.selection : null;
    const chosen = selection && selection.clip ? selection.clip : null;
    const lanes = laneData(ctx);
    const found = selectedClip(ctx, lanes, selection ? selection.lane : null, chosen);
    const rows = Array.from(list.querySelectorAll('.rec-focus-lane'));
    rows.forEach(row => {
      const buttons = Array.from(row.querySelectorAll('.rec-takes-clip'));
      buttons.forEach((button, index) => {
        const on = !!found && found.lane === rows.indexOf(row) && found.clip === index;
        if (on) button.dataset.focusSelected = 'true';
        else delete button.dataset.focusSelected;
      });
    });
    const note = chosen ? t('focusNoteWhole') : '';
    if (ctx.ui.note && ctx.ui.note.textContent !== note) ctx.ui.note.textContent = note;
  }

  /** The phrase needs a context: the clip of the focus, or the take the
   * reader chose when the focus covers the whole track. */
  function phraseContext(ctx) {
    if (ctx.state.range) return ctx.state.range;
    const focus = takeState(ctx);
    const chosen = focus && focus.selection && focus.selection.clip ? focus.selection.clip : null;
    return intervalOf(chosen);
  }
  function updatePhraseButtons(ctx, ready) {
    if (ctx.ui.whole) ctx.ui.whole.setAttribute('aria-pressed', String(ctx.state.mode === 'whole'));
    if (!ctx.ui.phrase) return;
    ctx.ui.phrase.disabled = !ready;
    ctx.ui.phrase.setAttribute('aria-pressed', String(ctx.state.mode === 'phrase'));
    ctx.ui.phrase.title = ready ? '' : t('focusPhraseNeedsTake');
  }
  function updatePhraseFields(ctx, context) {
    if (ctx.ui.fields) ctx.ui.fields.hidden = ctx.state.mode !== 'phrase';
    if (!context) return;
    if (ctx.ui.start && ctx.state.mode === 'phrase' && !ctx.ui.start.value) ctx.ui.start.value = String(context.startTime);
    if (ctx.ui.end && ctx.state.mode === 'phrase' && !ctx.ui.end.value) ctx.ui.end.value = String(context.endTime);
  }
  function updatePhrase(ctx) {
    const context = phraseContext(ctx);
    updatePhraseButtons(ctx, !!context);
    updatePhraseFields(ctx, context);
  }
  function applyRange(ctx, range) {
    ctx.state.inspection = range;
    const adapter = adapterOf(ctx);
    if (adapter && typeof adapter.setInspectionRange === 'function') adapter.setInspectionRange(range);
    else if (ctx.client && typeof ctx.client.cancelData === 'function') ctx.client.cancelData();
    paintFocus(ctx);
  }
  function focusStatus(ctx, message) {
    if (ctx.ui.status) ctx.ui.status.textContent = message || '';
  }
  function setMode(ctx, mode) {
    const context = phraseContext(ctx);
    if (mode === 'phrase' && !context) { focusStatus(ctx, t('focusPhraseNeedsTake')); return; }
    ctx.state.mode = mode;
    focusStatus(ctx, '');
    if (mode !== 'phrase') { applyRange(ctx, ctx.state.range); updatePhrase(ctx); return; }
    if (ctx.ui.start) ctx.ui.start.value = String(context.startTime);
    if (ctx.ui.end) ctx.ui.end.value = String(context.endTime);
    applyRange(ctx, { startTime: context.startTime, endTime: context.endTime });
    updatePhrase(ctx);
  }
  function readPhrase(ctx) {
    if (ctx.state.mode !== 'phrase') return;
    const context = phraseContext(ctx);
    const from = Number(ctx.ui.start && ctx.ui.start.value);
    const to = Number(ctx.ui.end && ctx.ui.end.value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) {
      focusStatus(ctx, t('focusPhraseInvalid'));
      return;
    }
    if (context && (from < context.startTime || to > context.endTime)) {
      focusStatus(ctx, t('focusPhraseOutside'));
      return;
    }
    focusStatus(ctx, '');
    applyRange(ctx, { startTime: from, endTime: to });
  }

  function renderFocus(ctx, current) {
    if (!ctx.state.open) return;
    if (retired(ctx, current || clientView(ctx))) { closeFocus(ctx); return; }
    updateSelection(ctx);
    updatePhrase(ctx);
    paintFocus(ctx);
  }
  function bindFocus(ctx) {
    const ui = ctx.ui;
    if (ui.back) ui.back.addEventListener('click', () => closeFocus(ctx));
    if (ui.whole) ui.whole.addEventListener('click', () => { if (!ui.whole.disabled) setMode(ctx, 'whole'); });
    if (ui.phrase) ui.phrase.addEventListener('click', () => { if (!ui.phrase.disabled) setMode(ctx, 'phrase'); });
    if (ui.start) { ui.start.addEventListener('change', () => readPhrase(ctx)); ui.start.addEventListener('input', () => readPhrase(ctx)); }
    if (ui.end) { ui.end.addEventListener('change', () => readPhrase(ctx)); ui.end.addEventListener('input', () => readPhrase(ctx)); }
    const adapter = adapterOf(ctx);
    if (adapter && typeof adapter.setOnRender === 'function') adapter.setOnRender(() => { syncInspection(ctx); paintFocus(ctx); });
  }

  function setup(options) {
    const ctx = createContext(options);
    bindFocus(ctx);
    return {
      open: detail => openFocus(ctx, detail),
      close: () => closeFocus(ctx),
      render: current => renderFocus(ctx, current),
      geometryChanged: () => paintFocus(ctx),
      viewport: () => viewportOf(ctx),
      isOpen: () => ctx.state.open,
    };
  }
  function viewportOf(ctx) {
    if (!ctx.state.open || !ctx.ui.list) return null;
    const axis = ctx.ui.list.querySelector('.rec-focus-lane .rec-focus-axis');
    return axis && axis.getBoundingClientRect ? axis : null;
  }
  root.RcRecordingFocus = Object.freeze({ setup });
})(typeof window !== 'undefined' ? window : globalThis);
