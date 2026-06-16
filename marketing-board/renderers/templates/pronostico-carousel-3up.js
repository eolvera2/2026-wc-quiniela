import {
  TOKENS,
  clipText,
  escapeXml,
  fitTextRamp,
  logoLockup,
  requireFields,
  safeZone,
  sanitizeVisualText,
  svgShell,
  textLines,
} from '../tokens.js';
import { flagImage, teamFlagCode } from '../flags.js';

const TEMPLATE = 'pronostico-carousel-3up';
const SIZE = { width: 1080, height: 1350 }; // Instagram carousel standard.

const HOOK_RAMP = [
  { chars: 22, lines: 2, font: 84 },
  { chars: 26, lines: 2, font: 72 },
  { chars: 30, lines: 3, font: 62 },
  { chars: 36, lines: 3, font: 54 },
  { chars: 46, lines: 4, font: 46 },
];

const BODY_RAMP = [
  { chars: 32, lines: 2, font: 52 },
  { chars: 40, lines: 3, font: 46 },
  { chars: 50, lines: 4, font: 40 },
];

/**
 * Returns an array of { slide, svg } objects. Each slide is intended to be
 * exported as a separate PNG (used by IG carousels and FB multi-image posts).
 *
 * Slide 1: Matchup hook (big title + flags row).
 * Slide 2: Data callout — PGS® + pick.
 * Slide 3: CTA + brand close.
 */
export default function pronosticoCarousel3up(card = {}) {
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'homeTeam', hint: 'Spanish team name e.g. "México".' },
      { field: 'awayTeam', hint: 'Spanish team name e.g. "Sudáfrica".' },
      { field: 'kickoff', hint: 'ISO datetime for the match.' },
      { field: 'venue', hint: 'Venue name from the calendar.' },
      { field: 'pgsHome', hint: 'PGS® score for the home team (string number).' },
      { field: 'pgsAway', hint: 'PGS® score for the away team (string number).' },
      { field: 'pickShort', hint: 'Short initial pick e.g. "México gana".' },
      { field: 'cta', hint: 'Closing CTA text.' },
    ],
    { template: TEMPLATE },
  );

  const home = sanitizeVisualText(required.homeTeam);
  const away = sanitizeVisualText(required.awayTeam);
  const hook = sanitizeVisualText(payload.slideTitle || card.title || payload.hook || `${home} vs ${away}`);
  const flagHome = payload.flagCodeHome || teamFlagCode(required.homeTeam);
  const flagAway = payload.flagCodeAway || teamFlagCode(required.awayTeam);

  return [
    { slide: 1, key: 'slide_1', svg: slideHook(hook, home, away, { ...required, flagHome, flagAway }) },
    { slide: 2, key: 'slide_2', svg: slideData(home, away, required) },
    { slide: 3, key: 'slide_3', svg: slideCta(required) },
  ];
}

function slideHook(hook, home, away, required) {
  const { width, height } = SIZE;
  const safe = safeZone(SIZE);
  const fitted = fitTextRamp(clipText(hook, 110), HOOK_RAMP, { label: 'carousel slide-1 hook' });
  // Flag images are 240×180 (4:3, matches flagcdn w320 source) centered on each side.
  const flagW = 240;
  const flagH = 180;
  const flagY = height - safe.bottom - 360;
  const flagHomeX = width * 0.27 - flagW / 2;
  const flagAwayX = width * 0.73 - flagW / 2;
  return svgShell({
    width,
    height,
    defs: `
      <linearGradient id="hookBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.navy950}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jungle900}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#hookBg)"/>
      <circle cx="120" cy="${height - 140}" r="280" fill="${TOKENS.color.turquoise400}" opacity=".10"/>
      <circle cx="${width - 70}" cy="${safe.top + 80}" r="220" fill="${TOKENS.color.jaguar300}" opacity=".14"/>

      <text x="${safe.left}" y="${safe.top + 40}" font-family='${TOKENS.font.body}' font-size="28"
        font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">PRONÓSTICO DEL DÍA · 1/3</text>

      ${textLines(fitted.lines, {
        x: width / 2,
        y: safe.top + 200,
        fontSize: fitted.fontSize,
        lineHeight: fitted.lineHeight + 10,
        fill: TOKENS.color.white,
      })}

      ${flagImage({ code: required.flagHome, x: flagHomeX, y: flagY, width: flagW, height: flagH, rx: 14 })}
      ${flagImage({ code: required.flagAway, x: flagAwayX, y: flagY, width: flagW, height: flagH, rx: 14 })}

      <text x="${width / 2}" y="${flagY + flagH / 2 + 26}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="76" font-weight="900"
        fill="${TOKENS.color.jaguar300}">VS</text>

      <text x="${width * 0.27}" y="${flagY + flagH + 70}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="44" font-weight="900"
        fill="${TOKENS.color.white}">${escapeXml(home.toUpperCase())}</text>
      <text x="${width * 0.73}" y="${flagY + flagH + 70}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="44" font-weight="900"
        fill="${TOKENS.color.white}">${escapeXml(away.toUpperCase())}</text>

      <text x="${width / 2}" y="${height - safe.bottom - 80}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="700" fill="${TOKENS.color.neutral300}">Desliza →</text>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 28, mark: 50 })}
    `,
  });
}

