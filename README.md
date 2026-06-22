# CUE-AGENT

QA-Bughunting **und** Videoersteller in einem Werkzeug. CUE-AGENT steuert einen Browser
(Playwright), analysiert Seiten mit Anthropic Claude (Vision) und folgt einem klaren
**QA-first-Workflow**: erst Qualität sichern (Bugs finden, UI verbessern), dann — und nur
nach bestandener QA — Promo-, Showcase- oder Tutorial-Videos der verbesserten App erstellen.

> Status: **M0 (Fundament & QA-Refactor)** ist umgesetzt. Die Video-Pipeline (M1–M5) ist
> in der Roadmap beschrieben: siehe [`docs/ULTIMATE_VIDEO_CREATOR_PLAN.md`](docs/ULTIMATE_VIDEO_CREATOR_PLAN.md).

## Voraussetzungen

- Node.js 18+
- Anthropic API Key ([Konsole](https://console.anthropic.com/))
- Playwright Chromium (`npm run install-browsers`)
- Optional für die Video-Pipeline: `ffmpeg`, `ELEVENLABS_API_KEY`, `FREESOUND_API_KEY`

## Setup

```bash
npm install
npm run install-browsers
cp .env.example .env
# .env bearbeiten und ANTHROPIC_API_KEY setzen
```

## Verwendung

```bash
# Umgebung pruefen (Node, ffmpeg, Browser, API-Keys)
node bin/cue.js doctor

# QA-Analyse einer URL
node bin/cue.js qa https://example.com

# Sprache umstellen (de | en) und CI-Gate aktivieren, JSON ausgeben
node bin/cue.js qa https://example.com --lang en --fail-on high --json

# Kompatibilitaet: der alte Aufruf funktioniert weiterhin
node qa-agent.js https://example.com
npm start
```

Nach globaler Installation (`npm link` oder veroeffentlicht) steht der Befehl als `cue` bereit:

```bash
cue qa https://example.com
cue doctor
```

## CLI-Uebersicht

| Command | Status | Zweck |
|---|---|---|
| `cue qa <url>` | ✅ | QA-Analyse: Screenshot + Konsolen-Logs + Claude-Vision |
| `cue doctor` | ✅ | Umgebungs-Check |
| `cue capture <url>` | 🔜 M1 | Capture-Engine → CaptureBundle |
| `cue promo <url>` | 🔜 M2 | Promo-Video (QA-Gate erforderlich) |
| `cue tutorial <url>` | 🔜 M2 | Tutorial-Video (Kapitel + Captions) |
| `cue showcase <url>` | 🔜 M4 | Showcase-Video |
| `cue render <dir>` | 🔜 M2 | Vorhandenes Projekt rendern |

## Ausgabe

QA-Reports landen in `qa-reports/`:

- Vollseiten-Screenshot (PNG)
- Browser-Konsolen-Fehler/-Warnungen
- LLM-Analyse mit Befunden und Empfehlungen
- **Markdown** (menschlich) **und JSON** (maschinenlesbar) mit Severity + Score
- CI-Exit-Code via `--fail-on none|low|medium|high`

## Konfiguration

Optionale `cue.config.json` im Projekt-Root überschreibt Defaults (Sprache, Modell,
Viewport, Pfade, Video-Optionen). Secrets kommen ausschließlich aus der Umgebung/`.env`,
nie aus der Config-Datei.

## Projektstruktur

```
bin/cue.js          CLI-Einstieg
src/config/         Config-/Env-Loader
src/util/           Helfer (Logging, fs, Slugs)
src/i18n/           Sprachstrings + Prompts (de/en)
src/llm/            Anthropic-Wrapper
src/qa/             QA-Pipeline (capture, analyze, severity, report)
src/doctor/         Umgebungs-Check
docs/               Roadmap / Masterplan
qa-reports/         QA-Ausgaben
qa-agent.js         Kompatibilitaets-Shim (ruft src/qa auf)
```

## Lizenz

MIT
