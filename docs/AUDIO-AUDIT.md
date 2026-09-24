# Audio checks — Browser

A manual test for the maintainer to run; still pending. The old tonal lab was
removed. These checks neither measure end-to-end latency nor sign off Native Track.

1. Use a test Live Set and the reviewed ABLX. In AUD select the intended input.
   Reloading must remember the choice but leave capture off.
2. Enable capture. Check RMS/envelope and all twelve cards. There should be
   no detected-note, tonal clarity or audio BPM interface.
3. Prefer loopback/virtual cable for controlled comparisons: silence, low/mid/high
   tones, noise and isolated attacks. Record source file/segment, browser, input,
   sample rate and WINDOW with each observation.
4. Map a descriptor to a safe parameter. Start with SMOOTH OFF, GAIN ×1 and
   WINDOW x1. Observe attacks, decay and signal loss. Kick/Snare are heuristics,
   not reliable instrument classifiers for arbitrary mixed music.
5. In SYNC test RELEASE/SMOOTH down to 1/128, T and D, then change Live BPM.
   FREE should restore its separate millisecond values. OFF remains available.
6. Check Amplitude, Attacks, Tone, Texture, Bands and All: curves and legends
   should agree with cards and the displayed vertical ceiling.
7. Disable capture, switch inputs and unplug the device. Check Safe loss,
   explicit unavailable-device feedback and no auto-capture after reload.

Keep observations apart from measurements. Measuring latency requires reference
and response audio recorded against the same clock; what you hear, or the length
of a DSP window, is not that measurement. The Native Track bench remains deferred and
outside this version. See the [current guide](./USER-GUIDE.md).
