// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
import * as fs from "node:fs/promises";
import { existsSync as fsExistsSync } from "node:fs";
import * as path from "node:path";
import { getExtensionContext, requireCtx, requireTrack } from "../context.js";
import { trackedClients } from "../server/ws.js";
import { playheadActive, playheadStartTime, playheadBaseTimeMs, setPlayheadActive, setPlayheadStartTime, setPlayheadBaseTimeMs, broadcastPlayheadState } from "./state.js";
import { pickLanIps, getLanAddresses, stripWslDrivePrefix, sanitizeFilenameComponent } from "../util/helpers.js";
import { pressReceiverNote, findMidiReceiver, noteNameToMidiNumber, MIDI_PACKET_PARAMETER, type HeldMidiNote } from "./midi-receiver.js";
import { oscTransport } from "./osc-transport.js";
import { globalWriteScheduler } from "../server/write-scheduler.js";
import { registerCatalogCommands } from "./catalog/index.js";
import { applyCurve, applyCurveInverse } from "./curves.js";
import { scaleTargetValue, unscaleTargetValue, type TargetScale } from "./target-scale.js";
import { continuousTargetActuator, defaultNow as nowMs } from "./continuous-target-actuator.js";
import { stopAllHostModulators } from "./host-modulators.js";
import { SafeInputRegistry, SafeSignalFilter, type SafeInputResult, type TakeoverMode } from "./safe-input.js";
import { buildServerAccessUrls } from "../server/access-urls.js";
import {
  buildProjectConfig,
  fingerprintSong,
  loadProjectConfigFile,
  migrateLegacyClientMappings,
  relinkProjectConfig,
  rollbackProjectConfigFile,
  saveProjectConfigFile,
  validateProjectConfig,
  isSupportedMappingMode,
  type ProjectConfig,
  type RelinkReport,
  type SemanticTargetSignature,
} from "./project-config.js";

export interface MappingTarget {
  type: 'device_param' | 'mixer_volume' | 'mixer_pan' | 'mixer_send'
      | 'tempo' | 'track_mute' | 'track_solo' | 'track_arm';
  trackIndex?: number;
  trackKind?: 'track' | 'return' | 'main';
  deviceIndex?: number;
  paramIndex?: number;
  sendIndex?: number;
  label?: string;
  outMin?: number;
  outMax?: number;
  smooth?: number;
  smoothBpmSync?: boolean;
  smoothBpmSubdivision?: number;
  curve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve';
  inMin?: number;
  inMax?: number;
  drive?: number;
  compressor?: number;
  targetScale?: TargetScale;
  mode?: 'continuous' | 'toggle' | 'trigger_note';
  threshold?: number;
  midiNote?: string;
  midiVelocity?: number;
  idleValue?: number;
  takeoverMode?: TakeoverMode;
  /**
   * Safe loss. Five modes, each doing something the others do not:
   *   hold    freeze at the last real value
   *   zero    park at 0
   *   center  park at 0.5
   *   custom  park at `neutralValue`
   *   release glide back to the control's natural rest position
   *
   * 'initial' and 'reconcile' are retired: both meant "adopt Live's current
   * value", duplicating each other and, from the user's side, hold. They are
   * still accepted here so saved mappings keep loading, and are migrated to
   * hold at resolution time.
   */
  neutralPolicy?: 'hold' | 'zero' | 'center' | 'custom' | 'release' | 'initial' | 'reconcile';
  neutralValue?: number;
  signature?: SemanticTargetSignature;
  relinkStatus?: 'loaded' | 'relinked' | 'review' | 'ambiguous' | 'missing';
  relinkConfidence?: number;
  relinkCandidates?: Array<{ target: MappingTarget; confidence: number }>;
}

export const controlMappings = new Map<string, MappingTarget[]>();
export const lastMappedValues = new Map<string, number>();
export const eventModesState = new Map<string, { lastInput: number; active: boolean }>();
export const safeInputRegistry = new SafeInputRegistry();
const sensorSignalFilters = new Map<string, SafeSignalFilter>();
const lastClientControlValues = new Map<string, number>();
export const lastMappedInputAt = new Map<string, number>();
const clientReleaseTimers = new Map<string, NodeJS.Timeout[]>();
const lastSafeFeedback = new Map<string, string>();
function sendSafeInputFeedback(
  clientId: string,
  controlName: string,
  target: MappingTarget,
  result: SafeInputResult,
): void {
  const client = trackedClients.get(clientId);
  if (!client || client.ws.readyState !== 1) return;
  const feedbackKey = `${clientId}::${controlName}::${getTargetKey(target)}`;
  const mode = target.takeoverMode ?? currentProjectPreferences["globalTakeover"] ?? 'scale';
  const signature = `${mode}:${result.state}:${result.captured}:${result.hostValue.toFixed(3)}:${result.direction}`;
  if (lastSafeFeedback.get(feedbackKey) === signature) return;
  lastSafeFeedback.set(feedbackKey, signature);
  try {
    client.ws.send(JSON.stringify({
      type: 'safe_input_state',
      control: controlName,
      target: getTargetKey(target),
      mode,
      state: result.state,
      captured: result.captured,
      hostValue: result.hostValue,
      direction: result.direction,
    }));
  } catch {
    // A closing socket is reconciled by the disconnect path.
  }
}

export interface SmoothState {
  current: number;
  target: number;
  smoothFactor: number;
  apply: (val: number) => Promise<void>;
  isCurrent?: () => boolean;
  lastTime: number;
}

export const activeSmooths = new Map<string, SmoothState>();

/**
 * Smoothing factor used for the "release" Safe loss glide. Chosen so a
 * released control eases back to its rest position in roughly a second —
 * slow enough to read as a release, fast enough not to smear a performance.
 */
export const RELEASE_SMOOTH_FACTOR = 0.9;

let smoothInterval: NodeJS.Timeout | null = null;

export let mappingsFilePath: string | null = null;
export let presetsDirPath: string | null = null;
export let currentPresetName: string = "Default";
export let projectsDirPath: string | null = null;
let currentProjectFilePath: string | null = null;
let currentProjectPreferences: Record<string, any> = {};
let currentProjectExtras: Pick<ProjectConfig, 'camera' | 'gestures' | 'pages'> = {};
let currentProjectReport: RelinkReport = {
  loaded: 0, relinked: 0, review: 0, ambiguous: 0, missing: 0, total: 0, compatibility: [],
};
let projectConfigLoaded = false;
let mappingMutationTail: Promise<void> = Promise.resolve();

/** Serialize mapping mutations so persistence and rollback cannot overlap. */
export function runMappingMutation<T>(mutation: () => Promise<T> | T): Promise<T> {
  const run = async () => {
    try { return await mutation(); }
    finally { await releaseRetiredMappingWork(); }
  };
  const result = mappingMutationTail.then(run, run);
  mappingMutationTail = result.then(() => undefined, () => undefined);
  return result;
}

function emptyRelinkReport(): RelinkReport {
  return { loaded: 0, relinked: 0, review: 0, ambiguous: 0, missing: 0, total: 0, compatibility: [] };
}

export function getProjectConfigStatus() {
  return {
    loaded: projectConfigLoaded,
    // Clients need the profile identity, never the host's absolute storage path.
    file: currentProjectFilePath ? path.basename(currentProjectFilePath) : null,
    mappingsFileExists: mappingsFilePath != null && fsExistsSync(mappingsFilePath),
    report: { ...currentProjectReport, compatibility: [...currentProjectReport.compatibility] },
    preferences: { ...currentProjectPreferences },
    clientState: { ...currentProjectExtras },
    sdkLimitations: [
      'Ableton Extensions SDK 1.0.0-beta.0 does not expose the Live Set file path or name.',
      'The SDK does not expose persistent object IDs, plugin manufacturer/unit metadata, rack context, or change observers.',
      'Profiles are associated by semantic set fingerprint in extension storage and can be exported/imported.',
    ],
  };
}

export function setMappingsFilePath(p: string | null) { mappingsFilePath = p; }
export function setPresetsDirPath(p: string | null) { presetsDirPath = p; }

/**
 * Wire the mapping/preset paths into the Live-provided storage directory.
 * Safe to call with a null/undefined storageDir (warnings + no-op).
 *
 * Ableton passes Windows-style paths like `/C:/Users/...`; the leading
 * slash before the drive letter is stripped so `path.join` produces a
 * portable absolute path. Creates the presets directory; the mappings
 * file itself is created lazily by saveMappings().
 */
export async function configureMappingStorage(
  storageDir: string | null | undefined,
): Promise<void> {
  if (!storageDir) {
    console.warn("[ableton-rc-surface] storageDirectory not available, mappings will not persist");
    projectsDirPath = null;
    currentProjectFilePath = null;
    projectConfigLoaded = false;
    currentProjectReport = emptyRelinkReport();
    return;
  }
  const cleanStorageDir = stripWslDrivePrefix(storageDir);
  setMappingsFilePath(path.join(cleanStorageDir, "mappings.json"));
  const presets = path.join(cleanStorageDir, "presets");
  setPresetsDirPath(presets);
  projectsDirPath = path.join(cleanStorageDir, "projects");
  currentProjectFilePath = null;
  projectConfigLoaded = false;
  currentProjectPreferences = {};
  currentProjectExtras = {};
  currentProjectReport = emptyRelinkReport();
  try {
    await fs.mkdir(presets, { recursive: true });
    await fs.mkdir(projectsDirPath, { recursive: true });
  } catch {
    // non-fatal: log later when saveMappings actually writes
  }
}

export function getTargetKey(target: MappingTarget): string {
  const kindPart = target.trackKind && target.trackKind !== 'track' ? `::${target.trackKind}` : '';
  switch (target.type) {
    case 'tempo':
      return 'tempo';
    case 'mixer_send':
      return `mixer_send${kindPart}::${target.trackIndex ?? 0}::${target.sendIndex ?? 0}`;
    case 'device_param':
      if (target.mode === 'trigger_note') {
        // trigger_note has its own identity: track + midiNote.
        // Including the note prevents two pads that target different notes on
        // the same MIDI track from sharing a key, and prevents a collision with
        // a genuine device_param on device 0, param 0 of the same track.
        return `trigger_note${kindPart}::${target.trackIndex ?? 0}::${target.midiNote ?? 'C3'}`;
      }
      return `device_param${kindPart}::${target.trackIndex ?? 0}::${target.deviceIndex ?? 0}::${target.paramIndex ?? 0}`;
    default:
      return `${target.type}${kindPart}::${target.trackIndex ?? 0}`;
  }
}

export function startSmoothTimer(): void {
  continuousTargetActuator.start();
  if (smoothInterval) return;
  smoothInterval = setInterval(async () => {
    if (activeSmooths.size === 0) {
      if (smoothInterval) {
        clearInterval(smoothInterval);
        smoothInterval = null;
      }
      return;
    }
    const now = Date.now();
    const promises: Promise<void>[] = [];

    for (const [key, state] of activeSmooths.entries()) {
      if (state.isCurrent && !state.isCurrent()) {
        activeSmooths.delete(key);
        promises.push(state.apply(0));
        continue;
      }
      const dt = now - state.lastTime;
      state.lastTime = now;

      const factor = Math.max(0, Math.min(0.99, state.smoothFactor));
      const alpha = 1 - Math.pow(factor, dt / 30);

      const diff = state.target - state.current;
      if (Math.abs(diff) < 0.001) {
        state.current = state.target;
        activeSmooths.delete(key);
        lastMappedValues.set(key, state.target);
        promises.push(state.apply(state.target));
      } else {
        state.current = state.current + diff * Math.max(0.01, Math.min(1, alpha));
        lastMappedValues.set(key, state.current);
        promises.push(state.apply(state.current));
      }
    }

    await Promise.all(promises);
  }, 20);
}

