"use strict";

/**
 * Smoke-Tests für `cue fidelity-check` (Gap 3 — behavioraler Vergleich):
 *
 *  - Zwei Seiten mit identischem window.CUE_PROBE-Verlauf → "VERHALTEN
 *    DECKUNGSGLEICH".
 *  - Zwei Seiten, die nach einem Klick auf unterschiedliche Szenen wechseln
 *    → "VERHALTENS-ABWEICHUNG ERKANNT" mit dem exakten Feld/Werte-Diff.
 *  - Eine Seite ohne jeden CUE-PROBE-Vertrag → "NICHT VERGLEICHBAR", kein
 *    stiller Fallback-Erfolg.
 *
 * Wird übersprungen, wenn Chromium fehlt (gleiches Muster wie
 * audio-check.smoke.test.js).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { runFidelityCheck } = require("../src/qa/fidelity-check");

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

// Realer window.CUE_PROBE-Vertrag (docs/CUE_PROBE.md): isReady/getState, hier mit
// einem Szenenwechsel bei Klick — genug, um einen Flow-Schritt real zu vergleichen.
function probePage(sceneAfterClick) {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0">
<button id="go">Weiter</button>
<script>
  let scene = 'start';
  window.CUE_PROBE = {
    isReady: () => true,
    getState: () => ({ scene, fps: 60, frame: 1, custom: { room: scene } }),
  };
  document.getElementById('go').addEventListener('click', () => { scene = '${sceneAfterClick}'; });
</script>
</body></html>`;
}

const NO_PROBE_PAGE = `<!doctype html><html><body><button>Klick</button></body></html>`;

function servePage(html) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

const quietLogger = { info: () => {}, warn: () => {}, error: () => {}, ok: () => {} };

function flowFile(dir) {
  const file = path.join(dir, "flow.json");
  fs.writeFileSync(file, JSON.stringify([{ id: "click-go", action: "click", selector: "#go" }]));
  return file;
}

test(
  "fidelity-check: identische CUE_PROBE-Verläufe ergeben VERHALTEN DECKUNGSGLEICH",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const a = await servePage(probePage("room-2"));
    const b = await servePage(probePage("room-2"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-fidelity-match-"));
    try {
      const result = await runFidelityCheck({
        urlA: a.url, urlB: b.url, cfg: {}, flowFile: flowFile(outDir), outDir, logger: quietLogger,
      });
      assert.strictEqual(result.exitCode, 0, JSON.stringify(result.json.steps));
      assert.strictEqual(result.json.verdict, "VERHALTEN DECKUNGSGLEICH");
      assert.strictEqual(result.json.mismatchCount, 0);
      assert.strictEqual(result.json.steps.length, 2); // baseline + 1 flow step
      assert.ok(fs.existsSync(path.join(outDir, "FIDELITY-PROOF.md")));
    } finally {
      a.server.close();
      b.server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);

test(
  "fidelity-check: abweichende Szene nach Klick wird real erkannt und benannt",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const a = await servePage(probePage("room-2"));
    const b = await servePage(probePage("room-3-drift"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-fidelity-drift-"));
    try {
      const result = await runFidelityCheck({
        urlA: a.url, urlB: b.url, cfg: {}, flowFile: flowFile(outDir), outDir, logger: quietLogger,
      });
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.json.verdict, "VERHALTENS-ABWEICHUNG ERKANNT");
      assert.ok(result.json.mismatchCount >= 1);
      const clickStep = result.json.steps.find((s) => s.stepId === "click-go");
      assert.ok(clickStep.mismatched.some((m) => m.field === "scene" && m.valueA === "room-2" && m.valueB === "room-3-drift"));
    } finally {
      a.server.close();
      b.server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);

test(
  "fidelity-check: fehlender Probe auf einer Seite ergibt NICHT VERGLEICHBAR, keinen stillen Erfolg",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const a = await servePage(probePage("room-2"));
    const b = await servePage(NO_PROBE_PAGE);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-fidelity-noprobe-"));
    try {
      const result = await runFidelityCheck({ urlA: a.url, urlB: b.url, cfg: {}, outDir, logger: quietLogger });
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.json.verdict, "NICHT VERGLEICHBAR");
      assert.strictEqual(result.json.signals.probeA, "cue-probe");
      assert.strictEqual(result.json.signals.probeB, null);
    } finally {
      a.server.close();
      b.server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);
