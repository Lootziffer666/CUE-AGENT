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

## Nächste Wiring-Schritte (brauchen Render-/LLM-Umgebung)
1. **Web-Adapter**: Playwright-`captureActual` + CSS-`applyEdits`/`rollback` → erster
   vollständiger Live-Loop (am einfachsten, da Re-Render = Reload).
2. **`proposeEdits` über den ANVIL-BELLOWS-Proxy** (free Gemini, multimodal:
   Screenshot + Mockup + Abweichungsliste → konkrete Diffs).
3. **`cue design-iterate`** CLI, die alles verdrahtet, auf einem Arbeits-Branch
   läuft und am Ende die Diffs + das Iterations-Protokoll zur Review vorlegt.
4. **Android-Adapter** (langsamer Build-Zyklus, daher nach Web).

## Abgrenzung
Das ist QA-Kern: das Produkt **aktiv** an die Vorgaben heranführen — gemessen,
sicher, reviewbar. Ergänzt Soll-Ist-Flow + Bug-Doku + Design-Baseline zur
vollständigen „erfüllt & erreicht das Produkt die Vorgaben?"-Schleife.
