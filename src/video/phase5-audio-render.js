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

const fs = require("fs");
const path = require("path");
const {
  generateVoiceover,
  generateTimedVoiceover,
  fetchMusic,
  mixAudio,
  mixTimedAudio,
  muxVideoAudio,
} = require("../audio");
const { ensureSfx, mixSfx } = require("../audio/sfx");

/** Szenen-Übergänge (kumulierte Startzeiten) aus den Storyboard-Dauern. */
function sceneOffsets(storyboard) {
  const offsets = [];
  let acc = 0;
  for (const s of storyboard.scenes || []) {
    acc += Number(s.duration || s.clipDuration || 3);
    offsets.push(acc);
  }
  return offsets;
}

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

  // SFX vorbereiten (synthetisierter Whoosh oder eigene Datei) + Übergänge.
  let sfxPath = null;
  const offsets = sceneOffsets(storyboard);
  if (audioCfg.sfx) sfxPath = ensureSfx({ cfg, outDir: projectDir, logger: log });

  // Musik (Toggle/eigene Datei/Freesound — in fetchMusic gehandhabt)
  const { musicPath, skipped: musicSkipped } = await fetchMusic({
    cfg,
    outDir: projectDir,
    targetDuration: durationSec,
    logger: log,
  });

  let mixedPath = null, hasAudio = false, script = "", voiceoverSkipped = true, sfxUsed = false;

  // 1. Bevorzugt: szenen-synchrones Voiceover (jeder Clip am Szenen-Start) +
  //    Musik + SFX in EINEM robusten Mix-Pass (PCM, normalize=0, exakte Länge).
  let timedClips = [];
  if (audioCfg.voiceover === false) {
    log.info("Sprachausgabe deaktiviert (Toggle aus).");
  } else {
    const tv = await generateTimedVoiceover({ storyboard, cfg, outDir: projectDir, logger: log });
    if (!tv.skipped && tv.clips.length) {
      timedClips = tv.clips; script = tv.script; voiceoverSkipped = false;
    } else {
      log.warn("Szenen-Voiceover nicht verfügbar — Fallback auf zusammenhängendes Voiceover.");
    }
  }

  if (timedClips.length || (audioCfg.voiceover === false && (musicPath || sfxPath))) {
    const timed = mixTimedAudio({
      clips: timedClips, musicPath, sfxPath, sfxOffsets: offsets,
      durationSec, outDir: projectDir, logger: log,
    });
    mixedPath = timed.mixedPath; hasAudio = timed.hasAudio;
    sfxUsed = hasAudio && !!sfxPath;
  } else if (audioCfg.voiceover !== false) {
    // 2. Fallback: zusammenhängendes Voiceover (alter Pfad) + Musik + SFX.
    const vo = await generateVoiceover({ storyboard, cfg, outDir: projectDir, logger: log });
    voiceoverSkipped = vo.skipped; script = vo.script;
    const m = mixAudio({ voiceoverPath: vo.voiceoverPath, musicPath, durationSec, outDir: projectDir, logger: log });
    mixedPath = m.mixedPath; hasAudio = m.hasAudio;
    if (audioCfg.sfx && sfxPath && hasAudio) {
      const sfxOut = path.join(projectDir, "audio", "with-sfx.mp3");
      const merged = mixSfx({ basePath: mixedPath, sfxPath, offsets, durationSec, outPath: sfxOut, logger: log });
      if (merged) { mixedPath = merged; sfxUsed = true; }
    }
  }

  // 4. Mux (Video + Audio → finales MP4)
  let finalMp4 = silentMp4Path;
  if (hasAudio && mixedPath) {
    if (fs.existsSync(silentMp4Path)) {
      const finalPath = path.join(projectDir, "out", "final.mp4");
      const silentBackup = path.join(projectDir, "out", "silent.mp4");
      fs.renameSync(silentMp4Path, silentBackup);
      finalMp4 = muxVideoAudio({
        videoPath: silentBackup,
        audioPath: mixedPath,
        outPath: finalPath,
        logger: log,
      });
    } else {
      log.warn(`Stummes Video unter ${silentMp4Path} nicht gefunden — Audio-Mux übersprungen.`);
    }
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
