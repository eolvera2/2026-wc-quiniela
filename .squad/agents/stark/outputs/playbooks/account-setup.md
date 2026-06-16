# PredictaGol Day-0 Account Setup Playbook

Owner: Eduardo / `@eolvera2`  
Launch clock: World Cup opens 2026-06-11  
Execution window: Day 0, laptop + phone  
Outcome: reserve five social accounts, apply brand copy, enable security, register developer apps, capture local `.env` credentials, and verify publish paths.

## 0. Non-negotiables before starting

1. Open your password manager.
2. Create one vault/folder named `PredictaGol Social Launch`.
3. Create one strong unique password per platform: X, Instagram/Meta, YouTube/Google, TikTok.
4. Do not reuse Eduardo personal passwords.
5. Use authenticator-app 2FA only; do not use SMS as primary 2FA.
6. Create one secure note named `PredictaGol Social Recovery`.
7. In that secure note, record recovery email, final handles, backup-code locations, app IDs, and token creation dates.
8. Keep `.env` private; never paste tokens into chat, social posts, screenshots, or commits.
9. Use handle priority exactly: `@predictagol` → `@predictagol_mx` → `@predictagolmx`.
10. First available handle wins.
11. Use display name exactly: `PredictaGol`.
12. Use bio exactly: `Juego social de pronósticos. No es una casa de apuestas.`
13. Use Day-1 website link: `https://predictagol.com`.
14. Use `https://predictagol.com/social` only if the mini-hub is already deployed and tested.
15. Use profile photo from `public\PredictaGol_Logo.png`.
16. Use cover/banner design spec: gradient navy ↔ jungle, jaguar gold accent, brand wordmark centered.
17. Render cover assets via Shuri's `launch-announcement` template if available.
18. As of plan write-time, UI paths below are accurate enough to execute; if a platform moved a button, follow the same stable concept: account settings, professional/business account, security/2FA, developer app, OAuth scopes, token capture.

## 1. Shared brand copy and assets

1. Open `C:\Users\eolve\OneDrive\Documents\Github\2026WCQuiniela`.
2. Confirm `public\PredictaGol_Logo.png` exists.
3. If executing on phone, send the logo to the phone before creating profiles.
4. Copy display name: `PredictaGol`.
5. Copy profile bio: `Juego social de pronósticos. No es una casa de apuestas.`
6. Character check: bio is under 150 chars.
7. Copy Day-1 website: `https://predictagol.com`.
8. Replace with `https://predictagol.com/social` after the mini-hub is live.
9. Render X banner at `1500 x 500`.
10. Render YouTube banner at `2560 x 1440`, with wordmark inside center safe area `1546 x 423`.
11. Render square fallback art at `1080 x 1080` for Instagram, Threads, and TikTok pinned/cover visuals.
12. Banner prompt/spec: `PredictaGol social cover: gradient navy to jungle green, jaguar gold accent streak, centered PredictaGol wordmark, clean sports-tech style, no gambling imagery, safe area centered.`
13. Store exported assets locally; do not commit new assets during this account setup.
14. Use Spanish-only profile copy for launch.
15. Avoid betting words in bios and captions: `apuesta`, `casino`, `sportsbook`, `cuotas`, `depósito`, `cashout`, `pick garantizado`.

## 2. X

### 2.1 Reserve handle and create account

1. Open `https://x.com/i/flow/signup`.
2. Click `Create account`.
3. Enter name: `PredictaGol`.
4. Use the PredictaGol recovery email.
5. Complete email verification.
6. When X asks for username, use `predictagol`.
7. Record final handle in password manager as `X handle: @predictagol`.
8. Skip contact sync.
9. Skip optional personalization prompts.
10. Finish onboarding.

### 2.2 Set account type: Business/Creator

1. Open `https://x.com/settings/account`.
2. Look for `Professional Tools`, `X for Professionals`, or `Switch to Professional`.
3. If it is not visible under settings, check `Edit profile` for `Switch to Professional`.
4. Click `Convert to Professional` or `Switch to Professional` if visible.
5. When asked for a business description or personal bio, enter: `Juego social de pronósticos para la Copa Mundial 2026. No es una casa de apuestas.`
6. If X requires a shorter description, enter: `Juego social de pronósticos. No es una casa de apuestas.`
7. Select `Business` if offered.
8. If only `Creator` is offered, select `Creator` and record that.
9. Choose category closest to `Sports`, `App`, `Entertainment`, or `Website`; `Sports, Fitness & Recreation` is acceptable.
10. Keep the profile public.
11. Keep `Show category on profile` enabled.
12. Leave `Profile Spotlight` disabled unless there is an official physical location or X Community to promote.
13. Save changes.
14. Do not use `Creator Subscriptions` as a substitute for Professional mode; it is a monetization area and may show `Ineligible` on new accounts.
15. If Professional mode is not visible on the new account, continue to profile setup and re-check after the account ages.

### 2.3 Apply profile copy and assets

1. Open the X profile.
2. Click `Edit profile`.
3. Set display name: `PredictaGol`.
4. Set bio: `Juego social de pronósticos. No es una casa de apuestas.`
5. Set website: `https://predictagol.com` unless `https://predictagol.com/social` is live.
6. Upload profile photo from `public\PredictaGol_Logo.png`.
7. Upload cover image from `public\PredictaGol_X_Cover.png`.
8. Crop with wordmark centered on desktop and mobile.
9. Save.
10. View the public profile in an incognito window.
11. Confirm the disclosure is visible in the bio.

