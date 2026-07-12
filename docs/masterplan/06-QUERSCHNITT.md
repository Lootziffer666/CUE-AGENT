# 06 — Querschnitt: Fixtures, Scoring, CI, Doctor, Doku, Meilensteine (WP-Q1 … WP-Q6)

> Querschnittspakete tragen alle Phasen. WP-Q1 ist das allererste Paket des
> gesamten Plans — ohne Fixtures ist nichts glaubwürdig testbar.

---

## WP-Q1 — Test-Fixtures & das Parser-Testmuster (SOFORT beginnen)

**Ziel:** Ein kuratierter Fixture-Baum, mit dem jedes andere WP seine
Akzeptanzkriterien belegen kann — plus die verbindliche Test-Konvention.

**Struktur (NEU `test/fixtures/`):**

```
test/fixtures/
  web/                    lebende/statische/springende HTML-Seiten (teils vorhanden
                          in test/-Smoke-Tests → hierher konsolidieren)
  android/
    dumpsys/              echte Ausgaben: am-start-W.txt, gfxinfo-framestats-api33.txt,
                          meminfo-api30.txt, … (je API-Level-Variante eine Datei)
    uidump/               uiautomator-XMLs: normal, permission-dialog, anr-dialog,
                          a11y-verstöße, scrollable
    logcat/               crash-fatal.txt, anr.txt, unity-channel.txt, sauber.txt
    apk/                  build-skripte oder gepinnte Mini-APKs (s. u.)
  windows/
    sidecar/              aufgezeichnete JSON-Antworten (Protokoll-Fixtures)
    wer/                  Report.wer-Beispiele
    eventlog/             exportierte Event-JSONs (1000/1001/1002)
  game/
    unity-logs/           ≥12 Player.log-Varianten (WP-C3)
    unreal-logs/          ≥10 Saved/Logs-Varianten (WP-C4)
    layouts/              Verzeichnis-Skelette für detectEngine (leere Dateien!)
  blender/
    probe-json/           Ausgaben von probe_blend.py (gesund/defekt)
    blends/               Mini-.blend-Dateien (klein halten! <200 KB, per Skript
                          reproduzierbar erzeugt: scripts/make-blend-fixtures.py)
  frames/                 PNG-Sequenzen: lebendig, statisch, sprung, blank
```

