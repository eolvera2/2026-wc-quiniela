# Phase 2: Live-Service Integration Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

> **Phase 2 depends on Phase 1 being complete and green. All external-service tasks use mocks — no live calls. Live smoke-testing against real Azure/API-Football/WordPress requires user-provided credentials and is tracked separately in MORNING-REVIEW.md.**

**Goal:** Build and test the live-service integration layer — everything that touches external APIs (Azure AI Foundry, API-Football, WordPress, Azure Blob Storage) and the orchestration that ties them together.

**Architecture:** Each service client is a thin ESM module wrapping `fetch` (or `@azure/storage-blob`). All tests mock HTTP at the boundary — no network calls. The orchestration script (`run-cadence.js`) composes Phase 1 pure-logic modules with Phase 2 service clients into the full pipeline.

**Tech Stack:** Node.js 18+ (ESM), vitest, nock (HTTP mocking), @azure/storage-blob, zod (response validation), Phase 1 modules (db.js, pricing.js, costOf, selectPass, affiliateInjector, prompt.js, DISCLAIMER_FOOTER)

**Reference:** All design decisions trace back to `docs/plan.md` sections by name.

**Split:** Phase 2a (Tasks 1–8: service clients + batch), Phase 2b (Tasks 9–15: publishing, storage, orchestration, CI)

---

## Phase 2a: Generation & Ingestion Service Clients

---

### Task 1: Add Phase 2 Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add dependencies**

Add to `dependencies`:
```json
"@azure/storage-blob": "12.26.0",
"nock": "14.0.1"
```

Add `nock` to `devDependencies`:
```json
"nock": "14.0.1"
```

Actually, `nock` is a test-only dependency. Updated approach:

Edit `package.json` — add to `devDependencies`:
```json
"nock": "14.0.1"
```

Add to `dependencies`:
```json
"@azure/storage-blob": "12.26.0"
```

The full updated sections:

```json
{
  "dependencies": {
    "better-sqlite3": "11.7.0",
    "dotenv": "16.4.7",
    "p-limit": "6.2.0",
    "zod": "3.24.2",
    "@azure/storage-blob": "12.26.0"
  },
  "devDependencies": {
    "vitest": "3.1.1",
    "nock": "14.0.1"
  }
}
```

**Step 2: Install**

```bash
npm ci
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: add @azure/storage-blob and nock for Phase 2"
```

---

### Task 2: Rate Limiter

**Files:**
- Create: `src/ingest/rateLimiter.js`
- Create: `src/ingest/rateLimiter.test.js`

**Step 1: Write the failing test `src/ingest/rateLimiter.test.js`**

Reference: `docs/plan.md` "Phase 2 — Data Ingestion" rateLimiter.js (1 req/sec, honoring RapidAPI quotas).

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rateLimiter.js';

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes the first call immediately', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockResolvedValue('result');

    const promise = limiter.schedule(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('delays the second call by at least minIntervalMs', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const calls = [];
    const fn = vi.fn().mockImplementation(() => {
      calls.push(Date.now());
      return Promise.resolve('ok');
    });

    const p1 = limiter.schedule(fn);
    const p2 = limiter.schedule(fn);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await Promise.all([p1, p2]);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1000);
  });

  it('processes calls in FIFO order', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 100 });
    const order = [];

    const p1 = limiter.schedule(() => { order.push(1); return Promise.resolve(); });
    const p2 = limiter.schedule(() => { order.push(2); return Promise.resolve(); });
    const p3 = limiter.schedule(() => { order.push(3); return Promise.resolve(); });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates errors from the scheduled function', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error('API error'));

    const promise = limiter.schedule(fn);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('API error');
  });

  it('continues processing after an error', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 100 });
    const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
    const fn2 = vi.fn().mockResolvedValue('success');

    const p1 = limiter.schedule(fn1);
    const p2 = limiter.schedule(fn2);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(p1).rejects.toThrow('fail');
    await expect(p2).resolves.toBe('success');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/ingest/rateLimiter.test.js
```

Expected: FAIL — `Cannot find module './rateLimiter.js'`

**Step 3: Write implementation `src/ingest/rateLimiter.js`**

```js
/**
 * Simple sequential rate limiter — 1 request per interval.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" rateLimiter.js
 *
 * Uses a FIFO queue; each call waits at least `minIntervalMs` after the
 * previous call started. This guarantees we stay within RapidAPI's rate limits.
 */

/**
 * @param {{ minIntervalMs?: number }} options
 */
