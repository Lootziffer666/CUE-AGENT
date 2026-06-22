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

function buildMarkdown({ lang, url, screenshotName, consoleText, analysis, assessment, label, isoTime }) {
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

## ${t(lang, "analysisSection")} (${label})

${analysis}

---

*${t(lang, "generatedBy")}*
`;
}

/**
 * Schreibt Markdown + JSON und gibt die Pfade + das JSON-Objekt zurück.
 */
function writeReports({ cfg, ts, url, screenshotName, consoleLogs, analysis, assessment }) {
  const lang = cfg.lang;
  const isoTime = new Date().toISOString();
  const consoleText = buildConsoleText(consoleLogs, lang);

  const md = buildMarkdown({
    lang,
    url,
    screenshotName,
    consoleText,
    analysis,
    assessment,
    label: cfg.modelLabel,
    isoTime,
  });

  const json = {
    tool: "cue-agent",
    intent: "qa",
    timestamp: isoTime,
    url,
    lang,
    model: cfg.model,
    screenshot: screenshotName,
    assessment,
    console: consoleLogs,
    analysis,
  };

  const mdPath = path.join(cfg.absPaths.qaReports, `report-${ts}.md`);
  const jsonPath = path.join(cfg.absPaths.qaReports, `report-${ts}.json`);
  writeText(mdPath, md);
  writeJson(jsonPath, json);

  return { mdPath, jsonPath, json };
}

module.exports = { writeReports, buildConsoleText };
