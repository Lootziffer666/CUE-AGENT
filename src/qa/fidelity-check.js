"use strict";

/**
 * `cue fidelity-check <urlA> <urlB> [--flow flow.json] [--fields a,b,custom.x]
 *   [--tolerance 0] [--out dir] [--json]` — behavioraler Vergleich zweier
 * CUE-PROBE-kompatibler Ziele (Gap 3 aus dem Pipeline-Gap-Survey: "original
 * vs. reconstructed"-Vergleich existierte bisher gar nicht).
 *
 * Baut bewusst NICHT auf einem neuen State-Format, sondern auf dem bereits
 * bestehenden, engine-agnostischen CUE-PROBE-Vertrag (docs/CUE_PROBE.md,
 * `src/probe/client.js` `detectWebProbe`): `state()` liefert bei jedem
 * unterstützten Ziel (`window.CUE_PROBE`, `window.SHADED`-Shim,
 * `window.ANVIL_AUDIO`-Shim) dieselbe Form (`scene`, `fps`, `frame`, `custom`).
 * `fidelity-check` fährt denselben Flow auf beiden Zielen parallel und
 * vergleicht die Trace nach jedem Schritt.
 *
 * Absichtlich NICHT Teil dieses Checks: ein CUE-PROBE-Shim für ein
 * Original-Spiel-Interpreter (z. B. ScummVM). Das wäre die eigentliche
 * "original vs. reconstructed"-Anwendung, aber der Shim selbst müsste gegen
 * real lizenzierte Spieldateien laufen — das ist Sache des Nutzers, lokal,
 * mit eigenen Tools (dieselbe Grenze wie beim Sprite-/Kostüm-Browser). Dieser
 * Check funktioniert mit JEDEM Paar CUE-PROBE-kompatibler URLs — bewiesen
 * hier gegen zwei SHADED-Builds (Regression), derselbe Codepfad bedient
 * "original vs. reconstructed" real, sobald ein Original-Shim existiert.
 *
 * Wie bei audio-check: kein stiller Fallback-Erfolg. Fehlt der Probe-Vertrag
 * auf einer der beiden Seiten, ist das Ergebnis "NICHT VERGLEICHBAR" — nie
 * ein erfundenes "passt schon".
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { makeLogger, slugify, timestamp, ensureDir, writeJson, writeText, resolveChromiumExecutable } = require("../util");
const { validateStep } = require("../core/flow");
const { detectWebProbe } = require("../probe/client");
const { writeVerdict } = require("./report");

const DEFAULT_FIELDS = ["scene"]; // plus alle custom.*-Keys, die auf mind. einer Seite vorkommen

/** Winziger, lokaler Flow-Runner — dieselbe bewusste Duplikation wie audio-check.js
 *  ("kein Cross-Modul-Fork"), hier auf zwei Pages gleichzeitig angewandt. */
async function runFlowStepOnBoth(pageA, pageB, step, log) {
  const applyTo = async (page) => {
    if (step.action === "goto") await page.goto(step.url, { waitUntil: "load", timeout: 45000 });
    else if (step.action === "click") await page.click(step.selector, { timeout: 8000 });
    else if (step.action === "type") await page.fill(step.selector, String(step.text ?? ""), { timeout: 8000 });
    else if (step.action === "hover") await page.hover(step.selector, { timeout: 8000 });
    else if (step.action === "select") await page.selectOption(step.selector, String(step.text ?? ""), { timeout: 8000 });
    else if (step.action === "scroll") await page.mouse.wheel(0, step.scrollY ?? 600);
    else if (step.action === "wait") await page.waitForTimeout(step.ms ?? 500);
    else log.warn(`Flow-Schritt unbekannt, übersprungen: ${step.action}`);
  };
  try {
    await applyTo(pageA);
    await applyTo(pageB);
  } catch (e) {
    throw new Error(`Flow-Schritt "${step.id || step.action}" fehlgeschlagen: ${e.message}`);
  }
}

function loadFlow(flowFile) {
  if (!flowFile) return [{ id: "settle", action: "wait", ms: 500 }];
  const raw = JSON.parse(fs.readFileSync(flowFile, "utf8"));
  const steps = Array.isArray(raw) ? raw : raw.flow || [];
  steps.forEach((s, i) => validateStep(s, i));
  return steps;
}

