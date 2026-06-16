import { readFileSync } from 'node:fs';

export const TOKENS = {
  color: {
    navy950: '#020f2a',
    navy900: '#071733',
    navy800: '#10234a',
    jungle950: '#002018',
    jungle900: '#003020',
    jungle800: '#004030',
    jaguar300: '#f4bd4f',
    jaguar500: '#d9942d',
    turquoise400: '#00c6a3',
    lime400: '#d7ea1f',
    white: '#ffffff',
    offWhite: '#f0f4ff',
    neutral300: '#b7c3d7',
    neutral500: '#8899bb',
    red600: '#c8102e',
    green500: '#16a34a',
    blue600: '#326295',
  },
  font: {
    display: '"Poppins", "Barlow Condensed", system-ui, sans-serif',
    body: '"Noto Sans", "Inter", "Segoe UI", system-ui, sans-serif',
    brand: '"PredictaGol", "Poppins", system-ui, sans-serif',
  },
  surface: {
    festivalGradient: 'linear-gradient(135deg, #003020 0%, #071733 100%)',
    jungle: '#002018',
    base: '#020f2a',
  },
  brandMarkPath: 'public/PredictaGol_Logo.png',
};

export const SAFE_ZONES = {
  '1080x1920': { top: 220, bottom: 380, left: 80, right: 80 },
  '1080x1350': { top: 80, bottom: 120, left: 80, right: 80 },
  '1080x1080': { top: 80, bottom: 80, left: 80, right: 80 },
};

export const SIZES = {
  '1080x1920': { width: 1080, height: 1920 },
  '1080x1350': { width: 1080, height: 1350 },
  '1080x1080': { width: 1080, height: 1080 },
};

const FORBIDDEN_WORDS = [
  'momios',
  'apuesta',
  'casa de apuestas',
  'apostar',
  'value bet',
  'parlay',
  '+EV',
  'betting',
  'bet',
  'odds',
];

export const PREDICTAGOL_LOGO_DATA_URI = `data:image/png;base64,${readFileSync(TOKENS.brandMarkPath).toString('base64')}`;

export function sizeKey(size) {
  return `${size.width}x${size.height}`;
}

export function safeZone(size) {
  return SAFE_ZONES[sizeKey(size)] ?? SAFE_ZONES['1080x1080'];
}

export function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sanitizeVisualText(value = '', fallback = '') {
  let text = String(value || fallback || '');
  for (const word of FORBIDDEN_WORDS) {
    text = text.replace(new RegExp(escapeRegExp(word), 'gi'), '');
  }
  return text.replace(/\s{2,}/g, ' ').trim();
}

export function clipText(value, max = 100) {
  const text = sanitizeVisualText(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

export class MissingDataError extends Error {
  constructor({ template, field, hint }) {
    super(
      `Missing required field "${field}" for template "${template}". ` +
        `Visual assets must never display placeholders or unknown values. ` +
        (hint ? `Hint: ${hint}` : 'Provide the real value from the calendar/portal data or do not render this card.'),
    );
    this.name = 'MissingDataError';
    this.template = template;
    this.field = field;
  }
}

function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

export function requireField(value, { template, field, hint }) {
  if (isMissingValue(value)) {
    throw new MissingDataError({ template, field, hint });
  }
  return value;
}

export function requireFields(payload = {}, fields, { template }) {
  const result = {};
  for (const spec of fields) {
    const field = typeof spec === 'string' ? spec : spec.field;
    const aliases = typeof spec === 'string' ? [spec] : (spec.aliases || [spec.field]);
    const hint = typeof spec === 'string' ? undefined : spec.hint;
    let value;
    for (const key of aliases) {
      const candidate = key.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), payload);
      if (!isMissingValue(candidate)) {
        value = candidate;
        break;
      }
    }
    result[field] = requireField(value, { template, field, hint });
  }
  return result;
}

export class TextOverflowError extends Error {
  constructor({ text, maxCharsPerLine, maxLines, produced }) {
    super(
      `Text overflow: "${text}" cannot fit in ${maxLines} line(s) at ${maxCharsPerLine} chars/line ` +
        `(would produce ${produced} line(s)).`,
    );
    this.name = 'TextOverflowError';
    this.text = text;
    this.maxCharsPerLine = maxCharsPerLine;
    this.maxLines = maxLines;
    this.produced = produced;
  }
}

export function wrapText(value, maxCharsPerLine, maxLines = Infinity) {
  const text = sanitizeVisualText(value);
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (Number.isFinite(maxLines) && lines.length > maxLines) {
    throw new TextOverflowError({ text, maxCharsPerLine, maxLines, produced: lines.length });
  }
  return lines;
}

export function fitTextRamp(value, ramp, { label = 'text' } = {}) {
  if (!Array.isArray(ramp) || ramp.length === 0) {
    throw new Error(`fitTextRamp requires a non-empty ramp for ${label}.`);
  }
  let lastError;
  for (const step of ramp) {
    try {
      const lines = wrapText(value, step.chars, step.lines);
      return {
        lines,
        fontSize: step.font,
        lineHeight: step.lineHeight ?? Math.round(step.font * 0.88),
        chars: step.chars,
        maxLines: step.lines,
      };
    } catch (error) {
      if (error instanceof TextOverflowError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  const detail = lastError ? ` Last attempt: ${lastError.message}` : '';
  throw new TextOverflowError({
    text: String(value),
    maxCharsPerLine: ramp[ramp.length - 1].chars,
    maxLines: ramp[ramp.length - 1].lines,
    produced: lastError?.produced ?? 0,
  });
}

export function textLines(lines, { x, y, fontSize, lineHeight, anchor = 'middle', weight = 800, family = TOKENS.font.display, fill = TOKENS.color.white, extra = '' }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family='${family}' font-size="${fontSize}" font-weight="${weight}" fill="${fill}" ${extra}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;
}

export function logoLockup({ x, y, mark = 74, anchor = 'middle' }) {
  const wordX = anchor === 'middle' ? x + mark / 2 + 18 : x + mark + 18;
  const imageX = anchor === 'middle' ? x - 154 : x;
  return `<g>
    <image href="${PREDICTAGOL_LOGO_DATA_URI}" x="${imageX}" y="${y - mark / 2}" width="${mark}" height="${mark}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${wordX}" y="${y + 13}" text-anchor="${anchor}" font-family='${TOKENS.font.brand}' font-size="${34}" font-weight="400" letter-spacing=".08em" text-transform="uppercase" fill="${TOKENS.color.white}">PREDICTAGOL</text>
  </g>`;
}

export function svgShell({ width, height, defs = '', body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
    <defs>${defs}</defs>
    ${body}
  </svg>`;
}

export function dotGrid({ width, height, opacity = 0.13 }) {
  return `<g opacity="${opacity}" fill="${TOKENS.color.offWhite}">
    ${Array.from({ length: Math.ceil(width / 72) }, (_, ix) =>
      Array.from({ length: Math.ceil(height / 72) }, (_, iy) => `<circle cx="${ix * 72 + 18}" cy="${iy * 72 + 18}" r="2.2"/>`).join('')
    ).join('')}
  </g>`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
