import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import nock from 'nock';
import { publishArticle } from './wordpress.js';

const WP_BASE = 'https://test-site.com';
const WP_PASSWORD = 'test-app-password';

const ARTICLE_DATA = {
  fixtureId: 1,
  articleType: 'pronostico_momios',
  contentJson: {
    h1_title: 'Pronósticos y momios México vs Alemania',
    meta_description: 'Análisis táctico y momios para México vs Alemania.',
    analisis_tactico_html: '<h2>¿Cuáles son los momios?</h2><p>Los momios favorecen a México con 2.10.</p>',
    pronostico_quiniela: 'México 2-1',
    url_slug: 'pronosticos-momios-mexico-vs-alemania',
    puntos_clave: ['Pick 1', 'Pick 2'],
  },
  wpPostId: null, // new post
};

const AFFILIATE_URLS = {
  caliente: 'https://caliente.mx/ref/PROD',
  bet365: 'https://bet365.mx/ref/PROD',
  skimlinks: 'https://go.skimresources.com/?id=PROD&url=',
};

describe('publish/wordpress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    nock.cleanAll();
    vi.useRealTimers();
  });

  it('creates a new post when wpPostId is null', async () => {
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts')
      .reply(201, { id: 42, link: 'https://test-site.com/pronosticos-momios-mexico-vs-alemania/' });

    const result = await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(result.wpPostId).toBe(42);
    expect(result.action).toBe('created');
  });

  it('updates an existing post when wpPostId is set', async () => {
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts/42')
      .reply(200, { id: 42, link: 'https://test-site.com/pronosticos-momios-mexico-vs-alemania/' });

    const articleWithId = { ...ARTICLE_DATA, wpPostId: 42 };

    const result = await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: articleWithId,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(result.wpPostId).toBe(42);
    expect(result.action).toBe('updated');
  });

  it('injects affiliate links into the published content', async () => {
    let postedBody;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts', (body) => { postedBody = body; return true; })
      .reply(201, { id: 43, link: 'https://test-site.com/slug/' });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    // The content should have affiliate links injected
    expect(postedBody.content).toContain('caliente.mx/ref/PROD');
    expect(postedBody.content).toContain('rel="sponsored"');
  });

  it('includes disclaimer footer in published content', async () => {
    let postedBody;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts', (body) => { postedBody = body; return true; })
      .reply(201, { id: 44, link: 'https://test-site.com/slug/' });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(postedBody.content).toContain('entretenimiento e información únicamente');
    expect(postedBody.content).toContain('1-800-697-3735');
  });

  it('sends correct auth header (Basic with app password)', async () => {
    let authHeader;
    nock(WP_BASE)
      .post('/wp-json/wp/v2/posts')
      .reply(function () {
        authHeader = this.req.headers.authorization;
        return [201, { id: 45, link: 'https://test-site.com/slug/' }];
      });

    await publishArticle({
      wpBaseUrl: WP_BASE,
      wpAppPassword: WP_PASSWORD,
      article: ARTICLE_DATA,
      affiliateUrls: AFFILIATE_URLS,
    });

    expect(authHeader).toMatch(/^Basic /);
  });

  it('throws on WordPress API error', async () => {
    nock(WP_BASE).post('/wp-json/wp/v2/posts').reply(403, { message: 'Forbidden' });

    await expect(
      publishArticle({
        wpBaseUrl: WP_BASE,
        wpAppPassword: WP_PASSWORD,
        article: ARTICLE_DATA,
        affiliateUrls: AFFILIATE_URLS,
      })
    ).rejects.toThrow(/403/);
  });
});
