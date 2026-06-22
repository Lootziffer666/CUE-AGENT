"use strict";

/**
 * Eingebauter Renderer (segment-basiert).
 *
 * Jede Szene wird zu einem eigenen MP4-Segment, danach werden alle Segmente
 * zusammengefügt (concat). Zwei Szenentypen:
 *
 *  A) Animierte Szene (HTML + GSAP):
 *     Playwright öffnet die Szene, scrubbt die Timeline deterministisch
 *     (timeline.seek(t) pro Frame), schießt pro Frame einen Screenshot,
 *     ffmpeg kodiert die Frames zum Segment. 100% reproduzierbar.
 *
 *  B) Clip-Szene (echtes aufgenommenes Video):
 *     Ein transparentes Overlay (Brand-Caption/Chapter/Heading) wird einmal
 *     als PNG gerendert; ffmpeg skaliert/padded den Video-Ausschnitt auf die
 *     Canvas, legt das Overlay darüber und blendet sanft ein/aus.
 *     → echte Bewegung, robust (keine Browser-Video-Decodierung nötig).
 *
 * Anti-Slop: kein Autoplay, kein non-deterministic Timer.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { ensureDir } = require("../util");

function runFfmpeg(args, label) {
  try {
    // execFileSync (ohne Shell) — verhindert Quoting-Probleme bei filter_complex
    // (enthält ';' '[' ']' ',' die eine Shell sonst interpretieren würde).
    execFileSync("ffmpeg", ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-600) : err.message;
    throw new Error(`ffmpeg fehlgeschlagen (${label}):\n${stderr}`);
  }
}

/**
 * Rendert eine animierte Szene zu einem Segment-MP4.
 */
