"use strict";

/**
 * Capture-Engine (M1): geteilter Kern für QA und Video-Pipeline.
 *
 * Fährt einen Flow ab (deklarative Schritte), sammelt pro Schritt:
 *  - Screenshot (PNG)
 *  - Zeitstempel im Video (wenn recordVideo aktiv)
 *  - Bounding-Box des fokussierten Elements (für Tutorial-Highlights)
 *  - Console-/Network-/PageError-Logs (global)
 *  - Accessibility-Snapshot (optional)
 *  - Web-Vitals-Metriken (LCP, CLS, FCP)
 *
 * Gibt ein rohes CaptureResult zurück, das von bundle.js in ein
 * persistiertes CaptureBundle geschrieben wird.
 */

const path = require("path");
const { chromium } = require("playwright");
const { ensureDir, timestamp } = require("../util");

/**
 * Führt einen einzelnen Flow-Schritt aus.
 * @returns {Promise<{tClick?:number, bbox?:object}>}
 */
async function executeStep(page, step, videoStartTime, opts = {}) {
  const result = {};
  const now = () => (Date.now() - videoStartTime) / 1000; // Sekunden seit Video-Start
  const navTimeout = opts.navTimeoutMs || 30000;

  switch (step.action) {
    case "goto":
      await page.goto(step.url, { waitUntil: step.waitUntil || "domcontentloaded", timeout: navTimeout });
      break;

    case "click": {
      const el = page.locator(step.selector).first();
      await el.waitFor({ state: "visible", timeout: 10000 });
      result.bbox = await el.boundingBox();
      result.tClick = now();
      await el.click();
      break;
    }

    case "type": {
      const el = page.locator(step.selector).first();
      await el.waitFor({ state: "visible", timeout: 10000 });
      result.bbox = await el.boundingBox();
      result.tClick = now();
      await el.fill(step.text);
      break;
    }

    case "hover": {
      const el = page.locator(step.selector).first();
      await el.waitFor({ state: "visible", timeout: 10000 });
      result.bbox = await el.boundingBox();
      await el.hover();
      break;
    }

    case "select": {
      const el = page.locator(step.selector).first();
      await el.waitFor({ state: "visible", timeout: 10000 });
      result.bbox = await el.boundingBox();
      result.tClick = now();
      await el.selectOption(step.text);
      break;
    }

    case "scroll": {
      if (step.selector) {
        const el = page.locator(step.selector).first();
        await el.scrollIntoViewIfNeeded();
      } else {
        await page.evaluate((y) => window.scrollBy(0, y), step.scrollY || 500);
      }
      break;
    }

    case "wait":
      await page.waitForTimeout(step.ms || 1000);
      break;
  }

  return result;
}

/**
 * Sammelt Web-Vitals-Metriken aus der aktuellen Seite.
 */
async function collectMetrics(page) {
  try {
    return await page.evaluate(() => {
      const perf = performance.getEntriesByType("paint");
      const fcp = perf.find((e) => e.name === "first-contentful-paint");
      // LCP und CLS über PerformanceObserver sind async - Annäherung:
      const nav = performance.getEntriesByType("navigation")[0] || {};
      return {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(nav.loadEventEnd || 0),
      };
    });
  } catch (_) {
    return {};
  }
}

/**
 * Sammelt den Accessibility-Snapshot (kompakt).
 */
async function collectA11y(page) {
  try {
    const snapshot = await page.accessibility.snapshot();
    return snapshot || null;
  } catch (_) {
    return null;
  }
}

/**
 * Haupt-Capture-Funktion.
 *
 * @param {object} args
 * @param {string} args.url                Basis-URL (für Kompatibilität; wird von Flow überschrieben)
 * @param {object} args.cfg                aufgelöste Config
 * @param {{steps:Array, meta:object}} args.flow  Flow-Definition
 * @param {string} args.intent             "qa" | "promo" | "tutorial"
 * @param {string} args.outDir             Ausgabeverzeichnis
 * @param {boolean} [args.recordVideo]     Video aufnehmen (Default: true)
 * @param {boolean} [args.collectA11yTree] A11y-Snapshot (Default: intent=qa)
 * @param {object} [args.logger]
 * @returns {Promise<CaptureResult>}
 */
