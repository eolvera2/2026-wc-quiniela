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
    expect(index).toContain('id="fecha-2026-06-11" class="calendar-day" data-theme="jungle"');
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
    expect(index).toContain('class="pgs-pill pgs-pill--inline"');
    expect(index).toContain('Resultado PredictaGoal Score basado en los datos más recientes: México # - Sudáfrica #');
    expect(index).toContain('https://flagcdn.com/24x18/mx.png');
    expect(index).toContain('https://flagcdn.com/24x18/za.png');
    expect(index).toContain('<span class="pgs-pill__score">#</span>');

    const match = readFileSync(join(outDir, 'partido-1-2026-06-11-mexico-vs-sudafrica.html'), 'utf-8');
    expect(existsSync(join(outDir, 'fixture-1-2026-06-11-mexico-vs-sudafrica.html'))).toBe(true);
    expect(match).toContain('"@type":"SportsEvent"');
    expect(match).toContain('class="match-hero hero-match reveal theme-section" data-theme="jungle"');
    expect(match).toContain('src="public/PredictaGol_Logo.png"');
    expect(match).toContain('class="site-logo__text brand-wordmark">PREDICTAGOL</span>');
    expect(match).toContain('<strong class="brand-wordmark">PREDICTAGOL</strong>');
    expect(match).toContain('.hero-match { position: relative; padding: clamp(1rem, 2.2vw, 2rem) 0 clamp(1.25rem, 2.6vw, 2.4rem);');
    expect(match).toContain('.hero-match__inner { position: relative; z-index: 1; padding: clamp(1.35rem, 3vw, 2.8rem);');
    expect(match).toContain('.team-name { display: inline-flex; align-items: center; gap: .35rem; vertical-align: middle; }');
    expect(match).toContain('.match-hero .eyebrow { margin: 0 0 .35rem; }');
    expect(match).toContain('.match-hero h1 { display: flex; flex-wrap: wrap; align-items: center; gap: .18em; margin: .25rem 0 .55rem; }');
    expect(match).toContain('.match-hero h1 .versus { display: inline-flex; align-items: center; align-self: center; font-size: .58em; line-height: 1; letter-spacing: -.02em; }');
    expect(match).toContain('.match-hero h1 .team-flag { width: clamp(2rem, 3.7vw, 3.9rem); height: auto; border-radius: .22rem; }');
    expect(match).toContain('.team-chip { display: inline-flex; align-items: center;');
    expect(match).toContain('.team-chip .team-flag { width: 1.7rem; height: 1.275rem; }');
    expect(match).toContain('.match-hero + .team-summaries { margin-top: var(--space-m); }');
    expect(match).toContain('.team-summaries__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-xs); margin: 0 0 var(--space-s); }');
    expect(match).toContain('.team-summaries h2 { margin: 0; }');
    expect(match).toContain('PGS®:');
    expect(match).toContain('Resultado PredictaGoal Score basado en los datos más recientes');
    expect(match).toContain('México 2 - Sudáfrica 1');
    expect(match).toContain('.pgs-pill { position: relative; display: inline-flex; align-items: center;');
    expect(match).toContain('background: linear-gradient(135deg, var(--color-gold-400), var(--color-jaguar-500));');
    expect(match).toContain('.pgs-pill:hover::after, .pgs-pill:focus-visible::after { opacity: 1; transform: translateY(0); }');
    expect(match).toContain("const revealItems = [...document.querySelectorAll('.reveal')];");
    expect(match).toContain('Pronóstico y momios');
    expect(match).toContain('Este análisis preliminar proviene de múltiples fuentes de análisis deportivo');
    expect(match).toContain('Análisis preliminar');
    expect(match).toContain('Versión inicial. Se actualizará con datos actuales cerca del partido.');
    expect(match).toContain('México con ventaja inicial');
    expect(match).toContain('Lectura preliminar');
    expect(match).toContain('Ángulos educativos iniciales');
    expect(match).toContain('Los datos definitivos serán actualizados más adelante');
    expect(match).toContain('cambios en los momios para triunfo de México, empate o triunfo de Sudáfrica');
    expect(match).not.toContain('movimiento del 1X2');
    expect(match).not.toMatch(/API|1000|1,000|llamadas API|fuentes públicas|agregadores de momios|T-72h|T-48h/);
    expect(match).toContain('regresa al Mundial por primera vez desde 2010');
    expect(match).toContain('Oswin Appollis');
    expect(match).toContain('Raúl Jiménez como referencia ofensiva principal');
    expect(match).toContain('Guillermo Martínez y otros atacantes aparecen como alternativas');
    expect(match).not.toContain('Santiago Giménez');
    expect(match).not.toContain('Próximamente: actualizaremos esta sección');
    expect(match).toContain('Tu predicción');
    expect(match).toContain('data-fixture-id="1"');
    expect(match).toContain('data-pick="home"');
    expect(match).toContain('data-pick="draw"');
    expect(match).toContain('data-pick="away"');
    expect(match).toContain('aria-pressed="false"');
    expect(match).toContain('se guarda solo en este navegador');
    expect(match).toContain('class="prediction-status" aria-live="polite"');
    expect(match).toContain('predictagol:pick:');
    expect(match).toContain("window.localStorage.setItem(key, value);");
    expect(match).toContain('.prediction-options button[aria-pressed="true"]');
    expect(match).not.toContain('Todos los enlaces de afiliados están marcados con rel="sponsored".');
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

    expect(outputFiles).toEqual(['index.html', 'public', 'sitemap.xml', 'staticwebapp.config.json']);
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
    expect(index).toContain('Próximamente');
    expect(index).toContain('src="public/PredictaGol_Logo.png"');
    expect(index).toContain('<link rel="canonical" href="https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/">');
    expect(sitemap).toContain('<loc>https://blue-plant-0287c640f.7.azurestaticapps.net/comingsoon/</loc>');
  });
});
