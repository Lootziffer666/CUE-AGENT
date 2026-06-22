"use strict";

/**
 * Script-Loader: lädt ein vorgefertigtes Voiceover-/Storyboard-Script.
 *
 * Ein Script gibt dem User volle Kontrolle über Erzählung, Szenen und Timing.
 * Es ersetzt die automatische Storyboard-Generierung (Phase 1) und liefert
 * den exakten Voiceover-Text (Phase 5).
 *
 * Format (JSON):
 * {
 *   "meta": { "title", "mode", "lang", "voice", "brand", "aspect", "tone" },
 *   "scenes": [
 *     { "type": "title|features|screenshot|cta|chapter", "id", "narration",
 *       "duration", ...typspezifische Felder }
 *   ]
 * }
 */

const fs = require("fs");
const path = require("path");

const VALID_TYPES = ["title", "features", "screenshot", "cta", "chapter"];

function validateScene(scene, i) {
  if (!scene.id) throw new Error(`Script-Szene #${i}: 'id' fehlt.`);
  if (!VALID_TYPES.includes(scene.type)) {
    throw new Error(
      `Script-Szene "${scene.id}": ungültiger Typ "${scene.type}". Erlaubt: ${VALID_TYPES.join(", ")}`
    );
  }
}

/**
 * Lädt ein Script und gibt ein Storyboard + Meta zurück.
 * @param {string} filePath Pfad zur *.script.json
 * @returns {{storyboard:object, meta:object}}
 */
function loadScript(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Script-Datei nicht gefunden: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf-8"));
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error(`Script enthält keine Szenen: ${abs}`);
  }
  raw.scenes.forEach((s, i) => validateScene(s, i));

  const meta = raw.meta || {};
  const storyboard = {
    mode: meta.mode || "promo",
    source: "script",
    title: meta.title || null,
    totalScenes: raw.scenes.length,
    estimatedDuration: raw.scenes.reduce((sum, s) => sum + (s.duration || 4), 0),
    scenes: raw.scenes,
  };

  return { storyboard, meta };
}

module.exports = { loadScript, VALID_TYPES };
