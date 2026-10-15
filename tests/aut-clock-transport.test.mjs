// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as osc from 'osc-min';
import { OSCTransport } from '../src/live/osc-transport.ts';
import { TriggerNoteClock } from '../src/live/trigger-note-clock.ts';

test('real OSC observations through host clock, phone receiver and MAP UI can capture, pause and resume AUT SYNC', t => {
  t.mock.timers.enable({apis:['Date'], now:10000});
  const read = name => fs.readFileSync(new URL('../static/phone-v3/' + name, import.meta.url), 'utf8');
  const app=read('app.js'), mapping=read('mapping-mode.js');
  const receiverStart=app.indexOf('        const state = msg.state;', app.indexOf("msg.type === 'transport_state'"));
  const receive='{'+app.slice(receiverStart,app.indexOf('        if (state) {',receiverStart))+'}';
  const root={performance:{now:()=>Date.now()},document:{querySelector:()=>null},updateLiveLine(){}};
  root.window=root;vm.createContext(root);vm.runInContext(read('xy-automation.js'),root);
  const uiStart=mapping.indexOf('  window.updateTriggerNoteClockUI =');
  vm.runInContext(mapping.slice(uiStart,mapping.indexOf('  function updateTriggerFeedbackUI',uiStart)),root);
  const transport=new OSCTransport(), clock=new TriggerNoteClock(()=>Date.now());
  const sent=[];
  transport.send=address=>{sent.push(address);transport.expectReply(address);};
  transport.on('position',value=>clock.observePosition(value.beat,value.tempo,value.signatureNumerator,value.signatureDenominator));
  transport.on('update',state=>{
    clock.updateTransport(state.isPlaying,state.connected,state.tempo,state.signatureNumerator,state.signatureDenominator);
    root.msg={clock:JSON.parse(JSON.stringify(clock.snapshot()))};vm.runInContext(receive,root);
  });
  const push=(address,args)=>transport.handleIncoming(osc.fromBuffer(osc.toBuffer({address,args})));
  push('/live/song/get/is_playing',[true]);push('/live/song/get/current_song_time',[0]);
  const engine=root.RcXYAutomation, state=engine.create({timing:'sync',bars:1,seconds:10});
  engine.arm(state,root.triggerNoteClockSnapshot,Date.now());
  for(let elapsed=20;elapsed<=4000;elapsed+=20) {
    t.mock.timers.setTime(10000+elapsed);
    if(elapsed%500===0) {
      push('/live/song/get/beat',[elapsed/500]);
      sent.length=0;transport.pollTick(Date.now());
      assert.ok(sent.includes('/live/song/get/current_song_time'));
      push('/live/song/get/current_song_time',[elapsed/500]);
      push('/live/song/get/is_playing',[true]);
    }
    const result=engine.tick(state,root.triggerNoteClockSnapshot,Date.now(),{x:elapsed/4000,y:.75});
    assert.notEqual(result.stopped,true,`continuous clock at ${elapsed}`);
  }
  assert.equal(state.stage,'playing');assert.ok(state.saved.points.length>=4);
  transport.stopPlayback();
  push('/live/song/get/tempo',[120]);
  assert.equal(root.triggerNoteClockSnapshot.playing,true,'a command and unrelated observation cannot invent a STOP');
  push('/live/song/get/is_playing',[false]);
  assert.equal(engine.tick(state,root.triggerNoteClockSnapshot,Date.now(),{}).suspended,true);
  t.mock.timers.setTime(20000);
  assert.equal(engine.tick(state,root.triggerNoteClockSnapshot,Date.now(),{}).stopped,undefined);
  assert.equal(state.stage,'paused');
  push('/live/song/get/is_playing',[true]);push('/live/song/get/current_song_time',[16]);
  const result=engine.tick(state,root.triggerNoteClockSnapshot,Date.now(),{});
  assert.equal(result.resumed,true);assert.ok(result.point);assert.equal(state.stage,'playing');
});
