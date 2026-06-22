"use strict";

/**
 * Android-QA-Orchestrator — das Pendant zu src/qa für native Android-Apps.
 *
 * Ablauf (spiegelt runQa): Install -> Launch -> autonome Explorations-Schleife
 * (Screenshot + UI-Dump + Logcat je Schritt) -> Severity -> Report (qa-reports/).
 *
 * Exploration: mit konfiguriertem multimodalem Modell (über den ANVIL-BELLOWS-
 * Proxy) entscheidet die KI die nächste Aktion und bewertet die UI; ohne Modell
 * läuft ein heuristischer Explorer (jedes klickbare Element einmal antippen) —
 * Crash-/ANR-Erkennung via Logcat funktioniert in BEIDEN Modi.
 *
 * Wiederverwendung der bestehenden Pipeline: severity.assess/failsGate,
 * report.writeReports, util — keine Duplizierung.
 */

const fs = require("fs");
const path = require("path");
const { makeLogger, timestamp, ensureDir, writeJson } = require("../util");
const { assess, failsGate } = require("../qa/severity");
const { writeReports } = require("../qa/report");
const adb = require("./adb");
const vision = require("./vision");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

/**
 * @param {object} args
 * @param {string} [args.apk]       Pfad zur APK (optional, wenn schon installiert)
 * @param {string} [args.pkg]       Package-Name (Pflicht, falls nicht aus APK ableitbar)
 * @param {object} args.cfg
 * @param {number} [args.maxSteps]  Explorationsschritte (Default 8)
 * @param {string} [args.goal]      optionales Testziel für die KI
 * @param {object} [args.logger]
 */
