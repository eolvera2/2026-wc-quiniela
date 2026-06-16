// Demo: inserts two cards directly into to_be_posted to show new format variants
// on the dashboard. Idempotent: skips if cards with these IDs already exist.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

import { relative } from 'node:path';
const { getDb, runMigrations, closeDb } = await import('../lib/db.js');
const { insertCard, getCard, updateCard } = await import('../lib/cards.js');
const { renderCardAssets } = await import('../renderers/index.js');
const { INITIAL_FIXTURE_CONTENT } = await import('../../src/data/fixtureContent/index.js');

function toRelativeAssets(assets) {
  const out = {};
  for (const [key, value] of Object.entries(assets)) {
    if (key === 'slides') continue;
    if (typeof value !== 'string') continue;
    out[key] = relative(repoRoot, value) || value;
  }
  return out;
}

runMigrations();
const db = getDb();

const WAVE_DATE = '2026-06-12';
const OUT_ROOT = (id) => `.squad\\agents\\shuri\\outputs\\creative\\${WAVE_DATE}\\${id}`;

async function ensureCard({ id, builder, expectAssets }) {
  if (getCard(db, id)) {
    console.log(`  · ${id} already exists, skipping insert.`);
  } else {
    const def = builder();
    await insertCard(db, { ...def, id, actor: 'demo' });
    console.log(`  + inserted ${id} (${def.payload.format_variant})`);
  }
  const card = getCard(db, id);
  if (!card) throw new Error(`Card ${id} not found after insert.`);
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
    actor: 'demo',
  });
  console.log(`    ✓ rendered ${expectAssets.length} asset(s) into ${outDir}`);
  return card;
}

// Demo 1 — data_callout (1080×1080 giant number for X/Threads)
const mexRsa = INITIAL_FIXTURE_CONTENT['MEX-RSA-2026-06-11'];
await ensureCard({
  id: 'c_d101',
  expectAssets: ['1080x1080'],
  builder: () => ({
    title: 'PGS® México 2-1 Sudáfrica — el dato del día',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['x', 'threads'],
    priority: 8,
    payload: {
      template: 'data-callout',
      format_variant: 'data_callout',
      scheduled_for: '2026-06-12T08:30:00-06:00',
      bigNumber: `${mexRsa.pgs.home}-${mexRsa.pgs.away}`,
      eyebrow: 'PGS® MEX vs RSA',
      subtitle: 'Nuestro PredictaGoal Score para el debut de México en casa.',
      cta: 'Más datos en predictagol.com',
      caption:
        `📊 PGS® inicial · México ${mexRsa.pgs.home}-${mexRsa.pgs.away} Sudáfrica\n\n` +
        'Nuestro pick inicial favorece al anfitrión, pero el primer gol cambia toda la conversación.\n\n' +
        '¿Cuál es tu marcador? Compara con la banda en predictagol.com',
      alt_text: 'Tarjeta cuadrada con el número PGS® 2-1 en grande sobre fondo azul marino, indicando el pronóstico inicial de México vs Sudáfrica.',
      hashtags: ['#PredictaGol', '#Mundial2026', '#ElTri', '#PGS'],
    },
  }),
});

// Demo 2 — carousel_3up (3 IG slides for BRA-MAR)
const braMar = INITIAL_FIXTURE_CONTENT['BRA-MAR-2026-06-13'];
const braMarPick = (() => {
  const m = String(braMar?.sections?.quiniela_verdict || '').match(/Pick inicial para quiniela:\s*([^.<]+)\./i);
  return m ? m[1].trim() : 'Brasil con ventaja inicial';
})();
await ensureCard({
  id: 'c_d102',
  expectAssets: ['slide_1', 'slide_2', 'slide_3'],
  builder: () => ({
    title: 'Brasil vs Marruecos: paciencia vs orden',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['instagram', 'facebook'],
    priority: 8,
    payload: {
      template: 'pronostico-carousel-3up',
      format_variant: 'carousel_3up',
      scheduled_for: '2026-06-13T09:00:00-06:00',
      target_match: {
        home: 'Brazil',
        away: 'Morocco',
        kickoff_iso: '2026-06-13T16:00:00-06:00',
        venue: 'New York/New Jersey (East Rutherford)',
      },
      homeTeam: 'Brasil',
      awayTeam: 'Marruecos',
      flagEmojiHome: '🇧🇷',
      flagEmojiAway: '🇲🇦',
      kickoff: '2026-06-13T16:00:00-06:00',
      venue: 'New York/New Jersey (East Rutherford)',
      pgsHome: String(braMar?.pgs?.home ?? '2'),
      pgsAway: String(braMar?.pgs?.away ?? '1'),
      pickShort: braMarPick,
      hook: 'Brasil trae cartel; Marruecos trae orden para hacerlo incómodo.',
      cta: 'Tu pick en predictagol.com',
      caption:
        `Brasil 🇧🇷 vs Marruecos 🇲🇦 mañana\n\n` +
        `Brasil trae cartel; Marruecos trae orden para hacerlo incómodo.\n\n` +
        `📊 PGS® Brasil ${braMar?.pgs?.home ?? '2'}-${braMar?.pgs?.away ?? '1'} Marruecos · 🎯 Pick inicial: ${braMarPick}\n\n` +
        '👉 Desliza el carrusel para ver el desglose. Tu pick en predictagol.com',
      alt_text: 'Carrusel de 3 slides para Brasil vs Marruecos: hook con banderas, datos PGS® y pick inicial, y cierre con CTA.',
      hashtags: ['#PredictaGol', '#Mundial2026', '#Brasil', '#Marruecos', '#PronosticoDelDia'],
    },
  }),
});

closeDb();
console.log('\n[demo] OK — abre el dashboard y revisa c_d101 (data_callout) y c_d102 (carousel_3up).');
