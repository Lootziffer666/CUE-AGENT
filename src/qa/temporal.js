"use strict";

/**
 * `cue temporal-check <url>` — zeitliche Konsistenz-Prüfung (assetpilot.md).
 *
 * Fährt eine Sequenz aus Idle-, Übergangs- und Zustands-Phasen durch und
 * bewertet die Frames mit den reinen Metriken aus frame-metrics.js:
 *  - Idle darf nicht statisch wirken (SHADED-Szenen „leben") bzw. nicht flackern
 *  - Übergänge (Regen-/Licht-Rampen) dürfen keine Sprünge enthalten
 *  - Zustandswechsel (Tag→Nacht) müssen sichtbar wirken
 *
 * Erkennt SHADEDs API-Vertrag (window.SHADED: isReady/setParams/applyAct) und
 * steuert dann die Weltparameter direkt — komplett key-frei/deterministisch.
 * Ohne SHADED läuft ein generischer Modus (Idle-Sampling: Stabilität/Flackern).
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { makeLogger, slugify, timestamp, ensureDir, writeJson, writeText, resolveChromiumExecutable } = require("../util");
const { analyzeSequence } = require("./frame-metrics");
const { writeVerdict } = require("./report");
const { detectWebProbe } = require("../probe/client");
const { getDriver } = require("../drivers");

const SAMPLE_W = 128;
const SAMPLE_H = 72;

/** Screenshot-PNG-Puffer im Browser dekodieren und auf Analysegröße verkleinern. */
async function decodeFrames(probePage, buffers) {
  const b64 = buffers.map((b) => b.toString("base64"));
  return probePage.evaluate(
    async ({ shots, w, h }) => {
      const out = [];
      for (const s of shots) {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("PNG-Dekodierung fehlgeschlagen"));
          img.src = "data:image/png;base64," + s;
        });
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, w, h);
        out.push(Array.from(x.getImageData(0, 0, w, h).data));
      }
      return out;
    },
    { shots: b64, w: SAMPLE_W, h: SAMPLE_H }
  );
}

