import { readFile } from 'node:fs/promises';
import { asErrorMessage, logPublish, requestJson, requestRaw } from './lib/http.js';
import { dryRunReason, readPlatformEnv } from './lib/tokens.js';

const PLATFORM = 'youtube';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

export async function publish(card) {
  try {
    const payload = parsePayload(card);
    const videoPath = payload.video?.path || null;
    const title = ensureShortsTitle(payload.shorts_title || card?.title || 'PredictaGol #Shorts');
    const description = ensureShortsDescription(payload.caption || '');
    const env = readPlatformEnv(PLATFORM, ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']);

    if (env.dryRun || !videoPath) {
      const reason = !videoPath ? 'missing payload.video.path' : dryRunReason(env);
      const result = { status: 'dry_run', permalink: null, would_post: { title, description, video_path: videoPath, reason } };
      await logPublish(card.id, PLATFORM, result.status, reason);
      return result;
    }

    const accessToken = await refreshAccessToken(env.values);
    const metadata = {
      snippet: { title, description, categoryId: '17' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    };

    const initResponse = await requestRaw(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
      expectedStatuses: [200, 201],
    });

    const location = initResponse.headers.get('location');
    if (!location) throw new Error('YouTube upload did not return a resumable Location header');

    const bytes = await readFile(videoPath);
    const uploadResponse = await requestRaw(location, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: bytes,
      timeoutMs: 120_000,
      retries: 1,
      expectedStatuses: [200, 201],
    });
    const responseBody = await uploadResponse.json();
    const videoId = responseBody?.id;
    const permalink = videoId ? `https://www.youtube.com/shorts/${videoId}` : null;
    const result = { status: 'posted', permalink, meta: { video_id: videoId, quota_units: 1600 } };
    await logPublish(card.id, PLATFORM, result.status, permalink || videoId || 'posted');
    return result;
  } catch (error) {
    const message = asErrorMessage(error);
    await logPublish(card?.id, PLATFORM, 'failed', message);
    return { status: 'failed', permalink: null, error: message };
  }
}

async function refreshAccessToken(values) {
  const body = new URLSearchParams({
    client_id: values.YOUTUBE_CLIENT_ID,
    client_secret: values.YOUTUBE_CLIENT_SECRET,
    refresh_token: values.YOUTUBE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const { body: responseBody } = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!responseBody?.access_token) throw new Error('YouTube token refresh did not return access_token');
  return responseBody.access_token;
}

function parsePayload(card) {
  return JSON.parse(card?.payload_json || '{}');
}

function ensureShortsTitle(title) {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  const withTag = /#shorts/i.test(normalized) ? normalized : `${normalized} #Shorts`;
  return withTag.length <= 100 ? withTag : withTag.slice(0, 100).trimEnd();
}

function ensureShortsDescription(description) {
  const normalized = String(description || '').trim();
  return /#shorts/i.test(normalized) ? normalized : `${normalized}\n\n#Shorts`.trim();
}
