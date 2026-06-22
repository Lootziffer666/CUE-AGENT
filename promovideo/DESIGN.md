# Design Contract — Horrorgeticon Ops Promo

**Style:** Shadow Cut (HyperFrames named style — dark, cinematic, dramatic reveals)

## Atmosphere
Deep-black stage with ember-orange accent. High contrast. No gradients on text.
Inspired by horror film trailers — reveal from darkness, hold with authority.

## Palette
| Token | Hex | Use |
|-------|-----|-----|
| Canvas / bg-deep | `#050505` | Scene background |
| Surface | `#111111` | Cards, device frames |
| Surface-raised | `#1A1A1A` | Elevated cards |
| Border | `rgba(255,255,255,0.08)` | Subtle borders |
| Accent (ember) | `#FF6B2C` | Brand orange — headlines, labels, CTA |
| Accent-glow | `rgba(255,107,44,0.25)` | Ambient glow behind accent elements |
| Danger | `#C42B2B` | Warning cards |
| Text-primary | `#F8F6F2` | Headlines, body |
| Text-muted | `rgba(248,246,242,0.55)` | Sub-labels, descriptions |
| Text-dim | `rgba(248,246,242,0.28)` | Tertiary, timestamps |

## Typography
- **Display / Wordmark:** system-ui, font-weight 900, 80–120px, letter-spacing -0.03em
- **Headline:** system-ui, font-weight 800, 52–72px, letter-spacing -0.02em
- **Sub-headline:** system-ui, font-weight 700, 32–44px
- **Body:** system-ui, font-weight 500, 24–30px
- **Label / Tag:** system-ui, font-weight 700, 14–16px, letter-spacing 0.08em, UPPERCASE
- **Mono / Code:** `"Geist Mono", "JetBrains Mono", monospace`, font-weight 500

## Shape
- Radius: 16px (cards), 8px (tags), 4px (borders)
- Shadow-deep: `0 60px 120px rgba(0,0,0,0.8)`
- Shadow-card: `0 20px 60px rgba(0,0,0,0.5)`
- Device frames: `border: 1px solid rgba(255,255,255,0.1)`

## Motion Defaults
- Entrance ease: `power3.out`
- Stagger: 0.15–0.20s
- Hero reveals: `expo.out`
- Transition: metallic swoosh, 0.4s per boundary
- Crossfade ease: `power2.inOut`

## Per-Scene-Type
- **Title/Hook scenes:** Full-bleed dark bg, oversized text, `expo.out` scale reveal
- **Pain cards:** Tight stagger, muted border glow, no fill backgrounds
- **Feature scenes:** Dark device frame + screenshot, orange label top-left, slide from side
- **CTA:** Ember glow vignette, monospace command block, breathing scale pulse

## Anti-patterns (DON'Ts)
- No light-mode elements in any scene
- No jitter or vibration effects
- No clipPath transitions
- No `tl.from()` on opacity-bearing elements — always `tl.fromTo()`