### 2.4 Security baseline

1. Open `https://x.com/settings/security`.
2. Open `Two-factor authentication`.
3. Enable `Authentication app`.
4. Do not choose SMS as primary 2FA.
5. Scan the QR code with your authenticator app.
6. Enter the 6-digit code.
7. Save X backup codes.
8. Store backup codes in the password manager secure note.
9. Confirm recovery email at `https://x.com/settings/email`.
10. Confirm the password is strong and unique.

### 2.5 Developer app registration

1. Open `https://developer.x.com/`.
2. Sign in as the PredictaGol X account.
3. Apply for developer access if prompted.
4. If X shows `pay-per-use` instead of a Free tier, continue with pay-per-use and do not enable auto-recharge.
5. Account name: `predictagol`.
6. Use-case description:

   ```text
   PredictaGol will use the X API only to publish and manage first-party posts from the official @predictagol account. The app will support marketing and product updates for a social World Cup 2026 prediction game, including scheduled posts, approved announcement posts, and basic verification that a post was published successfully. We will request write access to create posts, read access to confirm our own published posts, and user read access to identify the authenticated @predictagol account.

   We will not sell, resell, sublicense, or redistribute X data. We will not scrape X, collect private user data, access direct messages, build user profiles, or use X data for advertising targeting. Any X data retrieved will be limited to what is needed to authenticate the official account and confirm publishing results for our own posts.
   ```

7. Check all required Developer Agreement boxes after reading the linked terms.
8. Note planning assumption: new X Developer accounts may be pay-per-use rather than Free tier. Keep credits at `$0.00` until a test post or production posting is ready.
9. If X offers free credit vouchers in the Credits page, redeem only vouchers shown inside the Developer Console, sent by X to the account email, or announced in the official X Developer Portal. Do not use unofficial public voucher codes.
10. If credits remain `$0.00`, use manual copy/paste posting for X and do not run API publishing jobs.
11. Open Developer Portal dashboard.
12. Create project `predictagol-marketing`.
13. Use case: choose closest marketing automation/bot option.
14. Create app `predictagol-marketing`.
15. Open app settings.
16. Open `User authentication settings`.
17. Click `Set up` or `Edit`.
18. Enable OAuth 2.0.
19. Enable OAuth 1.0a too if required to generate Access Token + Access Token Secret.
20. Set app permissions to `Read and write`.
21. Select app type `Web App, Automated App or Bot` if offered.
22. Use confidential client if X asks public vs confidential.
23. Add callback URL: `http://localhost:3000/callback`.
24. Add website URL: `https://predictagol.com`.
25. Add privacy URL `https://predictagol.com/privacy.html` and terms URL `https://predictagol.com/terms.html`.
26. Add scopes exactly: `tweet.write`, `tweet.read`, `users.read`.
27. Save user authentication settings.
28. Open `Keys and tokens`.
29. Generate/reveal `API Key`.
30. Generate/reveal `API Key Secret`.
31. Generate `Access Token and Secret`.
32. Confirm token permissions say `Read and write`.
33. Paste into local `.env` as `X_API_KEY`.
34. Paste into local `.env` as `X_API_SECRET`.
35. Paste into local `.env` as `X_ACCESS_TOKEN`.
36. Paste into local `.env` as `X_ACCESS_TOKEN_SECRET`.
37. Store the same credentials in password manager item `PredictaGol X Developer App`.
38. Do not commit `.env`.

### 2.6 Verification and publish check

1. Open the X profile while signed in.
2. Look for `Premium`, `Verified Organizations`, or verification options.
3. Apply for the free verification check if X presents an eligible free flow.
4. Do not pay for verification on Day 0 unless already budget-approved.
5. Later run `npm run board`.
6. Seed one safe card.
7. Approve X only.
8. If X API credits are `$0.00`, copy the approved X post manually and publish it from the X web UI.
9. If X API credits are available, run the API publish flow and confirm the post appears on the public X profile.
10. Mark `Test publish to X passed` for API publishing, or `Manual X publish path passed` for copy/paste publishing.

## 3. Instagram + Facebook Page + Meta developer app

### 3.1 Create new Facebook Page

