# 02 — Zielarchitektur & Fundament-Arbeitspakete (WP-CORE-1 … WP-CORE-4)

> Dieses Kapitel definiert die drei tragenden Abstraktionen, auf denen alle
> Phasen aufsetzen: (1) das **Treiber-Interface**, (2) das **Verdict-/Evidence-
> Schema v1**, (3) der **CUE-PROBE-Vertrag**. Dazu die Fundament-Arbeitspakete.

## 1. Architektur-Zielbild

```
                    ┌─────────────────────────────────────────────┐
                    │            bin/cue.js  (CLI)                │
                    └───────────────┬─────────────────────────────┘
          ┌─────────────────────────┼───────────────────────────────┐
          ▼                         ▼                               ▼
   Verdikt-Runner            LLM-QA-Runner                    Video-Pipeline
   (key-frei)                (BYOK, optional)                 (nach QA-Gate)
   playable / temporal /     qa / android-qa-Vision /         promo/tutorial/…
   audio / design /          qa-loop / release-check          (unverändert)
   game-check / asset-check
          │                         │
          └───────────┬─────────────┘
                      ▼
        ┌───────────────────────────────┐     ┌──────────────────────────┐
        │   src/drivers/  (NEU)         │     │ src/qa/frame-metrics.js  │
        │  einheitlicher Vertrag:       │────▶│ src/qa/severity.js       │
        │  launch/screenshot/uiTree/    │     │ src/qa/report.js         │
        │  input/logs/health/stop       │     │ (unverändert, geteilt)   │
        ├───────────────────────────────┤     └──────────────────────────┘
        │ web/      Playwright (heute in playable/temporal verdrahtet)   │
        │ android/  delegiert an src/android/adb.js                      │
        │ windows/  PowerShell-UIA-Sidecar (Phase B)                     │
        │ gameproc/ nackter Prozess + Fenster-Capture, KEIN uiTree       │
        └────────────────────────────────────────────────────────────────┘
```

**Kernidee:** Die Urteilslogik (Frame-Metriken, Playability-Checkliste,
Severity) ist bereits plattformneutral. Was fehlt, ist eine dünne, einheitliche
Schicht, die „gib mir ein Bild / einen UI-Baum / eine Eingabe / einen
Gesundheitszustand" pro Plattform beantwortet. Diese Schicht ist **bewusst
minimal** — kein WebDriver-Klon, keine Selektor-Engines, keine Wartelogik über
das Nötigste hinaus.

---

## WP-CORE-1 — Treiber-Interface `src/drivers/`

**Ziel:** Ein dokumentierter, minimaler Treiber-Vertrag plus Web- und
Android-Implementierung als Referenz (reine Umhüllung von Bestehendem, keine
Verhaltensänderung).

**Warum:** Ohne diesen Vertrag muss jede neue Plattform `playable.js`/
`temporal.js` kopieren (Duplikat-Verbot, siehe 07). Mit ihm sind Windows und
Game-Prozesse „nur noch" neue Treiber.

**Berührte Dateien:**
- NEU `src/drivers/README.md` — der Vertrag in Prosa + JSDoc (Deutsch).
- NEU `src/drivers/index.js` — `getDriver(id)`-Registry (`web|android|windows|gameproc`).
- NEU `src/drivers/web.js` — kapselt Playwright-Launch (Code aus
  `src/qa/playable.js:78-92` extrahieren: Browser-Args `--use-gl=angle
  --enable-webgl --ignore-gpu-blocklist`, Console/PageError/Response-Listener).
- NEU `src/drivers/android.js` — kapselt `src/android/adb.js` (delegiert, dupliziert nicht).

**Design (der Vertrag, JSDoc-normativ):**

