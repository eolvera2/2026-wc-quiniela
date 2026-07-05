
/**
 * Static HTML site generator — replaces WordPress publisher.
 * Renders articles from SQLite into a static site in outputDir (default: dist/).
 * Integrates affiliate links + disclaimer footer.
 *
 * Reference: docs/plans/2026-06-01-phase2-live-service-integration-implementation.md Task 9/12
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectAffiliateLinks } from './affiliateInjector.js';
import { DISCLAIMER_FOOTER } from '../generate/prompt.js';
import { generateSitemap } from './sitemap.js';
import { decorateTeam, isPlaceholderTeamName, teamAnchorId } from '../data/worldCupTeams.js';
import {
  INITIAL_FIXTURE_CONTENT,
  INITIAL_FIXTURE_CONTENT_ALIASES,
} from '../data/fixtureContent/index.js';

const PUBLIC_ASSET_DIR = 'public';
const BRAND_MARK_PATH = 'public/PredictaGol_Logo.png';

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
    bodyHtml += '\n' + renderTeamSummaries(fixture, fixtureArticles);
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
    const aliasSlug = buildFixtureAliasSlug(fixture);
    if (aliasSlug && aliasSlug !== slug) {
      writeFileSync(join(outputDir, `${aliasSlug}.html`), pageHtml, 'utf-8');
    }
    slugs.push({ fixtureId: fixture.fixtureId, articleType: 'match_page', slug });
  }

  // Write index page
  const indexHtml = renderIndexPage({ fixtures, teams, slugs, siteBaseUrl, articlesByFixture });
  writeFileSync(join(outputDir, 'index.html'), indexHtml, 'utf-8');
  writeLegalPages({ outputDir, siteBaseUrl });

  // Write sitemap.xml
  const now = new Date().toISOString().slice(0, 10);
  const sitemapEntries = [
    { url: `${siteBaseUrl}/index.html`, lastmod: now },
    { url: `${siteBaseUrl}/privacy.html`, lastmod: now },
    { url: `${siteBaseUrl}/terms.html`, lastmod: now },
    ...slugs.map((s) => ({
      url: `${siteBaseUrl}/${s.slug}.html`,
      lastmod: now,
    })),
  ];
  const sitemapXml = generateSitemap(sitemapEntries);
  writeFileSync(join(outputDir, 'sitemap.xml'), sitemapXml, 'utf-8');

  writeFileSync(join(outputDir, 'robots.txt'), renderRobotsTxt({ sitemapUrl: `${siteBaseUrl}/sitemap.xml` }), 'utf-8');
  writeFileSync(
    join(outputDir, 'llms.txt'),
    renderLlmsTxt({
      siteBaseUrl,
      sections: [
        { title: 'Calendario y pronósticos', url: `${siteBaseUrl}/index.html`, description: 'Calendario completo, equipos y partidos del Mundial 2026 con previas y datos PGS®.' },
        { title: 'Privacidad', url: `${siteBaseUrl}/privacy.html`, description: 'Aviso de privacidad de Predictagol.' },
        { title: 'Términos', url: `${siteBaseUrl}/terms.html`, description: 'Términos de uso de Predictagol.' },
        ...slugs.slice(0, 24).map((s) => ({
          url: `${siteBaseUrl}/${s.slug}.html`,
          title: s.slug.replace(/\.html$/, '').replace(/-/g, ' '),
        })),
      ],
    }),
    'utf-8',
  );

  return slugs;
}

export function buildComingSoonSite({ siteBaseUrl = 'https://predictagol.com', outputDir = 'dist', basePath = '' } = {}) {
  const normalizedBasePath = normalizePath(basePath);
  const pageOutputDir = normalizedBasePath ? join(outputDir, normalizedBasePath) : outputDir;
  mkdirSync(pageOutputDir, { recursive: true });
  copyStaticAssets(pageOutputDir);

  const canonicalBaseUrl = normalizeBaseUrl(siteBaseUrl);
  const canonicalUrl = `${canonicalBaseUrl}${normalizedBasePath ? `/${normalizedBasePath}/` : '/'}`;
  const indexHtml = renderComingSoonPage({ canonicalUrl });
  writeFileSync(join(pageOutputDir, 'index.html'), indexHtml, 'utf-8');
  const legalBaseUrl = canonicalUrl.replace(/\/$/, '');
  writeLegalPages({ outputDir: pageOutputDir, siteBaseUrl: legalBaseUrl });

  const sitemapUrl = `${canonicalUrl.replace(/\/$/, '')}/sitemap.xml`;
  const sitemapXml = generateSitemap([
    { url: canonicalUrl, lastmod: '2026-01-01' },
    { url: `${legalBaseUrl}/privacy.html`, lastmod: '2026-01-01' },
    { url: `${legalBaseUrl}/terms.html`, lastmod: '2026-01-01' },
  ]);
  writeFileSync(join(pageOutputDir, 'sitemap.xml'), sitemapXml, 'utf-8');

  writeFileSync(join(pageOutputDir, 'robots.txt'), renderRobotsTxt({ sitemapUrl }), 'utf-8');
  writeFileSync(
    join(pageOutputDir, 'llms.txt'),
    renderLlmsTxt({
      siteBaseUrl: canonicalUrl.replace(/\/$/, ''),
      sections: [
        { title: 'Próximamente', url: canonicalUrl, description: 'Página de lanzamiento de Predictagol, la quiniela del Mundial 2026 en español.' },
        { title: 'Privacidad', url: `${legalBaseUrl}/privacy.html`, description: 'Aviso de privacidad de Predictagol.' },
        { title: 'Términos', url: `${legalBaseUrl}/terms.html`, description: 'Términos de uso de Predictagol.' },
      ],
    }),
    'utf-8',
  );
}

function buildFixtureAliasSlug(fixture) {
  if (!fixture.fixtureId || !fixture.kickoffUtc || !fixture.homeTeam || !fixture.awayTeam) return null;
  return buildMatchSlug({ ...fixture, matchNumber: null });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function copyStaticAssets(outputDir) {
  const publicSource = new URL('../../public/', import.meta.url);
  if (existsSync(publicSource)) {
    cpSync(publicSource, join(outputDir, PUBLIC_ASSET_DIR), { recursive: true });
  }

  const staticWebAppConfig = new URL('../../staticwebapp.config.json', import.meta.url);
  if (existsSync(staticWebAppConfig)) {
    cpSync(staticWebAppConfig, join(outputDir, 'staticwebapp.config.json'));
  }
}

function writeLegalPages({ outputDir, siteBaseUrl }) {
  const baseUrl = normalizeBaseUrl(siteBaseUrl);
  writeFileSync(
    join(outputDir, 'privacy.html'),
    renderLegalPage({
      title: 'Aviso de privacidad — Predictagol',
      slug: 'privacy',
      metaDescription: 'Aviso de privacidad de Predictagol para usuarios y visitantes.',
      bodyHtml: renderPrivacyPolicyBody(),
      siteBaseUrl: baseUrl,
    }),
    'utf-8',
  );
  writeFileSync(
    join(outputDir, 'terms.html'),
    renderLegalPage({
      title: 'Términos de uso — Predictagol',
      slug: 'terms',
      metaDescription: 'Términos de uso de Predictagol para usuarios y visitantes.',
      bodyHtml: renderTermsBody(),
      siteBaseUrl: baseUrl,
    }),
    'utf-8',
  );
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

function normalizePath(basePath) {
  return String(basePath || '').replace(/^\/+|\/+$/g, '');
}

/**
 * Renders shared SEO meta tags: description, canonical, favicon, theme-color,
 * Open Graph, and Twitter Card. Centralizes head boilerplate so every page
 * gets consistent metadata for Google, social previews, and AI crawlers.
 */
function renderSeoMetaTags({ canonicalUrl, title, description, ogImageUrl, locale = 'es_MX' }) {
  return `<meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#020f2a">
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" type="image/png" sizes="any" href="${escapeHtml(BRAND_MARK_PATH)}">
  <link rel="apple-touch-icon" href="${escapeHtml(BRAND_MARK_PATH)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Predictagol">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:locale" content="${escapeHtml(locale)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">`;
}

/**
 * Generates a robots.txt that allows all well-behaved crawlers and points to
 * the sitemap. Major AI crawlers (GPTBot, ClaudeBot, Google-Extended, etc.)
 * are explicitly allowed so the site can be discovered and cited.
 */
