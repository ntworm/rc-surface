// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// The focus of the take list.
//
// The focus is one exact track and one exact source range, with an
// optional phrase inside it. This file owns that state and the rules
// around it: what may be opened, which clips are shown and where a
// phrase may lie.
//
// It sends nothing and it reads nothing of its own. The list keeps the
// reads and the notes; the focus says what is in view and asks the list
// for the few steps that follow.
//
// The phone never invents a take and never guesses a lane: a lane keeps
// its native order, its native name and its native id, and only the
// clips that really overlap the range are shown.
(function (root) {
  'use strict';

  /** A track reference is exact: an index, an id and a name. */
  function isTrackRef(track) {
    return Boolean(track) && Number.isInteger(track.index) && track.index >= 0
      && typeof track.id === 'string' && typeof track.name === 'string';
  }

  /** A group track holds no takes of its own: it only groups other tracks.
   * The catalog may say that in more than one way, so every known
   * spelling is refused. */
  function isGroup(track) {
    if (!track) return false;
    if (track.isGroup === true || track.group === true) return true;
    const kind = track.type || track.kind || track.trackType;
    return typeof kind === 'string' && kind.toLowerCase() === 'group';
  }

  /** The exact track of the view, or null when Live shows another one. */
  function matchTrack(track, tracks) {
    if (!isTrackRef(track)) return null;
    const list = Array.isArray(tracks) ? tracks : [];
    const found = list.find(item => item && item.index === track.index
      && item.id === track.id && item.name === track.name);
    if (!found || isGroup(found)) return null;
    return { index: found.index, id: found.id, name: found.name };
  }

  /** A range is finite, nonnegative and ordered. */
  function isRange(range) {
    if (!range || typeof range !== 'object') return false;
    const start = range.startTime;
    const end = range.endTime;
    return Number.isFinite(start) && Number.isFinite(end)
      && start >= 0 && end >= 0 && start < end;
  }

  /** The copy of a range: only the two numbers are kept. */
  function copyRange(range) {
    if (!range || typeof range !== 'object') return null;
    return { startTime: range.startTime, endTime: range.endTime };
  }

  /** Does the range lie inside the bounds? */
  function contains(bounds, range) {
    if (!bounds || !range) return false;
    return range.startTime >= bounds.startTime && range.endTime <= bounds.endTime;
  }

  /** Does the clip overlap the range? */
  function overlaps(clip, range) {
    if (!clip || !range) return false;
    return clip.startTime < range.endTime && clip.endTime > range.startTime;
  }

  /** The lanes in native order with only the clips of the range. */
  function lanes(catalog, range) {
    const list = Array.isArray(catalog) ? catalog : [];
    return list.map(lane => ({
      ...lane,
      clips: (lane.clips || [])
        .filter(clip => !range || overlaps(clip, range))
        .map(clip => ({ ...clip })),
    }));
  }

  /** Live is there when the connection and the scope are there. */
  function connected(view) {
    if (!view || view.connected === false) return false;
    if (view.connectionEpoch === undefined || view.connectionEpoch === null) return false;
    const scope = view.state && view.state.scope;
    return Boolean(scope);
  }

  /** The exact track the focus may open on, or null: Live shows another
   * one, a group, or nothing at all. */
  function trackOf(options, view) {
    if (!options || !view || !connected(view)) return null;
    const found = matchTrack(options.track, (view.state && view.state.tracks) || []);
    if (!found) return null;
    if (options.range != null && !isRange(options.range)) return null;
    return found;
  }

  /**
   * The focus of one track.
   *
   * It holds the track, the source range and the optional phrase. The
   * source range never moves: it is the context the lanes are filtered
   * with. The phrase is local: a part of the range to look at, not a
   * part of the catalog to hide.
   */
  class Focus {
    constructor() {
      this.track = null;
      this.range = null;
      this.inspectionRange = null;
      this.onRender = null;
      this.notifying = false;
    }

    /** The copied state: the track, the range, the phrase and the clip. */
    state(selection) {
      if (!this.track) return null;
      const result = {
        track: { ...this.track },
        range: this.range ? { ...this.range } : null,
        inspectionRange: this.inspectionRange ? { ...this.inspectionRange } : null,
        selection: null,
      };
      if (selection) {
        result.selection = { lane: { ...selection.lane }, clip: { ...selection.clip } };
      }
      return result;
    }

    /** The lanes as they are shown: native order, only the clips of the range. */
    visible(catalog) {
      return lanes(catalog && catalog.lanes, this.range);
    }

    /** Where a phrase may lie: the range, or the chosen clip. */
    bounds(selection) {
      if (this.range) return this.range;
      const clip = selection && selection.clip;
      return clip ? { startTime: clip.startTime, endTime: clip.endTime } : null;
    }

    /** Open the focus: one exact track, one exact range, one read. */
    open(options, list) {
      const view = list.client.view();
      const found = trackOf(options, view);
      if (!found) return false;
      list.forget();
      list.selected = found;
      list.world = '';
      this.track = found;
      this.range = copyRange(options.range);
      this.inspectionRange = null;
      list.read({ laneOffset: 0, clipOffset: 0 });
      return true;
    }

    /** Close the focus: the pending read and the pending note go away. */
    close(list) {
      if (!this.track) return;
      this.clear();
      list.clip = null;
      list.token += 1;
      list.pending = false;
      list.cancelNote(true);
      list.render();
    }

    /** The phrase to inspect: inside the range or inside the chosen clip. */
    setPhrase(range, list) {
      const value = range == null ? null : copyRange(range);
      if (range != null && !isRange(value)) return false;
      if (value) {
        const bounds = this.bounds(list.clip);
        if (!bounds || !contains(bounds, value)) return false;
      }
      this.inspectionRange = value ? copyRange(value) : null;
      list.cancelNote(true);
      list.render();
      return true;
    }

    /** A phrase that no longer lies inside the bounds is dropped. */
    dropPhrase(selection) {
      if (!this.inspectionRange) return;
      const bounds = this.bounds(selection);
      if (bounds && contains(bounds, this.inspectionRange)) return;
      this.inspectionRange = null;
    }

    /** Is this lane and clip still an exact member of the catalog? */
    member(catalog, lane, clip) {
      if (!lane || !clip) return false;
      const list = (catalog && catalog.lanes) || [];
      const found = list.find(item => item && item.index === lane.index
        && item.id === lane.id && item.name === lane.name);
      if (!found) return false;
      return (found.clips || []).some(item => item.index === clip.index
        && item.id === clip.id && item.name === clip.name
        && item.reference === clip.reference);
    }

    /** The observer repaints its own DOM after the list painted. */
    setOnRender(callback) {
      this.onRender = typeof callback === 'function' ? callback : null;
    }

    /** Tell the observer once, after the list painted. */
    notify(list) {
      if (!this.onRender || this.notifying) return;
      this.notifying = true;
      try {
        this.onRender(this.state(list.clip));
      } finally {
        this.notifying = false;
      }
    }

    /** Drop the focus without touching the list. */
    clear() {
      this.track = null;
      this.range = null;
      this.inspectionRange = null;
    }
  }

  root.RcRecordingTakesFocus = Object.freeze({
    Focus, isTrackRef, isGroup, matchTrack, isRange, copyRange, contains, overlaps,
    lanes, connected, trackOf,
  });
})(typeof window !== 'undefined' ? window : globalThis);
