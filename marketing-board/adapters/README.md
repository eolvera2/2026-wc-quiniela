# PredictaGol Agent Board publish adapters

`index.js` exports the server-facing named API:

```js
import { publishCard } from './adapters/index.js';
```

`publishCard(card)` parses `card.platforms_json`, fans out to the requested platform adapters in parallel, and returns one structured result per platform.

## Card payload shape

Each adapter reads `card.payload_json` as JSON:

```js
{
  caption: 'Spanish caption with hashtags',
  alt_text: 'Spanish alt text',
  hashtags: ['#PredictaGol', '#Mundial2026', '#ElTri'],
  assets: {
    '1080x1920': 'local-or-staged-path.png',
    '1080x1350': 'local-or-staged-path.png',
    '1080x1080': 'local-or-staged-path.png'
  },
  video: { path: 'short.mp4', duration_seconds: 22 },
  shorts_title: 'Title <= 100 chars #Shorts',
  public_assets: {
    instagram: 'https://predictagol.com/social/_assets/c_xxxx-ig.png',
    threads: 'https://predictagol.com/social/_assets/c_xxxx-square.png',
    tiktok: 'https://predictagol.com/social/_assets/c_xxxx-short.mp4'
  }
}
```

`public_assets` is optional but needed for real Instagram, Threads, and TikTok auto publishing when assets only exist locally.

## Dry-run safety

Set `ADAPTERS_DRY_RUN=true` to force no-op publishing. If required environment variables for a platform are missing, that adapter also returns `status: 'dry_run'` with a `would_post` payload instead of making API calls. Every attempt appends a line to `marketing-board/.tokens/publish.log`.

## Platform adapters

### X (`x.js`)

Posts an X v2 user-context tweet. Uses `assets['1080x1080']`; when OAuth 1.0a media credentials are present, uploads the image first via the v1.1 media endpoint, otherwise posts text-only.

Env vars:

- `X_ACCESS_TOKEN` required for real posting
- `X_HANDLE` optional, defaults to `predictagol`
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN_SECRET` optional for media upload
- `X_MONTHLY_POST_COUNT` optional warning helper; warns above 1400 posts/month

### YouTube Shorts (`youtube.js`)

Refreshes an OAuth token, creates a resumable upload, and uploads `video.path` as a public Sports-category Short. Title comes from `shorts_title` and is forced to include `#Shorts`.

Env vars:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`

### Instagram Graph (`meta-ig.js`)

Publishes Reels when `video.path` exists; otherwise publishes a feed image using `assets['1080x1350']`. Caption includes the hashtag block.

Env vars:

- `IG_BUSINESS_ID`
- `IG_ACCESS_TOKEN`
- `IG_PUBLIC_ASSET_BASE_URL` for deriving a public URL from the local filename when `payload.public_assets.instagram` is absent

**Public URL gotcha / TODO:** Instagram Graph API requires `image_url` or `video_url` to be publicly reachable over HTTPS. For v1, Eduardo should stage generated assets to `https://predictagol.com/social/_assets/<card-file>` via the existing Azure Static Web Apps deployment, or use a free image/video host, then provide those URLs in `payload.public_assets`.

### Threads Graph (`meta-threads.js`)

Creates and publishes an image thread using `assets['1080x1080']`. Caption uses the main caption plus at most one hashtag.

Env vars:

- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`
- `THREADS_PUBLIC_ASSET_BASE_URL` for deriving a public image URL when `payload.public_assets.threads` is absent
- `THREADS_HANDLE` optional, defaults to `predictagol`

**Public URL gotcha / TODO:** Threads has the same public HTTPS asset requirement as Instagram. Recommended staging path: `https://predictagol.com/social/_assets/<card-file>` via Azure SWA.

### TikTok (`tiktok.js`)

Default mode is paste-fallback: returns `status: 'manual_required'` with caption, hashtags, video path, clipboard text, and `https://www.tiktok.com/upload?lang=es`.

Env vars:

- `FLIP_TIKTOK_AUTO=true` enables an attempted Content Posting API inbox publish
- `TIKTOK_ACCESS_TOKEN` required for auto mode
- `TIKTOK_PUBLIC_VIDEO_URL` optional if `payload.public_assets.tiktok` is absent

If auto mode fails, the adapter falls back to `manual_required`.

## Smoke test

```powershell
$env:ADAPTERS_DRY_RUN='true'
node marketing-board/adapters/smoke.js
```

Expected: five results, with X/YouTube/Instagram/Threads in `dry_run` and TikTok in `manual_required` unless `FLIP_TIKTOK_AUTO=true`.

