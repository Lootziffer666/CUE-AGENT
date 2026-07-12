# CUE-AGENT MASTERPLAN — Index & Leseanleitung

> **Zweck dieses Dokumentensatzes:** Jedes fähige LLM (Claude, GPT, Gemini, lokale
> Modelle) soll CUE-AGENT ohne Rückfragen zum **bestmöglichen QA-Werkzeug für
> Android- und Windows-Apps** ausbauen können — und darüber hinaus **Blender-,
> Unity- und Unreal-Builds als „belegbar spielbar oder nicht" bewerten** können.
> Der Plan ist so geschrieben, dass ein Agent ein einzelnes Arbeitspaket greifen,
> umsetzen, testen und mergen kann, ohne den Rest des Plans zu verletzen.

## Nordstern (eine Zeile)

**CUE-AGENT sagt nie „das ist gut". CUE-AGENT sagt: „das ist belegbar spielbar /
belegbar releasefähig" — auf jeder Plattform, mit Beweisen, deterministisch wo
immer möglich, LLM-gestützt wo nötig, und immer mit CI-Exit-Code.**

Diese Philosophie existiert bereits im Code (`src/qa/frame-metrics.js`,
`src/qa/playable.js`) und ist der rote Faden **aller** Arbeitspakete: Jedes
Urteil ist eine Checkliste messbarer Signale mit Artefakt-Beweisen
(Screenshots, Frames, Logs) und einem Exit-Code.

## Dokumente & Lesereihenfolge

| Nr | Datei | Inhalt | Für wen zuerst |
|---|---|---|---|
| 00 | `00-INDEX.md` | Dieses Dokument: Karte, Glossar, Abhängigkeitsgraph | Jeder Agent, immer |
| 01 | `01-IST-ZUSTAND.md` | Verifizierter Ist-Zustand des Codes (mit Datei:Zeile-Belegen), Stärken, Lücken | Jeder Agent vor dem ersten Commit |
| 02 | `02-ZIELARCHITEKTUR.md` | Treiber-Abstraktion, einheitliches Verdict-/Evidence-Schema, CUE-PROBE-Vertrag | Agenten an WP-CORE-* |
| 03 | `03-PHASE-A-ANDROID.md` | Android zur Best-in-Class-QA: WP-A1 … WP-A10 | Agenten an Android-Paketen |
| 04 | `04-PHASE-B-WINDOWS.md` | Windows-Apps als neue Plattform: WP-B1 … WP-B8 | Agenten an Windows-Paketen |
| 05 | `05-PHASE-C-GAME-BUILDS.md` | Unity/Unreal/Blender: Spielbarkeits-Verdikt für Builds: WP-C1 … WP-C9 | Agenten an Game-Paketen |
| 06 | `06-QUERSCHNITT.md` | Scoring-Vereinheitlichung, Reporting, CI-Matrix, Teststrategie, Doku: WP-Q1 … WP-Q6 | Agenten an Querschnitt |
| 07 | `07-ARBEITSREGELN-FUER-LLMS.md` | Verbindliche Konventionen, Definition of Done, Guardrails, Prüf-Rituale | **Pflichtlektüre vor jedem Commit** |

## Arbeitspaket-Nomenklatur

- **WP-CORE-n** — Fundament (Treiber-Abstraktion, Verdict-Schema, CUE-PROBE). Kapitel 02.
- **WP-An** — Android. Kapitel 03.
- **WP-Bn** — Windows. Kapitel 04.
- **WP-Cn** — Game-Builds (Unity/Unreal/Blender/generisch). Kapitel 05.
- **WP-Qn** — Querschnitt (Scoring, CI, Tests, Doku). Kapitel 06.

Jedes Arbeitspaket hat die feste Struktur: **Ziel · Warum · Berührte Dateien ·
Design · Schritte · Akzeptanzkriterien · Tests · Nicht-Ziele · Aufwand ·
Abhängigkeiten**. Ein Agent, der ein WP übernimmt, setzt **genau dieses WP** um —
nicht mehr. Scope-Erweiterungen sind ein eigenes WP.

## Abhängigkeitsgraph (Reihenfolge der Umsetzung)

```
WP-CORE-1 (Driver-Interface)
  ├─→ WP-CORE-2 (playable/temporal treiber-agnostisch)
  │     ├─→ WP-A6 (Android playable/temporal on-device)
  │     ├─→ WP-B4 (Windows playable-check)
  │     └─→ WP-C2 (Desktop-Game-Playability-Harness)
  ├─→ WP-B1..B3 (Windows-Treiber-Sidecar)          [parallel zu Phase A]
  └─→ WP-C1 (Prozess-/Fenster-Treiber "gameproc")

WP-CORE-3 (Verdict-/Evidence-Schema v1) ─→ alle Report-schreibenden WPs
WP-CORE-4 (CUE-PROBE-Vertrag)           ─→ WP-C5 (Unity-Probe), WP-C6 (Unreal-Probe)

Phase A (Android): WP-A1..A5 unabhängig voneinander; WP-A6..A10 nach WP-CORE-2
Phase B (Windows): WP-B1 → B2 → B3 → B4 → B5; B6..B8 danach
Phase C (Games):   WP-C1 → C2 → C3/C4 (Log-Parser, parallel) → C5/C6 (Proben)
                   WP-C7 (Blender) unabhängig ab sofort möglich
                   WP-C8 (Android-Game-Playability) nach WP-A6
Querschnitt:       WP-Q1 (Testfixtures) SOFORT; WP-Q2..Q6 fortlaufend
```

