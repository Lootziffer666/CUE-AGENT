# 07 — Arbeitsregeln für LLM-Agenten (Pflichtlektüre vor jedem Commit)

> Dieses Kapitel ist der Vertrag zwischen dem Plan und jedem Agenten, der ihn
> umsetzt — egal welches Modell. Wer hiervon abweicht, begründet es im PR-Text
> und aktualisiert dieses Dokument im selben PR.

## 1. Arbeitszyklus je Arbeitspaket (WP)

1. **Lesen:** `00-INDEX.md` (Karte) → `01-IST-ZUSTAND.md` (Realität) →
   das eigene WP-Kapitel → dieses Kapitel. Nichts anderes ist nötig.
2. **Verifizieren:** Prüfe die Datei-Referenzen deines WPs gegen den aktuellen
   Code. Stimmt etwas nicht mehr → zuerst `01-IST-ZUSTAND.md` korrigieren
   (eigener Doku-Commit), dann weiterarbeiten.
3. **Klein schneiden:** Ein WP = ein Branch = ein PR. Niemals zwei WPs mischen.
   Ist ein WP zu groß für eine Session: am dokumentierten Schritt-Schnitt
   teilen und den Reststand als Checkliste im PR-Text hinterlassen.
4. **Testen vor Behaupten:** Jedes Akzeptanzkriterium wird mit `node --test`,
   einem CI-Lauf oder einem im PR dokumentierten manuellen Beleg (Befehl +
   Ausgabe) nachgewiesen. Unbelegte Kriterien gelten als nicht erfüllt.
5. **Abschließen:** Definition of Done (§4) durchgehen, PR erstellen (nur wenn
   angefordert), WP-Status im PR-Titel: `feat(wp-a1): …`.

## 2. Code-Konventionen (aus dem Bestand abgeleitet, verbindlich)

- **Sprache:** Kommentare, Logs, Reports, Fehlermeldungen: **Deutsch**
  (Ausgaben respektieren `--lang`). Bezeichner: Englisch.
- **Modulsystem:** CommonJS, `"use strict"`, Node ≥ 18. Kein TypeScript,
  kein Build-Schritt, keine ESM-Umstellung.
- **Dependencies:** Die drei bestehenden (`@anthropic-ai/sdk`, `dotenv`,
  `playwright`) plus optionale bleiben. **Keine neue Dependency ohne eigenes
  Entscheidungs-WP.** Systemwerkzeuge (adb, PowerShell, blender, ffmpeg) zur
  Laufzeit erkennen; fehlen sie: deutsche, handlungsleitende Fehlermeldung
  (Muster: `src/android/adb.js:28`).
- **Reinheit:** Urteils-/Parser-Logik immer als reine Funktion ohne I/O in
  eigener Datei (Muster: `src/qa/frame-metrics.js`), Runner liefern die Daten.
- **Wiederverwendung statt Kopie:** `assess`/`failsGate` (`src/qa/severity.js`),
  `writeReports` (`src/qa/report.js`), `src/util/` sind die einzigen Quellen
  für Score, Gate, Reports, Logging. Duplikate sind ein Review-Blocker.
- **Ausgaben:** immer ins CWD des Nutzers (`qa-reports/`, `playable-reports/`, …),
  nie ins Repo des Tools. Exit-Codes: 0 bestanden, 1 Gate/Verdict verletzt,
  2 Bedienfehler.
- **Rückwärtskompatibilität:** bestehende CLI-Flags, Reportdateien und
  Exit-Codes ändern sich nie; Neues kommt additiv.

## 3. Guardrails (nicht verhandelbar)

- **Keine destruktiven Eingaben** bei Exploration/Playability: nie Alt+F4 als
  Sonde, nie blindes Enter in Dialoge, Denylist für Drucken/Speichern/Beenden/
  Löschen-Elemente; Esc nie als erste Eingabe in Spielen.
