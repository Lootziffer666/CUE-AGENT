"use strict";

/**
 * LLM-Proposer für den Design-Iterations-Loop.
 *
 * Bekommt Screenshot + Abweichungsliste + Ziel-Spec und schlägt KONKRETE
 * CSS-Overrides vor (als JSON: [{selector, css:{prop:value}}]). Läuft über
 * einen OpenAI-kompatiblen Endpunkt — vorzugsweise den ANVIL-BELLOWS-Proxy
 * (free, multimodal):
 *   CUE_LLM_BASE_URL  z. B. http://127.0.0.1:4000/v1
 *   CUE_LLM_API_KEY   Bearer-Token
 *   CUE_LLM_MODEL     z. B. gemini/gemini-2.5-flash
 *
 * Ohne Konfiguration → null (der Loop stoppt sauber, kein Fehler).
 */

const { URL } = require("url");
const http = require("http");
const https = require("https");

function cfg() {
  return {
    baseUrl: process.env.CUE_LLM_BASE_URL || "",
    apiKey: process.env.CUE_LLM_API_KEY || "",
    model: process.env.CUE_LLM_MODEL || "",
  };
}
function isConfigured() {
  const c = cfg();
  return Boolean(c.baseUrl && c.model);
}

function postJson(urlStr, headers, body, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const data = Buffer.from(JSON.stringify(body), "utf-8");
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

const SYSTEM = `Du bist ein präziser Frontend-Entwickler. Du bekommst einen Screenshot der
aktuellen Web-UI, die Ziel-Spezifikation (Soll-Elemente mit Selector, Ziel-BBox in px,
Ziel-Text, Ziel-Farbe) und eine Abweichungsliste. Schlage MINIMALE CSS-Overrides vor,
die die Ist-UI an die Vorgabe heranführen. Nutze nur sichere, deterministische
Properties (left/top/width/height/background/color/border-radius/padding/font-size).
Antworte AUSSCHLIESSLICH mit JSON, ohne Erklärtext:
[{"selector":"#id-oder-css","css":{"background":"#2563EB","left":"40px"}}]`;

/**
 * @returns {Promise<Array<{selector:string,css:object}>|null>}
 */
async function proposeEdits({ spec, screenshotB64, deviations }) {
  if (!isConfigured()) return null;
  const c = cfg();
  const url = `${c.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const targets = (spec.elements || []).map((e) => ({
    selector: e.selector || (e.id ? `#${e.id}` : null),
    bbox: e.bbox,
    text: e.text,
    color: e.color,
  }));

  const content = [
    {
      type: "text",
      text:
        `Ziel-Spezifikation:\n${JSON.stringify(targets, null, 0)}\n\n` +
        `Abweichungen (Ist vs. Soll):\n${JSON.stringify(deviations, null, 0)}\n\n` +
        `Gib MINIMALE CSS-Overrides als JSON-Array zurück.`,
    },
  ];
  if (screenshotB64) {
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${screenshotB64}` } });
  }

  try {
    const headers = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
    const res = await postJson(url, headers, {
      model: c.model,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    });
    if (res.status < 200 || res.status >= 300) return null;
    const json = JSON.parse(res.body);
    const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!text) return null;
    const m = String(text).match(/\[[\s\S]*\]/);
    if (!m) return null;
    const edits = JSON.parse(m[0]);
    return Array.isArray(edits) ? edits.filter((e) => e && e.selector && e.css) : null;
  } catch (_) {
    return null;
  }
}

module.exports = { proposeEdits, proposeAndroidEdits, isConfigured };

// ── Android-Proposer ────────────────────────────────────────────────────────
// Web-Edits sind Live-CSS-Overrides; native Android-Edits sind Quelltext-Patches
// (Layout-XML/Compose) → rebuild. Der Proposer bekommt die Abweichungen UND die
// relevanten Quelldateien und schlägt LITERALE find/replace-Patches vor.
// Format: [{"file","find","replace"}]. Ohne LLM-Konfig → null (Loop stoppt sauber).
const SYSTEM_ANDROID = `Du bist ein präziser Android-UI-Entwickler. Du bekommst die Ziel-Spezifikation
(Soll-Elemente: id/text, Ziel-BBox in px, Ziel-Text, Ziel-Farbe), eine Abweichungsliste
und Ausschnitte der relevanten Quelldateien (Layout-XML oder Jetpack-Compose).
Schlage MINIMALE, literale Quelltext-Patches vor, die die UI an die Vorgabe heranführen
(z. B. layout_marginTop, layout_width/height, textSize, Farben, android:text).
Jeder Patch ersetzt einen EINDEUTIGEN Textausschnitt der genannten Datei.
Antworte AUSSCHLIESSLICH mit JSON, ohne Erklärtext:
[{"file":"app/src/main/res/layout/activity_main.xml","find":"android:layout_marginTop=\\"8dp\\"","replace":"android:layout_marginTop=\\"24dp\\""}]`;

/**
 * @param {object} a
 * @param {object}   a.spec        Baseline-Spec
 * @param {Array}    a.deviations  Abweichungen aus dem Comparator
 * @param {Array}    a.sources     [{file, content}] relevante Quelldateien
 * @returns {Promise<Array<{file:string,find:string,replace:string}>|null>}
 */
async function proposeAndroidEdits({ spec, deviations, sources }) {
  if (!isConfigured()) return null;
  const c = cfg();
  const url = `${c.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const targets = (spec.elements || []).map((e) => ({ id: e.id, bbox: e.bbox, text: e.text, color: e.color }));
  const srcText = (sources || [])
    .map((s) => `### Datei: ${s.file}\n${String(s.content).slice(0, 6000)}`)
    .join("\n\n");

  const userText =
    `Ziel-Spezifikation:\n${JSON.stringify(targets, null, 0)}\n\n` +
    `Abweichungen (Ist vs. Soll):\n${JSON.stringify(deviations, null, 0)}\n\n` +
    `Relevante Quelldateien:\n${srcText || "(keine übergeben)"}\n\n` +
    `Gib MINIMALE literale Quelltext-Patches als JSON-Array [{file,find,replace}] zurück.`;

  try {
    const headers = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
    const res = await postJson(url, headers, {
      model: c.model,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM_ANDROID },
        { role: "user", content: userText },
      ],
    });
    if (res.status < 200 || res.status >= 300) return null;
    const json = JSON.parse(res.body);
    const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!text) return null;
    const m = String(text).match(/\[[\s\S]*\]/);
    if (!m) return null;
    const edits = JSON.parse(m[0]);
    return Array.isArray(edits) ? edits.filter((e) => e && e.file && e.find != null && e.replace != null) : null;
  } catch (_) {
    return null;
  }
}
