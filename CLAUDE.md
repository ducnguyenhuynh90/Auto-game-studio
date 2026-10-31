# Mắm Village: agent guide

You are the autonomous studio team. Read **studio/STATE.json** first. It tells you the current objective,
the biggest problem and the next action. Then read PRODUCT.md and SUCCESS.yaml.

## Commands
- `npm run dev`: dev server at :5173. Query params: `?reset=1` wipes the save, `?seed=N`, `?speed=N`,
  `?scene=fishing|reef|reveal|chain|island|estate|puzzles|salt|shop|fpuzzle|sort` (+`&level=N`) (dev-only jump for visual QA).
- `npm test`: unit tests for the game rules (`tests/`).
- `npm run build`: typecheck + production build to `dist/`.
- `node tools/playtest.mjs --trips 6 --skill 0.7 --shots`: bot plays the real game in headless
  Chromium against `npx vite preview --port 4173` (build first; the dev server's HMR reloads kill bot runs), writes screenshots + `playtest-output/report.json`.
- `node tools/flow.mjs "<query>" <prefix> "wait:800;tap:x,y;down:x,y;up:x,y;shot:name"`: scripted screenshots.
- Playwright is preinstalled globally; tools load it through `createRequire`. Do not `npm i playwright`.

- `npx vite-node tools/sim.ts <skill> <trips>`: fast progression/economy simulation (pacing, not fun).
- `node tools/bench.mjs <cpuSlowdown> [low|medium|high]`: fps benchmark on a simulated weak phone.
- Store pack (`store/listing.md`): `npx vite-node tools/store-save.ts`, then against the preview build
  `node tools/store-shots.mjs` (screenshots), `node tools/store-trailer.mjs && node tools/store-audio.mjs` (preview film).
- `node tools/build-artifact.mjs`: single-file build for the claude.ai playtest artifact (then publish it).
- **Mobile app = `mobile/`** (`mobile/android`, `mobile/ios`, Capacitor wrapping the game in `src/`). `npm run cap:sync`
  builds + copies the game into both; `npm run android:apk` / `android:release` / `ios:open`. docs/BUILD_FOR_STORES.md.
  CI (`.github/workflows/native.yml`) builds the Android APK/AAB and an iOS simulator build.
- `archive/react-native/`: the archived React Native version (D-030), not shipped; docs/REACT_NATIVE.md.
- Player data: see docs/ANALYTICS.md ("Pull & analyse").

## Architecture
- `src/core/`: pure rules, no DOM rendering: data/balance, fishing reel, state actions, goals, analytics, save.
- `src/scenes/`: 2D canvas **UI layer** and game flow (village hub, fishing trip, jar fill/reveal, market, Fishdex).
- `src/render3d/`: three.js **world layer** (procedural toon models, rigs per scene, reveal showcase).
  Gameplay positions are 390×844 screen space; the world raycasts them onto the water and ground.
- `src/auth/`: accounts + cloud save (claude.ai identity; Firebase social login when configured).
- `src/render3d/quality.ts`: quality tiers + FPS governor. `src/sw/`: service worker template.
- `src/native/`: iOS/Android glue (Capacitor): back button, pause/resume, haptics, sign-in deep link.
- `src/game.ts`: scene stack, immediate-mode buttons and hit areas, toasts. `src/main.ts`: bootstrap.

## Rules of the studio
- Real player evidence is the only proof of success. Label learnings [PLAYER]/[SIM]/[DESIGN].
- Honest randomness: outcomes are decided before reveal animations; no fake odds or near-miss tricks.
- No randomized paid rewards or real-money mechanics without founder/legal approval.
- Keep STATE.json, EXPERIMENTS.md and LEARNINGS.md current at the end of each iteration.
