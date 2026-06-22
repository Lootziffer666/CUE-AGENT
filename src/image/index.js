"use strict";

/**
 * Bild-Generierungs-Provider (BYOK).
 *
 * Default: openai-kompatibel (`/v1/images/generations`) — funktioniert mit
 * OpenAI selbst und jedem Proxy, der den Endpunkt durchreicht (z. B. dein
 * ANVIL-BELLOWS, falls dort ein Bildmodell konfiguriert ist).
 *
 * Liefert PNG-Dateien in einen Zielordner. Saubere Degradation, wenn kein
 * Provider/Key verfügbar ist.
 */

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../util");

function imageProviderAvailable(cfg) {
  const img = (cfg.image && cfg.image) || {};
  const baseUrl = (img.baseUrl) || (cfg.llm && cfg.llm.openai && cfg.llm.openai.baseUrl);
  return Boolean(baseUrl);
}

/**
 * Erzeugt ein Bild aus einem Text-Prompt und speichert es als PNG.
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} args.outPath   Ziel-PNG
 * @param {object} args.cfg
 * @param {object} [args.logger]
 * @returns {Promise<string>} outPath
 */
async function generateImage({ prompt, outPath, cfg, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const img = (cfg.image) || {};
  const base = (img.baseUrl || (cfg.llm && cfg.llm.openai && cfg.llm.openai.baseUrl) || "https://api.openai.com").replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/images/generations` : `${base}/v1/images/generations`;
  const model = img.model || "gpt-image-1";
  const size = img.size || "1024x1024";
  const apiKey = cfg.secrets.imageApiKey || cfg.secrets.llmApiKey || "";

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  log.info(`Bild generieren (${model}, ${size}) ...`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Image-API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const item = data.data && data.data[0];
  if (!item) throw new Error("Image-API: leere Antwort");

  ensureDir(path.dirname(outPath));
  if (item.b64_json) {
    fs.writeFileSync(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(outPath, buf);
  } else {
    throw new Error("Image-API: weder b64_json noch url");
  }
  return outPath;
}

module.exports = { generateImage, imageProviderAvailable };
