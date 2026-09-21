// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
// vision-processor.js
// Handles dynamic script loading, webcam access, and MediaPipe Hands tracking.

(function (global) {
  'use strict';

  // 3D Euclidean distance between two MediaPipe landmarks. Used to derive
  // finger length ratios that stay stable as the hand moves closer/farther
  // from the camera.
  function dist3D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  const nowMs = () => global.performance?.now?.() ?? Date.now();

  // Resolve bundled MediaPipe assets against the page that loaded the phone
  // UI. The phone is normally served from /static/phone-v3/, but embedded
  // WebViews and redirected URLs can have a different base path. Relative
  // script URLs then fail with a misleading "Failed to load script" error.
  function resolveAssetUrl(relativeUrl) {
    try {
      const base = global.document?.baseURI || global.location?.href;
      if (base) return new URL(relativeUrl, base).href;
    } catch {
      // Keep the relative fallback for the unit-test harness and old WebViews
      // that do not expose URL/document.baseURI.
    }
    return relativeUrl;
  }

  /**
   * 1€ filter — Casiez, Roussel & Vogel, CHI 2012.
   *
   * A low-pass filter whose cutoff rises with the signal's speed. While the
   * hand is still the cutoff is low, so sensor jitter is damped hard; as the
   * hand accelerates the cutoff opens up, so the output keeps up instead of
   * smearing. A fixed smoother can only trade one for the other.
   *
   * @param minCutoff Hz. Lower = steadier when still. Raise if it feels soft.
   * @param beta      How fast the cutoff opens with speed. Higher = less lag
   *                  on quick moves, at the cost of a little jitter.
   */
  class OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 1.5, dCutoff = 1.0 } = {}) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.reset();
    }

    reset() {
      this.lastValue = null;
      this.lastFiltered = null;
      this.lastDerivative = 0;
      this.lastTimeMs = null;
    }

    static alpha(cutoffHz, dtSeconds) {
      const tau = 1 / (2 * Math.PI * cutoffHz);
      return 1 / (1 + tau / dtSeconds);
    }

    filter(value, timeMs) {
      if (!Number.isFinite(value)) return this.lastFiltered ?? 0;
      if (this.lastTimeMs === null || this.lastFiltered === null) {
        this.lastTimeMs = timeMs;
        this.lastValue = value;
        this.lastFiltered = value;
        this.lastDerivative = 0;
        return value;
      }
      // Guard against duplicate timestamps: a zero dt would divide by zero.
      const dt = Math.max(1e-3, (timeMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = timeMs;

      const derivative = (value - this.lastValue) / dt;
      const aD = OneEuroFilter.alpha(this.dCutoff, dt);
      this.lastDerivative = this.lastDerivative + aD * (derivative - this.lastDerivative);

      const cutoff = this.minCutoff + this.beta * Math.abs(this.lastDerivative);
      const a = OneEuroFilter.alpha(cutoff, dt);
      this.lastFiltered = this.lastFiltered + a * (value - this.lastFiltered);
      this.lastValue = value;
      return this.lastFiltered;
    }
  }

  function cameraCancellationError() {
    const error = new Error('Camera start was cancelled');
    error.name = 'AbortError';
    return error;
  }

  class ManagedCameraSession {
    constructor(video, options = {}) {
      this.video = video;
      this.options = options;
      this.stream = null;
      this.running = false;
      this.generation = 0;
      this.frameRequest = null;
      this.frameRequestType = null;
      this.framePending = false;
      const CameraLifecycle = global.AbletonRcCameraLifecycle?.CameraLifecycle;
      this.lifecycle = CameraLifecycle ? new CameraLifecycle({
        acquire: () => {
          if (global.location?.protocol === 'http:' && global.location?.hostname !== 'localhost' && global.location?.hostname !== '127.0.0.1') {
            throw new Error('Camera access requires HTTPS in mobile browsers. Please connect using the HTTPS URL from the panel.');
          }
          const mediaDevices = global.navigator?.mediaDevices;
          if (!mediaDevices?.getUserMedia) throw new Error('Camera capture is not supported by this browser or origin is not secure (HTTPS required)');
          return mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: this.options.facingMode || 'user',
              width: { ideal: this.options.width || 160 },
              height: { ideal: this.options.height || 120 },
            },
          });
        },
      }) : null;
      this.startPromise = null;
    }

    releaseStream(stream) {
      for (const track of stream?.getTracks?.() || []) track.stop();
    }

    scheduleFrame() {
      if (!this.running || this.frameRequest !== null) return;
      if (typeof this.video?.requestVideoFrameCallback === 'function') {
        this.frameRequestType = 'video';
        this.frameRequest = this.video.requestVideoFrameCallback(() => this.processFrame());
      } else if (typeof global.requestAnimationFrame === 'function') {
        this.frameRequestType = 'animation';
        this.frameRequest = global.requestAnimationFrame(() => this.processFrame());
      }
    }

    async processFrame() {
      this.frameRequest = null;
      if (!this.running || this.framePending) return this.scheduleFrame();
      this.framePending = true;
      try {
        await this.options.onFrame?.();
      } catch (error) {
        if (this.running) console.warn('Camera frame processing failed:', error);
      } finally {
        this.framePending = false;
        this.scheduleFrame();
      }
    }

    async start() {
      if (this.running && this.stream) return this.stream;
      if (this.startPromise) return this.startPromise;
      this.running = true;
      const generation = ++this.generation;
      this.startPromise = this.startInternal(generation).finally(() => {
        if (generation === this.generation) this.startPromise = null;
      });
      return this.startPromise;
    }

    async startInternal(generation) {
      const mediaDevices = global.navigator?.mediaDevices;
      if (!mediaDevices?.getUserMedia) throw new Error('Camera capture is not supported by this browser');
      const stream = this.lifecycle
        ? await this.lifecycle.start()
        : await mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: this.options.facingMode || 'user',
              width: { ideal: this.options.width || 160 },
              height: { ideal: this.options.height || 120 },
            },
          });
      if (!this.running || generation !== this.generation) {
        this.releaseStream(stream);
        throw cameraCancellationError();
      }
      this.stream = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      try {
        await this.video.play?.();
      } catch (error) {
        this.stop();
        throw error;
      }
      if (!this.running || generation !== this.generation) {
        this.stop();
        throw cameraCancellationError();
      }
      this.scheduleFrame();
      return stream;
    }

    stop() {
      this.running = false;
      this.generation += 1;
      if (this.frameRequest !== null) {
        if (this.frameRequestType === 'video') this.video?.cancelVideoFrameCallback?.(this.frameRequest);
        else global.cancelAnimationFrame?.(this.frameRequest);
      }
      this.frameRequest = null;
      this.frameRequestType = null;
      this.framePending = false;
      this.startPromise = null;
      this.lifecycle?.stop();
      this.releaseStream(this.stream);
      const attachedStream = this.video?.srcObject;
      if (attachedStream && attachedStream !== this.stream) this.releaseStream(attachedStream);
      this.stream = null;
      this.video?.pause?.();
      if (this.video) {
        this.video.onloadedmetadata = null;
        this.video.srcObject = null;
      }
    }
  }

  // Pure helper: derive the 14 scalar features for one hand from its 21
  // MediaPipe landmarks. Pulled out of processResults so unit tests can
  // exercise it without spinning up MediaPipe or a canvas.
  // The pinch clutch.
  //
  // Pinching engages it; the hand's travel while the pinch is held becomes
  // three mappable channels. Releasing freezes them where they were, so the
  // next pinch continues from there rather than snapping — the same way a
  // mouse can be lifted and replaced without the cursor jumping.
  //
  // Three details are what make it usable rather than merely working, and all
  // three are measured, not guessed:
  //
  //  - The anchor is captured on the FIRST frame the gate rises, but only
  //    committed once the gate has held for ENGAGE_FRAMES. Engaging on a
  //    single frame makes it jump: a pinch gate flips far more often than a
  //    hand actually leaves a pinch. Waiting without buffering would instead
  //    plant the origin wherever the hand had drifted to by then, so both
  //    halves are needed.
  //  - Release waits RELEASE_FRAMES, about half a second, because the gaps
  //    the detector leaves mid-pinch are longer than they feel.
  //  - X is reference-minus-current while Y and Z are the other way round,
  //    because computeHandData already mirrors x and flips y, and z grows as
  //    the hand comes closer. The asymmetry is what makes all three travel
  //    with the movement.
  // Depth window, in palmSize units, measured at the owner's farthest and
  // closest performing positions on the actual phone rather than a webcam.
  const Z_PALM_FAR = 0.12;
  const Z_PALM_NEAR = 0.30;
  // A relaxed pinch needs only partial extension of all three support fingers.
  // The deeper index curl remains valid without this extra pose allowance.
  const PINCH_SUPPORT_FINGER_FLOOR = 0.20;
  // Only positive, palm-facing readings may start a labelled-hand pinch.
  // Brief pose noise while held is handled by the existing drop tolerance.
  const BACK_OF_HAND_LIMIT = 0;

  const CLUTCH_EMA = 0.35;
  const CLUTCH_SENS_XY = 4.0;
  const CLUTCH_SENS_Z = 4.0;
  const CLUTCH_ENGAGE_FRAMES = 4;
  const CLUTCH_RELEASE_FRAMES = 15;
  // The clutch consumes the continuous fingertip-contact signal, like the
  // RC MediaPipe bank it was ported from. Once contact crosses HIGH it stays
  // latched through the middle band until it crosses LOW, so camera noise
  // cannot freeze movement while the performer is still holding the pinch.
  // Quantos frames de pose reprovada tolerar enquanto os dedos seguem
  // encostados, antes de zerar o sinal do clutch. Quatro frames a 60 FPS sao
  // cerca de 66 ms: o suficiente para atravessar um piscar do gate ao
  // inclinar a mao, curto demais para segurar uma pose de fato errada.
  const POSE_DROP_PATIENCE = 4;
  // So vale segurar enquanto ha contato de verdade. Abaixo disto o performer
  // ja abriu a mao, e ai soltar e o comportamento certo.
  const POSE_DROP_CONTACT_FLOOR = 0.55;
  const CLUTCH_GATE_HIGH = 0.75;
  const CLUTCH_GATE_LOW = 0.55;

  class PinchClutch {
    constructor() { this.reset(); }

    reset() {
      this.active = false;
      this.gateLatched = false;
      this.riseFrames = 0;
      this.dropFrames = 0;
      this.smoothX = null; this.smoothY = null; this.smoothZ = null;
      this.refX = 0; this.refY = 0; this.refZ = 0;
      this.candX = 0; this.candY = 0; this.candZ = 0;
      // Output lives in -1..1 internally and is published as 0..1 so it maps
      // like every other vision channel, with 0.5 as the untouched centre.
      this.outX = 0; this.outY = 0; this.outZ = 0;
      this.heldX = 0; this.heldY = 0; this.heldZ = 0;
    }

    update(pinchSignal, x, y, z) {
      const strength = typeof pinchSignal === 'boolean'
        ? (pinchSignal ? 1 : 0)
        : Number(pinchSignal);
      if (Number.isFinite(strength)) {
        if (strength >= CLUTCH_GATE_HIGH) this.gateLatched = true;
        else if (strength < CLUTCH_GATE_LOW) this.gateLatched = false;
      }
      const gate = this.gateLatched;
      const has = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
      if (has) {
        if (this.smoothX === null) { this.smoothX = x; this.smoothY = y; this.smoothZ = z; }
        else {
          this.smoothX += CLUTCH_EMA * (x - this.smoothX);
          this.smoothY += CLUTCH_EMA * (y - this.smoothY);
          this.smoothZ += CLUTCH_EMA * (z - this.smoothZ);
        }
      }

      if (gate && has) {
        const reanchoring = this.active && this.dropFrames > 0;
        this.dropFrames = 0;
        this.riseFrames += 1;
        if (this.riseFrames === 1) {
          this.candX = this.smoothX; this.candY = this.smoothY; this.candZ = this.smoothZ;
        }
        if (!this.active && this.riseFrames >= CLUTCH_ENGAGE_FRAMES) {
          this.active = true;
          this.refX = this.candX; this.refY = this.candY; this.refZ = this.candZ;
          this.heldX = this.outX; this.heldY = this.outY; this.heldZ = this.outZ;
        }
        if (reanchoring) {
          // Discard release travel so the smoothing tail cannot move a held value.
          this.smoothX = x; this.smoothY = y; this.smoothZ = z;
          this.refX = this.smoothX; this.refY = this.smoothY; this.refZ = this.smoothZ;
          this.heldX = this.outX; this.heldY = this.outY; this.heldZ = this.outZ;
        }
      } else if (this.active) {
        this.riseFrames = 0;
        this.dropFrames += 1;
        if (this.dropFrames > CLUTCH_RELEASE_FRAMES) {
          this.active = false;
          this.gateLatched = false;
          this.heldX = this.outX; this.heldY = this.outY; this.heldZ = this.outZ;
        }
      } else {
        this.riseFrames = 0;
      }

      if (gate && this.active && has) {
        const clamp11 = (v) => Math.max(-1, Math.min(1, v));
        this.outX = clamp11(this.heldX + (this.refX - this.smoothX) * CLUTCH_SENS_XY);
        this.outY = clamp11(this.heldY + (this.smoothY - this.refY) * CLUTCH_SENS_XY);
        this.outZ = clamp11(this.heldZ + (this.smoothZ - this.refZ) * CLUTCH_SENS_Z);
      }
      return this.snapshot();
    }

    // A frame with no hand is a dropped frame, not a release: the detector
    // losing the hand for a moment must not zero a held clutch.
    missing() {
      if (this.active) {
        this.dropFrames += 1;
        if (this.dropFrames > CLUTCH_RELEASE_FRAMES) {
          this.active = false;
          // The gate is hysteretic: it only unlatches below CLUTCH_GATE_LOW.
          // Timing out here without clearing it leaves the latch set, so the
          // hand can come back anywhere in the 0.55..0.75 dead band — a
          // half-closed hand — and re-engage the clutch on the fourth frame
          // without the performer ever pinching. update() clears it here too.
          this.gateLatched = false;
          this.heldX = this.outX; this.heldY = this.outY; this.heldZ = this.outZ;
        }
      }
      this.riseFrames = 0;
      this.smoothX = null; this.smoothY = null; this.smoothZ = null;
      return this.snapshot();
    }

    snapshot() {
      const pub = (v) => parseFloat((0.5 + v / 2).toFixed(3));
      return {
        pinch_engaged: this.active,
        pinch_x: pub(this.outX),
        pinch_y: pub(this.outY),
        pinch_z: pub(this.outZ),
      };
    }
  }

  function computeHandData(landmarks, handedness = null) {
    const palmSize = dist3D(landmarks[0], landmarks[9]) || 0.1;
    const palmSize2D = Math.hypot(
      landmarks[0].x - landmarks[9].x,
      landmarks[0].y - landmarks[9].y,
    ) || 0.1;

    const rawX = (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3;
    const rawY = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;
    const x = parseFloat((1.0 - rawX).toFixed(3));
    const y = parseFloat((1.0 - rawY).toFixed(3));
    // Depth, from how large the palm reads. The window is the pair of
    // palmSize values that map to the near and far ends of the travel, and it
    // is optics-dependent: a phone lens at arm's length does not produce the
    // same palmSize as a webcam at desk distance. The owner measured 0.12 at
    // the farthest performing position and 0.30 at the closest on this phone,
    // so those endpoints map the whole physical travel to the whole channel.
    // The raw palmSize remains published on the VID readout beside Z so a
    // future device-specific recalibration can be based on measured optics.
    const z = parseFloat(Math.min(1.0, Math.max(0.0,
      (palmSize - Z_PALM_FAR) / (Z_PALM_NEAR - Z_PALM_FAR))).toFixed(3));

    // Finger extension, measured tip-to-its-own-MCP over palmSize.
    //
    // It used to be tip-to-WRIST, and that saturates. A finger does not
    // shorten when it closes, it curls: the tip arcs back over the palm and
    // stays roughly a palm away from the wrist the whole way, so the ratio
    // barely moves. Simulated on a curling hand, a fully closed fist reported
    // FOUR raised fingers, with the pinky reading 1.000 — fully extended —
    // while completely folded. That is the "there is always one finger up"
    // the performer sees, and the rock reads five instead of three.
    //
    // Tip-to-MCP collapses when the finger closes, because the tip really
    // does return to its own knuckle. Windows are per finger because reach
    // relative to palm size differs between them. The sibling windows came
    // from RC MediaPipe takes of this hand; the index ceiling now comes from
    // the owner's measured range on the actual phone.
    const stretch = (tip, mcp, lo, hi) => {
      const ratio = dist3D(landmarks[tip], landmarks[mcp]) / palmSize;
      return parseFloat(Math.max(0.0, Math.min(1.0, (ratio - lo) / (hi - lo))).toFixed(3));
    };
    // Thumb reach varies far more with camera angle than the four fingers:
    // on the phone, an open outward thumb can project to only half a palm
    // from its MCP. The sibling RC MediaPipe project's 0.35..0.70 window
    // was cut on one desktop rig and put that real open pose below the raised-finger gate. Widen the
    // usable window while keeping the curled fixture (about 0.22) below it.
    // The thumb is not measured like the others, because it does not move
    // like the others. The four fingers curl, so tip-to-own-knuckle collapses
    // as they close. The thumb OPPOSES: it swings across the palm at its base
    // while the knuckle stays planted, so tip-to-knuckle barely moves — the
    // original code said exactly this before we changed it, and tucking the
    // thumb went back to reading as raised about half the time.
    //
    // Opposition is the thumb's actual degree of freedom, so measure that:
    // how far the tip has travelled toward the far side of the hand. Against
    // an extended, half-open and tucked thumb this separated 1.30 / 0.96 /
    // 0.55, roughly twice the spread of tip-to-knuckle, and monotonic.
    //
    // Opposition is shortened by perspective too, when the thumb points at
    // the lens, so the window has to clear a foreshortened-but-open thumb
    // while still rejecting a tucked one. The three states measure 0.44
    // tucked, 0.78 foreshortened-open and 1.16 fully open, and the gate sits
    // between the first two rather than splitting the difference.
    //
    // These are simulated values and want confirming on a real hand; the
    // per-finger numbers are on the VID readout for exactly that.
    const thumb = parseFloat(Math.max(0.0, Math.min(1.0,
      (dist3D(landmarks[4], landmarks[17]) / palmSize - 0.42) / 0.31)).toFixed(3));
    const index  = stretch(8,  5,  0.45, 0.80);
    const middle = stretch(12, 9,  0.45, 0.90);
    const ring   = stretch(16, 13, 0.42, 0.92);
    const pinky  = stretch(20, 17, 0.33, 0.72);

    // MediaPipe landmark z is too noisy to use for fingertip contact. Keep
    // both the gap and its palm scale in image space so depth noise cannot
    // manufacture or break a pinch.
    const pinchRatio = Math.hypot(
      landmarks[4].x - landmarks[8].x,
      landmarks[4].y - landmarks[8].y,
    ) / palmSize2D;
    // Nearby tips need not overlap: a gap of 0.35 palm lengths reaches the
    // clutch's 0.75 engage threshold; opening beyond 0.47 drops below 0.55.
    // Normalize by palm size so this allowance scales with the visible hand.
    const pinchContact = parseFloat(Math.max(0.0, Math.min(1.0, (0.80 - pinchRatio) / 0.60)).toFixed(3));
    // Signed area of the wrist/index-MCP/pinky-MCP triangle distinguishes the
    // palm from the back of the hand while naturally crossing zero edge-on.
    // Geometry stays in raw image space; only published X is mirrored.
    //
    // The sign below is CALIBRATED, not assumed. Measured on the owner's phone
    // on 27/08/2026, with the hand fully open in front of the camera:
    //
    //   real hand   pose    HAND chip   correct facing
    //   left        palm    "Right"     positive
    //   left        back    "Right"     negative
    //   right       palm    "Left"      positive
    //   right       back    "Left"      negative
    //
    // Two facts come out of that table. First, MediaPipe's label is the
    // opposite of the real hand on this path, which sends the unmirrored
    // camera frame. Second, the raw triangle is already positive for a real
    // left palm and negative for a real right palm, so the label whose value
    // is "Right" is the one that must keep the sign.
    //
    // An earlier revision had this branch the other way round. It made the
    // palm read negative on BOTH hands, `palmPoseOk` reject every palm, and
    // pinch and clutch die outright — which is how the inversion was found.
    const aX = landmarks[5].x - landmarks[0].x;
    const aY = landmarks[5].y - landmarks[0].y;
    const bX = landmarks[17].x - landmarks[0].x;
    const bY = landmarks[17].y - landmarks[0].y;
    const rawFacing = (aX * bY - aY * bX) / (palmSize2D * palmSize2D);
    const handLabel = typeof handedness === 'string' ? handedness : handedness?.label;
    const facingKnown = handLabel === 'Right' || handLabel === 'Left';
    const facingSign = handLabel === 'Right' ? 1 : -1;
    const facing = parseFloat((rawFacing * facingSign).toFixed(3));
    // Without a handedness label the raw triangle is unsigned information: the
    // same shape is a left palm or a right back. Guessing a sign there would
    // reject half the poses at random, so an unknown label disables the gate
    // instead of deciding it. Losing the back-of-hand rejection is a smaller
    // failure than losing pinch entirely, which is what a wrong sign does.
    const palmPoseOk = facingKnown ? facing > BACK_OF_HAND_LIMIT : true;
    const segment2D = (a, b) => Math.hypot(
      landmarks[a].x - landmarks[b].x,
      landmarks[a].y - landmarks[b].y,
    );
    const indexPath = segment2D(5, 6) + segment2D(6, 7) + segment2D(7, 8);
    const indexStraightness = indexPath > 1e-6 ? segment2D(5, 8) / indexPath : 1;
    const fist    = index < 0.35 && middle < 0.35 && ring < 0.35 && pinky < 0.35;
    // A confirmed palm with three partly extended fingers allows a gentler
    // index bend. Without that evidence keep the existing deliberate-curl
    // requirement; a straight pointing finger or fist must not gain a shortcut.
    const otherFingersExtended = middle > PINCH_SUPPORT_FINGER_FLOOR
      && ring > PINCH_SUPPORT_FINGER_FLOOR && pinky > PINCH_SUPPORT_FINGER_FLOOR;
    const relaxedPinchPose = facingKnown && palmPoseOk && otherFingersExtended;
    const indexCurved = indexStraightness < (relaxedPinchPose ? 0.95 : 0.80);
    const pinchPoseOk = palmPoseOk && indexCurved && !fist;
    // Keep the contact signal continuous for the public sensor channel. A
    // separate gated signal feeds the clutch so a rejected pose cannot arm it.
    const pinchVal = pinchContact;
    const pinchSignal = pinchPoseOk ? pinchContact : 0;
    const pinch = pinchPoseOk && pinchVal > 0.75;

    const victory = index > 0.65 && middle > 0.65 && ring < 0.35 && pinky < 0.35;
    const open    = thumb > 0.65 && index > 0.65 && middle > 0.65 && ring > 0.65 && pinky > 0.65;
    // Wrist rotation reading from the palm base anchors (MCP joints).
    // We use the index MCP (landmark 5) and pinky MCP (landmark 17)
    // because fingertips collapse during a Victory pose — the thumb and
    // pinky tips fold onto the palm when the user is making a V, so
    // their angle would oscillate wildly. The MCPs are anchored in the
    // palm skeleton and stay put through the whole gesture.
    //
    // The vector index_MCP → pinky_MCP lies horizontal when the palm is
    // flat; atan2(dy, dx) measures how far that vector has rotated. We
    // normalize the [-π/2, π/2] atan2 range into [0, 1] so 0.5 sits at
    // the horizontal neutral and the value drifts toward 0.0 or 1.0 as
    // the wrist pronates / supinates.
    //
    // MediaPipe's y axis grows downward, so dy=index_MCP.y−pinky_MCP.y
    // is positive when the index MCP sits below the pinky MCP on the
    // image (palm tilted so the thumb side drops).
    //
    // The reading is computed unconditionally every frame; the app.js
    // pipeline latches it onto the wire only while the Victory pose is
    // active and pins it back to 0.5 otherwise.
    let rotateVal;
    {
      const dy = landmarks[5].y - landmarks[17].y;
      const dx = landmarks[17].x - landmarks[5].x;
      const angle = Math.atan2(dy, dx);
      const normalized = angle / (Math.PI / 2);
      rotateVal = parseFloat(Math.max(0, Math.min(1, normalized * 0.5 + 0.5)).toFixed(3));
    }

    let fingers = 0;
    if (thumb  > 0.65) fingers++;
    if (index  > 0.65) fingers++;
    if (middle > 0.65) fingers++;
    if (ring   > 0.65) fingers++;
    if (pinky  > 0.65) fingers++;
    // Normalized finger count travels on the wire as 0.0–1.0 so the same
    // channel can be mapped to any continuous parameter (filter cutoff,
    // send level, etc) without the caller needing to know the 0–5 range.
    // The PC panel multiplies back by 5 for display purposes.
    const fingersNorm = parseFloat((fingers / 5).toFixed(3));

    return {
      x, y, z,
      palmSize: parseFloat(palmSize.toFixed(4)),
      facing,
      handedness: handLabel || null,
      // A mao REAL, ja desfeita a troca do MediaPipe. O chip mostra esta, e
      // nao a etiqueta crua: a etiqueta serviu para calibrar o sinal, o que
      // ja esta feito e registrado acima, e continuar exibindo-a so faz o
      // performer ler "Right" ao levantar a esquerda.
      handReal: facingKnown ? (handLabel === 'Right' ? 'Left' : 'Right') : null,
      palmPoseOk,
      indexCurved,
      otherFingersExtended,
      thumb, index, middle, ring, pinky,
      fist, pinch, pinchVal, pinchSignal,
      victory, open, rotateVal, fingers: fingersNorm,
    };
  }

  class VisionProcessor {
    constructor() {
      this.video = null;
      this.canvas = null;
      this.ctx = null;
      this.hands = null;
      this.camera = null;
      this.onHandUpdate = null; // Callback: (data) => {}
      this.onColorUpdate = null; // Callback: (data) => {}
      this.onGesture = null; // Callback: ({name, confidence}) => {}
      this.onGestureProgress = null; // Callback: ({name, confidence, accepted}) => {}
      this.onVisionStatus = null; // Callback: (visionStatus) => {}
      this.active = false;
      this.wasHandPresent = false;
      this.pinchClutch = new PinchClutch();
      this.poseDropFrames = 0;
      this.lastPinchSignal = 0;
      // Observable pipeline state. "Camera shows video" and "MediaPipe is
      // actually running" are independent: the preview can look perfect while
      // inference is dead. Each stage is tracked separately so the UI can say
      // which one failed instead of silently showing a live preview forever.
      //   idle → starting → waiting-hand ⇄ hand-detected
      //                          ↘ error
      this.visionStatus = {
        stage: 'idle',
        cameraActive: false,
        mediapipeLoaded: false,
        framesSent: 0,
        resultsReceived: 0,
        lastError: null,
      };
      this.visionStatusPublishIntervalMs = 100;
      this.lastVisionStatusPublishAt = -Infinity;
      const safe = global.SafeInputLayer;
      // Spatial tracking was retired: x/y/z no longer exist and there is
      // no need for an inertial prediction buffer. Static hand-shape
      // gestures are detected directly from MediaPipe landmarks.
      this.gestures = safe ? new safe.GestureLibrary() : null;
      this.gestureLearnName = null;
      this.gestureTestName = null;
      this.gestureLearnFrames = [];
      this.gestureLearnPreparationFrames = [];
      this.gestureLearnReady = false;
      this.colorSampleIntervalMs = 120;
      this.lastColorSampleAt = -Infinity;
      this.lastGestureProgressAt = -Infinity;
      // MediaPipe confidence threshold; default to medium (0.5). The UI
      // confidence selector calls setConfidence() before the camera
      // starts, so the first hands.send already uses the chosen preset.
      this.confidence = 0.5;
      // One filter per position axis. Jitter on a still hand is what made
      // mapped parameters buzz; raw frames on a fast hand are what made them
      // jump. The 1€ filter is the standard answer to both at once.
      this.positionFilters = {
        x: new OneEuroFilter(),
        y: new OneEuroFilter(),
        // Depth is the noisiest channel (it is derived from palm size), so it
        // gets a lower floor and opens a little more reluctantly.
        z: new OneEuroFilter({ minCutoff: 0.8, beta: 1.0 }),
      };
    }

    /** Smooth the hand position in place. Returns the same shape it was given. */
    filterHandPosition(data, timeMs) {
      if (!data) return data;
      data.x = this.positionFilters.x.filter(data.x, timeMs);
      data.y = this.positionFilters.y.filter(data.y, timeMs);
      data.z = this.positionFilters.z.filter(data.z, timeMs);
      return data;
    }

    /** Merge a patch into visionStatus and publish it to the UI. */
    setVisionStatus(patch) {
      const previousStage = this.visionStatus.stage;
      const previousError = this.visionStatus.lastError;
      Object.assign(this.visionStatus, patch);
      if (typeof this.onVisionStatus === 'function') {
        const publishAt = nowMs();
        const changed = previousStage !== this.visionStatus.stage
          || !Object.is(previousError, this.visionStatus.lastError);
        if (!changed && publishAt - this.lastVisionStatusPublishAt < this.visionStatusPublishIntervalMs) return;
        this.lastVisionStatusPublishAt = publishAt;
        try { this.onVisionStatus(this.visionStatus); } catch { /* UI must never break the pipeline */ }
      }
    }

    // Map the three UI presets to MediaPipe's minDetection / minTracking
    // confidence values. The medium default is the library default; the
    // low preset exists for the worm's low-light performance setup where
    // MediaPipe otherwise refuses to detect any hand.
    /**
     * Detection and tracking want opposite things. Detection decides whether a
     * hand is there at all, so it should stay strict or the model latches onto
     * background clutter. Tracking only decides whether to keep following a
     * hand it already found, so it should be forgiving — a hand smeared by
     * fast motion still scores poorly for a frame or two. Driving both from
     * one preset meant CONF=High dropped the hand exactly when moving quickly.
     */
    trackingConfidenceFor(detectionConfidence) {
      return Math.max(0.1, Math.min(detectionConfidence - 0.15, detectionConfidence * 0.5));
    }

    setConfidence(preset) {
      const table = { low: 0.2, medium: 0.5, high: 0.7 };
      this.confidence = table[preset] ?? 0.5;
      if (this.hands) {
        this.hands.setOptions({
          minDetectionConfidence: this.confidence,
          minTrackingConfidence: this.trackingConfidenceFor(this.confidence),
        });
      }
      return this.confidence;
    }

    setGestureOptions(options = {}) {
      if (!this.gestures) return;
      if (Number.isFinite(options.threshold)) this.gestures.threshold = Math.max(0.01, Number(options.threshold));
      if (Number.isFinite(options.ambiguityRatio)) this.gestures.ambiguityRatio = Math.max(1, Number(options.ambiguityRatio));
      if (Number.isFinite(options.minimumConfidence)) this.gestures.minimumConfidence = Math.max(0, Math.min(1, Number(options.minimumConfidence)));
      if (Number.isFinite(options.holdMs)) this.gestures.holdMs = Math.max(0, Number(options.holdMs));
      if (Number.isFinite(options.releaseMs)) this.gestures.releaseMs = Math.max(0, Number(options.releaseMs));
      if (Number.isFinite(options.releaseRatio)) this.gestures.releaseRatio = Math.max(1, Number(options.releaseRatio));
      if (Number.isFinite(options.unknownGraceMs)) this.gestures.unknownGraceMs = Math.max(0, Number(options.unknownGraceMs));
      if (Number.isFinite(options.captureStabilityThreshold)) {
        this.gestures.captureStabilityThreshold = Math.max(0.01, Number(options.captureStabilityThreshold));
      }
    }

    beginGestureLearn(name) {
      if (!name || typeof name !== 'string') throw new Error('Gesture name is required');
      this.clearGestureHistory();
      this.gestureLearnName = name.trim();
      this.gestureLearnFrames = [];
      this.gestureLearnPreparationFrames = [];
      this.gestureLearnReady = false;
    }

    clearGestureHistory() {
      this.gestures?.resetRecognition?.();
      this.lastGestureProgressAt = -Infinity;
    }

    finishGestureLearn() {
      const name = this.gestureLearnName;
      const frames = this.gestureLearnFrames;
      this.gestureLearnName = null;
      this.gestureLearnFrames = [];
      this.gestureLearnPreparationFrames = [];
      this.gestureLearnReady = false;
      if (!name || frames.length < 5 || !this.gestures) return 0;
      return this.gestures.learn(name, frames);
    }

    cancelGestureLearn() {
      this.gestureLearnName = null;
      this.gestureLearnFrames = [];
      this.gestureLearnPreparationFrames = [];
      this.gestureLearnReady = false;
    }

    gestureSampleCount(name) {
      return this.gestures?.sampleCount(name) || 0;
    }

    gestureKind(name) {
      return this.gestures?.kind(name) || null;
    }

    removeLastGestureTake(name) {
      return this.gestures?.removeLast(name) || 0;
    }

    deleteGesture(name) {
      return this.gestures?.delete(name) || false;
    }

    beginGestureTest(name) {
      this.clearGestureHistory();
      this.gestureTestName = typeof name === 'string' ? name : null;
    }

    endGestureTest() {
      this.gestureTestName = null;
      this.clearGestureHistory();
    }

    recognizeGesture(descriptor, timestamp = Date.now(), targetName = null) {
      return this.gestures?.recognize(descriptor, timestamp, targetName) || null;
    }

    processHandData(rawData, timestamp = Date.now(), landmarks = null) {
      if (!rawData) return null;
      // No spatial tracker / calibrator: preserve the direct normalized
      // X/Y/palm-size-depth controls without prediction or 3D calibration.
      const output = {
        ...rawData,
        x: Math.max(0, Math.min(1, Number(rawData.x) || 0)),
        y: Math.max(0, Math.min(1, Number(rawData.y) || 0)),
        z: Math.max(0, Math.min(1, Number(rawData.z) || 0)),
        active: true,
        observed: true,
        projected: false,
        trackingState: 'active',
        confidence: rawData.confidence ?? 1,
      };
      // The clutch reads the filtered position, so it travels on the same
      // steady value the HUD and the wire see. computeHandData supplies a
      // gated analog signal for real frames; direct callers without that field
      // retain the legacy pinchVal fallback used by the unit-level contract.
      let pinchSignal = Number.isFinite(rawData.pinchSignal)
        ? rawData.pinchSignal
        : Number.isFinite(rawData.pinchVal)
          ? rawData.pinchVal
        : Boolean(rawData.pinch);

      // O clutch tem histerese propria, de 0.75 para engatar e 0.55 para
      // soltar, e ela funciona bem. So que a pose zera o sinal de uma vez, e
      // zero passa por baixo dos 0.55 de qualquer jeito — um unico frame em
      // que `palmPoseOk` pisca solta o latch e o performer sente o clutch
      // largar sozinho ao inclinar a mao.
      //
      // Aqui os dedos continuam encostados; so a pose reprovou. Segurar o
      // ultimo sinal por alguns frames devolve a decisao a histerese do
      // clutch, em vez de atropela-la. E o mesmo principio que ja governa
      // frame sem mao: perder a deteccao por um instante nao e soltar.
      //
      // Essa tolerancia so preserva um clutch ja engatado. O inicio exige
      // frames de pose valida consecutivos, sem reaproveitar um contato antigo.
      const dedosAindaEncostados = Number.isFinite(rawData.pinchVal)
        && rawData.pinchVal >= POSE_DROP_CONTACT_FLOOR;
      if (pinchSignal > 0) {
        // Frame bom: a paciencia so se renova aqui. Zerar o contador no ramo
        // de baixo faria a espera reiniciar dentro de uma sequencia ruim.
        this.poseDropFrames = 0;
        this.lastPinchSignal = pinchSignal;
      } else if (this.pinchClutch.active
        && dedosAindaEncostados && this.poseDropFrames < POSE_DROP_PATIENCE) {
        this.poseDropFrames += 1;
        pinchSignal = this.lastPinchSignal;
      } else {
        this.lastPinchSignal = 0;
      }

      Object.assign(output, this.pinchClutch.update(
        pinchSignal, output.x, output.y, output.z));

      const descriptor = global.SafeInputLayer?.normalizeHandPose?.(landmarks) || [];
      if (this.gestureLearnName && descriptor.length) {
        if (!this.gestureLearnReady) {
          this.gestureLearnPreparationFrames.push(descriptor);
          this.gestureLearnPreparationFrames = this.gestureLearnPreparationFrames.slice(-5);
          if (this.gestures?.isStableCapture?.(this.gestureLearnPreparationFrames)) {
            this.gestureLearnReady = true;
            // These frames only prove that the hand has settled. The timed
            // capture starts now, so the transition into the pose cannot
            // become part of the learned example.
            this.gestureLearnFrames = [];
            try { this.onGestureLearnReady?.(this.gestureLearnName); } catch { /* UI callback */ }
          }
        } else {
          this.gestureLearnFrames.push(descriptor);
        }
      } else if (descriptor.length) {
        const evaluation = this.gestures?.evaluate(descriptor, this.gestureTestName);
        if (evaluation && this.onGestureProgress
          && (evaluation.accepted || timestamp - this.lastGestureProgressAt >= 100)) {
          this.lastGestureProgressAt = timestamp;
          this.onGestureProgress(evaluation);
        }
        const match = this.recognizeGesture(descriptor, timestamp, this.gestureTestName);
        if (match && this.onGesture) this.onGesture(match);
      }
      return output;
    }

    processMissing(timestamp = Date.now()) {
      // Spatial tracking was retired, so the inertial predictor is gone.
      // Mark the gesture library as UNKNOWN. Its short grace window absorbs
      // detector dropouts, then the normal hold/release state can reset if the
      // hand does not return. Nothing synthetic is emitted on the wire.
      this.gestures?.recognize(null, timestamp, this.gestureTestName);
      if (this.gestureLearnName && !this.gestureLearnReady) {
        this.gestureLearnPreparationFrames = [];
      }
      // Pose patience only bridges a noisy gate while the same contact stays
      // visible. Once the hand is gone there is no contact to carry forward.
      this.poseDropFrames = 0;
      this.lastPinchSignal = 0;
      this.pinchClutch.missing();
      return null;
    }

    exportSafetyConfig() {
      return {
        version: 2,
        confidence: this.confidence,
        gestureOptions: this.gestures ? {
          threshold: this.gestures.threshold,
          ambiguityRatio: this.gestures.ambiguityRatio,
          minimumConfidence: this.gestures.minimumConfidence,
          captureStabilityThreshold: this.gestures.captureStabilityThreshold,
          holdMs: this.gestures.holdMs,
          releaseMs: this.gestures.releaseMs,
          releaseRatio: this.gestures.releaseRatio,
          unknownGraceMs: this.gestures.unknownGraceMs,
        } : {},
        gestures: this.gestures?.toJSON() || { version: 8, templates: [] },
      };
    }

    importSafetyConfig(config) {
      const safe = global.SafeInputLayer;
      if (!safe || !config) return;
      this.confidence = Number.isFinite(config.confidence) ? config.confidence : 0.5;
      this.gestures = safe.GestureLibrary.fromJSON(config.gestures, config.gestureOptions || {});
    }

    async loadDependencies() {
      if (global.Hands && global.Camera) return;

      const loadScript = (url) => {
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = resolveAssetUrl(url);
          s.onload = resolve;
          s.onerror = () => reject(new Error(`Failed to load script: ${url}`));
          document.head.appendChild(s);
        });
      };

      try {
        await loadScript('vendor/mediapipe/camera_utils/camera_utils.js');
        await loadScript('vendor/mediapipe/hands/hands.js');
      } catch (err) {
        console.error('Failed to load MediaPipe:', err);
        throw err;
      }
    }

    async start(videoElement, canvasElement) {
      if (this.active) return;
      this.active = true;
      this.lastColorSampleAt = -Infinity;
      this.setVisionStatus({
        stage: 'starting',
        cameraActive: false,
        mediapipeLoaded: false,
        framesSent: 0,
        resultsReceived: 0,
        lastError: null,
      });

      this.video = videoElement;
      this.canvas = canvasElement;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      }

      try {
        const hasNativeCapture = Boolean(global.navigator?.mediaDevices?.getUserMedia);
        const cameraOptions = {
          onFrame: async () => {
            if (this.active && this.ctx && this.canvas && this.video && this.video.readyState >= 2) {
              this.ctx.save();
              this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
              this.ctx.restore();
            }
            if (this.active && this.hands) {
              this.lastSendTime = nowMs();
              try {
                await this.hands.send({ image: this.video });
                this.setVisionStatus({ framesSent: this.visionStatus.framesSent + 1 });
              } catch (err) {
                // Do NOT let this bubble into the camera loop's generic
                // console.warn. A failing inference used to be invisible: the
                // preview kept rendering and the user was told nothing.
                const detail = err && err.message ? err.message : String(err);
                console.error('[RC Surface] MediaPipe inference failed:', detail);
                this.setVisionStatus({ stage: 'error', lastError: detail });
              }
            }
          },
          // 160x120 left a fast-moving hand as a handful of blurred pixels,
          // which is why tracking dropped it mid-gesture. 320x240 is four
          // times the pixels and still cheap for modelComplexity 0.
          width: 320,
          height: 240,
        };
        const startCamera = async (CameraController) => {
          if (!this.camera) this.camera = new CameraController(this.video, cameraOptions);
          const camera = this.camera;
          const previousAlert = global.alert;
          if (typeof previousAlert === 'function') global.alert = () => {};
          try {
            await camera.start();
            if (!this.active || this.camera !== camera) {
              camera.stop();
              throw cameraCancellationError();
            }
          } finally {
            if (typeof previousAlert === 'function') global.alert = previousAlert;
          }
        };

        // Acquire the native stream directly inside the user's tap. On a
        // first visit MediaPipe still needs to load; waiting for it first can
        // lose the browser's transient activation and leave CAMERA OFF.
        if (hasNativeCapture) {
          await startCamera(ManagedCameraSession);
          this.setVisionStatus({ stage: 'camera-ready', cameraActive: true });
        }

        await this.loadDependencies();
        if (!this.active) throw cameraCancellationError();
        this.setVisionStatus({ mediapipeLoaded: true });

        if (!this.hands) {
          this.hands = new global.Hands({
            locateFile: (file) => resolveAssetUrl(`vendor/mediapipe/hands/${file}`)
          });

          this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: this.confidence,
            minTrackingConfidence: this.trackingConfidenceFor(this.confidence),
          });

          this.hands.onResults((results) => {
            this.processResults(results);
          });
        }

        // Tests and very old browsers without native mediaDevices keep the
        // bundled camera_utils fallback, after its constructor has loaded.
        if (!hasNativeCapture) {
          await startCamera(global.Camera);
          this.setVisionStatus({ stage: 'camera-ready', cameraActive: true });
        }
        this.setVisionStatus({ stage: 'waiting-hand' });
      } catch (error) {
        const detail = error && error.message ? error.message : String(error);
        this.stop();
        if (!error || error.name !== 'AbortError') {
          this.setVisionStatus({ stage: 'error', lastError: detail });
        }
        throw error;
      }
    }

    stop() {
      this.active = false;
      this.cancelGestureLearn();
      this.setVisionStatus({ stage: 'idle', cameraActive: false, mediapipeLoaded: false });
      if (this.camera) {
        this.camera.stop();
        this.camera = null;
      }
      if (this.hands) {
        this.hands.close();
        this.hands = null;
      }
      // Drop filter history: resuming later must not ease out of a stale
      // position recorded before the camera was switched off.
      for (const filter of Object.values(this.positionFilters)) filter.reset();
      // Stopping the camera drops the clutch too: resuming should start
      // from centre, not from wherever the last set left it.
      this.pinchClutch.reset();
      this.poseDropFrames = 0;
      this.lastPinchSignal = 0;
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.video = null;
      this.canvas = null;
      this.ctx = null;
    }

    processResults(results, frameTimestamp = nowMs()) {
      if (!this.active) return;
      if (this.lastSendTime) {
        const latency = nowMs() - this.lastSendTime;
        this.lastSendTime = null;
        if (typeof window !== 'undefined' && window.state && window.state.sensors && window.state.sensors.network) {
          window.state.sensors.network.mpLatency = Math.round(latency);
        }
      }

      // Rendering is optional.  Detection and wire-control updates must keep
      // running even when a WebView cannot create a 2D canvas context (for
      // example with hardware acceleration disabled).  Previously all hand
      // processing lived inside this block, so the camera could be visible
      // while every vision mapping stayed permanently inactive.
      const canRender = Boolean(this.ctx && this.canvas);
      if (canRender) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw video frame
        if (results.image) {
          this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);
        }

        if (this.onColorUpdate && frameTimestamp - this.lastColorSampleAt >= this.colorSampleIntervalMs) {
          const avgColor = this.calculateAverageColor();
          this.onColorUpdate(avgColor);
          this.lastColorSampleAt = frameTimestamp;
        }
      }

      const sawHand = Boolean(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
      // Results arriving at all proves the pipeline is alive; whether a hand is
      // present is a separate fact. Keeping them distinct is what lets the UI
      // say "waiting for hand" instead of leaving the user guessing.
      this.setVisionStatus({
        resultsReceived: this.visionStatus.resultsReceived + 1,
        stage: sawHand ? 'hand-detected' : 'waiting-hand',
        lastError: null,
      });

      let handData = null;
      if (sawHand) {
        if (!this.wasHandPresent) {
          // Re-entry! Hack the filters to pretend the time difference was only 33ms,
          // and reset the derivative to 0 so they don't open up and snap.
          const fakeLastTime = frameTimestamp - 33;
          for (const filter of Object.values(this.positionFilters)) {
            if (filter.lastTimeMs !== null) {
              filter.lastTimeMs = fakeLastTime;
              filter.lastDerivative = 0;
            }
          }
        }
        this.wasHandPresent = true;
        const landmarks = results.multiHandLandmarks[0];
        if (canRender) this.drawLandmarks(landmarks);
        // Filter the position before anything downstream reads it, so the
        // gesture layer, the HUD and the wire all see the same steady value.
        const handedness = results.multiHandedness?.[0] ?? null;
        const raw = this.filterHandPosition(computeHandData(landmarks, handedness), frameTimestamp);
        handData = this.processHandData(raw, frameTimestamp, landmarks);
      } else {
        this.wasHandPresent = false;
        handData = this.processMissing(frameTimestamp);
      }

      if (this.onHandUpdate) {
        this.onHandUpdate(handData);
      }
      if (canRender) this.ctx.restore();
    }

    calculateAverageColor() {
      if (!this.ctx || !this.canvas) return { r: 0, g: 0, b: 0 };
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      let imgData;
      try {
        imgData = this.ctx.getImageData(0, 0, width, height);
      } catch {
        return { r: 0, g: 0, b: 0 };
      }
      
      const data = imgData.data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      
      const step = 16; 
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count++;
        }
      }
      
      if (count === 0) return { r: 0, g: 0, b: 0 };
      
      return {
        r: parseFloat((rSum / count / 255).toFixed(3)),
        g: parseFloat((gSum / count / 255).toFixed(3)),
        b: parseFloat((bSum / count / 255).toFixed(3))
      };
    }

    drawLandmarks(landmarks) {
      this.ctx.fillStyle = '#ff9f0a';
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;

      // Draw connection lines
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // index
        [5, 9], [9, 10], [10, 11], [11, 12], // middle
        [9, 13], [13, 14], [14, 15], [15, 16], // ring
        [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // pinky
      ];

      connections.forEach(([s, e]) => {
        const startPoint = landmarks[s];
        const endPoint = landmarks[e];
        this.ctx.beginPath();
        this.ctx.moveTo(startPoint.x * this.canvas.width, startPoint.y * this.canvas.height);
        this.ctx.lineTo(endPoint.x * this.canvas.width, endPoint.y * this.canvas.height);
        this.ctx.stroke();
      });

      // Draw dots
      landmarks.forEach((lm) => {
        this.ctx.beginPath();
        this.ctx.arc(lm.x * this.canvas.width, lm.y * this.canvas.height, 4, 0, 2 * Math.PI);
        this.ctx.fill();
      });
    }
  }

  global.OneEuroFilter = OneEuroFilter;
  global.ManagedCameraSession = ManagedCameraSession;
  global.VisionProcessor = VisionProcessor;
  global.dist3D = dist3D;
  global.computeHandData = computeHandData;
  global.PinchClutch = PinchClutch;

})(typeof window !== 'undefined' ? window : globalThis);
