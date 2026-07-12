# 05 — Phase C: Unity-, Unreal- & Blender-Builds als „spielbar oder nicht" bewerten (WP-C1 … WP-C9)

> Das Versprechen aus assetpilot.md — *„CUE-AGENT sagt nicht: Das ist gut.
> Sondern: Das ist belegbar spielbar."* — gilt heute nur für Web-Builds.
> Phase C dehnt es auf native Builds aus: Unity- und Unreal-Ausspielungen
> (Windows-Exe, Android-APK), generische Engine-Builds (Godot, UPBGE) und
> Blender-Artefakte. Kern-Command: **`cue game-check <build>`**.

## Begriffsklärung „Blender-Build" (wichtig, weil mehrdeutig)

Blender ist seit 2.8 **keine Game-Engine** mehr (BGE entfernt). „Blender-Builds
bewerten" heißt in diesem Plan dreierlei, und alle drei werden abgedeckt:

1. **`.blend`-Dateien / -Assets**: Öffnet die Datei? Sind alle Texturen/
   Libraries vorhanden? Rendert ein Frame? Lebt die Animation?
   → **`cue asset-check`** (WP-C7), headless über das `blender`-Binary.
2. **UPBGE-/Godot-/sonstige Runtime-Exports** aus dem Blender-Umfeld: normale
   ausführbare Builds → generischer Pfad von **`cue game-check`** (WP-C2).
3. **Gerenderte Ausspielungen (MP4/Bildsequenzen)** aus Blender: zeitliche
   Konsistenz → `temporal-check`-Metriken auf Video-Frames (WP-C7, Teil 2).

## Verdikt-Modell für Spiele (gilt für alle Engines)

`game-check` erweitert die 5er-Checkliste von `evaluatePlayability`
(`src/qa/frame-metrics.js:170`) um zwei spiel-spezifische Checks — als
**additive** Funktion `evaluateGamePlayability(signals)` daneben (die bestehende
Funktion bleibt unangetastet, Regel 07):

| Check | Signalquelle | deterministisch? |
|---|---|---|
| `startet` | Prozess läuft nach N s, Fenster existiert, Frame nicht blank | ja |
| `lebt` | Idle-Frame-Sequenz: `analyzeSequence` ohne Statik-Befund; mit CUE-PROBE zusätzlich `frame`-Zähler monoton, `fps > 0` | ja |
| `reagiert` | sichere Eingaben (Maus-Mitte, Space, WASD/Pfeile) → Frame-Diff > Schwelle ODER Probe-`state`-Änderung | ja |
| `stabil` | Soak: `--soak N` Sekunden (Default 60) ohne Crash/Hang/Exit | ja |
| `fehlerfrei` | Engine-Log-Parser (WP-C3/C4): keine Fatals/Exceptions/fehlende Assets | ja |
| `bedienbar` | uiTree falls vorhanden, sonst „indirekt belegt" via `reagiert` (WP-CORE-2-Regel) | ja |
| `beweise` | ≥ 2 Screenshots + Frame-Strip + Logauszug im Report-Dir | ja |

Verdict: `BELEGBAR SPIELBAR` nur wenn ALLE Checks ok; sonst `NICHT BELEGT`
mit `failed[]`-Liste — identische Semantik wie `playable-check`, gleiche
Reportform (`PLAYABLE-PROOF.md` + `verdict.json`).

---

## WP-C1 — Treiber `gameproc`: nackter Prozess + Fenster-Capture

**Ziel:** Ein Treiber für ausführbare Builds OHNE UI-Baum: Prozess starten,
Fenster finden, Frames liefern, Eingaben senden, Gesundheitszustand melden —
auf Windows über den Sidecar (WP-B1), auf Linux über X11/Wayland-Werkzeuge,
falls vorhanden (optional, sonst klare Meldung).

