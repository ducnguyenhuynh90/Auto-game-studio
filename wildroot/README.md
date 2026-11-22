# WILDROOT MVP (prototype)

Playable prototype for the WILDROOT GDD v0.1: one low-poly 3D pond island (three.js, the studio's engine
in Mắm Village), played with cards. A path of 6 short lessons adds one card and one idea at a time
(watch → hide → release? → green water → winter → mosquitoes), then 2 open challenges. Each level opens
with an intro card, guides one step at a time, ends with stars, a one-line takeaway (or a hint naming the
biggest cause on failure) and a flip-over knowledge card. Tap a goal chip to ask Why?

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

## Levels (solver, 40 seeds)
- Lessons: each is won only by its lesson card ("release" is the trap: releasing frogs alone loses;
  "green" has two answers, shade or reeds). Doing nothing loses every lesson.
- **Ếch đi đâu mất?** (budget 3, all cards): 4 minimal winners, no dominant action.
- **Mùa khô** (budget 4): 7 winners; shade (useless in the first challenge) matters because it slows drying.

All numbers are gameplay values, not verified ecological parameters. [SIM] only: no player has played it yet.