export function createRateLimiter({ minIntervalMs = 1000 } = {}) {
  const queue = [];
  let processing = false;
  let lastCallTime = 0;

  async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      const now = Date.now();
      const elapsed = now - lastCallTime;
      const waitTime = Math.max(0, minIntervalMs - elapsed);

      if (waitTime > 0) {
        await new Promise((r) => setTimeout(r, waitTime));
      }

      lastCallTime = Date.now();
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    processing = false;
  }

  return {
    /**
     * Schedule a function to run respecting the rate limit.
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    schedule(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        processQueue();
      });
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ingest/rateLimiter.test.js
```

Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: rate limiter (1 req/sec FIFO queue) for API-Football"
```

---

### Task 3: Azure AI Model Router Client

**Files:**
- Create: `src/generate/router.js`
- Create: `src/generate/router.test.js`

**Step 1: Write the failing test `src/generate/router.test.js`**

Reference: `docs/plan.md` "Phase 3 — Generation Engine" router.js — HTTPS call to Azure model-router, retries + exponential backoff, zod validation, returns parsed article JSON + usage block + model name.

```js
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/generate/router.test.js
```

Expected: FAIL — `Cannot find module './router.js'`

**Step 3: Write implementation `src/generate/router.js`**

```js
import { z } from 'zod';

/**
 * Azure AI Foundry model-router HTTPS client.
 * Reference: docs/plan.md "Phase 3 — Generation Engine" router.js
 *
 * Sends a chat completion request to the Azure model-router endpoint.
 * Returns: { article, usage, model } where:
 *   - article: parsed + validated JSON from the LLM response
 *   - usage: { prompt_tokens, completion_tokens, total_tokens }
 *   - model: the actual model the router selected (e.g. 'claude-opus' or 'gpt-4o-mini')
 *
 * Retries on 429/5xx with exponential backoff.
 * Validates response against zod schema.
 */

/** Zod schema for article response validation */
const ArticleSchema = z.object({
  h1_title: z.string().min(1),
  meta_description: z.string().min(1),
  puntos_clave: z.array(z.string()).optional(),
  analisis_tactico_html: z.string().min(1),
  pronostico_quiniela: z.string().min(1),
  url_slug: z.string().min(1),
});

/**
 * @param {{
 *   endpoint: string,
 *   apiKey: string,
 *   systemPrompt: string,
 *   userPrompt: string,
 *   maxRetries?: number,
 *   initialDelayMs?: number,
 *   deploymentName?: string,
 *   apiVersion?: string,
 * }} params
 * @returns {Promise<{ article: object, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }, model: string }>}
 */
export async function callRouter({
  endpoint,
  apiKey,
  systemPrompt,
  userPrompt,
  maxRetries = 3,
  initialDelayMs = 1000,
  deploymentName = 'model-router',
  apiVersion = '2024-12-01-preview',
}) {
  const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  const body = JSON.stringify({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  let lastError;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body,
      });

      if (response.status === 429 || response.status >= 500) {
        const errBody = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${errBody}`);
        if (attempt < totalAttempts - 1) {
          const delay = initialDelayMs * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
        break;
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();

      // Extract model name (CRITICAL for cost tracking per risk T2-1)
      const model = data.model || 'unknown';

      // Extract usage (CRITICAL for cost capture)
      const usage = {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      };

      // Parse the LLM content as JSON
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response choices[0].message.content');
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        throw new Error(`JSON parse error in LLM response: ${parseErr.message}`);
      }

      // Validate against schema
      const validation = ArticleSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error(`Article validation failed: ${validation.error.message}`);
      }

      return { article: validation.data, usage, model };
    } catch (err) {
      lastError = err;
      // Only retry on network errors, not validation/parse errors
      if (err.message.includes('parse') || err.message.includes('validation') || err.message.includes('No content')) {
        throw err;
      }
      if (attempt < totalAttempts - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Router call failed after ${totalAttempts} attempts: ${lastError?.message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/generate/router.test.js
```

Expected: 8 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: Azure AI model-router client with retries, zod validation, usage extraction"
```

---

### Task 4: Generation Batch Runner

**Files:**
- Create: `src/generate/batch.js`
- Create: `src/generate/batch.test.js`

**Step 1: Write the failing test `src/generate/batch.test.js`**

Reference: `docs/plan.md` "Phase 3 — Generation Engine" batch.js — iterate fixture × ACTIVE_ARTICLE_TYPES, call router, write article rows + generation_log rows, compute cost via costOf().

```js
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

  it('processes multiple article types per fixture when configured', async () => {
    callRouter.mockResolvedValue(MOCK_ROUTER_RESULT);

    const config = {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios', 'alineacion_probable'],
    };

    const results = await runBatch(db, [100], config);

    expect(callRouter).toHaveBeenCalledTimes(2);
    expect(results.succeeded).toBe(2);

    const articles = db.prepare('SELECT * FROM articles WHERE fixture_id = 1').all();
    expect(articles).toHaveLength(2);
    const types = articles.map((a) => a.article_type).sort();
    expect(types).toEqual(['alineacion_probable', 'pronostico_momios']);
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/generate/batch.test.js
```

Expected: FAIL — `Cannot find module './batch.js'`

**Step 3: Write implementation `src/generate/batch.js`**

```js
import { callRouter } from './router.js';
import { costOf } from './pricing.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';
import { insertGenerationLog } from '../db/db.js';

/**
 * Generation batch runner.
 * Reference: docs/plan.md "Phase 3 — Generation Engine" batch.js
 *
 * Iterates fixture × active-article_type set, calls the router,
 * writes article rows + generation_log rows (success AND failure).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} fixtureApiIds - API-Football fixture IDs to process
 * @param {{ endpoint: string, apiKey: string, activeArticleTypes: string[] }} config
 * @returns {Promise<{ succeeded: number, failed: number, skipped: number }>}
 */
export async function runBatch(db, fixtureApiIds, config) {
  const { endpoint, apiKey, activeArticleTypes } = config;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const apiId of fixtureApiIds) {
    // Resolve internal fixture ID
    const fixture = db.prepare(`
      SELECT f.id, f.kickoff_utc, f.venue,
             ht.name as home_team, at.name as away_team
      FROM fixtures f
      JOIN teams ht ON f.home_team_id = ht.id
      JOIN teams at ON f.away_team_id = at.id
      WHERE f.api_football_id = ?
    `).get(apiId);

    if (!fixture) {
      skipped++;
      continue;
    }

    for (const articleType of activeArticleTypes) {
      const startTime = Date.now();

      // Prepare prompts
      const systemPrompt = buildSystemPrompt(articleType);
      const userPrompt = buildUserPrompt({
        teamA: fixture.home_team,
        teamB: fixture.away_team,
        h2h: getH2H(db, fixture.id),
        form: getForm(db, fixture.id),
        injuries: getInjuries(db, fixture.id),
        odds: getOdds(db, fixture.id),
        kickoffUtc: fixture.kickoff_utc,
      });

      try {
        const result = await callRouter({
          endpoint,
          apiKey,
          systemPrompt,
          userPrompt,
        });

        const latencyMs = Date.now() - startTime;
        const cost = costOf(result.model, result.usage.prompt_tokens, result.usage.completion_tokens);

        // Upsert article row
        db.prepare(`
          INSERT INTO articles (fixture_id, article_type, status, content_json, updated_at)
          VALUES (@fixtureId, @articleType, 'generated', @contentJson, datetime('now'))
          ON CONFLICT(fixture_id, article_type) DO UPDATE SET
            status = 'generated',
            content_json = excluded.content_json,
            updated_at = datetime('now')
        `).run({
          fixtureId: fixture.id,
          articleType,
          contentJson: JSON.stringify(result.article),
        });

        // Write generation_log (success)
        insertGenerationLog(db, {
          fixtureId: fixture.id,
          articleType,
          attempt: 1,
          modelUsed: result.model,
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
          costUsd: cost,
          latencyMs,
          status: 'success',
        });

        succeeded++;
      } catch (err) {
        const latencyMs = Date.now() - startTime;

        // Upsert article row as failed
        db.prepare(`
          INSERT INTO articles (fixture_id, article_type, status, updated_at)
          VALUES (@fixtureId, @articleType, 'failed', datetime('now'))
          ON CONFLICT(fixture_id, article_type) DO UPDATE SET
            status = 'failed',
            updated_at = datetime('now')
        `).run({ fixtureId: fixture.id, articleType });

        // Write generation_log (failure)
        insertGenerationLog(db, {
          fixtureId: fixture.id,
          articleType,
          attempt: 1,
          modelUsed: 'unknown',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          latencyMs,
          status: 'failed',
          errorMessage: err.message,
        });

        failed++;
      }
    }
  }

  return { succeeded, failed, skipped };
}

// Helper: get H2H data (returns string summary or placeholder)
function getH2H(db, fixtureId) {
  const fixture = db.prepare('SELECT home_team_id, away_team_id FROM fixtures WHERE id = ?').get(fixtureId);
  if (!fixture) return 'No data available';
  const h2h = db.prepare('SELECT data_json FROM head_to_head WHERE home_team_id = ? AND away_team_id = ?')
    .get(fixture.home_team_id, fixture.away_team_id);
  return h2h?.data_json || 'No historical data available';
}

// Helper: get form data
function getForm(db, fixtureId) {
  const fixture = db.prepare('SELECT home_team_id, away_team_id FROM fixtures WHERE id = ?').get(fixtureId);
  if (!fixture) return 'No form data';
  const homeStats = db.prepare('SELECT form FROM team_stats WHERE team_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(fixture.home_team_id);
  const awayStats = db.prepare('SELECT form FROM team_stats WHERE team_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(fixture.away_team_id);
  return `Home: ${homeStats?.form || 'N/A'} | Away: ${awayStats?.form || 'N/A'}`;
}

// Helper: get injuries (placeholder — enriched by ingest)
function getInjuries(db, fixtureId) {
  return 'No injury data available';
}

// Helper: get odds
function getOdds(db, fixtureId) {
  const fixture = db.prepare('SELECT id FROM fixtures WHERE id = ?').get(fixtureId);
  if (!fixture) return { home: 'N/A', draw: 'N/A', away: 'N/A' };
  const odds = db.prepare('SELECT home_win, draw, away_win FROM odds WHERE fixture_id = ? LIMIT 1').get(fixture.id);
  if (!odds) return { home: 'N/A', draw: 'N/A', away: 'N/A' };
  return { home: odds.home_win, draw: odds.draw, away: odds.away_win };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/generate/batch.test.js
```

Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: generation batch runner with cost capture, article upsert, failure logging"
```

---

### Task 5: API-Football Fixtures Client

**Files:**
- Create: `src/ingest/fixtures.js`
- Create: `src/ingest/fixtures.test.js`

**Step 1: Write the failing test `src/ingest/fixtures.test.js`**

Reference: `docs/plan.md` "Phase 2 — Data Ingestion" fixtures.js + risk T2-4 (graceful degradation).

```js
import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchFixtures } from './fixtures.js';

const RAPIDAPI_HOST = 'https://api-football-v1.p.rapidapi.com';
const API_KEY = 'test-rapid-key';

const SAMPLE_FIXTURES_RESPONSE = {
  response: [
    {
      fixture: {
        id: 1001,
        date: '2026-06-11T18:00:00+00:00',
        venue: { name: 'Estadio Azteca', city: 'Mexico City' },
        status: { short: 'NS' },
      },
      league: { round: 'Group A - 1' },
      teams: {
        home: { id: 10, name: 'Mexico', logo: 'https://logo.png' },
        away: { id: 20, name: 'Germany', logo: 'https://logo2.png' },
      },
    },
    {
      fixture: {
        id: 1002,
        date: '2026-06-12T15:00:00+00:00',
        venue: { name: 'SoFi Stadium', city: 'Los Angeles' },
        status: { short: 'NS' },
      },
      league: { round: 'Group B - 1' },
      teams: {
        home: { id: 30, name: 'Brazil', logo: 'https://logo3.png' },
        away: { id: 40, name: 'Japan', logo: 'https://logo4.png' },
      },
    },
  ],
};

describe('ingest/fixtures', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes WC2026 fixtures from API-Football', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/fixtures')
      .query(true)
      .reply(200, SAMPLE_FIXTURES_RESPONSE);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });

    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toEqual({
      apiFootballId: 1001,
      homeTeam: { apiFootballId: 10, name: 'Mexico', logoUrl: 'https://logo.png' },
      awayTeam: { apiFootballId: 20, name: 'Germany', logoUrl: 'https://logo2.png' },
      kickoffUtc: '2026-06-11T18:00:00+00:00',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: 'Estadio Azteca',
    });
  });

  it('maps API status codes to internal status', async () => {
    const response = {
      response: [{
        fixture: { id: 2001, date: '2026-06-20T18:00:00+00:00', venue: { name: 'Venue' }, status: { short: 'FT' } },
        league: { round: 'Quarter-final' },
        teams: {
          home: { id: 50, name: 'Spain', logo: null },
          away: { id: 60, name: 'France', logo: null },
        },
      }],
    };

    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(200, response);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });
    expect(fixtures[0].status).toBe('resolved');
    expect(fixtures[0].stage).toBe('knockout');
  });

  it('handles empty response gracefully (risk T2-4)', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(200, { response: [] });

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });
    expect(fixtures).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(403, { message: 'Forbidden' });

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 })
    ).rejects.toThrow(/403/);
  });

  it('throws on network failure', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).replyWithError('ECONNREFUSED');

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 })
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/ingest/fixtures.test.js
```

Expected: FAIL — `Cannot find module './fixtures.js'`

**Step 3: Write implementation `src/ingest/fixtures.js`**

```js
/**
 * API-Football fixtures client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" fixtures.js
 *
 * Fetches WC2026 fixtures from API-Football (RapidAPI) and normalizes
 * them into our internal schema shape.
 */

const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v3`;

// API-Football status codes → our internal status
const STATUS_MAP = {
  NS: 'scheduled',   // Not Started
  TBD: 'scheduled',  // Time To Be Defined
  '1H': 'scheduled', // in progress, treat as scheduled for our purposes
  HT: 'scheduled',
  '2H': 'scheduled',
  ET: 'scheduled',
  P: 'scheduled',
  FT: 'resolved',    // Full Time
  AET: 'resolved',   // After Extra Time
  PEN: 'resolved',   // Penalties
  PST: 'scheduled',  // Postponed
  CANC: 'scheduled', // Cancelled (treat as scheduled, will be filtered later)
  ABD: 'scheduled',  // Abandoned
  AWD: 'resolved',   // Awarded
  WO: 'resolved',    // Walkover
};

// Rounds containing these keywords are knockout stage
const KNOCKOUT_KEYWORDS = ['quarter', 'semi', 'final', 'round of', 'knockout', '16', '8'];

/**
 * @param {{ apiKey: string, leagueId: number, season: number }} params
 * @returns {Promise<Array<{
 *   apiFootballId: number,
 *   homeTeam: { apiFootballId: number, name: string, logoUrl: string|null },
 *   awayTeam: { apiFootballId: number, name: string, logoUrl: string|null },
 *   kickoffUtc: string,
 *   round: string,
 *   stage: 'group'|'knockout',
 *   status: 'scheduled'|'resolved',
 *   venue: string|null,
 * }>>}
 */
export async function fetchFixtures({ apiKey, leagueId, season }) {
  const url = `${BASE_URL}/fixtures?league=${leagueId}&season=${season}`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football fixtures HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const fixtures = data.response || [];

  return fixtures.map((item) => {
    const round = item.league?.round || '';
    const statusShort = item.fixture?.status?.short || 'NS';

    return {
      apiFootballId: item.fixture.id,
      homeTeam: {
        apiFootballId: item.teams.home.id,
        name: item.teams.home.name,
        logoUrl: item.teams.home.logo || null,
      },
      awayTeam: {
        apiFootballId: item.teams.away.id,
        name: item.teams.away.name,
        logoUrl: item.teams.away.logo || null,
      },
      kickoffUtc: item.fixture.date,
      round,
      stage: isKnockout(round) ? 'knockout' : 'group',
      status: STATUS_MAP[statusShort] || 'scheduled',
      venue: item.fixture.venue?.name || null,
    };
  });
}

function isKnockout(round) {
  const lower = round.toLowerCase();
  return KNOCKOUT_KEYWORDS.some((kw) => lower.includes(kw));
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ingest/fixtures.test.js
```

Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: API-Football fixtures client with status mapping, graceful degradation"
```

---

### Task 6: API-Football Teams Client

**Files:**
- Create: `src/ingest/teams.js`
- Create: `src/ingest/teams.test.js`

**Step 1: Write the failing test `src/ingest/teams.test.js`**

```js
import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchTeamStats } from './teams.js';

const RAPIDAPI_HOST = 'https://api-football-v1.p.rapidapi.com';
const API_KEY = 'test-rapid-key';

describe('ingest/teams', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches team statistics and returns normalized data', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/teams/statistics')
      .query(true)
      .reply(200, {
        response: {
          team: { id: 10, name: 'Mexico' },
          form: 'WWDLW',
          goals: { for: { total: { total: 12 } }, against: { total: { total: 5 } } },
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 });

    expect(stats.teamApiId).toBe(10);
    expect(stats.form).toBe('WWDLW');
    expect(stats.goalsScored).toBe(12);
    expect(stats.goalsConceded).toBe(5);
  });

  it('handles missing goals data gracefully (risk T2-4)', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/teams/statistics')
      .query(true)
      .reply(200, {
        response: {
          team: { id: 10, name: 'Mexico' },
          form: null,
          goals: { for: { total: {} }, against: { total: {} } },
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 });

    expect(stats.form).toBeNull();
    expect(stats.goalsScored).toBe(0);
    expect(stats.goalsConceded).toBe(0);
  });

  it('throws on HTTP error', async () => {
    nock(RAPIDAPI_HOST).get('/v3/teams/statistics').query(true).reply(500, 'Server error');

    await expect(
      fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 })
    ).rejects.toThrow(/500/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/ingest/teams.test.js
```

Expected: FAIL — `Cannot find module './teams.js'`

**Step 3: Write implementation `src/ingest/teams.js`**

```js
/**
 * API-Football team statistics client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" teams.js
 */

const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v3`;

/**
 * @param {{ apiKey: string, teamId: number, leagueId: number, season: number }} params
 * @returns {Promise<{ teamApiId: number, form: string|null, goalsScored: number, goalsConceded: number, rawJson: object }>}
 */
export async function fetchTeamStats({ apiKey, teamId, leagueId, season }) {
  const url = `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football teams/statistics HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const stats = data.response || {};

  return {
    teamApiId: stats.team?.id || teamId,
    form: stats.form || null,
    goalsScored: stats.goals?.for?.total?.total || 0,
    goalsConceded: stats.goals?.against?.total?.total || 0,
    rawJson: stats,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ingest/teams.test.js
```

Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: API-Football teams client with graceful degradation"
```

---

### Task 7: API-Football Odds Client

**Files:**
- Create: `src/ingest/odds.js`
- Create: `src/ingest/odds.test.js`

**Step 1: Write the failing test `src/ingest/odds.test.js`**

```js
import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchOdds } from './odds.js';

const RAPIDAPI_HOST = 'https://api-football-v1.p.rapidapi.com';
const API_KEY = 'test-rapid-key';

describe('ingest/odds', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes odds for a fixture', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/odds')
      .query(true)
      .reply(200, {
        response: [{
          bookmakers: [{
            name: 'Bet365',
            bets: [{
              name: 'Match Winner',
              values: [
                { value: 'Home', odd: '2.10' },
                { value: 'Draw', odd: '3.40' },
                { value: 'Away', odd: '3.50' },
              ],
            }],
          }],
        }],
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });

    expect(odds).toHaveLength(1);
    expect(odds[0].bookmaker).toBe('Bet365');
    expect(odds[0].homeWin).toBe(2.10);
    expect(odds[0].draw).toBe(3.40);
    expect(odds[0].awayWin).toBe(3.50);
  });

  it('handles empty odds response gracefully (risk T2-4: odds unavailable early)', async () => {
    nock(RAPIDAPI_HOST).get('/v3/odds').query(true).reply(200, { response: [] });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    expect(odds).toEqual([]);
  });

  it('handles missing Match Winner bet type', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/odds')
      .query(true)
      .reply(200, {
        response: [{
          bookmakers: [{
            name: 'Caliente',
            bets: [{ name: 'Over/Under', values: [] }],
          }],
        }],
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    // Should skip bookmakers without Match Winner
    expect(odds).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    nock(RAPIDAPI_HOST).get('/v3/odds').query(true).reply(429, 'Rate limited');

    await expect(
      fetchOdds({ apiKey: API_KEY, fixtureId: 1001 })
    ).rejects.toThrow(/429/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/ingest/odds.test.js
```

Expected: FAIL — `Cannot find module './odds.js'`

**Step 3: Write implementation `src/ingest/odds.js`**

```js
/**
 * API-Football odds client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" odds.js
 *
 * Fetches pre-match odds for a specific fixture.
 * Graceful degradation: returns empty array if no odds available.
 */

const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v3`;

/**
 * @param {{ apiKey: string, fixtureId: number }} params
 * @returns {Promise<Array<{ bookmaker: string, homeWin: number, draw: number, awayWin: number, rawJson: object }>>}
 */
export async function fetchOdds({ apiKey, fixtureId }) {
  const url = `${BASE_URL}/odds?fixture=${fixtureId}`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football odds HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const responseItems = data.response || [];

  if (responseItems.length === 0) return [];

  const results = [];
  const bookmakers = responseItems[0].bookmakers || [];

  for (const bm of bookmakers) {
    const matchWinner = bm.bets?.find((b) => b.name === 'Match Winner');
    if (!matchWinner) continue;

    const values = matchWinner.values || [];
    const home = values.find((v) => v.value === 'Home');
    const draw = values.find((v) => v.value === 'Draw');
    const away = values.find((v) => v.value === 'Away');

    if (!home || !draw || !away) continue;

    results.push({
      bookmaker: bm.name,
      homeWin: parseFloat(home.odd),
      draw: parseFloat(draw.odd),
      awayWin: parseFloat(away.odd),
      rawJson: matchWinner,
    });
  }

  return results;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ingest/odds.test.js
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: API-Football odds client with graceful degradation"
```

---

### Task 8: Data Availability Threshold Check

**Files:**
- Create: `src/ingest/dataThreshold.js`
- Create: `src/ingest/dataThreshold.test.js`

**Step 1: Write the failing test `src/ingest/dataThreshold.test.js`**

Reference: `docs/plan.md` risk T2-4 — data-availability threshold check before generation.

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb, upsertTeam, upsertFixture } from '../db/db.js';
import { checkDataAvailability } from './dataThreshold.js';

describe('dataThreshold', () => {
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
      venue: null,
    });
  });

  afterEach(() => {
    closeDb(db);
  });

  it('returns ready=true when both teams exist (minimum for seed pass)', () => {
    const result = checkDataAvailability(db, 100, 'seed');
    expect(result.ready).toBe(true);
  });

  it('returns ready=false when fixture does not exist', () => {
    const result = checkDataAvailability(db, 999, 'seed');
    expect(result.ready).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('returns ready=true for refresh pass even without odds (graceful degradation)', () => {
    const result = checkDataAvailability(db, 100, 'refresh');
    expect(result.ready).toBe(true);
    expect(result.warnings).toContain('No odds data');
  });

  it('returns warnings listing missing optional data', () => {
    const result = checkDataAvailability(db, 100, 'refresh');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/ingest/dataThreshold.test.js
```

Expected: FAIL — `Cannot find module './dataThreshold.js'`

**Step 3: Write implementation `src/ingest/dataThreshold.js`**

```js
/**
 * Data availability threshold check.
 * Reference: docs/plan.md risk T2-4 — graceful degradation.
 *
 * Checks whether enough data exists for a fixture to proceed with generation.
 * The seed pass has lower requirements than refresh/lock (per cadence model:
 * T-10 seed uses H2H+form, T-2 refresh enriches with lineups/odds).
 *
 * Returns { ready: boolean, reason?: string, warnings: string[] }
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} fixtureApiId
 * @param {'seed'|'refresh'|'lock'} pass
 * @returns {{ ready: boolean, reason?: string, warnings: string[] }}
 */
export function checkDataAvailability(db, fixtureApiId, pass) {
  const warnings = [];

  // Check fixture exists
  const fixture = db.prepare(`
    SELECT f.id, f.home_team_id, f.away_team_id
    FROM fixtures f
    WHERE f.api_football_id = ?
  `).get(fixtureApiId);

  if (!fixture) {
    return { ready: false, reason: `Fixture ${fixtureApiId} not found in database`, warnings };
  }

  // Check both teams exist (required for all passes)
  const homeTeam = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(fixture.home_team_id);
  const awayTeam = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(fixture.away_team_id);

  if (!homeTeam || !awayTeam) {
    return { ready: false, reason: 'One or both teams missing from database', warnings };
  }

  // Check optional data and collect warnings
  const h2h = db.prepare('SELECT id FROM head_to_head WHERE home_team_id = ? AND away_team_id = ?')
    .get(fixture.home_team_id, fixture.away_team_id);
  if (!h2h) warnings.push('No H2H data available');

  const homeStats = db.prepare('SELECT id FROM team_stats WHERE team_id = ?').get(fixture.home_team_id);
  if (!homeStats) warnings.push(`No team stats for ${homeTeam.name}`);

  const awayStats = db.prepare('SELECT id FROM team_stats WHERE team_id = ?').get(fixture.away_team_id);
  if (!awayStats) warnings.push(`No team stats for ${awayTeam.name}`);

  const odds = db.prepare('SELECT id FROM odds WHERE fixture_id = ?').get(fixture.id);
  if (!odds) warnings.push('No odds data available');

  // For seed pass: teams existing is enough (graceful degradation)
  // For refresh/lock: still proceed but warn (per plan: "graceful degradation")
  return { ready: true, warnings };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ingest/dataThreshold.test.js
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: data availability threshold check with graceful degradation"
```

---

## Phase 2b: Publishing, Storage & Orchestration

---

### Task 9: WordPress Upsert Publisher

**Files:**
- Create: `src/publish/wordpress.js`
- Create: `src/publish/wordpress.test.js`

**Step 1: Write the failing test `src/publish/wordpress.test.js`**

Reference: `docs/plan.md` "Phase 4 — CMS Integration" wordpress.js — upsert: create if no wp_post_id, update if present. Throttle 2/min (risk T3-1). Inject affiliate links + disclaimer. `rel="sponsored"` on affiliate links.

```js
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import nock from 'nock';
import { publishArticle } from './wordpress.js';

const WP_BASE = 'https://test-site.com';
const WP_PASSWORD = 'test-app-password';

const ARTICLE_DATA = {
  fixtureId: 1,
  articleType: 'pronostico_momios',
  contentJson: {
    h1_title: 'Pronósticos y momios México vs Alemania',
    meta_description: 'Análisis táctico y momios para México vs Alemania.',
    analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Los momios favorecen a México con 2.10.</p>',
    pronostico_quiniela: 'México 2-1',
    url_slug: 'pronosticos-momios-mexico-vs-alemania',
    puntos_clave: ['Pick 1', 'Pick 2'],
  },
  wpPostId: null, // new post
};

const AFFILIATE_URLS = {
  caliente: 'https://caliente.mx/ref/PROD',
  bet365: 'https://bet365.mx/ref/PROD',
  skimlinks: 'https://go.skimresources.com/?id=PROD&url=',
};

describe('publish/wordpress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    nock.cleanAll();
    vi.useRealTimers();
  });

  it('creates a new post when wpPostId is null', async () => {
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts')
      .reply(201, { id: 42, link: 'https://test-site.com/pronosticos-momios-mexico-vs-alemania/' });

    const result = await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(result.wpPostId).toBe(42);
    expect(result.action).toBe('created');
  });

  it('updates an existing post when wpPostId is set', async () => {
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts/42')
      .reply(200, { id: 42, link: 'https://test-site.com/pronosticos-momios-mexico-vs-alemania/' });

    const articleWithId = { ...ARTICLE_DATA, wpPostId: 42 };

    const result = await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: articleWithId,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(result.wpPostId).toBe(42);
    expect(result.action).toBe('updated');
  });

  it('injects affiliate links into the published content', async () => {
    let postedBody;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts', (body) => { postedBody = body; return true; })
      .reply(201, { id: 43, link: 'https://test-site.com/slug/' });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    // The content should have affiliate links injected
    expect(postedBody.content).toContain('caliente.mx/ref/PROD');
    expect(postedBody.content).toContain('rel="sponsored"');
  });

  it('includes disclaimer footer in published content', async () => {
    let postedBody;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts', (body) => { postedBody = body; return true; })
      .reply(201, { id: 44, link: 'https://test-site.com/slug/' });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(postedBody.content).toContain('entretenimiento e información únicamente');
    expect(postedBody.content).toContain('1-800-697-3735');
  });

  it('sends correct auth header (Basic with app password)', async () => {
    let authHeader;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts')
      .reply(function () {
        authHeader = this.req.headers.authorization;
        return [201, { id: 45, link: 'https://test-site.com/slug/' }];
      });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(authHeader).toMatch(/^Basic /);
  });

  it('throws on WordPress API error', async () => {
    nock(WP_BASE).post('/wp-json/wp/v2/posts').reply(403, { message: 'Forbidden' });

    await expect(
      publishArticle({
        wpBaseUrl: WP_BASE,
        wpAppPassword: WP_PASSWORD,
        article: ARTICLE_DATA,
        affiliateUrls: AFFILIATE_URLS,
      })
    ).rejects.toThrow(/403/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/publish/wordpress.test.js
```

Expected: FAIL — `Cannot find module './wordpress.js'`

**Step 3: Write implementation `src/publish/wordpress.js`**

```js
import { injectAffiliateLinks } from './affiliateInjector.js';
import { DISCLAIMER_FOOTER } from '../generate/prompt.js';

/**
 * WordPress REST API upsert publisher.
 * Reference: docs/plan.md "Phase 4 — CMS Integration" wordpress.js
 *
 * - Creates a new post if no wp_post_id exists.
 * - Updates the existing post (same URL) if wp_post_id is present.
 * - Injects affiliate links (rel="sponsored") + disclaimer footer.
 * - Auth via WordPress Application Password (Basic auth).
 * - Throttle: caller is responsible (max 2/min per risk T3-1).
 */

/**
 * @param {{
 *   wpBaseUrl: string,
 *   wpAppPassword: string,
 *   wpUsername?: string,
 *   article: { fixtureId: number, articleType: string, contentJson: object, wpPostId: number|null },
 *   affiliateUrls: { caliente: string, bet365: string, skimlinks: string },
 * }} params
 * @returns {Promise<{ wpPostId: number, action: 'created'|'updated', link: string }>}
 */
export async function publishArticle({
  wpBaseUrl,
  wpAppPassword,
  wpUsername = 'bot',
  article,
  affiliateUrls,
}) {
  const { contentJson, wpPostId } = article;

  // Build the full HTML content
  let html = contentJson.analisis_tactico_html || '';

  // Inject affiliate links (Phase 1 module)
  html = injectAffiliateLinks(html, affiliateUrls);

  // Append disclaimer footer (always, per Legal & Compliance)
  html = html + '\n\n' + DISCLAIMER_FOOTER;

  // Prepare WordPress post body
  const postBody = {
    title: contentJson.h1_title || 'Untitled',
    slug: contentJson.url_slug || undefined,
    content: html,
    status: 'publish',
    excerpt: contentJson.meta_description || '',
    meta: {
      _yoast_wpseo_metadesc: contentJson.meta_description || '',
    },
  };

  // Determine endpoint: create vs update
  const isUpdate = wpPostId != null;
  const url = isUpdate
    ? `${wpBaseUrl}/wp-json/wp/v2/posts/${wpPostId}`
    : `${wpBaseUrl}/wp-json/wp/v2/posts`;

  // Basic auth
  const authString = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authString}`,
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WordPress API HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();

  return {
    wpPostId: result.id,
    action: isUpdate ? 'updated' : 'created',
    link: result.link || '',
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/publish/wordpress.test.js
```

Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: WordPress upsert publisher with affiliate injection, disclaimers, Basic auth"
```

---

### Task 10: Sitemap Generator + IndexNow Ping

**Files:**
- Create: `src/publish/sitemap.js`
- Create: `src/publish/sitemap.test.js`

**Step 1: Write the failing test `src/publish/sitemap.test.js`**

Reference: `docs/plan.md` "Phase 5 — Execution & Indexing" sitemap.js + risk T3-7 (IndexNow/GSC ping).

```js
import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { generateSitemap, pingIndexNow } from './sitemap.js';

describe('publish/sitemap', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateSitemap', () => {
    it('generates valid XML sitemap from article URLs', () => {
      const articles = [
        { url: 'https://site.com/pronosticos-mexico-vs-alemania/', lastmod: '2026-06-01' },
        { url: 'https://site.com/pronosticos-brazil-vs-japan/', lastmod: '2026-06-02' },
      ];

      const xml = generateSitemap(articles);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain('<loc>https://site.com/pronosticos-mexico-vs-alemania/</loc>');
      expect(xml).toContain('<lastmod>2026-06-01</lastmod>');
      expect(xml).toContain('<loc>https://site.com/pronosticos-brazil-vs-japan/</loc>');
      expect(xml).toContain('</urlset>');
    });

    it('returns a valid sitemap with zero articles', () => {
      const xml = generateSitemap([]);
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
    });

    it('escapes special XML characters in URLs', () => {
      const articles = [{ url: 'https://site.com/a&b/', lastmod: '2026-06-01' }];
      const xml = generateSitemap(articles);
      expect(xml).toContain('&amp;');
      expect(xml).not.toContain('&b');
    });
  });

  describe('pingIndexNow', () => {
    it('sends URLs to IndexNow API', async () => {
      nock('https://api.indexnow.org')
        .post('/indexnow')
        .reply(200, 'OK');

      const result = await pingIndexNow({
        host: 'site.com',
        key: 'indexnow-key-123',
        urls: ['https://site.com/page-1/', 'https://site.com/page-2/'],
      });

      expect(result.success).toBe(true);
    });

    it('handles IndexNow API failure gracefully (non-critical)', async () => {
      nock('https://api.indexnow.org')
        .post('/indexnow')
        .reply(500, 'Server Error');

      const result = await pingIndexNow({
        host: 'site.com',
        key: 'indexnow-key-123',
        urls: ['https://site.com/page-1/'],
      });

      // Should not throw — indexing is non-critical
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('skips ping when no URLs provided', async () => {
      const result = await pingIndexNow({
        host: 'site.com',
        key: 'key',
        urls: [],
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/publish/sitemap.test.js
```

Expected: FAIL — `Cannot find module './sitemap.js'`

**Step 3: Write implementation `src/publish/sitemap.js`**

```js
/**
 * Sitemap generator + IndexNow ping.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" sitemap.js
 *
 * Generates an XML sitemap from published article URLs.
 * Pings IndexNow for faster indexing (non-critical — failures are swallowed).
 */

/**
 * Generates a valid XML sitemap string.
 * @param {Array<{ url: string, lastmod: string }>} articles
 * @returns {string} XML sitemap content
 */
export function generateSitemap(articles) {
  const urlEntries = articles
    .map((a) => `  <url>\n    <loc>${escapeXml(a.url)}</loc>\n    <lastmod>${a.lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

/**
 * Pings IndexNow with newly published/updated URLs.
 * Non-critical: failures are caught and returned, not thrown.
 *
 * @param {{ host: string, key: string, urls: string[] }} params
 * @returns {Promise<{ success: boolean, skipped?: boolean, error?: string }>}
 */
export async function pingIndexNow({ host, key, urls }) {
  if (urls.length === 0) {
    return { success: true, skipped: true };
  }

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key,
        urlList: urls,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `IndexNow HTTP ${response.status}: ${text}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/publish/sitemap.test.js
```

Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: sitemap generator + IndexNow ping (non-critical, graceful failure)"
```

---

### Task 11: Azure Blob Storage Persistence with Lease Locking

**Files:**
- Create: `src/storage/blob.js`
- Create: `src/storage/blob.test.js`

**Step 1: Write the failing test `src/storage/blob.test.js`**

Reference: `docs/plan.md` risk T2-2 — lease-based locking, atomic upload via temp-blob + copy.

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadDb, uploadDb } from './blob.js';

// Mock @azure/storage-blob
vi.mock('@azure/storage-blob', () => {
  const mockLeaseClient = {
    acquireLease: vi.fn().mockResolvedValue({ leaseId: 'lease-123' }),
    releaseLease: vi.fn().mockResolvedValue({}),
  };

  const mockBlockBlobClient = {
    downloadToFile: vi.fn().mockResolvedValue({}),
    uploadFile: vi.fn().mockResolvedValue({}),
    getBlobLeaseClient: vi.fn().mockReturnValue(mockLeaseClient),
    beginCopyFromURL: vi.fn().mockResolvedValue({ pollUntilDone: vi.fn().mockResolvedValue({}) }),
    url: 'https://account.blob.core.windows.net/container/wc26.sqlite',
    deleteIfExists: vi.fn().mockResolvedValue({}),
  };

  const mockContainerClient = {
    getBlockBlobClient: vi.fn().mockReturnValue(mockBlockBlobClient),
  };

  const mockBlobServiceClient = {
    getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
  };

  return {
    BlobServiceClient: {
      fromConnectionString: vi.fn().mockReturnValue(mockBlobServiceClient),
    },
    __mockLeaseClient: mockLeaseClient,
    __mockBlockBlobClient: mockBlockBlobClient,
    __mockContainerClient: mockContainerClient,
  };
});

import { BlobServiceClient, __mockLeaseClient, __mockBlockBlobClient } from '@azure/storage-blob';

describe('storage/blob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the DB file with a lease acquired', async () => {
    const result = await downloadDb({
      connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
    });

    expect(__mockLeaseClient.acquireLease).toHaveBeenCalledWith(60);
    expect(__mockBlockBlobClient.downloadToFile).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    expect(result.leaseId).toBe('lease-123');
  });

  it('uploads the DB atomically (temp blob + copy) then releases lease', async () => {
    await uploadDb({
      connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
      leaseId: 'lease-123',
    });

    // Should upload to a temp blob first
    expect(__mockBlockBlobClient.uploadFile).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    // Should copy from temp to final
    expect(__mockBlockBlobClient.beginCopyFromURL).toHaveBeenCalled();
    // Should release lease
    expect(__mockLeaseClient.releaseLease).toHaveBeenCalled();
  });

  it('releases lease even if upload fails', async () => {
    __mockBlockBlobClient.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));

    await expect(
      uploadDb({
        connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
        containerName: 'wc26',
        blobName: 'wc26.sqlite',
        localPath: '/tmp/wc26.sqlite',
        leaseId: 'lease-123',
      })
    ).rejects.toThrow('Upload failed');

    // Lease should still be released
    expect(__mockLeaseClient.releaseLease).toHaveBeenCalled();
  });

  it('fails fast if lease cannot be acquired', async () => {
    __mockLeaseClient.acquireLease.mockRejectedValueOnce(new Error('Lease already held'));

    await expect(
      downloadDb({
        connectionString: 'DefaultEndpointsProtocol=https;AccountName=test',
        containerName: 'wc26',
        blobName: 'wc26.sqlite',
        localPath: '/tmp/wc26.sqlite',
      })
    ).rejects.toThrow('Lease already held');

    // Should NOT attempt download
    expect(__mockBlockBlobClient.downloadToFile).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/storage/blob.test.js
```

Expected: FAIL — `Cannot find module './blob.js'`

**Step 3: Write implementation `src/storage/blob.js`**

```js
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Azure Blob Storage persistence with lease-based locking.
 * Reference: docs/plan.md risk T2-2 — acquire lease before download,
 * atomic upload via temp-blob + copy, release lease.
 *
 * The lease prevents concurrent GitHub Action runs from corrupting the DB.
 */

const LEASE_DURATION_SECONDS = 60; // 60s lease; renew if processing takes longer

/**
 * Downloads the SQLite DB from Azure Blob with a lease lock.
 * Caller MUST call uploadDb (which releases lease) when done.
 *
 * @param {{ connectionString: string, containerName: string, blobName: string, localPath: string }} params
 * @returns {Promise<{ leaseId: string }>}
 */
export async function downloadDb({ connectionString, containerName, blobName, localPath }) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);

  // Acquire lease — fail fast if another run holds it
  const leaseClient = blobClient.getBlobLeaseClient();
  const lease = await leaseClient.acquireLease(LEASE_DURATION_SECONDS);

  // Download with lease held
  await blobClient.downloadToFile(localPath);

  return { leaseId: lease.leaseId };
}

/**
 * Uploads the mutated SQLite DB back to Azure Blob atomically.
 * Strategy: upload to temp blob, copy to final, delete temp, release lease.
 *
 * @param {{ connectionString: string, containerName: string, blobName: string, localPath: string, leaseId: string }} params
 */
export async function uploadDb({ connectionString, containerName, blobName, localPath, leaseId }) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const finalBlobClient = containerClient.getBlockBlobClient(blobName);
  const tempBlobName = `${blobName}.tmp-${Date.now()}`;
  const tempBlobClient = containerClient.getBlockBlobClient(tempBlobName);

  const leaseClient = finalBlobClient.getBlobLeaseClient();

  try {
    // Upload to temp blob
    await tempBlobClient.uploadFile(localPath);

    // Atomic copy: temp → final
    const copyPoller = await finalBlobClient.beginCopyFromURL(tempBlobClient.url);
    await copyPoller.pollUntilDone();

    // Clean up temp
    await tempBlobClient.deleteIfExists();
  } finally {
    // Always release lease
    await leaseClient.releaseLease();
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/storage/blob.test.js
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: Azure Blob persistence with lease-based locking, atomic upload"
```

---

### Task 12: Cadence Orchestrator Script

**Files:**
- Create: `scripts/run-cadence.js`
- Create: `scripts/run-cadence.test.js`

**Step 1: Write the failing test `scripts/run-cadence.test.js`**

Reference: `docs/plan.md` "Publishing Cadence & Lifecycle" scheduler section — pull DB → selectPass → ingest → generate → publish → advance state → upload DB.

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCadence } from './run-cadence.js';

// Mock all external dependencies
vi.mock('../src/storage/blob.js', () => ({
  downloadDb: vi.fn().mockResolvedValue({ leaseId: 'lease-abc' }),
  uploadDb: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/db/db.js', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
      run: vi.fn(),
    }),
    close: vi.fn(),
  };
  return {
    openDb: vi.fn().mockReturnValue(mockDb),
    closeDb: vi.fn(),
    __mockDb: mockDb,
  };
});

vi.mock('../src/cadence/selectPass.js', () => ({
  selectPass: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/generate/batch.js', () => ({
  runBatch: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, skipped: 0 }),
}));

vi.mock('../src/publish/wordpress.js', () => ({
  publishArticle: vi.fn().mockResolvedValue({ wpPostId: 1, action: 'created', link: '' }),
}));

import { downloadDb, uploadDb } from '../src/storage/blob.js';
import { openDb, closeDb } from '../src/db/db.js';
import { selectPass } from '../src/cadence/selectPass.js';
import { runBatch } from '../src/generate/batch.js';

describe('run-cadence orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads DB, processes, and uploads DB on success', async () => {
    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      wpBaseUrl: 'https://site.com',
      wpAppPassword: 'pass',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(downloadDb).toHaveBeenCalledWith({
      connectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
    });
    expect(openDb).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    expect(uploadDb).toHaveBeenCalledWith({
      connectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
      leaseId: 'lease-abc',
    });
    expect(closeDb).toHaveBeenCalled();
  });

  it('still uploads DB even when no fixtures are due', async () => {
    selectPass.mockReturnValue(null);

    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      wpBaseUrl: 'https://site.com',
      wpAppPassword: 'pass',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(uploadDb).toHaveBeenCalled();
  });

  it('calls selectPass for each fixture to determine due passes', async () => {
    const mockFixtures = [
      { id: 1, api_football_id: 100, kickoff_utc: '2026-06-11T18:00:00Z', status: 'scheduled' },
    ];
    const mockArticle = { fixture_id: 1, article_type: 'pronostico_momios', lifecycle_state: null };

    const mockDb = {
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM fixtures')) {
          return { all: vi.fn().mockReturnValue(mockFixtures) };
        }
        if (sql.includes('FROM articles')) {
          return { get: vi.fn().mockReturnValue(mockArticle) };
        }
        return { all: vi.fn().mockReturnValue([]), get: vi.fn().mockReturnValue(null), run: vi.fn() };
      }),
      close: vi.fn(),
    };
    openDb.mockReturnValue(mockDb);
    selectPass.mockReturnValue('seed');

    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      wpBaseUrl: 'https://site.com',
      wpAppPassword: 'pass',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(selectPass).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run scripts/run-cadence.test.js
```

Expected: FAIL — `Cannot find module './run-cadence.js'`

**Step 3: Write implementation `scripts/run-cadence.js`**

```js
#!/usr/bin/env node
/**
 * Cadence orchestrator — the GitHub Action entry point.
 * Reference: docs/plan.md "Publishing Cadence & Lifecycle" scheduler section.
 *
 * Flow:
 *   1. Pull wc26.sqlite from Azure Blob (with lease)
 *   2. Select fixtures with due passes (selectPass)
 *   3. For each due fixture: ingest → generate → publish → advance lifecycle
 *   4. Upload mutated DB back to Blob (releases lease)
 *
 * Idempotent: re-running is a no-op for already-processed passes.
 */

import { downloadDb, uploadDb } from '../src/storage/blob.js';
import { openDb, closeDb } from '../src/db/db.js';
import { selectPass } from '../src/cadence/selectPass.js';
import { runBatch } from '../src/generate/batch.js';
import { publishArticle } from '../src/publish/wordpress.js';

/**
 * Main orchestration function (exported for testing).
 * @param {object} config
 */
export async function runCadence(config) {
  const {
    azureStorageConnectionString,
    containerName = 'wc26',
    blobName = 'wc26.sqlite',
    dbPath,
    endpoint,
    apiKey,
    activeArticleTypes,
    wpBaseUrl,
    wpAppPassword,
    affiliateUrls,
  } = config;

  // 1. Download DB with lease
  const { leaseId } = await downloadDb({
    connectionString: azureStorageConnectionString,
    containerName,
    blobName,
    localPath: dbPath,
  });

  let db;
  try {
    // 2. Open DB
    db = openDb(dbPath);

    const now = new Date().toISOString();

    // 3. Get all scheduled/resolved fixtures
    const fixtures = db.prepare(`
      SELECT id, api_football_id, kickoff_utc, status
      FROM fixtures
      WHERE status IN ('scheduled', 'resolved')
    `).all();

    const dueFixtures = [];

    for (const fixture of fixtures) {
      // Check each article type for due passes
      for (const articleType of activeArticleTypes) {
        const article = db.prepare(`
          SELECT lifecycle_state FROM articles
          WHERE fixture_id = ? AND article_type = ?
        `).get(fixture.id, articleType);

        const lifecycleState = article?.lifecycle_state || null;
        const pass = selectPass({ kickoffUtc: fixture.kickoff_utc, lifecycleState, now });

        if (pass) {
          dueFixtures.push({ fixture, articleType, pass });
        }
      }
    }

    console.log(`[cadence] ${dueFixtures.length} fixture×type combinations due for processing`);

    // 4. Process due fixtures: generate → publish → advance state
    for (const { fixture, articleType, pass } of dueFixtures) {
      try {
        // Generate
        const batchResult = await runBatch(db, [fixture.api_football_id], {
          endpoint,
          apiKey,
          activeArticleTypes: [articleType],
        });

        if (batchResult.succeeded > 0) {
          // Get the generated article
          const article = db.prepare(`
            SELECT * FROM articles WHERE fixture_id = ? AND article_type = ?
          `).get(fixture.id, articleType);

          if (article && article.content_json) {
            // Publish
            const contentJson = JSON.parse(article.content_json);
            const publishResult = await publishArticle({
              wpBaseUrl,
              wpAppPassword,
              article: {
                fixtureId: fixture.id,
                articleType,
                contentJson,
                wpPostId: article.wp_post_id,
              },
              affiliateUrls,
            });

            // Advance lifecycle state
            const stateMap = { seed: 'seeded', refresh: 'refreshed', lock: 'locked' };
            db.prepare(`
              UPDATE articles
              SET lifecycle_state = ?, last_pass = ?, wp_post_id = ?,
                  last_refreshed_at = datetime('now'), updated_at = datetime('now')
              WHERE fixture_id = ? AND article_type = ?
            `).run(stateMap[pass], pass, publishResult.wpPostId, fixture.id, articleType);

            console.log(`[cadence] ${pass} complete: fixture ${fixture.api_football_id} / ${articleType}`);
          }
        }
      } catch (err) {
        console.error(`[cadence] ERROR processing fixture ${fixture.api_football_id} / ${articleType}: ${err.message}`);
        // Continue to next fixture — don't fail the whole run
      }
    }
  } finally {
    // 5. Close DB and upload (always, even if no work was done)
    if (db) closeDb(db);

    await uploadDb({
      connectionString: azureStorageConnectionString,
      containerName,
      blobName,
      localPath: dbPath,
      leaseId,
    });

    console.log('[cadence] DB uploaded, lease released');
  }
}

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const config = {
    azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.BLOB_CONTAINER || 'wc26',
    blobName: process.env.BLOB_NAME || 'wc26.sqlite',
    dbPath: process.env.DB_PATH || '/tmp/wc26.sqlite',
    endpoint: process.env.AZURE_AI_ENDPOINT,
    apiKey: process.env.AZURE_AI_KEY,
    activeArticleTypes: (process.env.ACTIVE_ARTICLE_TYPES || 'pronostico_momios').split(','),
    wpBaseUrl: process.env.WP_BASE_URL,
    wpAppPassword: process.env.WP_APP_PASSWORD,
    affiliateUrls: {
      caliente: process.env.CALIENTE_AFFILIATE_URL || '',
      bet365: process.env.BET365_AFFILIATE_URL || '',
      skimlinks: process.env.SKIMLINKS_AFFILIATE_URL || '',
    },
  };

  runCadence(config)
    .then(() => { console.log('[cadence] Run complete'); process.exit(0); })
    .catch((err) => { console.error(`[cadence] FATAL: ${err.message}`); process.exit(1); });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run scripts/run-cadence.test.js
```

Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: cadence orchestrator (pull DB, selectPass, generate, publish, upload)"
```

---

### Task 13: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/cadence.yml`
- Create: `scripts/validate-workflow.js`

**Step 1: Create `.github/workflows/cadence.yml`**

Reference: `docs/plan.md` "Publishing Cadence & Lifecycle" GitHub Actions workflow section + risk T2-6 (failure alerting).

```yaml
name: WC26 Quiniela Cadence

on:
  schedule:
    # Twice daily: 6am and 6pm UTC
    - cron: '0 6,18 * * *'
  workflow_dispatch:
    inputs:
      force_pass:
        description: 'Force a specific pass (seed/refresh/lock) — overrides cadence logic'
        required: false
        type: string

concurrency:
  group: wc26-pipeline
  cancel-in-progress: false

env:
  NODE_VERSION: '18'
  BLOB_CONTAINER: 'wc26'
  BLOB_NAME: 'wc26.sqlite'
  DB_PATH: '/tmp/wc26.sqlite'
  ACTIVE_ARTICLE_TYPES: 'pronostico_momios'

jobs:
  cadence:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run cadence pipeline
        env:
          AZURE_AI_ENDPOINT: ${{ secrets.AZURE_AI_ENDPOINT }}
          AZURE_AI_KEY: ${{ secrets.AZURE_AI_KEY }}
          RAPIDAPI_KEY: ${{ secrets.RAPIDAPI_KEY }}
          WP_BASE_URL: ${{ secrets.WP_BASE_URL }}
          WP_APP_PASSWORD: ${{ secrets.WP_APP_PASSWORD }}
          AZURE_STORAGE_CONNECTION_STRING: ${{ secrets.AZURE_STORAGE_CONNECTION_STRING }}
          CALIENTE_AFFILIATE_URL: ${{ secrets.CALIENTE_AFFILIATE_URL }}
          BET365_AFFILIATE_URL: ${{ secrets.BET365_AFFILIATE_URL }}
          SKIMLINKS_AFFILIATE_URL: ${{ secrets.SKIMLINKS_AFFILIATE_URL }}
        run: node scripts/run-cadence.js

      - name: Alert on failure
        if: failure()
        env:
          ALERT_WEBHOOK: ${{ secrets.ALERT_WEBHOOK_URL }}
        run: |
          if [ -n "$ALERT_WEBHOOK" ]; then
            curl -s -X POST "$ALERT_WEBHOOK" \
              -H 'Content-Type: application/json' \
              -d "{\"text\":\"🚨 WC26 Cadence FAILED — run: ${{ github.run_id }}, ref: ${{ github.ref }}\"}"
          fi
```

**Step 2: Create `scripts/validate-workflow.js`**

A simple node script that validates the YAML structure has required keys (no unit test — this is a verification tool).

```js
#!/usr/bin/env node
/**
 * Validates .github/workflows/cadence.yml has all required structure.
 * Run: node scripts/validate-workflow.js
 * Exits 0 on success, 1 on failure.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_PATH = resolve('.github/workflows/cadence.yml');

let content;
try {
  content = readFileSync(WORKFLOW_PATH, 'utf-8');
} catch (err) {
  console.error(`❌ Cannot read workflow file: ${err.message}`);
  process.exit(1);
}

const REQUIRED_PATTERNS = [
  { pattern: /on:\s*\n\s+schedule:/, label: 'schedule trigger' },
  { pattern: /workflow_dispatch:/, label: 'workflow_dispatch trigger' },
  { pattern: /concurrency:\s*\n\s+group:\s*wc26-pipeline/, label: 'concurrency group' },
  { pattern: /cancel-in-progress:\s*false/, label: 'cancel-in-progress: false' },
  { pattern: /secrets\.AZURE_AI_ENDPOINT/, label: 'AZURE_AI_ENDPOINT secret' },
  { pattern: /secrets\.AZURE_AI_KEY/, label: 'AZURE_AI_KEY secret' },
  { pattern: /secrets\.RAPIDAPI_KEY/, label: 'RAPIDAPI_KEY secret' },
  { pattern: /secrets\.WP_BASE_URL/, label: 'WP_BASE_URL secret' },
  { pattern: /secrets\.WP_APP_PASSWORD/, label: 'WP_APP_PASSWORD secret' },
  { pattern: /secrets\.AZURE_STORAGE_CONNECTION_STRING/, label: 'AZURE_STORAGE_CONNECTION_STRING secret' },
  { pattern: /if:\s*failure\(\)/, label: 'failure alert step' },
  { pattern: /npm ci/, label: 'npm ci step' },
  { pattern: /run-cadence\.js/, label: 'run-cadence.js execution' },
];

let allPassed = true;
for (const { pattern, label } of REQUIRED_PATTERNS) {
  if (!pattern.test(content)) {
    console.error(`❌ Missing: ${label}`);
    allPassed = false;
  } else {
    console.log(`✅ Found: ${label}`);
  }
}

if (allPassed) {
  console.log('\n✅ Workflow validation PASSED');
  process.exit(0);
} else {
  console.error('\n❌ Workflow validation FAILED');
  process.exit(1);
}
```

**Step 3: Run the validator**

```bash
node scripts/validate-workflow.js
```

Expected: All 13 checks pass, exit code 0.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: GitHub Actions cadence workflow with concurrency, secrets, failure alerts"
```

---

### Task 14: Add Pipeline npm Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add scripts to `package.json`**

Add these entries to the `"scripts"` section:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "cost-report": "node scripts/cost-report.js",
    "cadence": "node scripts/run-cadence.js",
    "validate-workflow": "node scripts/validate-workflow.js"
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "chore: add cadence and validate-workflow npm scripts"
```

---

### Task 15: Full Phase 2 Test Suite Smoke Run

**Step 1: Run the entire test suite (Phase 1 + Phase 2)**

```bash
npx vitest run
```

Expected: All tests pass. Approximate count:
- Phase 1: 56 tests
- Phase 2: 5 (rateLimiter) + 8 (router) + 5 (batch) + 5 (fixtures) + 3 (teams) + 4 (odds) + 4 (dataThreshold) + 6 (wordpress) + 6 (sitemap) + 4 (blob) + 3 (run-cadence) = 53 tests
- **Total: ~109 tests PASS**

**Step 2: Run workflow validator**

```bash
node scripts/validate-workflow.js
```

Expected: exit code 0, all checks pass.

**Step 3: Final commit**

```bash
git status
# If clean, no action needed.
# If any files need attention:
git add -A && git commit -m "chore: Phase 2 complete — all tests green"
```

---

## Summary

| Task | Module | Tests | Key Deliverable |
|------|--------|-------|-----------------|
| 1 | Dependencies | — | @azure/storage-blob + nock |
| 2 | Rate Limiter | 5 | 1 req/sec FIFO queue |
| 3 | Router Client | 8 | Azure AI call + retries + zod + usage extraction |
| 4 | Batch Runner | 5 | fixture×type iteration, cost capture, failure logging |
| 5 | Fixtures Client | 5 | API-Football fixtures with status mapping |
| 6 | Teams Client | 3 | Team stats with graceful degradation |
| 7 | Odds Client | 4 | Odds normalization, empty-response handling |
| 8 | Data Threshold | 4 | Pre-generation readiness check |
| 9 | WordPress Publisher | 6 | Upsert (create/update), affiliates, disclaimers |
| 10 | Sitemap + IndexNow | 6 | XML generation, non-critical index ping |
| 11 | Blob Storage | 4 | Lease-based locking, atomic upload |
| 12 | Cadence Orchestrator | 3 | Full pipeline: blob→selectPass→generate→publish→upload |
| 13 | GitHub Action | — | YAML workflow + validator script |
| 14 | npm Scripts | — | cadence + validate-workflow commands |
| 15 | Smoke Run | ALL | Full suite green (~109 tests) |

**Total: ~53 new tests across 15 tasks (+ Phase 1's 56 = ~109 total).**

After this phase completes, the full pipeline is testable end-to-end with mocks. Live smoke-testing against real Azure/API-Football/WordPress requires user-provisioned credentials — tracked in MORNING-REVIEW.md.