**Design (NEU `src/drivers/gameproc.js`):**
- **Windows (primär):** delegiert an den WP-B1-Sidecar (launch/screenshot/
  input/health) — `uiTree()` liefert `null`, `capabilities.uiTree=false`.
  Fullscreen-Problematik: Builds standardmäßig mit Fenster-Flags starten —
  der Treiber hängt engine-erkannte Fenster-Argumente an (siehe WP-C3/C4:
  Unity `-screen-fullscreen 0 -screen-width 1280 -screen-height 720`,
  Unreal `-windowed -ResX=1280 -ResY=720`); generisch: keine Args, aber
  `CopyFromScreen`-Fallback (WP-B1 kann beides).
- **Linux (sekundär, best effort):** `xvfb-run`-Hinweis in der Doku; Capture
  via `xwd`/`import`, falls installiert; Input via `xdotool`, falls installiert.
  Fehlt das Werkzeug: Fähigkeit deaktiviert + Meldung. (Kein Muss für die
  Phase-C-Akzeptanz — CI-Beweis läuft auf Windows.)
- `logs()` liest die von WP-C3/C4 registrierte Engine-Logdatei inkrementell
  (tail) und mappt Parser-Findings auf `{type:"error"|"warning"}`.
- `meta()` = `{windowTitle, pid, engine}`.

**Akzeptanzkriterien:** Vertrags-Testsuite (WP-CORE-1) besteht mit gemocktem
Sidecar; auf `windows-latest`: ein WebGL-freies Mini-„Spiel" als Fixture
(einfachste Variante: ein selbst gebautes Fixture-Fenster, siehe WP-Q1) wird
gestartet, geframed, per Space beeinflusst, gestoppt.
**Aufwand:** M. **Abhängigkeiten:** WP-CORE-1, WP-B1.

---

## WP-C2 — `cue game-check <build>`: der Playability-Runner für Desktop-Builds

**Ziel:** Der zentrale neue Command:

```bash
cue game-check ./Build/MeinSpiel.exe                       # Engine-Autodetect
cue game-check ./Build --engine unity --soak 90 --json
cue game-check ./Spiel.exe --probe                          # erwartet CUE-PROBE
cue game-check ./Spiel.exe --input-profile platformer      # Eingabe-Sets
```

**Design (NEU `src/qa/game-check.js`):**
- **Engine-Autodetect** (reine Funktion `detectEngine(dirOrExe)` in NEU
  `src/game/detect.js`, fixture-getestet):
  - Unity: `UnityPlayer.dll` neben der Exe, `<Name>_Data/`-Ordner,
    `globalgamemanagers`/`data.unity3d`.
  - Unreal: `Engine/`- + `<Projekt>/`-Ordnerpaar, `*.pak` unter
    `Content/Paks/`, Exe-Muster `<Projekt>(-Win64-Shipping).exe`.
  - Godot: `*.pck` neben Exe oder eingebettet (Exe-Tail-Magic `GDPC`).
  - sonst: `generic`.
