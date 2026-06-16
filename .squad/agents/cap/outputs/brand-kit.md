# PredictaGol Social Brand Kit

**Owner:** Captain America (`cap`) — Guardian of brand and compliance.
**Audience:** Shuri (Creator), Strange (Strategist), Stark (Operator). Read this before producing any social asset.
**Source of truth:** This file distills the social-relevant subset of `docs/worldcup-design-system.md` and `src/publish/staticSite.js`. If any social-facing rule below conflicts with the parent design system, the parent design system wins for **on-site** surfaces; **this file wins for social.**

---

## 1. Voice

| | |
|---|---|
| Language | Spanish (Mexico/LatAm first). English never. |
| Persona | Warm, modern, fan-coded. Friend at the bar with the data, not the broadcaster reading the prompter. |
| Tone register | High-energy on match days; analytical on calendar days; playful on stat/dato days. Never solemn. Never preachy. |
| Sentence length | Short. Two clauses max per sentence in captions. |
| Emoji | Sparing — one per post, max two. Flags allowed (🇲🇽🇦🇷🇧🇷🇨🇴🇺🇸 etc.). |
| Punctuation | Spanish (`¿`, `¡`, `«»` if needed). No three-dot trailing. |
| Capitalization | Sentence case in body. UPPERCASE only for the brand wordmark and headline eyebrows. |

### Allowed vocabulary (use freely)
`pronóstico, pronosticar, quiniela, pick, aciertos, puntos, predicción, momento, datos, dato curioso, estadística, jugada, partido, alineación, racha, fixture, jornada, grupo, clasificar, octavos, cuartos, semifinal, final, llave`

### Forbidden vocabulary in social (Cap kills any card that contains these)
`momios, apuesta, apostar, casa de apuestas, value bet, parlay, +EV, betting, bet, odds, line, sportsbook, wager, juega y gana, gana dinero, gana premio`

These words **may** live on-site in the Pronóstico / Momios section behind responsible-gambling context. They never appear on social.

### Always include
- Profile bio disclosure (one-time, in the bio itself): `Juego social de pronósticos. No es una casa de apuestas.`
- Match-day cards may end with the soft CTA `Tu pick en predictagol.com` (or variant `Pronostica gratis en predictagol.com`). Never a "join now / sign up / claim bonus" pattern.

---

## 2. Color tokens

Use the semantic names below. Do not hardcode hex inside templates — pull from `marketing-board/renderers/tokens.js`.

| Semantic role | Token | Hex | Use |
|---|---|---|---|
| Primary surface | `--surface-base` | `#020f2a` | Default background for posts |
| Jungle surface | `--surface-jungle` | `#002018` | Mexico-angle / festival cards |
| Festival gradient | `--surface-festival` | `linear-gradient(135deg, #003020 → #071733)` | Hero / launch cards |
| Card glass | `--surface-card` | `rgba(255,255,255,0.08)` | Inset content blocks |
| Accent primary (jaguar gold) | `--accent-primary` | `#f4bd4f` | Headline highlight, CTA pill |
| Accent secondary (turquoise) | `--accent-secondary` | `#00c6a3` | Quiniela accents, link color |
| Accent electric (lime) | `--accent-electric` | `#d7ea1f` | Time-sensitive / urgency badges |
| Win state | `--color-win` | `#16a34a` | Acertaste / posted-success |
| Draw state | `--color-draw` | `#f5a623` | Empate / pending |
| Loss state | `--color-loss` | `#c8102e` | Fallaste / killed |
| Text primary | `--text-primary` | `#ffffff` | All body copy on dark |
| Text secondary | `--text-secondary` | `#b7c3d7` | Subheads, captions |
| Text muted | `--text-muted` | `#8899bb` | Metadata, timestamps |

**Hard rules:**
- Accent colors are **accents only**, never primary fills covering > 30% of canvas.
- Lime (`--accent-electric`) is reserved for urgency/time-sensitive callouts (e.g., "FALTA 1H").
- Two-accent combos allowed only when one is gold + one is turquoise. Never lime + gold (vibrating contrast).

---

## 3. Typography

| Family | Use | Source |
|---|---|---|
| **Poppins** (display, 600–900) | Headlines, eyebrows, big numbers | System / web fallback |
| **Noto Sans** (body, 400–600) | Captions, supporting text, metadata | System / web fallback |
| **PredictaGol** wordmark | Brand lockup ONLY (`.brand-wordmark` style) | `public/fonts/PredictaGol-NormalRegular.ttf` |

