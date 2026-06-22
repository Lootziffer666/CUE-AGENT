"use strict";

/**
 * Parsen & Normalisieren strukturierter QA-Befunde aus der LLM-Antwort.
 *
 * Defensiv: extrahiert das erste JSON-Objekt (auch aus ```json-Blöcken),
 * normalisiert Severity/Kategorie und liefert immer eine valide Struktur.
 */

const SEVERITIES = ["none", "low", "medium", "high", "critical"];

function normalizeSeverity(s) {
  const v = String(s || "").toLowerCase().trim();
  if (v === "crit" || v === "blocker") return "critical";
  return SEVERITIES.includes(v) ? v : "medium";
}

function extractJson(text) {
  if (!text) return null;
  // ```json ... ``` oder ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1] : text;
  // erstes { bis letztes }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  candidate = candidate.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} text  LLM-Rohantwort
 * @returns {{summary:string, score:number|null, findings:Array, parsed:boolean}}
 */
function parseFindings(text) {
  const json = extractJson(text);
  if (!json) {
    return { summary: "", score: null, findings: [], parsed: false, raw: text };
  }
  const findings = Array.isArray(json.findings) ? json.findings : [];
  const normalized = findings
    .filter((f) => f && typeof f === "object")
    .map((f, i) => ({
    id: f.id || `finding-${i + 1}`,
    title: f.title || f.id || `Befund ${i + 1}`,
    severity: normalizeSeverity(f.severity),
    category: (f.category || "technical").toLowerCase(),
    description: f.description || "",
    suggestedFix: f.suggestedFix || f.fix || "",
    location: f.location || "",
  }));
  return {
    summary: json.summary || "",
    score: typeof json.score === "number" ? Math.max(0, Math.min(100, json.score)) : null,
    findings: normalized,
    parsed: true,
  };
}

/** Höchste vorkommende Severity in einer Findings-Liste. */
function highestSeverity(findings) {
  let max = "none";
  for (const f of findings || []) {
    if (SEVERITIES.indexOf(f.severity) > SEVERITIES.indexOf(max)) max = f.severity;
  }
  return max;
}

function countBySeverity(findings) {
  const c = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of findings || []) c[f.severity] = (c[f.severity] || 0) + 1;
  return c;
}

module.exports = { extractJson, parseFindings, highestSeverity, countBySeverity, SEVERITIES, normalizeSeverity };
