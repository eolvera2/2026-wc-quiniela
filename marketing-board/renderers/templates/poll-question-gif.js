import { TOKENS, PREDICTAGOL_LOGO_DATA_URI, escapeXml, sanitizeVisualText, svgShell } from '../tokens.js';
import { flagImage } from '../flags.js';

const TEMPLATE = 'poll-question-gif';

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export default function pollQuestionGif(card = {}, size, options = {}) {
  const { width, height } = size;
  const payload = card.payload ?? {};
  const home = sanitizeVisualText(payload.homeTeam || payload?.target_match?.home, 'Equipo A');
  const away = sanitizeVisualText(payload.awayTeam || payload?.target_match?.away, 'Equipo B');
  const question = sanitizeVisualText(payload.question || payload.challengeQuestion || '¿Quién gana?');
  const progress = Math.max(0, Math.min(1, Number(options.progress ?? 1)));
  const pulse = Math.max(0, Math.min(1, easeOutBack(progress)));
  const qScale = 0.2 + pulse * 0.92;
  const ringScale = 0.65 + Math.sin(progress * Math.PI) * 0.35;
  const qOpacity = Math.min(1, progress * 1.5);
  const isSquare = Math.abs(width - height) < 4;
  const centerX = width / 2;
  const centerY = height * (isSquare ? 0.45 : 0.43);
  const logoSize = Math.round(width * 0.22);
  const flagW = Math.round(width * 0.25);
  const flagH = Math.round(flagW * 0.64);
  const flagY = centerY - flagH / 2;
  const labelY = flagY + flagH + 58;
  const chipY = height - (isSquare ? 158 : 230);

  return svgShell({
    width,
    height,
    defs: `
      <radialGradient id="pollGlow" cx="50%" cy="45%" r="72%">
        <stop offset="0%" stop-color="${TOKENS.color.lime400}" stop-opacity=".30"/>
        <stop offset="44%" stop-color="${TOKENS.color.turquoise400}" stop-opacity=".16"/>
        <stop offset="100%" stop-color="${TOKENS.color.navy950}" stop-opacity="0"/>
      </radialGradient>
      <filter id="questionShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity=".42"/>
      </filter>`,
    body: `
      <rect width="${width}" height="${height}" fill="${TOKENS.color.navy950}"/>
      <rect width="${width}" height="${height}" fill="url(#pollGlow)"/>
      <circle cx="${centerX}" cy="${centerY}" r="${Math.round(width * 0.34 * ringScale)}" fill="none" stroke="${TOKENS.color.lime400}" stroke-opacity=".28" stroke-width="10"/>
      <circle cx="${centerX}" cy="${centerY}" r="${Math.round(width * 0.22)}" fill="${TOKENS.color.jungle900}" stroke="${TOKENS.color.turquoise400}" stroke-width="6"/>
      ${flagImage({ code: payload.flagCodeHome || home, x: 84, y: flagY, width: flagW, height: flagH, rx: 28 })}
      ${flagImage({ code: payload.flagCodeAway || away, x: width - 84 - flagW, y: flagY, width: flagW, height: flagH, rx: 28 })}
      <text x="${84 + flagW / 2}" y="${labelY}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="34" font-weight="900" fill="${TOKENS.color.white}">${escapeXml(home.toUpperCase())}</text>
      <text x="${width - 84 - flagW / 2}" y="${labelY}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="34" font-weight="900" fill="${TOKENS.color.white}">${escapeXml(away.toUpperCase())}</text>
      <image href="${PREDICTAGOL_LOGO_DATA_URI}" x="${centerX - logoSize / 2}" y="${centerY - logoSize / 2}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
      <g transform="translate(${centerX} ${centerY}) scale(${qScale})" opacity="${qOpacity}" filter="url(#questionShadow)">
        <text x="0" y="40" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="${Math.round(width * 0.42)}" font-weight="1000" fill="${TOKENS.color.lime400}" stroke="${TOKENS.color.navy950}" stroke-width="12" paint-order="stroke">?</text>
      </g>
      <text x="${centerX}" y="${height * (isSquare ? 0.18 : 0.16)}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="34" font-weight="900" letter-spacing=".16em" fill="${TOKENS.color.lime400}">POLL DE COMUNIDAD</text>
      <text x="${centerX}" y="${height * (isSquare ? 0.73 : 0.70)}" text-anchor="middle" font-family='${TOKENS.font.display}' font-size="${isSquare ? 82 : 88}" font-weight="1000" fill="${TOKENS.color.white}">${escapeXml(question)}</text>
      <g>
        <rect x="${centerX - 358}" y="${chipY - 56}" width="716" height="104" rx="52" fill="none" stroke="${TOKENS.color.turquoise400}" stroke-width="5"/>
        <text x="${centerX}" y="${chipY + 10}" text-anchor="middle" font-family='${TOKENS.font.body}' font-size="31" font-weight="900" fill="${TOKENS.color.offWhite}">${escapeXml(home)} / Empate / ${escapeXml(away)}</text>
      </g>
      <text x="${centerX}" y="${height - 62}" text-anchor="middle" font-family='${TOKENS.font.brand}' font-size="34" font-weight="400" letter-spacing=".08em" fill="${TOKENS.color.white}">PREDICTAGOL</text>
    `,
  });
}

export { TEMPLATE };
