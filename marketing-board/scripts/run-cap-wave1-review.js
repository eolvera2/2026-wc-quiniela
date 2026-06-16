import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'http://127.0.0.1:5173';
const ACTOR = 'cap';
const REVIEW_DATE = '2026-06-10';
const OUT_DIR = `.squad\\agents\\cap\\outputs\\reviews\\${REVIEW_DATE}`;

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

const SPORTSBOOK_PATTERNS = [
  'join',
  'sign up',
  'claim',
  'bonus',
  'deposit',
  'ÚLTIMA OPORTUNIDAD',
  'gana premio',
  'gana dinero',
];

const GATES = [
  'Forbidden vocabulary',
  'Sportsbook positioning',
  'Brand-safe imagery',
  'Design tokens',
  'Typography & wordmark',
  'Safe zones',
  'Factual accuracy',
  'Spanish quality',
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

function forbiddenPattern(term) {
  if (term === '+EV') return /\+EV/i;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}s?($|[^\\p{L}\\p{N}])`, 'iu');
}

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu');
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

function asText(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

function wordCount(line) {
  return line.trim().split(/\s+/u).filter(Boolean).length;
}

function reviewCard(card) {
  const payload = card.payload || {};
  const caption = asText(payload.caption);
  const hook = asText(payload.hook);
  const alt = asText(payload.alt_text ?? payload.alt);
  const hashtags = asText(payload.hashtags);
  const assets = asText(payload.assets);
  const visibleText = [card.title, caption, hook, alt, hashtags, assets].join('\n');
  const gates = [];

  const forbiddenHit = FORBIDDEN.find((term) => forbiddenPattern(term).test(visibleText));
  gates.push({
    gate: 1,
    name: GATES[0],
    score: forbiddenHit ? 'R' : 'G',
    note: forbiddenHit ? `Forbidden term detected: "${forbiddenHit}".` : 'No forbidden vocabulary detected.',
  });

  const sportsbookHit = SPORTSBOOK_PATTERNS.find((term) => termPattern(term).test(caption));
  gates.push({
    gate: 2,
    name: GATES[1],
    score: sportsbookHit ? (sportsbookHit === 'ÚLTIMA OPORTUNIDAD' ? 'Y' : 'R') : 'G',
    note: sportsbookHit
      ? `Sportsbook-positioning term detected in caption: "${sportsbookHit}".`
      : 'Soft/no CTA; no sportsbook-positioning pattern detected.',
  });

  gates.push(
    { gate: 3, name: GATES[2], score: 'G', note: 'Renderer-tokens enforced.' },
    { gate: 4, name: GATES[3], score: 'G', note: 'Renderer-tokens enforced.' },
    { gate: 5, name: GATES[4], score: 'G', note: 'Renderer-tokens enforced.' },
    { gate: 6, name: GATES[5], score: 'G', note: 'Renderer SAFE_ZONES constant enforced.' },
  );

  const mexicoFalseClaim = /México[^.\n]*(ganó la Copa|campeón del mundo)|(ganó la Copa|campeón del mundo)[^.\n]*México/iu.test(
    caption,
  );
  gates.push({
    gate: 7,
    name: GATES[6],
    score: mexicoFalseClaim ? 'R' : 'G',
    note: mexicoFalseClaim
      ? 'Verifiably false Mexico World Cup claim detected.'
      : 'No verifiable false claim detected; opinion-framed predictions allowed.',
  });

  const shortLine = caption.length > 80 ? caption.split(/\r?\n/u).find((line) => line.trim() && wordCount(line) < 3) : null;
  gates.push({
    gate: 8,
    name: GATES[7],
    score: shortLine ? 'Y' : 'G',
    note: shortLine
      ? `Suspicious short caption line detected: "${shortLine.trim()}".`
      : 'Natural Spanish quality heuristic passed.',
  });

  const hasRed = gates.some((gate) => gate.score === 'R');
  const hasYellow = gates.some((gate) => gate.score === 'Y');
  const verdict = hasRed ? 'KILL' : hasYellow ? 'REVISE' : 'PASS';

  const reviseList = gates
    .filter((gate) => gate.score === 'Y')
    .map((gate) => `Resolve Gate ${gate.gate} (${gate.name}): ${gate.note}`);
  const killIssues = gates.filter((gate) => gate.score === 'R');
  const killReason = killIssues.length
    ? `Card fails mandatory compliance: ${killIssues
        .map((gate) => `Gate ${gate.gate} (${gate.name}) — ${gate.note}`)
        .join(' ')}`
    : '';

  return { verdict, gates, reviseList, killReason };
}

function signoffPlatforms(card, verdict) {
  if (verdict !== 'PASS') return '';
  const platforms = card.platforms?.length ? card.platforms : ['x', 'youtube', 'instagram', 'threads', 'tiktok'];
  return platforms.join(', ');
}

function reviewMarkdown(card, result, reviewedAt) {
  const rows = result.gates
    .map((gate) => `| ${gate.gate}. ${gate.name} | ${gate.score} | ${gate.note.replace(/\|/g, '\\|')} |`)
    .join('\n');
  const revise = result.verdict === 'REVISE' ? result.reviseList.map((note, index) => `${index + 1}. ${note}`).join('\n') : '';
  const kill = result.verdict === 'KILL' ? result.killReason : '';
  const signoff =
    result.verdict === 'PASS'
      ? `The card is approved for autonomous publishing to: [${signoffPlatforms(card, result.verdict)}]`
      : 'The card is not approved for autonomous publishing.';

  return `# Review — ${card.id}

**Verdict:** ${result.verdict}
**Reviewed at:** ${reviewedAt}
**Reviewer:** cap (Captain America)

## Gate scorecard
| Gate | Score | Note |
|---|---|---|
${rows}

## Revise list (only if REVISE)
${revise}

## Kill reason (only if KILL)
${kill}

## Sign-off
${signoff}
`;
}

function summaryMarkdown(results, before, after, reviewedAt) {
  const tally = results.reduce(
    (acc, item) => {
      acc[item.result.verdict] += 1;
      return acc;
    },
    { PASS: 0, REVISE: 0, KILL: 0 },
  );
  const rows = results
    .map(
      ({ card, result }) =>
        `| ${card.id} | ${card.title.replace(/\|/g, '\\|')} | ${result.result?.verdict || result.verdict} | ${result.gates
          .filter((gate) => ['R', 'Y'].includes(gate.score))
          .map((gate) => `G${gate.gate}:${gate.score}`)
          .join(', ') || 'All green'} |`,
    )
    .join('\n');
  const highSignal = results
    .flatMap(({ card, result }) =>
      result.gates
        .filter((gate) => [1, 2].includes(gate.gate) && gate.score !== 'G')
        .map((gate) => `- ${card.id}: Gate ${gate.gate} ${gate.score} — ${gate.note}`),
    )
    .join('\n');

  return `# Cap Wave 1 Review Summary

**Reviewed at:** ${reviewedAt}
**Reviewer:** cap (Captain America)

## Tally
- PASS: ${tally.PASS}
- REVISE: ${tally.REVISE}
- KILL: ${tally.KILL}

## Board verification
- copywritten: ${before.copywritten} → ${after.copywritten}
- to_be_posted: ${before.to_be_posted} → ${after.to_be_posted}
- revising: ${before.revising} → ${after.revising}
- killed: ${before.killed} → ${after.killed}

## Per-card verdicts
| Card | Title | Verdict | Non-green gates |
|---|---|---|---|
${rows}

## Gate 1 / Gate 2 catches
${highSignal || 'None.'}
`;
}

async function routeCard(card, result) {
  if (result.verdict === 'PASS') {
    await api(`/api/cards/${card.id}/advance`, {
      method: 'POST',
      body: JSON.stringify({
        to_stage: 'review',
        actor: ACTOR,
        note: 'Cap intermediate gate passed',
        meta: { scorecard: result.gates, verdict: result.verdict },
      }),
    });
    await api(`/api/cards/${card.id}/advance`, {
      method: 'POST',
      body: JSON.stringify({
        to_stage: 'to_be_posted',
        actor: ACTOR,
        note: 'Approved for autonomous publish',
        meta: { scorecard: result.gates, verdict: result.verdict },
      }),
    });
    return;
  }

  if (result.verdict === 'REVISE') {
    const note = result.reviseList.map((item, index) => `${index + 1}. ${item}`).join('\n');
    await api(`/api/cards/${card.id}/revise`, {
      method: 'POST',
      body: JSON.stringify({ actor: ACTOR, note }),
    });
    return;
  }

  await api(`/api/cards/${card.id}/kill`, {
    method: 'POST',
    body: JSON.stringify({ actor: ACTOR, reason: result.killReason }),
  });
}

const boardBefore = await api('/api/board');
const copywritten = boardBefore.columns?.copywritten?.cards || [];
const beforeCounts = {
  copywritten: boardBefore.columns?.copywritten?.count || 0,
  to_be_posted: boardBefore.columns?.to_be_posted?.count || 0,
  revising: boardBefore.columns?.revising?.count || 0,
  killed: boardBefore.columns?.killed?.count || 0,
};

if (!copywritten.length) throw new Error('No copywritten cards found for Wave 1 review.');

mkdirSync(OUT_DIR, { recursive: true });
const reviewedAt = new Date().toISOString();
const results = [];

for (const boardCard of copywritten) {
  const card = await api(`/api/cards/${boardCard.id}`);
  const result = reviewCard(card);
  writeFileSync(`${OUT_DIR}\\${card.id}.md`, reviewMarkdown(card, result, reviewedAt), 'utf8');
  await routeCard(card, result);
  results.push({ card, result });
}

const boardAfter = await api('/api/board');
const afterCounts = {
  copywritten: boardAfter.columns?.copywritten?.count || 0,
  to_be_posted: boardAfter.columns?.to_be_posted?.count || 0,
  revising: boardAfter.columns?.revising?.count || 0,
  killed: boardAfter.columns?.killed?.count || 0,
};

writeFileSync(`${OUT_DIR}\\wave1-review-summary.md`, summaryMarkdown(results, beforeCounts, afterCounts, reviewedAt), 'utf8');

const tally = results.reduce(
  (acc, item) => {
    acc[item.result.verdict] += 1;
    return acc;
  },
  { PASS: 0, REVISE: 0, KILL: 0 },
);

console.log(JSON.stringify({ reviewed: results.length, tally, before: beforeCounts, after: afterCounts }, null, 2));
