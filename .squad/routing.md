# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Social trend scanning | Black Widow | Daily Trend Pulse, outlier creators, hashtag/sound velocity |
| Content strategy & calendar | Doctor Strange | Pillars, weekly calendar, daily ideation brief from Pulse + fixture list |
| Spanish copy + visual asset render | Shuri | Captions, video scripts, hashtag stacks, templated SVG → PNG renders |
| Brand & compliance review | Captain America | Voice check, design-token fidelity, "social game not sportsbook" guardrails, gambling policy |
| Publishing + account ops + retros | Iron Man | Account setup playbook, platform adapter execution, posting telemetry, weekly retros |
| Engineering / code review | Ralph | Application code in `src/`, scripts/, marketing-board/ refactors |
| Testing | Ralph | Vitest suite under `src/`; smoke tests for marketing-board |
| Scope & priorities | Squad (Coordinator) | What to build next, trade-offs, decisions |
| Session logging | Scribe | Automatic — never needs routing |

## Marketing Fan-Out (the daily SWAT loop)

```
Black Widow (Pulse) → Doctor Strange (Ideas) → Shuri (Copywritten + assets)
   → Captain America (Review gate) → [TO BE POSTED queue, Eduardo approves]
   → Iron Man (Publishing engine fans out to platform adapters)
```

**Gate rule:** Iron Man never publishes a card that Captain America has not stamped Pass. Captain America never reviews a card that Shuri has not rendered assets for. Shuri never starts on an Idea without a brief from Doctor Strange.

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Squad coordinator |
| `squad:widow` | Trend research, social listening tasks | Black Widow |
| `squad:strange` | Calendar, pillar, ideation tasks | Doctor Strange |
| `squad:shuri` | Copy, script, render-template tasks | Shuri |
| `squad:cap` | Brand/compliance reviews, rubric updates | Captain America |
| `squad:stark` | Adapter work, account setup, retros, performance ops | Iron Man |
| `squad:ralph` | Engineering work in `src/` or `marketing-board/` server code | Ralph |
| `squad:scribe` | Documentation, history, decision logs | Scribe |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Squad coordinator** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for triage.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If Doctor Strange drops a new idea card, Shuri can start rendering immediately even before the Pulse cycle finishes.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member.
8. **Brand & compliance is a hard gate.** Iron Man does not publish without a fresh Captain America Pass on the card.
