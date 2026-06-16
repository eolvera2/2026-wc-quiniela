import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { renderCardAssets } = await import('../renderers/index.js');
const { WORLD_CUP_TEAMS } = await import('../../src/data/worldCupTeams.js');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), true];
  }),
);

function usage() {
  console.error('Usage: node marketing-board/scripts/render-poll-video.mjs --home=IRN --away=NZL [--out=.squad\\agents\\shuri\\outputs\\creative\\poll-videos\\irn-nzl]');
}

function normalize(value = '') {
  return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findTeam(value) {
  const needle = normalize(value);
  return WORLD_CUP_TEAMS.find((team) => {
    const candidates = [team.code, team.seedName, team.displayName, team.fifaName, team.flag].filter(Boolean);
    return candidates.some((candidate) => normalize(candidate) === needle);
  });
}

const home = findTeam(args.home);
const away = findTeam(args.away);
if (!home || !away) {
  usage();
  throw new Error(`Unknown team(s): home="${args.home || ''}", away="${args.away || ''}"`);
}

const slug = `${home.code.toLowerCase()}-${away.code.toLowerCase()}-poll`;
const outDir = resolve(repoRoot, args.out || `.squad\\agents\\shuri\\outputs\\creative\\poll-videos\\${slug}`);
const question = args.question || '¿Quién gana?';
const card = {
  id: `poll_${home.code.toLowerCase()}_${away.code.toLowerCase()}`,
  title: `${home.displayName} vs ${away.displayName}: poll comunidad`,
  pillar: 'quiniela_challenge',
  platforms: ['instagram', 'x', 'threads'],
  payload: {
    template: 'poll-question-video',
    format_variant: 'poll_question_mp4',
    homeTeam: home.displayName,
    awayTeam: away.displayName,
    flagCodeHome: home.flag,
    flagCodeAway: away.flag,
    question,
    challengeQuestion: question,
    target_match: { home: home.displayName, away: away.displayName },
  },
};

const assets = await renderCardAssets(card, { outDir });
console.log(`Poll video generated for ${home.displayName} vs ${away.displayName}`);
for (const [key, value] of Object.entries(assets)) {
  console.log(`${key}: ${relative(repoRoot, value)}`);
}
