// Dynamic seed: reads data/static/openfootball/cup.txt, finds every match
// whose kickoff falls on the requested CDMX date. If no date is supplied,
// it seeds a rolling plan for tomorrow (T-24) and two days out (T-48).
// creates match-relative Instagram/X/Threads cards in To Be Posted.
// Idempotent on re-run — re-renders assets and updates payload fields
// (post windows, kickoff, venue, PGS) on existing cards.
//
// Usage:
//   node marketing-board/scripts/seed-matches-for-date.mjs              # tomorrow + two days ahead (CDMX)
//   node marketing-board/scripts/seed-matches-for-date.mjs --date=2026-06-15
//   node marketing-board/scripts/seed-matches-for-date.mjs --dry-run

import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { getDb, runMigrations, closeDb } = await import('../lib/db.js');
const { insertCard, getCard, updateCard } = await import('../lib/cards.js');
const { renderCardAssets } = await import('../renderers/index.js');
const { POST_WINDOWS, expiresForWindow, scheduledForWindow } = await import('../lib/socialStrategy.js');
const { INITIAL_FIXTURE_CONTENT } = await import('../../src/data/fixtureContent/index.js');
const { WORLD_CUP_TEAMS } = await import('../../src/data/worldCupTeams.js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateArg = args.find((a) => a.startsWith('--date='));
const maxArg = args.find((a) => a.startsWith('--max='));
const allowPlaceholder = args.includes('--allow-placeholder');
const TARGET_DATES = dateArg
  ? [dateArg.split('=')[1]]
  : [addCdmxDays(todayInCdmx(), 1), addCdmxDays(todayInCdmx(), 2)];
const MAX_FEATURED_MATCHES = maxArg ? Math.max(1, Number(maxArg.split('=')[1])) : 3;
let activeTargetDate = TARGET_DATES[0];

for (const targetDate of TARGET_DATES) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`[seed] Invalid --date='${targetDate}'. Expected YYYY-MM-DD.`);
    process.exit(1);
  }
}

const TEAMS_BY_SEED = new Map(WORLD_CUP_TEAMS.map((t) => [t.seedName, t]));
const TEAMS_BY_CODE = new Map(WORLD_CUP_TEAMS.map((t) => [t.code, t]));

function todayInCdmx() {
  // CDMX is UTC-6 year-round (no DST since 2022).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addCdmxDays(dateISO, days) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(next);
}

const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

function pad(n) { return String(n).padStart(2, '0'); }

function utcIsoFrom({ year, month, day, hour, minute, offset }) {
  // offset is the UTC offset of the local time, e.g. -7 means local is UTC-7.
  // UTC = local - offset; we represent kickoff as a UTC ISO string.
  const localMs = Date.UTC(year, month - 1, day, hour, minute);
  const utcMs = localMs - offset * 3600 * 1000;
  return new Date(utcMs).toISOString();
}

function cdmxDateOf(utcIso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcIso));
}

