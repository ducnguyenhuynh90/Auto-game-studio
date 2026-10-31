# Build the app for Google Play and the App Store

For the team that submits **Mắm Village** with its own Google Play and Apple accounts.

**The mobile app is `mobile/`.** It holds the two native projects, `mobile/android` (Android Studio /
Gradle) and `mobile/ios` (Xcode), plus the icon and splash art (`mobile/assets`). The game itself is
the 3D web game in `src/`, which runs inside the app (Capacitor). `npm run cap:sync` builds the game and
copies it into both native projects. The app you install is the same game as the website, with the
same features, and it matches the store screenshots and video in `store/`.

> The older React Native version is kept in `archive/react-native/` for reference only. Don't ship it.

## 0. Get the code and tools
```bash
git clone https://github.com/ducnguyenhuynh90/Auto-game-studio.git
cd Auto-game-studio
npm ci                                 # Node 22 LTS, at the repository root
```
- **Android:** JDK 21 and the Android SDK (easiest: install Android Studio).
- **iOS:** a Mac with Xcode 16 or newer, signed in to your Apple Developer team.

Work from the repository root: the game (`src/`) and the app (`mobile/`) belong together.

## 1. Build settings (`.env.local`)
Copy `build.env.example` to `.env.local` at the repository root. The public Supabase values (cloud saves,
Google sign-in, friends) are already filled in. Add the signing values for the store you're building.
Vite reads `.env.local` automatically. For the Android signing values, also export them to the shell:
```bash
set -a; source .env.local; set +a
```

| Setting | Turns on | If left empty |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (filled in) | Cloud save, Google / Apple sign-in, Friends, invites, Delete account | Guest-only, saved on the phone |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics (players opt in) | No analytics |
| `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | A Play-ready signed `.aab` | Unsigned release bundle |
| `MAM_VERSION_NAME`, `MAM_VERSION_CODE` | The version shown and the build number | 1.0.0 / 1 |

## 2. Google Play (Android)
1. Create the upload key once and keep it safe (Google Play App Signing holds the real app key; a lost
   upload key can be reset through Play support):
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Put its path and passwords in `.env.local`. Raise `MAM_VERSION_CODE` by 1 for every upload.
2. Build the release bundle:
   ```bash
   set -a; source .env.local; set +a
   npm run android:release        # → mobile/android/app/build/outputs/bundle/release/app-release.aab
   ```
3. Play Console → create the app (`com.mamvillage.app`) → **Testing → Internal testing → Create release**
   → upload the `.aab`. Google requires the first upload to be done by hand.
4. Prefer Android Studio? `npm run cap:sync`, then `npx cap open android` → Build → Generate Signed Bundle.
5. A test APK for any phone: `npm run android:apk` → `mobile/android/app/build/outputs/apk/debug/`.

## 3. App Store (iOS)
1. App Store Connect → Apps → **+** → New app, bundle id **`com.mamvillage.app`**.
2. On the Mac:
   ```bash
   npm run ios:open               # builds the game, syncs it, opens mobile/ios in Xcode
   ```
3. In Xcode: the **App** target → *Signing & Capabilities* → choose your Team (automatic signing). Under
   *General*, set **Version** (e.g. 1.0.0) and **Build** (raise it for every upload).
4. Pick **Any iOS Device (arm64)** → **Product → Archive** → Organizer → **Distribute App → App Store
   Connect → Upload**. The build appears in TestFlight after Apple's processing (10-30 minutes).

Or let GitHub do it: add the App Store Connect secrets (docs/STORE_RELEASE.md), then **Actions →
Native apps (Android + iOS) → Run workflow → tick testflight**.

## 4. Before the first submission
- Supabase → Authentication → URL Configuration → Redirect URLs must include
  `com.mamvillage.app://auth/callback` (sign-in returns to the app through it).
- Store listing, screenshots, video and SEO copy: `store/listing.md`.
- Privacy answers (Data safety / App Privacy): docs/STORE_RELEASE.md §5.
- Account deletion is in the app (Settings), as both stores require.

## Ready-to-upload checklist (checked 2026-10-31)
| Item | Status |
|---|---|
| Android and iOS projects build (CI, every push) | ✓ |
| Android target API 36, only the Internet permission, portrait | ✓ |
| App icon: opaque 1024 (iOS), adaptive + round (Android) | ✓ |
| iPhone only (no iPad screenshots needed); export compliance declared (`ITSAppUsesNonExemptEncryption = NO`) | ✓ |
| Account deletion inside the app (Settings) | ✓ |
| Privacy policy: https://ducnguyenhuynh90.github.io/Auto-game-studio/privacy.html (also linked in Settings) | ✓ (founder: review the wording) |
| Account deletion web page (Google Play requires it): https://ducnguyenhuynh90.github.io/Auto-game-studio/delete-account.html | ✓ |
| Sign-in buttons only for working providers (`VITE_AUTH_PROVIDERS`, default Google; hidden on iPhone until Sign in with Apple is set up) | ✓ |
| Store listing, screenshots, video, feature graphic (`store/`) | ✓ |
| Supabase database (accounts, saves, friends, invites, gifts) | ✓ live |
| Store forms (Data safety, App Privacy, content rating, review notes): ready-to-paste answers in `store/store-forms.md` | ✓ |
| **Your team:** Play upload key, Apple team signing, a support email on both store pages, target age group | to do |

**Google Play, new personal developer accounts:** Google requires a closed test with at least 12 testers
for 14 days before the first production release. Organisation accounts can skip it. Plan for it.

## When something goes wrong
- **The app shows an old version of the game:** run `npm run cap:sync` again (it rebuilds `dist/` and
  copies it into `mobile/android` and `mobile/ios`).
- **Gradle can't find `@capacitor/android`:** run `npm ci` at the repository root. The native projects
  load Capacitor from the root `node_modules`.
- **Release build is unsigned:** the `ANDROID_*` variables weren't exported in this shell (`set -a; source .env.local; set +a`).
- **iOS "No signing certificate":** pick your Team in Signing & Capabilities, and make sure the Apple
  ID in Xcode → Settings → Accounts belongs to that team.
- **Google sign-in doesn't return to the app:** the redirect URL above is missing in Supabase.
