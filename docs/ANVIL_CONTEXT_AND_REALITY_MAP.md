# ANVIL — Kontext & Reality-Map (Arbeitsnotiz)

> Festgehalten aus einer Konsolidierungs-Session, damit nichts erneut erarbeitet
> oder geklont werden muss. **Arbeitsdokument, kein Vertrag** — Stand wie notiert,
> Abstammungen vom Maintainer bestätigt.

## ANVIL in einem Satz
Übergreifendes Projekt: ein **KI-Indie-Studio** (Apps, später Spiele) als
**Monorepo**, governance-getrieben (Registry-first, Module-Contract, Gates,
Reality-Lock). Ziel: aus Ideen + Zielbildern weitgehend autonom App-/Spiel-
Prototypen erzeugen. **Bisher hat ANVIL selbst noch nichts produziert** — die
existierenden Produkte wurden alle vom Maintainer von Hand gebaut.

## CUE-AGENTs Platz in ANVIL
- Kanonisches **Maschinerie-Modul**: QA + Design-Iteration + (Promo-)Video.
- Bereits **LLM-agnostisch** über den ANVIL-BELLOWS-Proxy (`CUE_LLM_*`).
- Modularisierung = **geringer Aufwand** (stabile Public-API + `module.json` +
  Registry-Eintrag) — sollte über ANVILs eigene Governance laufen.
- Layout-Wunsch: **`/packages/*`** (zu vereinheitlichen mit dem bestehenden
  `modules/`- bzw. `anvil-kmp/modules/`-Schema → ein Governance-Update).

## Reality-Map

### 🏗️ Maschinerie → in ANVIL konsolidieren
| Linie | Häutungen (→ Archiv) | Kanonisch |
|---|---|---|
| Gateway / LLM-Router | BELLOWS, OPENDORK | **ANVIL-BELLOWS** |
| Core / Orchestrierung | CATALON | **ANVIL** (CATALON *ist* ANVIL geworden) |
| Handoff / Framework | DEAFPIPER | **DEAF** |
| API-Tool ("Postman-lite") | APISniffer | **THERAPI** (kann auch Produkt werden) |
| QA / Video | — | **CUE-AGENT** |
| Tools | — | RAPIER · SKILLZ · BILDA · APKNOWLEDGE · NUGGETZ · repo-guard-bootstrap |

### 🤔 ANVIL-Kandidat
- **APP-LAB** — „1 Engine → 80 Apps" (basiert auf FLUBBER). Passt evtl. *als* die
  App-Generierungs-Engine der Werkbank.

### 🎨 Design-Fundament (4 Anläufe → **einer** zu Ende)
- **FLUBBER** (Flutter-DS: single-hand control + liquid-motion grammar) ·
  DESIGN_SYSTEM · HEARTHWORK · Homepage.
- *Befund:* vier unfertige DS-Anläufe sind vermutlich der Grund, warum UIs
  (z. B. CatchIt) seit Monaten klemmen — es fehlt **ein** fertiges Fundament.

### ⑂ Arm's-length-Forks (fremde Lizenz — NICHT verschmelzen)
- ANVIL-FORGE (Google-Gallery-Fork) · ANVIL-CLIENT (opencode-Fork) · SUPABASE(?)

### 📦 Portfolio (eigene Produkte — bleiben eigenständige Repos)
- ⭐ **FLOW-SPIN-SMASH** (Sprach-Toolchain — das größte Projekt)
- ⭐ **CatchIt** (intent-first Transit — siehe Notiz unten)
- **PHAROS** (SSOT aus Dokumenten via DB-Abgleich) · **GRID** (GitHub für
  „Normalos") · **VENT** (Steam-Companion für Android)
- **APP-LAB** (s. o.) · Launcher/Intent: INTENT · TAVI(+TAVI-MODULES) ·
  BORDERLINE · KIDS_LAUNCHER · **LAUNCHPAD** (*unabhängig von ANVIL*)
- **KYUUBI** (FLUBBER/devvit Reddit-Mod-APK) · **INFINITE-HEROES-REMIX**
  (DnD-Comic-Generator: Multi-Issue, Crossover, GM-Modus) · THE-LITTLE-WAR-SHOW
  (Godot) · HORRORGETICON-OPS (Event-App) · adult_game · spectacular_spectacular
- Utilities: TABULA · pdf_spltter_pro · DocuPilot · OutreachPilot_GUI

### 🗑️ Archivieren (abgelöst/leer — nicht löschen, Maintainer-Regel)
- Häutungen: CATALON · DEAFPIPER · BELLOWS · OPENDORK · APISniffer
- Tot: ScoreDock (FLOW-Benchmark) · FLOW_old · SPIN · SMASH · CatchIt_old ·
  BORDER_GEMINI (AI-Studio-Sample) · SWIFT (leer)

### 💤 Geparkt
- FLAMMI (Kinderbuch für den Sohn, transmedial — kein aktives Repo)

### ❓ Noch zu klassifizieren
- `docs`, `SUPABASE` (Infra / Produkt / tot?)

## Leitlinien (konstruktiv)
- **Schutz kommt aus *ausführbarer* Verifikation** (CI / Tests / QA-Loop), nicht
  aus Prosa-Gates. Genau die Richtung, die CUE-AGENT bereits verkörpert
  (CI-Compile-+-QA-Gate, Design-Baseline, „verify, don't claim").
- **~30 Repos → ~7–8 kanonische Konzepte + Portfolio.** Tote/umbenannte
  archivieren (nicht löschen).
- **Registry-first:** Konsolidierung beginnt mit einem Registry-Eintrag, nicht
  mit dem Verschieben von Code.

## CatchIt — Notiz für später (kein Jetzt-Projekt)
- **Design-Philosophie:** „so wenig wie möglich, immer so viel wie nötig" —
  intent-first Transit, **1 Surface / viele Zustände**, horizontale Planung /
  vertikale Ausführung, Gesten, Wizards; **keine** Kacheln/Pillen/Tabellen/
  Vergleichslisten. = ANVILs eigene Prinzipien (`anti-dashboard`,
  `state-surface-design`), nur noch nicht als CatchIt-Spec gebündelt.
- **Stand:** PHAROS als SSOT-Tool (93 von 400+ Docs enthalten die Vorgaben).
  ~50 Zustände, ~30 % noch Drift, ~70 % würden für eine Alpha reichen.
- **Aktueller Blocker:** Sitemap + Userflow (*nicht* Customer Journey).
- **Schlüssel-Insight:** Für eine State-Surface-App ist die **Sitemap ein
  Zustands-Graph (kein Seitenbaum)** und der **Userflow = absichtsgetriebene
  Übergänge** (Kanten). Konventionelle Sitemap/Userflow-Tools erzwingen einen
  Seitenbaum → genau daran reibt es sich.
- **Anschluss an CUE-AGENT:** Dieser Zustands-/Übergangs-Graph ist **dasselbe
  Format** wie CUE-AGENTs Flow-Spec (`action → expect`). Was CatchIts Userflow
  entsperrt, prüft/iteriert CUE später — **keine Wegwerf-Arbeit**. Ein realistischer
  Alpha-Unlock: die ~70 % stabilen Zustände als Graph modellieren.
