"use strict";

/**
 * QA-Gate: "erst QA, dann Promo".
 *
 * Vor jedem Video (promo/showcase/tutorial) mit einer URL prüft das Gate den
 * jüngsten QA-Report zu genau dieser URL:
 *   - Existiert ein Report?         (sonst: erst `cue qa <url>` laufen lassen)
 *   - Ist er frisch genug?          (maxAgeHours)
 *   - Score >= Mindest-Score?       (minScore)
 *   - Keine offenen High-Severity?  (failOnSeverity)
 *
 * Besteht das Gate nicht, wird die Video-Erzeugung blockiert — außer der
 * Nutzer setzt explizit --skip-qa-gate.
 *
 * Damit ist garantiert: Es wird nie eine ungeprüfte/kaputte App beworben.
 */

const fs = require("fs");
const path = require("path");
const { LEVELS } = require("./severity");

function rank(level) {
  const r = LEVELS.indexOf(level);
  return r < 0 ? 0 : r;
}

function normalizeUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Findet den jüngsten QA-Report (JSON) zu einer URL.
 * @param {string} url
 * @param {object} cfg
 * @returns {{report:object, file:string}|null}
 */
function findLatestQaReport(url, cfg) {
  const dir = cfg.absPaths.qaReports;
  if (!fs.existsSync(dir)) return null;

  const target = normalizeUrl(url);
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("report-") && f.endsWith(".json"))
    .map((f) => path.join(dir, f));

  let best = null;
  for (const file of candidates) {
    try {
      const report = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (normalizeUrl(report.url) !== target) continue;
      const ts = new Date(report.timestamp).getTime();
      if (!best || ts > best.ts) {
        best = { report, file, ts };
      }
    } catch (_) {
      /* defekte Datei ignorieren */
    }
  }

  return best ? { report: best.report, file: best.file } : null;
}

/**
 * Bewertet das Gate für eine URL.
 * @param {object} args
 * @param {string} args.url
 * @param {object} args.cfg
 * @returns {{passed:boolean, reason:string, code:string, report?:object, file?:string, score?:number, level?:string, ageHours?:number}}
 */
function evaluateGate({ url, cfg }) {
  const gate = (cfg.qa && cfg.qa.gate) || {};
  const minScore = gate.minScore != null ? gate.minScore : 70;
  const maxAgeHours = gate.maxAgeHours != null ? gate.maxAgeHours : 24;
  const failOnSeverity = gate.failOnSeverity || "high";

  const found = findLatestQaReport(url, cfg);
  if (!found) {
    return {
      passed: false,
      code: "no-report",
      reason: cfg.lang === "en"
        ? `No QA report found for ${url}. Run "cue qa ${url}" first.`
        : `Kein QA-Report für ${url} gefunden. Bitte zuerst "cue qa ${url}" ausführen.`,
    };
  }

  const { report, file } = found;
  const assessment = report.assessment || {};
  const score = assessment.score != null ? assessment.score : 0;
  const level = assessment.level || "high";
  const ageHours = (Date.now() - new Date(report.timestamp).getTime()) / 36e5;

  // Frische
  if (ageHours > maxAgeHours) {
    return {
      passed: false,
      code: "stale",
      report, file, score, level, ageHours,
      reason: cfg.lang === "en"
        ? `QA report is too old (${ageHours.toFixed(1)}h > ${maxAgeHours}h). Re-run "cue qa ${url}".`
        : `QA-Report ist zu alt (${ageHours.toFixed(1)}h > ${maxAgeHours}h). Bitte "cue qa ${url}" erneut ausführen.`,
    };
  }

  // High-Severity
  if (rank(level) >= rank(failOnSeverity) && rank(level) > 0) {
    return {
      passed: false,
      code: "severity",
      report, file, score, level, ageHours,
      reason: cfg.lang === "en"
        ? `QA found "${level}" severity issues (threshold: ${failOnSeverity}). Fix them before promoting.`
        : `QA hat "${level}"-Severity gefunden (Schwelle: ${failOnSeverity}). Bitte zuerst beheben, dann bewerben.`,
    };
  }

  // Score
  if (score < minScore) {
    return {
      passed: false,
      code: "low-score",
      report, file, score, level, ageHours,
      reason: cfg.lang === "en"
        ? `QA score ${score} is below the minimum ${minScore}. Improve quality before promoting.`
        : `QA-Score ${score} liegt unter dem Minimum ${minScore}. Bitte Qualität verbessern, dann bewerben.`,
    };
  }

  return {
    passed: true,
    code: "ok",
    report, file, score, level, ageHours,
    reason: cfg.lang === "en"
      ? `QA gate passed (score ${score}, severity ${level}, ${ageHours.toFixed(1)}h old).`
      : `QA-Gate bestanden (Score ${score}, Severity ${level}, ${ageHours.toFixed(1)}h alt).`,
  };
}

module.exports = { evaluateGate, findLatestQaReport };