/**
 * Stop the global smooth-timer interval. Idempotent: calling on an already
 * stopped timer is a no-op (does not throw, does not reset state).
 */
export function stopSmoothTimer(): void {
  continuousTargetActuator.stop();
  if (smoothInterval === null) return;
  clearInterval(smoothInterval);
  smoothInterval = null;
}

/**
 * Report whether the global smooth-timer interval is currently scheduled.
 * Self-shutoff: returns false while no smooth mapping is active.
 */
export function isSmoothTimerRunning(): boolean {
  return smoothInterval !== null || continuousTargetActuator.isRunning();
}

async function loadBestProjectProfile(song: any, isCurrent: () => boolean): Promise<boolean> {
  if (!projectsDirPath) return false;
  const { fingerprint } = fingerprintSong(song);
  const exactPath = path.join(projectsDirPath, `${fingerprint}.rcsurface`);
  const candidates: string[] = [];
  try {
    await fs.access(exactPath);
    candidates.push(exactPath);
  } catch {}
  try {
    for (const name of await fs.readdir(projectsDirPath)) {
      const file = path.join(projectsDirPath, name);
      if (name.endsWith('.rcsurface') && !candidates.includes(file)) candidates.push(file);
    }
  } catch {
    return false;
  }

  let best: { file: string; config: ProjectConfig; relink: ReturnType<typeof relinkProjectConfig>; score: number } | null = null;
  let runnerUpScore = -1;
  for (const file of candidates) {
    if (!isCurrent()) return false;
    try {
      const config = await loadProjectConfigFile(file);
      const relink = relinkProjectConfig(config, song);
      const report = relink.report;
      const score = report.total === 0
        ? (config.project.fingerprint === fingerprint ? 1 : 0)
        : (report.loaded + report.relinked + report.review * 0.6) / report.total;
      if (!best || score > best.score) {
        runnerUpScore = best?.score ?? runnerUpScore;
        best = { file, config, relink, score };
      } else if (score > runnerUpScore) {
        runnerUpScore = score;
      }
    } catch (error) {
      currentProjectReport.compatibility.push(
        `Skipped ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!isCurrent() || !best || best.score < 0.55) return false;
  if (best.file !== exactPath && runnerUpScore >= 0 && best.score - runnerUpScore < 0.1) {
    currentProjectReport.compatibility.push('Multiple project profiles match this set; import the intended .rcsurface file explicitly.');
    return false;
  }

  controlMappings.clear();
  safeInputRegistry.clear();
  for (const [control, targets] of best.relink.mappings) {
    controlMappings.set(control, targets as MappingTarget[]);
  }
  currentProjectFilePath = best.file;
  currentProjectPreferences = { ...best.config.preferences };
  currentProjectExtras = {
    camera: best.config.camera,
    gestures: best.config.gestures,
    pages: best.config.pages,
  };
  currentProjectReport = best.relink.report;
  projectConfigLoaded = true;
  console.log(`[ableton-rc-surface] loaded ${controlMappings.size} mappings from project profile ${best.file}`);
  await releaseRetiredMappingWork();
  return true;
}

interface CurrentProjectProfilePayload {
  file: string;
  config: ProjectConfig;
  report: RelinkReport;
}

function buildCurrentProjectProfilePayload(
  mappings: ReadonlyMap<string, MappingTarget[]> = controlMappings,
): CurrentProjectProfilePayload | null {
  if (!projectsDirPath) return null;
  const song = getExtensionContext()?.application.song;
  if (!song) return null;
  const { fingerprint } = fingerprintSong(song);
  const file = path.join(projectsDirPath, `${fingerprint}.rcsurface`);
  const config = buildProjectConfig(
    song,
    new Map(mappings) as Map<string, any[]>,
    currentProjectPreferences,
    currentProjectExtras,
  );
  return { file, config, report: relinkProjectConfig(config, song).report };
}

function commitCurrentProjectProfilePayload(payload: CurrentProjectProfilePayload): void {
  currentProjectFilePath = payload.file;
  projectConfigLoaded = true;
  currentProjectReport = payload.report;
}

async function saveCurrentProjectProfile(
  mappings: ReadonlyMap<string, MappingTarget[]> = controlMappings,
): Promise<void> {
  const payload = buildCurrentProjectProfilePayload(mappings);
  if (!payload) return;
  await saveProjectConfigFile(payload.file, payload.config);
  commitCurrentProjectProfilePayload(payload);
}

export async function loadMappings(isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return;
  const song = getExtensionContext()?.application.song;
  if (song && await loadBestProjectProfile(song, isCurrent)) return;
  if (!isCurrent() || !mappingsFilePath) return;
  try {
    const raw = await fs.readFile(mappingsFilePath, "utf-8");
    if (!isCurrent()) return;
    const obj = JSON.parse(raw) as Record<string, MappingTarget | MappingTarget[]>;
    // The .rcsurface profile path already folds per-phone keys onto their
    // control; this fallback file has to do the same or a set loaded through
    // it would still carry bindings the shared surface cannot address.
    const migration = migrateLegacyClientMappings(obj);
    controlMappings.clear();
    safeInputRegistry.clear();
    for (const [k, v] of Object.entries(migration.mappings)) {
      controlMappings.set(k, Array.isArray(v) ? v : [v]);
    }
    if (migration.conflicts.length) {
      currentProjectReport.compatibility.push(...migration.conflicts);
    }
    if (migration.migrated > 0) {
      console.log(
        `[ableton-rc-surface] folded ${migration.migrated} per-phone mapping key(s) onto their controls`,
      );
    }
    console.log(`[ableton-rc-surface] loaded ${controlMappings.size} mappings from ${mappingsFilePath}`);
    await releaseRetiredMappingWork();
  } catch {
    console.log("[ableton-rc-surface] no mappings file found, starting fresh");
  }
}

interface StagedTextFile {
  abort: () => Promise<void>;
  commit: () => Promise<void>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function stageTextFile(filePath: string, contents: string): Promise<StagedTextFile> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(`Mapping storage path is not a file: ${filePath}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw error;
  }

  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temporary = `${filePath}.tmp-${nonce}`;
  const rollback = `${filePath}.rollback-${nonce}`;
  try {
    await fs.writeFile(temporary, contents, "utf8");
  } catch (error) {
    // A failed write may have created a partial staging file. Never touch the
    // prior destination; clean only this operation's unique temporary.
    try { await fs.rm(temporary, { force: true }); } catch {}
    throw error;
  }
  let settled = false;

  return {
    abort: async () => {
      if (settled) return;
      settled = true;
      await fs.rm(temporary, { force: true });
    },
    commit: async () => {
      if (settled) throw new Error("Staged mapping file is already settled");
      let originalMoved = false;
      try {
        if (await fileExists(filePath)) {
          await fs.rename(filePath, rollback);
          originalMoved = true;
        }
        await fs.rename(temporary, filePath);
        settled = true;
        if (originalMoved) {
          try { await fs.rm(rollback, { force: true }); } catch {}
        }
      } catch (error) {
        let rollbackError: unknown = null;
        if (originalMoved) {
          try {
            await fs.rm(filePath, { force: true });
            await fs.rename(rollback, filePath);
          } catch (restoreError) {
            rollbackError = restoreError;
          }
        }
        settled = true;
        await fs.rm(temporary, { force: true });
        if (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Mapping persistence failed and rollback could not be completed",
          );
        }
        throw error;
      }
    },
  };
}

export async function saveMappings(
  mappings: ReadonlyMap<string, MappingTarget[]> = controlMappings,
): Promise<void> {
  if (!mappingsFilePath) return;
  const obj: Record<string, MappingTarget[]> = {};
  for (const [k, v] of mappings.entries()) obj[k] = v;

  let stagedMappings: StagedTextFile | null = null;
  const profilePayload = buildCurrentProjectProfilePayload(mappings);
  const previousProjectFilePath = currentProjectFilePath;
  const previousProjectReport = currentProjectReport;
  const previousProjectConfigLoaded = projectConfigLoaded;
  let profileCommitted = false;
  let profilePreviouslyExisted = false;
  try {
    stagedMappings = await stageTextFile(mappingsFilePath, JSON.stringify(obj, null, 2));
    if (profilePayload) {
      profilePreviouslyExisted = await fileExists(profilePayload.file);
      await saveProjectConfigFile(profilePayload.file, profilePayload.config);
      profileCommitted = true;
    }
    await stagedMappings.commit();
    if (profilePayload) commitCurrentProjectProfilePayload(profilePayload);
  } catch (err) {
    try { await stagedMappings?.abort(); } catch {}
    let rollbackError: unknown = null;
    if (profileCommitted && profilePayload) {
      try {
        if (profilePreviouslyExisted) await rollbackProjectConfigFile(profilePayload.file);
        else await fs.rm(profilePayload.file, { force: true });
      } catch (error) {
        rollbackError = error;
      }
    }
    currentProjectFilePath = previousProjectFilePath;
    currentProjectReport = previousProjectReport;
    projectConfigLoaded = previousProjectConfigLoaded;
    console.error(`[ableton-rc-surface] failed to save mappings: ${err instanceof Error ? err.message : String(err)}`);
    if (rollbackError) {
      throw new AggregateError(
        [err, rollbackError],
        "Mapping persistence failed and the project profile rollback also failed",
      );
    }
    throw err;
  }
}

const activeApplyLocks = new Set<string>();
const pendingMappedApplies = new Map<string, {
  value: number;
  apply: (val: number) => Promise<void>;
  isCurrent: () => boolean;
}>();

let mappingDispatchGeneration = 0;
const mappingClientSessions = new Map<string, object>();
const heldTriggerNotes = new Map<string, { voice: HeldMidiNote; isCurrent: () => boolean }>();

async function releaseRetiredTriggerNotes(): Promise<void> {
  const releases: Promise<void>[] = [];
  for (const [key, held] of heldTriggerNotes) {
    if (held.isCurrent()) continue;
    releases.push(held.voice.release());
    heldTriggerNotes.delete(key);
    eventModesState.delete(key);
  }
  await Promise.all(releases.map(release => release.catch(error => {
    console.error("[ableton-rc-surface] MIDI release failed:", error);
  })));
}

async function releaseRetiredMappingWork(): Promise<void> {
  await releaseRetiredTriggerNotes();
  const releases: Promise<void>[] = [];
  for (const [key, state] of [...activeSmooths]) {
    if (!state.isCurrent || state.isCurrent()) continue;
    activeSmooths.delete(key);
    releases.push(state.apply(0).catch(() => {}));
  }
  await Promise.all(releases);
}

/** Invalidate unsent work; SDK calls already in flight cannot be recalled. */
export function cancelPendingMappingWrites(): Promise<void> {
  mappingDispatchGeneration++;
  mappingClientSessions.clear();
  globalWriteScheduler.clear();
  pendingMappedApplies.clear();
  for (const timers of clientReleaseTimers.values()) {
    for (const timer of timers) clearTimeout(timer);
  }
  clientReleaseTimers.clear();
  return releaseRetiredMappingWork();
}

// The LFO/stutter motor and the response curves used to live in this file.
// They are re-exported here so every existing import keeps resolving — this
// module is the public face of the mapping layer, and splitting it is not a
// reason to make callers chase symbols across new paths.
export {
  applyCurve,
  applyCurveInverse,
} from "./curves.js";
export { scaleTargetValue } from "./target-scale.js";
export {
  hostModulators,
  updateHostModulator,
  tickHostModulators,
  clearHostModulatorsForClient,
  startHostModulatorLoop,
  stopHostModulatorLoop,
  isHostModulatorLoopRunning,
  type HostModulatorKind,
  type HostModulatorSyncMode,
  type HostModulatorState,
} from "./host-modulators.js";

async function applyMappedValue(
  key: string,
  value: number,
  apply: (val: number) => Promise<void>,
  isDiscrete = false,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  globalWriteScheduler.enqueue({
    targetKey: key,
    isDiscrete,
    value,
    execute: async () => {
      if (!isCurrent()) return;
      if (activeApplyLocks.has(key)) {
        pendingMappedApplies.set(key, { value, apply, isCurrent });
        return;
      }
      activeApplyLocks.add(key);
      let nextValue = value;
      let nextApply = apply;
      let nextIsCurrent = isCurrent;
      try {
        while (nextIsCurrent()) {
          activeSmooths.delete(key);
          lastMappedValues.set(key, nextValue);
          await nextApply(nextValue);

          const pending = pendingMappedApplies.get(key);
          if (!pending) break;
          pendingMappedApplies.delete(key);
          nextValue = pending.value;
          nextApply = pending.apply;
          nextIsCurrent = pending.isCurrent;
        }
      } finally {
        activeApplyLocks.delete(key);
      }
    },
  });
  await globalWriteScheduler.flush();
}

function getTargetTrack(song: any, target: MappingTarget): any | undefined {
  const idx = target.trackIndex ?? 0;
  if (target.trackKind === 'return') return song.returnTracks?.[idx];
  if (target.trackKind === 'main') return song.mainTrack;
  return song.tracks?.[idx];
}

async function readTargetNormalizedValue(song: any, target: MappingTarget): Promise<number | null> {
  try {
    switch (target.type) {
      case 'tempo':
        return Math.max(0, Math.min(1, (song.tempo - 20) / 280));
      case 'track_mute':
        return getTargetTrack(song, target)?.mute ? 1 : 0;
      case 'track_solo':
        return getTargetTrack(song, target)?.solo ? 1 : 0;
      case 'track_arm':
        return getTargetTrack(song, target)?.arm ? 1 : 0;
      case 'mixer_volume':
      case 'mixer_pan':
      case 'mixer_send': {
        const mixer = getTargetTrack(song, target)?.mixer;
        const parameter = target.type === 'mixer_volume'
          ? mixer?.volume
          : target.type === 'mixer_pan'
            ? mixer?.panning
            : mixer?.sends?.[target.sendIndex ?? 0];
        if (!parameter || typeof parameter.getValue !== 'function') return null;
        const current = await parameter.getValue();
        const family = target.type === 'mixer_volume'
          ? 'mixer_volume'
          : target.type === 'mixer_pan'
            ? 'mixer_pan'
            : 'mixer_send';
        return unscaleTargetValue(
          current,
          parameter.min,
          parameter.max,
          parameter.isQuantized,
          target.targetScale ?? 'auto',
          parameter.name ?? '',
          family,
        );
      }
      case 'device_param': {
        const parameter = getTargetTrack(song, target)
          ?.devices?.[target.deviceIndex ?? 0]
          ?.parameters?.[target.paramIndex ?? 0];
        if (!parameter || typeof parameter.getValue !== 'function') return null;
        const current = await parameter.getValue();
        return unscaleTargetValue(
          current,
          parameter.min,
          parameter.max,
          parameter.isQuantized,
          target.targetScale ?? 'auto',
          parameter.name ?? '',
          'device',
        );
      }
    }
  } catch {
    return null;
  }
}

function targetNormalizedToInputValue(targetValue: number, target: MappingTarget): number {
  const minScale = target.outMin ?? 0;
  const maxScale = target.outMax ?? 1;
  const ranged = Math.abs(maxScale - minScale) > 0.0001
    ? (targetValue - minScale) / (maxScale - minScale)
    : 0;
  const inverse = applyCurveInverse(
    Math.max(0, Math.min(1, ranged)),
    target.curve,
    target.drive,
    target.compressor,
  );
  const inMin = target.inMin ?? 0;
  const inMax = target.inMax ?? 1;
  return Math.max(0, Math.min(1, inMin + inverse * (inMax - inMin)));
}

const DISCRETE_CONTROL_RE = /^(?:pad|toggle|button)-|^sensor\.vision\.gesture\.|^sensor\.audio\.(?:transient|kick|snare)$|\.(?:active|fist|pinch|victory|open|gate|transient)$/;

export function shouldUseTakeover(controlName: string, target: MappingTarget): boolean {
  if (target.mode === 'toggle' || target.mode === 'trigger_note') return false;
  if (target.type === 'track_mute' || target.type === 'track_solo' || target.type === 'track_arm') return false;
  return !DISCRETE_CONTROL_RE.test(controlName);
}

/**
 * Convert the shared 0..1 mapping domain into a Live target's native range.
 * The final boundary owns clamping so malformed saved ranges or stale clients
 * cannot drive Live beyond the target contract. Quantized parameters snap only
 * after scaling, in the same units exposed by the Live parameter.
 */
function isRelinkDispatchable(target: MappingTarget): boolean {
  if (!isSupportedMappingMode(target)) return false;
  return target.relinkStatus !== 'review'
    && target.relinkStatus !== 'ambiguous'
    && target.relinkStatus !== 'missing';
}

export async function reconcileMappedHostValues(clientId: string): Promise<void> {
  const song = getExtensionContext()?.application.song;
  if (!song) return;
  const jobs: Promise<void>[] = [];
  // Every mapping key is a control name: the surface is shared, and per-phone
  // keys are folded onto their control when the set loads.
  for (const [controlName, targets] of controlMappings) {
    for (const target of targets) {
      if (!isRelinkDispatchable(target)) continue;
      if (!shouldUseTakeover(controlName, target)) continue;
      if (Date.now() - (lastMappedInputAt.get(`${clientId}::${controlName}`) ?? 0) < 900) continue;
      jobs.push((async () => {
        const safeKey = `${clientId}::${controlName}::${getTargetKey(target)}`;
        const prior = safeInputRegistry.snapshot(safeKey);
        if (!prior) return;
        const targetValue = await readTargetNormalizedValue(song, target);
        if (targetValue === null) return;
        const hostValue = targetNormalizedToInputValue(targetValue, target);
        if (Math.abs(hostValue - prior.hostValue) <= 0.035) return;
        const result = safeInputRegistry.reconcileHost(safeKey, hostValue, Date.now());
        if (result) sendSafeInputFeedback(clientId, controlName, target, result);
      })());
    }
  }
  await Promise.all(jobs);
}

let hostReconcileTimer: NodeJS.Timeout | null = null;

export function startHostReconcileTimer(intervalMs = 500): void {
  if (hostReconcileTimer) return;
  hostReconcileTimer = setInterval(() => {
    for (const client of trackedClients.values()) {
      if (!client.isAdmin) void reconcileMappedHostValues(client.id);
    }
  }, intervalMs);
}

export function stopHostReconcileTimer(): void {
  if (!hostReconcileTimer) return;
  clearInterval(hostReconcileTimer);
  hostReconcileTimer = null;
}

export async function applyMapping(clientId: string, controlName: string, value: number, isDeactivated?: boolean): Promise<void> {
  // Mappings are addressed by control name alone. A phone-scoped lookup used
  // to come first, which is what let the same control mean different things
  // depending on who touched it — the ambiguity the shared surface removes.
  let targets = controlMappings.get(controlName);
  if (!targets || targets.length === 0) return;
  const binding = targets;
  const generation = mappingDispatchGeneration;
  let clientSession = mappingClientSessions.get(clientId);
  if (!clientSession) {
    clientSession = {};
    mappingClientSessions.set(clientId, clientSession);
  }
  targets = targets.filter(isRelinkDispatchable);
  if (targets.length === 0) return;
  const inputKey = `${clientId}::${controlName}`;
  const inputNow = Date.now();
  lastClientControlValues.set(inputKey, value);
  lastMappedInputAt.set(inputKey, inputNow);

  if (!isDeactivated && /^sensor\.(?:motion|orient)\./.test(controlName)) {
    const filterKey = `${clientId}::${controlName}`;
    let filter = sensorSignalFilters.get(filterKey);
    if (!filter) {
      filter = new SafeSignalFilter();
      sensorSignalFilters.set(filterKey, filter);
    }
    value = filter.process(value, Date.now()).value;
  }
  
  try {
    const extensionContext = getExtensionContext();
    if (!extensionContext) return;
    const song = extensionContext.application.song;
    if (!song) return;

    await Promise.all(targets.map(async (target) => {
      const isCurrent = () => generation === mappingDispatchGeneration
        && mappingClientSessions.get(clientId) === clientSession
        && getExtensionContext() === extensionContext
        && controlMappings.get(controlName) === binding && binding.includes(target);
      const inMin = target.inMin ?? 0;
      const inMax = target.inMax ?? 1;
      let safeInputValue = value;

      // "release" glides back instead of jumping; every other parking mode is
      // immediate. Set below so the smoothing stage picks it up.
      let releaseGlide = false;
      if (isDeactivated) {
        // Momentary controls (pads, buttons, gesture pulses, trigger notes)
        // always release straight to their off state — a pad that lingers or
        // eases out is a stuck note, not a safe loss.
        const isMomentary = MOMENTARY_CONTROL_RE.test(controlName) || target.mode === "trigger_note";
        // An explicit idleValue is a deliberate per-target override and wins
        // over the policy; it is applied further down as finalScaledValue.
        const hasIdleValue = target.idleValue !== undefined && target.idleValue !== null;
        if (!isMomentary && !hasIdleValue) {
          // Signal lost: the value on the wire is meaningless. Ask the
          // target's Safe loss policy what to do instead of trusting whatever
          // the client happened to send.
          const neutral = resolveNeutralInputValue(controlName, target);
          if (neutral === null) return; // "hold" — leave the parameter alone
          safeInputValue = neutral;
          // Only a sensor stream can actually lose signal, and only there does
          // easing back read as a release. Pads, knobs, faders and LFO toggles
          // are released by a disconnect and must snap, as they always have.
          releaseGlide = (target.neutralPolicy ?? "release") === "release"
            && controlName.startsWith("sensor.");
        }
      }

      if (!isDeactivated && shouldUseTakeover(controlName, target)) {
        const safeKey = `${clientId}::${controlName}::${getTargetKey(target)}`;
        const neutralValue = numericNeutral(
          target.neutralValue,
          target.neutralPolicy === 'center' ? 0.5 : 0,
        );
        const preferredMode = target.takeoverMode ?? currentProjectPreferences["globalTakeover"];
        const takeoverMode: TakeoverMode = preferredMode === 'pickup' || preferredMode === 'jump'
          ? preferredMode
          : 'scale';
        const safeConfig = { mode: takeoverMode, loss: { neutralValue } };
        const targetValue = safeInputRegistry.hasMatchingConfig(safeKey, safeConfig)
          ? null
          : await readTargetNormalizedValue(song, target);
        if (!isCurrent()) return;
        const hostValue = targetValue === null ? null : targetNormalizedToInputValue(targetValue, target);
        const safeResult = safeInputRegistry.process(
          safeKey,
          safeInputValue,
          hostValue === null
            ? { timestamp: Date.now() }
            : { hostValue, timestamp: Date.now() },
          safeConfig,
        );
        safeInputValue = safeResult.value;
        sendSafeInputFeedback(clientId, controlName, target, safeResult);
      }
      if (!isCurrent()) return;
      let normalized = 0;
      if (Math.abs(inMax - inMin) > 0.0001) {
        normalized = (safeInputValue - inMin) / (inMax - inMin);
      } else {
        normalized = safeInputValue >= inMin ? 1 : 0;
      }
      normalized = Math.max(0, Math.min(1, normalized));
      const inputCurved = applyCurve(normalized, target.curve, target.drive, target.compressor);

      const minScale = target.outMin ?? 0;
      const maxScale = target.outMax ?? 1;
      const scaledValue = minScale + inputCurved * (maxScale - minScale);
      let smoothFactor = target.smooth ?? 0;
      // A released control eases back over roughly a second. Reusing the
      // smoothing stage means the glide is redirected the instant the signal
      // returns, with no separate ramp to cancel.
      if (releaseGlide) smoothFactor = Math.max(smoothFactor, RELEASE_SMOOTH_FACTOR);
      if (target.smoothBpmSync && song.tempo) {
        const subdivision = target.smoothBpmSubdivision ?? 1;
        const beatDurationMs = 60000 / song.tempo;
        const T = beatDurationMs * subdivision;
        smoothFactor = Math.exp(-138 / T);
        smoothFactor = Math.max(0, Math.min(0.99, smoothFactor));
      }
      // Explicit modulator OFF is a stop, not another smoothed destination.
      // Retarget the sole writer immediately; an already-sent SDK call cannot
      // be recalled, but no unsent pulse or ramp may follow the release.
      if (isDeactivated && /^(?:toggle|button)-\d+$/.test(controlName)) smoothFactor = 0;
      // For trigger_note the modeState must be per-control, not just per-target,
      // because multiple controls can send different notes to the same MIDI track.
      // Including controlName in the key prevents cross-control state sharing.
      const key = target.mode === 'trigger_note'
        ? `${clientId}::${controlName}::${getTargetKey(target)}`
        : `${clientId}::${getTargetKey(target)}`;

      let modeState = eventModesState.get(key);
      if (!modeState) {
        modeState = { lastInput: 0, active: false };
        eventModesState.set(key, modeState);
      }

      let finalScaledValue = scaledValue;
      if (isDeactivated && target.idleValue !== undefined && target.idleValue !== null) {
        finalScaledValue = target.idleValue;
      }
      let skipApply = false;

      if (target.mode === 'trigger_note') {
        const threshold = target.threshold ?? 0.5;
        const isPressed = value >= threshold;
        const wasPressed = modeState.lastInput >= threshold;
        modeState.lastInput = value;

        const midiNum = noteNameToMidiNumber(target.midiNote ?? "C3");
        const velocity = target.midiVelocity ?? 100;

        if (isPressed && !wasPressed) {
          const voice = pressReceiverNote(song.tracks[target.trackIndex ?? 0], midiNum, velocity, isCurrent);
          const held = { voice, isCurrent };
          heldTriggerNotes.set(key, held);
          try {
            if (!await voice.started && heldTriggerNotes.get(key) === held) heldTriggerNotes.delete(key);
          } catch (error) {
            if (heldTriggerNotes.get(key) === held) heldTriggerNotes.delete(key);
            modeState.lastInput = 0;
            throw error;
          }
        } else if (!isPressed && wasPressed) {
          const held = heldTriggerNotes.get(key);
          heldTriggerNotes.delete(key);
          await held?.voice.release();
        }
        skipApply = true;
      } else if (target.mode === 'toggle') {
        const threshold = target.threshold ?? 0.5;
        const triggered = modeState.lastInput < threshold && value >= threshold;
        modeState.lastInput = value;

        if (triggered) {
          modeState.active = !modeState.active;
        }
        finalScaledValue = modeState.active ? (target.outMax ?? 1) : (target.outMin ?? 0);
      }

      if (skipApply) {
        lastMappedValues.set(key, value);
        return;
      }

      const applyFn = async (scaledVal: number) => {
        const getTrack = () => {
          const kind = target.trackKind;
          const idx = target.trackIndex ?? 0;
          if (kind === 'return') {
            return song.returnTracks[idx];
          } else if (kind === 'main') {
            return song.mainTrack;
          } else {
            return song.tracks[idx];
          }
        };
        switch (target.type) {
          case 'tempo': {
            song.tempo = scaleTargetValue(scaledVal, 20, 300, false, target.targetScale ?? 'auto', 'Tempo', 'tempo');
            break;
          }
          case 'track_mute': {
            const t = getTrack();
            if (t) t.mute = scaleTargetValue(scaledVal, 0, 1) > 0.5;
            break;
          }
          case 'track_solo': {
            const t = getTrack();
            if (t) t.solo = scaleTargetValue(scaledVal, 0, 1) > 0.5;
            break;
          }
          case 'track_arm': {
            const t = getTrack();
            if (t && "arm" in t) (t as any).arm = scaleTargetValue(scaledVal, 0, 1) > 0.5;
            break;
          }
          case 'mixer_volume': {
            const t = getTrack();
            if (t && "mixer" in t) {
              const mixer = t.mixer as any;
              const scaled = scaleTargetValue(scaledVal, mixer.volume.min, mixer.volume.max, mixer.volume.isQuantized, target.targetScale ?? 'auto', mixer.volume.name ?? 'Volume', 'mixer_volume');
              await mixer.volume.setValue(scaled);
            }
            break;
          }
          case 'mixer_pan': {
            const t = getTrack();
            if (t && "mixer" in t) {
              const mixer = t.mixer as any;
              const scaled = scaleTargetValue(scaledVal, mixer.panning.min, mixer.panning.max, mixer.panning.isQuantized, target.targetScale ?? 'auto', mixer.panning.name ?? 'Pan', 'mixer_pan');
              await mixer.panning.setValue(scaled);
            }
            break;
          }
          case 'mixer_send': {
            const t = getTrack();
            if (t && "mixer" in t) {
              const mixer = t.mixer as any;
              const send = mixer.sends[target.sendIndex ?? 0];
              if (send) {
                const scaled = scaleTargetValue(scaledVal, send.min, send.max, send.isQuantized, target.targetScale ?? 'auto', send.name ?? 'Send', 'mixer_send');
                await send.setValue(scaled);
              }
            }
            break;
          }
          case 'device_param': {
            const t = getTrack();
            if (t) {
              const device = t.devices[target.deviceIndex ?? 0];
              if (device) {
                const param = device.parameters[target.paramIndex ?? 0];
                if (param) {
                  const scaled = scaleTargetValue(scaledVal, param.min, param.max, param.isQuantized, target.targetScale ?? 'auto', param.name ?? '', 'device');
                  await param.setValue(scaled);
                }
              }
            }
            break;
          }
        }
      };

      const isAudioDescriptor = /^sensor\.audio\.(?:transient|kick|snare|brightness|centroid|flux|flatness|spread|rolloff|low|mid|high)$/.test(controlName);
      const applyIfCurrent = async (nextValue: number) => {
        if (isCurrent()) await applyFn(nextValue);
      };
      // Attack envelopes are momentary for takeover/loss, but a parameter
      // still needs bounded single-flight writes, not a discrete-event FIFO.
      // toggle-N/button-N are LFO/stutter output levels, not activation edges.
      // Stutter pulses driving analog parameters must not replay a FIFO tail.
      // Boolean destinations and explicit event modes still preserve FIFO.
      const isModulatorOutput = /^(?:toggle|button)-\d+$/.test(controlName);
      const isDiscrete = (!isAudioDescriptor && !isModulatorOutput && DISCRETE_CONTROL_RE.test(controlName)) || target.mode === 'toggle' || target.mode === 'trigger_note' || target.type === 'track_mute' || target.type === 'track_solo' || target.type === 'track_arm';
      if (!isDiscrete) {
        // Continuous values are routed through one physical-target actuator.
        // It retains only the newest destination and serializes SDK writes,
        // while still honoring the user's optional smoothing/release ramp.
        continuousTargetActuator.request({
          targetKey: getTargetKey(target),
          value: finalScaledValue,
          write: applyIfCurrent,
          isCurrent,
          smoothFactor,
          immediate: true,
          sourceTimeMs: Date.now(),
        });
        // Let the actuator start its non-overlapping SDK write before this
        // mapping frame returns, without waiting on a slow Live promise.
        await Promise.resolve();
        if (isCurrent()) lastMappedValues.set(key, finalScaledValue);
      } else if (smoothFactor > 0) {
        // Compatibility path for legacy discrete mappings that explicitly
        // requested smoothing; ordinary continuous controls never enter it.
        let state = activeSmooths.get(key);
        if (!state) {
          const lastVal = lastMappedValues.get(key) ?? finalScaledValue;
          state = {
            current: lastVal,
            target: finalScaledValue,
            smoothFactor,
            apply: applyFn,
            isCurrent,
            lastTime: Date.now()
          };
          activeSmooths.set(key, state);
        } else {
          state.target = finalScaledValue;
          state.smoothFactor = smoothFactor;
          state.apply = applyFn;
          state.isCurrent = isCurrent;
        }
        // The smooth interval stops itself as soon as the queue drains, and it
        // is otherwise started only once at activation. Without restarting it
        // here, every smoothed value queued after the first settle would sit in
        // activeSmooths forever and the Live parameter would freeze.
        startSmoothTimer();
      } else {
        await applyMappedValue(key, finalScaledValue, applyFn, isDiscrete, isCurrent);
      }
    }));
  } catch (err) {
    console.error(`[ableton-rc-surface] applyMapping(${controlName}) error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const MOMENTARY_CONTROL_RE = /^(?:pad|button)-|^sensor\.vision\.gesture\.|^sensor\.audio\.(?:transient|kick|snare)$|\.(?:active|fist|pinch|victory|open|gate|transient)$/;

/**
 * Resolve the INPUT-domain value a target falls back to when its signal is
 * lost (hand out of frame, camera off, sensor denied, client gone).
 *
 * Returns `null` for "hold": apply nothing, leave the Live parameter exactly
 * where it is.
 *
 * "release" returns a destination like the others; the GLIDE toward it is
 * applied by the caller (see RELEASE_SMOOTH_FACTOR), which is what separates
 * it from the instant parking modes.
 */
/**
 * A neutral value is a number. Mappings saved by older phone builds hold the
 * slider's string, and a stored `"0.35"` must not travel into a parameter
 * write; anything unreadable falls back to the policy's own default.
 */
function numericNeutral(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function resolveNeutralInputValue(
  controlName: string,
  target: Pick<MappingTarget, "neutralPolicy" | "neutralValue">,
  _lastValue?: number,
): number | null {
  switch (target.neutralPolicy) {
    case "hold":
      return null;
    case "zero":
      return 0;
    case "center":
      return 0.5;
    case "custom":
      return numericNeutral(target.neutralValue, 0);
    // Retired policies. Both meant "adopt Live's current value", which is
    // indistinguishable from leaving the parameter alone. Saved mappings still
    // load; they behave as hold.
    case "initial":
    case "reconcile":
      return null;
    case "release":
    default:
      // A position axis rests in the middle, a gate rests closed. Treating
      // every control as zero is what slammed lost signals to the minimum.
      return numericNeutral(target.neutralValue, defaultNeutralForControl(controlName));
  }
}

function defaultNeutralForControl(controlName: string): number {
  if (/sensor\.(?:motion|orient)\./.test(controlName)) return 0.5;
  if (/sensor\.vision\.(?:x|y|face)$/.test(controlName)) return 0.5;
  return 0;
}

export async function handleClientDisconnect(clientId: string): Promise<void> {
  // Retire queued gestures before creating deliberate loss/OFF commands.
  mappingClientSessions.delete(clientId);
  const midiReleases = releaseRetiredTriggerNotes();
  const prefix = `${clientId}::`;
  for (const timer of clientReleaseTimers.get(clientId) ?? []) clearTimeout(timer);
  clientReleaseTimers.delete(clientId);
  safeInputRegistry.markLost(prefix, Date.now());

  const momentary: Promise<void>[] = [midiReleases];
  const timers: NodeJS.Timeout[] = [];
  for (const [key, lastValue] of [...lastClientControlValues.entries()]) {
    if (!key.startsWith(prefix)) continue;
    const controlName = key.slice(prefix.length);
    const targets = controlMappings.get(key) ?? controlMappings.get(controlName) ?? [];
    const isMomentary = MOMENTARY_CONTROL_RE.test(controlName)
      || targets.some((target) => target.mode === 'trigger_note');
    if (isMomentary) {
      momentary.push(applyMapping(clientId, controlName, 0, true));
    } else if (controlName.startsWith('sensor.') && !targets.every((target) => target.neutralPolicy === 'hold')) {
      const neutral = targets.find((target) => target.neutralValue !== undefined)?.neutralValue
        ?? defaultNeutralForControl(controlName);
      const holdMs = 150;
      const releaseMs = 1200;
      const binding = controlMappings.get(controlName);
      const context = getExtensionContext();
      const generation = mappingDispatchGeneration;
      for (let step = 1; step <= 8; step++) {
        const timer = setTimeout(() => {
          if (generation !== mappingDispatchGeneration || getExtensionContext() !== context
            || controlMappings.get(controlName) !== binding) return;
          const progress = step / 8;
          const nextValue = lastValue + (neutral - lastValue) * progress;
          void applyMapping(clientId, controlName, nextValue, true);
        }, holdMs + releaseMs * (step / 8));
        timer.unref?.();
        timers.push(timer);
      }
    }
    lastClientControlValues.delete(key);
    lastMappedInputAt.delete(key);
  }
  if (timers.length) clientReleaseTimers.set(clientId, timers);
  await Promise.all(momentary);
}

/**
 * Controls whose mapped parameter is centred rather than bottomed — pan today.
 * The surface needs this to draw them: 0.5 on a volume fader is half open, and
 * on a pan it is the middle, and the same rectangle cannot mean both.
 */
export function getBipolarControls(): string[] {
  const nomes: string[] = [];
  for (const [controlName, targets] of controlMappings) {
    if (!targets || targets.length === 0) continue;
    if (targets.some((t) => t.type === "mixer_pan")) nomes.push(controlName);
  }
  return nomes;
}

export async function getControlValues(_clientId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const extensionContext = getExtensionContext();
  if (!extensionContext) return result;
  const song = extensionContext.application.song;
  if (!song) return result;

  // One shared surface: every mapping applies to whoever is asking. Splitting
  // on "::" to find a phone's own bindings also meant a control name that
  // happened to contain "::" was silently misread as one.
  const activeTargets = new Map<string, MappingTarget[]>(controlMappings);

  const promises = Array.from(activeTargets.entries()).map(async ([controlName, targets]) => {
    if (!targets || targets.length === 0) return;
    const target = targets.find((candidate) => isRelinkDispatchable(candidate)
      && candidate.mode !== 'trigger_note'
      && isSupportedMappingMode(candidate));
    if (!target) return;
    try {
      let scaledValue = 0;
      const getTrack = () => {
        const kind = target.trackKind;
        const idx = target.trackIndex ?? 0;
        if (kind === 'return') {
          return song.returnTracks[idx];
        } else if (kind === 'main') {
          return song.mainTrack;
        } else {
          return song.tracks[idx];
        }
      };
      switch (target.type) {
        case 'tempo': {
          scaledValue = unscaleTargetValue(
            song.tempo,
            20,
            300,
            false,
            target.targetScale ?? 'auto',
            'Tempo',
            'tempo',
          );
          break;
        }
        case 'track_mute': {
          const t = getTrack();
          scaledValue = t && t.mute ? 1 : 0;
          break;
        }
        case 'track_solo': {
          const t = getTrack();
          scaledValue = t && t.solo ? 1 : 0;
          break;
        }
        case 'track_arm': {
          const t = getTrack();
          scaledValue = t && t.arm ? 1 : 0;
          break;
        }
        case 'mixer_volume': {
          const t = getTrack();
          if (t && "mixer" in t) {
            const mixer = t.mixer as any;
            const v = await mixer.volume.getValue();
            scaledValue = unscaleTargetValue(
              v,
              mixer.volume.min,
              mixer.volume.max,
              mixer.volume.isQuantized,
              target.targetScale ?? 'auto',
              mixer.volume.name ?? 'Volume',
              'mixer_volume',
            );
          }
          break;
        }
        case 'mixer_pan': {
          const t = getTrack();
          if (t && "mixer" in t) {
            const mixer = t.mixer as any;
            const v = await mixer.panning.getValue();
            scaledValue = unscaleTargetValue(
              v,
              mixer.panning.min,
              mixer.panning.max,
              mixer.panning.isQuantized,
              target.targetScale ?? 'auto',
              mixer.panning.name ?? 'Pan',
              'mixer_pan',
            );
          }
          break;
        }
        case 'mixer_send': {
          const t = getTrack();
          if (t && "mixer" in t) {
            const mixer = t.mixer as any;
            const send = mixer.sends[target.sendIndex ?? 0];
            if (send) {
              const v = await send.getValue();
              scaledValue = unscaleTargetValue(
                v,
                send.min,
                send.max,
                send.isQuantized,
                target.targetScale ?? 'auto',
                send.name ?? 'Send',
                'mixer_send',
              );
            }
          }
          break;
        }
        case 'device_param': {
          const t = getTrack();
          if (t) {
            const device = t.devices[target.deviceIndex ?? 0];
            if (device) {
              const param = device.parameters[target.paramIndex ?? 0];
              if (param) {
                const v = await param.getValue();
                scaledValue = unscaleTargetValue(
                  v,
                  param.min,
                  param.max,
                  param.isQuantized,
                  target.targetScale ?? 'auto',
                  param.name ?? '',
                  'device',
                );
              }
            }
          }
          break;
        }
      }

      const minScale = target.outMin ?? 0;
      const maxScale = target.outMax ?? 1;
      let rawValue = 0;
      if (Math.abs(maxScale - minScale) > 0.0001) {
        rawValue = (scaledValue - minScale) / (maxScale - minScale);
      } else {
        rawValue = minScale;
      }
      rawValue = Math.max(0, Math.min(1, rawValue));
      const inverseCurved = applyCurveInverse(rawValue, target.curve, target.drive, target.compressor);
      
      const inMin = target.inMin ?? 0;
      const inMax = target.inMax ?? 1;
      const finalRaw = inMin + inverseCurved * (inMax - inMin);
      
      result[controlName] = Math.max(0, Math.min(1, finalRaw));
    } catch (err) {
      // ignore
    }
  });

  await Promise.all(promises);
  return result;
}

export type CommandSpec = {
  description: string;
  handler: (args: Record<string, any>) => Promise<any>;
};

// Module-level flag guarding the live-write bench so two concurrent calls
// never race on the same DeviceParameter. The bench is admin-only and short
// (≤ 30 s), so a simple boolean is enough — a queue would just delay the
// second caller without buying anything.
let benchInFlight = false;

export const commands: Record<string, CommandSpec> = {
  getTransportLiteState: {
    description: "Get current Transport Lite state from AbletonOSC",
    handler: async () => {
      // The selection has no listener behind it and is only read here and in
      // getSelectedLiveContext, so it is fetched on demand instead of polled.
      await oscTransport.requestSelection();
      return oscTransport.state;
    }
  },
  refreshTransportLocators: {
    description: "Refresh locator list from AbletonOSC",
    handler: async () => {
      oscTransport.refreshLocators();
      return { ok: true };
    }
  },
  transportPlay: {
    description: "Start playback via AbletonOSC",
    handler: async () => {
      oscTransport.play();
      return { ok: true };
    }
  },
  transportStop: {
    description: "Stop playback via AbletonOSC",
    handler: async () => {
      oscTransport.stopPlayback();
      return { ok: true };
    }
  },
  transportToggle: {
    description: "Toggle playback via AbletonOSC",
    handler: async () => {
      oscTransport.toggle();
      return { ok: true };
    }
  },
  transportPrevLocator: {
    description: "Jump to previous locator",
    handler: async () => {
      oscTransport.prevLocator();
      return { ok: true };
    }
  },
  transportNextLocator: {
    description: "Jump to next locator",
    handler: async () => {
      oscTransport.nextLocator();
      return { ok: true };
    }
  },
  transportJumpToLocator: {
    description: "Jump to a specific locator",
    handler: async (args) => {
      const indexOrName = args["indexOrName"];
      if (indexOrName !== undefined && indexOrName !== null) {
        oscTransport.jumpToLocator(indexOrName);
      }
      return { ok: true };
    }
  },
  getSelectedLiveContext: {
    description: "Get currently selected track and device from Ableton Live",
    handler: async () => {
      const { song } = requireCtx();
      await oscTransport.requestSelection();
      const trackIndex = oscTransport.state.selectedTrackIndex;
      const deviceIndex = oscTransport.state.selectedDeviceIndex;
      let trackName = "";
      let deviceName = "";
      if (trackIndex !== null && trackIndex >= 0 && trackIndex < song.tracks.length) {
        const track = song.tracks[trackIndex];
        if (track) {
          trackName = track.name;
          if (deviceIndex !== null && deviceIndex >= 0 && deviceIndex < track.devices.length) {
            const device = track.devices[deviceIndex];
            if (device) {
              deviceName = device.name;
            }
          }
        }
      }
      return {
        selectedTrackIndex: trackIndex,
        selectedDeviceIndex: deviceIndex,
        trackName,
        deviceName
      };
    }
  },
  getLocale: {
    description: "Read the interface language every surface follows.",
    handler: async () => {
      const { getLocale, SUPPORTED_LOCALES } = await import("../server/locale.js");
      return { locale: getLocale(), supported: [...SUPPORTED_LOCALES] };
    }
  },
  setLocale: {
    description: "Set the interface language for the panel, the phone and the QR.",
    handler: async (args: any) => {
      const { setLocale, getLocale } = await import("../server/locale.js");
      const before = getLocale();
      const locale = setLocale(args?.locale);
      return { locale, changed: locale !== before };
    }
  },
  getServerInfo: {
    description: "Get server state, LAN URLs, cert info, etc.",
    handler: async () => {
      const serverState = await import("../server/state.js");
      const cpuUtil = await import("../util/cpu.js");
      const { getControllerToken, getAdminToken } = await import("../server/session-auth.js");
      const ctrlToken = getControllerToken();
      const admToken = getAdminToken();
      const isRunning = serverState.serverInstance !== null;
      const port = serverState.actualPort;
      const httpsPort = serverState.actualHttpsPort;
      const { primary, others } = pickLanIps(getLanAddresses());
      const localeModule = await import("../server/locale.js");
      const { phoneUrl, adminUrl } = buildServerAccessUrls({
        isRunning,
        httpPort: port,
        httpsPort,
        primaryIp: primary,
        controllerToken: ctrlToken,
        adminToken: admToken,
        locale: localeModule.getLocale(),
      });
      const statusText = isRunning
        ? port !== null
          ? `Running (HTTP: ${port}${httpsPort ? `, HTTPS: ${httpsPort}` : ""})`
          : "Running (binding...)"
        : "Stopped";
      const cpuUsage = Math.round(cpuUtil.sampleCpuUsagePercent() * 100);
      return {
        isRunning,
        port,
        httpsPort,
        useHttps: serverState.useHttps,
        primaryIp: primary,
        otherIps: others,
        phoneUrl,
        adminUrl,
        statusText,
        cpuUsage,
        controllerToken: ctrlToken,
        adminToken: admToken,
      };
    }
  },

  getClients: {
    description: "List all connected non-admin clients.",
    handler: async () => {
      const list = [];
      const { CLIENT_STALE_MS } = await import("../server/ws.js");
      for (const c of trackedClients.values()) {
        if (!c.isAdmin) {
          list.push({
            client_id: c.id,
            display_name: c.displayName || "",
            user_agent: c.userAgent,
            status: Date.now() - c.lastSeen < CLIENT_STALE_MS ? "active" : "stale",
          });
        }
      }
      return { clients: list };
    }
  },

  getState: {
    description: "Return current Live state (tempo, tracks, scenes, scale, track metadata).",
    handler: async () => {
      const { song } = requireCtx();
      const tracks = song.tracks.map((t, i) => {
        return {
          index: i,
          name: t.name,
          type: t.constructor.name,
          mute: t.mute,
          arm: t.arm,
          solo: t.solo,
        };
      });
      return {
        tempo: song.tempo,
        trackCount: song.tracks.length,
        sceneCount: song.scenes.length,
        rootNote: song.rootNote,
        scaleName: song.scaleName,
        tracks,
      };
    },
  },

  setPlayhead: {
    description: "Set playhead state and position. Args: {active?: boolean, timeMs?: number}",
    handler: async (args) => {
      const active = args["active"];
      const timeMs = args["timeMs"];
      
      if (active !== undefined && typeof active !== "boolean") {
        throw new Error("active must be a boolean");
      }
      if (timeMs !== undefined && (typeof timeMs !== "number" || timeMs < 0)) {
        throw new Error("timeMs must be a non-negative number");
      }
      
      const now = Date.now();
      
      if (active !== undefined) {
        if (active && !playheadActive) {
          setPlayheadStartTime(now);
          setPlayheadActive(true);
        } else if (!active && playheadActive) {
          setPlayheadBaseTimeMs(timeMs ?? (playheadBaseTimeMs + (now - playheadStartTime)));
          setPlayheadActive(false);
        }

      }
      
      if (timeMs !== undefined) {
        if (playheadActive) {
          setPlayheadStartTime(now);
          setPlayheadBaseTimeMs(timeMs);
        } else {
          setPlayheadBaseTimeMs(timeMs);
        }
      }
      
      broadcastPlayheadState();
      
      const currentPos = playheadActive ? (playheadBaseTimeMs + (Date.now() - playheadStartTime)) : playheadBaseTimeMs;
      return { playheadActive, playheadTimeMs: currentPos };
    },
  },



  setTempo: {
    description: "Set song tempo in BPM. Args: {tempo: number}",
    handler: async (args) => {
      const { song } = requireCtx();
      const tempo = args["tempo"];
      if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo <= 0 || tempo > 1000) {
        throw new Error(`tempo must be a positive finite number, got: ${String(tempo)}`);
      }
      song.tempo = tempo;
      return { tempo: song.tempo };
    },
  },

  setTrackMute: {
    description: "Mute or unmute a track. Args: {index: number, mute: boolean}",
    handler: async (args) => {
      const { song } = requireCtx();
      const track = requireTrack(song, args["index"]);
      const mute = args["mute"];
      if (typeof mute !== "boolean") {
        throw new Error(`mute must be boolean, got: ${typeof mute}`);
      }
      track.mute = mute;
      return { index: args["index"], mute: track.mute };
    },
  },

  setTrackVolume: {
    description: "Set track mixer volume. Args: {index: number, volume: number (0.0 - 1.0)}",
    handler: async (args) => {
      const { song } = requireCtx();
      const track = requireTrack(song, args["index"]);
      const volume = args["volume"];
      if (typeof volume !== "number" || volume < 0 || volume > 1) {
        throw new Error(`volume must be 0.0 - 1.0, got: ${String(volume)}`);
      }
      const mixer = "mixer" in track ? track.mixer : undefined;
      if (!mixer || !("volume" in mixer)) {
        throw new Error(`track at index ${args["index"]} has no mixer.volume`);
      }
      const volParam = (mixer as any).volume;
      await volParam.setValue(volume);
      return { index: args["index"], volume };
    },
  },

  getDeviceParams: {
    description: "List parameters of a device. Args: {trackIndex: number, deviceIndex: number}.",
    handler: async (args) => {
      const { song } = requireCtx();
      const track = requireTrack(song, args["trackIndex"]);
      const deviceIndex = args["deviceIndex"];
      if (typeof deviceIndex !== "number" || deviceIndex < 0) {
        throw new Error(`deviceIndex must be a non-negative number, got: ${String(deviceIndex)}`);
      }
      const devices = track.devices;
      if (deviceIndex >= devices.length) {
        throw new Error(`deviceIndex ${deviceIndex} out of range; track has ${devices.length} devices`);
      }
      const device = devices[deviceIndex];
      if (!device) throw new Error(`no device at index ${deviceIndex}`);
      const params = await Promise.all(
        device.parameters.map((p, i) => ({ p, i }))
          .filter(({ p }) => p.name !== MIDI_PACKET_PARAMETER).map(async ({ p, i }) => ({
          index: i,
          name: p.name,
          value: await p.getValue(),
          min: p.min,
          max: p.max,
          defaultValue: p.defaultValue,
          isQuantized: p.isQuantized,
          valueItems: p.valueItems.map((vi) => ({ name: vi.name, shortName: vi.shortName })),
        })),
      );
      return { name: device.name, parameters: params };
    },
  },

  setDeviceParam: {
    description: "Set a device parameter value. Args: {trackIndex, deviceIndex, paramIndex, value}.",
    handler: async (args) => {
      const { song } = requireCtx();
      const track = requireTrack(song, args["trackIndex"]);
      const deviceIndex = args["deviceIndex"];
      const paramIndex = args["paramIndex"];
      const value = args["value"];
      if (typeof deviceIndex !== "number" || deviceIndex < 0) {
        throw new Error(`deviceIndex must be non-negative, got: ${String(deviceIndex)}`);
      }
      if (typeof paramIndex !== "number" || paramIndex < 0) {
        throw new Error(`paramIndex must be non-negative, got: ${String(paramIndex)}`);
      }
      if (typeof value !== "number") {
        throw new Error(`value must be a number, got: ${typeof value}`);
      }
      const devices = track.devices;
      if (deviceIndex >= devices.length) {
        throw new Error(`deviceIndex ${deviceIndex} out of range; track has ${devices.length} devices`);
      }
      const device = devices[deviceIndex];
      if (!device) throw new Error(`no device at index ${deviceIndex}`);
      if (paramIndex >= device.parameters.length) {
        throw new Error(`paramIndex ${paramIndex} out of range; device has ${device.parameters.length} parameters`);
      }
      const param = device.parameters[paramIndex];
      if (!param) throw new Error(`no parameter at index ${paramIndex}`);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`value must be a finite number, got: ${String(value)}`);
      }
      const clamped = Math.max(param.min, Math.min(param.max, value));
      await param.setValue(clamped);
      return { trackIndex: args["trackIndex"], deviceIndex, paramIndex, value: clamped };
    },
  },

  getActuatorStats: {
    description: "Read live-write counters and latency percentiles from ContinuousTargetActuator. Admin-only diagnostic.",
    handler: async () => continuousTargetActuator.getStats(),
  },

  resetActuatorStats: {
    description: "Clear every counter, ring buffer, and rate window in ContinuousTargetActuator. Admin-only diagnostic.",
    handler: async () => {
      continuousTargetActuator.resetStats();
      return { reset: true };
    },
  },

  benchDeviceParamWrites: {
    description: "Benchmark DeviceParameter.setValue write rate on a real Live parameter. Args: {trackIndex, deviceIndex, paramIndex, seconds (1..30, required), mode: 'single'|'parallel', parallel?: 2|4|8, intervalMs?: number, pattern: 'stairs'|'sine', hz?: number}. Admin-only diagnostic.",
    handler: async (args) => {
      if (benchInFlight) throw new Error("bench already running");
      // Claim the lock synchronously so any concurrent caller observes it
      // before we yield on `param.getValue()`. Every code path from here
      // to the return (including validation throws) runs through the
      // outer try/finally that releases the lock at the end.
      benchInFlight = true;
      try {
        const seconds = Number(args["seconds"]);
        if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 1 || seconds > 30) {
          throw new Error(`seconds must be an integer in 1..30, got: ${String(args["seconds"])}`);
        }
      const modeRaw = args["mode"] ?? "single";
      if (modeRaw !== "single" && modeRaw !== "parallel") {
        throw new Error(`mode must be 'single' or 'parallel', got: ${String(modeRaw)}`);
      }
      const patternRaw = args["pattern"] ?? "stairs";
      if (patternRaw !== "stairs" && patternRaw !== "sine") {
        throw new Error(`pattern must be 'stairs' or 'sine', got: ${String(patternRaw)}`);
      }
      let parallel = 1;
      if (modeRaw === "parallel") {
        const pRaw = args["parallel"];
        if (pRaw !== 2 && pRaw !== 4 && pRaw !== 8) {
          throw new Error(`parallel must be 2, 4 or 8, got: ${String(pRaw)}`);
        }
        parallel = pRaw;
      }
      let intervalMs = 5;
      if (modeRaw === "parallel") {
        const iRaw = args["intervalMs"];
        if (iRaw !== undefined) {
          if (typeof iRaw !== "number" || !Number.isFinite(iRaw) || iRaw <= 0) {
            throw new Error(`intervalMs must be a positive number, got: ${String(iRaw)}`);
          }
          intervalMs = iRaw;
        }
      }
      let hz = 1;
      if (patternRaw === "sine") {
        const hzRaw = args["hz"];
        if (hzRaw !== undefined) {
          if (typeof hzRaw !== "number" || !Number.isFinite(hzRaw) || hzRaw <= 0) {
            throw new Error(`hz must be a positive number, got: ${String(hzRaw)}`);
          }
          hz = hzRaw;
        }
      }

      const { song } = requireCtx();
      const track = requireTrack(song, args["trackIndex"]);
      const deviceIndex = args["deviceIndex"];
      const paramIndex = args["paramIndex"];
      if (typeof deviceIndex !== "number" || deviceIndex < 0) {
        throw new Error(`deviceIndex must be non-negative, got: ${String(deviceIndex)}`);
      }
      if (typeof paramIndex !== "number" || paramIndex < 0) {
        throw new Error(`paramIndex must be non-negative, got: ${String(paramIndex)}`);
      }
      const devices = track.devices;
      if (deviceIndex >= devices.length) {
        throw new Error(`deviceIndex ${deviceIndex} out of range; track has ${devices.length} devices`);
      }
      const device = devices[deviceIndex];
      if (!device) throw new Error(`no device at index ${deviceIndex}`);
      if (paramIndex >= device.parameters.length) {
        throw new Error(`paramIndex ${paramIndex} out of range; device has ${device.parameters.length} parameters`);
      }
      const param = device.parameters[paramIndex];
      if (!param) throw new Error(`no parameter at index ${paramIndex}`);
      if (param.isQuantized) {
        throw new Error("bench refuses quantized parameters; use a continuous one");
      }
      const min = typeof param.min === "number" ? param.min : 0;
      const max = typeof param.max === "number" ? param.max : 1;
      const range = max - min;
      const mid = (min + max) / 2;
      const paramInfo = { name: param.name ?? `param ${paramIndex}`, min, max };

      const initial = await param.getValue();
      const started = Date.now();
      let writesStarted = 0;
      let writesCompleted = 0;
      let writesFailed = 0;
      let skipped = 0;
      const completionMs: number[] = [];

      const stairsValue = (step: number): number => min + range * (0.2 + 0.2 * step);
      const sineValue = (tMs: number): number => mid + 0.4 * range * Math.sin(2 * Math.PI * hz * (tMs / 1000));

      const recordCompletion = (durationMs: number) => {
        writesCompleted += 1;
        completionMs.push(durationMs);
      };
      const recordFailure = () => { writesFailed += 1; };

      try {
        if (modeRaw === "single") {
          let step = 0;
          while ((Date.now() - started) / 1000 < seconds) {
            const value = patternRaw === "stairs" ? stairsValue(step % 4) : sineValue(Date.now() - started);
            const t0 = nowMs();
            writesStarted += 1;
            try {
              await param.setValue(value);
              recordCompletion(nowMs() - t0);
            } catch {
              recordFailure();
            }
            step += 1;
          }
        } else {
          // parallel mode: fire setValue at intervalMs cadence, keep at most
          // `parallel` promises in flight; skip ticks when at capacity.
          const inFlight = new Set<Promise<unknown>>();
          let step = 0;
          const interval = setInterval(() => {
            if ((Date.now() - started) / 1000 >= seconds) return;
            if (inFlight.size >= parallel) {
              skipped += 1;
              step += 1;
              return;
            }
            const value = patternRaw === "stairs" ? stairsValue(step % 4) : sineValue(Date.now() - started);
            step += 1;
            writesStarted += 1;
            const t0 = nowMs();
            const p = param.setValue(value).then(
              () => recordCompletion(nowMs() - t0),
              () => recordFailure(),
            ).finally(() => { inFlight.delete(p); });
            inFlight.add(p);
          }, intervalMs);
          try {
            await new Promise<void>((resolve) => {
              const check = () => {
                if ((Date.now() - started) / 1000 >= seconds && inFlight.size === 0) resolve();
                else setTimeout(check, 10);
              };
              check();
            });
          } finally {
            clearInterval(interval);
          }
          // Drain any tail of in-flight writes.
          while (inFlight.size > 0) await Promise.allSettled(Array.from(inFlight));
        }
      } finally {
        // Always restore the initial value and release the bench flag.
        try { await param.setValue(initial); } catch { /* swallow */ }
        benchInFlight = false;
      }

      const sorted = completionMs.slice().sort((a, b) => a - b);
      const sum = sorted.reduce((acc, value) => acc + value, 0);
      const mean = sorted.length > 0 ? sum / sorted.length : 0;
      const pct = (p: number) => {
        if (sorted.length === 0) return 0;
        const rank = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
        return sorted[rank] ?? 0;
      };
      const elapsedMs = Date.now() - started;
      return {
        started: writesStarted,
        completed: writesCompleted,
        failed: writesFailed,
        skipped,
        seconds,
        elapsedMs,
        ratePerSecond: elapsedMs > 0 ? (writesCompleted * 1000) / elapsedMs : 0,
        meanMs: mean,
        p50Ms: pct(0.5),
        p95Ms: pct(0.95),
        maxMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
        mode: modeRaw,
        parallel,
        pattern: patternRaw,
        hz: patternRaw === "sine" ? hz : undefined,
        param: paramInfo,
      };
      } finally {
        // The inner bench loop's finally restores the initial value and
        // flips benchInFlight back to false; running it through this outer
        // try is enough — we only need to guarantee release on validation
        // errors above, which never reach the inner finally. If a validation
        // throws, release the lock here before re-throwing.
        if (benchInFlight) benchInFlight = false;
      }
    },
  },

  addUdpReceiverToTrack: {
    description: "Check that the RC-Midi-Receiver Max device is present on a track.",
    handler: async (args) => {
      const trackIndex = args["trackIndex"];
      if (typeof trackIndex !== "number") throw new Error("trackIndex must be a number");
      const { song } = requireCtx();
      const track = requireTrack(song, trackIndex);

      const receiver = findMidiReceiver(track);
      if (receiver.device) {
        return { success: true, existing: true, inserted: false, receiverName: receiver.device.name };
      }

      // Track.insertDevice only accepts devices built into Live. A Max for Live
      // .amxd can therefore be detected here, but not inserted through the
      // supported Extensions SDK API. Report that state without making a call
      // that is guaranteed to fail in the host.
      return { success: false, inserted: false, existing: receiver.reason !== "receiver_missing", reason: receiver.reason };
    }
  },

  getTargets: {
    description: "List all mappable targets: tracks with mixer params + devices with params.",
    handler: async () => {
      const { song } = requireCtx();
      const targets: any[] = [];
      const tempo = Number.isFinite(song.tempo) ? song.tempo : 120;
      targets.push({ id: 'tempo', type: 'tempo', label: `Song Tempo (${tempo.toFixed(1)} BPM)` });

      const buildTrackData = (track: any, ti: number, trackKind: 'track' | 'return' | 'main') => {
        if (!track) return null;
        const tName = track.name || (trackKind === 'main' ? 'Master' : `${trackKind === 'return' ? 'Return' : 'Track'} ${ti + 1}`);
        const trackTargets: any[] = [];
        if ("mixer" in track && track.mixer) {
          const mixer = track.mixer as any;
          trackTargets.push({ type: 'mixer_volume', trackIndex: ti, trackKind, label: 'Volume' });
          trackTargets.push({ type: 'mixer_pan', trackIndex: ti, trackKind, label: 'Pan' });
          if (Array.isArray(mixer.sends)) {
            for (let si = 0; si < mixer.sends.length; si++) {
              const sendParam = mixer.sends[si];
              trackTargets.push({ type: 'mixer_send', trackIndex: ti, trackKind, sendIndex: si, label: sendParam?.name || `Send ${si + 1}` });
            }
          }
        }
        trackTargets.push({ type: 'track_mute', trackIndex: ti, trackKind, label: 'Mute' });
        trackTargets.push({ type: 'track_solo', trackIndex: ti, trackKind, label: 'Solo' });
        if (trackKind === 'track') {
          trackTargets.push({ type: 'track_arm', trackIndex: ti, trackKind, label: 'Arm' });
        }
        
        const devicesList: any[] = [];
        const devices = Array.isArray(track.devices) ? track.devices : [];
        for (let di = 0; di < devices.length; di++) {
          const device = devices[di];
          if (!device) continue;
          const params: any[] = [];
          const parameters = Array.isArray(device.parameters) ? device.parameters : [];
          for (let pi = 0; pi < parameters.length; pi++) {
            const p = parameters[pi];
            if (!p || p.name === MIDI_PACKET_PARAMETER) continue;
            params.push({ type: 'device_param', trackIndex: ti, trackKind, deviceIndex: di, paramIndex: pi, label: p.name ?? `Param ${pi + 1}`, min: p.min ?? 0, max: p.max ?? 1 });
          }
          devicesList.push({ index: di, name: device.name ?? `Device ${di + 1}`, params });
        }
        return {
          trackIndex: ti,
          trackKind,
          name: tName,
          isMidi: Boolean(track.isMidi || track.is_midi_track || track.constructor?.name === "MidiTrack"),
          mute: trackKind === 'main' ? false : Boolean(track.mute),
          solo: trackKind === 'main' ? false : Boolean(track.solo),
          arm: trackKind === 'track' ? Boolean(track.arm) : false,
          mixer: trackTargets,
          devices: devicesList
        };
      };

      const tracks = Array.isArray(song.tracks) ? song.tracks : [];
      for (let ti = 0; ti < tracks.length; ti++) {
        const data = buildTrackData(tracks[ti], ti, 'track');
        if (data) targets.push(data);
      }
      const returnTracks = song.returnTracks || [];
      for (let ti = 0; ti < returnTracks.length; ti++) {
        const data = buildTrackData(returnTracks[ti], ti, 'return');
        if (data) targets.push(data);
      }
      const mainTrack = song.mainTrack;
      if (mainTrack) {
        const data = buildTrackData(mainTrack, 0, 'main');
        if (data) targets.push(data);
      }

      return { targets };
    },
  },

  setMapping: {
    description: "Map a phone control to Ableton targets. Args: {control: string, target?: MappingTarget, targets?: MappingTarget[]}",
    handler: async (args) => runMappingMutation(async () => {
      const control = args["control"];
      const target = args["target"] as MappingTarget | undefined;
      const targets = args["targets"] as MappingTarget[] | undefined;
      if (typeof control !== "string" || !control) throw new Error("control must be a non-empty string");
      
      let finalTargets: MappingTarget[] = [];
      if (Array.isArray(targets)) {
        finalTargets = targets;
      } else if (target && typeof target === "object" && target.type) {
        finalTargets = [target];
      } else {
        throw new Error("either target or targets must be specified");
      }
      if (finalTargets.some((candidate) => !isSupportedMappingMode(candidate))) {
        throw new Error('Unsupported or retired mapping mode');
      }

      const nextMappings = new Map(controlMappings);
      nextMappings.set(control, finalTargets);
      await saveMappings(nextMappings);
      controlMappings.set(control, finalTargets);
      safeInputRegistry.deleteControl(control);
      return { control, targets: finalTargets, total: controlMappings.size };
    }),
  },

  removeMapping: {
    description: "Remove a mapping. Args: {control: string}",
    handler: async (args) => runMappingMutation(async () => {
      const control = args["control"];
      if (typeof control !== "string") throw new Error("control must be a string");
      const controlKey = String(control);
      const nextMappings = new Map(controlMappings);
      const had = nextMappings.delete(controlKey);
      await saveMappings(nextMappings);
      controlMappings.delete(controlKey);
      safeInputRegistry.deleteControl(controlKey);
      return { control, removed: had, total: controlMappings.size };
    }),
  },

  highlightControl: {
    description: "Highlight a specific control on the connected phone for discovery. Args: {control: string, durationMs: number}",
    handler: async (args) => {
      const control = args["control"] as string;
      const durationMs = (args["durationMs"] as number) || 2000;
      for (const client of trackedClients.values()) {
        if (client.isAdmin) continue;
        try {
          client.ws.send(JSON.stringify({
            type: 'highlight',
            control,
            durationMs
          }));
        } catch {}
      }
      return { ok: true, control, durationMs };
    }
  },

  getProjectConfigStatus: {
    description: "Return per-set .rcsurface load/relink status and SDK limitations.",
    handler: async () => getProjectConfigStatus(),
  },

  saveProjectClientState: {
    description: "Persist set-specific camera, gesture, page and safety preferences.",
    handler: async (args) => runMappingMutation(async () => {
      const previousPreferences = currentProjectPreferences;
      const previousExtras = currentProjectExtras;
      if (args["preferences"] && typeof args["preferences"] === "object" && !Array.isArray(args["preferences"])) {
        currentProjectPreferences = { ...currentProjectPreferences, ...args["preferences"] };
      }
      for (const key of ["camera", "gestures", "pages"] as const) {
        if (args[key] && typeof args[key] === "object" && !Array.isArray(args[key])) {
          currentProjectExtras = { ...currentProjectExtras, [key]: args[key] };
        }
      }
      try {
        await saveCurrentProjectProfile();
      } catch (error) {
        currentProjectPreferences = previousPreferences;
        currentProjectExtras = previousExtras;
        throw error;
      }
      return getProjectConfigStatus();
    }),
  },

  exportProjectConfig: {
    description: "Export current set profile as validated JSON content.",
    handler: async () => {
      const { song } = requireCtx();
      const config = buildProjectConfig(song, controlMappings as Map<string, any[]>, currentProjectPreferences, currentProjectExtras);
      return {
        success: true,
        filename: `${config.project.fingerprint}.rcsurface`,
        content: JSON.stringify(config, null, 2),
        mappings: controlMappings.size,
      };
    },
  },

  importProjectConfig: {
    description: "Import, validate and safely relink .rcsurface JSON content. Args: {content: string|object}",
    handler: async (args) => runMappingMutation(async () => {
      const content = args["content"];
      if (typeof content !== "string" && (!content || typeof content !== "object")) {
        throw new Error("content must be .rcsurface JSON");
      }
      const { song } = requireCtx();
      const config = validateProjectConfig(typeof content === "string" ? JSON.parse(content) : content);
      const relink = relinkProjectConfig(config, song);
      const previousMappings = new Map(controlMappings);
      const previousPreferences = currentProjectPreferences;
      const previousExtras = currentProjectExtras;
      const previousReport = currentProjectReport;
      const previousLoaded = projectConfigLoaded;
      controlMappings.clear();
      for (const [control, targets] of relink.mappings) controlMappings.set(control, targets as MappingTarget[]);
      currentProjectPreferences = { ...config.preferences };
      currentProjectExtras = { camera: config.camera, gestures: config.gestures, pages: config.pages };
      currentProjectReport = relink.report;
      projectConfigLoaded = true;
      try {
        await saveMappings();
      } catch (error) {
        controlMappings.clear();
        for (const [control, targets] of previousMappings) controlMappings.set(control, targets);
        currentProjectPreferences = previousPreferences;
        currentProjectExtras = previousExtras;
        currentProjectReport = previousReport;
        projectConfigLoaded = previousLoaded;
        throw error;
      }
      safeInputRegistry.clear();
      return getProjectConfigStatus();
    }),
  },

  confirmProjectRelink: {
    description: "Confirm a medium-confidence or ambiguous relink candidate.",
    handler: async (args) => runMappingMutation(async () => {
      const control = args["control"];
      const targetIndex = Number(args["targetIndex"] ?? 0);
      const candidateIndex = Number(args["candidateIndex"] ?? 0);
      if (typeof control !== "string") throw new Error("control must be a string");
      const targets = controlMappings.get(control);
      const original = targets?.[targetIndex];
      const candidate = original?.relinkCandidates?.[candidateIndex];
      if (!targets || !original || !candidate) throw new Error("relink candidate not found");
      if (original.relinkStatus !== 'review' && original.relinkStatus !== 'ambiguous') {
        throw new Error("target is not awaiting confirmation");
      }
      const previousTargets = targets.slice();
      const { relinkCandidates: _discardedCandidates, ...originalWithoutCandidates } = original;
      targets[targetIndex] = {
        ...originalWithoutCandidates,
        ...candidate.target,
        relinkStatus: 'relinked',
        relinkConfidence: candidate.confidence,
      };
      try {
        await saveMappings();
      } catch (error) {
        controlMappings.set(control, previousTargets);
        throw error;
      }
      return { success: true, control, targetIndex, confidence: candidate.confidence };
    }),
  },

  rollbackProjectConfig: {
    description: "Restore the previous atomic .rcsurface backup.",
    handler: async () => runMappingMutation(async () => {
      if (!currentProjectFilePath) throw new Error("no active .rcsurface profile");
      await rollbackProjectConfigFile(currentProjectFilePath);
      const { song } = requireCtx();
      const config = await loadProjectConfigFile(currentProjectFilePath);
      const relink = relinkProjectConfig(config, song);
      controlMappings.clear();
      safeInputRegistry.clear();
      for (const [control, targets] of relink.mappings) controlMappings.set(control, targets as MappingTarget[]);
      currentProjectReport = relink.report;
      currentProjectPreferences = { ...config.preferences };
      currentProjectExtras = { camera: config.camera, gestures: config.gestures, pages: config.pages };
      return getProjectConfigStatus();
    }),
  },

  getMappings: {
    description: "Return all active mappings.",
    handler: async () => {
      const obj: Record<string, MappingTarget[]> = {};
      for (const [k, v] of controlMappings.entries()) obj[k] = v;
      return { mappings: obj, total: controlMappings.size };
    },
  },

  clearMappings: {
    description: "Clear all mappings.",
    handler: async () => runMappingMutation(async () => {
      const count = controlMappings.size;
      await saveMappings(new Map());
      controlMappings.clear();
      await cancelPendingMappingWrites();
      safeInputRegistry.clear();
      // Clear derived state so future mappings don't inherit stale data
      // (e.g. a new trigger_note binding could otherwise re-fire a
      // toggle that was left active by the previous mapping).
      lastMappedValues.clear();
      eventModesState.clear();
      for (const [key, state] of [...activeSmooths.entries()]) {
        activeSmooths.delete(key);
        try { await state.apply(0); } catch {}
      }
      continuousTargetActuator.cancel();
      await stopAllHostModulators();
      return { cleared: count };
    })
  },

  listPresets: {
    description: "List all saved mapping presets.",
    handler: async () => {
      if (!presetsDirPath) return { presets: [], current: currentPresetName };
      try {
        await fs.mkdir(presetsDirPath, { recursive: true });
        const files = await fs.readdir(presetsDirPath);
        const presets = files
          .filter(f => f.endsWith(".json"))
          .map(f => f.slice(0, -5));
        return { presets, current: currentPresetName };
      } catch (err) {
        return { presets: [], current: currentPresetName };
      }
    }
  },

  savePreset: {
    description: "Save current mappings as a named preset. Args: {name: string}",
    handler: async (args) => runMappingMutation(async () => {
      const name = args["name"];
      if (typeof name !== "string" || !name) throw new Error("preset name must be a non-empty string");
      if (!presetsDirPath) throw new Error("storage directory not ready");

      const cleanName = sanitizeFilenameComponent(name);
      const filePath = path.join(presetsDirPath, `${cleanName}.json`);

      const obj: Record<string, MappingTarget[]> = {};
      for (const [k, v] of controlMappings.entries()) obj[k] = v;

      const staged = await stageTextFile(filePath, JSON.stringify(obj, null, 2));
      await staged.commit();
      currentPresetName = cleanName;
      return { success: true, name: cleanName };
    })
  },

  loadPreset: {
    description: "Load a named mapping preset. Args: {name: string}",
    handler: async (args) => runMappingMutation(async () => {
      const name = args["name"];
      if (typeof name !== "string" || !name) throw new Error("preset name must be a non-empty string");
      if (!presetsDirPath) throw new Error("storage directory not ready");

      const cleanName = sanitizeFilenameComponent(name);
      const filePath = path.join(presetsDirPath, `${cleanName}.json`);

      const raw = await fs.readFile(filePath, "utf-8");
      const obj = JSON.parse(raw) as Record<string, MappingTarget | MappingTarget[]>;
      const nextMappings = new Map<string, MappingTarget[]>();
      for (const [k, v] of Object.entries(migrateLegacyClientMappings(obj).mappings)) {
        nextMappings.set(k, Array.isArray(v) ? v : [v]);
      }
      await saveMappings(nextMappings);
      controlMappings.clear();
      await cancelPendingMappingWrites();
      safeInputRegistry.clear();
      // Reset derived state so the new preset starts from a clean slate.
      // Without this, modulators/smooths/eventModes from the old preset
      // continue running against (now missing) target keys.
      lastMappedValues.clear();
      eventModesState.clear();
      for (const [key, state] of [...activeSmooths.entries()]) {
        activeSmooths.delete(key);
        try { await state.apply(0); } catch {}
      }
      continuousTargetActuator.cancel();
      await stopAllHostModulators();
      for (const [k, v] of nextMappings) controlMappings.set(k, v);
      currentPresetName = cleanName;

      return { success: true, name: cleanName, mappingsCount: controlMappings.size };
    })
  },

  deletePreset: {
    description: "Delete a named mapping preset. Args: {name: string}",
    handler: async (args) => runMappingMutation(async () => {
      const name = args["name"];
      if (typeof name !== "string" || !name) throw new Error("preset name must be a non-empty string");
      if (!presetsDirPath) throw new Error("storage directory not ready");

      const cleanName = sanitizeFilenameComponent(name);
      const filePath = path.join(presetsDirPath, `${cleanName}.json`);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }
      if (currentPresetName === cleanName) {
        currentPresetName = "Default";
      }
      return { success: true, name: cleanName };
    })
  },
};

registerCatalogCommands(commands);
