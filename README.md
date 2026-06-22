# CUE-AGENT

QA-Bughunting **und** Videoersteller in einem Werkzeug. CUE-AGENT steuert einen Browser
(Playwright), analysiert Seiten mit Anthropic Claude (Vision) und folgt einem klaren
**QA-first-Workflow**: erst Qualität sichern (Bugs finden, UI verbessern), dann — und nur
nach bestandener QA — Promo-, Showcase- oder Tutorial-Videos der verbesserten App erstellen.

> Roadmap & Konzept: [`docs/ULTIMATE_VIDEO_CREATOR_PLAN.md`](docs/ULTIMATE_VIDEO_CREATOR_PLAN.md).
> Status: M0–M4 umgesetzt (QA, Capture-Engine, Video-Pipeline, Audio, Aspect-Ratios,
> Brand-Presets, Script-Support, Re-Render).

## In jedes Repo installieren (mit deinen eigenen Keys)

CUE-AGENT lässt sich direkt aus GitHub in jedes Projekt einbinden. **Du nutzt immer deine
eigenen API-Keys** — CUE-AGENT speichert oder überträgt sie nicht; sie werden nur aus deiner
Umgebung / `.env` gelesen.

```bash
# Variante A: global installieren
npm install -g github:Lootziffer666/CUE-AGENT
cue install-browsers      # Playwright Chromium

# Variante B: ohne Installation direkt ausführen
npx github:Lootziffer666/CUE-AGENT doctor

# Variante C: als Dev-Dependency in deinem Repo
npm install --save-dev github:Lootziffer666/CUE-AGENT
npx cue doctor
```

Dann deine Keys setzen (`.env` im Projekt **oder** als Umgebungsvariablen):

```bash
ANTHROPIC_API_KEY=sk-ant-...     # erforderlich für QA-Analyse
ELEVENLABS_API_KEY=...           # optional: Voiceover
FREESOUND_API_KEY=...            # optional: Hintergrundmusik
CUE_LANG=de                      # optional: de | en
```

Loslegen:

```bash
cue doctor                                   # prüft Node, ffmpeg, Browser, Keys
cue qa https://deine-app.tld                 # QA-Analyse
cue promo https://deine-app.tld --aspect 16:9
```

### In CI (GitHub Actions)

Kopiere [`.github/workflows/cue-qa.example.yml`](.github/workflows/cue-qa.example.yml) in dein
Repo (nach `.github/workflows/cue-qa.yml`) und hinterlege deine Keys unter
*Settings → Secrets and variables → Actions*. Der Workflow installiert CUE-AGENT, prüft eine
URL und lädt die QA-Reports als Artefakt hoch.

## Lokales Setup (Entwicklung an CUE-AGENT selbst)

```bash
npm install
npm run install-browsers
cp .env.example .env   # und Keys eintragen
```

## CLI-Übersicht

| Command | Zweck |
|---|---|
| `cue qa <url>` | QA-Analyse: Screenshot + Konsolen-Logs + Claude-Vision (MD + JSON, Severity, CI-Exit-Code) |
| `cue capture <url>` | Capture-Engine → CaptureBundle (Video + Screenshots + Logs) |
| `cue promo <url>` | Promo-Video (Hook → Features → Screenshots → CTA) |
| `cue tutorial <url>` | Tutorial-Video (Cold-Open → Kapitel → Recap) |
| `cue showcase <url>` | Showcase-Video (Intro → Walkthrough → Closer) |
| `cue render <dir>` | Vorhandenes Projekt neu rendern (schnelle Iteration) |
| `cue doctor` | Umgebungs-Check |

### Wichtige Optionen

```bash
--lang de|en                     # Sprache der Ausgaben
--aspect 16:9|9:16|1:1|4:5       # Seitenverhältnis (Web / Reels / IG / Portrait)
--brand vercel|horror|linear     # Design-Preset
--script datei.script.json       # eigenes Voiceover-/Storyboard-Script
--flow datei.json                # deklarativer Flow (klicken/tippen/scrollen)
--fail-on none|low|medium|high   # CI-Gate für QA
--no-video                       # Capture ohne Video-Aufnahme
--json                           # maschinenlesbares Ergebnis
```

## Eigene Scripts (volle Kontrolle über Erzählung)

Ein Script gibt dir exakte Kontrolle über Szenen, Timing und Voiceover-Text. Beispiel:
[`examples/horrorgeticon-ops.script.json`](examples/horrorgeticon-ops.script.json)
(Volltext: [`scripts/horrorgeticon-ops.md`](scripts/horrorgeticon-ops.md)).

```bash
cue promo --script examples/horrorgeticon-ops.script.json
# → 73s-Promo, horror-Brand, 8 Szenen, Voiceover-Text exakt aus dem Script
```

Script-Format (Auszug):
```jsonc
{
  "meta": { "title": "...", "mode": "promo", "lang": "de", "voice": "daniel", "brand": "horror", "aspect": "16:9" },
  "scenes": [
    { "type": "title", "id": "hook", "title": "...", "subtitle": "...", "narration": "...", "duration": 6 },
    { "type": "features", "id": "intro", "heading": "...", "features": ["...", "..."], "narration": "...", "duration": 9 }
  ]
}
```

## Ausgabe

- **QA:** `qa-reports/` — Screenshot, Konsolen-Logs, LLM-Analyse, Markdown **+ JSON** mit Severity/Score
- **Video:** `video-projects/<slug>/` — `context.json`, `storyboard.json`, `DESIGN.md`,
  `scenes/*.html`, `out/final.mp4` (H.264; mit Voiceover + Musik, wenn Keys gesetzt)

Alle Ausgaben landen im **aktuellen Arbeitsverzeichnis** — so funktioniert das Tool sauber
in jedem fremden Repo.

## Projektstruktur

```
bin/cue.js            CLI-Einstieg
src/config/           Config-/Env-Loader (Aspect→Viewport, Secrets aus Env)
src/core/             Capture-Engine, Flow-Runner, CaptureBundle
src/qa/               QA-Pipeline (capture, analyze, severity, report)
src/video/            Video-Pipeline (Phasen 0–5, Script, Re-Render)
src/render/           Eingebauter Renderer (HTML+GSAP → Frames → ffmpeg)
src/audio/            TTS (ElevenLabs), Musik (Freesound), Mix (ffmpeg)
src/design-systems/   Brand-Presets (vercel, horror, linear)
src/templates/        Szenen-Templates (HTML+GSAP)
src/doctor/           Umgebungs-Check
docs/                 Roadmap / Masterplan
examples/, scripts/   Beispiel-Flows und -Scripts
```

## Lizenz

MIT
