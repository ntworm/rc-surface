// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// This file is part of RC Surface, distributed under the
// PolyForm Noncommercial License 1.0.0. You may obtain a copy of
// the License at https://polyformproject.org/licenses/noncommercial/1.0.0
//
// audio-processor.js
//
// Continuous descriptors run in a small dedicated AudioWorklet. Only amplitude
// and the compatibility analyser use requestAnimationFrame in normal capture.
// The former full-worklet migration (9f44000) failed from a shadowed
// sampleRate identifier on Samsung S25F. It is not restored here: the new
// descriptor-only worklet uses explicit global clock/rate and a tested
// compatibility analyser. Voice-call DSP remains disabled.
//
// Every active `sensor.audio.*` control keeps the same field.

(function (global) {
  'use strict';

  const GATE_THRESHOLD = 0.015;
  const SCRIPT_URL = global.document?.currentScript?.src;
  const ZERO_DESCRIPTORS = Object.freeze({ transient: 0, kick: 0, snare: 0, brightness: 0,
    centroid: 0, flux: 0, flatness: 0, spread: 0, rolloff: 0, low: 0, mid: 0, high: 0 });
  const DEFAULT_ANALYSIS_SETTINGS = {
    gateThreshold: GATE_THRESHOLD,
  };

  class AudioProcessor {
    constructor() {
      this.audioContext = null;
      this.captureGeneration = 0;
      this.analyser = null;
      this.descriptorAnalyser = null;
      this.stream = null;
      this.animationId = null;
      this.onAnalysisUpdate = null; // Amplitude and descriptor snapshot.
      this.onDescriptorUpdate = null; // Immediate mapping path; runs before amplitude/visual analysis.
      this.sampleBuffer = null;
      this.descriptorTimeBuffer = null;
      this.descriptorFrequencyBuffer = null;
      this.spectralAnalyser = null;
      this.spectralFrequencyBuffer = null;
      this.spectralProcessor = global.AudioSpectralDescriptors?.createProcessor?.() ?? null;
      this.descriptorSettings = global.AudioDescriptors?.normalizeSettings?.() ?? null;
      this.descriptorSmoother = global.AudioDescriptors?.createSmoother?.() ?? null;
      this.lastDescriptorFrameMs = null;
      this.descriptorProcessor = global.AudioDescriptors?.createProcessor?.(this.descriptorSettings) ?? null;
      this.descriptorNode = null;
      this.descriptorMode = 'off';
      this.descriptorEpoch = 0;
      this.lastDescriptorValues = { ...ZERO_DESCRIPTORS };
      this.onDescriptorModeChange = null;
      this.onCaptureEnded = null;

      // Envelope follower state — asymmetric attack/release.
      this.envelope = 0;
      this.lastRms = 0;

      const controls = global.AudioAnalysisControls;
      this.analysisSettings = controls
        ? controls.sanitizeSettings()
        : { ...DEFAULT_ANALYSIS_SETTINGS };
      this.gateDetector = controls
        ? new controls.HystereticGate(this.analysisSettings.gateThreshold)
        : null;
      this.onsetGate = controls
        ? new controls.OnsetGate({ sensitivity: this.analysisSettings.onsetSensitivity })
        : null;
      this.velocityWindow = controls
        ? new controls.VelocityWindow({
          windowMs: this.analysisSettings.velocityWindowMs,
          rangeDb: this.analysisSettings.velocityRangeDb,
        })
        : null;
      this.attackLevel = 0;
    }

    /**
      * Detector settings are browser-side shaping: how much change reads as an
      * attack, how long it takes to fall, how the range is curved, how much
      * each group is smoothed and how wide the analysis window is.
      */
    setDescriptorSettings(settings) {
      const descriptors = global.AudioDescriptors;
      if (!descriptors?.normalizeSettings) return this.descriptorSettings;
      const previous = this.descriptorSettings;
      const clean = descriptors.normalizeSettings(settings, previous ?? undefined);
      this.descriptorSettings = clean;
      this.descriptorProcessor?.setSettings?.(clean);
      this.descriptorNode?.port.postMessage({ type: 'settings', settings: clean });
      if (previous && clean.window !== previous.window) {
        // The compatibility analyser owns its own FFT size, so it has to be
        // rebuilt for a new window; the worklet rebuilds its own plan.
        this._sizeDescriptorAnalysers();
        this.descriptorSmoother?.reset();
      }
      return clean;
    }

    _sizeDescriptorAnalysers() {
      if (!this.audioContext || !this.descriptorAnalyser || !this.spectralAnalyser) return;
      let hop = 256;
      while (this.audioContext.sampleRate / hop > 120) hop *= 2;
      hop *= this.descriptorSettings?.window ?? 1;
      this.descriptorAnalyser.fftSize = hop;
      this.descriptorTimeBuffer = new Float32Array(this.descriptorAnalyser.fftSize);
      this.descriptorFrequencyBuffer = new Float32Array(this.descriptorAnalyser.frequencyBinCount);
      this.spectralAnalyser.fftSize = Math.min(32768, hop * 2);
      this.spectralFrequencyBuffer = new Float32Array(this.spectralAnalyser.frequencyBinCount);
    }

    setAnalysisSettings(settings) {
      const controls = global.AudioAnalysisControls;
      const clean = controls
        ? controls.sanitizeSettings({ ...this.analysisSettings, ...(settings || {}) })
        : {
            gateThreshold: Number.isFinite(settings?.gateThreshold) ? settings.gateThreshold : this.analysisSettings.gateThreshold,
          };
      this.analysisSettings = clean;
      if (!this.gateDetector && controls) this.gateDetector = new controls.HystereticGate(clean.gateThreshold);
      this.gateDetector?.setThreshold(clean.gateThreshold);
      if (!this.onsetGate && controls) this.onsetGate = new controls.OnsetGate({ sensitivity: clean.onsetSensitivity });
      this.onsetGate?.setSensitivity(clean.onsetSensitivity);
      if (!this.velocityWindow && controls) {
        this.velocityWindow = new controls.VelocityWindow({
          windowMs: clean.velocityWindowMs, rangeDb: clean.velocityRangeDb,
        });
      }
      this.velocityWindow?.setWindowMs(clean.velocityWindowMs);
      this.velocityWindow?.setRangeDb(clean.velocityRangeDb);
      return { ...clean };
    }

    async start(deviceId = '') {
      if (this.audioContext) return;
      const generation = ++this.captureGeneration;

      try {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio API is not available in this browser');
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });

        // Request unprocessed capture; the browser/driver may still resample.
        const stream = await global.navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
        if (generation !== this.captureGeneration) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.stream = stream;
        for (const track of stream.getTracks()) {
          track.addEventListener?.('ended', () => {
            if (generation !== this.captureGeneration || this.stream !== stream) return;
            this.stop();
            this.onCaptureEnded?.();
          }, { once: true });
        }
        const source = this.audioContext.createMediaStreamSource(this.stream);

        // The performance descriptors own a short window, independent from
        // the amplitude display analyser. At 48 kHz this is 10.7 ms
        // (11.6 ms at 44.1 kHz); Web Audio/browser/network/Live scheduling is
        // outside that structural budget and is not guaranteed here.
        this.descriptorAnalyser = this.audioContext.createAnalyser();
        this.descriptorAnalyser.smoothingTimeConstant = 0;
        this.descriptorProcessor = global.AudioDescriptors?.createProcessor?.(this.descriptorSettings) ?? null;
        source.connect(this.descriptorAnalyser);
        this.spectralAnalyser = this.audioContext.createAnalyser();
        this.spectralAnalyser.smoothingTimeConstant = 0;
        source.connect(this.spectralAnalyser);
        this._sizeDescriptorAnalysers();
        await this._startDescriptorWorklet(source, generation);
        if (generation !== this.captureGeneration) return false;

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.sampleBuffer = new Float32Array(this.analyser.fftSize);

        source.connect(this.analyser);

        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        if (generation !== this.captureGeneration) return false;

        this._startAnalysisLoop();
        return true;
      } catch (err) {
        if (generation !== this.captureGeneration) return false;
        console.error('AudioProcessor start failed:', err);
        this.stop();
        throw err;
      }
    }

    stop() {
      this.captureGeneration += 1;
      if (this.descriptorNode) {
        this.descriptorNode.port.postMessage({ type: 'stop' });
        this.descriptorNode.port.onmessage = null;
        this.descriptorNode.onprocessorerror = null;
        this.descriptorNode.port.close();
        this.descriptorNode.disconnect();
        this.descriptorNode = null;
      }
      this.descriptorMode = 'off';
      this.onDescriptorModeChange?.('off');
      if (this.animationId) {
        global.cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      this.descriptorAnalyser?.disconnect?.();
      this.spectralAnalyser?.disconnect?.();
      this.resetDescriptors();
      this.descriptorAnalyser = null;
      this.descriptorTimeBuffer = null;
      this.descriptorFrequencyBuffer = null;
      this.spectralAnalyser = null;
      this.spectralFrequencyBuffer = null;
      this.analyser = null;
      this.sampleBuffer = null;
      this.envelope = 0;
      this.lastRms = 0;
      this.gateDetector?.reset();
      this.onsetGate?.reset();
      this.velocityWindow?.reset();
      this.attackLevel = 0;
    }

    resetDescriptors() {
      this.descriptorProcessor?.reset?.();
      this.spectralProcessor?.reset?.();
      this.descriptorSmoother?.reset?.();
      this.lastDescriptorFrameMs = null;
      this.lastDescriptorValues = { ...ZERO_DESCRIPTORS };
      this.descriptorEpoch += 1;
      this.descriptorNode?.port.postMessage({ type: 'reset', epoch: this.descriptorEpoch });
    }

    async _startDescriptorWorklet(source, generation) {
      const context = this.audioContext;
      const fallback = () => {
        if (generation !== this.captureGeneration) return;
        if (this.descriptorNode) {
          try { source.disconnect?.(this.descriptorNode); } catch { /* partially connected node */ }
          this.descriptorNode.port.onmessage = null;
          this.descriptorNode.onprocessorerror = null;
          this.descriptorNode.port.close();
          this.descriptorNode.disconnect();
          this.descriptorNode = null;
        }
        this.resetDescriptors();
        this.descriptorMode = 'compatibility';
        this.onDescriptorModeChange?.('compatibility');
      };
      if (!context.audioWorklet?.addModule || !global.AudioWorkletNode) {
        fallback();
        return;
      }
      try {
        const url = new URL('audio-descriptor-worklet.js', SCRIPT_URL || global.location.href).href;
        await context.audioWorklet.addModule(url);
        if (generation !== this.captureGeneration) return;
        const node = new global.AudioWorkletNode(context, 'rc-audio-descriptors', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          channelCount: 1, channelCountMode: 'explicit',
          processorOptions: { settings: this.descriptorSettings },
        });
        this.descriptorNode = node;
        this.descriptorEpoch = 0;
        node.port.onmessage = ({ data }) => {
          if (generation !== this.captureGeneration || node !== this.descriptorNode) return;
          node.port.postMessage({ type: 'ack', epoch: data?.epoch });
          const ageMs = context.currentTime * 1000 - data?.frameTimeMs;
          if (data?.epoch !== this.descriptorEpoch || !Number.isFinite(ageMs)
            || ageMs > 40 || ageMs < -20 || context.state !== 'running'
            || this.stream?.getTracks().some((track) => track.muted || track.readyState === 'ended')) return;
          const values = {};
          for (const name of Object.keys(ZERO_DESCRIPTORS)) {
            const value = data.values?.[name];
            if (!Number.isFinite(value) || value < 0 || value > 1) return;
            values[name] = value;
          }
          this.lastDescriptorValues = values;
          this.onDescriptorUpdate?.(values);
        };
        node.onprocessorerror = fallback;
        source.connect(node);
        // Worklet writes zeros only. This keeps processing pulled without
        // monitoring the microphone or creating feedback.
        node.connect(context.destination);
        this.descriptorMode = 'worklet';
        this.onDescriptorModeChange?.('worklet');
      } catch (error) {
        console.warn('Audio descriptors using compatibility capture:', error);
        fallback();
      }
    }

    _startAnalysisLoop() {
      const analyze = () => {
        if (!this.analyser) return;
        // Suspended contexts and muted/ended tracks expose stale analyser
        // buffers. Refrain from refreshing the application's loss watchdog
        // until actual capture resumes; it releases the mapping and DSP state.
        if ((this.audioContext && this.audioContext.state !== 'running')
          || this.stream?.getTracks().some((track) => track.muted || track.readyState === 'ended')) {
          this.animationId = global.requestAnimationFrame(analyze);
          return;
        }

        const frameTimeMs = (global.performance && global.performance.now)
          ? global.performance.now()
          : Date.now();
        let descriptorValues = this.lastDescriptorValues;
        if (this.descriptorMode !== 'worklet' && this.descriptorAnalyser
          && this.descriptorTimeBuffer
          && this.descriptorFrequencyBuffer
          && this.descriptorProcessor) {
          // This read and calculation intentionally precede amplitude analysis.
          // Amplitude settings do not participate in descriptor values.
          this.descriptorAnalyser.getFloatTimeDomainData(this.descriptorTimeBuffer);
          this.descriptorAnalyser.getFloatFrequencyData(this.descriptorFrequencyBuffer);
          descriptorValues = this.descriptorProcessor.process({
            timeDomain: this.descriptorTimeBuffer,
            frequencyDb: this.descriptorFrequencyBuffer,
            sampleRate: this.audioContext.sampleRate,
            fftSize: this.descriptorAnalyser.fftSize,
            frameTimeMs,
          });
          if (this.spectralAnalyser && this.spectralProcessor) {
            this.spectralAnalyser.getFloatFrequencyData(this.spectralFrequencyBuffer);
            const elapsedMs = this.lastDescriptorFrameMs === null
              ? 0 : frameTimeMs - this.lastDescriptorFrameMs;
            Object.assign(descriptorValues, this.spectralProcessor.process({
              frequencyDb: this.spectralFrequencyBuffer, sampleRate: this.audioContext.sampleRate,
              fftSize: this.spectralAnalyser.fftSize,
              // Web Audio's Blackman window: mean squared coefficient .3046.
              powerCorrection: 1 / 0.3046,
              elapsedMs,
            }));
          }
          const elapsedMs = this.lastDescriptorFrameMs === null
            ? 0 : frameTimeMs - this.lastDescriptorFrameMs;
          this.lastDescriptorFrameMs = frameTimeMs;
          this.descriptorSmoother?.apply(descriptorValues, elapsedMs, this.descriptorSettings);
          this.lastDescriptorValues = descriptorValues;
          this.onDescriptorUpdate?.(descriptorValues);
        }

        this.analyser.getFloatTimeDomainData(this.sampleBuffer);

        // 1. RMS (volume envelope).
        const rms = this._calculateRMS(this.sampleBuffer);
        const gateVal = this.gateDetector
          ? (this.gateDetector.update(rms) ? 1 : 0)
          : (rms > GATE_THRESHOLD ? 1 : 0);

        // 4. Advanced envelope follower — asymmetric attack/release.
        if (rms > this.envelope) {
          this.envelope = this.envelope * 0.2 + rms * 0.8;
        } else {
          this.envelope = this.envelope * 0.85 + rms * 0.15;
        }
        const envelopeVal = parseFloat(this.envelope.toFixed(3));

        const transientVal = descriptorValues.transient;

        // Was there an attack on this frame? Read as an edge, and read every
        // frame so the gate stays armed whether or not anything uses it.
        const houveOnset = this.onsetGate
          ? this.onsetGate.update(transientVal, frameTimeMs)
          : false;

        if (this.velocityWindow) {
          if (houveOnset) {
            this.velocityWindow.open(frameTimeMs);
          }
          this.velocityWindow.update(rms, frameTimeMs);
          const settled = this.velocityWindow.value();
          if (settled !== null) this.attackLevel = settled;
        }

        this.lastRms = rms;

        if (this.onAnalysisUpdate) {
          this.onAnalysisUpdate({
            rms: parseFloat(rms.toFixed(3)),
            envelope: envelopeVal,
            ...descriptorValues,
            attack: parseFloat((this.attackLevel ?? 0).toFixed(3)),
            gate: gateVal,
            gateThreshold: this.analysisSettings.gateThreshold,
          });
        }

        this.animationId = global.requestAnimationFrame(analyze);
      };

      this.animationId = global.requestAnimationFrame(analyze);
    }

    _calculateRMS(buffer) {
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        sum += v * v;
      }
      return Math.sqrt(sum / buffer.length);
    }

  }

  AudioProcessor.GATE_THRESHOLD = GATE_THRESHOLD;

  global.AudioProcessor = AudioProcessor;

})(typeof window !== 'undefined' ? window : globalThis);
