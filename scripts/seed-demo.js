/**
 * seed-demo.js
 *
 * Generates a local demo `dist/` from static World Cup 2026 data only.
 * No FootballData.io or Azure API calls are made.
 *
 *   node scripts/seed-demo.js
 */

import { openDb, closeDb } from '../src/db/db.js';
import { buildSite } from '../src/publish/staticSite.js';
import { seedStaticData } from './seed-static.js';
import { rmSync } from 'node:fs';

const db = openDb(':memory:');
const outputDir = 'dist';

try {
  const seedResult = seedStaticData(db);
  const fixtures = db.prepare(`
    SELECT f.id AS fixtureId,
           f.match_number AS matchNumber,
           f.kickoff_utc AS kickoffUtc,
           f.venue,
           f.stage,
           f.status,
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

  const teams = db.prepare(`
    SELECT COALESCE(ln.name, t.name) AS name,
           t.fifa_code AS code
    FROM teams t
    LEFT JOIN localized_names ln ON ln.entity_type = 'team' AND ln.entity_id = t.id AND ln.locale = 'es-MX'
    WHERE t.id != 0 AND t.fifa_code != 'TBD'
    ORDER BY COALESCE(ln.name, t.name)
  `).all();

  rmSync(outputDir, { recursive: true, force: true });

  const slugs = buildSite({
    fixtures,
    teams,
    articles: [],
    siteBaseUrl: 'https://wc26quiniela.example.com',
    outputDir,
    affiliateUrls: {
      caliente: '',
      bet365: '',
      skimlinks: '',
    },
  });

  console.log(`\n✓ Static demo seed: ${seedResult.fixtures} fixtures, ${seedResult.teams} teams`);
  console.log(`✓ Demo site built — ${slugs.length + 1} HTML pages plus sitemap written to dist/\n`);
  console.log('Preview options:');
  console.log('  npx swa start dist');
  console.log('  start dist\\index.html  (Windows)\n');
} finally {
  closeDb(db);
}
