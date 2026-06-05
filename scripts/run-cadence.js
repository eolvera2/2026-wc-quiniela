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

import { downloadDb, uploadDb } from '../src/storage/blob.js';
import { openDb, closeDb } from '../src/db/db.js';
import { selectPass } from '../src/cadence/selectPass.js';
import { runBatch } from '../src/generate/batch.js';
import { buildSite } from '../src/publish/staticSite.js';

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
    siteBaseUrl,
    outputDir = 'dist',
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

    // 4. Process due fixtures: generate → advance state
    for (const { fixture, articleType, pass } of dueFixtures) {
      try {
        // Generate
        const batchResult = await runBatch(db, [fixture.api_football_id], {
          endpoint,
          apiKey,
          activeArticleTypes: [articleType],
        });

        if (batchResult.succeeded > 0) {
          // Advance lifecycle state (publish happens as full-site rebuild below)
          const stateMap = { seed: 'seeded', refresh: 'refreshed', lock: 'locked' };
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
             CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_home_label, 'TBD') ELSE ht.name END AS homeTeam,
             CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_away_label, 'TBD') ELSE at.name END AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      ORDER BY f.kickoff_utc, f.match_number, f.id
    `).all();

    const allArticles = db.prepare(`
      SELECT a.fixture_id AS fixtureId,
             a.article_type AS articleType,
             a.content_json,
             ht.name AS homeTeam,
             at.name AS awayTeam
      FROM articles a
      JOIN fixtures f ON f.id = a.fixture_id
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      WHERE a.content_json IS NOT NULL
    `).all();

    if (allFixtures.length > 0) {
      const articles = allArticles.map(row => ({
        fixtureId: row.fixtureId,
        articleType: row.articleType,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        contentJson: JSON.parse(row.content_json),
      }));

      const slugs = buildSite({ fixtures: allFixtures, articles, siteBaseUrl, outputDir, affiliateUrls });
      console.log(`[cadence] Site built: ${slugs.length} match pages → ${outputDir}/`);
    } else {
      console.log('[cadence] No fixtures; skipping site build');
    }
  } finally {
    // 6. Close DB and upload (always, even if no work was done)
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
    siteBaseUrl: process.env.SITE_BASE_URL || 'https://wc26quiniela.com',
    outputDir: process.env.OUTPUT_DIR || 'dist',
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
