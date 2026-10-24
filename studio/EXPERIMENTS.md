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
