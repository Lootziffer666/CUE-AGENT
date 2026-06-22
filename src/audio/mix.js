"use strict";

/**
 * Audio-Mix: ffmpeg-basierte Zusammenführung von Voiceover + Musik.
 *
 * - Normalisiert Voiceover-Lautstärke
 * - Mischt Musik leiser darunter (Ducking)
 * - Schneidet auf Video-Dauer
 * - Erzeugt finales Audio-File (MP3)
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../util");

/**
 * Mischt Voiceover und Musik zu einer einzelnen Datei.
 *
 * @param {object} args
 * @param {string|null} args.voiceoverPath  Pfad zur Voiceover-MP3 (null = nur Musik)
 * @param {string|null} args.musicPath      Pfad zur Musik-MP3 (null = nur Voiceover)
 * @param {number} args.durationSec         Ziel-Dauer (Video-Länge)
 * @param {string} args.outDir              Ausgabeverzeichnis
 * @param {object} [args.logger]
 * @returns {{mixedPath:string|null, hasAudio:boolean}}
 */
function mixAudio({ voiceoverPath, musicPath, durationSec, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  if (!voiceoverPath && !musicPath) {
    log.warn("Weder Voiceover noch Musik vorhanden — Video bleibt stumm.");
    return { mixedPath: null, hasAudio: false };
  }

  ensureDir(path.join(outDir, "audio"));
  const mixedPath = path.join(outDir, "audio", "mixed.mp3");

  try {
    if (voiceoverPath && musicPath) {
      // Beide: Voiceover voll, Musik leise darunter, auf Dauer geschnitten
      log.info("ffmpeg: Mix (Voiceover + Musik @ -12dB) ...");
      const cmd = [
        "ffmpeg", "-y",
        "-i", voiceoverPath,
        "-i", musicPath,
        "-filter_complex",
        `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo];[1:a]volume=0.15,afade=t=out:st=${Math.max(0, durationSec - 3)}:d=3[mu];[vo][mu]amix=inputs=2:duration=first:dropout_transition=2[out]`,
        "-map", "[out]",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ].join(" ");
      execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
    } else if (voiceoverPath) {
      // Nur Voiceover: normalisieren + trimmen
      log.info("ffmpeg: Voiceover normalisieren ...");
      const cmd = [
        "ffmpeg", "-y",
        "-i", voiceoverPath,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ].join(" ");
      execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
    } else {
      // Nur Musik: leiser + fade-out + trimmen
      log.info("ffmpeg: Musik normalisieren ...");
      const cmd = [
        "ffmpeg", "-y",
        "-i", musicPath,
        "-af", `volume=0.3,afade=t=out:st=${Math.max(0, durationSec - 3)}:d=3`,
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ].join(" ");
      execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
    }

    const stats = fs.statSync(mixedPath);
    log.ok(`Audio-Mix: ${mixedPath} (${(stats.size / 1024).toFixed(0)} KB)`);
    return { mixedPath, hasAudio: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-300) : err.message;
    log.warn(`Audio-Mix fehlgeschlagen: ${stderr}`);
    return { mixedPath: null, hasAudio: false };
  }
}

/**
 * Mux: Audio + stummer Video → finales Video mit Ton.
 *
 * @param {object} args
 * @param {string} args.videoPath   stummes MP4
 * @param {string} args.audioPath   gemischtes Audio (MP3)
 * @param {string} args.outPath     Ziel-Pfad für finales MP4
 * @param {object} [args.logger]
 * @returns {string} outPath
 */
function muxVideoAudio({ videoPath, audioPath, outPath, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("ffmpeg: Video + Audio → finales MP4 ...");

  const cmd = [
    "ffmpeg", "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-map", "0:v:0", "-map", "1:a:0",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ].join(" ");

  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
    const stats = fs.statSync(outPath);
    log.ok(`Finales Video: ${outPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    return outPath;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-300) : err.message;
    throw new Error(`Video+Audio Mux fehlgeschlagen: ${stderr}`);
  }
}

module.exports = { mixAudio, muxVideoAudio };
