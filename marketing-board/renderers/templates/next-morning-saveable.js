import { TOKENS, clipText, dotGrid, escapeXml, fitTextRamp, logoLockup, requireFields, sanitizeVisualText, svgShell, textLines } from '../tokens.js';
import { flagImage } from '../flags.js';

const TEMPLATE = 'next-morning-saveable';

const MATCH_RAMP = [
  { chars: 22, lines: 2, font: 62 },
  { chars: 30, lines: 2, font: 54 },
  { chars: 38, lines: 3, font: 46 },
];

const LESSON_RAMP = [
  { chars: 26, lines: 2, font: 46 },
  { chars: 34, lines: 3, font: 40 },
  { chars: 44, lines: 3, font: 34 },
];

function sketchPath(d, { stroke = TOKENS.color.offWhite, width = 5, opacity = 0.82, dash = '' } = {}) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}

function sketchCircle({ cx, cy, r, stroke = TOKENS.color.offWhite, width = 5, opacity = 0.8 }) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}"/>`;
}

function abstractPitch({ width, height, top }) {
  const left = 82;
  const right = width - 82;
  const bottom = top + 280;
  return `
    ${sketchPath(`M ${left} ${top + 18} C ${250} ${top - 8}, ${width - 250} ${top - 8}, ${right} ${top + 18}`, { stroke: TOKENS.color.turquoise400, width: 4, opacity: 0.62 })}
    ${sketchPath(`M ${left + 24} ${bottom} C ${315} ${bottom - 34}, ${width - 250} ${bottom - 22}, ${right - 20} ${bottom}`, { stroke: TOKENS.color.turquoise400, width: 4, opacity: 0.46 })}
    ${sketchPath(`M ${width / 2} ${top + 24} C ${width / 2 - 34} ${top + 108}, ${width / 2 + 38} ${top + 176}, ${width / 2} ${bottom - 14}`, { stroke: TOKENS.color.neutral300, width: 3, opacity: 0.36, dash: '11 16' })}
    ${sketchCircle({ cx: width / 2, cy: top + 145, r: 92, stroke: TOKENS.color.jaguar300, width: 5, opacity: 0.48 })}
  `;
}

