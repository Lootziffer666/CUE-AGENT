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
        `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo];[1:a]volume=0.15,afade=t=out:st=${fadeSt}:d=3[mu];[vo][mu]amix=inputs=2:duration=longest:dropout_transition=2,apad[out]`,
        "-map", "[out]",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ], "mix-both");
    } else if (voiceoverPath) {
      log.info("ffmpeg: Voiceover normalisieren ...");
      ffmpeg([
        "-i", voiceoverPath,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad",
        "-t", String(durationSec),
        "-c:a", "libmp3lame", "-q:a", "2",
        mixedPath,
      ], "mix-vo");
    } else {
      log.info("ffmpeg: Musik normalisieren ...");
      ffmpeg([
        "-i", musicPath,
        "-af", `volume=0.3,afade=t=out:st=${fadeSt}:d=3,apad`,
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

/**
 * Szenen-synchrone Audiospur in EINEM ffmpeg-Pass.
 *
 * Behebt drei Probleme des alten Pfades:
 *  - Voiceover war front-geladen → hier wird jeder Szenen-Clip per `adelay` an
 *    seinen Startzeitpunkt gesetzt (Stimme über das ganze Video verteilt).
 *  - `amix` teilte durch die Input-Anzahl (Ergebnis fast stumm) → `normalize=0`.
 *  - `loudnorm,apad` + libmp3lame crashte (`calc_energy`-Assertion) → Ausgabe als
 *    PCM-WAV (kein lame), exakte Länge via apad+atrim.
 *
 * @param {object} a
 * @param {Array<{path:string,startSec:number}>} a.clips  Voiceover-Clips
 * @param {string|null} a.musicPath
 * @param {string|null} a.sfxPath
 * @param {number[]} [a.sfxOffsets]  Übergangs-Zeitpunkte (s) für SFX
 * @param {number} a.durationSec
 * @param {string} a.outDir
 * @returns {{mixedPath:string|null, hasAudio:boolean}}
 */
function mixTimedAudio({ clips, musicPath, sfxPath, sfxOffsets = [], durationSec, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const voClips = (clips || []).filter((c) => c && fs.existsSync(c.path));
  if (voClips.length === 0 && !musicPath && !sfxPath) {
    return { mixedPath: null, hasAudio: false };
  }
  ensureDir(path.join(outDir, "audio"));
  const mixedPath = path.join(outDir, "audio", "mixed.wav");
  const fadeSt = Math.max(0, durationSec - 3);

  const inputs = [];
  const filters = [];
  const labels = [];
  let idx = 0;

  // Voiceover-Clips: an Startzeitpunkt verzögern. Bewusst KEINE Per-Clip-
  // Lautheitsnormalisierung (single-pass loudnorm überschießt auf leisen Clips
  // und der Limiter flacht sie zu Verzerrung ab) — normalisiert wird EINMAL der
  // fertige Mix unten.
  for (const c of voClips) {
    inputs.push("-i", c.path);
    const ms = Math.max(0, Math.round(c.startSec * 1000));
    filters.push(`[${idx}:a]adelay=${ms}|${ms}[v${idx}]`);
    labels.push(`[v${idx}]`);
    idx++;
  }

  // Musik leiser darunter (Ducking) + Ausblende.
  if (musicPath && fs.existsSync(musicPath)) {
    inputs.push("-i", musicPath);
    filters.push(`[${idx}:a]volume=0.12,afade=t=out:st=${fadeSt}:d=3[mus]`);
    labels.push("[mus]");
    idx++;
  }

  // SFX an Szenen-Übergängen (gleiche Datei mehrfach mit adelay).
  const points = (sfxPath && fs.existsSync(sfxPath) ? sfxOffsets : [])
    .filter((o) => o > 0.1 && o < durationSec - 0.1)
    .slice(0, 12);
  for (const t of points) {
    inputs.push("-i", sfxPath);
    const ms = Math.round(t * 1000);
    filters.push(`[${idx}:a]adelay=${ms}|${ms},volume=0.45[s${idx}]`);
    labels.push(`[s${idx}]`);
    idx++;
  }

  // amix OHNE Normalisierung (normalize=0) → kein 1/N-Leiserwerden; auf exakte
  // Videolänge padden/trimmen; sanfter Gain für Präsenz + True-Peak-Limiter als
  // Clipping-Schutz. BEWUSST KEIN loudnorm: single-pass loudnorm ist auf
  // lückenhaftem Audio unzuverlässig (löscht Segmente nach der ersten Sprechpause
  // bzw. überschießt pro Clip) — die rohen TTS-Clips haben bereits gesunde Pegel.
  const amix = `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[mx]`;
  const tail = `[mx]apad,atrim=0:${durationSec},volume=1.4,alimiter=limit=0.9[out]`;
  const filterComplex = [...filters, amix, tail].join(";");

  try {
    ffmpeg([
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-t", String(durationSec),
      "-c:a", "pcm_s16le",
      mixedPath,
    ], "mix-timed");
    log.ok(`Audio (szenen-synchron): ${voClips.length} Voice-Clips${musicPath ? " + Musik" : ""}${points.length ? ` + ${points.length} SFX` : ""} → ${mixedPath}`);
    return { mixedPath, hasAudio: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-300) : err.message;
    log.warn(`Szenen-synchroner Mix fehlgeschlagen: ${stderr}`);
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

module.exports = { mixAudio, mixTimedAudio, muxVideoAudio };
