# Releasing the mobile app (`mobile/`) to Google Play and the App Store

> Building on your own machine with your own store accounts? Start with docs/BUILD_FOR_STORES.md.
> This page is the CI route (GitHub builds and signs) plus the store forms.

The pipeline is ready in CI (`.github/workflows/native.yml`). The app is `mobile/` (Capacitor: the 3D
game in native Android and iOS projects); the old React Native version is archived in `archive/react-native/`. The store accounts, keys and
listings belong to the founder, so this page lists what to set up and what CI does with it. Nothing
here spends money or publishes anything until the founder creates the accounts and adds the secrets.

**Costs (founder decision):** Google Play developer account, US$25 once. Apple Developer Program,
US$99 per year. Neither is needed to keep testing with the CI downloads.

## What CI builds
| Run | Android | iOS |
|---|---|---|
| Every push | `mam-village-android-N`: `app-debug.apk` (installs on any phone; also published as the `android-latest` release) and `app-release.aab`, signed for Google Play when the upload key is set | Simulator app (proves it compiles) |
| Actions → Native apps (Android + iOS) → Run workflow → tick **testflight** | (same) | Archives, signs and uploads build N to TestFlight |

Version numbers come from the run number: version name `1.0.N`, Android `versionCode` N, iOS build N, so
every upload is higher than the last. Building by hand instead: docs/BUILD_FOR_STORES.md.

## 1. The app id
The app is **`com.mamvillage.app`** (`capacitor.config.ts`, the Android `applicationId`, the iOS bundle id
and the sign-in deep link). It can't change after the first store upload.

## 2. Google Play
1. Create the upload key on your computer (keep the file and passwords safe; Google Play App Signing
   holds the real app key, so a lost upload key can be reset):
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -i upload.jks | pbcopy        # macOS (Linux: base64 -w0 upload.jks)
   ```
2. GitHub → Settings → Secrets and variables → Actions → New repository secret:
   `ANDROID_KEYSTORE_BASE64` (the base64 text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
   (`upload`), `ANDROID_KEY_PASSWORD`.
3. The next push builds a signed `app-release.aab` (in the `mam-village-android-N` download).
4. Play Console: create the app, then **Testing → Internal testing → Create release** and upload the
   `.aab` from the CI download (Google requires the first upload by hand). Add testers by email.
5. Store listing, content rating questionnaire, target audience, and **Data safety** (below).

## 3. App Store (TestFlight first)
1. Join the Apple Developer Program with the company or founder's Apple ID.
2. App Store Connect → Apps → **+** → New app, bundle id `com.mamvillage.app`.
3. App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate a key
   with the **Admin** role (Xcode needs it to create the signing certificate and profile in the cloud).
   Download the `.p8` file (only once).
4. GitHub secrets: `APPLE_TEAM_ID` (Membership page), `ASC_KEY_ID`, `ASC_ISSUER_ID` (on the API keys
   page), `ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`).
5. Actions → Native apps (Android + iOS) → Run workflow → tick **testflight**. The build appears in TestFlight
   after Apple's processing (about 10-30 minutes); add testers there.
6. Export compliance: the app uses only standard HTTPS. Answer "No" to non-exempt encryption in App
   Store Connect, or add `ITSAppUsesNonExemptEncryption = NO` to `mobile/ios/App/App/Info.plist`.

## 4. Sign-in redirect (Supabase)
Supabase → Auth → URL Configuration → Redirect URLs: add `com.mamvillage.app://auth/callback`. Google
and Apple must be enabled under Auth → Providers (docs/SUPABASE.md). Apple sign-in is offered next to
Google because the App Store requires it for apps with third-party sign-in.

## 5. Privacy answers (Play "Data safety" / App Store "App Privacy")
Privacy policy URL: https://ducnguyenhuynh90.github.io/Auto-game-studio/privacy.html · Account deletion URL
(Play): https://ducnguyenhuynh90.github.io/Auto-game-studio/delete-account.html (both in `public/`).

What the game actually collects (docs/ANALYTICS.md, docs/SUPABASE.md):

| Data | When | Linked to the player | Used for |
|---|---|---|---|
| Random install id and gameplay events (screens, catches, levels, purchases with game coins) | Only after "Yes" on the statistics question; builds with GA | No (anonymous id) | Analytics |
| Game save and progress summary | Builds with Supabase (cloud backup) | Yes, to the account | App functionality |
| Name and email from Google / Apple | Only if the player signs in | Yes | Account |
| Captain name and progress summary (levels, best sauce °N, buildings, Fishdex) shown to friends; to non-friends only on the world top list, under a code, never a name | Builds with Supabase, Friends feature | Yes | App functionality (social) |

No ads, no ad ids, no tracking across apps, no payments, no location, no contacts. Players can delete
the account and its data in Settings → Cloud backup → Delete account (both stores require this).

## Not automated (yet)
- Uploading to Google Play from CI (the first upload must be manual; later uploads could use a Play
  service account: founder decision, it needs a Google Cloud service account with release rights).
- Uploading the listing itself. The listing pack is ready in `store/` (see `store/listing.md`):
  screenshots for iPhone 6.9" and Android phones in English and Vietnamese, the Play feature graphic, a
  28 s App Preview video and the SEO copy. They show this app (`mobile/`). Regenerate them with
  `tools/store-shots.mjs`, `tools/store-trailer.mjs` + `tools/store-audio.mjs`.
- Native "Sign in with Apple" sheet on iPhone (today Apple sign-in uses Apple's web page, which the
  App Store accepts; the native sheet is a polish item).
