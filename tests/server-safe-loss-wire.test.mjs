// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// B2, wire half — a control marked `lost: true` must reach applyMapping as a
// deactivation so the target's Safe loss policy decides the value, instead of
// the placeholder number the client sent being applied literally.

// Test files run in parallel and every one that starts a server competes
// for DEFAULT_PREFERRED_PORT; the loser silently falls back to an
// OS-assigned port, which makes the port assertions in
// server-restart-stability.test.mjs flap. This file claims its own.
process.env.RC_SURFACE_PORT = "16170";

import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer, stopServer, actualPort } from "../src/server/state.ts";
import { getControllerToken } from "../src/server/session-auth.ts";
import {
  activeSmooths,
  controlMappings,
  eventModesState,
  lastMappedValues,
  stopSmoothTimer,
  commands,
  cancelPendingMappingWrites,
} from "../src/live/mappings.ts";
import { clearExtensionContext, setExtensionContext } from "../src/context.ts";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${actualPort}/ws?token=${getControllerToken()}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("hello timeout")); }, 5000);
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "hello") return;
      clearTimeout(timer);
      resolve({ ws, role: msg.role });
    });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

let param;

test.before(async () => {
  param = {
    name: "Dry/Wet", min: 0, max: 1, value: 0,
    setValue: async (v) => { param.value = v; },
  };
  controlMappings.clear();
  lastMappedValues.clear();
  activeSmooths.clear();
  eventModesState.clear();
  setExtensionContext({
    application: { song: { tempo: 120, tracks: [{ devices: [{ parameters: [param] }] }] } },
  });
  controlMappings.set("sensor.vision.x", [
    { type: "device_param", trackIndex: 0, deviceIndex: 0, paramIndex: 0, neutralPolicy: "center" },
  ]);
  await startServer();
});

test.after(async () => {
  stopSmoothTimer();
  clearExtensionContext();
  await stopServer();
});

test("B2 wire: a control flagged lost applies the Safe loss policy, not the sent value", async () => {
  const { ws, role } = await connect();
  assert.equal(role, "controller");

  ws.send(JSON.stringify({ type: "control", control: { name: "sensor.vision.x", value: 0.9 } }));
  await wait(150);
  assert.ok(Math.abs(param.value - 0.9) < 0.02, `live reading should apply, got ${param.value}`);

  // The client has no reading; the 0 it carries is a placeholder only.
  ws.send(JSON.stringify({
    type: "control",
    control: { name: "sensor.vision.x", value: 0, lost: true },
  }));
  await wait(150);

  assert.ok(
    Math.abs(param.value - 0.5) < 0.02,
    `BUG: Safe loss 'center' should park the parameter at 0.5, got ${param.value} ` +
      `(the placeholder 0 was applied literally)`,
  );

  ws.close();
});
test('wire carries fresh learned-pose tracking and rejects malformed/duplicate evidence without repeated MIDI',async()=>{
  const packets=[];
  const midi={name:'RC MIDI Packet v2',min:0,max:4194303,isQuantized:false,setValue:async value=>packets.push([Math.floor(value/128)%128,value%128])};
  setExtensionContext({application:{song:{tracks:[{name:'MIDI',devices:[{name:'RC-Midi-Receiver',parameters:[midi]}]}]}}});
  controlMappings.set('sensor.vision.gesture.1',[{type:'device_param',mode:'trigger_note',trackIndex:0,midiNote:'C3',noteTiming:'immediate',noteGate:'hold',neutralPolicy:'hold'}]);
  await commands.saveProjectClientState.handler({preferences:{visionLoss:{version:1,mode:'timeout',timeoutMs:100,legacy:false}}});
  const {ws}=await connect();
  const send=tracking=>ws.send(JSON.stringify({type:'control_frame',controls:[{name:'sensor.vision.gesture.1',value:1,tracking}]}));
  try {
    send({seq:1,qualified:'bad',graceMs:140});await wait(20);assert.equal(packets.length,0);
    send({seq:1,qualified:true,graceMs:140,activation:true});
    send({seq:1,qualified:true,graceMs:140,activation:true});
    await wait(200);assert.deepEqual(packets,[[60,100],[60,0]],'deadline runs when no new results arrive');
    send({seq:2,qualified:false,graceMs:140});await wait(20);assert.equal(packets.length,2);
  } finally {ws.close();await cancelPendingMappingWrites();controlMappings.delete('sensor.vision.gesture.1');}
});
