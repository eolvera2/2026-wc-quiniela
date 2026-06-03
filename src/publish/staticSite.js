
/**
 * Static HTML site generator — replaces WordPress publisher.
 * Renders articles from SQLite into a static site in outputDir (default: dist/).
 * Integrates affiliate links + disclaimer footer.
 *
 * Reference: docs/plans/2026-06-01-phase2-live-service-integration-implementation.md Task 9/12
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectAffiliateLinks } from './affiliateInjector.js';
import { DISCLAIMER_FOOTER } from '../generate/prompt.js';
import { generateSitemap } from './sitemap.js';

/**
 * Builds a URL-safe slug from article type and team names.
 *
 * @param {string} articleType - e.g. 'pronostico_momios'
 * @param {string} homeTeam    - e.g. 'México'
 * @param {string} awayTeam    - e.g. 'Alemania'
 * @returns {string} e.g. 'pronostico-momios-mexico-vs-alemania'
 */
export function buildSlug(articleType, homeTeam, awayTeam) {
  const normalize = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');

  return `${normalize(articleType)}-${normalize(homeTeam)}-vs-${normalize(awayTeam)}`;
}

/**
 * Renders all articles to a static site in outputDir.
 *
 * @param {{
 *   articles: Array<{
 *     fixtureId: number,
 *     articleType: string,
 *     homeTeam: string,
 *     awayTeam: string,
 *     contentJson: object,
 *   }>,
 *   siteBaseUrl: string,
 *   outputDir?: string,
 *   affiliateUrls: { caliente: string, bet365: string, skimlinks: string },
 * }} params
 * @returns {Array<{ fixtureId: number, articleType: string, slug: string }>}
 */
export function buildSite({ articles, siteBaseUrl, outputDir = 'dist', affiliateUrls }) {
  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const slugs = [];

  for (const article of articles) {
    const { fixtureId, articleType, homeTeam, awayTeam, contentJson } = article;
    const slug = buildSlug(articleType, homeTeam, awayTeam);

    let html = contentJson.analisis_tactico_html || '';
    html = injectAffiliateLinks(html, affiliateUrls);
    html = html + '\n\n' + DISCLAIMER_FOOTER;

    const pageHtml = renderArticlePage({
      title: contentJson.h1_title || `${homeTeam} vs ${awayTeam}`,
      metaDescription: contentJson.meta_description || '',
      bodyHtml: html,
      siteBaseUrl,
      slug,
    });

    writeFileSync(join(outputDir, `${slug}.html`), pageHtml, 'utf-8');
    slugs.push({ fixtureId, articleType, slug });
  }

  // Write index page
  const indexHtml = renderIndexPage({ articles, slugs, siteBaseUrl });
  writeFileSync(join(outputDir, 'index.html'), indexHtml, 'utf-8');

  // Write sitemap.xml
  const now = new Date().toISOString().slice(0, 10);
  const sitemapEntries = slugs.map((s) => ({
    url: `${siteBaseUrl}/${s.slug}.html`,
    lastmod: now,
  }));
  const sitemapXml = generateSitemap(sitemapEntries);
  writeFileSync(join(outputDir, 'sitemap.xml'), sitemapXml, 'utf-8');

  return slugs;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderArticlePage({ title, metaDescription, bodyHtml, siteBaseUrl, slug }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${escapeHtml(siteBaseUrl)}/${escapeHtml(slug)}.html">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <article>
    ${bodyHtml}
  </article>
  <nav><a href="index.html">← Inicio</a></nav>
</body>
</html>`;
}

function renderIndexPage({ articles, slugs, siteBaseUrl }) {
  const links = slugs
    .map((s, i) => {
      const a = articles[i];
      const title = a?.contentJson?.h1_title || `${a?.homeTeam} vs ${a?.awayTeam}`;
      return `  <li><a href="${escapeHtml(s.slug)}.html">${escapeHtml(title)}</a></li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WC 2026 Quiniela — Pronósticos y Momios</title>
  <link rel="canonical" href="${escapeHtml(siteBaseUrl)}/index.html">
</head>
<body>
  <h1>Pronósticos y Momios — Mundial 2026</h1>
  <ul>
${links}
  </ul>
</body>
</html>`;
}
