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
- [SIM] Weak-device proxy (headless software GL, DPR 2, 6× CPU slowdown): 2-3 fps → 15-23 fps with the
  low tier, and 4 → 29-55 fps unthrottled. Fill rate (pixel count) dominated; outlines and shadows next.
  The FPS governor steps high → low within about 9 s. Real-device measurements are still missing.
- [SIM] Service worker pitfall: module scripts sent with `Vary: Origin` miss cache lookups unless
  `ignoreVary` is set. The offline reload failed until that was fixed.
- [PLAYER n=1, 2nd device] Opening build 2.2 in a fresh browser storage overwrote that player's play
  summary (the summary was per device, but the doc was per player). Fixed in 2.2.1 with per-device docs;
  the lost doc was restored from an earlier export. On that second visit the first cast came at 7 s
  (vs 99 s on the first visit), but the first visit likely included exploring.
- [FOUNDER] 2026-10-24: goal text was too small, and bare "2/3" counters didn't read as progress. The banner is
  now 18 px with a "Caught 2/3" verb label and a 14 px Next line; the fishing HUD shows the live counter.
- [FOUNDER] 2026-10-24: after many trips catching feels routine; wants puzzle-like thinking and combining.
  Responded with the food-chain layer (D-011, EXP-005).
- [SIM] Food chain: when planners chase hungry fish, the deep Mackerel mission no longer needs the line
  upgrade, so the Phú Quốc story finishes in 4-7 simulated trips (was 8-22). End-game pacing is unchanged
  (2.6-4 h); bottlenecks are still the boat and the Dragon Bay legend.
- [FOUNDER] 2026-10-24: wants the routine automated by staff and the player's time spent on puzzles, on a
  long level track, with a tycoon island map for growth and trading (D-012, EXP-006).
- [SIM] Island automation roughly doubles income and shortens the story ~15%; the boat and legends stay
  the gates. Staff output is capped by jar count and aging time more than by fishers.
- [FOUNDER] 2026-10-24: the main screen didn't reflect the island business; wants a zoomed-out overview
  where buildings and staff are visible at work. Built 3.1 (living island main screen).
- [SIM] Rendering: the estate overview cost ~720 draw calls until static geometry was merged per material
  and clouds instanced (~270). Merge static scenery by default in new 3D scenes.
- [FOUNDER] 2026-10-24 (with reference images): wants one continuous low-poly island you expand, not
  separate plots. Built 3.2. Lesson: for a tycoon map, show territory as regions on one landmass.
- [SIM] Two coplanar surfaces (cliff cap and painted top) z-fought into stripes in the far view; draw
  only the cliff walls and raise the camera's near plane as it zooms out.
- [FOUNDER] 2026-10-25: couldn't sell manually from the island view or the Sauce Shop (the market label is
  hidden when zoomed out). Lesson: every main action must be reachable from every main view.
- [SIM] Brand multipliers inflate late-game coins (~+50% by trip 300) but also give the economy its
  first real coin sink (15000 for the top stage).
- [SIM] In a dev island with 3 fishers and 2 salt makers, the report showed every producer idle: one jar
  was the bottleneck. Production chains need the report to name the true bottleneck, not the symptom.
- [FOUNDER] 2026-10-25: "brewing but no income". Traced: without a shop, staff bottles silently piled up;
  with one jar holding the player's own sauce, the brewer never started. Lesson: a production chain
  must show its stock between steps and say which step stops the money.
- [SIM] 2026-10-25 · A pure depth-first salt maze put too few pans on leaves (3 of 5 asked). A growing-tree
  maze (60% newest cell) plus deterministic seed retries hits the pan count every time; tests guard it.
  This makes the 100-level salt track cheap to extend, but whether generated levels feel as good as
  hand-made ones is unknown until players clear them.
- [SIM] 2026-10-25 · The Capacitor wrapper compiled for iOS on the first CI run; Android failed once on a Groovy
  parsing trap (`versionCode (x).toInteger()` calls the setter first). Use `versionCode = ...` in Gradle files.
- [PLAYER] 2026-10-26 · Founder on an Android phone (claude.ai app), n=1: (1) opening a jar from the
  production line showed a frozen village and no bottle: the 3D layer skipped rendering because a
  full-screen menu sat *under* the opaque reveal; (2) "Make salt" said "You do this" with no way to do
  it; (3) the line's buttons felt unresponsive: 26 px tall, and an AUTO switch's tap area overlapped
  the bottom of "Go fishing". Fixes: render only visible layers, a Rake salt button, 32 px buttons, and
  a 10 px tap tolerance on every button. Lesson: every "You do this" needs a button, and every new
  overlay path into the reveal needs a QA shot.
- [SIM] 2026-10-26 · The career sim caught two dead ends before any player saw them: stage 1 asked for
  staff-made *bottles*, which only count once sold by a Shopkeeper (a shop the same stage unlocks), and a
  "keep 3 Legendary bottles" finale was rarely met at once. Fixed with "Brewers seal 3 jars" and an
  Awards entry action. Any goal that depends on something its own stage unlocks needs a sim run.
- [PLAYER] 2026-10-26 · Founder: the Tour Office came before the income or reputation to use it, and the
  goals didn't feel like a journey. Source of D-019 / EXP-009.
- [PLAYER] 2026-10-26 · Founder (Android): a disabled "Upgrade" that does nothing reads as a bug; "Needs 80
  reputation" without how to earn it is a dead end; hiring was hidden inside building panels and nothing
  said what a worker produces or why the team can't grow forever; the X was hard to hit. Rule from now on:
  every requirement explains itself with numbers and a button (core/help.ts), and every disabled button
  stays tappable to say why.
- [DESIGN] 2026-10-26 · React Native phase 3: putting the save-sync and GA mapping code in pure modules
  (`src/auth/cloudsave.ts`, `src/analytics/gamap.ts`, `mp.ts`) let the app reuse them unchanged and test
  them with fakes. The services bot found one real bug before any player: GA renames events that start
  with `ga_` (reserved prefix), so `ga_consent` arrived as `mam_ga_consent`. Event names now avoid it.
- [DESIGN] 2026-10-27 · Founder: the first goal says "catch 3 fish" but a trip had 5 casts. Trips now
  start at 3 casts (+1 per better boat up to 5, +1 with Rùa), so the goal and the first trip agree.
- [SIM] 2026-10-27 · With 3-cast trips the whole story still ends at ~171 min of fishing for skill 0.7
  (was ~155); Phú Quốc done in ~5 min, Coral Reef ~33 min. Shorter trips, same overall pace.
- [DESIGN] 2026-10-27 · Story v2 (docs/STORY.md §2b): a mystery object (Grandpa's humming jar, one word
  under the glaze per sea), a mentor twist (Bà Năm never forgot), and Mr. Tốc's backstory. Measure with
  `story_view` skip rates (EXP-004) before writing more scenes.
- [SIM] 2026-10-27 · Market Sort: a greedy solver proves all 50 generated levels winnable in < 0.5 s.
  Two bugs only bots found: the whole-shelf tap area sat on top of the slot areas (nothing could be
  picked up), and step-by-step hints could cycle on hard levels; the Hint now follows one whole winning
  plan (detours cut out), so following hints clears every level.
- [PLAYER] 2026-10-28 · Founder: tapping the goal ("upgrade your rod") opened the mission list, not the
  shop. A goal is an instruction; tapping it should take you to where you do it. Now the banner and
  every mission row go there (core/goals.ts goalTarget): the shop with the upgrade highlighted when you
  can afford it, otherwise the step that earns it with "Need N more coins" (sell sauce, or go fishing).
