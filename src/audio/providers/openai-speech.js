"use strict";

/**
 * OpenAI-kompatibler TTS-Provider (BYOK / Proxy).
 *
 * Nutzt {baseUrl}/v1/audio/speech (OpenAI-Format). Funktioniert mit OpenAI
 * selbst und jedem Proxy, der diesen Endpunkt durchreicht (z. B. LiteLLM /
 * ANVIL-BELLOWS, falls dort ein TTS-Modell konfiguriert ist).
 */

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../../util");

// generische Stimmen → OpenAI-Stimmen
const VOICE_MAP = {
  matilda: "nova",
  rachel: "shimmer",
  daniel: "onyx",
  josh: "echo",
};

/**
 * @param {object} args
 * @param {string} args.text
 * @param {string} [args.voice]
 * @param {string} args.outPath   Ziel-MP3
 * @param {object} args.cfg
 * @param {object} [args.logger]
 */
async function openaiTTS({ text, voice = "matilda", outPath, cfg, logger }) {
  const log = logger || { info() {}, ok() {} };
  const o = (cfg.llm && cfg.llm.openai) || {};
  const base = (o.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/audio/speech` : `${base}/v1/audio/speech`;
  const model = (cfg.audio && cfg.audio.ttsModel) || "tts-1";
  const apiKey = cfg.secrets.llmApiKey || "";
  const oaVoice = VOICE_MAP[String(voice).toLowerCase()] || voice || "nova";

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  log.info(`OpenAI-TTS (${endpoint}, Stimme: ${oaVoice}) ...`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, voice: oaVoice, input: text, response_format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI-TTS ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, buf);
  return outPath;
}

module.exports = { openaiTTS, VOICE_MAP };