async function renderAnimatedSegment({ context, scenePath, segPath, framesDir, fps, log, index }) {
  const page = await context.newPage();
  await page.goto(`file://${scenePath}`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(400);

  const sceneDuration = await page.evaluate(() => window.__duration || 3);
  const frameCount = Math.ceil(sceneDuration * fps);

  const sceneFrames = path.join(framesDir, `scene-${index}`);
  ensureDir(sceneFrames);

  for (let f = 0; f < frameCount; f++) {
    const t = f / fps;
    await page.evaluate((time) => {
      if (window.__timeline) window.__timeline.seek(time);
    }, t);
    await page.waitForTimeout(8);
    await page.screenshot({ path: path.join(sceneFrames, `f-${String(f).padStart(5, "0")}.png`) });
  }
  await page.close();

  runFfmpeg(
    [
      "-framerate", String(fps),
      "-i", path.join(sceneFrames, "f-%05d.png"),
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-pix_fmt", "yuv420p", "-r", String(fps),
      segPath,
    ],
    `animated-seg-${index}`
  );

  // Frames aufräumen (Platz sparen)
  try { fs.rmSync(sceneFrames, { recursive: true, force: true }); } catch (_) {}
  return { duration: sceneDuration, frames: frameCount };
}

/**
 * Rendert eine Clip-Szene (echtes Video + Brand-Overlay) zu einem Segment-MP4.
 */
async function renderClipSegment({ context, scenePath, clip, segPath, fps, viewport, log, index }) {
  const { width, height } = viewport;
  const dur = clip.duration;

  // 1) Transparentes Overlay-PNG rendern (einmal)
  const overlayPng = path.join(path.dirname(segPath), `overlay-${index}.png`);
  if (scenePath && fs.existsSync(scenePath)) {
    const page = await context.newPage();
    await page.goto(`file://${scenePath}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: overlayPng, omitBackground: true });
    await page.close();
  }

  const hasOverlay = fs.existsSync(overlayPng);
  const fadeOut = Math.max(0, dur - 0.4);

  // 2) ffmpeg: Video-Ausschnitt skalieren/padden + Overlay + Fade
  const scalePad =
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1`;
  const fade = `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.4`;

  const args = [];
  if (clip.kind === "image") {
    // Statisches Bild als Quelle (geloopt für die Szenendauer)
    args.push("-loop", "1", "-t", String(dur), "-i", clip.source);
  } else {
    args.push("-ss", String(clip.start), "-t", String(dur), "-i", clip.source);
  }

  if (hasOverlay) {
    args.push("-i", overlayPng);
    args.push(
      "-filter_complex",
      `[0:v]${scalePad},fps=${fps}[bg];[bg][1:v]overlay=0:0,${fade}[v]`,
      "-map", "[v]"
    );
  } else {
    args.push("-vf", `${scalePad},fps=${fps},${fade}`);
  }

  args.push(
    "-c:v", "libx264", "-preset", "medium", "-crf", "21",
    "-pix_fmt", "yuv420p", "-r", String(fps), "-an",
    segPath
  );

  runFfmpeg(args, `clip-seg-${index}`);
  return { duration: dur, frames: Math.ceil(dur * fps) };
}

/**
 * @param {object} args
 * @param {string[]} args.scenePaths   geordnete HTML-Pfade (Overlay-HTML bei Clips)
 * @param {object[]} [args.scenes]     optionale Szenen-Deskriptoren (mit .clip)
 * @param {object} args.cfg
 * @param {string} args.outDir
 * @param {object} [args.logger]
 */
async function renderBuiltin({ scenePaths, scenes, cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {}, error() {} };
  const fps = cfg.video.fps || 30;
  const viewport = cfg.viewport;

  const framesDir = path.join(outDir, "frames");
  const segDir = path.join(outDir, "segments");
  ensureDir(framesDir);
  ensureDir(segDir);
  ensureDir(path.join(outDir, "out"));

  const descriptors = scenePaths.map((p, i) => ({
    htmlPath: p,
    clip: scenes && scenes[i] ? scenes[i].clip : null,
  }));

  const clipCount = descriptors.filter((d) => d.clip).length;
  log.info(`Renderer: ${descriptors.length} Szenen (${clipCount} Clips) @ ${fps} fps, ${viewport.width}x${viewport.height}`);

  const browser = await chromium.launch({ headless: true });
  const segPaths = [];
  let totalFrames = 0;
  let totalDuration = 0;

  try {
    const context = await browser.newContext({ viewport });

    for (let si = 0; si < descriptors.length; si++) {
      const d = descriptors[si];
      const segPath = path.join(segDir, `seg-${String(si).padStart(3, "0")}.mp4`);
      const baseName = d.htmlPath ? path.basename(d.htmlPath) : `scene-${si}`;

      let res;
      if (d.clip && d.clip.source && fs.existsSync(d.clip.source)) {
        log.info(`  Szene ${si + 1}/${descriptors.length}: ${baseName} [CLIP ${d.clip.duration}s]`);
        res = await renderClipSegment({
          context, scenePath: d.htmlPath, clip: d.clip, segPath, fps, viewport, log, index: si,
        });
      } else {
        res = await renderAnimatedSegment({
          context, scenePath: d.htmlPath, segPath, framesDir, fps, log, index: si,
        });
        log.info(`  Szene ${si + 1}/${descriptors.length}: ${baseName} (${res.duration}s, ${res.frames} Frames)`);
      }

      segPaths.push(segPath);
      totalFrames += res.frames;
      totalDuration += res.duration;
    }

    await context.close();
  } finally {
    await browser.close();
  }

  log.ok(`${segPaths.length} Segmente gerendert (${totalDuration.toFixed(1)}s).`);

  // Concat-Liste schreiben
  const listFile = path.join(segDir, "concat.txt");
  fs.writeFileSync(listFile, segPaths.map((p) => `file '${p}'`).join("\n"), "utf-8");

  // Segmente zusammenfügen
  const mp4Path = path.join(outDir, "out", "final.mp4");
  log.info("ffmpeg: Segmente → finales MP4 ...");
  runFfmpeg(
    [
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libx264", "-preset", "medium", "-crf", "22",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      mp4Path,
    ],
    "concat"
  );

  // Aufräumen
  try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch (_) {}

  const stats = fs.statSync(mp4Path);
  log.ok(`Video: ${mp4Path} (${(stats.size / 1024 / 1024).toFixed(1)} MB, ${totalDuration.toFixed(1)}s)`);
  return { mp4Path, frames: totalFrames, durationSec: totalDuration };
}

module.exports = { renderBuiltin };
