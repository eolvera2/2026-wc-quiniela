import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildComingSoonSite, buildMatchSlug, buildSlug, buildSite } from './staticSite.js';
import { WORLD_CUP_TEAMS } from '../data/worldCupTeams.js';

const AFFILIATE_URLS = {
  caliente: 'https://caliente.mx/ref/TEST',
  bet365: 'https://bet365.mx/ref/TEST',
  skimlinks: 'https://go.skimresources.com/?id=TEST&url=',
};

const SAMPLE_ARTICLE = {
  fixtureId: 1,
  articleType: 'pronostico_momios',
  homeTeam: 'México',
  awayTeam: 'Alemania',
  contentJson: {
    h1_title: 'Pronósticos y momios México vs Alemania',
    meta_description: 'Análisis táctico México vs Alemania Mundial 2026.',
    analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Los momios favorecen a México.</p>',
    url_slug: 'pronosticos-momios-mexico-vs-alemania',
  },
  updatedAt: '2026-06-11T18:00:00Z',
};

const SAMPLE_FIXTURE = {
  fixtureId: 1,
  matchNumber: 1,
  homeTeam: 'México',
  awayTeam: 'Sudáfrica',
  homeTeamCode: 'MEX',
  awayTeamCode: 'RSA',
  kickoffUtc: '2026-06-11T18:00:00Z',
  venue: 'Estadio Azteca',
  stage: 'group',
  status: 'scheduled',
};

const LATE_LOCAL_FIXTURE = {
  fixtureId: 2,
  matchNumber: 2,
  homeTeam: 'Corea del Sur',
  awayTeam: 'Chequia',
  homeTeamCode: 'KOR',
  awayTeamCode: 'CZE',
  kickoffUtc: '2026-06-12T02:00:00Z',
  venue: 'Guadalajara',
  stage: 'group',
  status: 'scheduled',
};

const TUNISIA_NETHERLANDS_FIXTURE = {
  fixtureId: 36,
  matchNumber: 36,
  homeTeam: 'Túnez',
  awayTeam: 'Países Bajos',
  homeTeamCode: 'TUN',
  awayTeamCode: 'NED',
  kickoffUtc: '2026-06-25T23:00:00.000Z',
  venue: 'Kansas City',
  stage: 'group',
  status: 'scheduled',
  homeOdds: 9.3,
  drawOdds: 4.85,
  awayOdds: 1.3,
};

