#!/usr/bin/env node
"use strict";

/**
 * Postinstall-Hinweis (non-blocking).
 * Erklärt kurz, was als Nächstes zu tun ist — vor allem: eigene API-Keys setzen.
 */

// In CI / non-interaktiven Installs nicht spammen
if (process.env.CI || process.env.CUE_NO_POSTINSTALL) {
  process.exit(0);
}

const msg = `
CUE-AGENT installiert.

Naechste Schritte (mit DEINEN eigenen Keys):
  1) Browser installieren:   npx cue install-browsers
                             (oder: npx playwright install chromium)
  2) Keys setzen (.env im Projekt oder als Umgebungsvariablen):
       ANTHROPIC_API_KEY=...     (fuer QA-Analyse)
       ELEVENLABS_API_KEY=...    (optional, fuer Voiceover)
       FREESOUND_API_KEY=...     (optional, fuer Musik)
  3) Umgebung pruefen:       npx cue doctor
  4) Loslegen:
       npx cue qa https://deine-app.tld
       npx cue promo https://deine-app.tld --aspect 16:9

Hinweis: ffmpeg wird fuer die Video-Pipeline benoetigt (cue doctor zeigt den Status).
`;

console.log(msg);
process.exit(0);
