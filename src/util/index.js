"use strict";

/**
 * Gemeinsame Helfer: Logging, Dateisystem, Zeitstempel, Slugs.
 */

const fs = require("fs");
const path = require("path");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "site";
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  return file;
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf-8");
  return file;
}

// einfacher, präfixierter Logger
function makeLogger(prefix = "CUE") {
  const tag = `[${prefix}]`;
  return {
    info: (...a) => console.log(tag, ...a),
    warn: (...a) => console.warn(tag, ...a),
    error: (...a) => console.error(tag, ...a),
    ok: (...a) => console.log(`${tag} \u2713`, ...a),
  };
}

/**
 * Chromium-Executable robust auflösen: Playwrights eigener Pfad, sonst
 * CUE_CHROMIUM/CHROMIUM-Env, sonst gängige System-Symlinks (z. B.
 * /opt/pw-browsers/chromium in vorinstallierten CI-/Sandbox-Umgebungen).
 * Gibt `undefined` zurück, wenn Playwrights Default gültig ist (kein Override).
 */
function resolveChromiumExecutable(chromium) {
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return undefined; // Default funktioniert
  } catch {
    // weiter mit Fallbacks
  }
  const candidates = [
    process.env.CUE_CHROMIUM,
    process.env.CHROMIUM,
    "/opt/pw-browsers/chromium",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

module.exports = { timestamp, ensureDir, slugify, writeJson, writeText, makeLogger, resolveChromiumExecutable };
