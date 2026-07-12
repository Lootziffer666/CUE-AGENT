# 03 — Phase A: Android zur Best-in-Class-QA (WP-A1 … WP-A10)

> Ausgangslage (Kapitel 01, §2.2): Install → Launch → Exploration/Flow →
> Crash/ANR → Severity → Report funktioniert. Phase A macht daraus ein
> Werkzeug, das mit kommerziellen Pre-Launch-Reports (Firebase Test Lab /
> Play Console) inhaltlich mithält — aber lokal, key-frei und CI-nativ.

**Ziel-Slogan:** *Eine APK rein, ein belegtes Urteil raus: startet, stabil,
flüssig, sparsam, bedienbar, barrierearm — mit Beweisen und Exit-Code.*

Alle Pakete erweitern `src/android/` und speisen weiterhin
`src/qa/severity.js` + `src/qa/report.js`. Kein Appium, kein Gradle-Zwang —
nur `adb` (+ optional `aapt2`, `avdmanager`/`emulator` für WP-A10).

---

## WP-A1 — Performance-Signale: Startzeit, Jank, Speicher

**Ziel:** `android-qa` misst key-frei: Kaltstart-Zeit (TTID), Frame-/Jank-Quote,
Speicher-Peak; Befunde fließen in Score/Severity und in den Report.

**Warum:** „Läuft ohne Crash" ist die halbe Wahrheit. Ein Spiel/eine App, die
ruckelt oder 1,5 GB RSS zieht, ist nicht releasefähig. Diese Signale sind mit
adb allein messbar — das ist der günstigste große Qualitätssprung.

**Berührte Dateien:** `src/android/adb.js` (neue Primitive),
NEU `src/android/perf.js` (reine Parser!), `src/android/index.js` (Messpunkte),
`test/android-perf.test.js` (Fixtures).

**Design:**
- **Kaltstart:** `adb shell am force-stop <pkg>` → `adb shell am start -W -n
  <pkg>/<launcherActivity>` → Ausgabe parsen (`ThisTime`/`TotalTime`/`WaitTime`).
  Launcher-Activity via `cmd package resolve-activity --brief -c
  android.intent.category.LAUNCHER <pkg>` ermitteln (neue Primitive
  `resolveLauncherActivity`). 3 Messungen, Median.
- **Jank:** `adb shell dumpsys gfxinfo <pkg> framestats` nach einer
  Interaktionsphase; Parser extrahiert Frame-Zeiten → `{frames, jankyPct,
  p50, p90, p99}` (Frame > 16,67 ms = janky; > 700 ms = frozen). Bei Geräten
  ohne framestats: Fallback auf die aggregierte `dumpsys gfxinfo`-Tabelle
  (`Janky frames: N (x%)`).
- **Speicher:** `adb shell dumpsys meminfo <pkg>` vor/nach Exploration →
  `{totalPssKb, javaHeapKb, nativeHeapKb, graphicsKb}`; Peak = Max über
  Messpunkte (nach jedem 2. Explorationsschritt messen — dumpsys ist teuer).
- **Parser als reine Funktionen** in `perf.js`
  (`parseAmStartW(text)`, `parseFramestats(text)`, `parseMeminfo(text)`) —
  exakt das `frame-metrics.js`-Muster; Fixtures = echte dumpsys-Ausgaben von
  API 30/33/35 unter `test/fixtures/android/`.
- **Bewertung (Defaults, via `cue.config.json qa.android.perf` überschreibbar):**
  Kaltstart > 5 s → `medium`-Finding; Jank > 25 % → `medium`, > 50 % → `high`;
  PSS-Peak > 1 GB → `medium`. Alle Werte landen als `signals.perf.*` im
  Detail-JSON und (nach WP-CORE-3) in `verdict.json`.

**Schritte:** Primitive → Parser+Tests → Messpunkte in `runAndroidQa`
(Kaltstart vor der Exploration, meminfo periodisch, framestats danach) →
Report-Abschnitt „Performance" im Markdown → Severity-Bump-Regeln.

