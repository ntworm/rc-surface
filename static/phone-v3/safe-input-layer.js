// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared browser-side safety primitives for audio, motion and single-hand vision.

(function (global) {
  'use strict';

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

  class SafeSignal {
    constructor(options = {}) {
      this.neutral = clamp(options.neutral ?? 0);
      this.holdMs = Math.max(0, options.holdMs ?? 120);
      this.releaseMs = Math.max(1, options.releaseMs ?? 280);
      this.outlierDelta = Math.max(0, options.outlierDelta ?? 0.65);
      this.deadzone = Math.max(0, options.deadzone ?? 0.002);
      this.attack = clamp(options.attack ?? 0.65);
      this.release = clamp(options.release ?? 0.22);
      this.recovery = clamp(options.recovery ?? 0.18);
      this.value = this.neutral;
      this.lastRaw = null;
      this.lastTimestamp = 0;
      this.lostAt = null;
      this.lostFrom = this.neutral;
      this.state = 'idle';
      this.pendingOutlier = null;
    }

    ingest(rawValue, timestamp = Date.now(), confidence = 1) {
      const raw = clamp(Number.isFinite(rawValue) ? rawValue : this.neutral);
      if (!Number.isFinite(confidence) || confidence < 0.2) {
        this.state = 'unstable';
        return this.snapshot();
      }
      if (this.lostAt === null && this.lastRaw !== null && Math.abs(raw - this.lastRaw) > this.outlierDelta) {
        const confirmationTolerance = Math.max(this.deadzone * 2, this.outlierDelta * 0.15);
        if (this.pendingOutlier === null || Math.abs(raw - this.pendingOutlier) > confirmationTolerance) {
          this.pendingOutlier = raw;
          this.state = 'unstable';
          return this.snapshot();
        }
        this.pendingOutlier = null;
      } else {
        this.pendingOutlier = null;
      }
      const recovering = this.lostAt !== null;
      this.lostAt = null;
      if (this.lastRaw === null) {
        this.value = raw;
      } else if (Math.abs(raw - this.value) > this.deadzone) {
        const alpha = recovering ? this.recovery : raw > this.value ? this.attack : this.release;
        this.value += (raw - this.value) * alpha;
      }
      this.lastRaw = raw;
      this.lastTimestamp = timestamp;
      this.state = recovering && Math.abs(raw - this.value) > this.deadzone ? 'recovering' : 'active';
      return this.snapshot();
    }

    markLost(timestamp = Date.now()) {
      if (this.lostAt === null) {
        this.lostAt = timestamp;
        this.lostFrom = this.value;
      }
      this.state = 'lost';
      return this.snapshot();
    }

    tick(timestamp = Date.now()) {
      if (this.lostAt === null) return this.snapshot();
      const elapsed = Math.max(0, timestamp - this.lostAt);
      if (elapsed <= this.holdMs) {
        this.state = 'lost';
      } else {
        const progress = clamp((elapsed - this.holdMs) / this.releaseMs);
        this.value = this.lostFrom + (this.neutral - this.lostFrom) * progress;
        this.state = progress < 1 ? 'decaying' : 'idle';
      }
      return this.snapshot();
    }

    snapshot() {
      return { value: clamp(this.value), state: this.state, timestamp: this.lastTimestamp };
    }
  }


  // MCP landmarks (5, 9, 13, 17) form the palm base — averaging distances
  // from the wrist to each MCP is more rotation/scale-robust than the
  // previous (palmWidth + palmLength) / 2 heuristic.
  const MCP_LANDMARKS = [5, 9, 13, 17];

  // Per-landmark weight for the descriptor distance. The wrist is excluded
  // from the comparison (always zero after translation), MCPs anchor the
  // shape, PIPs describe intermediate flexion, and fingertips are the
  // noisiest landmarks so they carry the least weight.
  // 21 landmarks × 2 coords = 42; index 0..1 is wrist (excluded).
  const LANDMARK_WEIGHTS = (() => {
    const weights = new Array(42);
    for (let landmark = 0; landmark < 21; landmark += 1) {
      const isWrist = landmark === 0;
      const isMcp = MCP_LANDMARKS.includes(landmark);
      const isTip = [4, 8, 12, 16, 20].includes(landmark);
      // Treat everything not wrist/mcp/tip as PIP/DIP/intermediate.
      const w = isWrist ? 0 : isMcp ? 1.0 : isTip ? 0.4 : 0.7;
      weights[landmark * 2] = w;
      weights[landmark * 2 + 1] = w;
    }
    return weights;
  })();
  // The positional block: 21 landmarks x 2 coordinates.
  const POSE_DIMS = 42;

  // The articulation block, appended after it. Every entry is a ratio taken
  // inside the hand, so it survives the two things a positional descriptor
  // does not: the lens, and the angle the hand happens to be held at.
  //
  //   0-3  spread between adjacent fingers, as an angle
  //   4    thumb opposition, thumb tip to pinky knuckle over palm size
  //
  // Per-finger extension was tried here and removed after measuring. The
  // positional block already encodes it — a fingertip's coordinate relative
  // to the wrist IS its extension — so adding it again only double-counts
  // the noisiest signal in the hand. On the rock it cost real tolerance: a
  // deliberately looser curl went from 62% of the accepted radius to 159%,
  // i.e. from comfortably accepted to rejected.
  //
  // Spread and opposition survive because they are the part a positional
  // descriptor represents badly: how splayed the hand is, and how far the
  // thumb has travelled across the palm.
  const ARTIC_DIMS = 5;
  const FULL_DIMS = POSE_DIMS + ARTIC_DIMS;

  // One knuckle's worth of prior each. That puts the articulation block at
  // roughly a quarter of the total weight before the per-gesture spread
  // reallocates it — present, not dominant.
  const ARTIC_WEIGHT = 1.0;

  const LANDMARK_WEIGHT_SUM = LANDMARK_WEIGHTS.reduce((s, w) => s + w, 0);

  const weightAt = (index) => (index < POSE_DIMS ? LANDMARK_WEIGHTS[index] : ARTIC_WEIGHT);
  const weightSumFor = (length) => LANDMARK_WEIGHT_SUM
    + (length > POSE_DIMS ? ARTIC_DIMS * ARTIC_WEIGHT : 0);

  // How far a single dimension's weight may move from the gesture's median
  // spread. The ratio between them caps the discount at (CEILING/FLOOR)^2.
  const SPREAD_FLOOR = 0.70;
  const SPREAD_CEILING = 1.45;

  function normalizeHandPose(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length !== 21
      || landmarks.some((point) => !Number.isFinite(point?.x)
        || !Number.isFinite(point?.y))) return [];
    const wrist = landmarks[0];
    // Robust scale: mean of wrist→MCP distances across the four fingers.
    // Less sensitive to perspective than (palmWidth + palmLength) / 2.
    let scaleSum = 0;
    for (const mcp of MCP_LANDMARKS) {
      scaleSum += Math.hypot(landmarks[mcp].x - wrist.x, landmarks[mcp].y - wrist.y);
    }
    const scale = scaleSum / MCP_LANDMARKS.length;
    if (scale < 1e-6) return [];
    const descriptor = new Array(42);
    for (let i = 0; i < 21; i += 1) {
      descriptor[i * 2] = (landmarks[i].x - wrist.x) / scale;
      descriptor[i * 2 + 1] = (landmarks[i].y - wrist.y) / scale;
    }
    // Canonical rotation: align the wrist→middle-MCP vector with +X axis.
    // This makes the descriptor invariant to planar hand rotation by
    // construction, replacing the previous 7-discrete-angle brute search.
    const mcpIndex = 9 * 2;
    const angle = Math.atan2(descriptor[mcpIndex + 1], descriptor[mcpIndex]);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    for (let i = 0; i < 21; i += 1) {
      const x = descriptor[i * 2];
      const y = descriptor[i * 2 + 1];
      descriptor[i * 2] = x * c - y * s;
      descriptor[i * 2 + 1] = x * s + y * c;
    }
    descriptor.push(...articulation(landmarks, scale));
    return descriptor;
  }

  // Five numbers describing how the hand is ARTICULATED, as opposed to where
  // its points happen to be. Each is a ratio or an angle taken inside the
  // hand, so none of them move when the performer stands closer, uses a
  // different phone, or tilts the hand toward the lens — the three things
  // that make a positional match demand the pose be reproduced exactly.
  function articulation(landmarks, scale) {
    const d = (a, b) => Math.hypot(landmarks[a].x - landmarks[b].x,
      landmarks[a].y - landmarks[b].y);

    // Spread between neighbours, as the angle between the two finger
    // directions. A splayed hand and a closed one differ here even when every
    // fingertip is the same distance from its knuckle.
    const direction = (mcp, tip) => Math.atan2(
      landmarks[tip].y - landmarks[mcp].y, landmarks[tip].x - landmarks[mcp].x);
    const axes = [direction(2, 4), direction(5, 8), direction(9, 12),
      direction(13, 16), direction(17, 20)];
    const between = (a, b) => {
      let diff = Math.abs(axes[a] - axes[b]) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      return diff / Math.PI;
    };
    const spread = [between(0, 1), between(1, 2), between(2, 3), between(3, 4)];

    // Opposition: how far the thumb has travelled across the palm. This is
    // what separates a thumb tucked in from a thumb held out, and it is the
    // one the rock depends on.
    const opposition = d(4, 17) / scale;

    return [...spread, opposition]
      .map((value) => (Number.isFinite(value) ? value : 0));
  }

  function directPoseDistance(a, b) {
    if (!validDescriptor(a) || !validDescriptor(b)) return Infinity;
    let weightedSquared = 0;
    for (let index = 0; index < a.length; index += 1) {
      const w = weightAt(index);
      if (w === 0) continue;
      const diff = a[index] - b[index];
      weightedSquared += w * diff * diff;
    }
    return Math.sqrt(weightedSquared / weightSumFor(a.length));
  }

  // poseDistance is now identical to directPoseDistance because the
  // descriptor is already canonically aligned during normalization.
  // Kept as a named function for backward compatibility with callers
  // that import the symbol.
  function poseDistance(a, b) {
    return directPoseDistance(a, b);
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function medianDescriptor(frames) {
    const dims = frames[0]?.length || POSE_DIMS;
    return Array.from({ length: dims }, (_, index) => median(frames.map((frame) => frame[index])));
  }

  // Per-dimension median absolute deviation. It is calculated separately
  // inside each take and between the take prototypes; pooling raw frames here
  // would let a high-FPS take outweigh the other examples.
  //
  // This is what makes the match tolerant. The fixed landmark weights below
  // say "a fingertip is noisier than a knuckle", which is true on average but
  // says nothing about THIS pose: in the rock the folded middle and ring move
  // a lot between takes while the extended fingers barely move, and a static
  // weight punishes that variation as if it were a different gesture.
  // Dividing each dimension by its own observed spread hands the weight to
  // whatever the performer holds steady, per gesture, with no threshold to
  // loosen by hand.
  function descriptorSpread(frames) {
    if (!Array.isArray(frames) || frames.length < 2) return null;
    const dims = frames[0]?.length || POSE_DIMS;
    const spread = new Array(dims);
    for (let index = 0; index < dims; index += 1) {
      const column = frames.map((frame) => frame[index]);
      const centre = median(column);
      spread[index] = median(column.map((value) => Math.abs(value - centre)));
    }
    return spread;
  }

  function validSpread(spread) {
    return Array.isArray(spread)
      && (spread.length === POSE_DIMS || spread.length === FULL_DIMS)
      && spread.every(Number.isFinite);
  }

  function combinedTakeSpread(samples, takeSpreads) {
    const betweenTakes = descriptorSpread(samples);
    const withinTakes = (takeSpreads || []).filter(validSpread);
    if (!betweenTakes && !withinTakes.length) return null;
    const dims = betweenTakes?.length || withinTakes[0]?.length || POSE_DIMS;
    return Array.from({ length: dims }, (_, index) => {
      const within = withinTakes.length
        ? median(withinTakes.map((spread) => spread[index]))
        : 0;
      const between = betweenTakes?.[index] || 0;
      return Math.hypot(within, between);
    });
  }

  // Turns a spread into per-dimension weights, renormalised so the total
  // weight is unchanged. Only the ALLOCATION of weight moves; the magnitude
  // of the resulting distance stays comparable to the unweighted form, so a
  // threshold tuned before this change still means roughly the same thing.
  function weightsFromSpread(spread) {
    if (!validSpread(spread)) return null;
    const active = spread.filter((value, index) => LANDMARK_WEIGHTS[index] > 0 && value > 0);
    if (active.length < 8) return null;
    // Bound the discount in BOTH directions, around the gesture's own median
    // spread. A floor stops a frozen coordinate taking all the weight. A
    // ceiling is the one that matters: without it, the dimensions that vary
    // most lose all their weight — and in the rock those are the folded
    // middle and ring, which are exactly what separates it from an open hand.
    // Weighting them away buys tolerance by destroying discrimination.
    const centre = Math.max(median(active), 1e-4);
    const floor = centre * SPREAD_FLOOR;
    const ceiling = centre * SPREAD_CEILING;
    const dims = spread.length;
    const raw = new Array(dims);
    let sum = 0;
    for (let index = 0; index < dims; index += 1) {
      const base = weightAt(index);
      if (base === 0) { raw[index] = 0; continue; }
      const width = Math.min(ceiling, Math.max(spread[index], floor));
      raw[index] = base / (width * width);
      sum += raw[index];
    }
    if (!(sum > 0)) return null;
    const scale = weightSumFor(dims) / sum;
    for (let index = 0; index < dims; index += 1) raw[index] *= scale;
    return raw;
  }

  function weightedPoseDistance(a, b, weights) {
    if (!validDescriptor(a) || !validDescriptor(b)) return Infinity;
    if (!weights) return directPoseDistance(a, b);
    // One side may be an older 42-long sample. Compare only what both
    // carry, so a save from before the articulation block still matches.
    const dims = Math.min(a.length, b.length, weights.length);
    let weightedSquared = 0;
    for (let index = 0; index < dims; index += 1) {
      const w = weights[index];
      if (w === 0) continue;
      const diff = a[index] - b[index];
      weightedSquared += w * diff * diff;
    }
    return Math.sqrt(weightedSquared / weightSumFor(dims));
  }

  function validDescriptor(descriptor) {
    // A save written before the articulation block existed is 42 long and
    // stays valid: it simply matches on shape alone. Nothing has to be
    // relearned for this change.
    return Array.isArray(descriptor)
      && (descriptor.length === POSE_DIMS || descriptor.length === FULL_DIMS)
      && descriptor.every(Number.isFinite);
  }

  class GestureLibrary {
    constructor(options = {}) {
      this.threshold = Math.max(0.01, options.threshold ?? 0.18);
      this.minimumConfidence = clamp(options.minimumConfidence ?? 0.45);
      this.captureStabilityThreshold = Math.max(0.01, options.captureStabilityThreshold ?? 0.08);
      this.holdMs = Math.max(0, options.holdMs ?? 160);
      this.releaseMs = Math.max(0, options.releaseMs ?? 180);
      this.releaseRatio = Math.max(1, options.releaseRatio ?? 1.4);
      // MediaPipe occasionally omits one or two frames even though the hand
      // never left the pose. Treat that as UNKNOWN briefly instead of as a
      // contradictory pose, so a performance hold is not restarted by a
      // momentary camera/detector dropout.
      this.unknownGraceMs = Math.max(0, options.unknownGraceMs ?? 140);
      // Ambiguity as a ratio rather than a fixed gap. An absolute margin is
      // slack when the distances are large and brutal when they are small;
      // "the runner-up must be at least 1.25x further" holds at any scale.
      this.ambiguityRatio = Math.max(1, options.ambiguityRatio ?? 1.25);
      this.templates = new Map();
      // Per-gesture, derived from its own takes: how the performer's hand
      // varies (spread) and how wide the accepted radius should therefore be.
      this.spreads = new Map();
      // Multiplier over the currently selected preset threshold. Storing the
      // factor instead of an absolute radius lets Precision/Balanced/Flexible
      // affect gestures that were already learned.
      this.thresholdFactors = new Map();
      // One within-take spread per prototype. Keeping the same index as
      // templates makes REMOVE LAST exact and gives every take equal weight.
      this.takeSpreads = new Map();
      this.incompatibleNames = [];
      this.resetRecognition();
    }

    weightsFor(name) {
      return weightsFromSpread(this.spreads.get(name)) || null;
    }

    thresholdFor(name) {
      const factor = this.thresholdFactors.get(name);
      return this.threshold * (Number.isFinite(factor) ? factor : 1);
    }

    rebuildSpread(name, legacySpread = null) {
      const samples = this.templates.get(name) || [];
      const takeSpreads = this.takeSpreads.get(name) || [];
      const hasTakeStatistics = takeSpreads.some(validSpread);
      const spread = hasTakeStatistics
        ? combinedTakeSpread(samples, takeSpreads)
        : validSpread(legacySpread)
          ? legacySpread.slice()
          : combinedTakeSpread(samples, []);
      if (validSpread(spread)) this.spreads.set(name, spread);
      else this.spreads.delete(name);
    }

    // The accepted radius comes from how far this gesture's own takes sit
    // from each other. A pose the performer repeats tightly earns a tight
    // radius; one that varies naturally earns a wider one, without anyone
    // loosening a global threshold and making every other gesture sloppy.
    recalibrate(name) {
      const samples = this.templates.get(name) || [];
      const weights = this.weightsFor(name);
      if (samples.length < 2) {
        this.thresholdFactors.delete(name);
        return;
      }
      let worst = 0;
      for (let i = 0; i < samples.length; i += 1) {
        for (let j = i + 1; j < samples.length; j += 1) {
          worst = Math.max(worst, weightedPoseDistance(samples[i], samples[j], weights));
        }
      }
      // The calibrated radius only ever WIDENS. Three takes captured in the
      // same spot look almost identical, which would compute a radius tighter
      // than the default and make recognition stricter than before — the
      // opposite of the point. The base threshold is the floor; the takes can
      // only earn extra room, never take it away.
      const factor = Math.min(2.5, Math.max(1, (worst * 1.6) / this.threshold));
      this.thresholdFactors.set(name, factor);
    }

    resetRecognition() {
      this.candidateName = null;
      this.candidateSince = null;
      this.activeName = null;
      this.releaseSince = null;
      this.unknownSince = null;
    }

    isStableCapture(frames) {
      if (!Array.isArray(frames) || frames.length < 5 || !frames.every(validDescriptor)) return false;
      const descriptor = medianDescriptor(frames);
      const worstDistance = Math.max(...frames.map((frame) => poseDistance(frame, descriptor)));
      return worstDistance <= this.captureStabilityThreshold;
    }

    learn(name, frames) {
      if (!name || !Array.isArray(frames) || frames.length < 5 || !frames.every(validDescriptor)) {
        throw new Error('Hold the pose still until capture completes');
      }
      const descriptor = medianDescriptor(frames);
      if (!this.isStableCapture(frames)) {
        throw new Error('Hold the pose still until capture completes');
      }
      const samples = this.templates.get(name) || [];
      if (samples.length >= 3) return samples.length;
      samples.push(descriptor);
      this.templates.set(name, samples.slice(0, 3));

      // Each take contributes one prototype and one within-take MAD. The
      // aggregate combines camera jitter inside a take with natural variation
      // between take prototypes, without depending on how many frames the
      // device happened to deliver during those 900 ms.
      const takeSpreads = (this.takeSpreads.get(name) || []).slice(0, samples.length - 1);
      takeSpreads.push(descriptorSpread(frames));
      this.takeSpreads.set(name, takeSpreads);
      this.rebuildSpread(name);
      this.recalibrate(name);

      return this.sampleCount(name);
    }

    sampleCount(name) {
      return this.templates.get(name)?.length || 0;
    }

    kind(name) {
      return this.sampleCount(name) ? 'pose' : null;
    }

    removeLast(name) {
      const samples = (this.templates.get(name) || []).slice();
      samples.pop();
      const takeSpreads = (this.takeSpreads.get(name) || []).slice();
      takeSpreads.pop();
      if (samples.length) {
        this.templates.set(name, samples);
        this.takeSpreads.set(name, takeSpreads);
        this.rebuildSpread(name);
        this.recalibrate(name);
      } else {
        this.templates.delete(name);
        this.takeSpreads.delete(name);
        this.spreads.delete(name);
        this.thresholdFactors.delete(name);
      }
      this.resetRecognition();
      return samples.length;
    }

    delete(name) {
      this.resetRecognition();
      const removed = this.templates.delete(name);
      this.takeSpreads.delete(name);
      this.spreads.delete(name);
      this.thresholdFactors.delete(name);
      return removed;
    }

    getIncompatibleNames() {
      return this.incompatibleNames.slice();
    }

    evaluate(descriptor, targetName = null) {
      if (!validDescriptor(descriptor)) return null;
      const scores = [];
      for (const [name, samples] of this.templates) {
        if (samples.length !== 3) continue;
        const weights = this.weightsFor(name);
        // Each gesture is scored in its own weighting, so the comparison is
        // normalised by dividing through that gesture's own radius. Without
        // this a gesture with a wide radius would always look closest.
        const raw = median(samples.map((sample) => weightedPoseDistance(descriptor, sample, weights)));
        scores.push({ name, score: raw, relative: raw / Math.max(0.0001, this.thresholdFor(name)) });
      }
      scores.sort((a, b) => a.relative - b.relative);
      const best = scores[0];
      if (!best) return null;
      const ambiguous = Boolean(scores[1]
        && scores[1].relative <= best.relative * this.ambiguityRatio);
      const limit = this.thresholdFor(best.name);
      const confidence = clamp(1 - best.score / Math.max(0.0001, limit * 1.5));
      const accepted = best.score <= limit && confidence >= this.minimumConfidence && !ambiguous;
      const candidates = scores.map(({ name, score }) => ({
        name,
        score,
        confidence: clamp(1 - score / Math.max(0.0001, this.thresholdFor(name) * 1.5)),
      }));
      return {
        name: best.name,
        score: best.score,
        confidence,
        accepted,
        ambiguous,
        candidates,
        target: targetName ? candidates.find((candidate) => candidate.name === targetName) || null : null,
      };
    }

    recognize(descriptor, timestamp = Date.now(), targetName = null) {
      if (!validDescriptor(descriptor)) {
        if (this.unknownSince === null) this.unknownSince = timestamp;
        if (timestamp - this.unknownSince <= this.unknownGraceMs) return null;

        this.candidateName = null;
        this.candidateSince = null;
        if (this.activeName) {
          const effectiveReleaseSince = this.unknownSince + this.unknownGraceMs;
          if (timestamp - effectiveReleaseSince >= this.releaseMs) {
            this.activeName = null;
            this.releaseSince = null;
          } else {
            this.releaseSince = effectiveReleaseSince;
          }
        }
        return null;
      }

      if (this.unknownSince !== null) {
        const unknownSince = this.unknownSince;
        this.unknownSince = null;
        if (timestamp - unknownSince > this.unknownGraceMs) {
          this.candidateName = null;
          this.candidateSince = null;
          if (this.activeName) {
            const effectiveReleaseSince = unknownSince + this.unknownGraceMs;
            if (timestamp - effectiveReleaseSince >= this.releaseMs) {
              this.activeName = null;
              this.releaseSince = null;
            } else {
              this.releaseSince = effectiveReleaseSince;
            }
          }
        }
      }

      const evaluation = this.evaluate(descriptor, targetName);
      const holding = Boolean(this.activeName && evaluation && evaluation.name === this.activeName
        && evaluation.score <= this.thresholdFor(this.activeName) * this.releaseRatio);
      if (!evaluation?.accepted && !holding) {
        this.candidateName = null;
        this.candidateSince = null;
        if (this.activeName) {
          if (this.releaseSince === null) this.releaseSince = timestamp;
          else if (timestamp - this.releaseSince >= this.releaseMs) {
            this.activeName = null;
            this.releaseSince = null;
          }
        }
        return null;
      }

      this.releaseSince = null;
      if (this.activeName) return null;
      if (this.candidateName !== evaluation.name) {
        this.candidateName = evaluation.name;
        this.candidateSince = timestamp;
        if (this.holdMs > 0) return null;
      }
      if (timestamp - this.candidateSince < this.holdMs) return null;
      this.activeName = evaluation.name;
      this.candidateName = null;
      this.candidateSince = null;
      return { name: evaluation.name, confidence: evaluation.confidence, score: evaluation.score };
    }

    toJSON() {
      return {
        version: 8,
        // spread stays optional: a save written before it existed still loads
        // and simply falls back to the fixed landmark weights, so nothing has
        // to be relearned.
        templates: Array.from(this.templates, ([name, samples]) => {
          const template = { name, kind: 'pose', samples };
          const spread = this.spreads.get(name);
          if (validSpread(spread)) template.spread = spread;
          const takeSpreads = (this.takeSpreads.get(name) || [])
            .slice(0, samples.length)
            .map((takeSpread) => validSpread(takeSpread) ? takeSpread : null);
          if (takeSpreads.some(Boolean)) template.takeSpreads = takeSpreads;
          return template;
        }),
      };
    }

    static fromJSON(data, options = {}) {
      const library = new GestureLibrary(options);
      if (Number(data?.version) !== 8) {
        library.incompatibleNames = (data?.templates || [])
          .map((template) => template?.name)
          .filter((name) => typeof name === 'string');
        return library;
      }
      for (const template of data?.templates || []) {
        if (typeof template?.name !== 'string' || !Array.isArray(template.samples)) continue;
        const samples = template.samples.slice(0, 3).filter(validDescriptor);
        if (!samples.length) continue;
        library.templates.set(template.name, samples);
        const takeSpreads = samples.map((_, index) => (
          validSpread(template.takeSpreads?.[index]) ? template.takeSpreads[index].slice() : null
        ));
        library.takeSpreads.set(template.name, takeSpreads);
        library.rebuildSpread(template.name, template.spread);
        library.recalibrate(template.name);
      }
      return library;
    }
  }

  global.SafeInputLayer = {
    SafeSignal,
    GestureLibrary,
    normalizeHandPose,
    poseDistance,
  };
})(typeof window !== 'undefined' ? window : globalThis);
