"use strict";

/**
 * `cue release-check <url>`: prüft, ob das Produkt veröffentlichungsreif ist.
 * Führt einen QA-Scan aus, bewertet Release-Readiness und schreibt
 * RELEASE-READINESS.md. Exit-Code 0 = ready, 1 = not ready.
 */

const path = require("path");
const { makeLogger, slugify, timestamp, ensureDir } = require("../util");
const { qaScan } = require("./scan");
const { evaluateRelease } = require("./release");
const { writeReleaseDoc } = require("./docs");

async function runReleaseCheck({ url, cfg, flowFile, outDir, logger }) {
  const log = logger || makeLogger("RELEASE");
  if (!url) throw new Error(cfg.lang === "en" ? "No URL provided." : "Keine URL angegeben.");

  const dir = outDir || path.join(cfg.absPaths.qaReports, `release-${slugify(url)}-${timestamp()}`);
  ensureDir(dir);

  log.info(`Release-Check: ${url}`);
  const scan = await qaScan({ url, cfg, outDir: dir, flowFile, logger: log });

  const release = evaluateRelease({
    findings: scan.findings,
    score: scan.score,
    consoleLogs: scan.consoleLogs,
    network: scan.network,
    metrics: scan.metrics,
    cfg,
  });

  const docPath = writeReleaseDoc({ url, release, findings: scan.findings, outDir: dir, lang: cfg.lang });

  log.ok(`${release.ready ? "✅" : "❌"} ${release.verdict} (Score ${release.score})`);
  if (release.blockers.length) release.blockers.forEach((b) => log.warn(`Blocker: ${b}`));
  log.ok(`Report: ${docPath}`);

  return {
    ok: true,
    exitCode: release.ready ? 0 : 1,
    ready: release.ready,
    release,
    findings: scan.findings,
    docPath,
    json: {
      tool: "cue-agent",
      intent: "release-check",
      url,
      timestamp: new Date().toISOString(),
      ready: release.ready,
      verdict: release.verdict,
      score: release.score,
      blockers: release.blockers,
      warnings: release.warnings,
      counts: release.counts,
      findings: scan.findings,
    },
  };
}

module.exports = { runReleaseCheck };
