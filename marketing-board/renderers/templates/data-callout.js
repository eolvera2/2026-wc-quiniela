import {
  MissingDataError,
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

const TEMPLATE = 'data-callout';

// Subtitle ramp (lines below the big number).
const SUBTITLE_RAMP = [
  { chars: 30, lines: 2, font: 44 },
  { chars: 36, lines: 2, font: 40 },
  { chars: 42, lines: 3, font: 36 },
  { chars: 50, lines: 3, font: 32 },
];

export default function dataCallout(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const payload = card.payload ?? {};
  const required = requireFields(
    payload,
    [
      { field: 'bigNumber', hint: 'The headline number/stat e.g. "2-1" or "104".' },
      { field: 'eyebrow', hint: 'Short label above the number e.g. "PGS® MEX-RSA".' },
      { field: 'subtitle', hint: 'One-line subtitle that explains the number.' },
      { field: 'cta', hint: 'Short CTA text (max ~40 chars).' },
    ],
    { template: TEMPLATE },
  );

  const bigNumber = sanitizeVisualText(required.bigNumber);
  const eyebrow = sanitizeVisualText(required.eyebrow).toUpperCase();
  const subtitle = sanitizeVisualText(required.subtitle);
  const cta = sanitizeVisualText(required.cta);

  // Auto-size the giant number to fit width. Reserve safe-zone padding both sides.
  const innerWidth = width - safe.left - safe.right;
  // Rough character-width heuristic: 0.55 of font-size per char in display weight.
  const numberFontSize = Math.min(420, Math.floor(innerWidth / Math.max(2, bigNumber.length * 0.55)));

  const subtitleFitted = fitTextRamp(subtitle, SUBTITLE_RAMP, { label: `data-callout subtitle @${height}` });

  // Vertical layout: eyebrow → bigNumber (centered visually) → subtitle → CTA.
  const centerY = height / 2;
  const numberY = centerY + numberFontSize / 3; // baseline tweak

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="dataBg" cx="50%" cy="42%" r="65%">
        <stop offset="0%" stop-color="${TOKENS.color.navy900}"/>
        <stop offset="60%" stop-color="${TOKENS.color.navy950}"/>
        <stop offset="100%" stop-color="#000915"/>
      </radialGradient>
      <linearGradient id="numberFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.jaguar300}"/>
        <stop offset="100%" stop-color="${TOKENS.color.jaguar500}"/>
      </linearGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#dataBg)"/>
      <circle cx="${width - 80}" cy="80" r="170" fill="${TOKENS.color.turquoise400}" opacity=".10"/>
      <circle cx="80" cy="${height - 80}" r="200" fill="${TOKENS.color.jaguar300}" opacity=".08"/>

      <text x="${width / 2}" y="${centerY - numberFontSize * 0.65}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="34" font-weight="900"
        letter-spacing=".22em" fill="${TOKENS.color.turquoise400}">${escapeXml(clipText(eyebrow, 36))}</text>

      <text x="${width / 2}" y="${numberY}" text-anchor="middle"
        font-family='${TOKENS.font.display}' font-size="${numberFontSize}" font-weight="900"
        fill="url(#numberFill)" letter-spacing="-.02em">${escapeXml(clipText(bigNumber, 18))}</text>

      ${textLines(subtitleFitted.lines, {
        x: width / 2,
        y: centerY + numberFontSize * 0.55,
        fontSize: subtitleFitted.fontSize,
        lineHeight: subtitleFitted.lineHeight + 10,
        fill: TOKENS.color.white,
        weight: 700,
      })}

      <rect x="${width / 2 - 240}" y="${height - safe.bottom - 150}" width="480" height="68" rx="34" fill="${TOKENS.color.jaguar300}"/>
      <text x="${width / 2}" y="${height - safe.bottom - 106}" text-anchor="middle"
        font-family='${TOKENS.font.body}' font-size="26" font-weight="900"
        fill="${TOKENS.color.navy950}">${escapeXml(clipText(cta, 40))}</text>

      ${logoLockup({ x: width / 2, y: height - safe.bottom - 38, mark: 58 })}
    `,
  });
}

export const dataCalloutMeta = {
  template: TEMPLATE,
  sizes: ['1080x1080'],
};
