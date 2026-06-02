/**
 * API-Football team statistics client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" teams.js
 */

const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v3`;

/**
 * @param {{ apiKey: string, teamId: number, leagueId: number, season: number }} params
 * @returns {Promise<{ teamApiId: number, form: string|null, goalsScored: number, goalsConceded: number, rawJson: object }>}
 */
export async function fetchTeamStats({ apiKey, teamId, leagueId, season }) {
  const url = `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football teams/statistics HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const stats = data.response || {};

  return {
    teamApiId: stats.team?.id || teamId,
    form: stats.form || null,
    goalsScored: stats.goals?.for?.total?.total || 0,
    goalsConceded: stats.goals?.against?.total?.total || 0,
    rawJson: stats,
  };
}
