/**
 * API-Football fixtures client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" fixtures.js
 *
 * Fetches WC2026 fixtures from API-Football direct/API-Sports and normalizes
 * them into our internal schema shape.
 */

import { API_FOOTBALL_BASE_URL, apiFootballHeaders } from './apiFootball.js';

// API-Football status codes → our internal status
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
  const url = `${API_FOOTBALL_BASE_URL}/fixtures?league=${leagueId}&season=${season}`;

  const response = await fetch(url, {
    headers: apiFootballHeaders(apiKey),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football fixtures HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const fixtures = data.response || [];

  return fixtures.map((item) => {
    const round = item.league?.round || '';
    const statusShort = item.fixture?.status?.short || 'NS';

    return {
      apiFootballId: item.fixture.id,
      homeTeam: {
        apiFootballId: item.teams.home.id,
        name: item.teams.home.name,
        logoUrl: item.teams.home.logo || null,
      },
      awayTeam: {
        apiFootballId: item.teams.away.id,
        name: item.teams.away.name,
        logoUrl: item.teams.away.logo || null,
      },
      kickoffUtc: item.fixture.date,
      round,
      stage: isKnockout(round) ? 'knockout' : 'group',
      status: STATUS_MAP[statusShort] || 'scheduled',
      venue: item.fixture.venue?.name || null,
    };
  });
}

function isKnockout(round) {
  const lower = round.toLowerCase();
  return KNOCKOUT_KEYWORDS.some((kw) => lower.includes(kw));
}
