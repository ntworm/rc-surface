// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function(root) {
  'use strict';
  function create(options={}) {
    const engine=root.RcXYAutomation;
    const items=new Map();
    const now=options.now || (()=>performance.now());
    const connection=options.connection || (()=>root.phoneWs);
    const permitted=options.permitted || (()=>connection()?.readyState===1 && ['controller','admin'].includes(root.state?.role) && !document.hidden);
    const clock=options.clock || (()=>root.triggerNoteClockSnapshot);
    const storage=options.storage || root.localStorage;
    const changed=options.changed || (()=>root.dispatchEvent(new Event('ableton-rc:performance-settings-change')));
    const loss=options.loss || ((name,xy)=>root.onControl?.({name,x:xy.x,y:xy.y,lost:true}));
    let initial={};
    try {initial=JSON.parse(storage?.getItem('ableton-rc:v2:xy_automation') || '{}');} catch {}
    const capture=()=>({version:1,xy:Object.fromEntries([...items].map(([name,item])=>[name,engine.validate(item.auto.saved)]))});
    function persist() {
      try {storage?.setItem('ableton-rc:v2:xy_automation',JSON.stringify(capture().xy));} catch {}
      changed();
    }
    function render(item,result={}) {
      const state=item.auto;
      const label=state.stage==='countdown'?String(result.countdown ?? 3)
        : state.stage==='recording'?'REC':state.stage==='playing'?(state.manual?'OVR':'LOOP'):state.stage==='paused'?'SYNC':state.reason?'!':state.saved.points?'AUT':'';
      if(item.status && item.status.textContent!==label) item.status.textContent=label;
      if(item.el) {
        item.el.dataset.autState=state.stage;
        item.el.dataset.autFlash=String(result.flash===true);
      }
    }
    function stop(name,reason=null,sendLoss=true) {
      const item=items.get(name);if(!item) return;
      if(engine.stop(item.auto,reason)) {
        root.RcXYEngine.stop(item.xy);
        if(sendLoss && item.session===connection()) loss(name,item.xy);
      }
      render(item);
    }
    function run(name,action) {
      if(!permitted()) throw new Error('connection');
      const item=items.get(name);if(!item) throw new Error('target');
      engine[action](item.auto,clock(),now());item.session=connection();item.fresh=true;
      if(action==='arm') for(const [other,entry]of items) {
        if(other!==name && ['countdown','recording'].includes(entry.auto.stage)) stop(other);
      }
      root.RcXYEngine.stop(item.xy);render(item);
    }
    function tick(time=now()) {
      for(const [name,item]of items) {
        if(item.auto.stage==='stopped') continue;
        if(!permitted() || item.session!==connection()) {stop(name,'connection',item.session===connection());continue;}
        const result=engine.tick(item.auto,clock(),time,item.xy);
        if(result.stopped || result.suspended) {
          root.RcXYEngine.stop(item.xy);loss(name,item.xy);
        }
        if(result.point && (item.fresh || result.committed || result.resumed || result.point.x!==item.xy.x || result.point.y!==item.xy.y)) {
          item.xy.x=result.point.x;item.xy.y=result.point.y;item.emit();
          item.fresh=false;
        }
        render(item,result);
        if(result.committed) persist();
      }
    }
    const api={
      register(name,xy,el,emit) {
        let auto;try {auto=engine.create(initial[name]);} catch {auto=engine.create();}
        const item={auto,xy,el,emit,status:el?.querySelector('.xy-aut-status'),session:null};
        items.set(name,item);render(item);
      },
      get:name=>items.get(name)?.auto,
      playing:name=>['playing','paused'].includes(items.get(name)?.auto.stage),
      owns:name=>{const state=items.get(name)?.auto;return state && state.stage!=='stopped';},
      arm:name=>run(name,'arm'),play:name=>run(name,'play'),stop,
      stopAll(reason=null,sendLoss=true) {for(const name of items.keys()) stop(name,reason,sendLoss);},
      manual(name,pressed) {
        const item=items.get(name);if(!item) return;
        item.auto.manual=pressed;
        if(!pressed && item.auto.stage==='playing') {item.fresh=true;tick();}
      },
      configure(name,patch) {
        if(!permitted()) throw new Error('connection');
        const item=items.get(name);if(!item) return;
        const saved=engine.validate({...item.auto.saved,...patch});stop(name);item.auto.saved=saved;persist();render(item);
      },
      clear(name) {
        if(!permitted()) throw new Error('connection');
        const item=items.get(name);if(!item) return;
        stop(name);delete item.auto.saved.points;persist();render(item);
      },
      capture,
      apply(value) {
        const entries=value?.version===1 && value.xy && typeof value.xy==='object'?value.xy:{};
        for(const [name,item]of items) {
          let saved;try {saved=engine.validate(entries[name] || engine.defaults);} catch {continue;}
          if(JSON.stringify(saved)===JSON.stringify(item.auto.saved)) continue;
          stop(name);item.auto=engine.create(saved);render(item);
        }
        try {storage?.setItem('ableton-rc:v2:xy_automation',JSON.stringify(capture().xy));} catch {}
      },
      tick,
    };
    return api;
  }
  root.RcXYAutomationController={create};
})(globalThis);
