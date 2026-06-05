/**
 * FootballData.io team statistics client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" teams.js
 */

import { requestFootballData, requestFootballDataCached, resolveSeasonId } from './footballData.js';

/**
 * @param {{ apiKey: string, teamId: number, leagueId: number, season: number, db?: import('better-sqlite3').Database, internalTeamId?: number, reason?: string, forceRefresh?: boolean }} params
 * @returns {Promise<{ teamApiId: number, form: string|null, goalsScored: number, goalsConceded: number, rawJson: object }>}
 */
export async function fetchTeamStats({ apiKey, teamId, leagueId, season, db, internalTeamId = null, reason = 'team_stats', forceRefresh = false }) {
  const seasonId = await resolveSeasonId({ apiKey, leagueId, season });
  const path = `/teams/${teamId}/stats?season_id=${seasonId}`;
  const response = db
    ? await requestFootballDataCached(db, {
      path,
      apiKey,
      reason,
      entityType: 'team_stats',
      entityRefId: internalTeamId,
      ttlSeconds: 72 * 60 * 60,
      negativeTtlSeconds: 24 * 60 * 60,
      forceRefresh,
      isEmptyResponse: isEmptyTeamStats,
    })
    : { data: await requestFootballData(path, apiKey) };
  const data = response.data;
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

function isEmptyTeamStats(data) {
  const stats = data.data || {};
  const summary = stats.summary || {};
  return !stats.form?.overall && summary.goals_for == null && summary.goals_against == null;
}
