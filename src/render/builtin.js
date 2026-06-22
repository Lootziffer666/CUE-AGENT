"use strict";

/**
 * Eingebauter Renderer: HTML+GSAP-Szenen → Playwright-Frame-Capture → ffmpeg → MP4.
 *
 * Workflow:
 * 1. Jede Szene (HTML-Datei) wird in Playwright geöffnet.
 * 2. Die GSAP-Timeline wird deterministisch durchgescrubbt (seek pro Frame).
 * 3. Für jeden Frame wird ein Screenshot (PNG) in ein temp-Verzeichnis geschrieben.
 * 4. ffmpeg stitcht die Frames zu einem H.264 MP4 zusammen.
 *
 * Anti-Slop: Kein Play/Autoplay, kein non-deterministic Timer.
 * Alles basiert auf timeline.seek(t) — 100% reproduzierbar.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const { ensureDir } = require("../util");

/**
 * @param {object} args
 * @param {string} args.compositionPath  Pfad zur index.html (Wurzelkomposition)
 * @param {string[]} args.scenePaths     geordnete Pfade zu scenes/*.html
 * @param {object} args.cfg              aufgelöste Config
 * @param {string} args.outDir           Ausgabeverzeichnis
 * @param {object} [args.logger]
 * @returns {Promise<{mp4Path:string, frames:number, durationSec:number}>}
 */
async function renderBuiltin({ scenePaths, cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {}, error() {} };
  const fps = cfg.video.fps || 30;
  const viewport = cfg.viewport;

  const framesDir = path.join(outDir, "frames");
  ensureDir(framesDir);
  ensureDir(path.join(outDir, "out"));

  log.info(`Renderer: ${scenePaths.length} Szenen @ ${fps} fps, ${viewport.width}x${viewport.height}`);

  const browser = await chromium.launch({ headless: true });
  let totalFrames = 0;

  try {
    const context = await browser.newContext({ viewport });

    for (let si = 0; si < scenePaths.length; si++) {
      const scenePath = scenePaths[si];
      const page = await context.newPage();

      // HTML-Datei laden
      await page.goto(`file://${scenePath}`, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(500); // GSAP laden lassen

      // Timeline-Dauer aus der Szene auslesen
      const sceneDuration = await page.evaluate(() => {
        return window.__duration || 3;
      });

      const frameCount = Math.ceil(sceneDuration * fps);
      log.info(`  Szene ${si + 1}/${scenePaths.length}: ${path.basename(scenePath)} (${sceneDuration}s, ${frameCount} Frames)`);

      // Deterministic frame capture
      for (let f = 0; f < frameCount; f++) {
        const t = f / fps;
        await page.evaluate((time) => {
          if (window.__timeline) {
            window.__timeline.seek(time);
          }
        }, t);

        // Kurz warten damit GSAP-Rendering abgeschlossen
        await page.waitForTimeout(16); // ~1 Render-Frame

        const frameName = `frame-${String(totalFrames).padStart(6, "0")}.png`;
        await page.screenshot({ path: path.join(framesDir, frameName) });
        totalFrames++;
      }

      await page.close();
    }

    await context.close();
  } finally {
    await browser.close();
  }

  log.ok(`${totalFrames} Frames gerendert.`);

  // ffmpeg: Frames → MP4
  const mp4Path = path.join(outDir, "out", "final.mp4");
  const ffmpegCmd = [
    "ffmpeg", "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "frame-%06d.png"),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    mp4Path,
  ].join(" ");

  log.info("ffmpeg: Frames → MP4 ...");
  try {
    execSync(ffmpegCmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-500) : err.message;
    throw new Error(`ffmpeg fehlgeschlagen:\n${stderr}`);
  }

  const stats = fs.statSync(mp4Path);
  const durationSec = totalFrames / fps;
  log.ok(`Video: ${mp4Path} (${(stats.size / 1024 / 1024).toFixed(1)} MB, ${durationSec.toFixed(1)}s)`);

  return { mp4Path, frames: totalFrames, durationSec };
}

module.exports = { renderBuiltin };