async function runTemporalCheck({ url, cfg, outDir, logger, thresholds, platform = "web", target = null, driver = null }) {
  if (driver || platform !== "web") {
    return runTemporalCheckWithDriver({ url, cfg, outDir, logger, thresholds, platform, target, driver });
  }
  const log = logger || makeLogger("TEMPORAL");
  if (!url) throw new Error("temporal-check braucht eine URL (Argument oder cue.config.json targetUrl)");

  const dir = ensureDir(outDir || path.join(process.cwd(), "temporal-reports", `${slugify(url)}-${timestamp()}`));
  const shotsDir = ensureDir(path.join(dir, "frames"));

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(chromium),
    args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const viewport = (cfg && cfg.viewport) || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const probe = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

  const startedAt = new Date().toISOString();
  const captured = []; // { phase, kind, buffer, saveAs? }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const grab = async (phase, kind, saveAs) => {
    const buffer = await page.screenshot({ type: "png" });
    captured.push({ phase, kind, buffer, saveAs });
  };

  let mode = "generic";
  try {
    log.info(`Lade ${url} …`);
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await wait(800);

    const probeClient = await detectWebProbe(page);
    let probeReady = false;
    if (probeClient) {
      probeReady = await Promise.resolve(probeClient.ready()).catch(() => false);
      if (!probeReady) log.warn(`${probeClient.kind} gefunden, aber nicht bereit — generischer Modus.`);
    }

    if (probeClient && probeReady && (probeClient.kind === "cue-probe" || probeClient.kind === "shaded-shim")) {
      mode = probeClient.kind === "cue-probe" ? "cue-probe" : "shaded";
      log.info(`${probeClient.kind} erkannt — fahre Weltparameter-Sequenz (Idle → Regen-Rampe → Nacht).`);

      // Deterministischer Ausgangszustand
      await probeClient.setParams({ dayNight: 0, rain: 0, storm: 0, fog: 0.15, wet: 0, puddle: 0 });
      await wait(900);

      // Phase 1: Idle — die Szene muss von sich aus leben
      for (let i = 0; i < 8; i++) {
        await grab("idle_tag", "idle", i === 0 ? "phase1-idle-start.png" : null);
        await wait(320);
      }

      // Phase 2: gradueller Wetter-Übergang (Regen-Rampe) — keine Sprünge
      for (let step = 0; step <= 10; step++) {
        const v = step / 10;
        await probeClient.setParams({ rain: v, wet: v * 0.8, puddle: v * 0.6 });
        await wait(260);
        await grab("ramp_regen", "transition", step === 10 ? "phase2-regen-voll.png" : null);
      }

      // Phase 3: Zustandswechsel Tag → Nacht — muss sichtbar wirken
      await probeClient.setParams({ dayNight: 1 });
      await wait(900);
      for (let i = 0; i < 3; i++) {
        await grab("nacht", "state", i === 0 ? "phase3-nacht.png" : null);
        await wait(320);
      }
    } else {
      log.info("Kein SHADED-Vertrag — generischer Modus (Idle-Stabilität/Flackern).");
      for (let i = 0; i < 12; i++) {
        await grab("idle", "idle", i === 0 ? "phase1-idle-start.png" : i === 11 ? "phase1-idle-ende.png" : null);
        await wait(400);
      }
    }

    // Beweis-Frames sichern
    for (const c of captured) {
      if (c.saveAs) fs.writeFileSync(path.join(shotsDir, c.saveAs), c.buffer);
    }

    log.info(`Dekodiere ${captured.length} Frames (${SAMPLE_W}×${SAMPLE_H}) …`);
    const decoded = await decodeFrames(probe, captured.map((c) => c.buffer));
    const frames = captured.map((c, i) => ({ phase: c.phase, kind: c.kind, data: decoded[i] }));

    const analysis = analyzeSequence(frames, {
      thresholds: thresholds || cfg?.qa?.thresholds?.web?.temporal,
      expectAlive: mode === "shaded" || mode === "cue-probe", // instrumentierte Szenen MÜSSEN sich bewegen
    });

    if (consoleErrors.length) {
      analysis.findings.push({
        severity: "medium",
        category: "console",
        phase: "-",
        message: `${consoleErrors.length} Konsolen-/Seitenfehler während der Sequenz (erster: ${consoleErrors[0].slice(0, 160)})`,
      });
    }

    const json = {
      url,
      mode,
      sampledAt: new Date().toISOString(),
      frameCount: captured.length,
      phases: analysis.phases,
      findings: analysis.findings,
      score: analysis.score,
      verdict: analysis.verdict,
      consoleErrors: consoleErrors.length,
      reportDir: dir,
    };
    writeJson(path.join(dir, "temporal-report.json"), json);
    writeText(path.join(dir, "TEMPORAL-CONSISTENCY.md"), renderReport(json));
    const evidence = captured.filter((c) => c.saveAs).map((c) => ({ path: path.join("frames", c.saveAs), kind: "frame", label: c.phase }));
    const evidencePaths = evidence.map((item) => item.path);
    const exitCode = json.verdict === "KONSISTENT" ? 0 : 1;
    writeVerdict(dir, {
      command: "temporal-check",
      target: { kind: "url", value: url, platform: "web" },
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: json.verdict,
      score: json.score,
      severity: json.verdict === "KONSISTENT" ? "none" : "high",
      checks: json.phases.map((phase) => ({
        id: `phase-${phase.phase}`,
        label: `Phase ${phase.phase} (${phase.kind})`,
        ok: !json.findings.some((finding) => finding.phase === phase.phase),
        signals: phase,
        evidence: evidencePaths,
      })),
      findings: json.findings.map((finding) => ({ ...finding, evidence: evidencePaths })),
      signals: { frameCount: json.frameCount, consoleErrors: json.consoleErrors, mode: json.mode },
      evidence,
      environment: { driver: "web" },
      exitCode,
    });
    log.ok(`Report: ${path.join(dir, "TEMPORAL-CONSISTENCY.md")}`);
    log[json.verdict === "KONSISTENT" ? "ok" : "warn"](`Verdict: ${json.verdict} (Score ${json.score})`);

    return { json, exitCode };
  } finally {
    await browser.close().catch(() => {});
  }
}