**Binär-Fixture-Politik (wichtig):** Große Binaries (APKs, Exes, .blend > 200 KB)
kommen NICHT ins Git. Stattdessen: (a) Erzeuger-Skripte (`scripts/make-*-fixture.*`),
(b) gepinnte Release-Assets im Repo (`gh release` mit SHA-256 im Lock-File
`test/fixtures/remote-fixtures.json`), die der CI-Job cached herunterlädt.
Das Fixture-„gesunde Spiel" für WP-C1/C2 wird als eigenes Mini-Programm gebaut
(z. B. winzige Godot- oder SDL-Fixture; ersatzweise eine PowerShell/WinForms-
Fixture `test/fixtures/game/fake-game.ps1`, die ein Fenster mit bewegtem
Rechteck zeichnet und auf Space reagiert — 60 Zeilen, kein Engine-Download,
deckt startet/lebt/reagiert/stabil vollständig ab; „friert ein"- und
„crasht"-Varianten als Flags).

**Test-Konvention (verbindlich, ergänzt Kapitel 07):**
1. Jeder Parser/jede Metrik = reine Funktion = Fixture-Test in `test/`.
2. Jeder Treiber = Vertrags-Testsuite (WP-CORE-1) + Protokoll-Fixtures.
3. Jeder Runner = mindestens ein Mock-Treiber-Test (deterministisch) +
   ein Smoke-Test hinter Plattform-Verfügbarkeits-Guard (Muster:
   `test/temporal-playable.smoke.test.js` überspringt sauber, wenn die
   Plattform fehlt — `t.skip()` mit Begründung).

**Akzeptanzkriterien:** Baum existiert mit README je Unterordner (Herkunft der
Fixtures!); `fake-game.ps1` läuft auf `windows-latest` und hat die drei Modi;
Blend-Erzeuger-Skript läuft headless. **Aufwand:** M (wächst mit den Phasen).
**Abhängigkeiten:** keine.

---

## WP-Q2 — Scoring-Vereinheitlichung & Schwellwert-Konfiguration

**Ziel:** Alle Plattformen/Commands rechnen Score & Severity nach EINEM
dokumentierten Modell; alle Schwellwerte sind zentral konfigurierbar.

**Design:**
- `src/qa/severity.js` bleibt die einzige Score-Quelle. Neue Signalarten
  (Perf, Hang, Engine-Findings, a11y) werden über eine erweiterte, additive
  Signatur eingespeist: `assess({consoleLogs, navOk, network, findings})`,
  wobei `findings` bereits severity-getaggte Einzelbefunde sind (Gewichte:
  high −30, medium −15, low −5 — identisch zur `analyzeSequence`-Penalty,
  `frame-metrics.js:153`; Konsistenz herstellen und im Doc festschreiben).
- `cue.config.json`-Namespace: `qa.thresholds.{web,android,windows,game}.*`
  (z. B. `game.startTimeoutMs`, `android.perf.maxColdStartMs`,
  `temporal.maxJump`). Loader in `src/config/index.js` mit Defaults =
  heutige Konstanten; JEDES hartkodierte Limit in neuen WPs MUSS hierher.
- Dokument NEU `docs/SCORING.md`: das Modell, alle Defaults, Begründungen,
  Beispielrechnungen.

**Akzeptanzkriterien:** `severity.test.js` erweitert (findings-Pfad);
Änderung eines Thresholds via Config nachweislich wirksam (Test).
**Aufwand:** S–M. **Abhängigkeiten:** keine; vor WP-A1/C2-Merge empfohlen.

---

## WP-Q3 — CI-Matrix des Repos

**Ziel:** Die eigene CI beweist alle Plattform-Behauptungen bei jedem PR.

**Design (`.github/workflows/ci.yml`, ersetzt nicht `qa-and-commit.yml`):**

| Job | Runner | Inhalt |
|---|---|---|
| `unit` | ubuntu-latest | `node --test` (alle reinen Tests, immer) |
| `web-smoke` | ubuntu-latest | playable/temporal gegen `test/fixtures/web/` |
| `windows-smoke` | windows-latest | Sidecar-Tests, Notepad-Playability, fake-game-Verdikte (WP-B7) |
| `android-emulator` | ubuntu-latest | `reactivecircus/android-emulator-runner`, android-qa + playable gegen Fixture-APK (WP-A10); `workflow_dispatch` + nightly, nicht je PR (Laufzeit) |
| `blender-asset` | ubuntu-latest | apt/snap-gecachtes Blender, asset-check-Fixtures (WP-C7) |

Regeln: Pfad-Filter (Windows-Job nur bei `src/windows/**`, `src/drivers/**`,
`src/qa/**`-Änderungen zwingend, sonst optional); Reports immer als
Artefakte hochladen; Gesamtlaufzeit je PR < 15 min.

**Akzeptanzkriterien:** Matrix grün auf main; ein absichtlicher Fixture-Bruch
in einem Test-PR macht den zuständigen Job rot (Beleg im PR-Verlauf).
**Aufwand:** M. **Abhängigkeiten:** die jeweiligen Phasen-Smoke-Ziele.

---

## WP-Q4 — `doctor` als Plattform-Fähigkeits-Matrix

**Ziel:** `cue doctor` zeigt eine ehrliche Fähigkeits-Matrix: Web (Node,
ffmpeg, Chromium), Android (adb, Gerät, aapt2, Emulator-Tools), Windows
(PowerShell, UIA, Event-Log-Zugriff — nur auf Windows), Game (ffmpeg,
gameproc-Voraussetzungen), Blender (Binary, Version), LLM (Keys/CUE_LLM_*),
TTS — je Zeile: verfügbar/fehlend/optional + konkreter Fix-Hinweis.
`--json` liefert die Matrix maschinenlesbar (für ANVIL-Gates: „kann dieser
Runner Windows-QA?").

**Akzeptanzkriterien:** doctor auf ubuntu/windows zeigt korrekte Matrizen
(CI-Beleg); kein Check darf den doctor crashen (alles try/catch mit
Fehlerzeile). **Aufwand:** S–M. **Abhängigkeiten:** läuft den Phasen hinterher
(je neue Fähigkeit eine doctor-Zeile — in jedem Plattform-WP als
Akzeptanzpunkt mitgedacht, hier gebündelt).

---

## WP-Q5 — Dokumentation & README-Neuschnitt

**Ziel:** Die Doku erzählt die neue Wahrheit: EIN Verifikations-Agent für
Web + Android + Windows + Game-Builds + Assets.

**Inhalte:**
- README: Fähigkeiten-Tabelle um `windows-qa`, `game-check`, `asset-check`,
  `--platform`-Verdikte erweitern; Plattform-Matrix (was läuft wo, was ist
  key-frei); Quickstarts je Plattform (5 Zeilen).
- NEU `docs/PLATTFORMEN.md`: Treiber-Vertrag für Anwender erklärt, Fähigkeiten
  je Treiber, Grenzen (z. B. „Exclusive-Fullscreen-Capture kann schwarz sein →
  Fensterargumente").
- NEU `docs/GAME_CHECK.md` + `docs/ASSET_CHECK.md` + `docs/WINDOWS_QA.md`:
  je Command: Zweck, Ablaufphasen, alle Flags, Report-Anatomie, CI-Rezept,
  Troubleshooting (Muster: `docs/AUDIO_CHECK.md`).
- `docs/CUE_PROBE.md` (aus WP-CORE-4) mit Unity/Unreal-Integrationsanleitungen.
- assetpilot.md-Querverweise aktualisieren (CUE-AGENT-Abschnitt).

**Akzeptanzkriterien:** jeder neue Command hat sein Doc; README-Beispiele
sind copy-paste-lauffähig (im Review nachvollzogen). **Aufwand:** M,
verteilt (jedes Phasen-WP liefert seinen Doc-Teil, dieses WP schneidet das
Gesamtbild). **Abhängigkeiten:** fortlaufend.

---

## WP-Q6 — Meilenstein-Schnitt & Versionierung

**Ziel:** Nachvollziehbare Releases mit klaren Beweis-Demos.

| Meilenstein | Inhalt | Version | Beweis-Demo (muss im Release-Text stehen) |
|---|---|---|---|
| **M6 „Fundament"** | WP-Q1, WP-CORE-1..3, WP-Q2 | v1.4.0 | playable/temporal via `--platform web` unverändert; Mock-Treiber-Tests |
| **M7 „Android Best-in-Class"** | WP-A1..A5, A7..A9 | v1.5.0 | Pre-Launch-artiger Report einer Demo-APK (Perf+Coverage+a11y+Forensik) |
| **M8 „Windows lebt"** | WP-B1..B5, B7, B8 | v1.6.0 | windows-qa gegen Notepad + Crash-Fixture auf windows-latest (CI-Link) |
| **M9 „Spielbar bewiesen"** | WP-C1..C4, WP-A6, WP-C8, WP-CORE-4 | v1.7.0 | game-check-Verdikte: gesund/eingefroren/crashend (drei PLAYABLE-PROOFs) |
| **M10 „Engines & Assets"** | WP-C5..C7, C9, WP-B6, WP-Q3..Q5 final | v1.8.0 | Unity-Probe-Build + asset-check einer defekten .blend; release-check für einen Build |

Regeln: SemVer minor je Meilenstein; CHANGELOG-Abschnitt je Release; kein
Meilenstein gilt ohne seine Beweis-Demo (Dogfooding-Tradition des Repos —
vgl. `demo/cue-agent-promo.mp4`).

---

## Risiko-Register (planweit, bei jedem WP-Start prüfen)

| # | Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|---|
| R1 | GPU-/Fullscreen-Capture liefert schwarze Frames (Windows-Spiele) | hoch | Fensterargumente je Engine erzwingen; Doppel-Capture (PrintWindow + CopyFromScreen) mit Blank-Erkennung; CUE-PROBE-`/cue/screenshot` als Ausweg dokumentieren |
| R2 | PNG-Eigen-Decoder (WP-CORE-2) mit exotischen PNGs überfordert | mittel | Nur die selbst erzeugten Formate unterstützen (screencap/GDI+/Playwright = 8-bit RGB(A), non-interlaced); alles andere: klare Meldung; Fixture-Tests je Quelle |
| R3 | UIA-Baum bei modernen Apps (Electron/Flutter) dünn | mittel | Ist okay: dann greift der indirekte `bedienbar`-Beleg; Findings-Kategorie `a11y-uia-arm` („App exponiert kaum UIA — auch ein Befund!") |
| R4 | Emulator-CI flaky/langsam | hoch | nightly statt per-PR; Snapshot-Boot; großzügige Retry-Policy NUR für Boot, nie für Asserts |
| R5 | `input text`-/SendInput-Fokusprobleme (Fenster nicht vorn) | mittel | vor jeder Eingabe Foreground erzwingen + verifizieren; sonst Finding statt stiller Fehleingabe |
| R6 | Engine-Logformate ändern sich mit Versionen | sicher | Parser defensiv (nie werfen), `parserNote`-Feld, Fixtures je Major-Version nachpflegen (eigenes kleines Folge-WP je Engine-Release) |
| R7 | Sicherheits-Grauzone: game-check startet beliebige Exes | — | Doku-Warnung („nur eigene/vertraute Builds"), niemals mit erhöhten Rechten, kein Netzwerk-Kill o. Ä.; keine Sandbox versprechen, die es nicht gibt |
| R8 | Scope-Explosion („noch schnell iOS/macOS/Steam Deck…") | hoch | Kapitel 00 §„NICHT" zitieren; neues Ziel = neues Plan-Kapitel via eigenem PR, nie huckepack |