describe('publish/staticSite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'staticSite-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── buildSlug ────────────────────────────────────────────────────────────────

  it('buildSlug normalizes article type and team names into url-safe slug', () => {
    const slug = buildSlug('pronostico_momios', 'México', 'Alemania');
    expect(slug).toBe('pronostico-momios-mexico-vs-alemania');
  });

  it('buildSlug strips accents and lowercases', () => {
    const slug = buildSlug('análisis_apostar', 'España', 'Bélgica');
    expect(slug).toBe('analisis-apostar-espana-vs-belgica');
  });

  it('buildMatchSlug creates stable fixture slugs', () => {
    const slug = buildMatchSlug({
      fixtureId: 1,
      matchNumber: 1,
      homeTeam: 'México',
      awayTeam: 'Alemania',
      kickoffUtc: '2026-06-11T18:00:00Z',
    });
    expect(slug).toBe('partido-1-2026-06-11-mexico-vs-alemania');
  });

  // ── buildSite ────────────────────────────────────────────────────────────────

  it('buildSite creates outputDir if it does not exist', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    expect(existsSync(outDir)).toBe(true);
    expect(existsSync(join(outDir, 'public', 'PredictaGol_Logo.png'))).toBe(true);
    expect(existsSync(join(outDir, 'public', 'fonts', 'PredictaGol-NormalRegular.ttf'))).toBe(true);
    expect(existsSync(join(outDir, 'staticwebapp.config.json'))).toBe(true);
  });

  it('buildSite writes one HTML file per fixture using the match slug as filename', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    const slug = 'fixture-1-fecha-por-confirmar-mexico-vs-alemania';
    expect(existsSync(join(outDir, `${slug}.html`))).toBe(true);
  });

  it('buildSite injects affiliate links and disclaimer into article HTML', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    const slug = 'fixture-1-fecha-por-confirmar-mexico-vs-alemania';
    const html = readFileSync(join(outDir, `${slug}.html`), 'utf-8');
    expect(html).toContain('caliente.mx/ref/TEST');
    expect(html).toContain('rel="sponsored"');
    expect(html).toContain('entretenimiento e información únicamente');
    expect(html).toContain('Alineación probable');
  });

  it('buildSite writes index.html listing all articles', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    expect(index).toContain('fixture-1-fecha-por-confirmar-mexico-vs-alemania.html');
    expect(index).toContain('México');
    expect(index).toContain('Alemania');
  });

  it('buildSite writes sitemap.xml with SITE_BASE_URL in URLs', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    const sitemap = readFileSync(join(outDir, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain('https://example.com/index.html');
    expect(sitemap).toContain('https://example.com/fixture-1-fecha-por-confirmar-mexico-vs-alemania.html');
    expect(sitemap).toContain('<urlset');
  });

  it('buildSite renders design-system calendar and match page components', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    expect(index).toContain('class="site-header"');
    expect(index).toContain('src="public/PredictaGol_Logo.png"');
    expect(index).toContain('@font-face');
    expect(index).toContain('font-family: "PredictaGol"');
    expect(index).toContain('src: url("public/fonts/PredictaGol-NormalRegular.ttf") format("truetype");');
    expect(index).toContain('class="site-logo__text brand-wordmark">PREDICTAGOL</span>');
    expect(index).toContain('<strong class="brand-wordmark">PREDICTAGOL</strong>');
    expect(index).not.toContain('Quiniela 2026');
    expect(index).not.toContain('digitalhub.fifa.com');
    expect(index).toContain('class="date-tabs');
    expect(index).toContain('data-date="2026-06-11"');
    expect(index).toContain('class="match-card');
    expect(index).toContain('id="equipos"');
    expect(index).toContain('href="index.html#equipo-mexico"');
    expect(index).toContain('id="equipo-mexico"');
    expect(index).toContain("querySelectorAll('.match-card[data-team-codes]')");
    expect(index).toContain('.date-tabs { position: sticky;');
    expect(index).toContain('top: calc(var(--site-header-sticky-offset, 3rem) - 1px);');
    expect(index).toContain("document.documentElement.style.setProperty('--site-header-sticky-offset'");
    expect(index).toContain("document.documentElement.style.setProperty('--date-tabs-sticky-height'");
    expect(index).toContain("document.documentElement.style.setProperty('--sticky-anchor-offset'");
    expect(index).toContain("document.documentElement.style.setProperty('--schedule-stack-height'");
    expect(index).toContain("timeZone: 'America/Mexico_City'");
    expect(index).toContain("if ('scrollRestoration' in history) history.scrollRestoration = 'manual';");
    expect(index).toContain('function isReloadNavigation()');
    expect(index).toContain('function resolveInitialDate(hashDate)');
    expect(index).toContain("const defaultDate = resolveInitialDate(hashDate);");
    expect(index).toContain("day.scrollIntoView({ behavior, block: 'start' });");
    expect(index).toContain('new ResizeObserver(setStickyMetrics).observe(header);');
    expect(index).toContain('new ResizeObserver(setStickyMetrics).observe(homeHero);');
    expect(index).toContain('new ResizeObserver(setStickyMetrics).observe(dateTabs);');
    expect(index).toContain('class="home-hero hero-match reveal theme-section" data-theme="navy"');
    expect(index).toContain('id="equipos" class="teams-shortcut reveal theme-section" data-theme="festival"');
    expect(index).toContain('class="container-wide teams-shortcut__inner"');
    expect(index).toContain('scroll-margin-top: var(--sticky-anchor-offset, 8rem);');
    expect(index).not.toContain('Selecciones en el calendario');
    expect(index).not.toContain('La base está precargada');
    const footer = index.slice(index.indexOf('<footer class="site-footer">'), index.indexOf('</footer>') + '</footer>'.length);
    expect(footer).not.toContain('<nav');
    expect(footer).not.toContain('href="index.html#partidos"');
    expect(footer).not.toContain('href="index.html#equipos"');
    expect(index).toContain('id="fecha-2026-06-11" class="calendar-day" data-date="2026-06-11" data-theme="jungle"');
    expect(index).toContain('jueves, 11 de junio');
    expect(index).toContain('class="section-heading calendar__heading"');
    expect(index).toContain('.calendar { padding: .2rem 0 var(--space-l); scroll-margin-top: var(--sticky-anchor-offset, 8rem); }');
    expect(index).toContain('.calendar__heading { position: absolute; width: 1px; height: 1px;');
    expect(index).toContain('.calendar-day { scroll-margin-top: var(--sticky-anchor-offset, 8rem); }');
    expect(index).toContain('.calendar-day + .calendar-day { margin-top: var(--space-m); }');
    expect(index).not.toContain('class="calendar-day reveal"');
    expect(index).toContain('class="digital-ball digital-ball--left" aria-hidden="true"');
    expect(index).toContain("const revealItems = [...document.querySelectorAll('.reveal')];");
    expect(index).toContain("document.body.dataset.activeTheme = visible.target.dataset.theme;");
    expect(index).toContain('html.js .reveal {');
    expect(index).toContain('html.js .reveal { transition: none; }');
    expect(index).not.toContain('.reveal:not(.is-visible) .round-divider');
    expect(index).toContain('@media (prefers-reduced-motion: reduce)');
    expect(index).toContain('--color-jungle-950: #002018;');
    expect(index).toContain('--accent-secondary: var(--color-turquoise-400);');
    expect(index).toContain('padding: .35rem 0 .55rem;');
    expect(index).toContain('box-shadow: 0 0 0 100vmax');
    expect(index).toContain('min-width: 5.15rem;');
    expect(index).toContain('Ver datos');
    expect(index).toContain('class="match-card__actions"');
    expect(index).toContain('.match-card__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;');
    expect(index).toContain('href="partido-1-2026-06-11-mexico-vs-sudafrica.html">Ver datos</a>');
    expect(index).toContain('.match-card__cta--disabled, .match-card__cta--disabled:hover { opacity: .54; cursor: not-allowed; transform: none; box-shadow: none; }');
    expect(index).toContain('class="pgs-pill pgs-pill--inline"');
    expect(index).toContain('letter-spacing: normal; text-align: left; text-transform: none;');
    expect(index).toContain('.pgs-pill--inline { min-height: 0; margin-left: auto;');
  });

  it('groups late UTC kickoffs under the Mexico City local date shown on the card', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE, LATE_LOCAL_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    const june11Section = index.slice(index.indexOf('id="fecha-2026-06-11"'), index.indexOf('</section>', index.indexOf('id="fecha-2026-06-11"')));
    expect(june11Section).toContain('Corea del Sur');
    expect(index).not.toContain('id="fecha-2026-06-12"');
  });

  it('renders public final score above PGS on cards and next to PGS on match pages', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [{
        ...SAMPLE_FIXTURE,
        status: 'resolved',
        finalHomeScore: 2,
        finalAwayScore: 0,
        finalScoreSourceName: 'FIFA.com',
        finalScoreSourceUrl: 'https://www.fifa.com/example',
      }],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(index).toContain('class="score-cluster score-cluster--card"');
    expect(index).toContain('class="final-score-pill"');
    expect(index).toContain('<span class="final-score-pill__label">Final:</span>');
    expect(match).toContain('class="score-cluster score-cluster--inline"');
    expect(match).toContain('Marcador final de fuente pública. Fuente: FIFA.com.');
  });

  it('uses the latest generated final prediction as the PGS score on cards and match pages', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 1,
        homeTeam: 'México',
        awayTeam: 'Sudáfrica',
        status: 'generated',
        lastPass: 'lock',
        contentJson: {
          h1_title: 'Pronóstico México vs Sudáfrica',
          meta_description: 'Pronóstico actualizado.',
          analisis_tactico_html: '<h2>Pronóstico</h2><p>Predicción final: México 3-1 Sudáfrica.</p>',
        },
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(index).toContain('Resultado PredictaGoal Score basado en los datos más recientes: México 3 - Sudáfrica 1');
    expect(match).toContain('Resultado PredictaGoal Score basado en los datos más recientes: México 3 - Sudáfrica 1');
  });

  it('uses generated "nuestra predicción es" score wording as the PGS score', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 1,
        homeTeam: 'México',
        awayTeam: 'Sudáfrica',
        status: 'generated',
        lastPass: 'lock',
        contentJson: {
          h1_title: 'Pronóstico México vs Sudáfrica',
          meta_description: 'Pronóstico actualizado.',
          analisis_tactico_html: '<h2>Pronóstico para este partido</h2><p>Nuestra predicción es un 4-2 a favor de México.</p>',
        },
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(match).toContain('Resultado PredictaGoal Score basado en los datos más recientes: México 4 - Sudáfrica 2');
  });

  it('prefers structured pronostico_quiniela as the generated PGS score', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 1,
        homeTeam: 'México',
        awayTeam: 'Sudáfrica',
        status: 'generated',
        lastPass: 'lock',
        contentJson: {
          h1_title: 'Pronóstico México vs Sudáfrica',
          meta_description: 'Pronóstico actualizado.',
          pronostico_quiniela: 'México 1-0 Sudáfrica',
          analisis_tactico_html: '<h2>Pronóstico</h2><p>Predicción final: México 3-1 Sudáfrica.</p>',
        },
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(match).toContain('Resultado PredictaGoal Score basado en los datos más recientes: México 1 - Sudáfrica 0');
    expect(match).not.toContain('Resultado PredictaGoal Score basado en los datos más recientes: México 3 - Sudáfrica 1');
  });

  it('rejects generated PGS scores that contradict clear odds and editorial favorite signals', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [TUNISIA_NETHERLANDS_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 36,
        homeTeam: 'Túnez',
        awayTeam: 'Países Bajos',
        status: 'generated',
        lastPass: 'lock',
        contentJson: {
          h1_title: 'Pronóstico Túnez vs Países Bajos',
          meta_description: 'Pronóstico actualizado.',
          pronostico_quiniela: 'Túnez 3-0 Países Bajos',
          analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Países Bajos es favorito claro por momios, calidad y profundidad. Predicción final: Túnez 3-0 Países Bajos.</p>',
        },
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const match = readFileSync(join(outDir, 'fixture-36-2026-06-25-tunez-vs-paises-bajos.html'), 'utf-8');
    expect(match).not.toContain('Resultado PredictaGoal Score basado en los datos más recientes: Túnez 3 - Países Bajos 0');
    expect(match).toContain('Resultado PredictaGoal Score basado en los datos más recientes: Túnez 0 - Países Bajos 2');
  });

  it('does not render placeholder affiliate URLs from generated content or injection config', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 1,
        homeTeam: 'México',
        awayTeam: 'Sudáfrica',
        status: 'generated',
        lastPass: 'lock',
        contentJson: {
          h1_title: 'Pronóstico México vs Sudáfrica',
          meta_description: 'Pronóstico actualizado.',
          analisis_tactico_html: '<h2><a href="https://www.predictagol.com/placeholder-not-configured">Pronóstico</a></h2><p>Los momios son recientes.</p>',
        },
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: {
        caliente: 'https://www.predictagol.com/placeholder-not-configured',
        bet365: 'https://www.predictagol.com/placeholder-not-configured',
        skimlinks: '',
      },
    });

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(match).toContain('<h2>Pronóstico</h2>');
    expect(match).not.toContain('placeholder-not-configured');
  });

  it('removes preliminary freshness labels from initial sections once generated API-backed content exists', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [{
        ...SAMPLE_ARTICLE,
        fixtureId: 1,
        homeTeam: 'México',
        awayTeam: 'Sudáfrica',
        status: 'generated',
        lastPass: 'lock',
      }],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(match).not.toContain('Veredicto preliminar');
    expect(match).not.toContain('Versión inicial');
  });

  it('renders Spanish country names, flags, and exactly 48 non-placeholder teams', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [
        SAMPLE_FIXTURE,
        {
          fixtureId: 99,
          matchNumber: 99,
          homeTeam: '1A',
          awayTeam: '#A/B/C/D/F',
          kickoffUtc: '2026-07-01T18:00:00Z',
          stage: 'knockout',
          status: 'tbd',
        },
      ],
      teams: WORLD_CUP_TEAMS.map((team) => ({ name: team.displayName, code: team.code })),
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    expect(index).toContain('https://flagcdn.com/24x18/mx.png');
    expect(index).toContain('México');
    expect(index).toContain('https://flagcdn.com/24x18/za.png');
    expect(index).toContain('Sudáfrica');
    expect(index).not.toContain('South Africa');
    expect(index).toContain('data-team-codes="MEX RSA"');
    expect(index).toContain('Mostrando partidos de ');
    const placeholderKnockoutCard = index.slice(index.indexOf('<h3><span class="team-name"><span class="team-name__label">1A</span>'), index.indexOf('</article>', index.indexOf('<h3><span class="team-name"><span class="team-name__label">1A</span>')) + '</article>'.length);
    expect(placeholderKnockoutCard).toContain('<span class="match-card__cta match-card__cta--disabled" aria-disabled="true">Ver datos</span>');
    expect(placeholderKnockoutCard).not.toContain('href=');
    const teamsSection = index.slice(index.indexOf('id="equipos"'), index.indexOf('</section>', index.indexOf('id="equipos"')));
    expect(index).not.toContain('data-team-code="">1A');
    expect(teamsSection).not.toContain('#A/B/C/D/F</span>');
    expect((teamsSection.match(/class="team-pill"/g) || []).length).toBe(48);
  });

  it('does not inject affiliate links into placeholder section text', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      fixtures: [SAMPLE_FIXTURE],
      articles: [],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(match).toContain('Análisis para apostar');
    expect(match).not.toContain('<a href="https://caliente.mx/ref/TEST" rel="sponsored">apostar</a>');
  });

  it('buildSite returns array of { fixtureId, articleType, slug } objects', () => {
    const outDir = join(tmpDir, 'dist');
    const result = buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      fixtureId: 1,
      articleType: 'match_page',
      slug: 'fixture-1-fecha-por-confirmar-mexico-vs-alemania',
    });
  });

  it('buildComingSoonSite writes a branded landing page without match pages', () => {
    const outDir = join(tmpDir, 'dist');
    buildComingSoonSite({
      siteBaseUrl: 'https://predictagol.com/',
      outputDir: outDir,
    });

    const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
    const outputFiles = readdirSync(outDir).sort();

    expect(outputFiles).toEqual(['index.html', 'llms.txt', 'privacy.html', 'public', 'robots.txt', 'sitemap.xml', 'staticwebapp.config.json', 'terms.html']);
    expect(existsSync(join(outDir, 'public', 'PredictaGol_Logo.png'))).toBe(true);
    expect(existsSync(join(outDir, 'public', 'fonts', 'PredictaGol-NormalRegular.ttf'))).toBe(true);
    expect(index).toContain('Próximamente');
    expect(index).toContain('Predictagol · Mundial 2026');
    expect(index).toContain('src="public/PredictaGol_Logo.png"');
    expect(index).toContain('class="site-logo__text brand-wordmark">PREDICTAGOL</span>');
    expect(index).toContain('<link rel="canonical" href="https://predictagol.com/">');
    expect(index).toContain('--color-navy-950: #020f2a;');
    expect(index).toContain('.coming-soon-hero');
    expect(index).toContain('.coming-soon-hero h1 { max-width: 100%; margin: .1em auto .22em; font-size: clamp(2.6rem, 8.4vw, 7rem);');
    expect(index).not.toContain('class="coming-soon-hero__badges"');
    expect(index).not.toContain('<span>Calendario</span>');
    expect(index).not.toContain('<span>Pronósticos</span>');
    expect(index).not.toContain('<span>Quiniela</span>');
    expect(index).not.toContain('class="match-card');
    expect(index).not.toContain('href="index.html#partidos"');
    expect(index).not.toContain('href="index.html#equipos"');

    const sitemap = readFileSync(join(outDir, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain('<loc>https://predictagol.com/</loc>');
    expect(sitemap).toContain('<loc>https://predictagol.com/privacy.html</loc>');
    expect(sitemap).toContain('<loc>https://predictagol.com/terms.html</loc>');

    const privacy = readFileSync(join(outDir, 'privacy.html'), 'utf-8');
    const terms = readFileSync(join(outDir, 'terms.html'), 'utf-8');
    expect(privacy).toContain('Aviso de privacidad');
    expect(terms).toContain('Términos de uso');
    expect(terms).toContain('Predictagol no es una casa de apuestas');

    expect(index).toContain('<meta property="og:title"');
    expect(index).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(index).toContain('lang="es-MX"');

    const robots = readFileSync(join(outDir, 'robots.txt'), 'utf-8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain('User-agent: ClaudeBot');
    expect(robots).toContain('Sitemap: https://predictagol.com/sitemap.xml');

    const llms = readFileSync(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# Predictagol');
    expect(llms).toContain('https://predictagol.com');
  });

  it('buildComingSoonSite can write the landing page under /comingsoon', () => {
    const outDir = join(tmpDir, 'dist');
    buildComingSoonSite({
      siteBaseUrl: 'https://blue-plant-0287c640f.7.azurestaticapps.net',
      outputDir: outDir,
      basePath: '/comingsoon',
    });

    const index = readFileSync(join(outDir, 'comingsoon', 'index.html'), 'utf-8');
    const sitemap = readFileSync(join(outDir, 'comingsoon', 'sitemap.xml'), 'utf-8');

    expect(existsSync(join(outDir, 'index.html'))).toBe(false);
    expect(existsSync(join(outDir, 'comingsoon', 'public', 'PredictaGol_Logo.png'))).toBe(true);
    expect(existsSync(join(outDir, 'comingsoon', 'public', 'fonts', 'PredictaGol-NormalRegular.ttf'))).toBe(true);
    expect(existsSync(join(outDir, 'comingsoon', 'privacy.html'))).toBe(true);
    expect(existsSync(join(outDir, 'comingsoon', 'terms.html'))).toBe(true);
    expect(index).toContain('Próximamente');
    expect(index).toContain('src="public/PredictaGol_Logo.png"');
    expect(index).toContain('<link rel="canonical" href="https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/">');
    expect(sitemap).toContain('<loc>https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/</loc>');
    expect(sitemap).toContain('<loc>https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/privacy.html</loc>');
    expect(sitemap).toContain('<loc>https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/terms.html</loc>');
  });
});
