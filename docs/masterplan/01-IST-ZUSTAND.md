# 01 — Ist-Zustand (verifiziert am Code, Stand v1.3.0)

> Dieses Kapitel ist die **Landkarte des existierenden Codes**. Jede Aussage ist
> gegen den Quelltext geprüft (Datei-Referenzen). Ein Agent, der hier etwas
> Abweichendes im Code vorfindet, aktualisiert **zuerst dieses Kapitel** (eigener
> Commit `docs: Ist-Zustand korrigiert`), bevor er weiterarbeitet.

## 1. Gesamtbild

CUE-AGENT ist ein Node-CLI (`bin/cue.js`, CommonJS, `"use strict"`, Node ≥ 18)
mit drei Dependencies (`@anthropic-ai/sdk`, `dotenv`, `playwright`) und einer
optionalen (`kokoro-js`). Zwei Welten teilen sich eine Pipeline:

1. **QA/Verifikation** (der Kern): `qa`, `android-qa`, `design-check`,
   `design-iterate`, `release-check`, `playable-check`, `temporal-check`,
   `audio-check`, `qa-loop`, `capture`.
2. **Video als Belohnung**: `promo`, `tutorial`, `showcase`, `render`, `gif`,
   `configurator` — durch das QA-Gate (`src/qa/gate.js`) blockiert, bis QA
   besteht.

**Gemeinsame Währung aller QA-Commands:**
- `src/qa/severity.js` — `assess({consoleLogs, navOk, network})` → `{level, score}`;
  `failsGate(level, failOn)` → CI-Exit-Code. Level: `none|low|medium|high`.
- `src/qa/report.js` — `writeReports(...)` → Markdown + JSON nach `qa-reports/`.
- `src/util/index.js` — Logger, `timestamp()`, `slugify()`, `ensureDir()`,
  `writeJson()`, `writeText()`, `resolveChromiumExecutable()`.

## 2. Modul-Inventar

### 2.1 Web-QA (`src/qa/`)

| Datei | Rolle | Für den Plan relevant |
|---|---|---|
| `index.js` | Orchestrator `runQa`: capture → analyze → severity → report | Vorbild für jede neue Plattform-QA |
| `capture.js` | Playwright-Capture: Screenshot, Konsole, Netzwerk, a11y | — |
| `analyze.js` | LLM-Vision-Analyse (BYOK über `src/llm/`) | LLM ist **optional**, Pipeline läuft ohne |
| `severity.js` | Score-/Level-Berechnung + Gate | **Zentrale Wiederverwendung** — nie duplizieren |
| `findings.js` | Strukturierte Findings (Severity, Kategorie, Ort, Fix) | Schema-Basis für Verdict-Schema v1 |
| `report.js` | MD+JSON-Reports | wird um Evidence-Schema v1 erweitert (WP-CORE-3) |
| `playable.js` | `runPlayableCheck`: 5 deterministische Checks (startet/fehlerfrei/bedienbar/reagiert/beweise) → `PLAYABLE-PROOF.md` | **Blaupause** für Desktop-Game-Playability; heute fest an Playwright/Chromium gebunden (`playable.js:78`) |
| `temporal.js` | `runTemporalCheck`: Idle/Transition/State-Phasen, SHADED-Vertrag (`window.SHADED.isReady/setParams`), generischer Fallback | fest an Playwright gebunden; Phasenlogik gehört in den treiber-agnostischen Runner |
| `frame-metrics.js` | **Reine Funktionen, kein I/O**: `meanAbsDiff`, `pixelStdDev`, `analyzeSequence` (Idle-Statik/Flackern/Sprünge/Responsiveness), `evaluatePlayability` | **Der wichtigste Baustein des ganzen Plans.** Läuft unverändert auf Frames JEDER Quelle (Browser, adb screenrecord, Windows-Capture, Blender-Renderframes) |
| `audio-check.js` | Audio-Vertrags-Beweis via `window.ANVIL_AUDIO` (CUE_FIRED/STATE_REACTION/…) | Vorbild für Vertrags-Checks; wird Teil des CUE-PROBE-Vertrags |
| `release-check.js`, `release.js` | READY/NOT-READY-Verdict + `RELEASE-READINESS.md` | bekommt später Plattform-Parameter |
| `loop.js`, `fixer.js`, `propose-edits.js` | Autonomer test→fix→rebuild→retest-Loop (nur in `--repo`, nur mit `--apply`) | Sicherheitsmodell beibehalten |
| `design-baseline.js`, `design-iterate.js` | Deterministischer Soll-Ist-Vergleich je Element; Iteration bis Ziel-Score | Android-Adapter existiert; Windows-Adapter fehlt |
| `scan.js`, `docs.js`, `gate.js` | Repo-Scan, QA-Historie (`qa-history/`), Video-Gate | — |

### 2.2 Android (`src/android/`)

