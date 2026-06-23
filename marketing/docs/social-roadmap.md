# social roadmap — cue-agent

> die welt ist voller wunder, aber jemand muss daraus etwas bauen.

cue-agent ist der finishing-"spark" im anvil-ökosystem: ein open-source node.js cli plus web-configurator, der qa-first bughunting macht und verifizierte user-flows danach in saubere promo- und tutorial-videos verwandelt. dieses dokument ist unser social-fahrplan. es ist kein verkaufstrichter. es ist eine werkstatttür, die offen steht.

der ton folgt hearthwork: ruhig, kompetent, warm. wonder am tag, hearth am abend. wir reden in glut, nicht in flammen. flammen sind laut. glut ist ruhig.

---

## 1. kanal-philosophie

drei prinzipien tragen alles, was wir posten.

- **build in public.** wir zeigen die werkstatt, nicht nur das fertige stück. fortschritt, sackgassen, kleine funken. wer mitdenken will, darf reinschauen.
- **show don't sell.** wir zeigen, wie cue-agent einen echten bug findet, einen fix vorschlägt und danach aus dem geprüften flow ein promo-video schneidet. kein hype, keine versprechen. nur das, was das werkzeug tut.
- **dogfooding.** cue-agent bewirbt sich selbst. jedes promo-video, jedes gif entsteht mit cue-agent aus einem verifizierten flow. das produkt ist der beste beweis für das produkt.

der call-to-action ist nie "kauf das". er ist "willst du mehr erfahren, mitreden, mitbauen?" und "willst du es in ruhe ausprobieren, frei für immer, ohne haken?". preise sind ein produkt, kein abo: free 4 ever (shareware, €0), maker (€39 einmalig), studio (€89 einmalig).

wir schreiben in sentence case. keine ausrufezeichen. wir sagen "du" zu dir und "wir" zu uns. ehrlich vor schmeichelhaft.

---

## 2. kanal-tabelle

| kanal | rolle | kadenz | ton |
|---|---|---|---|
| x / twitter | tägliche werkbank: kurze funken, clips, fragen | 4–6 / woche | knapp, neugierig, technisch warm |
| mastodon | community-stammtisch, foss-nähe, ehrlicher dialog | 3–4 / woche | offen, gesprächig, ohne marketingglanz |
| linkedin | für solo-maker und kleine teams, die liefern | 2 / woche | ruhig, sachlich, ein hauch handwerksstolz |
| reddit (r/programming, r/webdev, r/androiddev) | tiefe, ehrliche show-and-tell beiträge | 1 / 2 wochen je sub | bescheiden, nützlich, antwortfreudig |
| tiktok / reels / shorts | wonder-am-tag: kurze "schau mal"-momente | 3–4 / woche | warm, langsam, faszinierend |
| youtube | werkstattjournal: tutorials, deep dives, changelogs | 1 / woche | ruhig erklärend, geduldig |
| medium / dev.to | längere gedanken: qa-first-philosophie, anti-slop-gate | 1 / 2 wochen | literarisch, klar, ehrlich |
| hacker news | ein gut getimter show-hn, danach mitlesen und antworten | selten, bewusst | nüchtern, technisch, demütig |
| github (discussions + issues) | das eigentliche zuhause: mitbauen, mitdenken | täglich aktiv | hilfsbereit, konkret, dankbar |

---

## 3. 90-tage-launch-fahrplan

drei phasen. erst funken schlagen, dann die werkstatt öffnen, dann die glut halten.

### phase 1 — funken (wochen 1–4): build in public + teaser

| woche | thema | kanal | aktion |
|---|---|---|---|
| 1 | "es glüht etwas" | x, mastodon | erste teaser-clips: browser wird live gesteuert, screenshot fällt raus |
| 1 | warum qa-first | dev.to | kurzer essay: "erst qa, dann promo" — das anti-slop-gate erklärt |
| 2 | echter bug, echte glut | x, reels | 20s-clip: autonomer loop findet bug → fix → rebuild → retest |
| 2 | werkstatt-notiz | mastodon, linkedin | build-in-public-update: was diese woche entstand, was scheiterte |
| 3 | design-baseline | reels, youtube | mockup als messlatte, pixelgenauer abgleich web + android |
| 3 | stimme ohne schlüssel | x | kokoro tts lokal, key-free — kurzer ton-vergleich |
| 4 | vom flow zum promo | shorts, youtube | geführter cursor, auto-zoom, speed-ramping, gif-export |
| 4 | mach mit | github, mastodon | discussions öffnen, erste roadmap-fragen an die community |

