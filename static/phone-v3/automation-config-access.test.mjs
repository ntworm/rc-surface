// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({width=1000,height=800,columnLeft=width*0.36,columnRight=width*0.6,menuHeight=440}={}) {
  const listeners=new Map(),timers=new Map(),arms=[],operations=[];let nextTimer=0;
  const all=[];
  function element(tag='div',attrs={}) {
    const classes=new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    const el={tagName:tag.toUpperCase(),dataset:{},style:{},attributes:{...attrs},children:[],parent:null,textContent:'',offsetHeight:200,scrollTop:0,
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,force){if(force ?? !classes.has(value))classes.add(value);else classes.delete(value);}},
      setAttribute(name,value){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);},
      getAttribute(name){return this.attributes[name] ?? null;},removeAttribute(name){delete this.attributes[name];},
      appendChild(child){this.children.push(child);child.parent=this;},
      addEventListener(type,handler){(this.listeners ||= {})[type]=handler;},
      getBoundingClientRect(){return this.rect || {left:40,top:40,bottom:84,right:84,width:44,height:44};},
      matches(selector){
        if(selector.startsWith('#'))return this.attributes.id===selector.slice(1);
        if(selector==='[data-aut-config]')return Boolean(this.dataset.autConfig);
        if(selector==='[data-name]')return Boolean(this.dataset.name);
        if(selector==='.xy-aut-config')return classes.has('xy-aut-config');
        if(selector==='.col-xy')return classes.has('col-xy');
        if(selector.startsWith('.xy-pad'))return classes.has('xy-pad') && (!selector.includes('data-name="') || this.dataset.name===selector.match(/data-name="([^"]+)"/)[1]);
        if(selector.startsWith('.page['))return classes.has('page') && ['performance','mixer'].includes(this.dataset.page);
        if(selector.startsWith('[data-name="'))return this.dataset.name===selector.slice(12,-2);
        return false;
      },
      closest(selector){return this.matches(selector)?this:this.parent?.closest(selector) || null;},
      querySelector(selector){return all.find(child=>child!==this && child.closest('#'+this.attributes.id)===this && child.matches(selector)) || null;},
    };
    Object.defineProperty(el,'innerHTML',{get:()=>'',set:()=>{el.children=[];}});
    for(const [name,value]of Object.entries(attrs))el.setAttribute(name,value);
    all.push(el);return el;
  }
  const body=element('body'),page=element('main',{class:'page','data-page':'performance'});body.appendChild(page);
  const header=element('button',{id:'btn-aut-mode'}),menu=element('div',{id:'automation-config-menu',class:'hidden'});
  body.appendChild(header);body.appendChild(menu);
  menu.offsetHeight=menuHeight;
  const column=element('section',{class:'col-xy'});page.appendChild(column);
  column.rect={left:columnLeft,right:columnRight,top:48,bottom:height-8,width:columnRight-columnLeft,height:height-56};
  const buttons=[],pads=[];
  for(const name of ['xy-1','xy-2']) {
    const block=element('div',{class:'xy-block'}),toolbar=element('div',{class:'xy-aut-toolbar'});
    const button=element('button',{class:'xy-aut-config','data-aut-config':name,'aria-expanded':'false'});
    const pad=element('div',{class:'xy-pad','data-name':name});pad.setPointerCapture=()=>{};
    const top=48+(name==='xy-1'?0:(height-56)/2);
    button.rect={left:columnRight-44,right:columnRight,top,bottom:top+44,width:44,height:44};
    pad.rect={left:columnLeft,right:columnRight,top:top+44,bottom:top+(height-56)/2,width:columnRight-columnLeft,height:(height-56)/2-44};
    column.appendChild(block);block.appendChild(toolbar);toolbar.appendChild(button);block.appendChild(pad);buttons.push(button);pads.push(pad);
  }
  const document={readyState:'complete',body,hidden:false,documentElement:{clientWidth:width,clientHeight:height},
    getElementById:id=>all.find(el=>el.attributes.id===id) || null,createElement:tag=>element(tag),
    querySelector:selector=>all.find(el=>el.matches(selector)) || null,querySelectorAll:selector=>all.filter(el=>el.matches(selector)),
    addEventListener(type,handler,options){const key=type+':' + (options===true || options?.capture?'capture':'bubble');if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(handler);},
    removeEventListener(){},
  };
  const loops={ 'xy-1':{saved:{timing:'free',seconds:10,bars:1},stage:'stopped'},'xy-2':{saved:{timing:'sync',seconds:20,bars:2,points:[[0,0],[1,1]]},stage:'playing'}};
  const root={document,addEventListener(){},RcConfigModeInstance:{off:()=>operations.push('cfg-off')},
    mobileMappingState:{open:true},closeMobileMappingMode(){this.mobileMappingState.open=false;},
    XYAutomation:{get:name=>loops[name],arm:name=>arms.push(name),play:name=>operations.push('play:'+name),stop:name=>operations.push('stop:'+name),configure(name,patch){Object.assign(loops[name].saved,patch);operations.push('configure:'+name);},clear:()=>operations.push('clear'),stopAll:()=>operations.push('stopAll')},
  };
  const context=vm.createContext({window:root,document,setTimeout:handler=>{timers.set(++nextTimer,handler);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(new URL('./config-mode.js',import.meta.url),'utf8'),context);root.RcConfigMode=context.RcConfigMode;
  vm.runInContext(fs.readFileSync(new URL('./automation-mode.js',import.meta.url),'utf8'),context);
  const dispatch=(type,target,patch={})=>{
    const event={type,target,button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;},...patch};
    for(const phase of ['capture','bubble']) {
      for(const handler of listeners.get(type+':'+phase)||[]) {handler(event);if(event.immediate)break;}
      if(event.stopped)break;
    }
    return event;
  };
  return {mode:root.RcAutomationMode,buttons,pads,menu,column,body,root,loops,arms,operations,timers,dispatch};
}

