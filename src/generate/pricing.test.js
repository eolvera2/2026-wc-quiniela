import { describe, it, expect } from 'vitest';
import { costOf, PRICING } from './pricing.js';

describe('pricing', () => {
  it('exports a pricing table with known models', () => {
    expect(PRICING['claude-opus']).toBeDefined();
    expect(PRICING['gpt-4o-mini']).toBeDefined();
  });

  it('calculates cost for claude-opus', () => {
    // Opus: $15/1M input, $75/1M output (Azure AI Foundry pricing)
    const cost = costOf('claude-opus', 1000, 500);
    expect(cost).toBeCloseTo(0.015 + 0.0375, 6); // 0.0525
  });

  it('calculates cost for gpt-4o-mini', () => {
    // 4o-mini: $0.15/1M input, $0.60/1M output
    const cost = costOf('gpt-4o-mini', 1000, 500);
    expect(cost).toBeCloseTo(0.00015 + 0.0003, 6); // 0.00045
  });

  it('returns 0 for zero tokens', () => {
    expect(costOf('claude-opus', 0, 0)).toBe(0);
  });

  it('throws for unknown model', () => {
    expect(() => costOf('unknown-model', 100, 100)).toThrow('Unknown model: unknown-model');
  });
});
