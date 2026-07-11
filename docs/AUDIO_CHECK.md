# `cue audio-check` — Audio-Vertrags-Beweis (Gate H)

`cue audio-check <url> [--scenario scenario.json] [--out dir] [--json]` ist der
deterministische, key-freie Beweis-Türsteher für ANVILs Web-Audio-Runtime —
im selben Geist wie `playable-check` ("belegbar spielbar?") und `temporal-check`
("erkennt SHADEDs `window.SHADED`?"), nur für Audio.

## Der reale Vertrag

`audio-check` erkennt exakt den Debug-Hook, den ANVILs `ToneJsRuntimeWriter`
(`anvil-kmp/modules/target/.../ToneJsRuntimeWriter.kt`, `renderRuntimeTs()`)
tatsächlich generiert:

```ts
export const ANVIL_AUDIO = {
  getDebugState: () => ({ ...debugState }),
  setState: (name: string, value: number) => { debugState[name] = value; },
  getEventLog: () => [...eventLog],
};
```

Damit `audio-check` etwas findet, muss die zu prüfende Seite dieses Objekt auf
`window.ANVIL_AUDIO` exponieren (das generierte `runtime.ts` selbst tut das
nicht automatisch — der Ziel-Build muss es dorthin durchreichen, analog dazu,
wie `window.SHADED` von SHADEDs `index.html` selbst gesetzt wird).

## Die sechs Beweis-Kategorien (Gate H, `docs/REAL_GOLDEN_RUN_LEDGER.md`)

Vier sind mit dem **aktuellen** `ANVIL_AUDIO`-Vertrag real und deterministisch
prüfbar:

| Kategorie | Prüfung |
|---|---|
| `CUE_FIRED` | Eine echte Interaktion (generischer Klick oder `--scenario`-Flow) lässt `getEventLog()` wachsen — der Hook selbst loggt reale Events (`gain:<bus>:<target>`, `stinger:<bus>`, `runtime-started`), nichts wird erfunden. |
| `STATE_REACTION` | `setState(name, value)` gefolgt von `getDebugState()[name] === value` — echter Round-Trip. |
| `TRANSITION_TIMING` | `getEventLog()` wird zweimal im Abstand einer echten Wartezeit abgefragt; das Log darf über die Zeit nicht schrumpfen (monoton) und die Abfrage darf nicht crashen. |
| `LOOP_CONTINUITY` | `getEventLog()` liefert bei zwei Aufrufen unabhängige Arrays (laut Runtime-Vertrag eine Spread-Kopie) — Mutation der einen Kopie darf weder die andere noch den internen Log beeinflussen. |

Zwei sind mit dem **aktuellen** Vertrag NICHT prüfbar — und werden bewusst
als solche ausgewiesen (`ok: null`, `required: false`), nie fingiert:

| Kategorie | Warum nicht prüfbar |
|---|---|
| `CLIPPING_CHECK` | Bräuchte einen Pegel-/Analyser-Hook (z. B. `getAudioLevels()` über einen `AnalyserNode`), den `ANVIL_AUDIO` aktuell nicht exponiert. |
| `VOICE_AUDIBILITY` | Dieselbe Begründung — kein Signal-Pegel-Zugriff im aktuellen Vertrag. |

**Fallback-Strategie:** Diese zwei Kategorien blockieren das Verdict NICHT
(`required: false`), aber sie werden auch NIE als "ok" gemeldet, um keinen
unbelegten Erfolg vorzutäuschen. Eine künftige Erweiterung von `ANVIL_AUDIO`
um einen echten Pegel-Hook (ANVIL-seitig, `ToneJsRuntimeWriter`) ist die
einzige Art, wie diese zwei Kategorien jemals ein reales `ok: true/false`
bekommen können — bis dahin bleibt `audio-check` ehrlich bei "nicht prüfbar".

## Modi

- **`anvil-audio`-Modus:** `window.ANVIL_AUDIO` gefunden (alle drei Methoden
  als Funktionen vorhanden) → die vier prüfbaren Kategorien werden real
  ausgeführt.
- **`generic`-Modus:** `window.ANVIL_AUDIO` fehlt → **kein stiller
  Fallback-Erfolg**. Anders als bei `temporal-check` (wo "kein SHADED" einen
  gültigen generischen Idle-Check auslöst) ist der gesamte Zweck von
  `audio-check` der Audio-Vertrag selbst — sein Fehlen ist das Ergebnis, nicht
  ein Grund für einen Ersatz-Test. Verdict: `KEIN AUDIO-VERTRAG GEFUNDEN`,
  Exit-Code `1`.

## `--scenario` (optional, `src/qa/audio-scenario.schema.json`)

```json
{
  "probeState": { "name": "custom_probe", "value": 42 },
  "flow": [ { "id": "click-play", "action": "click", "selector": "#play" } ]
}
```

- `probeState` überschreibt Name/Wert des `STATE_REACTION`-Probes (Default:
  `anvil_audio_check_probe` / `1`).
- `flow` ersetzt die generische Interaktion (erster sichtbarer Button/Canvas/
  Link) durch einen deklarativen Ablauf — gleiches Aktions-Set wie die
  Capture-Engine (`src/core/flow.js` `VALID_ACTIONS`: goto/click/type/scroll/
  wait/hover/select), validiert mit derselben `validateStep()`-Funktion.

## Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | Alle vier erforderlichen Kategorien `ok: true`. |
| `1` | Mindestens eine erforderliche Kategorie `ok: false`, ODER `window.ANVIL_AUDIO` wurde gar nicht gefunden. |

## Verifikation

`node --test test/audio-check.smoke.test.js` — echter Server + echtes
headless Chromium, kein Mock-DOM: eine Seite mit real nachgebautem
`ANVIL_AUDIO`-Hook (BELEGT-Fall), eine ohne (Fallback-Fall), eine mit
`--scenario`-Override. Manuell verifiziert per echtem `node bin/cue.js
audio-check <url> --json` gegen einen lokalen Mock-Server (siehe
`docs/REAL_GOLDEN_RUN_LEDGER.md` für den aufgezeichneten Output).
