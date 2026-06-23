"use strict";

/**
 * QA-Orchestrator: Capture -> Analyse -> Severity -> Report.
 *
 * Liefert ein strukturiertes Ergebnis zurück (inkl. Exit-Code-Empfehlung),
 * damit sowohl die CLI als auch spätere Pipelines/CI es nutzen können.
 */

const { hasValidLlmCredentials } = require("../config");
const { makeLogger, timestamp } = require("../util");
const { captureForQa } = require("./capture");
const { analyze } = require("./analyze");
const { assess, failsGate } = require("./severity");
const { writeReports } = require("./report");

/**
 * @param {object} args
 * @param {string} args.url Ziel-URL
 * @param {object} args.cfg aufgelöste Config
 * @param {object} [args.logger]
 * @returns {Promise<{ok:boolean, exitCode:number, json:object, mdPath:string, jsonPath:string, assessment:object}>}
 */
async function runQa({ url, cfg, logger }) {
  const log = logger || makeLogger("QA");

  if (!url) {
    throw new Error(
      cfg.lang === "en"
        ? "No URL provided. Pass a URL or set TARGET_URL in .env"
        : "Keine URL angegeben. URL übergeben oder TARGET_URL in .env setzen."
    );
  }
  // Vision-Analyse braucht einen LLM-Key. Fehlt er, läuft QA trotzdem:
  // Capture + Konsolen-/Netzwerk-/a11y-Befunde + Score werden geliefert,
  // nur die Vision-Analyse wird übersprungen (statt hart abzubrechen).
  const llm = hasValidLlmCredentials(cfg);
  const visionEnabled = llm.ok;
  if (!visionEnabled) {
    log.warn(
      cfg.lang === "en"
        ? `No LLM key for "${llm.provider}" (${llm.reason}) — running QA without vision analysis (capture, console, network & a11y only).`
        : `Kein LLM-Key für "${llm.provider}" (${llm.reason}) — QA läuft ohne Vision-Analyse (nur Capture, Konsole, Netzwerk & a11y).`
    );
  }

  const ts = timestamp();
  const screenshotName = `screenshot-${ts}.png`;

  log.info(`Ziel-URL: ${url}`);

  // 1) Capture
  const { screenshotPath, consoleLogs, network, metrics, navOk } = await captureForQa({
    url,
    cfg,
    outDir: cfg.absPaths.qaReports,
    screenshotName,
    logger: log,
  });

  // 2) Analyse (nur mit gültigem Key)
  let analysis;
  if (visionEnabled) {
    log.info(`Analyse via LLM (${(cfg.llm && cfg.llm.provider) || "anthropic"}, Vision) ...`);
    analysis = await analyze({ cfg, url, screenshotPath, consoleLogs });
    log.ok("Analyse erhalten.");
  } else {
    analysis =
      cfg.lang === "en"
        ? "_Vision analysis skipped — no LLM key configured. Set ANTHROPIC_API_KEY (or another provider) to enable the visual review. Capture, console, network and accessibility findings above are still complete._"
        : "_Vision-Analyse übersprungen — kein LLM-Key konfiguriert. Setze ANTHROPIC_API_KEY (oder einen anderen Provider) für die visuelle Begutachtung. Capture-, Konsolen-, Netzwerk- und Accessibility-Befunde oben sind dennoch vollständig._";
  }

  // 3) Severity (inkl. Netzwerk-Befunde)
  const assessment = assess({ consoleLogs, navOk, network });

  // 4) Report
  const { mdPath, jsonPath, json } = writeReports({
    cfg,
    ts,
    url,
    screenshotName,
    consoleLogs,
    network,
    metrics,
    analysis,
    assessment,
    visionSkipped: !visionEnabled,
  });
  log.ok(`Report (Markdown): ${mdPath}`);
  log.ok(`Report (JSON): ${jsonPath}`);

  const gateViolated = failsGate(assessment.level, cfg.qa.failOn);
  const exitCode = gateViolated ? 1 : 0;
  if (gateViolated) {
    log.warn(
      `QA-Gate verletzt: Severity "${assessment.level}" >= Schwelle "${cfg.qa.failOn}".`
    );
  }

  return { ok: true, exitCode, json, mdPath, jsonPath, assessment };
}

module.exports = { runQa };
