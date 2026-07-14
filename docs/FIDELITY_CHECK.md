# `cue fidelity-check` — Behavioraler Vergleich (Gap 3)

`cue fidelity-check <urlA> <urlB> [--flow flow.json] [--fields a,b,custom.x] [--tolerance 0] [--out dir] [--json]`
ist der deterministische, key-freie Vergleichs-Türsteher — im selben Geist wie
`playable-check`/`temporal-check`/`audio-check`, nur für **zwei** Ziele statt
eines: "verhält sich B so wie A?"

## Warum das bisher fehlte

`playable-check`/`temporal-check`/`audio-check` beweisen, ob EIN Build
technisch verifiziert werden kann (spielbar, konsistent, Audio-Vertrag
belegt). Keiner davon vergleicht zwei Builds gegeneinander. Für einen
Rekonstruktions-Workflow (z. B. eine SHADED-Nachbildung eines Original-Spiels)
ist genau das die eigentliche Frage — "original vs. reconstructed" — und dafür
gab es keinen Beweis-Mechanismus.

## Der reale Vertrag

`fidelity-check` erfindet kein neues State-Format. Es nutzt exakt den
bestehenden, engine-agnostischen CUE-PROBE-Vertrag (`docs/CUE_PROBE.md`,
`src/probe/client.js`), den `temporal-check` bereits für `window.SHADED`
kennt: `state()` liefert bei jedem unterstützten Ziel dieselbe Form
(`scene`, `fps`, `frame`, `custom`). `fidelity-check` fährt denselben Flow auf
beiden Seiten parallel und vergleicht `state()` nach jedem Schritt Feld für
Feld.

Erkannte Verträge (dieselben wie überall in CUE-AGENT):
`window.CUE_PROBE` (nativ), `window.SHADED` (Shim), `window.ANVIL_AUDIO` (Shim).

## Was NICHT Teil dieses Checks ist

Kein CUE-PROBE-Shim für einen Original-Spiel-Interpreter (z. B. ScummVM/
DREAMM) existiert hier oder wird hier gebaut. Das wäre die naheliegende
"original vs. reconstructed"-Anwendung, aber der Shim müsste gegen real
lizenzierte Spieldateien laufen — das bleibt beim Nutzer, lokal, mit eigenen
Tools (dieselbe Grenze wie beim Sprite-/Kostüm-Browser in SHADED). Dieser
Check funktioniert mit **jedem** Paar CUE-PROBE-kompatibler URLs. Bewiesen ist
er hier gegen zwei SHADED-Builds (Regression: alter guter Build vs. neuer
Build) — genau derselbe Codepfad bedient "original vs. reconstructed" real,
sobald irgendwo ein CUE-PROBE-Shim für das Original existiert.

## Vergleichslogik

Pro Flow-Schritt (inkl. eines impliziten `baseline`-Schritts vor dem ersten
Flow-Schritt):

1. `state()` von A und B abrufen.
2. Vergleichsfelder bestimmen: `--fields` falls gesetzt, sonst `scene` +
   jeder `custom.*`-Schlüssel, der auf mindestens einer Seite vorkommt.
3. Pro Feld: auf beiden Seiten vorhanden und (bei `--tolerance` bei Zahlen
   innerhalb der Toleranz, sonst exakt) gleich → `matched`. Vorhanden, aber
   unterschiedlich → `mismatched` (mit beiden Werten). Nur auf einer Seite
   vorhanden → `onlyInA`/`onlyInB` (kein Fehlschlag, aber sichtbar gemacht).

## Verdicts

| Verdict | Bedeutung | Exit |
|---|---|---|
| `VERHALTEN DECKUNGSGLEICH` | Alle verglichenen Felder stimmen bei jedem Schritt überein. | `0` |
| `VERHALTENS-ABWEICHUNG ERKANNT` | Mindestens eine Feld-Abweichung, mit Schritt/Feld/beiden Werten benannt. | `1` |
| `NICHT VERGLEICHBAR` | CUE-PROBE-Vertrag fehlt auf mindestens einer Seite — kein stiller Fallback-Erfolg, derselbe Grundsatz wie `audio-check`s `KEIN AUDIO-VERTRAG GEFUNDEN`. | `1` |

## `--flow` (optional, dasselbe Schema wie `audio-check --scenario`)

```json
[
  { "id": "open-door", "action": "click", "selector": "#door" },
  { "id": "wait-a-beat", "action": "wait", "ms": 500 }
]
```

Ohne `--flow` läuft nur der `baseline`-Vergleich (ein `wait`-Schritt, kein
Input) — sinnvoll, um zwei Startzustände zu vergleichen, ohne einen echten
Ablauf zu benötigen.

## Verifikation

`node --test test/fidelity-check.smoke.test.js` — echter Server + echtes
headless Chromium, kein Mock-DOM: zwei Seiten mit identischem
`window.CUE_PROBE`-Verlauf (DECKUNGSGLEICH-Fall), zwei mit einer bewusst
unterschiedlichen Szene nach Klick (ABWEICHUNG-Fall, Feld/Werte-Diff geprüft),
eine Seite ohne jeden Probe-Vertrag (NICHT-VERGLEICHBAR-Fall). Manuell
verifiziert per echtem `node bin/cue.js fidelity-check <urlA> <urlB> --json`
gegen einen lokalen Server.
