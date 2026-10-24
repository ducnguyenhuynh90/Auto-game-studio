# Decisions

## D-001 · 2026-10-24 · Web stack: Vite + TypeScript, mobile-portrait web build
- **Why:** fastest iteration loop available in this environment (Node 22, npm, headless Chromium via
  Playwright for automated playtests), shareable as a URL for real playtests on any phone, and wrappable
  for the stores later (Capacitor). No engine licence, no editor needed.
- **Reversible:** game rules (`src/core`) have no rendering dependency, so they port to any engine.

## D-002 · 2026-10-24 · Founder request: cute 3D with three.js
- The founder asked for "three.js, 3D, cute". Implemented as **two layers**: a three.js WebGL world
  (`src/render3d`) under a transparent 2D canvas for UI (`src/scenes`).
- Gameplay logic still runs in 390×844 screen space; the world raycasts screen points onto the water and
  ground plane, so hit-testing, aiming and the visuals always agree. This let the port ship without
  touching tested rules.
- **Style:** toon materials (3-step ramp), inverted-hull ink outlines, low-poly faceted water, chunky
  proportions. All procedural: no asset pipeline yet.
- **Watch:** WebGL performance on low-end Android. There is no device data yet.

## D-003 · 2026-10-24 · °N (độ đạm) as the quality number
- Real Vietnamese fish sauce is graded by protein nitrogen (°N). Using it makes the reveal number feel
  culturally authentic and gives an honest, legible score the player can push up (freshness, salt, aging).

## D-004 · 2026-10-24 · Honest reveal
- Jar quality is fully determined at seal (ingredients, freshness, salt) plus aging at open. The variance
  roll (±2°N) is made when the jar is sealed. The rolling counter only *displays* the value; it never
  decides it. No near-miss manipulation: the "X°N from next tier" line uses the true value.

## D-005 · 2026-10-24 · Retention target kept at D1 38% / D7 14% / D30 6%
- Research puts this near the top decile for casual games (median ≈ 22/4/0.7, puzzle ≈ 32/13/5). Kept
  deliberately ambitious. It will not be lowered to declare success.
