"use strict";

/**
 * AI-QA-Loop: testen → Fixes vorschlagen/anwenden → neu bauen → erneut testen,
 * bis das Produkt veröffentlichungsreif ist oder die max. Iterationen erreicht
 * sind. Schreibt eine vollständige schriftliche Dokumentation (QA-LOOP.md).
 *
 * Sicherheit:
 *  - Ohne --repo: reiner Test-/Monitoring-Lauf (keine Code-Änderung).
 *  - Mit --repo, ohne --apply: Fix-Vorschläge (Dry-Run), kein Re-Loop.
 *  - Mit --repo + --apply + --rebuild: voller autonomer Zyklus.
 */

const path = require("path");
const { execSync } = require("child_process");
const { makeLogger, slugify, timestamp, ensureDir } = require("../util");
const { qaScan } = require("./scan");
const { evaluateRelease } = require("./release");
const { proposeFixes } = require("./fixer");
const { writeReleaseDoc, writeLoopDoc } = require("./docs");

function runRebuild(cmd, cwd, log) {
  try {
    log.info(`Rebuild: ${cmd}`);
    execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });
    return { cmd, ok: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-300) : err.message;
    log.warn(`Rebuild fehlgeschlagen: ${stderr}`);
    return { cmd, ok: false, error: stderr };
  }
}

async function runQaLoop({ url, cfg, repoPath, rebuildCmd, maxIterations = 3, apply = false, flowFile, outDir, logger }) {
  const log = logger || makeLogger("QA-LOOP");
  if (!url) throw new Error(cfg.lang === "en" ? "No URL provided." : "Keine URL angegeben.");

  const dir = outDir || path.join(cfg.absPaths.qaReports, `loop-${slugify(url)}-${timestamp()}`);
  ensureDir(dir);

  const iterations = [];
  let lastRelease = null;
  // maxIterations defensiv parsen (NaN würde die Schleife nie laufen lassen → Crash)
  const parsedMax = parseInt(maxIterations, 10);
  const validMax = isNaN(parsedMax) ? 3 : Math.max(1, parsedMax);
  const maxIt = repoPath && apply ? validMax : 1;

  for (let n = 1; n <= maxIt; n++) {
    log.info(`\n=== Iteration ${n}/${maxIt} ===`);
    const iterDir = path.join(dir, `iteration-${n}`);
    ensureDir(iterDir);

    const scan = await qaScan({ url, cfg, outDir: iterDir, flowFile, logger: log });
    const release = evaluateRelease({
      findings: scan.findings,
      score: scan.score,
      consoleLogs: scan.consoleLogs,
      network: scan.network,
      metrics: scan.metrics,
      cfg,
    });
    lastRelease = release;

    const iter = { n, score: release.score, findings: scan.findings, release, fixesProposed: [], fixesApplied: [], rebuild: null };
    log.ok(`${release.ready ? "✅" : "❌"} ${release.verdict} — Score ${release.score}, ${scan.findings.length} Befunde`);

    if (release.ready) {
      iterations.push(iter);
      break;
    }

    // Fixes nur mit Repo
    if (repoPath && scan.findings.length) {
      const { proposed, applied } = await proposeFixes({
        findings: scan.findings,
        repoPath,
        cfg,
        outDir: iterDir,
        apply,
        logger: log,
      });
      iter.fixesProposed = proposed;
      iter.fixesApplied = applied;

      if (apply && applied.length && rebuildCmd) {
        iter.rebuild = runRebuild(rebuildCmd, path.resolve(repoPath), log);
      } else if (apply && applied.length && !rebuildCmd) {
        log.warn("Fixes angewendet, aber kein --rebuild angegeben — die laufende URL spiegelt die Änderungen evtl. nicht wider.");
      }
    } else if (!repoPath) {
      log.info("Kein --repo angegeben → reiner Test-/Monitoring-Lauf (keine Fixes).");
    }

    iterations.push(iter);

    // Abbruchbedingungen
    if (!apply || !repoPath) break;          // Dry-Run / kein Repo → kein Re-Loop
    if (apply && !rebuildCmd) break;          // ohne Rebuild macht Re-Test keinen Sinn
    if (iter.rebuild && !iter.rebuild.ok) break; // Build kaputt → stoppen
  }

  const loopDoc = writeLoopDoc({ url, iterations, finalRelease: lastRelease, outDir: dir, lang: cfg.lang });
  const releaseDoc = writeReleaseDoc({
    url,
    release: lastRelease,
    findings: iterations.length ? iterations[iterations.length - 1].findings : [],
    outDir: dir,
    lang: cfg.lang,
  });

  log.ok(`\nLoop beendet nach ${iterations.length} Iteration(en): ${lastRelease.ready ? "✅ READY" : "❌ NOT READY"}`);
  log.ok(`Doku: ${loopDoc}`);

  return {
    ok: true,
    exitCode: lastRelease.ready ? 0 : 1,
    ready: lastRelease.ready,
    iterations: iterations.length,
    release: lastRelease,
    loopDoc,
    releaseDoc,
    json: {
      tool: "cue-agent",
      intent: "qa-loop",
      url,
      iterations: iterations.map((it) => ({
        n: it.n, score: it.score, ready: it.release.ready,
        findings: it.findings.length, fixesApplied: it.fixesApplied.length,
      })),
      ready: lastRelease.ready,
      verdict: lastRelease.verdict,
    },
  };
}

module.exports = { runQaLoop };
