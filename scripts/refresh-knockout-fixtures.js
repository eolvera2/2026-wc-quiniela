#!/usr/bin/env node
import { downloadDb, renewDbLease, uploadDb } from '../src/storage/blob.js';
import { closeDb, openDb } from '../src/db/db.js';
import { refreshKnockoutFixtures } from '../src/ingest/knockoutFixtures.js';
import { buildSite } from '../src/publish/staticSite.js';
import { seedStaticData } from './seed-static.js';

export async function runKnockoutFixtureRefresh(config) {
  const {
    azureStorageConnectionString,
    containerName = 'wc26',
    blobName = 'wc26.sqlite',
    dbPath,
    siteBaseUrl,
    outputDir = 'dist',
    affiliateUrls,
  } = config;

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
      console.warn(`[knockout-refresh] WARN DB lease renewal failed: ${err.message}`);
    });
  }, 30_000);
  leaseRenewal.unref?.();

  let db;
  try {
    db = openDb(dbPath);
    const seedResult = seedStaticData(db);
    console.log(`[knockout-refresh] Static seed ready: ${seedResult.fixtures} fixtures, ${seedResult.teams} teams`);

    const refreshResult = await refreshKnockoutFixtures(db);
    console.log(`[knockout-refresh] Scanned=${refreshResult.scanned}, applied=${refreshResult.applied}`);
    for (const assignment of refreshResult.assignments) {
      console.log(`[knockout-refresh] Match ${assignment.matchNumber}: ${assignment.homeTeam} vs ${assignment.awayTeam} (${assignment.sourceName})`);
    }
    for (const warning of refreshResult.warnings) {
      console.warn(`[knockout-refresh] WARN ${warning}`);
      console.warn(`::warning title=Knockout fixture refresh::${warning}`);
    }

    const { fixtures, teams, articles } = readSiteBuildData(db);
    const slugs = buildSite({ fixtures, teams, articles, siteBaseUrl, outputDir, affiliateUrls });
    console.log(`[knockout-refresh] Site built: ${slugs.length} match pages -> ${outputDir}/`);
  } finally {
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
    console.log('[knockout-refresh] DB uploaded, lease released');
  }
}

function readSiteBuildData(db) {
  const fixtures = db.prepare(`
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
           o.home_win AS homeOdds,
           o.draw AS drawOdds,
           o.away_win AS awayOdds,
           CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_home_label, 'TBD') ELSE COALESCE(hln.name, ht.name) END AS homeTeam,
           CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_away_label, 'TBD') ELSE COALESCE(aln.name, at.name) END AS awayTeam,
           CASE WHEN f.is_tbd = 1 THEN NULL ELSE ht.fifa_code END AS homeTeamCode,
           CASE WHEN f.is_tbd = 1 THEN NULL ELSE at.fifa_code END AS awayTeamCode
    FROM fixtures f
    JOIN teams ht ON ht.id = f.home_team_id
    JOIN teams at ON at.id = f.away_team_id
    LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
    LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
    LEFT JOIN odds o ON o.fixture_id = f.id
    ORDER BY f.kickoff_utc, f.match_number, f.id
  `).all();

  const teams = db.prepare(`
    SELECT COALESCE(ln.name, t.name) AS name,
           t.fifa_code AS code
    FROM teams t
    LEFT JOIN localized_names ln ON ln.entity_type = 'team' AND ln.entity_id = t.id AND ln.locale = 'es-MX'
    WHERE t.id != 0 AND t.fifa_code != 'TBD'
    ORDER BY COALESCE(ln.name, t.name)
  `).all();

  const articles = db.prepare(`
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
  `).all().map((row) => ({
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

  return { fixtures, teams, articles };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runKnockoutFixtureRefresh({
    azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.BLOB_CONTAINER || 'wc26',
    blobName: process.env.BLOB_NAME || 'wc26.sqlite',
    dbPath: process.env.DB_PATH || '/tmp/wc26.sqlite',
    siteBaseUrl: process.env.SITE_BASE_URL || 'https://predictagol.com',
    outputDir: process.env.OUTPUT_DIR || 'dist',
    affiliateUrls: {
      caliente: process.env.CALIENTE_AFFILIATE_URL || '',
      bet365: process.env.BET365_AFFILIATE_URL || '',
      skimlinks: process.env.SKIMLINKS_AFFILIATE_URL || '',
    },
  })
    .then(() => { console.log('[knockout-refresh] Run complete'); process.exit(0); })
    .catch((err) => { console.error(`[knockout-refresh] FATAL: ${err.message}`); process.exit(1); });
}