### phase 2 — werkstatt öffnen (wochen 5–8): launch

| woche | thema | kanal | aktion |
|---|---|---|---|
| 5 | tür auf | hacker news | show-hn beitrag, danach den ganzen tag mitlesen und antworten |
| 5 | launch-notiz | x, mastodon, linkedin | "die werkstatt ist offen" — npx-einzeiler, was es kann, was nicht |
| 6 | android-qa | reddit r/androiddev, reels | echte geräte, crash/anr-erkennung, "landet der tap im richtigen screen?" |
| 6 | web-qa show-and-tell | reddit r/webdev | ehrlicher beitrag mit report-screenshot und grenzen |
| 7 | preise als produkt | linkedin, medium | warum einmal-lizenz statt abo, free 4 ever erklärt |
| 7 | tutorial-reihe | youtube | "in 10 minuten zum ersten qa-report" |
| 8 | community-fragen | github, x | discussions-highlights, beantwortete issues, danke an erste contributors |
| 8 | erste ads-glut | google ads, tiktok ads | kleine, ehrliche kampagne startet, ziel ist die soft-cta-seite |

### phase 3 — glut halten (wochen 9–12): sustain

| woche | thema | kanal | aktion |
|---|---|---|---|
| 9 | changelog im licht | youtube, x | erstes monatliches werkstattjournal als video |
| 9 | nutzerstimmen | mastodon, linkedin | echte (eingeholte) erfahrungen teilen, ohne übertreibung |
| 10 | tiefer essay | medium, dev.to | "warum slop entsteht und wie ein gate dagegen hilft" |
| 10 | mini-tipps | reels, shorts | drei kurze "wusstest du, dass cue-agent ..."-clips |
| 11 | contributor-spotlight | github, x | einen beitrag aus der community würdigen |
| 11 | reddit-rückkehr | r/programming | follow-up: was sich seit launch geändert hat |
| 12 | rückblick + ausblick | alle kanäle | 90-tage-rückblick, ehrliche zahlen, nächste glut |
| 12 | offene roadmap | github discussions | community über nächste features mitentscheiden lassen |

---

## 4. fertige beispiel-posts

zwölf-plus konkrete vorlagen, direkt postbar.

### x post 1 — teaser
```
cue-agent steuert gerade einen echten browser, macht echte screenshots
und liest console- und network-fehler mit.

kein mock. kein fake. nur das, was wirklich passiert.

open source, key-free by default.
npx github:Lootziffer666/CUE-AGENT
```
media: 15s-screencast des live gesteuerten browsers, warmes abendlicht-overlay.

### x post 2 — autonomer loop
```
der teil, der uns selbst noch staunen lässt:

bug finden → fix vorschlagen → anwenden → rebuild → retest.
autonom, in einer schleife, bis der report sauber ist.

wir nennen das die glut, die nicht ausgeht.
```
media: split-screen-clip vom loop, kleine funken-animation an den übergängen.

### x post 3 — anti-slop-gate
```
videos macht cue-agent nur aus verifizierten flows.
erst qa, dann promo.

heißt: das promo zeigt nie etwas, das vorher nicht wirklich funktioniert hat.
ein gate gegen slop.
```
media: standbild "verified ✓" → daraus entsteht ein promo-clip.

### mastodon post 1 — build in public
```
werkstatt-notiz, woche 2.

diese woche lief der autonome qa-loop zum ersten mal sauber durch,
ohne dass wir eingreifen mussten. zwei sackgassen vorher, ehrlich gesagt.

cue-agent ist open source und teil von anvil. wer reinschauen mag, ist eingeladen.
fragen gern in den discussions.
```
media: foto vom terminal mit grünem report, warmer farbton.