function getPath(obj, dottedPath) {
  return dottedPath.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

function fieldsToCompare(stateA, stateB, requestedFields) {
  if (requestedFields && requestedFields.length) return requestedFields;
  const customKeys = new Set([
    ...Object.keys((stateA && stateA.custom) || {}),
    ...Object.keys((stateB && stateB.custom) || {}),
  ]);
  return [...DEFAULT_FIELDS, ...[...customKeys].map((k) => `custom.${k}`)];
}

function withinTolerance(a, b, tolerance) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= tolerance;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Vergleicht zwei CUE-PROBE-States für exakt einen Schritt. */
function compareStates(stateA, stateB, requestedFields, tolerance) {
  const fields = fieldsToCompare(stateA, stateB, requestedFields);
  const matched = [];
  const mismatched = [];
  const onlyInA = [];
  const onlyInB = [];
  for (const field of fields) {
    const a = getPath(stateA, field);
    const b = getPath(stateB, field);
    const presentA = a !== undefined;
    const presentB = b !== undefined;
    if (!presentA && !presentB) continue;
    if (presentA && !presentB) { onlyInA.push(field); continue; }
    if (!presentA && presentB) { onlyInB.push(field); continue; }
    if (withinTolerance(a, b, tolerance)) matched.push(field);
    else mismatched.push({ field, valueA: a, valueB: b });
  }
  return { fields, matched, mismatched, onlyInA, onlyInB };
}

async function runFidelityCheck({ urlA, urlB, cfg, flowFile, fields, tolerance = 0, outDir, logger }) {
  const log = logger || makeLogger("FIDELITY");
  if (!urlA || !urlB) throw new Error("fidelity-check braucht zwei URLs: <urlA> <urlB>");

  const requestedFields = fields && fields.length ? fields : null;
  const dir = ensureDir(outDir || path.join(process.cwd(), "fidelity-reports", `${slugify(urlA)}-vs-${slugify(urlB)}-${timestamp()}`));
  const startedAt = new Date().toISOString();

  const browser = await chromium.launch({ headless: true, executablePath: resolveChromiumExecutable(chromium) });
  const viewport = (cfg && cfg.viewport) || { width: 1280, height: 720 };
  const pageA = await browser.newPage({ viewport });
  const pageB = await browser.newPage({ viewport });

  try {
    log.info(`Lade A: ${urlA}`);
    await pageA.goto(urlA, { waitUntil: "load", timeout: 45000 });
    log.info(`Lade B: ${urlB}`);
    await pageB.goto(urlB, { waitUntil: "load", timeout: 45000 });
    await Promise.all([pageA.waitForTimeout(500), pageB.waitForTimeout(500)]);

    const probeA = await detectWebProbe(pageA);
    const probeB = await detectWebProbe(pageB);

    if (!probeA || !probeB) {
      const json = {
        urlA, urlB,
        checkedAt: new Date().toISOString(),
        verdict: "NICHT VERGLEICHBAR",
        note: "fidelity-check vergleicht CUE-PROBE-state()-Traces — mindestens eine Seite exponiert weder window.CUE_PROBE noch einen erkannten Shim (window.SHADED/window.ANVIL_AUDIO). Kein stiller Fallback-Erfolg.",
        signals: { probeA: probeA ? probeA.kind : null, probeB: probeB ? probeB.kind : null },
        steps: [],
        reportDir: dir,
      };
      writeJson(path.join(dir, "fidelity-report.json"), json);
      writeText(path.join(dir, "FIDELITY-PROOF.md"), renderReport(json));
      writeVerdict(dir, {
        command: "fidelity-check",
        target: { kind: "url-pair", value: `${urlA} vs ${urlB}`, platform: "web" },
        startedAt,
        finishedAt: new Date().toISOString(),
        verdict: json.verdict,
        score: 0,
        severity: "high",
        checks: [
          { id: "probe-a", label: "CUE-PROBE-Vertrag auf urlA gefunden", ok: Boolean(probeA), signals: { kind: probeA && probeA.kind } },
          { id: "probe-b", label: "CUE-PROBE-Vertrag auf urlB gefunden", ok: Boolean(probeB), signals: { kind: probeB && probeB.kind } },
        ],
        findings: [{ severity: "high", category: "probe-contract", message: json.note, evidence: [] }],
        signals: json.signals,
        evidence: [],
        environment: { driver: "web" },
        exitCode: 1,
      });
      log.warn(`Verdict: ${json.verdict}`);
      return { json, exitCode: 1 };
    }

    log.info(`Probes erkannt (A: ${probeA.kind}, B: ${probeB.kind}) — fahre gemeinsamen Flow.`);
    const flowSteps = loadFlow(flowFile);

    const steps = [];
    const baselineA = await probeA.state();
    const baselineB = await probeB.state();
    steps.push({ stepId: "baseline", ...compareStates(baselineA, baselineB, requestedFields, tolerance) });

    for (const step of flowSteps) {
      await runFlowStepOnBoth(pageA, pageB, step, log);
      const [stateA, stateB] = await Promise.all([probeA.state(), probeB.state()]);
      steps.push({ stepId: step.id || step.action, ...compareStates(stateA, stateB, requestedFields, tolerance) });
    }

    const allMismatches = steps.flatMap((s) => s.mismatched.map((m) => ({ ...m, stepId: s.stepId })));
    const verdict = allMismatches.length === 0 ? "VERHALTEN DECKUNGSGLEICH" : "VERHALTENS-ABWEICHUNG ERKANNT";
    const exitCode = allMismatches.length === 0 ? 0 : 1;

    const json = {
      urlA, urlB,
      checkedAt: new Date().toISOString(),
      probes: { a: probeA.kind, b: probeB.kind },
      flowSteps: flowSteps.length,
      steps,
      mismatchCount: allMismatches.length,
      verdict,
      reportDir: dir,
    };
    writeJson(path.join(dir, "fidelity-report.json"), json);
    writeText(path.join(dir, "FIDELITY-PROOF.md"), renderReport(json));
    writeVerdict(dir, {
      command: "fidelity-check",
      target: { kind: "url-pair", value: `${urlA} vs ${urlB}`, platform: "web" },
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict,
      score: steps.length ? Math.round((steps.filter((s) => s.mismatched.length === 0).length / steps.length) * 100) : 0,
      severity: allMismatches.length === 0 ? "none" : "high",
      checks: steps.map((s) => ({
        id: `step-${s.stepId}`,
        label: `Schritt "${s.stepId}": ${s.matched.length}/${s.fields.length} Felder übereinstimmend`,
        ok: s.mismatched.length === 0,
        signals: { matched: s.matched, onlyInA: s.onlyInA, onlyInB: s.onlyInB },
      })),
      findings: allMismatches.map((m) => ({
        severity: "high",
        category: "fidelity-drift",
        message: `Schritt "${m.stepId}", Feld "${m.field}": A=${JSON.stringify(m.valueA)} ≠ B=${JSON.stringify(m.valueB)}`,
        evidence: [],
      })),
      signals: { probes: json.probes, mismatchCount: allMismatches.length },
      evidence: [],
      environment: { driver: "web" },
      exitCode,
    });
    log[exitCode === 0 ? "ok" : "warn"](`Verdict: ${verdict} (${allMismatches.length} Abweichung(en))`);
    return { json, exitCode };
  } finally {
    await browser.close().catch(() => {});
  }
}

function renderReport(json) {
  const lines = [];
  lines.push("# Behavioraler Vergleich (Fidelity Proof)");
  lines.push("");
  lines.push(`- **A:** ${json.urlA}`);
  lines.push(`- **B:** ${json.urlB}`);
  lines.push(`- **Zeitpunkt:** ${json.checkedAt}`);
  lines.push(`- **Verdict:** **${json.verdict}**`);
  if (json.note) lines.push(`- **Hinweis:** ${json.note}`);
  if (json.probes) lines.push(`- **Probes:** A=${json.probes.a}, B=${json.probes.b}`);
  lines.push("");
  if (json.steps && json.steps.length) {
    lines.push("## Schritte");
    lines.push("");
    lines.push("| Schritt | Übereinstimmend | Abweichend | nur A | nur B |");
    lines.push("|---|---|---|---|---|");
    for (const s of json.steps) {
      lines.push(`| ${s.stepId} | ${s.matched.join(", ") || "–"} | ${s.mismatched.map((m) => m.field).join(", ") || "–"} | ${s.onlyInA.join(", ") || "–"} | ${s.onlyInB.join(", ") || "–"} |`);
    }
    lines.push("");
    const mismatches = json.steps.flatMap((s) => s.mismatched.map((m) => ({ ...m, stepId: s.stepId })));
    if (mismatches.length) {
      lines.push("## Abweichungen im Detail");
      lines.push("");
      for (const m of mismatches) {
        lines.push(`- **${m.stepId} / ${m.field}:** A=\`${JSON.stringify(m.valueA)}\` ≠ B=\`${JSON.stringify(m.valueB)}\``);
      }
      lines.push("");
    }
  }
  lines.push("> fidelity-check vergleicht ausschließlich, was CUE-PROBE `state()` auf beiden Seiten tatsächlich exponiert — kein Feld wird verglichen, das nur erraten wäre.");
  lines.push("");
  return lines.join("\n");
}

module.exports = { runFidelityCheck, compareStates };
