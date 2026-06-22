"use strict";

/**
 * Optionale multimodale Analyse eines Screenshots über einen
 * OpenAI-kompatiblen Endpunkt — vorzugsweise den lokalen ANVIL-BELLOWS-Proxy
 * (free Gemini), per BYOK aber auch jeder andere.
 *
 * Konfiguration (ENV / Keystore):
 *   CUE_LLM_BASE_URL   z. B. http://127.0.0.1:4000/v1  (ANVIL-BELLOWS-Proxy)
 *   CUE_LLM_API_KEY    Bearer-Token (Proxy-Master-Key oder Provider-Key)
 *   CUE_LLM_MODEL      Modell-Alias, z. B. gemini/gemini-2.5-flash
 *
 * Ist nichts konfiguriert, läuft die QA im Capture-only-Modus (heuristische
 * Exploration) — die Analyse wird dann übersprungen, nichts schlägt fehl.
 */

const { URL } = require("url");
const http = require("http");
const https = require("https");

function config() {
  return {
    baseUrl: process.env.CUE_LLM_BASE_URL || "",
    apiKey: process.env.CUE_LLM_API_KEY || "",
    model: process.env.CUE_LLM_MODEL || "",
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.baseUrl && c.model);
}

function postJson(urlStr, headers, bodyObj, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const data = Buffer.from(JSON.stringify(bodyObj), "utf-8");
    const req = lib.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        headers: { "Content-Type": "application/json", "Content-Length": data.length, ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = "";
        res.on("data", (d) => (buf += d));
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("LLM request timeout")));
    req.write(data);
    req.end();
  });
}

const SYSTEM = `Du bist ein autonomer Android-QA-Tester. Du bekommst einen Screenshot der App
und eine Liste klickbarer Elemente (mit Koordinaten). Beurteile die UI auf Bugs
(abgeschnittener Text, Überlappungen, leere/kaputte Zustände, Fehlermeldungen,
fehlende Elemente) und entscheide die nächste sinnvolle Explorationsaktion.
Antworte AUSSCHLIESSLICH mit kompaktem JSON, keine Erklärtexte drumherum:
{"bug_found":bool,"severity":"none|low|medium|high","observations":"kurz",
 "next_action":{"type":"tap|back|done","x":int,"y":int,"reason":"kurz"}}`;

/**
 * @param {object} a
 * @param {Buffer} a.imageBuffer  PNG-Screenshot
 * @param {Array} a.clickables    aus adb.parseClickables
 * @param {string} a.goal         optionales Testziel
 * @returns {Promise<object|null>}  geparstes Analyse-JSON oder null (Fehler/uncfg)
 */
async function analyzeScreen({ imageBuffer, clickables = [], goal = "" }) {
  if (!isConfigured()) return null;
  const c = config();
  const base = c.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const elems = clickables
    .slice(0, 25)
    .map((e, i) => `#${i} "${e.text || e.id || e.cls}" @(${e.cx},${e.cy})`)
    .join("\n");
  const b64 = Buffer.from(imageBuffer).toString("base64");

  const payload = {
    model: c.model,
    max_tokens: 600,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: `Ziel: ${goal || "App systematisch explorieren"}\nKlickbare Elemente:\n${elems || "(keine erkannt)"}` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  };

  try {
    const headers = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
    const res = await postJson(url, headers, payload);
    if (res.status < 200 || res.status >= 300) {
      return { _error: `LLM HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    }
    const json = JSON.parse(res.body);
    const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) return { _error: "Leere LLM-Antwort" };
    // robustes JSON-Extrahieren (Modelle umrahmen gern mit ```json)
    const match = String(content).match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { observations: String(content).slice(0, 300) };
  } catch (e) {
    return { _error: e.message };
  }
}

module.exports = { isConfigured, analyzeScreen, config };