### mastodon post 2 — key-free
```
kleine sache, die uns wichtig ist: cue-agent läuft key-free by default.

bilder über pollinations, stimme lokal über kokoro tts.
eigene api-keys kannst du nutzen, musst du aber nie.

frei für immer als shareware, ohne haken.
```
media: kurzes audio-sample der lokalen stimme.

### linkedin post — für maker und kleine teams
```
wenn du allein oder in einem kleinen team lieferst, kennst du das:
qa kostet zeit, promo-videos kosten noch mehr.

cue-agent macht beides aus einer quelle. es testet deine flows in einem
echten browser, schreibt einen klaren report mit schweregrad und score —
und verwandelt nur die verifizierten flows in ein sauberes promo-video.

erst qa, dann promo. open source, einmal-lizenz statt abo.
free 4 ever zum ausprobieren, maker €39, studio €89, jeweils einmalig.

wenn du magst, reden wir darüber. ideen und kritik sind willkommen.
```
media: ruhiges report-zu-promo-vorher-nachher-bild.

### show hn post
```
Show HN: CUE-AGENT – QA-first bughunting that turns verified flows into promo videos

cue-agent ist ein open-source node.js cli plus web-configurator. es steuert einen
echten browser über playwright, macht screenshots, sammelt console- und
network-fehler und kann optional ein vision-modell zur analyse nutzen. heraus
kommt ein report mit schweregrad und score.

es gibt einen autonomen loop: bug finden, fix vorschlagen, anwenden, rebuild,
retesten. android-qa ist dabei (echte geräte und emulatoren, crash- und
anr-erkennung, prüfung ob der tap im richtigen screen landet). mit einer
design-baseline kann man ein mockup als messlatte hochladen; position, größe,
text und farbe werden pixelgenau geprüft, web und android.

der video-teil baut nur aus verifizierten flows ("erst qa, dann promo").
geführter cursor, auto-zoom, slow-mo, gif-export. stimme ist lokal und key-free
(kokoro tts), eigene keys optional.

key-free by default, open source, teil des anvil-ökosystems.
install: npx github:Lootziffer666/CUE-AGENT
repo: https://github.com/Lootziffer666/CUE-AGENT

feedback und kritik sind sehr willkommen.
```
media: ein gif des kompletten ablaufs vom report bis zum promo-clip.

### reddit post — r/webdev
```
titel: ich habe ein qa-tool gebaut, das aus geprüften flows auch promo-videos macht

hi zusammen. cue-agent ist open source und ich teile es hier, weil ich ehrliches
feedback suche, keinen verkauf.

was es tut: es fährt deine web-app in einem echten browser (playwright), macht
screenshots, liest console- und network-fehler und schreibt einen report mit
schweregrad und score. es gibt einen autonomen loop, der fixes vorschlägt,
anwendet und neu testet. mit einer design-baseline kannst du ein mockup als
messlatte nehmen und pixelgenau abgleichen.

das ungewöhnliche: aus verifizierten flows baut es danach saubere promo- oder
tutorial-videos. die regel ist "erst qa, dann promo", damit nichts gezeigt wird,
das nicht wirklich läuft.

key-free by default, eigene api-keys optional. grenzen: [ehrlich auflisten].
ich beantworte gern alle fragen hier.
repo: https://github.com/Lootziffer666/CUE-AGENT
```
media: report-screenshot plus kurzer promo-clip.

### dev.to / medium teaser
```
titel: erst qa, dann promo — wie ein gate gegen slop hilft

die meisten promo-videos lügen ein bisschen. sie zeigen flows, die im echten
build holpern. cue-agent dreht die reihenfolge um: es verifiziert einen flow
erst per qa und lässt erst danach ein video daraus entstehen.

in diesem beitrag zeige ich, wie das anti-slop-gate funktioniert, warum der
autonome qa-loop (finden, fixen, neu testen) dabei hilft, und wie aus dem
verifizierten flow ein geführtes promo mit auto-zoom und slow-mo wird.

ganzer artikel: [link]. das tool ist open source und key-free.
```
media: titelbild im hearthwork-stil, warmer farbverlauf mit kleinem funken.

