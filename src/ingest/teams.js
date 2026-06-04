/**
 * FootballData.io team statistics client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" teams.js
 */

import { requestFootballData, resolveSeasonId } from './footballData.js';

/**
 * @param {{ apiKey: string, teamId: number, leagueId: number, season: number }} params
 * @returns {Promise<{ teamApiId: number, form: string|null, goalsScored: number, goalsConceded: number, rawJson: object }>}
 */
export async function fetchTeamStats({ apiKey, teamId, leagueId, season }) {
  const seasonId = await resolveSeasonId({ apiKey, leagueId, season });
  const data = await requestFootballData(`/teams/${teamId}/stats?season_id=${seasonId}`, apiKey);
  const stats = data.data || {};
  const summary = stats.summary || {};

  return {
    teamApiId: stats.team?.team_id || teamId,
    form: stats.form?.overall || null,
    goalsScored: summary.goals_for || 0,
    goalsConceded: summary.goals_against || 0,
    rawJson: stats,
  };
}
