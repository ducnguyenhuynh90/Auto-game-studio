# Analytics spec

Events go to localStorage (`mam_events`, ring buffer of 3000) and, if `VITE_ANALYTICS_URL` is set at
build time, are POSTed via `navigator.sendBeacon` as JSON `{e, t, sid, iid, p}`.
Identity: `iid` is an anonymous random install id; `sid` is per page load. No PII.

## Funnel (`funnel` event, once per install, `p.step`, `p.sec` since first launch)
first_launch → first_cast → first_bite → first_catch → first_seal → second_trip_start → first_reveal →
first_sale → first_upgrade → third_trip_start → first_reef_trip

## Behaviour events
| event | props | question it answers |
|---|---|---|
| session_start | trips, coins, returning | sessions per day, return rate |
| screen | name | navigation and confusion |
| trip_start / trip_end | zone, trip, catches, casts | trip completion, early docking |
| cast | power, zone | do players aim, or just tap? |
| hook | species, reaction (ms) | is the bite window fair? |
| catch | species, rarity, size, fresh, perfect, isNew, zone | skill distribution, discovery pace |
| fish_lost | reason (missed_bite / snapped / escaped / nothing), species | where the reel is too hard |
| dex_new | species, total | collection engagement |
| jar_seal / jar_open | recipe, degrees, tier, aging, newRecipe | crafting participation, waiting vs opening early |
| sell_product / keep_product / sell_fish | price, where | economy usage |
| upgrade | id, level, cost | progression pace |
| goal_complete | goal, reward | tutorial or goal-chain drop-off |
| app_hidden / app_visible | scene | where sessions end |
| career_stage | stage, title | pace along the Road to the World's Best (EXP-009) |
| career_open / career_go | stage / goal, where | do players use the Road to decide what to do? |
| award_entry | degrees, entries | the finale |
| salt_rake | salt | do players make salt by hand? |
| team_open / staff_hire (from) | size, cap, focus / role | is the Team screen how people hire now? |
| help_open / help_go | title / action | which requirements confuse players, and do the ⓘ cards lead to action? |
| dog_fetch / dog_find | species / kind | Mực's surprises |

## Key ratios (see SUCCESS.yaml)
second_trip_start/first_launch · first_seal/first_catch · first_sale/first_catch (tutorial proxy) ·
fish_lost by reason / hooks · D1/D7 via session_start per iid.

## Remote summary (Artifact build)
`src/remote.ts` folds events into one `PlaySummary` per player (`src/core/playsummary.ts`): sessions[],
funnel{step: sec}, counts, lost{reason}, species, screens, perfect, bestDegrees, goals, lastScreen,
activeSec. It writes to `plays/<viewer id>` on funnel steps, trip end, jar open, upgrade, app hide, and
at most every 20 s while something changed.

**Storage layout (2.2.1+):** `plays/<viewer id>/devices/<install id>` (one summary per device, so a second
device never overwrites the first) + an index doc `plays/<viewer id>` `{devices: {iid: firstSeen}}`.
Pre-2.2.1 flat docs at `plays/<viewer id>` are still read by the analyzer.

**Pull & analyse:** ArtifactData `list` collection `plays` (index) → for each player, `list`
`plays/<id>/devices` with `out_dir` = one export dir → `node tools/analyze-plays.mjs <export dir>`.
Devices merge per player (sessions union, counts summed, funnel = earliest per step; funnel seconds are
relative to each device's own first launch).

## Google Analytics 4 (web on GitHub Pages + iOS / Android apps)
`src/analytics/ga.ts` + `src/analytics/gamap.ts`. Compiled in only when `VITE_GA_MEASUREMENT_ID` is set at
build time; never in the claude.ai playtest page (its summaries stay in the artifact store, above).

**What is sent**
- **Every event in the table above, under its own name**, with its properties (GA limits applied:
  names ≤ 40 chars, ≤ 25 params, text ≤ 100 chars). About 75 event types: casts, bites, catches, lost fish,
  jars, reveals, sales, upgrades, screens, goals, missions, puzzles, island, staff, brand, Road, help, dog…
- **The funnel**: each step is also its own event (`first_launch`, `first_cast`, `first_bite`,
  `first_catch`, `first_seal`, `second_trip_start`, `first_reveal`, `first_sale`, `first_upgrade`,
  `third_trip_start`, `first_reef_trip`) with `sec` = seconds since first launch.
- **GA's recommended game events**: `page_view` (every screen, `page_title` = screen name), `level_up`
  (captain level), `unlock_achievement` (Road stages, relics), `level_start` / `level_end` (puzzles),
  `earn_virtual_currency` / `spend_virtual_currency` (coins), `tutorial_begin` / `tutorial_complete`.
- **Player properties** (user properties), updated as they change: `captain_level`, `career_stage`,
  `career_title`, `brand_level`, `island_level`, `team_size`, `sea`, `relics`, `dex`, `platform`
  (web / android / ios).

**Privacy**: asked once after the first catch ("Help us improve?"), changeable in Settings → Privacy.
Until the answer, events wait in memory (≤ 400) so the first session's funnel isn't lost; "No" drops them
and Google's script is never loaded. No cookies (`client_storage: none`; GA's client id is the game's
anonymous install id), Google signals and ad personalisation off, no name or email. `VITE_GA_CONSENT=granted`
skips the prompt: a legal/market decision for the founder (see DECISIONS D-020).

**Founder setup (about 10 min, free)**
1. analytics.google.com → Admin → Create property "Mắm Village" → Web data stream for the Pages URL.
   Copy the Measurement ID (G-…). The same web stream works for the apps (they run the web build).
2. GitHub → Settings → Secrets and variables → Actions → `VITE_GA_MEASUREMENT_ID` = G-…; merge to main (Pages)
   and/or run the Native apps workflow. Locally: put it in `.env`.
3. Admin → Custom definitions: add user-scoped dimensions `captain_level`, `career_stage`, `career_title`,
   `brand_level`, `island_level`, `team_size`, `sea`, `platform`, and event-scoped `step`, `species`,
   `screen_name`, `section`, `level`, `goal`, `role` (others as needed).
4. Explore → Funnel exploration: steps = the funnel events above, in order (open funnel off).
5. Check it live: open the game with `?ga_debug` and watch Admin → DebugView.
6. App stores: the data-safety / privacy-label answers must now say "analytics data shared with Google".

Test without an account: `tools/ga-e2e.mjs` (fakes Google's script; checks consent, events, no cookies).