function cdmxIsoOf(utcIso) {
  // Format as YYYY-MM-DDTHH:mm:ss-06:00 (CDMX).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcIso));
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}-06:00`;
}

function parseCupForDate(text, targetCdmxDate, year = 2026) {
  const fixtures = [];
  let currentDate = null;
  let currentGroup = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const groupMatch = line.match(/^▪ Group ([A-L])$/);
    if (groupMatch) { currentGroup = groupMatch[1]; continue; }

    const dateMatch = line.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]+)\s+(\d{1,2})\s*$/);
    if (dateMatch) {
      currentDate = { month: MONTHS[dateMatch[1]], day: Number(dateMatch[2]) };
      continue;
    }

    const fixMatch = line.match(/^\s*(?:\((\d+)\)\s*)?(\d{1,2}):(\d{2})\s+UTC([+-]\d+)\s+(.+?)\s+v\s+(.+?)\s+@\s+(.+?)\s*$/);
    if (!fixMatch || !currentDate) continue;

    const [, , hour, minute, offsetStr, homeName, awayName, venue] = fixMatch;
    const utcIso = utcIsoFrom({
      year, month: currentDate.month, day: currentDate.day,
      hour: Number(hour), minute: Number(minute), offset: Number(offsetStr),
    });
    if (cdmxDateOf(utcIso) !== targetCdmxDate) continue;

    const home = TEAMS_BY_SEED.get(homeName.trim());
    const away = TEAMS_BY_SEED.get(awayName.trim());
    if (!home || !away) {
      console.warn(`[seed] Skipping ${homeName} v ${awayName}: unknown team mapping (extend src/data/worldCupTeams.js seedName).`);
      continue;
    }

    fixtures.push({
      home, away,
      venue: venue.trim(),
      utcIso,
      cdmxIso: cdmxIsoOf(utcIso),
      groupCode: currentGroup,
    });
  }

  return fixtures;
}

function venueShort(raw) {
  // "San Francisco Bay Area (Santa Clara)" → "Santa Clara, EE.UU."
  // "New York/New Jersey (East Rutherford)" → "East Rutherford, EE.UU."
  // "Vancouver" → "Vancouver, Canadá"
  // Heuristic: if it includes parens take the parenthetical city; else use the bare value.
  const paren = raw.match(/\(([^)]+)\)/);
  const city = paren ? paren[1].trim() : raw.split(',')[0].trim();
  const canadianCities = new Set(['Vancouver', 'Toronto']);
  const mexicanCities = new Set(['Mexico City', 'Guadalajara', 'Monterrey', 'Guadalupe']);
  if (canadianCities.has(city)) return `${city}, Canadá`;
  if (mexicanCities.has(city)) return `${city}, México`;
  return `${city}, EE.UU.`;
}

function fixtureContentFor(home, away, dateCdmx, utcIso) {
  const key = `${home.code}-${away.code}-${dateCdmx}`;
  const content = INITIAL_FIXTURE_CONTENT[key];
  if (content) return { key, content };

  const utcDate = String(utcIso || '').slice(0, 10);
  const utcKey = utcDate ? `${home.code}-${away.code}-${utcDate}` : null;
  if (utcKey && utcKey !== key && INITIAL_FIXTURE_CONTENT[utcKey]) {
    return { key, content: INITIAL_FIXTURE_CONTENT[utcKey], sourceKey: utcKey };
  }

  return { key, content: null };
}

function pickShortFrom(fixture, fallback) {
  const verdict = String(fixture?.sections?.quiniela_verdict || '');
  const m = verdict.match(/Pick inicial para quiniela:\s*([^.<]+)\./i);
  if (m) return m[1].trim();
  return fallback;
}

function fallbackHook(home, away) {
  return `${home.displayName} vs ${away.displayName}: el algoritmo PGS® tiene su veredicto.`;
}

function pickFallback(pgsHome, pgsAway, home, away) {
  if (pgsHome > pgsAway) return `${home.displayName} con ventaja inicial`;
  if (pgsAway > pgsHome) return `${away.displayName} con ventaja inicial`;
  return 'Empate como pick inicial';
}

function hashtagFor(displayName) {
  const cleaned = displayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '');
  return `#${cleaned}`;
}

function platformCopyForFinalPrediction({ homeUpper, awayUpper, kickoffHuman, hook, pgsHome, pgsAway, pickShort }) {
  const reelCaption =
    `${homeUpper} vs ${awayUpper} hoy ${kickoffHuman}\n\n` +
    `Nuestro pick final: ${pickShort}.\n\n` +
    `PGS® ${homeUpper} ${pgsHome}-${pgsAway} ${awayUpper}. Guarda este Reel y compara al FT.`;
  return {
    instagram: {
      format: 'reel_7_30s',
      caption: reelCaption,
      script:
        `Reel 7-30s:\n` +
        `0-2s: Hook en pantalla: "${homeUpper} vs ${awayUpper}: nuestro pick final".\n` +
        `3-8s: Mostrar slide PGS® ${pgsHome}-${pgsAway}.\n` +
        `9-16s: Decir la razón corta: "${hook}".\n` +
        `17-24s: Cierre: "${pickShort}. ¿Lo bancas o ves sorpresa?"`,
      hashtags: ['#PredictaGol', '#Mundial2026', hashtagFor(homeUpper), hashtagFor(awayUpper), '#PronosticoDelDia'],
      alt_text: `Storyboard de Reel para ${homeUpper} vs ${awayUpper}: hook, PGS® y pick final.`,
      asset_keys: ['slide_1', 'slide_2', 'slide_3'],
    },
    x: {
      format: 'thread',
      text:
        `Hilo express a 1h de ${homeUpper} vs ${awayUpper} 🧵\n\n` +
        `1/ Pick final: ${pickShort}\n2/ PGS®: ${pgsHome}-${pgsAway}\n3/ Si las alineaciones no cambian el ritmo, esta es nuestra lectura.`,
      reply_text: 'Más contexto y picks en predictagol.com',
      hashtags: ['#PredictaGol', '#WorldCup2026'],
    },
    threads: {
      format: 'match_thread_reply',
      text:
        `Respuesta lista para usar en threads de cuentas grandes del partido:\n\n` +
        `PredictaGol llega con ${pickShort} para ${homeUpper} vs ${awayUpper}. ` +
        `PGS® ${pgsHome}-${pgsAway}; la clave es si el primer tramo confirma esta lectura o rompe la quiniela.`,
      hashtags: ['#PredictaGol', '#Mundial2026'],
    },
  };
}

function buildBreakdownPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, 't_minus_48h');
  const expiresAt = expiresForWindow(cdmxIso, 't_minus_48h');
  const hook = `${homeUpper} vs ${awayUpper}: 3 señales para empezar a leer el partido.`;
  const caption =
    `${hook}\n\n` +
    `1. Contexto del grupo\n2. PGS® inicial ${pgsHome}-${pgsAway}\n3. Pick temprano: ${pickShort}\n\n` +
    'Guarda este breakdown y compáralo cuando salgan alineaciones.';
  return {
    title: `${homeUpper} vs ${awayUpper}: T-48 breakdown`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'tu_equipo_tu_data',
    platforms: ['instagram', 'x', 'threads'],
    priority: 9,
    expires_at: expiresAt,
    payload: {
      template: 'pronostico-carousel-3up',
      format_variant: 'carousel_3up',
      scheduled_for: scheduled,
      window_key: 't_minus_48h',
      window_label: POST_WINDOWS.t_minus_48h.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso, venue: venueDisplay },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      slideTitle: `${homeUpper} vs ${awayUpper}`,
      kickoff: cdmxIso,
      venue: venueDisplay,
      pgsHome: String(pgsHome),
      pgsAway: String(pgsAway),
      pickShort,
      hook,
      cta: 'Guárdalo para tu quiniela',
      caption,
      alt_text: `Breakdown de 3 slides para ${homeUpper} vs ${awayUpper}: contexto, PGS® y pick temprano.`,
      hashtags: ['#PredictaGol', '#Mundial2026', hashtagFor(homeUpper), hashtagFor(awayUpper), '#ElDato'],
      platform_copy: {
        instagram: {
          format: 'breakdown_carousel',
          caption,
          hashtags: ['#PredictaGol', '#Mundial2026', hashtagFor(homeUpper), hashtagFor(awayUpper), '#ElDato'],
          alt_text: `Breakdown de 3 slides para ${homeUpper} vs ${awayUpper}: contexto, PGS® y pick temprano.`,
          asset_keys: ['slide_1', 'slide_2', 'slide_3'],
        },
        x: {
          format: 'breakdown_thread',
          text:
            `Breakdown temprano: ${homeUpper} vs ${awayUpper} 🧵\n\n` +
            `1/ PGS® inicial: ${pgsHome}-${pgsAway}\n2/ Pick temprano: ${pickShort}\n3/ La clave será el primer gol y cómo cambia la quiniela.`,
          reply_text: 'Guarda el partido y revisa el contexto completo en predictagol.com',
          hashtags: ['#WorldCup2026'],
        },
        threads: {
          format: 'short_list',
          text:
            `3 señales a 48h de ${homeUpper} vs ${awayUpper}:\n\n` +
            `1. PGS® inicial ${pgsHome}-${pgsAway}\n` +
            `2. Pick temprano: ${pickShort}\n` +
            `3. La primera media hora puede cambiar toda la quiniela.\n\n` +
            `¿Cuál señal estás viendo tú?`,
          hashtags: ['#PredictaGol'],
        },
      },
    },
  };
}

function buildOfficialPredictionPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort, hook }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, 't_minus_24h');
  const expiresAt = expiresForWindow(cdmxIso, 't_minus_24h');
  const text =
    `Pronóstico oficial PredictaGol: ${homeUpper} vs ${awayUpper}\n\n` +
    `📊 PGS® ${pgsHome}-${pgsAway}\n🎯 Pick: ${pickShort}\n\n` +
    `${hook}`;
  return {
    title: `${homeUpper} vs ${awayUpper}: T-24 predicción oficial`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['instagram', 'x', 'threads'],
    priority: 9,
    expires_at: expiresAt,
    payload: {
      template: 'data-callout',
      format_variant: 'data_callout',
      scheduled_for: scheduled,
      window_key: 't_minus_24h',
      window_label: POST_WINDOWS.t_minus_24h.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso, venue: venueDisplay },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      bigNumber: `${pgsHome}-${pgsAway}`,
      eyebrow: `PICK ${homeUpper} vs ${awayUpper}`,
      subtitle: `Predicción oficial PredictaGol para ${venueDisplay}`,
      cta: 'Tu pick en predictagol.com',
      caption: text,
      alt_text: `Tarjeta de predicción oficial para ${homeUpper} vs ${awayUpper}, PGS® ${pgsHome}-${pgsAway}.`,
      hashtags: ['#PredictaGol', '#Mundial2026', hashtagFor(homeUpper), hashtagFor(awayUpper), '#PronosticoDelDia'],
      platform_copy: {
        instagram: {
          format: 'carousel_or_feed_graphic',
          caption: `${text}\n\nGuárdalo y vuelve mañana para revisar si cambió algo con alineaciones.`,
          hashtags: ['#PredictaGol', '#Mundial2026', hashtagFor(homeUpper), hashtagFor(awayUpper), '#PronosticoDelDia'],
          alt_text: `Tarjeta de predicción oficial para ${homeUpper} vs ${awayUpper}, PGS® ${pgsHome}-${pgsAway}.`,
        },
        x: {
          format: 'single_hot_take',
          text:
            `Hot take PredictaGol: ${pickShort} en ${homeUpper} vs ${awayUpper}.\n\n` +
            `PGS® ${pgsHome}-${pgsAway}. ${hook}\n\n` +
            `Mañana vemos si el XI confirma o nos obliga a mover la quiniela.`,
          reply_text: 'Más contexto en predictagol.com',
          hashtags: ['#WorldCup2026'],
        },
        threads: {
          format: 'cross_posted_graphic_rewritten_caption',
          text:
            `Misma gráfica, otra conversación: ${homeUpper} vs ${awayUpper}.\n\n` +
            `Nuestro pick oficial es ${pickShort}, pero aquí va la pregunta real: ` +
            `¿es lectura lógica o estamos subestimando la sorpresa?`,
          hashtags: ['#PredictaGol'],
        },
      },
    },
  };
}

function buildCommunityPollPayload({ home, away, cdmxIso, pickShort }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, 't_minus_4h');
  const expiresAt = expiresForWindow(cdmxIso, 't_minus_4h');
  const question = '¿Quién gana?';
  const platformCopy = {
    instagram: {
      format: 'story_poll_video',
      caption:
        `Poll de comunidad: ${homeUpper} vs ${awayUpper}\n\n` +
        `Sticker sugerido: ¿Quién gana?\nOpciones: ${homeUpper} / Empate / ${awayUpper}\n\n` +
        `Nuestro pick temprano: ${pickShort}`,
      hashtags: ['#PredictaGol', '#Mundial2026', '#QuinielaPredictaGol'],
      alt_text: `Video corto de poll de comunidad para ${homeUpper} vs ${awayUpper}, con logo PredictaGol, signo de pregunta y banderas de ambos equipos.`,
      asset_keys: ['animated_mp4', '1080x1080'],
    },
    x: {
      format: 'native_poll',
      text:
        `Poll a 4h: ${homeUpper} vs ${awayUpper}\n\n` +
        `¿Qué marcas en tu quiniela?\n\n` +
        `Opciones sugeridas: ${homeUpper} / Empate / ${awayUpper} / No sé`,
      hashtags: ['#WorldCup2026'],
    },
    threads: {
      format: 'debate_prompt',
      text:
        `Debate a 4h: ${homeUpper} vs ${awayUpper}.\n\n` +
        `PredictaGol trae ${pickShort}, pero quiero leer argumentos en contra. ¿Qué dato te haría cambiar la quiniela?`,
      hashtags: ['#PredictaGol'],
    },
  };
  return {
    title: `${homeUpper} vs ${awayUpper}: T-4 poll comunidad`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'quiniela_challenge',
    platforms: ['instagram', 'x', 'threads'],
    priority: 8,
    expires_at: expiresAt,
    payload: {
      template: 'poll-question-video',
      format_variant: 'poll_question_mp4',
      scheduled_for: scheduled,
      window_key: 't_minus_4h',
      window_label: POST_WINDOWS.t_minus_4h.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      question,
      challengeQuestion: question,
      caption: platformCopy.instagram.caption,
      hashtags: platformCopy.instagram.hashtags,
      alt_text: platformCopy.instagram.alt_text,
      platform_copy: platformCopy,
      notes: 'Usa el MP4 animado como primera opción para Instagram; si la plataforma no lo acepta, usa el PNG 1080x1080 como fallback y agrega el sticker de poll manualmente.',
    },
  };
}

function buildFinalPredictionPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort, hook }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const kickoffHuman = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  }).format(new Date(cdmxIso));
  const scheduled = scheduledForWindow(cdmxIso, 't_minus_60');
  const expiresAt = expiresForWindow(cdmxIso, 't_minus_60');
  const platformCopy = platformCopyForFinalPrediction({ homeUpper, awayUpper, kickoffHuman, hook, pgsHome, pgsAway, pickShort });
  return {
    title: `${homeUpper} vs ${awayUpper}: T-60 predicción final`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['instagram', 'x', 'threads'],
    priority: 8,
    expires_at: expiresAt,
    payload: {
      template: 'pronostico-carousel-3up',
      format_variant: 'carousel_3up',
      scheduled_for: scheduled,
      window_key: 't_minus_60',
      window_label: POST_WINDOWS.t_minus_60.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso, venue: venueDisplay },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      slideTitle: `${homeUpper} vs ${awayUpper}`,
      kickoff: cdmxIso,
      venue: venueDisplay,
      pgsHome: String(pgsHome),
      pgsAway: String(pgsAway),
      pickShort,
      hook,
      cta: 'Tu pick en predictagol.com',
      caption: platformCopy.instagram.caption,
      alt_text: platformCopy.instagram.alt_text,
      hashtags: platformCopy.instagram.hashtags,
      platform_copy: platformCopy,
    },
  };
}

function buildXStatPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, hookCallout }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, 't_minus_15');
  const expiresAt = expiresForWindow(cdmxIso, 't_minus_15');
  const text =
    `Dato a 15 minutos del ${homeUpper} vs ${awayUpper}:\n\n` +
    `PGS® ${pgsHome}-${pgsAway}. ${hookCallout}\n\n` +
    'Si cambia el partido temprano, volvemos en HT.';
  return {
    title: `PGS® ${homeUpper} ${pgsHome}-${pgsAway} ${awayUpper} — T-15 dato clave`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'datos_curiosos',
    platforms: ['x'],
    priority: 7,
    expires_at: expiresAt,
    payload: {
      template: 'data-callout',
      format_variant: 'data_callout',
      scheduled_for: scheduled,
      window_key: 't_minus_15',
      window_label: POST_WINDOWS.t_minus_15.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso, venue: venueDisplay },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      bigNumber: `${pgsHome}-${pgsAway}`,
      eyebrow: `PGS® ${homeUpper} vs ${awayUpper}`,
      subtitle: `Nuestro PredictaGoal Score para el partido de hoy en ${venueDisplay}`,
      cta: 'Más datos en predictagol.com',
      caption: text,
      alt_text: `Tarjeta cuadrada con el número PGS® ${pgsHome}-${pgsAway} para ${homeUpper} vs ${awayUpper}.`,
      hashtags: ['#PredictaGol', '#WorldCup2026'],
      platform_copy: {
        x: {
          format: 'quote_post',
          text:
            `Para quote-postear sobre una alineación/dato oficial de ${homeUpper} vs ${awayUpper}:\n\n` +
            `PGS® ${pgsHome}-${pgsAway}. ${hookCallout}\n\n` +
            `Si el primer tramo confirma esto, el pick se sostiene.`,
          hashtags: ['#PredictaGol', '#WorldCup2026'],
          instructions: 'Busca un post reciente de FIFA/equipo/periodista sobre lineups o dato del partido; usa este texto como quote post. Si no hay post útil, publícalo como single hot take.',
        },
      },
    },
  };
}

function buildTextOnlyPayload({ home, away, cdmxIso, windowKey, pillar, titleSuffix, platforms, priority, textByPlatform }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, windowKey);
  const expiresAt = expiresForWindow(cdmxIso, windowKey);
  return {
    title: `${homeUpper} vs ${awayUpper}: ${titleSuffix}`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar,
    platforms,
    priority,
    expires_at: expiresAt,
    payload: {
      scheduled_for: scheduled,
      window_key: windowKey,
      window_label: POST_WINDOWS[windowKey]?.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso },
      caption: textByPlatform[platforms[0]]?.text || textByPlatform[platforms[0]]?.caption,
      hashtags: textByPlatform[platforms[0]]?.hashtags || [],
      platform_copy: textByPlatform,
      notes: 'Texto listo para copiar/pegar; no requiere asset visual.',
    },
  };
}

