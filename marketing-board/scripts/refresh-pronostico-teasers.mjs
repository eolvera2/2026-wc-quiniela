// One-off: refresh to_be_posted Pronóstico cards with PGS® + initial pick teasers
// pulled from src/data/fixtureContent. Updates DB payload + regenerates PNG assets.
// Safe to re-run; idempotent.

import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { renderCardAssets } = await import('../renderers/index.js');
const { INITIAL_FIXTURE_CONTENT } = await import('../../src/data/fixtureContent/index.js');

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

const TEAM_ES = {
  Mexico: 'México',
  'South Africa': 'Sudáfrica',
  Canada: 'Canadá',
  'Bosnia & Herzegovina': 'Bosnia y Herzegovina',
};

function fixtureContentFor(match) {
  if (!match?.home || !match?.away || !match?.kickoff_iso) return null;
  const hc = FIFA_CODE[match.home];
  const ac = FIFA_CODE[match.away];
  if (!hc || !ac) return null;
  return INITIAL_FIXTURE_CONTENT[`${hc}-${ac}-${String(match.kickoff_iso).slice(0, 10)}`] || null;
}

function shortPickFromVerdict(verdict) {
  if (!verdict) return null;
  const m = String(verdict).match(/Pick inicial para quiniela:\s*([^.<]+)\./i);
  return m ? m[1].trim() : null;
}

const db = new Database('marketing.sqlite');
const rows = db
  .prepare("SELECT id, title, pillar, payload_json FROM cards WHERE stage = 'to_be_posted' AND pillar = 'pronostico_del_dia'")
  .all();

if (!rows.length) {
  console.log('No pronostico_del_dia cards in to_be_posted.');
  process.exit(0);
}

const WAVE_DATE = '2026-06-11';
const OUT_ROOT = `.squad\\agents\\shuri\\outputs\\creative\\${WAVE_DATE}`;
const REQUIRED = ['1080x1920', '1080x1350', '1080x1080'];

let updated = 0;
for (const row of rows) {
  const payload = JSON.parse(row.payload_json || '{}');
  const match = payload.target_match || {};
  const content = fixtureContentFor(match);
  if (!content) {
    console.log(`  · ${row.id}: no fixture content match for ${match.home} vs ${match.away}`);
    continue;
  }
  const pgsHome = content.pgs?.home != null ? String(content.pgs.home) : null;
  const pgsAway = content.pgs?.away != null ? String(content.pgs.away) : null;
  const pickShort = shortPickFromVerdict(content.sections?.quiniela_verdict);
  const homeEs = TEAM_ES[match.home] || match.home;
  const awayEs = TEAM_ES[match.away] || match.away;

  const teaserParts = [];
  if (pgsHome && pgsAway) teaserParts.push(`📊 PGS® ${homeEs} ${pgsHome}-${pgsAway} ${awayEs}`);
  if (pickShort) teaserParts.push(`🎯 Pick inicial: ${pickShort}`);
  const teaserLine = teaserParts.length ? `\n\n${teaserParts.join(' · ')}` : '';

  // Rebuild caption: keep everything before/after the existing teaser-or-CTA section.
  // Strategy: drop the existing caption and rebuild from hook + opinion (we can reuse what's stored).
  const oldCaption = String(payload.caption || '');
  // Extract opinion line ("Nuestra lectura: …")
  const opinionMatch = oldCaption.match(/Nuestra lectura: ([^\n]+)/);
  const opinion = opinionMatch
    ? opinionMatch[1].replace(/\.\s*¿Y tú\?\s*$/, '').trim()
    : 'partido de detalles, con el primer gol cambiando toda la conversación';
  const hook = payload.hook || `${homeEs} vs ${awayEs}: lectura rápida para tu pick.`;
  const flag = payload.flagEmojiHome || '🏳️';

  const caption = `${homeEs} vs ${awayEs} hoy ${flag}⚽

${hook}

Nuestra lectura: ${opinion}. ¿Y tú?${teaserLine}

Tu pick en predictagol.com`;

  payload.caption = caption;
  payload.alt_text = `Gráfico de pronóstico del día para ${homeEs} vs ${awayEs}, con horario, sede${pgsHome ? `, PGS® ${pgsHome}-${pgsAway}` : ''} y llamado a compartir tu pick.`;
  if (pgsHome) payload.pgsHome = pgsHome;
  if (pgsAway) payload.pgsAway = pgsAway;
  if (pickShort) payload.pickShort = pickShort;

  db.prepare('UPDATE cards SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), row.id);

  const card = { id: row.id, title: row.title, pillar: row.pillar, payload };
  const outDir = `${OUT_ROOT}\\${row.id}`;
  const results = await renderCardAssets(card, { outDir });
  for (const key of REQUIRED) {
    const size = statSync(results[key]).size;
    if (size < 5_000) throw new Error(`${row.id} ${key} too small (${size} bytes)`);
  }
  console.log(`  ✓ ${row.id}  PGS=${pgsHome}-${pgsAway}  pick="${pickShort}"`);
  updated += 1;
}

db.close();
console.log(`\nUpdated ${updated} pronostico card(s).`);
