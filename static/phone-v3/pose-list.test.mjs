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
  const add={disabled:false};const context={window:{VISION_MAX_LEARNED_POSES:15},gestureSlotCards:[...cards],
    visionControls:{slots:Array.from({length:15},(_,i)=>({id:i+1}))},
    document:{querySelector:()=>({appendChild:element=>cards.push(element)}),getElementById:()=>add},
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
  // CLR removes samples through the existing library, never a slot or its mapping ID.
  const clear=app.slice(app.indexOf("deleteButton?.addEventListener('click'",start-6000),start);
  assert.match(clear,/deleteStoredGesture\(slot.name\)/);
  assert.doesNotMatch(clear,/slots\.splice|slots\.pop|delete.*slots/);
});
