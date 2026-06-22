# CUE-AGENT — Polish-Layer-Plan (Clean-Room-Adoption)

> Ziel: Die **Politur-/Editing-Stärken**, für die [`Recordly`](https://github.com/webadderallorg/Recordly)
> (17k★) zu Recht gefeiert wird, in CUE-AGENTs Video-Pipeline **unabhängig nachbauen** —
> auf unserem GSAP/HTML-Renderer, getrieben von dem, was CUE-AGENT bereits *weiß*
> (Klick-Koordinaten, Flow-Schritte, QA-Befunde).

> ## ⚖️ Lizenz / Clean-Room — verbindlich
> Recordly steht unter **AGPL-3.0**. Wir übernehmen **ausschließlich Feature-/UX-Ideen**
> (Ideen sind nicht urheberrechtlich geschützt), **niemals Quellcode**. Es wird **kein**
> Recordly-Code gelesen, kopiert oder vendored. Diese Liste ist eine reine Capability-
> Checkliste aus dessen öffentlicher README — die Implementierung erfolgt eigenständig in
> CUE-AGENT (GSAP/CSS/Playwright/ffmpeg). So bleibt CUE-AGENT bei seiner eigenen Lizenz.

---

## Warum wir das besser können (statt nur nachzumachen)
Recordly poliert **menschlich aufgenommene** Bildschirmvideos und *rät* Zooms aus der
Cursor-Bewegung. CUE-AGENT nimmt Flows **automatisiert** auf und **kennt die Interaktionen
exakt** (Playwright-Click-Events / ADB-Taps / Flow-Schritte). Daraus folgt:

- **Deterministischer Auto-Zoom** auf das *tatsächlich geklickte Element* (Bounding-Box aus
  der Aufnahme), nicht heuristisch aus Cursor-Zittern.
- **Synthetischer, sauberer Cursor**, der exakt zu bekannten Klickpunkten fährt — kein
  „echter Cursor sichtbar"-Problem (Recordlys Linux/altes-Windows-Limit entfällt bei uns).
- **QA-verifizierte Footage**: Wir polieren nur Flows, die das Soll-Ist-Gate bestanden haben
  — „kein kaputter Screen wird hübsch gerendert".

---

## Feature-Paritäts-Matrix (Recordly-Capability → CUE-AGENT-Plan)

| Recordly kann | CUE-AGENT-Umsetzung (eigenständig) | Andockpunkt | Prio |
|---|---|---|---|
| **Auto-Zoom aus Cursor-Aktivität** | Zoom-Region pro bekanntem Klick/Tap (Element-BBox zur Aufnahmezeit gemessen → GSAP-Scale am Wrapper) | `src/core/capture.js` (BBox + `tClick`), `src/render/builtin.js` | **A** |
| **Manuelle Zoom-Regionen** | Zoom-Region als Timeline-Segment im Configurator | `web/configurator.html` (Timeline), Storyboard | **A** |
| **Styled Frame: Wallpaper/Solid/Gradient, Padding, Rounded, Blur, Shadow** | CSS-Frame-Wrapper um die Szene (rein deklarativ, deterministisch seekbar) | `src/templates/render-scene.js`, Brand-Presets | **A** |
| **Aspect-Presets fürs Endbild** | bereits vorhanden (16:9, 9:16, 1:1, 4:5) → Frame-Wrapper respektiert sie | `src/config` ASPECT_DIMENSIONS | ✅ teils |
| **Cursor-Politur: Smoothing, Motion-Blur, Click-Bounce, Sway, Größe, Loop** | Synthetischer Cursor-Layer (SVG/CSS), GSAP-Tween entlang bekannter Klickpunkte; Bounce/Blur als CSS/Filter | neuer `src/render/cursor.js` + GSAP | **B** |
| **Webcam-Bubble (Position, Mirror, Roundness, Shadow, zoom-reaktiv)** | optionaler Overlay-Layer (Video/Bild) als CSS-Kreis mit Presets; zoom-reaktiv via GSAP | `render-scene.js` Overlay-Slot | **C** |
| **Speed-Regions (Speed-up/Slow-down)** | Zeit-Remap-Segmente: beim Frame-Scrubbing `t`-Mapping pro Region | `src/render/builtin.js` (Scrub-Loop) | **B** |
| **Annotationen (Text/Bild/Figur)** | Overlay-Annotations als Szenen-Elemente mit Timing | `render-scene.js`, Storyboard | **C** |
| **Trims** | Segment-Cut im Storyboard/Timeline | Configurator | **B** |
| **Extra-Audio-Regionen** | zusätzliche Audiospuren im Mix | `src/audio/mix.js` | **C** |
| **Crop** | CSS-Crop / Capture-Clip | `render-scene.js` | **C** |
| **GIF-Export (fps, Loop, Größen-Presets)** | ffmpeg-GIF-Pfad (palettegen/paletteuse) neben MP4 | `src/render/builtin.js` / neuer `export.js` | **B** |
| **Export-Qualität / Dimensionen** | ffmpeg-CRF/Skalierung als Optionen | Render-Optionen | **B** |
| **Projektdatei (.recordly = Media + Editor-State)** | bereits vorhanden: `video-projects/<slug>/` + `*-bundle.json` + `storyboard.json` | bestehend | ✅ |
| **Community-Extensions/Marketplace** | bewusst out-of-scope (kein Plugin-Markt nötig) | — | — |

**Prio-Legende:** A = höchster Promo-Mehrwert & deterministisch machbar; B = mittel; C = später.

---

## Phasen (inkrementell, jede für sich lauffähig)

**Polish-Phase A — „Sofort sichtbarer Sprung"** ✅ *(umgesetzt & live verifiziert)*
- ✅ Deterministischer **Auto-Zoom** auf die bekannte Highlight-BBox (rein→halten→raus, Transform am Wrapper) — `src/render/polish.js::autoZoomTimeline`, integriert in `screenshotScene`.
- ✅ **Styled-Frame-Wrapper** (Gradient/Wallpaper-Backdrop, Radius, Schatten, optional Blur) — `framePresentationCss`, via `scene.frame`/`brand.frame`.
- ⏳ Manuelle Zoom-Region im Configurator-Timeline-Player (UI) — offen.
- *Live verifiziert (Chromium):* Frame-Gradient aktiv; Auto-Zoom scale 1.17→1.01 über die GSAP-Timeline.

**Polish-Phase B — Bewegung & Export**
- Synthetischer **Cursor-Layer** (Smoothing/Bounce/Größe).
- **Speed-Regions** (Zeit-Remap) + **Trims**.
- **GIF-Export** + Qualitäts-/Dimensions-Optionen.

**Polish-Phase C — Reichhaltigkeit**
- **Webcam-Bubble**-Overlay, **Annotationen**, **Crop**, Extra-Audio-Regionen.

---

## Anti-Slop bleibt Pflicht
Alle neuen Effekte unterliegen den bestehenden Anti-Slop-Lint-Regeln (Phase 4): Zoom/Bounce
als Transform am Wrapper (nicht an `<img>/<video>`), keine `clipPath`-Transitions, keine
nicht-seekbaren Animationen — sonst bricht der deterministische Frame-Scrub.

---

## Abgrenzung
Recordly = Capture + Politur (Desktop-GUI). CUE-AGENT = **QA-first-Bughunter + Orchestrator**,
der Politur als *eine* Fähigkeit dazunimmt. Wir bauen Recordlys Politur-Niveau nach, behalten
aber unseren Kern: Requirements, Bug-Doku, Soll-Ist-Userflow, QA-Gate vor jeder Promo.

*Honourable mention: Recordly (AGPL-3.0) hat die Messlatte für die Politur-Schicht gesetzt.
Übernommen werden ausschließlich Ideen, kein Code.*
