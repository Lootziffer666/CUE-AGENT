"use strict";

/**
 * Soundeffekte: liefert einen Transition-„Whoosh".
 *
 * - Wenn cfg.audio.sfxFile gesetzt ist → eigene Datei verwenden.
 * - Sonst → einen dezenten Whoosh per ffmpeg synthetisieren (kein Asset nötig).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ensureDir } = require("../util");

/**
 * Stellt eine SFX-Datei bereit (eigene oder generiert) und gibt den Pfad zurück.
 * @returns {string|null}
 */
function ensureSfx({ cfg, outDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const userSfx = cfg.audio && cfg.audio.sfxFile;
  if (userSfx) {
    if (fs.existsSync(userSfx)) {
      log.info(`SFX (eigene Datei): ${userSfx}`);
      return userSfx;
    }
    log.warn(`SFX-Datei nicht gefunden: ${userSfx} — generiere stattdessen.`);
  }

  ensureDir(path.join(outDir, "audio"));
  const sfxPath = path.join(outDir, "audio", "whoosh.wav");
  // Gefilterter Rauschimpuls mit Fade = sanfter Whoosh (~0.5s)
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.4",
      "-af", "highpass=f=300,lowpass=f=3000,afade=t=in:st=0:d=0.15,afade=t=out:st=0.25:d=0.25,volume=0.5",
      sfxPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    return sfxPath;
  } catch (err) {
    log.warn(`SFX-Generierung fehlgeschlagen: ${err.message}`);
    return null;
  }
}

/**
 * Mischt einen SFX an den Szenen-Übergängen in eine bestehende Audiospur.
 * @param {object} args
 * @param {string} args.basePath   bestehendes Audio (mixed) oder null
 * @param {string} args.sfxPath
 * @param {number[]} args.offsets   Zeitpunkte (Sekunden) der Übergänge
 * @param {number} args.durationSec
 * @param {string} args.outPath
 * @param {object} [args.logger]
 * @returns {string} outPath
 */
function mixSfx({ basePath, sfxPath, offsets, durationSec, outPath, logger }) {
  const log = logger || { info() {}, ok() {} };
  const { execFileSync } = require("child_process");

  // Begrenzte Anzahl Übergänge (Performance/Lesbarkeit)
  const points = (offsets || []).filter((o) => o > 0.1 && o < durationSec - 0.1).slice(0, 12);

  const inputs = [];
  const filters = [];
  if (basePath) inputs.push("-i", basePath);
  // SFX pro Übergang als eigener Input mit adelay
  points.forEach(() => inputs.push("-i", sfxPath));

  const labels = [];
  let idx = 0;
  if (basePath) { labels.push("[0:a]"); idx = 1; }
  points.forEach((t, k) => {
    const inIdx = idx + k;
    const ms = Math.round(t * 1000);
    filters.push(`[${inIdx}:a]adelay=${ms}|${ms},volume=0.6[s${k}]`);
    labels.push(`[s${k}]`);
  });

  if (labels.length === 0) return basePath; // nichts zu tun

  const amix = `${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0,volume=2[out]`;
  const filterComplex = [...filters, amix].join(";");

  try {
    execFileSync("ffmpeg", [
      "-y", ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-t", String(durationSec),
      "-c:a", "libmp3lame", "-q:a", "2",
      outPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    log.ok(`SFX gemischt (${points.length} Übergänge): ${outPath}`);
    return outPath;
  } catch (err) {
    log.warn ? log.warn(`SFX-Mix fehlgeschlagen: ${err.message}`) : null;
    return basePath;
  }
}

module.exports = { ensureSfx, mixSfx };