async function runTemporalCheckWithDriver({ url, cfg, outDir, logger, thresholds, platform, target, driver }) {
  const log = logger || makeLogger("TEMPORAL");
  const driverId = platform || (driver && driver.id) || "web";
  const activeDriver = driver || getDriver(driverId);
  const targetValue = target || url;
  if (!targetValue) throw new Error(`temporal-check braucht ein Ziel für Plattform "${driverId}".`);

  const label = typeof targetValue === "string" ? targetValue : (targetValue.pkg || targetValue.apk || JSON.stringify(targetValue));
  const dir = ensureDir(outDir || path.join(process.cwd(), "temporal-reports", `${slugify(`${driverId}-${label}`)}-${timestamp()}`));
  const shotsDir = ensureDir(path.join(dir, "frames"));
  const startedAt = new Date().toISOString();
  const session = await activeDriver.launch(targetValue, { viewport: cfg && cfg.viewport, logger: log });
  const captured = [];

  try {
    for (let i = 0; i < 12; i++) {
      const data = await session.frame();
      const saveAs = i === 0 ? "phase1-idle-start.png" : i === 11 ? "phase1-idle-ende.png" : null;
      if (saveAs) fs.writeFileSync(path.join(shotsDir, saveAs), await session.screenshot());
      captured.push({ phase: "idle", kind: "idle", data, saveAs });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const analysis = analyzeSequence(captured, {
      thresholds: thresholds || cfg?.qa?.thresholds?.[driverId]?.temporal || cfg?.qa?.thresholds?.web?.temporal,
      expectAlive: driverId === "gameproc",
    });
    const logs = activeDriver.capabilities.logs ? await session.logs().catch(() => []) : [];
    const errorLogs = logs.filter((entry) => entry.type === "error");
    if (errorLogs.length) {
      analysis.findings.push({ severity: "medium", category: "logs", phase: "-", message: `${errorLogs.length} Fehler im Treiber-Log (erster: ${errorLogs[0].text.slice(0, 160)})` });
      analysis.score = Math.max(0, analysis.score - 15);
      if (analysis.verdict === "KONSISTENT") analysis.verdict = "AUFFAELLIG";
    }

    const json = {
      url: `${driverId}:${label}`,
      mode: `driver:${driverId}`,
      sampledAt: new Date().toISOString(),
      frameCount: captured.length,
      phases: analysis.phases,
      findings: analysis.findings,
      score: analysis.score,
      verdict: analysis.verdict,
      consoleErrors: errorLogs.length,
      reportDir: dir,
    };
    writeJson(path.join(dir, "temporal-report.json"), json);
    writeText(path.join(dir, "TEMPORAL-CONSISTENCY.md"), renderReport(json));
    const evidence = captured.filter((c) => c.saveAs).map((c) => ({ path: path.join("frames", c.saveAs), kind: "frame", label: c.phase }));
    const evidencePaths = evidence.map((item) => item.path);
    const exitCode = json.verdict === "KONSISTENT" ? 0 : 1;
    writeVerdict(dir, {
      command: "temporal-check",
      target: { kind: driverId === "android" ? "apk" : "target", value: label, platform: driverId },
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: json.verdict,
      score: json.score,
      severity: json.verdict === "KONSISTENT" ? "none" : "high",
      checks: json.phases.map((phase) => ({ id: `phase-${phase.phase}`, label: `Phase ${phase.phase} (${phase.kind})`, ok: !json.findings.some((finding) => finding.phase === phase.phase), signals: phase, evidence: evidencePaths })),
      findings: json.findings.map((finding) => ({ ...finding, evidence: evidencePaths })),
      signals: { frameCount: json.frameCount, consoleErrors: json.consoleErrors, mode: json.mode },
      evidence,
      environment: { driver: driverId, device: targetValue.serial || null },
      exitCode,
    });
    log[exitCode === 0 ? "ok" : "warn"](`Verdict: ${json.verdict} (Score ${json.score})`);
    return { json, exitCode };
  } finally {
    await session.stop().catch(() => {});
  }
}

function renderReport(json) {
  const lines = [];
  lines.push("# Zeitliche Konsistenz — Prüfbericht");
  lines.push("");
  lines.push(`- **URL:** ${json.url}`);
  lines.push(`${json.mode === "cue-probe" ? "- **Modus:** CUE-PROBE-Weltparameter-Sequenz" : `- **Modus:** ${json.mode === "shaded" ? "SHADED-Weltparameter-Sequenz" : "generisches Idle-Sampling"}`}`);
  lines.push(`- **Frames:** ${json.frameCount} · **Zeitpunkt:** ${json.sampledAt}`);
  lines.push(`- **Verdict:** **${json.verdict}** · **Score:** ${json.score}/100`);
  lines.push("");
  lines.push("## Phasen");
  lines.push("");
  lines.push("| Phase | Art | Frames | Ø Differenz | max. Differenz | statisch | Zustands-Differenz |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of json.phases) {
    lines.push(
      `| ${p.phase} | ${p.kind} | ${p.frameCount} | ${p.meanDiff} | ${p.maxDiff} | ${Math.round(p.staticRatio * 100)} % | ${p.responseDiff != null ? p.responseDiff : "–"} |`
    );
  }
  lines.push("");
  lines.push("## Befunde");
  lines.push("");
  if (!json.findings.length) {
    lines.push("Keine. Idle lebt, Übergänge sind kontinuierlich, Zustandswechsel wirken sichtbar.");
  } else {
    for (const f of json.findings) {
      lines.push(`- **[${f.severity}] ${f.category}** (${f.phase}): ${f.message}`);
    }
  }
  lines.push("");
  lines.push("Beweis-Frames: `frames/*.png` neben diesem Report.");
  lines.push("");
  return lines.join("\n");
}

module.exports = { runTemporalCheck };
