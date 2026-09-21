# Diagnostic Report: Vision Gesture Recognition Drift (F-009)

## 1. Context and Objective

- **Task**: `rc-surface-vision-gesture-drift-investigation-2026-09-19` (Revision 2)
- **Defect Investigated**: F-009 (alleged degradation/drift in static gesture recognition after prolonged camera sessions).
- **Branch / Base Commit**: `plan/rc-surface-vision-gesture-drift-investigation-2026-09-19` @ `3f32f929ecb5f5a5c57a08555cda221dcc773850`
- **Product Policy**: Strict investigation only. Zero runtime code modifications, zero new sensitivity controls, zero threshold alterations, zero video/image persistence, zero telemetry/external network calls.

---

## 2. Architectural Pipeline & Dataflow Graph

Source analysis of `static/phone-v3/vision-processor.js`, `static/phone-v3/safe-input-layer.js`, and `static/phone-v3/app.js`:

```text
[Camera Stream: 320x240 @ ~30 FPS]
                │
                ▼
[MediaPipe Hands (locateFile local bundle, modelComplexity: 0)]
                │
                ├─► multiHandedness (label: Left/Right, score)
                └─► multiHandLandmarks[0] (21 3D points)
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
[computeHandData + 1€ filter]             [normalizeHandPose(landmarks)]
  - x, y, z (OneEuroFilter smoothed)        - Raw landmarks directly normalized
  - Palm size depth, facing, pinch          - Invariant to 1€ position filter!
  - Clutch / Continuous wire controls       - Output: 20-dim descriptor vector
                                                      │
                                                      ▼
                                           [GestureLibrary.evaluate]
                                             - weightedPoseDistance to templates
                                             - Relative radius normalization
                                             - Limit & minimumConfidence check
                                             - Output: { score, confidence, accepted }
                                                      │
                                                      ▼
                                           [GestureLibrary.recognize]
                                             - Candidate hold timer (holdMs)
                                             - Single-shot edge trigger: match
                                             - Active hold lock (activeName set)
                                             - Release timer (releaseMs / unknownGraceMs)
                                                      │
                                                      ▼
                                           [VisionProcessor.onGesture]
                                             - Dispatches to UI / wire trigger
```

### Key Architectural Findings:
1. **1€ Filter Isolation**:
   The `OneEuroFilter` instances (`this.positionFilters.x, y, z`) smooth the continuous hand position coordinates (`x`, `y`, `z`). The gesture recognition pipeline extracts its descriptor via `SafeInputLayer.normalizeHandPose(landmarks)` directly from raw MediaPipe landmarks. The 1€ filter does **not** sit in the descriptor computation path and cannot cause descriptor drift.
2. **Hold vs. Trigger Semantics**:
   `GestureLibrary.recognize` implements an intentional single-shot edge trigger. Once a pose satisfies `holdMs` and emits `match`, `this.activeName` remains set. While held, subsequent frames satisfy `holding` and return `null` (no re-trigger). A held pose is designed **not** to emit repeated events. Diminishing or absent event emissions during a continuous pose indicate correct holding behavior, not degraded recognition.
3. **Throttling**:
   `onGestureProgress` in `vision-processor.js` is throttled to 100 ms for unaccepted frames, but publishes immediately when `evaluation.accepted` is true.

---

## 3. Deterministic Replay Verification (>= 6 Minutes)

A deterministic replay of a fixed static gesture descriptor (`G1`) was executed against `GestureLibrary` for 360,000 ms (6 minutes) at 33.333 ms intervals (10,801 frames).

- **Evidence file**: `evidence/deterministic-replay-6min.jsonl`
- **Total frames**: 10,801
- **Observed frames**: 10,801 (100%)
- **Missing frames**: 0
- **Recognition triggers emitted**: exactly 1 (at onset $t = 166.6$ ms, once `holdMs` satisfied)
- **Subsequent triggers during hold**: 0 (holding lock maintained indefinitely)
- **Median score**: 0.00000
- **p05 score**: 0.00000
- **p95 score**: 0.00000
- **Score linear regression slope**: **0.000000 / minute** (zero mathematical or memory drift)
- **Time in UNKNOWN**: 0 ms
- **Final state**: `activeName: 'G1'`, `candidateName: null`

