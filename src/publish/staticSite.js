
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

export function buildMatchSlug({ fixtureId, matchNumber, homeTeam, awayTeam, kickoffUtc }) {
  const normalize = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  const date = kickoffUtc ? kickoffUtc.slice(0, 10) : 'fecha-por-confirmar';
  const number = matchNumber ? `partido-${matchNumber}` : `fixture-${fixtureId}`;
  return `${number}-${date}-${normalize(homeTeam)}-vs-${normalize(awayTeam)}`;
}

/**
 * Renders all articles to a static site in outputDir.
 *
 * @param {{
 *   fixtures?: Array<{
 *     fixtureId: number,
 *     matchNumber?: number|null,
 *     homeTeam: string,
 *     awayTeam: string,
 *     kickoffUtc?: string,
 *     venue?: string,
 *     stage?: string,
 *     status?: string,
 *   }>,
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
  const fixtures = arguments[0].fixtures || deriveFixturesFromArticles(articles);
  const articlesByFixture = groupArticlesByFixture(articles);

  for (const fixture of fixtures) {
    const fixtureArticles = articlesByFixture.get(fixture.fixtureId) || new Map();
    const slug = buildMatchSlug(fixture);

    let bodyHtml = renderMatchHeader(fixture);
    bodyHtml += '\n' + renderTeamSummaries(fixture);
    bodyHtml += '\n' + renderSectionList({ fixture, fixtureArticles, affiliateUrls });
    bodyHtml += '\n\n' + DISCLAIMER_FOOTER;

    const pageHtml = renderArticlePage({
      title: `${fixture.homeTeam} vs ${fixture.awayTeam} — Mundial 2026`,
      metaDescription: `Calendario, pronósticos y análisis de ${fixture.homeTeam} vs ${fixture.awayTeam} en el Mundial 2026.`,
      bodyHtml,
      siteBaseUrl,
      slug,
    });

    writeFileSync(join(outputDir, `${slug}.html`), pageHtml, 'utf-8');
    slugs.push({ fixtureId: fixture.fixtureId, articleType: 'match_page', slug });
  }

  // Write index page
  const indexHtml = renderIndexPage({ fixtures, slugs, siteBaseUrl });
  writeFileSync(join(outputDir, 'index.html'), indexHtml, 'utf-8');

  // Write sitemap.xml
  const now = new Date().toISOString().slice(0, 10);
  const sitemapEntries = [{ url: `${siteBaseUrl}/index.html`, lastmod: now }, ...slugs.map((s) => ({
    url: `${siteBaseUrl}/${s.slug}.html`,
    lastmod: now,
  }))];
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

const SECTION_LABELS = {
  pronostico_momios: 'Pronóstico y momios',
  alineacion_probable: 'Alineación probable',
  quiniela_verdict: 'Veredicto de quiniela',
  analisis_apostar: 'Análisis para apostar',
};

function deriveFixturesFromArticles(articles) {
  const seen = new Map();
  for (const article of articles) {
    if (!seen.has(article.fixtureId)) {
      seen.set(article.fixtureId, {
        fixtureId: article.fixtureId,
        matchNumber: article.matchNumber || null,
        homeTeam: article.homeTeam,
        awayTeam: article.awayTeam,
        kickoffUtc: article.kickoffUtc || null,
        venue: article.venue || null,
        stage: article.stage || null,
        status: article.status || null,
      });
    }
  }
  return [...seen.values()];
}

function groupArticlesByFixture(articles) {
  const grouped = new Map();
  for (const article of articles) {
    if (!grouped.has(article.fixtureId)) grouped.set(article.fixtureId, new Map());
    grouped.get(article.fixtureId).set(article.articleType, article);
  }
  return grouped;
}

function renderMatchHeader(fixture) {
  return `<header class="match-header">
    <p class="match-meta">${escapeHtml(fixture.kickoffUtc || 'Fecha por confirmar')} · ${escapeHtml(fixture.venue || 'Sede por confirmar')}</p>
    <p class="match-status">Estado: ${escapeHtml(fixture.status || 'scheduled')}</p>
  </header>`;
}

function renderTeamSummaries(fixture) {
  return `<section class="team-summaries">
    <h2>Resumen de equipos</h2>
    <article><h3>${escapeHtml(fixture.homeTeam)}</h3><p>Resumen del equipo próximamente.</p></article>
    <article><h3>${escapeHtml(fixture.awayTeam)}</h3><p>Resumen del equipo próximamente.</p></article>
  </section>`;
}

function renderSectionList({ fixture, fixtureArticles, affiliateUrls }) {
  return Object.entries(SECTION_LABELS)
    .map(([sectionType, label]) => {
      const article = fixtureArticles.get(sectionType);
      const content = article?.contentJson?.analisis_tactico_html
        || `<section class="coming-soon"><h2>${escapeHtml(label)}</h2><p>Próximamente: actualizaremos esta sección de ${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)} cuando tengamos datos confiables.</p></section>`;
      return `<section class="match-section" data-section="${escapeHtml(sectionType)}">
        ${injectAffiliateLinks(content, affiliateUrls)}
      </section>`;
    })
    .join('\n');
}

function renderIndexPage({ fixtures, slugs }) {
  const links = slugs
    .map((s, i) => {
      const fixture = fixtures[i];
      const title = `${fixture?.homeTeam} vs ${fixture?.awayTeam}`;
      const meta = fixture?.kickoffUtc ? ` — ${fixture.kickoffUtc.slice(0, 10)}` : '';
      return `  <li><a href="${escapeHtml(s.slug)}.html">${escapeHtml(title)}${escapeHtml(meta)}</a></li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calendario Mundial 2026 — Quiniela y Pronósticos</title>
</head>
<body>
  <h1>Calendario Mundial 2026 — Quiniela y Pronósticos</h1>
  <ul>
${links}
  </ul>
</body>
</html>`;
}
