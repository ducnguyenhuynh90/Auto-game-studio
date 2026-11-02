# Mắm Village: the mobile app (Android + iOS, React Native)

This folder is the app that ships to Google Play and the App Store (`com.mamvillage.app`).

It is a **native React Native app (Expo SDK 58, React Native 0.88) with no WebView**. It runs the game's
own code from `../src`: the rules, every scene and menu, the 3D world, accounts, friends, invites and brag
pictures. Nothing is written twice, so the app behaves exactly like the web game. It draws natively:

| Layer | How | File |
|---|---|---|
| 3D world | three.js (the web game's `src/render3d`) on **expo-gl** (OpenGL ES) | `src/glhost.ts` |
| 2D UI (menus, HUD, cards) | **Skia** through a `CanvasRenderingContext2D` stand-in | `src/canvas2d.ts` |
| Start-up | `bootGame()`, shared with the web page (`../src/boot.ts`) | `App.tsx` |
| Phone services | share sheet, clipboard, sign-in browser, text box, haptics, Android back button | `App.tsx` → `../src/platform.ts` |
| Saves | SQLite-backed `localStorage` (`expo-sqlite`) | `index.ts` |
| Sound | the web game's sound engine on `react-native-audio-api` | `src/audio.ts` |
| Font | Nunito (with Vietnamese), bundled; symbols and emoji use the phone's own fonts | `assets/fonts/` |
| Self-test | the playtest bot plays the app from a launch link | `src/autotest.ts` |

The shared code reads its build settings the Vite way (`import.meta.env.VITE_*`, `__SUPABASE__`);
`plugins/babel-vite-env.js` writes them in when Metro bundles.

## Build (from this folder)
```bash
npm ci
npx expo prebuild                 # makes android/ and ios/ (generated, not committed)
npx expo run:android              # debug build on a phone/emulator, live reload from your computer
npx expo run:ios                  # same for iPhone (Mac + Xcode)
cd android && ./gradlew assembleRelease   # test APK  → android/app/build/outputs/apk/release/
cd android && ./gradlew bundleRelease     # Play AAB  → android/app/build/outputs/bundle/release/
```
Step by step, with signing and store setup: **[../docs/BUILD_FOR_STORES.md](../docs/BUILD_FOR_STORES.md)**.
Testing on your own Android phone from a Mac: **[../docs/PHONE_TESTING.md](../docs/PHONE_TESTING.md)**.

Every push builds the test APK, a Play bundle and an iOS simulator build in GitHub Actions
(`.github/workflows/native.yml`), and the bot plays the APK on an Android emulator. The newest test APK is
always at https://github.com/ducnguyenhuynh90/Auto-game-studio/releases/download/android-latest/mam-village.apk

Signing (`plugins/withReleaseSigning.js`): test APKs use the committed test key `plugins/tester.keystore`
(not a secret, not the Play key). The Play bundle uses the upload key from `ANDROID_KEYSTORE_*`.
