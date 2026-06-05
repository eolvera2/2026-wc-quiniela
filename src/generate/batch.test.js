import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, closeDb, upsertTeam, upsertFixture } from '../db/db.js';
import { runBatch } from './batch.js';

// Mock router at the module level
vi.mock('./router.js', () => ({
  callRouter: vi.fn(),
}));

import { callRouter } from './router.js';

const MOCK_ROUTER_RESULT = {
  article: {
    h1_title: 'Pronósticos y momios México vs Alemania',
    meta_description: 'Análisis táctico México vs Alemania Mundial 2026.',
    puntos_clave: ['Pick 1', 'Pick 2', 'Pick 3', 'Pick 4'],
    analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Content here...</p>',
    pronostico_quiniela: 'México 2-1',
    url_slug: 'pronosticos-momios-mexico-vs-alemania',
  },
  usage: { prompt_tokens: 1000, completion_tokens: 600, total_tokens: 1600 },
  model: 'claude-opus',
};

describe('batch', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertFixture(db, {
      apiFootballId: 100,
      homeTeamApiId: 1,
      awayTeamApiId: 2,
      kickoffUtc: '2026-06-11T18:00:00Z',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: 'Estadio Azteca',
    });
    callRouter.mockReset();
  });

  afterEach(() => {
    closeDb(db);
  });

  it('calls router for each fixture × article_type and writes article + generation_log', async () => {
    callRouter.mockResolvedValue(MOCK_ROUTER_RESULT);

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
    };

    const results = await runBatch(db, [100], config);

    expect(callRouter).toHaveBeenCalledTimes(1);
    expect(results.succeeded).toBe(1);
    expect(results.failed).toBe(0);

    // Check article row was written
    const articles = db.prepare('SELECT * FROM articles WHERE fixture_id = 1').all();
    expect(articles).toHaveLength(1);
    expect(articles[0].article_type).toBe('pronostico_momios');
    expect(articles[0].status).toBe('generated');
    expect(JSON.parse(articles[0].content_json).h1_title).toBe('Pronósticos y momios México vs Alemania');

    // Check generation_log row
    const logs = db.prepare('SELECT * FROM generation_log WHERE fixture_id = 1').all();
    expect(logs).toHaveLength(1);
    expect(logs[0].model_used).toBe('claude-opus');
    expect(logs[0].prompt_tokens).toBe(1000);
    expect(logs[0].completion_tokens).toBe(600);
    expect(logs[0].cost_usd).toBeGreaterThan(0);
    expect(logs[0].status).toBe('success');
  });

  it('writes generation_log row on failure too', async () => {
    callRouter.mockRejectedValue(new Error('Router timeout'));

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
    };

    const results = await runBatch(db, [100], config);

    expect(results.succeeded).toBe(0);
    expect(results.failed).toBe(1);

    // Article status should be 'failed'
    const articles = db.prepare('SELECT * FROM articles WHERE fixture_id = 1').all();
    expect(articles).toHaveLength(1);
    expect(articles[0].status).toBe('failed');

    // generation_log row with status=failed
    const logs = db.prepare('SELECT * FROM generation_log WHERE fixture_id = 1').all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('failed');
    expect(logs[0].error_message).toContain('Router timeout');
  });

  it('stores placeholders for sections with missing required data', async () => {
    callRouter.mockResolvedValue(MOCK_ROUTER_RESULT);

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios', 'alineacion_probable'],
    };

    const results = await runBatch(db, [100], config);

    expect(callRouter).toHaveBeenCalledTimes(1);
    expect(results.succeeded).toBe(2);

    const articles = db.prepare('SELECT * FROM articles WHERE fixture_id = 1').all();
    expect(articles).toHaveLength(2);
    const byType = Object.fromEntries(articles.map((a) => [a.article_type, a]));
    expect(byType.pronostico_momios.status).toBe('generated');
    expect(byType.alineacion_probable.status).toBe('placeholder');
    expect(JSON.parse(byType.alineacion_probable.content_json).pronostico_quiniela).toBe('Próximamente');
  });

  it('skips fixtures not found in DB', async () => {
    callRouter.mockResolvedValue(MOCK_ROUTER_RESULT);

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
    };

    // Pass a non-existent fixture API ID
    const results = await runBatch(db, [999], config);

    expect(callRouter).not.toHaveBeenCalled();
    expect(results.succeeded).toBe(0);
    expect(results.skipped).toBe(1);
  });

  it('computes cost_usd from pricing module', async () => {
    callRouter.mockResolvedValue(MOCK_ROUTER_RESULT);

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
    };

    await runBatch(db, [100], config);

    const log = db.prepare('SELECT cost_usd FROM generation_log WHERE fixture_id = 1').get();
    // claude-opus: 1000 * 15/1M + 600 * 75/1M = 0.015 + 0.045 = 0.06
    expect(log.cost_usd).toBeCloseTo(0.06, 4);
  });
});
