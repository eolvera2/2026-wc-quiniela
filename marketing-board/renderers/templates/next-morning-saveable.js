import { TOKENS, clipText, dotGrid, escapeXml, fitTextRamp, logoLockup, requireFields, sanitizeVisualText, svgShell, textLines } from '../tokens.js';
import { flagImage } from '../flags.js';

const TEMPLATE = 'next-morning-saveable';

const MATCH_RAMP = [
  { chars: 22, lines: 2, font: 62 },
  { chars: 30, lines: 2, font: 54 },
  { chars: 38, lines: 3, font: 46 },
];

const LESSON_RAMP = [
  { chars: 30, lines: 2, font: 42 },
  { chars: 42, lines: 3, font: 36 },
  { chars: 58, lines: 4, font: 30 },
];

export default function nextMorningSaveable(card = {}, size) {
  const { width, height } = size;
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'homeTeam', hint: 'Home team display name.' },
      { field: 'awayTeam', hint: 'Away team display name.' },
      { field: 'pgsScore', hint: 'Initial PGS score, e.g. "2-1".' },
      { field: 'lesson', hint: 'Short saveable lesson for tomorrow.' },
    ],
    { template: TEMPLATE },
  );

  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const pgsScore = sanitizeVisualText(required.pgsScore);
  const lesson = sanitizeVisualText(required.lesson);
  const statValue = sanitizeVisualText(payload.statValue || pgsScore);
  const statLabel = sanitizeVisualText(payload.statLabel || 'PGS® INICIAL');
  const dataContext = sanitizeVisualText(payload.dataContext || 'Dato guardable para ajustar tu siguiente quiniela.');
  const match = `${home} vs ${away}`;
  const matchFit = fitTextRamp(match, MATCH_RAMP, { label: 'next morning match' });
  const lessonFit = fitTextRamp(lesson, LESSON_RAMP, { label: 'next morning lesson' });
  const isSquare = Math.abs(width - height) < 4;
  const centerX = width / 2;
  const cardTop = isSquare ? 350 : 520;
  const flagY = isSquare ? 128 : 170;
  const flagW = 176;
  const flagH = 112;
  const statFont = statValue.length > 10 ? 78 : 102;

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="morningGlow" cx="50%" cy="18%" r="90%">
        <stop offset="0%" stop-color="${TOKENS.color.jaguar300}" stop-opacity=".34"/>
        <stop offset="42%" stop-color="${TOKENS.color.turquoise400}" stop-opacity=".16"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="dataPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jungle900}"/>
      </linearGradient>
      <linearGradient id="statFill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${TOKENS.color.jaguar300}"/>
        <stop offset="100%" stop-color="${TOKENS.color.turquoise400}"/>
      </linearGradient>
      <pattern id="dataDots" width="96" height="96" patternUnits="userSpaceOnUse">
        <circle cx="12" cy="12" r="3" fill="${TOKENS.color.offWhite}" opacity=".10"/>
        <circle cx="62" cy="48" r="2" fill="${TOKENS.color.turquoise400}" opacity=".12"/>
      </pattern>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}"/>
      <rect width="${width}" height="${height}" fill="url(#morningGlow)"/>
      <rect width="${width}" height="${height}" fill="url(#dataDots)"/>
      ${dotGrid({ width, height, opacity: 0.08 })}

      <text x="${centerX}" y="${isSquare ? 76 : 104}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="28" font-weight="1000" letter-spacing=".20em" fill="${TOKENS.color.jaguar300}">DATO PARA GUARDAR</text>
      ${flagImage({ code: payload.flagCodeHome || home, x: 92, y: flagY, width: flagW, height: flagH, rx: 22 })}
      ${flagImage({ code: payload.flagCodeAway || away, x: width - 92 - flagW, y: flagY, width: flagW, height: flagH, rx: 22 })}
      ${textLines(matchFit.lines, {
        x: centerX,
        y: flagY + 42,
        fontSize: matchFit.fontSize,
        lineHeight: matchFit.lineHeight + 4,
        fill: TOKENS.color.white,
        weight: 1000,
      })}

      <rect x="92" y="${cardTop}" width="${width - 184}" height="${isSquare ? 430 : 545}" rx="52" fill="url(#dataPanel)" stroke="${TOKENS.color.turquoise400}" stroke-opacity=".58" stroke-width="4"/>
      <rect x="132" y="${cardTop + 38}" width="${width - 264}" height="104" rx="30" fill="${TOKENS.color.white}" opacity=".08"/>
      <text x="${centerX}" y="${cardTop + 78}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="1000" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">${escapeXml(clipText(statLabel.toUpperCase(), 28))}</text>
      <text x="${centerX}" y="${cardTop + 206}" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="${statFont}" font-weight="1000" fill="url(#statFill)" letter-spacing="-.03em">${escapeXml(clipText(statValue.toUpperCase(), 16))}</text>
      <text x="${centerX}" y="${cardTop + 262}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="28" font-weight="900" fill="${TOKENS.color.offWhite}">PGS® inicial ${escapeXml(clipText(pgsScore, 12))}</text>
      ${textLines(lessonFit.lines, {
        x: centerX,
        y: cardTop + 338,
        fontSize: lessonFit.fontSize,
        lineHeight: lessonFit.lineHeight + 8,
        fill: TOKENS.color.white,
        weight: 1000,
      })}
      <text x="${centerX}" y="${cardTop + (isSquare ? 394 : 496)}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="800" fill="${TOKENS.color.turquoise400}">${escapeXml(clipText(dataContext, 72))}</text>

      ${logoLockup({ x: centerX, y: height - (isSquare ? 58 : 92), mark: 58 })}
    `,
  });
}

export { TEMPLATE };
