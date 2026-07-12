# Test-Fixtures

Dieser Baum enthält kleine, kuratierte Testdaten für deterministische Parser-,
Metrik- und Runner-Tests. Neue Plattform-Arbeitspakete legen ihre Rohdaten hier
ab und dokumentieren Herkunft, Erzeugung und erwartete Verwendung im jeweiligen
Unterordner.

## Regeln

- Parser- und Metrik-Tests verwenden Fixtures aus diesem Baum statt Inline-Daten.
- Große Binaries kommen nicht ins Git. Dateien über 200 KB müssen durch ein
  Erzeuger-Skript oder einen Eintrag in `remote-fixtures.json` ersetzt werden.
- Remote-Fixtures müssen eine feste URL, SHA-256 und Zielpfad deklarieren.
- Plattform-Smoke-Tests überspringen sauber, wenn das benötigte Tool fehlt.