function renderRobotsTxt({ sitemapUrl }) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# AI crawlers — explicitly allowed for citation and training opt-in',
    'User-agent: GPTBot',
    'Allow: /',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Allow: /',
    'User-agent: Claude-Web',
    'Allow: /',
    'User-agent: anthropic-ai',
    'Allow: /',
    'User-agent: PerplexityBot',
    'Allow: /',
    'User-agent: Google-Extended',
    'Allow: /',
    'User-agent: CCBot',
    'Allow: /',
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n');
}

/**
 * Generates an llms.txt summary following the llmstxt.org convention:
 * a single-page, markdown-formatted brief that helps LLMs understand the
 * site's purpose and locate the most useful URLs without scraping HTML.
 */
function renderLlmsTxt({ siteBaseUrl, sections = [] }) {
  const lines = [
    '# Predictagol',
    '',
    '> Quiniela del Mundial 2026 en español: calendario, equipos, sedes, alineaciones probables y el PredictaGoal Score (PGS®). Sin apuestas, solo diversión.',
    '',
    'Predictagol es un sitio editorial independiente, no afiliado a FIFA. Todo el contenido se publica en español (es-MX) y está optimizado para aficionados que arman quinielas con sus amigos.',
    '',
    '## Recursos principales',
    '',
  ];
  for (const section of sections) {
    const title = section.title || section.url;
    const desc = section.description ? `: ${section.description}` : '';
    lines.push(`- [${title}](${section.url})${desc}`);
  }
  lines.push('');
  lines.push('## Política de uso por agentes');
  lines.push('');
  lines.push('- Permitido citar y resumir el contenido con atribución a Predictagol y enlace a la URL original.');
  lines.push('- No publicamos cuotas ni promovemos apuestas. No utilices el contenido para sugerir apuestas reales.');
  lines.push('- Los datos pueden actualizarse; verifica la fecha de publicación o la URL antes de citar.');
  lines.push('');
  lines.push(`Sitio: ${siteBaseUrl}`);
  lines.push('');
  return lines.join('\n');
}

function renderArticlePage({ title, metaDescription, bodyHtml, siteBaseUrl, slug, structuredData = [] }) {
  const jsonLd = structuredData
    .filter(Boolean)
    .map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`)
    .join('\n');

  const canonicalUrl = `${siteBaseUrl}/${slug}.html`;
  const ogImageUrl = `${siteBaseUrl}/${BRAND_MARK_PATH}`;

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  ${renderSeoMetaTags({ canonicalUrl, title, description: metaDescription, ogImageUrl })}
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
  <script>${PREDICTION_PANEL_SCRIPT}</script>
</body>
</html>`;
}

function renderLegalPage({ title, metaDescription, bodyHtml, siteBaseUrl, slug }) {
  return renderArticlePage({
    title,
    metaDescription,
    bodyHtml: `<section class="legal-page container">${bodyHtml}</section>`,
    siteBaseUrl,
    slug,
  });
}

function renderPrivacyPolicyBody() {
  return `
    <p class="eyebrow">Legal</p>
    <h1>Aviso de privacidad</h1>
    <p>Predictagol es un juego social de pronósticos para la Copa Mundial 2026. No es una casa de apuestas.</p>
    <h2>Información que podemos recibir</h2>
    <p>Podemos recibir información que compartes voluntariamente, como datos de contacto, mensajes, preferencias de comunicación o interacciones con nuestros perfiles sociales.</p>
    <h2>Uso de la información</h2>
    <p>Usamos esta información para operar el sitio, responder mensajes, mejorar la experiencia, publicar contenido aprobado y mantener la seguridad de nuestras cuentas.</p>
    <h2>Servicios de terceros</h2>
    <p>Podemos usar servicios como Google, YouTube, Meta, Instagram, Threads y X para publicar contenido, medir rendimiento básico y autenticar cuentas administradas por Predictagol.</p>
    <h2>Contacto</h2>
    <p>Para temas de privacidad, usa el correo de contacto publicado en nuestros canales oficiales de Predictagol.</p>
    <p><strong>Última actualización:</strong> junio de 2026.</p>
  `;
}

function renderTermsBody() {
  return `
    <p class="eyebrow">Legal</p>
    <h1>Términos de uso</h1>
    <p>Al usar Predictagol aceptas estos términos. Predictagol ofrece contenido y dinámicas sociales de pronósticos deportivos para entretenimiento.</p>
    <h2>No apuestas</h2>
    <p>Predictagol no es una casa de apuestas, no recibe apuestas, no paga premios monetarios por apuestas y no promueve apostar dinero.</p>
    <h2>Contenido y disponibilidad</h2>
    <p>El contenido puede cambiar conforme avanza la Copa Mundial 2026. Podemos actualizar, pausar o retirar funciones y publicaciones sin previo aviso.</p>
    <h2>Uso permitido</h2>
    <p>No uses Predictagol para actividades ilegales, abuso de plataformas, spam, suplantación de identidad o manipulación de sistemas externos.</p>
    <h2>Contacto</h2>
    <p>Para preguntas sobre estos términos, usa el correo de contacto publicado en nuestros canales oficiales de Predictagol.</p>
    <p><strong>Última actualización:</strong> junio de 2026.</p>
  `;
}

