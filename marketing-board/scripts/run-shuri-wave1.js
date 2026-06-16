import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'http://127.0.0.1:5173';
const ACTOR = 'shuri';
const WAVE_DATE = '2026-06-11';
const OUT_ROOT = `.squad\\agents\\shuri\\outputs\\creative\\${WAVE_DATE}`;
const REQUIRED_ASSETS = ['1080x1920', '1080x1350', '1080x1080'];
const DAY_FILTER = new Set(['2026-06-11', '2026-06-12']);
const FORBIDDEN = [
  'momios',
  'apuesta',
  'apostar',
  'casa de apuestas',
  'value bet',
  'parlay',
  '+EV',
  'betting',
  'bet',
  'odds',
  'line',
  'sportsbook',
  'wager',
  'juega y gana',
  'gana dinero',
  'gana premio',
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);
const { renderCardAssets } = await import('../renderers/index.js');

const TEAM = {
  Mexico: { es: 'México', flag: '🇲🇽', tag: '#ElTri' },
  'South Africa': { es: 'Sudáfrica', flag: '🇿🇦', tag: '#MexicoSudafrica' },
  Canada: { es: 'Canadá', flag: '🇨🇦', tag: '#Canada' },
  'Bosnia & Herzegovina': { es: 'Bosnia y Herzegovina', flag: '🇧🇦', tag: '#Bosnia' },
  USA: { es: 'USA', flag: '🇺🇸', tag: '#USMNT' },
  Paraguay: { es: 'Paraguay', flag: '🇵🇾', tag: '#Paraguay' },
};

function teamName(value) {
  return TEAM[value]?.es || value || 'Rival';
}

function teamFlag(value) {
  return TEAM[value]?.flag || '🏳️';
}

function teamTag(value) {
  return TEAM[value]?.tag || `#${String(value || 'Futbol').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/g, '')}`;
}

function forbiddenPattern(term) {
  if (term === '+EV') return /\+EV/i;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}s?($|[^\\p{L}\\p{N}])`, 'iu');
}

function assertNoForbidden(label, value) {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  const hit = FORBIDDEN.find((term) => forbiddenPattern(term).test(text));
  if (hit) throw new Error(`Forbidden vocab "${hit}" in ${label}: ${text}`);
}

function assertNoHashtagsInCaption(label, caption) {
  const text = String(caption || '');
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(trimmed)) {
      throw new Error(`Hashtag line detected in ${label} caption: "${trimmed}". Hashtags must only live in the hashtags array, never inside the caption.`);
    }
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${response.status}: ${body}`);
  return data;
}

function scheduledDate(card) {
  return String(card.payload?.scheduled_for || '').slice(0, 10);
}

function pickWaveCards(board) {
  const cards = (board.columns?.ideas?.cards || [])
    .filter((card) => DAY_FILTER.has(scheduledDate(card)))
    .sort(
      (a, b) =>
        Number(b.priority || 0) - Number(a.priority || 0) ||
        String(a.payload?.scheduled_for || '').localeCompare(String(b.payload?.scheduled_for || '')),
    )
    .slice(0, 7);

  if (cards.length !== 7) throw new Error(`Expected 7 Wave 1 ideas, found ${cards.length}.`);
  if (!cards.some((card) => card.payload?.template === 'launch-announcement')) {
    throw new Error('Wave 1 selection is missing the launch-announcement card.');
  }
  if (
    !cards.some(
      (card) =>
        card.pillar === 'pronostico_del_dia' &&
        card.payload?.target_match?.home === 'Mexico' &&
        card.payload?.target_match?.away === 'South Africa',
    )
  ) {
    throw new Error('Wave 1 selection is missing México vs Sudáfrica pronóstico del día.');
  }
  return cards;
}

