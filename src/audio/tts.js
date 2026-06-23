"use strict";

/**
 * Text-to-Speech: ElevenLabs API.
 *
 * Erzeugt eine MP3-Datei aus dem Voiceover-Script.
 * Fallback: kein TTS (stumm bleiben), mit klarer Meldung.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { ensureDir } = require("../util");

const VOICES = {
  matilda: "XrExE9yKIg1WjnnlVkGX",
  rachel: "21m00Tcm4TlvDq8ikWAM",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  josh: "TxGEqnHWrfWFTfGW9XjX",
};

/**
 * ElevenLabs TTS API Call.
 * @param {object} args
 * @param {string} args.text      Voiceover-Script (gesamter Text)
 * @param {string} args.apiKey    ElevenLabs API Key
 * @param {string} [args.voice]   Voice-Name (matilda|rachel|daniel|josh)
 * @param {string} args.outPath   Ziel-Pfad für die MP3-Datei
 * @returns {Promise<string>}     Pfad zur erzeugten MP3
 */
function elevenLabsTTS({ text, apiKey, voice = "matilda", outPath }) {
  const voiceId = VOICES[voice.toLowerCase()] || VOICES.matilda;

  const body = JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.elevenlabs.io",
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = "";
        res.on("data", (d) => (errData += d));
        res.on("end", () => {
          reject(new Error(`ElevenLabs API ${res.statusCode}: ${errData.slice(0, 300)}`));
        });
        return;
      }

      ensureDir(path.dirname(outPath));
      const file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(outPath);
      });
      file.on("error", reject);
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Voiceover-Text einer einzelnen Szene (Narration bevorzugt, sonst Felder). */
function sceneNarrationText(scene) {
  if (scene.narration) return scene.narration;
  if (scene.type === "title" && scene.title) {
    return scene.title + (scene.subtitle ? ". " + scene.subtitle : "");
  }
  if (scene.type === "chapter" && scene.goal) return `Schritt ${scene.number}: ${scene.goal}`;
  if (scene.type === "cta" && scene.heading) return scene.heading;
  return "";
}

/** Engine-Kette bestimmen: explizit (cfg.audio.engine) oder auto mit Fallback. */
function resolveEngineChain(cfg) {
  const elevenKey = cfg.secrets && cfg.secrets.elevenLabsApiKey;
  const explicit = (cfg.audio && cfg.audio.engine) || "auto";
  if (explicit === "auto") return elevenKey ? ["elevenlabs", "kokoro"] : ["kokoro"];
  return [explicit];
}

function isEnglish(cfg) {
  return String((cfg && cfg.lang) || "en").toLowerCase().startsWith("en");
}

/**
 * Engine-Kette nach Sprache gefiltert. **Kokoro nur für Englisch** — das Modell
 * ist englisch-zentriert und klingt auf anderen Sprachen holprig. Für nicht-
 * englische Sprachen wird Kokoro daher aus der Kette entfernt.
 */
function effectiveEngineChain(cfg) {
  const chain = resolveEngineChain(cfg);
  if (isEnglish(cfg)) return chain;
  return chain.filter((e) => e !== "kokoro");
}

/** Warnt EINMAL, wenn nach dem Sprachfilter keine TTS-Engine übrig bleibt
 *  (z. B. nicht-englische Sprache ohne ElevenLabs/OpenAI). @returns {boolean} */
function warnIfNoEngineForLanguage(cfg, log) {
  if (effectiveEngineChain(cfg).length > 0 || resolveEngineChain(cfg).length === 0) return false;
  log.warn(
    `Kokoro spricht nur Englisch — für lang="${(cfg.lang || "").toLowerCase()}" ist kein lokaler TTS verfügbar. ` +
      `ELEVENLABS_API_KEY/OpenAI setzen oder --lang en nutzen. Video bleibt stumm.`
  );
  return true;
}

/**
 * Synthetisiert EIN Audio-Stück aus Text über die Engine-Kette (mit Fallback).
 * @returns {Promise<{path:string, engine:string}|null>} null = alle Engines fehlgeschlagen
 */
