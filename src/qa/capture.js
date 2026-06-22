"use strict";

/**
 * QA-Capture (M0): repliziert das bisherige Verhalten — Vollseiten-Screenshot
 * plus Konsolen-/PageError-Logs via Playwright Chromium.
 *
 * In M1 wird hieraus die geteilte Capture-Engine mit Flow-Runner, recordVideo,
 * A11y-Tree und Metriken. Die Signatur ist bereits darauf vorbereitet.
 */

const path = require("path");
const { chromium } = require("playwright");
const { ensureDir } = require("../util");

/**
 * @param {object} args
 * @param {string} args.url Ziel-URL
 * @param {object} args.cfg aufgelöste Config
 * @param {string} args.outDir Verzeichnis für Screenshot
 * @param {string} args.screenshotName Dateiname des Screenshots
 * @param {object} [args.logger]
 * @returns {Promise<{screenshotPath:string, consoleLogs:Array, navOk:boolean}>}
 */
async function captureForQa({ url, cfg, outDir, screenshotName, logger }) {
  ensureDir(outDir);
  const screenshotPath = path.join(outDir, screenshotName);

  if (logger) logger.info("Browser wird gestartet ...");

  const browser = await chromium.launch({ headless: true });
  const consoleLogs = [];
  let navOk = true;

  try {
    const context = await browser.newContext({ viewport: cfg.viewport });
    const page = await context.newPage();

    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleLogs.push({ type, text: msg.text() });
      }
    });
    page.on("pageerror", (error) => {
      consoleLogs.push({ type: "error", text: `[PageError] ${error.message}` });
    });

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: cfg.navTimeoutMs });
    } catch (err) {
      navOk = false;
      if (logger) logger.warn(`Navigation erreichte networkidle nicht: ${err.message}`);
    }

    await page.waitForTimeout(cfg.settleMs);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (logger) logger.ok(`Screenshot gespeichert: ${screenshotPath}`);
  } finally {
    await browser.close();
  }

  return { screenshotPath, consoleLogs, navOk };
}

module.exports = { captureForQa };
