import { MissingDataError, TOKENS, clipText, escapeXml, fitTextRamp, logoLockup, requireFields, safeZone, sanitizeVisualText, svgShell, textLines } from '../tokens.js';
import { flagImage, teamFlagCode } from '../flags.js';

const TEMPLATE = 'pronostico-del-dia';

const LINE_RAMP_TALL = [
  { chars: 34, lines: 2, font: 54 },
  { chars: 38, lines: 2, font: 48 },
  { chars: 42, lines: 3, font: 44 },
  { chars: 48, lines: 3, font: 40 },
];
const LINE_RAMP_SHORT = [
  { chars: 34, lines: 2, font: 46 },
  { chars: 38, lines: 2, font: 42 },
  { chars: 42, lines: 3, font: 38 },
  { chars: 48, lines: 3, font: 34 },
];

export default function pronosticoDelDia(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'homeTeam', hint: 'Spanish team name, e.g. "México".' },
      { field: 'awayTeam', hint: 'Spanish team name, e.g. "Sudáfrica".' },
      { field: 'kickoff', hint: 'ISO datetime from the calendar, e.g. "2026-06-11T13:00:00-06:00".' },
      { field: 'venue', hint: 'Venue name from the calendar/portal.' },
      { field: 'cta', hint: 'Short CTA text shown in the gold button.' },
    ],
    { template: TEMPLATE },
  );
  const titleText = card.title || payload.eyebrow;
  if (!titleText || !String(titleText).trim()) {
    throw new MissingDataError({ template: TEMPLATE, field: 'title', hint: 'Card title or payload.eyebrow.' });
  }
  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const flagHome = payload.flagCodeHome || teamFlagCode(required.homeTeam);
  const flagAway = payload.flagCodeAway || teamFlagCode(required.awayTeam);
  const line = clipText(titleText, 100);
  const when = formatKickoff(required.kickoff);
  const venue = sanitizeVisualText(required.venue);
  const centerY = height >= 1900 ? 870 : height >= 1300 ? 620 : 505;
  const fitted = fitTextRamp(line, height >= 1900 ? LINE_RAMP_TALL : LINE_RAMP_SHORT, { label: `pronostico title @${height}` });
  const pgsHome = payload.pgsHome != null ? String(payload.pgsHome) : null;
  const pgsAway = payload.pgsAway != null ? String(payload.pgsAway) : null;
  const hasPgs = pgsHome && pgsAway;
  const pickShort = payload.pickShort ? sanitizeVisualText(payload.pickShort) : null;

  const pgsY = centerY + 310;
  const pickY = centerY + (hasPgs ? 370 : 310);

  return svgShell({
    width,
    height,
    defs: `
      <linearGradient id="matchBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy950}"/>
        <stop offset="52%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jungle900}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#matchBg)"/>
      <circle cx="120" cy="${height - 160}" r="310" fill="${TOKENS.color.turquoise400}" opacity=".08"/>
      <circle cx="${width - 70}" cy="${safe.top + 120}" r="250" fill="${TOKENS.color.jaguar300}" opacity=".12"/>
      <text x="${safe.left}" y="${safe.top + 38}" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".16em" fill="${TOKENS.color.jaguar300}">PRONÓSTICO DEL DÍA</text>
      ${textLines(fitted.lines, { x: width / 2, y: safe.top + (height >= 1900 ? 165 : 125), fontSize: fitted.fontSize, lineHeight: fitted.lineHeight + 12, fill: TOKENS.color.white })}
      <g transform="translate(0 ${centerY})">
        <rect x="${safe.left}" y="-170" width="${width - safe.left - safe.right}" height="340" rx="42" fill="${TOKENS.color.white}" opacity=".055" stroke="${TOKENS.color.neutral300}" stroke-opacity=".18"/>
        ${teamBlock({ x: width * 0.27, flagCode: flagHome, name: home })}
        <text x="${width / 2}" y="24" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="86" font-weight="900" fill="${TOKENS.color.jaguar300}">VS</text>
        ${teamBlock({ x: width * 0.73, flagCode: flagAway, name: away })}
      </g>
      <text x="${width / 2}" y="${centerY + 260}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="31" font-weight="600" fill="${TOKENS.color.neutral300}">${escapeXml(sanitizeVisualText(`${when} · ${venue}`))}</text>
      ${hasPgs ? pgsPill({ cx: width / 2, cy: pgsY, home, away, pgsHome, pgsAway }) : ''}
      ${pickShort ? `<text x="${width / 2}" y="${pickY}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="28" font-weight="800" fill="${TOKENS.color.jaguar300}">🎯 Pick inicial: ${escapeXml(clipText(pickShort, 38))}</text>` : ''}
      <rect x="${width / 2 - 250}" y="${height - safe.bottom - 145}" width="500" height="68" rx="34" fill="${TOKENS.color.jaguar300}"/>
      <text x="${width / 2}" y="${height - safe.bottom - 101}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="900" fill="${TOKENS.color.navy950}">${escapeXml(clipText(required.cta, 40))}</text>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 32, mark: 58 })}
    `,
  });
}

function pgsPill({ cx, cy, home, away, pgsHome, pgsAway }) {
  const text = `PGS® ${home} ${pgsHome}-${pgsAway} ${away}`;
  // Approximate width based on character count (works well for our font/size combo).
  const w = Math.min(820, Math.max(360, text.length * 17));
  return `<g>
    <rect x="${cx - w / 2}" y="${cy - 28}" width="${w}" height="54" rx="27" fill="${TOKENS.color.jaguar300}" opacity=".95"/>
    <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="900" fill="${TOKENS.color.navy950}" letter-spacing=".04em">${escapeXml(text)}</text>
  </g>`;
}

function teamBlock({ x, flagCode, name }) {
  const flagW = 160;
  const flagH = 120;
  return `<g>
    ${flagImage({ code: flagCode, x: x - flagW / 2, y: -130, width: flagW, height: flagH, rx: 10 })}
    <text x="${x}" y="72" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="49" font-weight="900" fill="${TOKENS.color.white}">${escapeXml(name.toUpperCase())}</text>
  </g>`;
}

function formatKickoff(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeVisualText(value);
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(date);
}
