// Renders the SVG for each to_be_posted card at all 3 sizes and asserts that
// every word from the card title appears in the SVG output as visible text.
// This is the "validation step" that confirms full desired text is visible
// before declaring images ready.

import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { templates } = await import('../renderers/index.js');
const {
  ACTIVE_SOCIAL_PLATFORMS,
  OPTIONAL_SOCIAL_PLATFORMS,
  RETIRED_DAILY_PLATFORMS,
  isPlatformPaused,
  platformDisplayName,
} = await import('../lib/socialStrategy.js');
const TEMPLATE_BY_PILLAR = {
  pronostico_del_dia: 'pronostico-del-dia',
  quiniela_challenge: 'quiniela-challenge',
  datos_curiosos: 'datos-curiosos',
  tu_equipo_tu_data: 'tu-equipo-tu-data',
  launch: 'launch-announcement',
  momento_del_partido: 'quiniela-challenge',
};
const SIZES = [
  { key: '1080x1920', w: 1080, h: 1920 },
  { key: '1080x1350', w: 1080, h: 1350 },
  { key: '1080x1080', w: 1080, h: 1080 },
];

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text) {
  return stripAccents(String(text || ''))
    .toUpperCase()
    .split(/[^A-Z0-9]+/u)
    .filter((w) => w && w.length >= 3);
}

function visibleText(svg) {
  // Extract text inside <text>...</text> and <tspan>...</tspan>
  return Array.from(svg.matchAll(/<(?:text|tspan)[^>]*>([^<]*)<\/(?:text|tspan)>/g))
    .map((m) => m[1])
    .join(' ');
}

const db = new Database('marketing.sqlite', { readonly: true });
const rows = db
  .prepare("SELECT id, title, pillar, platforms_json, payload_json FROM cards WHERE stage = 'to_be_posted' ORDER BY id")
  .all();

let failed = 0;
const instagramScheduleRows = [];
const BANNED_SOCIAL_TERMS = [
  'momios',
  'apuesta',
  'apuestas',
  'apostar',
  'casa de apuestas',
  'betting',
  'bet',
  'odds',
  'sportsbook',
  'wager',
  'gana dinero',
  'gana premio',
  'parlay',
  '+EV',
];
const BAIT_PATTERNS = [
  /\blike if\b/i,
  /\bretweet if\b/i,
  /\bshare to unlock\b/i,
  /\bcomment\s+[ab]\b/i,
  /\btag\s+5\b/i,
  /\betiqueta\s+5\b/i,
  /\bcomenta\s+[ab]\b/i,
  /\bdale like si\b/i,
];
const IG_RISK_PATTERNS = [
  /\bsticker sugerido\b/i,
  /\bnuestro pick\b/i,
  /\bpick (?:final|temprano|oficial)\b/i,
  /\bpronóstico oficial\b/i,
  /\balgoritmo\b/i,
  /\bveredicto\b/i,
];

function socialText(payload) {
  const copy = payload.platform_copy && typeof payload.platform_copy === 'object' ? payload.platform_copy : {};
  const parts = [payload.caption, payload.copy, payload.text, payload.hook, payload.cta];
  for (const platformCopy of Object.values(copy)) {
    if (!platformCopy || typeof platformCopy !== 'object') continue;
    parts.push(platformCopy.caption, platformCopy.text, platformCopy.reply_text, platformCopy.cta);
  }
  return parts.filter(Boolean).join('\n');
}

function validateHashtags(row, payload) {
  const copy = payload.platform_copy && typeof payload.platform_copy === 'object' ? payload.platform_copy : {};
  const platformEntries = Object.keys(copy).length ? Object.entries(copy) : [['generic', payload]];
  for (const [platform, platformCopy] of platformEntries) {
    const hashtags = platformCopy?.hashtags ?? [];
    if (!Array.isArray(hashtags)) continue;
    if (platform === 'instagram' && (hashtags.length < 3 || hashtags.length > 5)) {
      console.log(`  ✗ ${row.id} [instagram] expected 3-5 hashtags, found ${hashtags.length}`);
      failed += 1;
    }
    if ((platform === 'x' || platform === 'threads') && hashtags.length > 2) {
      console.log(`  ✗ ${row.id} [${platform}] expected at most 2 hashtags, found ${hashtags.length}`);
      failed += 1;
    }
  }
}

