"use strict";

/**
 * QA-Report-Erzeugung: Markdown (menschlich) + JSON (maschinenlesbar).
 *
 * Das Markdown-Format ist abwärtskompatibel zum bisherigen Report,
 * lediglich um Severity/Score-Kopfzeilen ergänzt.
 */

const os = require("os");
const path = require("path");
const { t } = require("../i18n");
const { writeText, writeJson } = require("../util");
const pkg = require("../../package.json");

function buildConsoleText(consoleLogs, lang) {
  if (!consoleLogs || consoleLogs.length === 0) {
    return t(lang, "noConsoleIssues");
  }
  return consoleLogs.map((l) => `[${l.type.toUpperCase()}] ${l.text}`).join("\n");
}

function buildNetworkText(network, lang) {
  if (!network || network.length === 0) {
    return lang === "en" ? "No failed requests (HTTP < 400)." : "Keine fehlgeschlagenen Requests (HTTP < 400).";
  }
  return network.map((n) => `[${n.status}] ${n.url}`).join("\n");
}

function buildMarkdown({ lang, url, screenshotName, consoleText, networkText, analysis, assessment, label, isoTime }) {
  const netHeading = lang === "en" ? "Network (HTTP >= 400)" : "Netzwerk (HTTP >= 400)";
  return `# ${t(lang, "reportHeading")}

**Timestamp:** ${isoTime}
**URL:** ${url}
**Severity:** ${assessment.level}  |  **Score:** ${assessment.score}/100
**Screenshot:** ${screenshotName}

---

## ${t(lang, "consoleSection")}

\`\`\`
${consoleText}
\`\`\`

---

## ${netHeading}

\`\`\`
${networkText}
\`\`\`

---

## ${t(lang, "analysisSection")} (${label})

${analysis}

---

*${t(lang, "generatedBy")}*
`;
}


function normalizeEvidenceList(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function normalizeCheck(check) {
  const evidence = normalizeEvidenceList(check.evidence);
  const out = {
    id: String(check.id || "check"),
    label: String(check.label || check.id || "Check"),
    ok: check.ok === true,
    signals: check.signals && typeof check.signals === "object" ? check.signals : {},
    evidence,
  };
  if (!evidence.length) out.evidenceNote = check.evidenceNote || "Für diesen Check liegt kein separates Artefakt vor.";
  return out;
}

function normalizeFinding(finding) {
  const evidence = normalizeEvidenceList(finding.evidence);
  const out = {
    severity: ["none", "low", "medium", "high"].includes(finding.severity) ? finding.severity : "medium",
    category: String(finding.category || "finding"),
    message: String(finding.message || finding.text || "Befund ohne Nachricht"),
    evidence,
  };
  if (!evidence.length) out.evidenceNote = finding.evidenceNote || "Für diesen Befund liegt kein separates Artefakt vor.";
  return out;
}

function defaultEnvironment(driver) {
  return {
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
    driver: driver || "web",
    device: null,
  };
}

function buildVerdictReport({ command, target, startedAt, finishedAt, verdict, score, severity, checks, findings = [], signals = {}, evidence = [], environment = {}, exitCode }) {
  return {
    schema: "cue.verdict/1",
    tool: "cue-agent",
    version: pkg.version,
    command,
    target,
    startedAt,
    finishedAt,
    verdict,
    score: Math.max(0, Math.min(100, Number(score) || 0)),
    severity: ["none", "low", "medium", "high"].includes(severity) ? severity : "none",
    checks: (checks || []).map(normalizeCheck),
    findings: (findings || []).map(normalizeFinding),
    signals,
    evidence: (evidence || []).map((item) => ({
      path: String(item.path),
      kind: String(item.kind || "artifact"),
      label: String(item.label || item.path),
    })),
    environment: { ...defaultEnvironment(environment.driver), ...environment },
    exitCode: Number.isInteger(exitCode) ? exitCode : 0,
  };
}

function writeVerdict(dir, verdict) {
  const report = buildVerdictReport(verdict);
  const verdictPath = path.join(dir, "verdict.json");
  writeJson(verdictPath, report);
  return { verdictPath, verdict: report };
}

/**
 * Schreibt Markdown + JSON und gibt die Pfade + das JSON-Objekt zurück.
 */
function writeReports({ cfg, ts, url, screenshotName, consoleLogs = [], network = [], metrics = {}, analysis, assessment, visionSkipped = false }) {
  const lang = cfg.lang;
  const isoTime = new Date().toISOString();
  const consoleText = buildConsoleText(consoleLogs, lang);
  const networkText = buildNetworkText(network, lang);

  // Label/Modell provider-abhängig
  const provider = (cfg.llm && cfg.llm.provider) || "anthropic";
  const activeModel = provider === "anthropic"
    ? cfg.model
    : (cfg.llm.openai && cfg.llm.openai.model) || cfg.model;
  const baseLabel = provider === "anthropic"
    ? cfg.modelLabel
    : `${activeModel} (${provider})`;
  // Bei übersprungener Vision-Analyse klar kennzeichnen (kein Key vorhanden).
  const label = visionSkipped
    ? (lang === "en" ? "vision skipped — no LLM key" : "Vision übersprungen — kein LLM-Key")
    : baseLabel;

  const md = buildMarkdown({
    lang,
    url,
    screenshotName,
    consoleText,
    networkText,
    analysis,
    assessment,
    label,
    isoTime,
  });

  const json = {
    tool: "cue-agent",
    intent: "qa",
    timestamp: isoTime,
    url,
    lang,
    provider,
    model: visionSkipped ? null : activeModel,
    visionSkipped,
    screenshot: screenshotName,
    assessment,
    console: consoleLogs,
    network,
    metrics,
    analysis,
  };

  const mdPath = path.join(cfg.absPaths.qaReports, `report-${ts}.md`);
  const jsonPath = path.join(cfg.absPaths.qaReports, `report-${ts}.json`);
  writeText(mdPath, md);
  writeJson(jsonPath, json);

  const exitCode = assessment.level === "high" ? 1 : 0;
  const { verdictPath } = writeVerdict(cfg.absPaths.qaReports, {
    command: "qa",
    target: { kind: "url", value: url, platform: "web" },
    startedAt: isoTime,
    finishedAt: new Date().toISOString(),
    verdict: exitCode === 0 ? "READY" : "NOT READY",
    score: assessment.score,
    severity: assessment.level,
    checks: [
      { id: "capture", label: "Screenshot und technische Signale wurden erfasst", ok: true, evidence: [screenshotName] },
      { id: "severity-gate", label: `Severity ${assessment.level} bei Score ${assessment.score}`, ok: exitCode === 0, evidence: [], signals: assessment },
    ],
    findings: [],
    signals: { consoleErrors: consoleLogs.length, networkErrors: network.length, visionSkipped },
    evidence: [{ path: screenshotName, kind: "screenshot", label: "QA-Screenshot" }],
    environment: { driver: "web" },
    exitCode,
  });

  return { mdPath, jsonPath, verdictPath, json };
}

module.exports = { writeReports, writeVerdict, buildVerdictReport, buildConsoleText };