- **Ablaufphasen** (jede Phase = Checks + Evidence):
  1. *Preflight*: Build-Verzeichnis plausibel (Engine-Detect-Ergebnis,
     fehlende Pflichtdateien wie `UnityPlayer.dll` → sofort `NICHT BELEGT`
     mit präziser Begründung — das fängt kaputte/unvollständige Builds ab,
     BEVOR ein Prozess startet).
  2. *Start*: launch via gameproc mit Engine-Fensterargs + Log-Argumenten
     (Unity: `-logFile <reportDir>/unity-player.log`; Unreal:
     `-AbsLog=<reportDir>/unreal.log -log`); warten bis Fenster + erster
     nicht-blanker Frame (Timeout `--start-timeout`, Default 60 s — Shader-
     Kompilierung!).
  3. *Idle-Beobachtung*: 10 s Frames sammeln (~2 fps) → `analyzeSequence`
     (`lebt`, Flacker-Erkennung).
  4. *Eingabe-Sonde*: Eingabe-Profile (NEU `src/game/input-profiles.js`):
     `default` = [Maus-Mitte-Klick, Space, Pfeil/WASD-Tipper je 300 ms],
     `menuonly` = [Enter, Pfeile], `platformer`, `shooter` (Maus-Bewegung +
     Klick). Nach jeder Eingabe Frame-Diff messen; Probe-`state`-Diff falls
     CUE-PROBE. **Guardrail:** niemals Alt+F4, niemals Esc als ERSTE Eingabe
     (Esc öffnet oft Quit-Menüs — Esc nur am Ende, um Menüs zu schließen).
  5. *Soak*: `--soak` Sekunden idle + zyklische Sanft-Eingaben; health-Polling
     (Crash/Hang/Exit); Speicher via Sidecar (`Get-Process WorkingSet64`) →
     Leck-Heuristik (monotoner Anstieg > X %/min = `low`-Finding).
  6. *Log-Urteil*: Engine-Parser (WP-C3/C4) über die Logdatei.
  7. *Verdict + Report*: `evaluateGamePlayability`, `PLAYABLE-PROOF.md`,
     `verdict.json`, Frame-Strip (`frames/*.png`), Exit-Code.
- **Score:** aus Severity-Mapping der Findings über die bestehende
  `assess`-Mechanik (Findings → consoleLogs-Form), damit `--fail-on`
  konsistent funktioniert.

**Akzeptanzkriterien:**
- [ ] Fixture „gesundes Spiel" (WP-Q1) → `BELEGBAR SPIELBAR`, alle Checks ok.
- [ ] Fixture „friert nach 5 s ein" → `NICHT BELEGT` (`stabil` oder `lebt` fail)
      mit Frame-Beweis der eingefrorenen Sequenz.
- [ ] Fixture „startet nicht (Exit 1)" → `NICHT BELEGT` (`startet` fail) +
      stderr im Report.
- [ ] Unvollständiger Unity-Build (Data-Ordner entfernt) → Preflight-Fail mit
      Meldung „<Name>_Data fehlt".
- [ ] `--json` liefert Schema-v1-Verdict.

**Aufwand:** L–XL (Kern der Phase). **Abhängigkeiten:** WP-C1, WP-CORE-2,
WP-CORE-3; WP-C3/C4 für `fehlerfrei` (kann mit generischem Parser starten).

---

## WP-C3 — Unity-Log-Parser & Unity-Spezifika

**Ziel:** Reiner Parser `parseUnityLog(text)` (NEU `src/game/unity.js`) +
Unity-Startlogik: erkennt aus dem Player-Log, was ein Mensch beim QA-Blick
erkennen würde.

**Erkennungsregeln (jede Regel = Finding mit Kategorie/Severity/Evidence-Zeile):**
- Crash/Fatal: `Crash!!!`, Signal-/`Fatal Error`-Blöcke, `Aborting` → `high`.
- Exceptions: Zeilen mit `Exception:`/Stacktraces (`at Namespace.Klasse…`),
  Dedupliziert nach Exception-Typ + oberster Frame; `NullReferenceException`
  im Spiel-Code → `high`, sonstige → `medium`.
- Fehlende Assets/Shader: `Shader ... not found`/`not supported`,
  `Missing script`, `The referenced script ... is missing`, magenta-Warnungen →
  `medium` (Kategorie `asset-missing` — für ANVIL/Asset-Pilot das wichtigste
  Signal!).
- GPU/Init: `Failed to initialize`, `d3d11`-Fehlerblöcke → `high`.
- Versions-/Kontextzeilen (Unity-Version, Grafik-API) → `environment`-Metadaten.
- Player.log-Fallback-Pfade kennen: `%USERPROFILE%\AppData\LocalLow\<Company>\
  <Product>\Player.log` (wenn `-logFile` nicht griff).
- Crash-Ordner: `%LOCALAPPDATA%\Unity\Crashes` bzw. `<exe>\..\Crashes` nach
  Lauf prüfen → `error.log`/Dump als Evidence kopieren.