function renderComingSoonPage({ canonicalUrl }) {
  const description = 'Predictagol se está preparando para el Mundial 2026. Muy pronto podrás armar tu quiniela y seguir pronósticos partido por partido.';
  const title = 'Próximamente — Predictagol';
  const ogImageUrl = `${canonicalUrl.replace(/\/$/, '')}/${BRAND_MARK_PATH}`;
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  ${renderSeoMetaTags({ canonicalUrl, title, description, ogImageUrl })}
  <script>document.documentElement.classList.add('js');</script>
  <style>${GLOBAL_CSS}${COMING_SOON_CSS}</style>
</head>
<body data-active-theme="navy">
  ${renderComingSoonHeader()}
  <main class="coming-soon-page">
    <section class="coming-soon-hero reveal theme-section" data-theme="navy" aria-labelledby="coming-soon-title">
      ${renderDigitalBalls()}
      <div class="coming-soon-hero__card">
        <img class="coming-soon-hero__mark" src="${BRAND_MARK_PATH}" alt="" width="96" height="96">
        <p class="eyebrow">Predictagol · Mundial 2026</p>
        <h1 id="coming-soon-title">Próximamente</h1>
        <p class="coming-soon-hero__copy">Estamos preparando una experiencia para vivir la quiniela del Mundial con calendario, datos y pronósticos en español.</p>
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

const TEAM_POWER_RATING = {
  ARG: 96, ESP: 95, FRA: 95, BRA: 94, ENG: 93, POR: 92, GER: 91, NED: 90,
  BEL: 88, COL: 87, CRO: 86, MAR: 85, SUI: 85, JPN: 84, SEN: 84, USA: 84,
  AUT: 83, MEX: 83, SWE: 83, ECU: 82, NOR: 82, CIV: 81, CAN: 80, PAR: 80,
  GHA: 80, ALG: 79, EGY: 79, AUS: 78, BIH: 78, COD: 75, RSA: 74, CPV: 72,
};

let initialTeamSummaryCache;

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
        finalHomeScore: article.finalHomeScore ?? null,
        finalAwayScore: article.finalAwayScore ?? null,
        finalScoreSourceName: article.finalScoreSourceName || null,
        finalScoreSourceUrl: article.finalScoreSourceUrl || null,
        homeOdds: article.homeOdds ?? null,
        drawOdds: article.drawOdds ?? null,
        awayOdds: article.awayOdds ?? null,
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
        <span>${escapeHtml(translateVenue(fixture.venue) || 'Sede por confirmar')}</span>
      </div>
      <div class="hero-match__actions">
        <a class="button button--secondary" href="index.html">Volver al calendario</a>
      </div>
    </div>
  </header>`;
}

function renderTeamSummaries(fixture, fixtureArticles = new Map()) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const initialContent = getInitialFixtureContent(fixture);
  const pgsSource = getFixturePgsSource(fixture, fixtureArticles);
  return `<section class="team-summaries container reveal theme-section" data-theme="navy">
    <div class="team-summaries__heading">
      <h2>Resumen de equipos</h2>
      ${renderScoreCluster(fixture, pgsSource, 'score-cluster--inline')}
    </div>
    <div class="team-summaries__grid">
      ${renderTeamSummaryCard(homeTeam, initialContent)}
      ${renderTeamSummaryCard(awayTeam, initialContent)}
    </div>
  </section>`;
}

function renderSectionList({ fixture, fixtureArticles, affiliateUrls }) {
  const initialContent = getInitialFixtureContent(fixture);
  const pgsSource = getFixturePgsSource(fixture, fixtureArticles);
  const hasGeneratedFixtureContent = [...fixtureArticles.values()].some((article) =>
    article?.status === 'generated'
    || ['refresh', 'final_refresh', 'lock'].includes(article?.lastPass)
    || ['refreshed', 'final_refreshed', 'locked'].includes(article?.lifecycleState)
  );
  return Object.entries(SECTION_LABELS)
    .map(([sectionType, label]) => {
      const article = fixtureArticles.get(sectionType);
      const hasArticleContent = Boolean(article?.contentJson?.analisis_tactico_html);
      const initialSection = initialContent?.sections?.[sectionType];
      const displayInitialSection = hasGeneratedFixtureContent ? stripFreshnessLabels(initialSection) : initialSection;
      const isPlaceholder = !hasArticleContent && !initialSection;
      const isStaleInitialPgs = !hasArticleContent && initialSection && !pgsScoresEqual(initialContent?.pgs, pgsSource?.pgs);
      const rawContent = article?.contentJson?.analisis_tactico_html
        || displayInitialSection
        || `<section class="coming-soon"><h2>${escapeHtml(label)}</h2><p>Próximamente: actualizaremos esta sección de ${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)} cuando tengamos datos confiables.</p></section>`;
      const content = alignSectionContentWithPgs(fixture, sectionType, rawContent, pgsSource?.pgs, { force: isStaleInitialPgs });
      return `<section id="${escapeHtml(sectionType)}" class="match-section container reveal" data-section="${escapeHtml(sectionType)}">
        <p class="section-kicker">${escapeHtml(label)}</p>
        <div class="match-article">${hasArticleContent ? injectAffiliateLinks(content, affiliateUrls) : content}</div>
      </section>`;
    })
    .join('\n');
}

function renderTeamSummaryCard(team, initialContent) {
  const summary = initialContent?.teamSummaries?.[team.code];
  return `<article class="team-card"><span class="team-chip">${renderTeamName(team)}</span>${summary || '<p>Resumen del equipo próximamente con grupo, forma reciente y claves para tu quiniela.</p>'}</article>`;
}

function renderPgsPill(fixture, pgsSource, className = '') {
  if (!pgsSource?.pgs) return '';
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const classes = ['pgs-pill', className].filter(Boolean).join(' ');
  return `<span class="${escapeHtml(classes)}" tabindex="0" title="Resultado PredictaGoal Score basado en los datos más recientes" aria-label="Resultado PredictaGoal Score basado en los datos más recientes: ${escapeHtml(homeTeam.name)} ${escapeHtml(pgsSource.pgs.home)} - ${escapeHtml(awayTeam.name)} ${escapeHtml(pgsSource.pgs.away)}">
    <span class="pgs-pill__label">PGS®:</span>
    ${renderPgsTeamScore(homeTeam, pgsSource.pgs.home)}
    <span class="pgs-pill__dash">-</span>
    ${renderPgsTeamScore(awayTeam, pgsSource.pgs.away)}
  </span>`;
}

function renderScoreCluster(fixture, pgsSource, className = '') {
  const finalScore = renderFinalScorePill(fixture);
  const pgs = renderPgsPill(fixture, pgsSource, 'pgs-pill--inline');
  if (!finalScore && !pgs) return '';
  return `<div class="${escapeHtml(['score-cluster', className].filter(Boolean).join(' '))}">${finalScore}${pgs}</div>`;
}

function renderFinalScorePill(fixture, className = '') {
  if (!hasFinalScore(fixture)) return '';
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const source = fixture.finalScoreSourceName ? ` Fuente: ${fixture.finalScoreSourceName}.` : '';
  const sourceAttrs = fixture.finalScoreSourceUrl
    ? ` title="${escapeHtml(`Marcador final de fuente pública.${source}`)}"`
    : ` title="${escapeHtml(`Marcador final de fuente pública.${source}`)}"`;
  return `<span class="${escapeHtml(['final-score-pill', className].filter(Boolean).join(' '))}"${sourceAttrs}>
    <span class="final-score-pill__label">Final:</span>
    ${renderPgsTeamScore(homeTeam, fixture.finalHomeScore)}
    <span class="pgs-pill__dash">-</span>
    ${renderPgsTeamScore(awayTeam, fixture.finalAwayScore)}
  </span>`;
}

function hasFinalScore(fixture) {
  return Number.isInteger(fixture?.finalHomeScore) && Number.isInteger(fixture?.finalAwayScore);
}

function renderPgsTeamScore(team, score) {
  const flag = team?.flag && !team.isPlaceholder
    ? `<img class="pgs-pill__flag" src="${escapeHtml(flagImageUrl(team.flag))}" alt="" width="24" height="18" loading="lazy">`
    : '';
  return `<span class="pgs-pill__team">${flag}<span class="pgs-pill__score">${escapeHtml(score)}</span></span>`;
}

function getInitialFixtureContent(fixture) {
  const date = fixture.kickoffUtc ? fixture.kickoffUtc.slice(0, 10) : '';
  const codeKey = `${fixture.homeTeamCode || ''}-${fixture.awayTeamCode || ''}-${date}`;
  const nameKey = `${String(fixture.homeTeam || '').toUpperCase()}-${String(fixture.awayTeam || '').toUpperCase()}-${date}`;
  return INITIAL_FIXTURE_CONTENT[codeKey]
    || INITIAL_FIXTURE_CONTENT_ALIASES[codeKey]
    || INITIAL_FIXTURE_CONTENT_ALIASES[nameKey]
    || buildKnockoutFixtureContent(fixture);
}

function buildKnockoutFixtureContent(fixture) {
  if (fixture.stage !== 'knockout') return null;
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  if (homeTeam.isPlaceholder || awayTeam.isPlaceholder || !homeTeam.code || !awayTeam.code) return null;

  const pgs = estimateKnockoutPgs(fixture, homeTeam, awayTeam);
  const winner = pgs.home > pgs.away ? homeTeam : awayTeam;
  const underdog = pgs.home > pgs.away ? awayTeam : homeTeam;
  const pgsText = `${homeTeam.name} ${pgs.home}-${pgs.away} ${awayTeam.name}`;
  const venue = translateVenue(fixture.venue) || 'sede mundialista';
  const kickoff = formatDateTime(fixture.kickoffUtc);
  const oddsContext = hasFixtureOdds(fixture)
    ? 'La lectura combina momios disponibles, fuerza reciente y contexto de eliminación directa.'
    : 'La lectura combina fuerza de plantel, rendimiento del torneo y contexto de eliminación directa mientras se actualizan momios cercanos al partido.';

  return {
    pgs,
    teamSummaries: {
      [homeTeam.code]: findInitialTeamSummary(homeTeam.code) || genericTeamSummary(homeTeam),
      [awayTeam.code]: findInitialTeamSummary(awayTeam.code) || genericTeamSummary(awayTeam),
    },
    sections: {
      pronostico_momios: `<section class="initial-section"><h2>Análisis actualizado de eliminación directa</h2><p>El cruce ${escapeHtml(homeTeam.name)} vs ${escapeHtml(awayTeam.name)} ya está definido en el calendario y se jugará ${escapeHtml(kickoff)} en ${escapeHtml(venue)}. ${escapeHtml(oddsContext)}</p><p>El PGS® preliminar marca <strong>${escapeHtml(pgsText)}</strong>: ${escapeHtml(winner.name)} tiene una ligera ventaja por jerarquía y rutas de gol, aunque ${escapeHtml(underdog.name)} conserva valor si logra llevar el partido a tramos cerrados y castigar transiciones o balón parado.</p></section>`,
      quiniela_verdict: `<section class="initial-section"><h2>${escapeHtml(winner.name)} con ventaja inicial</h2><p><strong>Pick inicial para quiniela: ${escapeHtml(winner.name)} gana.</strong> En una eliminatoria, la prioridad es elegir al equipo con más caminos para anotar primero y administrar los momentos de presión.</p><p>La ruta alternativa de ${escapeHtml(underdog.name)} pasa por bajar el ritmo, proteger el área en los primeros 30 minutos y convertir el partido en detalles: faltas laterales, errores en salida o una transición aislada.</p></section>`,
      alineacion_probable: `<section class="initial-section"><h2>Lectura preliminar de alineaciones</h2><p>Sin onces confirmados, la expectativa es que ambos técnicos prioricen sus bases más estables por tratarse de eliminación directa. ${escapeHtml(homeTeam.name)} necesita equilibrio entre presión y protección de espalda; ${escapeHtml(awayTeam.name)} debe administrar cargas y evitar quedar partido tras pérdida.</p><p>Cerca del kickoff conviene revisar bajas, rotaciones por acumulación de minutos y si alguno ajusta el mediocampo para proteger una ventaja temprana o perseguir el empate.</p></section>`,
      analisis_apostar: `<section class="initial-section"><h2>Ángulos educativos para leer el partido</h2><p class="freshness-label">Contenido informativo y de entretenimiento. No es recomendación financiera; se actualizará con datos actuales cerca del partido.</p><p>Los puntos clave son primer gol, manejo emocional después del descanso y balón parado. Si ${escapeHtml(winner.name)} confirma favoritismo temprano, el partido puede abrir espacios; si ${escapeHtml(underdog.name)} sostiene el empate, el valor táctico se mueve hacia mercados conservadores y posibles tiempos extra.</p><p>Antes de jugar tu quiniela, revisa alineaciones oficiales, noticias de lesiones y movimiento final de cuotas. El PGS® se mantendrá actualizado conforme entren nuevos datos confiables.</p></section>`,
    },
  };
}

function findInitialTeamSummary(code) {
  if (!initialTeamSummaryCache) {
    initialTeamSummaryCache = new Map();
    for (const content of Object.values(INITIAL_FIXTURE_CONTENT)) {
      for (const [teamCode, summary] of Object.entries(content.teamSummaries || {})) {
        if (!initialTeamSummaryCache.has(teamCode)) initialTeamSummaryCache.set(teamCode, summary);
      }
    }
  }
  return initialTeamSummaryCache.get(code) || null;
}

function genericTeamSummary(team) {
  return `<p><strong>${escapeHtml(team.name)}</strong> llega a la fase de eliminación directa con un perfil competitivo que debe evaluarse por forma reciente, gestión física y capacidad para sostener ventajas.</p><p>La página se actualizará conforme entren datos más cercanos al partido, incluyendo noticias de plantilla y alineaciones confirmadas.</p>`;
}

function estimateKnockoutPgs(fixture, homeTeam, awayTeam) {
  const oddsOutcome = inferOutcomeFromOdds(fixture);
  if (oddsOutcome === 'home') return scoreFromAdvantage('home', 10);
  if (oddsOutcome === 'away') return scoreFromAdvantage('away', 10);

  const homeRating = TEAM_POWER_RATING[homeTeam.code] || 78;
  const awayRating = TEAM_POWER_RATING[awayTeam.code] || 78;
  let diff = homeRating - awayRating;
  if (homeTeam.code === 'MEX') diff += 2;
  if (awayTeam.code === 'MEX') diff -= 2;
  return scoreFromAdvantage(diff >= 0 ? 'home' : 'away', Math.abs(diff));
}

function scoreFromAdvantage(side, advantage) {
  const favoriteGoals = advantage >= 18 ? 3 : 2;
  const underdogGoals = advantage >= 9 ? 0 : 1;
  return side === 'home'
    ? { home: favoriteGoals, away: underdogGoals }
    : { home: underdogGoals, away: favoriteGoals };
}

function hasFixtureOdds(fixture) {
  return Boolean(numericOdd(fixture.homeOdds ?? fixture.homeWinOdds)
    && numericOdd(fixture.drawOdds)
    && numericOdd(fixture.awayOdds ?? fixture.awayWinOdds));
}

function getFixturePgsSource(fixture, fixtureArticles = new Map()) {
  const generatedArticle = fixtureArticles.get('pronostico_momios')?.contentJson;
  const generatedPgs = extractGeneratedPgs(generatedArticle, fixture);
  if (generatedPgs && isPgsCoherent(fixture, generatedPgs, generatedArticle)) return { pgs: generatedPgs };

  const initialContent = getInitialFixtureContent(fixture);
  if (initialContent?.pgs && isPgsCoherent(fixture, initialContent.pgs, initialContent)) return { ...initialContent, pgs: initialContent.pgs };
  return { pgs: { home: '#', away: '#' } };
}

function isPgsCoherent(fixture, pgs, context) {
  if (!Number.isInteger(pgs?.home) || !Number.isInteger(pgs?.away)) return false;
  const pgsOutcome = outcomeFromScore(pgs);
  if (pgsOutcome === 'draw') return true;

  const expectedOutcome = inferExpectedOutcome(fixture, context);
  return !expectedOutcome || expectedOutcome === pgsOutcome || expectedOutcome === 'draw';
}

function outcomeFromScore(score) {
  if (score.home > score.away) return 'home';
  if (score.away > score.home) return 'away';
  return 'draw';
}

function inferExpectedOutcome(fixture, context) {
  const oddsOutcome = inferOutcomeFromOdds(fixture);
  if (oddsOutcome) return oddsOutcome;
  return inferOutcomeFromText(fixture, context);
}

function inferOutcomeFromOdds(fixture) {
  const home = numericOdd(fixture.homeOdds ?? fixture.homeWinOdds);
  const away = numericOdd(fixture.awayOdds ?? fixture.awayWinOdds);
  if (!home || !away) return null;

  const favorite = home < away ? 'home' : away < home ? 'away' : 'draw';
  if (favorite === 'draw') return null;
  const favoriteOdd = Math.min(home, away);
  const underdogOdd = Math.max(home, away);
  return underdogOdd / favoriteOdd >= 1.75 ? favorite : null;
}

function numericOdd(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 1 ? value : null;
}

function inferOutcomeFromText(fixture, context) {
  const homeTeam = normalizeTextForPgs(fixture.homeTeam);
  const awayTeam = normalizeTextForPgs(fixture.awayTeam);
  if (!homeTeam || !awayTeam) return null;
  const text = normalizeTextForPgs(contextText(context));
  const homeScore = teamFavoriteSignalScore(text, homeTeam);
  const awayScore = teamFavoriteSignalScore(text, awayTeam);
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? 'home' : 'away';
}

function teamFavoriteSignalScore(text, team) {
  const teamPattern = escapeRegExp(team);
  const positiveNearTeam = new RegExp(`\\b${teamPattern}\\b.{0,90}\\b(?:favorit[oa]s?|favoritismo|ventaja|gana|triunfo|superior|domina|amplio favorito|favorito claro)\\b`, 'i');
  const positiveBeforeTeam = new RegExp(`\\b(?:favorit[oa]s?|favoritismo|ventaja|gana|triunfo|superior|domina|amplio favorito|favorito claro)\\b.{0,90}\\b${teamPattern}\\b`, 'i');
  let score = 0;
  if (positiveNearTeam.test(text)) score += 1;
  if (positiveBeforeTeam.test(text)) score += 1;
  return score;
}

function contextText(context) {
  if (!context) return '';
  if (typeof context === 'string') return context;
  return [
    context.pronostico_quiniela,
    context.analisis_tactico_html,
    context.teamSummaries && Object.values(context.teamSummaries).join(' '),
    context.sections && Object.values(context.sections).join(' '),
  ].filter(Boolean).join(' ');
}

function alignSectionContentWithPgs(fixture, sectionType, content, pgs, { force = false } = {}) {
  if (!pgs || (!force && !contentContradictsPgs(fixture, content, pgs))) return content;
  return buildPgsAlignedSection(fixture, pgs, sectionType);
}

function pgsScoresEqual(left, right) {
  return Number.isInteger(left?.home)
    && Number.isInteger(left?.away)
    && left.home === right?.home
    && left.away === right?.away;
}

function contentContradictsPgs(fixture, content, pgs) {
  if (!Number.isInteger(pgs?.home) || !Number.isInteger(pgs?.away)) return false;
  if (contentMentionsExactPgs(fixture, content, pgs)) return false;

  const score = extractScoreFromText(content, fixture);
  if (score && (score.home !== pgs.home || score.away !== pgs.away)) return true;

  const pgsOutcome = outcomeFromScore(pgs);
  const textOutcome = inferOutcomeFromText(fixture, content);
  return pgsOutcome !== 'draw' && textOutcome && textOutcome !== pgsOutcome;
}

function contentMentionsExactPgs(fixture, content, pgs) {
  const home = normalizeScorePatternText(fixture.homeTeam);
  const away = normalizeScorePatternText(fixture.awayTeam);
  const normalized = normalizeScorePatternText(content);
  if (!home || !away || !normalized) return false;

  const direct = new RegExp(`\\b${escapeRegExp(home)}\\b\\s+${pgs.home}\\s*[-–]\\s*${pgs.away}\\s+\\b${escapeRegExp(away)}\\b`, 'i');
  const reverse = new RegExp(`\\b${escapeRegExp(away)}\\b\\s+${pgs.away}\\s*[-–]\\s*${pgs.home}\\s+\\b${escapeRegExp(home)}\\b`, 'i');
  return direct.test(normalized) || reverse.test(normalized);
}

function buildPgsAlignedSection(fixture, pgs, sectionType) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const pgsText = `${homeTeam.name} ${pgs.home}-${pgs.away} ${awayTeam.name}`;
  const pgsOutcome = outcomeFromScore(pgs);
  const winner = pgsOutcome === 'home' ? homeTeam : pgsOutcome === 'away' ? awayTeam : null;
  const underdog = pgsOutcome === 'home' ? awayTeam : pgsOutcome === 'away' ? homeTeam : null;
  const pick = winner ? `${winner.name} gana` : 'empate';
  const advantage = winner
    ? `${winner.name} queda como la selección con mejor ruta para ganar, mientras ${underdog.name} necesita llevar el partido a detalles: ritmo bajo, balón parado o una transición limpia.`
    : 'La lectura queda equilibrada: ningún equipo separa lo suficiente y el empate es el marcador PGS® vigente.';

  if (sectionType === 'quiniela_verdict') {
    return `<section class="initial-section pgs-aligned-section"><h2>Veredicto actualizado PGS®</h2><p><strong>Pick actualizado para quiniela: ${escapeHtml(pick)}.</strong> El marcador vigente es <strong>${escapeHtml(pgsText)}</strong>, así que esta sección se alinea con la predicción más reciente mostrada en el calendario.</p><p>${escapeHtml(advantage)}</p></section>`;
  }

  if (sectionType === 'analisis_apostar') {
    return `<section class="initial-section pgs-aligned-section"><h2>Ángulos actualizados con PGS®</h2><p>El PGS® vigente marca <strong>${escapeHtml(pgsText)}</strong>. Para leer el partido, prioriza primer gol, manejo emocional después del descanso y ajustes si el favorito del PGS® no logra abrir el marcador.</p><p>Este contenido es informativo y de entretenimiento; revisa alineaciones, lesiones y momios finales antes de cerrar tu quiniela.</p></section>`;
  }

  return `<section class="initial-section pgs-aligned-section"><h2>Pronóstico actualizado PGS®</h2><p>La predicción más reciente para este partido es <strong>${escapeHtml(pgsText)}</strong>. ${escapeHtml(advantage)}</p><p>Esta vista reemplaza cualquier lectura previa que apuntara a otro marcador para mantener los Datos alineados con el PGS® del calendario.</p></section>`;
}

function extractGeneratedPgs(contentJson, fixture) {
  const structuredForecast = extractScoreFromText(contentJson?.pronostico_quiniela, fixture);
  if (structuredForecast) return structuredForecast;

  const html = contentJson?.analisis_tactico_html;
  if (!html) return null;
  const text = decodeHtmlEntities(stripHtml(html)).replace(/\s+/g, ' ').trim();
  return extractScoreFromText(text, fixture);
}

function extractScoreFromText(value, fixture) {
  if (!value) return null;
  const text = decodeHtmlEntities(stripHtml(value)).replace(/\s+/g, ' ').trim();
  const teamOrderedScore = fixture ? extractTeamOrderedScore(text, fixture) : null;
  if (teamOrderedScore) return teamOrderedScore;

  const match = text.match(/\b(?:predicci[oó]n(?:\s+final)?|pron[oó]stico(?:\s+del\s+marcador)?|marcador final|previsi[oó]n)?\b[\s:.,;]*(?:[^\d]{0,220}?)\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/i);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function extractTeamOrderedScore(text, fixture) {
  const home = normalizeScorePatternText(fixture.homeTeam);
  const away = normalizeScorePatternText(fixture.awayTeam);
  const normalized = normalizeScorePatternText(text);
  if (!home || !away || !normalized) return null;

  const direct = matchTeamOrderedScore(normalized, home, away);
  if (direct) return { home: direct.first, away: direct.second };

  const reverse = matchTeamOrderedScore(normalized, away, home);
  if (reverse) return { home: reverse.second, away: reverse.first };

  return null;
}

function matchTeamOrderedScore(text, firstTeam, secondTeam) {
  const pattern = new RegExp(`\\b${escapeRegExp(firstTeam)}\\b.{0,140}?\\b(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\b.{0,140}?\\b${escapeRegExp(secondTeam)}\\b`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  return { first: Number(match[1]), second: Number(match[2]) };
}

function normalizeScorePatternText(value) {
  return decodeHtmlEntities(stripHtml(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\-–]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeTextForPgs(value) {
  return decodeHtmlEntities(stripHtml(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderPredictionPanel(fixture) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const statusId = `prediction-status-${fixture.fixtureId}`;
  return `<section class="prediction-panel container reveal theme-section" data-theme="festival" data-fixture-id="${escapeHtml(fixture.fixtureId)}" aria-label="Panel de quiniela">
    <h2>Tu predicción</h2>
    <p>Sin apuestas, solo diversión. Elige tu pronóstico antes del kickoff; se guarda solo en este navegador.</p>
    <div class="prediction-options" role="group" aria-label="Pronóstico ${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)}" aria-describedby="${escapeHtml(statusId)}">
      <button type="button" data-pick="home" data-pick-label="${escapeHtml(homeTeam.name)}" aria-pressed="false">1 ${renderTeamName(homeTeam)}</button>
      <button type="button" data-pick="draw" data-pick-label="Empate" aria-pressed="false">X Empate</button>
      <button type="button" data-pick="away" data-pick-label="${escapeHtml(awayTeam.name)}" aria-pressed="false">2 ${renderTeamName(awayTeam)}</button>
    </div>
    <p id="${escapeHtml(statusId)}" class="prediction-status" aria-live="polite">Elige una opción para guardar tu pick local.</p>
  </section>`;
}

function renderIndexPage({ fixtures, teams, slugs, siteBaseUrl, articlesByFixture = new Map() }) {
  const nextFixture = fixtures[0];
  const dateTabs = renderDateTabs(fixtures);
  const calendar = renderCalendarSections(fixtures, slugs, articlesByFixture);
  const teamsShortcut = renderTeamsShortcut(teams);
  const nextHome = nextFixture ? fixtureTeam(nextFixture, 'home') : null;
  const nextAway = nextFixture ? fixtureTeam(nextFixture, 'away') : null;
  const title = 'Calendario Mundial 2026 — Quiniela y Pronósticos | Predictagol';
  const description = 'Calendario completo del Mundial 2026: partidos, sedes, equipos, pronósticos PGS® y quiniela en español, sin apuestas.';
  const canonicalUrl = siteBaseUrl ? `${siteBaseUrl.replace(/\/$/, '')}/` : 'index.html';
  const ogImageUrl = siteBaseUrl ? `${siteBaseUrl.replace(/\/$/, '')}/${BRAND_MARK_PATH}` : BRAND_MARK_PATH;

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Predictagol',
    url: canonicalUrl,
    inLanguage: 'es-MX',
    description,
  };

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  ${renderSeoMetaTags({ canonicalUrl, title, description, ogImageUrl })}
  <script>document.documentElement.classList.add('js');</script>
  <style>${GLOBAL_CSS}</style>
  <script type="application/ld+json">${JSON.stringify(websiteJsonLd)}</script>
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
      <div class="section-heading calendar__heading">
        <p class="eyebrow">Partidos</p>
        <h2>Calendario de partidos</h2>
      </div>
      ${calendar}
    </section>
    ${teamsShortcut}
  </main>
  ${renderSiteFooter()}
  <script>${SITE_CHROME_SCRIPT}</script>
  <script>${HOME_SCHEDULE_SCRIPT}</script>
  <script>${HOME_FILTER_SCRIPT}</script>
</body>
</html>`;
}

