# PredictaGol Social Compliance Rubric

**Owner:** Captain America (`cap`). Used on every card transition from `copywritten` → (`to_be_posted` | `revising` | `killed`).
**Source of truth for brand:** `.squad/agents/cap/outputs/brand-kit.md`.
**Source of truth for vocabulary:** Same file, §1.

Cap reads each card and assigns one of three verdicts. Output is a markdown file at `.squad/agents/cap/outputs/reviews/<YYYY-MM-DD>/<card-id>.md` and a SQL `card_events` row.

---

## Verdicts

| Verdict | Action | When |
|---|---|---|
| **PASS** | Advance card to `to_be_posted` | All gates green |
| **REVISE** | Move card to `revising`, owner = `shuri`, attach numbered note list | At least one gate yellow; nothing red |
| **KILL** | Move card to `killed`, attach reason | Any gate red, OR the post can't be salvaged within 2 revisions |

If a card is on its 3rd revise loop, escalate to KILL with note "loop exhausted, redesign from brief".

---

## The 8 Gates (every card passes through all 8)

### Gate 1 — Forbidden vocabulary
**Red:** Any of `momios, apuesta, apostar, casa de apuestas, value bet, parlay, +EV, betting, bet, odds, line, sportsbook, wager, juega y gana, gana dinero, gana premio` appears in any visible surface (caption, hook, on-screen text, alt text, hashtags, video script, voiceover).
**Yellow:** Borderline word that could be misread as betting (e.g., "ganador seguro"); revise to a clearly social-game framing.
**Green:** All copy uses the allowed vocabulary in `brand-kit.md` §1.

### Gate 2 — Sportsbook positioning
**Red:** Any "join / sign up / claim / bonus / deposit / odds / payout" pattern.
**Yellow:** CTA pressure that resembles a sportsbook landing page (e.g., "ÚLTIMA OPORTUNIDAD").
**Green:** Soft CTA like `Tu pick en predictagol.com` or `Pronostica gratis en predictagol.com`, or no CTA.

### Gate 3 — Brand-safe imagery
**Red:** Visible FIFA / World Cup™ / WC26 mark, official mascot (Maple, Zayu, Clutch), host-city logo, broadcaster bug, sponsor logo, or a club crest we don't have explicit permission to use.
**Yellow:** Photo of trophy / stadium so iconic it implies official endorsement.
**Green:** Brand-safe geometry only (per `brand-kit.md` §6).

### Gate 4 — Design tokens
**Red:** Uses a non-brand color anywhere primary (e.g., a pure red `#ff0000` background, a stock-photo green).
**Yellow:** Accent overuse (>30% canvas) or wrong accent context (e.g., lime used for non-urgent content).
**Green:** Surfaces and accents pulled from `brand-kit.md` §2 via `renderers/tokens.js`.

### Gate 5 — Typography & wordmark
**Red:** PredictaGol custom font used outside `.brand-wordmark`. Headline in Comic Sans equivalent. Logo cropped/rotated/recolored.
**Yellow:** Headline below the format minimum (e.g., 60 px on 1080×1920 — invisible on a phone).
**Green:** Poppins display + Noto Sans body + PredictaGol wordmark only in lockup, sized per `brand-kit.md` §3.

### Gate 6 — Safe zones
**Red:** Critical content (headline, logo, CTA) falls inside the platform-UI reserved region (e.g., top 220 px on a 1080×1920).
**Yellow:** Decorative element overlaps reserved zone in a way that competes visually with the platform UI.
**Green:** All critical content inside the safe area per `brand-kit.md` §5.

### Gate 7 — Factual accuracy
**Red:** Pronóstico / dato / stat that is verifiably false ("México ganó la Copa 2014"), or a confident prediction stated as guaranteed outcome ("México gana hoy seguro").
**Yellow:** Stat is plausible but not cited; revise to add a source note in `payload.sources[]` or soften to "según [fuente pública]".
**Green:** All factual claims either verifiable or framed as opinion/prediction.

> Note: never name specific API providers or refresh windows in public copy. Use visitor-facing freshness language ("según datos públicos recientes") if a source must be named.

### Gate 8 — Spanish quality
**Red:** Machine-translated awkwardness, English fragments inside the caption, wrong gender agreement on a key noun.
**Yellow:** Stiff phrasing, regional slang that doesn't match Mexican/LatAm voice.
**Green:** Natural Mexican/LatAm Spanish per `brand-kit.md` §1 voice profile.

---

## Per-platform overrides

| Platform | Extra red-line |
|---|---|
| Instagram + Threads | Meta gambling policy: no implication of monetary winnings, no real-money flow shown in creative. Our position as a free social game is fine; never imply otherwise. |
| TikTok | Same as Meta; additionally no minors visible in any creative; no on-screen text in the bottom-right corner (covered by TikTok UI). |
| YouTube Shorts | Title must include `#Shorts` per platform spec. No misleading thumbnails. |
| X | 280-char limit. Soften CTAs; X audience is allergic to sales tone. |

---

## Review output format

The file Cap writes per card:

```markdown
# Review — <card_id>

**Verdict:** PASS | REVISE | KILL
**Reviewed at:** <ISO timestamp>
**Reviewer:** cap (Captain America)

## Gate scorecard
| Gate | Score | Note |
|---|---|---|
| 1. Forbidden vocabulary | G/Y/R | ... |
| 2. Sportsbook positioning | G/Y/R | ... |
| 3. Brand-safe imagery | G/Y/R | ... |
| 4. Design tokens | G/Y/R | ... |
| 5. Typography & wordmark | G/Y/R | ... |
| 6. Safe zones | G/Y/R | ... |
| 7. Factual accuracy | G/Y/R | ... |
| 8. Spanish quality | G/Y/R | ... |

## Revise list (only if REVISE)
1. <numbered actionable note for Shuri>
2. ...

## Kill reason (only if KILL)
<one paragraph>

## Sign-off
The card is approved for autonomous publishing to: [x, youtube, instagram, threads, tiktok] — list only the platforms whose extra red-lines also pass.
```

The same scorecard is mirrored into the SQL `card_events.meta_json` so the board UI can render it in the card detail drawer.
