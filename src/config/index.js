import 'dotenv/config';

/**
 * Loads environment variables with defaults for optional values.
 * Required secrets throw on access if missing (fail-fast).
 * Reference: docs/plan.md "Phase 1 — Environment & Routing Setup"
 */
export function loadConfig() {
  return {
    azureAiEndpoint: env('AZURE_AI_ENDPOINT'),
    azureAiKey: env('AZURE_AI_KEY'),
    azureAiDeploymentRobust: env('AZURE_AI_DEPLOYMENT_ROBUST'),
    azureAiDeploymentCheap: env('AZURE_AI_DEPLOYMENT_CHEAP'),
    apiFootballKey: env('API_FOOTBALL_KEY'),
    azureStorageConnectionString: env('AZURE_STORAGE_CONNECTION_STRING'),
    swaDeploymentToken: env('SWA_DEPLOYMENT_TOKEN'),
    siteBaseUrl: env('SITE_BASE_URL'),
    calienteAffiliateUrl: env('CALIENTE_AFFILIATE_URL'),
    bet365AffiliateUrl: env('BET365_AFFILIATE_URL'),
    skimlinksAffiliateUrl: env('SKIMLINKS_AFFILIATE_URL'),
    activeArticleTypes: (process.env.ACTIVE_ARTICLE_TYPES || 'pronostico_momios').split(','),
    dbPath: process.env.DB_PATH || 'data/wc26.sqlite',
  };
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
