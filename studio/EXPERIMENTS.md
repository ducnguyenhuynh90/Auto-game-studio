# Experiments

## EXP-001 · Ferment-while-you-fish drives the second trip
- **Problem:** casual fishing games risk "one trip and done". We need a reason to cast again right away.
- **Evidence:** none from players yet. Design reasoning: a sealed jar becomes ready only after the next
  trip, which makes the second trip the path to the reveal.
- **Hypothesis:** if jars ripen "after one fishing trip", then the second-trip rate will be ≥ 55% of
  first launches, because the player wants to see the reveal.
- **Change:** jar readiness = 1 completed trip OR 90 s of real time; goal chain points at "Go fishing while it ferments".
- **Primary metric:** funnel `second_trip_start / first_launch`.
- **Secondary:** `first_reveal / first_seal`, time to first reveal, `third_trip_start`.
- **Guardrails:** tutorial completion (`first_sale`) ≥ 85% of `first_catch`; no rise in early quits on the village screen.
- **Expected outcome:** second trip ≥ 55%, first reveal ≥ 70% of seals.
- **Cost:** shipped in the slice.
- **Result:** NOT YET MEASURED. There are no real players. A bot playthrough (simulation) completes the loop:
  first seal → second trip → reveal → sale → upgrade with no errors.
- **Decision:** pending real data.

## EXP-002 · 3D cute presentation (founder request)
- **Hypothesis:** a cute 3D world raises the first-session "wow" and ad-creative appeal compared with flat 2D.
- **Primary metric:** first-session length and second-trip rate vs the 2D build (commit
  "Vertical slice v0 (2D canvas)" is kept in git history as the control).
- **Guardrails:** load time < 3 s on mid-range phones; frame rate ≥ 50 fps; crash-free ≥ 99.5%.
- **Result:** not measured. Visual QA by screenshots only.

## EXP-003 · Visible goal chain + sea story increases session length and return rate
- **Problem:** after the tutorial the old goal list ran out of clear direction, and the founder wanted
  the current and next goal always visible, plus long-term reasons to return.
- **Hypothesis:** a GOAL + NEXT banner and a five-sea story route with relic rewards will raise median
  active minutes per session and D1/D7 return versus build 1.2.
- **Primary metric:** median active minutes (playsummary.activeSec); D1 (analyze-plays).
- **Secondary:** mission completions per player, sea reached, Captain level, Missions-log opens (screens.missions).
- **Guardrails:** tutorial completion (first_sale/first_catch) must not drop; tangles should stay under
  about 15% of casts (counts.cast vs tangles) or the failure feels unfair.
- **Pacing (simulation, NOT evidence):** Reef unlock at 10-30 min, Dragon Bay at 45-65 min, the Abyss at
  2.4-3.3 h, full story at 2.7-3.7 h across skills 0.4-0.8 (`npx vite-node tools/sim.ts <skill> 400`).
- **Result:** pending real players.

## EXP-004 · A Pixar-structured story increases attachment without hurting the first minute
- **Problem:** missions explained *what* to do but not *why*. The founder asked for a main character and a
  story built the way Pixar builds them.
