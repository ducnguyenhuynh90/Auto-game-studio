# Native apps (iOS + Android)

Mắm Village ships to the App Store and Google Play as a **Capacitor** app: the same game build
(`dist/`) runs inside the phone's own web view (WKWebView on iOS, Chrome WebView on Android), wrapped in
real native projects (`ios/`, `android/`). One codebase, three targets: web, iOS, Android.

Why Capacitor and not a rewrite (Unity, React Native, Flutter): the game is a three.js world under a 2D
canvas UI, with no DOM UI to port. A rewrite would take months and freeze the game while we still have zero
real-player evidence. Capacitor wraps it in days, and every web improvement ships to the apps too
(D-017). If real devices show performance problems we can't fix in the web view, we revisit then.

## What is native-specific
| Area | Where | What it does |
|---|---|---|
| Native detection | `src/main.ts` | `window.Capacitor.isNativePlatform()`; only then is `src/native/` loaded |
| Back button (Android) | `src/native/back.ts` | closes menus → back to the village → leaves the app (never skips a reveal, story beat or trip) |
| Background / resume | `src/native/index.ts` | saves and uploads on `pause`; on `resume` staff catch up for the time away (also on the web when a tab returns) |
| Haptics | `src/render/audio.ts` + native | web vibration patterns become iOS / Android haptic taps (iOS has no `navigator.vibrate`) |
| Notch / home bar | `src/main.ts` `resize()` | the 390×844 view fits inside the safe area (`env(safe-area-inset-*)` / `--safe-area-inset-*`) |
| Status bar | native | hidden (full-screen game); portrait only (`AndroidManifest.xml`, `Info.plist`) |
| Sign-in | `src/auth/supabase.ts` | Google / Apple / Facebook open in the system browser (Google blocks embedded web views) and return via `com.mamvillage.app://auth/callback` (PKCE code exchange) |
| Account deletion | Settings → "Delete my account and progress" | required by both stores; calls `public.delete_my_account()` (`supabase/migrations/20261026000000_delete_account.sql`) |
| Service worker | `src/main.ts` | off in the app (the files ship inside the install) |
| Icons + splash | `npm run icons` (`tools/make-icons.mjs` renders `tools/icon/scene.ts`) → `assets/`, `mobile/assets/`, `public/` | 1024 icon rendered with the game's 3D models (Lan + Golden Anchovy at sunset), Android adaptive + monochrome layers, splash; every platform size generated |

The app id is **`com.mamvillage.app`** (`capacitor.config.ts`, Android `applicationId`, iOS bundle id,
deep-link scheme). It can't change after the first store upload, so the founder should confirm it first.

## Everyday commands
```bash
npm run cap:sync          # build the game, copy it into android/ and ios/
npx cap open android      # Android Studio (any OS)
npx cap open ios          # Xcode (macOS only)
npm run icons             # redraw icons/splash and regenerate every native size
```
Run on a device: Android Studio ▶ with a phone in USB-debugging mode, or install the CI's debug APK.

**Install on an Android phone (no computer needed):** open
https://github.com/ducnguyenhuynh90/Auto-game-studio/releases/download/android-latest/mam-village.apk
on the phone (or the "Android test build (latest)" release page). Download it, then allow your browser or
Files app to install unknown apps when Android asks, and install. Every push to the default branch
refreshes this APK. Test builds are signed with the committed `android/app/tester.keystore`, so a new one
installs over the old one and keeps the save. This is not the Play upload key.
iOS: Xcode ▶ on a simulator, or on your iPhone with a free Apple ID (7-day signing) before paying for
the developer account.

## CI: `.github/workflows/native.yml`
Every push that touches the game or native projects (and the manual "Run workflow" button):
- **Android:** tests → build → `cap sync` → `assembleDebug` + `bundleRelease`. The artifact holds
  `app-debug.apk` (install it on any Android phone: download, open, allow "install unknown apps") and
  `app-release.aab` (signed for Google Play when the upload-key secrets exist; unsigned otherwise).
  `versionCode` = the run number, so every upload is higher than the last.
- **iOS:** build → `cap sync` → `xcodebuild` for the simulator without signing. This proves the project
  compiles. App Store builds need signing (below).
- Supabase secrets, if set, are baked in the same way as the web build. Without them the app is
  guest-only (progress on the device).

**Verification status (2026-10-25):** CI run #3 builds both apps: the Android debug APK + release AAB
(9.2 MB artifact) and the iOS simulator app (3.4 MB). Not yet run on a real phone. The web layer (back
button rules, safe areas, account deletion, sign-in flow) is covered by `npm test` and
`tools/supabase-e2e.mjs`.

## Founder steps (cost money or accounts: founder approval)
1. **Confirm the app id** `com.mamvillage.app` (or pick another before step 2).
2. **Google Play** (US$25 once): create a Play Console developer account → create the app → set up
   *Internal testing*. Make an upload key and add it as GitHub secrets:
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 upload.jks   # → secret ANDROID_KEYSTORE_BASE64
   ```
   plus `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`. Keep
   `upload.jks` and its password safe outside the repo. Upload the CI's `app-release.aab` to internal
   testing and add tester emails. Use *Play App Signing* (Google holds the final key).
3. **Apple** (US$99 a year): join the Apple Developer Program → App Store Connect → new app with bundle id
   `com.mamvillage.app`. Easiest first build: on a Mac, `npm ci && npm run cap:sync && npx cap open ios`,
   pick your team under *Signing & Capabilities*, *Product → Archive → Distribute → TestFlight*.
   (Automated signing in CI needs an App Store Connect API key + certificate; we can add that once the
   account exists.)
4. **Supabase:** Auth → URL Configuration → Redirect URLs: add `com.mamvillage.app://auth/callback`.
   Apply the new migration (`20261026000000_delete_account.sql`) in the SQL editor.
5. **Store forms** (both stores ask; answers come from what the code really does):
   - Google Analytics (if the GA secret is set): anonymous app-activity and game-progress events shared
     with Google for analytics, only after the player agrees; no advertising, no cross-app tracking.
   - Data collected: a player id (Supabase user id), first name from a linked social login, sign-in
     method, the game save and progress summary, anonymous gameplay events (screens, funnel steps,
     errors) tied to a random install id. No location, contacts, photos, ads or tracking across apps.
   - Account deletion: in the app (Settings). **Google Play also wants a web link** where people can ask
     for deletion: a simple page or email address is enough.
   - Privacy policy URL: both stores require one. It needs founder/legal sign-off (we can draft it).
   - Sign in with Apple: Apple requires it when Google/Facebook login is offered (guideline 4.8). It's in
     the provider list; enabling it in Supabase needs the Apple developer account.
   - Encryption (export compliance): the app only uses standard HTTPS. Founder confirms, then
     `ITSAppUsesNonExemptEncryption = NO` can go in `Info.plist` to skip the question on each upload.
   - Age rating: a casual game with no violence, gambling or user chat.

## Known risks and what to measure first
- **Performance on real phones** is unmeasured: three.js in WKWebView / Android WebView is usually fine
  on 2020+ phones; the quality tiers + FPS governor still apply. First TestFlight / internal test: note
  the fps tier the game picks (Settings → Graphics shows "Auto chose …").
- **Audio unlock** follows the same rules as mobile Safari (the first tap starts sound).
- **Analytics in the app:** events stay on the device unless `VITE_ANALYTICS_URL` is set at build time.
  The Supabase progress summary columns give basic retention/progress evidence meanwhile.
