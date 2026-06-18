import { TOKENS, clipText, dotGrid, escapeXml, fitTextRamp, logoLockup, requireFields, sanitizeVisualText, svgShell, textLines } from '../tokens.js';
import { flagImage } from '../flags.js';

const TEMPLATE = 'halftime-debate';

const QUESTION_RAMP = [
  { chars: 24, lines: 2, font: 58 },
  { chars: 34, lines: 3, font: 48 },
  { chars: 46, lines: 3, font: 40 },
];

const PICK_RAMP = [
  { chars: 26, lines: 2, font: 38 },
  { chars: 36, lines: 3, font: 32 },
  { chars: 48, lines: 3, font: 28 },
];

function chalkLine(d, { stroke = TOKENS.color.offWhite, width = 5, opacity = 0.55, dash = '' } = {}) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}

export default function halftimeDebate(card = {}, size) {
  const { width, height } = size;
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'homeTeam', hint: 'Home team display name.' },
      { field: 'awayTeam', hint: 'Away team display name.' },
      { field: 'pickShort', hint: 'Initial pick text.' },
      { field: 'question', hint: 'Halftime debate question.' },
    ],
    { template: TEMPLATE },
  );

  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const pick = sanitizeVisualText(required.pickShort);
  const question = sanitizeVisualText(required.question);
  const match = `${home} vs ${away}`;
  const questionFit = fitTextRamp(question, QUESTION_RAMP, { label: 'halftime question' });
  const pickFit = fitTextRamp(`Pick inicial: ${pick}`, PICK_RAMP, { label: 'halftime pick' });
  const isSquare = Math.abs(width - height) < 4;
  const centerX = width / 2;
  const flagW = Math.round(width * 0.22);
  const flagH = Math.round(flagW * 0.64);
  const flagY = isSquare ? 148 : 230;
  const boardTop = isSquare ? 520 : 740;
  const boardHeight = isSquare ? 330 : 410;

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="htGlow" cx="50%" cy="26%" r="78%">
        <stop offset="0%" stop-color="${TOKENS.color.turquoise400}" stop-opacity=".24"/>
        <stop offset="48%" stop-color="${TOKENS.color.jaguar300}" stop-opacity=".13"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="chalkboard" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.jungle900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy900}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}"/>
      <rect width="${width}" height="${height}" fill="url(#htGlow)"/>
      ${dotGrid({ width, height, opacity: 0.10 })}
      <text x="${centerX}" y="${isSquare ? 76 : 110}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="30" font-weight="1000" letter-spacing=".22em" fill="${TOKENS.color.jaguar300}">MEDIO TIEMPO</text>
      <text x="${centerX}" y="${isSquare ? 124 : 164}" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="58" font-weight="1000" fill="${TOKENS.color.white}">DEBATE EN VIVO</text>

      ${flagImage({ code: payload.flagCodeHome || home, x: 96, y: flagY, width: flagW, height: flagH, rx: 22 })}
      ${flagImage({ code: payload.flagCodeAway || away, x: width - 96 - flagW, y: flagY, width: flagW, height: flagH, rx: 22 })}
      <text x="${centerX}" y="${flagY + flagH / 2 + 12}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="34" font-weight="1000" fill="${TOKENS.color.offWhite}">${escapeXml(clipText(match, 36))}</text>

      <rect x="84" y="${boardTop}" width="${width - 168}" height="${boardHeight}" rx="42" fill="url(#chalkboard)" stroke="${TOKENS.color.turquoise400}" stroke-opacity=".55" stroke-width="4"/>
      ${chalkLine(`M ${centerX} ${boardTop + 28} C ${centerX - 42} ${boardTop + 120}, ${centerX + 46} ${boardTop + 205}, ${centerX} ${boardTop + boardHeight - 24}`, { stroke: TOKENS.color.neutral300, width: 4, opacity: 0.34, dash: '10 14' })}
      ${chalkLine(`M ${centerX - 330} ${boardTop + boardHeight - 86} C ${centerX - 166} ${boardTop + boardHeight - 142}, ${centerX + 180} ${boardTop + boardHeight - 142}, ${centerX + 330} ${boardTop + boardHeight - 86}`, { stroke: TOKENS.color.jaguar300, width: 5, opacity: 0.34 })}
      ${textLines(questionFit.lines, {
        x: centerX,
        y: boardTop + 105,
        fontSize: questionFit.fontSize,
        lineHeight: questionFit.lineHeight + 8,
        fill: TOKENS.color.white,
        weight: 1000,
      })}
      ${textLines(pickFit.lines, {
        x: centerX,
        y: boardTop + (isSquare ? 230 : 285),
        fontSize: pickFit.fontSize,
        lineHeight: pickFit.lineHeight + 6,
        fill: TOKENS.color.jaguar300,
        weight: 900,
      })}
      <text x="${centerX}" y="${boardTop + boardHeight - 38}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="27" font-weight="900" fill="${TOKENS.color.turquoise400}">Responde en X/Threads antes de que arranque el 2T</text>

      ${logoLockup({ x: centerX, y: height - (isSquare ? 58 : 92), mark: 58 })}
    `,
  });
}

export { TEMPLATE };
