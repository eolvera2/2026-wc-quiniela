import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, openDb } from '../src/db/db.js';
import { WORLD_CUP_TEAMS } from '../src/data/worldCupTeams.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const STATIC_DIR = join(ROOT_DIR, 'data', 'static', 'openfootball');
const DEFAULT_DB_PATH = join(ROOT_DIR, 'data', 'wc26.sqlite');

const MONTHS = {
  Jan: 0, January: 0,
  Feb: 1, February: 1,
  Mar: 2, March: 2,
  Apr: 3, April: 3,
  May: 4,
  Jun: 5, June: 5,
  Jul: 6, July: 6,
};

const TEAM_META = Object.fromEntries(WORLD_CUP_TEAMS.map((team) => [
  team.seedName,
  {
    code: team.code,
    es: team.displayName,
    confederation: team.confederation,
    fifaName: team.fifaName,
  },
]));

export function parseOpenFootball({ cupText, finalsText, stadiumsCsv }) {
  const groups = parseGroups(cupText);
  const stadiums = parseStadiums(stadiumsCsv);
  const fixtures = [
    ...parseFixtures(cupText, { stage: 'group' }),
    ...parseFixtures(finalsText, { stage: 'knockout' }),
  ];

  return { groups, stadiums, teams: teamsFromGroups(groups), fixtures };
}

export function seedStaticData(db, {
  cupText = readFileSync(join(STATIC_DIR, 'cup.txt'), 'utf8'),
  finalsText = readFileSync(join(STATIC_DIR, 'cup_finals.txt'), 'utf8'),
  stadiumsCsv = readFileSync(join(STATIC_DIR, 'cup_stadiums.csv'), 'utf8'),
} = {}) {
  const data = parseOpenFootball({ cupText, finalsText, stadiumsCsv });

  const tx = db.transaction(() => {
    ensureTbdTeam(db);
    upsertStadiums(db, data.stadiums);
    upsertTeams(db, data.teams);
    upsertFixtures(db, data.fixtures);
  });

  tx();
  return {
    groups: data.groups.length,
    stadiums: data.stadiums.length,
    teams: data.teams.length,
    fixtures: data.fixtures.length,
  };
}

function parseGroups(text) {
  return text.split(/\r?\n/)
    .map((line) => line.match(/^Group ([A-L])\s+\|\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      groupCode: match[1],
      teams: match[2].trim().split(/\s{2,}/).map((team) => team.trim()),
    }));
}

function teamsFromGroups(groups) {
  return groups.flatMap((group) => group.teams.map((name) => {
    const meta = TEAM_META[name] || { code: codeFromName(name), es: name, confederation: null };
    return {
      name,
      fifaName: meta.fifaName || name,
      code: meta.code,
      esName: meta.es,
      confederation: meta.confederation,
      groupCode: group.groupCode,
    };
  }));
}

function parseStadiums(csv) {
  return csv.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('city,'))
    .map((line) => {
      const [city, timezone, countryCode, name, capacity, wikipedia, wikidata, coords] = line.split(',').map((part) => part.trim());
      return {
        slug: slugify(name),
        city,
        timezone,
        countryCode: countryCode.toUpperCase(),
        name,
        tournamentName: tournamentNameForCity(city),
        capacity: Number(capacity) || null,
        wikipedia,
        wikidata,
        coords,
      };
    });
}

function parseFixtures(text, { stage }) {
  const fixtures = [];
  let currentGroupCode = null;
  let currentRound = null;
  let currentDate = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const group = line.match(/^▪ Group ([A-L])$/);
    if (group) {
      currentGroupCode = group[1];
      currentRound = `Group ${group[1]}`;
      continue;
    }

    const round = line.match(/^▪ (Round of 32|Round of 16|Quarter-final|Semi-final|Match for third place|Final)\s*$/);
    if (round) {
      currentGroupCode = null;
      currentRound = round[1];
      continue;
    }

    const date = line.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]+)\s+(\d{1,2})\s*$/);
    if (date) {
      currentDate = { month: date[1], day: Number(date[2]) };
      continue;
    }

    const fixture = line.match(/^\s*(?:\((\d+)\)\s*)?(\d{1,2}):(\d{2})\s+UTC([+-]\d+)\s+(.+?)\s+v\s+(.+?)\s+@\s+(.+?)\s*$/);
    if (fixture && currentDate) {
      const [, matchNumber, hour, minute, offset, home, away, city] = fixture;
      const kickoffUtc = toUtcIso({
        month: currentDate.month,
        day: currentDate.day,
        hour: Number(hour),
        minute: Number(minute),
        offset: Number(offset),
      });

      fixtures.push({
        matchNumber: matchNumber ? Number(matchNumber) : null,
        home,
        away,
        kickoffUtc,
        round: currentRound,
        stage,
        groupCode: currentGroupCode,
        stadiumSlug: null,
        city,
        isTbd: stage === 'knockout',
      });
    }
  }

  return fixtures;
}

