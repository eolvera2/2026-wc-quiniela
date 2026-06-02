import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { callRouter } from './router.js';

const ENDPOINT = 'https://test-project.openai.azure.com';
const API_KEY = 'test-key-123';

// Sample Azure AI Foundry response matching the router response shape
const SAMPLE_RESPONSE = {
  id: 'chatcmpl-abc123',
  model: 'claude-opus',
  choices: [
    {
      message: {
        content: JSON.stringify({
          h1_title: 'Pronósticos y momios México vs Alemania',
          meta_description: 'Análisis táctico y momios para México vs Alemania en el Mundial 2026.',
          puntos_clave: ['México llega con 4 victorias', 'Momios: Local 2.10', 'Alemania sin Müller', 'Over 2.5 favorito'],
          analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Los momios favorecen a México...</p>',
          pronostico_quiniela: 'México 2-1',
          url_slug: 'pronosticos-momios-mexico-vs-alemania',
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 1200,
    completion_tokens: 850,
    total_tokens: 2050,
  },
};

describe('router', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('sends a POST to the Azure endpoint and returns parsed article + usage + model', async () => {
    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, SAMPLE_RESPONSE);

    const result = await callRouter({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      systemPrompt: 'You are an analyst.',
      userPrompt: 'Generate article for Mexico vs Germany.',
    });

    expect(result.article.h1_title).toBe('Pronósticos y momios México vs Alemania');
    expect(result.article.url_slug).toBe('pronosticos-momios-mexico-vs-alemania');
    expect(result.article.pronostico_quiniela).toBe('México 2-1');
    expect(result.article.analisis_tactico_html).toContain('momios favorecen');
    expect(result.usage.prompt_tokens).toBe(1200);
    expect(result.usage.completion_tokens).toBe(850);
    expect(result.usage.total_tokens).toBe(2050);
    expect(result.model).toBe('claude-opus');
  });

  it('extracts model name from the response (CRITICAL for cost tracking)', async () => {
    const responseWithMini = {
      ...SAMPLE_RESPONSE,
      model: 'gpt-4o-mini',
    };

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, responseWithMini);

    const result = await callRouter({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      systemPrompt: 'test',
      userPrompt: 'test',
    });

    expect(result.model).toBe('gpt-4o-mini');
  });

  it('extracts token usage correctly from response (CRITICAL for cost capture)', async () => {
    const customUsage = {
      ...SAMPLE_RESPONSE,
      usage: { prompt_tokens: 999, completion_tokens: 444, total_tokens: 1443 },
    };

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, customUsage);

    const result = await callRouter({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      systemPrompt: 'test',
      userPrompt: 'test',
    });

    expect(result.usage.prompt_tokens).toBe(999);
    expect(result.usage.completion_tokens).toBe(444);
    expect(result.usage.total_tokens).toBe(1443);
  });

  it('retries on 429 with exponential backoff', async () => {
    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(429, { error: { message: 'Rate limited' } });

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, SAMPLE_RESPONSE);

    const result = await callRouter({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      systemPrompt: 'test',
      userPrompt: 'test',
      maxRetries: 3,
      initialDelayMs: 10, // fast for tests
    });

    expect(result.article.h1_title).toBe('Pronósticos y momios México vs Alemania');
  });

  it('retries on 500 server errors', async () => {
    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(500, { error: { message: 'Internal error' } });

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, SAMPLE_RESPONSE);

    const result = await callRouter({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      systemPrompt: 'test',
      userPrompt: 'test',
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result.article.pronostico_quiniela).toBe('México 2-1');
  });

  it('throws after exhausting retries', async () => {
    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .times(4)
      .reply(429, { error: { message: 'Rate limited' } });

    await expect(
      callRouter({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        systemPrompt: 'test',
        userPrompt: 'test',
        maxRetries: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow(/failed after 4 attempts/i);
  });

  it('throws on invalid JSON in the LLM response content', async () => {
    const badResponse = {
      ...SAMPLE_RESPONSE,
      choices: [{ message: { content: 'not valid json at all' }, finish_reason: 'stop' }],
    };

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, badResponse);

    await expect(
      callRouter({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        systemPrompt: 'test',
        userPrompt: 'test',
        maxRetries: 0,
      })
    ).rejects.toThrow(/parse|json|validation/i);
  });

  it('throws on response missing required schema fields', async () => {
    const incompleteArticle = {
      ...SAMPLE_RESPONSE,
      choices: [{
        message: {
          content: JSON.stringify({
            h1_title: 'Title only',
            // missing meta_description, analisis_tactico_html, pronostico_quiniela, url_slug
          }),
        },
        finish_reason: 'stop',
      }],
    };

    nock(ENDPOINT)
      .post('/openai/deployments/model-router/chat/completions')
      .query(true)
      .reply(200, incompleteArticle);

    await expect(
      callRouter({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        systemPrompt: 'test',
        userPrompt: 'test',
        maxRetries: 0,
      })
    ).rejects.toThrow(/validation/i);
  });
});
