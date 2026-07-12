# 04 — Phase B: Windows-Apps als neue Plattform (WP-B1 … WP-B8)

> Windows existiert heute in CUE-AGENT nicht (Kapitel 01, §2.3). Phase B baut
> die Plattform nach exakt dem Android-Bauplan: dünne synchrone Primitive
> (Pendant zu `src/android/adb.js`), ein Orchestrator (Pendant zu
> `src/android/index.js`), dieselbe Severity-/Report-Pipeline, dieselben
> Verdikt-Runner über den Treiber-Vertrag.

## Technologie-Entscheidung (verbindlich, mit Begründung)

**Gewählt: PowerShell-Sidecar mit .NET UI Automation (UIA), JSON-Zeilen über
stdio.** NEU `src/windows/sidecar/cue-win-driver.ps1` + Node-Seite
`src/windows/driver.js`.

| Option | Bewertung |
|---|---|
| **PowerShell + .NET UIA (gewählt)** | Auf jedem Windows ≥ 10 vorinstalliert (PowerShell 5.1 reicht). Kein Install-Schritt, kein Server, keine npm-Native-Dependency — erfüllt die Drei-Dependencies-Regel. UIA3 liefert UI-Baum, Patterns (Invoke/Value), Fokus. `Add-Type` erlaubt P/Invoke (SendInput, PrintWindow, IsHungAppWindow). |
| WinAppDriver (Appium) | Microsoft-seitig quasi eingestellt, erfordert Installation + Developer Mode, HTTP-Server-Betrieb. Nur als OPTIONALER Adapter denkbar, nicht als Fundament. |
| FlaUI (C#-Bibliothek) | Stark, aber erfordert NuGet/Kompilat oder DLL-Beilage → Verteilungs- und Lizenz-Overhead. PowerShell kommt an dieselben UIA-APIs. |
| node-ffi / robotjs | Native npm-Module mit Compile-Schritt — explizit verboten (Kapitel 00, §„NICHT"). |

**Sidecar-Protokoll** (Design-Vorbild: schlicht wie `adb.js`):
- Node startet `powershell.exe -NoProfile -ExecutionPolicy Bypass -File cue-win-driver.ps1`.
- Requests: eine JSON-Zeile `{"id":1,"op":"screenshot","args":{...}}` auf stdin.
- Responses: eine JSON-Zeile `{"id":1,"ok":true,"result":{...}}` auf stdout;
  Binärdaten (PNG) base64 im Result.
- Sidecar ist zustandsarm: hält nur PID/HWND der Ziel-App. Stirbt der Sidecar,
  startet `driver.js` ihn neu (max. 2×, dann Fehler).
- Jede Operation hat einen Timeout auf Node-Seite (Default 15 s; `screenshot` 30 s).

---

## WP-B1 — Windows-Sidecar: Primitive Stufe 1 (Prozess, Fenster, Bild, Eingabe)

**Ziel:** Der Sidecar + `src/windows/driver.js` beherrschen die Grundoperationen,
mit denen ein Playability-Check möglich ist — noch OHNE UI-Baum.

**Operationen (Stufe 1):**

| op | Implementierung im Sidecar | Ergebnis |
|---|---|---|
| `hello` | Version, PS-Version, OS-Build | Handshake/Doctor |
| `launch` | `Start-Process -PassThru` (exe+args+cwd); UWP/MSIX: `Start-Process "shell:AppsFolder\<AppUserModelId>"`; danach Haupt-HWND pollen (`MainWindowHandle`, bis 30 s) | `{pid, hwnd, title}` |
| `windowInfo` | `GetWindowRect`, `IsWindowVisible`, Titel, `IsIconic`, Monitor-DPI | Fenstergeometrie |
| `screenshot` | `PrintWindow(hwnd, PW_RENDERFULLCONTENT)` in Bitmap; Fallback `Graphics.CopyFromScreen` des Fensterrechtecks (für GPU-/Game-Fenster, bei denen PrintWindow schwarz liefert — beide versuchen, nicht-schwarzes Ergebnis bevorzugen via Pixel-StdDev im Sidecar) | PNG base64 |
| `input` | `SendInput` via P/Invoke: `click{x,y}` (Koordinaten fenster-relativ → Screen umrechnen, Fenster zuvor `SetForegroundWindow`), `key{key}` (VK-Codes; benannte Tasten: enter, esc, space, up/down/left/right, w/a/s/d…), `text{string}` (KEYEVENTF_UNICODE), `scroll{dy}` (Wheel) | ok |
| `health` | Prozess lebt (`Get-Process -Id`)? `IsHungAppWindow(hwnd)` („Keine Rückmeldung")? ExitCode falls beendet | `{running, responding, exitCode}` |
| `stop` | `CloseMainWindow()` → 5 s → `Stop-Process -Force` | ok |

**Node-Seite (`driver.js`):** synchronous-feeling API wie `adb.js`
(intern Promise-basiert), Fehlerbilder deutsch und handlungsleitend
(„powershell.exe nicht gefunden — läuft CUE auf Windows? Windows-QA braucht
einen Windows-Host oder -Runner.").

**Akzeptanzkriterien:**
- [ ] Auf `windows-latest` (GitHub Actions): Notepad starten, Screenshot nicht
      blank (`pixelStdDev > 2`), Text tippen, health `responding:true`, stop.
- [ ] PNG aus `screenshot` ist vom PNG-Decoder (WP-CORE-2) dekodierbar.
- [ ] Sidecar-Neustart nach kill funktioniert (Test tötet den PS-Prozess).
- [ ] Auf Linux: `getDriver("windows")` wirft beim `launch` die klare Meldung,
      Modul-Load bricht nichts (Lazy-require-Regel aus WP-CORE-1).

**Tests:** Protokoll-Ebene mit gemocktem Child-Process (Fixtures aus echten
Sidecar-Antworten); echte Läufe als CI-Job auf `windows-latest` (WP-B7).
**Aufwand:** L. **Abhängigkeiten:** WP-CORE-1 (Vertrag).

---

## WP-B2 — Windows-Sidecar Stufe 2: UI-Baum, Fehlerquellen, Crash-Erkennung

**Ziel:** UIA-Baum als `uiTree()`, plus die Windows-Pendants zu Logcat:
Event-Log-Crashes (WER), unbehandelte Fehlerdialoge, stderr der App.

**Design:**
- **`uiTree`:** UIA-Walk (`System.Windows.Automation`, Control-View) unterhalb
  des App-Fensters → `{nodes:[{role: ControlType, name, automationId, bbox,
  clickable: (InvokePattern|TogglePattern verfügbar), enabled, focusable}]}`.
  Tiefe cappen (Default 12), Knoten cappen (Default 800) — UIA-Walks können
  explodieren. Mapping auf dasselbe Knoten-Format wie `parseAllNodes`
  (Android), damit Flow-Resolver und a11y-Checks geteilt werden können.
- **Crash-Erkennung `logs()`/`health()`:**
  1. Event Log: `Get-WinEvent -FilterHashtable @{LogName='Application';
     Id=1000,1001,1002; StartTime=$launchTime}` gefiltert auf Prozessnamen →
     Application Error (1000), WER (1001), Hang (1002).
  2. WER-Reports: `%LOCALAPPDATA%\Microsoft\Windows\WER\ReportArchive\*` neuer
     als Launch, gefiltert auf Exe-Namen → `Report.wer` parsen (reiner Parser
     `parseWerReport(text)` in NEU `src/windows/forensics.js`, Fixtures!).
  3. stderr/stdout der App (bei `Start-Process -RedirectStandardError`) →
     `{type:"error"}`-Logs.
  4. Fehlerdialog-Erkennung: UIA-Scan der Desktop-Ebene nach Fenstern der
     Klasse `#32770` mit Prozess-PID + Texten („funktioniert nicht mehr",
     „has stopped working", Assertion-Dialoge) → als Crash-Signal + Screenshot-
     Evidence + Dialog wegklicken (Schließen-Button).
- **ANR-Pendant:** `IsHungAppWindow` über 5 s gesampelt → `hangSeconds`-Signal;
  ≥ 5 s zusammenhängend = Finding `windows-hang`, Severity `high` (mappt auf
  das ANR-Konzept von Android).

**Akzeptanzkriterien:**
- [ ] Fixture-Programm, das nach 2 s crasht (kleines PS/`node -e`-Skript als
      Exe-Ersatz), erzeugt `crashed:true` + Event-Log- oder WER-Beleg.
- [ ] Fixture-Programm mit `Sleep`-blockiertem UI-Thread wird `responding:false`.
- [ ] `uiTree` gegen Notepad liefert benannte, klickbare Knoten (Menüband).
- [ ] `parseWerReport`-Fixture-Tests grün auf allen OS (reine Funktion!).

**Aufwand:** L. **Abhängigkeiten:** WP-B1.

---

## WP-B3 — Installation & Ziel-Auflösung (exe / MSI / MSIX / Verknüpfung)

**Ziel:** `windows-qa` akzeptiert jedes übliche Auslieferungsformat und findet
selbst heraus, was zu starten ist.

**Design (NEU `src/windows/install.js`):**
- `.exe` → direkt starten (portable) ODER, wenn `--installer`, als Setup
  ausführen: Silent-Heuristik `/S` (NSIS), `/VERYSILENT /NORESTART` (InnoSetup),
  `/quiet` (Burn/MSI-Wrapper) — Erkennungsreihenfolge dokumentieren; nach
  Installation Zielprogramm über `--exe` ODER neuesten Startmenü-Link des
  Install-Zeitfensters auflösen.
- `.msi` → `msiexec /i x.msi /qn /l*v install.log`; Install-Log als Evidence;
  Produkt für Deinstallation merken (`/x {ProductCode}` via
  `Get-CimInstance Win32_Product` NUR mit ProductCode aus dem Log — kein
  Win32_Product-Vollscan, der ist berüchtigt langsam).
- `.msix`/`.appx` → `Add-AppxPackage`; AppUserModelId via
  `Get-AppxPackage | Get-AppxPackageManifest` → Launch über `shell:AppsFolder`.
  Signatur-Fehler klar melden (unsigned MSIX braucht Dev-Mode → Meldung).
- Aufräumen: `--keep-installed` lässt die App stehen, Default deinstalliert
  (MSI/MSIX) bzw. löscht nichts (portable).

**Akzeptanzkriterien:** je ein Fixture pro Format im CI-Job (MSIX aus einem
Mini-Projekt signaturfrei mit Dev-Mode des Runners; MSI via WiX im Fixture-Repo
ODER ein bekanntes, kleines OSS-MSI gepinnt & gecacht); Installation → Launch →
Deinstallation hinterlässt keine App. **Aufwand:** M–L. **Abhängigkeiten:** WP-B1.

---

## WP-B4 — `playable-check`/`temporal-check` für Windows

**Ziel:** `cue playable-check --platform windows --exe app.exe` liefert das
5-Punkte-Verdikt; `temporal-check` analog (Idle-Leben/Flackern, generischer
Modus; CUE-PROBE-HTTP falls vorhanden).

**Design:** ausschließlich Verdrahtung: Windows-Treiber (WP-B1/B2) erfüllt den
Session-Vertrag, Runner sind seit WP-CORE-2 treiber-agnostisch.
Windows-Spezifika:
- `startet` = Prozess läuft + Hauptfenster sichtbar + Frame nicht blank.
- `fehlerfrei` = keine Event-Log-/WER-/stderr-Fehler + kein Fehlerdialog.
- `bedienbar` = uiTree-Knoten mit Invoke/Toggle vorhanden; bei 0 Knoten
  (Spiele!) → indirekter Beleg (WP-CORE-2-Regel).
- `reagiert` = sichere Interaktion: erster Invoke-fähiger Knoten; sonst
  Fenster-Mitte-Klick + Space — NIEMALS Alt+F4/Enter blind (Enter kann
  Dialoge bestätigen; als Guardrail dokumentieren).

**Akzeptanzkriterien:** CI (`windows-latest`): Notepad → `BELEGBAR SPIELBAR`
(alle 5 Checks); Hang-Fixture → `NICHT BELEGT` mit `windows-hang`-Finding.
**Aufwand:** S–M. **Abhängigkeiten:** WP-B1, WP-B2, WP-CORE-2.

---

## WP-B5 — `cue windows-qa <ziel>`: der Explorations-Orchestrator

**Ziel:** Das Windows-Pendant zu `runAndroidQa`: Install (WP-B3) → Launch →
Explorations-Schleife (uiTree-gesteuert, LLM optional via bestehendem
`src/llm/`) → Crash/Hang-Erkennung → severity → `writeReports` + Detail-JSON.

**Design (NEU `src/windows/index.js`, bewusst Struktur-Spiegel von
`src/android/index.js`):**
- Heuristik-Exploration: unbesuchte Invoke-fähige Knoten (Identität:
  automationId+name, nicht Koordinate — Lehre aus WP-A2), Menüs öffnen, `Esc`
  als „back"-Äquivalent, Fenster-Wechsel erkennen (neues Top-Level-Fenster des
  Prozesses = neuer „Screen").
- Modal-Wächter: Datei-Dialoge (`#32770` mit „Öffnen/Speichern") per `Esc`
  schließen; Druck-/Beenden-Menüpunkte per Denylist (`name` matcht
  print|beenden|exit|quit|schließen|close) überspringen — **Guardrail: die
  Exploration darf nichts drucken, speichern oder löschen.**
- Flow-Modus: dasselbe deklarative Format wie Android-Flows mit
  Selektoren `{name, automationId, role}` und `expect {windowTitle, name,
  exists}` — Resolver teilt Code mit `src/android/flow.js` (gemeinsame
  Ziel-Auflösung in NEU `src/core/target-resolver.js` extrahieren).
- LLM-Modus: Screenshot + uiTree an `vision`-analoges Modul
  (`src/windows/vision.js`, Prompt-Struktur von `src/android/vision.js`
  übernehmen).
- Coverage-Abschnitt wie WP-A2 (Fenster/Screens als Knoten).

**CLI:** `cue windows-qa <exe|msi|msix> [--installer setup.exe] [--exe app.exe]
[--flow flow.json] [--steps N] [--goal "..."] [--fail-on ...] [--json]`.

**Akzeptanzkriterien:**
- [ ] CI: `windows-qa` gegen Notepad (10 Schritte) → Report mit Schritten,
      Screenshots, Severity, Exit 0.
- [ ] Crash-Fixture → Severity `high`, Score ≤ 20 (Spiegelregel zu
      `src/android/index.js:228`).
- [ ] Kein Explorations-Schritt löst Drucken/Speichern-Dialoge dauerhaft aus
      (Denylist-Test mit WordPad-ähnlicher Fixture oder uiTree-Fixture-Sim).

**Aufwand:** L. **Abhängigkeiten:** WP-B1–B3; WP-CORE-3 für verdict.json.

---

## WP-B6 — Windows-a11y & Design-Baseline-Adapter

**Ziel:** (1) a11y-Checks aus dem UIA-Baum (Name fehlt bei interaktivem
Element, Kontrast via Screenshot-Sampling der Knoten-BBox, Tastatur-
Erreichbarkeit: `focusable`), gleiche Kategorien wie Web/Android (WP-A9).
(2) `design-check`/`design-iterate --platform windows`: Ist-Elemente aus dem
UIA-Baum im selben Format wie `src/android/design-adapter.js` (`captureActual`),
damit Baselines plattformübergreifend funktionieren.

**Akzeptanzkriterien:** Fixture-uiTree → erwartete a11y-Findings (rein getestet);
`design-check` gegen Notepad-Baseline demonstriert PASS/FAIL. **Aufwand:** M.
**Abhängigkeiten:** WP-B2, WP-B5.

---

## WP-B7 — Windows-CI-Matrix

**Ziel:** `.github/workflows/`-Erweiterung: Job `windows-qa-smoke` auf
`windows-latest`: Sidecar-Unit-Tests, Notepad-Playability, Crash-/Hang-
Fixtures, `windows-qa`-Explorationslauf; Artefakt-Upload der Reports.
Zusätzlich `cue-windows-qa.example.yml` für fremde Repos (Muster:
`cue-qa.example.yml`).

**Akzeptanzkriterien:** Workflow grün; Laufzeit < 10 min (Fixtures klein
halten); Beispiel-Workflow dokumentiert im README-Abschnitt (WP-Q5).
**Aufwand:** S–M. **Abhängigkeiten:** WP-B4, WP-B5.

---

## WP-B8 — `doctor` für Windows

**Ziel:** `cue doctor` auf Windows prüft: PowerShell-Version, UIA verfügbar,
SendInput-Testfähigkeit (nur Meldung, kein echter Input), Event-Log-Leserechte,
ffmpeg; auf Nicht-Windows: Zeile „Windows-QA: nur auf Windows-Hosts (optional)".

**Aufwand:** S. **Abhängigkeiten:** WP-B1.

---

## Phase-B-Erfolgsbild

```bash
cue windows-qa .\dist\MeinTool-Setup.msi --steps 15 --fail-on high
cue playable-check --platform windows --exe ".\build\Game.exe"
```

beides läuft auf einem nackten `windows-latest`-Runner ohne jede zusätzliche
Installation (kein WinAppDriver, kein NuGet) und liefert dieselbe
Report-Familie wie Web und Android — inklusive `verdict.json` (Schema v1),
Screenshots als Evidence und CI-Exit-Code.
