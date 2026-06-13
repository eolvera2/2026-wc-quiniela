import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_FINAL_SCORES_PATH = join(process.cwd(), 'data', 'public', 'final-scores.json');

export function applyPublicFinalScores(db, {
  now = new Date().toISOString(),
  finalScoresPath = DEFAULT_FINAL_SCORES_PATH,
  delayHours = 2,
} = {}) {
  if (!existsSync(finalScoresPath)) {
    return { applied: 0, skipped: 0 };
  }

  const entries = JSON.parse(readFileSync(finalScoresPath, 'utf-8'));
  let applied = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!Number.isInteger(entry.homeScore) || !Number.isInteger(entry.awayScore)) {
      throw new Error(`Invalid public final score entry: ${JSON.stringify(entry)}`);
    }
    if (!entry.sourceName || !entry.sourceUrl) {
      throw new Error(`Public final score requires sourceName and sourceUrl: ${JSON.stringify(entry)}`);
    }

    const fixture = findFixtureForFinalScore(db, entry);
    if (!fixture || !isPastFinalScoreWindow(fixture.kickoff_utc, now, delayHours)) {
      skipped += 1;
      continue;
    }

    function isPastFinalScoreWindow(kickoffUtc, now, delayHours) {
      return new Date(kickoffUtc).getTime() + delayHours * 60 * 60 * 1000 <= new Date(now).getTime();
    }

    const result = db.prepare(`
      UPDATE fixtures
      SET final_home_score = @homeScore,
          final_away_score = @awayScore,
          final_score_source_name = @sourceName,
          final_score_source_url = @sourceUrl,
          final_score_updated_at = datetime('now'),
          status = 'resolved',
          updated_at = datetime('now')
      WHERE id = @fixtureId
    `).run({
      fixtureId: fixture.id,
      homeScore: entry.homeScore,
      awayScore: entry.awayScore,
      sourceName: entry.sourceName,
      sourceUrl: entry.sourceUrl,
    });

    if ((result?.changes || 0) > 0) applied += result.changes;
    else skipped += 1;
  }

  return { applied, skipped };
}

function findFixtureForFinalScore(db, entry) {
  if (Number.isInteger(entry.matchNumber)) {
    const byNumber = db.prepare('SELECT id, kickoff_utc FROM fixtures WHERE match_number = ?').get(entry.matchNumber);
    if (byNumber) return byNumber;
  }

  if (!entry.homeTeam || !entry.awayTeam) {
    throw new Error(`Public final score requires matchNumber or homeTeam/awayTeam: ${JSON.stringify(entry)}`);
  }

  const rows = db.prepare(`
    SELECT f.id, f.kickoff_utc, h.name AS homeTeam, a.name AS awayTeam
    FROM fixtures f
    JOIN teams h ON h.id = f.home_team_id
    JOIN teams a ON a.id = f.away_team_id
    ORDER BY f.kickoff_utc
  `).all();

  const home = canonicalTeamName(entry.homeTeam);
  const away = canonicalTeamName(entry.awayTeam);
  return rows.find((row) =>
    canonicalTeamName(row.homeTeam) === home
    && canonicalTeamName(row.awayTeam) === away
    && (!entry.kickoffLocalDate || localDateKey(row.kickoff_utc) === entry.kickoffLocalDate)
  ) || null;
}

function canonicalTeamName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bnational team\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function localDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Mexico_City',
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
