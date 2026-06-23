# CUE-AGENT — Eigen-Promo (Dogfooding)

CUE-AGENT bewirbt sich hier **mit sich selbst**: aufgenommen, gerendert und
poliert von der eigenen Pipeline.

![Promo-Vorschau](./cue-agent-promo.gif)

- 🎬 **Video (mit Stimme):** [`cue-agent-promo.mp4`](./cue-agent-promo.mp4) — 1280×720, ~94 s, h264 + AAC
- 🖼️ **Vorschau-GIF:** [`cue-agent-promo.gif`](./cue-agent-promo.gif) — via `cue gif` exportiert
- 🧰 **Echte Produkt-GUI** als Quelle: [`configurator-gui.png`](./configurator-gui.png)

## Was darin gezeigt wird (alles aus dieser Pipeline)
- **12 Szenen** (Title / Features / Screenshot / Clip / CTA), 6 Brand-Looks (hier: `linear`).
- **Cursor-Overlay + Auto-Zoom** (Polish-B) auf der echten Configurator-GUI-Szene.
- **Speed-Ramping** (Polish-B): der Bildschirm-Clip schaltet auf den wichtigen Moment in Zeitlupe (5 s Quelle → 6,5 s effektiv).
- **Voiceover lokal & key-frei**: ElevenLabs-Key war ungültig → automatischer Fallback auf **Kokoro** (lokal, Apache-2.0).
- **Anti-Slop-Lint sauber** → das interne QA-Gate für Promos war bestanden.
- **GIF-Export** (Polish-B) als letzter Schritt.

## Reproduzieren
```bash
# nimmt die echte Configurator-GUI auf, rendert + exportiert GIF
node scripts/build-self-promo.js examples/cue-agent-promo-v2.script.json

# Optional in voller Auflösung (1080p@30):
SELF_PROMO_FULL=1 node scripts/build-self-promo.js
```

> Hinweis: Für eine eigene Stimme `CUE_LLM_*` / ElevenLabs-Key setzen — sonst
> läuft die Stimme vollständig lokal über Kokoro (lädt einmalig ein Modell).
