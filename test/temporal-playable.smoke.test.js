"use strict";

/**
 * Smoke-Tests für die assetpilot.md-Erweiterungen (End-to-End, leichtgewichtig):
 *
 *  - `runTemporalCheck` gegen eine synthetische Seite, die SHADEDs API-Vertrag
 *    (window.SHADED: isReady/getParams/setParams) nachbildet und eine lebendige,
 *    parameter-reaktive Canvas-Szene zeichnet → Verdict KONSISTENT im
 *    SHADED-Modus (Idle lebt, Regen-Rampe ohne Sprung, Nachtwechsel sichtbar).
 *
 *  - `runPlayableCheck` gegen dieselbe Seite → BELEGBAR SPIELBAR
 *    (startet, fehlerfrei, bedienbar, reagiert, Beweise).
 *
 * Wird übersprungen, wenn Chromium fehlt.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { runTemporalCheck } = require("../src/qa/temporal");
const { runPlayableCheck } = require("../src/qa/playable");

function chromiumAvailable() {
  const { chromium } = require("playwright");
  const { resolveChromiumExecutable } = require("../src/util");
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return true;
  } catch {
    // Fallback prüfen
  }
  return Boolean(resolveChromiumExecutable(chromium));
}

const MOCK_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>SHADED-Mock</title></head>
<body style="margin:0">
<button id="b" onclick="this.style.background='#f00';window.__clicked=true">Start</button>
<canvas id="cv" width="1280" height="680"></canvas>
<script>
  // Minimaler Nachbau des window.SHADED-API-Vertrags für Tests.
  const PARAMS = { dayNight: 0, rain: 0, wet: 0, puddle: 0, fog: 0, storm: 0 };
  window.SHADED = {
    isReady: () => true,
    getParams: () => ({ ...PARAMS }),
    setParams: (p) => Object.assign(PARAMS, p),
    applyAct: () => {},
  };
  const cv = document.getElementById('cv');
  const x = cv.getContext('2d');
  let t = 0;
  function draw() {
    t += 1 / 60;
    // Grundhelligkeit hängt an dayNight (Zustandswechsel muss sichtbar sein)
    const base = Math.round(200 - PARAMS.dayNight * 160);
    x.fillStyle = 'rgb(' + base + ',' + base + ',' + (base + 20) + ')';
    x.fillRect(0, 0, cv.width, cv.height);
    // Regen-Schleier: gradueller Übergang, proportional zu rain
    x.fillStyle = 'rgba(40,60,120,' + (PARAMS.rain * 0.5) + ')';
    x.fillRect(0, 0, cv.width, cv.height);
    // Lebendigkeit: wandernder Blob (Szene darf nie statisch wirken)
    const bx = (Math.sin(t * 1.7) * 0.4 + 0.5) * cv.width;
    const by = (Math.cos(t * 1.3) * 0.35 + 0.5) * cv.height;
    x.fillStyle = '#e6a23c';
    x.beginPath(); x.arc(bx, by, 90, 0, Math.PI * 2); x.fill();
    requestAnimationFrame(draw);
  }
  draw();
</script>
</body></html>`;

function serveMock() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(MOCK_PAGE);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const quietLogger = { info: () => {}, warn: () => {}, error: () => {}, ok: () => {} };

test(
  "temporal-check: SHADED-Vertrag wird erkannt, Sequenz ist KONSISTENT",
  { timeout: 180000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await serveMock();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-temporal-test-"));
    try {
      const result = await runTemporalCheck({ url, cfg: {}, outDir, logger: quietLogger });
      assert.strictEqual(result.json.mode, "shaded");
      assert.strictEqual(result.json.verdict, "KONSISTENT");
      assert.strictEqual(result.exitCode, 0);
      // Phasen vorhanden + Zustandswechsel messbar
      const phases = result.json.phases.map((p) => p.phase);
      assert.ok(phases.includes("idle_tag") && phases.includes("ramp_regen") && phases.includes("nacht"));
      const nacht = result.json.phases.find((p) => p.phase === "nacht");
      assert.ok(nacht.responseDiff > 1.5, `Nachtwechsel muss sichtbar sein (responseDiff=${nacht.responseDiff})`);
      // Report + Beweis-Frames geschrieben
      assert.ok(fs.existsSync(path.join(outDir, "TEMPORAL-CONSISTENCY.md")));
      assert.ok(fs.existsSync(path.join(outDir, "frames", "phase3-nacht.png")));
    } finally {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);

test(
  "playable-check: lebendige, klickbare Seite ist BELEGBAR SPIELBAR",
  { timeout: 120000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await serveMock();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-playable-test-"));
    try {
      const result = await runPlayableCheck({ url, cfg: {}, outDir, logger: quietLogger });
      assert.strictEqual(result.json.verdict, "BELEGBAR SPIELBAR", JSON.stringify(result.json.checks));
      assert.strictEqual(result.exitCode, 0);
      assert.ok(fs.existsSync(path.join(outDir, "PLAYABLE-PROOF.md")));
      assert.ok(fs.existsSync(path.join(outDir, "proof", "proof-01-start.png")));
      assert.ok(fs.existsSync(path.join(outDir, "proof", "proof-02-nach-interaktion.png")));
    } finally {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);