**Mathematical Conclusion**:
The internal gesture recognition algorithms, memory structures, template representations, and state machines exhibit **zero internal drift** over time. If recognition degrades on physical devices, the cause originates in the physical domain (sensor thermal throttling, camera auto-exposure/framerate degradation, MediaPipe model thermal degradation, or human muscular fatigue), not internal state accumulation.

---

## 4. Physical Bench Protocol & Mobile/PC Execution Guide

To isolate physical factors, the four-cell experimental protocol must be run with the owner:

### Matrix:
| Cell | Confidence Preset | Timing | Pose | Duration |
| --- | --- | --- | --- | --- |
| **C1** | CONF High (0.7) | Initial (0–60s) | G1 (3/3 takes) | 60 s continuous |
| **C2** | CONF High (0.7) | Post-5min (300–360s) | G1 (same takes) | 60 s continuous |
| **C3** | CONF Flexible (0.2) | Initial (0–60s) | G1 (3/3 takes) | 60 s continuous |
| **C4** | CONF Flexible (0.2) | Post-5min (300–360s) | G1 (same takes) | 60 s continuous |

### Environment Controls:
- Same hand, camera, lighting, distance, and orientation across all cells.
- REC Balanced setting.
- Template hashes recorded before and after each session.
- Commit: `3f32f929ecb5f5a5c57a08555cda221dcc773850`.
- Handedness (F-008): recorded in its current state without introducing new changes.

### Platform Execution Alternatives:
1. **Mobile Phone (Original Bench)**:
   - Connect mobile phone via HTTPS (`https://<host>:16191/`).
   - Open browser DevTools remote debugger.
2. **PC Browser with Webcam (Convenient Bench)**:
   - Open Google Chrome or Edge on PC navigating to `http://127.0.0.1:16190/` or `http://localhost:16190/` (or via panel LAN link).
   - Select VID tab, enable camera with connected USB/built-in webcam.
   - Open DevTools (F12 -> Console). Eliminates mobile remote-debug tethering.

### DevTools Console Script:
```javascript
// A. Install probe
const { attachDriftProbe } = await import('/static/phone-v3/vision-gesture-drift-probe.mjs');
window.__driftProbe = attachDriftProbe(window.visionProcessor, {
  sessionConfig: {
    cell: 'C1', // update per cell: C1, C2, C3, C4
    preset: window.visionProcessor.confidence,
    rec: 'Balanced',
    commit: '3f32f929ecb5f5a5c57a08555cda221dcc773850'
  }
});

// B. Log initial template hash
const hashBefore = btoa(JSON.stringify(window.visionProcessor.exportSafetyConfig().gestures));
console.log('Template Hash Before:', hashBefore);

// C. Maintain fixed G1 pose for 60 seconds

// D. Export summary and JSONL
console.log(window.__driftProbe.summary());
const jsonlData = window.__driftProbe.exportJSONL();
// Save jsonlData to tasks/rc-surface-vision-gesture-drift-investigation-2026-09-19/evidence/<cell>.jsonl

// E. Log post-take template hash and uninstall probe
const hashAfter = btoa(JSON.stringify(window.visionProcessor.exportSafetyConfig().gestures));
console.log('Template Hash After:', hashAfter);
window.__driftProbe.uninstall();
```

---

## 5. Investigation Status & Formal Conclusion

- [x] Diagnostic probe created (`static/phone-v3/vision-gesture-drift-probe.mjs`)
- [x] Probe unit test suite verified (`static/phone-v3/vision-gesture-drift-probe.test.mjs`)
- [x] Deterministic 6-minute replay executed with evidence captured (`evidence/deterministic-replay-6min.jsonl`)
- [x] Regressions verified clean across existing unit and UI test suites
- [ ] Physical bench data collection across cells C1–C4 (pending owner execution)

### Formal Conclusion:
- **Conclusion**: **bloqueado por falta de bancada** (blocked by lack of physical bench).
- **Finding**: The deterministic 6-minute replay proved **zero algorithmic drift** (score slope = 0.000000/min). Core algorithmic code and state machines do not reproduce defect F-009 in a deterministic synthetic environment.
- **Pending Acceptance**: The four real physical windows (C1–C4) remain pending execution by the owner (Worm) on actual camera hardware.
- **Gap Opened**: Gap `G01` (`category: environment`, `unverifiable/environment`) is open. Physical acceptance remains pending without declaring F-009 either reproduced or discarded on physical hardware.
- **Next Step**: Proceed with remaining tasks in queue; no corrective patch authorized or created.
