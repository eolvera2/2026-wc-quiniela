/**
 * Sitemap generator + IndexNow ping.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" sitemap.js
 *
 * Generates an XML sitemap from published article URLs.
 * Pings IndexNow for faster indexing (non-critical — failures are swallowed).
 */

/**
 * Generates a valid XML sitemap string.
 * @param {Array<{ url: string, lastmod: string }>} articles
 * @returns {string} XML sitemap content
 */
export function generateSitemap(articles) {
  const urlEntries = articles
    .map((a) => `  <url>\n    <loc>${escapeXml(a.url)}</loc>\n    <lastmod>${a.lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

/**
 * Pings IndexNow with newly published/updated URLs.
 * Non-critical: failures are caught and returned, not thrown.
 *
 * @param {{ host: string, key: string, urls: string[] }} params
 * @returns {Promise<{ success: boolean, skipped?: boolean, error?: string }>}
 */
export async function pingIndexNow({ host, key, urls }) {
  if (urls.length === 0) {
    return { success: true, skipped: true };
  }

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key,
        urlList: urls,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `IndexNow HTTP ${response.status}: ${text}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
