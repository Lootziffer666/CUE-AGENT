"use strict";
/**
 * Offline-AI-Stub für CUE-AGENT — ein lokaler, OpenAI-kompatibler Endpunkt, der
 * die KI-Aufrufe von CUE-AGENT OHNE echten API-Key/Cloud bedient. Gedacht für
 * Demos, CI und lokales Ausprobieren der AI-Funktionen ohne BYOK.
 *
 * WICHTIG: Das ist KEIN echtes Modell. Es liefert:
 *   - /v1/chat/completions
 *       • Design-Proposer: berechnet aus der mitgesendeten Ziel-Spec (selector,
 *         bbox, color) die KORREKTEN CSS-Overrides → `cue design-iterate`
 *         konvergiert deterministisch (das ist exakt, kein Raten).
 *       • QA-Analyse (Prosa/strukturiert): liefert eine sinnvolle Default-
 *         Bewertung. Eigene, echte Befunde lassen sich als Canned-Datei
 *         hinterlegen (siehe CANNED_DIR) und werden pro URL bevorzugt.
 *   - /v1/images/generations
 *       • synthetisiert lokal per ffmpeg ein abstraktes Marken-Bild
 *         (dunkle Basis + leuchtender Akzent-Orb) → image-Szenen rendern ohne
 *         Bild-API.
 *
 * Start:   node scripts/offline-ai-stub.js            (Port 8771)
 *          PORT=9000 node scripts/offline-ai-stub.js
 *
 * Damit CUE-AGENT den Stub nutzt:
 *   export CUE_LLM_PROVIDER=openai
 *   export CUE_LLM_BASE_URL=http://127.0.0.1:8771/v1
 *   export CUE_LLM_MODEL=cue-local
 *   export CUE_LLM_API_KEY=local
 *   export CUE_IMAGE_API_KEY=local
 *   cue qa <url> | cue release-check <url> | cue design-iterate ... | cue promo --images auto
 *
 * Arbeitsdateien (eingehende Bilder/Requests, Canned-Antworten) liegen unter
 * CUE_AI_STUB_DIR (Default: ./.cue-ai-stub). Canned QA: <dir>/canned/qa-<slug>.json|.txt.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const PORT = Number(process.env.PORT || 8771);
const WORK = process.env.CUE_AI_STUB_DIR || path.join(process.cwd(), ".cue-ai-stub");
const REQ_DIR = path.join(WORK, "requests");
const CANNED_DIR = path.join(WORK, "canned");
fs.mkdirSync(REQ_DIR, { recursive: true });
fs.mkdirSync(CANNED_DIR, { recursive: true });
function log(...a) { console.log("[ai-stub]", ...a); }

function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => resolve(b)); });
}
function slugify(s) { return String(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase(); }
function textOf(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x.text || "")).join("\n");
  return "";
}
function imageOf(c) {
  if (!Array.isArray(c)) return null;
  for (const x of c) {
    if (x && x.type === "image_url" && x.image_url && x.image_url.url) {
      const m = String(x.image_url.url).match(/^data:[^;]+;base64,(.+)$/);
      if (m) return m[1];
    }
  }
  return null;
}

// Klammer-balancierte JSON-Arrays aus Text ziehen (Ziel-Spec robust finden).
function extractArrays(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "[") depth++;
      else if (text[j] === "]") { depth--; if (depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; } }
    }
  }
  return out;
}
// Korrekte CSS-Overrides aus der Ziel-Spec (selector, bbox [x,y,w,h], color).
function proposeCss(userText) {
  let targets = [];
  for (const chunk of extractArrays(userText)) {
    try {
      const arr = JSON.parse(chunk);
      if (Array.isArray(arr) && arr.some((e) => e && typeof e === "object" && Array.isArray(e.bbox))) { targets = arr; break; }
    } catch (_) {}
  }
  const edits = [];
  for (const t of targets) {
    if (!t.selector || !Array.isArray(t.bbox)) continue;
    const [x, y, w, h] = t.bbox;
    const css = { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` };
    if (t.color) css.background = t.color;
    edits.push({ selector: t.selector, css });
  }
  return JSON.stringify(edits);
}

function urlFromText(t) { const m = t.match(/https?:\/\/[^\s)"']+|file:\/\/[^\s)"']+/); return m ? m[0] : ""; }
function canned(url, structured) {
  const f = path.join(CANNED_DIR, `qa-${slugify(url)}.${structured ? "json" : "txt"}`);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : null;
}
function defaultStructuredQa() {
  return JSON.stringify({
    summary: "Konsistente, lesbare UI ohne offensichtliche Defekte im sichtbaren Bereich.",
    score: 86,
    findings: [
      { id: "focus-visible", title: "Sichtbare Tastatur-Fokus-Stile", severity: "low", category: "accessibility",
        description: "Interaktive Elemente sollten einen deutlichen :focus-visible-Stil haben.",
        suggestedFix: ":focus-visible{outline:2px solid <Akzent>;outline-offset:2px} ergänzen.", location: "a, button" },
    ],
  });
}
function defaultProseQa() {
  return "Gesamteindruck: aufgeräumtes, konsistentes Layout mit klarer Typo-Hierarchie und ausreichenden Kontrasten. " +
    "Keine offensichtlichen Layout-Brüche im sichtbaren Bereich. Empfehlung: sichtbare Tastatur-Fokus-Stile ergänzen und " +
    "Touch-Ziele (>=44px) auf kleinen Viewports prüfen. Konsolen-Logs ohne kritische Fehler.";
}
function chatResponse(text) {
  return JSON.stringify({
    id: "chatcmpl-stub", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: "cue-local",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

// Abstraktes Marken-Bild per ffmpeg (dunkle Basis + leuchtender Akzent-Orb).
function synthImage(prompt, size) {
  const [w, h] = String(size || "1024x1024").split("x").map((n) => parseInt(n, 10) || 1024);
  const hsh = crypto.createHash("sha1").update(prompt || "cue").digest();
  const base = "0x0b0d12";
  const accents = ["0x7928ca", "0xC20021", "0x0070f3", "0xD97732", "0x28c76f", "0xe0455e"];
  const c1 = accents[hsh[3] % accents.length], c2 = accents[(hsh[4] + 2) % accents.length];
  const ox = 0.25 + (hsh[5] % 50) / 100, oy = 0.2 + (hsh[6] % 55) / 100;
  const out = path.join(REQ_DIR, `img-${Date.now()}-${hsh.toString("hex").slice(0, 6)}.png`);
  const fc =
    `gradients=s=${w}x${h}:c0=${base}:c1=${c2}:type=linear:nb_colors=2:d=1,format=rgba[bg];` +
    `gradients=s=${w}x${h}:c0=${c1}:c1=${base}:type=radial:x0=${ox}:y0=${oy}:nb_colors=2:d=1,format=rgba,gblur=sigma=40[orb];` +
    `[bg][orb]blend=all_mode=screen:all_opacity=0.85,noise=alls=9:allf=t+u,gblur=sigma=0.8,vignette=PI/4.5,format=rgba[out]`;
  execFileSync("ffmpeg", ["-y", "-filter_complex", fc, "-map", "[out]", "-frames:v", "1", out], { stdio: ["ignore", "ignore", "pipe"] });
  return fs.readFileSync(out).toString("base64");
}

let n = 0;
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "POST" && url === "/v1/chat/completions") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const msgs = body.messages || [];
      const sys = textOf((msgs.find((m) => m.role === "system") || {}).content);
      const userMsg = msgs.filter((m) => m.role === "user").pop() || {};
      const userText = textOf(userMsg.content);
      const img = imageOf(userMsg.content);
      n++;
      if (img) { try { fs.writeFileSync(path.join(REQ_DIR, `chat-${n}.png`), Buffer.from(img, "base64")); } catch (_) {} }

      let out, kind;
      if (/CSS-Overrides|Frontend-Entwickler/i.test(sys)) {
        out = proposeCss(userText); kind = "design-proposer";
      } else if (/findings/i.test(sys)) {
        const u = urlFromText(userText); out = canned(u, true) || defaultStructuredQa(); kind = `qa-structured ${canned(u, true) ? "[canned]" : ""}`;
      } else {
        const u = urlFromText(userText); out = canned(u, false) || defaultProseQa(); kind = `qa-prose ${canned(u, false) ? "[canned]" : ""}`;
      }
      log(`chat#${n} → ${kind}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(chatResponse(out));
    }
    if (req.method === "POST" && url === "/v1/images/generations") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const b64 = synthImage(body.prompt, body.size);
      log(`image → "${String(body.prompt || "").slice(0, 48)}" (${body.size || "1024x1024"})`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ created: Date.now(), data: [{ b64_json: b64 }] }));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (err) {
    log("ERROR", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message) }));
  }
});
server.listen(PORT, "127.0.0.1", () => log(`offline-ai-stub auf http://127.0.0.1:${PORT}  (Arbeitsordner: ${WORK})`));