function buildLaunchCopy(card) {
  const hook = 'Arranca el Mundial y tu quiniela también.';
  const caption = `${hook} 🌎⚽

En PredictaGol vivimos los 104 partidos contigo: pronósticos, datos curiosos y tu quiniela gratis con la banda.

Juego social: solo orgullo de grupo.

Tu pick en predictagol.com`;
  return {
    title: 'Bienvenido a PredictaGol: tu Mundial se pronostica con amigos',
    hook,
    caption,
    alt_text: 'Gráfico de bienvenida a PredictaGol con fondo verde y dorado, invitando a pronosticar el Mundial con amigos.',
    hashtags: ['#PredictaGol', '#Mundial2026', '#FutbolEnEspañol', '#QuinielaPredictaGol'],
    renderFields: {
      eyebrow: 'BIENVENIDOS AL MUNDIAL 2026',
      statLine: 'Pronósticos, datos y quiniela gratis para vivir cada partido con tu gente.',
      cta: card.payload?.cta || 'Tu pick en predictagol.com',
    },
  };
}

import { INITIAL_FIXTURE_CONTENT } from '../../src/data/fixtureContent/index.js';

const FIFA_CODE = {
  Mexico: 'MEX',
  'South Africa': 'RSA',
  Canada: 'CAN',
  'Bosnia & Herzegovina': 'BIH',
  USA: 'USA',
  Paraguay: 'PAR',
  Brazil: 'BRA',
  Morocco: 'MAR',
  Netherlands: 'NED',
  Japan: 'JPN',
  Spain: 'ESP',
  'Cape Verde': 'CPV',
  France: 'FRA',
  Senegal: 'SEN',
  England: 'ENG',
  Croatia: 'CRO',
};

function fixtureContentFor(match) {
  if (!match?.home || !match?.away || !match?.kickoff_iso) return null;
  const homeCode = FIFA_CODE[match.home];
  const awayCode = FIFA_CODE[match.away];
  if (!homeCode || !awayCode) return null;
  const day = String(match.kickoff_iso).slice(0, 10);
  const key = `${homeCode}-${awayCode}-${day}`;
  return INITIAL_FIXTURE_CONTENT[key] || null;
}

function shortPickFromVerdict(verdict) {
  if (!verdict) return null;
  const match = String(verdict).match(/Pick inicial para quiniela:\s*([^.<]+)\./i);
  return match ? match[1].trim() : null;
}

function buildPronosticoCopy(card) {
  const match = card.payload?.target_match || {};
  const home = teamName(match.home);
  const away = teamName(match.away);
  const homeFlag = teamFlag(match.home);
  const isMexico = match.home === 'Mexico' && match.away === 'South Africa';
  const hook = card.payload?.hook || `${home} vs ${away}: lectura rápida para tu pick.`;
  const opinion = isMexico
    ? 'México empuja desde el inicio, pero la paciencia vale más que la prisa'
    : match.home === 'Canada'
      ? 'Canadá tendrá energía local; Bosnia puede cerrar espacios si aguanta los primeros 20'
      : 'partido de detalles, con el primer gol cambiando toda la conversación';

  // Pull PGS® score + initial pick from our fixture portal data so the teaser
  // matches what's published on predictagol.com (no made-up numbers).
  const content = fixtureContentFor(match);
  const pgsHome = content?.pgs?.home;
  const pgsAway = content?.pgs?.away;
  const pickShort = shortPickFromVerdict(content?.sections?.quiniela_verdict);
  const teaserParts = [];
  if (pgsHome != null && pgsAway != null) {
    teaserParts.push(`📊 PGS® ${home} ${pgsHome}-${pgsAway} ${away}`);
  }
  if (pickShort) {
    teaserParts.push(`🎯 Pick inicial: ${pickShort}`);
  }
  const teaserLine = teaserParts.length ? `\n\n${teaserParts.join(' · ')}` : '';

  const caption = `${home} vs ${away} hoy ${homeFlag}⚽

${hook}

Nuestra lectura: ${opinion}. ¿Y tú?${teaserLine}

Tu pick en predictagol.com`;
  return {
    hook,
    caption,
    alt_text: `Gráfico de pronóstico del día para ${home} vs ${away}, con horario, sede${pgsHome != null ? `, PGS® ${pgsHome}-${pgsAway}` : ''} y llamado a compartir tu pick.`,
    hashtags: ['#PredictaGol', '#Mundial2026', teamTag(match.home), '#PronosticoDelDia'],
    renderFields: {
      homeTeam: home,
      awayTeam: away,
      flagEmojiHome: teamFlag(match.home),
      flagEmojiAway: teamFlag(match.away),
      kickoff: match.kickoff_iso,
      venue: match.venue,
      cta: card.payload?.cta || 'Tu pick en predictagol.com',
      pgsHome: pgsHome != null ? String(pgsHome) : undefined,
      pgsAway: pgsAway != null ? String(pgsAway) : undefined,
      pickShort: pickShort || undefined,
    },
  };
}