function buildHalftimePayload({ home, away, cdmxIso, pgsHome, pgsAway, pickShort }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  return buildTextOnlyPayload({
    home, away, cdmxIso,
    windowKey: 'halftime',
    pillar: 'quiniela_challenge',
    titleSuffix: 'HT debate en vivo',
    platforms: ['x', 'threads'],
    priority: 6,
    textByPlatform: {
      x: {
        format: 'live_reply',
        text: `Reply live para HT en ${homeUpper} vs ${awayUpper}:\n\nEl pick inicial era ${pickShort} (PGS® ${pgsHome}-${pgsAway}). Si viste el primer tiempo, ¿qué cambió: ritmo, bandas o pelota parada?`,
        hashtags: ['#WorldCup2026'],
      },
      threads: {
        format: 'match_thread_reply',
        text: `Para responder en un thread activo del partido:\n\nMedio tiempo en ${homeUpper} vs ${awayUpper}. Si tuvieras que cambiar tu quiniela ahora mismo, ¿te quedas con ${pickShort} o ves giro en el segundo tiempo?`,
        hashtags: ['#PredictaGol'],
      },
    },
  });
}

function buildRecapPayload({ home, away, cdmxIso, pickShort }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  const scheduled = scheduledForWindow(cdmxIso, 'fulltime_plus_30');
  const expiresAt = expiresForWindow(cdmxIso, 'fulltime_plus_30');
  const platformCopy = {
      instagram: {
        format: 'accountability_recap',
        caption: `${homeUpper} vs ${awayUpper}: tocó revisar la libreta.\n\nPick inicial: ${pickShort}.\n\n¿Fue lectura fina o nos quemó el Mundial? Este recap es para guardar la racha con transparencia.`,
        script:
          `Reel/Story recap 7-20s:\n` +
          `1. Mostrar resultado final.\n` +
          `2. Mostrar pick inicial: ${pickShort}.\n` +
          `3. Cerrar con "acierto o error, aquí se rinde cuentas".`,
        hashtags: ['#PredictaGol', '#Mundial2026', '#PronosticoDelDia'],
        alt_text: `Tarjeta de rendición de cuentas FT+30 para ${homeUpper} vs ${awayUpper}, con banderas, pick inicial y llamada a comparar predicción vs realidad.`,
        asset_keys: ['1080x1080'],
      },
      x: {
        format: 'thread',
        text: `FT ${homeUpper} vs ${awayUpper}: hilo de rendición de cuentas 🧵\n\n1/ Pick inicial: ${pickShort}\n2/ Lo que cambió el partido:\n3/ Qué ajusta PredictaGol para la próxima quiniela:`,
        hashtags: ['#WorldCup2026'],
      },
      threads: {
        format: 'accountability_prompt',
        text: `${homeUpper} vs ${awayUpper}: hora de rendir cuentas.\n\nNuestro pick inicial fue ${pickShort}. Si acertamos, ¿qué señal lo anticipó? Si fallamos, ¿qué nos faltó leer?`,
        hashtags: ['#PredictaGol'],
      },
  };
  return {
    title: `${homeUpper} vs ${awayUpper}: FT+30 recap predicción vs realidad`,
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'momento_del_partido',
    platforms: ['instagram', 'x', 'threads'],
    priority: 6,
    expires_at: expiresAt,
    payload: {
      template: 'accountability-recap',
      format_variant: 'accountability_recap',
      scheduled_for: scheduled,
      window_key: 'fulltime_plus_30',
      window_label: POST_WINDOWS.fulltime_plus_30.label,
      expires_at: expiresAt,
      target_match: { home: homeUpper, away: awayUpper, kickoff_iso: cdmxIso },
      homeTeam: homeUpper,
      awayTeam: awayUpper,
      flagCodeHome: home.flag,
      flagCodeAway: away.flag,
      headline: 'Tocó rendir cuentas',
      pickShort,
      caption: platformCopy.instagram.caption,
      hashtags: platformCopy.instagram.hashtags,
      alt_text: platformCopy.instagram.alt_text,
      platform_copy: platformCopy,
      notes: 'Visual requerido para Instagram: usa la tarjeta 1080x1080 como base del recap y completa el resultado/contexto al publicar.',
    },
  };
}

function buildNextMorningPayload({ home, away, cdmxIso, pgsHome, pgsAway }) {
  const homeUpper = home.displayName;
  const awayUpper = away.displayName;
  return buildTextOnlyPayload({
    home, away, cdmxIso,
    windowKey: 'next_morning',
    pillar: 'datos_curiosos',
    titleSuffix: 'mañana siguiente dato para guardar',
    platforms: ['instagram', 'threads'],
    priority: 4,
    textByPlatform: {
      instagram: {
        format: 'carousel_for_saves',
        caption: `${homeUpper} vs ${awayUpper} dejó una pista para la siguiente quiniela.\n\nPGS® inicial: ${pgsHome}-${pgsAway}. Guarda este dato antes de revisar los próximos partidos.`,
        hashtags: ['#PredictaGol', '#Mundial2026', '#ElDato'],
      },
      threads: {
        format: 'short_list',
        text: `3 notas para la siguiente quiniela después de ${homeUpper} vs ${awayUpper}:\n\n1. PGS® inicial: ${pgsHome}-${pgsAway}\n2. La señal que más pesó: ritmo del primer tramo\n3. Lo que hay que vigilar mañana: ajustes y cansancio\n\n¿Qué equipo te hizo cambiar el bracket?`,
        hashtags: ['#PredictaGol'],
      },
    },
  });
}

