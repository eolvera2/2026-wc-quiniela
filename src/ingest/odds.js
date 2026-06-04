/**
 * FootballData.io odds client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" odds.js
 *
 * Fetches pre-match odds for a specific fixture.
 * Graceful degradation: returns empty array if no odds available.
 */

import { requestFootballData } from './footballData.js';

/**
 * @param {{ apiKey: string, fixtureId: number }} params
 * @returns {Promise<Array<{ bookmaker: string, homeWin: number, draw: number, awayWin: number, rawJson: object }>>}
 */
export async function fetchOdds({ apiKey, fixtureId }) {
  const data = await requestFootballData(`/matches/${fixtureId}/odds`, apiKey);
  const odds = data.data?.odds || {};
  const matchWinner = odds.match_winner || {};

  const homeWin = Number(matchWinner.home || 0);
  const draw = Number(matchWinner.draw || 0);
  const awayWin = Number(matchWinner.away || 0);

  if (!homeWin || !draw || !awayWin) return [];

  return [{
    bookmaker: 'FootballData.io',
    homeWin,
    draw,
    awayWin,
    rawJson: odds,
  }];
}
