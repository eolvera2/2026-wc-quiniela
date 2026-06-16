import { MissingDataError, TOKENS, escapeXml, fitTextRamp, logoLockup, requireFields, safeZone, sanitizeVisualText, svgShell, textLines } from '../tokens.js';

const TEMPLATE = 'quiniela-challenge';

const QUESTION_RAMPS = {
  1920: [
    { chars: 16, lines: 4, font: 112 },
    { chars: 18, lines: 4, font: 100 },
    { chars: 22, lines: 5, font: 88 },
    { chars: 26, lines: 5, font: 76 },
    { chars: 30, lines: 6, font: 66 },
  ],
  1350: [
    { chars: 16, lines: 4, font: 96 },
    { chars: 18, lines: 4, font: 86 },
    { chars: 22, lines: 5, font: 76 },
    { chars: 26, lines: 5, font: 66 },
    { chars: 30, lines: 6, font: 58 },
  ],
  1080: [
    { chars: 16, lines: 4, font: 78 },
    { chars: 18, lines: 4, font: 70 },
    { chars: 22, lines: 5, font: 62 },
    { chars: 26, lines: 5, font: 54 },
    { chars: 30, lines: 6, font: 48 },
  ],
};

export default function quinielaChallenge(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'question', aliases: ['challengeQuestion'], hint: 'Concrete quiniela question, e.g. "¿Quién gana México vs Sudáfrica?"' },
      { field: 'homeTeam', hint: 'Home team name from the calendar.' },
      { field: 'awayTeam', hint: 'Away team name from the calendar.' },
    ],
    { template: TEMPLATE },
  );
  const question = sanitizeVisualText(required.question);
  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const rampKey = height >= 1900 ? 1920 : height >= 1300 ? 1350 : 1080;
  const fitted = fitTextRamp(question, QUESTION_RAMPS[rampKey], { label: `quiniela question @${rampKey}` });
  const qY = safe.top + (height >= 1900 ? 420 : 290);
  const chipY = qY + (height >= 1900 ? 380 : height <= 1080 ? 350 : 310);
  const chips = height <= 1080
    ? [
        answerChip({ x: width / 2 - 275, y: chipY, text: home }),
        answerChip({ x: width / 2, y: chipY, text: 'Empate' }),
        answerChip({ x: width / 2 + 275, y: chipY, text: away }),
      ].join('')
    : [
        answerChip({ x: width / 2 - 275, y: chipY, text: home }),
        answerChip({ x: width / 2, y: chipY + 112, text: 'Empate' }),
        answerChip({ x: width / 2 + 275, y: chipY + 224, text: away }),
      ].join('');

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="limeGlow" cx="0%" cy="50%" r="88%">
        <stop offset="0%" stop-color="${TOKENS.color.lime400}" stop-opacity=".24"/>
        <stop offset="100%" stop-color="${TOKENS.color.lime400}" stop-opacity="0"/>
      </radialGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.jungle950}"/>
      <rect width="${width}" height="${height}" fill="url(#limeGlow)"/>
      <rect x="0" y="0" width="34" height="${height}" fill="${TOKENS.color.lime400}"/>
      <text x="${safe.left}" y="${safe.top + 42}" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.lime400}">QUINIELA CHALLENGE</text>
      ${textLines(fitted.lines, { x: width / 2, y: qY, fontSize: fitted.fontSize, lineHeight: fitted.lineHeight, fill: TOKENS.color.white, extra: 'letter-spacing="-0.035em"' })}
      ${chips}
      <text x="${width / 2}" y="${height - safe.bottom - 135}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="29" font-weight="700" fill="${TOKENS.color.neutral300}">Elige con tu grupo y compara resultados.</text>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 84, mark: 72 })}
    `,
  });
}

function answerChip({ x, y, text }) {
  return `<g>
    <rect x="${x - 185}" y="${y - 50}" width="370" height="92" rx="46" fill="none" stroke="${TOKENS.color.turquoise400}" stroke-width="5"/>
    <text x="${x}" y="${y + 10}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="32" font-weight="900" fill="${TOKENS.color.white}">${escapeXml(sanitizeVisualText(text).toUpperCase())}</text>
  </g>`;
}
