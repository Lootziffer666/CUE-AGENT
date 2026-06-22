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

// Seitenverhältnis → Pixel-Dimensionen (Render-Canvas)
const ASPECT_DIMENSIONS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

const DEFAULTS = {
  // Sprache der Ausgaben (QA-Reports, Voiceover-Script, Captions)
  lang: "de",

  // LLM
  model: "claude-sonnet-4-20250514",
  modelLabel: "Claude Sonnet 4",
  maxTokens: 4096,

  // LLM-Provider (BYOK). Video braucht kein LLM; nur QA nutzt es (Vision).
  //   provider: "anthropic" (Default) | "openai" (OpenAI-kompatibel / LiteLLM / ANVIL-BELLOWS)
  llm: {
    provider: "anthropic",
    openai: {
      baseUrl: "https://api.openai.com", // z. B. http://localhost:4000 für ANVIL-BELLOWS
      model: "gpt-4o",
    },
  },

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
    // QA-Gate: "erst QA, dann Promo" — schützt davor, eine ungeprüfte/kaputte App zu bewerben
    gate: {
      requireForVideo: true, // Promo/Showcase/Tutorial benötigen bestandene QA (bei vorhandener URL)
      minScore: 70, // Mindest-QA-Score
      maxAgeHours: 24, // QA-Report darf max. so alt sein
      failOnSeverity: "high", // ab dieser Severity wird blockiert
    },
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
    engine: "auto", // auto | elevenlabs | kokoro | openai
    voice: "matilda",
    ttsModel: "tts-1", // nur für engine=openai
    // Toggles
    voiceover: true, // Sprachausgabe an/aus
    music: true, // Hintergrundmusik an/aus (Freesound)
    sfx: false, // Soundeffekte (Transition-Whoosh) an/aus
    // Eigene Assets importieren (haben Vorrang vor Freesound/generiert)
    musicFile: "", // Pfad zu eigener Musik (mp3/wav/...)
    sfxFile: "", // Pfad zu eigenem Transition-Soundeffekt
  },

  // Bildgenerierung (BYOK, OpenAI-kompatibel)
  image: {
    mode: "off", // off | auto  (auto: generiert Bilder für image-Szenen ohne Asset)
    baseUrl: "", // leer => nutzt llm.openai.baseUrl
    model: "gpt-image-1",
    size: "1024x1024",
    theme: "", // globales Thema für Auto-Generierung
  },

  // Medienordner (Referenzen / eigene Assets)
  mediaDir: "media",
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

  // LLM-Provider per Env (BYOK)
  const llm = {};
  if (process.env.CUE_LLM_PROVIDER) llm.provider = process.env.CUE_LLM_PROVIDER;
  const openai = {};
  if (process.env.CUE_LLM_BASE_URL) openai.baseUrl = process.env.CUE_LLM_BASE_URL;
  if (process.env.CUE_LLM_MODEL) openai.model = process.env.CUE_LLM_MODEL;
  if (Object.keys(openai).length) llm.openai = openai;
  if (Object.keys(llm).length) env.llm = llm;

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
  // Bei Installation in ein fremdes Repo sollen Ausgaben (qa-reports/,
  // video-projects/) im Arbeitsverzeichnis des Nutzers landen — nicht im
  // Installationsordner. Daher: Projekt-Root = aktuelles Arbeitsverzeichnis.
  const root = overrides.root || process.cwd();

  let cfg = deepMerge(DEFAULTS, {});
  cfg = deepMerge(cfg, readConfigFile(root));
  cfg = deepMerge(cfg, fromEnv());
  cfg = deepMerge(cfg, overrides);

  cfg.lang = normalizeLang(cfg.lang);
  if (!SUPPORTED_ASPECTS.includes(cfg.video.aspect)) {
    cfg.video.aspect = "16:9";
  }

  // Viewport aus Aspect ableiten (Render-Canvas), außer explizit überschrieben
  if (!overrides.viewport) {
    cfg.viewport = { ...ASPECT_DIMENSIONS[cfg.video.aspect] };
  }

  // Secrets niemals in cue.config.json — nur aus der Umgebung
  // Unterstützt verschiedene Variablennamen (ELEVENLABS_API_KEY, "ElevenLabs API", etc.)
  cfg.secrets = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    // LLM-Key für OpenAI-kompatible Provider (eigener Proxy/OpenAI). Reihenfolge:
    // CUE_LLM_API_KEY -> OPENAI_API_KEY -> LITELLM_MASTER_KEY (ANVIL-BELLOWS)
    llmApiKey:
      process.env.CUE_LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.LITELLM_MASTER_KEY ||
      "",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || process.env["ElevenLabs API"] || process.env.ELEVENLABS_KEY || "",
    freesoundApiKey: process.env.FREESOUND_API_KEY || process.env["Freesound API"] || "",
    // Bild-API-Key (eigener, sonst Fallback auf llmApiKey)
    imageApiKey: process.env.CUE_IMAGE_API_KEY || process.env.OPENAI_API_KEY || "",
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

/**
 * Prüft, ob für den aktiven LLM-Provider gültige Credentials vorliegen.
 * - anthropic: gültiger ANTHROPIC_API_KEY
 * - openai:    Base-URL gesetzt; Key optional (offene lokale Proxys brauchen keinen)
 * @returns {{ok:boolean, provider:string, reason:string}}
 */
function hasValidLlmCredentials(cfg) {
  const provider = (cfg.llm && cfg.llm.provider) || "anthropic";
  if (provider === "anthropic") {
    const ok = hasValidAnthropicKey(cfg);
    return {
      ok,
      provider,
      reason: ok ? "ANTHROPIC_API_KEY gesetzt" : "ANTHROPIC_API_KEY fehlt/Platzhalter",
    };
  }
  // openai-kompatibel
  const baseUrl = cfg.llm && cfg.llm.openai && cfg.llm.openai.baseUrl;
  if (!baseUrl) {
    return { ok: false, provider, reason: "CUE_LLM_BASE_URL fehlt" };
  }
  return {
    ok: true,
    provider,
    reason: `OpenAI-kompatibel: ${baseUrl} (Modell ${cfg.llm.openai.model})`,
  };
}

module.exports = {
  loadConfig,
  hasValidAnthropicKey,
  hasValidLlmCredentials,
  DEFAULTS,
  SUPPORTED_LANGS,
  SUPPORTED_ASPECTS,
  ASPECT_DIMENSIONS,
};
