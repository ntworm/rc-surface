// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
import { requireCtx } from '../context.js';
import { AudioClip, AudioTrack } from '@ableton-extensions/sdk';
import { oscTransport } from './osc-transport.js';
import { RecordingCoordinator } from './recording-coordinator.js';
import { RecordingMarker } from './recording-marker.js';
import { RecordingTakeMarking } from './recording-take-marking.js';
import { RecordingTakeNotes } from './recording-take-notes.js';
import { RecordingCue } from './recording-cue.js';
import { RecordingArrangement } from './recording-arrangement.js';
import { RecordingWaveform } from './recording-waveform.js';
import type { WaveformAudioClip, WaveformAudioTrack } from './recording-waveform.js';
import type { CommandExecutionContext, CommandSpec } from './catalog/types.js';

export const recordingCoordinator = new RecordingCoordinator(oscTransport, () => requireCtx().song);
/** One host service for the REC marker. It owns its own latch and never
 * touches the coordinator's operation slot. */
export const recordingMarker = new RecordingMarker(oscTransport, () => requireCtx().song, () => recordingCoordinator.scopeToken());
/** The read-only take-lane catalog. It reads the Song the coordinator sees
 * and never takes the coordinator's operation slot, so a list may be read
 * while Live plays or records. */
export const recordingTakeNotes = new RecordingTakeNotes(() => requireCtx().song, () => recordingCoordinator.scopeToken());
/** The guarded name write on one take-lane clip. It shares the catalog's
 * object identity, owns its own single-flight latch and never takes the
 * coordinator's operation slot or the transport-wide write lane. Its
 * transport read is the bounded, read-only note lane: a REC write keeps
 * running while the mark observes the transport. */
export const recordingTakeMarking = new RecordingTakeMarking(
  () => requireCtx().song,
  () => recordingCoordinator.scopeToken(),
  recordingTakeNotes.identities,
  (signal?: AbortSignal) => oscTransport.recording.readNoteState(signal),
  () => recordingCoordinator.snapshot().attemptActive,
);
/** The read-only Return and send cue diagnostic backend. It reads the Song
 * the coordinator sees, performs no writes, and never touches transport. */
export const recordingCue = new RecordingCue(() => requireCtx().song, () => recordingCoordinator.scopeToken());
/** The read-only Arrangement clip catalog. It reads the Song the coordinator
 * sees, lists the clips Live reports for one exact track, performs no
 * writes, and never touches transport or the Session grid. */
export const recordingArrangement = new RecordingArrangement(() => requireCtx().song, () => recordingCoordinator.scopeToken());
/** The runtime proof that a track is a real SDK audio track. The SDK classes
 * are the only proof: no name of a class and no invented property counts. */
function isAudioTrack(value: unknown): value is WaveformAudioTrack {
  return value instanceof AudioTrack;
}
/** The runtime proof that a clip is a real SDK audio clip. */
function isAudioClip(value: unknown): value is WaveformAudioClip {
  return value instanceof AudioClip;
}
/** The own temp directory of the host. It is undefined until the extension
 * context is ready, and then the service refuses to render at all. */
function hostTempDirectory(): string | undefined {
  try {
    return requireCtx().context.environment.tempDirectory;
  } catch {
    return undefined;
  }
}
/** The bounded Arrangement waveform reader. It renders one exact interval of
 * one exact Arrangement audio clip through the host's own pre-FX renderer,
 * reads the WAV the host wrote into the extension's own temp directory and
 * returns at most 512 real amplitudes. It never touches the transport, never
 * takes the coordinator's operation slot and never returns a path. */
/** The waveform service of the phone. It reads the Song and the transport the
 * coordinator sees, and it owns its own single flight latch. */
export const recordingWaveform = new RecordingWaveform({
  getSong: () => requireCtx().song,
  getScope: () => recordingCoordinator.scopeToken(),
  getTransport: (signal?: AbortSignal) => oscTransport.recording.readNoteState(signal),
  getAttemptActive: () => recordingCoordinator.snapshot().attemptActive,
  getTempDirectory: hostTempDirectory,
  render: (track, startTime, endTime) => {
    if (!isAudioTrack(track)) throw Error('REC:WAVEFORM_TRACK');
    return requireCtx().context.resources.renderPreFxAudio(track, startTime, endTime);
  },
  isAudioTrack,
  isAudioClip,
});
function exact(args: Record<string, unknown>, keys: string[]) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== keys.length || keys.some(key => !Object.hasOwn(args, key))) throw Error('REC:ARGUMENTS');
}
function requireExecution(context?: CommandExecutionContext): CommandExecutionContext {
  if (!context || typeof context.isCurrent !== 'function' || !context.isCurrent()) throw Error('REC:SESSION');
  return context;
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
    exact(args,[]);const execution=requireExecution(context);recordingMarker.cancel();recordingTakeMarking.cancel();recordingWaveform.cancel();return recordingCoordinator.stopSession(execution);
  }},
  getRecordingState: { description: 'Read observed Arrangement REC state', handler: async args => {
    exact(args, []);
    try { return await recordingCoordinator.refresh(); }
    catch { return { ...recordingCoordinator.snapshot() }; }
  } },
  getRecordingTakes: { description: 'Read one bounded page of the take lanes and clips of one exact REC track', handler: async args => {
    exact(args, ['scope', 'track', 'laneOffset', 'clipOffset']);
    return recordingTakeNotes.list({
      scope: args['scope'], track: args['track'],
      laneOffset: args['laneOffset'], clipOffset: args['clipOffset'],
    });
  } },
  getRecordingCueState: { description: 'Read scoped paginated diagnostic Return and send routing candidate state', handler: async args => {
    exact(args, ['scope', 'returnTrack', 'offset']);
    return recordingCue.getState(args);
  } },
  getRecordingArrangement: { description: 'Read one bounded page of the Arrangement clips of one exact REC track', handler: async args => {
    exact(args, ['scope', 'track', 'offset']);
    return recordingArrangement.list({ scope: args['scope'], track: args['track'], offset: args['offset'] });
  } },
  getRecordingWaveform: { description: 'Read a bounded Arrangement waveform of one exact audio clip interval', handler: async (args, context) => {
    exact(args, ['scope', 'track', 'clip', 'startTime', 'endTime']);
    const execution = requireExecution(context);
    return recordingWaveform.get(args, execution);
  } },
  recordingMarkTake: { description: 'Mark one exact take-lane clip good, review or clear', handler: async (args, context) => {
    exact(args, ['scope', 'track', 'lane', 'clip', 'mark']);
    return recordingTakeMarking.mark({
      scope: args['scope'], track: args['track'], lane: args['lane'], clip: args['clip'], mark: args['mark'],
    }, context);
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
  recordingArmTracks: { description: 'Arm or disarm one explicit REC track cohort', handler: async (args, context) => {
    exact(args, ['scope','group','tracks','enabled','armMode']);
    return recordingCoordinator.armTracks(args, context);
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
    exact(args, []);
    const execution = requireExecution(context);
    // A pending marker, a pending take mark and a pending waveform are
    // retired before the transport stop. None of them blocks the stop, and a
    // late completion of any of them can no longer name a cue, a clip or a
    // waveform.
    recordingMarker.cancel();
    recordingTakeMarking.cancel();
    recordingWaveform.cancel();
    return recordingCoordinator.stop(execution);
  } },
  recordingCreateMarker: { description: 'Create one named Arrangement cue from a fresh position observation', handler: async (args, context) => {
    exact(args, ['scope']);
    const markerResult = await recordingMarker.create(args['scope'], context);
    return { ...recordingCoordinator.snapshot(), markerResult };
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
