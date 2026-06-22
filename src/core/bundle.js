"use strict";

/**
 * CaptureBundle: persistierbare, validierbare JSON-Darstellung eines Capture-Laufs.
 *
 * Liest, schreibt und validiert Bundles. QA und Video-Pipeline konsumieren
 * dasselbe Format, aber mit eigenem `intent`.
 */

const fs = require("fs");
const path = require("path");
const { writeJson, ensureDir } = require("../util");

/**
 * Minimale Schema-Validierung (keine externe Lib nötig).
 */
function validateBundle(bundle) {
  const errors = [];
  if (!bundle.intent) errors.push("'intent' fehlt (qa|promo|tutorial)");
  if (!bundle.url) errors.push("'url' fehlt");
  if (!bundle.capturedAt) errors.push("'capturedAt' fehlt");
  if (!bundle.viewport) errors.push("'viewport' fehlt");
  if (!Array.isArray(bundle.flow)) errors.push("'flow' muss ein Array sein");
  if (errors.length > 0) {
    throw new Error(`CaptureBundle ungültig:\n  - ${errors.join("\n  - ")}`);
  }
  return true;
}

/**
 * Schreibt ein CaptureBundle als JSON.
 * @param {object} result  Roh-Ergebnis aus capture()
 * @param {string} outDir  Verzeichnis (z. B. qa-reports/ oder video-projects/<slug>/)
 * @param {object} [extra] zusätzliche Felder (z. B. qaGate für Promo)
 * @returns {string} Pfad zur geschriebenen Datei
 */
function writeBundle(result, outDir, extra = {}) {
  ensureDir(outDir);
  const bundle = { ...result, ...extra };
  validateBundle(bundle);
  const filename = `${bundle.intent}-bundle.json`;
  const filepath = path.join(outDir, filename);
  writeJson(filepath, bundle);
  return filepath;
}

/**
 * Liest und validiert ein vorhandenes CaptureBundle.
 * @param {string} filepath absoluter Pfad
 * @returns {object} validiertes Bundle
 */
function readBundle(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`CaptureBundle nicht gefunden: ${filepath}`);
  }
  const bundle = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  validateBundle(bundle);
  return bundle;
}

module.exports = { writeBundle, readBundle, validateBundle };
