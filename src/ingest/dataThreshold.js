/**
 * Data availability threshold check.
 * Reference: docs/plan.md risk T2-4 — graceful degradation.
 *
 * Checks whether enough data exists for a fixture to proceed with generation.
 * The seed pass has lower requirements than refresh/lock (per cadence model:
 * T-10 seed uses H2H+form, T-2 refresh enriches with lineups/odds).
 *
 * Returns { ready: boolean, reason?: string, warnings: string[] }
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} fixtureApiId
 * @param {'seed'|'refresh'|'lock'} pass
 * @returns {{ ready: boolean, reason?: string, warnings: string[] }}
 */
export function checkDataAvailability(db, fixtureApiId, pass) {
  const warnings = [];

  // Check fixture exists
  const fixture = db.prepare(`
    SELECT f.id, f.home_team_id, f.away_team_id
    FROM fixtures f
    WHERE f.api_football_id = ?
  `).get(fixtureApiId);

  if (!fixture) {
    return { ready: false, reason: `Fixture ${fixtureApiId} not found in database`, warnings };
  }

  // Check both teams exist (required for all passes)
  const homeTeam = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(fixture.home_team_id);
  const awayTeam = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(fixture.away_team_id);

  if (!homeTeam || !awayTeam) {
    return { ready: false, reason: 'One or both teams missing from database', warnings };
  }

  // Check optional data and collect warnings
  const h2h = db.prepare('SELECT id FROM head_to_head WHERE home_team_id = ? AND away_team_id = ?')
    .get(fixture.home_team_id, fixture.away_team_id);
  if (!h2h) warnings.push('No H2H data available');

  const homeStats = db.prepare('SELECT id FROM team_stats WHERE team_id = ?').get(fixture.home_team_id);
  if (!homeStats) warnings.push(`No team stats for ${homeTeam.name}`);

  const awayStats = db.prepare('SELECT id FROM team_stats WHERE team_id = ?').get(fixture.away_team_id);
  if (!awayStats) warnings.push(`No team stats for ${awayTeam.name}`);

  const odds = db.prepare('SELECT id FROM odds WHERE fixture_id = ?').get(fixture.id);
  if (!odds) warnings.push('No odds data');

  // For seed pass: teams existing is enough (graceful degradation)
  // For refresh/lock: still proceed but warn (per plan: "graceful degradation")
  return { ready: true, warnings };
}