**Akzeptanzkriterien:**
- [ ] Gegen einen Emulator liefert `cue android-qa --package <id> --json` ein
      `signals.perf`-Objekt mit `coldStartMs`, `jank`, `memory`.
- [ ] Alle drei Parser haben Fixture-Tests inkl. „Ausgabeformat unbekannt →
      null statt Wurf".
- [ ] Perf-Ausfall (z. B. dumpsys-Timeout) degradiert zu Warnung, bricht den
      Lauf NICHT ab.

**Nicht-Ziele:** kein Batterie-/Netzprofiling (späteres WP), kein systrace/
perfetto. **Aufwand:** M. **Abhängigkeiten:** keine.

---

## WP-A2 — Explorations-Gehirn: Coverage-Modell, Screen-Dedup, System-Dialoge

**Ziel:** Die Explorations-Schleife bekommt Gedächtnis und Robustheit:
Activity-/Screen-Coverage-Karte, Erkennung schon gesehener Screens,
automatisches Wegräumen von System-Dialogen (Permissions, ANR-Dialog),
Scroll-Exploration.

**Warum:** Heute tippt die Heuristik „jedes klickbare Element einmal"
(`src/android/index.js:196`) und merkt sich nur Koordinaten. Sie verliert sich
in Schleifen, übersieht Screens unterhalb des Folds und bleibt an
Permission-Prompts hängen (Lücke L-A2/L-A9).

**Design:**
- **Screen-Identität:** Hash aus `currentActivity()` + normalisiertem UI-Dump
  (Texte raus, Struktur/IDs rein) → `screenId`. NEU `src/android/explore.js`
  mit reiner Funktion `screenSignature(xml, activity)`.
- **Coverage-Modell:** `{screens: Map<screenId, {activity, firstSeenStep,
  elementsTotal, elementsTried}>, edges: [{from, to, action}]}` — am Ende als
  `coverage`-Abschnitt im Detail-JSON + Mermaid-Graph im Markdown-Report
  (Screens = Knoten, Aktionen = Kanten). Das ist das Alleinstellungs-Artefakt:
  *„CUE hat 9 Screens gesehen, 3 nicht erreicht, hier ist die Karte."*
- **Nächste-Aktion-Strategie (heuristisch, LLM bleibt optionaler Übersteuerer):**
  1. unbesuchtes Element auf aktuellem Screen (per `resource-id`+Text
     identifiziert, nicht Koordinate), 2. scrollen wenn scrollbar
  (`scrollable="true"` im Dump — Attribut in `parseAllNodes` ergänzen),
  3. `back` wenn ausgeschöpft, 4. Stop wenn Wurzel-Screen ausgeschöpft.
- **System-Dialog-Wächter** (vor JEDEM Schritt): fremdes Foreground-Package
  `com.google.android.permissioncontroller`/`android` → Permission-Dialog:
  konfigurierbar `allow|deny` (Default allow via Button-Text „Zulassen/Allow/
  While using"); ANR-Dialog („reagiert nicht") → als ANR-Finding werten,
  „Warten" tippen; sonst `back`. Reine Erkennungsfunktion
  `classifySystemDialog(xml, fgPkg)` + Tests mit Dump-Fixtures.

**Akzeptanzkriterien:**
- [ ] Explorations-Detail-JSON enthält `coverage` (Screens, Kanten, tried/total).
- [ ] Ein Testlauf gegen eine Demo-App mit 3 Activities besucht alle 3 (Beleg im PR).
- [ ] Permission-Dialog blockiert die Exploration nicht mehr (Beleg: App mit
      Kamera-Permission-Prompt).
- [ ] `screenSignature` + `classifySystemDialog` fixture-getestet.

**Nicht-Ziele:** kein vollständiger Model-based-Testing-Ansatz, keine
Zustands-Wiederherstellung. **Aufwand:** L. **Abhängigkeiten:** keine (Synergie
mit WP-A1-Messpunkten).

---

## WP-A3 — Geräte-Matrix & Multi-Device

