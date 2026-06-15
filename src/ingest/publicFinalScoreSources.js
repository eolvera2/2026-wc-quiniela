import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPublicFinalScoreEntries,
  canonicalTeamName,
  findMissingPublicFinalScores,
  localDateKey,
} from './publicFinalScores.js';

const DEFAULT_SOURCES_PATH = join(process.cwd(), 'data', 'public', 'final-score-sources.json');
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export async function retrievePublicFinalScores(db, {
  now = new Date().toISOString(),
  delayHours = 2,
  limit = 24,
  sourcesPath,
  fetchImpl = globalThis.fetch,
} = {}) {
  const registryPath = sourcesPath || DEFAULT_SOURCES_PATH;
  if (!existsSync(registryPath)) {
    return { applied: 0, skipped: 0, warnings: ['Final-score source registry is missing.'] };
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Public final-score retrieval requires fetch support.');
  }

  const sources = JSON.parse(readFileSync(registryPath, 'utf-8'));
  validateSources(sources);

  const missingFixtures = findMissingPublicFinalScores(db, { now, delayHours, limit });
  let applied = 0;
  let skipped = 0;
  const warnings = [];
  const scoreboardCache = new Map();

  for (const fixture of missingFixtures) {
    let sourceEntries = sources.filter((source) => sourceMatchesFixture(source, fixture));
    if (sourceEntries.length === 0) {
      sourceEntries = await findEspnScoreboardSources(fixture, { fetchImpl, scoreboardCache });
    }
    if (sourceEntries.length === 0) {
      warnings.push(`No public final-score source found for ${fixture.homeTeam} vs ${fixture.awayTeam} (${localDateKey(fixture.kickoffUtc)}).`);
      continue;
    }

    let published = false;
    for (const source of sourceEntries) {
      const result = await fetchAndParseSource(source, { fetchImpl });
      if (!result.candidate) {
        warnings.push(`${source.homeTeam} vs ${source.awayTeam} from ${source.sourceName}: ${result.warning}`);
        skipped += 1;
        continue;
      }

      const applyResult = applyPublicFinalScoreEntries(db, [result.candidate], { now, delayHours });
      applied += applyResult.applied;
      skipped += applyResult.skipped;
      if (applyResult.applied > 0) {
        published = true;
        break;
      }
    }

    if (!published) {
      warnings.push(`No high-confidence public final score published for ${fixture.homeTeam} vs ${fixture.awayTeam}.`);
    }
  }

  return { applied, skipped, warnings };
}

