import { injectAffiliateLinks } from './affiliateInjector.js';
import { DISCLAIMER_FOOTER } from '../generate/prompt.js';

/**
 * WordPress REST API upsert publisher.
 * Reference: docs/plan.md "Phase 4 — CMS Integration" wordpress.js
 *
 * - Creates a new post if no wp_post_id exists.
 * - Updates the existing post (same URL) if wp_post_id is present.
 * - Injects affiliate links (rel="sponsored") + disclaimer footer.
 * - Auth via WordPress Application Password (Basic auth).
 * - Throttle: caller is responsible (max 2/min per risk T3-1).
 */

/**
 * @param {{
 *   wpBaseUrl: string,
 *   wpAppPassword: string,
 *   wpUsername?: string,
 *   article: { fixtureId: number, articleType: string, contentJson: object, wpPostId: number|null },
 *   affiliateUrls: { caliente: string, bet365: string, skimlinks: string },
 * }} params
 * @returns {Promise<{ wpPostId: number, action: 'created'|'updated', link: string }>}
 */
export async function publishArticle({
  wpBaseUrl,
  wpAppPassword,
  wpUsername = 'bot',
  article,
  affiliateUrls,
}) {
  const { contentJson, wpPostId } = article;

  // Build the full HTML content
  let html = contentJson.analisis_tactico_html || '';

  // Inject affiliate links (Phase 1 module)
  html = injectAffiliateLinks(html, affiliateUrls);

  // Append disclaimer footer (always, per Legal & Compliance)
  html = html + '\n\n' + DISCLAIMER_FOOTER;

  // Prepare WordPress post body
  const postBody = {
    title: contentJson.h1_title || 'Untitled',
    slug: contentJson.url_slug || undefined,
    content: html,
    status: 'publish',
    excerpt: contentJson.meta_description || '',
    meta: {
      _yoast_wpseo_metadesc: contentJson.meta_description || '',
    },
  };

  // Determine endpoint: create vs update
  const isUpdate = wpPostId != null;
  const url = isUpdate
    ? `${wpBaseUrl}/wp-json/wp/v2/posts/${wpPostId}`
    : `${wpBaseUrl}/wp-json/wp/v2/posts`;

  // Basic auth
  const authString = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authString}`,
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WordPress API HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();

  return {
    wpPostId: result.id,
    action: isUpdate ? 'updated' : 'created',
    link: result.link || '',
  };
}
