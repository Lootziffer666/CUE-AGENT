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
| **Cursor-Politur: Smoothing, Motion-Blur, Click-Bounce, Sway, Größe, Loop** | ✅ Synthetischer Cursor-Layer (SVG/CSS), GSAP-Tween zum Highlight + Klick-Puls/Ring | `src/render/polish.js`, `scene.highlight.cursor` | ✅ **B** |
| **Webcam-Bubble (Position, Mirror, Roundness, Shadow, zoom-reaktiv)** | optionaler Overlay-Layer (Video/Bild) als CSS-Kreis mit Presets; zoom-reaktiv via GSAP | `render-scene.js` Overlay-Slot | **C** |
| **Speed-Regions (Speed-up/Slow-down)** | ✅ ffmpeg `setpts`-Stage (Skalar `clip.speed` oder `clip.speedRegions`), Dauer wird nachgeführt | `src/render/speed.js`, `src/render/builtin.js` | ✅ **B** |
| **Annotationen (Text/Bild/Figur)** | Overlay-Annotations als Szenen-Elemente mit Timing | `render-scene.js`, Storyboard | **C** |
| **Trims** | Segment-Cut im Storyboard/Timeline | Configurator | **B** |
| **Extra-Audio-Regionen** | zusätzliche Audiospuren im Mix | `src/audio/mix.js` | **C** |
| **Crop** | CSS-Crop / Capture-Clip | `render-scene.js` | **C** |
| **GIF-Export (fps, Loop, Größen-Presets)** | ✅ ffmpeg-GIF (palettegen/paletteuse) — `cue gif` / `cue render --gif` | `src/render/gif.js`, `bin/cue.js` | ✅ **B** |
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

**Polish-Phase B — Bewegung & Export** ✅ *(umgesetzt & verifiziert)*
- ✅ Synthetischer **Cursor-Layer**: SVG-Cursor fährt zur Highlight-BBox + Klick-Puls + auslaufender Ring — `src/render/polish.js::cursorTimeline/cursorMarkup/cursorOverlayCss`, aktiv via `scene.highlight.cursor: true`. Cursor liegt im `.screenshot-wrap`, d. h. seine %-Koordinaten = Highlight-Koordinaten.
- ✅ **Speed-Ramping** (Zeit-Remap via ffmpeg `setpts`) — `src/render/speed.js::buildSpeedStage`, integriert in `renderClipSegment`. Zwei Modi: `clip.speed` (Skalar, z. B. `0.5` Slow-Mo / `2` schnell) oder `clip.speedRegions: [{start,end,speed}]` (Regionen, Lücken werden mit 1× aufgefüllt). Effektive Clip-Dauer wird automatisch nachgeführt (Fade-Out + Concat-Timing).
- ✅ **GIF-Export** (zwei-Pass `palettegen`/`paletteuse`, hohe Qualität) — `src/render/gif.js::exportGif`. CLI: `cue gif <mp4> [--out --fps --width --start --duration --loop]` oder `cue render <dir> --gif [--gif-fps --gif-width]`.
- ⏳ **Trims** als Timeline-Segment im Configurator (UI) — offen (Speed/Regions decken den Großteil ab; reiner Schnitt folgt mit der Timeline-UI).
- *Verifiziert:* Speed-Skalar 4 s→2.0 s & Region 6 s→7.0 s (echte ffmpeg-Läufe, ffprobe-geprüft); GIF 89a real erzeugt; Cursor-Szene live in Chromium (Timeline seekbar, Cursor bewegt sich, Anti-Slop-Lint sauber).

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
