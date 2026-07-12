"use strict";

/**
 * QA-Analyse: schickt Screenshot + Konsolen-Logs an das LLM (Vision).
 * - analyze(): Prosa-Analyse (für den lesbaren Report)
 * - analyzeStructured(): maschinenlesbare Findings (für QA-Loop & Release)
 */

const fs = require("fs");
const { LlmClient } = require("../llm/client");
const { QA_SYSTEM_PROMPT, QA_STRUCTURED_PROMPT, qaUserMessage } = require("../i18n");
const { buildConsoleText } = require("./report");
const { parseFindings } = require("./findings");

async function analyze({ cfg, url, screenshotPath, consoleLogs }) {
  const lang = cfg.lang;
  const imageBase64 = fs.readFileSync(screenshotPath).toString("base64");
  const consoleText = buildConsoleText(consoleLogs, lang);

  const client = new LlmClient(cfg);
  const text = await client.analyzeImage({
    system: QA_SYSTEM_PROMPT[lang] || QA_SYSTEM_PROMPT.de,
    text: qaUserMessage(lang, url, consoleText),
    imageBase64,
    mediaType: "image/png",
  });

  return text || (lang === "en" ? "No analysis returned." : "Keine Analyse erhalten.");
}

/**
 * Strukturierte Analyse → { summary, score, findings, parsed }.
 */
async function analyzeStructured({ cfg, url, screenshotPath, consoleLogs }) {
  const lang = cfg.lang;
  const imageBase64 = fs.readFileSync(screenshotPath).toString("base64");
  const consoleText = buildConsoleText(consoleLogs, lang);

  const client = new LlmClient(cfg);
  const raw = await client.analyzeImage({
    system: QA_STRUCTURED_PROMPT[lang] || QA_STRUCTURED_PROMPT.de,
    text: qaUserMessage(lang, url, consoleText),
    imageBase64,
    mediaType: "image/png",
  });

  return parseFindings(raw);
}

module.exports = { analyze, analyzeStructured };
