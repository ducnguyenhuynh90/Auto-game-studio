# Build the app for Google Play and the App Store (on your own machine)

For the team that submits the React Native app (`mobile/`) with its own Google Play and Apple accounts.
Everything needed is in the repository: the native projects are **generated** from `mobile/app.json` +
`mobile/app.config.js` (Expo "prebuild"), so there are no `android/` or `ios/` folders to keep in sync.
CI does the same thing on every push (`.github/workflows/react-native.yml`) if you'd rather download
its builds; see docs/STORE_RELEASE.md for that route.

## 0. Get the code
```bash
git clone https://github.com/ducnguyenhuynh90/Auto-game-studio.git
cd Auto-game-studio
cd mobile
npm ci                                 # Node 22 LTS; only mobile/ needs installing
cp .env.example .env.local             # then fill it in (step 1)
```
The game rules live in `../src/core` and are compiled into the app from there: keep the whole repository,
not only `mobile/`.

## 1. Settings for this build (`mobile/.env.local`)
| Setting | What | Empty means |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cloud backup, Google / Apple sign-in, Delete account | Offline only; no sign-in |
| `EXPO_PUBLIC_GA_MEASUREMENT_ID`, `EXPO_PUBLIC_GA_API_SECRET` | Google Analytics (asked once, opt-in) | No analytics |
| `MAM_APP_ID` | Bundle id / package name. Default `com.mamvillage.rn`. **Can't change after the first upload** | `com.mamvillage.rn` |
| `MAM_VERSION_NAME` | Version players see, e.g. `1.0.0` | `0.1.0` |
| `MAM_VERSION_CODE` | Build number, **higher on every upload** (Android versionCode, iOS build) | `1` |

Supabase (once): Auth → URL Configuration → Redirect URLs → add `com.mamvillage.rn://auth/callback`, and
enable Google and Apple under Auth → Providers (docs/SUPABASE.md). Apple sign-in is in the app because
the App Store requires it next to Google sign-in.

Check before building: `npx tsc --noEmit && npm run bundle:check` (both must pass).

## 2. Android → Google Play (any OS, Android Studio installed)
1. Use the team's **upload key** (`.jks`). Never commit it (`*.jks` is git-ignored). In the same terminal:
   ```bash
   export ANDROID_KEYSTORE_PATH=/full/path/upload.jks
   export ANDROID_KEYSTORE_PASSWORD=...  ANDROID_KEY_ALIAS=...  ANDROID_KEY_PASSWORD=...
   npm run release:android
   ```
   `mobile/plugins/withReleaseSigning.js` wires these into the generated Gradle project; without them the
   build is signed with the debug key (fine for testers, refused by Play).
2. Upload `mobile/android/app/build/outputs/bundle/release/app-release.aab` in Play Console (Internal
   testing first). `.../apk/release/app-release.apk` installs directly on a phone.
3. Prefer Android Studio? `npm run native:android`, open `mobile/android`, then Build → Generate Signed
   App Bundle with your key.

## 3. iOS → App Store (a Mac with a current Xcode and CocoaPods)
1. `npm run native:ios` (generates `mobile/ios` and installs the pods).
2. `open ios/*.xcworkspace` (the workspace, not the project). In the app target → Signing & Capabilities:
   choose your **Team**, keep "Automatically manage signing". The bundle id is `MAM_APP_ID`.
3. Product → Destination → Any iOS Device, then Product → **Archive** → Distribute App → App Store
   Connect → Upload. The build shows in TestFlight after Apple's processing.
4. Export compliance is pre-answered (`ITSAppUsesNonExemptEncryption = false`: standard HTTPS only).

After changing `.env.local`, `app.json` or any native setting, run the `native:*` script again: it
regenerates the native folder from scratch (`--clean`; it may ask to continue because the repo has
uncommitted changes).

## 4. Or with Expo's cloud builds (EAS), no Mac needed for iOS
`mobile/eas.json` is ready: `npx eas-cli login`, `npx eas-cli init` (once, adds the project id),
`npx eas-cli build --platform all --profile production`, then `npx eas-cli submit`. EAS keeps the
signing keys and raises build numbers itself. Put the `EXPO_PUBLIC_*` values in EAS environment variables
(or `.env.local` when building from your machine). Expo's free plan has a monthly build quota.

## 5. Store forms
Privacy / Data safety answers, account deletion and what the app collects: docs/STORE_RELEASE.md §5.
In short: no ads, no ad ids, no payments; anonymous gameplay statistics only after the player says yes;
name and email only if they sign in with Google / Apple; Settings → Delete account removes everything.

## Troubleshooting
- **"Unable to resolve @core/…" or "../src not found":** the build was started from a copy of `mobile/`
  alone; build inside the full repository.
- **Play: "Version code 1 has already been used":** raise `MAM_VERSION_CODE`, run the `native:*` script
  again, rebuild.
- **iOS: signing errors on Pods targets:** sign only the app target; open the `.xcworkspace`.
- **Sign-in returns to a blank browser page:** the redirect URL in step 1 is missing in Supabase.