async function runAndroidQa({ apk, pkg, cfg, maxSteps = 8, goal = "", logger }) {
  const log = logger || makeLogger("ANDROID-QA");

  if (!adb.isAdbAvailable()) {
    throw new Error("adb nicht verfügbar. Android platform-tools installieren oder ADB_PATH setzen.");
  }
  const devices = adb.listDevices();
  if (devices.length === 0) {
    throw new Error("Kein Android-Gerät/Emulator verbunden (adb devices ist leer).");
  }
  const serial = devices[0];
  log.info(`Gerät: ${serial}`);

  if (apk) {
    log.info(`Installiere APK: ${apk}`);
    adb.installApk(apk, serial);
    if (!pkg) pkg = adb.packageFromApk(apk);
  }
  if (!pkg) {
    throw new Error("Package-Name nicht ermittelbar — bitte --package <id> angeben (aapt nicht gefunden).");
  }

  const ts = timestamp();
  const shotDir = ensureDir(path.join(cfg.absPaths.qaReports, `android-${ts}`));
  const useLlm = vision.isConfigured();
  log.info(`Analyse-Modus: ${useLlm ? "multimodal (LLM)" : "Capture-only (heuristisch)"}`);

  adb.clearLogcat(serial);
  adb.launchPackage(pkg, serial);
  await sleep(2500);

  // Foreground-Check direkt nach Start (False => App startete nicht / Crash beim Start)
  const fgAfterLaunch = adb.currentPackage(serial);
  let navOk = fgAfterLaunch === pkg;
  if (!navOk) log.warn(`App nach Start nicht im Vordergrund (fokussiert: ${fgAfterLaunch || "?"}).`);

  const steps = [];
  const visited = new Set();
  const observations = [];
  let crashed = false;
  let anr = false;
  let llmSeverity = "none";
  const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };

  for (let i = 1; i <= maxSteps; i++) {
    let shotRel = null;
    try {
      const png = adb.screencapPng(serial);
      shotRel = `android-${ts}/${pad(i)}.png`;
      fs.writeFileSync(path.join(cfg.absPaths.qaReports, shotRel), png);

      const xml = adb.uiDumpXml(serial);
      const clickables = adb.parseClickables(xml);

      // Crash-Check (Logcat seit clear)
      const lc = adb.logcatDump(serial);
      const cr = adb.detectCrashes(lc, pkg);
      if (cr.crashed) crashed = true;
      if (cr.anr) anr = true;

      // Aktion bestimmen
      let action = null;
      if (useLlm) {
        const a = await vision.analyzeScreen({ imageBuffer: png, clickables, goal });
        if (a && !a._error) {
          if (a.observations) observations.push(`#${i}: ${a.observations}`);
          if (a.bug_found && a.severity && SEV_RANK[a.severity] > SEV_RANK[llmSeverity]) llmSeverity = a.severity;
          const na = a.next_action || {};
          if (na.type === "done") { steps.push({ n: i, screenshot: shotRel, action: "done", clickables: clickables.length }); break; }
          if (na.type === "back") { adb.back(serial); action = "back"; }
          else if (na.type === "tap" && Number.isFinite(na.x) && Number.isFinite(na.y)) { adb.tap(na.x, na.y, serial); action = `tap(${na.x},${na.y})`; }
        } else if (a && a._error) {
          observations.push(`#${i}: LLM-Fehler: ${a._error}`);
        }
      }
      if (!action) {
        // Heuristik: erstes noch nicht besuchtes klickbares Element antippen
        const next = clickables.find((e) => !visited.has(`${e.cx},${e.cy}`));
        if (next) { visited.add(`${next.cx},${next.cy}`); adb.tap(next.cx, next.cy, serial); action = `tap(${next.cx},${next.cy})"${next.text || next.id}"`; }
        else { adb.back(serial); action = "back"; }
      }

      steps.push({ n: i, screenshot: shotRel, action, clickables: clickables.length, crash: cr.crashed || cr.anr });
      if (crashed) { log.error(`Crash erkannt in Schritt ${i}.`); break; }
      await sleep(1200);

      // Falls die App den Vordergrund verlassen hat (und nicht abgestürzt): zurück
      const fg = adb.currentPackage(serial);
      if (fg && fg !== pkg && !crashed) { adb.back(serial); await sleep(600); }
    } catch (e) {
      log.warn(`Schritt ${i} Fehler: ${e.message}`);
      steps.push({ n: i, screenshot: shotRel, action: "error", error: e.message });
    }
  }

  // Abschluss-Logcat + Konsolen-Mapping für severity
  const finalLc = adb.logcatDump(serial);
  const finalCr = adb.detectCrashes(finalLc, pkg);
  if (finalCr.crashed) crashed = true;
  if (finalCr.anr) anr = true;
  const consoleLogs = adb.logcatToConsole(finalLc);

  // Severity: Basis aus Logcat-Konsole + Override durch Crash/ANR und LLM-Urteil
  const assessment = assess({ consoleLogs, navOk });
  const order = ["none", "low", "medium", "high"];
  const bump = (lvl) => { if (order.indexOf(lvl) > order.indexOf(assessment.level)) assessment.level = lvl; };
  bump(llmSeverity);
  if (anr) bump("high");
  if (crashed) { assessment.level = "high"; assessment.score = Math.min(assessment.score, 20); }

  const analysisText =
    (useLlm ? observations.join("\n") : "Capture-only-Modus (kein LLM konfiguriert) — heuristische Exploration.") +
    `\n\nSchritte: ${steps.length} | Crash: ${crashed} | ANR: ${anr}` +
    (finalCr.lines.length ? `\n\nCrash/ANR-Logzeilen:\n${finalCr.lines.join("\n")}` : "");

  const lastShot = steps.filter((s) => s.screenshot).map((s) => s.screenshot).pop() || `android-${ts}/01.png`;

  const { mdPath, jsonPath, json } = writeReports({
    cfg,
    ts,
    url: `android:${pkg}`,
    screenshotName: lastShot,
    consoleLogs,
    analysis: analysisText,
    assessment,
  });

  // Android-spezifisches Detail-Artefakt (Schritte/Aktionen/Screenshots)
  const detailPath = path.join(cfg.absPaths.qaReports, `android-${ts}.json`);
  writeJson(detailPath, {
    tool: "cue-agent",
    intent: "android-qa",
    timestamp: new Date().toISOString(),
    package: pkg,
    device: serial,
    analysisMode: useLlm ? "llm" : "capture-only",
    maxSteps,
    navOk,
    crashed,
    anr,
    assessment,
    steps,
    screenshotsDir: path.relative(cfg.absPaths.qaReports, shotDir),
  });

  log.ok(`Report: ${mdPath}`);
  log.ok(`Detail: ${detailPath}`);

  const gateViolated = failsGate(assessment.level, cfg.qa.failOn);
  if (gateViolated) log.warn(`QA-Gate verletzt: "${assessment.level}" >= "${cfg.qa.failOn}".`);

  return { ok: true, exitCode: gateViolated ? 1 : 0, json, mdPath, jsonPath, detailPath, assessment, steps, package: pkg };
}

module.exports = { runAndroidQa };
