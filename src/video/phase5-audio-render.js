"use strict";

/**
 * Phase 5: Audio & Final Render.
 *
 * 1. Voiceover generieren (ElevenLabs TTS)
 * 2. Musik suchen (Freesound) 
 * 3. Audio mischen (ffmpeg)
 * 4. Audio + stummes Video muxen → finales MP4 mit Ton
 *
 * Bei fehlendem Key/Fehler: saubere Degradation (Video bleibt stumm).
 */

const path = require("path");
const { generateVoiceover, fetchMusic, mixAudio, muxVideoAudio } = require("../audio");

/**
 * @param {object} args
 * @param {object} args.storyboard     Storyboard mit Narrations
 * @param {object} args.cfg            Config (mit Secrets)
 * @param {string} args.projectDir     Projekt-Verzeichnis
 * @param {string} args.silentMp4Path  Pfad zum stummen MP4 aus Phase 4
 * @param {number} args.durationSec    Video-Dauer
 * @param {object} [args.logger]
 * @returns {Promise<{finalMp4:string, hasAudio:boolean, voiceoverSkipped:boolean, musicSkipped:boolean}>}
 */
async function runAudioRender({ storyboard, cfg, projectDir, silentMp4Path, durationSec, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  log.info("Phase 5: Audio & Final Render");

  // 1. Voiceover
  const { voiceoverPath, script, skipped: voiceoverSkipped } = await generateVoiceover({
    storyboard,
    cfg,
    outDir: projectDir,
    logger: log,
  });

  // 2. Musik
  const { musicPath, skipped: musicSkipped } = await fetchMusic({
    cfg,
    outDir: projectDir,
    targetDuration: durationSec,
    logger: log,
  });

  // 3. Mix
  const { mixedPath, hasAudio } = mixAudio({
    voiceoverPath,
    musicPath,
    durationSec,
    outDir: projectDir,
    logger: log,
  });

  // 4. Mux (Video + Audio → finales MP4)
  let finalMp4 = silentMp4Path;
  if (hasAudio && mixedPath) {
    const finalPath = path.join(projectDir, "out", "final.mp4");
    // Stummes MP4 umbenennen → silent.mp4
    const silentBackup = path.join(projectDir, "out", "silent.mp4");
    const fs = require("fs");
    if (fs.existsSync(silentMp4Path)) {
      fs.renameSync(silentMp4Path, silentBackup);
    }
    finalMp4 = muxVideoAudio({
      videoPath: silentBackup,
      audioPath: mixedPath,
      outPath: finalPath,
      logger: log,
    });
  } else {
    log.info("Kein Audio verfügbar — Video bleibt stumm.");
  }

  return {
    finalMp4,
    hasAudio,
    voiceoverSkipped,
    musicSkipped,
    script: script || "",
  };
}

module.exports = { runAudioRender };
