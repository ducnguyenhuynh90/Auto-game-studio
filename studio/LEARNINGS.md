# Learnings

Label every entry by source: **[PLAYER]** real players · **[SIM]** bot or simulation · **[DESIGN]** reasoning/research.
Only [PLAYER] entries count as product evidence.

- [SIM] 2026-10-24 · A bot playthrough completes catch → seal → trip → reveal → sell → two upgrades in about 3
  trips (about 2.5 min of game time). The economy does not dead-end in the first session.
- [SIM] The bot lands about 95% of hooks with near-perfect freshness. The bot is far better than a human,
  so the reel difficulty is still unknown for real players.
- [DESIGN] Benchmarks (2026): median casual D1 ≈ 22%, top-10% ≈ 40%. Our 38% target is near the top decile.
- [DESIGN] Pure-logic core plus a separate render layer made the 2D → 3D port possible without touching tested rules.
- [SIM] In 3D the fishing camera initially hid the boat and the reel panel covered the fight. Screenshot QA
  caught both. Moving the reel UI to the top keeps the action visible.
- [SIM] Bot reaction timing must use the game clock: headless WebGL runs at a low, uneven frame rate, and
  frame-counted timing made a "low-skill" bot miss 35% of bites. This was a measurement artifact, not a design finding.
- [SIM] With correct timing, low-skill play (noisy tension, reactions up to 1.1 s) still lands 100% of lagoon
  fish; freshness drops (4/20 perfect vs 14/15 for a skilled bot). Open question for real players: does
  catching need more failure risk to feel like skill, or is quality-as-skill the right casual tuning?
- [SIM] Playtests on the Vite dev server die on any file edit (HMR full reload). Run them against `vite preview`.
