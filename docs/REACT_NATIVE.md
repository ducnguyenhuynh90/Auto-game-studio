# React Native app (`mobile/`)

The founder chose React Native for the iOS / Android apps (D-021). It lives in its own folder so the web
game, the Capacitor apps (`android/`, `ios/`) and their CI are untouched.

**Versions (latest stable, 2026-10-26):** Expo SDK 58.0.19, React Native 0.88.0 (the version Expo 58 pins),
React 19.3.0, `@shopify/react-native-skia` 2.14.0, Reanimated 4.7.1, `expo-sqlite` 58. App id
`com.mamvillage.rn` (separate from the Capacitor app's `com.mamvillage.app`, so both can be installed side
by side while we compare; the founder picks one id for the store).

## One set of rules
- `mobile/` imports the web game's **`src/core`** directly (`@core/...`, see `metro.config.js` and
  `tsconfig.json`). 4,290 lines of tested rules (economy, jars, fishing reel, goals, missions, Road,
  staff, puzzles, saves) are shared, not copied. Rule changes happen once, in `src/core`, with its
  `npm test` suite at the repo root.
- `expo-sqlite/localStorage/install` gives the shared save code a synchronous `localStorage` (SQLite).
  The save format is the web game's, so cloud saves can move between web and app later.
- `import.meta.env` in the core is rewritten by `babel-preset-expo` (always empty in the app).

## What is built (phase 1: the core loop)
| Screen | File | Shared rules used |
|---|---|---|
| Village hub: goal banner, title/level, jars, bucket | `src/screens/Village.tsx` | `goalPair`, `careerTitle`, `agingLevel` |
| Fishing: hold to cast (red = tangle), bite, reel tension (Skia) | `src/screens/Fishing.tsx` | `castPower`, `castDistance`, `rollShadow`, `Reel`, `addCatch`, `finishTrip` |
| Fill a jar: pick 3 or Best 3, recipe + °N preview | `src/screens/JarFill.tsx` | `recipeFor`, `baseDegrees`, `bestJarFill`, `sealJar` |
| Reveal: knock ×3, °N count-up (decided before), sell or store | `src/screens/Reveal.tsx` | `jarDegrees`, `openJar`, `tierFor`, `sellProduct` |
| Market: sell bottles and spare fish, buy upgrades | `src/screens/Market.tsx` | `sellProduct`, `sellFish`, `upgradeCost`, `buyUpgrade` |
| Goals, missions, Road stages, saving, toasts; island staff keep working (1 s tick + catch-up on resume) | `src/store.ts` | `checkGoals`, `checkMissions`, `checkCareer`, `tickIsland`, `catchUp`, `saveState` |

Also: haptics (expo-haptics), Android back button (one screen back), safe areas, portrait, 48 px close
buttons with a 16 px touch slop, the same analytics events (tagged `app: 'react-native'`).

## Phase 2: the island business (done)
| Screen | File | Shared rules used |
|---|---|---|
| Island map: buy plots (specials disguised, "locals say…"), build, upgrade, hire, train, dismiss | `src/screens/Island.tsx` | `canExpand`, `plotCost`, `buyPlot`, `placeProblem`, `build`, `upgradeBuilding`, `hire`, `trainStaff` |
| Your Team: every job's rate per hour, training gains, team size that grows with fame | `src/screens/Business.tsx` | `core/team.ts` |
| How it's made: each step with AUTO / YOU, "+ Hire", Rake salt, staff line estimate + bottleneck | `src/screens/Business.tsx` | `lineEstimate`, `setAuto`, `rakeSalt` |
| Brand (with "How? ⓘ"), Road to the World's Best (+ Awards entries, stage-up card), Business report (linked fixes), Mực | `src/screens/Business.tsx` | `core/brand.ts`, `core/career.ts`, `core/business.ts`, `core/dog.ts` |
| Puzzles hub, Salt channels, Shop orders (rewards + staff training caps) | `src/screens/Puzzles.tsx` | `core/puzzles.ts` |
| ⓘ cards on every locked button | `src/ui.tsx` (`whyNot`, `HelpSheet`) | `core/help.ts` |

