export const FOOTBALLDATA_BASE_URL = 'https://footballdata.io/api/v1';

export function footballDataHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function requestFootballData(path, apiKey) {
  const response = await fetch(`${FOOTBALLDATA_BASE_URL}${path}`, {
    headers: footballDataHeaders(apiKey),
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(`FootballData ${path} HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  }

  return data;
}

export async function resolveSeasonId({ apiKey, leagueId, season }) {
  const data = await requestFootballData(`/leagues/${leagueId}/seasons`, apiKey);
  const seasons = data.data?.seasons || [];
  const match = seasons.find((item) => item.year === season);

  if (!match) {
    throw new Error(`FootballData season ${season} not found for league ${leagueId}`);
  }

  return match.season_id;
}
