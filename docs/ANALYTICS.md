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
