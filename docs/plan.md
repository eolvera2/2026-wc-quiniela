# 2026 World Cup Quiniela — Implementation Plan

## Problem & Approach
Build the system described in `docs/WC26_Quiniela_Biz_Plan.docx`: an LLM-orchestrated pipeline that ingests World Cup match data from API-Football, generates Spanish-language SEO/betting articles via two discrete Azure OpenAI deployments (gpt-4o for tactical analysis, gpt-4.1-mini for lighter article types), injects CPA affiliate links, and publishes to Azure Static Web Apps at scale.

**Stack:** Node.js + SQLite (via `better-sqlite3`, persisted to Azure Blob Storage) + Azure OpenAI (two deployments: gpt-4o and gpt-4.1-mini) + **API-Football direct / API-Sports** as the primary football data provider + Azure Static Web Apps (static HTML generation & hosting) + GitHub Actions (scheduler and deployment).

> **Note on SQLite driver:** the business plan says "SQLite3"; we use `better-sqlite3` (synchronous, faster, simpler batch code). Functionally equivalent for our use; flagged as an intentional deviation.

> **DB persistence (Azure Blob Storage):** the system runs on a schedule via GitHub Actions, not an always-on server, so the SQLite file lives in an **Azure Blob Storage container**. Each scheduled run: (1) downloads `wc26.sqlite` from the blob, (2) runs its pass, (3) uploads the mutated file back. A GitHub Actions **concurrency group** (`group: wc26-pipeline, cancel-in-progress: false`) guarantees a single writer at a time — no corruption, no race. If write contention ever becomes a constraint (it won't at this cadence/volume), the upgrade path is **Azure SQL Database** or **Azure Database for PostgreSQL** — the `db.js` wrapper isolates this so the swap stays contained.

**Core SEO model (from biz plan §2):** this is an *intent-capture engine*, not one article per match. The full model produces **multiple articles per fixture**, one per bottom-of-funnel keyword template. **We ship these in stages** to calibrate cost-per-article on real data before scaling volume:

| Stage | Article type (`article_type`) | Keyword template | Intent |
|-------|--------------------------------|------------------|--------|
| **v1 (ship first)** | `pronostico_momios` | `Pronósticos y momios [A] vs [B]` | High (betting) — tactical analysis + CPA links |
| v2 (expand) | `alineacion_probable` | `Alineación probable [A] vs [B]` | Medium (research) — predicted XI from injury/form data |
| v2 (expand) | `quiniela_verdict` | `¿Quién gana la quiniela: [A] o [B]?` | High (pools) — Buy/Wait/Avoid verdict |
| v2 (expand) | `analisis_apostar` | `Análisis para apostar en [Team]` | High (betting) — over/under, cards, player props |

**Staging rationale:** the matrix 4×'s generation volume and Azure token spend. v1 ships **only `pronostico_momios`** (1 article/fixture, the highest-intent type), instruments true cost-per-article from production logs, then v2 expands to the remaining three once cost-per-article is measured and the economics are validated. The schema, batch runner, and prompt layer are all built `article_type`-aware from day one so expansion is config-only (add types to the active set), not a rewrite.

**Repo today:** the v1 Azure-native static site pipeline is implemented. The repository has the SQLite schema/wrapper, API-Football-style ingest clients, Azure OpenAI generation, static HTML publishing, Azure Blob DB persistence, GitHub Actions cadence workflow, demo-mode SWA deploy, and passing test coverage. Remaining implementation work is primarily real API credentialing, API-Football direct migration, deeper data ingest (H2H/injuries/lineups/extended odds), and production hardening.

## Architecture Overview
```
        GitHub Actions (scheduled, ~twice daily)
                    │  concurrency group: single writer
                    ▼
        ┌───────────────────────────────────────────┐
        │  pull wc26.sqlite ◄──► Azure Blob Storage  │
        └───────────────────────────────────────────┘
                    │
   run-cadence.js selects fixtures by T-minus(kickoff_utc)
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
   T-10 SEED    T-2 REFRESH   T-3h LOCK     ◄─ lifecycle passes
       │            │             │
       ▼            ▼             ▼
API-Football direct/API-Sports ──► ingest.js ──► SQLite (fixtures, teams, odds, kickoff_utc)
                                       │
                                       ▼
                              generate.js ──► Azure OpenAI ──► {gpt-4o | gpt-4.1-mini}
                                       │            (returns JSON article)
                                       ▼
                              SQLite (articles + generation_log)
                                       │
                              staticSite.js ─► affiliate-injector ─► dist/*.html
                                       │       (full static-site rebuild)
                                       ▼
                              sitemap + GSC submit
                                       │
                    ▼
        upload mutated wc26.sqlite ──► Azure Blob Storage
```

## Proposed Repo Layout
```
/src
  /db        schema.sql, db.js (sqlite3 wrapper)
  /ingest    fixtures.js, teams.js, odds.js, rateLimiter.js
  /generate  prompt.js (system prompt template), router.js (Azure call), batch.js
  /publish   affiliateInjector.js, staticSite.js, sitemap.js
  /config    index.js (env loader)
/scripts     run-cadence.js, seed-demo.js, cost-report.js, validate-workflow.js
/data        wc26.sqlite (gitignored)
.env.example
package.json
README.md
```

## Publishing Cadence & Lifecycle

The system is **not** a one-shot batch. Each match page has a lifecycle driven off the fixture's `kickoff_utc`, balancing two opposing forces: SEO needs pages published **early** (Google needs lead time to crawl/rank), while accuracy needs them **late** (lineups, injuries, `momios` stabilize near kickoff). We resolve this with **three passes per article**:

| Pass | Trigger (T-minus `kickoff_utc`) | Action | `lifecycle_state` |
|------|--------------------------------|--------|-------------------|
| **1 — Seed** | T-10 days | Generate + rebuild the static site with available data (H2H, season form, early odds). Claims the URL so it starts ranking. | `seeded` |
| **2 — Refresh** | T-2 days | Re-ingest fresh data, regenerate, and rebuild the same article slug in `dist/`. Peak quiniela search intent. | `refreshed` |
| **3 — Lock** | T-3 hours | Final confirmed-lineup update, in place. | `locked` |

**Scheduler (`scripts/run-cadence.js`):** on each GitHub Actions tick it (1) pulls `wc26.sqlite` from Azure Blob, (2) selects fixtures whose `kickoff_utc` crosses a T-minus threshold AND whose `lifecycle_state` hasn't yet reached that pass, (3) runs data refresh/generation for just those combinations, (4) rebuilds the full static site from all generated article rows, (5) advances `lifecycle_state` + `last_pass` + `last_refreshed_at`, and (6) uploads the mutated DB back. Idempotent: re-running a tick is a no-op for already-processed passes.

**Knockout stages:** those fixtures don't exist until prior rounds finish. The scheduler keys off `fixtures.status` — a fixture flips `scheduled` → `resolved` once teams are known, and only then enters the T-minus cadence. Knockout turnaround (~2–4 days) naturally **compresses** Seed and Refresh closer together; the threshold logic clamps so a fixture resolved inside T-10 seeds immediately.

**GitHub Actions workflow (`.github/workflows/cadence.yml`):**
- `on.schedule` cron tick (twice daily, e.g. `0 6,18 * * *`) + `workflow_dispatch` for manual runs.
- `concurrency: { group: wc26-pipeline, cancel-in-progress: false }` — the single-writer guarantee for the Blob-hosted DB.
- Secrets (Azure AI endpoint/key, API-Football direct/API-Sports key, Azure Storage connection string, SWA deployment token, affiliate URLs) injected as GitHub Actions secrets, mapped to env vars (never committed).
- Steps: checkout → setup Node → `npm ci` → `node scripts/run-cadence.js` or `node scripts/seed-demo.js` in `demo_mode` → deploy `dist/` to Azure Static Web Apps → (DB upload handled inside the cadence script).

**Timing reality (today = 2026-06-01, opener ≈ 2026-06-11):** group-stage fixtures are already known and the early matches are **inside the T-10 window now** — so the first cadence run effectively Seeds the opening slate immediately, then settles into the rolling rhythm for everything after.

## AI & Agentic Discoverability (GEO/AEO)

As users shift to ChatGPT/Copilot/Perplexity/Grok, being cited by AI answer engines matters as much as Google ranking. Make the site maximally AI-friendly alongside traditional SEO.

**robots.txt — explicit bot allowances:**
- Explicitly ALLOW: `OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`, `Claude-SearchBot`, `Claude-User`, `Google-Extended`.
- BLOCK `Bytespider` (ignores robots.txt anyway, but signals intent).
- Caveat: verify the generated static `robots.txt` and `staticwebapp.config.json` do not accidentally block ChatGPT Search or other AI crawlers.

**llms.txt — AI navigation index:**
- Publish `/llms.txt` (and `/llms-full.txt`) at site root — a curated markdown index pointing AI agents to the best content (match prediction guides, methodology, FAQ).
- Generate these from the static-site build so `/llms.txt` and `/llms-full.txt` are published with `dist/`.
- Note: this is agent-navigation infrastructure, not a ranking signal — it helps AI agents find the right pages, not boost scores.

**Answer-first content structure (highest ROI, low effort):**
- Every article's first 1–2 sentences after each H2 must directly answer the heading; AI engines extract those as the canonical answer.
- Add a **"TL;DR / Puntos Clave"** block near the top of each article with 4–5 key facts (prediction, odds summary, key matchup, injury note).
- Use question-phrased H2s in Spanish (e.g. `¿Cuáles son los momios de México vs Alemania?`).
- These are prompt-level instructions: bake them into `prompt.js` so every generated article conforms automatically.

**Structured data (JSON-LD) — inject via `staticSite.js`:**
- `Article` schema: include `author`, `datePublished`, `dateModified` — freshness is a critical signal for time-sensitive predictions.
- `FAQPage` schema: biggest win — AI systems treat Q&A pairs as high-confidence excerpts and cite them directly.
- `SportsEvent` schema: teams, `startDate`, venue on every match page.
- Validate with Google Rich Results Test before launch.

**Fact tables:**
- Include a comparison table per match (W/L record, avg goals, key player status, recent H2H) — AI systems parse and cite tables verbatim.

**Measurement:**
- Set up a GA4 custom channel group **"Artificial Intelligence"** matching referrers: `perplexity.ai`, `chatgpt.com`, `oai-searchbot`, `claude.ai`, `bing.com/chat`.
- Acknowledge that tracking is inherently partial — inline AI answers frequently don't generate click-throughs.

---

## Marketing & Social Distribution

To overcome the new-domain authority gap, drive direct traffic via social. 94% of US Hispanic fans use social media for football content. Social channels are the fastest path to early traffic before organic rankings mature.

**Platforms & viral formats:**
- **TikTok**: 15–45s vertical "quiniela picks" in TUDN-analyst tone; hot takes; score-prediction challenges (`#PronósticoMundial`). Hook in first 2 seconds.
- **Instagram**: Reels + carousel bracket breakdowns; Stories polls ("¿México pasa de grupos?"). Saveable carousel = high share rate.
- **X (Twitter)**: prediction threads (numbered picks build engagement); live match-day reaction; polls with results.
- **Facebook**: groups + community debate posts; share article links with strong hook text.

**Compliance-safe framing (CRITICAL — read before posting anything):**
- On social, frame all content as "predicción / análisis / mi pick" — NOT gambling promotion.
- **Avoid on TikTok/IG**: `bet`, `odds`, `apuesta`, `momios`, `gana dinero`.
- **NO direct betting/affiliate links on social posts** — use "link in bio" → site. All affiliate conversion happens on-site only.
- Meta requires pre-authorization for **paid** gambling ads; TikTok **bans gambling content** in ads. Organic prediction content is generally permitted; paid promotion of gambling is not. Do not run paid ads for betting content on either platform without legal clearance.

**Repurposing pipeline (automatable ~80%):**
- The structured JSON article already produced by the generation engine (`analisis_tactico_html`, `pronostico_quiniela`, `momios`, key facts) feeds per-platform templates via variable substitution.
- Per-platform outputs: TikTok script (hook + 3 picks + CTA), IG carousel slides (cover + 3 data slides + CTA), X thread (5-tweet sequence), FB post (conversational paragraph).
- Human review required for: tone/compliance check, trending-audio selection (TikTok/Reels), platform-specific hashtag optimization.
- **Implementation note**: the `/social` module is out of scope for v1 build, but the article JSON schema must remain clean and structured enough to template from. No free-form blobs.

**Posting cadence:**
- T-48h: match preview / bracket context
- T-24h: full prediction picks + key stats
- T-2h: last-minute lineup/injury update
- Halftime: live reaction + second-half pick
- Post-match: "called it" / "got burned" recap (builds authentic voice)

**Bilingual hashtags:** `#Quiniela #Mexico2026 #WorldCup2026 #ElTri #Pronósticos #MundialDeClubFIFA`

---

## Legal & Compliance (Entertainment Positioning)

Position the site as an **ENTERTAINMENT / INFORMATION** platform, not a gambling operator. This is both legal protection and the Google YMYL trust strategy.

> **IMPORTANT**: The items below are best-practice conventions, NOT legal advice. A licensed attorney in Mexico + target US states must review the full positioning, disclaimers, and affiliate relationships **before launch**. Add to Setup Checklist.

**Universal footer disclaimer (every page, ES + EN):**
> ES: "Este sitio es de entretenimiento e información únicamente. No somos operadores de juego. Las apuestas conllevan riesgos; apuesta solo lo que puedas permitirte perder. Ninguna predicción está garantizada. Debes tener 18+ años (21+ en algunos estados de EE.UU.) para participar en apuestas donde sea legal."
> EN: "This site is for entertainment and informational purposes only. We are not a gambling operator. Gambling involves risk; only bet what you can afford to lose. No prediction is guaranteed. You must be 18+ (21+ in some US states) where gambling is legal."

**Responsible-gambling resources (visible on every prediction page):**
- **US**: 1-800-MY-RESET (1-800-697-3735) — bilingual 24/7; replaced the old 1-800-GAMBLER line.
- **Mexico**: CONADIC / CIJ — `cij.org.mx`
- Link these prominently on every article, not just the footer.

**Affiliate disclosure (FTC "clear and conspicuous"):**
- Near every affiliate link: *"Recibimos una comisión si haces clic y te registras, sin costo adicional para ti."*
- This disclosure must be adjacent to the link, NOT buried in a footer or a separate disclosures page.
- **`rel="sponsored"`** on every affiliate `<a>` tag — Google requirement; omission risks a manual penalty.

**US state geo-restrictions:**
- Sports betting is legal in 30+ states only. Add "donde sea legal / where legal" to all calls to action.
- Geo-block or suppress affiliate CTAs for clearly restricted states where technically feasible.

**Mexico (SEGOB):**
- Only promote SEGOB-licensed operators (Caliente.mx, Bet365 via its licensed MX entity).
- A 2026 MX advertising-restriction bill is pending in Congress — monitor; be ready to adjust affiliate display rules.

**Banned language (never use in any content):**
- "Ganador garantizado", "100% seguro", "gana dinero fácil", "pronóstico infalible", "guaranteed winner", "sure thing", "make money fast", "ganancia garantizada".
- Use instead: "para fines de entretenimiento; los resultados pasados no garantizan resultados futuros."

**Age gate**: 18+ (US 21+) notice at minimum on prediction pages and any page displaying odds.

**Cookie consent**: GDPR/CCPA-compliant banner if EU or CA traffic is expected (add to Phase 5 Polish).

**Implementation**: all disclaimers, responsible-gambling links, affiliate disclosures, and `rel="sponsored"` attributes are **templated into every published page** by the static-site renderer and affiliate injector — never dependent on the LLM generating compliant copy.

---

## Phase Breakdown (mirrors the doc's 5 phases)

### Phase 1 — Environment & Routing Setup
- Initialize Node.js project (`npm init`, ESM, `.gitignore`, `.env.example`).
- Install deps: `better-sqlite3`, `axios`/`undici`, `dotenv`, `p-limit`, `zod` (JSON validation).
- Set up Azure AI Foundry / Azure OpenAI project; deploy **gpt-4o** for higher-quality tactical analysis and **gpt-4.1-mini** for cheaper drafting/demo work; capture endpoint + key into `.env` and GitHub Actions secrets.
- Smoke test the configured Azure OpenAI deployment with a trivial prompt before enabling scheduled generation.

### Phase 2 — Data Ingestion (API-Football → SQLite)
- Define SQLite schema: `fixtures`, `teams`, `team_stats`, `head_to_head`, `odds`, `articles`, `generation_log`.
  - `fixtures` must include **`kickoff_utc`** (the cadence scheduler keys every T-minus decision off this) plus `round`/`stage` (group vs knockout) and `status` (`scheduled` | `resolved` — knockout fixtures resolve only when prior rounds finish).
  - `articles` must include an **`article_type`** column (`pronostico_momios` | `alineacion_probable` | `quiniela_verdict` | `analisis_apostar`) so each fixture maps to multiple rows. Unique key: `(fixture_id, article_type)`. v1 writes only `pronostico_momios` rows; the column + key are built now so v2 expansion is config-only.
  - `articles` also carries **lifecycle fields** (drive the cadence): `lifecycle_state` (`seeded` → `refreshed` → `locked`), `last_refreshed_at`, and `last_pass` (`seed` | `refresh` | `lock`). Static publishing is slug-based: each rebuild regenerates the same HTML filename for a fixture/article type rather than tracking a CMS post ID.
  - **`generation_log`** (cost instrumentation, one row per model call) — the source of truth for cost-per-article:
    - `id`, `fixture_id`, `article_type`, `attempt` (retry counter)
    - `model_used` (e.g. `gpt-4o` | `gpt-4.1-mini` — captured from the Azure OpenAI response/config so cost reports can separate production-quality vs. low-cost calls)
    - `prompt_tokens`, `completion_tokens`, `total_tokens` (from the API usage block)
    - `cost_usd` (computed = tokens × per-model rate from a `config/pricing.js` table)
    - `latency_ms`, `status` (success/failed), `created_at`
    - A successful article = sum of its attempts' `cost_usd`. **Cost-per-article = `cost_usd` aggregated by `(fixture_id, article_type)`**, including failed/retried attempts so the real economic cost (waste included) is visible.
- **Endpoint mapping (from biz plan §6):** API-Football direct/API-Sports (`https://v3.football.api-sports.io`) is the primary data provider. `/fixtures` → `fixtures`; `/teams/statistics` → `team_stats` (squad + recent form). `head_to_head` and `odds` come from API-Football's `/fixtures/headtohead` and `/odds` endpoints (justified by biz plan §4 "historical matchups, live odds"). Auth uses `x-apisports-key` for direct API-Sports access.
- Implement `rateLimiter.js` (start at 1 req/sec, then tune from API-Sports quota headers and the purchased tier).
- `ingest/fixtures.js`: pull WC26 fixtures (league id once known).
- `ingest/teams.js` + `team_stats.js`: pull squad + recent form per participating team.
- `ingest/odds.js`: pull pre-match odds where available.
- `scripts/run-ingest.js`: orchestrates all ingest jobs idempotently (upserts).

### Phase 3 — Generation Engine (Azure OpenAI → JSON articles)
- `prompt.js`: encode the doc's exact Spanish system prompt with `{teamA, teamB, h2h, form, injuries}` placeholders, plus a per-`article_type` task variant (the 4 keyword templates differ in instructions: tactical/momios vs. probable XI vs. quiniela verdict vs. betting props).
  - **Brand voice (biz plan §2.3 — make-or-break):** the prompt MUST force seasoned TUDN/TV Azteca analyst voice using regional vernacular (`el Tri`, `la afición`, `el quinto partido`, `el área chica`, `contención`, `cancha`, `portero`). Robotic textbook Spanish = product failure. Bake this into the system role, not just a hint.
- `router.js`: HTTPS call to the configured Azure OpenAI deployment; retries + exponential backoff.
- Validate response with `zod` against the schema: `h1_title`, `meta_description`, `pronostico_quiniela`, `analisis_tactico_html`, `url_slug`.
- `batch.js`: iterate the **fixture × active-`article_type` set** (v1 = `[pronostico_momios]` only → 1 article/fixture; v2 expands the set); persist article rows keyed `(fixture_id, article_type)`; track `status` (pending/generated/failed). The active set comes from `config` (e.g. `ACTIVE_ARTICLE_TYPES`), so expansion is a config change, not a code change.
- **Cost capture (every model call):** `router.js` returns the raw usage block + model/deployment identifier; `batch.js` writes one `generation_log` row per call (success *and* failure), computing `cost_usd` from `config/pricing.js`. This is non-optional plumbing — without it there is no cost-per-article measurement.
- `scripts/run-cadence.js`: concurrency-limited generation inside the cadence runner; after each run, `npm run cost-report` prints spend, cost-per-article, and model split from `generation_log`.

### Phase 4 — Static Site Publishing & Affiliate Monetization
- `affiliateInjector.js`:
  - First occurrence of `momios`/`apostar`/`apuesta`/`Caliente` → wrap in `<a href="{CALIENTE_AFFILIATE}">`.
  - First occurrence of `pronóstico`/`juega` → Bet365 partner link.
  - First occurrence of `la verde`/`jersey`/`Nike` → Skimlinks link.
  - Unit-tested regex (case/accent-insensitive, only first match per trigger group).
- `staticSite.js`: **full static-site builder** — reads all generated article rows with `content_json`, injects compliance copy and affiliate links, writes deterministic article slugs plus `dist/index.html`, and keeps Seed→Refresh→Lock updates on the same URL by overwriting the same HTML filename.
- `scripts/run-cadence.js`: after generation, rebuilds the full `dist/` tree, deploys via GitHub Actions to Azure Static Web Apps, and advances `lifecycle_state`/`last_pass`/`last_refreshed_at`.

### Phase 5 — Execution, Deployment & Indexing
- `sitemap.js`: regenerate XML sitemap from generated static article slugs.
- Submit to Google Search Console (manual or via Search Console API stretch goal).
- `npm run cadence` runs the scheduled pipeline (pull DB → select pass → generate/update articles → rebuild static site → upload DB). `workflow_dispatch` supports `demo_mode=true` for mock-data deploys without API credentials.
- Azure log review checklist to confirm usage and cost split between gpt-4o and gpt-4.1-mini.
- **`scripts/cost-report.js`** (the cost-per-article truth source) — queries `generation_log` and prints:
  - **Cost-per-article**: `SUM(cost_usd) / COUNT(DISTINCT (fixture_id, article_type))` for successful articles, plus a "fully-loaded" variant that includes failed/retried attempts so waste is visible.
  - **Model split**: % of calls (and % of spend) using gpt-4o vs gpt-4.1-mini — validates that demo/dev/light work is staying on the cheaper model.
  - **Totals & projections**: total spend to date, and projected spend to scale v2 to all 4 article types (cost-per-article × fixtures × 4).
  - Add `npm run cost-report` for one-command access; reconcile against the Azure portal billing view periodically to confirm `pricing.js` rates are accurate.
- **Stage gate (v1 → v2 expansion decision):** after v1 (`pronostico_momios`) runs at real scale, review `cost-report` output. Expand `ACTIVE_ARTICLE_TYPES` to the remaining three only if measured cost-per-article × projected v2 volume stays within budget. This is the explicit checkpoint the staged rollout exists to serve.

## Setup Checklist (you'll need to acquire these)
- [ ] **Azure subscription** + AI Foundry project at `ai.azure.com`
- [ ] Deployed Azure OpenAI models: **gpt-4o** + **gpt-4.1-mini** (use gpt-4.1-mini for development/demo runs where possible)
- [ ] Azure endpoint URL + API key → `.env`
- [ ] **API-Football direct/API-Sports** account + paid tier that explicitly covers WC2026 current-season data, odds, injuries, and lineups → `API_FOOTBALL_KEY` / GitHub secret
- [ ] **Azure Static Web App** (`swa-wc26-quiniela`) + deployment token → `SWA_DEPLOYMENT_TOKEN`
- [ ] **Azure Blob Storage** account + container for the SQLite DB; capture the **connection string** (or SAS token) for the GitHub Action
- [ ] **GitHub repository** with Actions enabled; add secrets: `AZURE_AI_ENDPOINT`, `AZURE_AI_KEY`, `API_FOOTBALL_KEY`, `AZURE_STORAGE_CONNECTION_STRING`, `SWA_DEPLOYMENT_TOKEN`, affiliate URLs; add repo variable `SITE_BASE_URL`
- [ ] **Caliente.mx affiliate** program approval + tracking link
- [ ] **Bet365 Partners** + **Skimlinks** signups (Phase 4)
- [ ] **Google Search Console** verified property for the publishing domain
- [ ] **Legal review** of disclaimers/entertainment-positioning by a licensed attorney (Mexico + target US states) BEFORE launch
- [ ] **Azure Blob Storage** spend cap + budget alerts (50/80/100% thresholds); confirm API-Football tier covers WC2026
- [ ] **Verify Azure OpenAI response** exposes token usage and a usable model/deployment identifier (make one real test call, inspect raw JSON)
- [ ] Static-site generation of `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `sitemap.xml`, and JSON-LD validated in `dist/`
- [ ] **Failure alerting webhook** (Discord/Telegram) wired to GitHub Actions `if: failure()` step
- [ ] **Author profiles** with bios + credentials represented as static author metadata/pages (E-E-A-T requirement; link from article bylines)

## Key Decisions / Open Questions to Revisit
- Article concurrency level vs. Azure rate limits (start at 4, tune from logs).
- Whether to store rendered HTML or re-render on publish (plan stores both: raw JSON + final injected HTML).
- Sitemap submission: manual GSC upload vs. automated API (defer to Phase 5 polish).
- **US Hispanic market is IN scope for v1** (biz plan §1, §3): the audience is "Mexican **and** U.S. Hispanic," and Skimlinks (US Hispanic apparel) is a Phase 4 monetization channel. What's deferred is only a *separate US-Spanish dialect variant* of the prompt — v1 ships one MX-Spanish voice serving both markets, with Skimlinks links active. Revisit a dialect split post-launch if analytics justify it.

## Risks

### Google Scaled-Content Abuse (existential)
Google's March 2024 "scaled content abuse" policy targets exactly this pattern (many programmatically generated pages to manipulate rankings); worst case is a **manual action that deindexes the whole domain**. Betting is YMYL (Your Money or Your Life) — held to the highest E-E-A-T standards. The old "600-word + unique JSON" mitigation is insufficient. Defensible-content mitigations to implement (these change the prompt, schema, and workflow):

- **E-E-A-T author infrastructure**: real author bios with credentials and a visible prediction track record (e.g. "47/100 correct so far"). Every article gets a byline linking to an author page. Add an `authors` table and `author_id` column to `articles`.
- **Original data per page**: inject real odds from API-Football with timestamps and 24-48h odds movement, H2H vs THIS opponent, injury/form specifics — not template variable swaps. This is the unique value Google rewards for YMYL content.
- **Human-in-the-loop signal + AI disclosure**: target ~30% original analysis per article; add a transparency line disclosing AI drafting + human review. Google explicitly recommends this for YMYL content.
- **Gradual publishing**: 5-10 articles/day max — NOT hundreds at once (bulk drops are a scaled-abuse signal). This dovetails with the T-10 seed cadence; seeds naturally spread over days.
- **Outcome tracking**: record predictions vs actual results; display accuracy honestly; post corrections. Strong trust signal for YMYL.
- **`rel="sponsored"`** on all affiliate links (Google requirement; omission risks a penalty — see Legal & Compliance section).

- API-Football WC26 data completeness/timing (fixtures may not be final until draw).
- Azure OpenAI cost overruns if expensive deployments are over-used — instrument token logging from day one.
- Affiliate link compliance (disclosure requirements in MX/US) — see Legal & Compliance section for the full treatment.
- **Multi-pass cost multiplier:** each article is now generated up to 3× (Seed/Refresh/Lock), so cost-per-article spans its full lifecycle — `cost-report.js` must aggregate all passes per `(fixture_id, article_type)`, and the v2 stage-gate projection must multiply by passes, not just article count.
- **GitHub Actions scheduling reliability:** cron triggers can be delayed or skipped under platform load, and the T-3h Lock pass is time-sensitive. Mitigate with a tolerance window (process any fixture *past* its threshold not yet at the target state) so a missed tick self-heals on the next run, plus `workflow_dispatch` for manual catch-up.
- **Blob DB single-writer dependency:** the concurrency group is the only thing preventing DB corruption from overlapping runs. A failed upload mid-run could lose a tick's writes — mitigate by uploading only on successful completion and keeping blob versioning enabled for rollback.
- **Stale-data window:** between Refresh (T-2d) and Lock (T-3h), late-breaking lineup/injury news isn't reflected. Accept for v1; the Lock pass closes most of the gap.
- **Azure OpenAI opaque metadata (High/High)**: cost tracking assumes the response reveals token usage and enough model/deployment identity to classify spend. MITIGATE: make one real call now and inspect raw JSON; if model identity is hidden, record the deployment selected by our own routing/config; set an Azure spend cap regardless.
- **SQLite-in-Blob lost writes/corruption (High/Med-High)**: download→mutate→upload has no concurrency control beyond the Actions group; overlapping runs or interrupted uploads corrupt the DB. MITIGATE: Azure Blob lease (acquire before download, fail-fast if locked); atomic upload to temp blob then copy; enable blob versioning; VACUUM if >50MB.
- **GitHub Actions free-minute exhaustion (High)**: ~64 fixtures × 3 passes × ~3min ≈ 576+ min just for generation, near the 2000 free-min/month cap. MITIGATE: paid plan or a cheap self-hosted runner (Azure Container Instance ~$0.03/hr); pre-tournament budget calc.
- **LLM hallucination in YMYL (High/Med-High)**: fabricated lineups/odds/injuries erode trust and risk penalties/liability. MITIGATE: ground every fact in the API data payload ("only reference players/odds/stats in the provided data"); add a deterministic post-generation validator that cross-checks every player/team/number against the DB and flags entities not present in the payload; manual spot-check first 5 articles.
- **API-Football WC2026 coverage/timing (Med-High/Med)**: lineups appear 24-48h out (not T-10), odds 48-72h out; major tournaments sometimes gated behind higher tiers. MITIGATE: verify tier covers WC2026 BEFORE June 11; graceful degradation (T-10 seed uses H2H+form, T-2 refresh enriches with lineups/odds); assert min-data thresholds before generating; 2s rate-limit spacing.
- **gpt-4o cost during development (Med-High/High)**: uncontrolled prompt iteration on the higher-quality deployment burns budget pre-revenue. MITIGATE: $100/month hard cap; use gpt-4.1-mini for ALL dev/testing, gpt-4o only for production-quality runs; cache by input-data hash to skip unchanged fixtures.
- **Single-maintainer silent failures (High/Med)**: a 30-day daily tournament; a silently-failed cron loses a time-sensitive window permanently. MITIGATE: `if: failure()` alerting to Discord/Telegram webhook; alert on zero-articles-published days; self-healing tolerance windows; a 1-page manual runbook; 3-day pre-kickoff dry run on historical fixtures.
- **Azure Static Web Apps deploy/build failures (Med)**: failed `npm ci`, stale lockfiles, or SWA action config can block deployment. MITIGATE: keep `package-lock.json` synchronized, run `npm ci` in CI, set `action: upload`, keep `skip_app_build: true` for prebuilt `dist/`, and use `workflow_dispatch demo_mode=true` as a fast smoke test.
- **Spanish vernacular drift (Med)**: LLMs default to neutral/Spain Spanish; losing "momios" (MX) for "cuotas" (ES) costs keyword relevance. MITIGATE: locale-locked system prompt ("Mexican Spanish, use 'momios', informal tú"); inject a 20-term MX betting glossary; spot-check first 5.
- **GitHub Actions cron drift (Med)**: cron can be 5-30min late; the T-3h lock pass is time-sensitive. MITIGATE: schedule the lock check at T-4h verifying kickoff is within 3-5h; everything in UTC; `workflow_dispatch` manual backup.
- **Secrets/supply-chain (Med/Low-but-severe)**: 4+ secrets in Actions; a malicious npm postinstall could exfiltrate them. MITIGATE: pin exact dependency versions, `npm ci` not `npm install`; minimal deps; GitHub Environments to scope secrets; `::add-mask::` secret values in logs.
- **DB schema migration in a file store (Low-Med)**: no migration tooling; a failed ALTER mid-run corrupts production data. MITIGATE: `schema_version` table + sequential migrations; backup blob before any migration; keep schema simple, prefer JSON columns for flexible data.
- **Google indexing latency for new domain (Med)**: T-3h articles may index after the match (dead keyword). MITIGATE: submit via IndexNow + Search Console URL Inspection API on every publish; internal linking between fixture articles; T-10 seeds have the best shot at matchday indexing — set expectations accordingly.

## Todos
Tracked in the SQL todos table (see session DB).
