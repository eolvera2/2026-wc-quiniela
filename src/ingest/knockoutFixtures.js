import { WORLD_CUP_TEAMS } from '../data/worldCupTeams.js';
import { localDateKey } from './publicFinalScores.js';

const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export async function refreshKnockoutFixtures(db, {
  startLocalDate = '2026-06-28',
  fetchImpl = globalThis.fetch,
  scoreboardUrl = ESPN_SCOREBOARD_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Knockout fixture refresh requires fetch support.');
  }

  const unresolved = findUnresolvedKnockoutFixtures(db, { startLocalDate });
  const applied = [];
  const warnings = [];
  const scoreboardCache = new Map();

  for (const fixture of unresolved) {
    const event = await findPublicKnockoutEvent(fixture, { fetchImpl, scoreboardUrl, scoreboardCache });
    if (!event) {
      warnings.push(`No public knockout assignment found for match ${fixture.matchNumber || fixture.id} (${fixture.tbdHomeLabel} vs ${fixture.tbdAwayLabel}).`);
      continue;
    }

    const assignment = assignmentFromEvent(db, event);
    if (!assignment) {
      warnings.push(`Public knockout assignment for match ${fixture.matchNumber || fixture.id} has no concrete team yet.`);
      continue;
    }

    if (assignment.complete) {
      db.prepare(`
        UPDATE fixtures
        SET home_team_id = @homeTeamId,
            away_team_id = @awayTeamId,
            status = CASE WHEN status = 'tbd' THEN 'scheduled' ELSE status END,
            is_tbd = 0,
            tbd_home_label = NULL,
            tbd_away_label = NULL,
            updated_at = datetime('now')
        WHERE id = @fixtureId
      `).run({
        fixtureId: fixture.id,
        homeTeamId: assignment.homeTeamId,
        awayTeamId: assignment.awayTeamId,
      });
    } else {
      db.prepare(`
        UPDATE fixtures
        SET tbd_home_label = @homeTeam,
            tbd_away_label = @awayTeam,
            updated_at = datetime('now')
        WHERE id = @fixtureId
      `).run({
        fixtureId: fixture.id,
        homeTeam: assignment.homeTeamName,
        awayTeam: assignment.awayTeamName,
      });
    }

    applied.push({
      fixtureId: fixture.id,
      matchNumber: fixture.matchNumber,
      homeTeam: assignment.homeTeamName,
      awayTeam: assignment.awayTeamName,
      sourceName: 'ESPN public scoreboard',
      sourceUrl: assignment.sourceUrl,
      tentative: !assignment.complete,
    });
  }

  return { scanned: unresolved.length, applied: applied.length, assignments: applied, warnings };
}

export function findUnresolvedKnockoutFixtures(db, { startLocalDate = '2026-06-28' } = {}) {
  return db.prepare(`
    SELECT f.id,
           f.match_number AS matchNumber,
           f.kickoff_utc AS kickoffUtc,
           f.venue,
           f.tbd_home_label AS tbdHomeLabel,
           f.tbd_away_label AS tbdAwayLabel
    FROM fixtures f
    WHERE f.stage = 'knockout'
      AND f.is_tbd = 1
    ORDER BY f.kickoff_utc, f.match_number, f.id
  `).all().filter((fixture) => localDateKey(fixture.kickoffUtc) >= startLocalDate);
}

async function findPublicKnockoutEvent(fixture, { fetchImpl, scoreboardUrl, scoreboardCache }) {
  const events = [];
  for (const dateKey of scoreboardDateKeys(fixture)) {
    const scoreboard = await fetchScoreboard(dateKey, { fetchImpl, scoreboardUrl, scoreboardCache });
    events.push(...(scoreboard?.events || []));
  }

  const kickoffMs = new Date(fixture.kickoffUtc).getTime();
  return events
    .filter((event) => eventHasKnownTeams(event))
    .map((event) => ({ event, diffMs: Math.abs(new Date(event.date).getTime() - kickoffMs) }))
    .filter(({ diffMs }) => diffMs <= 3 * 60 * 60 * 1000)
    .sort((a, b) => a.diffMs - b.diffMs)[0]?.event || null;
}