function renderDateTabs(fixtures) {
  const dates = uniqueDates(fixtures).filter((date) => date !== 'por-confirmar');
  if (dates.length === 0) return '';
  const tabs = dates.map((date, index) => `<a class="date-tab ${index === 0 ? 'is-active' : ''}" href="#fecha-${date}" data-date="${date}" ${index === 0 ? 'aria-current="date"' : ''}>
      <span class="date-tab__day">${escapeHtml(shortDay(date))}</span>
      <span class="date-tab__date">${escapeHtml(shortDate(date))}</span>
    </a>`).join('\n');
  return `<nav class="date-tabs container-wide" aria-label="Calendario por fecha">${tabs}</nav>`;
}

function renderCalendarSections(fixtures, slugs, articlesByFixture = new Map()) {
  const byDate = new Map();
  fixtures.forEach((fixture, index) => {
    const date = localDateKey(fixture.kickoffUtc);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ fixture, slug: slugs[index]?.slug });
  });

  return [...byDate.entries()].map(([date, rows], index) => `<section id="fecha-${date}" class="calendar-day" data-date="${date}" data-theme="${index % 2 === 0 ? 'jungle' : 'navy'}">
    <div class="round-divider">${escapeHtml(fullDate(date))}</div>
    <div class="match-grid">
      ${rows.map(({ fixture, slug }) => renderMatchCard(fixture, slug, articlesByFixture.get(fixture.fixtureId) || new Map())).join('\n')}
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
      <div class="team-pill-grid">
        ${teamList.map((team) => `<a id="${escapeHtml(team.anchorId)}" class="team-pill" href="#${escapeHtml(team.anchorId)}" data-team-code="${escapeHtml(team.code || '')}" data-team-name="${escapeHtml(team.name)}">${renderTeamName(team)}</a>`).join('\n')}
      </div>
    </div>
  </section>`;
}

