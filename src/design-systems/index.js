"use strict";

/**
 * Design-System Registry.
 * Liefert Brand-Presets für die Video-Pipeline.
 */

const vercel = require("./vercel");

const PRESETS = {
  vercel,
};

function getPreset(name) {
  const key = String(name || "vercel").toLowerCase();
  if (!PRESETS[key]) {
    throw new Error(
      `Design-Preset "${name}" nicht gefunden. Verfügbar: ${Object.keys(PRESETS).join(", ")}`
    );
  }
  return PRESETS[key];
}

function listPresets() {
  return Object.keys(PRESETS);
}

module.exports = { getPreset, listPresets };
