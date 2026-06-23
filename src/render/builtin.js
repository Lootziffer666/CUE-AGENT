"use strict";

/**
 * Eingebauter Renderer (segment-basiert, mit szenenweisem Caching).
 *
 * Jede Szene wird zu einem eigenen MP4-Segment, danach werden alle Segmente
 * zusammengefügt (concat). Zwei Szenentypen:
 *
 *  A) Animierte Szene (HTML + GSAP):
 *     Playwright öffnet die Szene, scrubbt die Timeline deterministisch
 *     (timeline.seek(t) pro Frame), schießt pro Frame ein JPEG,
 *     ffmpeg kodiert die Frames zum Segment. 100% reproduzierbar.
 *
 *  B) Clip-/Bild-Szene:
 *     Ein transparentes Overlay (Brand-Caption/Chapter/Heading) wird einmal
 *     als PNG gerendert; ffmpeg skaliert/padded den Video-Ausschnitt bzw. das
 *     Bild auf die Canvas, legt das Overlay darüber und blendet sanft ein/aus.
 *
 * Szenenweise Überarbeitung: Pro Szene wird ein Hash (HTML-Inhalt + Clip-Meta
 * + fps + Canvas) gebildet. Existiert bereits ein Segment mit gleichem Hash,
 * wird es WIEDERVERWENDET (kein Re-Render). So rendert `cue render <dir>` nach
 * einer Szenen-Änderung nur die geänderte Szene neu. `force` erzwingt alles.
 *
 * Anti-Slop: kein Autoplay, kein non-deterministic Timer.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { ensureDir } = require("../util");
const { buildSpeedStage } = require("./speed");

function runFfmpeg(args, label) {
  try {
    // execFileSync (ohne Shell) — verhindert Quoting-Probleme bei filter_complex.
    // -loglevel error + großer maxBuffer: verhindert "maxBuffer exceeded" bei
    // langen Renders (ffmpeg ist auf stderr sehr gesprächig).
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-600) : err.message;
    throw new Error(`ffmpeg fehlgeschlagen (${label}):\n${stderr}`);
  }
}

function fileUrl(p) {
  return pathToFileURL(p).href;
}

// Hash über alles, was das gerenderte Segment beeinflusst.
function sceneHash({ htmlPath, clip, fps, viewport }) {
  const h = crypto.createHash("sha1");
  try {
    if (htmlPath && fs.existsSync(htmlPath)) h.update(fs.readFileSync(htmlPath));
  } catch (_) {}
  if (clip) {
    h.update("clip:" + clip.kind + ":" + clip.start + ":" + clip.duration + ":" + (clip.source || ""));
    // Polish-B: Speed-Ramping beeinflusst das Segment → in den Hash aufnehmen.
    if (clip.speed != null) h.update("speed:" + clip.speed);
    if (clip.speedRegions) h.update("speedRegions:" + JSON.stringify(clip.speedRegions));
    try {
      if (clip.source && fs.existsSync(clip.source)) {
        h.update("mtime:" + fs.statSync(clip.source).mtimeMs);
      }
    } catch (_) {}
  }
  h.update(`fps:${fps};vp:${viewport.width}x${viewport.height}`);
  return h.digest("hex");
}

/**
 * Rendert eine animierte Szene zu einem Segment-MP4.
 */
