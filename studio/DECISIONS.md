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

## D-014 · 2026-10-25 · Wages, upkeep, brand, and Mực
- Wages and upkeep are continuous and honest: no debt spiral (coins never negative, debt capped at one
  hour), staff simply pause when unpaid, and the ledger shows why.
- Brand needs both reputation (earned by selling, faster with stronger sauce) and coins, so quality and
  volume matter, not just money. Stage 4 uses Phú Quốc's real protected origin as the fantasy.
- Mực's bark is an honest signal (it points at a real rare shadow), consistent with "no fake odds".
- The dog's goals sit inside the tutorial after the first sale, so existing players also get his story
  (their next goal becomes "Feed Mực 3 fish").

## D-015 · 2026-10-25 · Every number explains itself, every problem has a button
- The report never just says a number: each line says what it needs or what blocks it, and the button
  goes straight to the place that fixes it. Idle-worker detection finds the real bottleneck (jars or a
  missing brewer) before suggesting storage.
- Wage growth lowered to +15% per level (speed +25%) so training is the main way to cut cost per unit.
- Export orders are seeded by a 2-hour time slot (deterministic, not a paid random reward).

## D-016 · 2026-10-25 · Founder request: Supabase for user info and progress
- Supabase becomes the account + cloud-save backend for self-hosted builds (Firebase stays as a fallback
  only when Supabase isn't configured). The claude.ai playtest page keeps the claude.ai store (artifacts
  can't reach outside services).
- Anonymous-first: every player is backed up from minute one without a sign-up wall; linking a social
  login keeps the same user id. This avoids the classic "lost my village when I changed phones" churn.
- Data minimisation unchanged in spirit: our tables hold a first name, sign-in method and the save plus a
  progress summary. Email lives only inside Supabase Auth for social logins and is never read by the game.
- Founder actions (free plan, no money): create the project, run the migration, enable providers, add
  two GitHub secrets. Apple login needs a paid Apple Developer account: founder decision.

## D-017 · 2026-10-25 · Founder request: iOS and Android apps via Capacitor
- Wrap the existing game with Capacitor 8 instead of rewriting it natively (Unity, React Native, Flutter).
  The game is a three.js + canvas app with no DOM UI, so the web view runs it as-is; a rewrite would cost
  months with zero real-player evidence yet. Web, iOS and Android share one codebase and every fix.
- Revisit only if real devices show performance we can't fix with the quality tiers.
- Store rules built in now: in-app account deletion (both stores), Sign in with Apple alongside Google
  (Apple 4.8), system-browser OAuth (Google blocks embedded web views), portrait lock, safe areas.
- App id `com.mamvillage.app` (permanent after the first upload): founder confirms.
- Founder decisions and money: Google Play (US$25 once), Apple Developer (US$99/yr), privacy policy text,
  store data-safety answers, encryption declaration. Nothing is submitted to a store without approval.

## D-018 · 2026-10-26 · Founder request: Hạ Long Bay or Hoàng Sa / Trường Sa
- Chose Hạ Long Bay: the existing "Dragon Bay" sea was already modelled on it, so it became Hạ Long by
  name, scenery and legend, and every save keeps working (id `bay` unchanged).
- Hoàng Sa / Trường Sa not added: they are subject to an active sovereignty dispute, and showing them
  on a map in a game has led to store removals and bans in some markets. That is a legal / market
  decision for the founder (studio rule: legal/compliance-sensitive changes need approval).
- Ambience is procedural (no audio files, no licences), quiet under the sound effects (surf ≈ -39 dB RMS,
  melody ≈ -42 dB), and the melody has its own switch.

## D-019 · 2026-10-26 · Founder direction: stages, fame unlocks, a "World's Best" goal
- One long-term spine after the tutorial: seven fame stages with themes (village, brand, fame, quality,
  trade, country, world). Titles replace "Captain" in the HUD so progress is visible at a glance.
- Fame gates the Sauce Shop/Warehouse (stage 1), Tour Office/Shrine (stage 3) and Trading Post (stage 4).
  Existing buildings are never taken away; the founder's own save keeps what it built.
- The Tour Office arrives with a free hire and an explicit "why": tourists come because you are known.
- The World Fish Sauce Awards are fictional; the title is decided by three entries, no random judging.

## D-020 · 2026-10-26 · Founder request: Google Analytics for the full funnel and every event
- GA4 as a second sink of the existing analytics bus: every event, the funnel, GA's game events and
  player progress properties. Web on Pages and the native apps; not the claude.ai artifact.
- Privacy defaults chosen by the studio, **open for founder/legal review**: ask once (opt-in), no cookies,
  install id as client id, ad features off. `VITE_GA_CONSENT=granted` exists if legal advice says a prompt
  isn't needed in the target markets; EU/UK players need consent for analytics cookies/identifiers.
- Store privacy labels and the privacy policy must mention Google Analytics before launch.

## D-021 · 2026-10-26 · Founder decision: React Native (latest stable) for the apps, in a new folder
- Expo SDK 58 + React Native 0.88 (Expo's pinned, most-tested pairing), in `mobile/` so nothing existing
  changes. Flutter was ruled out: it would mean rewriting the 4,290 lines of tested rules in Dart.
- The rules stay in `src/core` and are imported by both apps; only the drawing is per platform.
- Built in phases: 1) the core loop (done, tested in a browser play-through), 2) the island business
  screens, 3) the 3D world, story, audio, accounts and analytics. The Capacitor apps keep working until
  the React Native app reaches parity; then the founder picks one for the stores.

