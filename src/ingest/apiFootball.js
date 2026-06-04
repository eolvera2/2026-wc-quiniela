export const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

export function apiFootballHeaders(apiKey) {
  return {
    'x-apisports-key': apiKey,
  };
}
