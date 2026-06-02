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