**Ziel:** `--serial <id>` überall; `--devices all|<s1,s2>` führt denselben Lauf
auf mehreren verbundenen Geräten/Emulatoren aus und schreibt einen
Matrix-Report (je Gerät ein Detail-JSON + eine Vergleichstabelle).

**Design:** `runAndroidQa` bekommt `serial` als Parameter (heute hart
`devices[0]`, `index.js:51`); neuer dünner Orchestrator `runAndroidQaMatrix`
(sequenziell — adb-Parallelität ist fehleranfällig und Emulator-CPU knapp);
Matrix-Markdown: Zeilen = Checks/Signale, Spalten = Geräte (API-Level via
`getprop ro.build.version.sdk`, neue Primitive `deviceInfo(serial)`).

**Akzeptanzkriterien:** zwei Emulatoren → ein Matrix-Report; Exit-Code =
schlechtestes Einzelergebnis. **Aufwand:** S–M. **Abhängigkeiten:** keine.

---

## WP-A4 — Konfigurations-Matrix: Locale, Dark Mode, Schriftgröße, Display

**Ziel:** `--matrix locale=de,en dark=on,off fontScale=1.0,1.3` fährt den
Lauf (oder einen Flow) je Kombination und meldet konfigurationsspezifische
Befunde (abgeschnittene Texte, unlesbare Kontraste via Screenshot-Vergleich,
Crashes nur in einer Locale).

**Design:** Primitive in `adb.js`: `setLocale` (`setprop persist.sys.locale` +
App-Neustart bzw. `am set-locales` ab API 33), `setDarkMode`
(`cmd uimode night yes|no`), `setFontScale` (`settings put system font_scale`),
`setDensity` (`wm density`). Wichtig: **Zustand nach dem Lauf zurücksetzen**
(try/finally, Ausgangswerte vorher lesen). Kombinationen als Kreuzprodukt,
Cap bei 8 mit Warnung. Befund-Heuristik key-frei: UI-Dump-Vergleich zwischen
Basis- und Variante (fehlende Elemente, Text `…`-Ellipsen bei fontScale),
Crash/ANR je Variante.

**Akzeptanzkriterien:** Lauf mit 2×2-Matrix erzeugt 4 Detail-JSONs + Vergleich;
Gerät ist danach im Ausgangszustand (`getprop`/`settings get` Beleg).
**Aufwand:** M. **Abhängigkeiten:** WP-A3 (Serial-Durchreichung).

---

## WP-A5 — Crash-Forensik: Tombstones, ANR-Traces, Bugreport-Auszug

**Ziel:** Bei Crash/ANR sammelt CUE-AGENT automatisch die Tiefen-Artefakte:
Java-Stacktrace vollständig (nicht nur 40 Logcat-Zeilen), Native-Tombstone,
ANR-Trace, und legt sie als Evidence in den Report-Ordner.

**Design:** Neue Primitive: `pullAnrTraces(serial)` (`/data/anr/` via
`adb shell su -c` NUR wenn root/Emulator, sonst `adb bugreport`-Fallback),
`logcatCrashBuffer(serial)` (`logcat -d -b crash`), `dropbox(serial)`
(`dumpsys dropbox --print data_app_crash data_app_anr`). Reihenfolge:
crash-Buffer (immer verfügbar) → DropBox (meist verfügbar) → bugreport
(langsam, nur mit `--deep-forensics`-Flag). Reiner Parser
`extractCrashReport(text)` → `{exception, stack[], firstAppFrame}` mit
Fixture-Tests; `firstAppFrame` (erste Zeile mit dem App-Package) wird zum
Finding-`location` — das macht den Report für den `qa-loop`-Fixer nutzbar.

**Akzeptanzkriterien:** absichtlich crashende Test-APK → Report enthält
vollständigen Stacktrace + `firstAppFrame`; ohne Crash entstehen keine
Zusatzkosten (kein bugreport). **Aufwand:** M. **Abhängigkeiten:** keine.

---

## WP-A6 — `playable-check`/`temporal-check` auf dem Gerät (Spiele & Apps)

