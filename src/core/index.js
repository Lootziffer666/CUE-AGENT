"use strict";

/**
 * Core-Modul Einstieg: Capture-Engine + Flow + Bundle.
 */

const path = require("path");
const { capture } = require("./capture");
const { defaultFlow, loadFlow } = require("./flow");
const { writeBundle, readBundle } = require("./bundle");
const { ensureDir, timestamp, slugify } = require("../util");

/**
 * Standalone `cue capture` Orchestrator.
 *
 * @param {object} args
 * @param {string} args.url         Ziel-URL
 * @param {object} args.cfg         aufgelöste Config
 * @param {string} [args.intent]    "qa" | "promo" | "tutorial" (Default: "qa")
 * @param {string} [args.flowFile]  Pfad zu flow.json (optional)
 * @param {string} [args.outDir]    Ausgabe-Verzeichnis (optional, wird generiert)
 * @param {boolean} [args.recordVideo]  Video aufnehmen (Default: true)
 * @param {object} [args.logger]
 * @returns {Promise<{bundlePath:string, bundle:object, outDir:string}>}
 */
async function runCapture({
  url,
  cfg,
  intent = "qa",
  flowFile = null,
  outDir = null,
  recordVideo = true,
  logger,
}) {
  const log = logger || require("../util").makeLogger("CAPTURE");

  if (!url) {
    throw new Error(
      cfg.lang === "en"
        ? "No URL provided."
        : "Keine URL angegeben."
    );
  }

  // Flow bestimmen
  const flow = flowFile ? loadFlow(flowFile) : defaultFlow(url);

  // Ausgabeverzeichnis
  const ts = timestamp();
  const slug = slugify(url);
  const dir = outDir || path.join(cfg.root, "captures", `${slug}-${ts}`);
  ensureDir(dir);

  log.info(`Ziel: ${url}`);
  log.info(`Ausgabe: ${dir}`);

  // Capture laufen lassen
  const result = await capture({
    url,
    cfg,
    flow,
    intent,
    outDir: dir,
    recordVideo,
    collectA11yTree: intent === "qa",
    logger: log,
  });

  // Bundle schreiben
  const bundlePath = writeBundle(result, dir);
  log.ok(`Bundle geschrieben: ${bundlePath}`);

  return { bundlePath, bundle: result, outDir: dir };
}

module.exports = { runCapture, capture, loadFlow, defaultFlow, writeBundle, readBundle };
