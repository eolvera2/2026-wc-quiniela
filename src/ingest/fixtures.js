/**
 * FootballData.io fixtures client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" fixtures.js
 *
 * Fetches WC2026 fixtures from FootballData.io and normalizes
 * them into our internal schema shape.
 */

import { requestFootballData, resolveSeasonId } from './footballData.js';

// Provider status codes -> our internal status
const STATUS_MAP = {
  NS: 'scheduled',   // Not Started
  TBD: 'scheduled',  // Time To Be Defined
  '1H': 'scheduled', // in progress, treat as scheduled for our purposes
  HT: 'scheduled',
  '2H': 'scheduled',
  ET: 'scheduled',
  P: 'scheduled',
  FT: 'resolved',    // Full Time
  AET: 'resolved',   // After Extra Time
  PEN: 'resolved',   // Penalties
  PST: 'scheduled',  // Postponed
  CANC: 'scheduled', // Cancelled (treat as scheduled, will be filtered later)
  ABD: 'scheduled',  // Abandoned
  AWD: 'resolved',   // Awarded
  WO: 'resolved',    // Walkover
};

// Rounds containing these keywords are knockout stage
const KNOCKOUT_KEYWORDS = ['quarter', 'semi', 'final', 'round of', 'knockout', '16', '8'];

/**
 * @param {{ apiKey: string, leagueId: number, season: number }} params
 * @returns {Promise<Array<{
 *   apiFootballId: number,
 *   homeTeam: { apiFootballId: number, name: string, logoUrl: string|null },
 *   awayTeam: { apiFootballId: number, name: string, logoUrl: string|null },
 *   kickoffUtc: string,
 *   round: string,
 *   stage: 'group'|'knockout',
 *   status: 'scheduled'|'resolved',
 *   venue: string|null,
 * }>>}
 */
export async function fetchFixtures({ apiKey, leagueId, season }) {
  const seasonId = await resolveSeasonId({ apiKey, leagueId, season });
  const matches = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await requestFootballData(`/leagues/${leagueId}/matches?season_id=${seasonId}&page=${page}&limit=50`, apiKey);
    matches.push(...(data.data?.matches || []));
    totalPages = data.meta?.pagination?.total_pages || data.meta?.total_pages || 1;
    page += 1;
  } while (page <= totalPages);

  return matches.map((item) => {
    const round = item.round?.name || `Game Week ${item.game_week || ''}`.trim();
    const status = mapStatus(item.status);

    return {
      apiFootballId: item.match_id,
      homeTeam: {
        apiFootballId: item.home_team.team_id,
        name: cleanTeamName(item.home_team.team_name),
        logoUrl: item.home_team.team_logo || null,
      },
      awayTeam: {
        apiFootballId: item.away_team.team_id,
        name: cleanTeamName(item.away_team.team_name),
        logoUrl: item.away_team.team_logo || null,
      },
      kickoffUtc: toIsoUtc(item.match_date),
      round,
      stage: isKnockout(round, item.game_week) ? 'knockout' : 'group',
      status,
      venue: item.venue?.name || item.venue?.stadium_name || null,
    };
  });
}

function isKnockout(round, gameWeek) {
  const lower = round.toLowerCase();
  return KNOCKOUT_KEYWORDS.some((kw) => lower.includes(kw)) || Number(gameWeek) > 3;
}

function mapStatus(status) {
  return ['complete', 'finished', 'resolved'].includes(String(status).toLowerCase())
    ? 'resolved'
    : 'scheduled';
}

function cleanTeamName(name) {
  return String(name || '').replace(/\s+National Team$/i, '');
}

function toIsoUtc(value) {
  return new Date(`${value} UTC`).toISOString();
}
