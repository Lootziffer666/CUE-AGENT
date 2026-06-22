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
const { ensureSfx, mixSfx } = require("../audio/sfx");

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

  const audioCfg = cfg.audio || {};

  // 1. Voiceover (nur wenn Toggle an)
  let voiceoverPath = null, script = "", voiceoverSkipped = true;
  if (audioCfg.voiceover === false) {
    log.info("Sprachausgabe deaktiviert (Toggle aus).");
  } else {
    const vo = await generateVoiceover({ storyboard, cfg, outDir: projectDir, logger: log });
    voiceoverPath = vo.voiceoverPath; script = vo.script; voiceoverSkipped = vo.skipped;
  }

  // 2. Musik (Toggle/eigene Datei/Freesound — in fetchMusic gehandhabt)
  const { musicPath, skipped: musicSkipped } = await fetchMusic({
    cfg,
    outDir: projectDir,
    targetDuration: durationSec,
    logger: log,
  });

  // 3. Mix (Voiceover + Musik)
  let { mixedPath, hasAudio } = mixAudio({
    voiceoverPath,
    musicPath,
    durationSec,
    outDir: projectDir,
    logger: log,
  });

  // 3b. Soundeffekte an Szenen-Übergängen (Toggle)
  let sfxUsed = false;
  if (audioCfg.sfx) {
    const sfxPath = ensureSfx({ cfg, outDir: projectDir, logger: log });
    if (sfxPath) {
      // Übergangs-Zeitpunkte aus Storyboard-Dauern berechnen
      const offsets = [];
      let acc = 0;
      for (const s of storyboard.scenes || []) {
        acc += s.duration || s.clipDuration || 3;
        offsets.push(acc);
      }
      const sfxOut = path.join(projectDir, "audio", "with-sfx.mp3");
      const merged = mixSfx({ basePath: mixedPath, sfxPath, offsets, durationSec, outPath: sfxOut, logger: log });
      if (merged) { mixedPath = merged; hasAudio = true; sfxUsed = true; }
    }
  }

  // 4. Mux (Video + Audio → finales MP4)
  let finalMp4 = silentMp4Path;
  if (hasAudio && mixedPath) {
    const finalPath = path.join(projectDir, "out", "final.mp4");
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
    sfxUsed,
    script: script || "",
  };
}

module.exports = { runAudioRender };
