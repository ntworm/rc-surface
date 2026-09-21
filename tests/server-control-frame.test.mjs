import test from 'node:test';
import assert from 'node:assert/strict';
import { boundControlFrame } from '../src/server/ws-bounds.ts';

test('control frames admit bounded scalar/XY batches and reject the entire malformed frame', () => {
  const valid = [{ name: 'xy-1', x: 0.2, y: 0.9 }, { name: 'sensor.audio.transient', value: 0.5, lost: false }];
  assert.deepEqual(boundControlFrame(valid), valid);
  assert.ok(boundControlFrame([{ name: 'pad-1', value: 1 }, { name: 'pad-1', value: 0 }]), 'ordered edges may repeat a name');
  for (const invalid of [null, [], [{ name: 'x', value: Infinity }], [{ name: 'x', x: 0.5 }], [{ name: 'x', value: 2 }], [{ name: 'x', value: 1, lost: 'yes' }], Array.from({ length: 129 }, (_, i) => ({ name: `fader-${i}`, value: 1 }))]) {
    assert.equal(boundControlFrame(invalid), null);
  }
});
