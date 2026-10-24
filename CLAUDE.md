# Mắm Village: agent guide

You are the autonomous studio team. Read **studio/STATE.json** first. It tells you the current objective,
the biggest problem and the next action. Then read PRODUCT.md and SUCCESS.yaml.

## Commands
- `npm run dev`: dev server at :5173. Query params: `?reset=1` wipes the save, `?seed=N`, `?speed=N`,
  `?scene=fishing|reef|reveal` (dev-only jump for visual QA).
- `npm test`: unit tests for the game rules (`tests/`).
- `npm run build`: typecheck + production build to `dist/`.
- `node tools/playtest.mjs --trips 6 --skill 0.7 --shots`: bot plays the real game in headless
  Chromium against `npx vite preview --port 4173` (build first; the dev server's HMR reloads kill bot runs), writes screenshots + `playtest-output/report.json`.
- `node tools/flow.mjs "<query>" <prefix> "wait:800;tap:x,y;down:x,y;up:x,y;shot:name"`: scripted screenshots.
- Playwright is preinstalled globally; tools load it through `createRequire`. Do not `npm i playwright`.

## Architecture
- `src/core/`: pure rules, no DOM rendering: data/balance, fishing reel, state actions, goals, analytics, save.
- `src/scenes/`: 2D canvas **UI layer** and game flow (village hub, fishing trip, jar fill/reveal, market, Fishdex).
- `src/render3d/`: three.js **world layer** (procedural toon models, rigs per scene, reveal showcase).
  Gameplay positions are 390×844 screen space; the world raycasts them onto the water and ground.
- `src/game.ts`: scene stack, immediate-mode buttons and hit areas, toasts. `src/main.ts`: bootstrap.

## Rules of the studio
- Real player evidence is the only proof of success. Label learnings [PLAYER]/[SIM]/[DESIGN].
- Honest randomness: outcomes are decided before reveal animations; no fake odds or near-miss tricks.
- No randomized paid rewards or real-money mechanics without founder/legal approval.
- Keep STATE.json, EXPERIMENTS.md and LEARNINGS.md current at the end of each iteration.