**Akzeptanzkriterien:** ≥ 12 Fixture-Logs (gesund, NRE, Shader fehlt, Crash,
D3D-Init-Fail, Mono vs. IL2CPP-Format) → erwartete Findings; Parser wirft nie,
unbekanntes Format → leeres Ergebnis + `parserNote`. **Aufwand:** M.
**Abhängigkeiten:** keine (SOFORT startbar, reine Funktion).

---

## WP-C4 — Unreal-Log-Parser & Unreal-Spezifika

**Ziel:** `parseUnrealLog(text)` (NEU `src/game/unreal.js`) + Startlogik.

**Erkennungsregeln:**
- `=== Critical error: ===`/`Fatal error`-Blöcke, `Assertion failed`,
  `check(...)`/`ensure(...)`-Meldungen mit Callstack → `high` (ensure ohne
  Abbruch → `medium`).
- `LogWindows: Error`, `LogD3D11RHI`/`LogD3D12RHI`-`Error`-Zeilen,
  `GPU Crash`/Device-Removed → `high`.
- Fehlende Inhalte: `LogUObjectGlobals: Warning: Failed to find object`,
  `LogPakFile`-Mount-Fehler, `LogLinker: Warning: Can't find file` →
  `medium`, Kategorie `asset-missing`.
- Map-/Startup-Signale: `LogLoad: Took ... seconds to LoadMap` →
  `signals.loadMapSeconds` (Startzeit-Metrik!); `Game Engine Initialized` als
  „Engine bereit"-Marker.
- Crash-Ordner `Saved/Crashes/` + `Saved/Logs/` einsammeln (Evidence).
- Startargumente: `-windowed -ResX=1280 -ResY=720 -NoSplash -log
  -AbsLog=<reportDir>/unreal.log`; optional `-ExecCmds="stat fps"` NUR mit
  `--probe`-freiem Metrik-Wunsch (Ausgabe landet im Log → `signals.fps` grob).

**Akzeptanzkriterien:** ≥ 10 Fixture-Logs (gesund, Fatal, ensure, Pak-Fehler,
Device-Removed, LoadMap-Zeiten) → erwartete Findings/Signale; nie werfen.
**Aufwand:** M. **Abhängigkeiten:** keine (SOFORT startbar).

---

## WP-C5 — CUE-PROBE-Referenz für Unity (UPM-Paket)

**Ziel:** Ein minimales, MIT-lizenziertes Unity-Paket
(NEU `integrations/unity/com.cue.probe/` im Repo), das der Spiel-Entwickler
(oder WIZARD/ANVIL automatisch) in den Build nimmt: ein MonoBehaviour +
`HttpListener` auf `127.0.0.1:7477`, implementiert den Pflichtteil des
CUE-PROBE-Vertrags (WP-CORE-4): `/cue/ready`, `/cue/state` (Szene, FPS aus
geglättetem `Time.deltaTime`, `Time.frameCount`), optional `/cue/params`
(Broadcast an registrierte Handler), `/cue/screenshot`
(`ScreenCapture.CaptureScreenshotAsTexture`), `/cue/events` (Ring-Puffer,
`CueProbe.Emit("CUE_FIRED", data)` als öffentliche API — deckt den
audio-check-Vertrag ab).

**Design-Regeln:** eine einzige C#-Datei + `package.json` (UPM) + README;
nur in Development-Builds aktiv (`Debug.isDebugBuild`-Default, per Define
`CUE_PROBE_FORCE` erzwingbar); niemals auf 0.0.0.0 binden.

**Akzeptanzkriterien:** Beispiel-Szene im README; ein gebautes Fixture-APK/Exe
mit Probe (kann als Release-Asset gepinnt werden, WP-Q1) beantwortet
`GET /cue/ready`; `game-check --probe` nutzt `frame`-Monotonie als
`lebt`-Beleg; `temporal-check` fährt eine `setParams`-Rampe.
**Aufwand:** M (plus Build-Beschaffung). **Abhängigkeiten:** WP-CORE-4.

