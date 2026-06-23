# CUE-AGENT — PRD (retrospektiv)

> **Ungewöhnlich:** Dieses PRD wurde **nachträglich** geschrieben — nachdem das
> Produkt schon existierte. Kein Vorab-Lastenheft, sondern eine ehrliche
> Rekonstruktion: *Was* ist entstanden, *warum*, und welche Anforderungen das
> Ergebnis im Rückblick erfüllt. Das ist Absicht. Ein Tool, das gebaut wurde,
> indem ein Mensch und ein Agent Schritt für Schritt verifizierte PRs gestapelt
> haben, verdient ein Dokument, das die Realität beschreibt statt einer
> Wunschliste. *Verify, don't claim* — auch hier.
>
> Status: lebendes Dokument · Stand: Juni 2026 · Eigner: ANVIL (Solo-Studio)

---

## 1. Problem & Vision

**Das Problem.** Grüne Builds lügen. Der CI ist grün, die Tests laufen — und
trotzdem bleibt die Frage: *Ist das wirklich bereit für echte Menschen?* Zwischen
„kompiliert" und „kommt beim Nutzer gut an" klafft eine Lücke. Und selbst wenn
die App gut ist, fehlt Solo-Entwicklern und kleinen Teams oft die Zeit und das
Werkzeug, das auch noch **zu zeigen**.

**Die Vision.** Ein Werkzeug für den ganzen Weg vom ersten Bug bis zum fertigen
Promo — *die warme Werkstatt am Rand des Märchenwalds*. Erst das Handwerk
(prüfen, beheben, messen), dann die Bühne (zeigen). In dieser Reihenfolge,
niemals umgekehrt. **Erst QA, dann Promo.**

**Einordnung.** CUE-AGENT ist der *Finishing Spark* im ANVIL-Ökosystem — der
Funke, der den Schmiede-Zyklus schließt.

---

## 2. Zielgruppe & Personas

| Persona | Wer | Schmerz | Was CUE-AGENT gibt |
|---|---|---|---|
| **Die Solo-Macherin** | Indie-Dev, baut allein eine App | Keine QA-Routine, kein Marketing-Budget, keine Zeit | Ein Werkzeug für beides, key-free, lokal |
| **Das kleine Team** | 2–5 Leute, shippen schnell | QA fällt unter den Tisch, Promos sehen lieblos aus | QA-Gate in CI + polierte Videos aus echten Flows |
| **Der Werkstatt-Tüftler** | Liebt Handwerk, misstraut Hype | Tools, die mehr versprechen als halten | Quelloffen, deterministisch, nachvollziehbar |

Anti-Persona: das Growth-Team auf Conversion-Jagd. CUE-AGENT ist bewusst
**kein** SaaS-Funnel.

---

## 3. Ziele & Nicht-Ziele

**Ziele**
- QA, die *hinschaut* wie ein Mensch (echter Browser, Vision-Analyse, Score).
- Ein autonomer Verbesserungs-Loop, der konvergiert statt nur zu melden.
- Promo-/Tutorial-Videos **ausschließlich** aus verifizierten Flows.
- Key-free als Standard; eigene Schlüssel optional.
- Eine Erfahrung, die sich anfühlt wie *eine Werkstatt betreten*, nicht *Software bedienen*.

**Nicht-Ziele**
- Kein Cloud-Zwang, kein Konto-Wall vor dem ersten Wert.
- Kein Abo-Modell, keine Dark Patterns, keine „limitierten Angebote".
- Kein Allzweck-Videoeditor — nur der Pfad von geprüftem Flow zu Video.
- Kein Ersatz für menschliches Urteilsvermögen bei *Ästhetik* (siehe NFR-7).

---

## 4. Jobs-to-be-done / User Stories

- *Als Solo-Dev* möchte ich meine Web-App in einem echten Browser prüfen lassen,
  damit ich Fehler finde, bevor echte Nutzer sie finden.
- *Als Entwicklerin* möchte ich ein Mockup als Maßstab hochladen, damit das
  Ergebnis pixelgenau dem Entwurf entspricht.
- *Als Team* möchte ich ein QA-Gate in der CI, damit nie eine kaputte App in ein
  Promo wandert.
