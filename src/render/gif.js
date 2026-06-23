"use strict";

/**
 * Polish-Phase B: GIF-Export (hochwertig, zwei-Pass palettegen/paletteuse).
 *
 * GIFs sind auf 256 Farben begrenzt — naives Konvertieren sieht matschig aus.
 * Wir erzeugen erst eine optimierte Palette (stats_mode=diff: Palette aus den
 * sich ändernden Bildbereichen) und wenden sie dann mit leichtem Dithering an.
 * Ergebnis: scharfe, kleine GIFs (ideal für README/Social/PRs).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function ff(args, label) {
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(-600) : err.message;
    throw new Error(`ffmpeg fehlgeschlagen (${label}):\n${stderr}`);
  }
}

/**
 * @param {string} input  Quell-Video (z. B. final.mp4)
 * @param {string} out    Ziel-GIF
 * @param {object} [opts] { fps=15, width=720, loop=0, start?, duration? }
 *                        loop: 0 = endlos, -1 = einmal, n = n-mal wiederholen
 * @returns {{out:string, bytes:number, fps:number, width:number}}
 */
function exportGif(input, out, opts = {}) {
  if (!fs.existsSync(input)) throw new Error(`GIF-Quelle nicht gefunden: ${input}`);
  const fps = opts.fps || 15;
  const width = opts.width || 720;
  const loop = opts.loop != null ? opts.loop : 0;

  const pre = [];
  if (opts.start != null) pre.push("-ss", String(opts.start));
  if (opts.duration != null) pre.push("-t", String(opts.duration));

  const base = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const palette = path.join(path.dirname(path.resolve(out)), `.palette-${Date.now()}.png`);

  // Pass 1: optimierte Palette erzeugen.
  ff([...pre, "-i", input, "-vf", `${base},palettegen=stats_mode=diff`, palette], "palettegen");
  // Pass 2: GIF mit Palette + leichtem Dithering.
  ff(
    [
      ...pre, "-i", input, "-i", palette,
      "-lavfi", `${base}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      "-loop", String(loop),
      out,
    ],
    "paletteuse"
  );

  try { fs.unlinkSync(palette); } catch (_) {}
  const bytes = fs.statSync(out).size;
  return { out, bytes, fps, width };
}

module.exports = { exportGif };
