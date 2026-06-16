import { asErrorMessage, logPublish, requestJson } from './lib/http.js';
import { dryRunReason, readPlatformEnv } from './lib/tokens.js';

const PLATFORM = 'instagram';
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function publish(card) {
  try {
    const payload = parsePayload(card);
    const isReel = Boolean(payload.video?.path);
    const assetPath = isReel ? payload.video.path : payload.assets?.['1080x1350'];
    const caption = formatCaption(payload);
    const env = readPlatformEnv(PLATFORM, ['IG_BUSINESS_ID', 'IG_ACCESS_TOKEN'], ['IG_PUBLIC_ASSET_BASE_URL']);
    const publicUrl = publicAssetUrl(payload, assetPath, env.values.IG_PUBLIC_ASSET_BASE_URL);

    if (env.dryRun || !publicUrl) {
      const reason = !publicUrl ? 'missing public asset URL for Instagram Graph API' : dryRunReason(env);
      const result = { status: 'dry_run', permalink: null, would_post: { media_type: isReel ? 'REELS' : 'IMAGE', caption, asset_path: assetPath, public_url: publicUrl, reason } };
      await logPublish(card.id, PLATFORM, result.status, reason);
      return result;
    }

    const createParams = new URLSearchParams({ caption, access_token: env.values.IG_ACCESS_TOKEN });
    if (isReel) {
      createParams.set('media_type', 'REELS');
      createParams.set('video_url', publicUrl);
    } else {
      createParams.set('image_url', publicUrl);
    }

    const { body: createBody } = await requestJson(`${GRAPH_BASE}/${env.values.IG_BUSINESS_ID}/media?${createParams}`, { method: 'POST' });
    const creationId = createBody?.id;
    if (!creationId) throw new Error('Instagram media creation did not return id');

    const publishParams = new URLSearchParams({ creation_id: creationId, access_token: env.values.IG_ACCESS_TOKEN });
    const { body: publishBody } = await requestJson(`${GRAPH_BASE}/${env.values.IG_BUSINESS_ID}/media_publish?${publishParams}`, { method: 'POST' });
    const mediaId = publishBody?.id;
    const permalink = await fetchPermalink(mediaId, env.values.IG_ACCESS_TOKEN);
    const result = { status: 'posted', permalink, meta: { creation_id: creationId, media_id: mediaId } };
    await logPublish(card.id, PLATFORM, result.status, permalink || mediaId || 'posted');
    return result;
  } catch (error) {
    const message = asErrorMessage(error);
    await logPublish(card?.id, PLATFORM, 'failed', message);
    return { status: 'failed', permalink: null, error: message };
  }
}

async function fetchPermalink(mediaId, accessToken) {
  if (!mediaId) return null;
  const params = new URLSearchParams({ fields: 'permalink,shortcode', access_token: accessToken });
  const { body } = await requestJson(`${GRAPH_BASE}/${mediaId}?${params}`, { method: 'GET', retries: 1 });
  if (body?.permalink) return body.permalink;
  if (body?.shortcode) return `https://www.instagram.com/p/${body.shortcode}/`;
  return null;
}

function parsePayload(card) {
  return JSON.parse(card?.payload_json || '{}');
}

function formatCaption(payload) {
  const tags = uniqueTags(payload.hashtags);
  return [payload.caption || '', tags.join(' ')].filter(Boolean).join('\n\n').trim();
}

function uniqueTags(tags = []) {
  return [...new Set(tags.filter(Boolean).map((tag) => String(tag).trim()).filter(Boolean))];
}

function publicAssetUrl(payload, assetPath, baseUrl) {
  const mapped = payload.public_assets?.[assetPath] || payload.public_assets?.instagram;
  if (mapped) return mapped;
  if (!baseUrl || !assetPath) return null;
  return `${baseUrl.replace(/\/$/, '')}/${assetPath.split(/[\\/]/).pop()}`;
}