## D-022 · 2026-10-26 · React Native phase 3: a 2.5D Skia world, the web's sound engine, services opt-in by config
- The hub world is a 2.5D Skia scene drawn from the game state, not three.js on `expo-gl`: it runs on weak
  phones, needs no native GL module, and works in the browser test bots. Revisit only if players miss the 3D.
- Sound reuses `src/render/audio.ts` + `ambience.ts` on `react-native-audio-api` (a Web Audio API for
  phones): one soundscape for web and app, no audio files to ship.
- Cloud backup and Google Analytics turn on only when a build has their `EXPO_PUBLIC_*` settings, like the
  web build. GA in the app uses the Measurement Protocol (no Firebase SDK, no `google-services.json`),
  opt-in after the first catch, anonymous install id only, no ad ids. The GA API secret ships in the app
  (it can only send events; rotate it in GA if abused). Delete account is in Settings (store rule).

## D-023 · 2026-10-26 · Store pipeline for the React Native app, keys and accounts stay with the founder
- Android: release builds signed with the Google Play upload key from CI secrets (same names as the
  Capacitor build), via an Expo config plugin because the native project is regenerated on every build.
  Without the key, builds stay debug-signed for testers. First Play upload is manual (Google's rule).
- iOS: archive + upload to TestFlight on request (workflow_dispatch "testflight"), with Xcode's
  cloud-managed signing and an App Store Connect API key: no certificates or profiles in the repo.
- Sign in with Apple is offered next to Google (App Store rule for third-party sign-in), through the
  same Supabase web flow; a native Apple sheet is later polish.
- Store accounts (US$25 Play, US$99/yr Apple), the final app id and the store listing are founder
  decisions (docs/STORE_RELEASE.md). Nothing is published or paid by the pipeline on its own.

## D-024 · 2026-10-27 · Market Sort: the Goods Sort loop, without ads or real money
- Founder asked for a mini game like Goods Sort with 50 levels. Same core loop (shelves, three of a kind,
  rows behind, tied shelves, timer, boosters), themed on the Phú Quốc market.
- The reference monetises with rewarded ads (unblock shelves) and paid boosters. We don't (studio rules:
  no randomized paid rewards or real-money mechanics without founder/legal approval): tied shelves open
  through play, boosters cost game coins. Adding ads or paid boosters later is a founder decision.
- Every level is proven winnable before it is shown (honest difficulty, no impossible boards).

## D-025 · 2026-10-29 · Store listing pack from the 3D game; the preview video is a short film cut from real play
- Founder asked for store screenshots, a video and SEO copy for the first upload, and for the video to feel
  like "a short movie by Pixar using the game". The two apps aren't decided yet ("both, decide later"), so
  the pack shows the 3D (web/Capacitor) game. Store rules want listing images that match the app: if the
  React Native app ships instead, re-shoot (store/listing.md says so at the top).
- Everything is captured from the real build with a believable mid-game save (tools/store-save.ts), never
  mocked: Apple rejects previews that aren't in-app footage. The film's camera moves are the game's own hub
  zoom; captions, grade and dissolves are added on top; the catch and the jar reveal are played, not faked.
- The soundtrack is the game's own procedural sea and pluck, scored to the cuts. No licensed music.
- Copy: no prices, rankings, review quotes or competitor names; "no ads, no payments" is stated because it
  is true and is a selling point for the cozy audience.

## D-026 · 2026-10-29 · Special fish fight back, and the rod is the way to land them
- Rarity sets the fight: a smaller, livelier sweet zone, and time outside it now costs line. Commons
  are unchanged, so the first minutes stay friendly. Legendaries are a real chase that the rod
  upgrades and the Calm Pearl solve. Everything depends on what the player does: no hidden odds,
  no paid help.
- Shadows only glow where the game already signalled specials (Epic/Legendary, crates, treasure,
  Compass rares), so the Ancient Compass stays worth having.
