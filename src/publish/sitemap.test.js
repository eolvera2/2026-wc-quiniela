import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { generateSitemap, pingIndexNow } from './sitemap.js';

describe('publish/sitemap', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateSitemap', () => {
    it('generates valid XML sitemap from article URLs', () => {
      const articles = [
        { url: 'https://site.com/pronosticos-mexico-vs-alemania/', lastmod: '2026-06-01' },
        { url: 'https://site.com/pronosticos-brazil-vs-japan/', lastmod: '2026-06-02' },
      ];

      const xml = generateSitemap(articles);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain('<loc>https://site.com/pronosticos-mexico-vs-alemania/</loc>');
      expect(xml).toContain('<lastmod>2026-06-01</lastmod>');
      expect(xml).toContain('<loc>https://site.com/pronosticos-brazil-vs-japan/</loc>');
      expect(xml).toContain('</urlset>');
    });

    it('returns a valid sitemap with zero articles', () => {
      const xml = generateSitemap([]);
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
    });

    it('escapes special XML characters in URLs', () => {
      const articles = [{ url: 'https://site.com/a&b/', lastmod: '2026-06-01' }];
      const xml = generateSitemap(articles);
      expect(xml).toContain('&amp;');
      expect(xml).not.toContain('&b');
    });
  });

  describe('pingIndexNow', () => {
    it('sends URLs to IndexNow API', async () => {
      nock('https://api.indexnow.org')
        .post('/indexnow')
        .reply(200, 'OK');

      const result = await pingIndexNow({
        host: 'site.com',
        key: 'indexnow-key-123',
        urls: ['https://site.com/page-1/', 'https://site.com/page-2/'],
      });

      expect(result.success).toBe(true);
    });

    it('handles IndexNow API failure gracefully (non-critical)', async () => {
      nock('https://api.indexnow.org')
        .post('/indexnow')
        .reply(500, 'Server Error');

      const result = await pingIndexNow({
        host: 'site.com',
        key: 'indexnow-key-123',
        urls: ['https://site.com/page-1/'],
      });

      // Should not throw — indexing is non-critical
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('skips ping when no URLs provided', async () => {
      const result = await pingIndexNow({
        host: 'site.com',
        key: 'key',
        urls: [],
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });
  });
});