function validatePolicy(row, payload) {
  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  const text = socialText(payload);
  const lower = text.toLowerCase();
  for (const platform of platforms) {
    if (isPlatformPaused(platform)) {
      console.log(`  ✗ ${row.id} targets paused platform: ${platformDisplayName(platform)}`);
      failed += 1;
    }
    if (RETIRED_DAILY_PLATFORMS.includes(platform)) {
      console.log(`  ✗ ${row.id} uses retired daily platform: ${platform}`);
      failed += 1;
    }
    if (![...ACTIVE_SOCIAL_PLATFORMS, ...OPTIONAL_SOCIAL_PLATFORMS].includes(platform)) {
      console.log(`  ✗ ${row.id} uses unknown platform: ${platform}`);
      failed += 1;
    }
  }
  for (const term of BANNED_SOCIAL_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = term === '+EV'
      ? /\+EV/i
      : new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu');
    if (pattern.test(lower)) {
      console.log(`  ✗ ${row.id} contains banned social term "${term}"`);
      failed += 1;
    }
  }
  for (const pattern of BAIT_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`  ✗ ${row.id} contains engagement-bait pattern ${pattern}`);
      failed += 1;
    }
  }
  if (/https?:\/\/(?:www\.)?(?:bet|sportsbook|casino)/i.test(text)) {
    console.log(`  ✗ ${row.id} contains unsafe betting/casino link`);
    failed += 1;
  }
}

function validateInstagramCopy(row, payload) {
  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  if (!platforms.includes('instagram')) return;
  const igCopy = payload.platform_copy?.instagram || {};
  const text = [igCopy.caption, igCopy.text, igCopy.cta, payload.caption, payload.cta]
    .filter(Boolean)
    .join('\n');
  for (const pattern of IG_RISK_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`  ✗ ${row.id} [instagram] contains risky account-review phrasing ${pattern}`);
      failed += 1;
    }
  }
}

function collectInstagramSchedule(row, payload) {
  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  if (!platforms.includes('instagram')) return;
  const localDate = String(payload.scheduled_for || '').slice(0, 10) || 'unscheduled';
  instagramScheduleRows.push({ id: row.id, localDate });
}

function normalizeCopyForDupe(value) {
  return String(value || '').toLowerCase().replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
}

function validateDuplicatePlatformCopy(row, payload) {
  const copy = payload.platform_copy && typeof payload.platform_copy === 'object' ? payload.platform_copy : {};
  const seen = new Map();
  for (const [platform, platformCopy] of Object.entries(copy)) {
    const text = normalizeCopyForDupe(platformCopy?.caption || platformCopy?.text);
    if (!text) continue;
    if (seen.has(text)) {
      console.log(`  ✗ ${row.id} duplicates platform copy for ${seen.get(text)} and ${platform}`);
      failed += 1;
    }
    seen.set(text, platform);
  }
}

function mp4HasAudio(assetPath) {
  if (!assetPath) return false;
  try {
    execFileSync(ffmpeg.path, ['-hide_banner', '-i', resolve(repoRoot, assetPath)], { stdio: 'pipe' });
  } catch (error) {
    const output = Buffer.concat([
      Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.from(String(error.stdout || '')),
      Buffer.isBuffer(error.stderr) ? error.stderr : Buffer.from(String(error.stderr || '')),
    ]).toString('utf8');
    return /\bAudio:/i.test(output);
  }
  return false;
}

