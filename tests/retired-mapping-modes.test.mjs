import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyClientMappings } from '../src/live/project-config.ts';

test('old or unknown mapping modes are removed without changing active bindings', () => {
  const active = { type: 'device_param', mode: 'trigger_note', midiNote: 'C3' };
  const retired = { type: 'device_param', mode: 'follow_detected_note' };
  const input = { 'sensor.audio.note': [retired], 'pad-1': [active, retired], 'knob-1': [{ type: 'mixer_pan' }] };
  const result = migrateLegacyClientMappings(input);
  assert.equal(Object.hasOwn(result.mappings, 'sensor.audio.note'), false);
  assert.deepEqual(result.mappings['pad-1'], [active]);
  assert.deepEqual(result.mappings['knob-1'], input['knob-1']);
  assert.ok(result.conflicts.length > 0, 'report removal for review');
  assert.equal(input['pad-1'].length, 2, 'never mutate a loaded preset in place');
});