---

## WP-C6 — CUE-PROBE-Referenz für Unreal (Plugin)

**Ziel:** Analoges Unreal-Plugin (NEU `integrations/unreal/CueProbe/`):
C++-Modul mit `FHttpServerModule` (Loopback :7477), `/cue/ready`,
`/cue/state` (Weltname, FPS via `FApp::GetDeltaTime`-Glättung, GFrameCounter),
optional `/cue/params` → Blueprint-Event `OnCueParams`, `/cue/events` mit
Blueprint-Funktion `CueEmit`.

**Design-Regeln:** ein Plugin-Ordner, keine Fremdabhängigkeiten, kompiliert
gegen UE 5.x; nur `!UE_BUILD_SHIPPING`-Default (Override per ini).

**Akzeptanzkriterien:** Plugin kompiliert in einem leeren UE-Projekt
(dokumentierter manueller Beleg im PR reicht — CI-UE-Builds sind zu schwer);
Vertrags-Konformität gegen `test/fixtures/probe-stub.js`-Erwartungen
(gleiche JSON-Formen). **Aufwand:** M–L. **Abhängigkeiten:** WP-CORE-4.

---

## WP-C7 — Blender: `cue asset-check` (Dateien) + Render-Konsistenz

**Ziel Teil 1 — `.blend`-Verdikt:**

```bash
cue asset-check scene.blend                # → ASSET-PROOF.md + verdict.json
cue asset-check scene.blend --render --animation-frames 24
```

**Design (NEU `src/blender/index.js` + `src/blender/probe_blend.py`):**
- CUE startet `blender --background --factory-startup <file> --python
  probe_blend.py -- --out report.json` (Binary via `BLENDER_PATH` oder PATH;
  fehlt es: klare Meldung, `doctor`-Check in WP-Q4).
