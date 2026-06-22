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
  const llm = hasValidLlmCredentials(cfg);
  if (!llm.ok) {
    throw new Error(
      cfg.lang === "en"
        ? `No valid LLM credentials for provider "${llm.provider}": ${llm.reason}.`
        : `Keine gültigen LLM-Credentials für Provider "${llm.provider}": ${llm.reason}.`
    );
  }

  const ts = timestamp();
  const screenshotName = `screenshot-${ts}.png`;

  log.info(`Ziel-URL: ${url}`);

  // 1) Capture
  const { screenshotPath, consoleLogs, navOk } = await captureForQa({
    url,
    cfg,
    outDir: cfg.absPaths.qaReports,
    screenshotName,
    logger: log,
  });

  // 2) Analyse
  log.info(`Analyse via LLM (${(cfg.llm && cfg.llm.provider) || "anthropic"}, Vision) ...`);
  const analysis = await analyze({ cfg, url, screenshotPath, consoleLogs });
  log.ok("Analyse erhalten.");

  // 3) Severity
  const assessment = assess({ consoleLogs, navOk });

  // 4) Report
  const { mdPath, jsonPath, json } = writeReports({
    cfg,
    ts,
    url,
    screenshotName,
    consoleLogs,
    analysis,
    assessment,
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
