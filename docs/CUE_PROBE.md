# CUE-PROBE Vertrag

CUE-PROBE ist der engine-agnostische Instrumentierungsvertrag für CUE-AGENT.
Ein Build, der diesen Vertrag anbietet, kann deterministischer geprüft werden:
Bereitschaft, Zustand, Weltparameter, Events und optional engine-internes
Screenshot-Capture sind direkt abrufbar. Ohne Probe bleiben generische Pixel-,
Log- und Health-Prüfungen aktiv.

## Transporte

### Web

Web-Builds exponieren `window.CUE_PROBE`:

```js
window.CUE_PROBE = {
  isReady: () => true,
  getState: () => ({ scene: 'main', fps: 60, frame: 123, custom: {} }),
  setParams: (params) => {},          // optional
  input: (action) => {},              // optional
  drainEvents: () => [],              // optional
};
```

Aus Kompatibilitätsgründen erkennt CUE-AGENT auch die Altverträge
`window.SHADED` und `window.ANVIL_AUDIO` als Shims.

### Native / Engine

Native Builds binden ausschließlich an Loopback:

- Host: `127.0.0.1`
- Port: `7477` oder `CUE_PROBE_PORT`
- Format: JSON; Screenshot-Endpoint liefert PNG

| Logischer Aufruf | HTTP |
|---|---|
| `ready()` | `GET /cue/ready` → `{ "ready": true }` |
| `state()` | `GET /cue/state` |
| `setParams(obj)` | `POST /cue/params` |
| `input(action)` | `POST /cue/input` |
| `events(since)` | `GET /cue/events?since=...` |
| `screenshot()` | `GET /cue/screenshot` → PNG |

## Minimaler State

```json
{
  "scene": "main-menu",
  "fps": 60,
  "frame": 1234,
  "entities": [],
  "custom": {}
}
```

`scene`, `fps` und `frame` sollen vorhanden sein, wenn die Engine sie sinnvoll
liefern kann. `custom` ist für engine- oder produktspezifische Zusatzsignale.

## Sicherheitsregeln

- Native Probe nur auf `127.0.0.1` binden, nie `0.0.0.0`.
- Keine Telemetrie, keine Uploads, kein externer Netzwerkzugriff.
- CUE-PROBE ergänzt deterministische Verdicts, überstimmt sie aber nie allein.
- Fehlende optionale Methoden müssen sauber als nicht verfügbar behandelt werden.
