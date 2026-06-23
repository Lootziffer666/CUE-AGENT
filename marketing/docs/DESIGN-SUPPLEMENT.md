# HEARTHWORK — Wonder + Warmth (Unified Language v1.1, applied)

> **What this is.** The design language used across this CUE-AGENT promo package,
> synthesised from two HEARTHWORK direction notes into one coherent system.
> **Why it exists.** The HEARTHWORK repo's `tokens.json` is the calm v0 base
> (navy/orange/off-white). You then defined **v1.0** (pastel wonder) and **v1.1**
> (the warmth/forge half the name always implied). This file captures v1.1 so the
> package is reproducible — and so it can fold back into the repo. Nothing here is
> thrown away; it *extends* and *re-bases*.

---

## 0. The one sentence
**HEARTHWORK is not a fairytale forest. It is the warm workshop at its edge** —
where people arrive with ideas, chaos and drafts, and leave with direction,
structure and something built. The world is full of wonders; **someone has to
forge something from them.**

For CUE-AGENT this is almost literal: it's a forge tool (part of the ANVIL
ecosystem, the SPARK that closes the cycle). The brand and the product rhyme.

---

## 1. The two poles (design tension)
Every screen lives between two layers. The magic is *between* them.

| | **Wonder** (day) | **Hearth** (night) |
|---|---|---|
| Means | curiosity | orientation |
| Motifs | mushroom, dewdrop, flower, seed, ant, butterfly | ember, lantern, single spark, forge marks, tools, wood, window light, distant city lights |
| Palette | pastels (accents) | embers/twilight (base) |
| In CUE-AGENT | *looking closely* — QA that sees the small things that matter | *building* — forging a polished, shown result |

Rule of thumb: **light "paper" sections = Wonder; dark "workshop" sections =
Hearth.** Alternate them. Hero, CTA and footer are Hearth; feature/value sections
are Wonder on paper.

---

## 2. Color system

### Base — Hearth (the new foundation)
| Token | Hex | Use |
|---|---|---|
| Ember | `#D97732` | primary warm accent, CTA glow start |
| Forge | `#9A4D21` | deep warm, pressed/active, deep accents |
| Hearth | `#C96B3B` | warm mid, links on dark |
| Lantern | `#F6C977` | highlight, CTA glow end, the "guiding light" |
| Moss | `#617C56` | organic secondary, calm positive |
| Twilight | `#243248` | dark section ground (workshop dusk) |
| Smoke | `#2E2A28` | darkest ground, footer |

### Neutral — paper
| Token | Hex | Use |
|---|---|---|
| Moon White | `#F9F8F7` | default page (paper) |
| Fog | `#F2F0F4` | alternate section |
| Ash | `#C7C4D1` | borders, muted lines |
| Ink | `#20202A` | body + headlines on light |

### Accent — Wonder pastels (sparingly)
Hearth Pink `#F5B7D6` · Bloom Rose `#E88EC3` · Lavender Mist `#C8B7F7` ·
Soft Periwinkle `#A8B8FF` · Sky Glow `#9FE8FF` · Mint Whisper `#CFF5E6`.

> **Discipline:** pastels are *sparks of curiosity* — eyebrow labels, story-line
> dots, tags, tiny hovers. They never carry a whole surface. The base does the
> heavy lifting; pastels twinkle.

**CTA glow gradient:** `linear-gradient(135deg, Ember → Lantern)` on warm Ink text.
This is the one place a gradient is welcome (it reads as *glow*, not chrome).

---

## 3. Typography (reframed: workshop journal, not wedding magazine)
| Role | Family | Notes |
|---|---|---|
| Display | **Fraunces** (700–900, opsz) | literary *with character* — letterpress / old-map / workshop-journal, not boutique |
| Body | **Inter** (400/500/700) | clean, calm, human |
| Mono | **DM Mono** | install commands, code, "forge marks" |
| Annotation | **Parisienne** | handwritten, **rare** — one margin note, like ink in a notebook |

Sentence case everywhere (HEARTHWORK voice rule survives). No ALL CAPS except
small-caps eyebrow labels via letter-spacing.