1. Open `https://www.facebook.com/pages/create`.
2. Sign in with Eduardo's Meta/Facebook account.
3. Click `Create new Page`.
4. Page name: `PredictaGol`.
5. Category: `Sports`.
6. Add secondary categories `Website` and `App page` if offered.
7. Description/Bio: `Juego social de pronósticos. No es una casa de apuestas.`
8. Click `Create Page`.
9. If Facebook shows `Cannot create Page: You have made too many attempts to create a Page recently`, stop trying for this session, record `Facebook Page creation: rate-limited`, and retry after 24 hours from the same account/browser. Repeated attempts can extend the cooldown.
10. If rate-limited, continue with Instagram handle reservation and return to this Facebook Page step after the cooldown.
11. If Facebook prompts for optional setup fields after creation, set website to `https://predictagol.com` unless the mini-hub is live.
12. Upload profile photo from `public\PredictaGol_Logo.png`.
13. Upload cover image from `public\PredictaGol_X_Cover.png`.
14. If the setup wizard does not ask for photos or website, open the new Page profile and click `Edit Page info` or `Edit details`.
15. In `Edit Page info` or `Edit details`, set website to `https://predictagol.com` unless the mini-hub is live.
16. On the Page profile, click the camera/edit icon on the profile photo and upload `public\PredictaGol_Logo.png`.
17. On the Page cover area, click `Edit cover photo` and upload `public\PredictaGol_X_Cover.png`; crop with the wordmark centered on desktop and mobile.
18. Publish the Page if Facebook asks for publishing confirmation.
19. Open Page settings.
20. Open `Page access` or `Page roles`.
21. Confirm Eduardo has full admin control.
22. Add a trusted backup admin if available.
23. Give backup admin full control only if they are trusted to manage posts and tokens.
24. If none exists, record `Meta backup admin: pending`.
25. Copy the Page URL into the secure note.

### 3.2 Create Instagram and reserve handle

1. Open Instagram mobile app or `https://www.instagram.com/accounts/emailsignup/`.
2. Sign up with the PredictaGol recovery email.
3. Full name: `PredictaGol`.
4. Use username `predictagol`.
5. Record final handle as `Instagram handle: @predictagol`.
6. Skip contact sync.
7. Skip Facebook friend suggestions.
8. Finish signup.
9. Verify email.

### 3.3 Convert Instagram to Business and link Page

1. Open Instagram profile.
2. Tap `Edit profile`.
3. Set display name: `PredictaGol`.
4. Set bio: `Juego social de pronósticos. No es una casa de apuestas.`
5. If editing on desktop web, note that Instagram may not allow website/link edits there; use the mobile app to add `https://predictagol.com` unless the mini-hub is live.
6. If desktop web does not allow changing display name, use the Instagram mobile app to change it from any temporary signup name to `PredictaGol`; this also updates the display name shown on Threads.
7. Upload profile photo from `public\PredictaGol_Logo.png`.
8. Save.
9. Open profile menu `☰`.
10. Open `Settings and privacy`.
11. Open `Account type and tools` or `For professionals`.
12. Tap `Switch to professional account` if not already converted.
13. Choose category closest to `Sports`, `App`, or `Website`; `Sports` is acceptable.
14. Select `Business`.
15. Do not select Creator for Instagram.
16. Leave `AI creator` disabled unless PredictaGol content is primarily AI-generated and the label is required by Instagram.
17. Continue through professional setup.
18. When asked to connect a Facebook Page, select the new `PredictaGol` Page.
19. If Facebook Page creation is still pending, skip link and record `IG-FB link pending`.
20. If skipped after the Page exists, go to `Edit profile` → `Page` → `Connect or create`.
21. Select existing Page `PredictaGol`.
22. Confirm Instagram Business account is linked to the Page.
23. Record `IG account type: Instagram Business linked to Facebook Page`, or `IG account type: Instagram Business; Facebook Page link pending` if Page creation is rate-limited.

### 3.4 Secure Instagram and Meta

1. Open Instagram profile menu `☰`.
2. Open `Accounts Center`.
3. Open `Password and security`.
4. Open `Two-factor authentication`.
5. Select the Instagram account.
6. Enable `Authentication app`.
7. Scan QR code with authenticator app.
8. Enter the 6-digit code.
9. Save Instagram backup codes.
10. Store backup codes in password manager.
11. Confirm recovery email is correct.
12. Confirm password is strong and unique.
13. In Facebook/Accounts Center, enable authenticator-app 2FA for the Facebook account too.
14. Save Facebook backup codes.
15. Store Facebook backup codes.
16. Confirm Page admin access still lists Eduardo.
17. Confirm backup admin if available.

### 3.5 Create Meta developer app