for (const row of rows) {
  const payload = JSON.parse(row.payload_json || '{}');
  row.platforms = JSON.parse(row.platforms_json || '[]');
  payload.platforms = row.platforms;
  validatePolicy(row, payload);
  validateInstagramCopy(row, payload);
  collectInstagramSchedule(row, payload);
  validateHashtags(row, payload);
  validateDuplicatePlatformCopy(row, payload);
  const assets = payload.assets && typeof payload.assets === 'object' ? payload.assets : {};
  if (Object.keys(assets).length === 0) {
    console.log(`  ✗ ${row.id} requires at least one rendered visual asset`);
    failed += 1;
  }
  if (!payload.template && !payload.format_variant && !payload.assets) {
    console.log(`  ✓ ${row.id} [text-only] policy checks passed`);
    continue;
  }
  if (payload.template === 'pronostico-carousel-3up' || payload.format_variant === 'carousel_3up') {
    const assets = payload.assets && typeof payload.assets === 'object' ? payload.assets : {};
    const slides = Object.keys(assets).filter((key) => /^slide_\d+$/i.test(key));
    if (slides.length < 3) {
      console.log(`  ✗ ${row.id} [carousel_3up] expected at least 3 rendered slide assets, found ${slides.length}`);
      failed += 1;
    } else {
      console.log(`  ✓ ${row.id} [carousel_3up] ${slides.length} rendered slide assets present`);
    }
    continue;
  }
  if (payload.template === 'poll-question-gif' || payload.template === 'poll-question-video' || payload.format_variant === 'poll_question_gif' || payload.format_variant === 'poll_question_mp4') {
    const missing = ['animated_mp4', '1080x1080'].filter((key) => !assets[key]);
    if (missing.length) {
      console.log(`  ✗ ${row.id} [poll-question-video] missing assets: ${missing.join(', ')}`);
      failed += 1;
    } else if (!mp4HasAudio(assets.animated_mp4)) {
      console.log(`  ✗ ${row.id} [poll-question-video] animated MP4 is missing audio`);
      failed += 1;
    } else {
      console.log(`  ✓ ${row.id} [poll-question-video] animated MP4 with audio and PNG fallback present`);
    }
    continue;
  }
  const card = { id: row.id, title: row.title, pillar: row.pillar, payload };
  const templateHint = payload.template;
  const templateName =
    (templateHint && templates[templateHint] ? templateHint : null) ||
    TEMPLATE_BY_PILLAR[card.pillar] ||
    'launch-announcement';
  const template = templates[templateName];

  // Pick the most important "must-be-visible" string per template.
  // tu-equipo-tu-data is a fixed stat-card layout: card.title is editorial
  // caption copy, NOT visual text — only the team name + section header render.
  let required;
  if (templateName === 'launch-announcement') required = card.title;
  else if (templateName === 'pronostico-del-dia') required = card.title;
  else if (templateName === 'quiniela-challenge') required = payload.challengeQuestion || card.title;
  else if (templateName === 'datos-curiosos') required = payload.statLine || card.title;
  else if (templateName === 'data-callout') required = payload.eyebrow || payload.bigNumber || card.title;
  else if (templateName === 'halftime-debate') required = payload.question || card.title;
  else if (templateName === 'accountability-recap') required = payload.headline || '¿Acierto o error?';
  else if (templateName === 'next-morning-saveable') required = payload.lesson || payload.pgsScore || card.title;
  else if (templateName === 'tu-equipo-tu-data') required = payload.homeTeam || 'México';
  else required = card.title;

  const requiredWords = tokenize(required);

  const sizes = templateName === 'data-callout' ? [{ key: '1080x1080', w: 1080, h: 1080 }] : SIZES;
  for (const { key, w, h } of sizes) {
    const svg = template(card, { width: w, height: h });
    const haystack = ` ${tokenize(visibleText(svg)).join(' ')} `;
    const missing = requiredWords.filter((word) => !haystack.includes(` ${word} `));
    if (missing.length > 0) {
      console.log(`  ✗ ${row.id} [${templateName} ${key}] missing words: ${missing.join(', ')}`);
      console.log(`     required: "${required}"`);
      failed += 1;
    } else {
      console.log(`  ✓ ${row.id} [${templateName} ${key}] all ${requiredWords.length} title words visible`);
    }
  }
}

db.close();

const igByDate = new Map();
for (const row of instagramScheduleRows) {
  if (!igByDate.has(row.localDate)) igByDate.set(row.localDate, []);
  igByDate.get(row.localDate).push(row.id);
}
for (const [localDate, ids] of igByDate) {
  if (ids.length > 1) {
    console.log(`  ✗ Instagram warmup pacing exceeded on ${localDate}: ${ids.join(', ')}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.log(`\n${failed} size(s) failed validation.`);
  process.exit(1);
}
console.log('\nAll cards passed text-visibility validation.');
