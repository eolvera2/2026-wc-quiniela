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
