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

## D-006 · 2026-10-24 · Playtest distribution and analytics through a claude.ai Artifact
- **Why:** GitHub Pages needs the founder to change repo settings; an Artifact gives a private playable
  link right away, and its built-in store is a zero-setup, owner-only analytics backend. No third-party
  service, no cost, no personal data: an opaque viewer id plus gameplay counts.
- **Shape:** one bounded summary doc per player (`src/core/playsummary.ts`) instead of raw events, which
  keeps the store far below its 25k-doc cap. Raw events stay in the player's localStorage.
- **Limit:** only players at Contributor level or above (or org members) can write. Outside view-only
  players still play, but we get no data from them. Pages remains the path for broad public tests.

## D-007 · 2026-10-24 · Founder direction: progression, risk, gear, sea chart, special items
The founder asked for: visible current + next goals and more gamification; casts that can fail; upgradeable
gear that unlocks deeper fish; a One Piece-like map of seas with missions and special items; and odd
catches that grant special abilities. This is a direct founder request that widens scope, so it was
built, but as ONE connected system rather than separate features:
- **Goals:** tutorial chapter → per-sea story missions (4 each). The banner always shows GOAL + "Next:";
  tapping it opens the Captain's Log. Captain level (XP from catches, brews, missions) pays coins on level-up.
- **Failure:** the cast meter has a red overcast band (top 10%). Releasing there tangles the line and the
  cast is lost. It is visible, skill-based and honest, not random.
- **Gear:** Rod (green zone), Line (cast reach, so deep fish need it), Hook (bite window, snap time),
  Bait (rare-fish rate, shown as an exact multiplier), Boat (seas). Deep fish beyond reach are shown
  with "Need longer line", so players see what an upgrade buys.
- **Sea chart:** Home Lagoon → Coral Reef → Mangrove Delta → Dragon Bay → The Abyss. Each sea is unlocked
  by boat level AND finishing the previous sea's story. Each has its own fish, recipe, visuals and a relic.
- **Special items:** Mystery Crates hold gadgets (Sonar Shell, Rocket Bobber, Octo Net, Calm Pearl,
  Magic Salt). Relics are permanent abilities (+1 cast, rare-glow compass, 2× aging, ½ wait, +3°N).
- **Honesty kept:** crate contents are rolled at catch time and shown; bait odds are shown; nothing is
  paid. No randomized paid rewards exist (that would need founder/legal approval).
- **Risk acknowledged:** this is far more scope than the evidence supports. Real playtests decide what
  stays; the systems are data-driven (`seas.ts`, `items.ts`, `data.ts`) so they can be trimmed cheaply.

## D-008 · 2026-10-24 · Founder request: social login + speed on weak devices
- **Login:** guest-first (a login wall before fun costs installs). Sign-in only adds cloud backup and
  cross-device play. claude.ai identity works now in the playtest page; Google/Apple/Facebook are built
  on Firebase but **dormant until the founder creates the Firebase project** (an account the founder must
  own; Apple sign-in needs a paid Apple Developer membership). Minimal data: a save plus a first name.
- **Weak devices:** tiers + an FPS governor rather than one compromise setting, so good phones keep the
  cute look and weak phones stay playable. A service worker and a split vendor chunk handle repeat
  loads and offline play.

## D-009 · 2026-10-24 · Founder request: Pixar-style hero and story
- The story is built from the existing mechanics (theme "chậm mà chắc", slow but sure), so it explains
  the game instead of interrupting it: aging jars = patience rewarded; overcast tangle = the hero's flaw.
- The rival (Mr. Tốc) is a mirror of the hero rather than a villain (Pixar's antagonist-as-mirror).
- Scenes are short, skippable and replayable (Captain's Log ▶). Skip rate is measured, and the story
  shrinks if players skip it (EXP-004).
- Cultural care: real proverb, the carp/Dragon Gate legend and mắm tôm are used respectfully. A native
  Vietnamese speaker should review the lines before public launch (backlog).

## D-010 · 2026-10-24 · Founder request: evolution roadmaps + Phú Quốc as island 1
- Roadmaps make upgrade goals visible ahead of time (named future stages with prices), turning
  "buy +1" into "work toward the Master Rod". The stats are computed from the real balance numbers.
- Upgrades now change the models in play (rod, ship, village stages), so progress is visible, not abstract.
- Phú Quốc fits the product exactly: it is Vietnam's most famous fish-sauce origin. Only island 1 was
  renamed, as asked. Option for later (founder call): map the other seas to real places along the coast
  (An Thới coral reefs, Mekong/Cà Mau mangroves, Hạ Long for Dragon Bay; keep the Abyss fictional to
  avoid sensitive maritime areas).
- A national flag was deliberately not used in the village dioramas (festival bunting instead).

## D-011 · 2026-10-24 · Founder feedback: make catching a puzzle → food chain (cá lớn nuốt cá bé)
- Options weighed: (a) bait-matching per species, (b) a merge/packing grid for the catch, (c) combo
  chains of the same species, (d) a food chain where each catch lures the next bigger fish.
- Chose (d). It changes the catch moment itself (the founder's complaint), it combines catches into a
  plan ("combine and think"), it reuses everything already on screen (shadows, reach, depth), it adds
  no new currency or menu, and it carries a real Vietnamese proverb that fits the story's patience theme.
- It is also a skill path around the line-reach gate: thinking can replace grinding coins. The sim says
  Phú Quốc now finishes sooner; we accept that and watch the guardrail in EXP-005.
- Not randomized paid rewards: chain bonuses are earned coins/XP with no purchase involved.
- (b) remains a candidate for the CRAFT side (jar packing) if the jar step also feels routine.

## D-012 · 2026-10-24 · Founder direction: staff automation, puzzle sections, island tycoon map
- This shifts the product from "you do everything" to "you run a business and solve its hard problems".
  The founder asked for it, so it is approved direction; the active fishing game stays fully playable.
- Staff never take the player's best moments: no legendary or treasure catches by staff, staff don't
  open the player's jars or sell bottles the player kept, and the jar reveal stays a player moment.
- Puzzles gate staff training (not coins alone), so thinking is the path to a stronger business.
- "100 levels": each section has a 100-level track in the data model and UI; 5 hand-made levels per
  section ship now, each verified solvable in tests. Later levels come in batches, ideally by a
  generator plus a solvability check.
- The island map is fixed, not random, so discoveries are honest and can be hinted before buying.
- No staff wages yet (simpler first version). If the sim's 2× income shows up in real play as boredom
  with upgrades, wages are the first lever.

## D-013 · 2026-10-24 · Founder feedback: one big island, not separate plots
- The founder sent low-poly island/diorama references and asked for one continuous island you expand.
- The plot grid stays as the rules model (buying, placement, discoveries); only the presentation became
  one landmass. Plots are shown as painted regions plus a property fence instead of separate blocks.
- Changing the map (village on the north coast) breaks old tile numbers, so saves migrate with a full
  refund of bought land and buildings relocated for free: no player loses anything.
