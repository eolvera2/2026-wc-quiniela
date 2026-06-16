import { MissingDataError, TOKENS, clipText, dotGrid, escapeXml, fitTextRamp, logoLockup, requireFields, safeZone, sanitizeVisualText, svgShell, textLines, wrapText } from '../tokens.js';

const TEMPLATE = 'launch-announcement';

const TITLE_RAMPS = {
  1920: [
    { chars: 13, lines: 4, font: 136 },
    { chars: 15, lines: 4, font: 122 },
    { chars: 17, lines: 5, font: 108 },
    { chars: 20, lines: 5, font: 96 },
    { chars: 24, lines: 6, font: 84 },
    { chars: 28, lines: 6, font: 74 },
  ],
  1350: [
    { chars: 14, lines: 4, font: 124 },
    { chars: 16, lines: 4, font: 110 },
    { chars: 18, lines: 5, font: 96 },
    { chars: 22, lines: 5, font: 84 },
    { chars: 26, lines: 6, font: 72 },
  ],
  1080: [
    { chars: 14, lines: 4, font: 104 },
    { chars: 16, lines: 4, font: 92 },
    { chars: 18, lines: 5, font: 80 },
    { chars: 22, lines: 5, font: 70 },
    { chars: 26, lines: 6, font: 62 },
  ],
};

export default function launchAnnouncement(card = {}, size) {
  const { width, height } = size;
  const safe = safeZone(size);
  const payload = card.payload ?? {};
  if (!card.title || !String(card.title).trim()) {
    throw new MissingDataError({ template: TEMPLATE, field: 'title', hint: 'Launch headline shown as the main visual title.' });
  }
  const required = requireFields(
    payload,
    [
      { field: 'eyebrow', hint: 'Short uppercase eyebrow above the title, e.g. "BIENVENIDOS AL MUNDIAL 2026".' },
      { field: 'subtitle', aliases: ['statLine', 'cta'], hint: 'Supporting line below the title; use payload.statLine or payload.cta.' },
    ],
    { template: TEMPLATE },
  );
  const eyebrow = sanitizeVisualText(required.eyebrow);
  const title = sanitizeVisualText(card.title).toUpperCase();
  const subtitle = clipText(required.subtitle, 118);
  const rampKey = height >= 1900 ? 1920 : height >= 1300 ? 1350 : 1080;
  const fitted = fitTextRamp(title, TITLE_RAMPS[rampKey], { label: `launch title @${rampKey}` });
  const titleY = safe.top + (height >= 1900 ? 300 : 210);
  const subtitleY = Math.min(
    height - safe.bottom - 185,
    titleY + fitted.lines.length * fitted.lineHeight + 70,
  );

  return svgShell({
    width,
    height,
    defs: `
      <linearGradient id="festival" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.color.jungle900}"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy900}"/>
      </linearGradient>
      <radialGradient id="goldGlow" cx="82%" cy="12%" r="62%">
        <stop offset="0%" stop-color="${TOKENS.color.jaguar300}" stop-opacity=".55"/>
        <stop offset="100%" stop-color="${TOKENS.color.jaguar300}" stop-opacity="0"/>
      </radialGradient>`,
    body: `
      <rect width="${width}" height="${height}" fill="url(#festival)"/>
      <rect width="${width}" height="${height}" fill="url(#goldGlow)"/>
      ${dotGrid({ width, height })}
      <circle cx="${width - 92}" cy="${safe.top + 44}" r="62" fill="none" stroke="${TOKENS.color.turquoise400}" stroke-width="8" opacity=".5"/>
      <text x="${safe.left}" y="${safe.top + 40}" font-family='${TOKENS.font.body}' font-size="30" font-weight="800" letter-spacing=".18em" fill="${TOKENS.color.jaguar300}">${escapeXml(eyebrow)}</text>
      ${textLines(fitted.lines, { x: width / 2, y: titleY, fontSize: fitted.fontSize, lineHeight: fitted.lineHeight, fill: TOKENS.color.white, extra: 'letter-spacing="-0.045em"' })}
      ${textLines(wrapText(subtitle, 42), { x: width / 2, y: subtitleY, fontSize: 38, lineHeight: 50, weight: 500, family: TOKENS.font.body, fill: TOKENS.color.offWhite })}
      <rect x="${safe.left}" y="${height - safe.bottom - 175}" width="${width - safe.left - safe.right}" height="2" fill="${TOKENS.color.jaguar300}" opacity=".55"/>
      ${logoLockup({ x: width / 2, y: height - safe.bottom - 78, mark: 78 })}
    `,
  });
}