```js
/**
 * Treiber-Vertrag. Jede Funktion, die eine Plattform nicht kann, fehlt im
 * capabilities-Objekt und wirft bei Aufruf einen klaren Fehler.
 *
 * getDriver(id) -> {
 *   id: "web"|"android"|"windows"|"gameproc",
 *   capabilities: {
 *     uiTree: boolean,       // strukturierter Element-Baum verfügbar?
 *     input: boolean,        // synthetische Eingaben möglich?
 *     logs: boolean,         // laufende Fehler-/Log-Quelle vorhanden?
 *     network: boolean,      // HTTP-Antworten beobachtbar? (nur web)
 *     processHealth: boolean // Crash/Hang des Prozesses erkennbar?
 *   },
 *   launch(target, opts) -> Promise<Session>
 *     // target: URL (web) | {apk?, pkg} (android) | {installer?, exe?, appId?}
 *     //         (windows) | {exe, args, cwd} (gameproc)
 *     // opts:   { viewport?, env?, timeoutMs?, logger }
 * }
 *
 * Session = {
 *   screenshot() -> Promise<Buffer>          // PNG des sichtbaren Zustands
 *   frame() -> Promise<number[]>             // RGBA-Array 128x72 (SAMPLE_W/H),
 *                                            // direkt kompatibel zu frame-metrics
 *   uiTree() -> Promise<{nodes:[{role,name,id,bbox:[x,y,w,h],clickable}]}|null>
 *   input(action) -> Promise<void>
 *     // action: {type:"tap"|"click", x, y} | {type:"key", key} |
 *     //         {type:"text", text} | {type:"swipe"|"scroll", ...} — Superset
 *     //         der heutigen Flow-Aktionen (src/core/flow.js, src/android/flow.js)
 *   logs() -> Promise<Array<{type:"error"|"warning"|"info", text, source}>>
 *     // kumulativ seit launch; Quelle: Konsole (web), Logcat (android),
 *     // Event Log/stderr (windows), Engine-Log (gameproc)
 *   health() -> Promise<{running, responding, crashed, crashInfo:string|null}>
 *   meta() -> {url?|activity?|windowTitle?|pid?}   // "Wo bin ich?"-Identität
 *   stop() -> Promise<void>                        // idempotent, räumt auf
 * }
 */
```

**Verbindliche Design-Entscheidungen:**
1. `frame()` liefert das **dekodierte, verkleinerte RGBA-Array** (128×72 wie
   `SAMPLE_W/SAMPLE_H` in `playable.js:28`), damit `meanAbsDiff`/`analyzeSequence`
   ohne Browser-Probe-Page funktionieren. Der Web-Treiber darf intern weiterhin
   die Probe-Page zum Dekodieren nutzen; Android/Windows/gameproc dekodieren
   PNG → RGBA in Node (siehe WP-CORE-2, PNG-Decoder).
2. Kein Selektor-Matching im Treiber. Ziel-Auflösung (Text/ID → Koordinate)
   bleibt in den Flow-Modulen (`src/android/flow.js`-Muster) bzw. den Runnern.
3. Treiber werfen **deutsche, handlungsleitende** Fehlermeldungen
   (Muster: `adb.js:28`).
4. `stop()` niemals werfen lassen (Muster: `browser.close().catch(() => {})`
   in `playable.js:203`).

**Schritte:**
1. `src/drivers/README.md` mit obigem Vertrag anlegen.
2. `web.js` durch Extraktion aus `playable.js`/`temporal.js` bauen; die beiden
   Commands NOCH NICHT umstellen (das ist WP-CORE-2) — nur der Treiber + Tests.
3. `android.js` als dünne Fassade über `adb.js` (launch = install?+launch+
   foreground-check; logs = `logcatToConsole`; health = `detectCrashes` +
   `currentPackage`-Vergleich).
4. `index.js`-Registry mit Lazy-`require` (Windows-Treiber darf auf Linux nicht
   geladen werden müssen).

**Akzeptanzkriterien:**
- [ ] `getDriver("web").launch("https://example.org")` liefert eine Session, deren
      `frame()` ein 128·72·4-Array liefert und deren `health()` `{running:true}` meldet.
- [ ] `getDriver("android")` funktioniert gegen einen laufenden Emulator identisch
      zu den heutigen `adb.js`-Aufrufen (manueller Smoke-Beleg im PR).
- [ ] Kein Verhalten bestehender Commands geändert (`node --test` grün, `cue qa`
      gegen Fixture unverändert).

**Tests:** `test/drivers-contract.test.js` — Vertrags-Testsuite, die mit einem
**Mock-Treiber** läuft (prüft: frame-Format, health-Form, stop-Idempotenz) und
die jeder echte Treiber später wiederverwendet (`runDriverContractTests(driver)`
als exportierte Hilfsfunktion). Web-Treiber zusätzlich als Smoke-Test gegen
`file://`-Fixture (Muster: `test/temporal-playable.smoke.test.js`).

**Nicht-Ziele:** kein Umbau von `playable/temporal` (WP-CORE-2), kein
Windows/gameproc (Phase B/C). **Aufwand:** M (1–2 Agent-Sessions).
**Abhängigkeiten:** keine.

---

## WP-CORE-2 — `playable-check` & `temporal-check` treiber-agnostisch

**Ziel:** Die Urteils-Runner von Playwright entkoppeln: `runPlayableCheck` und
`runTemporalCheck` akzeptieren `--platform web|android|windows|gameproc`
(Default `web`, volle Rückwärtskompatibilität) und arbeiten nur noch gegen den
Treiber-Vertrag.

**Warum:** Das ist der Hebel, der EIN Playability-Urteil für Web, Android,
Windows und native Game-Builds ermöglicht — mit identischer Checkliste,
identischem Report, identischen Schwellwerten.

