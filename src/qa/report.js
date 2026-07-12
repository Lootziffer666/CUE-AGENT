"use strict";

/**
 * QA-Report-Erzeugung: Markdown (menschlich) + JSON (maschinenlesbar).
 *
 * Das Markdown-Format ist abwärtskompatibel zum bisherigen Report,
 * lediglich um Severity/Score-Kopfzeilen ergänzt.
 */

const path = require("path");
const { t } = require("../i18n");
const { writeText, writeJson } = require("../util");

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

/**
 * Schreibt Markdown + JSON und gibt die Pfade + das JSON-Objekt zurück.
 */
function writeReports({ cfg, ts, url, screenshotName, consoleLogs, network = [], metrics = {}, analysis, assessment, visionSkipped = false }) {
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

  return { mdPath, jsonPath, json };
}

module.exports = { writeReports, buildConsoleText };
