# Der grüne Build, der lügt

### Wie aus einem Funken Misstrauen ein QA-Werkzeug namens CUE-AGENT wurde — gebaut in einer kleinen Werkstatt am Rand des Märchenwalds

Es gibt diesen einen Moment, den jeder kennt, der allein etwas baut. Der Build wird grün. Die Tests laufen durch. Die Pipeline meldet Erfolg. Und trotzdem sitze ich davor und habe dieses leise Ziehen im Bauch: Ist das wirklich fertig? Würde ich das einem echten Menschen in die Hand drücken?

Meistens lautet die ehrliche Antwort: ich weiß es nicht. Der grüne Build sagt mir, dass nichts kaputt ist, was ich getestet habe. Er sagt mir nichts darüber, ob die Sache sich gut anfühlt, ob der Knopf an der richtigen Stelle sitzt, ob das Bild lädt, ob die App auf einem echten Bildschirm so aussieht wie in meinem Kopf. Der grüne Build lügt nicht direkt. Er verschweigt nur die halbe Wahrheit.

Aus genau diesem Ziehen im Bauch ist CUE-AGENT entstanden.

## Wo das herkommt

Ich betreibe ANVIL — ein kleines, etwas größenwahnsinniges Solo-Indie-Studio. Erst Apps, später Spiele. ANVIL ist eine Schmiede, und ich denke tatsächlich in diesen Bildern: BELLOWS ist der Blasebalg, der Luft gibt. Die ANVIL selbst ist der Amboss, auf dem geformt wird. Ein KNIGHT bewacht das Ganze. Und SPARK — das ist CUE-AGENT — ist der letzte Funke, der den Kreislauf schließt. Der Moment, in dem aus heißem Metall ein fertiges Ding wird, das man jemandem zeigen kann.

CUE-AGENT ist also nicht die ganze Schmiede. Es ist der Schritt am Ende, der prüft, ob das, was glühend aus dem Feuer kam, auch wirklich hält. QA zuerst, alles andere danach.

## Gebaut mit einem Agenten, nicht von ihm

Ich habe CUE-AGENT nicht allein geschrieben. Ich habe es zusammen mit einem KI-Agenten gebaut — Kiro. Pair-Building, im wörtlichsten Sinn: ich denke laut, der Agent schreibt, wir verifizieren gemeinsam, ich entscheide.

Und hier kommt die ehrlichste Lektion des ganzen Projekts, deshalb sage ich sie früh: Der Agent ist blind für Ästhetik. Er kann unfassbar viel deterministisch tun. Er kann linten, Tests fahren, einen echten Chromium starten, eine Seite live rendern, mit ffmpeg ein Video bauen. Er kann mir mit absoluter Verlässlichkeit sagen, *ob* etwas passiert ist. Aber er kann mir nicht sagen, ob es *gut aussieht*. Das ist mein Job. Ich bin die Augen.

Ich habe in dieser Zeit einen Satz für mich geprägt, der zum Leitspruch wurde: verify, don't claim. Verifizieren, nicht behaupten. Ein Agent behauptet schnell mal, etwas sei fertig. Wenn ich das ungeprüft glaube, baue ich mir, wie ich irgendwann frustriert sagte, eine Badewanne mit Löchern. Sieht aus wie eine Badewanne. Hält kein Wasser. Die ganze Architektur von CUE-AGENT ist im Grunde eine Antwort auf dieses Misstrauen — eine Maschine, die nicht behauptet, sondern zeigt.

## Feature für Feature, jeweils ein kleiner, geprüfter Schritt

Wir sind nicht mit einem großen Plan gestartet, der dann zerbröselt. Wir sind in kleinen, einzeln verifizierten Pull Requests gewachsen. Jeder PR ein Funke, kein Flächenbrand.

Zuerst kam die QA-Erfassung: ein echter Browser, der die Oberfläche wirklich aufruft und festhält, was passiert — nicht ein Mock, der so tut. Dann die autonome QA-Schleife, die selbstständig durchläuft, prüft, meldet. Danach die Design-Baseline, auf die ich besonders stolz bin: Ich lade ein Mockup hoch, und das wird zum pixelgenauen Maßstab. Das Werkzeug vergleicht den echten Render gegen meinen Entwurf und iteriert von selbst Richtung Ziel. Die Maschine bekommt damit doch eine Art Auge — aber eines, das ich geeicht habe.

Später kam eine Video-Pipeline, die ich bewusst stur gebaut habe: Sie weigert sich, Slop zu rendern. Erst QA, dann Promo. Kein Werbevideo von etwas, das die Qualitätsprüfung nicht bestanden hat. Dann eine Polish-Schicht — geführter Cursor, automatischer Zoom, Speed-Ramping und Slow-Motion an den richtigen Stellen, GIF-Export. Und schließlich Android-QA, weil Apps eben nicht nur im Desktop-Chromium leben.

Jedes dieser Stücke war für sich klein genug, um es ehrlich verifizieren zu können. Das ist kein Zufall. Das ist die einzige Art, wie ich diesem Prozess vertrauen kann.

