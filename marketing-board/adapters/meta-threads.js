import { asErrorMessage, logPublish, requestJson } from './lib/http.js';
import { dryRunReason, readPlatformEnv } from './lib/tokens.js';

const PLATFORM = 'threads';
const GRAPH_BASE = 'https://graph.threads.net/v1.0';

export async function publish(card) {
  try {
    const payload = parsePayload(card);
    const assetPath = payload.assets?.['1080x1080'] || null;
    const caption = formatCaption(payload);
    const env = readPlatformEnv(PLATFORM, ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'], ['THREADS_PUBLIC_ASSET_BASE_URL', 'THREADS_HANDLE']);
    const publicUrl = publicAssetUrl(payload, assetPath, env.values.THREADS_PUBLIC_ASSET_BASE_URL);

    if (env.dryRun || !publicUrl) {
      const reason = !publicUrl ? 'missing public asset URL for Threads Graph API' : dryRunReason(env);
      const result = { status: 'dry_run', permalink: null, would_post: { media_type: 'IMAGE', caption, asset_path: assetPath, public_url: publicUrl, reason } };
      await logPublish(card.id, PLATFORM, result.status, reason);
      return result;
    }

    const createParams = new URLSearchParams({
      media_type: 'IMAGE',
      image_url: publicUrl,
      text: caption,
      access_token: env.values.THREADS_ACCESS_TOKEN,
    });
    const { body: createBody } = await requestJson(`${GRAPH_BASE}/${env.values.THREADS_USER_ID}/threads?${createParams}`, { method: 'POST' });
    const creationId = createBody?.id;
    if (!creationId) throw new Error('Threads media creation did not return id');

    const publishParams = new URLSearchParams({ creation_id: creationId, access_token: env.values.THREADS_ACCESS_TOKEN });
    const { body: publishBody } = await requestJson(`${GRAPH_BASE}/${env.values.THREADS_USER_ID}/threads_publish?${publishParams}`, { method: 'POST' });
    const postId = publishBody?.id;
    const permalink = await fetchPermalink(postId, env.values.THREADS_ACCESS_TOKEN, env.values.THREADS_HANDLE || 'predictagol');
    const result = { status: 'posted', permalink, meta: { creation_id: creationId, post_id: postId } };
    await logPublish(card.id, PLATFORM, result.status, permalink || postId || 'posted');
    return result;
  } catch (error) {
    const message = asErrorMessage(error);
    await logPublish(card?.id, PLATFORM, 'failed', message);
    return { status: 'failed', permalink: null, error: message };
  }
}

async function fetchPermalink(postId, accessToken, handle) {
  if (!postId) return null;
  const params = new URLSearchParams({ fields: 'permalink,shortcode', access_token: accessToken });
  const { body } = await requestJson(`${GRAPH_BASE}/${postId}?${params}`, { method: 'GET', retries: 1 });
  if (body?.permalink) return body.permalink;
  if (body?.shortcode) return `https://www.threads.net/@${handle}/post/${body.shortcode}`;
  return null;
}

function parsePayload(card) {
  return JSON.parse(card?.payload_json || '{}');
}

function formatCaption(payload) {
  const caption = String(payload.caption || '').trim();
  const tag = uniqueTags(payload.hashtags)[0];
  return [caption, tag].filter(Boolean).join(' ').trim();
}

function uniqueTags(tags = []) {
  return [...new Set(tags.filter(Boolean).map((tag) => String(tag).trim()).filter(Boolean))];
}

function publicAssetUrl(payload, assetPath, baseUrl) {
  const mapped = payload.public_assets?.[assetPath] || payload.public_assets?.threads;
  if (mapped) return mapped;
  if (!baseUrl || !assetPath) return null;
  return `${baseUrl.replace(/\/$/, '')}/${assetPath.split(/[\\/]/).pop()}`;
}

