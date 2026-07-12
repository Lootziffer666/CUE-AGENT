"use strict";

/**
 * Kokoro-TTS-Provider (lokal, key-frei, Apache-2.0).
 *
 * Nutzt das npm-Paket `kokoro-js` (läuft 100% lokal in Node, lädt beim
 * ersten Aufruf ein ~300MB ONNX-Modell). Kein API-Key, keine Cloud.
 *
 * Wird lazy geladen — fehlt das Paket, gibt es eine klare Anleitung.
 */

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../../util");

// Unsere generischen Stimmnamen → Kokoro-Stimmen (v1.0)
const VOICE_MAP = {
  matilda: "af_heart",
  rachel: "af_bella",
  daniel: "am_michael",
  josh: "am_adam",
};

let _ttsPromise = null;
function loadModel() {
  if (!_ttsPromise) {
    let KokoroTTS;
    try {
      ({ KokoroTTS } = require("kokoro-js"));
    } catch (_) {
      throw new Error(
        "kokoro-js ist nicht installiert. Installiere es mit: npm install kokoro-js"
      );
    }
    _ttsPromise = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
    });
  }
  return _ttsPromise;
}

/**
 * Erzeugt eine WAV-Datei aus Text.
 * @param {object} args
 * @param {string} args.text
 * @param {string} [args.voice]   generischer Stimmname (matilda|rachel|daniel|josh) oder Kokoro-Stimme
 * @param {string} args.outPath   Ziel-WAV-Pfad
 * @param {object} [args.logger]
 * @returns {Promise<string>}
 */
async function kokoroTTS({ text, voice = "matilda", outPath, logger }) {
  const log = logger || { info() {}, ok() {} };
  const kVoice = VOICE_MAP[String(voice).toLowerCase()] || voice || "af_heart";

  log.info(`Kokoro: Modell laden + generieren (Stimme: ${kVoice}) ...`);
  const tts = await loadModel();
  const audio = await tts.generate(text, { voice: kVoice });

  ensureDir(path.dirname(outPath));
  const wav = audio.toWav();
  fs.writeFileSync(outPath, Buffer.from(wav));
  return outPath;
}

module.exports = { kokoroTTS, VOICE_MAP };
