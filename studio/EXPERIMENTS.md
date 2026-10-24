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