- **Geräte-/Systemzustand zurücksetzen:** Alles, was ein WP am Gerät/OS ändert
  (Locale, Dark Mode, Font-Scale, installierte Fixtures), wird in try/finally
  auf den vorher gelesenen Ausgangswert zurückgestellt.
- **Netzwerk nur Loopback** für Proben/Sidecars (CUE-PROBE bindet 127.0.0.1,
  nie 0.0.0.0). Keine Telemetrie, keine Uploads.
- **Key-frei bleibt key-frei:** Verdikt-Commands (`playable/temporal/audio/
  design/game/asset-check`) dürfen nie einen API-Key voraussetzen. LLM nur als
  optionale Anreicherung, die das deterministische Verdict nie überstimmt.
- **qa-loop-Sicherheitsmodell beibehalten:** Schreibzugriffe nur mit `--repo`,
  nur mit `--apply`, nur auf existierende Dateien innerhalb des Repos.
- **Fremde Builds:** `game-check`/`windows-qa` starten beliebige Programme —
  nie mit erhöhten Rechten ausführen, Doku-Warnung beibehalten.

## 4. Definition of Done (jede Checkbox, jeder PR)

- [ ] Alle Akzeptanzkriterien des WPs belegt (Test, CI-Link oder Befehl+Ausgabe im PR).
- [ ] Neue reine Funktionen haben Fixture-Tests; `node --test` ist grün.
- [ ] Kein bestehender Command verhält sich anders (Stichprobe: `cue doctor`,
      `cue playable-check` gegen Web-Fixture).
- [ ] Fehlerpfade geprüft: fehlendes Werkzeug/Gerät → verständliche Meldung,
      kein Stacktrace-Regen; Parser werfen nie.
- [ ] Doku aktualisiert: Command-Hilfe in `bin/cue.js`, betroffenes
      `docs/`-Dokument, ggf. README-Tabelle; `01-IST-ZUSTAND.md` wenn sich die
      Landkarte geändert hat.
- [ ] Keine neuen Dependencies, keine Binaries > 200 KB im Git (WP-Q1-Politik).
- [ ] Commit-Messages: `feat|fix|docs|test(wp-xx): <deutscher Satz>`.

## 5. Wenn du unsicher bist

- **Schwellwerte:** Default aus `frame-metrics.js`/WP-Q2 nehmen, konfigurierbar
  machen, im Report ausweisen — nicht raten und hart kodieren.
- **Plattform-Verhalten unklar** (z. B. exotisches dumpsys-Format): defensiv
  parsen, `parserNote` ins JSON, Fixture der unbekannten Ausgabe einchecken,
  Folge-Issue anlegen.
- **Vertragslücke im Treiber-Interface:** Vertrag NICHT still erweitern —
  Vorschlag als Abschnitt in `02-ZIELARCHITEKTUR.md` im selben PR, Review
  entscheidet.
- **Konflikt zwischen Plan und Code:** Der Code von main ist die Wahrheit über
  das Ist; der Plan ist die Wahrheit über das Soll. Ist-Abweichungen → Kapitel
  01 fixen; Soll-Abweichungen → nie eigenmächtig umdeuten.

## 6. Prompt-Gerüst zum Starten eines WPs (copy-paste für Orchestratoren)

```
Du arbeitest im Repo Lootziffer666/CUE-AGENT. Lies zuerst
docs/masterplan/00-INDEX.md, 01-IST-ZUSTAND.md und 07-ARBEITSREGELN-FUER-LLMS.md,
dann das Kapitel deines Arbeitspakets: <WP-ID> in <Kapitel-Datei>.
Setze GENAU dieses Arbeitspaket um: verifiziere die Datei-Referenzen am Code,
implementiere die beschriebenen Schritte, schreibe die geforderten Tests,
belege jedes Akzeptanzkriterium. Halte alle Guardrails und die Definition of
Done aus Kapitel 07 ein. Keine neuen Dependencies, keine Scope-Erweiterung.
Branch: <branch>, Commits nach Konvention `feat(<wp-id>): …`.
```
