# Mắm Village: the mobile app (Android + iOS)

This folder is the app that ships to Google Play and the App Store.

| Folder | What it is | Open with |
|---|---|---|
| `android/` | The Android project (`com.mamvillage.app`) | Android Studio, or `./gradlew` |
| `ios/` | The iOS project (`com.mamvillage.app`) | Xcode (on a Mac) |
| `assets/` | Icon and splash source art (rendered by `tools/make-icons.mjs`) | `npm run icons` |

The game inside the app is the 3D game in `../src` (the same as the website). Capacitor wraps it, so the
app has every feature of the web game: fishing, the fish-sauce jars, the island business, the story,
Market Sort, friends, invites and brag pictures.

## Build (from the repository root)
```bash
npm ci
npm run android:apk       # test APK  → mobile/android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # Play AAB  → mobile/android/app/build/outputs/bundle/release/app-release.aab
npm run ios:open          # opens mobile/ios in Xcode → Product → Archive → upload
```
Step by step, with signing and store setup: **[../docs/BUILD_FOR_STORES.md](../docs/BUILD_FOR_STORES.md)**.
Build settings: `../build.env.example` (copy it to `../.env.local`).

Every push builds the APK, a Play bundle and an iOS simulator build in GitHub Actions
(`.github/workflows/native.yml`). The newest test APK is always at
https://github.com/ducnguyenhuynh90/Auto-game-studio/releases/download/android-latest/mam-village.apk
