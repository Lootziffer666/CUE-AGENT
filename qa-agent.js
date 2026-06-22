#!/usr/bin/env node
"use strict";

/**
 * Kompatibilitäts-Shim.
 *
 * Die QA-Logik lebt jetzt modular unter src/qa/ und ist über die `cue`-CLI
 * (bin/cue.js) erreichbar. Diese Datei bleibt erhalten, damit bestehende
 * Aufrufe (`node qa-agent.js <url>`, `npm start`) unverändert funktionieren.
 *
 * Neu: `node bin/cue.js qa <url>`  (bevorzugt)
 */

const { loadConfig } = require("./src/config");
const { makeLogger } = require("./src/util");
const { runQa } = require("./src/qa");

function showHelp() {
  console.log(`
CUE-AGENT QA (Kompatibilitaets-Shim)

Verwendung:
  node qa-agent.js <url>        URL analysieren
  node qa-agent.js              TARGET_URL aus .env verwenden
  node qa-agent.js --help       Diese Hilfe

Hinweis: Bevorzugt die neue CLI verwenden:
  node bin/cue.js qa <url>      (oder global: cue qa <url>)
  node bin/cue.js doctor        Umgebung pruefen

Umgebungsvariablen:
  ANTHROPIC_API_KEY   (erforderlich)
  TARGET_URL          (optional)
  CUE_LANG            (optional) de | en
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  const cfg = loadConfig();
  const url = process.argv[2] || cfg.targetUrl;
  const log = makeLogger("QA Agent");

  const result = await runQa({ url, cfg, logger: log });
  log.info("Fertig.");
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error("[QA Agent] Fataler Fehler:", err.message);
  process.exit(1);
});