function buildQuinielaCopy(card) {
  const match = card.payload?.target_match || {};
  const home = teamName(match.home);
  const away = teamName(match.away);
  const hook = card.payload?.hook || `Tu marcador para ${home} vs ${away}, sin pensarlo tanto.`;
  const caption = `${hook} ⚽

Pon tu marcador antes del silbatazo: 1-1, 2-1 o sorpresa bien leída.

Compara con tu grupo cuando ruede la pelota.

Tu pick en predictagol.com`;
  return {
    hook,
    caption,
    alt_text: `Gráfico de quiniela para ${home} vs ${away}, con opciones rápidas para elegir marcador con amigos.`,
    hashtags: ['#PredictaGol', '#Mundial2026', '#QuinielaPredictaGol', teamTag(match.home)],
    renderFields: {
      challengeQuestion: '¿Se repite el 1-1 o México rompe el guion?',
      homeTeam: '1-1',
      awayTeam: '2-1',
      cta: card.payload?.cta || 'Tu pick en predictagol.com',
    },
  };
}

function buildTeamDataCopy(card) {
  const match = card.payload?.target_match || {};
  const team = teamName(match.home);
  const isMexico = match.home === 'Mexico';
  const hook = card.payload?.hook || `${team}: tres líneas para leer el partido.`;
  const read = isMexico
    ? 'salida, medio y ataque dicen mucho más que un marcador aislado'
    : 'si acelera por bandas, Paraguay puede obligar a jugar con cabeza fría';
  const caption = `${hook} 📊

La lectura: ${read}.

Dinos qué zona te dio más confianza y arma tu pick con la banda.

Tu pick en predictagol.com`;
  return {
    hook,
    caption,
    alt_text: `Gráfico de datos de ${team} con tres bloques para leer forma, goles y solidez antes de compartir tu pick.`,
    hashtags: ['#PredictaGol', '#Mundial2026', teamTag(match.home), '#TuEquipoTuData'],
    renderFields: {
      homeTeam: team,
      flagEmojiHome: teamFlag(match.home),
      form: isMexico ? 'Salida' : 'Ritmo',
      goals: isMexico ? 'Medio' : 'Bandas',
      cleanSheets: isMexico ? 'Cierre' : 'Pausa',
      cta: card.payload?.cta || 'Tu pick en predictagol.com',
    },
  };
}

function buildMomentCopy(card) {
  const match = card.payload?.target_match || {};
  const home = teamName(match.home);
  const away = teamName(match.away);
  const hook = card.payload?.hook || `Momento clave en ${home} vs ${away}.`;
  const caption = `${hook} ⚽

Si llega el primer gol, revisa quién lo vio venir y quién cambia marcador mental.

Tu grupo tiene lectura, no solo gritos.

Tu pick en predictagol.com`;
  return {
    hook,
    caption,
    alt_text: `Gráfico reactivo para ${home} vs ${away}, invitando a comparar picks del grupo tras el primer gran momento.`,
    hashtags: ['#PredictaGol', '#Mundial2026', teamTag(match.home), '#QuinielaPredictaGol'],
    renderFields: {
      challengeQuestion: '¿Quién lo vio venir primero?',
      homeTeam: home,
      awayTeam: away,
      cta: card.payload?.cta || 'Tu pick en predictagol.com',
    },
  };
}

function buildCopy(card) {
  if (card.payload?.template === 'launch-announcement') return buildLaunchCopy(card);
  if (card.pillar === 'pronostico_del_dia') return buildPronosticoCopy(card);
  if (card.pillar === 'quiniela_challenge') return buildQuinielaCopy(card);
  if (card.pillar === 'tu_equipo_tu_data') return buildTeamDataCopy(card);
  if (card.pillar === 'momento_del_partido') return buildMomentCopy(card);
  return buildLaunchCopy(card);
}