**Berührte Dateien:**
- `src/qa/playable.js` — I/O-Teile durch Session-Aufrufe ersetzen; die
  5-Punkte-Checkliste (`evaluatePlayability`) bleibt byte-identisch.
- `src/qa/temporal.js` — Phasen-Skript (Idle/Transition/State) bleibt; Frames
  kommen aus `session.frame()`; SHADED-Erkennung wird zur Treiber-Fähigkeit
  „Probe vorhanden?" verallgemeinert (siehe WP-CORE-4; bis dahin: SHADED nur im
  Web-Treiber).
- NEU `src/util/png.js` — minimaler PNG→RGBA-Decoder **ohne neue Dependency**:
  zlib (Node-Builtin) + eigener Filter-Decoder für die von `screencap`/
  Windows-Capture erzeugten Truecolor-PNGs; auf 128×72 heruntersamplen
  (nearest). ~150 Zeilen, vollständig unit-testbar mit Mini-PNG-Fixtures.
  (Alternative, falls der Decoder im Review zu riskant wirkt: der Treiber darf
  eine bestehende Playwright-Chromium-Instanz als Decode-Probe nutzen, wenn
  vorhanden — aber gameproc/Windows dürfen NICHT hart von Playwright abhängen.)
- `bin/cue.js` — `--platform`-Flag für beide Commands durchreichen.

**Wichtige Verhaltensregeln:**
1. `bedienbar` (interactiveCount) nutzt `session.uiTree()`; liefert der Treiber
   `null` (gameproc!), wird der Check durch `bedienbar*` ersetzt: „Eingabe
   möglich UND Reaktion messbar" (das `reagiert`-Signal trägt dann doppelt;
   im Report explizit als `bedienbar (indirekt belegt)` ausweisen).
2. `fehlerfrei` speist sich aus `session.logs()` + `session.health()` —
   Serverfehler-Zählung nur, wenn `capabilities.network`.
3. Alle Schwellwerte bleiben in `frame-metrics.js` (`DEFAULT_THRESHOLDS`) und
   werden pro Plattform NUR via Options-Override angepasst, nie hart kodiert.

**Akzeptanzkriterien:**
- [ ] `cue playable-check <url>` verhält sich unverändert (gleiche Reports,
      gleiche Exit-Codes; Smoke-Test-Belege).
- [ ] `cue playable-check --platform android --package <id>` liefert gegen einen
      Emulator ein `PLAYABLE-PROOF.md` mit denselben 5 Checks.
- [ ] `evaluatePlayability` und `analyzeSequence` wurden NICHT verändert.

**Tests:** Mock-Treiber, der skriptbare Frame-Sequenzen liefert (statisch /
lebendig / Sprung) → Runner-Urteile deterministisch prüfbar ohne Browser.
PNG-Decoder: Fixtures mit bekannten Pixelwerten. **Aufwand:** M–L.
**Abhängigkeiten:** WP-CORE-1.

---

## WP-CORE-3 — Verdict-/Evidence-Schema v1

**Ziel:** EIN JSON-Schema für alle Verdikt-Reports, damit ANVIL/CI/Dashboards
jeden CUE-Report gleich lesen können.

**Design (normativ, `src/qa/verdict-schema.json` + Writer in `report.js`):**

```jsonc
{
  "schema": "cue.verdict/1",
  "tool": "cue-agent",
  "version": "<package.json version>",
  "command": "playable-check | temporal-check | game-check | windows-qa | ...",
  "target": { "kind": "url|apk|exe|msix|blend", "value": "...", "platform": "web|android|windows|desktop" },
  "startedAt": "ISO-8601", "finishedAt": "ISO-8601",
  "verdict": "BELEGBAR SPIELBAR | NICHT BELEGT | KONSISTENT | AUFFAELLIG | READY | NOT READY",
  "score": 0-100,
  "severity": "none|low|medium|high",
  "checks": [ { "id": "startet", "label": "...", "ok": true,
                "signals": { "navOk": true, "blank": false },
                "evidence": ["proof/proof-01-start.png"] } ],
  "findings": [ { "severity": "high", "category": "temporal-jump", "message": "...", "evidence": ["frames/07.png"] } ],
  "signals": { "...alle Rohmesswerte..." },
  "evidence": [ { "path": "proof/proof-01-start.png", "kind": "screenshot", "label": "Start" } ],
  "environment": { "os": "...", "node": "...", "driver": "web", "device": "emulator-5554|null" },
  "exitCode": 0
}
```

**Regeln:** additive Evolution (v1 → v1.1 nur neue Felder); jeder `check` und
jedes `finding` MUSS mindestens ein `evidence` referenzieren oder explizit
`"evidence": []` mit `evidenceNote` begründen; Pfade relativ zum Report-Dir.