function upsertStadiums(db, stadiums) {
  const stmt = db.prepare(`
    INSERT INTO stadiums (
      slug, official_name, tournament_name, city, country_code, timezone,
      capacity, wikidata_id, source_id, updated_at
    )
    VALUES (
      @slug, @name, @tournamentName, @city, @countryCode, @timezone,
      @capacity, @wikidata, 1, datetime('now')
    )
    ON CONFLICT(slug) DO UPDATE SET
      official_name = excluded.official_name,
      tournament_name = excluded.tournament_name,
      city = excluded.city,
      country_code = excluded.country_code,
      timezone = excluded.timezone,
      capacity = excluded.capacity,
      wikidata_id = excluded.wikidata_id,
      updated_at = datetime('now')
  `);

  for (const stadium of stadiums) {
    stmt.run(stadium);
  }
}

function upsertTeams(db, teams) {
  const stmt = db.prepare(`
    INSERT INTO teams (api_football_id, name, code, fifa_code, confederation, group_id, static_source_id)
    VALUES (@apiFootballId, @name, @code, @code, @confederation, (SELECT id FROM wc_groups WHERE group_code = @groupCode), 1)
    ON CONFLICT(api_football_id) DO UPDATE SET
      name = excluded.name,
      code = excluded.code,
      fifa_code = excluded.fifa_code,
      confederation = excluded.confederation,
      group_id = excluded.group_id,
      static_source_id = excluded.static_source_id
  `);
  const localized = db.prepare(`
    INSERT INTO localized_names (entity_type, entity_id, locale, name, source_id)
    VALUES ('team', @teamId, @locale, @name, 1)
    ON CONFLICT(entity_type, entity_id, locale) DO UPDATE SET
      name = excluded.name
  `);

  teams.forEach((team, index) => {
    const apiFootballId = -(index + 1);
    stmt.run({ ...team, apiFootballId });
    const row = db.prepare('SELECT id FROM teams WHERE api_football_id = ?').get(apiFootballId);
    localized.run({ teamId: row.id, locale: 'es-MX', name: team.esName });
    localized.run({ teamId: row.id, locale: 'en-US', name: team.fifaName });
  });
}

