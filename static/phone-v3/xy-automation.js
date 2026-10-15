// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function(root) {
  'use strict';
  const MAX_PAIRS=1024;
  const defaults=Object.freeze({timing:'sync',bars:2,seconds:10});
  const mod=(value,total)=>((value%total)+total)%total;
  const clamp=value=>Math.max(0,Math.min(1,value));
  function validate(entry) {
    if(!entry || !['sync','free'].includes(entry.timing) || !Number.isInteger(entry.bars) || entry.bars<1 || entry.bars>5
      || !Number.isInteger(entry.seconds) || entry.seconds<1 || entry.seconds>30
      || Object.keys(entry).some(key=>!['timing','bars','seconds','points'].includes(key))) throw new Error('Invalid XY automation settings');
    if(entry.points!==undefined && (!Array.isArray(entry.points) || entry.points.length<4
      || entry.points.length>MAX_PAIRS*2 || entry.points.length%2
      || entry.points.some(value=>!Number.isInteger(value) || value<0 || value>65535))) throw new Error('Invalid XY automation points');
    return {timing:entry.timing,bars:entry.bars,seconds:entry.seconds,...entry.points?{points:[...entry.points]}:{}};
  }
  function create(entry=defaults) {
    return {saved:validate(entry),stage:'stopped',manual:false,reason:null,origin:0,lastTime:null,epoch:null,meter:null,pending:null};
  }
  function clockUnit(state,clock,now) {
    if(state.saved.timing==='free') return now/1000;
    if(!clock?.valid || !clock.playing || !Number.isFinite(clock.beat) || !Number.isFinite(clock.bpm) || clock.bpm<=0
      || !Number.isFinite(clock.beatsPerBar) || clock.beatsPerBar<=0 || !Number.isFinite(clock.receivedAt)
      || !Number.isSafeInteger(clock.epoch) || clock.epoch<0
      || now<clock.receivedAt || now-clock.receivedAt>1000) throw new Error('clock');
    return clock.beat+(now-clock.receivedAt)*clock.bpm/60000;
  }
  function stop(state,reason=null) {
    const wasActive=state.stage!=='stopped';
    state.stage='stopped';state.manual=false;state.pending=null;state.reason=reason;state.lastTime=null;
    return wasActive;
  }
  function begin(state,kind,clock,now) {
    const unit=clockUnit(state,clock,now);
    state.reason=null;state.manual=false;state.epoch=clock?.epoch;state.meter=clock?.beatsPerBar;
    state.duration=state.saved.timing==='sync'?state.saved.bars*clock.beatsPerBar:state.saved.seconds;
    state.stage=kind;state.lastTime=now;
    state.origin=kind==='countdown'?(state.saved.timing==='sync'?Math.ceil(unit):unit)+3:unit;
    return unit;
  }
  function arm(state,clock,now) {
    begin(state,'countdown',clock,now);
    const seconds=state.saved.timing==='sync'?state.duration*60/clock.bpm:state.duration;
    state.pending={pairs:Math.min(MAX_PAIRS,Math.max(2,Math.ceil(seconds*30))),points:[],previous:null};
  }
  function play(state,clock,now) {
    if(!state.saved.points) throw new Error('empty');
    begin(state,'playing',clock,now);
  }
  function samplePoints(points,phase) {
    if(!points) return null;
    const count=points.length/2;
    const position=mod(phase,1)*count;
    const index=Math.floor(position),next=(index+1)%count,weight=position-index;
    return {x:(points[index*2]*(1-weight)+points[next*2]*weight)/65535,
      y:(points[index*2+1]*(1-weight)+points[next*2+1]*weight)/65535};
  }
  function sample(state,phase) {return samplePoints(state.saved.points,phase);}
  function tick(state,clock,now,point) {
    if(state.stage==='stopped') return {};
    let resumed=false;
    if(state.saved.timing==='sync' && ['playing','paused'].includes(state.stage)) {
      const fresh=Number.isFinite(clock?.receivedAt) && now>=clock.receivedAt && now-clock.receivedAt<=1000;
      // A confirmed STOP is stationary: the existing host polling may be
      // quiet longer than the playing-clock freshness window. Keep the pause,
      // but require a fresh valid Play observation before emitting again.
      const stopped=clock?.playing===false && clock.reason==='stopped';
      if(stopped || (fresh && ((clock.valid && clock.playing===false) || clock.reason==='count_in'))) {
        const suspended=state.stage!=='paused';state.stage='paused';
        return {suspended};
      }
      if(state.stage==='paused') {state.stage='playing';resumed=true;}
    }
    let unit;
    try {unit=clockUnit(state,clock,now);} catch {stop(state,'clock');return {stopped:true};}
    const capturing=state.stage==='countdown' || state.stage==='recording';
    if(capturing && (!Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {stop(state,'point');return {stopped:true};}
    if(state.saved.timing==='sync' && (clock.beatsPerBar!==state.meter || (capturing && clock.epoch!==state.epoch))) {
      stop(state,'timeline');return {stopped:true};
    }
    if(capturing && (now-state.lastTime>250 || now<state.lastTime)) {stop(state,'gap');return {stopped:true};}
    state.lastTime=now;
    if(state.stage==='countdown') {
      if(unit<state.origin) {
        const remaining=state.origin-unit;
        return {countdown:Math.min(3,Math.ceil(remaining)),flash:remaining<=3 && mod(3-remaining,1)<.45};
      }
      state.stage='recording';
    }
    let committed=false;
    if(state.stage==='recording') {
      const pending=state.pending;
      const phase=Math.max(0,Math.min(1,(unit-state.origin)/state.duration));
      const current={phase,x:clamp(point.x),y:clamp(point.y)};
      const previous=pending.previous || current;
      while(pending.points.length/2<pending.pairs && pending.points.length/2/pending.pairs<=phase) {
        const at=pending.points.length/2/pending.pairs;
        const weight=phase>previous.phase?clamp((at-previous.phase)/(phase-previous.phase)):1;
        pending.points.push(Math.round((previous.x+(current.x-previous.x)*weight)*65535),
          Math.round((previous.y+(current.y-previous.y)*weight)*65535));
      }
      pending.previous=current;
      if(phase<1) return {};
      let points=pending.points;
      if(state.saved.timing==='sync') {
        // Store the completed gesture against the Arrangement grid. Playback
        // can then follow seeks and stop/play without resetting to click time.
        const aligned=[];
        for(let i=0;i<pending.pairs;i++) {
          const value=samplePoints(points,i/pending.pairs-state.origin/state.duration);
          aligned.push(Math.round(value.x*65535),Math.round(value.y*65535));
        }
        points=aligned;
      }
      state.saved={...state.saved,points};state.pending=null;state.stage='playing';committed=true;
    }
    const phase=state.saved.timing==='sync'?unit/state.duration:(unit-state.origin)/state.duration;
    const value=state.manual?null:sample(state,phase);
    return {point:value,committed,resumed};
  }
  root.RcXYAutomation=Object.freeze({defaults,MAX_PAIRS,validate,create,stop,arm,play,tick,sample});
})(globalThis);
