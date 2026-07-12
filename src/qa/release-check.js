"use strict";

/**
 * `cue release-check <url>`: prüft, ob das Produkt veröffentlichungsreif ist.
 * Führt einen QA-Scan aus, bewertet Release-Readiness und schreibt
 * RELEASE-READINESS.md. Exit-Code 0 = ready, 1 = not ready.
 */

const path = require("path");
const { makeLogger, slugify, timestamp, ensureDir } = require("../util");
const { writeVerdict } = require("./report");
const { qaScan } = require("./scan");
const { evaluateRelease } = require("./release");
const { writeReleaseDoc } = require("./docs");

async function runReleaseCheck({ url, cfg, flowFile, outDir, logger }) {
  const log = logger || makeLogger("RELEASE");
  if (!url) throw new Error(cfg.lang === "en" ? "No URL provided." : "Keine URL angegeben.");

  const dir = outDir || path.join(cfg.absPaths.qaReports, `release-${slugify(url)}-${timestamp()}`);
  ensureDir(dir);

  const startedAt = new Date().toISOString();

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

  const exitCode = release.ready ? 0 : 1;
  const { verdictPath } = writeVerdict(dir, {
    command: "release-check",
    target: { kind: "url", value: url, platform: "web" },
    startedAt,
    finishedAt: new Date().toISOString(),
    verdict: release.ready ? "READY" : "NOT READY",
    score: release.score,
    severity: release.ready ? "none" : "high",
    checks: [
      { id: "release-score", label: `Release-Score ${release.score}`, ok: release.ready, evidence: [], signals: { score: release.score } },
      { id: "blockers", label: `${release.blockers.length} Blocker`, ok: release.blockers.length === 0, evidence: [], signals: { blockers: release.blockers.length } },
    ],
    findings: scan.findings.map((finding) => ({
      severity: finding.severity || "medium",
      category: finding.category || "release-finding",
      message: finding.message || finding.text || String(finding),
      evidence: [],
    })),
    signals: { counts: release.counts, blockers: release.blockers, warnings: release.warnings },
    evidence: [],
    environment: { driver: "web" },
    exitCode,
  });

  log.ok(`${release.ready ? "✅" : "❌"} ${release.verdict} (Score ${release.score})`);
  if (release.blockers.length) release.blockers.forEach((b) => log.warn(`Blocker: ${b}`));
  log.ok(`Report: ${docPath}`);

  return {
    ok: true,
    exitCode,
    ready: release.ready,
    release,
    findings: scan.findings,
    docPath,
    verdictPath,
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
