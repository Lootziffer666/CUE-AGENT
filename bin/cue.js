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
const { runVideo } = require("../src/video");
const { runRender } = require("../src/video/render-existing");
const { startConfigurator } = require("../src/configurator/server");
const { runReleaseCheck } = require("../src/qa/release-check");
const { runQaLoop } = require("../src/qa/loop");

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
  release-check <url>  Pruefen, ob das Produkt veroeffentlichungsreif ist
  qa-loop <url>     AI-QA-Loop: testen -> fixen -> rebuilden -> erneut testen
  capture <url>     Capture-Engine -> CaptureBundle (Video + Screenshots + Logs)
  promo <url>       Promo-Video (Hook -> Pain -> Solution -> Features -> CTA)
  tutorial <url>    Tutorial-Video (Cold-Open -> Schritte -> Recap)
  showcase <url>    Showcase-Video (Intro -> Walkthrough -> Highlights -> Closer)
  configurator      Web-GUI zum komfortablen Einstellen (Presets, Zeitsegmente, Scripts)
  doctor            Umgebung pruefen (Node, ffmpeg, Playwright, API-Keys)
  render <dir>      Vorhandenes Video-Projekt neu rendern (scenes/*.html)

Globale Optionen:
  --lang de|en      Sprache der Ausgaben (Default: de bzw. CUE_LANG)
  --fail-on L       CI-Gate: none|low|medium|high
  --skip-qa-gate    Promo/Video OHNE bestandene QA erzwingen (mit Warnung)
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
    case "tutorial": {
      if (args.flags.help) {
        console.log(`cue ${command} <url> [--script script.json] [--flow flow.json] [--out dir] [--brand vercel|horror|linear|stripe|apple|notion] [--aspect 16:9|9:16|1:1|4:5] [--tts auto|elevenlabs|kokoro|openai] [--voice matilda|rachel|daniel|josh] [--skip-qa-gate] [--no-video] [--json]`);
        return 0;
      }
      const url = args._[1] || cfg.targetUrl;
      const videoOverrides = {};
      if (args.flags.brand) videoOverrides.brand = args.flags.brand;
      if (args.flags.aspect) videoOverrides.aspect = args.flags.aspect;
      // Aspect-Override muss Viewport neu berechnen → über loadConfig
      const mergedCfg = args.flags.aspect || args.flags.brand
        ? loadConfig({ ...overrides, video: { ...cfg.video, ...videoOverrides } })
        : cfg;
      if (args.flags.brand) mergedCfg.video.brand = args.flags.brand;
      // TTS-Engine / Stimme
      if (args.flags.tts) mergedCfg.audio = { ...mergedCfg.audio, engine: args.flags.tts };
      if (args.flags.voice) mergedCfg.audio = { ...mergedCfg.audio, voice: args.flags.voice };

      const result = await runVideo({
        url,
        mode: command,
        cfg: mergedCfg,
        flowFile: args.flags.flow || null,
        scriptFile: args.flags.script || null,
        outDir: args.flags.out || null,
        recordVideo: !args.flags["no-video"],
        skipGate: Boolean(args.flags["skip-qa-gate"]),
        logger: log,
      });
      if (args.flags.json) {
        process.stdout.write(JSON.stringify(result.plan, null, 2) + "\n");
      }
      return 0;
    }

    case "configurator":
    case "config":
    case "gui": {
      const port = args.flags.port ? parseInt(args.flags.port, 10) : 4477;
      await startConfigurator({ cfg, port, logger: log });
      // Server offen halten
      return new Promise(() => {});
    }

    case "release-check": {
      if (args.flags.help) {
        console.log("cue release-check <url> [--flow flow.json] [--out dir] [--json]");
        return 0;
      }
      const url = args._[1] || cfg.targetUrl;
      const result = await runReleaseCheck({
        url, cfg, flowFile: args.flags.flow || null, outDir: args.flags.out || null, logger: log,
      });
      if (args.flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + "\n");
      return result.exitCode;
    }

    case "qa-loop": {
      if (args.flags.help) {
        console.log('cue qa-loop <url> [--repo path] [--rebuild "cmd"] [--max N] [--apply] [--flow flow.json] [--out dir] [--json]');
        return 0;
      }
      const url = args._[1] || cfg.targetUrl;
      const result = await runQaLoop({
        url,
        cfg,
        repoPath: args.flags.repo || null,
        rebuildCmd: args.flags.rebuild || null,
        maxIterations: args.flags.max ? parseInt(args.flags.max, 10) : 3,
        apply: Boolean(args.flags.apply),
        flowFile: args.flags.flow || null,
        outDir: args.flags.out || null,
        logger: log,
      });
      if (args.flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + "\n");
      return result.exitCode;
    }

    case "render": {
      if (args.flags.help) {
        console.log("cue render <projektVerzeichnis> [--json]  — rendert vorhandene scenes/*.html neu");
        return 0;
      }
      const dir = args._[1];
      if (!dir) {
        log.error("cue render benötigt ein Projektverzeichnis (mit scenes/*.html).");
        return 1;
      }
      const result = await runRender({ projectDir: dir, cfg, logger: log });
      if (args.flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }
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
