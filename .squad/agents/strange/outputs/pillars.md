# PredictaGol Content Pillars — v1

**Owner:** Doctor Strange (`strange`). Read this before every calendar / ideation pass.
**Audience:** Shuri (for creative direction), Cap (for compliance context), Stark (for retro categorization).
**Cadence:** Reviewed weekly in retros; pillar weights shift based on engagement deltas.

Five pillars. Every Idea card Strange writes is tagged with exactly one pillar. The pillar drives template selection, voice, and platform priority.

---

## Pillar 1 — Pronóstico del Día

**What:** A concise "what to watch" for today's match. Reads as a smart friend's preview, never as a sportsbook tip sheet.

**Includes:** Matchup framing, the form story going in, one statistic the casual fan didn't know, a soft prediction stated as opinion, the soft CTA `Tu pick en predictagol.com`.

**Excludes:** Momios, casa de apuestas, value bets, parlays — anything in `brand-kit.md` §1 forbidden list.

**Voice register:** Analytical-warm. Authority without arrogance.

**Templates:** `pronostico-del-dia` (Shuri's renderer).

**Platforms (priority):** IG feed, X, Threads. Reels/Shorts variant when the matchup has a viral hook.

**Cadence:** 1 per day on tournament days. Pre-tournament: 1 every 2 days.

**Success metric:** Saves + replies-with-pick.

---

## Pillar 2 — Quiniela Challenge

**What:** An invite to predict the score or a binary outcome. The community-engagement engine.

**Includes:** Big question, two or three answer chips, soft CTA, hashtag `#QuinielaPredictaGol`.

**Excludes:** Real-money framing, leaderboards that imply prizes ("gana premio"), any urgency that mimics a betting close-time pressure tactic.

**Voice register:** Playful, conversational, invites debate.

**Templates:** `quiniela-challenge`.

**Platforms (priority):** IG (Story polls + feed), TikTok (comments-bait format), Threads (debate-friendly), X (poll feature).

**Cadence:** 1 per day on tournament days; 2 per match-day. Pre-tournament: 3-4 per week.

**Success metric:** Comments + poll-vote rate + replies.

---

## Pillar 3 — Datos Curiosos

**What:** A surprising stat or historical nugget about today's teams. The "smart friend" pillar.

**Includes:** Eyebrow `DATO CURIOSO`, a massive statline rendered as billboard typography, one body line of context, source attribution as visitor-facing freshness language (never naming an API).

**Excludes:** Stats older than 5 years unless explicitly historical, anything unverifiable, anything that reads like a betting "trend".

**Voice register:** "¿Sabías que…?" tone. Friendly nerd.

**Templates:** `datos-curiosos`.

**Platforms (priority):** IG feed (carousel-friendly), X (quote-tweet bait), Threads (provokes "actually" replies, which is good).

**Cadence:** 3 per week. Tournament days: as many as the matches warrant.

**Success metric:** Shares + quote-replies.

---

## Pillar 4 — Tu Equipo, Tu Data (Mexico-first)

**What:** Team-summary highlights tilted Mexico-first ("El Tri", local pride). Argentina/Brazil/Colombia/USA enter rotation in Week 1+.

**Includes:** Team flag + name, 3-row stat grid (form / goals / defense), opinion line on outlook, the soft CTA.

**Excludes:** Any betting outlook ("favoritos a ganar el grupo a momios de…"), any unverified player gossip, anything that disparages a rival in a way that could be racist or xenophobic.

**Voice register:** Proud-but-honest. Knows when to call out a struggling team.

**Templates:** `tu-equipo-tu-data`.

**Platforms (priority):** IG feed (4:5 carousel), Threads (long-form fan thread), TikTok (Story-style breakdown).

**Cadence:** 1 per team per week minimum; daily during knockout rounds.

**Success metric:** Saves + follows (proxy for team-affinity audience growth).

---

## Pillar 5 — Momento del Partido

**What:** Match-day live reaction format. The pillar that requires Cap on standby and Shuri's reactive slot.

**Includes:** A pre-built reactive-slot template that Shuri fills in real time (goal, big save, controversial call, half-time stat). Brief, hook-first, asset-ready in < 5 minutes.

**Excludes:** Bet-after-the-event prompts ("ahora a apostar al siguiente gol"), any framing that mocks a player or referee in a personal way.

**Voice register:** High-energy, in-the-moment. Emoji-friendly here (1, max 2 per post).

**Templates:** Lightweight headline-on-gradient template (built into Shuri's `launch-announcement` family — reuse with a different eyebrow).

**Platforms (priority):** X (real-time native), Threads (real-time native), IG Story, TikTok Stitch.

**Cadence:** 2-4 per high-stakes match; 0-1 per group-stage match.

**Success metric:** Velocity in first 30 min (impressions / engagements per minute).

---

## Pillar mix (initial weights)

For a typical week pre-tournament:

| Pillar | Share of posts |
|---|---|
| Pronóstico del Día | 30% |
| Quiniela Challenge | 25% |
| Datos Curiosos | 20% |
| Tu Equipo, Tu Data | 15% |
| Momento del Partido | 10% |

During the tournament, Momento del Partido jumps to ~30% on match days and the others compress proportionally.

---

## How Strange picks a pillar

1. Check the day's fixture list (from `data/static/openfootball/cup.txt` and the seeded ingest layer).
2. Pull Widow's latest pulse cards for trending hooks.
3. Choose the pillar that best matches today's tentpole event:
   - Match day with a big-3 nation playing → Pronóstico del Día tentpole + Quiniela Challenge reactive.
   - No matches → Datos Curiosos or Tu Equipo Tu Data.
   - Knockout match → Momento del Partido pre-built + Pronóstico del Día.
4. Reserve 2-3 reactive slots per day for Momento del Partido even if not currently scheduled.

Output: Idea card with `pillar` field set, payload with the template-relevant inputs (homeTeam, awayTeam, statLine, etc.).
