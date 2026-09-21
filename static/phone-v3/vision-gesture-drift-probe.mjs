// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// vision-gesture-drift-probe.mjs
// Diagnostic probe for vision gesture recognition drift investigation (F-009).
// Pure observational wrapper without runtime modifications, video recording, or network transmission.

function computePercentile(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computeLinearRegressionSlope(points) {
  // points: [{ x, y }] where x is minutes elapsed, y is score
  if (points.length < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt.x;
    sumY += pt.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const pt of points) {
    const dx = pt.x - meanX;
    numerator += dx * (pt.y - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function computeSummaryStats(records, targetName = null) {
  const totalFrames = records.length;
  let observedFrames = 0;
  let missingFrames = 0;
  let acceptedFrames = 0;
  let eventsCount = 0;
  const scores = [];
  const regressionPoints = [];
  let timeInUnknownMs = 0;
  let lastTimestamp = null;

  for (const r of records) {
    if (r.type === 'observed' && r.sawHand) {
      observedFrames++;
      const score = typeof r.targetScore === 'number' ? r.targetScore
        : (r.evaluation?.score ?? null);
      if (typeof score === 'number' && Number.isFinite(score)) {
        scores.push(score);
        const elapsedMinutes = (r.elapsedMs || 0) / 60000;
        regressionPoints.push({ x: elapsedMinutes, y: score });
      }
      if (r.targetAccepted || (r.evaluation && r.evaluation.accepted)) {
        acceptedFrames++;
      }
    } else {
      missingFrames++;
      if (lastTimestamp !== null) {
        timeInUnknownMs += Math.max(0, r.timestamp - lastTimestamp);
      }
    }
    if (r.match) {
      eventsCount++;
    }
    lastTimestamp = r.timestamp;
  }

  scores.sort((a, b) => a - b);
  const medianScore = computePercentile(scores, 0.50);
  const p05Score = computePercentile(scores, 0.05);
  const p95Score = computePercentile(scores, 0.95);
  const scoreSlopePerMinute = computeLinearRegressionSlope(regressionPoints);
  const acceptanceRate = observedFrames > 0 ? acceptedFrames / observedFrames : 0;

  return {
    totalFrames,
    observedFrames,
    missingFrames,
    acceptedFrames,
    eventsCount,
    acceptanceRate,
    medianScore: Number(medianScore.toFixed(5)),
    p05Score: Number(p05Score.toFixed(5)),
    p95Score: Number(p95Score.toFixed(5)),
    scoreSlopePerMinute: Number(scoreSlopePerMinute.toFixed(6)),
    timeInUnknownMs,
  };
}

export function attachDriftProbe(processor, options = {}) {
  const maxFrames = options.maxFrames ?? 20000;
  const sessionConfig = options.sessionConfig ?? {};
  const targetGesture = options.targetGesture ?? processor.gestureTestName ?? null;

  const records = [];
  let startTimestamp = null;
  let lastTimestamp = null;
  let frameCounter = 0;

  // Stored references for uninstall
  const origProcessHandData = processor.processHandData;
  const origProcessMissing = processor.processMissing;
  const origProcessResults = processor.processResults;
  const origRecognizeGesture = processor.recognizeGesture;
  const origOnGesture = processor.onGesture;

  const safe = options.safeInputLayer
    || (typeof window !== 'undefined' ? window.SafeInputLayer : null)
    || (typeof globalThis !== 'undefined' ? globalThis.SafeInputLayer : null);

  let lastRecognizeMatch = null;

  function pushRecord(record) {
    if (records.length >= maxFrames) {
      records.shift();
    }
    records.push(record);
  }

  // Wrap recognizeGesture to capture the match without duplicate execution
  processor.recognizeGesture = function (descriptor, timestamp, targetName) {
    const match = origRecognizeGesture.apply(this, arguments);
    lastRecognizeMatch = match;
    return match;
  };

  // Wrap processHandData
  processor.processHandData = function (rawData, timestamp = Date.now(), landmarks = null) {
    lastRecognizeMatch = null;
    const effectiveTimestamp = Number(timestamp) || Date.now();
    if (startTimestamp === null) startTimestamp = effectiveTimestamp;
    const elapsedMs = effectiveTimestamp - startTimestamp;
    const frameDeltaMs = lastTimestamp !== null ? effectiveTimestamp - lastTimestamp : 0;
    lastTimestamp = effectiveTimestamp;

    const activeSafe = safe || (typeof globalThis !== 'undefined' ? globalThis.SafeInputLayer : null);
    const descriptor = activeSafe?.normalizeHandPose?.(landmarks) || [];

    // Read-only evaluate for diagnostics; does not advance hold/release timers
    const effectiveTarget = targetGesture || processor.gestureTestName;
    const evaluation = (descriptor.length && processor.gestures)
      ? processor.gestures.evaluate(descriptor, effectiveTarget)
      : null;

    let targetScore = null;
    let targetConfidence = null;
    let targetAccepted = false;
    if (evaluation) {
      if (effectiveTarget && evaluation.target) {
        targetScore = evaluation.target.score;
        targetConfidence = evaluation.target.confidence;
        targetAccepted = Boolean(evaluation.accepted && evaluation.name === effectiveTarget);
      } else {
        targetScore = evaluation.score;
        targetConfidence = evaluation.confidence;
        targetAccepted = Boolean(evaluation.accepted);
      }
    }

    let ret;
    try {
      ret = origProcessHandData.apply(this, arguments);
    } catch (err) {
      throw err;
    }

    const rec = {
      frameIndex: frameCounter++,
      timestamp: effectiveTimestamp,
      elapsedMs,
      frameDeltaMs,
      type: 'observed',
      sawHand: true,
      preset: processor.confidence,
      detectionConfidence: rawData?.confidence ?? 1,
      landmarks: Array.isArray(landmarks) ? landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
      descriptor: descriptor.length ? descriptor.slice() : null,
      evaluation: evaluation ? {
        name: evaluation.name,
        score: evaluation.score,
        confidence: evaluation.confidence,
        accepted: evaluation.accepted,
        ambiguous: evaluation.ambiguous,
        candidates: evaluation.candidates,
        target: evaluation.target,
      } : null,
      targetScore,
      targetConfidence,
      targetAccepted,
      match: lastRecognizeMatch ? {
        name: lastRecognizeMatch.name,
        score: lastRecognizeMatch.score,
        confidence: lastRecognizeMatch.confidence,
      } : null,
      activeName: processor.gestures?.activeName ?? null,
      candidateName: processor.gestures?.candidateName ?? null,
      unknownSince: processor.gestures?.unknownSince ?? null,
      releaseSince: processor.gestures?.releaseSince ?? null,
      candidateSince: processor.gestures?.candidateSince ?? null,
      holdMs: processor.gestures?.holdMs ?? 200,
      releaseMs: processor.gestures?.releaseMs ?? 300,
      sessionConfig: { ...sessionConfig },
    };

    pushRecord(rec);
    return ret;
  };

  // Wrap processMissing
  processor.processMissing = function (timestamp = Date.now()) {
    lastRecognizeMatch = null;
    const effectiveTimestamp = Number(timestamp) || Date.now();
    if (startTimestamp === null) startTimestamp = effectiveTimestamp;
    const elapsedMs = effectiveTimestamp - startTimestamp;
    const frameDeltaMs = lastTimestamp !== null ? effectiveTimestamp - lastTimestamp : 0;
    lastTimestamp = effectiveTimestamp;

    let ret;
    try {
      ret = origProcessMissing.apply(this, arguments);
    } catch (err) {
      throw err;
    }

    const rec = {
      frameIndex: frameCounter++,
      timestamp: effectiveTimestamp,
      elapsedMs,
      frameDeltaMs,
      type: 'missing',
      sawHand: false,
      preset: processor.confidence,
      detectionConfidence: 0,
      landmarks: null,
      descriptor: null,
      evaluation: null,
      targetScore: null,
      targetConfidence: null,
      targetAccepted: false,
      match: null,
      activeName: processor.gestures?.activeName ?? null,
      candidateName: processor.gestures?.candidateName ?? null,
      unknownSince: processor.gestures?.unknownSince ?? null,
      releaseSince: processor.gestures?.releaseSince ?? null,
      candidateSince: processor.gestures?.candidateSince ?? null,
      holdMs: processor.gestures?.holdMs ?? 200,
      releaseMs: processor.gestures?.releaseMs ?? 300,
      sessionConfig: { ...sessionConfig },
    };

    pushRecord(rec);
    return ret;
  };

  function exportJSONL() {
    return records.map((r) => JSON.stringify(r)).join('\n');
  }

  function exportCSV() {
    const headers = [
      'frameIndex',
      'timestamp',
      'elapsedMs',
      'type',
      'sawHand',
      'preset',
      'score',
      'confidence',
      'accepted',
      'activeName',
      'event',
    ];
    const lines = [headers.join(',')];
    for (const r of records) {
      const row = [
        r.frameIndex,
        r.timestamp,
        r.elapsedMs,
        r.type,
        r.sawHand,
        r.preset,
        r.targetScore !== null ? r.targetScore.toFixed(4) : '',
        r.targetConfidence !== null ? r.targetConfidence.toFixed(4) : '',
        Boolean(r.targetAccepted),
        r.activeName || '',
        r.match ? r.match.name : '',
      ];
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  function uninstall() {
    processor.processHandData = origProcessHandData;
    processor.processMissing = origProcessMissing;
    processor.processResults = origProcessResults;
    processor.recognizeGesture = origRecognizeGesture;
    processor.onGesture = origOnGesture;
  }

  return {
    records,
    summary: () => computeSummaryStats(records, targetGesture),
    exportJSONL,
    exportCSV,
    uninstall,
    reset: () => {
      records.length = 0;
      frameCounter = 0;
      startTimestamp = null;
      lastTimestamp = null;
    },
  };
}

export function runDeterministicReplay(options = {}) {
  const library = options.library;
  if (!library) throw new Error('GestureLibrary instance required');
  const descriptor = options.descriptor;
  const durationMs = options.durationMs ?? 360000;
  const intervalMs = options.intervalMs ?? 33.333;
  const targetName = options.targetName ?? null;
  const mutation = options.mutations ?? null;

  const records = [];
  let t = 0;
  let frameIndex = 0;
  let lastTimestamp = 0;

  while (t <= durationMs) {
    const currentDescriptor = mutation ? mutation(frameIndex, t) : descriptor;
    const isMissing = currentDescriptor === null;

    let evaluation = null;
    let match = null;

    if (!isMissing) {
      evaluation = library.evaluate(currentDescriptor, targetName);
      match = library.recognize(currentDescriptor, t, targetName);
    } else {
      library.recognize(null, t, targetName);
    }

    const rec = {
      frameIndex: frameIndex++,
      timestamp: t,
      elapsedMs: t,
      frameDeltaMs: t - lastTimestamp,
      type: isMissing ? 'missing' : 'observed',
      sawHand: !isMissing,
      preset: 0.5,
      detectionConfidence: isMissing ? 0 : 1,
      landmarks: null,
      descriptor: currentDescriptor,
      evaluation: evaluation ? {
        name: evaluation.name,
        score: evaluation.score,
        confidence: evaluation.confidence,
        accepted: evaluation.accepted,
        ambiguous: evaluation.ambiguous,
      } : null,
      targetScore: evaluation?.score ?? null,
      targetConfidence: evaluation?.confidence ?? null,
      targetAccepted: Boolean(evaluation?.accepted),
      match: match ? { name: match.name, score: match.score, confidence: match.confidence } : null,
      activeName: library.activeName,
      candidateName: library.candidateName,
      unknownSince: library.unknownSince,
      releaseSince: library.releaseSince,
      candidateSince: library.candidateSince,
      holdMs: library.holdMs,
      releaseMs: library.releaseMs,
    };

    records.push(rec);
    lastTimestamp = t;
    t += intervalMs;
  }

  const summary = computeSummaryStats(records, targetName);

  return {
    frames: records,
    summary,
    finalActiveName: library.activeName,
  };
}
