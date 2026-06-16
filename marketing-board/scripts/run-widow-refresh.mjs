// Widow refresh: scans INITIAL_FIXTURE_CONTENT for upcoming fixtures in the next
// 48 hours and seeds fresh pulse_signals cards (idempotent; skips fixtures that
// already have a pulse). Each card gets expires_at = kickoff + 12h so housekeeping
// reaps anything that didn't progress before the match ended.
//
// In production, Widow would fuse:
//   • Trending hashtags / TikTok sounds
//   • Reddit thread velocity
//   • News deltas (lineups, injuries)
//   • Wikimedia page-view spikes
// For Day 1 we wire it to the deterministic fixture window so the lifecycle is
// proven end-to-end. The signal_type field tags how the pulse was sourced.
//
// Usage:
//   node marketing-board/scripts/run-widow-refresh.mjs            # 48h window
//   node marketing-board/scripts/run-widow-refresh.mjs --hours=72 # custom window
//   node marketing-board/scripts/run-widow-refresh.mjs --dry-run

import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { getDb, runMigrations, closeDb } = await import('../lib/db.js');
const { insertCard } = await import('../lib/cards.js');
const { INITIAL_FIXTURE_CONTENT } = await import('../../src/data/fixtureContent/index.js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hoursArg = args.find((a) => a.startsWith('--hours='));
const WINDOW_HOURS = hoursArg ? Number(hoursArg.split('=')[1]) : 48;
const TTL_AFTER_KICKOFF_HOURS = 12;

// FIFA code → friendly Spanish display name + emoji flag. Synced with
// run-shuri-wave1.js TEAM map; extend as new groups light up.
const TEAM = {
  MEX: { es: 'México', flag: '🇲🇽', tag: '#ElTri' },
  RSA: { es: 'Sudáfrica', flag: '🇿🇦', tag: '#Sudafrica' },
  KOR: { es: 'Corea del Sur', flag: '🇰🇷', tag: '#Corea' },
  CZE: { es: 'Chequia', flag: '🇨🇿', tag: '#Chequia' },
  CAN: { es: 'Canadá', flag: '🇨🇦', tag: '#Canada' },
  BIH: { es: 'Bosnia y Herzegovina', flag: '🇧🇦', tag: '#Bosnia' },
  QAT: { es: 'Catar', flag: '🇶🇦', tag: '#Catar' },
  SUI: { es: 'Suiza', flag: '🇨🇭', tag: '#Suiza' },
  BRA: { es: 'Brasil', flag: '🇧🇷', tag: '#Brasil' },
  MAR: { es: 'Marruecos', flag: '🇲🇦', tag: '#Marruecos' },
  HAI: { es: 'Haití', flag: '🇭🇹', tag: '#Haiti' },
  SCO: { es: 'Escocia', flag: '🏴', tag: '#Escocia' },
  USA: { es: 'USA', flag: '🇺🇸', tag: '#USMNT' },
  PAR: { es: 'Paraguay', flag: '🇵🇾', tag: '#Paraguay' },
  AUS: { es: 'Australia', flag: '🇦🇺', tag: '#Australia' },
  TUR: { es: 'Türkiye', flag: '🇹🇷', tag: '#Turkiye' },
  NED: { es: 'Países Bajos', flag: '🇳🇱', tag: '#PaisesBajos' },
  JPN: { es: 'Japón', flag: '🇯🇵', tag: '#Japon' },
  ESP: { es: 'España', flag: '🇪🇸', tag: '#Espana' },
  CPV: { es: 'Cabo Verde', flag: '🇨🇻', tag: '#CaboVerde' },
  FRA: { es: 'Francia', flag: '🇫🇷', tag: '#Francia' },
  SEN: { es: 'Senegal', flag: '🇸🇳', tag: '#Senegal' },
  ENG: { es: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', tag: '#Inglaterra' },
  CRO: { es: 'Croacia', flag: '🇭🇷', tag: '#Croacia' },
  ARG: { es: 'Argentina', flag: '🇦🇷', tag: '#Argentina' },
  ALG: { es: 'Argelia', flag: '🇩🇿', tag: '#Argelia' },
  AUT: { es: 'Austria', flag: '🇦🇹', tag: '#Austria' },
  JOR: { es: 'Jordania', flag: '🇯🇴', tag: '#Jordania' },
};

function teamLabel(code) {
  return TEAM[code]?.es || code;
}

function parseKey(key) {
  // key format: "HOME-AWAY-YYYY-MM-DD" (codes are 3 letters except IVR? no — 3 letters)
  const parts = key.split('-');
  if (parts.length < 5) return null;
  const dateISO = parts.slice(-3).join('-');
  const home = parts[0];
  const away = parts.slice(1, parts.length - 3).join('-');
  return { home, away, dateISO };
}

function kickoffEstimateUTC(dateISO) {
  // We don't have the actual UTC kickoff in INITIAL_FIXTURE_CONTENT, so default
  // to 19:00 UTC (≈ 13:00 CDMX). Real Widow would read /api/fixtures for exact ISO.
  return new Date(`${dateISO}T19:00:00Z`);
}

function pulseTitleFor(home, away, content) {
  const pgs = content?.pgs;
  if (pgs?.home != null && pgs?.away != null) {
    return `Pulse · ${teamLabel(home)} vs ${teamLabel(away)} — PGS ${pgs.home}-${pgs.away}`;
  }
  return `Pulse · ${teamLabel(home)} vs ${teamLabel(away)} — ventana de partido`;
}

runMigrations();
const db = getDb();
const existing = db
  .prepare("SELECT id, payload_json FROM cards WHERE pillar='pulse'")
  .all()
  .map((r) => ({ id: r.id, payload: JSON.parse(r.payload_json || '{}') }));
const existingKeys = new Set(
  existing
    .map((c) => c.payload?.fixture_key)
    .filter(Boolean),
);

const now = new Date();
const horizon = new Date(now.getTime() + WINDOW_HOURS * 3600 * 1000);

const candidates = [];
for (const [key, content] of Object.entries(INITIAL_FIXTURE_CONTENT)) {
  const parsed = parseKey(key);
  if (!parsed) continue;
  const kickoff = kickoffEstimateUTC(parsed.dateISO);
  if (kickoff < now || kickoff > horizon) continue;
  if (existingKeys.has(key)) continue;
  candidates.push({ key, content, ...parsed, kickoff });
}

candidates.sort((a, b) => a.kickoff - b.kickoff);

console.log(`[widow] Window: next ${WINDOW_HOURS}h. Found ${candidates.length} new fixture(s) to pulse.${dryRun ? ' (DRY RUN)' : ''}`);

const today = now.toISOString().slice(0, 10);
const outDir = resolve(repoRoot, '.squad', 'agents', 'widow', 'outputs', 'pulse', today);
mkdirSync(outDir, { recursive: true });

let created = 0;
for (const cand of candidates) {
  const homeEs = teamLabel(cand.home);
  const awayEs = teamLabel(cand.away);
  const pgs = cand.content.pgs || {};
  const title = pulseTitleFor(cand.home, cand.away, cand.content);
  const expiresAt = new Date(cand.kickoff.getTime() + TTL_AFTER_KICKOFF_HOURS * 3600 * 1000).toISOString();
  const hookCandidates = [
    `${homeEs} vs ${awayEs}: el algoritmo PGS ya tiene veredicto.`,
    `Antes del silbatazo: cómo se siente ${homeEs} contra ${awayEs}.`,
    `${homeEs}-${awayEs}: tres datos rápidos para tu pick.`,
  ];
  const payload = {
    signal_type: 'fixture-window',
    fixture_key: cand.key,
    target_match: { home: cand.home, away: cand.away, kickoff_iso: cand.kickoff.toISOString() },
    pgs: pgs.home != null && pgs.away != null ? { home: pgs.home, away: pgs.away } : null,
    hook_candidates: hookCandidates,
    notes: `Pulse incremental generado por Widow refresh — ventana ${WINDOW_HOURS}h. TTL hasta ${expiresAt}.`,
    expires_at: expiresAt,
  };

  console.log(`  · ${cand.key}  kickoff ${cand.kickoff.toISOString()}  expires ${expiresAt}`);
  if (dryRun) continue;

  const card = await insertCard(db, {
    title,
    stage: 'pulse_signals',
    owner: 'widow',
    pillar: 'pulse',
    platforms: [],
    payload,
    priority: 5,
    expires_at: expiresAt,
    actor: 'widow',
    note: 'Pulse incremental (Widow refresh)',
  });

  writeFileSync(
    join(outDir, `${card.id}.json`),
    JSON.stringify({ id: card.id, ...payload }, null, 2),
  );
  created += 1;
}

console.log(`[widow] Created ${created} pulse(s). Snapshots in ${outDir}`);
closeDb();