async function synthesizeSpeech({ text, cfg, audioDir, baseName, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const voice = (cfg.audio && cfg.audio.voice) || "matilda";
  const elevenKey = cfg.secrets && cfg.secrets.elevenLabsApiKey;
  const chain = effectiveEngineChain(cfg);
  ensureDir(audioDir);

  async function tryEngine(engine) {
    if (engine === "elevenlabs") {
      if (!elevenKey) throw new Error("ELEVENLABS_API_KEY fehlt");
      const out = path.join(audioDir, `${baseName}.mp3`);
      await elevenLabsTTS({ text, apiKey: elevenKey, voice, outPath: out });
      return out;
    }
    if (engine === "openai") {
      const { openaiTTS } = require("./providers/openai-speech");
      const out = path.join(audioDir, `${baseName}.mp3`);
      await openaiTTS({ text, voice, outPath: out, cfg, logger: log });
      return out;
    }
    if (engine === "kokoro") {
      const { kokoroTTS } = require("./providers/kokoro");
      const out = path.join(audioDir, `${baseName}.wav`);
      await kokoroTTS({ text, voice, outPath: out, logger: log });
      return out;
    }
    throw new Error(`Unbekannte TTS-Engine "${engine}"`);
  }

  for (let i = 0; i < chain.length; i++) {
    const engine = chain[i];
    try {
      const out = await tryEngine(engine);
      return { path: out, engine };
    } catch (err) {
      const next = chain[i + 1];
      log.warn(`TTS (${engine}) fehlgeschlagen: ${err.message}.${next ? ` Fallback → ${next}.` : ""}`);
    }
  }
  return null;
}

/**
 * Generiert Voiceover aus dem Storyboard (EIN zusammenhängendes File).
 * Bleibt als Fallback erhalten; bevorzugt wird die szenen-synchrone Variante.
 *
 * @returns {Promise<{voiceoverPath:string|null, script:string, skipped:boolean, engine?:string}>}
 */
async function generateVoiceover({ storyboard, cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  const parts = storyboard.scenes.map(sceneNarrationText).filter(Boolean);
  const script = parts.join(". ").replace(/\.\./g, ".");
  if (!script.trim()) {
    log.warn("Kein Voiceover-Text im Storyboard gefunden.");
    return { voiceoverPath: null, script: "", skipped: true };
  }
  if (warnIfNoEngineForLanguage(cfg, log)) {
    fs.writeFileSync(path.join(outDir, "voiceover-script.txt"), script, "utf-8");
    return { voiceoverPath: null, script, skipped: true };
  }

  log.info(`Voiceover-Script: ${script.length} Zeichen, ${parts.length} Abschnitte`);
  const audioDir = path.join(outDir, "audio");
  const res = await synthesizeSpeech({ text: script, cfg, audioDir, baseName: "voiceover", logger: log });
  if (res) {
    log.ok(`Voiceover: ${res.path} (${(fs.statSync(res.path).size / 1024).toFixed(0)} KB, ${res.engine})`);
    return { voiceoverPath: res.path, script, skipped: false, engine: res.engine };
  }

  fs.writeFileSync(path.join(outDir, "voiceover-script.txt"), script, "utf-8");
  return { voiceoverPath: null, script, skipped: true };
}

/**
 * Szenen-synchrones Voiceover: pro Szene ein eigener TTS-Clip, der am
 * Startzeitpunkt der Szene platziert wird. So ist die Stimme über das gesamte
 * Video verteilt (statt front-geladen) und liegt am passenden Bild.
 *
 * @returns {Promise<{clips:Array<{index:number,path:string,startSec:number}>,
 *                    script:string, skipped:boolean, engine?:string}>}
 */
async function generateTimedVoiceover({ storyboard, cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const scenes = storyboard.scenes || [];
  const audioDir = path.join(outDir, "audio");

  if (warnIfNoEngineForLanguage(cfg, log)) {
    return { clips: [], script: "", skipped: true };
  }

  const clips = [];
  const scriptParts = [];
  let acc = 0;
  let engineUsed = null;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneDur = Number(scene.duration || scene.clipDuration || 3);
    const text = sceneNarrationText(scene).trim();
    if (text) {
      const res = await synthesizeSpeech({ text, cfg, audioDir, baseName: `vo-${String(i).padStart(2, "0")}`, logger: log });
      if (res) {
        clips.push({ index: i, path: res.path, startSec: acc });
        scriptParts.push(text);
        engineUsed = res.engine;
      } else {
        // Eine Szene konnte nicht vertont werden → der Aufrufer fällt auf das
        // zusammenhängende Voiceover zurück (konsistentes Ergebnis).
        return { clips: [], script: "", skipped: true };
      }
    }
    acc += sceneDur;
  }

  if (clips.length === 0) {
    log.warn("Kein Voiceover-Text im Storyboard gefunden.");
    return { clips: [], script: "", skipped: true };
  }

  log.ok(`Szenen-Voiceover: ${clips.length} Clips (${engineUsed}), über ${acc.toFixed(0)}s verteilt.`);
  return { clips, script: scriptParts.join(". "), skipped: false, engine: engineUsed };
}

module.exports = {
  generateVoiceover,
  generateTimedVoiceover,
  synthesizeSpeech,
  sceneNarrationText,
  resolveEngineChain,
  effectiveEngineChain,
  elevenLabsTTS,
  VOICES,
};
