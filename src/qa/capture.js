"use strict";

/**
 * QA-Capture-Adapter (M1).
 *
 * Nutzt die geteilte Capture-Engine (src/core/capture.js) mit einem
 * Default-Flow (nur goto + Screenshot) für Rückwärtskompatibilität.
 *
 * Liefert die gleiche Signatur wie M0 zurück, damit der QA-Orchestrator
 * unverändert bleibt. Zusätzlich wird ein CaptureBundle geschrieben.
 */

const path = require("path");
const { capture } = require("../core/capture");
const { defaultFlow, loadFlow } = require("../core/flow");
const { writeBundle } = require("../core/bundle");

/**
 * @param {object} args
 * @param {string} args.url                Ziel-URL
 * @param {object} args.cfg                aufgelöste Config
 * @param {string} args.outDir             Verzeichnis für Screenshots + Bundle
 * @param {string} args.screenshotName     Dateiname des Haupt-Screenshots (Kompatibilität)
 * @param {string} [args.flowFile]         optionaler Pfad zu flow.json
 * @param {object} [args.logger]
 * @returns {Promise<{screenshotPath:string, consoleLogs:Array, navOk:boolean, bundlePath:string}>}
 */
async function captureForQa({ url, cfg, outDir, screenshotName, flowFile, logger }) {
  // Flow bestimmen
  const flow = flowFile ? loadFlow(flowFile) : defaultFlow(url);

  // Capture-Engine laufen lassen
  const result = await capture({
    url,
    cfg,
    flow,
    intent: "qa",
    outDir,
    recordVideo: false,  // QA braucht kein Video (nur Screenshots + Logs)
    collectA11yTree: true,
    logger,
  });

  // Bundle schreiben
  const bundlePath = writeBundle(result, outDir);
  if (logger) logger.ok(`QA-Bundle: ${bundlePath}`);

  // Kompatibilitäts-Screenshot: der letzte (bzw. erste) Schritt-Screenshot
  // Für den alten Report-Pfad kopieren wir den ersten Screenshot nach screenshotName
  const fs = require("fs");
  const firstShot = result.flow.find((s) => s.screenshot);
  let screenshotPath = path.join(outDir, screenshotName);
  if (firstShot) {
    const src = path.join(outDir, result.screenshotsDir, firstShot.screenshot);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, screenshotPath);
    }
  }

  return {
    screenshotPath,
    consoleLogs: result.console,
    navOk: result.navOk,
    bundlePath,
  };
}

module.exports = { captureForQa };
