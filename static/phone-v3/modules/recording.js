// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
(function (root) {
  'use strict';
  const WRITES = new Set(['recordingSelectTrack','recordingSetPoint','recordingLocator','recordingArm','recordingPrepare','recordingStart','recordingRecord','recordingSeekMarker','recordingStop','recordingAudition','recordingClick','recordingMark']);
  const t = (key, params) => root.RcSurfaceI18n?.t('rec.' + key, params) || key;
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
  function createClient({send, render = () => {}, timeoutMs = 12000}) {
    let connected = false, role = 'viewer', state = null, busy = false, generation = 0, error = null, readError = null, receivedAt = 0, reading = null;
    const view = () => {
      let observed = state;
      if (state?.transport && Date.now() - receivedAt > 2000) {
        observed = {...state, transport:{...state.transport}};
        for (const key of ['isPlaying','recordMode','songTimeBeats','metronome']) observed.transport[key] = {...state.transport[key],fresh:false};
      }
      return {connected, role, state:observed, busy, error:error || readError, writable: connected && ['controller','admin'].includes(role)};
    };
    const notify = () => render(view());
    function session(open, nextRole = 'viewer') {
      generation++; connected = open; role = nextRole; state = null; busy = false; reading = null; error = null; readError = null; notify();
    }
    function command(name, args = {}) {
      if (!connected || (WRITES.has(name) && !view().writable)) return Promise.reject(Error('REC:SESSION'));
      const read = name === 'getRecordingState';
      if (read && busy) return Promise.resolve(view().state);
      if (read && reading) return reading;
      if (busy && name !== 'recordingStop') return Promise.reject(Error('REC:BUSY'));
      if (!read) {generation++; reading = null;}
      const epoch = generation;
      if (!read) {busy = true; error = null; notify();}
      const request = new Promise((resolve, reject) => {
        let settled = false;
        function finish(response) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (epoch !== generation) { reject(Error('REC:SESSION')); return; }
          if (!read) busy = false;
          if (response?.ok && response.result) {
            state = response.result; receivedAt = Date.now();
            if(read) readError = state.error || null; else error = state.error || null;
            notify(); resolve(state);
          } else {
            const message = response?.error || 'REC:UNKNOWN';
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
    return {view, session, command};
  }
  // Arrangement marker geometry; no audio data or take-lane representation.
  function timelineBounds(locators, zoom = 1) {
    const end = Math.max(16, ...locators.map(cue => cue.time + 4));
    return {start:0, end, width:Math.max(1,Math.min(8,zoom)) * 100};
  }
  function setup() {
    const doc = root.document, page = doc.getElementById('page-recording');
    if (!page) return;
    const elements = Object.fromEntries(['rec-status','rec-track','rec-start','rec-stop','rec-click','rec-arm-state','rec-start-marker','rec-end-marker',
      'rec-loop','rec-end-field','rec-timeline-track','rec-markers','rec-cursor','rec-region','rec-zoom','rec-position'].map(id => [id.slice(4),doc.getElementById(id)]));
    const el = id => elements[id];
    let trackSignature='', markerSignature='', rangeSignature='', refreshTimer=null, frame=null;
    let startIndex='', endIndex='', looping=false, zoom=1, bounds=timelineBounds([]), previousLocators=[];
    const client = createClient({send:(name,args,cb)=>root.sendPhoneCommand(name,args,cb),render});
    const invoke = (name,args) => client.command(name,args).catch(()=>{});
    const cueAt = index => index === '' ? null : client.view().state?.locators[Number(index)] || null;
    const markerRef = cue => ({name:cue.name,time:cue.time});
    function manualArmTrack(view) {
      const state=view.state, transport=state?.transport;
      if(!view.writable || view.busy || state?.pending || !transport?.connected || !transport.isPlaying?.fresh || transport.isPlaying.value!==false
        || !transport.recordMode?.fresh || transport.recordMode.value!==false) return null;
      const track=state.tracks.find(track=>track.index===state.selected?.index);
      return track?.canArm===true && typeof track.arm==='boolean'?track:null;
    }
    const positionLabel = (time,meter) => {
      if (!Number.isFinite(time) || !meter?.numerator || !meter?.denominator) return '?';
      const pos=beatsToPosition(time,meter);return pos.bar+'.'+pos.beat;
    };
    const percent = time => Math.max(0,Math.min(100,(time-bounds.start)/(bounds.end-bounds.start)*100));
    function reason(error) {
      const code=String(error).match(/REC:([A-Z_]+)/)?.[1];
      const translated=code?t('reason.'+code):'';
      return translated && translated!=='rec.reason.'+code?translated:t('checkLive');
    }
    function option(select,value,label) {
      const item=doc.createElement('option');item.value=value;item.textContent=label;select.appendChild(item);return item;
    }
    function updateRange() {
      const state=client.view().state, start=cueAt(startIndex);
      if(!state) return;
      if(looping && cueAt(endIndex)?.time <= (start?.time ?? -1)) endIndex='';
      el('start-marker').value=startIndex;el('end-marker').value=endIndex;
      for(const item of el('end-marker').children) item.disabled=item.value!=='' && state.locators[Number(item.value)]?.time <= (start?.time ?? -1);
      el('end-field').hidden=!looping;el('loop').setAttribute('aria-pressed',String(looping));
      el('loop').textContent=t('loop')+' · '+t(looping?'on':'off');
      const end=looping?cueAt(endIndex):null;
      el('region').hidden=!start || !end;
      if(start && end) {el('region').style.left=percent(start.time)+'%';el('region').style.width=(percent(end.time)-percent(start.time))+'%';}
      for(const marker of el('markers').children) marker.setAttribute('aria-pressed',String(marker.dataset.index===startIndex));
    }
    function drawCursor() {
      const state=client.view().state, clock=root.triggerNoteClockSnapshot, now=root.performance?.now?.() ?? 0;
      const fresh=clock?.valid && clock.playing && Number.isFinite(clock.receivedAt) && now>=clock.receivedAt && now-clock.receivedAt<=1000;
      const time=fresh?clock.beat+(now-clock.receivedAt)*clock.bpm/60000
        :state?.transport?.songTimeBeats?.fresh?state.transport.songTimeBeats.value:null;
      el('cursor').hidden=!Number.isFinite(time);
      if(Number.isFinite(time)) {
        el('cursor').style.left=percent(time)+'%';
        const label=positionLabel(time,state?.meter);if(el('position').textContent!==label) el('position').textContent=label;
      }
    }
    function render(view) {
      const state=view.state, transport=state?.transport;
      const known=transport?.connected && transport.isPlaying?.fresh && transport.recordMode?.fresh;
      const stopped=known && transport.isPlaying.value===false && transport.recordMode.value===false;
      const working=view.busy || Boolean(state?.pending);
      const editable=view.writable && !working && stopped;
      el('status').textContent=view.error?reason(view.error):working?t('working'):t(!known?'unknown':transport.recordMode.value?'recordObserved':transport.isPlaying.value?'playing':'stopped');
      el('status').dataset.recording=String(known && transport.recordMode.value===true);
      el('stop').disabled=!view.writable;
      for(const id of ['track','start-marker','end-marker']) el(id).disabled=!editable;
      el('loop').disabled=!editable || (!looping && !state?.locators?.some(cue=>cue.time>(cueAt(startIndex)?.time ?? Infinity)));
      el('click').disabled=!view.writable || working || !transport?.metronome?.fresh;
      el('click').textContent=t('click')+' · '+(transport?.metronome?.fresh?t(transport.metronome.value?'on':'off'):'?');
      el('arm-state').disabled=!manualArmTrack(view);
      el('arm-state').textContent='?';el('arm-state').setAttribute('aria-pressed','false');
      for(const marker of el('markers').children) marker.disabled=!editable;
      if(!state) {el('start').disabled=true;el('cursor').hidden=true;return;}
      const signature=JSON.stringify(state.tracks.map(track=>[track.index,track.id,track.name,track.canArm]));
      if(trackSignature!==signature) {
        trackSignature=signature;el('track').replaceChildren();option(el('track'),'',t('chooseTrack'));
        for(const track of state.tracks) option(el('track'),String(track.index),(track.index+1)+' · '+track.name).disabled=track.canArm!==true;
      }
      const selected=state.selected?String(state.selected.index):'';
      if(el('track').value!==selected) el('track').value=selected;
      const selectedTrack=state.tracks.find(track=>track.index===state.selected?.index);
      el('arm-state').textContent=selectedTrack?t(selectedTrack.arm===true?'trackArmed':selectedTrack.arm===false?'trackDisarmed':'unknown'):'';
      el('arm-state').setAttribute('aria-pressed',String(selectedTrack?.arm===true));
      el('arm-state').setAttribute('aria-label',t(selectedTrack?.arm===true?'disarm':'arm'));
      const markerKey=JSON.stringify([state.locators,state.meter]);
      if(markerSignature!==markerKey) {
        const previous=startIndex!==''?previousLocators[Number(startIndex)]:null;
        const previousEnd=endIndex!==''?previousLocators[Number(endIndex)]:null;markerSignature=markerKey;
        el('start-marker').replaceChildren();el('end-marker').replaceChildren();el('markers').replaceChildren();
        option(el('start-marker'),'',t('chooseMarker'));option(el('end-marker'),'',t('chooseEnd'));
        bounds=timelineBounds(state.locators,zoom);el('timeline-track').style.width=bounds.width+'%';
        state.locators.forEach((cue,index)=>{
          const label=cue.name+' · '+positionLabel(cue.time,state.meter);
          option(el('start-marker'),String(index),label);option(el('end-marker'),String(index),label);
          const marker=doc.createElement('button');marker.type='button';marker.textContent=cue.name;marker.title=label;
          marker.className='rec-marker';marker.dataset.index=String(index);marker.style.left=percent(cue.time)+'%';
          marker.addEventListener('click',()=>{
            if(marker.disabled || !client.view().state) return;
            startIndex=String(index);updateRange();invoke('recordingSeekMarker',markerRef(cue));
          });
          el('markers').appendChild(marker);
        });
        const preserved=previous?state.locators.findIndex(cue=>cue.name===previous.name && cue.time===previous.time):-1;
        startIndex=preserved>=0?String(preserved):previous?'':state.locators.length?'0':'';
        const retainedEnd=previousEnd?state.locators.findIndex(cue=>cue.name===previousEnd.name && cue.time===previousEnd.time):-1;
        endIndex=retainedEnd>=0?String(retainedEnd):'';
        previousLocators=state.locators.map(cue=>({...cue}));
      }
      const rangeKey=JSON.stringify(state.range || null);
      if(rangeSignature!==rangeKey) {
        rangeSignature=rangeKey;
        if(state.range) {
          const index=state.locators.findIndex(cue=>cue.name===state.range.start.name && cue.time===state.range.start.time);
          startIndex=index>=0?String(index):'';looping=state.range.loop;
          const end=state.range.end && state.locators.findIndex(cue=>cue.name===state.range.end.name && cue.time===state.range.end.time);
          endIndex=typeof end==='number' && end>=0?String(end):'';
        }
      }
      updateRange();
      el('loop').disabled=!editable || (!looping && !state.locators.some(cue=>cue.time>(cueAt(startIndex)?.time ?? Infinity)));
      el('start').disabled=!editable || selectedTrack?.canArm!==true || !cueAt(startIndex) || (looping && !cueAt(endIndex));
      if(!view.error && !working && stopped) el('status').textContent=t(!selectedTrack?'chooseTrack':!state.locators.length?'createMarkers':!cueAt(startIndex)?'chooseMarker':looping && !cueAt(endIndex)?'chooseEnd':'ready');
      for(const marker of el('markers').children) marker.disabled=!editable;
      drawCursor();
    }
    el('track').addEventListener('change',()=>{
      const track=client.view().state?.tracks.find(track=>String(track.index)===el('track').value);
      if(track) invoke('recordingSelectTrack',{index:track.index,id:track.id,name:track.name});
    });
    el('arm-state').addEventListener('click',()=>{
      const track=manualArmTrack(client.view());
      if(track) invoke('recordingArm',{enabled:!track.arm,track:{index:track.index,id:track.id,name:track.name}});
    });
    el('start-marker').addEventListener('change',()=>{
      startIndex=el('start-marker').value;updateRange();const cue=cueAt(startIndex);
      if(cue) invoke('recordingSeekMarker',markerRef(cue));
    });
    el('end-marker').addEventListener('change',()=>{endIndex=el('end-marker').value;render(client.view());});
    el('loop').addEventListener('click',()=>{
      looping=!looping;
      if(looping && !cueAt(endIndex)) {
        const index=client.view().state.locators.findIndex(cue=>cue.time>(cueAt(startIndex)?.time ?? Infinity));endIndex=index>=0?String(index):'';
      }
      render(client.view());
    });
    el('zoom').addEventListener('input',()=>{zoom=Number(el('zoom').value);bounds=timelineBounds(client.view().state?.locators || [],zoom);el('timeline-track').style.width=bounds.width+'%';drawCursor();});
    el('start').addEventListener('click',()=>{
      const state=client.view().state,track=state?.tracks.find(track=>track.index===state.selected?.index),start=cueAt(startIndex),end=looping?cueAt(endIndex):null;
      if(track && start) invoke('recordingRecord',{track:{index:track.index,id:track.id,name:track.name},range:{start:markerRef(start),end:end?markerRef(end):null,loop:looping}});
    });
    el('stop').addEventListener('click',()=>invoke('recordingStop'));
    el('click').addEventListener('click',()=>invoke('recordingClick',{enabled:!client.view().state?.transport.metronome.value}));
    function animate() {
      frame=null;if(doc.hidden || doc.body.dataset.page!=='recording' || !client.view().connected) return;
      drawCursor();frame=root.requestAnimationFrame?.(animate);
    }
    function poll() {
      clearTimeout(refreshTimer);if(frame!=null) root.cancelAnimationFrame?.(frame);frame=null;
      if(doc.body.dataset.page!=='recording' || doc.hidden || !client.view().connected) return;
      if(!client.view().busy) invoke('getRecordingState');
      render(client.view());
      animate();refreshTimer=setTimeout(poll,750);
    }
    root.addEventListener('ableton-rc:phone-client-id',event=>{client.session(true,event.detail?.role || 'viewer');poll();});
    root.addEventListener('ableton-rc:phone-ws-close',()=>{client.session(false);clearTimeout(refreshTimer);if(frame!=null) root.cancelAnimationFrame?.(frame);frame=null;});
    root.addEventListener('ableton-rc:page-change',poll);
    doc.addEventListener('visibilitychange',poll);
    doc.addEventListener('rcsurface:languagechange',()=>{trackSignature='';markerSignature='';render(client.view());});
    render(client.view());return client;
  }
  root.RcRecording = Object.freeze({createClient, positionToBeats, beatsToPosition, timelineBounds, setup});
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded',setup,{once:true});
    else setup();
  }
})(typeof window !== 'undefined' ? window : globalThis);