1. Open `https://developers.facebook.com/`.
2. Sign in as Eduardo.
3. If Meta asks which role best describes you, select `Owner/founder`.
4. Open `My Apps`.
5. Click `Create App`.
6. In `App details`, name app `predictagol-marketing`.
7. Set contact email to the PredictaGol recovery email.
8. In `Use cases`, select `Manage messaging & content on Instagram`.
9. Also select `Manage everything on your Page` if Facebook Page publishing or Page insights will be used.
10. Do not select `Authenticate and request data from users with Facebook Login` unless Meta requires it later for OAuth/login configuration.
11. Select `Access the Threads API` only if the setup flow requires choosing all planned products now; otherwise skip Threads until a Threads account exists.
12. Do not select Marketing API, app ads, WhatsApp, Instant Games, Messenger, Catalog, Fundraisers, oEmbed, Live Video, Audience Network, data portability, ThreatExchange, or other unrelated use cases.
13. In `Business`, choose the PredictaGol/Eduardo business portfolio if available.
14. If no business portfolio is available and `Next` is disabled, click `business settings` and create a business portfolio named `PredictaGol`.
15. For the business portfolio, set `Business and account name` to `PredictaGol`.
16. For `Your name`, use the display/contact name associated with the PredictaGol recovery Gmail account.
17. For `Business email`, use the PredictaGol recovery Gmail address.
18. If Meta asks for a website, use `https://predictagol.com`.
19. Keep Eduardo's Facebook account as the owner/admin behind the portfolio even if the visible business contact name/email use the PredictaGol identity.
20. If Meta returns `Unable to Create Account` or says `Your advertising access is restricted`, stop trying to create the business portfolio and record `Meta business portfolio: blocked by advertising access restriction`.
21. If the business portfolio was created successfully, return to the app creation wizard, refresh if needed, and select the new `PredictaGol` business portfolio.
22. If Meta does not allow continuing because no business portfolio exists, go back to `Use cases`, select `Create an app without a use case`, create the app, and add Instagram/Page products later from the app dashboard.
23. If `Create an app without a use case` is also blocked because the `Business` step still requires an available business portfolio, record `Meta developer app: blocked by business/ad restriction` and use manual Instagram/Facebook posting until the Meta account restriction is resolved.
24. To resolve the restriction later, check Meta Account Quality / Business Support Home from the restricted Facebook account, look for advertising or business access restrictions, and request review if Meta offers an appeal flow.
25. Complete `Requirements` and `Overview`.
26. Create the app.
27. Keep app in `Development Mode`.
28. Do not submit app review on Day 0 for Eduardo-owned account testing.
29. Confirm Eduardo is App Admin.
30. Add product `Instagram Graph API` if it was not already added by the selected use case.
31. Add product `Threads Graph API` later only if Threads publishing is in scope.
32. Add product `Facebook Login` if it was not already added by the selected use case.
33. Open `App settings` → `Basic`.
34. Copy `App ID` into `.env` as `META_APP_ID`.
35. Reveal/copy `App Secret` into `.env` as `META_APP_SECRET`.
36. Add app domain `predictagol.com`.
37. Add privacy policy URL `https://predictagol.com/privacy.html`.
38. Add terms URL `https://predictagol.com/terms.html`.
39. Save settings.
40. Store App ID and App Secret in password manager item `PredictaGol Meta Developer App`.

### 3.6 Mint Meta user token in Graph API Explorer

1. Open `https://developers.facebook.com/tools/explorer/`.
2. Select app `predictagol-marketing`.
3. Select `User Token`.
4. Click `Add a Permission`.
5. Add `instagram_basic`.
6. Add `instagram_content_publish`.
7. Add `pages_show_list`.
8. Add `pages_read_engagement`.
9. Add `pages_manage_posts`.
10. Add `threads_basic`.
11. Add `threads_content_publish`.
12. Leave `public_profile` if auto-included.
13. Click `Generate Access Token`.
14. Authorize as Eduardo.
15. Copy the short-lived user token.
16. Paste it temporarily into a local scratch editor only.
17. Do not commit the token.

### 3.7 Exchange for long-lived Meta token

1. Replace placeholders in this URL:

```text
https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=META_APP_ID&client_secret=META_APP_SECRET&fb_exchange_token=SHORT_LIVED_USER_TOKEN
```

2. If Graph API Explorer shows a newer version than `v20.0`, use that version.
3. Paste the completed URL into the browser.
4. Confirm JSON contains `access_token`, `token_type`, and `expires_in`.
5. Copy `access_token`.
6. Paste into `.env` as `META_LONG_LIVED_USER_TOKEN`.
7. Store token creation date and expected expiry in password manager.

### 3.8 Resolve Page ID and IG Business Account ID

1. Replace token in this URL:

```text
https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=META_LONG_LIVED_USER_TOKEN
```

2. Open the URL in browser.
3. Find object where `name` is `PredictaGol`.
4. Copy its `id`.
5. Paste into `.env` as `META_FB_PAGE_ID`.
6. Copy `instagram_business_account.id`.
7. Paste into `.env` as `META_IG_BUSINESS_ACCOUNT_ID`.
8. If `instagram_business_account` is missing, reconnect Instagram to the Facebook Page and rerun.
9. Confirm username matches the reserved Instagram handle.
10. Store Page ID and IG Business Account ID in password manager.

### 3.9 Resolve Threads user ID

1. Complete Threads setup in section 4 first.
2. Use the same Meta app and long-lived user token.
3. Try this baseline Graph URL:

```text
https://graph.facebook.com/v20.0/me?fields=id,name&access_token=META_LONG_LIVED_USER_TOKEN
```

4. If Meta's Threads Graph API tool exposes a Threads-specific user lookup, use that current endpoint.
5. Copy the resolved Threads user ID.
6. Paste into `.env` as `META_THREADS_USER_ID`.
7. If unavailable on Day 0, record `META_THREADS_USER_ID: pending UI/API availability`.
8. Continue with manual Threads fallback if needed.

### 3.10 Meta publish checks

1. Later run `npm run board`.
2. Seed one safe launch card.
3. Approve Instagram only.
4. Confirm the post appears on the public Instagram profile.
5. Approve Threads only after token/ID is resolved.
6. Confirm the post appears on the public Threads profile.
7. If Threads API fails, use manual paste fallback for Day 1.
8. Mark Instagram and Threads tests passed only after public visibility is confirmed.

## 4. Threads

### 4.1 Create Threads profile from Instagram