const OUT_ROOT = (id) => `.squad\\agents\\shuri\\outputs\\creative\\${activeTargetDate}\\${id}`;

function toRelativeAssets(assets) {
  const out = {};
  for (const [key, value] of Object.entries(assets)) {
    if (key === 'slides') continue;
    if (typeof value !== 'string') continue;
    out[key] = relative(repoRoot, value) || value;
  }
  return out;
}

async function ensureCard(db, { id, builder, expectAssets }) {
  const def = builder();
  let card = getCard(db, id);
  const variantLabel = def.payload.format_variant || def.payload.window_key || 'text_only';
  if (!card) {
    if (dryRun) { console.log(`  + would insert ${id} (${variantLabel})`); return; }
    await insertCard(db, { ...def, id, actor: 'seeder' });
    console.log(`  + inserted ${id} (${variantLabel})`);
  } else {
    if (dryRun) { console.log(`  ~ would update ${id} (${variantLabel})`); return; }
    await updateCard(db, id, {
      title: def.title,
      stage: 'to_be_posted',
      owner: def.owner,
      pillar: def.pillar,
      platforms: def.platforms,
      priority: def.priority,
      expires_at: def.expires_at,
      payload: { ...card.payload, ...def.payload },
      actor: 'seeder',
    });
    console.log(`  ~ updated ${id} (${variantLabel})`);
  }
  card = getCard(db, id);
  if (!expectAssets.length) return;
  const outDir = OUT_ROOT(id);
  const assets = await renderCardAssets(card, { outDir });
  for (const key of expectAssets) {
    if (!assets[key]) throw new Error(`${id}: missing asset ${key}`);
    const size = statSync(assets[key]).size;
    if (size < 5000) throw new Error(`${id} ${key} too small (${size}b)`);
  }

  const relAssets = toRelativeAssets(assets);
  await updateCard(db, id, {
    payload: { ...card.payload, assets: relAssets },
    actor: 'seeder',
  });
  console.log(`    ✓ rendered ${expectAssets.length} asset(s)`);
}

function fixturePriority(fx) {
  const codes = [fx.home.code, fx.away.code];
  const hostBoost = codes.some((code) => ['MEX', 'USA', 'CAN'].includes(code)) ? 100 : 0;
  const eliteBoost = codes.some((code) => ['ARG', 'BRA', 'FRA', 'ESP', 'ENG', 'NED'].includes(code)) ? 30 : 0;
  return hostBoost + eliteBoost;
}

function pickFeaturedFixtures(fixtures) {
  return [...fixtures]
    .sort((a, b) => fixturePriority(b) - fixturePriority(a) || String(a.utcIso).localeCompare(String(b.utcIso)))
    .slice(0, MAX_FEATURED_MATCHES);
}

function cardIdFor(home, away, kind) {
  // Card IDs must be `c_` + 4 lowercase hex chars (see marketing-board/lib/cards.js).
  // Build a stable 4-hex from sha1(home|away|date|kind) so repeated runs produce the
  // same ID. Collisions are checked by the seeder via getCard before insert.
  const seed = `${home.code}|${away.code}|${activeTargetDate}|${kind}`;
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 4);
  return `c_${hex}`;
}

