# WC26 Quiniela

## Overview

An LLM-orchestrated content pipeline that generates Spanish-language World Cup 2026 match prediction articles (pronostico + momios/odds) and publishes them as a static site. Runs on a 15-minute GitHub Actions cron so T-5h refreshes, T-1h match locks, and T+2h public final-score updates are picked up promptly despite Actions scheduling drift. Content is generated via Azure OpenAI, data is ingested from FootballData.io, persisted in a SQLite database stored in Azure Blob Storage (with lease-based locking), and published to Azure Static Web Apps.

## Architecture

The pipeline executes in the following sequence:

```
GitHub Actions cron
  -> pull wc26.sqlite from Azure Blob (lease lock)
  -> select T-minus lifecycle pass per fixture (Seed / Refresh / Lock)
  -> ingest fixtures, teams, and odds from FootballData.io
  -> generate articles via Azure OpenAI
  -> rebuild entire static site (dist/)
  -> deploy dist/ to Azure Static Web Apps
  -> upload mutated SQLite back to Azure Blob (release lease)
```

Each fixture passes through three lifecycle stages:

| Pass    | Trigger     | Purpose                                      |
|---------|-------------|----------------------------------------------|
| Seed          | T-10 days   | Initial article creation with static/cached data |
| Refresh       | T-1 day     | Updated odds and team context from FootballData.io |
| Final refresh | T-5 hours   | Close-to-kickoff FootballData.io refresh |
| Lock          | T-1 hour    | Final pregame lock for lineups/final editorial pass |
| Final score   | T+2 hours   | Public-source final score update after full time |

Only the `pronostico_momios` article type is active in v1.

FootballData.io quota guardrails:
- T-10 seed uses static/cached content only and makes **0 FootballData calls**.
- Fixture-list pages are cached for 24 hours and used only for provider ID mapping during data-backed passes.
- T-1 refresh and T-5 final refresh are the only passes that fetch odds; team stats use a 72-hour cache.
- T-1 lock reuses existing FootballData content and makes **0 odds/team-stat calls**.
- Public final scores never use FootballData.
- If Actions or generation misses T-1, a started match can self-heal the lock pass for up to two hours after kickoff without additional FootballData calls.
- Cadence logs a warning for any fixture past T+2h that still lacks a public final-score entry, so missing manual/public score updates are visible instead of silent.

Expected first-30-day usage stays below 1000 calls: about 208 match-odds calls for 104 fixtures (T-1 + T-5), about 480 worst-case team-stat calls with a 72-hour cache across 48 teams, and about 90 fixture-list page calls at three pages per day for 30 days, leaving roughly 200+ calls of buffer.

## Project Structure

```
.
├── scripts/
│   ├── run-cadence.js          # GitHub Actions entry point
│   ├── seed-demo.js            # Local demo builder (writes dist/ from synthetic fixtures)
│   ├── cost-report.js          # Token cost reporting utility
│   └── validate-workflow.js    # Workflow validation utility
├── src/
│   ├── cadence/
│   │   └── selectPass.js       # T-10 / T-1d / T-5h / T-1h lifecycle state machine
│   ├── config/
│   │   └── index.js            # Environment variable loader
│   ├── db/
│   │   ├── schema.sql          # SQLite schema
│   │   └── db.js               # SQLite wrapper
│   ├── generate/
│   │   ├── batch.js            # Batch generation orchestration
│   │   ├── costReport.js       # Per-run cost tracking
│   │   ├── pricing.js          # Token pricing table
│   │   ├── prompt.js           # Mexican-voice Spanish prompts
│   │   └── router.js           # Azure OpenAI client
│   ├── ingest/
│   │   ├── fixtures.js         # FootballData.io fixture ingestion
│   │   ├── teams.js            # Team data ingestion
│   │   ├── odds.js             # Odds ingestion
│   │   ├── dataThreshold.js    # Data completeness checks
│   │   └── rateLimiter.js      # 1 req/sec rate limiter
│   └── publish/
│       ├── staticSite.js       # Static HTML site generator
│       ├── affiliateInjector.js# Affiliate link injection
│       └── sitemap.js          # sitemap.xml generator
├── src/storage/
│   └── blob.js                 # Azure Blob lease acquisition and atomic upload
├── .github/workflows/
│   └── cadence.yml             # Main pipeline (cron, secrets, SWA deploy)
├── docs/
│   ├── plan.md                 # Project plan
│   └── phase*.md               # Phase implementation plans
├── staticwebapp.config.json    # Azure SWA routing rules
└── package.json
```

## Local Development / Demo

Build and preview the static site locally without any cloud credentials:

```bash
npm install
node scripts/build-coming-soon.js # builds the public Predictagol landing page
node scripts/seed-demo.js        # builds dist/ from 3 synthetic demo articles
npx swa start dist               # preview locally with Azure SWA CLI (optional)
```

The Coming Soon script writes a single branded `dist/index.html` for `predictagol.com`. The seed script writes `dist/index.html`, three article pages, and `sitemap.xml`.

## Testing

```bash
npm test                         # run the vitest suite
```

## Configuration / Environment

The following environment variables are consumed by `scripts/run-cadence.js` and `.github/workflows/cadence.yml`:

| Variable                          | Description                                              |
|-----------------------------------|----------------------------------------------------------|
| `AZURE_AI_ENDPOINT`               | Azure OpenAI endpoint URL                                |
| `AZURE_AI_KEY`                    | Azure OpenAI API key                                     |
| `FOOTBALLDATA_KEY`                | FootballData.io API key                                  |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string (SQLite persistence)|
| `SITE_BASE_URL`                   | Canonical base URL for the static site                   |
| `SWA_DEPLOYMENT_TOKEN`            | Azure Static Web Apps deploy token                       |
| `ACTIVE_ARTICLE_TYPES`            | Article types to generate (default: `pronostico_momios`) |
| `CALIENTE_AFFILIATE_URL`          | Affiliate link for Caliente                              |
| `BET365_AFFILIATE_URL`            | Affiliate link for Bet365                                |
| `SKIMLINKS_AFFILIATE_URL`         | Skimlinks affiliate URL                                  |

Copy `.env.example` to `.env` for local development.

## Deployment

The GitHub Actions workflow (`.github/workflows/cadence.yml`) runs hourly. Scheduled runs execute the live cadence pipeline, refresh due fixtures from FootballData.io, rebuild `dist/`, and deploy the full site to Azure Static Web Apps. Manual `coming_soon` remains available for the launch page, and manual `demo` builds a static demo without FootballData.io or Azure OpenAI calls but does not deploy to production.

Azure infrastructure (East US 2, resource group `rg-wc26-quiniela`):

- Azure OpenAI: `oai-wc26-quiniela`
- Storage account: `stwc26quiniela`
- Static Web App: `swa-wc26-quiniela`

## Disclaimer

All generated content includes a bilingual (Spanish/English) responsible-gambling disclaimer and affiliate disclosure on every article page. This site is for entertainment and informational purposes only. It is not a gambling operator and does not accept wagers.
