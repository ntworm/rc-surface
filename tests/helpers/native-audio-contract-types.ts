// Compile-only fixture; never loaded by the product.
import '../../static/shared/native-audio-contract.js';
import type { Descriptor, Frame, Settings, DeviceSnapshot, ConfigChange } from '../../static/shared/native-audio-contract.js';
declare const untrusted: unknown;
const frame = NativeAudioContract.validateFrame(untrusted);
const value: number = frame.values.high;
const rate: Frame['sampleRate'] = frame.sampleRate;
// @ts-expect-error validated values are immutable at runtime and in types
frame.values.high = 1;
// @ts-expect-error no retired descriptor
const retired: Descriptor = 'pitch';
// @ts-expect-error values must first pass boundary validation
const unchecked: Frame = untrusted;
const change: ConfigChange = { kind: 'settings', patch: { releaseBeats: .03125 } };
const checked = NativeAudioContract.validateChange(change);
if (checked.kind === 'settings') {
  const release: Settings['releaseBeats'] | undefined = checked.patch.releaseBeats;
  void release;
}
const exchange = NativeAudioContract.validateExchange(untrusted);
if (exchange.snapshot) {
  const mode: DeviceSnapshot['settings']['syncMode'] = exchange.snapshot.settings.syncMode;
  void mode;
}
void [value, rate, checked, retired, unchecked];