**Empfohlene Startreihenfolge für das erste Team aus Agenten:**
1. WP-Q1 (Fixtures & Parser-Testmuster) — macht alles Weitere testbar.
2. WP-CORE-1 + WP-CORE-3 — Fundament, klein halten, schnell mergen.
3. Dann parallel: Phase A (Android-Vertiefung), WP-B1 (Windows-Sidecar), WP-C3/C4 (Engine-Log-Parser, reine Funktionen, sofort testbar).

## Glossar

| Begriff | Bedeutung im Repo |
|---|---|
| **Verdict** | Binäres, belegtes Urteil: `BELEGBAR SPIELBAR` / `NICHT BELEGT` (playable), `KONSISTENT` / `AUFFAELLIG` (temporal), `READY` / `NOT READY` (release). Niemals „gut/schlecht". |
| **Evidence / Beweis** | Artefakt, das ein Check-Ergebnis belegt: Screenshot, Frame-PNG, Logauszug, JSON-Messwert. Jeder Check ohne Evidence ist ungültig. |
| **Signal** | Roher Messwert (z. B. `consoleErrors: 3`, `meanDiff: 0.42`), aus dem Checks abgeleitet werden. Signale stehen immer im Report-JSON. |
| **Gate** | Schwellwert-Entscheidung mit Exit-Code für CI (`failsGate` in `src/qa/severity.js`). |
| **Treiber (Driver)** | Plattform-Adapter mit einheitlichem Vertrag (launch/screenshot/uiTree/input/logs/health/stop). Siehe Kapitel 02. |
| **Sidecar** | Hilfsprozess in anderer Sprache (z. B. PowerShell für Windows-UIA), der über JSON-Zeilen auf stdio mit Node spricht. |
| **CUE-PROBE** | Engine-agnostischer Instrumentierungs-Vertrag (Nachfolger/Verallgemeinerung von `window.SHADED`), über den ein Build CUE-AGENT Zustand & Steuerung anbietet. Siehe Kapitel 02. |
| **Key-frei** | Läuft ohne jeden API-Key, deterministisch, CI-tauglich. `playable-check`, `temporal-check`, `audio-check`, `design-check` sind key-frei — das bleibt so und gilt für alle neuen Verdikt-Commands. |
| **BYOK** | Bring your own key: LLM-Funktionen (`qa`, `qa-loop`, Vision-Exploration) nutzen Keys aus der Umgebung des Nutzers; via `CUE_LLM_*` provider-agnostisch. |
| **assetpilot.md** | Kontext-Dokument des agentischen Spielestudios (mini-me/3D-RE-GEN/WIZARD/SHADED/ANVIL). CUE-AGENT ist darin „der Beweis". |
| **ANVIL** | Übergeordnetes Monorepo-/Governance-Projekt; CUE-AGENT ist dort kanonisches QA-Modul (`docs/ANVIL_CONTEXT_AND_REALITY_MAP.md`). |

## Was dieser Plan bewusst NICHT will

1. **Keinen Rewrite.** Die bestehende Pipeline (severity → report → gate) ist gut
   und wird wiederverwendet, nie dupliziert. Neue Plattformen docken an, sie
   ersetzen nichts.
2. **Keine schweren Abhängigkeiten.** `package.json` hat drei Dependencies —
   das ist ein Feature. Kein Appium-Server, kein Java-Zwang, kein natives
   npm-Modul mit Compile-Schritt. Sidecars nutzen, was auf der Zielplattform
   ohnehin vorhanden ist (PowerShell/.NET auf Windows, adb für Android,
   `blender`-Binary für Blender).
3. **Keine iOS/macOS-Plattform** in diesem Plan (bewusst ausgeklammert; eigener
   Plan, wenn Android+Windows stehen).
4. **Kein „Qualitäts-Geschmack".** Ob ein Spiel *Spaß macht*, bewertet CUE-AGENT
   nicht. Es belegt: startet, lebt, reagiert, stabil, fehlerfrei — mehr nicht.
   (Die LLM-gestützte `qa`-Analyse darf weiche Befunde liefern, aber nie das
   deterministische Verdict überstimmen.)

## Erfolgskriterien des Gesamtplans (messbar)

- [ ] `cue android-qa` liefert zusätzlich zu Crash/ANR: Startzeit, Jank-Quote,
      Speicher-Peak, Activity-Coverage, a11y-Befunde — alles key-frei (Phase A).
- [ ] `cue windows-qa <exe|msix>` existiert und liefert dieselbe Report-Familie
      wie Android (Explorations-Schritte, Crash-Erkennung via Event Log/WER,
      Severity, Exit-Code) auf einem `windows-latest`-GitHub-Runner (Phase B).
- [ ] `cue game-check <build>` bewertet einen Unity- **und** einen Unreal-Windows-
      Build sowie einen generischen Exe-Build als `BELEGBAR SPIELBAR`/`NICHT BELEGT`
      mit Frame-Beweisen und Engine-Log-Befunden (Phase C).
- [ ] `cue asset-check <datei.blend>` prüft eine Blender-Datei headless: öffnet,
      vollständig (keine fehlenden Texturen/Libraries), rendert, Animation bewegt
      sich (Phase C, Blender-Teil).
- [ ] Alle Verdikt-Commands schreiben dasselbe Evidence-Schema v1 (WP-CORE-3)
      und laufen in der CI-Matrix (ubuntu + windows + Android-Emulator-Job).
- [ ] `node --test` deckt jeden neuen Parser und jede neue Metrik mit
      Fixture-basierten Tests ab; kein WP gilt ohne Tests als fertig.
