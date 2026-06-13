import {
  FOOTBALLDATA_WORLD_CUP_LEAGUE_ID,
  FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID,
  FOOTBALLDATA_SOURCE_SLUG,
} from './footballData.js';
import { fetchFixtures } from './fixtures.js';
import { fetchOdds } from './odds.js';
import { fetchTeamStats } from './teams.js';

const TEAM_ALIASES = new Map([
  ['mexico', 'mexico'],
  ['corea del sur', 'south korea'],
  ['south korea', 'south korea'],
  ['chequia', 'czech republic'],
  ['czech republic', 'czech republic'],
  ['bosnia y herzegovina', 'bosnia and herzegovina'],
  ['bosnia herzegovina', 'bosnia and herzegovina'],
  ['bosnia and herzegovina', 'bosnia and herzegovina'],
  ['estados unidos', 'usa'],
  ['united states', 'usa'],
  ['usmnt', 'usa'],
  ['usa', 'usa'],
  ['paraguay', 'paraguay'],
  ['south africa', 'south africa'],
  ['sudafrica', 'south africa'],
]);

let providerFixturesPromise = null;

export async function hydrateFixtureFromFootballData(db, fixture, {
  apiKey,
  pass,
} = {}) {
  if (pass === 'seed') {
    return {
      matched: false,
      providerFixtureId: null,
      odds: 0,
      teamStats: 0,
      warnings: [],
      skipped: true,
    };
  }

  if (!apiKey) {
    throw new Error('FOOTBALLDATA_KEY is required to hydrate fixture data');
  }

  const warnings = [];
  const providerFixture = await resolveProviderFixture(db, fixture, apiKey);
  if (!providerFixture) {
    return {
      matched: false,
      odds: 0,
      teamStats: 0,
      warnings: [`No FootballData fixture match found for ${fixture.homeTeam} vs ${fixture.awayTeam}`],
    };
  }

  upsertProviderFixtureMapping(db, fixture.id, providerFixture);
  syncProviderFixtureFields(db, fixture.id, providerFixture);

  if (pass === 'lock') {
    return {
      matched: true,
      providerFixtureId: providerFixture.apiFootballId,
      odds: 0,
      teamStats: 0,
      warnings,
    };
  }

  let oddsCount = 0;
  try {
    const odds = await fetchOdds({
      apiKey,
      fixtureId: providerFixture.apiFootballId,
      db,
      internalFixtureId: fixture.id,
      reason: `cadence_${pass}`,
      forceRefresh: pass === 'lock',
    });
    oddsCount = upsertOdds(db, fixture.id, odds);
  } catch (err) {
    warnings.push(`FootballData odds refresh failed for fixture ${providerFixture.apiFootballId}: ${err.message}`);
  }

  let teamStatsCount = 0;
  for (const team of [
    { internalId: fixture.homeTeamId, provider: providerFixture.homeTeam },
    { internalId: fixture.awayTeamId, provider: providerFixture.awayTeam },
  ]) {
    try {
      const stats = await fetchTeamStats({
        apiKey,
        teamId: team.provider.apiFootballId,
        leagueId: FOOTBALLDATA_WORLD_CUP_LEAGUE_ID,
        season: 2026,
        db,
        internalTeamId: team.internalId,
        reason: `cadence_${pass}`,
        forceRefresh: false,
      });
      upsertTeamStats(db, team.internalId, stats);
      teamStatsCount += 1;
    } catch (err) {
      warnings.push(`FootballData team stats refresh failed for team ${team.provider.name}: ${err.message}`);
    }
  }

  return {
    matched: true,
    providerFixtureId: providerFixture.apiFootballId,
    odds: oddsCount,
    teamStats: teamStatsCount,
    warnings,
  };
}

async function resolveProviderFixture(db, fixture, apiKey) {
  const mapped = db.prepare(`
    SELECT provider_id, extra_json
    FROM provider_id_mappings
    WHERE source_id = (SELECT id FROM sources WHERE slug = ?)
      AND entity_type = 'fixture'
      AND internal_id = ?
  `).get(FOOTBALLDATA_SOURCE_SLUG, fixture.id);

  if (mapped?.extra_json) {
    return JSON.parse(mapped.extra_json);
  }

  const providerFixtures = await getProviderFixtures(apiKey, db);
  return findMatchingProviderFixture(fixture, providerFixtures);
}

