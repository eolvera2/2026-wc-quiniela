import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { asErrorMessage, logPublish, requestJson } from './lib/http.js';
import { dryRunReason, readPlatformEnv } from './lib/tokens.js';

const PLATFORM = 'x';
const TWEET_URL = 'https://api.x.com/2/tweets';
const MEDIA_URL = 'https://upload.twitter.com/1.1/media/upload.json';

export async function publish(card) {
  try {
    const payload = parsePayload(card);
    const text = formatXText(payload);
    const imagePath = payload.assets?.['1080x1080'] || null;
    const env = readPlatformEnv(PLATFORM, ['X_ACCESS_TOKEN'], ['X_HANDLE', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN_SECRET']);
    warnIfNearFreeTierLimit(card);

    if (env.dryRun) {
      const result = { status: 'dry_run', permalink: null, would_post: { text, image_path: imagePath, reason: dryRunReason(env) } };
      await logPublish(card.id, PLATFORM, result.status, result.would_post.reason);
      return result;
    }

    let mediaIds = [];
    if (imagePath && hasOAuth1MediaCreds(env.values)) {
      const media = await uploadMedia(imagePath, env.values);
      if (media?.media_id_string) mediaIds = [media.media_id_string];
    }

    const body = { text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };

    const { body: responseBody } = await requestJson(TWEET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.values.X_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const tweetId = responseBody?.data?.id;
    const handle = env.values.X_HANDLE || 'predictagol';
    const permalink = tweetId ? `https://x.com/${handle}/status/${tweetId}` : null;
    const result = { status: 'posted', permalink, meta: { tweet_id: tweetId, media_ids: mediaIds } };
    await logPublish(card.id, PLATFORM, result.status, permalink || tweetId || 'posted');
    return result;
  } catch (error) {
    const message = asErrorMessage(error);
    await logPublish(card?.id, PLATFORM, 'failed', message);
    return { status: 'failed', permalink: null, error: message };
  }
}

function parsePayload(card) {
  return JSON.parse(card?.payload_json || '{}');
}

function formatXText(payload) {
  const tags = uniqueTags(payload.hashtags).slice(0, 2);
  const suffix = tags.length ? ` ${tags.join(' ')}` : '';
  const maxCaption = 280 - suffix.length;
  return `${truncate(payload.caption || '', maxCaption)}${suffix}`.trim();
}

function uniqueTags(tags = []) {
  return [...new Set(tags.filter(Boolean).map((tag) => String(tag).trim()).filter(Boolean))];
}

function truncate(value, maxLength) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function hasOAuth1MediaCreds(values) {
  return Boolean(values.X_API_KEY && values.X_API_SECRET && values.X_ACCESS_TOKEN && values.X_ACCESS_TOKEN_SECRET);
}

async function uploadMedia(imagePath, values) {
  const bytes = await readFile(imagePath);
  const form = new FormData();
  form.append('media', new Blob([bytes]), 'image.png');

  const { body } = await requestJson(MEDIA_URL, {
    method: 'POST',
    headers: { Authorization: oauth1Header('POST', MEDIA_URL, values) },
    body: form,
  });
  return body;
}

function oauth1Header(method, url, values) {
  const oauth = {
    oauth_consumer_key: values.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: values.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const baseParams = Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&');
  const base = [method.toUpperCase(), encode(url), encode(baseParams)].join('&');
  const signingKey = `${encode(values.X_API_SECRET)}&${encode(values.X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return `OAuth ${Object.entries(oauth).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(', ')}`;
}

function encode(value) {
  return encodeURIComponent(value).replace(/[!*()']/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function warnIfNearFreeTierLimit(card) {
  const count = Number(card?.monthly_post_count || process.env.X_MONTHLY_POST_COUNT || 0);
  if (count > 1400) console.warn(`[adapters:x] X free-tier monthly post count is high: ${count}/1500`);
}