### tiktok / reels / shorts — hook-skript 1
```
on-screen text (0–2s): "dein promo zeigt einen bug, den du nicht siehst"
vo: "die meisten promo-videos zeigen flows, die gar nicht sauber laufen."

on-screen text (2–6s): "erst qa"
vo: "cue-agent testet den flow zuerst in einem echten browser."

on-screen text (6–10s): "dann promo"
vo: "und baut erst aus dem geprüften flow das video."

on-screen text (10–15s): "erst qa, dann promo"
vo: "open source, key-free. in ruhe ausprobieren, link ist unten."
```
media: bildschirmaufnahme, warme overlays, geführter cursor sichtbar.

### tiktok / reels / shorts — hook-skript 2
```
on-screen text (0–2s): "landet der tap im richtigen screen?"
vo: "auf android weißt du oft nicht, ob der tap wirklich ankommt."

on-screen text (2–7s): "echtes gerät. echte prüfung."
vo: "cue-agent testet auf echten geräten und emulatoren, erkennt crashes und anr."

on-screen text (7–12s): "und sagt dir, wo es klemmt"
vo: "und prüft, ob jeder tap im richtigen screen landet."

on-screen text (12–15s): "frei ausprobieren"
vo: "open source, ohne haken. schau es dir in ruhe an."
```
media: hand mit telefon, daneben das terminal mit grünem haken.

### tiktok / reels / shorts — hook-skript 3
```
on-screen text (0–2s): "stimme im video, ohne api-key"
vo: "du brauchst keinen cloud-key für eine stimme im promo."

on-screen text (2–7s): "lokal. key-free."
vo: "cue-agent nutzt kokoro tts, lokal auf deinem rechner."

on-screen text (7–12s): "eigene keys? optional."
vo: "eigene schlüssel kannst du nutzen, brauchst du aber nie."

on-screen text (12–15s): "frei für immer"
vo: "open source und shareware. probier es in ruhe aus."
```
media: tonspur-visualisierung, warmes laternenlicht.

---

## 5. google ads konzept

drei responsive-search-ad-varianten. ehrlich, intent-basiert. alle anzeigen führen auf die soft-cta-seite ("mehr erfahren / ausprobieren"), nicht auf einen harten checkout.

### variante a — qa-fokus
```
headlines:
- qa tool für indie devs
- echter browser, echter report
- bug finden, fix vorschlagen
- erst qa, dann promo
- open source, key-free
descriptions:
- testet deine flows in einem echten browser und schreibt einen klaren report.
- autonomer loop: finden, fixen, neu testen. in ruhe ausprobieren, frei für immer.
```

### variante b — android-fokus
```
headlines:
- app testen automatisch
- android qa, echte geräte
- crash und anr erkennen
- landet der tap richtig?
- frei ausprobieren, kein abo
descriptions:
- qa auf echten geräten und emulatoren, mit crash- und anr-erkennung.
- einmal-lizenz statt abo. erst schauen, dann entscheiden.
```

### variante c — video-fokus
```
headlines:
- promo video aus app
- aus geprüften flows
- geführter cursor, auto-zoom
- stimme lokal, key-free
- open source werkzeug
descriptions:
- verwandelt verifizierte flows in saubere promo- und tutorial-videos.
- erst qa, dann promo. kein hype, nur das, was wirklich läuft.
```

zielkeywords (ehrlich, intent-basiert): `qa tool indie`, `app testen automatisch`, `promo video aus app`, `playwright qa cli`, `android crash erkennen`, `open source qa tool`, `tutorial video automatisch`, `bug finden tool`.

hinweis: alle anzeigen verlinken auf die ruhige info-seite mit dem soft-cta. dort steht "mehr erfahren / mitreden / ausprobieren", nie "jetzt kaufen". keine countdown-timer, keine dringlichkeit.

---

## 6. tiktok / shorts ad konzept

zwei kurze video-ads. hook in den ersten 2 sekunden, klare beats, cta "in ruhe ausprobieren".

