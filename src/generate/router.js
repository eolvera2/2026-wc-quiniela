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
