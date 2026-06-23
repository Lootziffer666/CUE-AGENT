# CUE-AGENT — Review & Status (2026-06-23)

> Unabhängige Prüfung, Reparatur und Beurteilung des Stands. Durchgeführt mit
> einem Modell, das Bilder/Videos **tatsächlich sehen** kann — die Test-Videos,
> die Website und die generierten Bilder wurden visuell begutachtet (nicht nur
> der Code gelesen).

## Kurzfassung: Wo du stehst

**Das Projekt ist „fertig genug" zum Zeigen — mit einem wichtigen Fix.** Beide
Hälften des Tools funktionieren end-to-end: die QA/Capture-Engine **und** die
Video-Pipeline. Ich habe einen Bug gefunden, der die Video-Erzeugung in
gesandboxten/offline Umgebungen still kaputt gemacht hat, und ihn behoben. Das
neu gerenderte Promo erreicht jetzt exakt die Qualität und Länge des
committeten Demos (68 s, 8 animierte Szenen). Marketing-Site, Configurator-GUI
und das neue Logo sind verdrahtet und visuell geprüft.

## Was ich ausgeführt und verifiziert habe

| Bereich | Ergebnis |
|---|---|
| `cue doctor` | ✓ Node, Playwright Chromium, ffmpeg/ffprobe grün (API-Key ist BYOK) |
| `cue promo --script …` (Video-Pipeline) | ✓ End-to-end, 8 Szenen, 68 s, korrekte Animationen |
| `cue capture <url>` (Capture-Engine, key-frei) | ✓ webm + Console + Network + a11y + Metrics + Screenshots |
| `cue qa <url>` ohne Key | ✓ bricht **sauber** mit klarer Meldung ab (kein Crash) |
| `cue configurator` (Web-GUI) | ✓ Server startet, GUI lädt, Logo + Favicon sichtbar, Scrub-Player offline-fähig |
| Marketing-Site (`marketing/site/`) | ✓ rendert korrekt (Hero, Cards, Pricing-Sheet, Mobile) |
| Test-Videos (`demo/`, `docs/promo/`) | ✓ visuell geprüft: saubere Title-/Feature-Szenen, echte GUI-Captures im Tutorial |
| Generierte Bilder (Site-Hero, Editorial etc.) | ✓ stimmig zum „warme-Werkstatt"-Thema, keine Artefakte |

## Der kritische Fix: GSAP wurde vom CDN geladen

**Symptom:** Beim ersten Render warnte der Renderer für *jede* Szene
„GSAP-Timeline fehlt … Szene wird statisch gerendert", und alle Szenen
kollabierten auf die Default-Dauer von 3 s. Das Promo wurde 24 s statt 68 s
und ohne Animationen.

**Ursache:** `src/templates/scenes.js` band GSAP per
`<script src="https://cdnjs.cloudflare.com/…/gsap.min.js">` ein. Der
Headless-Browser konnte die Ressource in dieser Umgebung nicht laden
(`ERR_CERT_AUTHORITY_INVALID` am Sandbox-Proxy). Ohne GSAP ist
`window.__timeline` undefiniert → statischer Fallback. Das widerspricht dem
Kernversprechen des Tools („reproduzierbar, offline, ohne jeden Key").

**Fix:** GSAP wird jetzt lokal gevendort (`src/render/vendor/gsap.min.js`) und
**inline** in jede Szene eingebettet, statt vom CDN geladen. Szenen bleiben
eigenständige, portable Dateien und rendern deterministisch offline. Verifiziert:
neuer Render = 68 s, alle 8 Szenen mit Timeline, keine Warnungen mehr. Das
behebt zugleich die Live-Vorschau im Configurator (lief offline ebenfalls ins
Leere).

## Logo

Das beigefügte Logo (roter Hammer-Check + Krone + Füllerfeder) ist als
**aktuelles Primär-Logo** verdrahtet — es ist die sauberste Realisierung des
„ANVIL-SPARK"-Konzepts und liest sich klar auf hellem **und** dunklem Grund.
(Der ältere `brand/spark-emblem.png` wirkte unfertig: Krone eher wie eine Kelle,
Feder zu klein.) Eingebaut als **Platzhalter** — überall denselben Datei-/
Quellnamen referenziert, also jederzeit austauschbar:

- `brand/cue-logo.png` (Master), `…-transparent.png` (dunkle Flächen), `…-256.png` (Web)
- Configurator-Header + Favicon (inline, da der Server kein Static-Serving hat)
- Marketing-Site: Wordmark in Nav **und** Footer, plus Favicon
- Site-Preview-Bilder (`site-hero/-pricing/-mobile.png`) und
  `docs/promo/configurator-gui.png` mit neuem Logo neu generiert

## Beurteilung

Solide, durchdachte Arbeit für ein „Nebenprojekt". Stärken:

- **Klare Architektur** (68 JS-Dateien, ~7.600 Zeilen): QA, Capture, Render,
  Audio, Design-Systeme, Configurator sauber getrennt.
- **QA-first-Disziplin** mit echtem Gate (kein Promo ohne bestandene QA).
- **Key-frei lauffähig** (Kokoro-TTS, lokaler Renderer) — jetzt auch wirklich
  offline, nachdem die CDN-Abhängigkeit weg ist.
- **Dogfooding**: das Tool bewirbt sich glaubwürdig selbst.
- **Marketing-Paket** (Site, Deck, PRD, Pricing) ist überraschend ausgereift und
  ästhetisch konsistent.

## Empfehlungen — Status

Die drei Empfehlungen aus der ersten Review sind **umgesetzt**:

1. **✓ Echtes SVG-Logo.** `brand/cue-logo.svg` aus dem PNG per Farb-Layer-Trace
   (potrace) erzeugt — skalierbar, ~6 KB, statt PNG-Colorkey. Inline im
   Configurator-Header, als Wordmark in der Marketing-Site (Nav + Footer) und als
   SVG-Favicon verdrahtet. Raster-PNGs bleiben als Social-/Fallback-Assets.
2. **✓ `cue qa` ohne Key nützlich.** Fehlt der LLM-Key, bricht QA nicht mehr ab,
   sondern liefert Capture + Konsolen-, **Netzwerk-** und Accessibility-Befunde
   plus Score/Report (Exit 0); nur die Vision-Analyse wird sauber übersprungen
   und im Report gekennzeichnet. Netzwerk-Fehler (4xx/5xx) fließen jetzt in die
   Severity ein (`src/qa/severity.js`, `index.js`, `report.js`).
3. **✓ Smoke-Tests.** `test/` mit Nodes eingebautem Runner (keine neue
   Dependency), via `npm test`: Severity-Logik inkl. Netzwerk, „Szene bettet GSAP
   inline ein (kein CDN)" und ein End-to-End-Render-Test, der prüft, dass eine
   5s-Szene 5s bleibt (fängt die GSAP-Kollaps-Regression). Alle grün.

### Noch offen

- **Logo final ersetzen:** `cue-logo.svg` ist eine getreue Vektorisierung des
  Platzhalters; ein von Hand gezeichnetes „echtes" Marken-SVG kann es jederzeit
  ablösen (alle Stellen referenzieren dieselbe Quelle).
- **ffmpeg im Doctor:** weiterhin als „optional" gelabelt, obwohl faktisch
  Pflicht für jedes Video — bewusst nicht geändert, um die Exit-Code-Semantik des
  Doctors (Pflicht- vs. optionale Checks) nicht umzudeuten. Kandidat fürs nächste
  Release.

