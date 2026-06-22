"use strict";

/**
 * `cue render <dir>`: rendert ein vorhandenes Video-Projekt neu.
 *
 * Nutzt die bereits generierten scenes/*.html (Phase 4) und optional das
 * vorhandene Storyboard/Audio (Phase 5). Schnelle Iteration ohne erneutes
 * Capture/Design. Entspricht dem `--jump-to render`-Gedanken aus der Roadmap.
 */

const fs = require("fs");
const path = require("path");
const { runProduction } = require("./phase4-production");
const { runAudioRender } = require("./phase5-audio-render");

/**
 * @param {object} args
 * @param {string} args.projectDir  vorhandenes Projektverzeichnis
 * @param {object} args.cfg
 * @param {object} [args.logger]
 * @returns {Promise<object>}
 */
async function runRender({ projectDir, cfg, force = false, logger }) {
  const log = logger || require("../util").makeLogger("RENDER");

  const abs = path.resolve(projectDir);
  const scenesDir = path.join(abs, "scenes");
  if (!fs.existsSync(scenesDir)) {
    throw new Error(`Kein scenes/-Verzeichnis in ${abs}. Erst ein Video erzeugen (cue promo/tutorial/showcase).`);
  }

  // Szenen einsammeln (sortiert)
  const scenePaths = fs
    .readdirSync(scenesDir)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => path.join(scenesDir, f));

  if (scenePaths.length === 0) {
    throw new Error(`Keine scenes/*.html in ${scenesDir} gefunden.`);
  }

  log.info(`Re-Render: ${scenePaths.length} Szenen aus ${abs}`);

  // Storyboard laden (für Audio/Narration + Clip-Rekonstruktion), falls vorhanden
  let storyboard = { scenes: [] };
  const sbPath = path.join(abs, "storyboard.json");
  if (fs.existsSync(sbPath)) {
    storyboard = JSON.parse(fs.readFileSync(sbPath, "utf-8"));
  }

  // Clip-Metadaten aus Storyboard rekonstruieren (damit echte Clips erhalten bleiben)
  const videoSource = ["capture.webm", "capture.mp4"]
    .map((f) => path.join(abs, f))
    .find((p) => fs.existsSync(p)) || null;

  const renderScenes = scenePaths.map((sp) => {
    const base = path.basename(sp);
    // Clip-Overlays heißen NN-id.overlay.html
    if (videoSource && base.includes(".overlay.")) {
      const sb = (storyboard.scenes || []).find(
        (s) => s.type === "clip" && base.includes(`-${s.id}.overlay`)
      );
      if (sb) {
        return { clip: { source: videoSource, start: sb.clipStart || 0, duration: sb.clipDuration || 4 } };
      }
    }
    return { clip: null };
  });

  // Phase 4: Production (Lint + Render). force = alle Szenen neu, sonst Cache nutzen.
  const production = await runProduction({ scenePaths, scenes: renderScenes, cfg, projectDir: abs, force, logger: log });

  // Phase 5: Audio (falls Storyboard Narration enthält)
  const audio = await runAudioRender({
    storyboard,
    cfg,
    projectDir: abs,
    silentMp4Path: production.mp4Path,
    durationSec: production.durationSec,
    logger: log,
  });

  log.ok(`Re-Render fertig: ${audio.finalMp4}`);
  return {
    mp4: audio.finalMp4,
    frames: production.frames,
    durationSec: production.durationSec,
    hasAudio: audio.hasAudio,
    scenes: scenePaths.length,
  };
}

module.exports = { runRender };
