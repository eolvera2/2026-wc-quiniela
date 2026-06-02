# Morning Review — WC26 Quiniela

_Generated overnight (2026-06-01 → 2026-06-02). Read top to bottom; action items are at the end._

## TL;DR

- All **research, plan updates, and two execution-ready implementation plans are DONE** and on disk.
- **No code was scaffolded or run** — the `bash` shell is not available on this machine, so `npm`/`node`/`vitest` cannot execute. This is the single blocker for starting Phase 1.
- Your first task this morning: **make the shell work** (see Action Items), then Phase 1 can run top-to-bottom.

## What was completed overnight

### 1. Research (5 streams, all source-cited)
- **AI/agentic discoverability (GEO/AEO):** robots.txt allowances for AI bots (OAI-SearchBot, PerplexityBot, ClaudeBot), `llms.txt`, answer-first content structure, JSON-LD schemas (Article/FAQPage/SportsEvent), GA4 AI-referral tracking.
- **Google scaled-content-abuse mitigation:** the existential SEO risk. E-E-A-T author infrastructure, original data per page, human-in-the-loop + AI disclosure, gradual publishing, outcome tracking, `rel="sponsored"`.
- **Social viral strategy:** TikTok/IG/X/FB formats & specs, ~80%-automatable repurposing pipeline from article JSON, T-48h→post-match cadence, bilingual hashtags, platform gambling-policy compliance (predictions framing, link-in-bio only).
- **Gambling-ad compliance:** ES+EN footer disclaimers, responsible-gambling hotlines (US 1-800-MY-RESET, MX CONADIC/CIJ), FTC affiliate disclosure rules, US state geo-restrictions, SEGOB-only MX operators, banned-language list, age gate, GDPR/CCPA.
- **Tier 2/3 engineering risks:** Azure model-router opaque metadata, SQLite-in-Blob concurrency/corruption, LLM hallucination in YMYL, API-Football WC2026 coverage timing, Opus cost magnitude, single-maintainer silent failures, plus 7 Tier-3 items.

### 2. `docs/plan.md` updated (verified on disk, ~33 KB)
- New sections: **AI & Agentic Discoverability**, **Marketing & Social Distribution**, **Legal & Compliance (Entertainment Positioning)**.
- **Risks** section restructured: Google scaled-content abuse promoted to existential, plus 13 new engineering risks.
- Setup Checklist extended (legal review, Azure spend caps, API-Football tier check, model-router test call, LLMs.txt/schema plugins, failure alerting, author profiles).

### 3. Two execution-ready implementation plans (verified on disk)
- **`docs/plans/2026-06-01-phase1-pure-logic-core-implementation.md`** (~60 KB) — 15 TDD tasks, NO external services: project scaffold, DB schema + `db.js`, affiliate injector (4 tasks), pricing/cost math, cost-report aggregation, cadence selector, prompt+disclaimer assembly. Fully runnable with `npm ci` + `vitest`.
- **`docs/plans/2026-06-01-phase2-live-service-integration-implementation.md`** (~92 KB) — 15 TDD tasks: rate limiter, Azure router, generation batch, API-Football ingest (fixtures/teams/odds), WordPress upsert publisher, sitemap+IndexNow, Azure Blob with lease locking, `run-cadence.js`, GitHub Action. All external services mocked in tests.

Both plans contain complete copy-pasteable code, exact file paths, and exact `vitest` commands — an engineer with zero context can run them.

## What is NOT done (and why)

- **No source code written or executed.** Two reasons, stated plainly:
  1. **No shell access** — the `bash` tool fails ("Bash not found in PATH"). I could not run `npm`, `node`, or tests. Per the TDD discipline this project follows (evidence over claims), I did not dump unverified code claiming it works. The plans capture the code in runnable form instead.
  2. Phase 2 additionally needs your provisioned credentials (Azure AI, API-Football, WordPress, Azure Blob).

## Action Items (only you can do these)

### Immediate — unblock the shell (required for ALL code work)
You already have `git` (this is a git repo), so **Git for Windows is likely installed but `bash.exe` is not on PATH** for the Amplifier shell. Options, easiest first:
1. Confirm Git Bash exists at `C:\Program Files\Git\bin\bash.exe` (or `...\Git\usr\bin\bash.exe`). If it does, add that directory to your system PATH and restart the Amplifier session.
2. If Git for Windows is not installed: install it (includes Git Bash) — https://git-scm.com/download/win
3. Alternative: install WSL — https://learn.microsoft.com/windows/wsl/install

Once `bash` works, Phase 1 needs no credentials and can run immediately: `npm ci` then the per-task `vitest` commands in the Phase 1 plan.

### Before Phase 2 — provisioning & accounts
- Provision **Azure AI Foundry** project; deploy Claude Opus + GPT-4o-mini + model-router (Cost mode); set a **hard spend cap (~$100)** in Azure Cost Management.
- **Verify API-Football covers World Cup 2026** at your subscription tier (coverage is sometimes gated to higher tiers) — confirm `lineups` and `odds` populate for upcoming fixtures.
- Stand up **WordPress** (managed host w/ caching, not shared) + REST API + Application Password on a dedicated Author-role bot user.
- Create **Azure Blob Storage** account + container for `wc26.sqlite`; capture connection string.
- Apply to affiliate programs: **Caliente.mx**, **Bet365 Partners**, **Skimlinks** (approvals can take weeks — start now).
- **Legal review** of the ES/EN disclaimers before launch.

### Highest-priority verification (from risk research)
Before trusting the cost design: **make one real call to the Azure model-router and inspect the raw JSON response** — confirm it returns the actual underlying model name AND token usage. The entire `generation_log` cost-per-article design depends on this; the router may return only your deployment alias. If so, the fallback is explicit per-model deployments routed in our own code (documented in the Phase 2 plan / risks).

## Suggested sequence for today
1. Fix the shell (Action Items #1).
2. Run **Phase 1** end-to-end (`npm ci` → work through the 15 TDD tasks). No credentials needed — this builds and verifies the entire pure-logic core.
3. In parallel, kick off the slow external dependencies (affiliate applications, Azure provisioning, API-Football tier check).
4. Once credentials exist, run **Phase 2**.
