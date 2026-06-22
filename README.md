# CUE-AGENT

QA-Bughunting **und** Videoersteller in einem Werkzeug. CUE-AGENT steuert einen Browser
(Playwright), analysiert Seiten mit Anthropic Claude (Vision) und folgt einem klaren
**QA-first-Workflow**: erst Qualität sichern (Bugs finden, UI verbessern), dann — und nur
nach bestandener QA — Promo-, Showcase- oder Tutorial-Videos der verbesserten App erstellen.

> Roadmap & Konzept: [`docs/ULTIMATE_VIDEO_CREATOR_PLAN.md`](docs/ULTIMATE_VIDEO_CREATOR_PLAN.md).

## Demo

🎬 **[`demo/cue-agent-promo.mp4`](demo/cue-agent-promo.mp4)** — ein 68-Sekunden-Promo, das CUE-AGENT
**mit sich selbst** erzeugt hat (`cue promo --script examples/cue-agent-promo.script.json --tts kokoro --sfx`):
8 Szenen, lokale Kokoro-Stimme, Soundeffekte an den Übergängen, Linear-Brand. Reproduzierbar ohne jeden API-Key.

## Continuous QA (GitHub Actions)

Der Workflow [`.github/workflows/qa-and-commit.yml`](.github/workflows/qa-and-commit.yml) richtet eine
frische Umgebung ein (Node + Playwright + ffmpeg, wie der Devcontainer/Codespace), lässt QA gegen eine
URL laufen und **committet die dokumentierten Befunde** nach `qa-history/` zurück ins Repo. Ohne URL
startet er den Configurator lokal und prüft dessen GUI. Per `workflow_dispatch` oder wöchentlich.
> Status: M0–M5 + Politur umgesetzt (QA, Capture-Engine, Video-Pipeline, Audio, Aspect-Ratios,
> 6 Brand-Presets, Script-Support, Re-Render, QA-Gate, **echte Video-Clips** & **Tutorial-Highlights**).

## Echte Video-Clips statt Standbilder

Tutorial- und Showcase-Videos verwenden die **echte Bildschirmaufnahme** (Playwright
`recordVideo`): pro Flow-Schritt wird der passende Ausschnitt aus dem aufgenommenen Video
geschnitten, auf die Canvas skaliert, mit einem Brand-Overlay (Kapitel-Badge + Caption)
versehen und sanft ein-/ausgeblendet. Der Renderer arbeitet **segment-basiert** (jede Szene
→ eigenes MP4 → Concat), wodurch animierte Szenen und echte Clips nahtlos kombiniert werden.
Fehlt eine Aufnahme, wird automatisch auf einen Screenshot zurückgefallen.

## QA-Gate: erst QA, dann Promo

CUE-AGENT bewirbt nie eine ungeprüfte App. Bevor `cue promo|tutorial|showcase` für eine
**URL** ein Video erzeugt, prüft das Gate den jüngsten QA-Report zu dieser URL:

- existiert ein Report? (sonst: erst `cue qa <url>`)
- ist er frisch genug? (`maxAgeHours`, Default 24h)
- Score ≥ Minimum? (`minScore`, Default 70)
- keine offenen High-Severity-Bugs? (`failOnSeverity`, Default `high`)

Besteht das Gate nicht, wird die Video-Erzeugung **blockiert** (Exit-Code 1) mit klarer
Begründung. Bewusst überspringen: `--skip-qa-gate` (mit Warnung). Der Gate-Beleg landet in
`project-plan.json` und im `*-bundle.json` (`qaGate`).

```bash
cue qa https://deine-app.tld          # 1) Qualität prüfen
# ... Bugs fixen ...
cue promo https://deine-app.tld       # 2) Promo — nur wenn QA bestanden
```

Konfigurierbar in `cue.config.json` unter `qa.gate`. Für Script-Videos ohne URL greift das
Gate nicht (es wird keine laufende App beworben).

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

## Configurator (Web-GUI)

Für komfortables Einstellen ohne JSON von Hand:

