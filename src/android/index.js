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
const flowmod = require("./flow");

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
async function runAndroidQa({ apk, pkg, cfg, maxSteps = 8, goal = "", flowFile = null, logger }) {
  const log = logger || makeLogger("ANDROID-QA");
  const flow = flowFile ? flowmod.loadAndroidFlow(flowFile) : null;
  const flowBaseDir = flowFile ? path.dirname(path.resolve(flowFile)) : process.cwd();

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
  if (!pkg && flow && flow.package) pkg = flow.package;
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
  let flowSeverity = "none";
  const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };
  const bumpRank = (cur, lvl) => (SEV_RANK[lvl] > SEV_RANK[cur] ? lvl : cur);

  // ── Flow-Modus: gewollter vs. tatsächlicher Userflow (Soll-Ist) ──────────
  // Gilt plattform-agnostisch; hier der Android-Adapter (Activity/Text/ID).
  if (flow) {
    log.info(`Flow-Verifikation: ${flow.name || "(unbenannt)"} — ${flow.steps.length} Schritte`);
    let prevActivity = adb.currentActivity(serial);
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const a = step.action || {};
      let actionDesc = a.type;
      let resolved = null;
      try {
        if (a.type === "tap") {
          const clickables = adb.parseClickables(adb.uiDumpXml(serial));
          resolved = flowmod.resolveTarget(a, clickables);
          if (resolved) { adb.tap(resolved.x, resolved.y, serial); actionDesc = `tap ${resolved.matched}`; }
          else actionDesc = `tap UNRESOLVED(${a.text || a.id || "?"})`;
        } else if (a.type === "back") { adb.back(serial); }
        else if (a.type === "text") { adb.inputText(a.value || "", serial); actionDesc = `text "${a.value || ""}"`; }
        else if (a.type === "swipe") { adb.swipe(a.x1, a.y1, a.x2, a.y2, a.ms, serial); }
      } catch (e) { actionDesc += ` (Fehler: ${e.message})`; }
      await sleep(1500);

      const shotRel = `android-${ts}/${pad(i + 1)}.png`;
      try { fs.writeFileSync(path.join(cfg.absPaths.qaReports, shotRel), adb.screencapPng(serial)); } catch (_) {}
      const xmlAfter = adb.uiDumpXml(serial);
      const activity = adb.currentActivity(serial);
      const cr = adb.detectCrashes(adb.logcatDump(serial), pkg);
      if (cr.crashed) crashed = true;
      if (cr.anr) anr = true;

      let res;
      if (a.type === "tap" && !resolved) {
        res = { pass: false, reasons: [`Aktionsziel nicht gefunden: "${a.text || a.id || "?"}"`], landedNowhere: true };
      } else {
        res = flowmod.assertExpectation(step.expect, { activity, xml: xmlAfter, prevActivity });
      }
      if (cr.crashed) { res.pass = false; res.reasons.push("App abgestürzt"); }

      // expect.baseline: Design-Messlatte des Ziel-Screens prüfen (optional).
      let design = null;
      if (step.expect && step.expect.baseline) {
        try {
          const b = flowmod.assertBaselineFromXml(step.expect.baseline, xmlAfter, flowBaseDir);
          design = { score: b.score, severity: b.severity, minScore: b.minScore, passed: b.compare.passed, failed: b.compare.failed, missing: b.compare.missing };
          if (!b.pass) {
            res.pass = false;
            res.reasons.push(...b.reasons);
            flowSeverity = bumpRank(flowSeverity, b.severity === "high" ? "high" : "medium");
          }
        } catch (e) {
          res.pass = false;
          res.reasons.push(`Baseline-Fehler: ${e.message}`);
          flowSeverity = bumpRank(flowSeverity, "medium");
        }
      }

      steps.push({
        n: i + 1, id: step.id, screenshot: shotRel, action: actionDesc,
        expected: step.expect || {}, actual: { activity }, pass: res.pass,
        reasons: res.reasons, landedNowhere: !!res.landedNowhere,
        design,
      });
      observations.push(
        `${res.pass ? "✓ PASS" : "✗ FAIL"} [${step.id}] ${actionDesc} → ${activity || "—"}` +
        (design ? ` | Design ${design.score}/100` : "") +
        (res.reasons.length ? ` | ${res.reasons.join("; ")}` : "")
      );
      if (!res.pass) flowSeverity = bumpRank(flowSeverity, res.landedNowhere ? "high" : "medium");
      prevActivity = activity;
      if (crashed) { log.error(`Crash in Flow-Schritt ${step.id}.`); break; }
    }
    navOk = steps.every((s) => s.pass);
  }

  const effectiveMax = flow ? 0 : maxSteps;
  for (let i = 1; i <= effectiveMax; i++) {
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
  bump(flowSeverity);
  if (anr) bump("high");
  if (crashed) { assessment.level = "high"; assessment.score = Math.min(assessment.score, 20); }

  const passed = steps.filter((s) => s.pass === true).length;
  const failed = steps.filter((s) => s.pass === false).length;
  const head = flow
    ? `Flow-Verifikation (Soll-Ist) "${flow.name || ""}": ${passed} PASS / ${failed} FAIL\n` + observations.join("\n")
    : useLlm
      ? observations.join("\n")
      : "Capture-only-Modus (kein LLM konfiguriert) — heuristische Exploration.";
  const analysisText =
    head +
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
    analysisMode: flow ? "flow" : useLlm ? "llm" : "capture-only",
    flow: flow ? { name: flow.name || null, steps: flow.steps.length } : null,
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
