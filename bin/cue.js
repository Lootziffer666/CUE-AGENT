#!/usr/bin/env node
"use strict";

/**
 * CUE-AGENT CLI
 *
 * Subcommands:
 *   qa <url>        QA / Bughunting (Screenshot + Claude-Vision-Analyse)
 *   doctor          Umgebungs-Check (Node, ffmpeg, Browser, Keys)
 *   capture|promo|showcase|tutorial|render   (geplant, siehe Roadmap)
 *
 * Globale Flags:
 *   --lang de|en    Sprache der Ausgaben
 *   --fail-on L     CI-Gate: none|low|medium|high (Default aus Config)
 *   --json          Nur JSON-Ergebnis auf stdout ausgeben
 *   --help, -h      Hilfe
 */

const { loadConfig } = require("../src/config");
const { makeLogger } = require("../src/util");
const { runQa } = require("../src/qa");
const { runDoctor } = require("../src/doctor");
const { runCapture } = require("../src/core");

const PLANNED = {
  promo: "Promo-Video (Hook \u2192 Pain \u2192 Solution \u2192 Features \u2192 CTA)",
  showcase: "Showcase-Video (Intro \u2192 Walkthrough \u2192 Highlights \u2192 Closer)",
  tutorial: "Tutorial-Video (Cold-Open \u2192 Schritte \u2192 Recap)",
  render: "Aus vorhandenem Projekt rendern",
};

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.flags.help = true;
    } else if (a === "--json") {
      args.flags.json = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.flags[key] = next;
        i++;
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function showHelp() {
  console.log(`
CUE-AGENT \u2014 QA-Bughunting & Videoersteller

Verwendung:
  cue <command> [optionen]

Commands:
  qa <url>          QA-Analyse einer URL (Screenshot + Claude-Vision)
  capture <url>     Capture-Engine -> CaptureBundle (Video + Screenshots + Logs)
  doctor            Umgebung pruefen (Node, ffmpeg, Playwright, API-Keys)
  promo <url>       [geplant] Promo-Video (QA-Gate erforderlich)
  showcase <url>    [geplant] Showcase-Video
  tutorial <url>    [geplant] Tutorial-Video
  render <dir>      [geplant] Vorhandenes Video-Projekt rendern

Globale Optionen:
  --lang de|en      Sprache der Ausgaben (Default: de bzw. CUE_LANG)
  --fail-on L       CI-Gate: none|low|medium|high
  --json            Maschinenlesbares JSON-Ergebnis ausgeben
  --help, -h        Diese Hilfe

Umgebungsvariablen:
  ANTHROPIC_API_KEY   (erforderlich) Anthropic-Key
  TARGET_URL          (optional) Standard-URL
  ELEVENLABS_API_KEY  (optional) TTS fuer Video-Pipeline
  FREESOUND_API_KEY   (optional) Musik-Suche

Beispiele:
  cue qa https://example.com
  cue qa https://example.com --lang en --fail-on high --json
  cue capture https://example.com --intent promo --flow flow.json
  cue doctor
`);
}

function buildOverrides(flags) {
  const overrides = {};
  if (flags.lang) overrides.lang = flags.lang;
  if (flags["fail-on"]) overrides.qa = { failOn: flags["fail-on"] };
  return overrides;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args._[0];

  if (!command || args.flags.help && !command) {
    showHelp();
    process.exit(command ? 0 : 1);
  }

  const overrides = buildOverrides(args.flags);
  const cfg = loadConfig(overrides);
  const log = makeLogger("CUE");

  switch (command) {
    case "help":
      showHelp();
      return 0;

    case "doctor": {
      const code = await runDoctor({ cfg, json: Boolean(args.flags.json) });
      return code;
    }

    case "qa": {
      if (args.flags.help) {
        console.log("cue qa <url> [--lang de|en] [--fail-on none|low|medium|high] [--json]");
        return 0;
      }
      const url = args._[1] || cfg.targetUrl;
      const result = await runQa({ url, cfg, logger: log });
      if (args.flags.json) {
        process.stdout.write(JSON.stringify(result.json, null, 2) + "\n");
      }
      return result.exitCode;
    }

    case "capture": {
      if (args.flags.help) {
        console.log("cue capture <url> [--intent qa|promo|tutorial] [--flow flow.json] [--out dir] [--no-video] [--json]");
        return 0;
      }
      const url = args._[1] || cfg.targetUrl;
      const result = await runCapture({
        url,
        cfg,
        intent: args.flags.intent || "qa",
        flowFile: args.flags.flow || null,
        outDir: args.flags.out || null,
        recordVideo: args.flags["no-video"] ? false : true,
        logger: log,
      });
      if (args.flags.json) {
        process.stdout.write(JSON.stringify(result.bundle, null, 2) + "\n");
      }
      return 0;
    }

    case "promo":
    case "showcase":
    case "tutorial":
    case "render": {
      log.info(`"${command}" ist geplant: ${PLANNED[command]}.`);
      log.info("Siehe docs/ULTIMATE_VIDEO_CREATOR_PLAN.md (Roadmap M1\u2013M5).");
      return 0;
    }

    default:
      log.error(`Unbekannter Befehl: ${command}`);
      showHelp();
      return 1;
  }
}

main()
  .then((code) => process.exit(typeof code === "number" ? code : 0))
  .catch((err) => {
    console.error("[CUE] Fataler Fehler:", err.message);
    process.exit(1);
  });
