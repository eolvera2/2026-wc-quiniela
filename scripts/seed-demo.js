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
           CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_home_label, 'TBD') ELSE ht.name END AS homeTeam,
           CASE WHEN f.is_tbd = 1 THEN COALESCE(f.tbd_away_label, 'TBD') ELSE at.name END AS awayTeam
    FROM fixtures f
    JOIN teams ht ON ht.id = f.home_team_id
    JOIN teams at ON at.id = f.away_team_id
    ORDER BY f.kickoff_utc, f.match_number, f.id
  `).all();

  rmSync(outputDir, { recursive: true, force: true });

  const slugs = buildSite({
    fixtures,
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
