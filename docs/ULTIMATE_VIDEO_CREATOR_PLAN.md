# CUE-AGENT — Master-Plan: Der ultimative Videoersteller

> Ziel: CUE-AGENT (heute ein QA-/Bughunting-Agent) und die Idee von
> [`nebrass/hve-spielberg`](https://github.com/nebrass/hve-spielberg) (6-Phasen-Promo-Video-Pipeline)
> zu **einem** Werkzeug verschmelzen, das aus **einer einzigen Browser-Aufnahme** sowohl
> **Bug-Reports** als auch **fertige Promo-/Showcase-/Tutorial-Videos** erzeugt.
>
> *Inhalt aus hve-spielberg wurde aus Lizenz-Compliance-Gründen paraphrasiert.*

---

## 0. Leitidee in einem Satz

**Ein verketteter Workflow: erst sichert QA die Qualität (Bugs finden, UI-Verbesserungen
vorschlagen), dann — und nur nach bestandener QA — erstellt die Video-Pipeline die Promo
der verbesserten App. Geteilt wird nur die Capture-*Engine* (Browser-Steuerung), nicht die
Daten: QA und Promo fahren bewusst unterschiedliche Flows.**

> **Grundregel: Es werden niemals Bugs promotet.** QA nimmt Fehlerzustände/Edge-Cases auf,
> um sie zu beheben. Promo nimmt ausschließlich saubere, freigegebene Happy-Path-Flows auf.

Damit lösen wir das, was bei beiden Projekten heute fehlt:

| Heute CUE-AGENT | Heute hve-spielberg | Ultimate CUE-AGENT |
|---|---|---|
| Nur QA, nur 1 Screenshot | Nur Video, statische Screenshots | QA **und** Promo, verkettet per Gate |
| Solide Code-Basis (Node) | Reines Prompt-Markdown (Claude-Code-Skill) | Deterministischer Node-Code + LLM nur für kreative/analytische Schritte |
| Kein Video | Externe Abhängigkeit `hyperframes` CLI + Claude-Code-Skills | Self-contained Renderer, `hyperframes` optional als Plugin |
| Keine Bewegung | Screencast optional, fragil | **Native Playwright-Video-Aufnahme** = echte Bewegung |

---

## 1. Was an hve-spielberg gut ist (übernehmen)

1. **6-Phasen-Denkmodell**: Discovery → Storytelling → Capture → Design → Production → Audio/Render. Klar, nachvollziehbar, mit Freigabe-Checkpoints.
2. **Drei Modi**: Promo (Hook→Pain→Solution→Features→CTA), Showcase (Intro→Walkthrough→Highlights→Closer), Tutorial (Cold-Open→Schritte→Recap).
3. **Design-Thinking vor Produktion**: Erst Zielgruppe/Ziel verstehen, dann gestalten.
4. **HTML + GSAP als Szenenformat**: editierbar, deterministisch seekbar, Headless-Chromium-gerendert.
5. **Brand-DNA / Design-Systeme**: kuratierte Marken-Presets (Stripe, Linear, Apple, Vercel …) als Startpunkt.
6. **Audio-Schichtung**: TTS-Voiceover + Whisper-Timing-Verifikation + CC-Musik + ffmpeg-Mix.
7. **Mehrere Seitenverhältnisse**: 16:9, 9:16, 1:1, 4:5.
8. **Anti-Slop-Regeln**: konkrete Verbote (kein Jitter, keine clipPath-Transitions, kein `tl.from()`-Stagger-Trap) — wertvolles Praxiswissen.

## 2. Was ausbaufähig ist (verbessern)

| Schwäche | Verbesserung im Ultimate CUE-AGENT |
|---|---|
| Skill ist nur Prompt-Markdown → Ergebnis hängt davon ab, ob der Agent die Anleitung „richtig" befolgt | **Echter, deterministischer Node-Code.** LLM nur für definierte, gekapselte Aufgaben (Analyse, Script-Text, Szenen-Layout-Vorschlag). Jede Phase ist eine testbare Funktion. |
| Statische Screenshots als „Bewegung" | **Playwright `recordVideo`** nimmt echte Interaktionen als WebM auf; zusätzlich gezielte Screenshots + DOM-/A11y-Snapshots. |
| Harte Abhängigkeit von `hyperframes` CLI + Claude-Code-Skills | **Eingebauter Renderer** (HTML+GSAP → Playwright-Frame-Capture → ffmpeg). `hyperframes` bleibt als **optionales Renderer-Plugin** wählbar. |
| Viele manuelle Checkpoints, kein Headless-/CI-Lauf | **Zwei Betriebsarten**: `--interactive` (Checkpoints) und `--auto` (CI-tauglich, JSON-Output, Exit-Codes). |
| Keine Verbindung zwischen QA und Promo | **Verketteter Workflow mit QA-Gate**: QA und Promo sind getrennte, zweckgebundene Läufe (eigene Flows). Die Promo wird erst freigeschaltet, wenn QA bestanden ist — ein schlechter QA-Score blockiert die Promo („keine kaputte App bewerben"). |
| Unstrukturierte Markdown-Reports | Reports zusätzlich als **JSON** (maschinenlesbar) + Markdown (menschlich) + annotierte Frames. |
| Fragile Fallback-Ketten | **Quality-first Defaults**, klar dokumentierte, getestete Fallbacks (TTS, Musik, Render). |

---

## 3. Zielarchitektur

Der zeitliche Ablauf ist eine **Kette**, kein paralleles Aufteilen einer Aufnahme:

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │              GETEILTE CAPTURE-ENGINE (src/core/capture.js)             │
 │   Browser steuern · Flow-Runner · Screenshots · recordVideo · Logs    │
 │   — reine Infrastruktur, von beiden Pipelines aufgerufen —            │
 └──────────────────────────────────────────────────────────────────────┘
        ▲ (QA-Flow: fährt auch                  ▲ (Promo-Flow: NUR saubere
        │  Fehlerzustände/Edge-Cases an)        │  freigegebene Happy-Paths)
        │                                       │
 ┌──────┴───────────────────────┐       ┌───────┴──────────────────────────┐
 │   SCHRITT 1: QA / BUGHUNT     │       │   SCHRITT 2: VIDEO-PIPELINE        │
 │   src/qa/                     │       │   src/video/  (6 Phasen)           │
 │   • Claude-Vision-Analyse     │       │   0 Discovery  (Kontext/Ziel)      │
 │   • Severity-Ranking + Score  │       │   1 Storytelling (Script/Board)    │
 │   • Bug-Report (MD + JSON)    │       │   2 Capture     (sauberer Flow)    │
 │   • UI-Verbesserungsvorschläge│       │   3 Design      (DESIGN.md+Szenen) │
 │   • annotierte Frames         │       │   4 Production  (index.html+GSAP)  │
 │   • Exit-Code für CI          │       │   5 Audio+Render(TTS+Musik+ffmpeg) │
 └──────────────┬────────────────┘       │   → out/final.mp4                  │
                │                         └────────────────▲──────────────────┘
                ▼                                          │
        ┌───────────────┐    QA bestanden / Bugs gefixt    │
        │   QA-GATE      │ ─────────────────────────────────┘
        │ Score ≥ Schwelle?  keine offenen High-Severity-Bugs?
        │ nein → Promo blockiert: "erst fixen, dann bewerben"
        └───────────────┘

 Gemeinsam genutzt (reiner Code, keine geteilten Aufnahmedaten):
   src/core/   (Capture-Engine, Flow-Runner)
   src/llm/    (Anthropic-Client, Prompts)
   src/render/ (HTML→Frames→MP4, Renderer-Abstraktion)
   src/audio/  (TTS, Musik, Mix)
   src/config/ (cue.config + .env), src/util/
```

### Datenverträge: zwei getrennte Bundles

QA und Promo erzeugen **eigene** Capture-Bundles aus **eigenen** Flows — sie teilen sich
nur das Format, nicht die Daten.

**`qa-bundle.json`** — fängt bewusst auch Fehler ein (das ist der Zweck):
```jsonc
{
  "intent": "qa",
  "url": "https://app.example.com",
  "flow": [ { "step": "login-mit-falschem-pw", "screenshot": "..." } ],
  "video": "qa-capture.webm",
  "console": [ { "type": "error", "text": "Uncaught TypeError ..." } ],
  "network": [ { "url": "/api/x", "status": 500 } ],
  "a11y": "a11y-tree.json",
  "metrics": { "lcp": 4200, "cls": 0.31 }
}
```

**`promo-bundle.json`** — nur saubere, freigegebene Happy-Path-Flows:
```jsonc
{
  "intent": "promo",
  "url": "https://app.example.com",
  "qaGate": { "passed": true, "score": 92, "reportRef": "qa-reports/2026-06-22.json" },
  "flow": [
    { "step": "home",      "screenshot": "01-home.png",  "videoStart": 0.0 },
    { "step": "dashboard", "screenshot": "02-dash.png",  "videoStart": 3.2 }
  ],
  "video": "promo-capture.webm",
  "metrics": { "lcp": 1800, "cls": 0.01 }
}
```

Das Feld `qaGate` in `promo-bundle.json` ist der **Beleg**, dass vor der Produktion ein
bestandener QA-Lauf vorlag — ohne ihn (oder bei `passed:false`) bricht die Video-Pipeline ab.

---

## 4. Technologie-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache/Runtime | **Node.js 20+** (vorhanden via nvm) | bestehende Code-Basis, Playwright-nativ |
| Browser/Capture | **Playwright Chromium** (vorhanden) | bereits genutzt; `recordVideo`, Tracing, A11y-Tree out of the box |
| LLM | **Anthropic Claude** (`@anthropic-ai/sdk`, vorhanden) | bereits genutzt; Vision für QA, Text für Script/Design |
| Szenenformat | **HTML + CSS + GSAP** | wie hve-spielberg: editierbar, deterministisch, kein proprietäres Format |
| Render (Standard) | **Eingebaut**: GSAP-Timeline deterministisch durchscrubben → Playwright-Screenshots pro Frame → `ffmpeg` → H.264/AAC MP4 | keine externe CLI-Abhängigkeit, volle Kontrolle |
| Render (Plugin) | **`hyperframes` CLI** optional | Kompatibilität / Komfort, falls installiert |
| TTS | **ElevenLabs** (Default) → Fallback lokal/aus | Qualität; sauber gekapselt mit Key-Check |
| Musik | **Freesound API** (CC) → user-provided → keine | Lizenzklarheit, `CREDITS.md` automatisch |
| Timing | **Whisper** optional zur Voiceover-Verifikation | Untertitel/Caption-Sync |
| Audio-Mix | **ffmpeg** | Standard; **muss installiert werden** (heute nicht vorhanden) |
| Config | `cue.config.json` + `.env` | reproduzierbare Läufe, CI-fähig |
| Tests | Vitest/node:test, später | erst auf expliziten Wunsch (keine Auto-Tests) |

### Bekannte Voraussetzungen / Lücken in dieser Umgebung
- **ffmpeg/ffprobe sind aktuell NICHT installiert** → Installationsschritt nötig (`apt`/`dnf install ffmpeg`; Sandbox hat offenes Internet).
- **ElevenLabs-/Freesound-Keys optional**: ohne Keys greifen Fallbacks (lokale/keine Audio).
- **Playwright-Browser** müssen via `npx playwright install --with-deps chromium` vorhanden sein.

---

## 5. Verzeichnis-Layout (Ziel)

```
CUE-AGENT/
├── bin/
│   └── cue.js                      # CLI-Einstieg (qa | promo | capture | render | doctor)
├── src/
│   ├── core/
│   │   ├── capture.js              # Capture-Engine → CaptureBundle
│   │   ├── flow.js                 # Flow-Definition (deklarative Schritte)
│   │   └── bundle.js               # CaptureBundle lesen/schreiben/validieren
│   ├── qa/
│   │   ├── analyze.js              # Claude-Vision-Analyse
│   │   ├── severity.js             # Severity-Ranking + Score
│   │   └── report.js               # Markdown + JSON + annotierte Frames
│   ├── video/
│   │   ├── phase0-discovery.js
│   │   ├── phase1-storytelling.js  # Script + storyboard.json
│   │   ├── phase2-capture.js       # nutzt core/capture
│   │   ├── phase3-design.js        # DESIGN.md + scenes/*.html
│   │   ├── phase4-production.js    # index.html (GSAP-Komposition)
│   │   └── phase5-audio-render.js  # TTS + Musik + Mix + Render
│   ├── llm/
│   │   ├── client.js               # Anthropic-Wrapper
│   │   └── prompts/                # versionierte Prompt-Bausteine
│   ├── render/
│   │   ├── index.js                # Renderer-Abstraktion (built-in | hyperframes)
│   │   ├── builtin.js              # HTML+GSAP → Frames → ffmpeg
│   │   └── hyperframes.js          # optionales Plugin
│   ├── audio/
│   │   ├── tts.js                  # ElevenLabs + Fallback
│   │   ├── music.js                # Freesound + Fallback
│   │   └── mix.js                  # ffmpeg-Mix + Normalisierung
│   ├── design-systems/             # Brand-Presets (DESIGN.md je Marke)
│   ├── templates/                  # Szenen-/Projekt-Templates
│   └── config/
│       └── index.js                # Config-/Env-Loader + Validierung
├── docs/
│   └── ULTIMATE_VIDEO_CREATOR_PLAN.md   # dieses Dokument
├── qa-reports/                     # QA-Ausgaben (bestehend)
├── video-projects/                 # je Video ein Projektordner (s. u.)
├── qa-agent.js                     # bleibt vorerst als Kompatibilitäts-Shim
├── package.json
└── README.md
```

**Video-Projekt-Ordner** (pro Lauf, angelehnt an hve-spielberg):
```
video-projects/<slug>-<timestamp>/
├── project-plan.json     # Phasen-Tracker + Entscheidungs-Log
├── context.json          # Discovery-Ergebnis
├── storyboard.json       # Szenen + Script + Timing
├── DESIGN.md             # Marken-/Motion-Vertrag
├── promo-bundle.json     # zweckgebundener Promo-Capture (mit qaGate-Beleg)
├── public/               # screenshots/, clips/, video.webm
├── scenes/               # 00-*.html, 01-*.html …
├── index.html            # GSAP-Wurzelkomposition
├── audio/                # voiceover.mp3, music.mp3, mixed.mp3, transcript.json
├── CREDITS.md            # Musik-/Asset-Attribution
└── out/final.mp4
```

---

## 6. CLI-Design

```bash
# QA / Bughunting (Rückwärtskompatibel zum heutigen Verhalten)
cue qa <url> [--flow flow.json] [--auto] [--json] [--fail-on=high]

# Promo/Showcase/Tutorial-Video (prüft zuerst das QA-Gate!)
cue promo  <url> --duration 60 --aspect 16:9 --brand vercel --voice matilda
cue showcase <url> ...
cue tutorial <url> ...
#   → bricht ab, wenn kein bestandener, frischer QA-Report zur URL existiert
#   → Override nur explizit: --skip-qa-gate (mit Warnung)

# Nur aufnehmen (zweckgebundenes Bundle: --intent qa | promo)
cue capture <url> --intent promo --flow flow.json -o promo-bundle.json

# Aus vorhandenem Projekt nur rendern (schnelle Iteration)
cue render video-projects/<slug>/

# Umgebungs-Check (Node, ffmpeg, Browser, Keys)
cue doctor

# Resume / Sprung (wie hve-spielberg-Modi)
cue promo <url> --resume
cue promo <url> --jump-to design
```

Gemeinsame Flags: `--interactive|--auto`, `--out`, `--config`, `--verbose`.

---

## 7. Die 6 Phasen — konkret als Code

| Phase | Input | Verarbeitung | Output | LLM? |
|---|---|---|---|---|
| 0 Discovery | URL, User-Antworten/Flags, optional Codebase-Scan | Ziel, Zielgruppe, Modus, Dauer, Aspect, Brand-Strategie | `context.json` | ja (Analyse) |
| 1 Storytelling | `context.json` | Narrativ je Modus, Szenenliste, Voiceover-Script, Timing-Budget | `storyboard.json` | ja (kreativ) |
| 2 Capture | `storyboard.json`, URL, **bestandenes QA-Gate** | Flow-Runner: fährt die im Storyboard referenzierten, sauberen Views ab, nimmt Video+Shots auf | `promo-bundle.json`, `public/` | nein (deterministisch) |
| 3 Design | `context.json`, Brand-Preset | `DESIGN.md` (Palette/Type/Motion), Szenen-HTML-Templates | `DESIGN.md`, `scenes/*.html` | ja (Layout-Vorschlag) + Templates |
| 4 Production | `scenes/`, `storyboard.json` | GSAP-Wurzelkomposition, Transitions, Caption-Wiring; Lint/Validate | `index.html` | teils |
| 5 Audio+Render | `index.html`, Script | TTS → (Whisper-Timing) → Musik → ffmpeg-Mix → Frames → MP4 | `out/final.mp4` | nein |

**Anti-Slop-Regeln aus hve-spielberg werden als Lint-Checks in Phase 4 kodiert** (z. B. keine `clipPath`-Transitions, kein `tl.from()`-Opacity-Stagger, keine `display`/`visibility`-Animation), damit sie nicht nur „Empfehlung" sind, sondern automatisch erzwungen werden.

---

## 8. Der verkettete Workflow: erst QA, dann Promo

Kein „eine Aufnahme für beides". Stattdessen eine **feste Reihenfolge mit Qualitäts-Gate**:

1. **Schritt 1 — QA (Pflicht).** `cue qa <url>` fährt den QA-Flow (inkl. Edge-Cases/Fehlerzuständen), analysiert per Claude-Vision, erzeugt Bug-Report + UI-Verbesserungsvorschläge und einen **QA-Score**. Ergebnis wird in `qa-reports/` persistiert (mit Zeitstempel + URL-Fingerprint).
2. **Schritt 2 — Fixen.** Du behebst die gemeldeten Bugs / setzt die UI-Vorschläge um. Die App wird besser.
3. **Schritt 3 — QA-Gate.** Vor jeder Promo prüft die Video-Pipeline den jüngsten QA-Report zur selben URL: `Score ≥ Schwelle` **und** keine offenen High-Severity-Bugs?
   - **Nein →** Promo wird **blockiert** mit klarer Meldung („erst fixen, dann bewerben"), Exit-Code ≠ 0.
   - **Ja →** Promo wird freigeschaltet; der Gate-Beleg wird in `promo-bundle.json` (`qaGate`) festgehalten.
4. **Schritt 4 — Promo.** `cue promo <url>` fährt einen **separaten, sauberen Happy-Path-Flow** ab (keine Fehlerzustände) und produziert das Video der **verbesserten** App.

**Eigenschaften des Gates:**
- Schwellen konfigurierbar in `cue.config.json` (z. B. `promo.requireQa.minScore`, `failOnSeverity`).
- Override nur explizit & sichtbar: `--skip-qa-gate` (mit Warnung im Log und Vermerk im `CREDITS.md`/`project-plan.json`) — Default ist **Gate aktiv**.
- Frische-Check: ein QA-Report älter als `maxAgeHours` gilt als ungültig → erneuter QA-Lauf nötig (verhindert „bestanden vor 3 Monaten").

**Tutorial-Modus:** nutzt zwar denselben Flow-Runner wie QA, aber ausschließlich den sauberen Happy-Path — es werden Schritte/Erfolge gezeigt, niemals Fehlerzustände. Details siehe §8.1.

> **Damit ist garantiert: Es wird nie eine kaputte App beworben.** QA und Promo teilen Code, aber keine Aufnahmedaten; die Promo läuft nur auf einem nachweislich guten Stand.

### 8.1 Tutorial-Modus im Detail

Der Tutorial-Modus ist der natürlichste Ableger des QA-first-Ansatzes: Der Flow-Runner,
der zum Bughunting durch die App klickt, **ist bereits das Drehbuch**. Beim Tutorial wird
derselbe Mechanismus auf den sauberen, vom QA-Gate freigegebenen Happy-Path angewandt.

**1) Kapitel-Erkennung aus dem Flow.** Jeder deklarierte Flow-Schritt mit einem `goal`
wird zu einem Tutorial-Kapitel. Die Flow-Definition trägt dafür Tutorial-Metadaten:

```jsonc
// flow.json (Auszug) — eine Quelle für QA-Lauf UND Tutorial
{
  "steps": [
    {
      "id": "create-project",
      "goal": "Ein neues Projekt anlegen",     // → Kapitelüberschrift
      "narration": "Klicke auf 'Neues Projekt' und gib einen Namen ein.", // → Voiceover
      "actions": [
        { "type": "click",  "selector": "#new-project", "caption": "Neues Projekt" },
        { "type": "type",   "selector": "#name", "text": "Demo", "caption": "Name eingeben" },
        { "type": "click",  "selector": "#save",  "caption": "Speichern", "focus": true }
      ],
      "payoff": "Projekt erscheint im Dashboard"  // → was am Ende sichtbar wird
    }
  ]
}
```

**2) Schritt → Szene-Mapping.** Aus jedem Kapitel erzeugt die Pipeline genau eine
Tutorial-Szene mit fester Anatomie:

```
Kapitel-Szene
├─ Kapitel-Karte:   Nummer + goal ("Schritt 2 · Ein neues Projekt anlegen")
├─ Clip:            der aufgenommene WebM-Ausschnitt dieses Schritts (echte Bewegung)
├─ Highlights:      pro action ein Marker/Spotlight auf das geklickte Element
├─ Caption-Lower-Third: die action.caption synchron zum Klick
└─ Payoff-Beat:     kurzer Halt auf dem Ergebnis (payoff)
```

**3) Captions & Highlights.** Aus den `actions` werden zeitlich verankerte Overlays:
- **Caption** (Lower-Third) blendet `action.caption` zum Zeitpunkt des Klicks ein.
- **Highlight** zeichnet einen weichen Spotlight-/Marker-Rahmen um `action.selector`
  (Bounding-Box wird zur Aufnahmezeit von Playwright gemessen und im Bundle gespeichert).
- **Zoom-on-click** (optional, konfigurierbar): sanfter Scale-In auf das fokussierte
  Element (`focus: true`) — als GSAP-Transform am Wrapper, nicht an `<img>`/`<video>`
  direkt (Anti-Slop-Regel aus §7).

**4) Narration & Timing.** `narration` je Kapitel ergibt das Voiceover-Script (Phase 1).
Das Timing der Caption/Highlight-Overlays wird an die **echten Klick-Zeitstempel** aus der
Aufnahme gekoppelt (im Bundle pro action als `tClick` gespeichert) und optional per Whisper
gegen das Voiceover feinjustiert — so reden Sprecher, Untertitel und Mausaktion synchron.

**5) Struktur des Gesamtvideos** (Tutorial-Narrativ):
```
Cold-Open (Payoff zuerst: "So sieht das fertige Ergebnis aus")
  → Kapitel 1 … N (je ein goal, task-geordnet)
  → Recap (kurze Liste der Schritte + CTA "Jetzt selbst ausprobieren")
```

**6) Was den Tutorial-Modus robust macht:**
- **Verifizierte Schritte:** Das QA-Gate hat die Flows als fehlerfrei bestätigt → keine
  „im Video klappt's, live nicht"-Diskrepanz.
- **Eine Flow-Definition, zwei Zwecke:** dieselbe `flow.json` treibt QA-Lauf *und* Tutorial
  — Pflege an einer Stelle, garantierte Konsistenz.
- **Degradation:** Fehlt ein Clip (z. B. Screencast nicht verfügbar), fällt das Kapitel auf
  Screenshot + Ken-Burns-Schwenk zurück statt zu blockieren (warn-don't-block).

**Promo vs. Tutorial aus derselben Aufnahme:** Promo betont Emotion/Nutzen (kürzere Clips,
mehr Musik, Feature-Highlights), Tutorial betont die konkreten Handgriffe (längere Clips,
Captions, ruhigeres Tempo). Beide ziehen aus demselben sauberen `promo-bundle.json`.

---

## 9. Implementierungs-Meilensteine (inkrementell, jederzeit lauffähig)

> Jeder Meilenstein endet mit einem funktionierenden Stand. Keine „Big-Bang"-Umstellung.

**M0 — Fundament & Refactor (nicht-brechend)**
- `bin/cue.js` + Subcommand-Router; `src/config`, `src/util`, `src/llm/client`.
- Bestehende QA-Logik nach `src/qa/` ziehen; `qa-agent.js` bleibt als dünner Shim.
- `cue qa <url>` reproduziert exakt das heutige Verhalten + zusätzlich JSON-Output.
- `cue doctor` prüft Node/ffmpeg/Browser/Keys.
- *Akzeptanz:* `cue qa` erzeugt identischen Report wie heute; alte `npm start` funktioniert weiter.

**M1 — Capture-Engine + Bundle**
- `src/core/capture.js` mit Flow-Runner, `recordVideo`, Screenshots, Logs, A11y, Metriken.
- `cue capture --intent qa|promo` schreibt validiertes, zweckgebundenes Bundle.
- `cue qa` nutzt die Engine (eigener QA-Flow).
- *Akzeptanz:* QA-Lauf erzeugt `qa-bundle.json` + Report; Bundle validiert gegen Schema.

**M2 — Video-Pipeline Skelett (stiller Render) — Promo & Tutorial gleichwertig**
- Phasen 0–4 implementiert; eingebauter Renderer (Frames→ffmpeg) erzeugt **stummes** MP4.
- **Beide Kern-Modi von Anfang an**: Promo *und* Tutorial. Tutorial nutzt das Schritt→Szene-Mapping aus §8.1 (Kapitel, Clip, Captions, Highlights).
- 1–2 Brand-Presets + Basis-Szenen-Templates + GSAP-Grundtransitions.
- Anti-Slop-Lint in Phase 4.
- *Akzeptanz:* `cue promo <url> --auto` **und** `cue tutorial <url> --auto` erzeugen je ein abspielbares, stummes 16:9-MP4 (Tutorial mit Kapiteln + Captions).

**M3 — Audio**
- ElevenLabs-TTS, Freesound-Musik, ffmpeg-Mix/Normalisierung, optional Whisper-Captions.
- Tutorial: Caption/Highlight-Timing an echte Klick-Zeitstempel + Voiceover gekoppelt.
- *Akzeptanz:* `cue promo` und `cue tutorial` erzeugen MP4 mit Voiceover + Musik; ohne Keys sauber degradiert.

**M4 — Showcase, Aspect-Ratios, Politur**
- Showcase-Narrativ; 9:16/1:1/4:5; mehr Brand-Presets; Premium-Transitions (Metallic-Swoosh etc.); Tutorial-Feinschliff (Zoom-on-click, Ken-Burns-Fallback).
- Interaktive Checkpoints + `--resume`/`--jump-to`.
- *Akzeptanz:* alle drei Modi, alle vier Seitenverhältnisse, reproduzierbar.

**M5 — Verketteter Workflow & Härtung**
- QA-Gate vor der Promo (Score-/Severity-/Frische-Check, `--skip-qa-gate`-Override), `hyperframes`-Renderer-Plugin, CI-Beispiel, README/Docs.
- *Akzeptanz:* `cue promo` bricht ohne bestandenen, frischen QA-Report ab; nach QA-Pass läuft die Promo durch und vermerkt den Gate-Beleg.

---

## 10. Risiken & Gegenmaßnahmen

| Risiko | Maßnahme |
|---|---|
| ffmpeg fehlt in Umgebung | `cue doctor` erkennt es; Installations-Schritt + klare Fehlermeldung; Render-Phase prüft vorab |
| Deterministisches Rendern (Frame-genaues Scrubben von GSAP) ist knifflig | GSAP-Timeline mit fester `fps`, pro Frame `tl.seek(t)` + Screenshot; Anti-Slop-Regeln verhindern nicht-seekbare Animationen |
| LLM-Output unzuverlässig/variabel | LLM nur für klar umrissene Schritte; Output gegen Schemata validieren; Retries; deterministische Teile in Code |
| API-Kosten/Keys (Anthropic/ElevenLabs/Freesound) | alles optional/fallbackfähig; `--auto` ohne teure Schritte möglich; Caching von Capture/Script |
| Lizenz Musik (CC) | Freesound-Filter auf CC0/CC-BY, `CREDITS.md` automatisch, Hinweis vor kommerzieller Nutzung |
| Scope-Kriechen | strikt nach Meilensteinen; jeder Schritt eigenständig lauffähig |
| Rückwärtskompatibilität QA | `qa-agent.js`-Shim + identischer Report in M0 abgesichert |

---

## 11. Akzeptanzkriterien (Gesamtprojekt)

- [ ] `cue qa <url>` ≥ heutige QA-Funktionalität, zusätzlich JSON + CI-Exit-Code + persistierter QA-Score.
- [ ] `cue capture <url> --intent qa|promo` erzeugt ein zweckgebundenes Bundle mit echtem Video.
- [ ] `cue promo|showcase|tutorial <url>` erzeugt ein `out/final.mp4` (H.264/AAC) mit Voiceover + Musik.
- [ ] Vier Seitenverhältnisse (16:9, 9:16, 1:1, 4:5) wählbar.
- [ ] Eingebauter Renderer ohne externe Skill-Abhängigkeit; `hyperframes` optional.
- [ ] QA-Gate: Promo wird ohne bestandenen, frischen QA-Report blockiert (Override nur explizit).
- [ ] Saubere Degradation ohne ElevenLabs-/Freesound-Keys.
- [ ] `cue doctor` meldet alle Voraussetzungen verständlich.

---

## 12. Offene Entscheidungen für dich

> **Bereits entschieden:** Verketteter Workflow „erst QA, dann Promo" mit verpflichtendem
> QA-Gate (siehe §8). Promo läuft nie auf einem ungeprüften/kaputten Stand.

1. **Renderer-Strategie**: Eingebauter Renderer als Default (empfohlen, unabhängig) **oder** primär `hyperframes` CLI nutzen?
2. **Sprache der Outputs**: QA-Reports sind heute deutsch. Voiceover/Script ebenfalls deutsch, oder konfigurierbar (de/en)?
3. **Codebase-Scan in Phase 0**: Soll Discovery auch das Repo der Ziel-App lesen (für besseren Kontext), oder nur die laufende URL?
4. **Erster Meilenstein**: Starten wir mit **M0 (Fundament/Refactor)** oder möchtest du zuerst einen schnellen, sichtbaren **M2-Prototyp** (stummes Promo-Video)?
5. **Audio-Provider**: ElevenLabs ok, oder lieber von Anfang an einen Key-freien lokalen TTS-Pfad?
6. **Gate-Schwellen**: Welcher QA-Mindest-Score und welche Frische (max. Alter eines QA-Reports) sollen als Default gelten?

---

*Dieser Plan ist die Arbeitsgrundlage. Nach deiner Freigabe (bzw. Antworten auf §12) beginne ich mit dem gewählten Meilenstein.*
