"use strict";

/**
 * Render-Smoke-Test (End-to-End, leichtgewichtig).
 *
 * Rendert EINE Szene mit einer Nicht-Default-Dauer (5s) und prüft, dass die
 * Dauer im fertigen MP4 erhalten bleibt. Genau das schlug beim GSAP-CDN-Bug
 * fehl: ohne geladenes GSAP kollabierte jede Szene still auf 3s.
 *
 * Wird übersprungen, wenn ffmpeg oder Chromium in der Umgebung fehlen.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { titleCard } = require("../src/templates/scenes");
const { getPreset } = require("../src/design-systems");
const { renderBuiltin } = require("../src/render/builtin");

function ffmpegAvailable() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function chromiumAvailable() {
  try {
    const p = require("playwright").chromium.executablePath();
    return !!p && fs.existsSync(p);
  } catch {
    return false;
  }
}

test(
  "Render: 5s-Szene bleibt 5s (GSAP lädt offline, kollabiert nicht auf 3s)",
  { timeout: 120000, skip: (!ffmpegAvailable() || !chromiumAvailable()) && "ffmpeg/Chromium fehlt" },
  async () => {
    const brand = getPreset("linear");
    const dims = { width: 640, height: 360 };
    const DURATION = 5;

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-render-test-"));
    try {
      const scenesDir = path.join(outDir, "scenes");
      fs.mkdirSync(scenesDir, { recursive: true });
      const scenePath = path.join(scenesDir, "00-title.html");
      fs.writeFileSync(
        scenePath,
        titleCard(brand, { title: "Smoke", subtitle: "Test", dims, duration: DURATION })
      );

      const res = await renderBuiltin({
        scenePaths: [scenePath],
        scenes: [{}],
        cfg: { video: { fps: 6 }, viewport: dims },
        outDir,
      });

      assert.ok(fs.existsSync(res.mp4Path), "final.mp4 muss existieren");
      assert.ok(
        Math.abs(res.durationSec - DURATION) < 1,
        `Dauer sollte ~${DURATION}s sein, war ${res.durationSec}s (Kollaps auf 3s = GSAP-Regression)`
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
);
