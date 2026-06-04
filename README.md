# WC26 Quiniela

## Overview

An LLM-orchestrated content pipeline that generates Spanish-language World Cup 2026 match prediction articles (pronostico + momios/odds) and publishes them as a static site. Runs on a twice-daily GitHub Actions cron. Content is generated via Azure OpenAI, data is ingested from FootballData.io, persisted in a SQLite database stored in Azure Blob Storage (with lease-based locking), and published to Azure Static Web Apps.

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
| Seed    | T-10 days   | Initial article creation with early odds      |
| Refresh | T-2 days    | Updated odds and team news                   |
| Lock    | T-3 hours   | Final prediction with locked lineups          |

Only the `pronostico_momios` article type is active in v1.

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
│   │   └── selectPass.js       # T-10 / T-2 / T-3h lifecycle state machine
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
node scripts/seed-demo.js        # builds dist/ from 3 synthetic demo articles
npx swa start dist               # preview locally with Azure SWA CLI (optional)
```

The seed script writes `dist/index.html`, three article pages, and `sitemap.xml`.

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

The GitHub Actions workflow (`.github/workflows/cadence.yml`) runs twice daily at 06:00 and 18:00 UTC. It executes the full cadence pipeline and deploys `dist/` to Azure Static Web Apps via the `Azure/static-web-apps-deploy` action.

Azure infrastructure (East US 2, resource group `rg-wc26-quiniela`):

- Azure OpenAI: `oai-wc26-quiniela`
- Storage account: `stwc26quiniela`
- Static Web App: `swa-wc26-quiniela`

## Disclaimer

All generated content includes a bilingual (Spanish/English) responsible-gambling disclaimer and affiliate disclosure on every article page. This site is for entertainment and informational purposes only. It is not a gambling operator and does not accept wagers.
