# CUE-AGENT — Brand

> Reine SVG-Pfade, bewusst **nicht** KI-generiert (Bildmodelle verhunzen
> Logo-Geometrie). **Ich kann das Ergebnis selbst nicht sehen — du bist die
> Augen.** Sag, was an Proportion / Winkel / Kurven / Gewicht anders soll.

## Dateien
| Datei | Zweck |
|---|---|
| `cue-logo.svg` | **AKTUELLES PRIMÄR-LOGO, skalierbar** (Platzhalter) — aus `cue-logo.png` per Farb-Layer-Trace (potrace) erzeugt: Rot + Dunkelrot-Shading + schwarzer Federkiel. Verdrahtet in Configurator (inline) + Marketing-Site + Favicons. |
| `cue-logo.png` | Raster-Master des Logos (weißer Grund). Vom Nutzer beigesteuert. |
| `cue-logo-transparent.png` | Raster mit transparentem Hintergrund (für dunkle Flächen). |
| `cue-logo-256.png` | Raster-Header-/Web-Größe (256 px, transparent). Auch unter `marketing/site/assets/images/cue-logo.png` (Social-/Raster-Fallback). |
| `spark-emblem.svg` / `.png` | **ANVIL-SPARK** Emblem-Entwurf (Hammer-Check + Krone + Feder), dunkler Grund |
| `cue-mark.svg` / `.png` | Älterer Entwurf v0 „Forged Cue" (Symbol allein, transparent) |
| `cue-lockup.svg` / `.png` | Wortmarke-Lockup v0 (Symbol + Text) |

> **Visuelle Review (durch Claude, der das Logo tatsächlich sehen kann):**
> `cue-logo.png` ist die sauberste Realisierung des ANVIL-SPARK-Konzepts: roter
> Hammer-Check als eine Masse, rote Krone mit Kugel-Zacken, weiße Füllerfeder mit
> sternförmigem Tintenloch — klar lesbar, gute Silhouette, funktioniert auf hellem
> **und** dunklem Grund. Der ältere `spark-emblem.png` wirkt dagegen unfertig (die
> Krone liest sich eher wie eine Kelle, die Feder zu klein). Daher ist `cue-logo.png`
> jetzt das verdrahtete Logo in Configurator, Marketing-Site und Favicons.
> Es bleibt ein **Platzhalter** und kann jederzeit ersetzt werden — alle Einbau-
> stellen referenzieren denselben Dateinamen bzw. dieselbe Quelle.

## Name: ANVIL-SPARK
Der **Funke**, der den Schmiede-Zyklus schließt — und ihn zugleich neu zündet:
`BELLOWS (Blasebalg) → FORGE/ANVIL (Amboss) → KNIGHT (Schutz) → SPARK (Funke)`.
Passt in deine Namens-Taxonomie: **Schmiede-Werkzeuge** *oder* **mittelalterliche
Titel**. SPARK ist das Werkzeug-Ende; CUE bleibt der Funktions-Name (das Signal).

## Emblem-Konzept (v1, `spark-emblem.svg`)
Nach deiner redraw-Spezifikation umgesetzt:

- **Roter Hammer-Check** als *eine* zusammenhängende Masse: der kurze
  Checkmark-Arm unten links knickt in den langen, massiven Diagonalstiel
  (−47°) nach oben rechts, der zum **keulenartigen Hammerkopf** wird.
- **Rote Krone** diagonal über dem Hammerkopf, Zacken mit **Kugelspitzen**.
- **Weiße Füllerfeder** (royaler Kiel) oben rechts in die Krone gesetzt:
  schwarze Kontur, graue Schattenfläche, **sternförmiges Tintenloch**.
- **Dunkle Schatten-Spalte** trennt Krone / Körper / Feder.

**Bedeutung:** *build it (Hammer) · validate it (Check) · own it (Krone) ·
sign it (Feder).* — Bauen, prüfen, besitzen, signieren.

### Farben (aus deiner Spec)
| Rolle | Hex |
|---|---|
| Grund (Anthrazit) | `#1F2326` |
| Rot dunkel | `#640921` |
| Rot mittel | `#83102A` |
| Rot hell | `#A90E2D` |
| Schatten-Schwarz | `#101315` / `#151719` |
| Feder weiß | `#EDEDED` |
| Feder grau | `#AEAEAD` |

## Familien-Einordnung
- **Ink & Iron Glow** (Firma) — Feder + Schmiede, „Forged Ink".
- **ANVIL** (Studio) — der Amboss.
- **CUE-AGENT / ANVIL-SPARK** (Modul) — der **Funke**, der Check + Hammer vereint.

## Offen / brauche dein Auge
- **Proportionen**: Krümmung der Kronen-Zacken, Form/Größe der Feder,
  Dicke des Hammerstiels — passt das visuell oder zu plump/zu dünn?
- **Rot**: stimmt der Hex aus deinem echten Logo, oder andere Werte?
- **Hammerkopf**: aktuell als zweiter Querbalken angedeutet — soll er
  deutlicher „keulenartig" / breiter werden?
- **Name final?** ANVIL-SPARK als Tool-Name bestätigen → dann Wortmarke
  im Lockup von `CUE` auf `SPARK` umstellen (Tagline z. B. `SPARK — FORGED TRUE`)?
