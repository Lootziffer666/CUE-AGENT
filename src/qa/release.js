"use strict";

/**
 * Release-Readiness: entscheidet, ob ein Produkt veröffentlichungsreif ist.
 *
 * Kombiniert strukturierte Findings, Severity, Score, Konsolen-/Netzwerkfehler
 * und Web-Vitals zu einem klaren Urteil READY / NOT READY mit Checkliste.
 */

const { SEVERITIES, highestSeverity, countBySeverity } = require("./findings");

function rank(sev) {
  const r = SEVERITIES.indexOf(sev);
  return r < 0 ? 0 : r;
}

/**
 * @param {object} args
 * @param {Array}  args.findings        strukturierte Befunde
 * @param {number} args.score           QA-Score (0-100)
 * @param {Array}  [args.consoleLogs]
 * @param {Array}  [args.network]       Einträge mit status >= 400
 * @param {object} [args.metrics]       { lcp, cls, fcp, ... }
 * @param {object} args.cfg
 * @returns {{ready:boolean, verdict:string, score:number, blockers:string[], warnings:string[], checklist:Array, counts:object}}
 */
function evaluateRelease({ findings = [], score = 0, consoleLogs = [], network = [], metrics = {}, cfg }) {
  const rc = (cfg.qa && cfg.qa.release) || {};
  const minScore = rc.minScore != null ? rc.minScore : 80;
  const blockOnSeverity = rc.blockOnSeverity || "high"; // high & critical blockieren
  const allowConsoleErrors = rc.allowConsoleErrors || false;
  const allow5xx = rc.allow5xx || false;
  const lcpBudgetMs = rc.lcpBudgetMs || 2500;
  const clsBudget = rc.clsBudget != null ? rc.clsBudget : 0.1;
  const lang = cfg.lang;

  const blockers = [];
  const warnings = [];
  const counts = countBySeverity(findings);

  // 1) Severity der Findings
  const worst = highestSeverity(findings);
  const severityBlocks = rank(worst) >= rank(blockOnSeverity) && rank(worst) > 0;
  if (severityBlocks) {
    const n = findings.filter((f) => rank(f.severity) >= rank(blockOnSeverity)).length;
    blockers.push(
      lang === "en"
        ? `${n} finding(s) at severity "${worst}" (block threshold: ${blockOnSeverity})`
        : `${n} Befund(e) mit Severity "${worst}" (Blockier-Schwelle: ${blockOnSeverity})`
    );
  } else if (counts.medium > 0) {
    warnings.push(lang === "en" ? `${counts.medium} medium finding(s)` : `${counts.medium} mittlere Befunde`);
  }

  // 2) Score
  if (score < minScore) {
    blockers.push(
      lang === "en"
        ? `QA score ${score} below minimum ${minScore}`
        : `QA-Score ${score} unter Minimum ${minScore}`
    );
  }

  // 3) Konsolen-Fehler
  const consoleErrors = (consoleLogs || []).filter((l) => l && l.type === "error").length;
  if (consoleErrors > 0 && !allowConsoleErrors) {
    blockers.push(
      lang === "en" ? `${consoleErrors} console error(s)` : `${consoleErrors} Konsolen-Fehler`
    );
  }

  // 4) Netzwerk 5xx
  const fivexx = (network || []).filter((n) => n && typeof n.status === "number" && n.status >= 500).length;
  if (fivexx > 0 && !allow5xx) {
    blockers.push(lang === "en" ? `${fivexx} server error(s) (5xx)` : `${fivexx} Server-Fehler (5xx)`);
  }
  const fourxx = (network || []).filter((n) => n && typeof n.status === "number" && n.status >= 400 && n.status < 500).length;
  if (fourxx > 0) {
    warnings.push(lang === "en" ? `${fourxx} request(s) with 4xx` : `${fourxx} Requests mit 4xx`);
  }

  // 5) Web-Vitals (Warnungen, keine Blocker)
  if (metrics && typeof metrics.lcp === "number" && metrics.lcp > lcpBudgetMs) {
    warnings.push(`LCP ${metrics.lcp}ms > ${lcpBudgetMs}ms`);
  }
  if (metrics && typeof metrics.cls === "number" && metrics.cls > clsBudget) {
    warnings.push(`CLS ${metrics.cls} > ${clsBudget}`);
  }

  const ready = blockers.length === 0;
  const verdict = ready
    ? (lang === "en" ? "READY for release" : "VERÖFFENTLICHUNGSREIF")
    : (lang === "en" ? "NOT READY" : "NICHT BEREIT");

  const checklist = [
    { label: lang === "en" ? `No high/critical findings` : `Keine hohen/kritischen Befunde`, ok: !severityBlocks },
    { label: lang === "en" ? `Score >= ${minScore}` : `Score >= ${minScore}`, ok: score >= minScore },
    { label: lang === "en" ? `No console errors` : `Keine Konsolen-Fehler`, ok: consoleErrors === 0 },
    { label: lang === "en" ? `No 5xx responses` : `Keine 5xx-Antworten`, ok: fivexx === 0 },
  ];

  return { ready, verdict, score, blockers, warnings, checklist, counts, worstSeverity: worst };
}

module.exports = { evaluateRelease };
