# AI QA-Design-Iterations-Loop

> Der Sprung vom *Berater* zum *Macher*: nicht „hier sind die Möglichkeiten,
> schau wie du klarkommst" — sondern **ein autonomer Kreislauf, der gegen die
> Design-Baseline iteriert, bis die Messlatte erreicht ist.**

## Der Loop
```
   Ziel-Baseline (Mockup + pixelgenaue JSON)
        │
        ▼
   ┌── messen ───────────────────────────────┐
   │  captureActual()  → Ist-Elemente         │
   │  compareToBaseline() → Score + Abweichung│◄────────────┐
   └──────────────────────────────────────────┘             │
        │ Score < Ziel?                                      │
        ▼                                                    │
   proposeEdits(Abweichungen)  → konkrete Code-Änderungen    │
        ▼                                                    │
   applyEdits()  → anwenden   →  rerender()                  │
        │                                                    │
        └──── erneut messen ─────────────────────────────────┘
        │ Score ≥ Ziel  ODER  maxIterations
        ▼
   bester Stand + Iterations-Protokoll
```

Implementierung: **`src/qa/design-iterate.js` → `iterateToBaseline({...})`**.
Die *Fortschrittsfunktion* ist der **deterministische Baseline-Score** aus
`design-baseline.js` — Konvergenz ist damit **messbar**, nicht „Bauchgefühl".

## Sicherheits-Leitplanken (verbindlich)
- **NEVER-WORSE:** Eine Iteration, die den Score senkt, wird **automatisch
  zurückgerollt** und verworfen — keine Regressionen.
- **KEEP-BEST:** Der beste erreichte Stand wird stets behalten.
- **Begrenzt:** harte Obergrenze `maxIterations`; Stop, sobald kein Vorschlag
  mehr kommt.
- **Nachvollziehbar & reviewbar:** jede Iteration (Score, Severity, angewandte
  Edits, Annahme/Ablehnung) wird protokolliert. Gedacht für die Anwendung auf
  einem **Branch/einer Kopie** — der Mensch merged die finalen Diffs.

## Adapter (plattformspezifisch injiziert)
| Adapter | Web | Android |
|---|---|---|
| `captureActual()` | Playwright: DOM-BBox + `getComputedStyle`-Farbe | `uiautomator`-BBox + Farb-Sample |
| `proposeEdits()` | LLM (über ANVIL-BELLOWS-Proxy): konkrete CSS/Markup-Änderung | LLM: Layout-XML/Compose-Änderung |
| `applyEdits()` | Datei-Writer (reversibel) | Datei-Writer (reversibel) |
| `rollback()` | letzte Edits rückgängig | dito |
| `rerender()` | Re-Capture der Seite | App neu bauen/installieren *(langsam — CI/Emulator)* |

## Bereits nutzbar
- **`cue design-check --baseline spec.json --actual elements.json [--fail-on high] [--json]`**
  prüft eine erfasste UI gegen die Baseline und schreibt `qa-reports/design-<ts>.{md,json}`
  (Score, Severity, Soll-Ist je Element). CI-Gate via `--fail-on`.
- **`iterateToBaseline(...)`** — die Loop-Engine (durch Stubs getestet:
  Konvergenz, NEVER-WORSE-Rollback, max-Iterations).

## Status der Wiring-Schritte
- ✅ **Web-Adapter** (`src/web/dom-adapter.js`): Playwright-`captureActual` (DOM-BBox + Computed-Color + Text), `applyEdits`/`rollback` via injizierte CSS-Overrides (non-destruktiv, kein Quellcode der Zielseite berührt). **Live verifiziert**: Loop konvergiert auf echtem Chromium (Score 50→100 in 1 Iteration, finale CSS-Diff erzeugt).
- ✅ **`cue design-iterate --url <url|file://> --baseline spec.json [--target 95] [--max 5] [--json]`**: verdrahtet Adapter + Proposer + Engine, schreibt `qa-reports/design-iterate-<ts>.{json,css}` (Protokoll + finale CSS-Diff).
- ✅ **`proposeEdits`** (`src/qa/propose-edits.js`): OpenAI-kompatibel über den ANVIL-BELLOWS-Proxy (multimodal: Screenshot + Mockup + Abweichungen → CSS-JSON). **Greift, sobald `CUE_LLM_BASE_URL/MODEL` gesetzt sind** — sonst stoppt der Loop sauber (nur Messung).
- ⏳ **Live-Lauf mit echtem LLM**: benötigt nur einen laufenden Proxy/Key (Code steht).
- ✅ **Android-Adapter** (`src/android/design-adapter.js`): Mess-Hälfte `captureActual` via uiautomator (resource-id/Text → BBox; Farbe=null → Comparator überspringt Farb-Check mit Hinweis). Edit-Hälfte = Source-Patch (`applyEdits`/`rollback` auf echten Dateien, getestet) + `makeRerender` (rebuild+install). **Loop verifiziert** mit echtem Android-`applyEdits`/`rollback` (0→100).
- ⏳ **Android live**: läuft im Emulator/CI/Homelab (langsamer rebuild-Zyklus); offen sind der Android-Proposer (LLM → Source-Patches `{file,find,replace}`) und die `design-iterate --platform android`-CLI-Anbindung.

## Abgrenzung
Das ist QA-Kern: das Produkt **aktiv** an die Vorgaben heranführen — gemessen,
sicher, reviewbar. Ergänzt Soll-Ist-Flow + Bug-Doku + Design-Baseline zur
vollständigen „erfüllt & erreicht das Produkt die Vorgaben?"-Schleife.
