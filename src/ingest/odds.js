/**
 * FootballData.io odds client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" odds.js
 *
 * Fetches pre-match odds for a specific fixture.
 * Graceful degradation: returns empty array if no odds available.
 */

import { requestFootballData, requestFootballDataCached } from './footballData.js';

/**
 * @param {{ apiKey: string, fixtureId: number, db?: import('better-sqlite3').Database, internalFixtureId?: number, reason?: string, forceRefresh?: boolean }} params
 * @returns {Promise<Array<{ bookmaker: string, homeWin: number, draw: number, awayWin: number, rawJson: object }>>}
 */
export async function fetchOdds({ apiKey, fixtureId, db, internalFixtureId = null, reason = 'odds', forceRefresh = false }) {
  const path = `/matches/${fixtureId}/odds`;
  const response = db
    ? await requestFootballDataCached(db, {
      path,
      apiKey,
      reason,
      entityType: 'odds',
      entityRefId: internalFixtureId,
      ttlSeconds: 4 * 60 * 60,
      negativeTtlSeconds: 12 * 60 * 60,
      forceRefresh,
      isEmptyResponse: isEmptyOdds,
    })
    : { data: await requestFootballData(path, apiKey) };
  const data = response.data;
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

function isEmptyOdds(data) {
  const matchWinner = data.data?.odds?.match_winner || {};
  return !Number(matchWinner.home || 0) || !Number(matchWinner.draw || 0) || !Number(matchWinner.away || 0);
}
