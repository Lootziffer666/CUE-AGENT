"use strict";

/**
 * CLI-Vertrag: `--json` bedeutet, stdout ist EXKLUSIV das Ergebnis-JSON —
 * direkt an JSON.parse verfütterbar, keine Log-Zeilen davor.
 *
 * Regression für einen live gefundenen Bruch: der Logger schrieb "[CUE] Lade …"
 * auf stdout VOR das JSON. Die bestehenden Smoke-Tests riefen runAudioCheck()
 * als Funktion auf und konnten das nie sehen — der Bruch passierte auf
 * CLI-Ebene (bin/cue.js), genau dem Pfad, den ANVILs CueCliAdapter und jede
 * Shell-Pipe benutzen. Dieser Test spawnt deshalb die echte CLI.
 *
 * Wird übersprungen, wenn Chromium fehlt (gleiches Muster wie die anderen
 * Smoke-Tests).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");

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

function servePage(html) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function runCli(args) {
  return new Promise((resolve) => {
    execFile(
      "node",
      [path.join(__dirname, "..", "bin", "cue.js"), ...args],
      { timeout: 120000, maxBuffer: 1024 * 1024 * 10 },
      (err, stdout, stderr) => resolve({ code: err && typeof err.code === "number" ? err.code : 0, stdout, stderr })
    );
  });
}

test(
  "CLI --json: stdout ist pures JSON, Log-Zeilen landen auf stderr",
  { timeout: 120000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await servePage("<!doctype html><html><body><button>x</button></body></html>");
    try {
      const { stdout, stderr } = await runCli(["audio-check", url, "--json"]);
      // Der eigentliche Vertrag: direkt parsebar, ohne irgendein Vorab-Strippen.
      const parsed = JSON.parse(stdout);
      assert.strictEqual(parsed.verdict, "KEIN AUDIO-VERTRAG GEFUNDEN");
      // Und die Logs sind nicht verschwunden, sondern umgeleitet.
      assert.match(stderr, /\[CUE\]/);
    } finally {
      server.close();
    }
  }
);
