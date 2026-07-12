"use strict";

/**
 * `cue audio-check <url> [--scenario <json>] [--json]` — deterministischer,
 * key-freier Beweis-Türsteher für ANVILs Web-Audio-Runtime (Gate H,
 * ANVIL `docs/GOLDEN_RUN_REPORT.md`/`docs/REAL_GOLDEN_RUN_LEDGER.md`).
 *
 * Erkennt (wie `temporal-check` `window.SHADED`) den realen Debug-Vertrag, den
 * ANVILs `ToneJsRuntimeWriter` generiert (`modules/target/.../ToneJsRuntimeWriter.kt`):
 *
 *   window.ANVIL_AUDIO = {
 *     getDebugState: () => ({...}),
 *     setState: (name, value) => {...},
 *     getEventLog: () => [...],
 *   }
 *
 * Sechs Beweis-Kategorien aus Gate H — vier sind mit dem AKTUELLEN Vertrag real
 * und deterministisch prüfbar, zwei NICHT (ehrlich als "nicht prüfbar" markiert,
 * nie fingiert — siehe docs/AUDIO_CHECK.md):
 *
 *   CUE_FIRED          echte Interaktion löst mindestens einen neuen Eintrag in
 *                      getEventLog() aus (der Debug-Hook selbst loggt reale Events
 *                      wie "gain:<bus>:<target>"/"stinger:<bus>", keine Erfindung).
 *   STATE_REACTION     setState(name, value) -> getDebugState()[name] === value
 *                      (echter Round-Trip, kein Mock).
 *   TRANSITION_TIMING  getEventLog() zweimal im Abstand einer echten Wartezeit
 *                      abgefragt: das Log darf über die Zeit nicht schrumpfen
 *                      (monoton) und die Abfrage darf nicht crashen.
 *   LOOP_CONTINUITY    getEventLog() zweimal in Folge liefert unabhängige Arrays
 *                      (Spread-Kopie laut Runtime-Vertrag) — Mutation der einen
 *                      Kopie darf die andere/den internen Log nicht beeinflussen.
 *   CLIPPING_CHECK     NICHT PRÜFBAR — ANVIL_AUDIO exponiert keinen Analyser-/
 *                      Pegel-Hook. Kein Fake-Wert, `ok: null`.
 *   VOICE_AUDIBILITY   NICHT PRÜFBAR — dieselbe Begründung.
 *
 * Ohne `window.ANVIL_AUDIO` läuft ein generischer Modus (wie bei temporal-check
 * ohne SHADED): es wird nur bestätigt, dass die Seite ohne Audio-Vertrag lädt —
 * Verdict ist dann klar NICHT BELEGT, weil audio-checks ganzer Zweck der
 * Audio-Vertrag selbst ist (kein stiller Fallback, kein "trotzdem irgendwie ok").
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { makeLogger, slugify, timestamp, ensureDir, writeJson, writeText, resolveChromiumExecutable } = require("../util");
const { validateStep } = require("../core/flow");
const { writeVerdict } = require("./report");

const DEFAULT_PROBE_NAME = "anvil_audio_check_probe";
const DEFAULT_PROBE_VALUE = 1;
const TRANSITION_WAIT_MS = 400;

/** Kleiner, lokaler Schritt-Runner für den optionalen `--scenario`-Flow — bewusst
 *  keine Abhängigkeit von playable.js's internem Runner (kein Cross-Modul-Fork,
 *  nur ein winziges eigenes Duplikat des immer gleichen Aktions-Sets). */
async function runFlowSteps(page, steps, log) {
  for (const step of steps) {
    try {
      if (step.action === "goto") await page.goto(step.url, { waitUntil: "load", timeout: 45000 });
      else if (step.action === "click") await page.click(step.selector, { timeout: 8000 });
      else if (step.action === "type") await page.fill(step.selector, String(step.text ?? ""), { timeout: 8000 });
      else if (step.action === "hover") await page.hover(step.selector, { timeout: 8000 });
      else if (step.action === "select") await page.selectOption(step.selector, String(step.text ?? ""), { timeout: 8000 });
      else if (step.action === "scroll") await page.mouse.wheel(0, step.scrollY ?? 600);
      else if (step.action === "wait") await page.waitForTimeout(step.ms ?? 500);
      else log.warn(`Flow-Schritt unbekannt, übersprungen: ${step.action}`);
    } catch (e) {
      throw new Error(`Flow-Schritt "${step.id || step.action}" fehlgeschlagen: ${e.message}`);
    }
  }
}