async function seedTargetDate(db, cupText, targetDate) {
  activeTargetDate = targetDate;
  const fixtures = parseCupForDate(cupText, targetDate);

  console.log(`\n[seed] Target CDMX date: ${targetDate}`);
  console.log(`[seed] Matches found in cup.txt: ${fixtures.length}`);
  if (fixtures.length === 0) {
    console.log('[seed] Nothing to seed for this date.');
    return { seededFixtures: 0, featuredFixtures: 0 };
  }

  const featuredFixtures = pickFeaturedFixtures(fixtures);
  if (featuredFixtures.length < fixtures.length) {
    console.log(`[seed] Featured cap: ${featuredFixtures.length}/${fixtures.length} match(es) selected (--max=${MAX_FEATURED_MATCHES}).`);
  }

  let seededFixtures = 0;
  for (const fx of featuredFixtures) {
    const { home, away, venue, cdmxIso, utcIso } = fx;
    const venueDisplay = venueShort(venue);
    const { key, content, sourceKey } = fixtureContentFor(home, away, targetDate, utcIso);

    let pgsHome, pgsAway, pickShort, hookCarousel, hookCallout;
    if (!content && !allowPlaceholder) {
      console.warn(`[seed] Skipping ${key}: no fixture content yet. Use --allow-placeholder only for demos.`);
      continue;
    }

    if (content?.pgs) {
      pgsHome = content.pgs.home;
      pgsAway = content.pgs.away;
      pickShort = pickShortFrom(content, pickFallback(pgsHome, pgsAway, home, away));
      hookCarousel = fallbackHook(home, away);
      hookCallout = fallbackHook(home, away);
    } else {
      console.warn(`[seed] No fixture content for ${key} — using neutral placeholder PGS 1-1.`);
      pgsHome = 1; pgsAway = 1;
      pickShort = 'Empate como pick inicial';
      hookCarousel = fallbackHook(home, away);
      hookCallout = fallbackHook(home, away);
    }

    console.log(`\n— ${home.displayName} vs ${away.displayName} (${key}${sourceKey ? ` via ${sourceKey}` : ''})  kickoff ${cdmxIso}  @ ${venueDisplay}`);

    const breakdownId = cardIdFor(home, away, 't48');
    await ensureCard(db, {
      id: breakdownId,
      expectAssets: ['slide_1', 'slide_2', 'slide_3'],
      builder: () => buildBreakdownPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort }),
    });

    const officialId = cardIdFor(home, away, 't24');
    await ensureCard(db, {
      id: officialId,
      expectAssets: ['1080x1080'],
      builder: () => buildOfficialPredictionPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort, hook: hookCarousel }),
    });

    const pollId = cardIdFor(home, away, 't4');
    await ensureCard(db, {
      id: pollId,
      expectAssets: ['animated_mp4', '1080x1080'],
      builder: () => buildCommunityPollPayload({ home, away, cdmxIso, pickShort }),
    });

    const finalId = cardIdFor(home, away, 't60');
    await ensureCard(db, {
      id: finalId,
      expectAssets: ['slide_1', 'slide_2', 'slide_3'],
      builder: () => buildFinalPredictionPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, pickShort, hook: hookCarousel }),
    });

    const xId = cardIdFor(home, away, 't15x');
    await ensureCard(db, {
      id: xId,
      expectAssets: ['1080x1080'],
      builder: () => buildXStatPayload({ home, away, cdmxIso, venueDisplay, pgsHome, pgsAway, hookCallout }),
    });

    const halftimeId = cardIdFor(home, away, 'ht');
    await ensureCard(db, {
      id: halftimeId,
      expectAssets: [],
      builder: () => buildHalftimePayload({ home, away, cdmxIso, pgsHome, pgsAway, pickShort }),
    });

    const recapId = cardIdFor(home, away, 'recap');
    await ensureCard(db, {
      id: recapId,
      expectAssets: ['1080x1080'],
      builder: () => buildRecapPayload({ home, away, cdmxIso, pickShort }),
    });

    const nextId = cardIdFor(home, away, 'nextam');
    await ensureCard(db, {
      id: nextId,
      expectAssets: [],
      builder: () => buildNextMorningPayload({ home, away, cdmxIso, pgsHome, pgsAway }),
    });
    seededFixtures += 1;
  }

  console.log(`\n[seed] OK — ${seededFixtures}/${featuredFixtures.length} featured match(es) seeded for ${targetDate} (IG/X/Threads timed tasks).`);
  return { seededFixtures, featuredFixtures: featuredFixtures.length };
}

async function main() {
  const cupPath = resolve(repoRoot, 'data', 'static', 'openfootball', 'cup.txt');
  const cupText = readFileSync(cupPath, 'utf8');
  if (!dateArg) {
    console.log(`[seed] Rolling default dates: ${TARGET_DATES.join(', ')} (tomorrow + two days ahead, CDMX).`);
  }

  runMigrations();
  const db = getDb();
  let totalSeeded = 0;
  let totalFeatured = 0;
  for (const targetDate of TARGET_DATES) {
    const result = await seedTargetDate(db, cupText, targetDate);
    totalSeeded += result.seededFixtures;
    totalFeatured += result.featuredFixtures;
  }
  closeDb();
  console.log(`\n[seed] DONE — ${totalSeeded}/${totalFeatured} featured match(es) seeded across ${TARGET_DATES.length} date(s).`);
}

await main();
