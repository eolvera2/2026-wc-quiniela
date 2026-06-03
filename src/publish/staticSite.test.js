import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSlug, buildSite } from './staticSite.js';

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
  });

  it('buildSite writes one HTML file per article using the slug as filename', () => {
    const outDir = join(tmpDir, 'dist');
    buildSite({
      articles: [SAMPLE_ARTICLE],
      siteBaseUrl: 'https://example.com',
      outputDir: outDir,
      affiliateUrls: AFFILIATE_URLS,
    });
    const slug = 'pronostico-momios-mexico-vs-alemania';
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
    const slug = 'pronostico-momios-mexico-vs-alemania';
    const html = readFileSync(join(outDir, `${slug}.html`), 'utf-8');
    expect(html).toContain('caliente.mx/ref/TEST');
    expect(html).toContain('rel="sponsored"');
    expect(html).toContain('entretenimiento e información únicamente');
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
    expect(index).toContain('pronostico-momios-mexico-vs-alemania.html');
    expect(index).toContain('Pronósticos y momios México vs Alemania');
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
    expect(sitemap).toContain('https://example.com/pronostico-momios-mexico-vs-alemania.html');
    expect(sitemap).toContain('<urlset');
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
      articleType: 'pronostico_momios',
      slug: 'pronostico-momios-mexico-vs-alemania',
    });
  });
});
