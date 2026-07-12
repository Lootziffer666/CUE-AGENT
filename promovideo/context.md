# Product Context — Horrorgeticon Ops

## Product
- **Name:** Horrorgeticon Ops
- **URL:** http://localhost:8787
- **One-liner:** Der Leitstand für den Wahnsinn vor Ort — die komplette Event-Management-Plattform für die Horrornacht.
- **Tech stack:** Node.js 18+ (zero npm dependencies), PWA (Hearthwork-Design), Kotlin Multiplatform (Windows/Android/iOS)
- **Modules:** 23 Fachmodule — incidents, mazes, people, tasks, catering, chat, checklists, carpool, announce, breaks, schedule, kidsday, timeline, documents, reports, dnd …
- **Tests:** 241 API-End-to-End, 47 Browser-E2E, 150+ SSE load-test

## Audience
- **Who:** Horror event organizers, production crew managers (events with 50–300 crew)
- **Pain points:**
  1. Echtzeit-Koordination von 50+ Crew-Mitgliedern ohne Telefon-Chaos
  2. Maze-Zuteilung, Pausen-Management und Springer-Einsatz unter Live-Druck
  3. Vorfälle, Meldungen und Durchsagen in Stresssituationen koordinieren
  4. Ausfall-Risiko: eine einzige App-Abstürze am Abend des Events
- **Desired action:** Demo starten: `node server/main.js --demo`
- **Emotional journey:** Overwhelmed → In control → Confident

## Brand
- **Colors:** Dunkel-Navy (#0D2847), Glut-Orange (#FF6B2C), Rot (#C42B2B), Off-White (#F8F6F2)
- **Typography:** System-UI / Inter, schwere Gewichte
- **Tone:** Dramatisch, kraftvoll, professionell — Kontrolle im Chaos
- **Visual style:** Shadow Cut (dark cinematic — high contrast, dramatic reveals)

## Video Concept
- **Type:** Promo
- **Angle:** "The Transformation" — von Chaos zu Kontrolle
- **Duration:** 60 Sekunden
- **Theme:** Dark mode
- **Voice:** espeak-ng (de) — authoritative German TTS
- **Tagline:** "Horror nights are chaos. You need control."

## Features to Highlight
1. **Management Leitstand** — Live-KPIs, Event-Phasen, SLA-Badges, alle Bereiche auf einen Blick
2. **Maze Lead Tablet** — Split-Ansicht Team + Live-Karte (echte Energeticon-Grundrisse), Aufgaben-Inbox
3. **Scare Actor Phone** — Detail-Status, Quick-Actions (Pause, Warnung, Verspätung + ETA), DND-Modus
4. **Catering-Station** — QR-Scan, rotierende HMAC-Codes, Marken-Einlösung
5. **Resilience** — Circuit-Breaker, Hot-Reload, Offline-PWA, zero dependencies

## CTA
`node server/main.js --demo` · läuft in 2 Minuten · github.com/lootziffer666/horrorgeticon-ops