**Headline sizing per format:**

| Canvas | Headline px | Eyebrow px | Body px |
|---|---|---|---|
| 1080×1920 (Stories/Reels/Shorts) | 110–150 | 36 | 42 |
| 1080×1350 (IG feed 4:5) | 90–120 | 32 | 36 |
| 1080×1080 (X 1:1) | 80–100 | 28 | 32 |

**Tracking:** Headlines tight (`-0.02em`). Eyebrows wide (`+0.12em`, uppercase). Body normal.

**Wordmark rules:**
- The `PredictaGol` custom font is **only** used inside `.brand-wordmark` (the lockup pairing logo + wordmark).
- Wordmark style: `font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase`.
- Never use the custom font for body, headline, or any other element.

---

## 4. Logo & wordmark

- **Logo file:** `public/PredictaGol_Logo.png` (repo root).
- **Minimum clear space:** 1× the height of the mark on all sides.
- **Minimum size:** 64 px tall on social canvases (1080×1080 / 1080×1350 / 1080×1920).
- **Lockup orientation:** Logo to the left of the wordmark by default; stacked (logo above wordmark) only for square avatars / profile pictures.
- **Placement on social cards:** Bottom-center on hero / launch templates; bottom-right on matchup / quiniela / dato templates (so it doesn't compete with the headline).
- **Never:** crop, rotate, recolor, add drop shadows beyond a 0–2 px inner shadow for legibility on bright backgrounds.

---

## 5. Safe zones (per format)

| Format | Aspect | Use | Reserved top | Reserved bottom | Reserved sides |
|---|---|---|---|---|---|
| 1080×1920 | 9:16 | TikTok, IG Reels, YT Shorts, IG Stories | **220 px** | **380 px** | 80 px each |
| 1080×1350 | 4:5 | IG feed (single + carousel) | 80 px | 120 px | 80 px each |
| 1080×1080 | 1:1 | X (Twitter) image post | 80 px | 80 px | 80 px each |

Headlines, logos, CTAs, and disclosures **must** sit inside the safe area. Decorative elements (gradients, dot grids, glow) may bleed.

---

## 6. Brand-safe inspiration boundaries

**Allowed:** generic football geometry (hexagons, dot grids), dark navy + jungle backgrounds, jaguar/turquoise/lime accents, country flag emojis or vector flags, stadium-light motifs, abstract goal-net textures, Mexican/LatAm cultural motifs (papel picado as accent — sparingly), tabular numbers for scores/stats.

**Forbidden:** FIFA logo, World Cup™ logo, WC26 official wordmark, host-city marks, the official mascots (Maple, Zayu, Clutch), Copa Mundial trophy photographs, any official campaign lockup, broadcaster marks, sponsor marks, club crests we don't have rights to display individually.

When in doubt: if you'd need to ask a licensing department, don't put it on the canvas.

---

## 7. Platform-specific notes

| Platform | Image format priority | Caption length sweet spot | Hashtag style |
|---|---|---|---|
| Instagram (feed) | 1080×1350 (4:5) | 120–180 chars first line + 1–2 hashtags inline + a block of 5–8 below | mix branded `#PredictaGol` + topical `#Mundial2026 #ElTri` |
| Instagram (Reels/Stories) | 1080×1920 (9:16) | 80–120 chars | 3–5 hashtags max |
| TikTok | 1080×1920 (9:16) | 70–100 chars | 3–4 trending + 1 branded |
| X / Twitter | 1080×1080 (1:1) | 180–240 chars | 1–2 hashtags |
| YouTube Shorts | 1080×1920 (9:16) | Title ≤ 60 chars + #Shorts in description | `#Shorts` mandatory; 2–3 others |
| Threads | 1080×1080 (1:1) | Conversational, 150–300 chars | 0–1 hashtag |

---

## 8. Compliance handoff

After authoring a card, Shuri must:
1. Run her render against the templates in `marketing-board/renderers/`.
2. Self-check against this brand kit (color, type, wordmark, vocab, safe zone).
3. Hand off to Cap by advancing to `review`.

Cap's review uses `.squad/agents/cap/outputs/compliance-rubric.md` — the canonical Pass / Revise / Kill rubric. Anything not in the rubric defers to this brand kit.
