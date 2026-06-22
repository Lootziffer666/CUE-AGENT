"use strict";

/**
 * Gemeinsamer QA-Scan: Capture + strukturierte Analyse + Severity.
 * Wird von release-check und qa-loop genutzt.
 */

const path = require("path");
const { hasValidLlmCredentials } = require("../config");
const { makeLogger, timestamp, ensureDir } = require("../util");
const { captureForQa } = require("./capture");
const { analyzeStructured } = require("./analyze");
const { assess } = require("./severity");

/**
 * @param {object} args
 * @param {string} args.url
 * @param {object} args.cfg
 * @param {string} args.outDir
 * @param {string} [args.flowFile]
 * @param {object} [args.logger]
 * @returns {Promise<object>} { screenshotPath, consoleLogs, network, metrics, navOk, structured, assessment }
 */
async function qaScan({ url, cfg, outDir, flowFile, logger }) {
  const log = logger || makeLogger("QA");
  const llm = hasValidLlmCredentials(cfg);
  if (!llm.ok) {
    throw new Error(`Keine gültigen LLM-Credentials (${llm.provider}): ${llm.reason}.`);
  }
  ensureDir(outDir);
  const ts = timestamp();
  const screenshotName = `screenshot-${ts}.png`;

  const cap = await captureForQa({ url, cfg, outDir, screenshotName, flowFile, logger: log });

  log.info(`Strukturierte Analyse via LLM (${(cfg.llm && cfg.llm.provider) || "anthropic"}) ...`);
  const structured = await analyzeStructured({
    cfg,
    url,
    screenshotPath: cap.screenshotPath,
    consoleLogs: cap.consoleLogs,
  });

  const assessment = assess({ consoleLogs: cap.consoleLogs, navOk: cap.navOk });
  // Score: bevorzugt LLM-Score, sonst heuristischer Severity-Score
  const score = structured.score != null ? structured.score : assessment.score;

  return {
    screenshotPath: cap.screenshotPath,
    consoleLogs: cap.consoleLogs,
    network: cap.network,
    metrics: cap.metrics,
    navOk: cap.navOk,
    structured,
    findings: structured.findings,
    score,
    assessment,
  };
}

module.exports = { qaScan };
