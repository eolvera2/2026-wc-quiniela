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
 * @param {number[]} fixtureApiIds - provider fixture IDs to process
 * @param {{ endpoint: string, apiKey: string, activeArticleTypes: string[], deploymentName?: string }} config
 * @returns {Promise<{ succeeded: number, failed: number, skipped: number }>}
 */
export async function runBatch(db, fixtureApiIds, config) {
  const { endpoint, apiKey, activeArticleTypes, deploymentName } = config;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const apiId of fixtureApiIds) {
    // Resolve internal fixture ID
    const fixture = db.prepare(`
      SELECT f.id, f.kickoff_utc, f.venue,
             COALESCE(hln.name, ht.name) AS home_team,
             COALESCE(aln.name, at.name) AS away_team
      FROM fixtures f
      JOIN teams ht ON f.home_team_id = ht.id
      JOIN teams at ON f.away_team_id = at.id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE f.api_football_id = ?
    `).get(apiId);

    if (!fixture) {
      skipped++;
      continue;
    }

    for (const articleType of activeArticleTypes) {
      const startTime = Date.now();

      const matchData = {
        teamA: fixture.home_team,
        teamB: fixture.away_team,
        h2h: getH2H(db, fixture.id),
        form: getForm(db, fixture.id),
        injuries: getInjuries(db, fixture.id),
        odds: getOdds(db, fixture.id),
        kickoffUtc: fixture.kickoff_utc,
      };
      const dataAvailability = getDataAvailability(matchData);

      if (shouldUsePlaceholder(articleType, dataAvailability)) {
        const article = buildPlaceholderArticle({ articleType, fixture, dataAvailability });
        db.prepare(`
          INSERT INTO articles (fixture_id, article_type, status, content_json, updated_at)
          VALUES (@fixtureId, @articleType, 'placeholder', @contentJson, datetime('now'))
          ON CONFLICT(fixture_id, article_type) DO UPDATE SET
            status = 'placeholder',
            content_json = excluded.content_json,
            updated_at = datetime('now')
        `).run({
          fixtureId: fixture.id,
          articleType,
          contentJson: JSON.stringify(article),
        });
        succeeded++;
        continue;
      }

      // Prepare prompts
      const systemPrompt = buildSystemPrompt(articleType);
      const userPrompt = buildUserPrompt({ ...matchData, dataAvailability });

      try {
        const result = await callRouter({
          endpoint,
          apiKey,
          deploymentName,
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

function getDataAvailability({ h2h, form, injuries, odds }) {
  return {
    h2h: Boolean(h2h && !/no historical|no data/i.test(h2h)),
    form: Boolean(form && !/N\/A|No form/i.test(form)),
    injuries: Boolean(injuries && !/No injury data/i.test(injuries)),
    odds: Boolean(odds && typeof odds.home === 'number' && typeof odds.draw === 'number' && typeof odds.away === 'number'),
    lineups: false,
    advancedMarkets: Boolean(odds && typeof odds.home === 'number'),
  };
}

function shouldUsePlaceholder(articleType, availability) {
  if (articleType === 'alineacion_probable') return !availability.lineups && !availability.injuries;
  if (articleType === 'analisis_apostar') return !availability.advancedMarkets;
  return false;
}

function buildPlaceholderArticle({ articleType, fixture, dataAvailability }) {
  const titleByType = {
    alineacion_probable: `Alineación probable ${fixture.home_team} vs ${fixture.away_team}`,
    analisis_apostar: `Análisis para apostar ${fixture.home_team} vs ${fixture.away_team}`,
    quiniela_verdict: `¿Quién gana la quiniela: ${fixture.home_team} o ${fixture.away_team}?`,
    pronostico_momios: `Pronósticos y momios ${fixture.home_team} vs ${fixture.away_team}`,
  };
  const messageByType = {
    alineacion_probable: 'Próximamente: publicaremos la alineación probable cuando exista información confiable de convocatorias, bajas o lineups confirmados.',
    analisis_apostar: 'Próximamente: agregaremos mercados avanzados cuando los momios, probabilidades y líneas estén disponibles cerca del partido.',
    quiniela_verdict: 'Próximamente: actualizaremos este veredicto cuando haya más datos de forma y contexto competitivo.',
    pronostico_momios: 'Próximamente: actualizaremos el pronóstico con momios cuando estén disponibles.',
  };
  const h1 = titleByType[articleType] || `${fixture.home_team} vs ${fixture.away_team}`;

  return {
    h1_title: h1,
    meta_description: `${h1} Mundial 2026. Información se actualizará conforme haya datos confiables.`,
    puntos_clave: [messageByType[articleType], 'No inventamos lesiones, alineaciones ni momios no confirmados.'],
    analisis_tactico_html: `<section class="coming-soon" data-availability='${JSON.stringify(dataAvailability)}'><h2>${h1}</h2><p>${messageByType[articleType]}</p></section>`,
    pronostico_quiniela: 'Próximamente',
    url_slug: h1.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  };
}