1. Complete Instagram Business setup first.
2. Install/open Threads app or open `https://www.threads.net/`.
3. Tap `Log in with Instagram`.
4. Select the PredictaGol Instagram account.
5. Threads handle is linked to Instagram; do not try a separate Threads-only handle.
6. If Instagram is `@predictagol`, Threads is `@predictagol`.
7. Final Threads URL: `https://www.threads.com/@predictagol`.
8. Import profile from Instagram if offered.
9. Threads may display the Instagram display name above the handle and may not allow reordering the profile header. If the profile shows a temporary name such as `Zayu Jaguar`, change the Instagram display name to `PredictaGol` from the Instagram mobile app; this updates both Instagram and Threads.
10. Confirm display name: `PredictaGol`.
11. Confirm bio: `Juego social de pronósticos. No es una casa de apuestas.`
12. Confirm link: `https://predictagol.com` or live mini-hub URL.
13. Confirm profile photo is the PredictaGol logo.
14. Set profile public.
15. Finish setup.
16. Record final Threads handle as `Threads handle: @predictagol`.

### 4.2 Account type and linkage

1. Treat Threads as part of the Instagram Business + Meta Page stack.
2. Do not create a separate consumer-only identity.
3. Confirm underlying Instagram account is Business.
4. Confirm Instagram remains linked to the new Facebook Page.
5. Confirm Threads is logged into PredictaGol Instagram, not Eduardo personal.
6. Skip follow/contact prompts.
7. Record `Threads account type: Instagram Business-linked Threads profile`.

### 4.3 Security baseline

1. Threads security is managed through Instagram/Meta Accounts Center.
2. Confirm Instagram authenticator-app 2FA is enabled.
3. Confirm Facebook authenticator-app 2FA is enabled.
4. Confirm Instagram backup codes are stored.
5. Confirm Facebook backup codes are stored.
6. Confirm recovery email is correct.
7. Record `Threads 2FA: covered by Instagram authenticator 2FA`.

### 4.4 Developer integration

1. Use the Meta developer app from section 3.
2. Confirm product `Threads Graph API` is added.
3. Confirm scope `threads_basic` was requested.
4. Confirm scope `threads_content_publish` was requested.
5. Confirm `META_LONG_LIVED_USER_TOKEN` is in `.env`.
6. Resolve `META_THREADS_USER_ID` using section 3.9.
7. Paste `META_THREADS_USER_ID` into `.env`.
8. Keep Meta app in Development Mode for Eduardo-owned testing.
9. If UI changes, anchor on: Meta app, Threads Graph API, `threads_basic`, `threads_content_publish`, long-lived user token, Threads user ID.

### 4.5 Publish check

1. Later run `npm run board`.
2. Seed one safe launch card.
3. Approve Threads only.
4. Confirm post appears on `https://www.threads.net/@YOUR_HANDLE`.
5. If API posting fails, copy the approved caption from the board.
6. Paste manually into Threads composer.
7. Publish manually.
8. Mark automated test passed only if API succeeded; otherwise mark manual fallback passed.

## 5. YouTube

### 5.1 Create channel and reserve handle

1. Open `https://www.youtube.com/`.
2. Sign in with the Google account that will own PredictaGol marketing.
3. Click avatar in top right.
4. Click `Create a channel`.
5. Channel name: `PredictaGol`.
6. Upload profile picture from `public\PredictaGol_Logo.png`.
7. Finish channel creation.
8. Open `https://www.youtube.com/handle` or YouTube Studio customization.
9. Set handle to `@PredictaGol`.
10. Record final YouTube handle as `YouTube handle: @PredictaGol`.
11. Copy channel URL `https://www.youtube.com/channel/UCYQ2fJplvPaNL3A4AImjNbQ` into the secure note.

### 5.2 Apply profile copy and assets

1. Open `https://studio.youtube.com/`.
2. Click `Customization`.
3. Open `Profile` or `Basic info`.
4. Set channel name: `PredictaGol`.
5. Set handle to `@PredictaGol`.
6. Set description:

   ```text
   PredictaGol es un juego social de pronósticos para la Copa Mundial 2026.

   Comparte predicciones, sigue marcadores y compite con amigos durante el torneo.

   No es una casa de apuestas.
   ```

7. Add language: `Spanish` / `Español`.
8. Keep the cryptic channel URL as-is; the public-friendly URL is the handle URL `https://www.youtube.com/@PredictaGol`.
9. Add link title `PredictaGol` with URL `https://predictagol.com` unless the mini-hub is live.
10. Set contact info email to the PredictaGol recovery email.
11. Open `Branding`.
12. Upload picture from `public\PredictaGol_Logo.png`.
13. Upload banner from `public\PredictaGol_YouTube_Banner.png`.
14. Upload video watermark from `public\PredictaGol_YouTube_Watermark.png`.
15. Save/publish customization.
16. View public channel in incognito.
17. Confirm disclosure, handle URL, link, banner, profile photo, and watermark.

### 5.3 Security baseline

1. Open `https://myaccount.google.com/security`.
2. Confirm password is strong and unique.
3. Open `2-Step Verification`.
4. Add authenticator app as a 2FA method.
5. Prefer authenticator/passkey over SMS.
6. Generate backup codes.
7. Store backup codes in password manager.
8. Confirm recovery email is correct.
9. Record `YouTube 2FA: authenticator enabled`.

### 5.4 Google Cloud project and YouTube Data API v3