function sketchPlayer({ x, y, scale = 1, accent = TOKENS.color.jaguar300 }) {
  const s = scale;
  return `
    ${sketchCircle({ cx: x, cy: y, r: 22 * s, stroke: TOKENS.color.white, width: 5 * s, opacity: 0.78 })}
    ${sketchPath(`M ${x - 14 * s} ${y + 33 * s} C ${x - 35 * s} ${y + 94 * s}, ${x - 34 * s} ${y + 142 * s}, ${x - 8 * s} ${y + 178 * s}`, { stroke: TOKENS.color.white, width: 8 * s, opacity: 0.72 })}
    ${sketchPath(`M ${x - 20 * s} ${y + 74 * s} C ${x + 32 * s} ${y + 62 * s}, ${x + 72 * s} ${y + 92 * s}, ${x + 103 * s} ${y + 130 * s}`, { stroke: accent, width: 7 * s, opacity: 0.75 })}
    ${sketchPath(`M ${x - 8 * s} ${y + 176 * s} C ${x - 36 * s} ${y + 222 * s}, ${x - 66 * s} ${y + 254 * s}, ${x - 108 * s} ${y + 278 * s}`, { stroke: TOKENS.color.white, width: 8 * s, opacity: 0.68 })}
    ${sketchPath(`M ${x + 4 * s} ${y + 176 * s} C ${x + 42 * s} ${y + 210 * s}, ${x + 76 * s} ${y + 232 * s}, ${x + 120 * s} ${y + 250 * s}`, { stroke: TOKENS.color.white, width: 8 * s, opacity: 0.68 })}
    ${sketchCircle({ cx: x + 146 * s, cy: y + 260 * s, r: 32 * s, stroke: TOKENS.color.lime400, width: 5 * s, opacity: 0.72 })}
    ${sketchPath(`M ${x + 120 * s} ${y + 252 * s} C ${x + 88 * s} ${y + 242 * s}, ${x + 54 * s} ${y + 224 * s}, ${x + 30 * s} ${y + 206 * s}`, { stroke: accent, width: 4 * s, opacity: 0.48, dash: '10 14' })}
  `;
}

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
  const match = `${home} vs ${away}`;
  const matchFit = fitTextRamp(match, MATCH_RAMP, { label: 'next morning match' });
  const lessonFit = fitTextRamp(lesson, LESSON_RAMP, { label: 'next morning lesson' });
  const isSquare = Math.abs(width - height) < 4;
  const centerX = width / 2;
  const pitchTop = isSquare ? 240 : 340;
  const cardTop = isSquare ? 615 : 830;
  const flagY = isSquare ? 128 : 170;
  const flagW = 176;
  const flagH = 112;

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="morningPaper" cx="50%" cy="34%" r="85%">
        <stop offset="0%" stop-color="#fff4d6"/>
        <stop offset="48%" stop-color="${TOKENS.color.offWhite}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy900}"/>
      </radialGradient>
      <filter id="pencilRough">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="17"/>
        <feDisplacementMap in="SourceGraphic" scale="2.2"/>
      </filter>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}"/>
      <rect width="${width}" height="${height}" fill="url(#morningPaper)" opacity=".95"/>
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}" opacity=".24"/>
      ${dotGrid({ width, height, opacity: 0.1 })}

      <g filter="url(#pencilRough)">
        ${abstractPitch({ width, height, top: pitchTop })}
        ${sketchPlayer({ x: centerX - 42, y: pitchTop + 22, scale: isSquare ? 0.78 : 0.9, accent: TOKENS.color.turquoise400 })}
        ${sketchPath(`M 92 ${pitchTop + 86} C 205 ${pitchTop + 38}, 272 ${pitchTop + 42}, 380 ${pitchTop + 74}`, { stroke: TOKENS.color.red600, width: 5, opacity: 0.38, dash: '18 15' })}
        ${sketchPath(`M ${width - 380} ${pitchTop + 84} C ${width - 270} ${pitchTop + 38}, ${width - 184} ${pitchTop + 44}, ${width - 92} ${pitchTop + 96}`, { stroke: TOKENS.color.lime400, width: 5, opacity: 0.42, dash: '18 15' })}
      </g>

      <text x="${centerX}" y="${isSquare ? 76 : 104}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="28" font-weight="1000" letter-spacing=".20em" fill="${TOKENS.color.navy950}">DATO PARA GUARDAR</text>
      ${flagImage({ code: payload.flagCodeHome || home, x: 92, y: flagY, width: flagW, height: flagH, rx: 22 })}
      ${flagImage({ code: payload.flagCodeAway || away, x: width - 92 - flagW, y: flagY, width: flagW, height: flagH, rx: 22 })}
      ${textLines(matchFit.lines, {
        x: centerX,
        y: flagY + 42,
        fontSize: matchFit.fontSize,
        lineHeight: matchFit.lineHeight + 4,
        fill: TOKENS.color.navy950,
        weight: 1000,
      })}

      <rect x="104" y="${cardTop}" width="${width - 208}" height="${isSquare ? 265 : 330}" rx="44" fill="${TOKENS.color.navy950}" opacity=".90"/>
      <text x="${centerX}" y="${cardTop + 70}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="30" font-weight="1000" letter-spacing=".16em" fill="${TOKENS.color.jaguar300}">PGS® INICIAL ${escapeXml(clipText(pgsScore, 12))}</text>
      ${textLines(lessonFit.lines, {
        x: centerX,
        y: cardTop + 145,
        fontSize: lessonFit.fontSize,
        lineHeight: lessonFit.lineHeight + 8,
        fill: TOKENS.color.white,
        weight: 1000,
      })}
      <text x="${centerX}" y="${cardTop + (isSquare ? 226 : 286)}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="28" font-weight="900" fill="${TOKENS.color.turquoise400}">Guárdalo antes de armar la siguiente quiniela</text>

      ${logoLockup({ x: centerX, y: height - (isSquare ? 58 : 92), mark: 58 })}
    `,
  });
}

export { TEMPLATE };
