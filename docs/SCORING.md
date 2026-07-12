# CUE-AGENT Scoring & Severity

CUE-AGENT bewertet nicht nach Geschmack. Jeder Score ist eine additive,
nachvollziehbare Abwertung aus technischen Signalen. Das Gate bleibt immer
separat: Score/Severity beschreiben den Befund, `failsGate()` entscheidet den
CI-Exit anhand der konfigurierten Schwelle.

## Grundmodell

Startwert: `100` Punkte. Abzüge:

| Signal | Abzug |
|---|---:|
| Navigation fehlgeschlagen (`navOk=false`) | −25 |
| Konsolenfehler | −15 je Fehler |
| Konsolenwarnung | −5 je Warnung |
| HTTP 5xx | −15 je Response |
| HTTP 4xx | −8 je Response |
| Finding `high` | −30 je Befund |
| Finding `medium` | −15 je Befund |
| Finding `low` | −5 je Befund |

Der Score wird auf `0..100` begrenzt.

## Severity-Ableitung

- `high`: Navigation fehlgeschlagen, Konsolenfehler, HTTP 5xx oder mindestens ein
  `high`-Finding.
- `medium`: mehr als zwei Warnungen, HTTP 4xx oder mindestens ein
  `medium`-Finding.
- `low`: mindestens eine Warnung oder mindestens ein `low`-Finding.
- `none`: keine der obigen Bedingungen.

## Gate

`failsGate(level, failOn)` blockiert nur, wenn `failOn` eine gültige Severity
`low|medium|high` ist und der Befund mindestens diese Stufe erreicht. `none`,
fehlende oder ungültige Werte blockieren nicht.

## Threshold-Konfiguration

Schwellwerte liegen in `cue.config.json` unter `qa.thresholds` und werden tief mit
Defaults gemerged. Aktuelle Defaults:

```json
{
  "qa": {
    "thresholds": {
      "web": {
        "temporal": {
          "minMotion": 0.35,
          "maxJump": 40,
          "minResponse": 1.5,
          "maxStaticRatio": 0.5,
          "maxIdleFlicker": 25
        }
      },
      "android": { "perf": { "maxColdStartMs": 5000 } },
      "windows": {},
      "game": { "startTimeoutMs": 15000 }
    }
  }
}
```

Beispiel-Override:

```json
{
  "qa": {
    "thresholds": {
      "web": { "temporal": { "maxJump": 25 } },
      "game": { "startTimeoutMs": 20000 }
    }
  }
}
```
