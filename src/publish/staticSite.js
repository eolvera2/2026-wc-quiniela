
/**
 * Static HTML site generator — replaces WordPress publisher.
 * Renders articles from SQLite into a static site in outputDir (default: dist/).
 * Integrates affiliate links + disclaimer footer.
 *
 * Reference: docs/plans/2026-06-01-phase2-live-service-integration-implementation.md Task 9/12
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectAffiliateLinks } from './affiliateInjector.js';
import { DISCLAIMER_FOOTER } from '../generate/prompt.js';
import { generateSitemap } from './sitemap.js';
import { decorateTeam, isPlaceholderTeamName, teamAnchorId } from '../data/worldCupTeams.js';

const SITE_ASSET_DIR = 'assets';
const BRAND_MARK_FILENAME = 'quiniela-2026-mark.svg';

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
 *     homeTeamCode?: string,
 *     awayTeamCode?: string,
 *     kickoffUtc?: string,
 *     venue?: string,
 *     stage?: string,
 *     status?: string,
 *   }>,
 *   teams?: Array<{ name: string, code?: string, flag?: string }>,
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
export function buildSite({ fixtures: providedFixtures, teams: providedTeams, articles, siteBaseUrl, outputDir = 'dist', affiliateUrls }) {
  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });
  copyStaticAssets(outputDir);

  const slugs = [];
  const fixtures = providedFixtures || deriveFixturesFromArticles(articles);
  const teams = providedTeams || deriveTeamsFromFixtures(fixtures);
  const articlesByFixture = groupArticlesByFixture(articles);

  for (const fixture of fixtures) {
    const fixtureArticles = articlesByFixture.get(fixture.fixtureId) || new Map();
    const slug = buildMatchSlug(fixture);

    let bodyHtml = renderMatchHeader(fixture);
    bodyHtml += '\n' + renderTeamSummaries(fixture);
    bodyHtml += '\n' + renderSectionList({ fixture, fixtureArticles, affiliateUrls });
    bodyHtml += '\n' + renderPredictionPanel(fixture);
    bodyHtml += '\n\n' + `<div class="container">${DISCLAIMER_FOOTER}</div>`;

    const pageHtml = renderArticlePage({
      title: `${fixture.homeTeam} vs ${fixture.awayTeam} — Mundial 2026`,
      metaDescription: `Calendario, pronósticos y análisis de ${fixture.homeTeam} vs ${fixture.awayTeam} en el Mundial 2026.`,
      bodyHtml,
      siteBaseUrl,
      slug,
      structuredData: [
        buildSportsEventJsonLd(fixture),
        buildBreadcrumbJsonLd({ siteBaseUrl, slug, title: `${fixture.homeTeam} vs ${fixture.awayTeam}` }),
      ],
    });

    writeFileSync(join(outputDir, `${slug}.html`), pageHtml, 'utf-8');
    slugs.push({ fixtureId: fixture.fixtureId, articleType: 'match_page', slug });
  }

  // Write index page
  const indexHtml = renderIndexPage({ fixtures, teams, slugs, siteBaseUrl });
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

export function buildComingSoonSite({ siteBaseUrl = 'https://predictagol.com', outputDir = 'dist' } = {}) {
  mkdirSync(outputDir, { recursive: true });
  copyStaticAssets(outputDir);

  const canonicalBaseUrl = normalizeBaseUrl(siteBaseUrl);
  const indexHtml = renderComingSoonPage({ siteBaseUrl: canonicalBaseUrl });
  writeFileSync(join(outputDir, 'index.html'), indexHtml, 'utf-8');

  const sitemapXml = generateSitemap([{ url: `${canonicalBaseUrl}/`, lastmod: '2026-01-01' }]);
  writeFileSync(join(outputDir, 'sitemap.xml'), sitemapXml, 'utf-8');
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function copyStaticAssets(outputDir) {
  const assetDir = join(outputDir, SITE_ASSET_DIR);
  mkdirSync(assetDir, { recursive: true });
  copyFileSync(new URL(`./assets/${BRAND_MARK_FILENAME}`, import.meta.url), join(assetDir, BRAND_MARK_FILENAME));

  const staticWebAppConfig = new URL('../../staticwebapp.config.json', import.meta.url);
  if (existsSync(staticWebAppConfig)) {
    copyFileSync(staticWebAppConfig, join(outputDir, 'staticwebapp.config.json'));
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeBaseUrl(siteBaseUrl) {
  return String(siteBaseUrl || 'https://predictagol.com').replace(/\/+$/g, '');
}

function renderArticlePage({ title, metaDescription, bodyHtml, siteBaseUrl, slug, structuredData = [] }) {
  const jsonLd = structuredData
    .filter(Boolean)
    .map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${escapeHtml(siteBaseUrl)}/${escapeHtml(slug)}.html">
  <script>document.documentElement.classList.add('js');</script>
  <style>${GLOBAL_CSS}</style>
  ${jsonLd}
</head>
<body data-active-theme="navy">
  ${renderSiteHeader()}
  <main>
    ${bodyHtml}
  </main>
  ${renderSiteFooter()}
  <script>${SITE_CHROME_SCRIPT}</script>
</body>
</html>`;
}

function renderComingSoonPage({ siteBaseUrl }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Predictagol se está preparando para el Mundial 2026. Muy pronto podrás armar tu quiniela y seguir pronósticos partido por partido.">
  <title>Próximamente — Predictagol</title>
  <link rel="canonical" href="${escapeHtml(siteBaseUrl)}/">
  <script>document.documentElement.classList.add('js');</script>
  <style>${GLOBAL_CSS}${COMING_SOON_CSS}</style>
</head>
<body data-active-theme="navy">
  ${renderComingSoonHeader()}
  <main class="coming-soon-page">
    <section class="coming-soon-hero reveal theme-section" data-theme="navy" aria-labelledby="coming-soon-title">
      ${renderDigitalBalls()}
      <div class="coming-soon-hero__card">
        <img class="coming-soon-hero__mark" src="${SITE_ASSET_DIR}/${BRAND_MARK_FILENAME}" alt="" width="96" height="96">
        <p class="eyebrow">Predictagol · Mundial 2026</p>
        <h1 id="coming-soon-title">Próximamente</h1>
        <p class="coming-soon-hero__copy">Estamos preparando una experiencia para vivir la quiniela del Mundial con calendario, datos y pronósticos en español.</p>
        <div class="coming-soon-hero__badges" aria-label="Funciones en preparación">
          <span>Calendario</span>
          <span>Pronósticos</span>
          <span>Quiniela</span>
        </div>
      </div>
    </section>
  </main>
  ${renderComingSoonFooter()}
  <script>${SITE_CHROME_SCRIPT}</script>
</body>
</html>`;
}

const SECTION_LABELS = {
  pronostico_momios: 'Pronóstico y momios',
  quiniela_verdict: 'Veredicto de quiniela',
  alineacion_probable: 'Alineación probable',
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
        homeTeamCode: article.homeTeamCode || null,
        awayTeamCode: article.awayTeamCode || null,
        kickoffUtc: article.kickoffUtc || null,
        venue: article.venue || null,
        stage: article.stage || null,
        status: article.status || null,
      });
    }
  }
  return [...seen.values()];
}

function deriveTeamsFromFixtures(fixtures) {
  const teams = new Map();
  for (const fixture of fixtures) {
    [
      { name: fixture.homeTeam, code: fixture.homeTeamCode, flag: fixture.homeTeamFlag },
      { name: fixture.awayTeam, code: fixture.awayTeamCode, flag: fixture.awayTeamFlag },
    ].forEach((team) => {
      const decorated = decorateTeam(team);
      if (!decorated.isPlaceholder && !isPlaceholderTeamName(decorated.name)) {
        teams.set(decorated.code || decorated.name, decorated);
      }
    });
  }
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  return `<header class="match-hero hero-match reveal theme-section" data-theme="jungle">
    ${renderDigitalBalls()}
    <div class="container-wide hero-match__inner">
      <p class="eyebrow">${escapeHtml(stageLabel(fixture.stage))} · ${escapeHtml(statusLabel(fixture.status))}</p>
      <h1>${renderTeamName(homeTeam)} <span class="versus">vs</span> ${renderTeamName(awayTeam)}</h1>
      <div class="hero-match__meta">
        <span class="numeric">${escapeHtml(formatDateTime(fixture.kickoffUtc))}</span>
        <span>${escapeHtml(fixture.venue || 'Sede por confirmar')}</span>
      </div>
      <div class="hero-match__actions">
        <a class="button button--primary" href="#pronostico_momios">Ver datos</a>
        <a class="button button--secondary" href="index.html">Volver al calendario</a>
      </div>
    </div>
  </header>`;
}

function renderTeamSummaries(fixture) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  return `<section class="team-summaries container reveal theme-section" data-theme="navy">
    <h2>Resumen de equipos</h2>
    <div class="team-summaries__grid">
      <article class="team-card"><span class="team-chip">${renderTeamName(homeTeam)}</span><p>Resumen del equipo próximamente con grupo, forma reciente y claves para tu quiniela.</p></article>
      <article class="team-card"><span class="team-chip">${renderTeamName(awayTeam)}</span><p>Resumen del equipo próximamente con grupo, forma reciente y claves para tu quiniela.</p></article>
    </div>
  </section>`;
}

function renderSectionList({ fixture, fixtureArticles, affiliateUrls }) {
  return Object.entries(SECTION_LABELS)
    .map(([sectionType, label]) => {
      const article = fixtureArticles.get(sectionType);
      const isPlaceholder = !article?.contentJson?.analisis_tactico_html;
      const content = article?.contentJson?.analisis_tactico_html
        || `<section class="coming-soon"><h2>${escapeHtml(label)}</h2><p>Próximamente: actualizaremos esta sección de ${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)} cuando tengamos datos confiables.</p></section>`;
      return `<section id="${escapeHtml(sectionType)}" class="match-section container reveal" data-section="${escapeHtml(sectionType)}">
        <p class="section-kicker">${escapeHtml(label)}</p>
        <div class="match-article">${isPlaceholder ? content : injectAffiliateLinks(content, affiliateUrls)}</div>
      </section>`;
    })
    .join('\n');
}

function renderPredictionPanel(fixture) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  return `<section class="prediction-panel container reveal theme-section" data-theme="festival" aria-label="Panel de quiniela">
    <h2>Tu quiniela</h2>
    <p>Sin apuestas, solo diversión. Elige tu pronóstico antes del kickoff.</p>
    <div class="prediction-options" role="group" aria-label="Pronóstico ${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)}">
      <button type="button">1 ${renderTeamName(homeTeam)}</button>
      <button type="button">X Empate</button>
      <button type="button">2 ${renderTeamName(awayTeam)}</button>
    </div>
  </section>`;
}

function renderIndexPage({ fixtures, teams, slugs }) {
  const nextFixture = fixtures[0];
  const dateTabs = renderDateTabs(fixtures);
  const calendar = renderCalendarSections(fixtures, slugs);
  const teamsShortcut = renderTeamsShortcut(teams);
  const nextHome = nextFixture ? fixtureTeam(nextFixture, 'home') : null;
  const nextAway = nextFixture ? fixtureTeam(nextFixture, 'away') : null;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calendario Mundial 2026 — Quiniela y Pronósticos</title>
  <script>document.documentElement.classList.add('js');</script>
  <style>${GLOBAL_CSS}</style>
</head>
<body data-active-theme="navy">
  ${renderSiteHeader()}
  <main>
    <section class="home-hero hero-match reveal theme-section" data-theme="navy">
      ${renderDigitalBalls()}
      <div class="container-wide hero-match__inner">
        <p class="eyebrow">Calendario Mundial 2026</p>
        <h1>Pronostica los partidos del Mundial con tus amigos</h1>
        <p class="hero-copy">Sin apuestas, solo diversión: consulta fechas, sedes, grupos y previas partido por partido.</p>
        ${nextFixture ? `<div class="hero-match__meta"><span>Próximo partido</span><strong>${renderTeamName(nextHome)} vs ${renderTeamName(nextAway)}</strong><span class="numeric">${escapeHtml(formatDateTime(nextFixture.kickoffUtc))}</span></div>` : ''}
        <div class="hero-match__actions"><a class="button button--primary" href="#partidos">Ver partidos</a><a class="button button--secondary" href="#equipos">Ver equipos</a></div>
      </div>
    </section>
    ${dateTabs}
    <section id="partidos" class="calendar container-wide reveal theme-section" data-theme="jungle">
      <div class="section-heading">
        <p class="eyebrow">Partidos</p>
        <h2>Calendario de partidos</h2>
      </div>
      ${calendar}
    </section>
    ${teamsShortcut}
  </main>
  ${renderSiteFooter()}
  <script>${SITE_CHROME_SCRIPT}</script>
  <script>${HOME_FILTER_SCRIPT}</script>
</body>
</html>`;
}

function renderDateTabs(fixtures) {
  const dates = uniqueDates(fixtures).slice(0, 18);
  if (dates.length === 0) return '';
  const tabs = dates.map((date, index) => `<a class="date-tab ${index === 0 ? 'is-active' : ''}" href="#fecha-${date}" ${index === 0 ? 'aria-current="date"' : ''}>
      <span class="date-tab__day">${escapeHtml(shortDay(date))}</span>
      <span class="date-tab__date">${escapeHtml(shortDate(date))}</span>
    </a>`).join('\n');
  return `<nav class="date-tabs container-wide" aria-label="Calendario por fecha">${tabs}</nav>`;
}

function renderCalendarSections(fixtures, slugs) {
  const byDate = new Map();
  fixtures.forEach((fixture, index) => {
    const date = fixture.kickoffUtc ? fixture.kickoffUtc.slice(0, 10) : 'por-confirmar';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ fixture, slug: slugs[index]?.slug });
  });

  return [...byDate.entries()].map(([date, rows], index) => `<section id="fecha-${date}" class="calendar-day" data-theme="${index % 2 === 0 ? 'jungle' : 'navy'}">
    <div class="round-divider">${escapeHtml(fullDate(date))}</div>
    <div class="match-grid">
      ${rows.map(({ fixture, slug }) => renderMatchCard(fixture, slug)).join('\n')}
    </div>
  </section>`).join('\n');
}

function renderTeamsShortcut(teams) {
  const teamList = teams
    .map((team) => decorateTeam(team))
    .filter((team) => !team.isPlaceholder && !isPlaceholderTeamName(team.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `<section id="equipos" class="teams-shortcut reveal theme-section" data-theme="festival">
    ${renderDigitalBalls()}
    <div class="container-wide teams-shortcut__inner">
      <div class="section-heading">
        <p class="eyebrow">Equipos</p>
        <h2>Selecciones en el calendario</h2>
        <p>La base está precargada desde datos públicos; los perfiles completos se llenarán conforme haya información confiable.</p>
      </div>
      <div class="team-pill-grid">
        ${teamList.map((team) => `<a id="${escapeHtml(team.anchorId)}" class="team-pill" href="#${escapeHtml(team.anchorId)}" data-team-code="${escapeHtml(team.code || '')}" data-team-name="${escapeHtml(team.name)}">${renderTeamName(team)}</a>`).join('\n')}
      </div>
    </div>
  </section>`;
}

function renderMatchCard(fixture, slug) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  return `<article class="match-card match-card--${escapeHtml(fixture.status || 'upcoming')}" data-team-codes="${escapeHtml([homeTeam.code, awayTeam.code].filter(Boolean).join(' '))}">
    <div class="match-card__top"><span class="status-pill">${escapeHtml(statusLabel(fixture.status))}</span><span>${escapeHtml(stageLabel(fixture.stage))}</span></div>
    <p class="match-card__date numeric">${escapeHtml(formatDateTime(fixture.kickoffUtc))}</p>
    <h3>${renderTeamName(homeTeam)} <span class="versus">vs</span> ${renderTeamName(awayTeam)}</h3>
    <p class="match-card__venue">${escapeHtml(fixture.venue || 'Sede por confirmar')}</p>
    <a class="match-card__cta" href="${escapeHtml(slug)}.html">Ver datos</a>
  </article>`;
}

function renderSiteHeader() {
  return `<header class="site-header">
    <a class="site-logo" href="index.html" aria-label="Quiniela 2026 inicio">
      <img class="site-logo__mark" src="${SITE_ASSET_DIR}/${BRAND_MARK_FILENAME}" alt="" width="40" height="40">
      <span class="site-logo__text">Quiniela 2026</span>
    </a>
    <nav aria-label="Navegación principal">
      <a href="index.html">Inicio</a>
      <a href="index.html#partidos">Partidos</a>
      <a href="index.html#equipos">Equipos</a>
      <a href="index.html#equipo-mexico">México</a>
    </nav>
  </header>`;
}

function renderDigitalBalls() {
  return `<span class="digital-ball digital-ball--left" aria-hidden="true"></span><span class="digital-ball digital-ball--right" aria-hidden="true"></span>`;
}

function renderSiteFooter() {
  return `<footer class="site-footer">
    <div class="container">
      <strong>Quiniela 2026</strong>
      <p>Este sitio no está afiliado con FIFA. Sin apuestas, solo diversión y pronósticos para tu quiniela.</p>
      <nav aria-label="Footer"><a href="index.html">Inicio</a><a href="index.html#partidos">Partidos</a><a href="index.html#equipos">Equipos</a></nav>
    </div>
  </footer>`;
}

function renderComingSoonHeader() {
  return `<header class="site-header site-header--simple">
    <a class="site-logo" href="index.html" aria-label="Predictagol inicio">
      <img class="site-logo__mark" src="${SITE_ASSET_DIR}/${BRAND_MARK_FILENAME}" alt="" width="40" height="40">
      <span class="site-logo__text">Predictagol</span>
    </a>
  </header>`;
}

function renderComingSoonFooter() {
  return `<footer class="site-footer site-footer--simple">
    <div class="container">
      <strong>Predictagol</strong>
      <p>Este sitio no está afiliado con FIFA. Sin apuestas, solo diversión y pronósticos para tu quiniela.</p>
    </div>
  </footer>`;
}

function buildSportsEventJsonLd(fixture) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    startDate: fixture.kickoffUtc || undefined,
    eventStatus: fixture.status === 'resolved' ? 'https://schema.org/EventCompleted' : 'https://schema.org/EventScheduled',
    sport: 'Football',
    location: fixture.venue ? { '@type': 'Place', name: fixture.venue } : undefined,
    homeTeam: { '@type': 'SportsTeam', name: fixture.homeTeam },
    awayTeam: { '@type': 'SportsTeam', name: fixture.awayTeam },
  };
}

function fixtureTeam(fixture, side) {
  return decorateTeam({
    name: fixture[`${side}Team`],
    code: fixture[`${side}TeamCode`],
    flag: fixture[`${side}TeamFlag`],
  });
}

function renderTeamName(team) {
  const flag = team?.flag && !team.isPlaceholder
    ? `<img class="team-flag" src="${escapeHtml(flagImageUrl(team.flag))}" alt="" width="24" height="18" loading="lazy"> `
    : '';
  return `${flag}<span class="team-name">${escapeHtml(team?.name || '')}</span>`;
}

function flagImageUrl(flagCode) {
  return `https://flagcdn.com/24x18/${flagCode}.png`;
}

function buildBreadcrumbJsonLd({ siteBaseUrl, slug, title }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${siteBaseUrl}/index.html` },
      { '@type': 'ListItem', position: 2, name: title, item: `${siteBaseUrl}/${slug}.html` },
    ],
  };
}

function uniqueDates(fixtures) {
  return [...new Set(fixtures.map((fixture) => fixture.kickoffUtc?.slice(0, 10)).filter(Boolean))];
}

function formatDateTime(value) {
  if (!value) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value));
}

function fullDate(value) {
  if (value === 'por-confirmar') return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(new Date(`${value}T12:00:00Z`));
}

function shortDay(value) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'America/Mexico_City' }).format(new Date(`${value}T12:00:00Z`));
}

function shortDate(value) {
  return new Intl.DateTimeFormat('es-MX', { month: 'short', day: 'numeric', timeZone: 'America/Mexico_City' }).format(new Date(`${value}T12:00:00Z`));
}

function stageLabel(stage) {
  if (stage === 'knockout') return 'Eliminatoria';
  if (stage === 'group') return 'Fase de grupos';
  return stage || 'Mundial 2026';
}

function statusLabel(status) {
  if (status === 'resolved') return 'Resultado final';
  if (status === 'locked') return 'Partido cerrado';
  if (status === 'tbd') return 'Por definir';
  return 'Próximo partido';
}

const GLOBAL_CSS = `
:root {
  --color-navy-950: #020f2a;
  --color-navy-900: #071733;
  --color-navy-800: #10234a;
  --color-blue-600: #326295;
  --color-gold-400: #f5a623;
  --color-gold-300: #ffd166;
  --color-green-500: #16a34a;
  --color-red-600: #c8102e;
  --color-jungle-950: #002018;
  --color-jungle-900: #003020;
  --color-jungle-800: #004030;
  --color-jungle-700: #005040;
  --color-jungle-600: #007050;
  --color-turquoise-400: #00c6a3;
  --color-jaguar-500: #d9942d;
  --color-jaguar-300: #f4bd4f;
  --color-lime-400: #d7ea1f;
  --color-white: #ffffff;
  --color-off-white: #f0f4ff;
  --color-neutral-300: #b7c3d7;
  --color-neutral-500: #8899bb;
  --surface-base: var(--color-navy-950);
  --surface-raised: var(--color-navy-900);
  --surface-card: rgba(255, 255, 255, 0.08);
  --surface-card-strong: rgba(255, 255, 255, 0.14);
  --surface-jungle: var(--color-jungle-950);
  --surface-festival: linear-gradient(135deg, rgba(0, 48, 32, .96), rgba(7, 23, 51, .96));
  --text-primary: var(--color-white);
  --text-secondary: var(--color-neutral-300);
  --text-muted: var(--color-neutral-500);
  --text-link: var(--color-gold-400);
  --border-subtle: rgba(255, 255, 255, 0.14);
  --border-focus: var(--color-gold-400);
  --accent-primary: var(--color-jaguar-300);
  --accent-secondary: var(--color-turquoise-400);
  --accent-electric: var(--color-lime-400);
  --action-primary-bg: var(--accent-primary);
  --action-primary-text: var(--color-navy-950);
  --font-display: "Poppins", "Barlow Condensed", system-ui, sans-serif;
  --font-body: "Noto Sans", "Inter", "Segoe UI", system-ui, sans-serif;
  --step--2: clamp(0.75rem, 0.72rem + 0.12vw, 0.82rem);
  --step--1: clamp(0.88rem, 0.84rem + 0.18vw, 1rem);
  --step-0: clamp(1rem, 0.95rem + 0.24vw, 1.125rem);
  --step-1: clamp(1.25rem, 1.16rem + 0.42vw, 1.5rem);
  --step-2: clamp(1.56rem, 1.42rem + 0.7vw, 2rem);
  --step-4: clamp(2.44rem, 2.05rem + 1.9vw, 4rem);
  --step-5: clamp(3.05rem, 2.35rem + 3.4vw, 6rem);
  --space-xs: clamp(0.75rem, 0.68rem + 0.32vw, 0.94rem);
  --space-s: clamp(1rem, 0.91rem + 0.45vw, 1.25rem);
  --space-m: clamp(1.5rem, 1.36rem + 0.68vw, 1.88rem);
  --space-l: clamp(2rem, 1.82rem + 0.91vw, 2.5rem);
  --space-xl: clamp(3rem, 2.73rem + 1.36vw, 3.75rem);
  --container-content: 68rem;
  --container-wide: 118rem;
  --gutter: clamp(1rem, 4vw, 4rem);
  --radius-m: 0.875rem;
  --radius-l: 1.25rem;
  --radius-pill: 999px;
  --shadow-card: 0 18px 60px rgba(0, 0, 0, 0.28);
  --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
  --duration-med: 420ms;
  --duration-slow: 900ms;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: radial-gradient(circle at top left, rgba(244,189,79,.2), transparent 32rem), radial-gradient(circle at 85% 10%, rgba(0,198,163,.14), transparent 28rem), var(--surface-base); color: var(--text-primary); font-family: var(--font-body); font-size: var(--step-0); line-height: 1.6; transition: background-color var(--duration-med) var(--ease-out-expo); }
body[data-active-theme="jungle"] { background-color: var(--surface-jungle); }
body[data-active-theme="festival"] { background-color: var(--color-jungle-900); }
a { color: var(--text-link); }
:focus-visible { outline: 3px solid var(--border-focus); outline-offset: 3px; }
.container { width: min(100% - (var(--gutter) * 2), var(--container-content)); margin-inline: auto; }
.container-wide { width: min(100% - (var(--gutter) * 2), var(--container-wide)); margin-inline: auto; }
.site-header { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: var(--space-s); padding: .5rem var(--gutter); background: rgba(2, 15, 42, .76); backdrop-filter: blur(18px); border-bottom: 1px solid var(--border-subtle); box-shadow: 0 10px 40px rgba(0,0,0,.18); transition: background var(--duration-med) var(--ease-out-expo), padding var(--duration-med) var(--ease-out-expo); }
.site-header.is-scrolled { padding-block: .35rem; background: rgba(2, 15, 42, .94); }
.site-logo { display: inline-flex; align-items: center; gap: .55rem; font-family: var(--font-display); font-weight: 900; text-transform: uppercase; text-decoration: none; color: var(--text-primary); letter-spacing: .08em; }
.site-logo__mark { width: 2.5rem; height: 2.5rem; border-radius: .75rem; box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 10px 24px rgba(0,0,0,.25); }
.site-logo__text { white-space: nowrap; }
.site-header nav, .site-footer nav { display: flex; flex-wrap: wrap; gap: var(--space-s); }
.site-header a, .site-footer a { color: var(--text-primary); text-decoration: none; font-weight: 700; }
.hero-match { position: relative; padding: var(--space-xl) 0; background: radial-gradient(circle at 15% 20%, rgba(0,198,163,.22), transparent 22rem), radial-gradient(circle at 85% 15%, rgba(244,189,79,.18), transparent 24rem), linear-gradient(135deg, rgba(0,48,32,.96), rgba(2,15,42,.94)); overflow: hidden; }
.hero-match::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .22; background-image: radial-gradient(circle, rgba(244,189,79,.88) 0 .14rem, transparent .16rem); background-size: 2.6rem 2.6rem; mask-image: linear-gradient(115deg, transparent, #000 20%, transparent 70%); }
.hero-match__inner { position: relative; z-index: 1; padding: var(--space-xl); border: 1px solid rgba(244,189,79,.24); border-radius: var(--radius-l); background: linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.05)); box-shadow: var(--shadow-card), inset 0 1px rgba(255,255,255,.1); overflow: hidden; }
.hero-match__inner::after { content: ""; position: absolute; right: -4rem; bottom: -5rem; width: 16rem; height: 16rem; border-radius: 50%; background: radial-gradient(circle, rgba(215,234,31,.24), transparent 60%); pointer-events: none; }
.home-hero { padding: clamp(1rem, 2vw, 2rem) 0; }
.home-hero .hero-match__inner { padding: clamp(1.4rem, 3vw, 3rem); }
.home-hero .eyebrow { margin: 0; }
.home-hero h1 { max-width: 86rem; margin: .45rem 0 .65rem; font-size: clamp(2.35rem, 5.35vw, 4.65rem); line-height: 1.02; }
.home-hero .hero-copy { margin: 0 0 .7rem; }
.eyebrow, .section-kicker, .status-pill { color: var(--accent-primary); font-size: var(--step--2); font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
h1, h2, h3 { font-family: var(--font-display); line-height: 1.08; }
h1 { font-size: var(--step-5); margin: var(--space-s) 0; text-transform: uppercase; letter-spacing: -.04em; }
h1 .versus, h3 .versus { color: var(--accent-primary); }
h2 { font-size: var(--step-2); }
.hero-copy { max-width: 48rem; color: var(--text-secondary); }
.hero-match__meta, .hero-match__actions { display: flex; flex-wrap: wrap; gap: var(--space-s); align-items: center; color: var(--text-secondary); }
.button, .match-card__cta { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: .55rem .85rem; border-radius: var(--radius-pill); font-size: var(--step--1); font-weight: 900; text-decoration: none; transition: transform var(--duration-med) var(--ease-out-expo), box-shadow var(--duration-med) var(--ease-out-expo), background var(--duration-med) var(--ease-out-expo); }
.button:hover, .match-card__cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(244,189,79,.22); }
.button--primary, .match-card__cta { background: var(--action-primary-bg); color: var(--action-primary-text); }
.button--secondary { border: 1px solid rgba(255,255,255,.35); color: var(--text-primary); }
.date-tabs { display: flex; gap: .55rem; overflow-x: auto; scroll-snap-type: x proximity; padding: .35rem 0 .55rem; }
.date-tabs { position: sticky; top: var(--site-header-sticky-offset, 3rem); z-index: 9; background: rgba(2, 15, 42, .94); backdrop-filter: blur(18px); border-bottom: 1px solid var(--border-subtle); box-shadow: 0 0 0 100vmax rgba(2, 15, 42, .94); clip-path: inset(0 -100vmax); }
.date-tab { min-width: 5.15rem; scroll-snap-align: start; padding: .38rem .62rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); text-align: center; text-decoration: none; background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.06)); }
.date-tab.is-active { background: var(--accent-primary); color: var(--color-navy-950); }
.date-tab__day { display: block; font-size: var(--step--2); text-transform: uppercase; }
.date-tab__date { display: block; font-size: var(--step--1); font-weight: 900; }
.calendar { padding-block: var(--space-l); }
.filter-status { display: none; align-items: center; gap: var(--space-xs); margin-bottom: var(--space-m); padding: var(--space-s); border: 1px solid var(--border-subtle); border-radius: var(--radius-l); background: var(--surface-card); }
.filter-status.is-active { display: flex; }
.filter-status button { min-height: 40px; padding: .45rem .8rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: var(--surface-card-strong); color: var(--text-primary); font-size: var(--step--1); font-weight: 900; }
.calendar.is-filtered .match-card[hidden], .calendar.is-filtered .calendar-day[hidden] { display: none; }
.section-heading { margin-bottom: var(--space-m); }
.calendar-day { scroll-margin-top: calc(var(--site-header-sticky-offset, 3rem) + 5rem); }
.calendar-day + .calendar-day { margin-top: var(--space-m); }
.round-divider { margin: var(--space-m) 0 var(--space-s); padding: .6rem 1rem; border-radius: var(--radius-pill); background: linear-gradient(90deg, rgba(244,189,79,.18), rgba(0,198,163,.12)); color: var(--accent-primary); font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
.calendar-day:first-child .round-divider { margin-top: 0; }
.match-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-m); }
@media (min-width: 768px) { .match-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 992px) { .match-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.match-card, .team-card, .prediction-panel, .match-section { border: 1px solid var(--border-subtle); border-radius: var(--radius-l); background: var(--surface-card); box-shadow: var(--shadow-card); }
.match-card { position: relative; overflow: hidden; padding: var(--space-m); transition: transform var(--duration-med) var(--ease-out-expo), border-color var(--duration-med) var(--ease-out-expo), background var(--duration-med) var(--ease-out-expo); }
.match-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: .28rem; background: linear-gradient(var(--accent-primary), var(--accent-secondary)); }
.match-card::after { content: ""; position: absolute; right: -2rem; top: -2rem; width: 8rem; height: 8rem; border-radius: 50%; background: radial-gradient(circle, rgba(215,234,31,.16), transparent 62%); pointer-events: none; }
.match-card:hover { transform: translateY(-2px); border-color: rgba(244,189,79,.36); background: var(--surface-card-strong); }
.match-card__top { display: flex; justify-content: space-between; gap: var(--space-xs); color: var(--text-muted); font-size: var(--step--1); }
.match-card__date, .match-card__venue { color: var(--text-secondary); }
.match-card h3 { font-size: var(--step-1); }
.team-summaries, .prediction-panel, .match-section { margin-block: var(--space-l); padding: var(--space-m); }
.team-summaries__grid { display: grid; grid-template-columns: 1fr; gap: var(--space-m); }
@media (min-width: 768px) { .team-summaries__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.team-card { padding: var(--space-m); }
.team-chip { display: inline-flex; padding: .4rem .75rem; border-radius: var(--radius-pill); background: var(--surface-card-strong); font-weight: 900; }
.teams-shortcut { position: relative; margin-top: var(--space-l); padding-block: var(--space-xl); overflow: hidden; background: radial-gradient(circle at 15% 20%, rgba(0,198,163,.22), transparent 22rem), radial-gradient(circle at 85% 15%, rgba(244,189,79,.18), transparent 24rem), linear-gradient(135deg, rgba(0,48,32,.96), rgba(2,15,42,.94)); }
.teams-shortcut::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .18; background-image: radial-gradient(circle, rgba(244,189,79,.88) 0 .14rem, transparent .16rem); background-size: 2.6rem 2.6rem; mask-image: linear-gradient(115deg, transparent, #000 20%, transparent 70%); }
.teams-shortcut__inner { position: relative; z-index: 1; }
.team-pill-grid { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.team-pill { display: inline-flex; padding: .5rem .8rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.05)); color: var(--text-primary); font-weight: 800; text-decoration: none; transition: transform var(--duration-med) var(--ease-out-expo), background var(--duration-med) var(--ease-out-expo); }
.team-pill:hover { transform: translateY(-1px); background: var(--surface-card-strong); }
.team-pill:target { background: var(--accent-primary); color: var(--color-navy-950); }
.team-flag { display: inline-block; width: 1.5rem; height: 1.125rem; margin-right: .25rem; border-radius: .125rem; object-fit: cover; vertical-align: -.15em; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.match-article { color: var(--text-secondary); }
.match-article h2 { color: var(--text-primary); }
.coming-soon { border-left: 4px solid var(--accent-primary); padding-left: var(--space-s); }
.prediction-options { display: grid; grid-template-columns: 1fr; gap: var(--space-xs); }
@media (min-width: 768px) { .prediction-options { grid-template-columns: repeat(3, 1fr); } }
.prediction-options button { min-height: 40px; padding: .5rem .85rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: var(--surface-card-strong); color: var(--text-primary); font-size: var(--step--1); font-weight: 900; }
.site-footer { margin-top: var(--space-xl); padding: var(--space-l) 0; background: linear-gradient(135deg, var(--color-jungle-950), var(--surface-raised)); color: var(--text-secondary); border-top: 1px solid var(--border-subtle); }
.numeric { font-variant-numeric: tabular-nums; }
.theme-section { transition: background-color var(--duration-med) var(--ease-out-expo), color var(--duration-med) var(--ease-out-expo); }
.digital-ball { position: absolute; z-index: 0; width: clamp(7rem, 16vw, 16rem); aspect-ratio: 1; border-radius: 50%; pointer-events: none; opacity: .35; background: radial-gradient(circle at 35% 35%, rgba(255,255,255,.75), transparent 16%), radial-gradient(circle at center, rgba(0,198,163,.38), rgba(0,80,64,.18) 55%, transparent 58%), repeating-conic-gradient(from 18deg, rgba(244,189,79,.8) 0 8deg, transparent 8deg 22deg); filter: blur(.2px); transition: transform var(--duration-slow) var(--ease-out-expo), opacity var(--duration-slow) var(--ease-out-expo); }
.digital-ball--left { left: max(-6rem, -8vw); top: 22%; transform: translateX(-30%) rotate(-18deg); }
.digital-ball--right { right: max(-6rem, -8vw); bottom: 10%; transform: translateX(30%) rotate(18deg); }
.teams-shortcut .digital-ball--left { left: max(-7rem, -9vw); top: 12%; }
.teams-shortcut .digital-ball--right { right: max(-7rem, -9vw); bottom: 8%; }
.reveal.is-visible .digital-ball--left { transform: translateX(0) rotate(8deg); }
.reveal.is-visible .digital-ball--right { transform: translateX(0) rotate(-8deg); }
html.js .reveal { transition: none; }
html.js .section-heading, html.js .match-section > .section-kicker { transition: transform var(--duration-slow) var(--ease-out-expo), opacity var(--duration-slow) var(--ease-out-expo); }
html.js .reveal:not(.is-visible) .section-heading, html.js .reveal:not(.is-visible).match-section > .section-kicker { opacity: .001; transform: translateY(-.75rem); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; } html.js .reveal:not(.is-visible) .section-heading, html.js .reveal:not(.is-visible).match-section > .section-kicker { opacity: 1; transform: none; } .digital-ball { display: none; } }
`;

const COMING_SOON_CSS = `
.site-header--simple { justify-content: center; }
.coming-soon-page { min-height: calc(100svh - 8rem); display: grid; }
.coming-soon-hero { position: relative; display: grid; place-items: center; min-height: calc(100svh - 8rem); padding: var(--space-xl) var(--gutter); overflow: hidden; background: radial-gradient(circle at 50% 0%, rgba(215,234,31,.14), transparent 28rem), radial-gradient(circle at 16% 80%, rgba(200,16,46,.2), transparent 22rem), linear-gradient(135deg, rgba(0,32,24,.96), rgba(2,15,42,.98)); }
.coming-soon-hero::before { content: ""; position: absolute; inset: 0; opacity: .24; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 3.75rem 3.75rem; mask-image: radial-gradient(circle at center, #000, transparent 72%); }
.coming-soon-hero__card { position: relative; z-index: 1; width: min(100%, 64rem); padding: clamp(2rem, 6vw, 5rem); border: 1px solid rgba(244,189,79,.28); border-radius: clamp(1.25rem, 3vw, 2rem); background: linear-gradient(135deg, rgba(255,255,255,.13), rgba(255,255,255,.05)); box-shadow: var(--shadow-card), inset 0 1px rgba(255,255,255,.12); text-align: center; overflow: hidden; }
.coming-soon-hero__card::after { content: ""; position: absolute; inset: auto -8rem -10rem auto; width: 22rem; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgba(0,198,163,.24), transparent 62%); pointer-events: none; }
.coming-soon-hero__mark { width: clamp(4.5rem, 10vw, 7.5rem); height: auto; margin-bottom: var(--space-s); border-radius: 1.4rem; box-shadow: 0 0 0 1px rgba(255,255,255,.2), 0 20px 42px rgba(0,0,0,.34); }
.coming-soon-hero h1 { margin: .1em 0 .18em; font-size: clamp(3.5rem, 13vw, 11rem); line-height: .86; color: var(--color-white); text-shadow: 0 0 32px rgba(244,189,79,.22); }
.coming-soon-hero__copy { max-width: 44rem; margin: 0 auto var(--space-m); color: var(--text-secondary); font-size: var(--step-1); }
.coming-soon-hero__badges { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-xs); }
.coming-soon-hero__badges span { display: inline-flex; min-height: 40px; align-items: center; padding: .45rem .85rem; border: 1px solid rgba(255,255,255,.24); border-radius: var(--radius-pill); background: rgba(255,255,255,.09); color: var(--text-primary); font-size: var(--step--1); font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
.site-footer--simple { margin-top: 0; }
`;

const SITE_CHROME_SCRIPT = `
(() => {
  const header = document.querySelector('.site-header');
  const revealItems = [...document.querySelectorAll('.reveal')];
  const themedSections = [...document.querySelectorAll('[data-theme]')];

  const setStickyOffset = () => {
    if (!header) return;
    const headerHeight = header.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--site-header-sticky-offset', Math.max(0, headerHeight - 2) + 'px');
  };

  const setHeaderScrollState = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 8);
  };

  setStickyOffset();
  setHeaderScrollState();
  window.addEventListener('resize', setStickyOffset);
  window.addEventListener('scroll', setHeaderScrollState, { passive: true });
  if ('ResizeObserver' in window) {
    if (header) new ResizeObserver(setStickyOffset).observe(header);
  }

  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('is-visible', entry.isIntersecting);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  revealItems.forEach((item) => revealObserver.observe(item));

  const themeObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target?.dataset?.theme) {
      document.body.dataset.activeTheme = visible.target.dataset.theme;
    }
  }, { threshold: [0.2, 0.45, 0.7] });
  themedSections.forEach((section) => themeObserver.observe(section));

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }
})();
`;

const HOME_FILTER_SCRIPT = `
(() => {
  const calendar = document.querySelector('.calendar');
  if (!calendar) return;

  const heading = calendar.querySelector('.section-heading');
  const status = document.createElement('div');
  status.className = 'filter-status';
  status.setAttribute('aria-live', 'polite');
  status.innerHTML = '<span></span><button type="button">Ver todos</button>';
  heading.insertAdjacentElement('afterend', status);

  const label = status.querySelector('span');
  const clearButton = status.querySelector('button');
  const teamLinks = [...document.querySelectorAll('[data-team-code]')];
  const cards = [...document.querySelectorAll('.match-card[data-team-codes]')];
  const days = [...document.querySelectorAll('.calendar-day')];

  function clearFilter() {
    calendar.classList.remove('is-filtered');
    status.classList.remove('is-active');
    cards.forEach((card) => { card.hidden = false; });
    days.forEach((day) => { day.hidden = false; });
    teamLinks.forEach((link) => link.removeAttribute('aria-current'));
  }

  function applyFilter(code) {
    const teamLink = teamLinks.find((link) => link.dataset.teamCode === code);
    if (!teamLink) {
      clearFilter();
      return;
    }
    calendar.classList.add('is-filtered');
    status.classList.add('is-active');
    label.textContent = 'Mostrando partidos de ' + (teamLink.dataset.teamName || teamLink.textContent.trim());
    teamLinks.forEach((link) => link.toggleAttribute('aria-current', link.dataset.teamCode === code));

    cards.forEach((card) => {
      card.hidden = !card.dataset.teamCodes.split(/\\s+/).includes(code);
    });
    days.forEach((day) => {
      day.hidden = !day.querySelector('.match-card:not([hidden])');
    });
    document.querySelector('#partidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function applyFromHash() {
    if (!location.hash) {
      clearFilter();
      return;
    }
    const target = document.querySelector(location.hash);
    if (target?.dataset?.teamCode) {
      applyFilter(target.dataset.teamCode);
    }
  }

  teamLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setTimeout(applyFromHash, 0);
    });
  });
  clearButton.addEventListener('click', () => {
    history.pushState('', document.title, location.pathname + location.search);
    clearFilter();
  });
  window.addEventListener('hashchange', applyFromHash);
  applyFromHash();
})();
`;