function upsertFixtures(db, fixtures) {
  const stmt = db.prepare(`
    INSERT INTO fixtures (
      api_football_id, home_team_id, away_team_id, kickoff_utc, round, stage, status,
      venue, group_id, stadium_id, match_number, static_source_id, is_tbd,
      tbd_home_label, tbd_away_label
    )
    VALUES (
      @apiFootballId, @homeTeamId, @awayTeamId, @kickoffUtc, @round, @stage, @status,
      @venue, (SELECT id FROM wc_groups WHERE group_code = @groupCode),
      (SELECT id FROM stadiums WHERE city = @city), @matchNumber, 1, @isTbd,
      @tbdHomeLabel, @tbdAwayLabel
    )
    ON CONFLICT(api_football_id) DO UPDATE SET
      home_team_id = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.home_team_id
        ELSE excluded.home_team_id
      END,
      away_team_id = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.away_team_id
        ELSE excluded.away_team_id
      END,
      kickoff_utc = excluded.kickoff_utc,
      round = excluded.round,
      stage = excluded.stage,
      status = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.status
        ELSE excluded.status
      END,
      venue = excluded.venue,
      group_id = excluded.group_id,
      stadium_id = excluded.stadium_id,
      match_number = excluded.match_number,
      static_source_id = excluded.static_source_id,
      is_tbd = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.is_tbd
        ELSE excluded.is_tbd
      END,
      tbd_home_label = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.tbd_home_label
        WHEN excluded.is_tbd = 1 AND fixtures.tbd_home_label IS NOT NULL AND fixtures.tbd_home_label != excluded.tbd_home_label THEN fixtures.tbd_home_label
        ELSE excluded.tbd_home_label
      END,
      tbd_away_label = CASE
        WHEN fixtures.is_tbd = 0 AND excluded.is_tbd = 1 THEN fixtures.tbd_away_label
        WHEN excluded.is_tbd = 1 AND fixtures.tbd_away_label IS NOT NULL AND fixtures.tbd_away_label != excluded.tbd_away_label THEN fixtures.tbd_away_label
        ELSE excluded.tbd_away_label
      END,
      updated_at = datetime('now')
  `);

  fixtures.forEach((fixture, index) => {
    const homeTeam = fixture.isTbd ? { id: 0 } : teamByName(db, fixture.home);
    const awayTeam = fixture.isTbd ? { id: 0 } : teamByName(db, fixture.away);
    const syntheticId = fixture.matchNumber ? -1000 - fixture.matchNumber : -100 - index;
    stmt.run({
      apiFootballId: syntheticId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      kickoffUtc: fixture.kickoffUtc,
      round: fixture.round,
      stage: fixture.stage,
      status: fixture.isTbd ? 'tbd' : 'scheduled',
      venue: fixture.city,
      groupCode: fixture.groupCode,
      city: fixture.city,
      matchNumber: fixture.matchNumber,
      isTbd: fixture.isTbd ? 1 : 0,
      tbdHomeLabel: fixture.isTbd ? fixture.home : null,
      tbdAwayLabel: fixture.isTbd ? fixture.away : null,
    });
  });
}

function ensureTbdTeam(db) {
  db.prepare(`
    INSERT OR IGNORE INTO teams (id, api_football_id, name, code, fifa_code, static_source_id)
    VALUES (0, 0, 'TBD', 'TBD', 'TBD', 1)
  `).run();
}

function teamByName(db, name) {
  const meta = TEAM_META[name] || { code: codeFromName(name) };
  const team = db.prepare('SELECT id FROM teams WHERE fifa_code = ?').get(meta.code);
  if (!team) {
    throw new Error(`Static team not found: ${name}`);
  }
  return team;
}

function toUtcIso({ month, day, hour, minute, offset }) {
  const utcHour = hour - offset;
  return new Date(Date.UTC(2026, MONTHS[month], day, utcHour, minute)).toISOString();
}

function tournamentNameForCity(city) {
  const normalized = city.replace(/\s+/g, ' ').trim();
  const names = {
    Vancouver: 'Vancouver Stadium',
    Seattle: 'Seattle Stadium',
    'San Francisco Bay Area (Santa Clara)': 'San Francisco Bay Area Stadium',
    'Los Angeles (Inglewood)': 'Los Angeles Stadium',
    'Guadalajara (Zapopan)': 'Guadalajara Stadium',
    'Mexico City': 'Mexico City Stadium',
    'Monterrey (Guadalupe)': 'Monterrey Stadium',
    Houston: 'Houston Stadium',
    'Dallas (Arlington)': 'Dallas Stadium',
    'Kansas City': 'Kansas City Stadium',
    Atlanta: 'Atlanta Stadium',
    'Miami (Miami Gardens)': 'Miami Stadium',
    Toronto: 'Toronto Stadium',
    'Boston (Foxborough)': 'Boston Stadium',
    Philadelphia: 'Philadelphia Stadium',
    'New York/New Jersey (East Rutherford)': 'New York New Jersey Stadium',
  };
  return names[normalized] || normalized;
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function codeFromName(name) {
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb(process.env.DB_PATH || DEFAULT_DB_PATH);
  try {
    const result = seedStaticData(db);
    console.log(`[seed-static] Seeded ${result.teams} teams, ${result.stadiums} stadiums, ${result.fixtures} fixtures`);
  } finally {
    closeDb(db);
  }
}
