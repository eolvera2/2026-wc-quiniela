// Embeds flagcdn.com PNG flags (the same source the main site uses) into rendered
// SVG posters. Resvg-js cannot render color emoji flags from system fonts, so
// templates must use <image> elements with base64-encoded PNGs.
//
// Usage:
//   import { ensureFlagsForCard, flagImage, resolveFlagCode } from './flags.js';
//   await ensureFlagsForCard(card);          // pre-warm disk cache
//   const svg = flagImage({ code: 'br', x, y, width, height });  // sync, returns <image>

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  WORLD_CUP_TEAMS,
  decorateTeam,
  getTeamPresentationByCode,
  getTeamPresentationByName,
} from '../../src/data/worldCupTeams.js';

const CACHE_DIR = 'marketing-board/.cache/flags';
const FLAG_URL = (code) => `https://flagcdn.com/w320/${code}.png`;
// flagcdn special "GB-ENG" / "GB-SCT" subdivisions are only available as SVG.
// Use SVG mode for those so we still get a usable raster after resvg renders.
const SUBDIVISION_FLAGS = new Set(['gb-eng', 'gb-sct', 'gb-wls', 'gb-nir']);
const FLAG_SVG_URL = (code) => `https://flagcdn.com/${code}.svg`;

// Build a lookup: any reasonable text input → flagcdn ISO code.
// Includes seedName, displayName, FIFA-3 code, ISO code, and a few common aliases.
function buildLookup() {
  const map = new Map();
  const add = (key, code) => {
    if (!key || !code) return;
    map.set(String(key).trim().toLowerCase(), code);
  };
  for (const team of WORLD_CUP_TEAMS) {
    add(team.seedName, team.flag);
    add(team.displayName, team.flag);
    add(team.code, team.flag);
    add(team.flag, team.flag);
    if (team.fifaName) add(team.fifaName, team.flag);
  }
  // Common Spanish/English variants the website doesn't list directly.
  add('mexico', 'mx');
  add('méxico', 'mx');
  add('united states', 'us');
  add('estados unidos', 'us');
  add('usa', 'us');
  add('eeuu', 'us');
  add('south africa', 'za');
  add('sudáfrica', 'za');
  add('sudafrica', 'za');
  add('south korea', 'kr');
  add('korea republic', 'kr');
  add('korea', 'kr');
  add('iran', 'ir');
  add('irán', 'ir');
  add('ir iran', 'ir');
  add('cape verde', 'cv');
  add('cabo verde', 'cv');
  add('saudi arabia', 'sa');
  add('arabia saudita', 'sa');
  add('arabia saudí', 'sa');
  add('curacao', 'cw');
  add('curaçao', 'cw');
  add('curazao', 'cw');
  add('ivory coast', 'ci');
  add('cote d\'ivoire', 'ci');
  add('côte d\'ivoire', 'ci');
  add('costa de marfil', 'ci');
  add('netherlands', 'nl');
  add('países bajos', 'nl');
  add('paises bajos', 'nl');
  add('holanda', 'nl');
  add('czechia', 'cz');
  add('czech republic', 'cz');
  add('chequia', 'cz');
  add('república checa', 'cz');
  add('jordan', 'jo');
  add('jordania', 'jo');
  add('uzbekistan', 'uz');
  add('uzbekistán', 'uz');
  add('algeria', 'dz');
  add('argelia', 'dz');
  add('turkey', 'tr');
  add('türkiye', 'tr');
  add('turkiye', 'tr');
  add('turquía', 'tr');
  add('dr congo', 'cd');
  add('congo dr', 'cd');
  add('república democrática del congo', 'cd');
  add('republica democratica del congo', 'cd');
  add('bosnia & herzegovina', 'ba');
  add('bosnia and herzegovina', 'ba');
  add('bosnia y herzegovina', 'ba');
  add('haiti', 'ht');
  add('haití', 'ht');
  add('scotland', 'gb-sct');
  add('escocia', 'gb-sct');
  add('england', 'gb-eng');
  add('inglaterra', 'gb-eng');
  add('panama', 'pa');
  add('panamá', 'pa');
  add('paraguay', 'py');
  add('peru', 'pe');
  add('perú', 'pe');
  add('australia', 'au');
  add('austria', 'at');
  add('belgium', 'be');
  add('bélgica', 'be');
  add('brazil', 'br');
  add('brasil', 'br');
  add('canada', 'ca');
  add('canadá', 'ca');
  add('colombia', 'co');
  add('croatia', 'hr');
  add('croacia', 'hr');
  add('ecuador', 'ec');
  add('egypt', 'eg');
  add('egipto', 'eg');
  add('france', 'fr');
  add('francia', 'fr');
  add('germany', 'de');
  add('alemania', 'de');
  add('ghana', 'gh');
  add('iraq', 'iq');
  add('irak', 'iq');
  add('japan', 'jp');
  add('japón', 'jp');
  add('japon', 'jp');
  add('morocco', 'ma');
  add('marruecos', 'ma');
  add('new zealand', 'nz');
  add('nueva zelanda', 'nz');
  add('norway', 'no');
  add('noruega', 'no');
  add('paraguay', 'py');
  add('portugal', 'pt');
  add('qatar', 'qa');
  add('catar', 'qa');
  add('senegal', 'sn');
  add('spain', 'es');
  add('españa', 'es');
  add('espana', 'es');
  add('sweden', 'se');
  add('suecia', 'se');
  add('switzerland', 'ch');
  add('suiza', 'ch');
  add('tunisia', 'tn');
  add('túnez', 'tn');
  add('tunez', 'tn');
  add('uruguay', 'uy');
  add('argentina', 'ar');
  return map;
}