### ad 1 — "erst qa, dann promo"
```
hook (0–2s):
  shot: bildschirm, ein flow läuft, plötzlich roter fehler im overlay
  on-screen: "dein promo zeigt das hier nicht"
  vo: "die meisten promo-videos zeigen flows, die holpern."

beat 1 (2–6s):
  shot: terminal, qa-report mit schweregrad und score
  on-screen: "erst qa"
  vo: "cue-agent prüft den flow zuerst in einem echten browser."

beat 2 (6–11s):
  shot: aus dem grünen haken entsteht ein geführter promo-clip mit auto-zoom
  on-screen: "dann promo"
  vo: "und baut erst aus dem geprüften flow das video."

cta (11–15s):
  shot: ruhiges schlussbild, warmes laternenlicht, npx-zeile
  on-screen: "open source, key-free"
  vo: "schau es dir in ruhe an. ohne haken."
```

### ad 2 — "die werkstatt"
```
hook (0–2s):
  shot: nahaufnahme funken über dunklem hintergrund
  on-screen: "ein werkzeug, das sich selbst beweist"
  vo: "dieses promo wurde mit dem werkzeug gemacht, das es bewirbt."

beat 1 (2–6s):
  shot: autonomer loop, bug → fix → rebuild → retest
  on-screen: "finden. fixen. neu testen."
  vo: "es findet bugs, schlägt fixes vor und testet neu."

beat 2 (6–11s):
  shot: gif-export, slow-mo eines sauberen flows
  on-screen: "aus geprüften flows"
  vo: "und macht promos nur aus dem, was wirklich läuft."

cta (11–15s):
  shot: warmes schlussbild, repo-link dezent
  on-screen: "in ruhe ausprobieren"
  vo: "open source. frei für immer. komm vorbei."
```

---

## 7. hashtag- und posting-zeit-mini-guide

**hashtags (sparsam, 2–4 pro post).**
- allgemein: `#opensource` `#indiedev` `#buildinpublic` `#devtools`
- qa: `#qa` `#testing` `#playwright` `#webdev`
- android: `#androiddev` `#mobiledev`
- video: `#screencast` `#devrel`
- auf mastodon: hashtags echt nutzen (sie sind dort die suche), aber ohne zu spammen.
- auf linkedin: höchstens drei, am ende des posts.

**posting-zeiten (orientierung, lokale zielzeit testen).**
- x: vormittags 9–11 uhr und abends 18–20 uhr, werktags.
- mastodon: vormittags, ruhigere community, weniger algorithmusdruck.
- linkedin: dienstag bis donnerstag, 8–10 uhr.
- reddit: früher vormittag in der us-zeit für reichweite, danach aktiv mitdiskutieren.
- tiktok / reels / shorts: spätnachmittag bis abend, 17–21 uhr.
- youtube: veröffentlichen freitag oder samstag vormittag.
- hacker news: us-vormittag, dienstag bis donnerstag.

faustregel: lieber seltener und gut als oft und laut. glut, nicht flamme.

---

## 8. kpis im sinne des anti-hard-sell-ethos

wir messen neugier und gemeinschaft, nicht druck.

- **neugier:** profilbesuche, link-klicks zur info-seite, gespeicherte posts.
- **engagement:** echte antworten, sinnvolle kommentare, geteilte clips.
- **discussions gestartet:** anzahl neuer github-discussions und beantworteter fragen.
- **contributors:** issues von außen, pull requests, erste mitbauer.
- **installs:** npx-läufe und repo-clones als ruhiger nutzungsindikator.
- **stars und watches:** als zeichen von interesse, nicht als selbstzweck.
- **wiederkehr:** menschen, die mehrfach vorbeischauen und mitreden.

bewusst **nicht** im fokus: aggressive conversion-rate, verkaufsdruck, künstliche dringlichkeit, vanity-reichweite ohne gespräch.

---

> cue-agent ist kein märchenwald. es ist die warme werkstatt am rand des märchenwaldes. menschen kommen mit ideen, chaos und entwürfen — und gehen mit richtung und etwas gebautem wieder hinaus.
