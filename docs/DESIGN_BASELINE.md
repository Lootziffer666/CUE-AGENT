# Design-Baseline — die Ziel-UI als messbare QA-Messlatte

> Idee: Mockups der **gewollten** UI hochladen und als **Messlatte** gegen die
> tatsächlich gerenderte UI prüfen. Damit deckt CUE-AGENT neben „landet der Tap
> im richtigen Screen?" (Flow) auch „**sieht der Screen aus wie die Vorgabe?**" ab
> — Requirements werden *messbar*, nicht nur beschrieben.

## Zwei komplementäre Formen (beide sinnvoll)

| Form | Stärke | Schwäche |
|---|---|---|
| **Bild** (`mockup.png`) | holistisch, schnell erstellt; gut für Pixel-/SSIM-Diff + **multimodale** LLM-Beurteilung („weicht etwas ab?") | unscharf bei akzeptablen Render-Unterschieden (Fonts, Anti-Aliasing, dynamische Inhalte) → braucht Toleranzen/Ignore-Regionen |
| **Pixel-genaue JSON** (Spec) | **deterministisch & reproduzierbar**: pro Element Position/Größe/Text/Farbe mit Toleranzen — streng bei dem, was zählt, tolerant beim Rest | muss erzeugt werden (Figma-Export, aus Bild ableiten, oder hand-kuratiert) |

**Empfehlung: beide kombinieren.** Die JSON-Spec ist der *harte Vertrag* (CI-tauglich, eindeutige Findings); das Bild liefert den holistischen Gegencheck. Ideal wird die JSON aus der Designquelle generiert (z. B. Figma-API) statt von Hand.

## Was bereits implementiert ist (`src/qa/design-baseline.js`)
Der **strukturelle (JSON-)Vergleich** — deterministisch, plattform-agnostisch, ohne externe Dependencies:
- `loadBaselineSpec(file)` — lädt + validiert die Spec (Defaults/Toleranzen).
- `compareToBaseline({ spec, actual })` — prüft je Soll-Element **Position, Größe, Text, Farbe** gegen das Ist (mit pro-Element-Toleranzen), erkennt **fehlende** Elemente (Nearest-Match nur innerhalb eines Radius), liefert `score` (0–100) + `severity` (`none`/`medium`/`high`) + Soll-Ist-Abweichungen pro Element.

Die `actual`-Elemente liefert der jeweilige Capture-Adapter:
- **Android**: `uiautomator`-BBox + Farb-Sample aus dem Screenshot.
- **Web**: DOM-BoundingBox + `getComputedStyle`-Farbe (Playwright).

Spec-Beispiel: `examples/design-baseline.example.json`.

## Integration in die Flow-Verifikation
Jeder erwartete Screen eines Flows kann eine Baseline referenzieren:
```jsonc
{ "id": "open-dashboard", "action": { "type": "tap", "text": "Login" },
  "expect": { "activity": "DashboardActivity", "baseline": "baselines/dashboard.json" } }
```
→ Beim Erreichen des Screens wird zusätzlich die Design-Baseline geprüft. So fließt „Soll-Optik" in dieselben QA-Findings/den QA-Score wie „Soll-Flow".

## Roadmap (nächste Bausteine)
1. **Bild-Diff** (Pixel/SSIM über Nicht-Ignore-Regionen) — benötigt einen PNG-Decoder (separater, optionaler Baustein).
2. **Figma-Import** → JSON-Spec automatisch generieren (statt hand-kuratieren).
3. **Multimodaler Holistik-Check** über den ANVIL-BELLOWS-Proxy (free Gemini): „nenne sichtbare Abweichungen zur Vorlage".
4. **`cue design-check <screenshot> --baseline spec.json`** als eigenständiger CLI-Befehl + Einhängen in `cue qa` / `cue android-qa`.

## Abgrenzung
Das ist QA-Kern (Design-Conformance als Requirement), nicht Promo-Politur. Ergänzt Soll-Ist-Flow und Bug-Doku zur vollständigen „erfüllt das Produkt die Vorgaben?"-Prüfung.
