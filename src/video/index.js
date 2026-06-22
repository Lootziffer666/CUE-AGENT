"use strict";

/**
 * Video-Pipeline Orchestrator.
 *
 * Verkettet Phasen 0–5:
 *   0 Discovery → 1 Storytelling → 2 Capture → 3 Design → 4 Production → 5 Audio+Render
 */

const path = require("path");
const { ensureDir, timestamp, slugify, writeJson } = require("../util");
const { ASPECT_DIMENSIONS } = require("../config");
const { capture } = require("../core/capture");
const { defaultFlow, loadFlow } = require("../core/flow");
const { writeBundle, readBundle } = require("../core/bundle");
const { runDiscovery } = require("./phase0-discovery");
const { buildStoryboard } = require("./phase1-storytelling");
const { generateDesign } = require("./phase3-design");
const { runProduction } = require("./phase4-production");
const { runAudioRender } = require("./phase5-audio-render");
const { loadScript } = require("./script");
const { evaluateGate } = require("../qa/gate");

/**
 * @param {object} args
 * @param {string} args.url           Ziel-URL (optional, wenn Script ohne Screenshots)
 * @param {string} args.mode          "promo" | "tutorial" | "showcase"
 * @param {object} args.cfg           aufgelöste Config
 * @param {string} [args.flowFile]    optionaler Flow (für Tutorial besonders nützlich)
 * @param {string} [args.scriptFile]  optionales Script (ersetzt Auto-Storyboard)
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
  scriptFile = null,
  outDir = null,
  recordVideo = true,
  skipGate = false,
  logger,
}) {
  const log = logger || require("../util").makeLogger("VIDEO");

  // Script laden (falls angegeben) — bestimmt Storyboard + ggf. Meta
  let scriptResult = null;
  if (scriptFile) {
    scriptResult = loadScript(scriptFile);
    log.info(`Script geladen: ${scriptResult.storyboard.totalScenes} Szenen (${scriptFile})`);
  }

  // Script-Meta auf Config anwenden (brand, voice, aspect, lang)
  if (scriptResult && scriptResult.meta) {
    const meta = scriptResult.meta;
    cfg = { ...cfg, video: { ...cfg.video }, audio: { ...cfg.audio } };
    if (meta.brand) cfg.video.brand = meta.brand;
    if (meta.aspect && ASPECT_DIMENSIONS[meta.aspect]) {
      cfg.video.aspect = meta.aspect;
      cfg.viewport = { ...ASPECT_DIMENSIONS[meta.aspect] };
    }
    if (meta.voice) cfg.audio.voice = meta.voice;
    if (meta.lang) cfg.lang = meta.lang;
  }

  // URL ist optional, wenn ein Script ohne Screenshot-Szenen vorliegt
  const needsCapture = !scriptResult || scriptResult.storyboard.scenes.some((s) => s.type === "screenshot");
  if (!url && needsCapture) {
    throw new Error(
      cfg.lang === "en"
        ? "No URL provided (required for capture / screenshot scenes)."
        : "Keine URL angegeben (für Capture/Screenshot-Szenen erforderlich)."
    );
  }

  const effectiveMode = (scriptResult && scriptResult.meta.mode) || mode;
  const slugBase = url || (scriptResult && scriptResult.meta.title) || "script";

  // Projektverzeichnis
  const ts = timestamp();
  const slug = slugify(slugBase);
  const projectDir = outDir || path.join(cfg.root, "video-projects", `${slug}-${effectiveMode}-${ts}`);
  ensureDir(projectDir);

  log.info(`Video-Pipeline: ${effectiveMode} | ${url || "(Script ohne URL)"}`);
  log.info(`Projekt: ${projectDir}`);

  // QA-Gate: "erst QA, dann Promo" — nur wenn eine URL beworben wird
  let gateResult = null;
  const gateCfg = (cfg.qa && cfg.qa.gate) || {};
  if (url && gateCfg.requireForVideo && !skipGate) {
    gateResult = evaluateGate({ url, cfg });
    if (!gateResult.passed) {
      const hint = cfg.lang === "en"
        ? 'Override only if you know what you do: add --skip-qa-gate.'
        : 'Override nur bewusst: mit --skip-qa-gate erzwingen.';
      throw new Error(`QA-Gate nicht bestanden [${gateResult.code}]: ${gateResult.reason}\n${hint}`);
    }
    log.ok(`QA-Gate: ${gateResult.reason}`);
  } else if (url && skipGate) {
    log.warn("QA-Gate übersprungen (--skip-qa-gate). Es wird ggf. eine ungeprüfte App beworben.");
    gateResult = { passed: false, code: "skipped", reason: "übersprungen via --skip-qa-gate" };
  }

  // Flow
  const flow = flowFile ? loadFlow(flowFile) : (url ? defaultFlow(url) : { steps: [], meta: {} });

  // Phase 0: Discovery
  const context = runDiscovery({ url: url || slugBase, cfg, mode: effectiveMode, flow, logger: log });
  writeJson(path.join(projectDir, "context.json"), context);

  // Phase 2: Capture (nur wenn nötig: URL vorhanden und Screenshots gebraucht)
  let captureResult = null;
  if (url && needsCapture) {
    log.info("Phase 2: Capture");
    captureResult = await capture({
      url,
      cfg,
      flow,
      intent: effectiveMode,
      outDir: projectDir,
      recordVideo,
      collectA11yTree: false,
      logger: log,
    });
    const bundlePath = writeBundle(captureResult, projectDir, gateResult ? {
      qaGate: {
        passed: gateResult.passed,
        code: gateResult.code,
        score: gateResult.score != null ? gateResult.score : null,
        level: gateResult.level || null,
        reportRef: gateResult.file || null,
      },
    } : {});
    log.ok(`Bundle: ${bundlePath}`);
  } else {
    log.info("Phase 2: Capture übersprungen (Script ohne Screenshot-Szenen)");
  }

  // Phase 1: Storytelling — aus Script oder automatisch generiert
  const storyboard = scriptResult
    ? scriptResult.storyboard
    : buildStoryboard({ context, flow, bundle: captureResult, logger: log });
  writeJson(path.join(projectDir, "storyboard.json"), storyboard);

  // Render-Dimensionen aus Aspect
  const dims = cfg.viewport;

  // Video-Quelle für echte Clips (falls aufgenommen)
  const videoSource = captureResult && captureResult.video
    ? path.join(projectDir, captureResult.video)
    : null;

  // Medienordner (eigene Assets/Referenzen)
  const mediaDir = cfg.mediaDir
    ? (path.isAbsolute(cfg.mediaDir) ? cfg.mediaDir : path.join(cfg.root, cfg.mediaDir))
    : null;

  // Phase 2.5: Auto-Bildgenerierung für image-Szenen ohne Asset
  if (cfg.image && cfg.image.mode === "auto") {
    const { generateImage, imageProviderAvailable } = require("../image");
    if (imageProviderAvailable(cfg)) {
      const genDir = path.join(projectDir, "media");
      const theme = cfg.image.theme || (context.goal || "");
      for (const s of storyboard.scenes || []) {
        if (s.type !== "image") continue;
        const hasAsset = s.mediaFile || s._imageSource;
        if (hasAsset) continue;
        const prompt = [theme, s.heading, s.narration].filter(Boolean).join(" — ");
        if (!prompt) continue;
        try {
          const out = path.join(genDir, `gen-${s.id}.png`);
          await generateImage({ prompt, outPath: out, cfg, logger: log });
          s._imageSource = out;
          log.ok(`Bild generiert: ${out}`);
        } catch (err) {
          log.warn(`Bildgenerierung für "${s.id}" fehlgeschlagen: ${err.message}`);
        }
      }
    } else {
      log.warn("Bild-Auto-Modus aktiv, aber kein Bild-Provider (CUE_LLM_BASE_URL/image.baseUrl) — übersprungen.");
    }
  }

  // Phase 3: Design (generiert HTML-Szenen + ggf. Clip-Overlays)
  const { scenePaths, renderScenes, designMdPath } = generateDesign({
    storyboard,
    context,
    projectDir,
    screenshotsDir: captureResult
      ? path.join(projectDir, captureResult.screenshotsDir || "screenshots")
      : null,
    videoSource,
    mediaDir,
    dims,
    logger: log,
  });
  log.ok(`Design: ${scenePaths.length} Szenen + ${designMdPath}`);

  // Phase 4: Production (Lint + Render → stummes MP4)
  const production = await runProduction({
    scenePaths,
    scenes: renderScenes,
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
    mode: effectiveMode,
    url: url || null,
    source: scriptResult ? "script" : "auto",
    brand: context.brand,
    aspect: cfg.video.aspect,
    qaGate: gateResult
      ? { passed: gateResult.passed, code: gateResult.code, score: gateResult.score != null ? gateResult.score : null, level: gateResult.level || null }
      : { applied: false, reason: url ? "disabled" : "no-url" },
    createdAt: new Date().toISOString(),
    phases: {
      discovery: "done",
      storytelling: scriptResult ? "from-script" : "done",
      capture: captureResult ? "done" : "skipped",
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