1. Open `https://console.cloud.google.com/`.
2. Sign in with the YouTube owner Google account.
3. Open project selector.
4. Click `New Project`.
5. Project name: `predictagol-marketing`.
6. Create and switch to the project.
7. Open `APIs & Services` → `Library`.
8. Search `YouTube Data API v3`.
9. Open the API result.
10. Click `Enable`.
11. Open `APIs & Services` → `OAuth consent screen` or `Google Auth Platform`.
12. If Google says `Google Auth Platform is not configured`, click `Get started`.
13. In `Create branding` / `App Information`, set app name to `PredictaGol Marketing`.
14. Set user support email to the YouTube owner Google account or the PredictaGol recovery Gmail if it appears in the dropdown.
15. Click `Next`.
16. In `Audience`, select `External` unless this is Google Workspace internal-only.
17. Keep publishing status in `Testing` mode.
18. Click `Next`.
19. In `Contact Information`, set developer contact email to the PredictaGol recovery Gmail.
20. Finish the wizard.
21. Open `Branding`.
22. Confirm app name `PredictaGol Marketing`.
23. Confirm user support email.
24. Add app logo from `public\PredictaGol_Google_OAuth_Logo.png`; it is under Google's 1 MB upload limit.
25. Add application home page `https://predictagol.com`.
26. Add application privacy policy link `https://predictagol.com/privacy.html`.
27. Add application terms of service link `https://predictagol.com/terms.html`.
28. If only the Coming Soon path is deployed, use `https://predictagol.com/comingsoon/privacy.html` and `https://predictagol.com/comingsoon/terms.html` until the root site is deployed.
29. Add authorized domain `predictagol.com` if required.
30. Save branding.
31. Open `Audience`.
32. Confirm user type `External` and publishing status `Testing`.
33. Add Eduardo's Google account as a test user.
34. Save audience.
35. Open `Data Access`.
36. Add scope `https://www.googleapis.com/auth/youtube.upload` for uploads.
37. Add scope `https://www.googleapis.com/auth/youtube` only if the board needs broader channel management.
38. Save data access.

### 5.5 OAuth Desktop credentials

1. Open `APIs & Services` → `Credentials`.
2. Click `Create Credentials`.
3. Select `OAuth client ID`.
4. Application type: `Desktop app`.
5. Name: `predictagol-marketing-desktop`.
6. Click `Create`.
7. Copy `Client ID`.
8. Copy `Client secret`.
9. Paste into `.env` as `YOUTUBE_CLIENT_ID`.
10. Paste into `.env` as `YOUTUBE_CLIENT_SECRET`.
11. Store both in password manager item `PredictaGol YouTube API`.

### 5.6 One-shot Node OAuth dance for refresh token

1. Open PowerShell in `C:\Users\eolve\OneDrive\Documents\Github\2026WCQuiniela`.
2. If the repo already has a YouTube auth helper, use it.
3. If not, run a one-shot Node OAuth command without committing any script.
4. Required redirect URI for desktop flow: `http://localhost`.
5. Required authorization behavior: `access_type=offline` and `prompt=consent`.
6. Required initial scope: `https://www.googleapis.com/auth/youtube.upload`.
7. Open the generated Google authorization URL.
8. Choose Eduardo's YouTube owner account.
9. If Google says unverified, click `Advanced`.
10. Click `Go to PredictaGol Marketing (unsafe)` because Eduardo is a test user in Testing mode.
11. Grant the requested YouTube scope.
12. Browser redirects to `http://localhost/?code=...`.
13. Copy only the `code` query parameter.
14. Exchange code at `https://oauth2.googleapis.com/token`.
15. Confirm response contains `refresh_token`.
16. Paste it into `.env` as `YOUTUBE_REFRESH_TOKEN`.
17. Store refresh token in password manager.
18. If no refresh token appears, revoke prior app access at `https://myaccount.google.com/permissions` and rerun with `prompt=consent`.
19. Record `YouTube OAuth refresh token: created` after `.env` contains `YOUTUBE_REFRESH_TOKEN`.

### 5.7 Capture channel ID

1. Open `https://studio.youtube.com/`.
2. Go to `Settings` → `Channel` → `Advanced settings`.
3. If Studio shows `Channel ID`, copy it.
4. If Studio does not show `Channel ID`, use the ID from the canonical channel URL. For `https://www.youtube.com/channel/UCYQ2fJplvPaNL3A4AImjNbQ`, the channel ID is `UCYQ2fJplvPaNL3A4AImjNbQ`.
5. Paste into `.env` as `YOUTUBE_CHANNEL_ID`.
6. Store Channel ID in password manager.

### 5.8 Publish check

1. Later run `npm run board`.
2. Seed one safe short/video card if supported.
3. Approve YouTube only.
4. Confirm upload appears in YouTube Studio content list.
5. Confirm visibility is intended.
6. Mark `Test publish to YouTube passed`.

## 6. TikTok

### 6.1 Create account and reserve handle

