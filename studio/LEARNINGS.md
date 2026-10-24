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
- [DESIGN] Persona pass (optimizer): "Go Fishing → Dock" spam aged jars instantly, an exploit that would
  have trivialized the aging decision. Fixed: only full trips (all casts) age jars; docking early says so.
- [DESIGN] Persona pass (new gamer): inside the market nothing pointed at the goal's upgrade. That button now pulses.
- [DESIGN] Persona pass (explorer): tapping the villager did nothing. He now hops and gives context tips.
- [SIM] Memory: geometries stay bounded across trips once removed models are disposed.
- [SIM] Progression sim (tools/sim.ts) caught a softlock before any player saw it: "land N PERFECT
  catches" story missions block low-skill players forever. Story gates now use ★★ (fresh) catches;
  perfection improves sauce instead of gating progress.
- [SIM] With first-pass costs every piece of gear was maxed in about 40 min and coins ballooned. Top-tier
  costs were raised about 3-5× and legendaries get only √ of the bait bonus. Late-game coin sinks are
  still missing (coins pile up after about 3 h). Backlog.
- [DESIGN] The real game makes legendaries easier than the sim does: players see five shadows and pick
  the glowing one. Watch real legendary-catch timing.
- [PLAYER n=1] 2026-10-24, first real playtest (build 1.x, possibly the founder): 4.7 active minutes over
  3 page loads in 90 s; 99 s from launch to first cast; reached the first reveal at 273 s, then chose "Keep",
  opened the market twice and never sold. Left on the village screen. Perfect catches 1/9 (bots: ~15/15).
  → The first sale is a tutorial cliff: the first reveal now offers only "Sell", and a hand points at
    "Sell all" in the market until the first sale. JS errors are now tracked to explain reloads.
  → Real reel skill is far below bot skill: never gate story progress on perfect play (already fixed in 2.0).
  n=1, so these are leads, not conclusions.