---

## 4. Atmosphere, not pattern
Backgrounds are **fog, bokeh, light-clouds, gradients and macro photography** —
never geometric patterns, loud textures or hard grids. Dark Hearth sections use a
twilight ground with a soft ember glow; light Wonder sections use Moon White paper.

**Imagery rules** (extends `preview/brand-imagery.html`): two categories (Wonder /
Hearth above). Always shot macro/intimate, soft depth of field, generous quiet
zone for text. **Avoid:** stock-corporate, cold sci-fi, neon, studio-flat, cartoon,
"baby" cuteness. Ember **glows**, never blazes. (The 8 images in this package were
generated to these rules; see `site/assets/images/`.)

---

## 5. Frosted paper (glassmorphism, restrained)
Allowed: **frosted paper** only — 5–10% blur, soft white/paper transparency, thin
light border. Used on: sticky nav, the hero content card, the pricing sheet.
Forbidden: neon edges, strong reflections, sci-fi glass, Apple-ad overkill.

```css
--glass: rgba(249,248,247,.72);
--glass-border: rgba(255,255,255,.55);
backdrop-filter: blur(10px);
```

---

## 6. Story lines (everything connects)
A recurring thin, curved, **dashed path with dots, tiny sparks and markers** —
like a treasure map / workshop diagram — threads between sections. It suggests
*alles hängt zusammen*. Implemented as inline SVG dividers (`.storyline`). Keep
them faint (Ash / pastel), 2px, rounded caps.

---

## 7. Symbols
- **Ember, not flame** — flames shout; embers are calm and warm.
- **Lantern** — a light that *accompanies*, doesn't blind. Section markers, the wordmark dot.
- **Single spark** — one idea, not an explosion. Hover accents, the hero highlight.
- **Forge marks** — hammer marks, metal, workbench, wood: the "craft" texture, used sparingly in mono/detail.

---

## 8. Motion (alive, but slow)
Verbs: **schweben, atmen, gleiten, wachsen, verblassen** (hover, breathe, glide,
grow, fade). Never jump, shake, explode.
- Reveal: opacity 0→1 + 16px rise, 600ms, decelerate. One per element.
- Breathe: hero spark scales 1↔1.06 over ~4s, infinite, gentle.
- Buttons: soft + slightly elastic (spring) on hover (scale 1.02), never mechanical.
- Everything inside `@media (prefers-reduced-motion: no-preference)`.

---

## 9. Layout
- **40 / 60** rhythm: information on one side, emotion (image) on the other.
- **Large breathing room** — 96px section air on desktop, one idea per screen.
- Buttons feel soft/organic (pill or 16px radius); the interface should feel like
  *exploring a room*, not *operating software*.

---

## 10. Anti-hard-sell commerce (unchanged from v1.0 intent)
The default path offers **understanding and trying**, never buying. Pricing lives
behind one quiet, honest link (*"Was kostet das? — kurz und ehrlich"*) that slides
up a frosted pricing sheet (the single playful spring moment). Two warm CTAs:
1. *Mehr erfahren / austauschen / Ideen einbringen.*
2. *Unverbindlich ausprobieren — free 4 ever (Shareware).*

---

## 11. Added vs. existing — fold-back checklist
| Existing (repo) | This package adds / re-bases |
|---|---|
| `tokens.json` navy/orange/off-white (v0) | **Wonder+Warmth palette** (Hearth base + pastel accents) |
| Nunito + DM Sans | **Fraunces** display + **Inter** body + Parisienne annotation |
| Imagery *rules* (one layer) | **two imagery layers** (Wonder / Hearth) + 8 reference images |
| Components, density, motion tokens | frosted-paper rule, **story lines**, ember/lantern/spark symbols, breathe motion, 40/60 editorial layout, anti-hard-sell commerce |

> **Recommended fold-back into HEARTHWORK repo:** add `color.hearth.*` +
> `color.accent.*` to `tokens.json`; add font tokens for Fraunces/Inter; add
> `preview/editorial-layout.html` and `preview/storylines.html`; expand
> `brand-imagery.html` to the two-layer model. I can prepare that PR on request.
