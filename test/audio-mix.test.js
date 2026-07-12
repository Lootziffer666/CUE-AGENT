"use strict";

/**
 * Schützt die szenen-synchrone Audiospur gegen Regressionen:
 *  - Voiceover-Clips landen an ihrem Startzeitpunkt (Verteilung, nicht front-geladen)
 *  - der Mix ist nicht still (amix normalize=0 statt 1/N)
 *  - die Tonspur hat exakt die Videolänge
 *
 * Genau diese drei Eigenschaften waren beim Audio-Bug verletzt (front-geladene
 * Stimme, -55 dB durch amix-Division, an kaputter Spur abgeschnittenes Video).
 *
 * Übersprungen, wenn ffmpeg fehlt.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { mixTimedAudio } = require("../src/audio/mix");

function ffmpegAvailable() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
}

/** mean_volume (dB) eines Zeitfensters — volumedetect schreibt nach stderr. */
function meanDb(file, start, dur) {
  const r = spawnSync(
    "ffmpeg",
    ["-ss", String(start), "-t", String(dur), "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf-8" }
  );
  const m = (r.stderr || "").match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);
  return m ? Number(m[1]) : -999;
}

function sine(file, freq, seconds) {
  execFileSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}`,
    "-c:a", "pcm_s16le", file,
  ], { stdio: "ignore" });
}

test(
  "Szenen-Audio: Clips landen an ihrem Startzeitpunkt und sind hörbar",
  { timeout: 60000, skip: !ffmpegAvailable() && "ffmpeg fehlt" },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-audio-test-"));
    try {
      const c1 = path.join(dir, "vo-0.wav");
      const c2 = path.join(dir, "vo-1.wav");
      sine(c1, 440, 2);
      sine(c2, 880, 2);

      const DURATION = 12;
      const res = mixTimedAudio({
        clips: [{ path: c1, startSec: 0 }, { path: c2, startSec: 8 }],
        musicPath: null, sfxPath: null, sfxOffsets: [],
        durationSec: DURATION, outDir: dir,
      });
      assert.ok(res.hasAudio && fs.existsSync(res.mixedPath), "Mix-Datei muss existieren");

      // exakte Länge
      const durOut = execFileSync(
        "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", res.mixedPath],
        { stdio: ["ignore", "pipe", "ignore"] }
      ).toString().trim();
      assert.ok(Math.abs(Number(durOut) - DURATION) < 0.5, `Länge ~${DURATION}s, war ${durOut}s`);

      // früher Clip hörbar
      assert.ok(meanDb(res.mixedPath, 0.2, 1.5) > -50, "erster Clip muss hörbar sein");
      // SPÄTER Clip hörbar — DAS fing der Bug nicht (alles nach der 1. Pause war still)
      assert.ok(meanDb(res.mixedPath, 8.2, 1.5) > -50, "Clip bei t=8s muss hörbar sein (Verteilung)");
      // Lücke dazwischen ist still (Platzierung wirklich zeitversetzt)
      assert.ok(meanDb(res.mixedPath, 4, 2) < -50, "Lücke zwischen den Clips muss still sein");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
);