1. Open TikTok app or `https://www.tiktok.com/signup`.
2. Sign up with the PredictaGol recovery email.
3. Use a strong unique password.
4. If web signup says to continue in the TikTok app but the app is logged into another account, open the TikTok app profile tab, tap the username/profile switcher at the top, then `Add account` or `Log in`.
5. Log in with the PredictaGol recovery email and password; do not overwrite or rename the existing personal TikTok account.
6. If TikTok does not show account switching, go to profile menu `☰` → `Settings and privacy` → `Account` → `Switch account` or `Log out`, then log in with the PredictaGol credentials.
7. After PredictaGol is active in the app, finish the signup/verification prompt.
8. Set display name: `PredictaGol`.
9. Set username to `predictagol`.
10. Record final TikTok handle as `TikTok handle: @predictagol`.
11. Skip contact sync.
12. Skip friend suggestions.
13. Verify email.

### 6.2 Convert to TikTok Business

1. Open TikTok profile.
2. Tap menu `☰`.
3. Open `Settings and privacy`.
4. Tap `Account`.
5. Tap `Switch to Business Account`.
6. Choose category closest to `Sports`, `Entertainment`, `Software/App`, or `Media`.
7. Complete the wizard.
8. Confirm account type shows `Business Account`.
9. Record `TikTok account type: Business`.

### 6.3 Apply profile copy and assets

1. Open TikTok profile.
2. Tap `Edit profile`.
3. Set name: `PredictaGol`.
4. Set username to `predictagol`.
5. Set bio: `Juego social de pronósticos. No es una casa de apuestas.`
6. If `Links` only offers `Add Lemon8` and does not allow a manual website URL, leave website blank and record `TikTok website link: unavailable`.
7. If TikTok later grants a website field, use `https://predictagol.com` unless the mini-hub is live.
8. Upload profile photo from `public\PredictaGol_Logo.png`.
9. TikTok does not require a classic cover; use the navy ↔ jungle, jaguar gold, centered wordmark as pinned-video cover art.
10. Save.
11. View public profile from another device/browser.
12. Confirm bio disclosure and handle `@predictagol`.

### 6.4 Security baseline

1. Open `Settings and privacy`.
2. Open `Security`.
3. Open `2-step verification`.
4. Enable authenticator app if available.
5. Do not use SMS as primary 2FA.
6. If TikTok requires multiple methods, add email plus authenticator.
7. Scan QR code with authenticator app.
8. Enter code.
9. Save backup/recovery codes if provided.
10. Store codes in password manager.
11. Confirm recovery email.
12. Confirm password is unique.

### 6.5 Developer app registration

1. Open `https://developers.tiktok.com/`.
2. Sign in with the TikTok Business account or Eduardo's developer login.
3. Open `Manage apps`.
4. Click `Create an app`.
5. App name: `predictagol-marketing`.
6. Category: closest marketing/content publishing category.
7. Website URL: `https://predictagol.com`.
8. App icon: `public\PredictaGol_Logo.png`.
9. Description: `Herramienta interna para publicar contenido de PredictaGol, juego social de pronósticos sin apuestas.`
10. Privacy policy URL: `https://predictagol.com/privacy.html`.
11. Terms URL: `https://predictagol.com/terms.html`.
12. Redirect URI: `http://localhost:3000/tiktok/callback`.
13. Add product `Login Kit`.
14. Add product `Content Posting API`.
15. Request Login Kit scope `user.info.basic`.
16. Request Content Posting scope `video.upload` if offered.
17. Request Content Posting scope `video.publish` if offered.
18. Do not request unnecessary scopes.
19. Save app draft.
20. Copy `Client key`.
21. Paste into `.env` as `TIKTOK_CLIENT_KEY`.
22. Copy `Client secret`.
23. Paste into `.env` as `TIKTOK_CLIENT_SECRET`.
24. Store both in password manager item `PredictaGol TikTok Developer App`.

### 6.6 Submit production audit immediately

1. In TikTok developer portal, open the app.
2. Open `Production` or `Submit for review`.
3. Complete required company/app information.
4. App name: `PredictaGol Marketing`.
5. Domain: `predictagol.com`.
6. Contact email: PredictaGol recovery email.
7. Use case: `Internal marketing tool to publish PredictaGol launch videos and captions to the owned TikTok Business account.`
8. Compliance note: `PredictaGol is a social prediction game and not a betting house; posts include no wagering, deposits, or odds.`
9. Attach screenshots if required: login screen, caption approval board, publishing flow, privacy/terms pages if available.
10. Request Content Posting API access.
11. Request Login Kit access.
12. Submit production audit immediately.
13. Record submission timestamp.
14. Assume audit takes days.
15. Do not wait for audit to launch Day-1 manual posting.

### 6.7 Sandbox and access token

1. Open `Sandbox` if available.
2. Add Eduardo's TikTok account as a target/test user.
3. Enable Login Kit in sandbox.
4. Enable Content Posting API in sandbox if offered.
5. Run OAuth authorization flow using sandbox credentials if separate.
6. Capture access token if the board supports TikTok sandbox.
7. Paste token into `.env` as `TIKTOK_ACCESS_TOKEN`.
8. Store token in password manager.
9. Treat token as test-only until production audit passes.

### 6.8 Paste-fallback until audit clears

1. In the board, approve TikTok card.
2. Copy generated caption to clipboard.
3. Save/export generated video or asset to phone.
4. Open TikTok app.
5. Tap `+` composer.
6. Select asset.
7. Paste caption.
8. Confirm no affiliate disclosure is in the social caption.
9. Confirm profile bio already contains disclosure.
10. Publish manually.
11. Mark `TikTok paste-fallback test passed`.

