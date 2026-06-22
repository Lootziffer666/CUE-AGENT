"use strict";

/**
 * cue doctor — prüft die Umgebung: Node, ffmpeg/ffprobe, Playwright-Browser,
 * API-Keys. Gibt eine verständliche Übersicht und einen Exit-Code zurück
 * (0 = alle Pflicht-Checks ok, 1 = ein Pflicht-Check fehlt).
 */

const { execSync } = require("child_process");
const { hasValidLlmCredentials } = require("../config");

function tryCmd(cmd) {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return { ok: true, out };
  } catch (_) {
    return { ok: false, out: "" };
  }
}

function checkChromium() {
  // Playwright-Browser-Verfügbarkeit ohne Launch prüfen
  try {
    const { chromium } = require("playwright");
    const p = chromium.executablePath();
    const fs = require("fs");
    return { ok: Boolean(p) && fs.existsSync(p), out: p || "" };
  } catch (err) {
    return { ok: false, out: err.message };
  }
}

async function runDoctor({ cfg, json = false }) {
  const node = tryCmd("node --version");
  const ffmpeg = tryCmd("ffmpeg -version");
  const ffprobe = tryCmd("ffprobe -version");
  const chromium = checkChromium();

  const checks = [
    {
      name: "Node.js",
      required: true,
      ok: node.ok,
      detail: node.ok ? node.out : "nicht gefunden",
    },
    {
      name: "Playwright Chromium",
      required: true,
      ok: chromium.ok,
      detail: chromium.ok
        ? chromium.out
        : "fehlt \u2014 `npm run install-browsers` ausfuehren",
    },
    {
      name: "LLM-Provider",
      required: true,
      ok: hasValidLlmCredentials(cfg).ok,
      detail: `${hasValidLlmCredentials(cfg).provider} — ${hasValidLlmCredentials(cfg).reason}`,
    },
    {
      name: "ffmpeg",
      required: false,
      ok: ffmpeg.ok,
      detail: ffmpeg.ok
        ? ffmpeg.out.split("\n")[0]
        : "nicht installiert (fuer Video-Render/Audio noetig)",
    },
    {
      name: "ffprobe",
      required: false,
      ok: ffprobe.ok,
      detail: ffprobe.ok ? ffprobe.out.split("\n")[0] : "nicht installiert",
    },
    {
      name: "ELEVENLABS_API_KEY",
      required: false,
      ok: Boolean(cfg.secrets.elevenLabsApiKey),
      detail: cfg.secrets.elevenLabsApiKey ? "gesetzt (hochwertige TTS)" : "optional, nicht gesetzt",
    },
    {
      name: "FREESOUND_API_KEY",
      required: false,
      ok: Boolean(cfg.secrets.freesoundApiKey),
      detail: cfg.secrets.freesoundApiKey ? "gesetzt (Musik-Suche)" : "optional, nicht gesetzt",
    },
  ];

  const requiredMissing = checks.filter((c) => c.required && !c.ok);
  const exitCode = requiredMissing.length > 0 ? 1 : 0;

  if (json) {
    process.stdout.write(
      JSON.stringify({ ok: exitCode === 0, lang: cfg.lang, checks }, null, 2) + "\n"
    );
    return exitCode;
  }

  console.log("\nCUE-AGENT \u2014 Umgebungs-Check\n");
  for (const c of checks) {
    const mark = c.ok ? "\u2713" : c.required ? "\u2717" : "\u25cb";
    const tag = c.required ? "" : " (optional)";
    console.log(`  ${mark} ${c.name}${tag}: ${c.detail}`);
  }
  console.log(`\n  Sprache: ${cfg.lang}   Renderer: ${cfg.video.renderer}\n`);

  if (exitCode === 0) {
    console.log("  Alle Pflicht-Checks bestanden.\n");
  } else {
    console.log(
      `  ${requiredMissing.length} Pflicht-Check(s) fehlgeschlagen \u2014 siehe oben.\n`
    );
  }

  return exitCode;
}

module.exports = { runDoctor };
