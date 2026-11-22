# WILDROOT MVP (prototype)

Playable prototype for the WILDROOT GDD v0.1: one pond, two parallel worlds, one shared timeline.
Rendered as two low-poly 3D island dioramas (three.js, the studio's engine in Mắm Village), played with
cards: drag a card onto an island (or tap card → tap island), press ▶, watch 5 years of seasons, earn
stars, collect winning strategies and discovery cards. Tap a goal chip under an island to ask Why?
It tests the riskiest question first: does the "fork → intervene → scrub → compare → why?" loop
make people understand cause and effect and want to retry? Not production code, not final art.

## Run
- `npm run wr:dev`: dev server (open the printed URL)
- `npm run wr:test`: determinism, solver gates, causal chains, explanations
- `npm run wr:solve [levelId] [seeds]`: every action set within budget, win rate over many seeds
- `npx vite-node wildroot/tools/trace.ts <levelId> <seed> reeds+logs`: season-by-season numbers
- `npm run wr:artifact`: single-file page for a claude.ai playtest link (`wildroot/dist/wildroot-artifact.html`)
- `npm run wr:shots`: after `wr:artifact`, plays one round headless (desktop + iPhone 13) and saves screenshots

## What is in it
- `src/sim.ts`: pure deterministic sim (season steps, seeded weather). 6 species groups: fish, frogs,
  mosquito larvae, dragonflies, water plants, algae. Every step records its causes (fish predation,
  refuge, oxygen, drought, winter, hunger), so "Vì sao?" reads the sim instead of guessing.
- `src/solver.ts`: level gate. A level ships only if ≥2 minimal strategies win on ≥80% of seeds and
  no action is in every winner.
- `src/game/scene.ts`: three.js dioramas (instanced tiles and creatures, seasons, snow). `src/game/audio.ts`: WebAudio blips.
- `src/main.ts`: game flow (title → plan → run → result → review), cards, stars, tutorial, sheets.
- `src/explain.ts`: "Vì sao?" panels, event log, 8 discoveries (observation, evidence, try next,
  real-world note).
- Telemetry stays local in `window.__wildroot` (GDD 18.1 names + `world_forked`, `timeline_scrubbed`).
  No PostHog key is wired in yet.

## Levels (solver results, 40 seeds)
- **Màn 1, Ếch đi đâu mất?** (budget 3): 4 minimal winners: reeds+logs, reeds+removeFish,
  reeds+addFrogs, removeFish+addFrogs+logs. Doing nothing, releasing frogs alone and feeding fish lose.
- **Màn 2, Mùa khô kéo dài** (budget 4): 7 winners; shade (useless in level 1) now matters because it
  slows the shallow water drying out.

All numbers are gameplay values, not verified ecological parameters. [SIM] only: no player has played it yet.
