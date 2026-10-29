# Releasing the React Native app to Google Play and the App Store

> Building on your own machine with your own store accounts? Start with docs/BUILD_FOR_STORES.md.
> This page is the CI route (GitHub builds and signs) plus the store forms.

The pipeline is ready in CI (`.github/workflows/react-native.yml`). The store accounts, keys and
listings belong to the founder, so this page lists what to set up and what CI does with it. Nothing
here spends money or publishes anything until the founder creates the accounts and adds the secrets.

**Costs (founder decision):** Google Play developer account, US$25 once. Apple Developer Program,
US$99 per year. Neither is needed to keep testing with the CI downloads.

## What CI builds
| Run | Android | iOS |
|---|---|---|
| Every push | `mam-village-rn-android-N`: `app-release.apk` (installs on any phone). With the upload key also `app-release.aab` for Google Play | Simulator app (proves it compiles) |
| Actions → React Native app → Run workflow → tick **testflight** | (same) | Archives, signs and uploads build N to TestFlight |

Version numbers come from the run number: version name `1.0.N`, Android `versionCode` N, iOS build N
(`mobile/app.config.js`), so every upload is higher than the last.

## 1. Pick the app id (once, before the first upload; it can't change later)
The React Native app is `com.mamvillage.rn`, so it installs next to the older Capacitor test app
(`com.mamvillage.app`). For the store, pick one id. To publish the React Native app as
`com.mamvillage.app`, add a repository **variable** (Settings → Secrets and variables → Actions →
Variables) `MAM_APP_ID` = `com.mamvillage.app`; every CI build then uses it. Neither app is in a store yet, so either id is free.

## 2. Google Play
1. Create the upload key on your computer (keep the file and passwords safe; Google Play App Signing
   holds the real app key, so a lost upload key can be reset):
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -i upload.jks | pbcopy        # macOS (Linux: base64 -w0 upload.jks)
   ```
2. GitHub → Settings → Secrets and variables → Actions → New repository secret (the same names the
   Capacitor build uses, so one key serves either app):
   `ANDROID_KEYSTORE_BASE64` (the base64 text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
   (`upload`), `ANDROID_KEY_PASSWORD`.
3. The next push builds a signed `app-release.aab`. The "Show which key signed the APK" step in the
   log shows your key's fingerprint instead of "Android Debug".
4. Play Console: create the app, then **Testing → Internal testing → Create release** and upload the
   `.aab` from the CI download (Google requires the first upload by hand). Add testers by email.
5. Store listing, content rating questionnaire, target audience, and **Data safety** (below).

## 3. App Store (TestFlight first)
1. Join the Apple Developer Program with the company or founder's Apple ID.
2. App Store Connect → Apps → **+** → New app, bundle id `com.mamvillage.rn` (or the id from step 1).
3. App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate a key
   with the **Admin** role (Xcode needs it to create the signing certificate and profile in the cloud).
   Download the `.p8` file (only once).
4. GitHub secrets: `APPLE_TEAM_ID` (Membership page), `ASC_KEY_ID`, `ASC_ISSUER_ID` (on the API keys
   page), `ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`).
5. Actions → React Native app → Run workflow → tick **testflight**. The build appears in TestFlight
   after Apple's processing (about 10-30 minutes); add testers there.
6. Export compliance is answered in the app (`ITSAppUsesNonExemptEncryption = false`: only standard
   HTTPS).

## 4. Sign-in redirect (Supabase)
Supabase → Auth → URL Configuration → Redirect URLs: add `com.mamvillage.rn://auth/callback`. Google
and Apple must be enabled under Auth → Providers (docs/SUPABASE.md). Apple sign-in is offered next to
Google because the App Store requires it for apps with third-party sign-in.

## 5. Privacy answers (Play "Data safety" / App Store "App Privacy")
What the game actually collects (docs/ANALYTICS.md, docs/SUPABASE.md):

| Data | When | Linked to the player | Used for |
|---|---|---|---|
| Random install id and gameplay events (screens, catches, levels, purchases with game coins) | Only after "Yes" on the statistics question; builds with GA | No (anonymous id) | Analytics |
| Game save and progress summary | Builds with Supabase (cloud backup) | Yes, to the account | App functionality |
| Name and email from Google / Apple | Only if the player signs in | Yes | Account |

No ads, no ad ids, no tracking across apps, no payments, no location, no contacts. Players can delete
the account and its data in Settings → Cloud backup → Delete account (both stores require this).

## Not automated (yet)
- Uploading to Google Play from CI (the first upload must be manual; later uploads could use a Play
  service account: founder decision, it needs a Google Cloud service account with release rights).
- Uploading the listing itself. The listing pack is ready in `store/` (see `store/listing.md`):
  screenshots for iPhone 6.9" and Android phones in English and Vietnamese, the Play feature graphic, a
  28 s App Preview video and the SEO copy. They show the 3D (Capacitor) app. Regenerate them with
  `tools/store-shots.mjs`, `tools/store-trailer.mjs` + `tools/store-audio.mjs`.
- Native "Sign in with Apple" sheet on iPhone (today Apple sign-in uses Apple's web page, which the
  App Store accepts; the native sheet is a polish item).