| Datei | Rolle | Bewertung |
|---|---|---|
| `adb.js` | Synchrone `adb`-CLI-Hüllen (`spawnSync`), **kein Appium**: `installApk` (`install -r -g`), `launchPackage` (monkey LAUNCHER), `screencapPng` (`exec-out screencap -p`), `uiDumpXml` (uiautomator dump), `parseClickables`/`parseAllNodes` (Regex über XML), `tap/swipe/inputText/back`, `currentPackage`/`currentActivity` (dumpsys window), `clearLogcat`/`logcatDump`, `detectCrashes` (FATAL EXCEPTION/ANR-Regex), `logcatToConsole` | Solide Primitive; Lücken siehe §3 |
| `index.js` | `runAndroidQa`: Install → Launch → Foreground-Check → Flow-Modus **oder** Explorations-Schleife (LLM via `vision.js`, sonst Heuristik „jedes Klickbare einmal") → Crash/ANR → severity → report + Detail-JSON | Spiegelt `runQa` sauber; Exploration ist flach (kein Coverage-Modell) |
| `flow.js` | Deklarative Android-Flows (tap/back/text/swipe + expect: activity/text/id/baseline) | gutes Soll-Ist-Modell |
| `vision.js` | Multimodale Schritt-Entscheidung (BYOK) | optional, korrekt gekapselt |
| `design-adapter.js` | Baseline-Capture aus uiautomator-XML + Patch-Apply/Rollback + Rebuild-Hooks | für `design-iterate --platform android` |

**Getestete Fähigkeiten heute:** Install, Launch, Explorations-Screenshots,
UI-Dump, Crash/ANR aus Logcat, Flow-Verifikation mit Design-Baseline,
Severity+Report. **Ein** Gerät (erstes aus `adb devices`, `index.js:51`).

### 2.3 Windows

**Existiert nicht.** Kein Code, kein Treiber, kein Command. Die Plattform ist
der Kern von Phase B (Kapitel 04).

### 2.4 Game-Engines (Unity/Unreal/Blender)

**Existiert nur indirekt:**
- Web-Builds (Unity WebGL, HTML5-Spiele) funktionieren heute über
  `playable-check`/`temporal-check`, weil die im Browser laufen.
- `window.SHADED`-Vertrag (`temporal.js`) ist ein Spezialfall EINER Web-Engine
  (SHADED aus assetpilot.md).
- Native Builds (Unity-Windows-Exe, Unreal-Exe, Android-APK-Spiele als Spiele,
  Blender-Dateien) kann CUE-AGENT **nicht** bewerten. Das ist Phase C.

### 2.5 Infrastruktur

- **Tests:** `node --test` (`test/*.test.js`), 8 Dateien. Muster: reine
  Funktionen mit Fixtures testen (`frame-metrics.test.js`, `severity.test.js`);
  Smoke-Tests, die echte Browser-Läufe kapseln (`temporal-playable.smoke.test.js`).
- **CI:** `.github/workflows/qa-and-commit.yml` (ubuntu; Node+Playwright+ffmpeg,
  committet Befunde nach `qa-history/`) + Beispiel-Workflow für fremde Repos.
  **Keine** Windows-, keine Android-Emulator-CI.
- **LLM-Zugang:** `src/llm/client.js` + Provider `anthropic.js`/`openai.js`;
  provider-agnostisch über `CUE_LLM_PROVIDER/BASE_URL/MODEL/API_KEY`; Offline-
  Stub `scripts/offline-ai-stub.js` für key-freie Demos/CI.
- **Config:** `src/config/index.js` (cue.config.json + Env + Overrides;
  `absPaths.qaReports` etc.), `keystore.js` (AES-256-GCM für GUI-Keys).
- **Sprache:** Code-Kommentare, Logs, Reports, README: **Deutsch**. `--lang en`
  für Ausgaben vorhanden (`src/i18n/`).

## 3. Lückenanalyse (die Begründung der Phasen)

### 3.1 Android — gut, aber nicht Best-in-Class

| # | Lücke | Beleg | Adressiert in |
|---|---|---|---|
| L-A1 | Keine Performance-Signale: keine Startzeit (TTID), keine Frame-/Jank-Messung (`dumpsys gfxinfo`), kein Speicher (`dumpsys meminfo`) | `src/android/adb.js` hat keine dumpsys-Perf-Primitive | WP-A1 |
| L-A2 | Exploration ohne Gedächtnis/Ziel: kein Activity-Coverage-Modell, keine Screen-Deduplizierung, besuchte Elemente nur per Koordinate (`index.js:196`) | `runAndroidQa`-Schleife | WP-A2 |
| L-A3 | Ein Gerät, eine Konfiguration: keine Geräte-Matrix, keine Locale-/Dark-Mode-/Font-Scale-Durchläufe | `index.js:51` nimmt `devices[0]` | WP-A3, WP-A4 |
| L-A4 | Crash-Forensik dünn: Logcat-Regex, aber keine Tombstones, kein `bugreport`, keine ANR-Traces (`/data/anr/`), kein `DropBoxManager` | `adb.js:189` | WP-A5 |
| L-A5 | Kein on-device `playable-check`/`temporal-check`: Frame-Metriken existieren, aber es gibt keinen Frame-Lieferanten via `screenrecord` | `frame-metrics.js` ist rein, `temporal.js` nur Playwright | WP-A6 (nach WP-CORE-2) |
| L-A6 | `inputText` kann kein Unicode/keine Sonderfälle (`input text` schluckt Umlaute je nach Gerät) | `adb.js:153` | WP-A7 |
| L-A7 | Kein APK-Preflight (minSdk/targetSdk, debuggable, Permissions, Größe) vor der Installation | — | WP-A8 |
| L-A8 | Keine a11y-Bewertung aus dem UI-Dump (fehlende contentDescription, Touch-Targets < 48dp) | `parseClickables` extrahiert die Attribute gar nicht | WP-A9 |
| L-A9 | Kein System-Dialog-Handling (Permission-Prompts, „App reagiert nicht"-Dialoge) — Exploration bleibt daran hängen | — | WP-A2 (Teil) |
| L-A10 | Keine Emulator-Lebenszyklus-Hilfe für CI (AVD headless starten, Snapshot, Doctor-Check) | `doctor` prüft kein Android | WP-A10 |

### 3.2 Windows — fehlt vollständig

| # | Lücke | Adressiert in |
|---|---|---|
| L-B1 | Kein Treiber (Fenster finden, UIA-Baum, Input, Screenshot) | WP-B1, WP-B2 |
| L-B2 | Keine Installation/Deinstallation (MSI/MSIX/portable) | WP-B3 |
| L-B3 | Keine Crash-/Hang-Erkennung (WER, Event Log, „Keine Rückmeldung") | WP-B2 |
| L-B4 | Kein `windows-qa`-Command, keine Windows-CI | WP-B5, WP-B7 |

### 3.3 Game-Builds — fehlt vollständig (außer Web)

| # | Lücke | Adressiert in |
|---|---|---|
| L-C1 | Kein Treiber für „nackte" Desktop-Prozesse mit Fenster (kein UI-Baum!) | WP-C1 |
| L-C2 | Kein `game-check`-Command (Playability-Verdict für Exe/APK-Builds) | WP-C2, WP-C8 |
| L-C3 | Keine Engine-Log-Parser (Unity Player.log, Unreal Saved/Logs) | WP-C3, WP-C4 |
| L-C4 | `window.SHADED` ist nicht generalisiert — native Engines haben keinen Vertrag, über den CUE-AGENT Zustand/Parameter lesen/setzen kann | WP-CORE-4, WP-C5, WP-C6 |
| L-C5 | Blender-Dateien/-Ausspielungen sind unbewertbar (öffnet die Datei? fehlende Assets? rendert? Animation lebt?) | WP-C7 |

### 3.4 Querschnitt

| # | Lücke | Adressiert in |
|---|---|---|
| L-Q1 | Report-JSONs sind je Command ähnlich, aber nicht schema-identisch (playable vs. temporal vs. qa vs. android-Detail) | WP-CORE-3 |
| L-Q2 | `playable.js`/`temporal.js` mischen Playwright-I/O und Urteilslogik — nur die Metriken sind rein | WP-CORE-2 |
| L-Q3 | CI testet nur ubuntu/Web | WP-Q3 |
| L-Q4 | `doctor` kennt weder adb/AVD noch Windows-Fähigkeiten noch `blender` | WP-Q4 |

## 4. Stärken, die JEDES neue WP schützen muss

1. **Reine, unit-testbare Urteilsfunktionen** getrennt vom I/O
   (`frame-metrics.js`-Muster). Neue Parser/Metriken IMMER so bauen.
2. **Key-freie Verdikte.** `playable/temporal/audio/design-check` laufen ohne
   LLM. Alle neuen Verdikt-Commands ebenso; LLM nur als optionale Anreicherung.
3. **Drei Dependencies.** Sidecars statt npm-Native-Module; Systemwerkzeuge
   (adb, PowerShell, blender) zur Laufzeit erkennen und mit klarer Meldung
   fehlen lassen (Muster: `adb.js:27`).
4. **Eine Severity-/Report-Pipeline.** `assess`/`failsGate`/`writeReports`
   werden von JEDER Plattform konsumiert (Beleg: `src/android/index.js:20-22`).
5. **Alles landet im CWD des Nutzers** (`qa-reports/`, `playable-reports/`, …) —
   das Tool bleibt in fremden Repos sauber.
6. **Exit-Codes sind der API-Vertrag** für CI: 0 = bestanden, 1 = Gate/Verdict
   verletzt, 2 = Bedienfehler.
