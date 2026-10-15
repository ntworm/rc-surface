// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('restoring, adding and clearing poses retain card IDs and bind new controls once',()=>{
  const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const start=app.indexOf('    function syncGestureSlotCards()');
  const end=app.indexOf('    gestureSlotCards.forEach(bindGestureSlotCard);',start);
  const bound=[];
  const cards=[];
  function card(id) {
    const header={textContent:`G${id}`};
    const element={dataset:{gestureSlot:String(id),name:`sensor.vision.gesture.${id}`,poseBound:'1'},
      querySelector:selector=>selector==='header span'?header:null, classList:{remove(){}},
      cloneNode:()=>card(id), remove(){cards.splice(cards.indexOf(this),1);}};
    return element;
  }
  cards.push(card(1),card(2),card(3));
  const add={disabled:false};const context={window:{VISION_MAX_LEARNED_POSES:15},gestureSlotCards:[...cards],gestureSlotTemplate:card(1),
    visionControls:{slots:Array.from({length:15},(_,i)=>({id:i+1}))},
    document:{querySelector:()=>({appendChild:element=>{const index=cards.indexOf(element);if(index>=0)cards.splice(index,1);cards.push(element);}}),getElementById:()=>add},
    bindGestureSlotCard:element=>bound.push(Number(element.dataset.gestureSlot))};
  vm.runInNewContext(app.slice(start,end)+'syncGestureSlotCards();',context);
  assert.equal(cards.length,15);assert.equal(add.disabled,true);
  assert.deepEqual(bound,Array.from({length:12},(_,i)=>i+4));
  assert.equal(cards[14].dataset.name,'sensor.vision.gesture.15');
  assert.equal(cards[14].querySelector('header span').textContent,'G15');
  context.syncGestureSlotCards();assert.equal(bound.length,12,'rendering does not rebind existing handlers');
  // Restoring a smaller saved bank removes only the surplus cards.
  context.visionControls.slots.length=4;context.syncGestureSlotCards();
  assert.equal(cards.length,4);assert.equal(add.disabled,false);
  assert.equal(cards[3].dataset.name,'sensor.vision.gesture.4');
  context.visionControls.slots.splice(1,1);context.syncGestureSlotCards();
  assert.deepEqual(cards.map(entry=>entry.dataset.gestureSlot),['1','3','4']);
  assert.equal(cards[2].dataset.name,'sensor.vision.gesture.4','removing G2 cannot renumber G4');
  context.visionControls.slots=[];context.syncGestureSlotCards();assert.equal(cards.length,0);
  context.visionControls.slots=[{id:2}];context.syncGestureSlotCards();
  assert.equal(cards.length,1,'Add works after the last card was removed');
  assert.equal(cards[0].dataset.name,'sensor.vision.gesture.2');
  // CLR removes samples through the existing library, never a slot or its mapping ID.
  const clear=app.slice(app.indexOf("deleteButton?.addEventListener('click'",start-6000),start);
  assert.match(clear,/deleteStoredGesture\(slot.name\)/);
  assert.doesNotMatch(clear,/slots\.splice|slots\.pop|delete.*slots/);
});

test('removing a learned pose cancels its capture, releases its hold and persists the sparse bank', () => {
  const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const start=app.indexOf('    function removeGestureSlot(');
  const end=app.indexOf('    function bindGestureSlotCard(',start);
  const calls=[];
  const context={window:{onControl:value=>calls.push(['release',value])},
    visionGestureLearnSlot:2,visionGestureTestSlot:2,poseCaptureTimer:9,
    visionProcessor:{cancelGestureLearn:()=>calls.push(['cancel'])},clearTimeout:id=>calls.push(['timer',id]),
    stopGestureTest:()=>calls.push(['test']),liveGestureSlots:new Set([2,3]),visionPoseActivations:new Map([[2,4],[3,5]]),
    badgePose:'G2',badgeNoteState:'held',renderPerformanceBadge:()=>calls.push(['badge']),
    deleteStoredGesture:name=>calls.push(['delete',name]),dismissedPoseWarnings:new Set(['Gesture 2']),poseWarnings:new Map([['Gesture 2',{}]]),
    syncGestureSlotCards:()=>calls.push(['cards']),persistVisionSafety:()=>calls.push(['persist']),renderVisionControlState:()=>calls.push(['render'])};
  context.window.window=context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('./vision-control-state.js',import.meta.url),'utf8'),context);
  context.visionControls=new context.window.VisionControlState();
  vm.runInContext(app.slice(start,end),context);
  context.removeGestureSlot(2);
  assert.equal(context.visionGestureLearnSlot,null);assert.equal(context.poseCaptureTimer,null);
  assert.equal(context.badgePose,null);assert.equal(context.badgeNoteState,null);
  const released=calls.find(([name])=>name==='release')[1];
  assert.deepEqual(JSON.parse(JSON.stringify(released)),{name:'sensor.vision.gesture.2',value:0});
  assert.ok(calls.findIndex(([name])=>name==='release')<calls.findIndex(([name])=>name==='delete'));
  assert.ok(calls.some(([name])=>name==='cancel'));assert.ok(calls.some(([name])=>name==='test'));
  assert.ok(calls.some(([name])=>name==='persist'));
  assert.deepEqual([...context.liveGestureSlots],[3]);assert.deepEqual([...context.visionPoseActivations.keys()],[3]);
  assert.equal(context.visionControls.slotById(2),null);
  assert.equal(context.visionControls.controlForSlot(3),'sensor.vision.gesture.3');
  const count=calls.length;context.removeGestureSlot(2);assert.equal(calls.length,count);
});

test('the card X removes only its own identity and does not delete while mapping', () => {
  const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const start=app.indexOf('    function bindGestureSlotCard('),end=app.indexOf('    function syncGestureSlotCards()',start);
  let click,mapping=false,stopped=0;const removed=[];
  const card={dataset:{gestureSlot:'15'},querySelector:selector=>selector==='.vision-slot-remove'?{addEventListener:(type,handler)=>{assert.equal(type,'click');click=handler;}}:null};
  const context={document:{body:{classList:{contains:()=>mapping}}},removeGestureSlot:id=>removed.push(id)};
  vm.runInNewContext(app.slice(start,end),context);context.bindGestureSlotCard(card);
  click({stopPropagation:()=>stopped++});assert.deepEqual(removed,[15]);
  mapping=true;click({stopPropagation:()=>stopped++});assert.deepEqual(removed,[15]);assert.equal(stopped,2);
});