**Ziel:** Die key-freien Verdikte laufen gegen Android nativ:
`cue playable-check --platform android --package <id>` und
`cue temporal-check --platform android --package <id>` — inklusive
Frame-Sequenz-Analyse über `adb screenrecord` bzw. Screenshot-Sampling.

**Warum:** Das ist der Android-Teil des Spielbarkeits-Versprechens (Phase C
liefert Desktop). APK-Spiele aus Unity/Godot/Unreal werden damit bewertbar.

**Design:**
- Frames: Default Screenshot-Sampling via `screencapPng` (~2 fps, reicht für
  `analyzeSequence`-Idle/State); `--video`-Modus: `adb shell screenrecord
  --time-limit N /sdcard/cue.mp4` → pull → ffmpeg (ist bereits
  Systemvoraussetzung der Video-Pipeline) → Frames → PNG-Decoder (WP-CORE-2).
- Interaktion für `reagiert`: erster Klickbarer aus UI-Dump; bei Spielen ohne
  UI-Baum (SurfaceView/Unity: Dump liefert kaum Knoten): Tap auf
  Bildschirmmitte + Swipe, Reaktion rein über Frame-Diff (Regel aus WP-CORE-2:
  `bedienbar (indirekt belegt)`).
- `fehlerfrei`: `logcatToConsole` + `detectCrashes`; `startet`: Foreground-Check
  + Nicht-Blank (`pixelStdDev`).
- Probe-Erkennung (WP-CORE-4): TCP zu `localhost:7477` via
  `adb forward tcp:7477 tcp:7477` — damit funktioniert die CUE-PROBE auch
  on-device (Unity-APK mit Probe-Package aus WP-C5!).

**Akzeptanzkriterien:**
- [ ] Ein APK-Spiel (Fixture: einfache Unity- oder Godot-Demo-APK, siehe WP-Q1)
      erhält ein `PLAYABLE-PROOF.md` mit Frame-Evidence.
- [ ] Eine absichtlich eingefrorene App (Fixture-App mit blockiertem Main-Thread)
      wird `NICHT BELEGT` (reagiert=false oder ANR).
- [ ] `temporal-check --platform android` erkennt eine statische Splash-Hänger-App
      als `temporal-static`.

**Aufwand:** L. **Abhängigkeiten:** WP-CORE-1, WP-CORE-2 (zwingend).

---

## WP-A7 — Robuste Texteingabe & Eingabe-Vervollständigung

**Ziel:** Unicode-sichere Texteingabe und fehlende Eingabetypen (long-press,
Key-Events, Multi-Touch-Pinch) für Flows und Exploration.

**Design:** `inputText` ersetzt `input text` durch Zeichen-sichere Strategie:
ASCII → `input text` (escaped: `%s`, Shell-Metazeichen); Nicht-ASCII →
Fallback-Kette: (1) `input keyboard text` (ab API 33 unicode-fähig),
(2) Zwischenablage-Weg `cmd clipboard set-text` + `input keyevent 279`
(PASTE), (3) klare Warnung im Report. `longPress(x,y)` = `input swipe x y x y
600`. `keyevent(code)` generisch exportieren. Flow-Schema (`src/android/flow.js`)
um `longpress`/`key` erweitern (dokumentieren in `docs/`).

**Akzeptanzkriterien:** Flow-Fixture tippt „Grüße 😀" in ein EditText und
verifiziert per UI-Dump; Tests für die Escaping-Funktion (rein).
**Aufwand:** S. **Abhängigkeiten:** keine.

---

## WP-A8 — APK-Preflight (statische Prüfung vor Installation)

**Ziel:** `cue android-qa app.apk` prüft VOR der Installation: Paket lesbar,
minSdk/targetSdk vs. Gerät, `debuggable`-Flag (Warnung für Release),
gefährliche Permissions (Liste + Severity `low`), APK-Größe, ABI-Abdeckung
(arm64-v8a vorhanden?), fehlende Launcher-Activity (→ harter Fehler mit
klarer Meldung statt Launch-Timeout).

