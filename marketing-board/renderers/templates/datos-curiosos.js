import { MissingDataError, TOKENS, fitTextRamp, logoLockup, requireFields, safeZone, sanitizeVisualText, svgShell, textLines } from '../tokens.js';

const TEMPLATE = 'datos-curiosos';

const STAT_RAMPS = {
  1920: [
    { chars: 13, lines: 4, font: 118 },
    { chars: 15, lines: 4, font: 104 },
    { chars: 18, lines: 5, font: 92 },
    { chars: 22, lines: 5, font: 80 },
    { chars: 26, lines: 6, font: 70 },
  ],
  1350: [
    { chars: 13, lines: 4, font: 106 },
    { chars: 15, lines: 4, font: 94 },
    { chars: 18, lines: 5, font: 82 },
    { chars: 22, lines: 5, font: 72 },
    { chars: 26, lines: 6, font: 62 },
  ],
  1080: [
    { chars: 13, lines: 4, font: 84 },
    { chars: 15, lines: 4, font: 74 },
    { chars: 18, lines: 5, font: 64 },
    { chars: 22, lines: 5, font: 56 },
    { chars: 26, lines: 6, font: 48 },
  ],
};

const CONTEXT_RAMPS = {
  1920: [
    { chars: 39, lines: 3, font: 42 },
    { chars: 44, lines: 3, font: 38 },
    { chars: 50, lines: 4, font: 34 },
  ],
  1350: [
    { chars: 39, lines: 3, font: 38 },
    { chars: 44, lines: 3, font: 34 },
    { chars: 50, lines: 4, font: 30 },
  ],
  1080: [
    { chars: 39, lines: 3, font: 34 },
    { chars: 44, lines: 3, font: 30 },
    { chars: 50, lines: 4, font: 26 },
  ],
};

export default function datosCuriosos(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const required = requireFields(
    card.payload ?? {},
    [
      { field: 'statLine', hint: 'Verified data point from our portal/calendar (e.g. "7 de los últimos 10: gol antes del descanso").' },
    ],
    { template: TEMPLATE },
  );
  const rawStat = sanitizeVisualText(required.statLine);
  const { stat, context } = splitStat(rawStat);
  if (!stat || !stat.trim()) {
    throw new MissingDataError({ template: TEMPLATE, field: 'statLine.stat', hint: 'statLine must contain a concrete stat phrase.' });
  }
  const rampKey = height >= 1900 ? 1920 : height >= 1300 ? 1350 : 1080;
  const fittedStat = fitTextRamp(stat.toUpperCase(), STAT_RAMPS[rampKey], { label: `dato stat @${rampKey}` });
  const fittedContext = fitTextRamp(context || stat, CONTEXT_RAMPS[rampKey], { label: `dato context @${rampKey}` });

  return svgShell({
    width,
    height,
    defs: `
      <pattern id="footballPattern" width="180" height="180" patternUnits="userSpaceOnUse">
        <circle cx="90" cy="90" r="54" fill="none" stroke="${TOKENS.color.offWhite}" stroke-width="3" opacity=".08"/>
        <path d="M58 90h64M90 58v64M66 66l48 48M114 66l-48 48" stroke="${TOKENS.color.offWhite}" stroke-width="2" opacity=".06"/>
      </pattern>
      <linearGradient id="datoBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#datoBg)"/>
      <rect width="${width}" height="${height}" fill="url(#footballPattern)"/>
      <rect x="${safe.left}" y="${safe.top + 84}" width="${width - safe.left - safe.right}" height="${height >= 1900 ? 760 : 540}" rx="46" fill="${TOKENS.color.white}" opacity=".045" stroke="${TOKENS.color.jaguar300}" stroke-opacity=".28"/>
      <text x="${safe.left}" y="${safe.top + 38}" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">DATO CURIOSO</text>
      ${textLines(fittedStat.lines, { x: width / 2, y: safe.top + (height >= 1900 ? 255 : 190), fontSize: fittedStat.fontSize, lineHeight: fittedStat.lineHeight, fill: TOKENS.color.white, extra: 'letter-spacing="-0.05em"' })}
      ${textLines(fittedContext.lines, { x: width / 2, y: safe.top + (height >= 1900 ? 810 : 605), fontSize: fittedContext.fontSize, lineHeight: Math.round(fittedContext.fontSize * 1.32), weight: 600, family: TOKENS.font.body, fill: TOKENS.color.offWhite })}
      <rect x="${safe.left}" y="${height - safe.bottom - 150}" width="${width - safe.left - safe.right}" height="3" fill="${TOKENS.color.turquoise400}" opacity=".75"/>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 86, mark: 72 })}
    `,
  });
}

function splitStat(text) {
  const match = text.match(/^([^.,:;]+)([.,:;]\s*)?(.*)$/);
  if (!match) return { stat: text, context: 'Una lectura rápida para ver el partido con más contexto.' };
  return {
    stat: match[1].trim(),
    context: (match[3] || 'Una lectura rápida para ver el partido con más contexto.').trim(),
  };
}
