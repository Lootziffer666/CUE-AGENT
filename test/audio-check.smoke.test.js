"use strict";

/**
 * Smoke-Tests für `cue audio-check` (Real Golden Run R-13..R-17, Gate H):
 *
 *  - `runAudioCheck` gegen eine synthetische Seite, die den REALEN
 *    `window.ANVIL_AUDIO`-Vertrag nachbildet (exakt die Form, die
 *    ANVILs `ToneJsRuntimeWriter` generiert: getDebugState/setState/getEventLog,
 *    inkl. echter Event-Log-Einträge bei Interaktion) → Verdict
 *    "AUDIO-VERTRAG BELEGT (...)" mit allen vier prüfbaren Kategorien ok.
 *
 *  - `runAudioCheck` gegen eine Seite OHNE ANVIL_AUDIO → "KEIN AUDIO-VERTRAG
 *    GEFUNDEN", kein stiller Fallback-Erfolg.
 *
 * Wird übersprungen, wenn Chromium fehlt (gleiches Muster wie
 * temporal-playable.smoke.test.js).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { runAudioCheck } = require("../src/qa/audio-check");

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

// Exakter Nachbau des Vertrags aus ANVIL's ToneJsRuntimeWriter.kt (renderRuntimeTs()):
// getDebugState/setState/getEventLog, eventLog wird bei echten Aktionen befüllt.
const AUDIO_MOCK_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>ANVIL_AUDIO-Mock</title></head>
<body style="margin:0">
<button id="b" onclick="window.__fireCue()">Feuer Cue</button>
<script>
  const debugState = {};
  const eventLog = [];
  window.__fireCue = () => { eventLog.push('stinger:sfx'); };
  window.ANVIL_AUDIO = {
    getDebugState: () => ({ ...debugState }),
    setState: (name, value) => { debugState[name] = value; },
    getEventLog: () => [...eventLog],
  };
</script>
</body></html>`;

const NO_AUDIO_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Kein Audio-Vertrag</title></head>
<body style="margin:0"><button>Klick</button></body></html>`;

function servePage(html) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const quietLogger = { info: () => {}, warn: () => {}, error: () => {}, ok: () => {} };

test(
  "audio-check: window.ANVIL_AUDIO wird erkannt, Beweis-Kategorien sind BELEGT",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await servePage(AUDIO_MOCK_PAGE);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-audio-test-"));
    try {
      const result = await runAudioCheck({ url, cfg: {}, outDir, logger: quietLogger });
      assert.strictEqual(result.json.mode, "anvil-audio");
      assert.strictEqual(result.exitCode, 0, JSON.stringify(result.json.checks));
      assert.match(result.json.verdict, /AUDIO-VERTRAG BELEGT/);

      const byId = Object.fromEntries(result.json.checks.map((c) => [c.id, c]));
      assert.strictEqual(byId.CUE_FIRED.ok, true);
      assert.strictEqual(byId.STATE_REACTION.ok, true);
      assert.strictEqual(byId.TRANSITION_TIMING.ok, true);
      assert.strictEqual(byId.LOOP_CONTINUITY.ok, true);
      // Ehrlich nicht-prüfbar, nie fingiert:
      assert.strictEqual(byId.CLIPPING_CHECK.ok, null);
      assert.strictEqual(byId.VOICE_AUDIBILITY.ok, null);

      assert.ok(fs.existsSync(path.join(outDir, "AUDIO-PROOF.md")));
      assert.ok(fs.existsSync(path.join(outDir, "audio-report.json")));
    } finally {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);

test(
  "audio-check: ohne window.ANVIL_AUDIO gibt es keinen stillen Fallback-Erfolg",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await servePage(NO_AUDIO_PAGE);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-audio-noaudio-test-"));
    try {
      const result = await runAudioCheck({ url, cfg: {}, outDir, logger: quietLogger });
      assert.strictEqual(result.json.mode, "generic");
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.json.verdict, "KEIN AUDIO-VERTRAG GEFUNDEN");
    } finally {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);

test(
  "audio-check: --scenario überschreibt den Debug-State-Probe-Namen/Wert",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await servePage(AUDIO_MOCK_PAGE);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-audio-scenario-test-"));
    const scenarioFile = path.join(outDir, "scenario.json");
    fs.writeFileSync(scenarioFile, JSON.stringify({ probeState: { name: "custom_probe", value: 42 } }));
    try {
      const result = await runAudioCheck({ url, cfg: {}, outDir, scenarioFile, logger: quietLogger });
      assert.strictEqual(result.json.probeState.name, "custom_probe");
      assert.strictEqual(result.json.probeState.value, 42);
      const byId = Object.fromEntries(result.json.checks.map((c) => [c.id, c]));
      assert.strictEqual(byId.STATE_REACTION.ok, true);
    } finally {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);
