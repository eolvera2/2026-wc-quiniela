/**
 * Per-model token → USD rate table.
 * Rates are per-token (divide $/1M by 1_000_000).
 * Update these when Azure pricing changes; reconcile against portal billing.
 * Reference: docs/plan.md "config/pricing.js" + Phase 5 cost-report reconciliation.
 */
export const PRICING = {
  'claude-opus': {
    inputPerToken: 15 / 1_000_000,   // $15 per 1M input tokens
    outputPerToken: 75 / 1_000_000,  // $75 per 1M output tokens
  },
  'gpt-4o-mini': {
    inputPerToken: 0.15 / 1_000_000,  // $0.15 per 1M input tokens
    outputPerToken: 0.60 / 1_000_000, // $0.60 per 1M output tokens
  },
  'gpt-4o': {
    inputPerToken: 2.50 / 1_000_000,  // $2.50 per 1M input tokens
    outputPerToken: 10 / 1_000_000,   // $10 per 1M output tokens
  },
  'gpt-4.1-mini': {
    inputPerToken: 0.40 / 1_000_000,  // $0.40 per 1M input tokens
    outputPerToken: 1.60 / 1_000_000, // $1.60 per 1M output tokens
  },
};

/**
 * Compute USD cost for a single model call.
 * @param {string} model - Model identifier (must match PRICING keys)
 * @param {number} promptTokens - Input/prompt token count
 * @param {number} completionTokens - Output/completion token count
 * @returns {number} Cost in USD
 */
export function costOf(model, promptTokens, completionTokens) {
  const pricingModel = normalizePricingModel(model);
  const rates = PRICING[pricingModel];
  if (!rates) {
    throw new Error(`Unknown model: ${model}. Known models: ${Object.keys(PRICING).join(', ')}`);
  }
  return (promptTokens * rates.inputPerToken) + (completionTokens * rates.outputPerToken);
}

function normalizePricingModel(model) {
  const value = String(model || '');
  if (PRICING[value]) return value;
  if (value.startsWith('gpt-4o-mini')) return 'gpt-4o-mini';
  if (value.startsWith('gpt-4o')) return 'gpt-4o';
  if (value.startsWith('gpt-4.1-mini')) return 'gpt-4.1-mini';
  return value;
}