function scoreboardDateKeys(fixture) {
  const localDate = localDateKey(fixture.kickoffUtc);
  const utcDate = new Date(fixture.kickoffUtc).toISOString().slice(0, 10);
  return [...new Set([localDate, utcDate])];
}

async function fetchScoreboard(dateKey, { fetchImpl, scoreboardUrl, scoreboardCache }) {
  if (scoreboardCache.has(dateKey)) return scoreboardCache.get(dateKey);
  const response = await fetchImpl(`${scoreboardUrl}?dates=${dateKey.replace(/-/g, '')}`, {
    headers: {
      'user-agent': 'PredictaGolBot/1.0 (+https://predictagol.com)',
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    scoreboardCache.set(dateKey, null);
    return null;
  }
  const payload = await response.json();
  scoreboardCache.set(dateKey, payload);
  return payload;
}

function eventHasKnownTeams(event) {
  const competitors = event.competitions?.[0]?.competitors || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  return Boolean(isUsableTeamLabel(home?.team) && isUsableTeamLabel(away?.team));
}

function assignmentFromEvent(db, event) {
  const competitors = event.competitions?.[0]?.competitors || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  const homeTeam = findTeam(db, home?.team);
  const awayTeam = findTeam(db, away?.team);
  if (!homeTeam && !awayTeam) return null;
  const sourceUrl = event.links?.find((link) => link.rel?.includes('summary'))?.href
    || `https://www.espn.com/soccer/match/_/gameId/${event.id}`;
  return {
    complete: Boolean(homeTeam && awayTeam),
    homeTeamId: homeTeam?.id,
    awayTeamId: awayTeam?.id,
    homeTeamName: homeTeam?.name || publicTeamLabel(home?.team),
    awayTeamName: awayTeam?.name || publicTeamLabel(away?.team),
    sourceUrl,
  };
}

function findTeam(db, team) {
  if (!team) return null;
  const code = normalizeTeamCode(team.abbreviation);
  if (code === 'TBD') return null;
  if (isPlaceholderCode(code)) return null;
  const byCode = code ? db.prepare(`
    SELECT t.id, COALESCE(ln.name, t.name) AS name, t.fifa_code AS code
    FROM teams t
    LEFT JOIN localized_names ln ON ln.entity_type = 'team' AND ln.entity_id = t.id AND ln.locale = 'es-MX'
    WHERE t.fifa_code = ? AND t.id != 0
  `).get(code) : null;
  if (byCode) return byCode;

  const candidateNames = [
    team.displayName,
    team.name,
    team.shortDisplayName,
    WORLD_CUP_TEAMS.find((candidate) => normalizeTeamCode(candidate.code) === code)?.seedName,
  ].filter(Boolean);
  const knownTeams = db.prepare(`
    SELECT t.id, COALESCE(ln.name, t.name) AS name, t.fifa_code AS code
    FROM teams t
    LEFT JOIN localized_names ln ON ln.entity_type = 'team' AND ln.entity_id = t.id AND ln.locale = 'es-MX'
    WHERE t.id != 0
  `).all();
  return knownTeams.find((known) =>
    candidateNames.some((candidate) => normalizeTeamName(candidate) === normalizeTeamName(known.name))
  ) || null;
}

function isUsableTeamLabel(team) {
  const code = normalizeTeamCode(team?.abbreviation);
  const name = normalizeTeamName(team?.displayName || team?.name);
  return Boolean(code && code !== 'TBD' && name && name !== 'tbd');
}

function isPlaceholderCode(code) {
  return /^[123][A-L]$/.test(code) || /^[WL]\d{1,3}$/.test(code) || code === '3RD';
}

function publicTeamLabel(team) {
  return String(team?.displayName || team?.name || team?.abbreviation || 'TBD').trim();
}

function normalizeTeamCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTeamName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
