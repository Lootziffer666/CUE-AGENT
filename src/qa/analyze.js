"use strict";

/**
 * QA-Analyse: schickt Screenshot + Konsolen-Logs an Claude (Vision).
 */

const fs = require("fs");
const { LlmClient } = require("../llm/client");
const { QA_SYSTEM_PROMPT, qaUserMessage } = require("../i18n");
const { buildConsoleText } = require("./report");

/**
 * @param {object} args
 * @param {object} args.cfg
 * @param {string} args.url
 * @param {string} args.screenshotPath
 * @param {Array} args.consoleLogs
 * @returns {Promise<string>} Analysetext
 */
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

module.exports = { analyze };