- `probe_blend.py` (bewusst EIN File, stdlib+bpy only) sammelt:
  - Datei öffnet ohne Fehler; Blender-Version der Datei vs. Binary.
  - **Vollständigkeit:** fehlende gelinkte Libraries
    (`bpy.data.libraries` mit nicht existentem `filepath`), fehlende
    Bild-Texturen (`bpy.data.images` → `filepath` existiert nicht und kein
    gepacktes `packed_file`), fehlende Fonts/Caches → Kategorie
    `asset-missing`, Severity `high` (Texturen) / `medium` (Fonts).
  - **Integrität:** Objekte/Meshes zählen, Meshes ohne Polygone, Modifier-
    Fehlerzustände, Treiber-/Skript-Warnungen (`text`-Blöcke mit
    `use_module`), unerwartet leere Szene (0 renderbare Objekte → `high`).
  - **Renderbarkeit** (`--render`): 1 Frame in kleine PNG rendern (EEVEE,
    128er-Auflösung, Zeit-Cap) — Fehler/Timeout = `NICHT BELEGT`; das PNG ist
    Evidence und wird auf Blank geprüft (`pixelStdDev`, wie überall).
  - **Animation lebt** (`--animation-frames N`): N Frames im Viewport-Stil
    (OpenGL-Render fällt headless weg → EEVEE-Minirender jedes k-ten Frames)
    → Frames durch `analyzeSequence` (Idle-Statik = „Animation bewegt sich
    nicht", Kategorie `temporal-static`).
- Checkliste des Verdicts: `öffnet · vollständig · integer · rendert ·
  lebt(optional) · beweise` → `BELEGBAR VERWENDBAR` / `NICHT BELEGT`
  (Wortlaut bewusst analog zu „belegbar spielbar").

**Ziel Teil 2 — Render-Ausspielungen prüfen:**
`cue temporal-check --frames-dir out/` bzw. `--video out.mp4` (ffmpeg →
Frames): wendet `analyzeSequence` auf fertige Bildsequenzen an — damit sind
Blender-Renderläufe (und beliebige Video-Ausspielungen) auf Sprünge/Statik/
Flackern prüfbar, ohne Browser. (Kleine Erweiterung von `temporal.js`, nutzt
den PNG-Decoder aus WP-CORE-2.)

**Akzeptanzkriterien:**
- [ ] Fixture-`.blend`s (WP-Q1): gesund / fehlende Textur / leere Szene /
      kaputte Library → erwartete Verdikte; Python-Skript-Ausgabe
      fixture-getestet (JSON-Formen, ohne Blender in Unit-Tests — der
      JSON-Konsument in Node ist die reine, getestete Funktion).
- [ ] CI-Job (ubuntu) mit `blender` aus apt/snap-Cache führt einen echten
      asset-check aus (optional-Job, `continue-on-error: false`, aber mit
      Binary-Cache).
- [ ] `temporal-check --frames-dir` über eine Fixture-Sequenz mit eingebautem
      Sprung findet `temporal-jump`.

**Aufwand:** L. **Abhängigkeiten:** WP-CORE-2 (PNG-Decoder), WP-CORE-3.

---

## WP-C8 — Android-Game-Playability (APK-Builds aus Unity/Unreal/Godot)

**Ziel:** `cue game-check app.apk --platform android`: kombiniert WP-A6
(on-device Frames/Input) mit den Engine-Erkenntnissen: Engine-Detect aus dem
APK (`lib/arm64-v8a/libunity.so` → Unity, `libUnreal.so`/`libUE*.so` → Unreal,
`libgodot_android.so` → Godot; ZIP-Listing reicht, WP-A8-Reader),
Unity-Log via `adb logcat -s Unity` (Parser WP-C3 wird auf den
Logcat-Unity-Kanal angewandt), Soak + Frame-Analyse wie Desktop.

**Akzeptanzkriterien:** Fixture-APK (Unity-Demo) → volles Game-Verdikt im
Emulator-CI-Job (WP-A10-Workflow erweitert). **Aufwand:** M.
**Abhängigkeiten:** WP-A6, WP-C2, WP-C3.

---

## WP-C9 — `release-check` für Builds & ANVIL-Anbindung

**Ziel:** `cue release-check` akzeptiert neben URLs auch Build-Ziele und
aggregiert: game-check-Verdict + asset-check(s) + Perf-Signale →
`RELEASE-READINESS.md` mit READY/NOT-READY für einen **Spiel-Build**. Damit
schließt sich der assetpilot.md-Kreis: WIZARD produziert → CUE beweist →
ANVIL orchestriert weiter. Zusätzlich: `--json`-Ausgaben aller Phase-C-Commands
enthalten `schema: cue.verdict/1`, damit ANVIL-Gates sie maschinell lesen.

**Akzeptanzkriterien:** `cue release-check ./Build --platform windows` gegen
gesundes/krankes Fixture → READY/NOT READY mit Checkliste, die die
Einzel-Verdikte referenziert. **Aufwand:** M. **Abhängigkeiten:** WP-C2;
WP-C7 optional einbezogen.

---

## Phase-C-Erfolgsbild

```bash
# Unity-Windows-Build aus der CI eines Spielprojekts:
cue game-check ./Build/StandaloneWindows64 --soak 120 --fail-on high
# → PLAYABLE-PROOF.md: startet ✓ lebt ✓ reagiert ✓ stabil ✓ fehlerfrei ✗
#   (3× NullReferenceException in PlayerController.Update) → NICHT BELEGT, Exit 1

# Unreal-Build, mit Probe-Plugin:
cue game-check ./WindowsNoEditor --engine unreal --probe

# Blender-Asset aus der Asset-Pilot-Pipeline:
cue asset-check ./assets/tavern.blend --render
# → BELEGBAR VERWENDBAR / NICHT BELEGT (fehlende Texturen namentlich gelistet)
```

Jedes Urteil: deterministisch, key-frei, mit Frame-/Log-Beweisen, Schema-v1-JSON
und CI-Exit-Code.
