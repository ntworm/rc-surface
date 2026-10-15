/*
 * Copyright (c) 2025-2026 Gustavo Pinto
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */
(function (global) {
  'use strict';

  const DETECTORS = ['open', 'fist', 'pinch', 'victory'];
  const INITIAL_SLOTS = 3;
  const MAX_SLOTS = 15;

  function cleanName(value) {
    return typeof value === 'string' ? value.trim().slice(0, 32) : '';
  }

  function normalizeVisionGestureTemplates(templates) {
    if (!Array.isArray(templates)) return [];
    return templates.slice(0, MAX_SLOTS).map((template) => ({
      ...template,
      samples: Array.isArray(template?.samples) ? template.samples.slice(0, 6) : [],
    }));
  }

  class VisionControlState {
    constructor(saved = {}, gestureTemplates = []) {
      this.detectors = Object.fromEntries(DETECTORS.map((name) => [name, saved.detectors?.[name] === true]));
      const savedSlots = Array.isArray(saved.slots) ? saved.slots : [];
      const templateNames = Array.isArray(gestureTemplates)
        ? gestureTemplates.map((template) => cleanName(template?.name)).filter(Boolean)
        : [];
      const count = Math.min(MAX_SLOTS,Math.max(INITIAL_SLOTS,savedSlots.length,templateNames.length));
      this.slots = Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: cleanName(savedSlots[index]?.name) || templateNames[index] || `Gesture ${index + 1}`,
      }));
    }

    detectorEnabled(name) {
      return DETECTORS.includes(name) && this.detectors[name] === true;
    }

    setDetector(name, enabled) {
      if (!DETECTORS.includes(name)) return false;
      this.detectors[name] = enabled === true;
      return true;
    }

    setSlotName(id, name) {
      const slot = this.slots[id - 1];
      if (!slot) return null;
      slot.name = cleanName(name);
      return slot;
    }

    addSlot() {
      if (this.slots.length >= MAX_SLOTS) return null;
      const id=this.slots.length+1;
      const slot={id,name:`Gesture ${id}`};
      this.slots.push(slot);
      return slot;
    }

    slotForGesture(name) {
      const normalized = cleanName(name).toLowerCase();
      return this.slots.find((slot) => slot.name.toLowerCase() === normalized) || null;
    }

    controlForSlot(id) {
      return Number.isInteger(id) && id >= 1 && id <= this.slots.length ? `sensor.vision.gesture.${id}` : null;
    }

    describeHand(hand) {
      if (!hand?.active) return 'No hand';
      if (this.detectorEnabled('fist') && hand.fist) return 'Fist';
      if (this.detectorEnabled('pinch') && hand.pinch) return 'Pinch';
      if (this.detectorEnabled('victory') && hand.victory) return 'Victory';
      if (this.detectorEnabled('open') && hand.open) return 'Open hand';
      return 'Hand tracked';
    }

    toJSON() {
      return {
        version: 1,
        detectors: { ...this.detectors },
        slots: this.slots.map((slot) => ({ id: slot.id, name: slot.name })),
      };
    }
  }

  global.VisionControlState = VisionControlState;
  global.VISION_DETECTORS = DETECTORS.slice();
  global.VISION_MAX_LEARNED_POSES = MAX_SLOTS;
  global.normalizeVisionGestureTemplates = normalizeVisionGestureTemplates;
})(typeof window !== 'undefined' ? window : globalThis);
