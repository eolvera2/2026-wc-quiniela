import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb, upsertTeam, upsertFixture, insertGenerationLog } from '../db/db.js';
import { generateCostReport } from './costReport.js';

describe('costReport', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
    // Seed two teams and two fixtures
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertTeam(db, { apiFootballId: 3, name: 'Brazil', code: 'BRA', logoUrl: null });
    upsertFixture(db, { apiFootballId: 100, homeTeamApiId: 1, awayTeamApiId: 2, kickoffUtc: '2026-06-11T18:00:00Z', round: 'Group A - 1', stage: 'group', status: 'scheduled', venue: null });
    upsertFixture(db, { apiFootballId: 101, homeTeamApiId: 1, awayTeamApiId: 3, kickoffUtc: '2026-06-15T18:00:00Z', round: 'Group A - 2', stage: 'group', status: 'scheduled', venue: null });
  });

  afterEach(() => {
    closeDb(db);
  });

  it('returns empty report when no logs exist', () => {
    const report = generateCostReport(db);
    expect(report.totalSpend).toBe(0);
    expect(report.articlesGenerated).toBe(0);
    expect(report.costPerArticle).toBe(0);
    expect(report.costPerArticleFullyLoaded).toBe(0);
    expect(report.modelSplit).toEqual({});
  });

  it('computes cost-per-article across successful generations', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    const f2 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 101").get();

    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });
    insertGenerationLog(db, { fixtureId: f2.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.001, latencyMs: 1500, status: 'success' });

    const report = generateCostReport(db);
    expect(report.articlesGenerated).toBe(2);
    expect(report.totalSpend).toBeCloseTo(0.051, 4);
    expect(report.costPerArticle).toBeCloseTo(0.0255, 4);
  });

  it('includes failed attempts in fully-loaded cost', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();

    // Failed attempt
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 100, totalTokens: 1100, costUsd: 0.02, latencyMs: 5000, status: 'failed', errorMessage: 'timeout' });
    // Successful retry
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 2, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });

    const report = generateCostReport(db);
    expect(report.articlesGenerated).toBe(1);
    // Clean cost = only successful attempts for articles that succeeded
    expect(report.costPerArticle).toBeCloseTo(0.05, 4);
    // Fully loaded = ALL attempts (including failed) / successful articles
    expect(report.costPerArticleFullyLoaded).toBeCloseTo(0.07, 4);
  });

  it('computes model split by calls and spend', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    const f2 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 101").get();

    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });
    insertGenerationLog(db, { fixtureId: f2.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.001, latencyMs: 1500, status: 'success' });

    const report = generateCostReport(db);
    expect(report.modelSplit['claude-opus'].callPercent).toBeCloseTo(50, 0);
    expect(report.modelSplit['gpt-4o-mini'].callPercent).toBeCloseTo(50, 0);
    // Spend split heavily favors opus
    expect(report.modelSplit['claude-opus'].spendPercent).toBeGreaterThan(90);
  });

  it('projects v2 cost for 4 article types', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });

    const report = generateCostReport(db, { totalFixtures: 64, articleTypesCount: 4, passesPerArticle: 3 });
    // Projection: costPerArticleFullyLoaded × 64 fixtures × 4 types × 3 passes
    expect(report.projection.v2TotalEstimate).toBeCloseTo(0.05 * 64 * 4 * 3, 2);
  });

  it('defaults projection fixture count to the 104-match WC2026 format', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });

    const report = generateCostReport(db);
    expect(report.projection.totalFixtures).toBe(104);
    expect(report.projection.v2TotalEstimate).toBeCloseTo(0.05 * 104 * 4 * 3, 2);
  });
});