## 7. Link-in-bio and mini-hub

1. For Day 1, use `https://predictagol.com` on every profile unless `https://predictagol.com/social` is live.
2. Do not use Linktree for launch.
3. Own `https://predictagol.com/social` as a mini-hub on the existing Azure Static Web Apps site.
4. Mini-hub build is Phase 2, not required before Day-0 reservation.
5. Mini-hub should be a single static page.
6. Include links to X, Instagram, Threads, YouTube, and TikTok.
7. Include current featured launch content.
8. Include responsible-gambling/social-game disclaimer: `PredictaGol es un juego social de pronósticos. No es una casa de apuestas. No acepta depósitos ni apuestas con dinero real.`
9. Include affiliate disclosure only on-site if affiliate links exist.
10. Never put affiliate disclosure in normal social copy.
11. After mini-hub deploys, update all profile website links to `https://predictagol.com/social`.

## 8. Compliance footers

1. Profile bio disclosure, paste exactly:

```text
Juego social de pronósticos. No es una casa de apuestas.
```

2. On-site responsible-gambling/social-game disclosure:

```text
PredictaGol es un juego social de pronósticos. No es una casa de apuestas. No acepta depósitos ni apuestas con dinero real.
```

3. Affiliate disclosure, on-site only, never in normal social copy:

```text
Divulgación de afiliados: algunos enlaces del sitio pueden ser enlaces de afiliado. Si realizas una acción después de hacer clic, PredictaGol podría recibir una comisión sin costo adicional para ti. Esto no afecta nuestras recomendaciones ni convierte a PredictaGol en una casa de apuestas.
```

4. Do not paste the affiliate disclosure into X, Instagram, Threads, YouTube, or TikTok unless a specific social post contains an affiliate link and legal review requires it.
5. Never imply PredictaGol accepts bets.
6. Never imply users can win money from PredictaGol.
7. Never use sportsbook-style CTAs: `apuesta ahora`, `cobra`, `cuota segura`, `pick garantizado`.
8. Prefer CTAs: `haz tu pronóstico`, `compite con amigos`, `arma tu quiniela`, `síguenos para el arranque`.

## 9. Local `.env` target block

1. After setup, local `.env` should contain:

```dotenv
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_CHANNEL_ID=

META_APP_ID=
META_APP_SECRET=
META_LONG_LIVED_USER_TOKEN=
META_IG_BUSINESS_ACCOUNT_ID=
META_THREADS_USER_ID=
META_FB_PAGE_ID=

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=
```

2. Leave values blank until credentials are created.
3. Do not commit `.env`.
4. Do not screenshot `.env`.
5. Store credential backup only in password manager.

## 10. Submission checklist

| Done | Item |
|---|---|
| [ ] | X handle reserved: @____ |
| [ ] | X account is Business/Creator |
| [ ] | X bio, photo, banner set |
| [ ] | X 2FA on (authenticator) |
| [ ] | X dev app created, tokens in `.env` |
| [ ] | Instagram handle reserved: @____ |
| [ ] | Instagram account is Business |
| [ ] | Instagram linked to new Facebook Page |
| [ ] | Instagram bio, photo set |
| [ ] | Instagram 2FA on (authenticator via Accounts Center) |
| [ ] | Instagram/Meta dev app created, tokens/IDs in `.env` |
| [ ] | Threads handle reserved via Instagram: @____ |
| [ ] | Threads account is Instagram Business-linked |
| [ ] | Threads bio, photo, link inherited/confirmed |
| [ ] | Threads 2FA covered by Instagram authenticator 2FA |
| [ ] | Threads API product/scopes configured in Meta app |
| [ ] | YouTube handle reserved: @____ |
| [ ] | YouTube channel created |
| [ ] | YouTube bio, photo, banner set |
| [ ] | YouTube/Google 2FA on (authenticator) |
| [ ] | YouTube Data API v3 credentials and refresh token in `.env` |
| [ ] | TikTok handle reserved: @____ |
| [ ] | TikTok account is Business |
| [ ] | TikTok bio, photo set |
| [ ] | TikTok 2FA on (authenticator) |
| [ ] | TikTok developer app created, keys in `.env` |
| [ ] | TikTok production audit submitted |
| [ ] | `predictagol.com` added as Day-1 link-in-bio everywhere |
| [ ] | `predictagol.com/social` queued as Phase-2 owned mini-hub |
| [ ] | Recovery email confirmed on every platform |
| [ ] | Backup codes stored in password manager |
| [ ] | Backup Meta Page admin added, or explicitly marked pending |
| [ ] | Test publish to X passed (via `npm run board` → seed card → approve) |
| [ ] | Test publish to YouTube passed |
| [ ] | Test publish to IG passed |
| [ ] | Test publish to Threads passed |
| [ ] | TikTok paste-fallback test passed |

## 11. Decision log Eduardo fills during execution

1. X final handle: `@____`.
2. Instagram final handle: `@____`.
3. Threads final handle: `@____`.
4. YouTube final handle: `@____`.
5. TikTok final handle: `@____`.
6. Day-1 link used: `https://predictagol.com` or `https://predictagol.com/social`.
7. Meta backup admin: `added` or `pending`.
8. TikTok production audit submission timestamp: `____`.
9. Any UI deviation encountered: `____`.