function renderPillar(card) {
  if (card.payload?.template === 'launch-announcement') return 'launch';
  if (['pronostico_del_dia', 'quiniela_challenge', 'datos_curiosos', 'tu_equipo_tu_data'].includes(card.pillar)) return card.pillar;
  if (card.payload?.template === 'quiniela-challenge') return 'quiniela_challenge';
  return 'launch';
}

function toRelativeAssets(assets) {
  return Object.fromEntries(
    Object.entries(assets).map(([key, value]) => [key, relative(repoRoot, resolve(repoRoot, value)) || value]),
  );
}

function verifyAssets(assets) {
  let bytes = 0;
  for (const key of REQUIRED_ASSETS) {
    if (!assets[key]) throw new Error(`Missing ${key} asset path.`);
    const size = statSync(resolve(repoRoot, assets[key])).size;
    if (size <= 5 * 1024) throw new Error(`${assets[key]} is too small (${size} bytes).`);
    bytes += size;
  }
  return bytes;
}

async function processCard(seedCard) {
  const latest = await api(`/api/cards/${seedCard.id}`);
  const copy = buildCopy(latest);
  assertNoForbidden(`${latest.id} caption`, copy.caption);
  assertNoHashtagsInCaption(latest.id, copy.caption);
  assertNoForbidden(`${latest.id} hook`, copy.hook);
  assertNoForbidden(`${latest.id} alt text`, copy.alt_text);
  assertNoForbidden(`${latest.id} hashtags`, copy.hashtags);

  const mergedPayload = {
    ...latest.payload,
    ...copy.renderFields,
    caption: copy.caption,
    hook: copy.hook,
    alt_text: copy.alt_text,
    hashtags: copy.hashtags,
  };
  const renderCard = {
    ...latest,
    title: copy.title || latest.title,
    pillar: renderPillar({ ...latest, payload: mergedPayload }),
    payload: mergedPayload,
  };

  const outDir = `${OUT_ROOT}\\${latest.id}`;
  const rendered = await renderCardAssets(renderCard, { outDir });
  const assets = toRelativeAssets(rendered);
  const bytes = verifyAssets(assets);
  const finalPayload = { ...mergedPayload, assets };

  await api(`/api/cards/${latest.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: copy.title || latest.title,
      payload: finalPayload,
      payload_json: JSON.stringify(finalPayload),
      actor: ACTOR,
      note: 'Wave 1 creative packet',
    }),
  });
  await api(`/api/cards/${latest.id}/advance`, {
    method: 'POST',
    body: JSON.stringify({ to_stage: 'copywritten', actor: ACTOR, note: 'Wave 1 creative ready' }),
  });

  return {
    id: latest.id,
    title: copy.title || latest.title,
    caption: copy.caption,
    assets,
    bytes,
  };
}

function writeSummary(results) {
  mkdirSync(OUT_ROOT, { recursive: true });
  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0);
  const body = [
    '# Shuri Wave 1 Summary',
    '',
    `Fecha: ${new Date().toISOString()}`,
    `Cards procesadas: ${results.length}`,
    `Assets renderizados: ${results.length * REQUIRED_ASSETS.length}`,
    `Bytes totales: ${totalBytes}`,
    '',
    ...results.flatMap((result) => [
      `## ${result.id} — ${result.title}`,
      '',
      result.caption,
      '',
      'Assets:',
      ...Object.entries(result.assets).map(([key, value]) => `- ${key}: ${value}`),
      '',
    ]),
  ].join('\n');
  writeFileSync(`${OUT_ROOT}\\wave1-summary.md`, body, 'utf8');
}

async function main() {
  const board = await api('/api/board');
  const selected = pickWaveCards(board);
  const results = [];
  for (const card of selected) {
    results.push(await processCard(card));
  }
  writeSummary(results);

  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0);
  console.log(
    JSON.stringify(
      {
        processed: results.length,
        asset_count: results.length * REQUIRED_ASSETS.length,
        total_bytes: totalBytes,
        forbidden_vocab_assertions_caught: 0,
        failures: [],
        summary: `${OUT_ROOT}\\wave1-summary.md`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