async function capture({
  url,
  cfg,
  flow,
  intent = "qa",
  outDir,
  recordVideo = true,
  collectA11yTree,
  logger,
}) {
  ensureDir(outDir);
  const screenshotsDir = path.join(outDir, "screenshots");
  ensureDir(screenshotsDir);

  const shouldA11y = collectA11yTree !== undefined ? collectA11yTree : intent === "qa";
  const log = logger || { info() {}, warn() {}, ok() {}, error() {} };
  const viewport = (cfg && cfg.viewport) || { width: 1920, height: 1080 };
  const navTimeoutMs = (cfg && cfg.navTimeoutMs) || 30000;
  const settleMs = (cfg && cfg.settleMs) || 1000;

  log.info(`Capture-Engine gestartet (intent=${intent}, ${flow.steps.length} Schritte)`);

  // Browser starten
  const contextOpts = {
    viewport,
  };
  if (recordVideo) {
    contextOpts.recordVideo = {
      dir: path.join(outDir, "video-raw"),
      size: viewport,
    };
  }

  const browser = await chromium.launch({ headless: true });
  const consoleLogs = [];
  const networkErrors = [];
  const flowResults = [];
  let navOk = true;
  let videoPath = null;
  let a11ySnapshot = null;
  let metrics = {};

  try {
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();

    // Event-Sammler
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleLogs.push({ type, text: msg.text() });
      }
    });
    page.on("pageerror", (error) => {
      consoleLogs.push({ type: "error", text: `[PageError] ${error.message}` });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        networkErrors.push({ url: res.url(), status: res.status() });
      }
    });

    const videoStartTime = Date.now();

    // Flow-Schritte ausführen
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      log.info(`  [${i + 1}/${flow.steps.length}] ${step.action} ${step.id}`);

      try {
        const stepResult = await executeStep(page, step, videoStartTime, { navTimeoutMs });

        // Settle nach jedem Schritt
        await page.waitForTimeout(settleMs);

        // Screenshot — QA standardmäßig fullPage (erfasst auch below-the-fold),
        // Video-Capture nur Viewport. Pro Schritt via step.fullPage übersteuerbar.
        const shotName = `${String(i).padStart(2, "0")}-${step.id}.png`;
        const shotPath = path.join(screenshotsDir, shotName);
        const fullPage = step.fullPage !== undefined ? step.fullPage : intent === "qa";
        await page.screenshot({ path: shotPath, fullPage });

        flowResults.push({
          step: step.id,
          action: step.action,
          screenshot: shotName,
          videoStart: stepResult.tClick || (Date.now() - videoStartTime) / 1000,
          bbox: stepResult.bbox || null,
          goal: step.goal || null,
          narration: step.narration || null,
          caption: step.caption || null,
          focus: step.focus || false,
        });
      } catch (err) {
        navOk = false;
        log.warn(`  Schritt "${step.id}" fehlgeschlagen: ${err.message}`);
        flowResults.push({
          step: step.id,
          action: step.action,
          screenshot: null,
          videoStart: (Date.now() - videoStartTime) / 1000,
          error: err.message,
        });
      }
    }

    // Metriken & A11y am Ende sammeln
    metrics = await collectMetrics(page);
    if (shouldA11y) {
      a11ySnapshot = await collectA11y(page);
    }

    // Video finalisieren
    await page.close();
    if (recordVideo) {
      const video = page.video();
      if (video) {
        videoPath = await video.path();
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }

  // Endgültigen Video-Pfad in outDir kopieren (Playwright legt es in video-raw/ ab)
  let videoFile = null;
  if (videoPath) {
    try {
      const fs = require("fs");
      const dest = path.join(outDir, "capture.webm");
      fs.copyFileSync(videoPath, dest);
      videoFile = "capture.webm";
      log.ok(`Video: ${dest}`);
    } catch (err) {
      log.warn(`Video konnte nicht kopiert werden: ${err.message}`);
    }
  }

  const result = {
    intent,
    url,
    capturedAt: new Date().toISOString(),
    viewport,
    flow: flowResults,
    video: videoFile,
    console: consoleLogs,
    network: networkErrors,
    a11y: a11ySnapshot,
    metrics,
    navOk,
    screenshotsDir: "screenshots",
  };

  log.ok(`Capture abgeschlossen: ${flowResults.length} Schritte, ${consoleLogs.length} Console-Einträge`);
  return result;
}

module.exports = { capture };
