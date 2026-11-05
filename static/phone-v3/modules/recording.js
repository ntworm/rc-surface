// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
(function (root) {
  'use strict';
  const WRITES = new Set(['recordingReturnToArrangement','recordingSessionRecord','recordingSessionStop','recordingSelectTrack','recordingSetPoint','recordingLocator','recordingArm','recordingArmTracks','recordingTrackControl','recordingRenameTrack','recordingTrackVolume','recordingPrepare','recordingStart','recordingRecord','recordingSeekMarker','recordingStop','recordingAudition','recordingClick','recordingMark','recordingCreateMarker','recordingMarkTake']);
  const t = (key, params) => root.RcSurfaceI18n?.t('rec.' + key, params) || key;
  function formatVolumeDb(v) {
    // SDK exposes internal values, not Live's formatted dB scale.
    return typeof v==='number' && Number.isFinite(v) && v>=0 && v<=1 ? Math.round(v*100)+'%' : '?';
  }
  function positionToBeats(bar, beat, meter) {
    const numerator = meter?.numerator, denominator = meter?.denominator;
    if (!Number.isInteger(bar) || bar < 1 || !Number.isFinite(beat) || beat < 1 || !Number.isInteger(numerator) || numerator < 1
      || ![1,2,4,8,16,32].includes(denominator) || beat >= numerator + 1) throw Error('REC:POSITION');
    return ((bar - 1) * numerator + beat - 1) * 4 / denominator;
  }
  function beatsToPosition(beats, meter) {
    const units = beats * meter.denominator / 4;
    return { bar: Math.floor(units / meter.numerator) + 1, beat: Math.round((units % meter.numerator + 1) * 1000) / 1000 };
  }
  /** Callbacks only confirm the state the host observed. No queued/replayed
   * writes; STOP retires prior callbacks and remains available while busy. */
  /** The arrangement channel follows the coordinator. It is opened, closed
   * and cancelled with the same session, and its replies never become an
   * observation of the state. */
  function syncArrangement(arrangement, base) {
    if (!arrangement) return;
    arrangement.sync(base);
  }
  function sessionArrangement(arrangement, open, role) {
    if (!arrangement) return;
    arrangement.session(open, role);
  }
  function cancelArrangement(arrangement) {
    if (!arrangement) return;
    arrangement.cancel();
  }
  /** The arrangement rows UI is optional: the page works without it. */
  function createArrangementRows(options) {
    const factory = root.RcRecordingArrangement?.setupRows;
    if (typeof factory !== 'function') return null;
    return factory(options);
  }
  /** CLICK changes an observed metronome. A live connection, a recent
   * observation and a known boolean metronome are all required: an unknown,
   * stale or disconnected observation is never turned into a write. */
  function clickReady(state, writable, fresh) {
    const transport = state?.transport;
    const metronome = transport?.metronome;
    return writable === true && fresh === true
      && transport?.connected === true
      && metronome?.fresh === true && typeof metronome?.value === 'boolean';
  }
  function createClient({send, render = () => {}, timeoutMs = 12000}) {
    let connected = false, role = 'viewer', state = null, busy = false, generation = 0, error = null, readError = null, receivedAt = 0, reading = null, connectionEpoch=0, pendingCommand=null, clicking=false;
    const requests = root.RcRecordingRequests?.createRequests({send, timeoutMs, getView: () => view(), notify: () => notify()});
    // The data path answers questions about Live's objects. Its replies never
    // become an observation: they never touch the state, the generation, the
    // busy flag or the pending command of the coordinator. Its own note
    // paints the list at once, so a busy note disables the mark actions
    // before the reply arrives.
    const data = root.RcRecordingData?.createDataClient?.({send, timeoutMs, getView: () => view(), notify: () => notify()});
    // The arrangement path reads the native clip catalog and the waveform
    // previews. It shares the raw channel, the same view and the same note
    // of the coordinator: its replies are answers about Live's objects and
    // never become an observation of the state.
    const arrangement = root.RcRecordingArrangement?.createReads?.({send, timeoutMs, getView: () => view(), notify: () => notify()});
    const view = () => {
      let observed = state;
      if (state?.transport && Date.now() - receivedAt > 5000) {
        observed = {...state, transport:{...state.transport}};
        for (const key of ['isPlaying','recordMode','songTimeBeats','metronome']) observed.transport[key] = {...state.transport[key],fresh:false};
      }
      const fresh = Date.now()-receivedAt<=5000;
      const writable = connected && ['controller','admin'].includes(role);
      const base = {connected, role, state:observed, busy, clicking, connectionEpoch, pendingCommand, fresh, error:error || readError, writable, clickable: clickReady(observed, writable, fresh)};
      data?.sync(base);
      syncArrangement(arrangement, base);
      return {markerBusy:false, markerResult:null, markerError:null, ...base, ...requests?.view(base), ...data?.view(base)};
    };
    const notify = () => render(view());
    function session(open, nextRole = 'viewer') {
      generation++;connectionEpoch++;pendingCommand=null;clicking=false; connected = open; role = nextRole; state = null; busy = false; reading = null; error = null; readError = null;
      requests?.session(open, nextRole);
      data?.session(open, nextRole);
      sessionArrangement(arrangement, open, nextRole);
      notify();
    }
    function command(name, args = {}) {
      if (!connected || (WRITES.has(name) && !view().writable)) return Promise.reject(Error('REC:SESSION'));
      // The data path is routed before the coordinator path: its replies are
      // answers about Live's objects, never a new observation of the state.
      if (data?.handles?.(name)) return data.command(name, args);
      if (name === 'recordingClick') return click(args);
      if (name === 'recordingCreateMarker') return requests ? requests.createMarker(args) : Promise.reject(Error('REC:UNKNOWN'));
      const read = ['getRecordingState','getSessionRecordingState'].includes(name),stop=['recordingStop','recordingSessionStop'].includes(name);
      if (stop) { requests?.cancel('stop'); data?.cancel(); cancelArrangement(arrangement); }
      if (read && busy && pendingCommand!=='recordingRecord') return Promise.resolve(view().state);
      if (read && reading) return reading;
      if (busy && !read && !stop) return Promise.reject(Error('REC:BUSY'));
      if (!read) {generation++; reading = null;}
      const epoch = generation;
      if (!read) {busy = true; pendingCommand=name; error = null; notify();}
      const request = new Promise((resolve, reject) => {
        let settled = false;
        function finish(response) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (epoch !== generation) { reject(Error('REC:SESSION')); return; }
          // Retire passive reads issued before this action was confirmed: an
          // older reply cannot overwrite the action's observed result.
          if (!read) {generation++;reading=null;busy = false;pendingCommand=null;}
          if (response?.ok && response.result) {
            state = response.result; receivedAt = Date.now();
            if(read && error?.includes('REC:SESSION_STOP_PENDING') && state.session?.active===false)error=null;
            if(read) readError = state.error || null; else error = state.error || null;
            notify(); resolve(state);
          } else {
            const message = response?.error || 'REC:UNKNOWN';
            // An SDK write may have applied without confirmation, including
            // exclusive-arm side effects. Wait for observed arms before any
            // subsequent toggle; never retry the write or claim success.
            // A failed ARM write leaves every arm observation unknown, exactly as a
            // failed single ARM does: the host owns the arm state. The
            // invalidation happens here, after the generation check, so a late
            // error of a retired cohort can never clear the arms of a new Set
            // or of a confirmed STOP.
            if(!read && (name==='recordingArmTracks'||(name==='recordingTrackControl'&&args.property==='arm')) && state?.tracks)state={...state,tracks:state.tracks.map(track=>({...track,arm:null}))};
            if(!read && name==='recordingTrackVolume' && state?.tracks)state={...state,tracks:state.tracks.map(track=>track.index===args.track.index&&track.id===args.track.id?{...track,volume:null}:track)};
            if(read) readError = message; else error = message;
            notify(); reject(Error(message));
          }
        }
        const timer = setTimeout(() => finish({ok:false, error:'REC:UNKNOWN'}), timeoutMs);
        try { send(name, args, finish); } catch { finish({ok:false, error:'REC:UNKNOWN'}); }
      });
      if (read) {reading = request; request.finally(() => {if(reading === request) reading = null;}).catch(() => {});}
      return request;
    }
    /** The metronome is never locked by REC: CLICK neither waits for nor
     * retires a pending REC action, and only one click change is in flight. */
    function click(args) {
      if (clicking) return Promise.reject(Error('REC:BUSY'));
      // The metronome must be known: an unknown, stale or disconnected
      // observation is never turned into a write.
      if (!view().clickable) return Promise.reject(Error('REC:UNOBSERVED'));
      const epoch = connectionEpoch;
      clicking = true; notify();
      return new Promise((resolve, reject) => {
        let settled = false;
        function finish(response) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (epoch !== connectionEpoch) { reject(Error('REC:SESSION')); return; }
          clicking = false;
          if (response?.ok && response.result) { state = response.result; receivedAt = Date.now(); notify(); resolve(state); }
          else { const message = response?.error || 'REC:UNKNOWN'; error = message; notify(); reject(Error(message)); }
        }
        const timer = setTimeout(() => finish({ok:false, error:'REC:UNKNOWN'}), timeoutMs);
        try { send('recordingClick', args, finish); } catch { finish({ok:false, error:'REC:UNKNOWN'}); }
      });
    }
    // cancelData retires a pending note when the phone changes the target of
    // its own list. It touches nothing of the coordinator: the write may
    // still land in Live, but it can no longer report success here.
    return {view, session, command, requests, cancelData: () => Boolean(data?.cancel?.()), arrangement};
  }
  /** A marker activation is a tap, not a pan: a gesture that moved never
   * selects a marker. A keyboard activation is not a gesture at all: it
   * never inherits the pointer origin of another marker. The pan gesture
   * of a later step asks this guard before it selects anything. */
  function markerTapGuard(slop = 12) {
    let origin = null, keyboard = false;
    const moved = (event, point) => {
      const x = event && Number.isFinite(event.clientX) ? event.clientX : point.x;
      const y = event && Number.isFinite(event.clientY) ? event.clientY : point.y;
      return Math.abs(x - point.x) > slop || Math.abs(y - point.y) > slop;
    };
    return {
      down(marker, event) {
        keyboard = false;
        origin = event ? { marker, x: event.clientX || 0, y: event.clientY || 0 } : null;
      },
      /** The pointer state ends with its gesture: a cancelled pointer
       * never decides about a later activation. */
      cancel() { origin = null; keyboard = false; },
      /** A keyboard activation is remembered: it selects the marker even
       * when a pointer gesture on another marker came first. */
      key() { keyboard = true; },
      tap(marker, event) {
        // A keyboard activation is never a movement: it is always a tap.
        if (keyboard || (event && event.detail === 0 && !event.clientX && !event.clientY)) {
          origin = null; keyboard = false; return true;
        }
        if (!origin) return true;
        const blocked = origin.marker !== marker || moved(event, origin);
        origin = null;
        return !blocked;
      }
    };
  }
  // Arrangement marker geometry; no audio data or take-lane representation.
  function timelineBounds(locators, zoom = 1) {
    const end = Math.max(16, ...locators.map(cue => cue.time + 4));
    return {start:0, end, width:Math.max(1,Math.min(300,zoom)) * 100};
  }
  /** Bar/beat ruler drawn behind the Arrangement markers, from the observed
   * signature. Lines thin out with the zoom so they never smear together:
   * beats appear once they are 8 px apart, bar lines keep 6 px and bar
   * numbers 28 px, doubling the bar step until they fit. */
  function timelineGrid(bounds, meter, pixels) {
    const numerator = meter?.numerator, denominator = meter?.denominator, span = bounds?.end - bounds?.start;
    if (!Number.isInteger(numerator) || numerator < 1 || ![1,2,4,8,16,32].includes(denominator) || !(pixels > 0) || !(span > 0)) return [];
    const unit = 4 / denominator, bar = numerator * unit, perBeat = pixels / span;
    let barStep = 1, labelStep = 1;
    while (barStep * bar * perBeat < 6) barStep *= 2;
    while (labelStep < barStep || labelStep * bar * perBeat < 28) labelStep *= 2;
    const beats = unit * perBeat >= 8, ticks = [];
    for (let index = Math.ceil(bounds.start / bar / barStep) * barStep; index * bar <= bounds.end; index += barStep) {
      ticks.push({time:index * bar, kind:'bar', label:index % labelStep === 0 ? String(index + 1) : ''});
      for (let beat = 1; beats && beat < numerator && index * bar + beat * unit <= bounds.end; beat++) {
        ticks.push({time:index * bar + beat * unit, kind:'beat', label:''});
      }
    }
    return ticks;
  }
  const PRE_ROLL_KEY = 'rc-surface-v2.rec.preRollBars';
  function preRollPreference(storage) {
    try {
      const raw = storage?.getItem(PRE_ROLL_KEY);
      return ['0','1','2','4'].includes(raw) ? Number(raw) : 0;
    } catch { return 0; }
  }
  function setup() {
    const doc = root.document, page = doc.getElementById('page-recording');
    if (!page) return;
    const elements = Object.fromEntries(['rec-status','rec-track-grid','rec-start','rec-stop','rec-click','rec-return-arrangement','rec-arm-mode','rec-arm-all','rec-start-marker','rec-end-marker',
      'rec-passages','rec-passages-value','rec-end-field','rec-range-note','rec-timeline','rec-timeline-track','rec-grid','rec-markers','rec-cursor','rec-region','rec-zoom','rec-position',
      'rec-focus','rec-takes',
      'rec-pre-roll-inline','rec-pre-roll-value','rec-record-mode','rec-arrangement-mode','rec-clip-mode','rec-arrangement-panel','rec-range-row','rec-scene-row','rec-bars-slot','rec-quant-slot','rec-session-panel','rec-session-target','rec-session-prev','rec-session-next','rec-session-bars','rec-session-quantization','rec-session-grid',
      'rec-combined-band','rec-combined-editor','rec-combined-session','rec-combined-footer'].map(id => [id.slice(4),doc.getElementById(id)]));
    const el = id => elements[id];
    // The pure range selection owns the start and the end of the capture.
    // Without it the page owns no range at all: it never guesses an index.
    const rangeApi = root.RcRecordingRange;
    if (!rangeApi) {
      el('status').textContent = t('rangeUnavailable');
      el('start').disabled = true;
      // An inert surface: the page reads nothing and writes nothing.
      return {view:()=>({connected:false,writable:false,busy:false,fresh:false,state:null}),session(){},command:()=>Promise.reject(Error('REC:UNKNOWN'))};
    }
    let trackSignature='', markerSignature='', gridSignature='', rangeSignature='', refreshTimer=null, frame=null, cursorClock=null, paintedEnd=0;
    let zoom=1, bounds=timelineBounds([]), fixedPoint=null, passes=1;
    // One shared selection with real references. The selectors only adapt a
    // value to a reference; they never keep an index of their own.
    let selection=rangeApi.emptySelection(), selectionTouched=false, selectionScope='';
    // The catalog the open selectors display: an option means the marker
    // it shows, never the marker that sits at that index now.
    let optionCatalog=[];
    let preRollBars=0, userAdjustedZoom=false, autoZoomTimer=null;
    // The opening with Até STOP: the flag is armed until the view frames
    // the resolved start, and the reader's own view always wins over it.
    let stopFrameArmed=true, userAdjustedView=false;
    // The gesture of the reader on the ruler: a finger or a wheel that
    // really moved the scrollport owns the view from then on.
    let lastScrollLeft=0, pointerOnTimeline=false, lastPointerUp=0;
    let passesReported=null;
    let armMode='multi';
    let destination='record',sceneOffset=0,sceneTarget=null,sessionKey='',sessionSongId=null;
    let displayMeter=null,displaySongId=null;
    const sessionCells=new Map();
    try { preRollBars=preRollPreference(root.localStorage); } catch { /* Disabled browser storage uses OFF. */ }
    try {if(root.localStorage?.getItem('rc-surface-v2.rec.armMode')==='exclusive')armMode='exclusive';}catch{}
    const cards=new Map();
    // Every marker owns the node it represents: a reorder never moves a
    // marker to another node of the Set.
    const markerCues=new Map();
    // A collective ARM owns a bounded cohort: an unbounded or ambiguous set
    // is never written.
    const MAX_COLLECTIVE=256;
    // The group collapse is a local view choice: it never writes to Live.
    const collapsedGroups=new Set();
    let treeScope='';
    const client = createClient({send:(name,args,cb)=>root.sendPhoneCommand(name,args,cb),render});
    // A marker activation is a tap: the guard of a later pan gesture.
    const activation=markerTapGuard();
    // The take-lane list is its own module: it reads on demand only and it
    // never writes on its own.
    const takes = root.RcRecordingTakes?.setup?.({client, doc});
    // The arrangement rows UI reads the native clip catalog of the visible
    // ordinary tracks and paints the real clips of the lane. It owns no
    // state of its own: the bounded model keeps the cache and the paging,
    // and the take focus is a seam that a later step connects.
    const arrangementRows = createArrangementRows({
      client, doc,
      getGeometry: () => arrangementGeometry(),
      onChange: () => scheduleArrangementPaint()
    });
    let arrangementFrame=null;
    function scheduleArrangementPaint() {
      if (arrangementFrame!=null) return;
      const paint=()=>{arrangementFrame=null;render(client.view());};
      arrangementFrame=root.requestAnimationFrame?root.requestAnimationFrame(paint):setTimeout(paint,0);
    }
    // The take focus is a local view of one track: it reuses the take list
    // and the arrangement rows and never owns a state of its own. The rows
    // answer whether the source clip is still the one of their own cached
    // catalog: the focus never reads again for that answer.
    const focus = root.RcRecordingFocus?.setup?.({
      client, takes, doc,
      getGeometry: () => arrangementGeometry(),
      onChange: () => scheduleArrangementPaint(),
      cancelVolumes: () => cancelVolumes(),
      hasSource: arrangementRows?.hasSource ? (track, clip) => arrangementRows.hasSource(track, clip) : null,
    });
    arrangementRows?.setFocusHandler?.(detail => { focus?.open(detail); });
    const invoke = (name,args) => client.command(name,args).catch(()=>{});
    /** The observed marker catalog: the only source of a marker identity. */
    const markers=()=>client.view().state?.locators||[];
    /** The resolved selection: the real references, or an honest reason. */
    const resolved=()=>rangeApi.resolveSelection(selection,markers());
    /** The end of the range is bounded: a marker of the catalog or the next
     * one after the start. */
    const bounded=()=>selection.endMode!=='stop';
    /** The host owns the range while it captures, prepares, pre-rolls or
     * runs a Session: the local selection never redraws it. */
    function hostOwnsRange(state) {
      if(!state) return false;
      const phase=state.capture?.phase;
      return Boolean(state.pending)||Boolean(state.preRoll)||Boolean(state.attemptActive)
        ||Boolean(state.session?.active)||phase==='recording'||phase==='unconfirmed';
    }
    /** The range the surface shows: the frozen range of the host while it
     * owns the capture, the local selection otherwise. */
    function displayRange() {
      const state=client.view().state;
      if(hostOwnsRange(state)&&state?.range) return {start:state.range.start||null,end:state.range.end||null};
      const current=resolved();
      return {start:current.start,end:current.end};
    }
    /** The range is editable only while the page is idle: a pending
     * action, a pre-roll, an attempt or a running Session owns the
     * capture. */
    function rangeLocked(view) {
      const state=view.state;
      return Boolean(view.busy)||Boolean(state?.pending)||Boolean(state?.preRoll)
        ||Boolean(state?.attemptActive)||Boolean(state?.session?.active);
    }
    function canControl(view,property) {
      const state=view.state,transport=state?.transport;
      if(!view.writable||!view.fresh||view.busy||state?.trackPending||!transport?.connected)return false;
      return property!=='arm'||(!state.pending&&!state.preRoll&&!state.session?.active&&transport.isPlaying?.fresh&&transport.isPlaying.value===false&&transport.recordMode?.fresh&&transport.recordMode.value===false);
    }
    function armedTracks(view) {
      const tracks=view.state?.tracks;
      return view.fresh&&tracks?.every(track=>typeof track.canArm==='boolean'&&(track.canArm===false||typeof track.arm==='boolean'))?tracks.filter(track=>track.arm===true&&track.canArm===true):[];
    }
    const canRename=view=>canControl(view,'arm') && !view.state?.attemptActive;
    const sessionTargets=view=>{
      const session=view.state?.session,tracks=armedTracks(view);
      if(!session || !sceneTarget || !tracks.length || !session.scenes.some(scene=>scene.index===sceneTarget.index&&scene.id===sceneTarget.id&&scene.name===sceneTarget.name))return null;
      const targets=tracks.map(track=>{
        const row=session.rows.find(row=>row.track.index===track.index&&row.track.id===track.id&&row.track.name===track.name),slot=row?.slots.find(slot=>slot.index===sceneTarget.index);
        return row?.ready===true && slot && !slot.clip?{track:{index:track.index,id:track.id,name:track.name},slotId:slot.id}:null;
      });
      return targets.every(Boolean)?targets:null;
    };
    /** The modes are locked while the host owns the capture: a pending
     * action, a pre-roll, an attempt, a running Session or an observed
     * record mode. A switch is never forced during a capture. */
    function modeLocked(view) {
      const state=view.state||{};
      const transport=state.transport||{};
      const capture=state.capture||{};
      const session=state.session||{};
      const locks=[view.busy,state.pending,state.preRoll,state.attemptActive,session.active,
        capture.phase==='recording',capture.phase==='unconfirmed',transport.recordMode?.value===true];
      return locks.some(Boolean);
    }
    /** The local modes of the page. The Record mode is the default: it shows
     * the capture without the editor and never writes to the host. */
    function applyModeChrome(view) {
      if(page.dataset.recMode!==destination)page.dataset.recMode=destination;
      const locked=modeLocked(view);
      for(const mode of ['record','arrangement','clip']){
        const button=el(mode+'-mode');
        if(!button)continue;
        button.disabled=locked;
        button.setAttribute('aria-pressed',String(mode===destination));
      }
      const record=el('record-mode');
      const label=t('recordMode');
      if(record&&record.textContent!==label)record.textContent=label;
      const range=el('range-row');
      if(range)range.hidden=destination==='clip';
      // The context of the band follows the destination: the Record and the
      // Arrangement own the range of the capture and its zoom, the Clip
      // owns the native scene and its paging. The row that is not in use
      // is hidden and never leaves a gap behind.
      const scene=el('scene-row');
      if(scene)scene.hidden=destination!=='clip';
      if(el('bars-slot'))el('bars-slot').hidden=destination!=='clip';
      if(el('quant-slot'))el('quant-slot').hidden=destination!=='clip';
    }
    /** The focus owns the take lanes: the overview of the Arrangement shows
     * no empty list of its own. */
    function focusOpen() {
      return destination==='arrangement'&&Boolean(focus?.isOpen?.());
    }
    /** The take inspection belongs to the Arrangement alone: the Record and
     * the Clip never show the editor of a take, its details or its focus.
     * The focus owns its own open state: a closed focus is never unhidden
     * and an open one is never closed by the chrome. The ruler belongs to
     * the Record and the Arrangement; the Clip owns the Session context of
     * the same column of the combined band. */
    function applyEditorChrome() {
      const panel=el('arrangement-panel');
      if(panel)panel.hidden=destination==='clip';
      const sessionContext=el('combined-session');
      if(sessionContext)sessionContext.hidden=destination!=='clip';
      const open=focusOpen();
      const takesPanel=el('takes');
      if(takesPanel)takesPanel.hidden=!open;
      const focusPanel=el('focus');
      if(focusPanel)focusPanel.hidden=!open;
    }
    function renderSession(view) {
      const session=view.state?.session;
      el('session-panel').hidden=destination!=='clip';
      const locked=view.busy||Boolean(view.state?.pending)||Boolean(view.state?.attemptActive);
      for(const id of ['session-bars','session-quantization'])el(id).disabled=locked||!view.writable;
      el('session-prev').disabled=locked||sceneOffset===0;el('session-next').disabled=locked||sceneOffset+8>=(session?.totalScenes??0);
      if(sessionSongId!==session?.songId){sessionSongId=session?.songId;sceneTarget=null;}
      if(sceneTarget && !session?.scenes.some(scene=>scene.index===sceneTarget.index&&scene.id===sceneTarget.id&&scene.name===sceneTarget.name))sceneTarget=null;
      el('session-target').textContent=sceneTarget?(sceneTarget.index+1)+' · '+sceneTarget.name:t('chooseScene');
      if(!session)return;
      if(Number.isInteger(session.offset))sceneOffset=session.offset;
      const signature=JSON.stringify([session.songId,session.scenes,session.rows.map(row=>[row.track.index,row.track.id,row.track.name,row.slots.map(slot=>[slot.index,slot.id])])]);
      if(sessionKey!==signature) {
        sessionKey=signature;sessionCells.clear();const nodes=[];
        const label=text=>{const span=doc.createElement('span');span.className='rec-session-label';span.textContent=text;nodes.push(span);};
        label(t('scene'));session.rows.forEach(row=>label(row.track.name));
        for(const scene of session.scenes) {
          const choose=()=>{const current=client.view();if(current.busy||current.state?.pending||current.state?.attemptActive||!current.fresh)return;sceneTarget={...scene};render(current);};
          const button=doc.createElement('button');button.type='button';button.className='rec-session-label';button.dataset.scene=String(scene.index);button.textContent=(scene.index+1)+' · '+scene.name;button.addEventListener('click',choose);nodes.push(button);sessionCells.set('scene:'+scene.index,{button,scene});
          for(const row of session.rows) {
            const slot=row.slots.find(slot=>slot.index===scene.index),cell=doc.createElement('button');cell.type='button';cell.className='rec-session-cell';cell.addEventListener('click',choose);nodes.push(cell);
            sessionCells.set(row.track.index+':'+scene.index,{button:cell,scene,trackIndex:row.track.index,slotId:slot?.id});
          }
        }
        el('session-grid').style.gridTemplateColumns='120px repeat('+session.rows.length+',160px)';el('session-grid').replaceChildren(...nodes);
      }
      for(const entry of sessionCells.values()) {
        const selected=sceneTarget?.index===entry.scene.index,slot=entry.trackIndex===undefined?null:session.rows.find(row=>row.track.index===entry.trackIndex)?.slots.find(slot=>slot.index===entry.scene.index);
        entry.button.disabled=locked || !view.fresh || entry.trackIndex!==undefined&&!slot;
        entry.button.setAttribute('aria-pressed',String(selected));
        if(entry.trackIndex!==undefined){const label=slot?.clip?.name || t('emptySlot'),state=slot?.state||'unknown',text=label+' · '+t('sessionState.'+state);if(entry.button.textContent!==text)entry.button.textContent=text;entry.button.dataset.state=state;entry.button.title=text;}
      }
    }
    function editName(entry,index,id) {
      const view=client.view(),track=view.state?.tracks.find(track=>track.index===index&&track.id===id);
      if(entry.editor || !track || !canRename(view))return;
      const input=doc.createElement('input');input.type='text';input.className='rec-track-name-input';input.maxLength=128;
      input.value=track.name;input.setAttribute('aria-label',t('renameTrack'));
      const editor={input,expected:{index,id,name:track.name},pending:false};entry.editor=editor;
      const close=()=>{if(entry.editor!==editor)return;entry.editor=null;entry.name.replaceChildren();render(client.view());entry.name.focus?.();};
      input.addEventListener('keydown',event=>{
        if(!['Enter','Escape'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        if(event.key==='Escape' && !editor.pending){close();return;}
        if(event.key!=='Enter' || editor.pending || !canRename(client.view()))return;
        editor.pending=true;input.readOnly=true;
        client.command('recordingRenameTrack',{track:editor.expected,name:input.value}).then(close).catch(()=>{
          if(entry.editor===editor){editor.pending=false;input.readOnly=!canRename(client.view());}
        });
      });
      // Blur deliberately has no save behavior. Polling keeps this input and
      // its draft intact; only Enter sends the exact reference captured here.
      entry.name.replaceChildren(input);input.focus?.();input.select?.();
    }
    /** Every queued local MIX gesture stops at once: a mode change must not
     * leave a pending value that lands after the cards changed their mind. */
    function cancelVolumes() {
      for (const entry of cards.values()) entry.cancelVolume();
    }
    const trackKey = track => track.index+':'+track.id;
    const trackRef = track => ({index:track.index,id:track.id,name:track.name});
    /** The observed tree, read only from the snapshot: a group owns the
     * tracks that name it. Nothing is guessed from a position or a name. */
    function observedTree(tracks,valid) {
      const groups=tracks.filter(track=>track.isGroup===true);
      const byId=new Map(groups.map(group=>[String(group.id),group]));
      const children=new Map(),parent=new Map();
      for(const track of tracks) {
        const owner=valid?parentGroup(track,byId):null;
        if(!owner||owner===track)continue;
        parent.set(trackKey(track),owner);
        if(!children.has(trackKey(owner)))children.set(trackKey(owner),[]);
        children.get(trackKey(owner)).push(track);
      }
      return {groups,children,parent,roots:tracks.filter(track=>!parent.has(trackKey(track)))};
    }
    /** A group owns the tracks that name its exact handle. An unknown handle
     * owns nothing: a position is never a parent. */
    function parentGroup(track,byId) {
      if(!track.groupId)return null;
      return byId.get(String(track.groupId))||null;
    }
    /** The depth-first order of the observed tree. A collapsed group keeps
     * its children in the document; they are hidden locally. */
    function treeOrder(tracks,tree) {
      const order=[],seen=new Set();
      const visit=(track,depth)=>{
        if(depth>64||seen.has(trackKey(track)))return;
        seen.add(trackKey(track));order.push(track);
        for(const child of tree.children.get(trackKey(track))||[])visit(child,depth+1);
      };
      for(const root of tree.roots)visit(root,0);
      for(const track of tracks)visit(track,0);
      return order;
    }
    /** A track is visible while every group above it stays expanded. */
    function trackVisible(track,tree) {
      let owner=tree.parent.get(trackKey(track)),depth=0;
      while(owner&&depth++<64) {
        if(collapsedGroups.has(trackKey(owner)))return false;
        owner=tree.parent.get(trackKey(owner));
      }
      return true;
    }
    /** Every descendant of a group, transitively, with a visited cap. */
    function descendantsOf(group,tree) {
      const out=[],seen=new Set([trackKey(group)]),stack=[group];
      while(stack.length&&seen.size<256) {
        const current=stack.pop();
        for(const child of tree.children.get(trackKey(current))||[]) {
          if(seen.has(trackKey(child)))continue;
          seen.add(trackKey(child));out.push(child);stack.push(child);
        }
      }
      return out;
    }
    /** The collective ARM needs a fresh, stopped, known and idle tree. */
    function canArmCollective(view,group) {
      if(!canControl(view,'arm'))return false;
      const state=view.state;
      if(state?.trackTreeValid!==true)return false;
      if(state?.attemptActive)return false;
      if(typeof state?.scope!=='string'||!state.scope)return false;
      const cohort=collectiveCohort(view,group);
      return cohort.length>0&&cohort.every(track=>typeof track.arm==='boolean');
    }
    /** The exact cohort a collective ARM owns: unique, bounded and made of
     * the observed descendants of one group. */
    function collectiveCohort(view,group) {
      const state=view.state,tracks=state?.tracks||[];
      const tree=observedTree(tracks,state?.trackTreeValid===true);
      const pool=group?descendantsOf(group,tree):tracks;
      const seen=new Set(),cohort=[];
      for(const track of pool) {
        if(track.isGroup===true||track.canArm!==true)continue;
        const key=trackKey(track);
        if(seen.has(key))continue;
        seen.add(key);cohort.push(track);
        if(cohort.length>MAX_COLLECTIVE)return [];
      }
      return cohort;
    }
    /** The observed arm state of a collective target set. */
    function collectiveState(view,group) {
      const targets=collectiveCohort(view,group);
      const armed=targets.filter(track=>track.arm===true);
      const known=targets.every(track=>typeof track.arm==='boolean');
      const pressed=!targets.length?'false':!known?'mixed':armed.length===targets.length?'true':armed.length?'mixed':'false';
      return {targets,armed,known,pressed};
    }
    /** The current observed group, resolved on every click: a rename must
     * never leave a stale name in a collective write. */
    function currentGroup(view,index,id) {
      return view.state?.tracks.find(track=>track.index===index&&track.id===id&&track.isGroup===true)||null;
    }
    /** One collective ARM write. The host owns the arm state: nothing is
     * changed here before the host answers, and a failure is never retried. */
    function armCollective(view,group) {
      const current=group?currentGroup(view,group.index,group.id):null;
      if(group&&!current)return;
      if(!canArmCollective(view,current))return;
      const state=view.state,{targets}=collectiveState(view,current);
      if(!targets.length)return;
      const cohort=targets.map(trackRef).sort((a,b)=>a.index-b.index);
      const enabled=!(targets.every(track=>track.arm===true));
      client.command('recordingArmTracks',{
        scope:state.scope??null,
        group:current?trackRef(current):null,
        tracks:cohort,
        enabled,
        armMode,
      }).catch(()=>{});
    }
    // The ruler may grow when the catalog knows clips beyond the last
    // marker: the markers follow the measured axis.
    function paintMarkerAxis() {
      if (bounds.end===paintedEnd) return;
      paintedEnd=bounds.end;gridSignature='';
      for (const marker of el('markers').children) {
        const cue=markerCues.get(marker);
        if (cue) marker.style.left=percent(cue.time)+'%';
      }
    }
    // The badges of the ruler never cover each other: a badge that would
    // touch another one keeps its own place on the axis and loses its
    // text. The measurement is defensive: without a measured axis nothing
    // is marked and every badge keeps its own text.
    const REC_BADGE_W=76, REC_BADGE_GAP=2;
    /** The measured width of the axis: without it nothing is marked. */
    function measuredAxisWidth(track) {
      const rect=track.getBoundingClientRect?track.getBoundingClientRect():null;
      return rect&&rect.width?rect.width:0;
    }
    /** The place of a marker on the measured axis. */
    function markerAxisX(marker,width) {
      const left=parseFloat(marker.style.left);
      return Number.isFinite(left)?left/100*width:0;
    }
    /** The selected markers come first, the others after them. */
    function partitionMarkers(list) {
      const selected=[],others=[];
      for(const marker of list) {
        const pressed=marker.getAttribute?marker.getAttribute('aria-pressed'):'';
        (pressed==='true'?selected:others).push(marker);
      }
      return [selected,others];
    }
    function layoutMarkerLabels() {
      const track=el('timeline-track'),markers=el('markers');
      if(!track||!markers)return;
      const width=measuredAxisWidth(track);
      if(!width)return;
      const list=[...markers.children];
      for(const marker of list)marker.dataset.compact='false';
      const reserved=[];
      for(const group of partitionMarkers(list)) {
        const ordered=group.slice().sort((a,b)=>markerAxisX(a,width)-markerAxisX(b,width));
        for(const marker of ordered) {
          const x=markerAxisX(marker,width);
          // Two badges of 76 px touch when their centres are closer than
          // the width of a badge plus the gap of two pixels.
          const touches=reserved.some(seen=>Math.abs(seen-x)<REC_BADGE_W+REC_BADGE_GAP);
          if(touches)marker.dataset.compact='true';
          else reserved.push(x);
        }
      }
    }
    // The arrangement rows are read only while the Arrangement of the REC
    // page is the visible destination.
    function updateArrangementRows(view) {
      if (!arrangementRows) return;
      const active=destination==='arrangement'&&doc.body.dataset.page==='recording'&&!doc.hidden;
      // The focus owns the surface while it is open: the automatic row
      // reads pause, so the hidden rows are never read and the cached
      // source of the focus survives its own panel. The compact Record
      // mode pauses them too: no hidden catalog and no hidden row scan.
      const paused=Boolean(focus?.isOpen?.())||destination==='record';
      arrangementRows.update(view,cards,{active,paused});
    }
    // One measured axis: the marker scrollport owns the time scale and the
    // lane of the rows follows it. The gutter between the ruler and the lane
    // is measured, never guessed.
    function laneBox() {
      for (const entry of cards.values()) {
        const card=entry.card;
        if (!card||card.hidden) continue;
        if (card.dataset&&card.dataset.group==='true') continue;
        const lane=entry.lane;
        const rect=lane&&lane.getBoundingClientRect?lane.getBoundingClientRect():null;
        if (rect&&rect.width) return {left:rect.left,width:rect.width};
      }
      return null;
    }
    // The focus lane owns the axis while the focus is open: the ruler and
    // the take lanes then share one measured origin.
    function focusLaneBox() {
      const box=focus?.viewport?.();
      if (!box) return null;
      const rect=box.getBoundingClientRect?box.getBoundingClientRect():null;
      if (!rect||!rect.width) return null;
      return {left:rect.left,width:rect.width};
    }
    /** The ruler of the Record mode measures its own visible container:
     * it never reads a hidden row of the editor. */
    function rulerBox() {
      const panel=el('arrangement-panel');
      if (!panel||panel.hidden) return null;
      const rect=panel.getBoundingClientRect?panel.getBoundingClientRect():null;
      if (!rect||!rect.width) return null;
      return {left:rect.left,width:rect.width};
    }
    function laneOrigin() {
      // The Record mode owns no lane: its ruler measures its own visible
      // container and never a hidden row.
      if (destination==='record') return rulerBox();
      // A hidden editor has no axis: the Clip never measures a lane it
      // does not show.
      if (destination!=='arrangement') return null;
      const focusBox=focusLaneBox();
      if (focusBox) return focusBox;
      return laneBox();
    }
    function arrangementGeometry() {
      const timeline=el('timeline'),track=el('timeline-track');
      const geometry={start:bounds.start,end:bounds.end,trackWidth:0,trackLeft:0,scrollLeft:0};
      if (!timeline||!track) return geometry;
      geometry.scrollLeft=timeline.scrollLeft||0;
      const lane=laneOrigin();
      const rect=track.getBoundingClientRect?track.getBoundingClientRect():null;
      // One measured axis: the ruler, the audio lanes and the take lanes
      // read the same origin, the same width and the same scroll.
      if (rect) geometry.trackWidth=rect.width||track.offsetWidth||0;
      if (lane&&rect) geometry.trackLeft=rect.left-lane.left;
      return geometry;
    }
    /** The origin of the scrollport inside its host: the border and the
     * padding of the host are measured, never guessed. */
    function axisOrigin(timeline) {
      const host=timeline.parentElement;
      if (!host||!host.getBoundingClientRect) return 0;
      const style=root.getComputedStyle?root.getComputedStyle(host):null;
      const border=parseFloat(style&&style.borderLeftWidth)||0;
      const padding=parseFloat(style&&style.paddingLeft)||0;
      return host.getBoundingClientRect().left+border+padding;
    }
    /** No visible editor leaves no inline placement behind: the ruler of
     * another layout never stays on the page. */
    function clearArrangementAxis(timeline) {
      if(!timeline.style.marginLeft&&!timeline.style.width)return;
      timeline.style.marginLeft='';timeline.style.width='';
    }
    // The ruler viewport follows the lane: the scrollport is placed over the
    // lane column and the track keeps the shared gutter inside it. The
    // placement is measured from the host of the scrollport, never guessed,
    // and no inline margin of another layout is left behind.
    function syncArrangementAxis() {
      const timeline=el('timeline'),track=el('timeline-track');
      if (!timeline||!track) return;
      // The width of the track follows the zoom alone: it never depends on
      // a lane and never waits for one.
      track.style.width='calc('+(zoom*100)+'% - 2*var(--rec-gutter,48px))';
      const lane=laneOrigin();
      if (!lane) { clearArrangementAxis(timeline); layoutMarkerLabels(); return; }
      timeline.style.marginLeft=Math.round(lane.left-axisOrigin(timeline))+'px';
      timeline.style.width=Math.round(lane.width)+'px';
      // The axis moved: the badges of the ruler follow it.
      layoutMarkerLabels();
    }
    // The ruler ends where the real clips end: the catalog may know clips
    // beyond the last marker, and no locator is invented for them.
    function syncBounds(locators) {
      bounds=timelineBounds(locators||[],zoom);
      const extent=Number(arrangementRows?.extent?.())||0;
      if (extent>bounds.end) bounds={...bounds,end:extent};
      return bounds;
    }
    function renderTracks(view) {
      const tracks=view.state?.tracks||[];
      // A different scope is a different Set: the local collapse never
      // follows it.
      const scope=String(view.state?.scope??view.state?.session?.songId??'');
      if(scope!==treeScope){treeScope=scope;collapsedGroups.clear();}
      // An invalid tree owns no parentage: its rows stay flat and honest.
      const treeValid=view.state?.trackTreeValid===true;
      const tree=observedTree(tracks,treeValid);
      const order=treeOrder(tracks,tree);
      for(const track of order) {
        const key=track.index+':'+track.id;
        if(!cards.has(key)) {
          const card=doc.createElement('article');card.className='rec-track-card rec-track-row';
          card.dataset.index=String(track.index);card.dataset.id=String(track.id);
          // A group owns a disclosure button of its own: expanding and
          // collapsing is a local view choice and never writes to Live.
          const toggle=doc.createElement('button');toggle.type='button';toggle.className='rec-track-group-toggle';toggle.hidden=true;
          toggle.addEventListener('click',()=>{
            if(collapsedGroups.has(key))collapsedGroups.delete(key);else collapsedGroups.add(key);
            cancelVolumes();
            renderTracks(client.view());
          });
          card.appendChild(toggle);
          const name=doc.createElement('span');name.className='rec-track-name';card.appendChild(name);
          const row=doc.createElement('div');row.className='rec-track-actions';card.appendChild(row);
          // The right lane holds the real take clips of the Arrangement: the
          // container is a real element, never a hidden canvas.
          const lane=doc.createElement('div');lane.className='rec-track-lane';
          const clips=doc.createElement('div');clips.className='rec-track-clips';
          lane.appendChild(clips);card.appendChild(lane);
          const volBox=doc.createElement('div');volBox.className='rec-track-vol';
          volBox.setAttribute('role','slider');volBox.tabIndex=0;
          volBox.setAttribute('aria-valuemin','0');volBox.setAttribute('aria-valuemax','1');
          const volRail=doc.createElement('div');volRail.className='rec-track-vol-rail';
          const volFill=doc.createElement('div');volFill.className='rec-track-vol-fill';
          const volThumb=doc.createElement('div');volThumb.className='rec-track-vol-thumb';
          volRail.appendChild(volFill);volRail.appendChild(volThumb);volBox.appendChild(volRail);
          const volValue=doc.createElement('span');volValue.className='rec-track-vol-val';
          volBox.appendChild(volValue);
          let volDragging=false, volStartX=0, volStartV=0, volBinding=null,volSending=false,volPending=null;
          const currentVolumeTrack=view=>view.state?.tracks.find(item=>item.index===track.index&&item.id===track.id);
          function canVolume(view) {
            const ref=currentVolumeTrack(view);
            return view.writable && view.fresh && view.state?.transport?.connected && typeof ref?.volume==='number' && Number.isFinite(ref.volume)
              && (!view.busy || volSending && view.pendingCommand==='recordingTrackVolume') && !['stop','rename'].includes(view.state?.pending);
          }
          function cancelVolume() {volDragging=false;volBinding=null;volPending=null;entry.volumeDragging=false;delete volBox.dataset.active;}
          function sameVolumeBinding(view,binding) {
            const ref=currentVolumeTrack(view);
            return binding && binding.epoch===view.connectionEpoch && binding.song===view.state?.session?.songId && ref?.name===binding.name && canVolume(view);
          }
          function bindVolume() {
            const view=client.view();if(!canVolume(view))return false;
            volBinding={epoch:view.connectionEpoch,song:view.state?.session?.songId,name:currentVolumeTrack(view).name};return true;
          }
          function sendVolume() {
            if(volSending || volPending===null)return;
            const view=client.view(),binding=volBinding;
            if(!sameVolumeBinding(view,binding)){cancelVolume();return;}
            const nextV=volPending;volPending=null;volSending=true;
            const ref=currentVolumeTrack(view);
            client.command('recordingTrackVolume',{track:{index:ref.index,id:ref.id,name:ref.name},volume:nextV})
              .catch(()=>{if(volBinding===binding)cancelVolume();})
              .finally(()=>{volSending=false;if(volBinding===binding){if(sameVolumeBinding(client.view(),binding))sendVolume();else cancelVolume();}renderTracks(client.view());});
          }
          function setTrackVol(nextV) {
            if(!canVolume(client.view()) || !volBinding && !bindVolume())return;
            nextV = Math.max(0, Math.min(1, Math.round(nextV * 1000) / 1000));
            entry.currentV = nextV;
            volBox.style.setProperty?.('--rec-volume-level',String(nextV));
            const dbText = formatVolumeDb(nextV);
            volValue.textContent = dbText;
            volBox.setAttribute('aria-valuenow', String(nextV));
            volBox.setAttribute('aria-valuetext', dbText);
            volBox.title = track.name + ' · ' + dbText;
            volPending=nextV;sendVolume();
          }
          volBox.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !bindVolume()) return;
            event.stopPropagation(); event.preventDefault();
            volDragging = true; entry.volumeDragging = true;
            volStartX = event.clientX;
            volStartV = entry.currentV;
            volBinding.pointerId=event.pointerId;
            volBox.setPointerCapture?.(event.pointerId);
            volBox.dataset.active = 'true';
          });
          volBox.addEventListener('pointermove', event => {
            if (!volDragging || event.pointerId!==volBinding?.pointerId) return;
            event.stopPropagation(); event.preventDefault();
            const dx = event.clientX - volStartX;
            setTrackVol(volStartV + dx / 120);
          });
          const finishVolDrag = event => {
            if (!volDragging || event.pointerId!==volBinding?.pointerId) return;
            if(event.type==='pointercancel'){cancelVolume();return;}
            volDragging = false; entry.volumeDragging = false;
            delete volBox.dataset.active;
            event.stopPropagation(); event.preventDefault();
          };
          volBox.addEventListener('pointerup', finishVolDrag);
          volBox.addEventListener('pointercancel', cancelVolume);
          volBox.addEventListener('lostpointercapture', () => {if(volDragging)cancelVolume();});
          volBox.addEventListener('dblclick', event => {
            event.stopPropagation(); event.preventDefault();
            const ref=currentVolumeTrack(client.view());
            if (!canVolume(client.view()) || typeof ref?.volumeDefault!=='number' || !bindVolume()) return;
            setTrackVol(ref.volumeDefault);
          });
          volBox.addEventListener('keydown', event => {
            if (!canVolume(client.view()) || !bindVolume()) return;
            let step = 0;
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') step = 0.02;
            else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') step = -0.02;
            else if (event.key === 'PageUp') step = 0.1;
            else if (event.key === 'PageDown') step = -0.1;
            else if (event.key === 'Home') { event.preventDefault(); setTrackVol(0); return; }
            else if (event.key === 'End') { event.preventDefault(); setTrackVol(1); return; }
            else return;
            event.preventDefault();
            setTrackVol(entry.currentV + step);
          });
          const buttons={};
          for(const property of ['arm','solo','mute']) {
            const button=doc.createElement('button');button.type='button';button.dataset.property=property;
            button.addEventListener('click',()=>{
              const current=client.view();
              // A group arms its descendants in one collective write; its own
              // solo and mute stay native group controls.
              if(property==='arm'&&track.isGroup===true){armCollective(current,track);return;}
              const ref=current.state?.tracks.find(item=>item.index===track.index&&item.id===track.id);
              if(!ref||!canControl(current,property)||typeof ref[property]!=='boolean'||property==='arm'&&ref.canArm!==true)return;
              invoke('recordingTrackControl',{track:{index:ref.index,id:ref.id,name:ref.name},property,enabled:!ref[property],...(property==='arm'?{armMode}:{})});
            });
            row.appendChild(button);buttons[property]=button;
          }
          // The horizontal fader follows ARM, SOLO and MUTE.
          row.appendChild(volBox);
          cards.set(key,{card,name,buttons,toggle,lane,volBox,volValue,currentV:null,volumeDragging:false,cancelVolume,track:trackRef(track),
            volumeActive:()=>volDragging||volPending!==null,canVolume,checkVolume:()=>{if(volBinding&&!sameVolumeBinding(client.view(),volBinding))cancelVolume();}});
          const entry=cards.get(key);
          name.tabIndex=0;name.setAttribute('role','button');
          name.addEventListener('dblclick',()=>editName(entry,track.index,track.id));
          name.addEventListener('keydown',event=>{if(event.target===name && event.key==='Enter'){event.preventDefault();editName(entry,track.index,track.id);}});
        }
        const entry=cards.get(key),label=(track.index+1)+' · '+track.name;
        // The arrangement rows read the ordinary tracks by their exact
        // reference: the name is part of the identity of a row.
        entry.track=trackRef(track);
        if(!entry.editor && entry.name.textContent!==label)entry.name.textContent=label;
        if(entry.editor)entry.editor.input.readOnly=entry.editor.pending || !canRename(view);
        entry.name.title=track.name+' · '+t('renameTrack');entry.name.setAttribute('aria-label',t('renameTrack')+' · '+track.name);
        entry.name.setAttribute('aria-disabled',String(!canRename(view)));
        entry.checkVolume();
        const v = typeof track.volume === 'number' && Number.isFinite(track.volume) ? track.volume : null;
        if (!entry.volumeActive()) {
          entry.currentV = v;
          entry.volBox.style.setProperty?.('--rec-volume-level',String(v ?? 0));
          const dbText = formatVolumeDb(v);
          if (entry.volValue.textContent !== dbText) entry.volValue.textContent = dbText;
          entry.volBox.setAttribute('aria-valuenow', v===null?'':String(Math.round(v * 1000) / 1000));
          entry.volBox.setAttribute('aria-valuetext', dbText);
          entry.volBox.title = track.name + ' · ' + dbText;
        }
        entry.volBox.setAttribute('aria-label', t('trackVolume') + ' · ' + track.name);
        entry.volBox.setAttribute('aria-disabled', String(!entry.canVolume(view)));
        for(const property of ['arm','solo','mute']) {
          const button=entry.buttons[property],label=t(property==='arm'?'armShort':property);
          if(button.textContent!==label)button.textContent=label;
          if(property==='arm'&&track.isGroup===true) {
            // A group arms its descendants: the observed state is all, mixed
            // or none, and the host owns the change.
            const collective=collectiveState(view,track);
            button.disabled=!canArmCollective(view,track)||!collective.targets.length;
            button.setAttribute('aria-pressed',collective.pressed);
            button.setAttribute('aria-label',t('armGroup')+' · '+track.name);
            button.title=collective.targets.length?collective.targets.length+' '+t('armableTracks'):t('noArmableTracks');
            continue;
          }
          button.disabled=!canControl(view,property)||typeof track[property]!=='boolean'||property==='arm'&&track.canArm!==true;
          button.setAttribute('aria-pressed',typeof track[property]==='boolean'?String(track[property]):'mixed');
          button.setAttribute('aria-label',label+' · '+track.name);
        }
        if(track.isGroup===true) {
          const collapsed=collapsedGroups.has(key);
          entry.toggle.hidden=!treeValid;
          entry.toggle.textContent=collapsed?'▸':'▾';
          entry.toggle.setAttribute('aria-expanded',String(!collapsed));
          entry.toggle.setAttribute('aria-label',(collapsed?t('expandGroup'):t('collapseGroup'))+' · '+track.name);
          entry.card.dataset.group='true';
        } else {
          entry.toggle.hidden=true;
          entry.card.dataset.group='false';
        }
        const visible=trackVisible(track,tree);
        entry.card.hidden=!visible;
        if(!visible)entry.cancelVolume();
      }
      const orderSignature=order.map(track=>trackKey(track)).join('|');
      if(trackSignature!==orderSignature) {
        trackSignature=orderSignature;
        const keys=new Set(order.map(trackKey));
        for(const key of cards.keys())if(!keys.has(key)){cards.get(key).cancelVolume();cards.delete(key);}
        el('track-grid').replaceChildren(...order.map(track=>cards.get(trackKey(track)).card));
      }
    }
    const positionLabel = (time,meter) => {
      meter=meter?.numerator&&meter?.denominator?meter:displayMeter;
      if (!Number.isFinite(time) || !meter?.numerator || !meter?.denominator) return '?';
      const pos=beatsToPosition(time,meter);return pos.bar+'.'+pos.beat;
    };
    const percent = time => Math.max(0,Math.min(100,(time-bounds.start)/(bounds.end-bounds.start)*100));
    function drawGrid() {
      const grid=el('grid'),track=el('timeline-track');if(!grid||!track)return;
      const observed=client.view().state?.meter,meter=observed?.numerator&&observed?.denominator?observed:displayMeter;
      const pixels=track.offsetWidth||0,key=[bounds.start,bounds.end,meter?.numerator,meter?.denominator,pixels].join();
      if(key===gridSignature)return;gridSignature=key;
      grid.replaceChildren(...timelineGrid(bounds,meter,pixels).map(tick=>{
        const line=doc.createElement('span');line.className='rec-grid-'+tick.kind;line.style.left=percent(tick.time)+'%';
        if(tick.label)line.textContent=tick.label;
        return line;
      }));
    }
    function reason(error) {
      const code=String(error).match(/REC:([A-Z_]+)/)?.[1];
      const translated=code?t('reason.'+code):'';
      return translated && translated!=='rec.reason.'+code?translated:t('checkLive');
    }
    function option(select,value,label) {
      const item=doc.createElement('option');item.value=value;item.textContent=label;select.appendChild(item);return item;
    }
    /** A new Set, a new scope or a new connection retires the local
     * selection: the old references belong to another song. */
    function retireSelection() {
      selection=rangeApi.emptySelection();
      selectionTouched=false;
      fixedPoint=null;
    }
    /** The native range describes a capture the host already owns. It may
     * fill an untouched selection; an explicit local choice is never
     * replaced by a later observation. */
    function adoptNativeRange(native) {
      if(selectionTouched) return;
      if(native.start) {
        selection=rangeApi.updateSelection(selection,{type:'start',value:native.start},markers());
        if(native.start.source==='cursor'&&Number.isFinite(native.start.time)) fixedPoint=native.start.time;
      }
      if(native.end) selection=rangeApi.updateSelection(selection,{type:'end',mode:'marker',value:native.end},markers());
      else selection=rangeApi.updateSelection(selection,{type:'end',mode:'stop',value:null},markers());
      const current=resolved();
      if(current.end&&!userAdjustedZoom) scheduleAutoZoom();
    }
    /** A marker tap is a local decision: it moves the start or the end of
     * the range and never seeks the host. */
    function selectMarker(cue) {
      const previous=selection.endMode;
      selection=rangeApi.updateSelection(selection,{type:'tap',value:{name:cue.name,time:cue.time}},markers());
      selectionTouched=true;
      if(previous==='stop'&&selection.endMode!=='stop')passes=1;
      // An explicit choice of the reader owns the view again: the flags of
      // the automatic view fall and the opening is armed.
      userAdjustedZoom=false;userAdjustedView=false;stopFrameArmed=true;
      render(client.view());
      if(bounded()) scheduleAutoZoom();
    }
    /** The start select adapts a value to a reference: the cursor, a
     * marker of the displayed catalog or nothing at all. */
    function startFromValue(value) {
      if(value==='cursor') return Number.isFinite(fixedPoint)?{source:'cursor',time:fixedPoint}:null;
      if(value==='use-current') {
        const position=client.view().state?.transport?.songTimeBeats;
        if(position?.fresh&&Number.isFinite(position.value)){fixedPoint=position.value;markerSignature='';return {source:'cursor',time:position.value};}
        return null;
      }
      if(value==='') return null;
      const cue=optionCatalog[Number(value)];
      return cue?{name:cue.name,time:cue.time}:null;
    }
    /** The end select adapts a value to a mode and a reference. */
    function endFromValue(value) {
      if(value==='next') return {mode:'next',value:null};
      if(value==='') return {mode:'stop',value:null};
      const cue=optionCatalog[Number(value)];
      // An explicit end that is not there never widens the range to stop.
      return {mode:'marker',value:cue?{name:cue.name,time:cue.time}:null};
    }
    /** The status of an unusable selection. */
    function statusKey(reason) {
      return reason==='START_MISSING'||reason==='START_AMBIGUOUS'?'chooseMarker':'chooseEnd';
    }
    /** The note under the range: an unusable selection first, then the
     * instruction of an armed start, then the pass count notice. */
    function rangeNoteText(current) {
      if(current.editingStart) return t('editStart');
      if(!current.valid) return t('reason.'+current.reason);
      return passesReported===null?'':t('passagesNormalized',{count:passesReported});
    }
    /** The adapter value of the start select: a cursor, a marker of the
     * catalog or nothing. It is a value, never an identity. The catalog is
     * the one the open selector displays: an option means the marker it
     * shows, never the marker that sits at that index now. */
    function startValue() {
      if(!selection.start) return '';
      if(selection.start.source==='cursor') return 'cursor';
      const index=optionCatalog.findIndex(cue=>cue.name===selection.start.name&&cue.time===selection.start.time);
      return index>=0?String(index):'missing';
    }
    /** The adapter value of the end select: Until STOP, the next marker or
     * a marker of the displayed catalog. */
    function endValue() {
      if(selection.endMode==='next') return 'next';
      if(selection.endMode!=='marker'||!selection.end) return '';
      const index=optionCatalog.findIndex(cue=>cue.name===selection.end.name&&cue.time===selection.end.time);
      return index>=0?String(index):'missing';
    }
    /** The start and the end of the range are marked on the real markers.
     * A marker owns the node it represents: the highlight follows that
     * node and never the marker that sits at that index now. A node that
     * left the Set is shown honestly, never as the start or the end. */
    function highlightRange(start,end) {
      // The exact presence of a node in the catalog of the Set: two
      // markers never share a key.
      const present=new Set(markers().map(cue=>JSON.stringify([cue.name,cue.time])));
      for(const marker of el('markers').children) {
        const cue=markerCues.get(marker);
        const here=Boolean(cue)&&present.has(JSON.stringify([cue.name,cue.time]));
        // The membership of a node and the identity of its reference are the
        // only gate: a redundant key set never owned the highlight.
        const same=ref=>here&&Boolean(ref)&&ref.name===cue.name&&ref.time===cue.time;
        marker.setAttribute('aria-pressed',String(here&&same(start)));
        marker.setAttribute('data-end',String(here&&same(end)));
      }
      // The selection changed: the badges of the ruler follow it.
      layoutMarkerLabels();
    }
    function updateRange() {
      if(!client.view().state) return;
      const shown=displayRange(), start=shown.start, end=shown.end;
      if(doc.activeElement!==el('start-marker')) el('start-marker').value=startValue();
      if(doc.activeElement!==el('end-marker')) el('end-marker').value=endValue();
      const startTime=start?start.time:-1;
      for(const item of el('end-marker').children) item.disabled=item.value==='missing'||item.value!==''&&item.value!=='next'&&(optionCatalog[Number(item.value)]?.time??-1)<=startTime;
      el('end-field').hidden=false;
      el('passages').hidden=destination==='clip';
      if(el('pre-roll-inline'))el('pre-roll-inline').hidden=destination==='clip';
      const passageText=passes===null?'∞':String(passes);
      if(el('passages-value')&&el('passages-value').textContent!==passageText)el('passages-value').textContent=passageText;
      el('region').hidden=!start || !end;
      if(start && end) {el('region').style.left=percent(start.time)+'%';el('region').style.width=(percent(end.time)-percent(start.time))+'%';}
      highlightRange(start,end);
    }
    function scheduleAutoZoom() {
      if(userAdjustedZoom||userAdjustedView) return;
      clearTimeout(autoZoomTimer);
      autoZoomTimer = setTimeout(applyAutoZoom, 250);
    }
    /** The bar of the capture in beats: the observed signature owns it and
     * an unknown signature falls back to four beats. */
    function barBeats(state) {
      const meter=state?.meter;
      if(!Number.isInteger(meter?.numerator)||meter.numerator<1||![1,2,4,8,16,32].includes(meter?.denominator))return 4;
      return meter.numerator*4/meter.denominator;
    }
    /** The zoom of a window: the window owns 72% of the whole catalog. */
    function windowZoom(windowBeats) {
      const totalSpan=bounds.end-bounds.start;
      if(totalSpan<=0||windowBeats<=0)return 0;
      return Math.max(1,Math.min(300,Math.round(0.72*totalSpan/windowBeats)||1));
    }
    /** The window of Até STOP: sixteen bars from the resolved start. The
     * capture never grows an end of its own: the window is a view. */
    function stopWindow(state,start) {
      const windowBeats=16*barBeats(state);
      return {windowBeats,visualEnd:Math.max(start.time,Math.min(bounds.end,start.time+windowBeats))};
    }
    /** The zoom of an explicit end: the window of the capture. */
    function explicitEndZoom(start,end) {
      if (end.time <= start.time) return 0;
      const totalSpan = bounds.end - bounds.start;
      const loopSpan = end.time - start.time;
      if(totalSpan <= 0 || loopSpan <= 0) return 0;
      const fraction = loopSpan / totalSpan;
      return Math.max(1, Math.min(300, Math.round(0.72 / fraction) || 1));
    }
    /** The zoom of the page: the slider and the axis follow it. */
    function applyZoom(targetZoom) {
      if(!targetZoom) return false;
      zoom=targetZoom;
      if(el('zoom')) el('zoom').value=String(targetZoom);
      return true;
    }
    function applyAutoZoom() {
      autoZoomTimer = null;
      if(userAdjustedZoom||userAdjustedView) return;
      const state = client.view().state;
      if(!state) return;
      const shown = displayRange(), start = shown.start, end = shown.end;
      if(!start) return;
      if(!end) {
        // Até STOP: the window is sixteen bars from the resolved start. The
        // capture never grows an end of its own: the window is a view.
        const {windowBeats,visualEnd}=stopWindow(state,start);
        if(!applyZoom(windowZoom(windowBeats))) return;
        syncBounds(state.locators);
        measureArrangement(start.time,visualEnd);
        return;
      }
      if(!applyZoom(explicitEndZoom(start,end))) return;
      syncBounds(state.locators);
      measureArrangement(start.time, end.time);
    }
    /** The opening with Até STOP: the view frames the resolved start while
     * the flag is armed, the destination owns a ruler and the reader never
     * chose the view by hand. The flag is disarmed after the frame, so the
     * polls never frame it again. */
    function openStopFrame() {
      if(!stopFrameArmed||userAdjustedZoom||userAdjustedView)return;
      if(destination!=='record'&&destination!=='arrangement')return;
      const shown=displayRange();
      if(!shown.start||shown.end)return;
      stopFrameArmed=false;
      applyAutoZoom();
    }
    /** The measured axis belongs to the visible editor: the ruler of the
     * Record and of the Arrangement is measured, painted and centred. The
     * Clip owns no ruler and is never measured. */
    function measureArrangement(startTime, endTime) {
      if(destination!=='arrangement'&&destination!=='record')return;
      syncArrangementAxis();
      drawGrid();drawCursor();
      centerTimeline(startTime, endTime);
    }
    /** The visible axis of the Arrangement opens on the range of the
     * capture. A viewport the reader chose by hand is never replaced by
     * the automatic one. */
    function centerArrangement() {
      syncArrangementAxis();
      drawGrid();drawCursor();
      if(userAdjustedZoom||userAdjustedView)return;
      const current=resolved();
      if(current.start&&current.end&&current.end.time>current.start.time)applyAutoZoom();
    }
    function centerTimeline(startTime, endTime, manual) {
      const timeline = el('timeline') || el('timeline-track')?.parentElement;
      if(!timeline) return;
      // A viewport the reader chose by hand is never replaced by the
      // automatic one: only the reader's own zoom moves the axis.
      if(!manual&&(userAdjustedZoom||userAdjustedView)) return;
      const track = el('timeline-track');
      const offsetLeft = track?.getBoundingClientRect && timeline.getBoundingClientRect
        ? track.getBoundingClientRect().left-timeline.getBoundingClientRect().left+timeline.scrollLeft-(timeline.clientLeft||0)
        : track?.offsetLeft ?? 48;
      const trackWidth = track?.offsetWidth || Math.max(0, (timeline.scrollWidth || 0) - (offsetLeft * 2));
      const span = bounds.end - bounds.start;
      if (span <= 0) return;
      const startPct = Math.max(0, Math.min(1, (startTime - bounds.start) / span));
      const startPx = offsetLeft + startPct * trackWidth;
      const endPct = Math.max(0, Math.min(1, (endTime - bounds.start) / span));
      const endPx = offsetLeft + endPct * trackWidth;
      const viewWidth = timeline.clientWidth || 0;
      const cardHalfWidth = 44, leadMargin = 20;
      const minLeftVisible = startPx - cardHalfWidth - leadMargin;
      const midTime = (startTime + endTime) / 2;
      const pct = Math.max(0, Math.min(1, (midTime - bounds.start) / span));
      const centerPx = offsetLeft + pct * trackWidth;
      let targetScroll = centerPx - viewWidth / 2;
      if (endPx - startPx + (cardHalfWidth * 2) + (leadMargin * 2) <= viewWidth) {
        const boxCenter = ((startPx - cardHalfWidth) + (endPx + cardHalfWidth)) / 2;
        targetScroll = boxCenter - viewWidth / 2;
      } else if (targetScroll > minLeftVisible) {
        targetScroll = minLeftVisible;
      }
      timeline.scrollLeft = Math.max(0, targetScroll);
      // The scroll the reader sees is the one the page owns: an automatic
      // frame never looks like a gesture of the reader.
      lastScrollLeft=timeline.scrollLeft;
    }
    function drawCursor() {
      const view=client.view(),state=view.state,transport=state?.transport,position=transport?.songTimeBeats;
      const clock=root.triggerNoteClockSnapshot,now=root.performance?.now?.() ?? Date.now();
      const known=view.connected&&view.fresh&&transport?.connected&&position?.fresh&&Number.isFinite(position.value);
      if(!known)cursorClock=null;
      else if(!cursorClock||cursorClock.observedAt!==position.observedAt||cursorClock.beat!==position.value)
        cursorClock={observedAt:position.observedAt,beat:position.value,receivedAt:now};
      const playing=known&&transport.isPlaying?.fresh&&transport.isPlaying.value===true;
      const fresh=playing&&clock?.valid&&clock.playing&&Number.isFinite(clock.receivedAt)&&now>=clock.receivedAt&&now-clock.receivedAt<=1000;
      // Display interpolation only. Native observations still own capture
      // boundaries; never advance through stale state or a disconnected page.
      const elapsed=cursorClock?Math.max(0,Math.min(1000,now-cursorClock.receivedAt)):0;
      const time=!known?null:fresh?clock.beat+(now-clock.receivedAt)*clock.bpm/60000
        :position.value+(playing&&Number.isFinite(state.tempo)?elapsed*state.tempo/60000:0);
      el('cursor').hidden=!Number.isFinite(time);
      if(Number.isFinite(time)) {
        el('cursor').style.left=percent(time)+'%';
        const label=positionLabel(time,state?.meter);if(el('position').textContent!==label) el('position').textContent=label;
      }
    }
    function render(view) {
      const state=view.state, transport=state?.transport;
      if(state?.session?.songId && displaySongId!==state.session.songId){displaySongId=state.session.songId;displayMeter=null;retireSelection();passes=1;markerSignature='';rangeSignature='';}
      // Another scope is another Set: the local selection is retired.
      const scope=String(state?.scope??'');
      if(scope!==selectionScope){selectionScope=scope;retireSelection();}
      const meterKnown=Number.isInteger(state?.meter?.numerator)&&state.meter.numerator>0&&[1,2,4,8,16,32].includes(state?.meter?.denominator);
      if(meterKnown)displayMeter={...state.meter};
      el('position').setAttribute('data-meter-stale',String(!meterKnown));el('position').title=!meterKnown&&displayMeter?t('staleMeter'):'';
      const known=transport?.connected && transport.isPlaying?.fresh && transport.recordMode?.fresh;
      const stopped=known && transport.isPlaying.value===false && transport.recordMode.value===false;
      if(stopped&&fixedPoint===null&&transport.songTimeBeats?.fresh&&Number.isFinite(transport.songTimeBeats.value))fixedPoint=transport.songTimeBeats.value;
      // The default start is the cursor at the stop position. It is taken
      // once: a choice of the reader is never replaced by it.
      if(!selectionTouched&&!selection.start&&Number.isFinite(fixedPoint)) selection=rangeApi.updateSelection(selection,{type:'start',value:{source:'cursor',time:fixedPoint}},markers());
      const working=view.busy || Boolean(state?.pending);
      // A pending action, a pre-roll, an attempt or a running Session owns
      // the range: the reader cannot change it while the host is recording.
      const locked=rangeLocked(view);
      const editable=view.writable && !locked && stopped;
      applyModeChrome(view);
      // The take focus is a local view of the Arrangement: leaving it
      // retires the focus before the chrome of the editor is applied.
      if(destination!=='arrangement'&&focus?.isOpen?.())focus.close();
      applyEditorChrome();
      renderSession(view);
      const activeTake = known && transport.recordMode.value === true;
      el('status').textContent=view.error && !activeTake?reason(view.error):state?.preRoll?.phase==='running'?t('preRolling'):working?t('working'):t(!known?'unknown':transport.recordMode.value?'recordObserved':transport.isPlaying.value?'playing':'stopped');
      el('status').dataset.recording=String(known && transport.recordMode.value===true);
      el('stop').disabled=!view.writable;
      for(const id of ['start-marker','end-marker']) el(id).disabled=!editable;
      el('passages').disabled=!editable;
      el('passages').hidden=destination==='clip';
      // The CLIP destination records whole scenes: the count-in and the
      // pass count belong to the Arrangement, not to it.
      if(el('pre-roll-inline'))el('pre-roll-inline').hidden=destination==='clip';
      const metronome=transport?.metronome;
      // The label never claims a metronome the host did not observe.
      const metronomeKnown=metronome?.fresh===true&&typeof metronome?.value==='boolean';
      el('click').disabled=!view.clickable || view.clicking;
      el('click').textContent=t('click')+' · '+(metronomeKnown?t(metronome.value?'on':'off'):'?');
      el('return-arrangement').disabled=!view.writable||!view.fresh||working||!known||transport.recordMode.value!==false||Boolean(state?.attemptActive)||state?.safety?.backToArranger!==true||!state?.session?.rows.every(row=>row.ready===true);
      // The way back to the Arrangement is the native one: the host offers
      // it or it is not there. The local Arrangement is a view of the page
      // and never hides it. Its cell keeps its width, so the CLICK never
      // moves because of the state.
      el('return-arrangement').hidden=state?.safety?.backToArranger!==true;
      el('arm-mode').disabled=!editable||Boolean(state?.attemptActive);
      el('arm-mode').textContent=t(armMode==='multi'?'armMulti':'armExclusive');
      el('arm-mode').setAttribute('aria-pressed',String(armMode==='exclusive'));
      // ARM ALL is one collective write over every armable track.
      const collective=collectiveState(view,null);
      el('arm-all').disabled=!canArmCollective(view)||!collective.targets.length;
      el('arm-all').setAttribute('aria-pressed',collective.pressed);
      el('arm-all').title=collective.targets.length?String(collective.targets.length)+' '+t('armableTracks'):t('noArmableTracks');
      if(el('pre-roll-inline')) {
        el('pre-roll-inline').disabled=!editable;
        const preRollText=preRollBars===0?t('preRollOff'):String(preRollBars);
        if(el('pre-roll-value')&&el('pre-roll-value').textContent!==preRollText)el('pre-roll-value').textContent=preRollText;
      }
      renderTracks(view);
      takes?.render?.();
      focus?.render?.(view);
      // The focus owns its own open state: the chrome of the editor is
      // applied again after the focus painted itself.
      applyEditorChrome();
      // The axis of the editor is measured only while the Arrangement is
      // the visible destination: the compact Record mode never measures a
      // hidden row. Outside the Arrangement the inline placement of the
      // ruler is cleared, so no margin of another layout stays behind.
      syncArrangementAxis();
      if(destination==='arrangement')focus?.geometryChanged?.();
      updateArrangementRows(view);
      for(const marker of el('markers').children) marker.disabled=!editable;
      // The page owns no marker action: the marker is created in Live and
      // the page only reads the catalog of the Set.
      if(!state) {el('start').disabled=true;el('cursor').hidden=true;return;}
      if(destination==='clip') {
        const targets=sessionTargets(view),session=state.session;
        // The Clip owns no range of the capture: the note of the range of
        // another destination never stays behind in the footer.
        if(el('range-note')&&el('range-note').textContent)el('range-note').textContent='';
        if(el('combined-footer')&&el('combined-footer').dataset.critical==='true')el('combined-footer').dataset.critical='false';
        el('start').disabled=!view.writable||!view.fresh||working||!known||transport.recordMode.value!==false||state.attemptActive||Boolean(state.trackPending)||!targets;
        el('status').dataset.recording=String(state.session?.owned.some(item=>item.state==='recording')??false);
        if(!view.error){const owned=session?.owned||[];el('status').textContent=t(session?.stopping?'sessionStopping':working?'working':owned.some(item=>item.state==='recording')?'sessionState.recording':owned.some(item=>item.state==='queued')?'sessionState.queued':owned.some(item=>item.state==='playing')?'sessionState.playing':session?.active?owned.some(item=>item.state==='unknown')?'unknown':'finishSession':!armedTracks(view).length?'armTracks':!sceneTarget?'chooseScene':!targets?'emptySceneRequired':'ready');}
        return;
      }
      const markerKey=JSON.stringify([state.locators,displayMeter]);
      syncBounds(state.locators);
      paintMarkerAxis();
      if(markerSignature!==markerKey && doc.activeElement!==el('start-marker') && doc.activeElement!==el('end-marker')) {
        markerSignature=markerKey;
        // The open selectors display this catalog: an option means the
        // marker it shows, never the marker that sits at that index now.
        optionCatalog=state.locators.slice();
        markerCues.clear();
        el('start-marker').replaceChildren();el('end-marker').replaceChildren();el('markers').replaceChildren();
        option(el('start-marker'),'cursor',t('here')+' · '+positionLabel(fixedPoint,state.meter));option(el('start-marker'),'use-current',t('useCursor'));
        option(el('start-marker'),'',t('chooseMarker'));option(el('start-marker'),'missing',t('reason.MARKER_CHANGED')).disabled=true;
        option(el('end-marker'),'',t('untilStop'));option(el('end-marker'),'next',t('nextMarker'));
        option(el('end-marker'),'missing',t('reason.MARKER_CHANGED')).disabled=true;
        gridSignature='';
        state.locators.forEach((cue,index)=>{
          const label=cue.name+' · '+positionLabel(cue.time,state.meter);
          option(el('start-marker'),String(index),label);option(el('end-marker'),String(index),label);
          const marker=doc.createElement('button');marker.type='button';marker.title=label;marker.setAttribute('aria-label',label);
          const position=doc.createElement('span');position.className='rec-marker-position';position.textContent=positionLabel(cue.time,state.meter);
          const name=doc.createElement('span');name.className='rec-marker-name';name.textContent=cue.name;
          marker.appendChild(position);marker.appendChild(name);
          marker.className='rec-marker';marker.dataset.index=String(index);marker.style.left=percent(cue.time)+'%';
          markerCues.set(marker,cue);
          marker.addEventListener('pointerdown',event=>activation.down(marker,event));
          marker.addEventListener('pointercancel',()=>activation.cancel());
          marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')activation.key();});
          marker.addEventListener('click',event=>{
            if(marker.disabled || !client.view().state) return;
            if(!activation.tap(marker,event)) return;
            selectMarker(cue);
          });
          el('markers').appendChild(marker);
        });
        // The badges of the ruler were rebuilt: they follow the axis.
        layoutMarkerLabels();
      }
      const rangeKey=JSON.stringify([state.range||null,state.capture?.total]);
      if(rangeSignature!==rangeKey) {
        rangeSignature=rangeKey;
        if(state.range) {
          const total=state.capture?.total;
          if(state.capture&&(total===null||Number.isInteger(total)&&total>=1&&total<=10)) {
            // The surface offers 1, 2, 3 and unlimited. A pass count outside
            // that set is normalized to one and reported, never hidden.
            if(total===null||total===1||total===2||total===3){passes=total;passesReported=null;}
            else {passes=1;passesReported=total;}
          }
          adoptNativeRange(state.range);
        }
      }
      const hereOption=[...el('start-marker').children].find(item=>item.value==='cursor');
      if(hereOption && doc.activeElement!==el('start-marker')) {
        const nextText=t('here')+' · '+positionLabel(fixedPoint,state.meter);
        if(hereOption.textContent!==nextText) hereOption.textContent=nextText;
      }
      updateRange();
      const rangeSelection=resolved();
      const rangeNote=rangeNoteText(rangeSelection);
      if(el('range-note')&&el('range-note').textContent!==rangeNote)el('range-note').textContent=rangeNote;
      // A reason of the range owns the whole footer of the combined band:
      // an error is never clipped, never shortened and never hidden.
      const critical=Boolean(rangeNote)&&(rangeSelection.editingStart||!rangeSelection.valid);
      if(el('combined-footer')&&el('combined-footer').dataset.critical!==String(critical))el('combined-footer').dataset.critical=String(critical);
      const armed=armedTracks(view);
      const current=resolved();
      // The pass count belongs to a bounded capture: without a valid end
      // marker the button stays visible and says that it cannot be used.
      el('passages').disabled=!editable||!bounded()||!current.valid;
      el('start').disabled=!editable || !armed.length || Boolean(state.trackPending) || !current.valid;
      if(!view.error && !working && stopped) el('status').textContent=t(!armed.length?'armTracks':!current.valid?statusKey(current.reason):state.capture?.phase==='complete'?'completed':bounded()?'ready':'freeReady');
      if(!view.error&&state.capture?.phase==='unconfirmed')el('status').textContent=reason(state.capture.error);
      else if(!view.error&&known&&transport.recordMode.value&&state.capture)el('status').textContent=t('recordObserved')+' · '+state.capture.pass+'/'+(state.capture.total??'∞');
      for(const marker of el('markers').children) marker.disabled=!editable;
      drawGrid();drawCursor();
      // The opening with Até STOP runs at the end of the render: the axis
      // is measured, the window is framed and the flag falls.
      openStopFrame();
    }
    for(const mode of ['record','arrangement','clip'])el(mode+'-mode')?.addEventListener('keydown',event=>{
      // The modes are mutually exclusive: the arrow keys walk the switch
      // without choosing a mode the reader did not confirm.
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const modes=['record','arrangement','clip'];
      const step=event.key==='ArrowRight'?1:modes.length-1;
      const next=el(modes[(modes.indexOf(mode)+step)%modes.length]+'-mode');
      if(!next||next.disabled)return;
      event.preventDefault();
      next.focus?.();
    });
    /** A destination with a ruler arms the opening: the view frames the
     * resolved start of the capture. */
    function armStopFrame(mode) {
      if(mode==='record'||mode==='arrangement')stopFrameArmed=true;
    }
    for(const mode of ['record','arrangement','clip'])el(mode+'-mode')?.addEventListener('click',()=>{
      const button=el(mode+'-mode');
      if(!button)return;
      // A locked mode never switches: the host owns the capture.
      if(button.disabled||mode===destination)return;
      destination=mode;
      // Leaving the Arrangement retires the take focus: it is a local view
      // of one track of the editor.
      if(mode!=='arrangement'&&focus?.isOpen?.())focus.close();
      // Entering a destination with a ruler arms the opening: the view
      // frames the resolved start of the capture.
      armStopFrame(mode);
      // The switch is a local choice: it reads, it never writes.
      render(client.view());
      // The Arrangement opens on the range of the capture: the axis of the
      // visible editor is measured and centred on it.
      if(mode==='arrangement')centerArrangement();
      poll();
    });
    for(const direction of ['prev','next'])el('session-'+direction).addEventListener('click',()=>{
      if(el('session-'+direction).disabled)return;sceneOffset+=direction==='next'?8:-8;sceneTarget=null;invoke('getSessionRecordingState',{offset:sceneOffset});
    });
    el('arm-mode').addEventListener('click',()=>{
      if(el('arm-mode').disabled)return;
      armMode=armMode==='multi'?'exclusive':'multi';
      try{root.localStorage?.setItem('rc-surface-v2.rec.armMode',armMode);}catch{}
      render(client.view());
    });
    el('start-marker').addEventListener('change',()=>{
      // A disabled selector owns no choice: a change queued after a lock
      // never changes the capture range.
      if(el('start-marker').disabled||rangeLocked(client.view())) return;
      // Choosing a start is a local decision: it never seeks and never
      // writes to the host.
      selectionTouched=true;
      selection=rangeApi.updateSelection(selection,{type:'start',value:startFromValue(el('start-marker').value)},optionCatalog);
      // The choice of the reader owns the view: the flags of the automatic
      // view fall before the render, so the opening runs in the same render.
      userAdjustedZoom=false;userAdjustedView=false;stopFrameArmed=true;
      render(client.view());
      if(bounded()) scheduleAutoZoom();
    });
    el('end-marker').addEventListener('change',()=>{
      if(el('end-marker').disabled||rangeLocked(client.view())) return;
      const previous=selection.endMode;
      selectionTouched=true;
      selection=rangeApi.updateSelection(selection,{type:'end',...endFromValue(el('end-marker').value)},optionCatalog);
      if(previous==='stop'&&selection.endMode!=='stop')passes=1;
      // The choice of the reader owns the view: the flags of the automatic
      // view fall before the render, so the opening runs in the same render.
      userAdjustedZoom=false;userAdjustedView=false;stopFrameArmed=true;
      render(client.view());
      if(bounded()) scheduleAutoZoom();
    });
    el('arm-all').addEventListener('click',()=>{
      if(el('arm-all').disabled)return;
      armCollective(client.view(),null);
    });
    el('passages').addEventListener('click',()=>{
      if(el('passages').disabled)return;
      // 1, 2, 3 and unlimited: a cycle, never a hidden dropdown.
      const order=[1,2,3,null];
      const index=order.indexOf(passes);
      passes=order[(index+1)%order.length];
      // The reader chose the pass count: the host's normalization notice is
      // cleared instead of lingering over an explicit choice.
      passesReported=null;
      render(client.view());
    });
    function setPreRoll(bars) {
      if(![0,1,2,4].includes(bars))return;
      preRollBars=bars;
      try { root.localStorage?.setItem(PRE_ROLL_KEY,String(bars)); } catch { /* The current page preference still works. */ }
      render(client.view());
    }
    el('pre-roll-inline')?.addEventListener('click',()=>{
      if(el('pre-roll-inline').disabled)return;
      const order=[0,1,2,4];
      setPreRoll(order[(order.indexOf(preRollBars)+1)%order.length]);
    });
    el('zoom').addEventListener('input',()=>{
      clearTimeout(autoZoomTimer);autoZoomTimer=null;userAdjustedZoom=true;
      zoom=Number(el('zoom').value);syncBounds(client.view().state?.locators || []);
      syncArrangementAxis();drawGrid();drawCursor();
      const current=resolved(),start=current.start,end=current.end;
      if(start){
        const center=end&&end.time>start.time?(start.time+end.time)/2:start.time;
        // The zoom of the reader moves the axis: it is not an automatic
        // frame and it owns the view.
        centerTimeline(center,center,true);
      }
    });
    el('start').addEventListener('click',()=>{
      if(destination==='clip') {
        const view=client.view(),targets=sessionTargets(view);if(!el('start').disabled&&targets)invoke('recordingSessionRecord',{songId:view.state.session.songId,scene:sceneTarget,targets,bars:Number(el('session-bars').value),quantization:el('session-quantization').value});return;
      }
      const view=client.view(),tracks=armedTracks(view),current=resolved(),end=current.end;
      if(!el('start').disabled&&canControl(view,'arm')&&tracks.length&&current.valid) invoke('recordingRecord',{tracks:tracks.map(track=>({index:track.index,id:track.id,name:track.name})),range:{start:current.start,end:end||null,loop:Boolean(end)&&passes!==1},preRollBars,passes:end?passes:null});
    });
    el('stop').addEventListener('click',()=>invoke(destination==='clip'||client.view().state?.session?.active?'recordingSessionStop':'recordingStop'));
    el('click').addEventListener('click',()=>{
      // The handler checks the same observation the button is built from: a
      // click never inverts a metronome the host did not observe.
      const view=client.view();
      if(!view.clickable||view.clicking)return;
      invoke('recordingClick',{enabled:!view.state.transport.metronome.value});
    });
    el('return-arrangement').addEventListener('click',()=>{if(!el('return-arrangement').disabled)client.command('recordingReturnToArrangement').then(()=>{destination='arrangement';render(client.view());poll();}).catch(()=>{});});
    function animate() {
      frame=null;if(doc.hidden || doc.body.dataset.page!=='recording' || !client.view().connected) return;
      drawCursor();frame=root.requestAnimationFrame?.(animate);
    }
    function poll() {
      clearTimeout(refreshTimer);if(frame!=null) root.cancelAnimationFrame?.(frame);frame=null;
      if(doc.body.dataset.page!=='recording' || doc.hidden || !client.view().connected) return;
      invoke(destination==='clip'?'getSessionRecordingState':'getRecordingState',destination==='clip'?{offset:sceneOffset}:{});
      render(client.view());
      animate();refreshTimer=setTimeout(poll,750);
    }
    // The geometry of the editor is measured only while the Arrangement is
    // the visible destination: the compact Record mode never scans a row
    // and a resize of the page never touches the hidden editor.
    root.addEventListener('resize',()=>{
      if(destination!=='arrangement'&&destination!=='record')return;
      syncArrangementAxis();drawGrid();
      if(destination!=='arrangement')return;
      arrangementRows?.geometryChanged();focus?.geometryChanged?.();
    });
    // The ruler scrolls with its own scrollport: the lane follows the same
    // measured axis. A scroll that a gesture of the reader really made
    // owns the view of the axis from then on.
    el('timeline')?.addEventListener('scroll',()=>{
      const timeline=el('timeline');
      const value=timeline?timeline.scrollLeft:0;
      const moved=value!==lastScrollLeft;
      lastScrollLeft=value;
      if(moved&&(pointerOnTimeline||Date.now()-lastPointerUp<=500))userAdjustedView=true;
      if(destination==='arrangement'){arrangementRows?.geometryChanged();focus?.geometryChanged?.();}
    });
    // The gesture of the reader on the ruler: a wheel or a finger owns the
    // view of the axis. The Record and the Arrangement are the only
    // destinations with a ruler.
    el('timeline')?.addEventListener('wheel',()=>{if(destination==='record'||destination==='arrangement')userAdjustedView=true;});
    el('timeline')?.addEventListener('pointerdown',()=>{pointerOnTimeline=true;});
    el('timeline')?.addEventListener('pointerup',()=>{pointerOnTimeline=false;lastPointerUp=Date.now();});
    el('timeline')?.addEventListener('pointercancel',()=>{pointerOnTimeline=false;lastPointerUp=Date.now();});
    root.addEventListener('ableton-rc:phone-client-id',event=>{retireSelection();client.session(true,event.detail?.role || 'viewer');poll();});
    root.addEventListener('ableton-rc:phone-ws-close',()=>{retireSelection();client.session(false);clearTimeout(refreshTimer);if(frame!=null) root.cancelAnimationFrame?.(frame);frame=null;});
    root.addEventListener('ableton-rc:page-change',()=>{
      focus?.close?.();
      // The page opens again with the opening armed: the view of the
      // reader belongs to the page that left, not to this one.
      stopFrameArmed=true;userAdjustedZoom=false;userAdjustedView=false;
      poll();
    });
    doc.addEventListener('visibilitychange',poll);
    doc.addEventListener('rcsurface:languagechange',()=>{markerSignature='';render(client.view());});
    // The handshake can finish before this deferred setup runs (reload with a
    // fast host); adopt that session or REC waits for Live until a reconnect.
    const open=root.RCSurface?.getPhoneSession?.();
    if(open){client.session(true,open.role||'viewer');poll();}
    render(client.view());return client;
  }
  root.RcRecording = Object.freeze({createClient, positionToBeats, beatsToPosition, timelineBounds, timelineGrid, preRollPreference, formatVolumeDb, markerTapGuard, setup});
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded',setup,{once:true});
    else setup();
  }
})(typeof window !== 'undefined' ? window : globalThis);