export async function fetchAndParseSource(source, { fetchImpl = globalThis.fetch } = {}) {
  if (source.homeScore !== undefined || source.awayScore !== undefined) {
    if (!Number.isInteger(source.homeScore) || !Number.isInteger(source.awayScore)) {
      return { candidate: null, warning: 'source had invalid score values' };
    }
    return {
      candidate: {
        homeTeam: source.homeTeam,
        awayTeam: source.awayTeam,
        kickoffLocalDate: source.kickoffLocalDate,
        homeScore: source.homeScore,
        awayScore: source.awayScore,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
      },
      warning: null,
    };
  }

  const response = await fetchImpl(source.sourceUrl, {
    headers: {
      'user-agent': 'PredictaGolBot/1.0 (+https://predictagol.com)',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    return { candidate: null, warning: `source fetch failed with HTTP ${response.status}` };
  }

  const html = await response.text();
  const parsed = parseFinalScoreFromHtml(html, source);
  if (!parsed) {
    return { candidate: null, warning: 'could not parse a completed final score with matching team names' };
  }

  return {
    candidate: {
      homeTeam: source.homeTeam,
      awayTeam: source.awayTeam,
      kickoffLocalDate: source.kickoffLocalDate,
      homeScore: parsed.homeScore,
      awayScore: parsed.awayScore,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
    },
    warning: null,
  };
}

async function findEspnScoreboardSources(fixture, { fetchImpl, scoreboardCache }) {
  const dateKey = localDateKey(fixture.kickoffUtc);
  const scoreboard = await fetchEspnScoreboard(dateKey, { fetchImpl, scoreboardCache });
  if (!scoreboard) return [];

  const event = (scoreboard.events || []).find((candidate) => espnEventMatchesFixture(candidate, fixture));
  const competition = event?.competitions?.[0];
  if (!event || !competition?.status?.type?.completed) return [];

  const home = competition.competitors?.find((competitor) => competitor.homeAway === 'home');
  const away = competition.competitors?.find((competitor) => competitor.homeAway === 'away');
  if (!home || !away) return [];

  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return [];

  const summaryUrl = event.links?.find((link) => link.rel?.includes('summary'))?.href
    || `https://www.espn.com/soccer/match/_/gameId/${event.id}`;
  return [{
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    kickoffLocalDate: dateKey,
    homeScore,
    awayScore,
    sourceName: 'ESPN',
    sourceUrl: summaryUrl,
    parserType: 'espn-scoreboard',
  }];
}

async function fetchEspnScoreboard(dateKey, { fetchImpl, scoreboardCache }) {
  if (scoreboardCache.has(dateKey)) return scoreboardCache.get(dateKey);
  const dateParam = dateKey.replace(/-/g, '');
  const response = await fetchImpl(`${ESPN_SCOREBOARD_URL}?dates=${dateParam}`, {
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

function espnEventMatchesFixture(event, fixture) {
  const competition = event.competitions?.[0];
  const home = competition?.competitors?.find((competitor) => competitor.homeAway === 'home');
  const away = competition?.competitors?.find((competitor) => competitor.homeAway === 'away');
  if (!home || !away) return false;

  const homeCode = canonicalTeamName(home.team?.abbreviation);
  const awayCode = canonicalTeamName(away.team?.abbreviation);
  if (fixture.homeTeamCode && fixture.awayTeamCode
    && homeCode === canonicalTeamName(fixture.homeTeamCode)
    && awayCode === canonicalTeamName(fixture.awayTeamCode)) {
    return true;
  }

  return canonicalTeamName(home.team?.displayName) === canonicalTeamName(fixture.homeTeam)
    && canonicalTeamName(away.team?.displayName) === canonicalTeamName(fixture.awayTeam);
}

export function parseFinalScoreFromHtml(html, source) {
  const surfaces = extractTextSurfaces(html);
  const hasFinalMarker = surfaces.some((surface) => /\b(final|ft|full\s*time|match\s*report|highlights)\b/i.test(surface));
  if (!hasFinalMarker) return null;

  const home = canonicalTeamName(source.homeTeam);
  const away = canonicalTeamName(source.awayTeam);
  for (const surface of surfaces) {
    const normalized = canonicalTeamName(decodeHtml(surface));
    const direct = parseScorePattern(normalized, home, away);
    if (direct) return direct;

    const reverse = parseScorePattern(normalized, away, home);
    if (reverse) {
      return { homeScore: reverse.awayScore, awayScore: reverse.homeScore };
    }
  }

  return null;
}

function parseScorePattern(text, firstTeam, secondTeam) {
  const first = escapeRegExp(firstTeam);
  const second = escapeRegExp(secondTeam);
  const patterns = [
    new RegExp(`\\b${first}\\b\\s+(\\d{1,2})\\s+[-–]\\s+(\\d{1,2})\\s+\\b${second}\\b`),
    new RegExp(`\\b${first}\\b\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+\\b${second}\\b`),
    new RegExp(`\\b${first}\\b\\s+(?:vs|v)\\s+\\b${second}\\b.*?\\b(\\d{1,2})\\s+[-–]\\s+(\\d{1,2})\\b`),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return { homeScore: Number(match[1]), awayScore: Number(match[2]) };
    }
  }
  return null;
}

function extractTextSurfaces(html) {
  const surfaces = [];
  for (const pattern of [
    /<title[^>]*>([\s\S]*?)<\/title>/gi,
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title|description)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ]) {
    for (const match of html.matchAll(pattern)) {
      surfaces.push(match[1]);
    }
  }
  surfaces.push(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
  return surfaces.map((surface) => decodeHtml(surface).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function validateSources(sources) {
  if (!Array.isArray(sources)) {
    throw new Error('Final-score source registry must be a JSON array.');
  }
  for (const source of sources) {
    if (!source.homeTeam || !source.awayTeam || !source.kickoffLocalDate || !source.sourceName || !source.sourceUrl || !source.parserType) {
      throw new Error(`Invalid final-score source entry: ${JSON.stringify(source)}`);
    }
    if (!['espn', 'generic'].includes(source.parserType)) {
      throw new Error(`Unsupported final-score parser type: ${source.parserType}`);
    }
  }
}

function sourceMatchesFixture(source, fixture) {
  return canonicalTeamName(source.homeTeam) === canonicalTeamName(fixture.homeTeam)
    && canonicalTeamName(source.awayTeam) === canonicalTeamName(fixture.awayTeam)
    && source.kickoffLocalDate === localDateKey(fixture.kickoffUtc);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&#8211;/g, '-');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
