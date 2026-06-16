import { asErrorMessage, logPublish, requestJson } from './lib/http.js';
import { dryRunReason, envFlag, readPlatformEnv } from './lib/tokens.js';

const PLATFORM = 'tiktok';
const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const UPLOAD_DEEPLINK = 'https://www.tiktok.com/upload?lang=es';

export async function publish(card) {
  try {
    const payload = parsePayload(card);
    const manualPayload = manualPostPayload(payload);

    if (!envFlag('FLIP_TIKTOK_AUTO')) {
      const result = { status: 'manual_required', permalink: null, payload: manualPayload };
      await logPublish(card.id, PLATFORM, result.status, manualPayload.deeplink);
      return result;
    }

    const env = readPlatformEnv(PLATFORM, ['TIKTOK_ACCESS_TOKEN'], ['TIKTOK_PUBLIC_VIDEO_URL']);
    const videoUrl = payload.public_assets?.[payload.video?.path] || payload.public_assets?.tiktok || env.values.TIKTOK_PUBLIC_VIDEO_URL;
    if (env.dryRun || !videoUrl) {
      const reason = !videoUrl ? 'missing public video URL for TikTok auto publish' : dryRunReason(env);
      const result = { status: 'dry_run', permalink: null, would_post: { caption: manualPayload.caption, video_path: manualPayload.asset_path, video_url: videoUrl, reason } };
      await logPublish(card.id, PLATFORM, result.status, reason);
      return result;
    }

    try {
      const { body } = await requestJson(INIT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.values.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: manualPayload.caption,
            privacy_level: 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
        }),
      });
      const publishId = body?.data?.publish_id;
      const result = { status: 'posted', permalink: null, meta: { publish_id: publishId, response: body } };
      await logPublish(card.id, PLATFORM, result.status, publishId || 'posted');
      return result;
    } catch (error) {
      const result = { status: 'manual_required', permalink: null, error: asErrorMessage(error), payload: manualPayload };
      await logPublish(card.id, PLATFORM, result.status, result.error);
      return result;
    }
  } catch (error) {
    const message = asErrorMessage(error);
    await logPublish(card?.id, PLATFORM, 'failed', message);
    return { status: 'failed', permalink: null, error: message };
  }
}

function parsePayload(card) {
  return JSON.parse(card?.payload_json || '{}');
}

function manualPostPayload(payload) {
  return {
    caption: String(payload.caption || '').trim(),
    hashtags: Array.isArray(payload.hashtags) ? payload.hashtags : [],
    asset_path: payload.video?.path || null,
    deeplink: UPLOAD_DEEPLINK,
    clipboard_text: [payload.caption || '', ...(Array.isArray(payload.hashtags) ? payload.hashtags : [])].filter(Boolean).join(' ').trim(),
  };
}
