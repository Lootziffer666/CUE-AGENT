"use strict";

/**
 * Video-Pipeline Orchestrator.
 *
 * Verkettet Phasen 0–5:
 *   0 Discovery → 1 Storytelling → 2 Capture → 3 Design → 4 Production → 5 Audio+Render
 */

const path = require("path");
const { ensureDir, timestamp, slugify, writeJson } = require("../util");
const { capture } = require("../core/capture");
const { defaultFlow, loadFlow } = require("../core/flow");
const { writeBundle, readBundle } = require("../core/bundle");
const { runDiscovery } = require("./phase0-discovery");
const { buildStoryboard } = require("./phase1-storytelling");
const { generateDesign } = require("./phase3-design");
const { runProduction } = require("./phase4-production");
const { runAudioRender } = require("./phase5-audio-render");

/**
 * @param {object} args
 * @param {string} args.url           Ziel-URL
 * @param {string} args.mode          "promo" | "tutorial" | "showcase"
 * @param {object} args.cfg           aufgelöste Config
 * @param {string} [args.flowFile]    optionaler Flow (für Tutorial besonders nützlich)
 * @param {string} [args.outDir]      Ausgabe-Verzeichnis
 * @param {boolean} [args.recordVideo] Video in Phase 2 aufnehmen
 * @param {object} [args.logger]
 * @returns {Promise<{mp4Path:string, projectDir:string, storyboard:object}>}
 */
async function runVideo({
  url,
  mode = "promo",
  cfg,
  flowFile = null,
  outDir = null,
  recordVideo = true,
  logger,
}) {
  const log = logger || require("../util").makeLogger("VIDEO");

  if (!url) {
    throw new Error(cfg.lang === "en" ? "No URL provided." : "Keine URL angegeben.");
  }

  // Projektverzeichnis
  const ts = timestamp();
  const slug = slugify(url);
  const projectDir = outDir || path.join(cfg.root, "video-projects", `${slug}-${mode}-${ts}`);
  ensureDir(projectDir);

  log.info(`Video-Pipeline: ${mode} | ${url}`);
  log.info(`Projekt: ${projectDir}`);

  // Flow
  const flow = flowFile ? loadFlow(flowFile) : defaultFlow(url);

  // Phase 0: Discovery
  const context = runDiscovery({ url, cfg, mode, flow, logger: log });
  writeJson(path.join(projectDir, "context.json"), context);

  // Phase 2: Capture (vor Storytelling, damit wir Screenshots für Storyboard haben)
  log.info("Phase 2: Capture");
  const captureResult = await capture({
    url,
    cfg,
    flow,
    intent: mode,
    outDir: projectDir,
    recordVideo,
    collectA11yTree: false,
    logger: log,
  });
  const bundlePath = writeBundle(captureResult, projectDir);
  log.ok(`Bundle: ${bundlePath}`);

  // Phase 1: Storytelling (nutzt Bundle für Screenshot-Referenzen)
  const storyboard = buildStoryboard({ context, flow, bundle: captureResult, logger: log });
  writeJson(path.join(projectDir, "storyboard.json"), storyboard);

  // Phase 3: Design (generiert HTML-Szenen)
  const { scenePaths, designMdPath } = generateDesign({
    storyboard,
    context,
    projectDir,
    screenshotsDir: path.join(projectDir, captureResult.screenshotsDir || "screenshots"),
    logger: log,
  });
  log.ok(`Design: ${scenePaths.length} Szenen + ${designMdPath}`);

  // Phase 4: Production (Lint + Render → stummes MP4)
  const production = await runProduction({
    scenePaths,
    cfg,
    projectDir,
    logger: log,
  });

  // Phase 5: Audio & Final Render
  const audio = await runAudioRender({
    storyboard,
    cfg,
    projectDir,
    silentMp4Path: production.mp4Path,
    durationSec: production.durationSec,
    logger: log,
  });

  // Projekt-Plan (Zusammenfassung)
  const plan = {
    tool: "cue-agent",
    mode,
    url,
    createdAt: new Date().toISOString(),
    phases: {
      discovery: "done",
      storytelling: "done",
      capture: "done",
      design: "done",
      production: "done",
      audio: audio.hasAudio ? "done" : "skipped (no keys or failed)",
    },
    storyboard: { scenes: storyboard.totalScenes, estimatedDuration: storyboard.estimatedDuration },
    output: {
      mp4: audio.finalMp4,
      frames: production.frames,
      durationSec: production.durationSec,
      hasAudio: audio.hasAudio,
      voiceoverSkipped: audio.voiceoverSkipped,
      musicSkipped: audio.musicSkipped,
    },
    lintWarnings: production.lintWarnings.length,
  };
  writeJson(path.join(projectDir, "project-plan.json"), plan);

  if (audio.hasAudio) {
    log.ok(`\nFertig! Video MIT Audio: ${audio.finalMp4}`);
  } else {
    log.ok(`\nFertig! Video (stumm): ${production.mp4Path}`);
  }
  log.ok(`Dauer: ${production.durationSec.toFixed(1)}s, ${production.frames} Frames`);

  return {
    mp4Path: audio.finalMp4,
    projectDir,
    storyboard,
    plan,
  };
}

module.exports = { runVideo };
