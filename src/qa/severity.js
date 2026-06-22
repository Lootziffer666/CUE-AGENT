"use strict";

/**
 * Severity-Grundlage (M0).
 *
 * Bewusst einfach gehalten: leitet aus Konsolen-Logs und Navigations-Status
 * einen groben Score + Severity-Level ab. In M1 kommt die LLM-gestützte
 * Befund-Kategorisierung hinzu; die Schnittstelle (level, score, failsGate)
 * bleibt stabil.
 */

const LEVELS = ["none", "low", "medium", "high"];

function rank(level) {
  return LEVELS.indexOf(level);
}

/**
 * @param {object} args
 * @param {Array<{type:string,text:string}>} args.consoleLogs
 * @param {boolean} args.navOk
 * @returns {{level:string, score:number, errors:number, warnings:number}}
 */
function assess({ consoleLogs = [], navOk = true }) {
  const errors = consoleLogs.filter((l) => l.type === "error").length;
  const warnings = consoleLogs.filter((l) => l.type === "warning").length;

  let score = 100;
  if (!navOk) score -= 25;
  score -= errors * 15;
  score -= warnings * 5;
  score = Math.max(0, Math.min(100, score));

  let level = "none";
  if (!navOk || errors > 0) level = "high";
  else if (warnings > 2) level = "medium";
  else if (warnings > 0) level = "low";

  return { level, score, errors, warnings };
}

/**
 * Entscheidet, ob der konfigurierte Schwellwert verletzt ist (CI-Exit-Code).
 * @param {string} level ermittelte Severity
 * @param {string} failOn Schwelle aus cfg.qa.failOn (none|low|medium|high)
 * @returns {boolean} true => Gate verletzt (Exit != 0)
 */
function failsGate(level, failOn) {
  // Ungültige/unbekannte Schwelle (z. B. --fail-on ohne Wert => true) ignorieren,
  // sonst würde rank(failOn) === -1 jede Severity > 0 fälschlich blockieren.
  if (!failOn || failOn === "none" || !LEVELS.includes(failOn)) return false;
  return rank(level) >= rank(failOn) && rank(level) > 0;
}

module.exports = { assess, failsGate, LEVELS };
