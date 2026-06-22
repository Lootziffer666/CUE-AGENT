"use strict";

/**
 * Config- und Env-Loader für CUE-AGENT.
 *
 * Auflösungs-Reihenfolge (später überschreibt früher):
 *   1. eingebaute Defaults
 *   2. cue.config.json im Projekt-Root (optional)
 *   3. Umgebungsvariablen / .env
 *   4. CLI-Overrides (per Argument an loadConfig übergeben)
 */

const fs = require("fs");
const path = require("path");

// .env laden (still, falls dotenv fehlt)
try {
  require("dotenv").config();
} catch (_) {
  /* dotenv optional */
}

const ROOT = path.resolve(__dirname, "..", "..");

const SUPPORTED_LANGS = ["de", "en"];
const SUPPORTED_ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

const DEFAULTS = {
  // Sprache der Ausgaben (QA-Reports, Voiceover-Script, Captions)
  lang: "de",

  // LLM
  model: "claude-sonnet-4-20250514",
  modelLabel: "Claude Sonnet 4",
  maxTokens: 4096,

  // Capture / Browser
  viewport: { width: 1920, height: 1080 },
  navTimeoutMs: 30000,
  settleMs: 2000,

  // Ausgabe-Verzeichnisse (relativ zum Projekt-Root)
  paths: {
    qaReports: "qa-reports",
    videoProjects: "video-projects",
  },

  // QA-Gate / Severity (Grundlage; wird in späteren Meilensteinen erweitert)
  qa: {
    failOn: "none", // none | low | medium | high  -> Exit-Code != 0 ab dieser Stufe
  },

  // Video / Promo
  video: {
    aspect: "16:9",
    durationSec: 60,
    fps: 30,
    renderer: "builtin", // builtin | hyperframes
  },

  // Audio
  audio: {
    voice: "matilda",
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (
      ov &&
      typeof ov === "object" &&
      !Array.isArray(ov) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(base[key], ov);
    } else if (ov !== undefined) {
      out[key] = ov;
    }
  }
  return out;
}

function readConfigFile(root) {
  const file = path.join(root, "cue.config.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    throw new Error(`cue.config.json ist kein gültiges JSON: ${err.message}`);
  }
}

function fromEnv() {
  const env = {};
  if (process.env.CUE_LANG) env.lang = process.env.CUE_LANG;
  if (process.env.CUE_MODEL) env.model = process.env.CUE_MODEL;
  return env;
}

function normalizeLang(lang) {
  const l = String(lang || "").toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.includes(l) ? l : "de";
}

/**
 * Lädt die effektive Konfiguration.
 * @param {object} [overrides] CLI-Overrides (z. B. { lang, video: { aspect } })
 * @returns {object} aufgelöste Config inkl. Secrets und absoluter Pfade
 */
function loadConfig(overrides = {}) {
  const root = overrides.root || ROOT;

  let cfg = deepMerge(DEFAULTS, {});
  cfg = deepMerge(cfg, readConfigFile(root));
  cfg = deepMerge(cfg, fromEnv());
  cfg = deepMerge(cfg, overrides);

  cfg.lang = normalizeLang(cfg.lang);
  if (!SUPPORTED_ASPECTS.includes(cfg.video.aspect)) {
    cfg.video.aspect = "16:9";
  }

  // Secrets niemals in cue.config.json — nur aus der Umgebung
  // Unterstützt verschiedene Variablennamen (ELEVENLABS_API_KEY, "ElevenLabs API", etc.)
  cfg.secrets = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || process.env["ElevenLabs API"] || process.env.ELEVENLABS_KEY || "",
    freesoundApiKey: process.env.FREESOUND_API_KEY || process.env["Freesound API"] || "",
  };

  cfg.targetUrl = overrides.targetUrl || process.env.TARGET_URL || "";

  // absolute Pfade
  cfg.root = root;
  cfg.absPaths = {
    qaReports: path.join(root, cfg.paths.qaReports),
    videoProjects: path.join(root, cfg.paths.videoProjects),
  };

  return cfg;
}

function hasValidAnthropicKey(cfg) {
  const k = cfg.secrets.anthropicApiKey;
  return Boolean(k) && !k.startsWith("sk-ant-api03-your-key");
}

module.exports = {
  loadConfig,
  hasValidAnthropicKey,
  DEFAULTS,
  SUPPORTED_LANGS,
  SUPPORTED_ASPECTS,
};