- **Change:** docs/STORY.md. Hero Lan (want: save the village fast; need: patience; flaw: impatience,
  mirrored by the tangle mechanic), mentor Bà Năm (fading memory → each relic restores a piece of the
  recipe), sidekick Rùa (Turtle Buddy relic, rides the boat), rival Mr. Tốc (the hero's flaw grown up).
  12 short skippable scenes on the Story Spine across the 5 seas, plus a giver and reason for every mission.
- **Primary metric:** story skip rate per scene (`story_view` skipped vs read), especially the intro.
- **Secondary:** D1 return and seas reached vs build 2.3; mission-log opens.
- **Guardrails:** first_cast time must not rise meaningfully (intro is 6 short lines); tutorial completion
  must not drop. If the intro skip rate is > 60%, cut it to 3 lines and move the rest into ambient lines.
- **Result:** pending real players.

## EXP-005 · Food-chain puzzle makes repeat fishing a decision, not a routine
- **Problem:** [FOUNDER] "Fishing catch got boring after I play many times." Every cast was the same
  action with no choice.
- **Change (build 2.6):** food-chain levels on every fish; landing level L makes a level-L+1 fish hungry
  (rises within reach, bites fast, a little easier); chain ×2/×3/×4 bonuses; any other catch breaks it.
  See docs/GAME_DESIGN.md "Food chain puzzle".
- **Hypothesis:** giving each cast a plan (which fish next?) raises trips per session and D1 return for
  players past trip 3, compared with build 2.5.
- **Primary metric:** trips per session after trip 3 (`trip_start` per `session_start`).
- **Secondary:** share of hungry fish that become chain links (`chain_link / hungry`, should land around
  40-70%: lower means unreadable, near 100% means no real choice); best chain per player; D1.
- **Guardrails:** casts per catch must not get worse; the Phú Quốc story should not finish in under
  ~8 minutes for typical players (it now can finish faster through chains); `food_chain` scene skip rate.
- **Simulation (NOT evidence):** at skill 0.4-0.8 the Phú Quốc story finishes in trips 4-7 (was 8-22)
  because the deep Mackerel is reachable through a chain; the full story still takes 2.6-4 h. Coins at
  trip 400 rose about 10-20%. Browser bot (skill 0.75, 6 trips): 16 hungry fish, 11 links, best ×3,
  no errors.
- **Result:** pending real players. The founder's own feel ("is it less boring?") is the first signal.

## EXP-006 · Staff automation + puzzle sections + island map (build 3.0)
- **Founder direction (D-012):** automate the routine with hired staff; the player solves puzzles in
  fishing / salt / shop sections (100-level track, 5 built); a tycoon-style island map to expand.
- **Hypothesis:** players who open the island return more (staff work while away = a reason to come back)
  and play longer per session (puzzles give a goal beyond the routine), versus build 2.6.
- **Primary metric:** D1 and D7 return for players who hired ≥ 1 staff vs those who didn't; sessions per day.
- **Secondary:** island opened %, buildings and hires per player, puzzle starts → clears per section,
  stars, `island_offline` events (did they come back to collect?).
- **Guardrails:** fishing trips per session must not collapse (automation shouldn't replace the core
  fun); tutorial completion unchanged (the island only opens after the first sale).
- **Simulation (NOT evidence):** a sim player who builds and staffs the island earns ~2.25× coins over
  300 trips (378k vs 168k) and finishes the story ~15% sooner (2.4 h vs 2.7 h at skill 0.6). The boat
  and the legendary fish still gate the story. Risk: mid-game upgrades may feel too cheap; levers are
  staff wages, the 4 h offline cap and jar count.
- **QA:** `node tools/island-qa.mjs` builds, hires, solves Salt 1 and Shop 1 through the real UI (3★),
  trains a Salt Maker and checks staff output. The browser bot (8 trips) still runs clean.
- **Result:** pending real players.

## EXP-007 · Running costs + brand make the business a real decision (build 3.3)
- **Founder request:** income and costs for running and hiring; improve the brand to sell at better prices;
  a Phú Quốc dog story and missions after the first few tasks.
- **Hypothesis:** visible wages/upkeep and a brand ladder give players a reason to plan (which staff,
  when to expand, when to invest in the brand), raising session length for players past the first sale.
- **Metrics:** brand_up events and stage per player; staff_dismiss; time spent unpaid; Manage opens;
  the dog chain completion (dog_feed → dog_house → dog_boat) and dog_bark → catch of that species.
- **Guardrails:** no player should be stuck broke (unpaid) for more than one session; tutorial completion
  must not drop with the 3 dog goals added.
- **Simulation (NOT evidence):** brand reaches stage 2 by trip ~15-30 and the top stage around trip
  125-175; a staff-heavy sim player reaches the Reef later (wages are real costs). Bot: dog chain done
  in 8 trips, Mực barked twice, no errors.
- **Result:** pending real players.

## EXP-008 · A business report with linked fixes + tourism (build 3.4)
- **Hypothesis:** showing where money comes from and goes, with a one-tap fix on every line, raises the
  share of players who run a profitable island (net/h > 0) and how many income lines they enable.
- **Metrics:** business_open, business_fix by kind, income lines active per player, time with idle staff,
  festival / radio_ad / contract_done counts, tourist income share.
- **Simulation (NOT evidence):** first tourism tuning gave ~7,900 coins/h late-game (too much); cut
  (groups /6, tickets 4 + attraction/5, a tour every 3 min) → a few hundred/h early, a few thousand late.
- **Result:** pending real players.

## EXP-009 · Road to the World's Best (build 3.9)
- **Hypothesis:** themed stages with titles and fame-gated unlocks make the mid-game direction clear and
  inspiring, so players keep going past the first hour (fewer "what now?" drop-offs; Tour Office built
  when it pays).
- **Measure:** `career_stage` events (stage, time since first launch), `career_open` / `career_go` usage,
  share of players reaching stage 3 by session 2, and session length before/after stage 1.
- **Success:** ≥60% of players who finish the tutorial reach stage 1; ≥35% reach stage 3; median stage 3
  under 90 min of play. **Evidence so far:** [SIM] only (see GAME_DESIGN.md).

## EXP-010 · Story v2 (build 3.10.1)
- **Hypothesis:** a mystery object (Grandpa's humming jar, one word per sea), a mentor twist and a rival
  with a past make players read scenes instead of skipping them, and pull them to the next chapter.
- **Measure:** `story_view` skip rate per scene (target: intro read to the end by ≥60% of new players,
  ≤40% skips on chapter scenes), and chapter-to-chapter progression vs build 3.10.
- **Evidence so far:** none ([DESIGN] only).

## EXP-011 · Market Sort mini game (build 3.11)
- **Hypothesis:** a short, familiar sorting puzzle (the Goods Sort loop) gives a second reason to open
  the game on days without a fishing session, and its coin rewards speed up the main economy a little.
- **Measure:** share of players who open Market Sort (`sort_menu`) and clear level 1; levels cleared per
  player per day; sessions per day before/after; `sort_stuck` and booster use per level (difficulty).
- **Success:** ≥40% of players past the tutorial clear Market Sort level 1; median player clears 5+
  levels in their first week; no level with a loss rate above 60%.
- **Evidence so far:** [SIM] only: every level is solver-proven; bots clear levels 1-50 by tapping.

## EXP-012 · Store page: first screenshot and preview video (store launch)
- **Hypothesis:** leading with the cozy village plus a story-first preview film (a "short movie" made from
  real play) converts store visitors to installs better than leading with the fishing action.
- **Measure:** App Store Product Page Optimization / Play store listing experiments: conversion rate,
  variant A (village first, as shipped) vs B (fishing first); preview video play-through where reported.
- **Success:** pick the winner at 90% confidence after ≥1,000 page views per variant.
- **Evidence so far:** none (needs the store launch).

## EXP-013 · Friends, invites and the viral loop (builds 3.12-3.13; plan in docs/VIRAL.md)
- **Hypothesis:** comparing sauce with friends and earning coins for invites brings new players
  (viral growth) and gives existing players a reason to return (beat a friend's °N).
- **Measure:** K from Supabase (docs/VIRAL.md queries); `brag_share`, `invite_share` (by channel), `invite_opened`, `invite_welcome`, `invite_joined`, `invite_reward`,
  `friend_added`, `friend_visit`, `friends_open`; invites per active player; the share of new
  players who arrive through an invite; day-7 return rate with friends vs without.
- **Success:** ≥15% of active players share an invite; each sharing player brings ≥0.3 new players;
  players with ≥1 friend return on day 7 at least 1.3× as often as players without.
- **Evidence so far:** none ([DESIGN] only; tests prove the rules, not the fun).
