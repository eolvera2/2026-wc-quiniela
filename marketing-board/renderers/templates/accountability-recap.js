import { TOKENS, clipText, dotGrid, escapeXml, fitTextRamp, logoLockup, requireFields, sanitizeVisualText, svgShell, textLines } from '../tokens.js';
import { flagImage } from '../flags.js';

const TEMPLATE = 'accountability-recap';

const HEADLINE_RAMP = [
  { chars: 16, lines: 2, font: 92 },
  { chars: 20, lines: 3, font: 78 },
  { chars: 24, lines: 3, font: 68 },
  { chars: 30, lines: 4, font: 58 },
];

const PICK_RAMP = [
  { chars: 24, lines: 2, font: 44 },
  { chars: 32, lines: 3, font: 38 },
  { chars: 42, lines: 3, font: 34 },
];

export default function accountabilityRecap(card = {}, size) {
  const { width, height } = size;
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'headline', hint: 'Short viral recap headline, e.g. "TOCÓ RENDIR CUENTAS".' },
      { field: 'homeTeam', hint: 'Home team display name.' },
      { field: 'awayTeam', hint: 'Away team display name.' },
      { field: 'pickShort', hint: 'Initial prediction text.' },
    ],
    { template: TEMPLATE },
  );

  const headline = sanitizeVisualText(required.headline).toUpperCase();
  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const pick = sanitizeVisualText(required.pickShort);
  const match = `${home} vs ${away}`;
  const headlineFit = fitTextRamp(headline, HEADLINE_RAMP, { label: 'accountability headline' });
  const pickFit = fitTextRamp(`Pick inicial: ${pick}`, PICK_RAMP, { label: 'accountability pick' });
  const isSquare = Math.abs(width - height) < 4;
  const centerX = width / 2;
  const flagW = Math.round(width * 0.25);
  const flagH = Math.round(flagW * 0.64);
  const flagY = isSquare ? 140 : 190;
  const cardTop = isSquare ? 505 : 650;
  const cardHeight = isSquare ? 315 : 370;

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="recapGlow" cx="50%" cy="18%" r="82%">
        <stop offset="0%" stop-color="${TOKENS.color.red600}" stop-opacity=".30"/>
        <stop offset="45%" stop-color="${TOKENS.color.jaguar300}" stop-opacity=".16"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="recapCard" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jungle900}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}"/>
      <rect width="${width}" height="${height}" fill="url(#recapGlow)"/>
      ${dotGrid({ width, height, opacity: 0.11 })}
      <text x="${centerX}" y="${isSquare ? 72 : 98}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">PREDICCIÓN VS REALIDAD</text>

      ${flagImage({ code: payload.flagCodeHome || home, x: 96, y: flagY, width: flagW, height: flagH, rx: 24 })}
      ${flagImage({ code: payload.flagCodeAway || away, x: width - 96 - flagW, y: flagY, width: flagW, height: flagH, rx: 24 })}
      <text x="${centerX}" y="${flagY + flagH / 2 + 12}" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="46" font-weight="1000" fill="${TOKENS.color.white}">FT+30</text>
      <text x="${centerX}" y="${flagY + flagH + 82}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="34" font-weight="900" fill="${TOKENS.color.offWhite}">${escapeXml(clipText(match, 40))}</text>

      ${textLines(headlineFit.lines, {
        x: centerX,
        y: isSquare ? 420 : 520,
        fontSize: headlineFit.fontSize,
        lineHeight: headlineFit.lineHeight + 4,
        fill: TOKENS.color.white,
        weight: 1000,
      })}

      <rect x="86" y="${cardTop}" width="${width - 172}" height="${cardHeight}" rx="42" fill="url(#recapCard)" stroke="${TOKENS.color.turquoise400}" stroke-opacity=".55" stroke-width="4"/>
      <text x="${centerX}" y="${cardTop + 72}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="30" font-weight="900" letter-spacing=".14em" fill="${TOKENS.color.turquoise400}">LA LIBRETA QUEDA ABIERTA</text>
      ${textLines(pickFit.lines, {
        x: centerX,
        y: cardTop + 150,
        fontSize: pickFit.fontSize,
        lineHeight: pickFit.lineHeight + 8,
        fill: TOKENS.color.white,
        weight: 900,
      })}
      <text x="${centerX}" y="${cardTop + cardHeight - 78}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="32" font-weight="900" fill="${TOKENS.color.jaguar300}">¿Lectura fina o nos quemó el Mundial?</text>
      <text x="${centerX}" y="${cardTop + cardHeight - 32}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="25" font-weight="800" fill="${TOKENS.color.neutral300}">Acierto o error: aquí se rinde cuentas.</text>

      ${logoLockup({ x: centerX, y: height - (isSquare ? 62 : 92), mark: 62 })}
    `,
  });
}

export { TEMPLATE };
