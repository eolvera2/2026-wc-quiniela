/**
 * API-Football odds client.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" odds.js
 *
 * Fetches pre-match odds for a specific fixture.
 * Graceful degradation: returns empty array if no odds available.
 */

import { API_FOOTBALL_BASE_URL, apiFootballHeaders } from './apiFootball.js';

/**
 * @param {{ apiKey: string, fixtureId: number }} params
 * @returns {Promise<Array<{ bookmaker: string, homeWin: number, draw: number, awayWin: number, rawJson: object }>>}
 */
export async function fetchOdds({ apiKey, fixtureId }) {
  const url = `${API_FOOTBALL_BASE_URL}/odds?fixture=${fixtureId}`;

  const response = await fetch(url, {
    headers: apiFootballHeaders(apiKey),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football odds HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const responseItems = data.response || [];

  if (responseItems.length === 0) return [];

  const results = [];
  const bookmakers = responseItems[0].bookmakers || [];

  for (const bm of bookmakers) {
    const matchWinner = bm.bets?.find((b) => b.name === 'Match Winner');
    if (!matchWinner) continue;

    const values = matchWinner.values || [];
    const home = values.find((v) => v.value === 'Home');
    const draw = values.find((v) => v.value === 'Draw');
    const away = values.find((v) => v.value === 'Away');

    if (!home || !draw || !away) continue;

    results.push({
      bookmaker: bm.name,
      homeWin: parseFloat(home.odd),
      draw: parseFloat(draw.odd),
      awayWin: parseFloat(away.odd),
      rawJson: matchWinner,
    });
  }

  return results;
}
