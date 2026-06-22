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
const { runAndroidQa } = require("../src/android");
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
  android-qa [apk]  Android-App-QA (Emulator via ADB + multimodale Analyse)
  design-check      Ist-UI gegen Design-Baseline (Mockup) prüfen
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

  if (!command) {
    showHelp();
    process.exit(args.flags.help ? 0 : 1);
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

    case "android-qa": {
      if (args.flags.help) {
        console.log('cue android-qa [apk] --package <id> [--flow flow.json] [--steps N] [--goal "..."] [--lang de|en] [--fail-on none|low|medium|high] [--json]');
        return 0;
      }
      const apk = args._[1] || null;
      const result = await runAndroidQa({
        apk,
        pkg: args.flags.package || null,
        cfg,
        flowFile: typeof args.flags.flow === "string" ? args.flags.flow : null,
        maxSteps: args.flags.steps ? parseInt(args.flags.steps, 10) : 8,
        goal: typeof args.flags.goal === "string" ? args.flags.goal : "",
        logger: log,
      });
      if (args.flags.json) {
        process.stdout.write(JSON.stringify(result.json, null, 2) + "\n");
      }
      return result.exitCode;
    }

    case "design-check": {
      if (args.flags.help) {
        console.log("cue design-check --baseline <spec.json> --actual <elements.json> [--fail-on none|low|medium|high] [--json]");
        return 0;
      }
      const baselineFile = args.flags.baseline;
      const actualFile = args.flags.actual;
      if (!baselineFile || !actualFile) {
        log.error("--baseline <spec.json> und --actual <elements.json> erforderlich.");
        return 2;
      }
      const fs = require("fs");
      const path = require("path");
      const { loadBaselineSpec, compareToBaseline } = require("../src/qa/design-baseline");
      const { failsGate } = require("../src/qa/severity");
      const { writeJson, writeText, timestamp, ensureDir } = require("../src/util");

      const spec = loadBaselineSpec(baselineFile);
      const parsed = JSON.parse(fs.readFileSync(actualFile, "utf-8"));
      const actual = Array.isArray(parsed) ? parsed : parsed.elements || [];
      const res = compareToBaseline({ spec, actual });

      const ts = timestamp();
      ensureDir(cfg.absPaths.qaReports);
      const jsonPath = path.join(cfg.absPaths.qaReports, `design-${ts}.json`);
      const mdPath = path.join(cfg.absPaths.qaReports, `design-${ts}.md`);
      writeJson(jsonPath, { tool: "cue-agent", intent: "design-check", timestamp: new Date().toISOString(), baseline: baselineFile, ...res });
      const md = [
        `# Design-Baseline-Report — ${res.screen || "(screen)"}`,
        "",
        `Score: **${res.score}/100** · Severity: **${res.severity}** · ${res.passed} PASS / ${res.failed} FAIL (${res.missing} fehlend)`,
        "",
        "| Element | Status | Abweichungen |",
        "|---|---|---|",
        ...res.results.map((r) => `| ${r.label || r.id} | ${r.pass ? "✓" : r.missing ? "✗ fehlt" : "✗"} | ${(r.deviations || []).join("; ") || "—"} |`),
      ].join("\n");
      writeText(mdPath, md);

      log.ok(`Design-Report: ${mdPath} (Score ${res.score}, ${res.severity})`);
      if (args.flags.json) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      const failOn = args.flags["fail-on"] || cfg.qa.failOn;
      return failsGate(res.severity, failOn) ? 1 : 0;
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
        console.log(`cue ${command} <url> [--script s.json] [--flow f.json] [--out dir] [--brand ...] [--aspect ...] [--tts auto|elevenlabs|kokoro|openai] [--voice ...] [--no-voice] [--no-music] [--sfx] [--music-file f] [--sfx-file f] [--images auto|off] [--theme "..."] [--media dir] [--skip-qa-gate] [--no-video] [--json]`);
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
      // Audio-Toggles (--no-voice / --no-music / --sfx) + eigene Dateien
      const a = { ...mergedCfg.audio };
      if (args.flags["no-voice"] || args.flags.voiceover === "off") a.voiceover = false;
      if (args.flags["no-music"] || args.flags.music === "off") a.music = false;
      if (args.flags.sfx && args.flags.sfx !== "off") a.sfx = true;
      if (args.flags["music-file"]) a.musicFile = args.flags["music-file"];
      if (args.flags["sfx-file"]) { a.sfxFile = args.flags["sfx-file"]; a.sfx = true; }
      mergedCfg.audio = a;
      // Bildgenerierung + Medien
      if (args.flags.images) mergedCfg.image = { ...mergedCfg.image, mode: args.flags.images };
      if (args.flags.theme) mergedCfg.image = { ...mergedCfg.image, theme: args.flags.theme };
      if (args.flags["image-model"]) mergedCfg.image = { ...mergedCfg.image, model: args.flags["image-model"] };
      if (args.flags.media) mergedCfg.mediaDir = args.flags.media;

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
      let port = 4477;
      if (args.flags.port) {
        port = parseInt(args.flags.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          log.error("Ungültige Portnummer (1–65535).");
          return 1;
        }
      }
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
        console.log("cue render <projektVerzeichnis> [--force] [--json]  — rendert scenes/*.html neu (Cache: nur geänderte Szenen; --force = alle)");
        return 0;
      }
      const dir = args._[1];
      if (!dir) {
        log.error("cue render benötigt ein Projektverzeichnis (mit scenes/*.html).");
        return 1;
      }
      const result = await runRender({ projectDir: dir, cfg, force: Boolean(args.flags.force), logger: log });
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