const LOOKUP = buildLookup();

export function resolveFlagCode(input) {
  if (!input) return null;
  const text = String(input).trim();
  if (!text) return null;
  // Already a flagcdn code? (2 letters, or "gb-eng"-style)
  const lower = text.toLowerCase();
  if (/^[a-z]{2}$/.test(lower) || /^gb-(eng|sct|wls|nir)$/.test(lower)) {
    return lower;
  }
  // Try registry first; fall back to decorateTeam logic; fall back to lookup table.
  const presentation =
    getTeamPresentationByCode(text.toUpperCase()) ||
    getTeamPresentationByName(text) ||
    null;
  if (presentation?.flag) return presentation.flag;
  return LOOKUP.get(lower) || null;
}

function cachePath(code) {
  return join(CACHE_DIR, `${code}.png`);
}

function svgCachePath(code) {
  return join(CACHE_DIR, `${code}.svg`);
}

async function downloadFlag(code) {
  // Subdivisions (gb-eng, gb-sct) are SVG-only on flagcdn — fetch the SVG and embed raw.
  if (SUBDIVISION_FLAGS.has(code)) {
    const url = FLAG_SVG_URL(code);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`flagcdn ${code}: HTTP ${res.status}`);
    const svgText = await res.text();
    const path = svgCachePath(code);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, svgText, 'utf8');
    return { path, kind: 'svg' };
  }
  const url = FLAG_URL(code);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`flagcdn ${code}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = cachePath(code);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return { path, kind: 'png' };
}

export async function ensureFlagCached(codeOrName) {
  const code = resolveFlagCode(codeOrName);
  if (!code) return null;
  const png = cachePath(code);
  const svg = svgCachePath(code);
  if (existsSync(png) && statSync(png).size > 100) return { code, path: png, kind: 'png' };
  if (existsSync(svg) && statSync(svg).size > 100) return { code, path: svg, kind: 'svg' };
  const result = await downloadFlag(code);
  return { code, path: result.path, kind: result.kind };
}

export async function ensureFlagsCached(codesOrNames = []) {
  const unique = Array.from(new Set(codesOrNames.filter(Boolean).map((x) => String(x).toLowerCase())));
  const results = [];
  for (const item of unique) {
    try {
      const result = await ensureFlagCached(item);
      if (result) results.push(result);
    } catch (error) {
      console.warn(`[flags] could not cache "${item}": ${error.message}`);
    }
  }
  return results;
}

// Walk a card payload and pre-cache flags for every team-like field we know about.
export async function ensureFlagsForCard(card) {
  if (!card?.payload) return;
  const payload = card.payload;
  const candidates = [
    payload.homeTeam, payload.awayTeam,
    payload.team, payload.teamHome, payload.teamAway,
    payload.country, payload.countryHome, payload.countryAway,
    payload.flagCodeHome, payload.flagCodeAway,
    payload?.target_match?.home, payload?.target_match?.away,
  ];
  await ensureFlagsCached(candidates);
}

function dataUriPng(path) {
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function readSvgInline(path, { width, height, x = 0, y = 0 }) {
  // Inline the foreign SVG inside a <svg> wrapper so it lays out predictably.
  // The viewBox of flag SVGs from flagcdn is typically "0 0 w h"; we'll set our
  // own width/height to control sizing.
  const raw = readFileSync(path, 'utf8');
  // Strip XML preamble if present.
  const cleaned = raw.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '').trim();
  return `<g transform="translate(${x} ${y})"><svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice">${cleaned}</svg></g>`;
}

/**
 * Returns an SVG fragment placing the flag at (x, y) sized (width × height).
 * `code` is the flagcdn ISO code (e.g. "br", "ma", "gb-sct").
 * Falls back to an empty string if the cache is missing — call `ensureFlagsCached`
 * during card preparation to avoid this.
 */
export function flagImage({ code, x, y, width, height, rx = 10, ry = rx }) {
  const resolved = resolveFlagCode(code);
  if (!resolved) return '';
  const png = cachePath(resolved);
  const svg = svgCachePath(resolved);
  if (existsSync(png) && statSync(png).size > 100) {
    const uri = dataUriPng(png);
    return (
      `<g>` +
      `<defs><clipPath id="flagClip_${resolved}_${Math.round(x)}_${Math.round(y)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${ry}"/></clipPath></defs>` +
      `<image href="${uri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#flagClip_${resolved}_${Math.round(x)}_${Math.round(y)})"/>` +
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>` +
      `</g>`
    );
  }
  if (existsSync(svg) && statSync(svg).size > 100) {
    return readSvgInline(svg, { width, height, x, y });
  }
  return '';
}

/** Convenience for templates: returns the flagcdn code given any team identifier. */
export function teamFlagCode(input) {
  return resolveFlagCode(input);
}

/** Returns the official 3-letter code (FIFA) for display fallbacks. */
export function teamCodeFor(input) {
  if (!input) return null;
  const text = String(input).trim();
  const upper = text.toUpperCase();
  const byCode = getTeamPresentationByCode(upper);
  if (byCode) return byCode.code;
  const byName = getTeamPresentationByName(text);
  if (byName) return byName.code;
  return null;
}

export { decorateTeam };