## Phase 3: world, story, sound, accounts, analytics (done)
| What | File | Shared code used |
|---|---|---|
| Living village behind the hub (Skia, ~30 fps): clouds, waves, your boat (sail from the Junk Sailboat), swaying palm, one house per kind of building, workers walking, Mực wagging | `src/scene/LivingVillage.tsx` | game state |
| Story scenes: chapter cards, speaker lines, tap to go on, Skip | `src/screens/Story.tsx`, `store.ts` (`checkStory`, `playStory`) | `core/story.ts` |
| Fishing parity: food chain (a hungry fish rushes the bait after a small catch), Mực's fetch / find surprises, fishing puzzles (fixed school + goal) | `src/screens/Fishing.tsx` | `core/chain.ts`, `core/dog.ts`, `core/puzzles.ts` |
| Sea Chart: five seas, missions with progress, relics, why a sea is locked (ⓘ) | `src/screens/SeaChart.tsx` | `core/seas.ts` |
| Beach soundscape + effects: the web game's own sound engine on `react-native-audio-api` (Web Audio API on iOS / Android) | `src/audio.ts` | `src/render/audio.ts`, `src/render/ambience.ts` |
| Settings: Sound, Music, play statistics, cloud backup, two-save choice, Delete account | `src/screens/Settings.tsx` | |
| Cloud backup (Supabase, anonymous account on first launch, same tables and merge rules as the web game) | `src/cloud.ts` | `src/auth/cloudsave.ts`, `src/auth/merge.ts` |
| Google Analytics 4 (Measurement Protocol, opt-in card after the first catch, same events and player properties as the web) | `src/ga.ts`, `src/screens/Consent.tsx` | `src/analytics/gamap.ts`, `src/analytics/mp.ts` |

**Turning the services on** (build-time settings; unset = off and the app plays offline as before). CI reads
repository secrets: the Supabase ones the web build already uses, plus one new GA secret.

| Setting (EXPO_PUBLIC_…) | CI secret | Where to get it |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anonymous sign-ins must be on: Auth → Providers) |
| `GA_MEASUREMENT_ID` | `VITE_GA_MEASUREMENT_ID` | GA4 → Admin → Data streams |
| `GA_API_SECRET` | `GA_API_SECRET` (new) | GA4 → Admin → Data streams → the stream → Measurement Protocol API secrets → Create |

Optional: `EXPO_PUBLIC_GA_CONSENT=granted` skips the question (founder/legal call, as on the web).
The API secret ships inside the app, like any client key: it can only send events, and Google lets you
rotate it.

## Accounts and store release (done)
- **Google / Apple sign-in** (Settings → Cloud backup, `src/cloud.ts`): links the identity to the
  anonymous account (same save), or signs in to an account that already has a save and asks which to
  keep. Opens the provider in the system browser and returns by `com.mamvillage.rn://auth/callback`
  (PKCE). Supabase must list that redirect URL.
- **Store release** (docs/STORE_RELEASE.md): Android release builds are signed with the Google Play
  upload key when CI has it (`plugins/withReleaseSigning.js`) and also produce the `.aab`; iOS archives
  and uploads to TestFlight on request with an App Store Connect API key. Versions come from the CI run
  number (`app.config.js`).

## Next
- Run on real phones (Android APK from CI; iPhone through TestFlight once the Apple account exists).
- Store listing, screenshots, privacy answers (docs/STORE_RELEASE.md), then the founder picks this app
  or the Capacitor one for the stores.
- The 3D world (three.js on `expo-gl`) if the 2.5D Skia scene tests worse with players than the web's 3D.

## Build and test
```bash
cd mobile && npm ci
npx tsc --noEmit                                     # types (includes ../src/core)
npx expo export --platform android --platform ios    # Hermes bundles: proves the JS compiles for phones
npm run web:setup && npx expo export --platform web --output-dir /tmp/rn-web
(cd /tmp/rn-web && python3 -m http.server 4181 &) && node tools/web-e2e.mjs http://localhost:4181/
```
`tools/web-e2e.mjs` plays the app like a person in Chromium (React Native Web + Skia/CanvasKit): two
fishing trips by watching the reel tension, fill and seal a jar, age it, open it, sell it, reload and
check the save. `tools/web-e2e-business.mjs` buys land, builds, hires, opens ⓘ cards, rakes salt, feeds
Mực and clears Salt 1 and Shop 1; the core bot also reads the intro story, opens the Sea Chart (a locked
sea explains itself), toggles sound in Settings and starts Fishing puzzle 1. `tools/web-e2e-services.mjs`
runs a build with the services on against fake Supabase and GA servers: anonymous sign-in and backup on
first launch, no GA traffic before "yes", the right events and player properties after it, and Delete
account (server call, fresh local game, new anonymous account). CI: `.github/workflows/react-native.yml` type-checks, bundles, runs both play-through bots (screenshots
uploaded), then `expo prebuild` +
Gradle builds a release APK (debug-signed: installs on any phone) and Xcode builds the iOS simulator app.

**Verified (2026-10-26):** CI run #2 of `react-native.yml` built both native apps: the Android release APK
(57.7 MB artifact) and the iOS simulator app (31 MB). Not yet run on a real phone.

**Run on a phone:** Android: download the CI artifact `mam-village-rn-android-N`, install `app-release.apk`.
iPhone: a development build needs a Mac with Xcode (`npx expo run:ios`) or EAS Build (Expo account; the
paid plan only if the free build queue is too slow: founder decision).