async function getProviderFixtures(apiKey, db) {
  if (!providerFixturesPromise) {
    providerFixturesPromise = fetchFixtures({
      apiKey,
      db,
      leagueId: FOOTBALLDATA_WORLD_CUP_LEAGUE_ID,
      season: 2026,
      ttlSeconds: 24 * 60 * 60,
      reason: 'fixture_mapping',
    });
  }
  return providerFixturesPromise;
}

function findMatchingProviderFixture(fixture, providerFixtures) {
  const homeNames = candidateTeamNames(fixture.homeTeam, fixture.homeTeamRaw);
  const awayNames = candidateTeamNames(fixture.awayTeam, fixture.awayTeamRaw);
  const kickoffMs = new Date(fixture.kickoffUtc).getTime();
  const toleranceMs = 12 * 60 * 60 * 1000;

  return providerFixtures.find((candidate) => {
    const candidateHome = canonicalTeamName(candidate.homeTeam.name);
    const candidateAway = canonicalTeamName(candidate.awayTeam.name);
    const candidateKickoffMs = new Date(candidate.kickoffUtc).getTime();
    const sameTeams = homeNames.includes(candidateHome) && awayNames.includes(candidateAway);
    const closeKickoff = Math.abs(candidateKickoffMs - kickoffMs) <= toleranceMs;
    return sameTeams && closeKickoff;
  }) || null;
}

function candidateTeamNames(...values) {
  return [...new Set(values.map((value) => canonicalTeamName(value)).filter(Boolean))];
}

function canonicalTeamName(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bnational team\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return TEAM_ALIASES.get(normalized) || normalized;
}

function upsertProviderFixtureMapping(db, internalFixtureId, providerFixture) {
  db.prepare(`
    INSERT INTO provider_id_mappings (source_id, entity_type, internal_id, provider_id, extra_json, updated_at)
    VALUES ((SELECT id FROM sources WHERE slug = @sourceSlug), 'fixture', @internalFixtureId, @providerId, @extraJson, datetime('now'))
    ON CONFLICT(source_id, entity_type, provider_id) DO UPDATE SET
      internal_id = excluded.internal_id,
      extra_json = excluded.extra_json,
      updated_at = datetime('now')
  `).run({
    sourceSlug: FOOTBALLDATA_SOURCE_SLUG,
    internalFixtureId,
    providerId: String(providerFixture.apiFootballId),
    extraJson: JSON.stringify(providerFixture),
  });
}

function syncProviderFixtureFields(db, internalFixtureId, providerFixture) {
  db.prepare(`
    UPDATE fixtures
    SET kickoff_utc = @kickoffUtc,
        status = @status,
        venue = COALESCE(@venue, venue),
        updated_at = datetime('now')
    WHERE id = @internalFixtureId
  `).run({
    internalFixtureId,
    kickoffUtc: providerFixture.kickoffUtc,
    status: providerFixture.status,
    venue: providerFixture.venue,
  });
}

function upsertOdds(db, fixtureId, oddsRows) {
  const stmt = db.prepare(`
    INSERT INTO odds (fixture_id, bookmaker, home_win, draw, away_win, data_json, updated_at)
    VALUES (@fixtureId, @bookmaker, @homeWin, @draw, @awayWin, @dataJson, datetime('now'))
    ON CONFLICT(fixture_id, bookmaker) DO UPDATE SET
      home_win = excluded.home_win,
      draw = excluded.draw,
      away_win = excluded.away_win,
      data_json = excluded.data_json,
      updated_at = datetime('now')
  `);

  for (const row of oddsRows) {
    stmt.run({
      fixtureId,
      bookmaker: row.bookmaker,
      homeWin: row.homeWin,
      draw: row.draw,
      awayWin: row.awayWin,
      dataJson: JSON.stringify(row.rawJson),
    });
  }
  return oddsRows.length;
}

function upsertTeamStats(db, teamId, stats) {
  db.prepare(`
    INSERT INTO team_stats (team_id, season, form, goals_scored, goals_conceded, data_json, updated_at)
    VALUES (@teamId, @season, @form, @goalsScored, @goalsConceded, @dataJson, datetime('now'))
    ON CONFLICT(team_id, season) DO UPDATE SET
      form = excluded.form,
      goals_scored = excluded.goals_scored,
      goals_conceded = excluded.goals_conceded,
      data_json = excluded.data_json,
      updated_at = datetime('now')
  `).run({
    teamId,
    season: String(FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID),
    form: stats.form,
    goalsScored: stats.goalsScored,
    goalsConceded: stats.goalsConceded,
    dataJson: JSON.stringify(stats.rawJson),
  });
}
