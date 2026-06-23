#!/usr/bin/env node
"use strict";

/**
 * Baut das CUE-AGENT-Eigen-Promo (Dogfooding): nimmt die echte Produkt-GUI
 * (Configurator) als Screenshots + einen kurzen Bildschirm-Clip auf, rendert
 * daraus über die eigene Pipeline ein Video (mit Cursor-Overlay, Auto-Zoom und
 * Speed-Ramping) und exportiert am Ende ein GIF.
 *
 * Nutzung: node scripts/build-self-promo.js [script.json] [outDir]
 *
 * Bewusst eigenständig (nicht über `cue video`), weil wir kuratierte
 * Screenshots + einen kuratierten Clip ohne Live-URL einspeisen wollen.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const { loadConfig } = require("../src/config");
const { ensureDir, timestamp, makeLogger } = require("../src/util");
const { ASPECT_DIMENSIONS } = require("../src/config");
const { loadScript } = require("../src/video/script");
const { generateDesign } = require("../src/video/phase3-design");
const { runProduction } = require("../src/video/phase4-production");
const { runAudioRender } = require("../src/video/phase5-audio-render");
const { resolveStoryboardRefs } = require("../src/video/refs");
const { startConfigurator } = require("../src/configurator/server");
const { exportGif } = require("../src/render/gif");

const log = makeLogger("SELF-PROMO");

function waitForServer(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Configurator-Server nicht erreichbar"));
        else setTimeout(tick, 200);
      });
    };
    tick();
  });
}

async function captureAssets({ projectDir, cfg, port }) {
  const shotsDir = path.join(projectDir, "screenshots");
  ensureDir(shotsDir);

  // Configurator-Server starten (echte Produkt-GUI)
  const serverHandle = await startConfigurator({ cfg, port, logger: log });
  await waitForServer(port);

  const captureVp = { width: 1280, height: 800 };
  const browser = await chromium.launch();

  // 1) Screenshots der GUI
  const ctx = await browser.newContext({ viewport: captureVp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shotsDir, "gui-main.png") });
  await ctx.close();

  // 2) Kurzer Bildschirm-Clip (für Speed-Ramping): sanftes Scrollen der GUI
  const recCtx = await browser.newContext({
    viewport: captureVp,
    recordVideo: { dir: projectDir, size: captureVp },
  });
  const recPage = await recCtx.newPage();
  await recPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await recPage.waitForTimeout(400);
  // deterministisches, ruhiges Scrollen über ~5s
  for (let i = 0; i <= 10; i++) {
    await recPage.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), i * 60);
    await recPage.waitForTimeout(420);
  }
  const video = recPage.video();
  await recCtx.close(); // schreibt das webm fertig
  const rawWebm = await video.path();
  const clipWebm = path.join(projectDir, "capture.webm");
  fs.renameSync(rawWebm, clipWebm);

  await browser.close();
  await new Promise((r) => { serverHandle.close(); setTimeout(r, 100); });

  return { shotsDir, videoSource: clipWebm };
}

async function main() {
  const scriptFile = process.argv[2] || "examples/cue-agent-promo-v2.script.json";
  let cfg = loadConfig();

  const { storyboard, meta } = loadScript(scriptFile);
  // Meta auf Config anwenden
  cfg = { ...cfg, video: { ...cfg.video }, audio: { ...cfg.audio } };
  if (meta.brand) cfg.video.brand = meta.brand;
  if (meta.aspect && ASPECT_DIMENSIONS[meta.aspect]) {
    cfg.video.aspect = meta.aspect;
    cfg.viewport = { ...ASPECT_DIMENSIONS[meta.aspect] };
  }
  if (meta.voice) cfg.audio.voice = meta.voice;
  if (meta.lang) cfg.lang = meta.lang;

  const dims = cfg.viewport || { width: 1920, height: 1080 };
  // Render-Last begrenzen: 720p @ 24fps ist für Promo/GIF scharf genug und
  // rendert deutlich schneller als 1080p@30 (Frame = seek + Screenshot).
  if (process.env.SELF_PROMO_FULL !== "1") {
    cfg.viewport = { width: 1280, height: 720 };
    cfg.video.fps = 24;
  }
  const renderDims = cfg.viewport;
  const ts = timestamp();
  const projectDir = process.argv[3] || path.join(cfg.root, "video-projects", `cue-agent-self-promo-${ts}`);
  ensureDir(projectDir);
  log.info(`Projekt: ${projectDir}`);
  log.info(`Szenen: ${storyboard.totalScenes} | Dauer (Soll): ${storyboard.estimatedDuration}s | ${renderDims.width}x${renderDims.height} @ ${cfg.video.fps}fps`);

  // Assets aufnehmen (echte GUI)
  log.info("Phase 2: Capture (echte Configurator-GUI + Clip)");
  const { shotsDir, videoSource } = await captureAssets({ projectDir, cfg, port: 4488 });
  log.ok(`Screenshots: ${shotsDir} | Clip: ${videoSource}`);

  // Refs auflösen
  resolveStoryboardRefs(storyboard);

  // Phase 3: Design
  const context = { brand: cfg.video.brand, goal: "CUE-AGENT Eigen-Promo" };
  const { scenePaths, renderScenes } = generateDesign({
    storyboard,
    context,
    projectDir,
    screenshotsDir: shotsDir,
    videoSource,
    mediaDir: null,
    dims: renderDims,
    logger: log,
  });

  // Phase 4: Production (Anti-Slop-Lint + stummes MP4)
  const production = await runProduction({ scenePaths, scenes: renderScenes, cfg, projectDir, logger: log });
  log.ok(`Stummes MP4: ${production.mp4Path} (${production.durationSec.toFixed(1)}s, ${production.frames} Frames)`);
  if (production.lintWarnings.length) {
    log.warn(`Anti-Slop-Lint: ${production.lintWarnings.length} Warnung(en) — Render lief trotzdem.`);
  } else {
    log.ok("Anti-Slop-Lint: sauber (QA-Gate für Promo bestanden).");
  }

  // Phase 5: Audio (best effort)
  let audio = { hasAudio: false, finalMp4: production.mp4Path };
  try {
    audio = await runAudioRender({
      storyboard,
      cfg,
      projectDir,
      silentMp4Path: production.mp4Path,
      durationSec: production.durationSec,
      logger: log,
    });
  } catch (e) {
    log.warn(`Audio übersprungen: ${e.message}`);
  }
  const finalMp4 = audio.finalMp4 || production.mp4Path;
  log.ok(`Finales MP4: ${finalMp4} (Audio: ${audio.hasAudio ? "ja" : "nein"})`);

  // GIF-Export (Showcase des Features)
  const gifPath = path.join(projectDir, "preview.gif");
  const g = exportGif(finalMp4, gifPath, { fps: 12, width: 640 });
  log.ok(`GIF: ${g.out} (${(g.bytes / 1024 / 1024).toFixed(2)} MB)`);

  // Zusammenfassung
  const summary = {
    projectDir,
    finalMp4,
    gif: gifPath,
    durationSec: production.durationSec,
    frames: production.frames,
    hasAudio: audio.hasAudio,
    lintWarnings: production.lintWarnings.length,
    scenes: scenePaths.length,
  };
  fs.writeFileSync(path.join(projectDir, "self-promo-summary.json"), JSON.stringify(summary, null, 2));
  log.ok(`\nFertig. Zusammenfassung:\n${JSON.stringify(summary, null, 2)}`);
}

main().catch((e) => {
  log.error ? log.error(e.stack || e.message) : console.error(e);
  process.exit(1);
});