## Der Moment, in dem es sich selbst bewies

Der schönste Punkt im ganzen Projekt war das Dogfooding. CUE-AGENT hat sein eigenes Promo- und Tutorial-Video gemacht. Es hat seine echte Oberfläche erfasst, das Video gerendert, es vertont — und dann die GIF-Datei exportiert.

Das Vertonen wurde unfreiwillig zur perfekten Demonstration meiner eigenen Philosophie. Der bezahlte TTS-Schlüssel war ungültig. Statt mit einem Fehler abzubrechen oder still etwas zu behaupten, ist das Werkzeug automatisch auf eine lokale, schlüsselfreie Stimme zurückgefallen — Kokoro, direkt auf der Maschine. Das Video bekam seine Stimme, ohne dass irgendwo ein Cent oder ein Key nötig war.

Das Werkzeug, das für sich selbst wirbt, indem es seine eigene echte Funktion zeigt — das war der Beweis. Kein Behaupten. Zeigen.

## Schlüsselfrei, weil ich es selbst so will

Das ist kein Marketing-Gimmick, das ist Haltung: CUE-AGENT funktioniert standardmäßig ohne API-Schlüssel. Bilder über Pollinations, Stimme über Kokoro, beides ohne Key. Wer eigene Schlüssel mitbringen will, kann das tun — bring your own key, optional. Aber der Standardweg ist offen und kostenfrei begehbar. Und das Ganze ist Open Source. Ich will, dass jemand es ausprobieren kann, ohne vorher sein Portemonnaie oder seine Daten herzugeben.

## Wie die Marke neben dem Code wachsen durfte

Parallel zum Werkzeug ist die Designsprache gewachsen — HEARTHWORK. Und sie hat sich live verändert, während ich daran arbeitete. Am Anfang ging sie stark in Richtung "tiny wonders", Pastell, Natur, Märchenbuch für Erwachsene. Pilze, Tautropfen, kleine Wunder.

Dann fiel mir auf, dass die halbe Wahrheit fehlte — und zwar die, die schon im Namen steckt. Ein Hearth ist keine Blume. Ein Hearth ist die Feuerstelle, der Ort, an den man zurückkehrt, Licht im Dunkeln. So wurde aus der Naturromantik die eigentliche Synthese: Wonder + Warmth. Wunder und Wärme. Tagsüber das Staunen, nachts die Schmiede.

Der Satz, der für mich alles zusammenhält: HEARTHWORK ist kein Märchenwald. Es ist die warme Werkstatt am Rand des Märchenwalds. Die Welt ist voller Wunder — aber jemand muss daraus etwas bauen. Und deshalb arbeite ich auch in der Bildsprache mit Glut statt Flamme. Flammen sind laut. Glut ist ruhig und hält. Ein Funke, eine Laterne, die begleitet statt blendet, eine Hammermarke auf dem Metall.

## Was ich gelernt habe

Ein paar Dinge sind mir geblieben, ehrlicher als jede Roadmap.

Der grüne Build ist ein Anfang, kein Ende. Er sagt "nicht kaputt", nicht "bereit für Menschen". Diese Lücke ist real, und sie zu schließen ist eigene Arbeit.

Mit einem KI-Agenten zu bauen ist großartig und begrenzt zugleich. Der Agent ist schnell, gründlich und unermüdlich bei allem, was sich messen lässt. Er ist blind für das, was sich nur fühlen lässt. Die Arbeitsteilung funktioniert nur, wenn ich diese Grenze respektiere: er rendert und misst, ich schaue und entscheide.

Verify, don't claim. Jede Behauptung, die ich nicht geprüft habe, ist ein potenzielles Loch in der Badewanne. Lieber ein kleiner Schritt, den ich wirklich sehen kann, als ein großer, den mir jemand verspricht.

Und kleine, geprüfte PRs schlagen den großen Wurf. Nicht weil sie bescheidener sind, sondern weil ich ihnen vertrauen kann. Vertrauen ist am Ende das einzige Material, aus dem Software gebaut wird, die jemand benutzen mag.

## Wenn du magst

CUE-AGENT ist da, offen, schlüsselfrei im Standard. Wenn dich das gleiche Ziehen im Bauch kennst — der grüne Build, der nicht ganz die Wahrheit sagt — probier es aus:

```
npx github:Lootziffer666/CUE-AGENT
```

Der Code liegt offen: <https://github.com/Lootziffer666/CUE-AGENT>

Das hier ist keine Verkaufsseite. Ich will dir nichts andrehen. Ich würde mich freuen, wenn du es ausprobierst, mir erzählst, wo es bei dir hakt, und deine eigenen Ideen mitbringst. Die Werkstatt hat Platz, und am Feuer wird es zu zweit ohnehin wärmer.

---

*Tags: indie dev, QA, build in public, open source, AI pair programming*

*Canonical: zuerst veröffentlicht im ANVIL-Werkstattjournal. Bei Crossposting auf Medium/Dev.to bitte diese Quelle als Original kennzeichnen.*