- *Als Macher* möchte ich aus einem geprüften Flow ein ruhiges Video bauen,
  damit ich meine Arbeit zeigen kann, ohne ein Videostudio zu sein.
- *Als App-Entwickler* möchte ich denselben Flow auf Android prüfen, inkl.
  Absturz-/ANR-Erkennung und „landet der Tap im richtigen Screen?".

---

## 5. Funktionsumfang (was existiert)

| # | Fähigkeit | Beschreibung |
|---|---|---|
| F1 | **QA-Capture** | Playwright steuert einen echten Browser; Screenshots, Konsolen- & Netzwerkfehler. |
| F2 | **Analyse & Score** | Optionale Vision-Analyse, Schweregrad, Score, klarer Report. |
| F3 | **Autonomer QA-Loop** | find → fix → rebuild → retest, bis ein Flow hält (KEEP-BEST, NEVER-WORSE-Rollback). |
| F4 | **Design-Baseline** | Mockup als Messlatte; Position/Größe/Text/Farbe pixelgenau; `design-check` + `design-iterate`; Web **und** Android. |
| F5 | **Flow-Verifikation** | `action → expect`: landet der Tap/Klick im erwarteten Screen? Inkl. `expect.baseline`. |
| F6 | **Video-Pipeline** | Aus verifizierten Flows; Szenen-Templates, Brand-Presets, Seitenverhältnisse. |
| F7 | **Polish-Schicht** | Geführter Cursor, Auto-Zoom, Speed-Ramping/Slow-Mo, GIF-Export. |
| F8 | **Anti-Slop-Gate** | Lint + QA-Gate vor dem Rendern: kein kaputter Screen wird beworben. |
| F9 | **Vertonung** | Lokale, key-freie Stimme (Kokoro); BYOK (z. B. ElevenLabs) optional mit Fallback. |
| F10 | **Android-QA** | Echte Geräte/Emulatoren via ADB; Exploration, Crash-/ANR-Erkennung. |
| F11 | **Configurator-GUI** | Web-Oberfläche: Marke, Stimme, Format per Klick; Alternative zur CLI. |
| F12 | **Key-free Medien** | Bilder via Pollinations, Stimme via Kokoro — ohne Schlüssel nutzbar. |

---

## 6. Anforderungen

### Funktional (FR)
- **FR-1** Ein einzelner Befehl prüft eine URL: `cue qa <url>` → Report mit Score.
- **FR-2** `--loop` führt den autonomen Verbesserungszyklus aus; Ergebnis darf nie schlechter werden als der Ausgangszustand (Rollback).
- **FR-3** `--fail-on <severity>` liefert einen Exit-Code für CI-Gates.
- **FR-4** `design-check`/`design-iterate` akzeptieren eine Baseline-Spec (Datei oder inline) und liefern Score + Abweichungen; `--platform web|android`.
- **FR-5** Die Video-Pipeline rendert nur Flows, die das Gate bestehen.
- **FR-6** Vertonung funktioniert ohne API-Schlüssel (lokaler Fallback Pflicht).
- **FR-7** GIF-Export aus dem fertigen Video (`cue gif` bzw. `--gif`).
- **FR-8** Android-Pfad scheitert *sauber* (klare Meldung) ohne Gerät/SDK.

### Nicht-funktional (NFR)
- **NFR-1 Determinismus.** Renders sind reproduzierbar (Frame-Scrubbing, feste Seeds); QA-Vergleiche sind strukturell, nicht zufällig.
- **NFR-2 Key-free.** Kernnutzen ohne Schlüssel; Schlüssel sind optionale Verbesserung.
- **NFR-3 Offenheit.** Quelloffen; jedes Ergebnis ist nachvollziehbar.
- **NFR-4 Ehrlichkeit.** Was nicht getestet ist, wird als solches benannt; keine schönen Lügen.
- **NFR-5 Zugänglichkeit der Ausgabe.** Videos respektieren Anti-Slop-Regeln (seekbar, keine nicht-deterministische Animation).
- **NFR-6 Lokalität.** Läuft lokal; kein Cloud-Zwang, keine Telemetrie-Pflicht.
- **NFR-7 Mensch im Urteil.** Das Werkzeug misst Struktur, nicht Geschmack. Ästhetische Endabnahme bleibt beim Menschen — bewusst dokumentiert, nicht versteckt.

