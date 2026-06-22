"use strict";

/**
 * Optionales hyperframes-Renderer-Plugin.
 *
 * hyperframes (github.com/heygen-com/hyperframes) ist eine externe CLI für
 * HTML+GSAP-Kompositionen. CUE-AGENT nutzt standardmäßig den eingebauten
 * Renderer; dieses Plugin ist für Teams gedacht, die bereits hyperframes
 * einsetzen.
 *
 * Voraussetzung: eine hyperframes-kompatible Wurzelkomposition (index.html)
 * im Projektverzeichnis. CUE-AGENTs Szenenmodell (eigenständige Szenen +
 * Segment-Concat) erzeugt diese nicht automatisch — daher rendert das Plugin
 * eine vorhandene index.html, sonst gibt es eine klare Anleitung aus.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function hyperframesAvailable() {
  try {
    execSync("npx --yes hyperframes --version", { stdio: "ignore", timeout: 60000 });
    return true;
  } catch (_) {
    return false;
  }
}

async function renderHyperframes({ outDir, cfg, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  if (!hyperframesAvailable()) {
    throw new Error(
      "Renderer 'hyperframes' gewählt, aber die CLI ist nicht verfügbar.\n" +
        "Installiere sie (npm i -g hyperframes) oder nutze den eingebauten Renderer " +
        "(cue.config.json: video.renderer = \"builtin\")."
    );
  }

  const indexHtml = path.join(outDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      "Renderer 'hyperframes' benötigt eine Wurzelkomposition index.html im Projekt.\n" +
        "CUE-AGENTs eingebauter Renderer erzeugt stattdessen Szenen-Segmente. " +
        "Für hyperframes bitte eine index.html bereitstellen oder den eingebauten Renderer nutzen."
    );
  }

  log.info("hyperframes: render ...");
  execSync("npx --yes hyperframes render", { cwd: outDir, stdio: ["ignore", "pipe", "pipe"] });

  const mp4Path = path.join(outDir, "out", "final.mp4");
  if (!fs.existsSync(mp4Path)) {
    throw new Error("hyperframes render lief, aber out/final.mp4 wurde nicht gefunden.");
  }
  log.ok(`hyperframes-Render fertig: ${mp4Path}`);
  return { mp4Path, frames: 0, durationSec: 0 };
}

module.exports = { renderHyperframes, hyperframesAvailable };
