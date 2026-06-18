# PredictaGol Agent Board

Express + SQLite backend for the marketing kanban board.

The daily workflow is optimized for the current low-effort social plan:

- Active daily channels: **Instagram, X, and Threads**.
- TikTok and YouTube are optional/future channels, not default daily tasks.
- Facebook is intentionally not generated as a daily posting target.
- Cards in **To Be Posted** include schedule windows, paste-ready copy, platform tabs, assets, and manual posted confirmation.

## Instagram Safe Mode

Instagram is paused while `@predictagol` is under account review. By default, `INSTAGRAM_SAFE_MODE` is treated as paused, so generated daily cards continue for X/Threads but do not target Instagram. Set `INSTAGRAM_SAFE_MODE=active` only after the account is recovered and the restart checklist below is complete.

While paused:

1. Do not publish, copy, open, or mark Instagram cards as posted.
2. Continue X and Threads tasks normally.
3. Preserve Instagram captions/assets as evidence or drafts only.
4. Do not create replacement Instagram accounts while escalation is pending.

### Appeal/escalation checklist

1. Screenshot the disabled-account screen, especially if it says "You cannot request another review of this decision."
2. Check the account email and spam/junk folders for Instagram/Meta messages. If one email has a reply or verification path, use that thread.
3. Try the in-app path once: log in, follow any visible "Learn more", "Disagree with decision", "Request review", or "Submit appeal" flow. If it says no more reviews are available, stop and preserve the screenshot.
4. Try the official Instagram Help Center disabled/deactivated-account path from a clean browser session. If it redirects or blocks another review, document that result.
5. If PredictaGol is linked to Meta Business Suite, Business Support, Account Quality, or Meta Verified support, open one support request for a disabled Instagram account.
6. Use concise language: original Spanish soccer commentary, manually published by the owner, no bots, no paid picks, no prizes, no betting sales, no impersonation.
7. Wait after one escalation. Repeated duplicate appeals can worsen the trust signal.

### Restart checklist after recovery

1. Complete profile trust signals: logo/profile photo, bio, website, contact email, verified phone/email, 2FA, stable device/IP, and linked Meta Account Center/Business assets if available.
2. Add/verify a landing-page disclaimer that PredictaGol is informational/entertainment soccer content, not a betting operator, paid-tip service, or prize promotion.
3. Start with one low-risk intro/static brand post; avoid polls, reels, match bursts, and aggressive score-pick wording.
4. Wait before posting again, then keep Instagram to one post per day until the account has stable reach and no warning banners.
5. Re-enable Instagram by setting `INSTAGRAM_SAFE_MODE=active`.

## Boot

```powershell
npm run board
```

The server binds to `0.0.0.0` on `MARKETING_BOARD_PORT` or `5173` and serves `marketing-board/public/` at `/`.

## Phone access

Find your laptop IP:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet' }
```

Open `http://<ip>:5173` on your phone while it is on the same WiFi.

## Demo seed

```powershell
npm run board:seed
```

This inserts deterministic Wave-1 placeholder cards across the board.

## Daily match seeding

```powershell
node marketing-board/scripts/seed-matches-for-date.mjs --date=2026-06-16 --max=3
```

If `--date` is omitted, the seeder targets **tomorrow and two days ahead** in CDMX so the board gets T-24 cards for tomorrow plus T-48 cards for the following match day instead of only same-day cards that may already be stale.

This creates a focused set of timed posting tasks for up to three featured matches on the selected match date. Each platform gets native format/copy instead of copy-paste reposts:

| Window | Instagram | X | Threads |
|---|---|---|---|
| T-48h | Breakdown carousel | Breakdown thread | Short list |
| T-24h | Feed graphic/carousel | Single hot take | Cross-posted graphic with rewritten caption |
| T-4h | Story poll with animated MP4 + lyric-free instrumental audio + PNG fallback | Native poll | Debate prompt |
| T-60m | 7-30s Reel storyboard | Thread | Match-thread reply |
| T-15m | — | Quote post or single hot take | — |
| Halftime | — | Live reply with 1080x1080 graphic | Match-thread reply with 1080x1080 graphic |
| FT+30 | Accountability recap with 1080x1080 visual | Thread | Accountability prompt |
| Next morning | Saveable illustrated recap visual | — | Short list |

Use `--dry-run` to preview without writing cards.

Every seeded card must include a rendered visual asset. FT+30 recap cards generate a square prediction-vs-reality visual once the final score exists in `data/public/final-scores.json`: green gradient for exact-score hits (`¡EN EL BLANCO!`, `¿NO QUE NO?`, `¡VICTORIA!`), standard brand background for right winner but wrong score (`CASI, CASI`, `UFF, POR POCO`, `ESTUVO CERCA`), and red gradient for wrong outcome (`¡VAYA SORPRESA!`, `¿QUÉ PASÓ?`, `OUCH, ESO DUELE`). HT cards generate a live-debate graphic for X/Threads, and next-morning cards generate a saveable abstract soccer illustration with match flags and PGS® context.

## Reusable T-4 poll videos

The T-4 cards use the reusable poll animation renderer: PredictaGol logo in the center, a growing question mark, and both team flags on the sides. To generate one manually:

```powershell
node marketing-board/scripts/render-poll-video.mjs --home=IRN --away=NZL
```

The output includes:

- `animated_mp4.mp4` for Instagram-first posting, including generated lyric-free instrumental suspense/sports music.
- `1080x1080.png` as the fallback image if the platform rejects video upload.

## Manual posting flow

1. Open **To Be Posted**.
2. Use the countdown chip to post the most urgent card first.
3. Open the card and select the platform tab.
4. Download/copy the asset if shown. For T-4 Instagram polls, use `animated_mp4.mp4` first and `1080x1080.png` as fallback.
5. Click the platform-specific copy button.
6. Open the platform, paste, and publish.
7. Return to the board and mark that platform posted.

## Environment

See `.env.example`.

- `MARKETING_BOARD_PASSPHRASE`: enables single-passphrase cookie auth. If unset, the board boots in dev mode with no auth.
- `MARKETING_BOARD_PORT`: defaults to `5173`.
- `MARKETING_DB_PATH`: defaults to `./marketing.sqlite`.
- `NTFY_TOPIC`: optional ntfy.sh topic for cards entering `to_be_posted`.

## Data

- Schema: `marketing-board/schema.sql` plus lightweight migrations in `marketing-board/lib/db.js`.
- Runtime SQLite: `MARKETING_DB_PATH`.
- Durable snapshots: `.squad/agents/<owner>/outputs/...` whenever cards are created, edited, advanced, or otherwise evented.