**Design:** NEU `src/android/preflight.js`: bevorzugt `aapt2 dump badging`
(Parser rein, Fixtures!), Fallback: minimaler ZIP-Central-Directory-Reader
(Node zlib) nur für Datei-Liste/ABIs — `AndroidManifest.xml` binär-Parsing NUR
für `package`/`minSdk` (AXML-Header, ~120 Zeilen, testbar) oder bewusst
auslassen mit Meldung „aapt2 nicht gefunden → Preflight eingeschränkt".
Ergebnisse als `preflight`-Abschnitt in Report + Detail-JSON; `debuggable` bei
`release-check` → `medium`.

**Akzeptanzkriterien:** Fixture-APK → korrektes Preflight-JSON; APK mit
minSdk > Gerät-API bricht mit verständlicher Meldung ab (Exit 2, keine
Installation versucht). **Aufwand:** M. **Abhängigkeiten:** keine.

---

## WP-A9 — Accessibility-Befunde aus dem UI-Dump (key-frei)

**Ziel:** Deterministische a11y-Checks je besuchtem Screen: klickbare Elemente
ohne `content-desc`/Text, Touch-Targets < 48×48 dp (Bounds ÷ Dichte),
EditTexte ohne Hint/Label, doppelte content-desc. Findings-Kategorie `a11y`,
Severity `low`/`medium`, zählen in den Score.

**Design:** `parseAllNodes` um `contentDesc`, `clickable`, `enabled`,
`className` erweitern (Attribute stehen bereits im Dump); reine Funktion
`assessA11y(nodes, densityDpi)` in NEU `src/android/a11y.js`; Dichte via
`wm density`. Pro Screen max. 10 Findings (Deduplizieren nach resource-id).
Das spiegelt die Web-Seite (`capture.js` sammelt dort den a11y-Baum) — gleiche
Kategorie-Namen verwenden.

**Akzeptanzkriterien:** Fixture-Dump mit bekannten Verstößen → erwartete
Findings; Lauf gegen Demo-App zeigt a11y-Abschnitt im Report.
**Aufwand:** S–M. **Abhängigkeiten:** keine (Synergie mit WP-A2-Coverage: „je
Screen einmal prüfen").

---

## WP-A10 — Emulator-Lebenszyklus & `doctor`-Integration & CI

**Ziel:** (1) `cue doctor` prüft Android-Fähigkeit (adb? Gerät? aapt2? API-Level).
(2) NEU `cue android-emulator --start [--avd name] [--headless]` /
`--stop` als dünne Hülle über `emulator`/`avdmanager` für lokale Läufe.
(3) CI-Workflow-Beispiel `.github/workflows/cue-android-qa.example.yml` mit
`reactivecircus/android-emulator-runner`, das eine Beispiel-APK durch
`android-qa` + `playable-check --platform android` schickt.

**Design:** Emulator-Start: vorhandene AVDs listen (`emulator -list-avds`),
Boot-Wartezeit über `adb wait-for-device shell getprop sys.boot_completed`;
alles optional — fehlt das SDK, klare Meldung. Doctor-Checks additiv in
`src/doctor/index.js` (Muster der bestehenden Checks übernehmen).

**Akzeptanzkriterien:** CI-Beispiel-Workflow läuft grün im Repo (workflow_dispatch);
`doctor` zeigt Android-Zeile auf Systemen ohne SDK als „nicht verfügbar
(optional)". **Aufwand:** M. **Abhängigkeiten:** WP-A6 für den vollen
CI-Beweis (Playability-Teil darf sonst entfallen).

---

## Phase-A-Erfolgsbild (Definition of Done der Phase)

Ein einziger Befehl gegen eine unbekannte APK:

```bash
cue android-qa app.apk --steps 20 --json
```

liefert: Preflight (WP-A8) → Kaltstart/Jank/Speicher (WP-A1) → Coverage-Karte
mit 100 % angefasster Screens oder Begründung (WP-A2) → a11y-Befunde (WP-A9) →
bei Crash volle Forensik (WP-A5) → Severity/Score/Exit-Code — und
`cue playable-check --platform android` gibt für Spiele das
Spielbarkeits-Verdikt (WP-A6). Alles ohne einen einzigen API-Key.
