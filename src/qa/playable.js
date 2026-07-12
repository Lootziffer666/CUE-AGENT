"use strict";

/**
 * `cue playable-check <url>` — der Qualitäts-Türsteher aus assetpilot.md.
 *
 * Nach jedem Build: Startet es? Ist es bedienbar? Gibt es Blocker?
 * Gibt es Screenshot-Beweise? CUE-AGENT sagt nicht „das ist gut", sondern
 * „das ist BELEGBAR SPIELBAR" — jedes Kriterium ist ein deterministisches
 * Signal (kein LLM, kein API-Key nötig):
 *
 *  1. startet     Navigation ok + erster Screenshot ist nicht leer
 *  2. fehlerfrei  keine Konsolen-/Seiten-/Serverfehler (5xx)
 *  3. bedienbar   interaktive Elemente vorhanden (Buttons/Links/Inputs/Canvas)
 *  4. reagiert    eine sichere Interaktion erzeugt sichtbare Veränderung
 *  5. beweise     mindestens 2 Screenshot-Beweise gesichert
 *
 * Optional prüft --flow einen echten Spiel-/Bedien-Flow (deklaratives Format
 * der Capture-Engine) statt der generischen Interaktion.
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { makeLogger, slugify, timestamp, ensureDir, writeJson, writeText, resolveChromiumExecutable } = require("../util");
const { evaluatePlayability, meanAbsDiff, pixelStdDev } = require("./frame-metrics");
const { writeVerdict } = require("./report");
const { loadFlow } = require("../core/flow");

const SAMPLE_W = 128;
const SAMPLE_H = 72;

async function decodeFrame(probePage, buffer) {
  return probePage.evaluate(
    async ({ shot, w, h }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("PNG-Dekodierung fehlgeschlagen"));
        img.src = "data:image/png;base64," + shot;
      });
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, w, h);
      return Array.from(x.getImageData(0, 0, w, h).data);
    },
    { shot: buffer.toString("base64"), w: SAMPLE_W, h: SAMPLE_H }
  );
}

/** Führt die Schritte eines deklarativen Flows aus (Schema der Capture-Engine,
 *  src/core/flow.js VALID_ACTIONS: goto/click/type/scroll/wait/hover/select). */
async function runFlowSteps(page, steps, log) {
  for (const step of steps) {
    const action = step.action;
    try {
      if (action === "goto") await page.goto(step.url, { waitUntil: "load", timeout: 45000 });
      else if (action === "click") await page.click(step.selector, { timeout: 8000 });
      else if (action === "type") await page.fill(step.selector, String(step.text ?? ""), { timeout: 8000 });
      else if (action === "hover") await page.hover(step.selector, { timeout: 8000 });
      else if (action === "select") await page.selectOption(step.selector, String(step.text ?? ""), { timeout: 8000 });
      else if (action === "scroll") await page.mouse.wheel(0, step.scrollY ?? 600);
      else if (action === "wait") await page.waitForTimeout(step.ms ?? 500);
      else log.warn(`Flow-Schritt unbekannt, übersprungen: ${action}`);
    } catch (e) {
      throw new Error(`Flow-Schritt "${step.id || action}" fehlgeschlagen: ${e.message}`);
    }
  }
}