/** Generische Interaktion (wie playable.js): erster sichtbarer Button, sonst Canvas, sonst Link. */
async function genericInteraction(page) {
  const clicked = await page.evaluate(() => {
    const pick = (sel) =>
      Array.from(document.querySelectorAll(sel)).find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && r.top >= 0 && r.top < window.innerHeight;
      });
    const target = pick('button, [role="button"]') || pick("canvas") || pick("a[href]");
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: target.tagName.toLowerCase() };
  });
  if (!clicked) return "kein interaktives Element gefunden";
  await page.mouse.click(clicked.x, clicked.y);
  return `generischer Klick auf <${clicked.tag}>`;
}

function loadScenario(scenarioFile) {
  if (!scenarioFile) return {};
  const raw = JSON.parse(fs.readFileSync(scenarioFile, "utf8"));
  return raw || {};
}

async function runAudioCheck({ url, cfg, outDir, scenarioFile, logger }) {
  const log = logger || makeLogger("AUDIO");
  if (!url) throw new Error("audio-check braucht eine URL (Argument oder cue.config.json targetUrl)");

  const scenario = loadScenario(scenarioFile);
  const probeName = scenario.probeState?.name || DEFAULT_PROBE_NAME;
  const probeValue = scenario.probeState?.value ?? DEFAULT_PROBE_VALUE;

  const dir = ensureDir(outDir || path.join(process.cwd(), "audio-reports", `${slugify(url)}-${timestamp()}`));
  const startedAt = new Date().toISOString();

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(chromium),
  });
  const viewport = (cfg && cfg.viewport) || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  try {
    log.info(`Lade ${url} …`);
    let navOk = false;
    try {
      const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
      navOk = !resp || resp.status() < 400;
    } catch (e) {
      log.error(`Navigation fehlgeschlagen: ${e.message}`);
    }
    await page.waitForTimeout(500);

    const hasAudioHook = navOk
      ? await page.evaluate(() =>
          Boolean(
            window.ANVIL_AUDIO &&
              typeof window.ANVIL_AUDIO.getDebugState === "function" &&
              typeof window.ANVIL_AUDIO.setState === "function" &&
              typeof window.ANVIL_AUDIO.getEventLog === "function"
          )
        )
      : false;

    if (!hasAudioHook) {
      const json = {
        url,
        checkedAt: new Date().toISOString(),
        mode: "generic",
        signals: { navOk, consoleErrors: consoleErrors.length, hasAudioHook: false },
        checks: [],
        failed: ["ANVIL_AUDIO_HOOK"],
        verdict: "KEIN AUDIO-VERTRAG GEFUNDEN",
        note: "window.ANVIL_AUDIO (getDebugState/setState/getEventLog) wurde nicht gefunden — audio-check prüft genau diesen Vertrag, es gibt hier bewusst keinen stillen Fallback-Erfolg.",
        reportDir: dir,
      };
      writeJson(path.join(dir, "audio-report.json"), json);
      writeText(path.join(dir, "AUDIO-PROOF.md"), renderReport(json));
      writeVerdict(dir, {
        command: "audio-check",
        target: { kind: "url", value: url, platform: "web" },
        startedAt,
        finishedAt: new Date().toISOString(),
        verdict: json.verdict,
        score: 0,
        severity: "high",
        checks: [{ id: "audio-hook", label: "window.ANVIL_AUDIO Vertrag vorhanden", ok: false, evidence: [], signals: json.signals }],
        findings: [{ severity: "high", category: "audio-contract", message: json.note, evidence: [] }],
        signals: json.signals,
        evidence: [],
        environment: { driver: "web" },
        exitCode: 1,
      });
      log.warn(`Verdict: ${json.verdict}`);
      return { json, exitCode: 1 };
    }

    log.info("window.ANVIL_AUDIO erkannt — fahre Audio-Beweis-Sequenz.");

    const eventLogBefore = await page.evaluate(() => window.ANVIL_AUDIO.getEventLog().length);

    let interactionNote;
    if (Array.isArray(scenario.flow) && scenario.flow.length > 0) {
      scenario.flow.forEach((s, i) => validateStep(s, i)); // dasselbe Schema/Validierung wie Capture-Engine-Flows
      await runFlowSteps(page, scenario.flow, log);
      interactionNote = `Flow aus ${path.basename(scenarioFile)} (${scenario.flow.length} Schritte)`;
    } else {
      interactionNote = await genericInteraction(page);
    }
    await page.waitForTimeout(300);

    const eventLogAfter = await page.evaluate(() => window.ANVIL_AUDIO.getEventLog().length);
    const cueFired = eventLogAfter > eventLogBefore;

    await page.evaluate(({ name, value }) => window.ANVIL_AUDIO.setState(name, value), { name: probeName, value: probeValue });
    const debugStateAfterSet = await page.evaluate(() => window.ANVIL_AUDIO.getDebugState());
    const stateReaction = debugStateAfterSet[probeName] === probeValue;

    const logAtT0 = await page.evaluate(() => window.ANVIL_AUDIO.getEventLog().length);
    await page.waitForTimeout(TRANSITION_WAIT_MS);
    const logAtT1 = await page.evaluate(() => window.ANVIL_AUDIO.getEventLog().length);
    const transitionTiming = logAtT1 >= logAtT0;

    const loopContinuity = await page.evaluate(() => {
      const a = window.ANVIL_AUDIO.getEventLog();
      a.push("__probe-mutation-should-not-leak__");
      const b = window.ANVIL_AUDIO.getEventLog();
      return !b.includes("__probe-mutation-should-not-leak__");
    });

    const checks = [
      { id: "CUE_FIRED", required: true, ok: cueFired, label: "Interaktion löst mindestens ein neues Event in getEventLog() aus" },
      { id: "STATE_REACTION", required: true, ok: stateReaction, label: "setState()/getDebugState() Round-Trip liefert den geschriebenen Wert" },
      { id: "TRANSITION_TIMING", required: true, ok: transitionTiming, label: "getEventLog() schrumpft nicht über eine echte Wartezeit hinweg" },
      { id: "LOOP_CONTINUITY", required: true, ok: loopContinuity, label: "getEventLog() liefert unabhängige Kopien (Mutation leakt nicht in den internen Log)" },
      { id: "CLIPPING_CHECK", required: false, ok: null, label: "NICHT PRÜFBAR — ANVIL_AUDIO exponiert keinen Pegel-/Analyser-Hook" },
      { id: "VOICE_AUDIBILITY", required: false, ok: null, label: "NICHT PRÜFBAR — ANVIL_AUDIO exponiert keinen Pegel-/Analyser-Hook" },
    ];
    const failed = checks.filter((c) => c.required && c.ok !== true).map((c) => c.id);

    const json = {
      url,
      checkedAt: new Date().toISOString(),
      mode: "anvil-audio",
      signals: {
        navOk,
        consoleErrors: consoleErrors.length,
        hasAudioHook: true,
        eventLogLengthAtEnd: eventLogAfter,
      },
      interaction: interactionNote,
      probeState: { name: probeName, value: probeValue },
      checks,
      failed,
      verdict: failed.length === 0 ? "AUDIO-VERTRAG BELEGT (Clipping/Audibility nicht prüfbar)" : "NICHT BELEGT",
      reportDir: dir,
    };
    writeJson(path.join(dir, "audio-report.json"), json);
    writeText(path.join(dir, "AUDIO-PROOF.md"), renderReport(json));
    const exitCode = failed.length === 0 ? 0 : 1;
    writeVerdict(dir, {
      command: "audio-check",
      target: { kind: "url", value: url, platform: "web" },
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: json.verdict,
      score: Math.round((checks.filter((c) => c.required && c.ok === true).length / checks.filter((c) => c.required).length) * 100),
      severity: failed.length === 0 ? "none" : "high",
      checks: checks.map((check) => ({ ...check, ok: check.ok === true, evidence: [], signals: json.signals })),
      findings: failed.map((id) => ({ severity: "high", category: "audio-check", message: `Audio-Check fehlgeschlagen: ${id}`, evidence: [] })),
      signals: json.signals,
      evidence: [],
      environment: { driver: "web" },
      exitCode,
    });
    log[failed.length === 0 ? "ok" : "warn"](`Verdict: ${json.verdict}`);

    return { json, exitCode };
  } finally {
    await browser.close().catch(() => {});
  }
}