test('AUT removes individual XY toolbars and preserves 100% pad dimensions',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.equal([...html.matchAll(/data-aut-config="([^"]+)"/g)].length,0,'individual AUT config buttons are removed');
  assert.equal([...html.matchAll(/class="xy-aut-toolbar"/g)].length,0,'individual AUT toolbars are removed');
  const css=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
  assert.equal(css.includes('.xy-aut-toolbar'),false,'no toolbar styles remain');
  assert.equal(css.includes('.xy-aut-config'),false,'no config button styles remain');
  assert.match(css,/#automation-config-menu\s*\{[^}]*min-width:\s*0/,'menu styling preserved');
});

test('AUT uses either free side and retains a closeable bounded menu when no side can fit a touch target',()=>{
  for(const [columnLeft,columnRight,expectedSide] of [[20,180,'right'],[370,540,'left'],[8,560,null]]) {
    const f=fixture({width:568,height:320,columnLeft,columnRight});f.mode.on();f.dispatch('click',f.buttons[0]);
    const left=parseFloat(f.menu.style.left),width=parseFloat(f.menu.style.width);
    assert.ok(width>=44 && left>=8 && left+width<=560);
    if(expectedSide==='right')assert.ok(left>=columnRight+6);
    if(expectedSide==='left')assert.ok(left+width<=columnLeft-6);
    f.menu.children[0].children[1].listeners.click();
    assert.equal(f.mode.state.openFor,null);assert.equal(f.mode.state.on,false);
  }
});

test('AUT menu geometry reserves both XY buttons and status through target switches and refreshed settings',()=>{
  for(const [width,height] of [[320,240],[568,320],[844,390],[1024,768],[1440,900]]) {
    const f=fixture({width,height});f.mode.on();
    const assertClear=()=>{
      const left=parseFloat(f.menu.style.left),top=parseFloat(f.menu.style.top),menuWidth=parseFloat(f.menu.style.width);
      const menuHeight=Math.min(f.menu.offsetHeight,parseFloat(f.menu.style.maxHeight));
      assert.ok(left>=8 && left+menuWidth<=width-8,`${width}: horizontally bounded`);
      assert.ok(top>=8 && top+menuHeight<=height-8,`${width}: vertically bounded`);
      assert.ok(menuWidth>=44,`${width}: usable side space`);
      const xy=f.column.getBoundingClientRect();
      assert.ok(left+menuWidth<=xy.left-6 || left>=xy.right+6,`${width}: menu cannot cover either XY toolbar or status`);
    };
    f.dispatch('click',f.buttons[0]);assertClear();
    f.dispatch('pointerdown',f.buttons[1]);f.dispatch('pointerup',f.buttons[1]);f.dispatch('click',f.buttons[1]);
    assert.equal(f.mode.state.openFor,'xy-2');assertClear();
    const free=f.menu.children[1].children[0].children[1].children.find(child=>child.textContent==='FREE');
    free.listeners.click();assert.equal(f.loops['xy-2'].saved.timing,'free');assertClear();
    assert.deepEqual(f.arms,[]);
  }
});

test('AUT config button opens, toggles and switches the real shared menu without recording or changing either loop',()=>{
  const f=fixture(),before=JSON.stringify(f.loops);f.mode.on();
  assert.equal(f.root.mobileMappingState.open,false);assert.deepEqual(f.operations,['cfg-off']);
  f.dispatch('pointerdown',f.buttons[0]);f.dispatch('pointerup',f.buttons[0]);f.dispatch('click',f.buttons[0]);
  assert.equal(f.mode.state.openFor,'xy-1');assert.equal(f.buttons[0].getAttribute('aria-expanded'),'true');assert.equal(f.timers.size,0);
  f.dispatch('pointerdown',f.buttons[0]);f.dispatch('pointerup',f.buttons[0]);f.dispatch('click',f.buttons[0]);
  assert.equal(f.mode.state.openFor,null);assert.equal(f.mode.state.on,true);assert.equal(f.buttons[0].getAttribute('aria-expanded'),'false');
  f.dispatch('click',f.buttons[0]);f.dispatch('pointerdown',f.buttons[1]);f.dispatch('pointerup',f.buttons[1]);f.dispatch('click',f.buttons[1]);
  assert.equal(f.mode.state.openFor,'xy-2');assert.equal(f.buttons[0].getAttribute('aria-expanded'),'false');assert.equal(f.buttons[1].getAttribute('aria-expanded'),'true');
  f.dispatch('keydown',f.buttons[1],{key:'Escape'});assert.equal(f.mode.state.openFor,null);assert.equal(f.buttons[1].getAttribute('aria-expanded'),'false');
  assert.deepEqual(f.arms,[]);assert.deepEqual(f.operations,['cfg-off']);assert.equal(JSON.stringify(f.loops),before);
});

test('AUT config is keyboard accessible and stale button input cannot act after AUT is turned off',()=>{
  const f=fixture();f.mode.on();
  assert.equal(f.dispatch('keydown',f.buttons[0],{key:'Enter'}).defaultPrevented,true);assert.equal(f.mode.state.openFor,'xy-1');
  f.dispatch('keydown',f.buttons[0],{key:' '});assert.equal(f.mode.state.openFor,null);
  f.dispatch('keydown',f.buttons[1],{key:'Enter'});assert.equal(f.mode.state.openFor,'xy-2');
  f.mode.off();assert.equal(f.buttons[1].getAttribute('aria-expanded'),'false');
  f.dispatch('click',f.buttons[0]);assert.equal(f.mode.state.openFor,null);assert.equal(f.mode.state.on,false);assert.deepEqual(f.arms,[]);
});

test('AUT config cancels a pending XY selection and ordinary pad taps still record one XY afterwards',()=>{
  const f=fixture();f.mode.on();f.dispatch('pointerdown',f.pads[0]);assert.equal(f.timers.size,1);
  f.dispatch('pointerdown',f.buttons[1],{pointerId:2});assert.equal(f.timers.size,0);
  f.dispatch('pointerup',f.pads[0]);f.dispatch('click',f.buttons[1]);assert.equal(f.mode.state.openFor,'xy-2');assert.deepEqual(f.arms,[]);
  f.dispatch('click',f.buttons[1]);f.dispatch('pointerdown',f.pads[0]);f.dispatch('pointerup',f.pads[0]);
  assert.deepEqual(f.arms,['xy-1']);assert.equal(f.mode.state.on,false);assert.equal(f.timers.size,0);
});

test('AUT config actions and right-click retain transient closing so performance resumes without a new capture',()=>{
  const f=fixture();f.mode.on();f.dispatch('click',f.buttons[1]);
  const play=f.menu.children[1].children.find(child=>child.textContent==='Play loop');assert.ok(play);
  play.listeners.click();assert.equal(f.mode.state.on,false);assert.deepEqual(f.operations,['cfg-off','play:xy-2']);
  f.dispatch('pointerdown',f.pads[1]);f.dispatch('pointerup',f.pads[1]);assert.deepEqual(f.arms,[]);
  f.mode.on();f.dispatch('contextmenu',f.pads[0],{button:2});assert.equal(f.mode.state.openFor,'xy-1');
  assert.equal(f.buttons[0].getAttribute('aria-expanded'),'true');
  f.dispatch('contextmenu',f.pads[0],{button:2});assert.equal(f.mode.state.on,false);assert.equal(f.buttons[0].getAttribute('aria-expanded'),'false');
});
