// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The take-lane list inside REC.
//
// One expandable list shows the take lanes and the clips of exactly one REC
// track, as Live reports them. The names are native: the phone never invents
// a take, never guesses a lane and never orders takes by time.
//
// The list is read on demand only. The REC page's own polling never asks
// for it, so an idle surface pays nothing for an open list.
//
// A mark is a name change on one chosen clip and nothing else. The clip is
// addressed by the reference the catalog handed out, never by a guess, and a
// mark is never retried and never rolled back.
(function (root) {
  'use strict';

  const t = (key, params) => root.RcSurfaceI18n?.t('rec.' + key, params) || key;
  /** The language is part of every rendered signature: a language change
   * must repaint the labels even when nothing else moved. */
  const locale = () => root.RcSurfaceI18n?.getLocale?.() || '';
  const ELEMENT_IDS = Object.freeze([
    'rec-takes-track', 'rec-takes-reload', 'rec-takes-status', 'rec-takes-list',
    'rec-takes-target', 'rec-take-good', 'rec-take-review', 'rec-take-clear',
    'rec-takes-back', 'rec-takes-next', 'rec-takes-page',
  ]);
  const MARK_ACTIONS = Object.freeze([
    ['rec-take-good', 'good'], ['rec-take-review', 'review'], ['rec-take-clear', null],
  ]);

  /** Bar and beat when the meter is known, labeled beats otherwise. */
  function positionLabel(time, meter) {
    if (!Number.isFinite(time)) return '?';
    const numerator = meter && meter.numerator, denominator = meter && meter.denominator;
    if (Number.isInteger(numerator) && numerator > 0 && [1, 2, 4, 8, 16, 32].includes(denominator)) {
      const units = time * denominator / 4;
      const bar = Math.floor(units / numerator) + 1;
      const beat = Math.round((units % numerator + 1) * 1000) / 1000;
      return bar + '.' + beat;
    }
    return Math.round(time * 1000) / 1000 + ' ' + t('beats');
  }

  /** An honest failure text: the reason when it is known, Live otherwise. */
  function reason(error) {
    const code = String((error && error.message) || error || '').match(/REC:([A-Z_]+)/)?.[1];
    const translated = code ? t('reason.' + code) : '';
    return translated && translated !== 'rec.reason.' + code ? translated : t('checkLive');
  }

  /** The world the list belongs to: the connection, the scope and the role.
   * A change of any of them drops the list: nothing is read and nothing is
   * written until the user chooses again. */
  function worldKey(view) {
    if (!view) return '';
    const scope = view.state && view.state.scope;
    return [view.connectionEpoch, scope || '', view.role || ''].join('|');
  }

  /**
   * The list of one track's take lanes.
   *
   * It keeps its own small state: the track the user chose, the page that
   * was read, the clip that is chosen and the token that retires an old
   * reply. Nothing here is inferred from Live: every name comes from the
   * catalog, every position from the clip's own span.
   */
  class TakeList {
    constructor(options) {
      this.client = options.client;
      this.doc = options.doc;
      this.els = options.els;
      this.selected = null;
      this.catalog = null;
      this.clip = null;
      this.cursor = { laneOffset: 0, clipOffset: 0 };
      this.history = [];
      this.token = 0;
      this.pending = false;
      this.status = null;
      this.world = '';
      this.trackSignature = '';
      this.listSignature = '';
      this.focus = root.RcRecordingTakesFocus ? new root.RcRecordingTakesFocus.Focus() : null;
      this.markToken = 0;
    }

    bind() {
      const track = this.els['rec-takes-track'];
      if (track) track.addEventListener('change', () => this.chooseTrack());
      const reload = this.els['rec-takes-reload'];
      if (reload) reload.addEventListener('click', () => this.reload());
      const back = this.els['rec-takes-back'];
      if (back) back.addEventListener('click', () => this.back());
      const next = this.els['rec-takes-next'];
      if (next) next.addEventListener('click', () => this.next());
      for (const [id, mark] of MARK_ACTIONS) {
        const button = this.els[id];
        if (button) button.addEventListener('click', () => this.mark(mark));
      }
    }

    /** The track the user chose, if Live still shows exactly that track. */
    currentTrack(view) {
      if (!this.selected) return null;
      const tracks = (view && view.state && view.state.tracks) || [];
      const found = tracks.find(track => track.index === this.selected.index
        && track.id === this.selected.id && track.name === this.selected.name);
      return found || null;
    }

    /** An empty choice clears the selection: it reads nothing, it writes
     * nothing, and it never falls back to the first track. */
    chooseTrack() {
      const select = this.els['rec-takes-track'];
      if (!select) return;
      const value = select.value;
      const view = this.client.view();
      const tracks = (view && view.state && view.state.tracks) || [];
      const track = value === '' ? null : tracks.find(item => item.index === Number(value));
      if (!track) { this.forget(); this.status = { text: t('takesChooseTrack') }; this.render(); return; }
      this.selected = { index: track.index, id: track.id, name: track.name };
      this.history = [];
      this.catalog = null;
      this.read({ laneOffset: 0, clipOffset: 0 });
    }

    reload() {
      if (!this.selected) return;
      this.read(this.cursor);
    }

    next() {
      const next = this.catalog && this.catalog.page && this.catalog.page.next;
      if (!next) return;
      this.history.push({ laneOffset: this.cursor.laneOffset, clipOffset: this.cursor.clipOffset });
      this.read({ laneOffset: next.laneOffset, clipOffset: next.clipOffset });
    }

    back() {
      const previous = this.history.pop();
      if (!previous) return;
      this.read(previous);
    }

    /** Drop everything the list knows: the selection, the page, the clip and
     * every pending reply. A pending note is retired with it: the write may
     * still land in Live, but it can no longer report success here. */
    forget() {
      this.cancelNote();
      this.token += 1;
      this.pending = false;
      this.selected = null;
      this.catalog = null;
      this.clip = null;
      this.focus?.clear();
      this.history = [];
      this.cursor = { laneOffset: 0, clipOffset: 0 };
    }

    /** The target changed under a pending note. A quiet one keeps the request. */
    cancelNote(quiet) {
      this.markToken += 1;
      if (quiet && this.pending) return;
      if (typeof this.client.cancelData === 'function') this.client.cancelData();
    }

    /** One explicit read of one exact page of one exact track. A read that
     * follows a confirmed note keeps that note's status while it runs. */
    read(cursor, keepStatus = false) {
      if (!keepStatus) this.status = null;
      const view = this.client.view();
      const track = this.currentTrack(view);
      const scope = view && view.state && view.state.scope;
      if (!track || !scope) { this.clearList(t('takesChooseTrack')); return; }
      const request = {
        scope,
        track: { index: track.index, id: track.id, name: track.name },
        laneOffset: cursor.laneOffset,
        clipOffset: cursor.clipOffset,
      };
      const token = ++this.token;
      this.pending = true;
      this.clip = null;
      this.cancelNote();
      this.render();
      this.client.command('getRecordingTakes', request).then(
        result => this.accepted(token, result),
        error => this.failed(token, error),
      );
    }

    /** A new page replaces the old one. No row is chosen for the user: the
     * clip under a new page is never the clip under the old one. */
    accepted(token, result) {
      if (token !== this.token) return;
      this.pending = false;
      const view = this.client.view();
      const scope = view && view.state && view.state.scope;
      if (!result || !scope || result.scope !== scope) { this.clearList(t('checkLive')); return; }
      if (!this.sameTrack(result.track)) { this.clearList(t('takesStale')); return; }
      this.catalog = result;
      if (result.page) this.cursor = { laneOffset: result.page.laneOffset, clipOffset: result.page.clipOffset };
      this.render();
    }

    failed(token, error) {
      if (token !== this.token) return;
      this.pending = false;
      this.clearList(reason(error));
    }

    sameTrack(track) {
      if (!this.selected || !track) return false;
      return track.index === this.selected.index && track.id === this.selected.id
        && track.name === this.selected.name;
    }

    /** Drop the list, keep the chosen track: the user may read it again. */
    clearList(status) {
      this.token += 1;
      this.pending = false;
      this.catalog = null;
      this.clip = null;
      if (status) this.status = { text: status };
      this.render();
    }

    /** A renamed or reordered track invalidates the list: the user must
     * read it again and choose again. A new connection, scope or role
     * invalidates it as well, and never reads or writes on its own. */
    checkWorld(view) {
      const key = worldKey(view);
      if (!this.world) { this.world = key; return; }
      if (key !== this.world) {
        this.world = key;
        const had = Boolean(this.selected || this.catalog);
        this.forget();
        if (had) this.status = { key: 'takesStale' };
        return;
      }
      if (!this.selected) return;
      if (this.currentTrack(view)) return;
      this.forget();
      this.status = { key: 'takesStale' };
    }

    render() {
      const view = this.client.view();
      this.checkWorld(view);
      this.renderTracks(view);
      this.renderList(view);
      this.renderActions(view);
      this.renderPaging();
      this.renderStatus();
      this.focus?.notify(this);
    }

    renderTracks(view) {
      const select = this.els['rec-takes-track'];
      if (!select) return;
      const tracks = (view && view.state && view.state.tracks) || [];
      const signature = JSON.stringify([locale(), tracks.map(track => [track.index, track.id, track.name])]);
      if (signature !== this.trackSignature) {
        this.trackSignature = signature;
        const options = [this.option('', t('takesChooseTrack'))];
        for (const track of tracks) options.push(this.option(String(track.index), track.name));
        select.replaceChildren(...options);
      }
      const value = this.selected ? String(this.selected.index) : '';
      if (select.value !== value) select.value = value;
      select.disabled = !tracks.length;
    }

    option(value, label) {
      const option = this.doc.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }

    renderList(view) {
      const list = this.els['rec-takes-list'];
      if (!list) return;
      const signature = this.listKey();
      if (signature === this.listSignature) return;
      this.listSignature = signature;
      const nodes = [];
      const lanes = this.visibleLanes();
      for (const lane of lanes) {
        nodes.push(this.laneNode(lane));
        for (const clip of lane.clips) nodes.push(this.clipNode(lane, clip, view));
      }
      if (!nodes.length) nodes.push(this.note(this.emptyText()));
      list.replaceChildren(...nodes);
    }

    /** What the empty list says: reading, nothing yet, or no lane at all. */
    emptyText() {
      if (this.pending) return t('takesReading');
      if (this.catalog) return t('takesNoLanes');
      return t('takesEmpty');
    }

    listKey() {
      const view = this.client.view();
      const meter = view && view.state && view.state.meter;
      return JSON.stringify([locale(), this.catalog, this.clip, this.focusState(), meter, this.pending]);
    }

    laneNode(lane) {
      const node = this.doc.createElement('div');
      node.className = 'rec-takes-lane';
      node.textContent = lane.name;
      return node;
    }

    /** One clip of one lane. Choosing it is a local act: it sends nothing. */
    clipNode(lane, clip, view) {
      const node = this.doc.createElement('button');
      node.type = 'button';
      node.className = 'rec-takes-clip';
      node.dataset.mark = clip.mark || 'none';
      const chosen = Boolean(this.clip && this.clip.clip.reference === clip.reference);
      node.setAttribute('aria-pressed', String(chosen));
      const name = this.doc.createElement('span');
      name.className = 'rec-takes-clip-name';
      name.textContent = clip.name;
      const mark = this.doc.createElement('span');
      mark.className = 'rec-takes-clip-mark';
      mark.textContent = clip.mark ? t(clip.mark) : t('takesNoMark');
      const meter = view && view.state && view.state.meter;
      const position = this.doc.createElement('span');
      position.className = 'rec-takes-clip-pos';
      position.textContent = positionLabel(clip.startTime, meter) + ' – ' + positionLabel(clip.endTime, meter);
      node.appendChild(name);
      node.appendChild(mark);
      node.appendChild(position);
      node.addEventListener('click', () => this.choose(lane, clip));
      return node;
    }

    /** One clip of the catalog. The choice is local: it sends nothing. It
     * is refused while a page is pending or when the clip is unknown. */
    choose(lane, clip) {
      if (this.pending || !(this.focus?.member(this.catalog, lane, clip) ?? true)) return;
      this.cancelNote();
      this.clip = { lane, clip };
      this.focus?.dropPhrase(this.clip);
      this.render();
    }

    note(text) {
      const node = this.doc.createElement('p');
      node.className = 'rec-takes-note';
      node.textContent = text;
      return node;
    }

    renderActions(view) {
      const chosen = this.chosenClip(view);
      const target = this.els['rec-takes-target'];
      if (target) target.textContent = chosen ? chosen.clip.name : '';
      const writable = this.canMark(view);
      for (const [id] of MARK_ACTIONS) {
        const button = this.els[id];
        if (button) button.disabled = !writable || !chosen;
      }
    }

    /** The chosen clip, but only while Live still shows that track. */
    chosenClip(view) {
      if (!this.clip) return null;
      return this.currentTrack(view) ? this.clip : null;
    }

    /** A mark needs a writable role, a stopped Live, no pending note and no
     * read in flight. */
    canMark(view) {
      if (!view || !view.noteWritable) return false;
      if (view.noteBusy) return false;
      return !this.pending;
    }

    renderPaging() {
      const back = this.els['rec-takes-back'];
      const next = this.els['rec-takes-next'];
      const page = this.els['rec-takes-page'];
      if (back) back.disabled = !this.history.length;
      const cursor = this.catalog && this.catalog.page && this.catalog.page.next;
      if (next) next.disabled = !cursor;
      if (page) page.textContent = this.catalog ? t('takesPage', { page: this.history.length + 1 }) : '';
    }

    renderStatus() {
      const status = this.els['rec-takes-status'];
      if (!status) return;
      status.textContent = this.status ? (this.status.text || t(this.status.key, this.status.params)) : '';
    }

    /** One explicit mark on the chosen clip and nothing else. */
    mark(mark) {
      const view = this.client.view();
      if (!this.canMark(view)) { this.status = { key: 'takesChooseClip' }; this.render(); return; }
      const track = this.currentTrack(view);
      const chosen = this.clip;
      if (!track || !chosen) { this.status = { key: 'takesChooseClip' }; this.render(); return; }
      const scope = view && view.state && view.state.scope;
      if (!scope) { this.status = { text: t('checkLive') }; this.render(); return; }
      const request = {
        scope,
        track: { index: track.index, id: track.id, name: track.name },
        lane: { index: chosen.lane.index, id: chosen.lane.id, name: chosen.lane.name },
        clip: {
          index: chosen.clip.index, id: chosen.clip.id, name: chosen.clip.name,
          startTime: chosen.clip.startTime, endTime: chosen.clip.endTime,
          reference: chosen.clip.reference,
        },
        mark,
      };
      const token = ++this.markToken;
      const target = { track: { ...request.track }, reference: request.clip.reference, name: request.clip.name };
      this.client.command('recordingMarkTake', request).then(
        result => this.marked(token, target, result),
        error => this.markFailed(token, target, error),
      );
    }

    /** A confirmed mark names the clip as it now is. The chosen row is
     * released and the same page is read again: the list shows what Live
     * holds, the confirmed name stays on screen and no row is chosen for
     * the user. */
    marked(token, target, result) {
      if (token !== this.markToken) return;
      if (!this.sameTarget(target)) return;
      const name = (result && result.clip && result.clip.name) || target.name;
      this.status = { key: 'takesMarked', params: { name } };
      this.clip = null;
      this.read(this.cursor, true);
    }

    /** An unconfirmed mark never retries and never rolls back: the target
     * is dropped. When the write was already issued its outcome is unknown,
     * so the name in Live is the only truth left. */
    markFailed(token, target, error) {
      if (token !== this.markToken) return;
      if (!this.sameTarget(target)) return;
      const unknown = root.RcRecordingData?.isUnknownOutcome?.(error);
      this.status = { text: unknown ? t('unknownOutcome') : reason(error) };
      if (this.clip && this.clip.clip.reference === target.reference) this.clip = null;
      this.render();
    }

    /** The mark belongs to the clip that was chosen when it was sent: a
     * later choice owns the list now. */
    sameTarget(target) {
      if (!this.selected || !target || !this.clip) return false;
      return this.selected.index === target.track.index && this.selected.id === target.track.id
        && this.selected.name === target.track.name && this.clip.clip.reference === target.reference
        && this.clip.clip.name === target.name;
    }

    /** Open the focus: one exact track, one exact range, one read. */
    openFocus(options) { return this.focus?.open(options, this) ?? false; }

    /** Close the focus: the pending read and the pending note go away. */
    closeFocus() { this.focus?.close(this); }

    /** The phrase to inspect: inside the range or inside the chosen clip. */
    setInspectionRange(range) { return this.focus?.setPhrase(range, this) ?? false; }

    /** The copied state of the focus. */
    focusState() { return this.focus?.state(this.clip) ?? null; }

    /** The lanes as they are shown: native order, only the clips of the range. */
    visibleLanes() { return this.focus?.visible(this.catalog) ?? this.catalog?.lanes ?? []; }

    /** The observer repaints its own DOM after the list painted. */
    setOnRender(callback) { this.focus?.setOnRender(callback); }
  }

  function setup(options) {
    const source = options || {};
    const doc = source.doc || root.document;
    const client = source.client;
    if (!doc || !client) return null;
    if (!doc.getElementById('rec-takes')) return null;
    const els = {};
    for (const id of ELEMENT_IDS) els[id] = doc.getElementById(id);
    const list = new TakeList({ client, doc, els });
    list.bind();
    list.render();
    return list;
  }

  root.RcRecordingTakes = Object.freeze({ setup, positionLabel });
})(typeof window !== 'undefined' ? window : globalThis);