```bash
cue configurator           # startet lokalen Server, z. B. http://localhost:4477
cue configurator --port 8080
```

Im Browser öffnen. Das GUI bietet:

- **Projekt-Settings**: Modus, Brand-Preset (mit Farb-Vorschau), Seitenverhältnis, Sprache, Stimme, optionale Ziel-URL
- **Zeitsegmente / Szenen**: Szenen hinzufügen (Title, Features, Screenshot, Kapitel, Clip, CTA), Dauer setzen, per Drag-frei umsortieren (↑/↓), löschen
- **Live-Timeline**: proportionale, farbcodierte Segmente + Gesamtdauer
- **Voice-over pro Szene**: Narrationstext direkt eingeben
- **Import/Export**: Script als `*.script.json` und Settings als `cue.config.json` herunterladen/laden
- **CLI-Befehl** zum Kopieren **und** „Video jetzt erzeugen" (rendert direkt über den lokalen Server, mit deinen eigenen Keys)
- **Timeline-Player**: greifbare Szenen-Blöcke mit Resize-Griff (Dauer ziehen), Klick-Auswahl, **Scrub-Vorschau** (nutzt die echte GSAP-Timeline der Szene — kein Render nötig) und **@N-Referenzen** zum Einfügen in Prompts/Narration
- **Sprach-Engine + Stimmwahl** (Auto/Kokoro/ElevenLabs/OpenAI · Matilda/Rachel/Daniel/Josh)
- **Verschlüsselte API-Keys**: im GUI eintragbar, AES-256-GCM-verschlüsselt in `~/.cue/keys.enc` (nie im Repo, nie im Klartext); optional via `CUE_KEYS_PASSPHRASE` passphrase-geschützt

Das exportierte Script ist identisch zum `--script`-Format — du kannst es also auch per CLI nutzen:
```bash
cue promo --script my-video.script.json
```

## Autonomer QA-Zyklus & Release-Readiness

Über die reine Analyse hinaus kann CUE-AGENT Bugs **dokumentieren, beheben und erneut testen** — bis das Produkt veröffentlichungsreif ist.

```bash
# Veröffentlichungsreife prüfen (schreibt RELEASE-READINESS.md, Exit 1 wenn nicht bereit)
cue release-check https://deine-app.tld

# Reiner Test-/Monitoring-Lauf (keine Code-Änderung)
cue qa-loop https://deine-app.tld

# Fix-Vorschläge (Dry-Run) für ein lokales Repo
cue qa-loop https://deine-app.tld --repo ./mein-repo

# Voller autonomer Zyklus: testen → fixen → rebuilden → erneut testen
cue qa-loop https://deine-app.tld --repo ./mein-repo --apply --rebuild "npm run build" --max 3
```

**Wie es funktioniert:**
1. **Strukturierte Befunde** — das LLM liefert maschinenlesbare Findings (Severity, Kategorie, Ort, konkreter Fix-Vorschlag).
2. **Release-Readiness** — klares Urteil READY/NOT READY mit Checkliste (keine High/Critical-Befunde, Score ≥ Schwelle, keine Konsolen-Fehler, keine 5xx). Konfigurierbar unter `qa.release`.
3. **AI-Loop** — bei `--repo` schlägt das LLM gezielte Datei-Änderungen vor; mit `--apply` werden sie geschrieben, mit `--rebuild` neu gebaut, dann erneut getestet. Schleife bis READY oder `--max` erreicht.
4. **Schriftliche Doku** — `RELEASE-READINESS.md` und `QA-LOOP.md` (alle Iterationen, Befunde, vorgeschlagene/angewendete Fixes, Rebuild-Status).

**Sicherheit:** Ohne `--repo` keine Code-Änderung. Ohne `--apply` nur Vorschläge (Dry-Run, gespeichert unter `proposed-fixes/`). Es werden nur existierende Dateien **innerhalb** des Repos geschrieben.

## Bilder, eigene Medien & Audio-Toggles