---

## 7. UX- & Markenprinzipien

- **HEARTHWORK „Wonder + Warmth".** Ruhig, warm, ehrlich. Glut statt Feuer.
- **Anti-Hard-Sell.** Der Standardpfad bietet *verstehen* und *ausprobieren*,
  nicht *kaufen*. Der Preis lebt hinter einem leisen, ehrlichen Link.
- **Zwei CTAs, beide warm:** „mehr erfahren / austauschen / Ideen einbringen" und
  „unverbindlich ausprobieren — free 4 ever (Shareware)".
- **Stimme.** Sentence case, keine Ausrufezeichen, verb-first, „du"/„wir".

---

## 8. Technische Architektur (Ist-Stand)

- **Laufzeit:** Node.js-CLI (`bin/cue.js`) + reiner Node-Configurator-Server.
- **QA:** Playwright/Chromium (Web), ADB (Android).
- **Rendering:** HTML/CSS/GSAP-Szenen → headless Chromium Frame-Scrubbing → ffmpeg.
- **Audio:** Kokoro (lokal, key-free) mit BYOK-Fallback; ffmpeg-Mix.
- **Bilder:** Pollinations (key-free) / optionale Provider.
- **Determinismus:** Szenen-Hash + Segment-Cache; Anti-Slop-Lint vor Produktion.
- **Verteilung:** `npx github:Lootziffer666/CUE-AGENT`.

---

## 9. Erfolgskriterien

- Ein neuer Nutzer kommt mit *einem* Befehl zu einem QA-Report (ohne Schlüssel).
- Der QA-Loop verbessert einen messbaren Score, ohne ihn je zu verschlechtern.
- Das Tool kann **sich selbst** bewerben (Dogfooding: eigenes Promo + Tutorial). ✓ erreicht.
- Anti-Slop-Gate blockt ungeprüfte Inhalte zuverlässig.
- Qualitative Resonanz (Discussions, Ideen, Beiträge) statt aggressiver Conversion.

---

## 10. Annahmen & Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Lokale Stimme klingt für DE-Text holprig (englische Kokoro-Stimme) | Promo wirkt weniger poliert | DE-Stimmen-Mapping / BYOK-TTS dokumentiert als Option |
| Agent „blind für Ästhetik" | Falsches Vertrauen in Optik | NFR-7: Mensch entscheidet; Vorschau-Renders zur Abnahme |
| Android-Loop braucht Emulator + Build | Live-Pfad nicht überall testbar | Mess-Hälfte verifizierbar; Live-Pfad klar als gerätegebunden markiert |
| Pollinations/Kokoro-Verfügbarkeit | Key-free-Pfad wackelt | Provider austauschbar; BYOK als Fallback |

---

## 11. Packaging & Preis (Verweis)

Produkt, kein Abo. **Free 4 Ever (Shareware)**, **Maker (einmalig)**,
**Studio (einmalig)**. Details, Kalkulation und Monetarisierung:
siehe [`pricing-and-monetization.md`](./pricing-and-monetization.md).

---

## 12. Offene Punkte / Roadmap-Kandidaten

- Deutsche Stimme für die lokale Vertonung.
- Cursor-Ziele aus echten Klick-Koordinaten statt geschätzter Highlights.
- Configurator-Timeline-UI für manuelle Zoom-/Trim-Regionen.
- Web-`design-iterate` mit echtem LLM-Proposer end-to-end.

---

## 13. Anhang — Warum retrospektiv?

Ein klassisches PRD legt Anforderungen *vorher* fest. Dieses entstand *nachher*,
weil das Produkt iterativ aus verifizierten kleinen Schritten wuchs — Mensch +
Agent, PR für PR. Der Reiz: Man sieht, welche Anforderungen sich **bewährt**
haben, statt zu raten, welche man bräuchte. Das passt zur Haltung des Tools
selbst: erst der Beweis, dann die Behauptung.