async function runPlayableCheck({ url, cfg, outDir, flowFile, logger }) {
  const log = logger || makeLogger("PLAYABLE");
  if (!url) throw new Error("playable-check braucht eine URL (Argument oder cue.config.json targetUrl)");

  const dir = ensureDir(outDir || path.join(process.cwd(), "playable-reports", `${slugify(url)}-${timestamp()}`));
  const proofDir = ensureDir(path.join(dir, "proof"));

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(chromium),
    args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const viewport = (cfg && cfg.viewport) || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const probe = await browser.newPage({ viewport: { width: 200, height: 200 } });

  const consoleErrors = [];
  const pageErrors = [];
  const serverErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`); });

  const startedAt = new Date().toISOString();
  const proofs = [];
  const saveProof = async (name) => {
    const file = path.join(proofDir, name);
    const buffer = await page.screenshot({ type: "png" });
    fs.writeFileSync(file, buffer);
    proofs.push(name);
    return buffer;
  };

  try {
    log.info(`Lade ${url} …`);
    let navOk = false;
    try {
      const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
      navOk = !resp || resp.status() < 400;
    } catch (e) {
      log.error(`Navigation fehlgeschlagen: ${e.message}`);
    }
    await page.waitForTimeout(1200);

    const startBuffer = await saveProof("proof-01-start.png");
    const startFrame = await decodeFrame(probe, startBuffer);
    const blank = pixelStdDev(startFrame) < 2;

    const interactiveCount = navOk
      ? await page.evaluate(() => {
          const sel = 'button, a[href], input, select, textarea, canvas, [role="button"], [onclick]';
          return Array.from(document.querySelectorAll(sel)).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length;
        })
      : 0;

    // Interaktion: eigener Flow (--flow) oder generisch sicherer Klick
    let responded = false;
    let interactionNote = "";
    if (navOk) {
      const urlBefore = page.url();
      try {
        if (flowFile) {
          const flow = loadFlow(flowFile);
          const steps = flow.steps || [];
          log.info(`Fahre Flow mit ${steps.length} Schritt(en) …`);
          await runFlowSteps(page, steps, log);
          interactionNote = `Flow ${path.basename(flowFile)} (${steps.length} Schritte)`;
        } else {
          // generisch: erster sichtbarer Button, sonst Canvas-Mitte, sonst Link
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
          if (clicked) {
            await page.mouse.click(clicked.x, clicked.y);
            interactionNote = `generischer Klick auf <${clicked.tag}>`;
          } else {
            interactionNote = "kein interaktives Element gefunden";
          }
        }
        await page.waitForTimeout(900);
        const afterBuffer = await saveProof("proof-02-nach-interaktion.png");
        const afterFrame = await decodeFrame(probe, afterBuffer);
        const diff = meanAbsDiff(startFrame, afterFrame);
        responded = diff > 0.5 || page.url() !== urlBefore;
        interactionNote += ` → Frame-Differenz ${diff.toFixed(2)}${page.url() !== urlBefore ? ", URL-Wechsel" : ""}`;
      } catch (e) {
        interactionNote = `Interaktion fehlgeschlagen: ${e.message}`;
      }
    }

    const signals = {
      navOk,
      blank,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      serverErrors: serverErrors.length,
      interactiveCount,
      responded,
      proofCount: proofs.length,
    };
    const evaluation = evaluatePlayability(signals);

    const json = {
      url,
      checkedAt: new Date().toISOString(),
      signals,
      interaction: interactionNote,
      checks: evaluation.checks,
      failed: evaluation.failed,
      verdict: evaluation.verdict,
      proofs: proofs.map((p) => path.join("proof", p)),
      consoleErrorSamples: consoleErrors.slice(0, 5),
      serverErrorSamples: serverErrors.slice(0, 5),
      reportDir: dir,
    };
    writeJson(path.join(dir, "playable-report.json"), json);
    writeText(path.join(dir, "PLAYABLE-PROOF.md"), renderReport(json));
    const exitCode = json.verdict === "BELEGBAR SPIELBAR" ? 0 : 1;
    writeVerdict(dir, {
      command: "playable-check",
      target: { kind: "url", value: url, platform: "web" },
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: json.verdict,
      score: Math.round((json.checks.filter((c) => c.ok).length / json.checks.length) * 100),
      severity: json.verdict === "BELEGBAR SPIELBAR" ? "none" : "high",
      checks: json.checks.map((c) => ({ ...c, evidence: json.proofs, signals })),
      findings: json.failed.map((id) => ({ severity: "high", category: "playable-check", message: `Check fehlgeschlagen: ${id}`, evidence: json.proofs })),
      signals,
      evidence: json.proofs.map((proof) => ({ path: proof, kind: "screenshot", label: proof })),
      environment: { driver: "web" },
      exitCode,
    });
    log.ok(`Report: ${path.join(dir, "PLAYABLE-PROOF.md")}`);
    log[json.verdict === "BELEGBAR SPIELBAR" ? "ok" : "warn"](`Verdict: ${json.verdict}`);

    return { json, exitCode };
  } finally {
    await browser.close().catch(() => {});
  }
}

function renderReport(json) {
  const lines = [];
  lines.push("# Spielbarkeits-Beweis (Playability Proof)");
  lines.push("");
  lines.push(`- **URL:** ${json.url}`);
  lines.push(`- **Zeitpunkt:** ${json.checkedAt}`);
  lines.push(`- **Verdict:** **${json.verdict}**`);
  lines.push(`- **Interaktion:** ${json.interaction}`);
  lines.push("");
  lines.push("## Checkliste");
  lines.push("");
  for (const c of json.checks) {
    lines.push(`- [${c.ok ? "x" : " "}] **${c.id}** — ${c.label}`);
  }
  lines.push("");
  lines.push("## Signale");
  lines.push("");
  lines.push("| Signal | Wert |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(json.signals)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  if (json.consoleErrorSamples.length) {
    lines.push("## Konsolenfehler (Auszug)");
    lines.push("");
    for (const e of json.consoleErrorSamples) lines.push(`- ${e.slice(0, 200)}`);
    lines.push("");
  }
  if (json.serverErrorSamples.length) {
    lines.push("## Serverfehler (Auszug)");
    lines.push("");
    for (const e of json.serverErrorSamples) lines.push(`- ${e}`);
    lines.push("");
  }
  lines.push("## Beweise");
  lines.push("");
  for (const p of json.proofs) lines.push(`- \`${p}\``);
  lines.push("");
  lines.push("> CUE-AGENT sagt nicht „das ist gut“. Sondern: „das ist belegbar spielbar“ — oder eben nicht.");
  lines.push("");
  return lines.join("\n");
}

module.exports = { runPlayableCheck };