**Schritte:** Schema-Datei + `writeVerdict(dir, verdict)`-Helper in `report.js`;
`playable.js`, `temporal.js`, `audio-check.js`, `release-check.js` schreiben
zusätzlich (nicht ersetzend!) `verdict.json` im neuen Schema; ein
`test/verdict-schema.test.js` validiert Beispiel-Outputs strukturell (eigener
Mini-Validator, kein ajv — Dependency-Regel).

**Akzeptanzkriterien:** alle vier Bestands-Commands schreiben gültiges
`verdict.json`; bestehende Dateien (`playable-report.json` etc.) unverändert.
**Aufwand:** S–M. **Abhängigkeiten:** keine (parallel zu WP-CORE-1 möglich).

---

## WP-CORE-4 — CUE-PROBE: der engine-agnostische Instrumentierungs-Vertrag

**Ziel:** `window.SHADED` (temporal) und `window.ANVIL_AUDIO` (audio) zu EINEM
dokumentierten Vertrag verallgemeinern, den auch native Engines (Unity, Unreal,
Godot) implementieren können. Ein Build, der CUE-PROBE spricht, bekommt
tiefere, deterministische Prüfungen; einer ohne bekommt den generischen Modus.

**Design (normativ, NEU `docs/CUE_PROBE.md` + `src/probe/client.js`):**

Zwei Transporte, EIN logisches Interface:
1. **Web:** `window.CUE_PROBE` (JS-Objekt) — Shim erkennt auch die Alt-Verträge
   `window.SHADED`/`window.ANVIL_AUDIO` und mappt sie (Rückwärtskompatibilität).
2. **Nativ:** HTTP auf `127.0.0.1:<port>` (Default 7477, per Env
   `CUE_PROBE_PORT`), reines JSON, kein Auth (nur Loopback binden!).

| Logischer Aufruf | Web | Nativ (HTTP) | Pflicht? |
|---|---|---|---|
| `ready() -> bool` | `CUE_PROBE.isReady()` | `GET /cue/ready` → `{ready:true}` | JA |
| `state() -> {scene, fps, frame, entities?, custom?}` | `CUE_PROBE.getState()` | `GET /cue/state` | JA |
| `setParams(obj)` (Weltparameter: Wetter, Tageszeit, …) | `CUE_PROBE.setParams(o)` | `POST /cue/params` | optional |
| `input(action)` (engine-seitige Eingabe-Injektion) | — (Browser hat echte Events) | `POST /cue/input` | optional |
| `events() -> [{t, type, data}]` (Audio-Cues etc., ersetzt ANVIL_AUDIO) | `CUE_PROBE.drainEvents()` | `GET /cue/events?since=` | optional |
| `screenshot()` (engine-internes Capture, umgeht Fenster-Capture-Probleme bei Fullscreen/Exclusive) | — | `GET /cue/screenshot` → PNG | optional |

**Nutzenkette:** `temporal-check` kann bei nativer Probe echte
Weltparameter-Rampen fahren (exakt wie heute bei SHADED); `game-check` kann
`fps`/`frame`-Monotonie als hartes „lebt"-Signal nutzen statt nur Pixel-Diff;
`audio-check` wird engine-fähig. Referenz-Implementierungen sind WP-C5 (Unity)
und WP-C6 (Unreal).

**Schritte:** Vertrag dokumentieren; `src/probe/client.js` (detect: erst Web-
Objekt, dann HTTP-Port; alles mit kurzen Timeouts und sauberem „keine Probe"-
Ergebnis); `temporal.js` von SHADED-Spezifik auf Probe-Client umstellen
(SHADED-Erkennung bleibt als Shim erhalten — kein Bruch für SHADED-Szenen).

**Akzeptanzkriterien:** `temporal-check` gegen eine SHADED-Fixture verhält sich
unverändert; gegen eine Fixture mit `window.CUE_PROBE` identisch; HTTP-Detect
gegen einen Test-Stub (`test/fixtures/probe-stub.js`) funktioniert.
**Aufwand:** M. **Abhängigkeiten:** WP-CORE-2 (empfohlen, nicht zwingend).

---

## Leitplanken für alle CORE-Pakete

1. **Rückwärtskompatibilität ist heilig.** Bestehende CLI-Aufrufe, Report-Dateien
   und Exit-Codes ändern sich nicht. Neues kommt additiv (`--platform`, `verdict.json`).
2. **Extraktion statt Neubau.** Web-Treiber = verschobener Code aus
   playable/temporal, mit `git`-nachvollziehbarer Historie.
3. **Jede Abstraktion hat GENAU die Methoden, die ein existierender Runner
   braucht.** Keine spekulativen Interfaces („YAGNI").