function renderMatchCard(fixture, slug, fixtureArticles = new Map()) {
  const homeTeam = fixtureTeam(fixture, 'home');
  const awayTeam = fixtureTeam(fixture, 'away');
  const pgsSource = getFixturePgsSource(fixture, fixtureArticles);
  const dataCta = isUndecidedKnockoutFixture(fixture, homeTeam, awayTeam)
    ? '<span class="match-card__cta match-card__cta--disabled" aria-disabled="true">Ver datos</span>'
    : `<a class="match-card__cta" href="${escapeHtml(slug)}.html">Ver datos</a>`;
  return `<article class="match-card match-card--${escapeHtml(fixture.status || 'upcoming')}" data-team-codes="${escapeHtml([homeTeam.code, awayTeam.code].filter(Boolean).join(' '))}">
    <div class="match-card__top"><span class="status-pill">${escapeHtml(statusLabel(fixture.status))}</span><span>${escapeHtml(stageLabel(fixture.stage))}</span></div>
    <p class="match-card__date numeric">${escapeHtml(formatDateTime(fixture.kickoffUtc))}</p>
    <h3>${renderTeamName(homeTeam)} <span class="versus">vs</span> ${renderTeamName(awayTeam)}</h3>
    <p class="match-card__venue">${escapeHtml(translateVenue(fixture.venue) || 'Sede por confirmar')}</p>
    <div class="match-card__actions">
      ${dataCta}
      ${renderScoreCluster(fixture, pgsSource, 'score-cluster--card')}
    </div>
  </article>`;
}