**AI-Bildgenerierung** (BYOK, OpenAI-kompatibel `/v1/images/generations` — auch über deinen Proxy):
```bash
# Bilder automatisch aus einem Thema generieren (für image-Szenen ohne Asset)
cue promo --script my.script.json --images auto --theme "futuristisches dunkles Dashboard"
```

**Eigene Medien** (Referenzbilder, Musik, Soundeffekte) — leg sie in `media/` (oder `--media <dir>`):
```bash
cue promo --script my.script.json --media ./media \
  --music-file mymusic.mp3 --sfx --sfx-file myclick.wav
```
Eine `image`-Szene kann ein lokales Asset nutzen (`"mediaFile": "ref.png"`) **oder** per `prompt` automatisch generieren.

**Audio-Toggles:**
```bash
--no-voice          # Sprachausgabe aus
--no-music          # Musik aus
--sfx               # Soundeffekte an (Transition-Whoosh; eigene via --sfx-file)
--music-file <f>    # eigene Musik (Vorrang vor Freesound)
--sfx-file <f>      # eigener Soundeffekt
```

Eigene Musik/SFX haben Vorrang vor Freesound/generiert. Im **Configurator-GUI** lassen sich Toggles setzen, Medien hochladen und Bild-Szenen anlegen.

## Sprachausgabe (TTS) — auch ganz ohne Key

CUE-AGENT wählt die TTS-Engine automatisch:

- **`elevenlabs`** — höchste Qualität (braucht `ELEVENLABS_API_KEY`)
- **`kokoro`** — **lokal, key-frei, Apache-2.0** ([Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)); lädt beim ersten Lauf ein ~300 MB-Modell, läuft dann offline auf der CPU
- **`openai`** — OpenAI-kompatibler `/v1/audio/speech`-Endpoint (z. B. über deinen Proxy)

**Auto-Verhalten**: ElevenLabs (falls Key & gültig) → sonst/​bei Fehler automatisch **Kokoro**. So bekommst du natürliche Stimmen ohne jeden Key. Erzwingen mit `--tts kokoro`.

```bash
cue promo --script my-video.script.json --tts kokoro --voice daniel
```

> `kokoro-js` ist eine optionale Dependency. Falls nicht installiert: `npm install kokoro-js`.

## CLI-Übersicht

| Command | Zweck |
|---|---|
| `cue qa <url>` | QA-Analyse: Screenshot + Konsolen-Logs + Claude-Vision (MD + JSON, Severity, CI-Exit-Code) |
| `cue release-check <url>` | Veröffentlichungsreife prüfen (Verdict + RELEASE-READINESS.md) |
| `cue qa-loop <url>` | Autonomer Zyklus: testen → fixen → rebuilden → erneut testen |
| `cue capture <url>` | Capture-Engine → CaptureBundle (Video + Screenshots + Logs) |
| `cue promo <url>` | Promo-Video (Hook → Features → Screenshots → CTA) |
| `cue tutorial <url>` | Tutorial-Video (Cold-Open → Kapitel → Recap) |
| `cue showcase <url>` | Showcase-Video (Intro → Walkthrough → Closer) |
| `cue render <dir>` | Vorhandenes Projekt neu rendern (schnelle Iteration) |
| `cue configurator` | **Web-GUI** zum komfortablen Einstellen (Presets, Zeitsegmente, Scripts, Im-/Export) |
| `cue doctor` | Umgebungs-Check |

### Wichtige Optionen

```bash
--lang de|en                     # Sprache der Ausgaben
--aspect 16:9|9:16|1:1|4:5       # Seitenverhältnis (Web / Reels / IG / Portrait)
--brand vercel|horror|linear|stripe|apple|notion   # Design-Preset
--tts auto|elevenlabs|kokoro|openai   # TTS-Engine (auto: ElevenLabs→Kokoro)
--voice matilda|rachel|daniel|josh    # Stimme
--script datei.script.json       # eigenes Voiceover-/Storyboard-Script
--flow datei.json                # deklarativer Flow (klicken/tippen/scrollen)
--fail-on none|low|medium|high   # CI-Gate für QA
--skip-qa-gate                   # Video OHNE bestandene QA erzwingen (Warnung)
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
