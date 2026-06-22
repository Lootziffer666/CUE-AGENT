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

/**
 * Generiert Voiceover aus dem Storyboard.
 * Kombiniert Narrations aus allen Szenen zu einem Script.
 *
 * @param {object} args
 * @param {object} args.storyboard
 * @param {object} args.cfg
 * @param {string} args.outDir
 * @param {object} [args.logger]
 * @returns {Promise<{voiceoverPath:string|null, script:string, skipped:boolean}>}
 */
async function generateVoiceover({ storyboard, cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  // Script aus Storyboard-Szenen zusammenbauen
  const parts = [];
  for (const scene of storyboard.scenes) {
    if (scene.narration) {
      parts.push(scene.narration);
    } else if (scene.type === "title" && scene.title) {
      parts.push(scene.title + (scene.subtitle ? ". " + scene.subtitle : ""));
    } else if (scene.type === "chapter" && scene.goal) {
      parts.push(`Schritt ${scene.number}: ${scene.goal}`);
    } else if (scene.type === "cta" && scene.heading) {
      parts.push(scene.heading);
    }
  }

  const script = parts.join(". ").replace(/\.\./g, ".");
  if (!script.trim()) {
    log.warn("Kein Voiceover-Text im Storyboard gefunden.");
    return { voiceoverPath: null, script: "", skipped: true };
  }

  log.info(`Voiceover-Script: ${script.length} Zeichen, ${parts.length} Abschnitte`);

  const apiKey = cfg.secrets && cfg.secrets.elevenLabsApiKey;
  if (!apiKey) {
    log.warn("ELEVENLABS_API_KEY nicht gesetzt — Voiceover wird übersprungen (stumm).");
    // Script trotzdem speichern für spätere Nutzung
    const scriptPath = path.join(outDir, "voiceover-script.txt");
    fs.writeFileSync(scriptPath, script, "utf-8");
    return { voiceoverPath: null, script, skipped: true };
  }

  const voiceoverPath = path.join(outDir, "audio", "voiceover.mp3");
  ensureDir(path.dirname(voiceoverPath));

  log.info(`ElevenLabs TTS (Voice: ${cfg.audio.voice || "matilda"}) ...`);
  try {
    await elevenLabsTTS({
      text: script,
      apiKey,
      voice: cfg.audio.voice || "matilda",
      outPath: voiceoverPath,
    });
    const stats = fs.statSync(voiceoverPath);
    log.ok(`Voiceover: ${voiceoverPath} (${(stats.size / 1024).toFixed(0)} KB)`);
    return { voiceoverPath, script, skipped: false };
  } catch (err) {
    log.warn(`ElevenLabs fehlgeschlagen: ${err.message}. Voiceover wird übersprungen.`);
    const scriptPath = path.join(outDir, "voiceover-script.txt");
    fs.writeFileSync(scriptPath, script, "utf-8");
    return { voiceoverPath: null, script, skipped: true };
  }
}

module.exports = { generateVoiceover, elevenLabsTTS, VOICES };
