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

## Next phase
3. **World and polish:** the 3D village and sea (three.js on `expo-gl`, or a 2.5D Skia scene), story
   scenes, fishing puzzles + food chain + gadgets + the sea chart (Hạ Long Bay, the Abyss), Mực's trip
   surprises, beach soundscape (`expo-audio`), accounts (supabase-js works in React Native), Google
   Analytics (Firebase Analytics native SDK), store release signing (EAS or CI).

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
Mực and clears Salt 1 and Shop 1. CI: `.github/workflows/react-native.yml` type-checks, bundles, runs both play-through bots (screenshots
uploaded), then `expo prebuild` +
Gradle builds a release APK (debug-signed: installs on any phone) and Xcode builds the iOS simulator app.

**Verified (2026-10-26):** CI run #2 of `react-native.yml` built both native apps: the Android release APK
(57.7 MB artifact) and the iOS simulator app (31 MB). Not yet run on a real phone.

**Run on a phone:** Android: download the CI artifact `mam-village-rn-android-N`, install `app-release.apk`.
iPhone: a development build needs a Mac with Xcode (`npx expo run:ios`) or EAS Build (Expo account; the
paid plan only if the free build queue is too slow: founder decision).