function renderReport(json) {
  const lines = [];
  lines.push("# Audio-Vertrags-Beweis (Audio Proof)");
  lines.push("");
  lines.push(`- **URL:** ${json.url}`);
  lines.push(`- **Zeitpunkt:** ${json.checkedAt}`);
  lines.push(`- **Modus:** ${json.mode === "anvil-audio" ? "window.ANVIL_AUDIO erkannt" : "generisch (kein Audio-Vertrag gefunden)"}`);
  lines.push(`- **Verdict:** **${json.verdict}**`);
  if (json.interaction) lines.push(`- **Interaktion:** ${json.interaction}`);
  if (json.note) lines.push(`- **Hinweis:** ${json.note}`);
  lines.push("");
  if (json.checks.length) {
    lines.push("## Beweis-Kategorien");
    lines.push("");
    for (const c of json.checks) {
      const mark = c.ok === true ? "x" : c.ok === false ? " " : "~";
      lines.push(`- [${mark}] **${c.id}**${c.required ? "" : " (optional)"} — ${c.label}`);
    }
    lines.push("");
  }
  lines.push("> CUE-AGENT behauptet nie einen Pegel-/Clipping-Beweis, den der aktuelle Audio-Vertrag technisch nicht liefern kann.");
  lines.push("");
  return lines.join("\n");
}

module.exports = { runAudioCheck };
