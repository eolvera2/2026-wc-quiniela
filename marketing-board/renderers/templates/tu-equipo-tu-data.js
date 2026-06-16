import { MissingDataError, TOKENS, escapeXml, logoLockup, requireFields, safeZone, sanitizeVisualText, svgShell } from '../tokens.js';
import { flagImage, teamFlagCode } from '../flags.js';

const TEMPLATE = 'tu-equipo-tu-data';

export default function tuEquipoTuData(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'homeTeam', hint: 'Team this card spotlights (Spanish), e.g. "México".' },
      { field: 'form', hint: 'Recent form string from the portal, e.g. "4-1-0".' },
      { field: 'goals', hint: 'Goals stat from the portal.' },
      { field: 'cleanSheets', hint: 'Clean-sheets stat from the portal.' },
    ],
    { template: TEMPLATE },
  );
  const team = sanitizeVisualText(required.homeTeam);
  const flagCode = payload.flagCodeHome || teamFlagCode(required.homeTeam);
  const mexico = team.toLowerCase().includes('méxico') || team.toLowerCase().includes('mexico');
  const rows = [
    ['Forma', String(required.form)],
    ['Goles', String(required.goals)],
    ['Vallas en cero', String(required.cleanSheets)],
  ];
  const startY = safe.top + (height >= 1900 ? 520 : 360);
  const flagW = 64;
  const flagH = 48;

  return svgShell({
    width,
    height,
    defs: `
      <linearGradient id="dataBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy950}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jungle900}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#dataBg)"/>
      ${mexico ? `<rect x="0" y="0" width="18" height="${height}" fill="${TOKENS.color.green500}"/><rect x="18" y="0" width="18" height="${height}" fill="${TOKENS.color.white}"/><rect x="36" y="0" width="18" height="${height}" fill="${TOKENS.color.red600}"/>` : `<rect x="0" y="0" width="34" height="${height}" fill="${TOKENS.color.turquoise400}"/>`}
      ${flagImage({ code: flagCode, x: safe.left, y: safe.top + 12, width: flagW, height: flagH, rx: 6 })}
      <text x="${safe.left + flagW + 18}" y="${safe.top + 52}" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".16em" fill="${TOKENS.color.jaguar300}">${escapeXml(team.toUpperCase())}</text>
      <text x="${safe.left}" y="${safe.top + 150}" font-family='${TOKENS.font.display}' font-size="${height >= 1900 ? 112 : 90}" font-weight="900" fill="${TOKENS.color.white}" letter-spacing="-0.04em">TU EQUIPO, TU DATA</text>
      ${rows.map((row, i) => statRow({ y: startY + i * 150, label: row[0], value: row[1], width, safe })).join('')}
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 86, mark: 72 })}
    `,
  });
}

function statRow({ y, label, value, width, safe }) {
  return `<g>
    <rect x="${safe.left}" y="${y - 72}" width="${width - safe.left - safe.right}" height="118" rx="30" fill="${TOKENS.color.white}" opacity=".06" stroke="${TOKENS.color.turquoise400}" stroke-opacity=".35"/>
    <text x="${safe.left + 42}" y="${y + 5}" font-family='${TOKENS.font.body}' font-size="35" font-weight="800" fill="${TOKENS.color.neutral300}">${escapeXml(sanitizeVisualText(label))}</text>
    <text x="${width - safe.right - 42}" y="${y + 13}" text-anchor="end" font-family='${TOKENS.font.display}' font-size="60" font-weight="900" fill="${TOKENS.color.lime400}">${escapeXml(sanitizeVisualText(value))}</text>
  </g>`;
}