const VENUE_TRANSLATIONS = {
  'Mexico City': 'Ciudad de México',
};

function translateVenue(venue) {
  if (!venue) return venue;
  return VENUE_TRANSLATIONS[venue] || venue;
}

function isUndecidedKnockoutFixture(fixture, homeTeam, awayTeam) {
  return fixture.stage === 'knockout' && (homeTeam.isPlaceholder || awayTeam.isPlaceholder);
}

function renderSiteHeader() {
  return `<header class="site-header">
    <a class="site-logo" href="index.html" aria-label="Predictagol inicio">
      <img class="site-logo__mark" src="${BRAND_MARK_PATH}" alt="" width="40" height="40">
      <span class="site-logo__text brand-wordmark">PREDICTAGOL</span>
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
      <strong class="brand-wordmark">PREDICTAGOL</strong>
      <p>Este sitio no está afiliado con FIFA. Sin apuestas, solo diversión y pronósticos para tu quiniela.</p>
    </div>
  </footer>`;
}

function renderComingSoonHeader() {
  return `<header class="site-header site-header--simple">
    <a class="site-logo" href="index.html" aria-label="Predictagol inicio">
      <img class="site-logo__mark" src="${BRAND_MARK_PATH}" alt="" width="40" height="40">
      <span class="site-logo__text brand-wordmark">PREDICTAGOL</span>
    </a>
  </header>`;
}

