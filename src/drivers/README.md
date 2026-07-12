# CUE Driver-Vertrag

Treiber sind die dünne Plattform-Schicht zwischen deterministischer QA-Logik und
konkreter Oberfläche. Sie liefern Bilder, UI-Bäume, Eingaben, Logs und
Gesundheitszustand; sie bewerten **nicht** selbst.

## Registry

```js
const { getDriver } = require('./src/drivers');
const driver = getDriver('web');
const session = await driver.launch('https://example.org', { viewport, logger });
```

`getDriver(id)` lädt Treiber lazy. Dadurch darf ein Windows- oder Android-Treiber
auf Linux importierbar bleiben, solange er nicht gestartet wird.

## Treiber-Objekt

```js
{
  id: 'web' | 'android' | 'windows' | 'gameproc',
  capabilities: {
    uiTree: boolean,
    input: boolean,
    logs: boolean,
    network: boolean,
    processHealth: boolean,
  },
  launch(target, opts) -> Promise<Session>
}
```

`target` ist je Plattform unterschiedlich: URL für `web`, `{ apk?, pkg,
serial? }` für `android`, später `{ exe, args, cwd }` für native Prozesse.

## Session-Vertrag

```js
{
  screenshot() -> Promise<Buffer>,
  frame() -> Promise<number[]>,      // RGBA, 128×72, kompatibel zu frame-metrics
  uiTree() -> Promise<{nodes: Array}|null>,
  input(action) -> Promise<void>,
  logs() -> Promise<Array<{type, text, source}>>,
  health() -> Promise<{running, responding, crashed, crashInfo}>,
  meta() -> object,
  stop() -> Promise<void>,           // idempotent, wirft nicht
}
```

Wenn eine Plattform eine Fähigkeit nicht unterstützt, steht sie in
`capabilities` auf `false` und die Methode wirft eine deutsche, handlungsleitende
Fehlermeldung. `stop()` ist die Ausnahme: Es ist immer idempotent und verschluckt
Cleanup-Fehler.

## Guardrails

- Kein Selektor-Matching im Treiber; Zielauflösung bleibt bei Runnern/Flows.
- Keine destruktiven Eingaben als generische Probe.
- Logs sind kumulativ seit `launch()`.
- `frame()` ist Analyse-Input, nicht Evidence. Evidence bleibt in Report-Ordnern.