async function renderAnimatedSegment({ context, scenePath, segPath, framesDir, fps, log, index }) {
  const page = await context.newPage();
  let sceneDuration = 3;
  try {
    await page.goto(fileUrl(scenePath), { waitUntil: "networkidle", timeout: 15000 });

    const info = await page.evaluate(() => ({
      duration: window.__duration,
      hasTimeline: !!window.__timeline,
    }));
    if (!info.hasTimeline) {
      log.warn(`  GSAP-Timeline fehlt in ${path.basename(scenePath)} — Szene wird statisch gerendert (GSAP-Ladefehler?).`);
    }
    sceneDuration = typeof info.duration === "number" && info.duration > 0 ? info.duration : 3;
    const frameCount = Math.ceil(sceneDuration * fps);

    const sceneFrames = path.join(framesDir, `scene-${index}`);
    ensureDir(sceneFrames);

    for (let f = 0; f < frameCount; f++) {
      const t = f / fps;
      await page.evaluate((time) => {
        if (window.__timeline) window.__timeline.seek(time);
      }, t);
      // Deterministisch auf den nächsten Render-Frame warten (statt fixem Timeout)
      await page.evaluate(() => new Promise(requestAnimationFrame));
      // JPEG q90: deutlich schneller als PNG, keine Transparenz nötig
      await page.screenshot({
        path: path.join(sceneFrames, `f-${String(f).padStart(5, "0")}.jpg`),
        type: "jpeg",
        quality: 90,
      });
    }

    runFfmpeg(
      [
        "-framerate", String(fps),
        "-i", path.join(sceneFrames, "f-%05d.jpg"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-pix_fmt", "yuv420p", "-r", String(fps),
        segPath,
      ],
      `animated-seg-${index}`
    );

    try { fs.rmSync(sceneFrames, { recursive: true, force: true }); } catch (_) {}
    return { duration: sceneDuration, frames: frameCount };
  } finally {
    await page.close();
  }
}

/**
 * Rendert eine Clip-/Bild-Szene (Video bzw. Bild + Brand-Overlay) zu einem Segment.
 */
async function renderClipSegment({ context, scenePath, clip, segPath, fps, viewport, log, index }) {
  const { width, height } = viewport;
  // Polish-B: optionales Speed-Ramping (nur Video). Ändert die effektive Dauer.
  const speed = buildSpeedStage(clip);
  const dur = speed ? speed.duration : clip.duration;
  if (speed) log.info(`    Speed-Ramping aktiv → effektive Clip-Dauer ${dur}s`);

  // 1) Transparentes Overlay-PNG rendern (einmal) — PNG wegen Transparenz!
  const overlayPng = path.join(path.dirname(segPath), `overlay-${index}.png`);
  if (scenePath && fs.existsSync(scenePath)) {
    const page = await context.newPage();
    try {
      await page.goto(fileUrl(scenePath), { waitUntil: "networkidle", timeout: 15000 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.screenshot({ path: overlayPng, omitBackground: true });
    } finally {
      await page.close();
    }
  }

  const hasOverlay = fs.existsSync(overlayPng);
  const fadeOut = Math.max(0, dur - 0.4);
  const scalePad =
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1`;
  const fade = `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.4`;

  const args = [];
  if (clip.kind === "image") {
    args.push("-loop", "1", "-t", String(dur), "-i", clip.source);
  } else {
    // Quelle auf das Original-Zeitfenster trimmen (Speed wirkt danach via setpts).
    args.push("-ss", String(clip.start), "-t", String(clip.duration), "-i", clip.source);
  }

  // Filtergraph: [speed?] -> scale/fps -> [overlay] -> fade -> [v]
  const srcLabel = speed ? "[spd]" : "[0:v]";
  const speedChain = speed ? speed.chain + ";" : "";
  if (hasOverlay) {
    args.push("-i", overlayPng);
    args.push(
      "-filter_complex",
      `${speedChain}${srcLabel}${scalePad},fps=${fps}[bg];[bg][1:v]overlay=0:0,${fade}[v]`,
      "-map", "[v]"
    );
  } else {
    args.push(
      "-filter_complex",
      `${speedChain}${srcLabel}${scalePad},fps=${fps},${fade}[v]`,
      "-map", "[v]"
    );
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
 * @param {boolean} [args.force]       Cache ignorieren, alle Szenen neu rendern
 * @param {object} [args.logger]
 */
async function renderBuiltin({ scenePaths, scenes, cfg, outDir, force = false, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {}, error() {} };
  const fps = (cfg.video && cfg.video.fps) || 30;
  const viewport = cfg.viewport || { width: 1920, height: 1080 };

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
  let reused = 0;

  try {
    const context = await browser.newContext({ viewport });

    for (let si = 0; si < descriptors.length; si++) {
      const d = descriptors[si];
      const segPath = path.join(segDir, `seg-${String(si).padStart(3, "0")}.mp4`);
      const metaPath = path.join(segDir, `seg-${String(si).padStart(3, "0")}.json`);
      const baseName = d.htmlPath ? path.basename(d.htmlPath) : `scene-${si}`;
      const hash = sceneHash({ htmlPath: d.htmlPath, clip: d.clip, fps, viewport });

      // Cache-Treffer? → Segment unverändert wiederverwenden
      if (!force && fs.existsSync(segPath) && fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          if (meta.hash === hash) {
            segPaths.push(segPath);
            totalFrames += meta.frames || 0;
            totalDuration += meta.duration || 0;
            reused++;
            log.info(`  Szene ${si + 1}/${descriptors.length}: ${baseName} — unverändert, übernommen`);
            continue;
          }
        } catch (_) {}
      }

      let res;
      if (d.clip && d.clip.source && fs.existsSync(d.clip.source)) {
        log.info(`  Szene ${si + 1}/${descriptors.length}: ${baseName} [${d.clip.kind === "image" ? "BILD" : "CLIP"} ${d.clip.duration}s]`);
        res = await renderClipSegment({ context, scenePath: d.htmlPath, clip: d.clip, segPath, fps, viewport, log, index: si });
      } else {
        res = await renderAnimatedSegment({ context, scenePath: d.htmlPath, segPath, framesDir, fps, log, index: si });
        log.info(`  Szene ${si + 1}/${descriptors.length}: ${baseName} (${res.duration}s, ${res.frames} Frames)`);
      }

      // Cache-Metadaten schreiben (Hash + Dauer/Frames für Wiederverwendung)
      fs.writeFileSync(metaPath, JSON.stringify({ hash, duration: res.duration, frames: res.frames }), "utf-8");
      segPaths.push(segPath);
      totalFrames += res.frames;
      totalDuration += res.duration;
    }

    await context.close();
  } finally {
    await browser.close();
  }

  log.ok(`${segPaths.length} Segmente (${reused} wiederverwendet, ${segPaths.length - reused} neu), ${totalDuration.toFixed(1)}s.`);

  // Concat-Liste schreiben — Pfade plattformübergreifend (Backslashes -> Slashes)
  const listFile = path.join(segDir, "concat.txt");
  const listBody = segPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listFile, listBody, "utf-8");

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

  // Frames aufräumen. segments/ bleibt ABSICHTLICH erhalten → ermöglicht
  // szenenweises Re-Rendern (Cache) beim nächsten `cue render <dir>`.
  try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch (_) {}

  const stats = fs.statSync(mp4Path);
  log.ok(`Video: ${mp4Path} (${(stats.size / 1024 / 1024).toFixed(1)} MB, ${totalDuration.toFixed(1)}s)`);
  return { mp4Path, frames: totalFrames, durationSec: totalDuration, reused };
}

module.exports = { renderBuiltin };
