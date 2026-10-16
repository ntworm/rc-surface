// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { requireCtx } from '../context.js';
import { oscTransport } from './osc-transport.js';
import { RecordingCoordinator } from './recording-coordinator.js';
import type { CommandSpec } from './catalog/types.js';

export const recordingCoordinator = new RecordingCoordinator(oscTransport, () => requireCtx().song);
function exact(args: Record<string, unknown>, keys: string[]) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== keys.length || keys.some(key => !Object.hasOwn(args, key))) throw Error('REC:ARGUMENTS');
}
export const recordingCommands: Record<string, CommandSpec> = {
  recordingReturnToArrangement:{description:'Explicitly return to Arrangement after observed Session stop',handler:async(args,context)=>{
    exact(args,[]);return recordingCoordinator.returnToArrangement(context);
  }},
  getSessionRecordingState:{description:'Read observed Session REC grid',handler:async args=>{
    exact(args,['offset']);try{return await recordingCoordinator.refreshSession(args['offset']);}catch{return {...recordingCoordinator.snapshot(),error:'REC:SESSION_UNKNOWN'};}
  }},
  recordingSessionRecord:{description:'Record one verified empty Session scene across all armed tracks',handler:async(args,context)=>{
    exact(args,['songId','scene','targets','bars','quantization']);return recordingCoordinator.recordSession(args,context);
  }},
  recordingSessionStop:{description:'Priority stop only still-owned Session tracks',handler:async(args,context)=>{
    exact(args,[]);return recordingCoordinator.stopSession(context);
  }},
  getRecordingState: { description: 'Read observed Arrangement REC state', handler: async args => {
    exact(args, []);
    try { return await recordingCoordinator.refresh(); }
    catch { return { ...recordingCoordinator.snapshot() }; }
  } },
  recordingSelectTrack: { description: 'Select exact REC track identity', handler: async (args, context) => {
    exact(args, ['index', 'id', 'name']); return recordingCoordinator.selectTrack(args as { index: number; id: string; name: string }, context);
  } },
  recordingSetPoint: { description: 'Choose local Arrangement return point in beats', handler: async (args, context) => {
    exact(args, ['beats']); return recordingCoordinator.setPoint(args['beats'], context);
  } },
  recordingLocator: { description: 'Choose previous or next verified Arrangement locator', handler: async (args, context) => {
    exact(args, ['direction']); return recordingCoordinator.chooseLocator(args['direction'], context);
  } },
  recordingArm: { description: 'Explicitly arm or disarm selected REC track', handler: async (args, context) => {
    exact(args, ['enabled','track']); return recordingCoordinator.arm(args['enabled'], args['track'], context);
  } },
  recordingTrackControl: { description: 'Set one observed REC track arm, solo or mute state', handler: async (args, context) => {
    exact(args,args['property']==='arm'?['track','property','enabled','armMode']:['track','property','enabled']);
    return recordingCoordinator.trackControl(args['track'],args['property'],args['enabled'],args['armMode']??'multi',context);
  } },
  recordingRenameTrack: {description:'Rename one exact observed REC track',handler:async(args,context)=>{
    exact(args,['track','name']);return recordingCoordinator.renameTrack(args['track'] as {index:number;id:string;name:string},args['name'],context);
  }},
  recordingTrackVolume: {description:'Set one observed REC track volume',handler:async(args,context)=>{
    exact(args,['track','volume']);return recordingCoordinator.setVolume(args['track'] as {index:number;id:string;name:string},args['volume'] as number,context);
  }},
  recordingPrepare: { description: 'Check conservative REC conditions and seek return point', handler: async (args, context) => {
    exact(args, []); return recordingCoordinator.prepare(context);
  } },
  recordingStart: { description: 'Start one prepared Arrangement attempt', handler: async (args, context) => {
    exact(args, ['token']); return recordingCoordinator.start(args['token'], context);
  } },
  recordingRecord: { description: 'Record an exact observed armed track cohort from verified Arrangement markers', handler: async (args, context) => {
    const key=Object.hasOwn(args,'tracks')?'tracks':'track';
    exact(args,[key,'range',...(Object.hasOwn(args,'preRollBars')?['preRollBars']:[]),...(Object.hasOwn(args,'passes')?['passes']:[])]);
    const bars=Object.hasOwn(args,'preRollBars')?args['preRollBars']:0;
    return Object.hasOwn(args,'passes')?recordingCoordinator.record(args[key],args['range'],context,bars,args['passes']):recordingCoordinator.record(args[key],args['range'],context,bars);
  } },
  recordingSeekMarker: { description: 'Position normal header playback at a verified marker without starting it', handler: async (args, context) => {
    exact(args, ['name','time']); return recordingCoordinator.seekMarker(args as {name:string;time:number}, context);
  } },
  recordingStop: { description: 'Priority STOP and record mode off, including unknown state', handler: async (args, context) => {
    exact(args, []); return recordingCoordinator.stop(context);
  } },
  recordingAudition: { description: 'Disarm explicitly and play current main Arrangement lane', handler: async (args, context) => {
    exact(args, ['disarm']); return recordingCoordinator.audition(args['disarm'], context);
  } },
  recordingClick: { description: 'Set metronome explicitly and observe result', handler: async (args, context) => {
    exact(args, ['enabled']); return recordingCoordinator.click(args['enabled'], context);
  } },
  recordingMark: { description: 'Mark last stopped attempt locally as good or review', handler: async (args, context) => {
    exact(args, ['mark']); return recordingCoordinator.mark(args['mark'], context);
  } },
};