function renderComingSoonFooter() {
  return `<footer class="site-footer site-footer--simple">
    <div class="container">
      <strong class="brand-wordmark">PREDICTAGOL</strong>
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
    location: fixture.venue ? { '@type': 'Place', name: translateVenue(fixture.venue) } : undefined,
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
    ? `<img class="team-flag" src="${escapeHtml(flagImageUrl(team.flag))}" alt="" width="24" height="18" loading="lazy">`
    : '';
  return `<span class="team-name">${flag}<span class="team-name__label">${escapeHtml(team?.name || '')}</span></span>`;
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
  return [...new Set(fixtures.map((fixture) => localDateKey(fixture.kickoffUtc)).filter(Boolean))];
}

function localDateKey(value) {
  if (!value) return 'por-confirmar';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'por-confirmar';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Mexico_City',
  }).formatToParts(parsed);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
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

function stripFreshnessLabels(html) {
  if (!html) return html;
  return String(html).replace(/<p\s+class="freshness-label">[\s\S]*?<\/p>/gi, '');
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
@font-face {
  font-family: "PredictaGol";
  src: url("public/fonts/PredictaGol-NormalRegular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
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
  --font-brand: "PredictaGol", "Poppins", "Barlow Condensed", system-ui, sans-serif;
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
.site-logo__mark { width: 2.5rem; height: 2.5rem; padding: .18rem; border-radius: .75rem; background: rgba(2, 15, 42, .96); object-fit: contain; box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 10px 24px rgba(0,0,0,.25); }
.site-logo__text { white-space: nowrap; }
.brand-wordmark { font-family: var(--font-brand); font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
.site-header nav, .site-footer nav { display: flex; flex-wrap: wrap; gap: var(--space-s); }
.site-header a, .site-footer a { color: var(--text-primary); text-decoration: none; font-weight: 700; }
.hero-match { position: relative; padding: clamp(1rem, 2.2vw, 2rem) 0 clamp(1.25rem, 2.6vw, 2.4rem); background: radial-gradient(circle at 15% 20%, rgba(0,198,163,.22), transparent 22rem), radial-gradient(circle at 85% 15%, rgba(244,189,79,.18), transparent 24rem), linear-gradient(135deg, rgba(0,48,32,.96), rgba(2,15,42,.94)); overflow: hidden; }
.hero-match::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .22; background-image: radial-gradient(circle, rgba(244,189,79,.88) 0 .14rem, transparent .16rem); background-size: 2.6rem 2.6rem; mask-image: linear-gradient(115deg, transparent, #000 20%, transparent 70%); }
.hero-match__inner { position: relative; z-index: 1; padding: clamp(1.35rem, 3vw, 2.8rem); border: 1px solid rgba(244,189,79,.24); border-radius: var(--radius-l); background: linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.05)); box-shadow: var(--shadow-card), inset 0 1px rgba(255,255,255,.1); overflow: hidden; }
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
.match-hero .eyebrow { margin: 0 0 .35rem; }
.match-hero h1 { display: flex; flex-wrap: wrap; align-items: center; gap: .18em; margin: .25rem 0 .55rem; }
.match-hero h1 .versus { display: inline-flex; align-items: center; align-self: center; font-size: .58em; line-height: 1; letter-spacing: -.02em; }
h2 { font-size: var(--step-2); }
.hero-copy { max-width: 48rem; color: var(--text-secondary); }
.hero-match__meta, .hero-match__actions { display: flex; flex-wrap: wrap; gap: var(--space-s); align-items: center; color: var(--text-secondary); }
.button, .match-card__cta { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: .55rem .85rem; border-radius: var(--radius-pill); font-size: var(--step--1); font-weight: 900; text-decoration: none; transition: transform var(--duration-med) var(--ease-out-expo), box-shadow var(--duration-med) var(--ease-out-expo), background var(--duration-med) var(--ease-out-expo); }
.button:hover, .match-card__cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(244,189,79,.22); }
.button--primary, .match-card__cta { background: var(--action-primary-bg); color: var(--action-primary-text); }
.match-card__cta--disabled, .match-card__cta--disabled:hover { opacity: .54; cursor: not-allowed; transform: none; box-shadow: none; }
.button--secondary { border: 1px solid rgba(255,255,255,.35); color: var(--text-primary); }
.date-tabs { display: flex; gap: .55rem; overflow-x: auto; scroll-snap-type: x proximity; padding: .35rem 0 .55rem; }
.date-tabs { position: sticky; top: calc(var(--site-header-sticky-offset, 3rem) - 1px); z-index: 9; background: rgba(2, 15, 42, .94); backdrop-filter: blur(18px); border-bottom: 1px solid var(--border-subtle); box-shadow: 0 0 0 100vmax rgba(2, 15, 42, .94); clip-path: inset(0 -100vmax); }
.date-tab { min-width: 5.15rem; scroll-snap-align: start; padding: .38rem .62rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); text-align: center; text-decoration: none; background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.06)); }
.date-tab.is-active { background: var(--accent-primary); color: var(--color-navy-950); }
.date-tab__day { display: block; font-size: var(--step--2); text-transform: uppercase; }
.date-tab__date { display: block; font-size: var(--step--1); font-weight: 900; }
.calendar { padding: .2rem 0 var(--space-l); scroll-margin-top: var(--sticky-anchor-offset, 8rem); }
.calendar__heading { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.filter-status { display: none; align-items: center; gap: var(--space-xs); margin-bottom: var(--space-m); padding: var(--space-s); border: 1px solid var(--border-subtle); border-radius: var(--radius-l); background: var(--surface-card); }
.filter-status.is-active { display: flex; }
.filter-status button { min-height: 40px; padding: .45rem .8rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: var(--surface-card-strong); color: var(--text-primary); font-size: var(--step--1); font-weight: 900; }
.calendar.is-filtered .match-card[hidden], .calendar.is-filtered .calendar-day[hidden] { display: none; }
.section-heading { margin-bottom: var(--space-m); }
.calendar-day { scroll-margin-top: var(--sticky-anchor-offset, 8rem); }
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
.match-card__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-xs); }
.team-summaries, .prediction-panel, .match-section { margin-block: var(--space-l); padding: var(--space-m); }
.match-hero + .team-summaries { margin-top: var(--space-m); }
.team-summaries__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-xs); margin: 0 0 var(--space-s); }
.team-summaries h2 { margin: 0; }
.team-summaries__grid { display: grid; grid-template-columns: 1fr; gap: var(--space-m); }
@media (min-width: 768px) { .team-summaries__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.team-card { padding: var(--space-m); }
.team-chip { display: inline-flex; align-items: center; padding: .4rem .75rem; border-radius: var(--radius-pill); background: var(--surface-card-strong); font-weight: 900; }
.pgs-pill { position: relative; display: inline-flex; align-items: center; gap: .4rem; min-height: 2.15rem; padding: .38rem .72rem; border: 1px solid rgba(255,209,102,.6); border-radius: var(--radius-pill); background: linear-gradient(135deg, var(--color-gold-400), var(--color-jaguar-500)); color: var(--color-navy-950); font-size: var(--step--1); font-weight: 950; box-shadow: 0 10px 28px rgba(245,166,35,.24); cursor: help; }
.score-cluster { display: inline-flex; align-items: center; gap: .45rem; }
.score-cluster--inline { justify-content: flex-end; margin-left: auto; }
.score-cluster--card { flex-direction: column; align-items: flex-end; margin-left: auto; gap: .25rem; }
.final-score-pill { display: inline-flex; align-items: center; gap: .4rem; min-height: 2.15rem; padding: .38rem .72rem; border: 1px solid rgba(0,198,163,.5); border-radius: var(--radius-pill); background: linear-gradient(135deg, rgba(0,198,163,.24), rgba(255,255,255,.1)); color: var(--text-primary); font-size: var(--step--1); font-weight: 950; box-shadow: 0 10px 28px rgba(0,198,163,.14); }
.final-score-pill__label { color: var(--accent-secondary); text-transform: uppercase; letter-spacing: .08em; }
.pgs-pill::after { content: attr(title); position: absolute; right: 0; bottom: calc(100% + .55rem); z-index: 5; width: max-content; max-width: min(18rem, 78vw); padding: .45rem .65rem; border: 1px solid rgba(255,255,255,.2); border-radius: var(--radius-m); background: rgba(2,15,42,.96); color: var(--text-primary); font-size: var(--step--2); font-weight: 800; line-height: 1.35; letter-spacing: normal; text-align: left; text-transform: none; opacity: 0; pointer-events: none; transform: translateY(.25rem); transition: opacity var(--duration-med) var(--ease-out-expo), transform var(--duration-med) var(--ease-out-expo); }
.pgs-pill:hover::after, .pgs-pill:focus-visible::after { opacity: 1; transform: translateY(0); }
.pgs-pill__label, .pgs-pill__team { display: inline-flex; align-items: center; gap: .25rem; }
.pgs-pill__flag { display: block; width: 1.35rem; height: auto; border-radius: .12rem; box-shadow: 0 0 0 1px rgba(2,15,42,.22); }
.pgs-pill__dash { opacity: .8; }
.pgs-pill--inline { min-height: 0; margin-left: auto; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--accent-primary); font-size: var(--step--2); letter-spacing: .12em; text-transform: uppercase; box-shadow: none; }
.pgs-pill--inline .pgs-pill__flag { width: 1.1rem; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.teams-shortcut { position: relative; margin-top: var(--space-l); padding-block: var(--space-xl); overflow: hidden; scroll-margin-top: var(--sticky-anchor-offset, 8rem); background: radial-gradient(circle at 15% 20%, rgba(0,198,163,.22), transparent 22rem), radial-gradient(circle at 85% 15%, rgba(244,189,79,.18), transparent 24rem), linear-gradient(135deg, rgba(0,48,32,.96), rgba(2,15,42,.94)); }
.teams-shortcut::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .18; background-image: radial-gradient(circle, rgba(244,189,79,.88) 0 .14rem, transparent .16rem); background-size: 2.6rem 2.6rem; mask-image: linear-gradient(115deg, transparent, #000 20%, transparent 70%); }
.teams-shortcut__inner { position: relative; z-index: 1; }
.team-pill-grid { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.team-pill { display: inline-flex; padding: .5rem .8rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.05)); color: var(--text-primary); font-weight: 800; text-decoration: none; transition: transform var(--duration-med) var(--ease-out-expo), background var(--duration-med) var(--ease-out-expo); }
.team-pill:hover { transform: translateY(-1px); background: var(--surface-card-strong); }
.team-pill:target { background: var(--accent-primary); color: var(--color-navy-950); }
.team-name { display: inline-flex; align-items: center; gap: .35rem; vertical-align: middle; }
.team-flag { display: block; flex: 0 0 auto; width: 1.5rem; height: 1.125rem; border-radius: .125rem; object-fit: cover; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.match-hero h1 .team-name { align-items: center; gap: .6rem; }
.match-hero h1 .team-flag { width: clamp(2rem, 3.7vw, 3.9rem); height: auto; border-radius: .22rem; }
.team-chip .team-flag { width: 1.7rem; height: 1.275rem; }
.match-article { color: var(--text-secondary); }
.match-article h2 { color: var(--text-primary); }
.coming-soon { border-left: 4px solid var(--accent-primary); padding-left: var(--space-s); }
.initial-section { border-left: 4px solid var(--accent-secondary); padding-left: var(--space-s); }
.freshness-label { display: inline-block; margin: 0 0 var(--space-xs); padding: .35rem .6rem; border: 1px solid rgba(0,198,163,.34); border-radius: var(--radius-pill); background: rgba(0,198,163,.1); color: var(--accent-secondary); font-size: var(--step--2); font-weight: 900; }
.prediction-options { display: grid; grid-template-columns: 1fr; gap: var(--space-xs); }
@media (min-width: 768px) { .prediction-options { grid-template-columns: repeat(3, 1fr); } }
.prediction-options button { min-height: 40px; padding: .5rem .85rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); background: var(--surface-card-strong); color: var(--text-primary); font-size: var(--step--1); font-weight: 900; }
.prediction-options button[aria-pressed="true"] { border-color: rgba(244,189,79,.7); background: var(--accent-primary); color: var(--color-navy-950); box-shadow: 0 12px 28px rgba(244,189,79,.22); }
.prediction-status { margin-bottom: 0; color: var(--text-secondary); font-size: var(--step--1); }
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
@media (max-width: 640px) {
  .site-header { gap: .5rem; padding: .4rem var(--gutter); }
  .site-header nav { gap: .25rem .5rem; row-gap: .25rem; font-size: var(--step--1); }
  .site-header nav a { padding: .2rem .25rem; }
  .site-logo__text { font-size: .95rem; letter-spacing: .06em; }
  .hero-match__inner { padding: 1.1rem; }
  .home-hero h1 { font-size: clamp(1.9rem, 8vw, 2.6rem); }
  .hero-match__actions .button { flex: 1 1 0; min-width: 0; }
  .date-tabs { gap: .35rem; padding-inline: var(--gutter); }
  .match-card { padding: 1rem; }
  .match-card h3 { font-size: 1.05rem; }
  .pgs-pill { padding: .3rem .55rem; font-size: var(--step--2); }
  .team-pill { padding: .4rem .65rem; font-size: var(--step--1); }
  .container, .container-wide { width: min(100% - 2rem, var(--container-wide)); }
}
@media (max-width: 380px) {
  .site-logo__text { display: none; }
}
@media (hover: none) { .match-card:hover, .button:hover, .match-card__cta:hover, .team-pill:hover { transform: none; box-shadow: none; } }
`;

const COMING_SOON_CSS = `
.site-header--simple { justify-content: center; }
.coming-soon-page { min-height: calc(100svh - 8rem); display: grid; }
.coming-soon-hero { position: relative; display: grid; place-items: center; min-height: calc(100svh - 8rem); padding: var(--space-xl) var(--gutter); overflow: hidden; background: radial-gradient(circle at 50% 0%, rgba(215,234,31,.14), transparent 28rem), radial-gradient(circle at 16% 80%, rgba(200,16,46,.2), transparent 22rem), linear-gradient(135deg, rgba(0,32,24,.96), rgba(2,15,42,.98)); }
.coming-soon-hero::before { content: ""; position: absolute; inset: 0; opacity: .24; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 3.75rem 3.75rem; mask-image: radial-gradient(circle at center, #000, transparent 72%); }
.coming-soon-hero__card { position: relative; z-index: 1; width: min(100%, 64rem); padding: clamp(2rem, 6vw, 5rem); border: 1px solid rgba(244,189,79,.28); border-radius: clamp(1.25rem, 3vw, 2rem); background: linear-gradient(135deg, rgba(255,255,255,.13), rgba(255,255,255,.05)); box-shadow: var(--shadow-card), inset 0 1px rgba(255,255,255,.12); text-align: center; overflow: hidden; }
.coming-soon-hero__card::after { content: ""; position: absolute; inset: auto -8rem -10rem auto; width: 22rem; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgba(0,198,163,.24), transparent 62%); pointer-events: none; }
.coming-soon-hero__mark { width: clamp(4.5rem, 10vw, 7.5rem); height: auto; padding: .35rem; margin-bottom: var(--space-s); border-radius: 1.4rem; background: rgba(2, 15, 42, .96); object-fit: contain; box-shadow: 0 0 0 1px rgba(255,255,255,.2), 0 20px 42px rgba(0,0,0,.34); }
.coming-soon-hero h1 { max-width: 100%; margin: .1em auto .22em; font-size: clamp(2.6rem, 8.4vw, 7rem); line-height: .92; color: var(--color-white); overflow-wrap: anywhere; text-align: center; text-shadow: 0 0 32px rgba(244,189,79,.22); }
.coming-soon-hero__copy { max-width: 44rem; margin: 0 auto; color: var(--text-secondary); font-size: var(--step-1); }
.site-footer--simple { margin-top: 0; }
`;

const SITE_CHROME_SCRIPT = `
(() => {
  const header = document.querySelector('.site-header');
  const homeHero = document.querySelector('.home-hero');
  const dateTabs = document.querySelector('.date-tabs');
  const revealItems = [...document.querySelectorAll('.reveal')];
  const themedSections = [...document.querySelectorAll('[data-theme]')];

  const setStickyMetrics = () => {
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const heroHeight = homeHero ? homeHero.getBoundingClientRect().height : 0;
    const dateTabsHeight = dateTabs ? dateTabs.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--site-header-sticky-offset', Math.max(0, Math.ceil(headerHeight)) + 'px');
    document.documentElement.style.setProperty('--date-tabs-sticky-height', Math.max(0, Math.ceil(dateTabsHeight)) + 'px');
    document.documentElement.style.setProperty('--sticky-anchor-offset', Math.max(0, Math.ceil(headerHeight + dateTabsHeight)) + 'px');
    document.documentElement.style.setProperty('--schedule-stack-height', Math.max(0, Math.ceil(headerHeight + heroHeight + dateTabsHeight)) + 'px');
  };

  const setHeaderScrollState = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 8);
    requestAnimationFrame(setStickyMetrics);
  };

  setStickyMetrics();
  setHeaderScrollState();
  window.addEventListener('resize', setStickyMetrics);
  window.addEventListener('scroll', setHeaderScrollState, { passive: true });
  header?.addEventListener('transitionend', setStickyMetrics);
  if ('ResizeObserver' in window) {
    if (header) new ResizeObserver(setStickyMetrics).observe(header);
    if (homeHero) new ResizeObserver(setStickyMetrics).observe(homeHero);
    if (dateTabs) new ResizeObserver(setStickyMetrics).observe(dateTabs);
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

const HOME_SCHEDULE_SCRIPT = `
(() => {
  const dateTabs = [...document.querySelectorAll('.date-tab[data-date]')];
  const days = [...document.querySelectorAll('.calendar-day[data-date]')];
  if (!dateTabs.length || !days.length) return;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function mexicoCityDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Mexico_City',
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return map.year + '-' + map.month + '-' + map.day;
  }

  function setActiveDate(dateKey) {
    dateTabs.forEach((tab) => {
      const active = tab.dataset.date === dateKey;
      tab.classList.toggle('is-active', active);
      if (active) tab.setAttribute('aria-current', 'date');
      else tab.removeAttribute('aria-current');
    });
  }

  function findDefaultDate() {
    const today = mexicoCityDateKey();
    if (days.some((day) => day.dataset.date === today)) return today;
    return days.find((day) => day.dataset.date)?.dataset.date || '';
  }

  function isReloadNavigation() {
    const [navigation] = performance.getEntriesByType?.('navigation') || [];
    return navigation?.type === 'reload' || performance.navigation?.type === 1;
  }

  function resolveInitialDate(hashDate) {
    const today = findDefaultDate();
    if (hashDate && !isReloadNavigation() && days.some((day) => day.dataset.date === hashDate)) return hashDate;
    if (hashDate && today && hashDate !== today) history.replaceState(null, '', '#fecha-' + today);
    return today;
  }

  function scrollToDate(dateKey, behavior = 'auto') {
    const day = document.querySelector('#fecha-' + dateKey);
    if (!day) return;
    setActiveDate(dateKey);
    requestAnimationFrame(() => {
      day.scrollIntoView({ behavior, block: 'start' });
      const activeTab = dateTabs.find((tab) => tab.dataset.date === dateKey);
      activeTab?.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
    });
  }

  dateTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.date) setActiveDate(tab.dataset.date);
    });
  });

  const hashDate = location.hash.match(/^#fecha-(\\d{4}-\\d{2}-\\d{2})$/)?.[1];
  const defaultDate = resolveInitialDate(hashDate);
  if (defaultDate) scrollToDate(defaultDate);
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

const PREDICTION_PANEL_SCRIPT = `
(() => {
  const panels = [...document.querySelectorAll('.prediction-panel[data-fixture-id]')];
  if (!panels.length) return;

  const storagePrefix = 'predictagol:pick:';

  function readPick(key, status) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn('PredictaGol pick storage is unavailable.', error);
      status.textContent = 'No pudimos leer picks guardados en este navegador.';
      return null;
    }
  }

  function writePick(key, value, status) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('PredictaGol pick storage failed.', error);
      status.textContent = 'No pudimos guardar tu pick en este navegador.';
      return false;
    }
  }

  function updatePanel(panel, pick) {
    const buttons = [...panel.querySelectorAll('[data-pick]')];
    const status = panel.querySelector('.prediction-status');
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.pick === pick));
    });
    const selected = buttons.find((button) => button.dataset.pick === pick);
    status.textContent = selected
      ? 'Tu pick guardado en este navegador: ' + selected.dataset.pickLabel + '.'
      : 'Elige una opción para guardar tu pick local.';
  }

  panels.forEach((panel) => {
    const status = panel.querySelector('.prediction-status');
    const key = storagePrefix + panel.dataset.fixtureId;
    updatePanel(panel, readPick(key, status));

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pick]');
      if (!button || !panel.contains(button)) return;
      if (writePick(key, button.dataset.pick, status)) {
        updatePanel(panel, button.dataset.pick);
      }
    });
  });
})();
`;