function slideData(home, away, required) {
  const { width, height } = SIZE;
  const safe = safeZone(SIZE);
  const pgsLabel = `${home} ${required.pgsHome}-${required.pgsAway} ${away}`;
  const pickLine = `Pick inicial: ${sanitizeVisualText(required.pickShort)}`;
  const pickFitted = fitTextRamp(clipText(pickLine, 64), BODY_RAMP, { label: 'carousel slide-2 pick' });
  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="dataBg2" cx="50%" cy="38%" r="70%">
        <stop offset="0%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}"/>
      </radialGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#dataBg2)"/>
      <text x="${safe.left}" y="${safe.top + 40}" font-family='${TOKENS.font.body}' font-size="28"
        font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">DATOS · 2/3</text>

      <text x="${width / 2}" y="${safe.top + 200}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="32" font-weight="900"
        letter-spacing=".15em" fill="${TOKENS.color.turquoise400}">PGS® INICIAL</text>

      <text x="${width / 2}" y="${safe.top + 380}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="200" font-weight="900"
        fill="${TOKENS.color.jaguar300}">${escapeXml(`${required.pgsHome}-${required.pgsAway}`)}</text>

      <text x="${width / 2}" y="${safe.top + 470}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="32" font-weight="700"
        fill="${TOKENS.color.white}">${escapeXml(pgsLabel)}</text>

      <rect x="${safe.left}" y="${safe.top + 540}" width="${width - safe.left - safe.right}" height="2" fill="${TOKENS.color.neutral500}" opacity=".4"/>

      <text x="${width / 2}" y="${safe.top + 640}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="28" font-weight="900"
        letter-spacing=".15em" fill="${TOKENS.color.turquoise400}">🎯 NUESTRO PICK</text>

      ${textLines(pickFitted.lines, {
        x: width / 2,
        y: safe.top + 720,
        fontSize: pickFitted.fontSize,
        lineHeight: pickFitted.lineHeight + 6,
        fill: TOKENS.color.white,
        weight: 800,
      })}

      <text x="${width / 2}" y="${height - safe.bottom - 80}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="26" font-weight="700" fill="${TOKENS.color.neutral300}">Desliza →</text>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 28, mark: 50 })}
    `,
  });
}

function slideCta(required) {
  const { width, height } = SIZE;
  const safe = safeZone(SIZE);
  const cta = sanitizeVisualText(required.cta);
  return svgShell({
    width,
    height,
    defs: `
      <linearGradient id="ctaBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.jungle900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#ctaBg)"/>
      <circle cx="${width / 2}" cy="${height / 2 - 100}" r="320" fill="${TOKENS.color.jaguar300}" opacity=".12"/>

      <text x="${safe.left}" y="${safe.top + 40}" font-family='${TOKENS.font.body}' font-size="28"
        font-weight="900" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">TU TURNO · 3/3</text>

      <text x="${width / 2}" y="${height / 2 - 60}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="92" font-weight="900"
        fill="${TOKENS.color.white}">¿Cuál es tu pick?</text>

      <text x="${width / 2}" y="${height / 2 + 40}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="38" font-weight="600"
        fill="${TOKENS.color.neutral300}">Compártelo en comentarios</text>

      <rect x="${width / 2 - 280}" y="${height / 2 + 130}" width="560" height="88" rx="44" fill="${TOKENS.color.jaguar300}"/>
      <text x="${width / 2}" y="${height / 2 + 185}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="34" font-weight="900"
        fill="${TOKENS.color.navy950}">${escapeXml(clipText(cta, 36))}</text>

      ${logoLockup({ x: width / 2, y: height - safe.bottom - 38, mark: 64 })}
    `,
  });
}

export const carouselMeta = {
  template: TEMPLATE,
  format_variant: 'carousel_3up',
  sizes: ['1080x1350'],
  slides: 3,
};
