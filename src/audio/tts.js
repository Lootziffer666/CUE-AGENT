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

  // Engine-Kette bestimmen: explizit (cfg.audio.engine) oder auto mit Fallback.
  //   auto: ElevenLabs (wenn Key) -> Kokoro (lokal, key-frei)
  const elevenKey = cfg.secrets && cfg.secrets.elevenLabsApiKey;
  const explicit = (cfg.audio && cfg.audio.engine) || "auto";
  let chain;
  if (explicit === "auto") chain = elevenKey ? ["elevenlabs", "kokoro"] : ["kokoro"];
  else chain = [explicit];

  const voice = (cfg.audio && cfg.audio.voice) || "matilda";
  const audioDir = path.join(outDir, "audio");
  ensureDir(audioDir);

  async function tryEngine(engine) {
    if (engine === "elevenlabs") {
      if (!elevenKey) throw new Error("ELEVENLABS_API_KEY fehlt");
      const out = path.join(audioDir, "voiceover.mp3");
      log.info(`ElevenLabs TTS (Voice: ${voice}) ...`);
      await elevenLabsTTS({ text: script, apiKey: elevenKey, voice, outPath: out });
      return out;
    }
    if (engine === "openai") {
      const { openaiTTS } = require("./providers/openai-speech");
      const out = path.join(audioDir, "voiceover.mp3");
      await openaiTTS({ text: script, voice, outPath: out, cfg, logger: log });
      return out;
    }
    if (engine === "kokoro") {
      const { kokoroTTS } = require("./providers/kokoro");
      const out = path.join(audioDir, "voiceover.wav");
      await kokoroTTS({ text: script, voice, outPath: out, logger: log });
      return out;
    }
    throw new Error(`Unbekannte TTS-Engine "${engine}"`);
  }

  for (let i = 0; i < chain.length; i++) {
    const engine = chain[i];
    try {
      const out = await tryEngine(engine);
      log.ok(`Voiceover: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${engine})`);
      return { voiceoverPath: out, script, skipped: false, engine };
    } catch (err) {
      const next = chain[i + 1];
      log.warn(`TTS (${engine}) fehlgeschlagen: ${err.message}.${next ? ` Fallback → ${next}.` : ""}`);
    }
  }

  // Alles fehlgeschlagen → Script speichern, stumm bleiben
  const scriptPath = path.join(outDir, "voiceover-script.txt");
  fs.writeFileSync(scriptPath, script, "utf-8");
  return { voiceoverPath: null, script, skipped: true };
}

module.exports = { generateVoiceover, elevenLabsTTS, VOICES };
