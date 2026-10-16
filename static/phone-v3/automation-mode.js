// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(function(root) {
  'use strict';
  function setup() {
    const automation=root.XYAutomation;
    if(!automation || !root.RcConfigMode) return;
    const tr=(key,fallback)=>root.RcSurfaceI18n?.t(key) ?? fallback;
    let selecting=false,pointer=null;
    function cancelPointer() {if(pointer) clearTimeout(pointer.timer);pointer=null;}
    function syncConfigButtons(name=null) {
      for(const button of document.querySelectorAll?.('.xy-aut-config') || []) button.setAttribute('aria-expanded',String(button.dataset.autConfig===name));
    }
    function perform(action) {
      const status=document.getElementById('aut-message');
      try {action();if(status) status.textContent='';} catch(error) {
        const key=error.message==='clock'?'aut.clock':error.message==='empty'?'aut.empty':'aut.connection';
        const text=tr(key,{ 'aut.clock':'SYNC needs Live playback and a fresh clock',
          'aut.empty':'Record an XY loop first','aut.connection':'Connect as controller to use AUT' }[key]);
        root.showToast?.(text,'warning');
        if(status) status.textContent=text;
      }
    }
    const mode=root.RcConfigMode.create({buttonId:'btn-aut-mode',menuId:'automation-config-menu',
      modeClass:'automation-mode',primary:false,pages:['performance'],accept:name=>/^xy-[12]$/.test(name),
      contextEnabled:()=>mode.state.on,
      menuAvoidRect:()=>document.querySelector('.col-xy')?.getBoundingClientRect(),
      onActivate:()=>{root.RcConfigModeInstance?.off();selecting=true;},
      onDeactivate:()=>{selecting=false;cancelPointer();},
      onMenuChange:syncConfigButtons,
    });
    root.RcAutomationMode=mode;
    mode.register(/^xy-[12]$/,name=>{
      const saved=automation.get(name).saved;
      const choice=(key,label,values)=>({segment:{label,refresh:true,options:values.map(value=>({value,label:String(value).toUpperCase()})),
        get:()=>saved[key],set:value=>perform(()=>automation.configure(name,{[key]:value}))}});
      return [
        choice('timing',tr('cfg.clock','Timing'),['sync','free']),
        saved.timing==='sync'?choice('bars',tr('aut.bars','Bars'),[1,2,3,4,5]):{slider:{
          label:tr('aut.seconds','Seconds'),min:1,max:30,step:1,get:()=>saved.seconds,
          set:value=>perform(()=>automation.configure(name,{seconds:value})),format:value=>value+' s',
        }},
        {action:{label:tr('aut.record','Record / replace'),run:()=>perform(()=>{automation.arm(name);selecting=false;mode.close();})}},
        {action:{label:tr('aut.play','Play loop'),run:()=>perform(()=>automation.play(name))}},
        {action:{label:tr('aut.stop','Stop loop'),run:()=>automation.stop(name)}},
        {action:{label:tr('aut.clear','Clear loop'),danger:true,run:()=>{
          if(root.confirm(tr('aut.confirmClear','Clear this XY loop?'))) perform(()=>automation.clear(name));
        }}},
      ];
    });
    function consume(event) {event.preventDefault();event.stopImmediatePropagation();}
    function configButton(event) {
      const button=event.target.closest?.('[data-aut-config]');
      return mode.state.on && /^xy-[12]$/.test(button?.dataset.autConfig || '')?button:null;
    }
    function toggleConfig(event) {
      const button=configButton(event);if(!button) return;
      consume(event);cancelPointer();
      const name=button.dataset.autConfig;
      if(mode.state.openFor===name) {mode.state.contextMenuOpen=false;mode.close();}
      else {mode.state.contextMenuOpen=true;mode.open(name,button.getBoundingClientRect());}
    }
    // Register before the shared menu's outside handler: another XY's button
    // switches the editor, and the same button closes it, without arming.
    document.addEventListener('pointerdown',event=>{
      if(event.button!==0 || !configButton(event)) return;
      event.stopImmediatePropagation();cancelPointer();
    },true);
    document.addEventListener('click',toggleConfig,true);
    document.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' ') toggleConfig(event);},true);
    document.addEventListener('contextmenu',event=>{
      if(!mode.state.on) return;
      const target=named(event);if(!target) return;
      consume(event);cancelPointer();
      const name=target.dataset.name;
      if(mode.state.openFor===name) mode.close();
      else {mode.state.contextMenuOpen=true;mode.open(name,target.getBoundingClientRect());}
    },true);
    mode.attach();
    function named(event) {return event.target.closest?.('.xy-pad[data-name]');}
    document.addEventListener('pointerdown',event=>{
      if(!mode.state.on || !selecting || event.button!==0) return;
      const target=named(event);if(!target) return;
      consume(event);
      if(pointer) return;
      pointer={id:event.pointerId,target,x:event.clientX,y:event.clientY,cancelled:false,long:false};
      const pending=pointer;
      target.setPointerCapture?.(event.pointerId);
      pointer.timer=setTimeout(()=>{
        if(pointer!==pending || pending.cancelled || !mode.state.on) return;
        pointer.long=true;mode.state.contextMenuOpen=true;mode.open(target.dataset.name,target.getBoundingClientRect());
      },600);
    },true);
    document.addEventListener('pointermove',event=>{
      if(!pointer || pointer.id!==event.pointerId) return;
      consume(event);
      if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8) {
        pointer.cancelled=true;clearTimeout(pointer.timer);
      }
    },true);
    const finish=(event,cancelled=false)=>{
      if(!pointer || pointer.id!==event.pointerId) return;
      consume(event);const pending=pointer;clearTimeout(pending.timer);pointer=null;
      if(!cancelled && !pending.cancelled && !pending.long) perform(()=>{
        automation.arm(pending.target.dataset.name);selecting=false;mode.off();
      });
    };
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('pointercancel',event=>finish(event,true),true);
    root.addEventListener('ableton-rc:phone-ws-close',()=>{automation.stopAll('connection',false);mode.off();});
    root.addEventListener('ableton-rc:phone-client-id',()=>{automation.stopAll(null,false);mode.off();});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden) {automation.stopAll('hidden');mode.off();}
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup);
  else setup();
})(window);
