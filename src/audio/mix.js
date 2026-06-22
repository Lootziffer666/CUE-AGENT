"use strict";

/**
 * Audio-Mix: ffmpeg-basierte Zusammenführung von Voiceover + Musik.
 *
 * - Normalisiert Voiceover-Lautstärke
 * - Mischt Musik leiser darunter (Ducking)
 * - Schneidet auf Video-Dauer
 * - Erzeugt finales Audio-File (MP3)
 *
 * Nutzt execFileSync (ohne Shell), damit filter_complex (';' '[' ']')
 * nicht von der Shell zerlegt wird.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../util");

function ffmpeg(args, label) {
  execFileSync("ffmpeg", ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

function mixAudio({ voiceoverPath, musicPath, durationSec, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  if (!voiceoverPath && !musicPath) {
    log.warn("Weder Voiceover noch Musik vorhanden — Video bleibt stumm.");
    return { mixedPath: null, hasAudio: false };
  }

  ensureDir(path.join(outDir, "audio"));
  const mixedPath = path.join(outDir, "audio", "mixed.mp3");
  const fadeSt = Math.max(0, durationSec - 3);

  try {
    if (voiceoverPath && musicPath) {
      log.info("ffmpeg: Mix (Voiceover + Musik @ -12dB) ...");
      ffmpeg([
        "-i", voiceoverPath,
        "-i", musicPath,
        "-filter_complex",
        `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo];[1:a]volume=0.15,afade=t=out:st=${fadeSt}:d=3[mu];[vo][mu]amix=inputs=2:duration=first:dropout_transition=2[out]`,
        "-map", "[out]",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ], "mix-both");
    } else if (voiceoverPath) {
      log.info("ffmpeg: Voiceover normalisieren ...");
      ffmpeg([
        "-i", voiceoverPath,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ], "mix-vo");
    } else {
      log.info("ffmpeg: Musik normalisieren ...");
      ffmpeg([
        "-i", musicPath,
        "-af", `volume=0.3,afade=t=out:st=${fadeSt}:d=3`,
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ], "mix-music");
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

function muxVideoAudio({ videoPath, audioPath, outPath, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("ffmpeg: Video + Audio → finales MP4 ...");
  try {
    ffmpeg([
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-map", "0:v:0", "-map", "1:a:0",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ], "mux");
    const stats = fs.statSync(outPath);
    log.ok(`Finales Video: ${outPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    return outPath;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-300) : err.message;
    throw new Error(`Video+Audio Mux fehlgeschlagen: ${stderr}`);
  }
}

module.exports = { mixAudio, muxVideoAudio };
