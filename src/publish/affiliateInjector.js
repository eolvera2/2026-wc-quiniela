/**
 * Affiliate link injector — pure regex logic.
 * Wraps the FIRST occurrence of each trigger group's keywords with the
 * corresponding affiliate <a> tag (rel="sponsored").
 *
 * Groups (from docs/plan.md Phase 4):
 *   Caliente: momios | apostar | apuesta | Caliente
 *   Bet365:   pronóstico/pronostico | juega
 *   Skimlinks: la verde | jersey | Nike
 *
 * Rules:
 *   - Case/accent insensitive matching
 *   - Only first match per trigger GROUP (not per keyword)
 *   - Adds rel="sponsored" (Google requirement)
 *   - Does not inject inside existing <a>...</a> tags
 */

const PLACEHOLDER_AFFILIATE_PATH = 'placeholder-not-configured';
const PLACEHOLDER_AFFILIATE_URL = `https://www.predictagol.com/${PLACEHOLDER_AFFILIATE_PATH}`;

/**
 * @param {string} html - The article HTML content
 * @param {{ caliente: string, bet365: string, skimlinks: string }} urls - Affiliate URLs
 * @returns {string} HTML with affiliate links injected
 */
export function injectAffiliateLinks(html, urls) {
  const groups = [
    {
      pattern: /momios|apostar|apuesta|caliente/i,
      url: urls.caliente,
    },
    {
      // Match pronóstico OR pronostico (accent-insensitive)
      pattern: /pron[oó]stico|juega/i,
      url: urls.bet365,
    },
    {
      pattern: /la verde|jersey|nike/i,
      url: urls.skimlinks,
    },
  ];

  let result = stripPlaceholderLinks(html);

  for (const group of groups) {
    result = replaceFirstOutsideLinks(result, group.pattern, group.url);
  }

  return stripPlaceholderLinks(result);
}

/**
 * Replaces the first occurrence of `pattern` that is NOT inside an <a>...</a> tag.
 */
function replaceFirstOutsideLinks(html, pattern, url) {
  if (!isUsableAffiliateUrl(url)) return html;

  // Split by <a ...>...</a> segments to avoid injecting inside links
  // Strategy: walk through HTML, find segments outside <a> tags, apply replacement to first match found
  let replaced = false;
  let result = '';

  // Regex to find <a ...>...</a> blocks (non-greedy)
  const linkRegex = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
  let linkMatch;

  const linkPositions = [];
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    linkPositions.push({ start: linkMatch.index, end: linkMatch.index + linkMatch[0].length });
  }

  // Process segments between links
  let segStart = 0;
  const segments = [];

  for (const pos of linkPositions) {
    if (pos.start > segStart) {
      segments.push({ type: 'text', content: html.slice(segStart, pos.start) });
    }
    segments.push({ type: 'link', content: html.slice(pos.start, pos.end) });
    segStart = pos.end;
  }
  if (segStart < html.length) {
    segments.push({ type: 'text', content: html.slice(segStart) });
  }

  // If no link segments found, treat whole thing as text
  if (segments.length === 0) {
    segments.push({ type: 'text', content: html });
  }

  // Replace first match in text segments only
  for (const seg of segments) {
    if (seg.type === 'link' || replaced) {
      result += seg.content;
    } else {
      const match = seg.content.match(pattern);
      if (match) {
        const idx = match.index;
        const matchedText = match[0];
        const replacement = `<a href="${url}" rel="sponsored">${matchedText}</a>`;
        result += seg.content.slice(0, idx) + replacement + seg.content.slice(idx + matchedText.length);
        replaced = true;
      } else {
        result += seg.content;
      }
    }
  }

  return result;
}

function isUsableAffiliateUrl(url) {
  return Boolean(url) && url !== PLACEHOLDER_AFFILIATE_URL && url !== PLACEHOLDER_AFFILIATE_PATH;
}

function stripPlaceholderLinks(html) {
  return String(html || '').replace(
    /<a\b([^>]*\s)?href=["'](?:https:\/\/www\.predictagol\.com\/)?placeholder-not-configured["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$2',
  );
}
