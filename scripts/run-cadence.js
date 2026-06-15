/**
 * Cadence orchestrator — the GitHub Action entry point.
 * Reference: docs/plan.md "Publishing Cadence & Lifecycle" scheduler section.
 *
 * Flow:
 *   1. Pull wc26.sqlite from Azure Blob (with lease)
 *   2. Select fixtures with due passes (selectPass)
 *   3. For each due fixture: ingest → generate → advance lifecycle
 *   4. Full-site rebuild from all articles with content
 *   5. Upload mutated DB back to Blob (releases lease)
 *
 * Idempotent: re-running is a no-op for already-processed passes.
 */

import { downloadDb, renewDbLease, uploadDb } from '../src/storage/blob.js';
import { openDb, closeDb } from '../src/db/db.js';
import { selectPass } from '../src/cadence/selectPass.js';
import { runBatch } from '../src/generate/batch.js';
import { buildSite } from '../src/publish/staticSite.js';
import { hydrateFixtureFromFootballData } from '../src/ingest/matchHydration.js';
import { applyPublicFinalScores, findMissingPublicFinalScores } from '../src/ingest/publicFinalScores.js';
import { seedStaticData } from './seed-static.js';

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
    deploymentName,
    footballDataKey,
    activeArticleTypes,
    siteBaseUrl,
    outputDir = 'dist',
    affiliateUrls,
    forceFixtureMatch,
    forcePass,
  } = config;

  // 1. Download DB with lease
  const { leaseId } = await downloadDb({
    connectionString: azureStorageConnectionString,
    containerName,
    blobName,
    localPath: dbPath,
  });
  const leaseRenewal = setInterval(() => {
    renewDbLease({
      connectionString: azureStorageConnectionString,
      containerName,
      blobName,
      leaseId,
    }).catch((err) => {
      console.warn(`[cadence] WARN DB lease renewal failed: ${err.message}`);
    });
  }, 30_000);
  leaseRenewal.unref?.();

  let db;
  try {
    // 2. Open DB
    db = openDb(dbPath);
    const seedResult = seedStaticData(db);
    console.log(`[cadence] Static seed ready: ${seedResult.fixtures} fixtures, ${seedResult.teams} teams`);

    const now = new Date().toISOString();
    const finalScoreResult = applyPublicFinalScores(db, { now });
    if (finalScoreResult.applied > 0 || finalScoreResult.skipped > 0) {
      console.log(`[cadence] Public final scores applied=${finalScoreResult.applied}, skipped=${finalScoreResult.skipped}`);
    }
    const missingFinalScores = findMissingPublicFinalScores(db, { now });
    for (const missing of missingFinalScores) {
      if (!missing.homeTeam || !missing.awayTeam || !missing.kickoffUtc) continue;
      const message = `Missing public final score after T+2h: ${missing.homeTeam} vs ${missing.awayTeam} ` +
        `(fixture ${missing.apiFootballId}, kickoff ${missing.kickoffUtc}). ` +
        'Add a verified public-source entry to data/public/final-scores.json.';
      console.warn(`[cadence] WARN ${message}`);
      console.warn(`::warning title=Missing public final score::${message}`);
    }
    const forceTokens = parseForceFixtureTokens(forceFixtureMatch);

    // 3. Get all scheduled/resolved fixtures
    const fixtures = db.prepare(`
      SELECT f.id,
             f.api_football_id,
             f.kickoff_utc,
             f.status,
             f.home_team_id AS homeTeamId,
             f.away_team_id AS awayTeamId,
             ht.name AS homeTeamRaw,
             at.name AS awayTeamRaw,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE f.status IN ('scheduled', 'resolved')
        AND f.is_tbd = 0
    `).all();

    const dueFixtures = [];

    for (const fixture of fixtures) {
      if (forceTokens.length > 0 && !fixtureMatchesTokens(fixture, forceTokens)) {
        continue;
      }

      // Check each article type for due passes
      for (const articleType of activeArticleTypes) {
        const article = db.prepare(`
          SELECT lifecycle_state FROM articles
          WHERE fixture_id = ? AND article_type = ?
        `).get(fixture.id, articleType);

        const lifecycleState = article?.lifecycle_state || null;
        const pass = forceTokens.length > 0 ? (forcePass || 'lock') : selectPass({ kickoffUtc: fixture.kickoff_utc, lifecycleState, now });

        if (pass) {
          dueFixtures.push({ fixture, articleType, pass });
        }
      }
    }

    console.log(`[cadence] ${dueFixtures.length} fixture×type combinations due for processing`);

    // 4. Process due fixtures: generate → advance state
    for (const { fixture, articleType, pass } of dueFixtures) {
      try {
        const hydration = await hydrateFixtureFromFootballData(db, {
          ...fixture,
          kickoffUtc: fixture.kickoff_utc,
        }, {
          apiKey: footballDataKey,
          pass,
        });
        if (hydration.skipped) {
          console.log(`[cadence] FootballData skipped for ${pass}: fixture ${fixture.api_football_id}`);
        } else {
          console.log(
            `[cadence] FootballData ${hydration.matched ? `matched ${hydration.providerFixtureId}` : 'not matched'}: ` +
            `fixture ${fixture.api_football_id}, odds=${hydration.odds}, teamStats=${hydration.teamStats}`,
          );
        }
        for (const warning of hydration.warnings || []) {
          console.warn(`[cadence] WARN ${warning}`);
        }

        // Generate
        const batchResult = await runBatch(db, [fixture.api_football_id], {
          endpoint,
          apiKey,
          deploymentName,
          activeArticleTypes: [articleType],
        });

        if (batchResult.succeeded > 0) {
          // Advance lifecycle state (publish happens as full-site rebuild below)
          const stateMap = { seed: 'seeded', refresh: 'refreshed', final_refresh: 'final_refreshed', lock: 'locked' };
          db.prepare(`
            UPDATE articles
            SET lifecycle_state = ?, last_pass = ?,
                last_refreshed_at = datetime('now'), updated_at = datetime('now')
            WHERE fixture_id = ? AND article_type = ?
          `).run(stateMap[pass], pass, fixture.id, articleType);

          console.log(`[cadence] ${pass} complete: fixture ${fixture.api_football_id} / ${articleType}`);
        }
      } catch (err) {
        console.error(`[cadence] ERROR processing fixture ${fixture.api_football_id} / ${articleType}: ${err.message}`);
        // Continue to next fixture — don't fail the whole run
      }
    }

    // 5. Full-site rebuild: all known fixtures plus generated/placeholder sections
    const allFixtures = db.prepare(`
      SELECT f.id AS fixtureId,
             f.match_number AS matchNumber,
             f.kickoff_utc AS kickoffUtc,
             f.venue,
             f.stage,
             f.status,
             f.final_home_score AS finalHomeScore,
             f.final_away_score AS finalAwayScore,
             f.final_score_source_name AS finalScoreSourceName,
             f.final_score_source_url AS finalScoreSourceUrl,
             CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_home_label, 'TBD') ELSE COALESCE(hln.name, ht.name) END AS homeTeam,
             CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_away_label, 'TBD') ELSE COALESCE(aln.name, at.name) END AS awayTeam,
             CASE WHEN f.is_tbd = 1 THEN NULL ELSE ht.fifa_code END AS homeTeamCode,
             CASE WHEN f.is_tbd = 1 THEN NULL ELSE at.fifa_code END AS awayTeamCode
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      ORDER BY f.kickoff_utc, f.match_number, f.id
    `).all();

    const allTeams = db.prepare(`
      SELECT COALESCE(ln.name, t.name) AS name,
             t.fifa_code AS code
      FROM teams t
      LEFT JOIN localized_names ln ON ln.entity_type = 'team' AND ln.entity_id = t.id AND ln.locale = 'es-MX'
      WHERE t.id != 0 AND t.fifa_code != 'TBD'
      ORDER BY COALESCE(ln.name, t.name)
    `).all();

    const allArticles = db.prepare(`
      SELECT a.fixture_id AS fixtureId,
             a.article_type AS articleType,
             a.status,
             a.lifecycle_state AS lifecycleState,
             a.last_pass AS lastPass,
             a.content_json,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam,
             ht.fifa_code AS homeTeamCode,
             at.fifa_code AS awayTeamCode
      FROM articles a
      JOIN fixtures f ON f.id = a.fixture_id
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE a.content_json IS NOT NULL
    `).all();

    if (allFixtures.length > 0) {
      const articles = allArticles.map(row => ({
        fixtureId: row.fixtureId,
        articleType: row.articleType,
        status: row.status,
        lifecycleState: row.lifecycleState,
        lastPass: row.lastPass,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        homeTeamCode: row.homeTeamCode,
        awayTeamCode: row.awayTeamCode,
        contentJson: JSON.parse(row.content_json),
      }));

      const slugs = buildSite({ fixtures: allFixtures, teams: allTeams, articles, siteBaseUrl, outputDir, affiliateUrls });
      console.log(`[cadence] Site built: ${slugs.length} match pages → ${outputDir}/`);
    } else {
      console.log('[cadence] No fixtures; skipping site build');
    }
  } finally {
    // 6. Close DB and upload (always, even if no work was done)
    if (db) closeDb(db);

    try {
      await uploadDb({
        connectionString: azureStorageConnectionString,
        containerName,
        blobName,
        localPath: dbPath,
        leaseId,
      });
    } finally {
      clearInterval(leaseRenewal);
    }

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
    deploymentName: process.env.AZURE_AI_DEPLOYMENT_ROBUST || process.env.AZURE_AI_DEPLOYMENT_CHEAP,
    footballDataKey: process.env.FOOTBALLDATA_KEY,
    activeArticleTypes: (process.env.ACTIVE_ARTICLE_TYPES || 'pronostico_momios').split(','),
    siteBaseUrl: process.env.SITE_BASE_URL || 'https://wc26quiniela.com',
    outputDir: process.env.OUTPUT_DIR || 'dist',
    affiliateUrls: {
      caliente: process.env.CALIENTE_AFFILIATE_URL || '',
      bet365: process.env.BET365_AFFILIATE_URL || '',
      skimlinks: process.env.SKIMLINKS_AFFILIATE_URL || '',
    },
    forceFixtureMatch: process.env.FORCE_FIXTURE_MATCH || '',
    forcePass: process.env.FORCE_PASS || '',
  };

  runCadence(config)
    .then(() => { console.log('[cadence] Run complete'); process.exit(0); })
    .catch((err) => { console.error(`[cadence] FATAL: ${err.message}`); process.exit(1); });
}

function parseForceFixtureTokens(value) {
  return String(value || '')
    .split(/[,|]/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function fixtureMatchesTokens(fixture, tokens) {
  const haystack = normalizeToken(`${fixture.homeTeam} ${fixture.awayTeam}`);
  return tokens.every((token) => haystack.includes(token));
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
