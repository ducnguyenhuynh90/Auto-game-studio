# Game design (current slice)

## Fishing (one thumb)
- **Aim:** hold anywhere and a power meter ping-pongs (0.75 Hz); the 3D reticle shows where the bobber will
  land. Release to cast. Fish shadows swim across the water at depths that match their species (far = rarer/bigger).
- **Attract:** the shadow nearest the landing point (within about 95 px) swims to the bait. Missing every
  shadow still brings the nearest fish, only slower (no dead ends).
- **Nibbles → bite:** 0-2 nibbles (visual and haptic), then a splash and "TAP!". The window is 1.1 s
  (rod upgrades 1.3 / 1.5; +0.8 s on the first catch).
- **Reel:** hold raises tension, release lowers it. Keep the needle in the green zone (it drifts for hard
  fish). Thrashes spike tension. Max tension for 0.7 s snaps the line; slack lets the fish escape.
  Freshness = time in zone.
- **Rarity signals are honest:** legendary/epic shadows glow; treasure sparkles.
- 5 casts per trip, then a trip summary.

## Crafting
- Jar holds 3 fish. Recipes: Classic (3 anchovy), Squid (2+ squid), Reef (any snapper/grouper/trevally),
  Golden (any golden anchovy), else Village Blend. "Best 3" auto-fill serves casual players.
- A jar is ready after 1 trip or 90 s, and keeps aging to ★★★ (3 trips) for more °N. Opening early versus
  waiting is the player's call.

## Reveal
- Knock 3 times: the jar squashes and glows more each time. Then the lid pops, the bottle rises, and the °N
  counter eases out through tier thresholds with sound and particles. A tier stamp follows, with NEW RECIPE /
  NEW BEST badges and the honest "X°N from next tier" line.

## Village
- 3D island: house (thatch → terracotta at Lv 6), market stall, drying rack showing your fish, jar yard,
  dock with your boat, salt piles, a lantern string that grows with village level.
- The goal banner plus a pointing hand always show the next step.

## Progression layer (v2, founder direction D-007)
- **Goal banner:** GOAL (with progress bar and reward) + "Next:" line. Tap it to open the Captain's Log
  (tutorial chapter, a mission chapter per sea, relic shelf, gadget bag).
- **Captain level:** XP = 5×rarity per catch (+5 if perfect), the sauce's °N per opened jar, and mission
  XP. Each level pays 10 + 5×level coins.
- **Casting risk:** the top 10% of the meter is red; releasing there tangles the line and the cast is lost.
- **Gear:** see docs/ECONOMY.md. Line reach caps cast distance; shadows deeper than reach are shown
  but can't be hooked ("Need longer line").
- **Seas:** 5 seas; unlock = boat level + previous sea's story. 4 missions each; finishing grants a relic.
- **Gadgets** (Mystery Crates, mission rewards): Sonar Shell (names over shadows, 1 trip), Rocket Bobber
  (max reach, 1 trip), Octo Net (next catch ×2), Calm Pearl (+50% green zone, 1 trip), Magic Salt (+6°N
  next jar). Trip gadgets are used from the item bar while aiming; Magic Salt is used on the jar screen.
- **Relics:** Turtle Buddy (+1 cast), Ancient Compass (rares glow), Dragon Jar Glaze (2× aging),
  Storm Kite (½ waits), Heart of the Sea (+3°N every batch).

## Evolution roadmaps (build 2.5)
- Every upgrade line (Rod, Line, Hook, Bait, Ship, Jar Yard, Salt House, Market Stall) and the **Village**
  has a roadmap: a climbing road of stages, each with its own 3D model, name and stat
  (`src/core/evolution.ts`, `src/scenes/evolution.ts`). Done = green check, NOW = glowing gold,
  next = Evolve button, future = dark "?" silhouette with its name, stat and price as a goal to aim for.
- Open it by tapping any Market card (each shows a 3D thumbnail of its next stage) or the "Your Village" card.
- **Upgrades show in play:** the rod in Lan's hands changes per level (bamboo → red lacquer → carbon with
  reel → master rod with a dragon head); the ship model per level; the village evolves through
  Fishing Hamlet → Mắm Village (lanterns) → Busy Harbour (big house, second boat) → Pearl of Phú Quốc
  (second house, festival bunting).

## Phú Quốc (island 1)
- The first sea is **Phú Quốc**, the Pearl Island (Đảo Ngọc): Vietnam's most famous fish-sauce island
  (protected-origin nước mắm from cá cơm, aged in wooden barrels). In game: Lan's village sits under a
  small shrine on a sea rock (inspired by Dinh Cậu), wooden mắm barrels stand by the house, and the
  sea has palm sandbars and fishing buoys. The sea id stays `lagoon` for save compatibility.

## Food chain puzzle (build 2.6, founder feedback "catching got boring")
**Problem.** After many trips every cast was the same: aim at the nearest shadow, wait, reel. There was no
decision to make, so nothing to think about.

**Rule: *cá lớn nuốt cá bé*, big fish eat small fish.** Every fish has a food-chain level (1 small …
4 apex), shown as a coloured chip under its shadow while aiming. Landing a level-L fish makes the nearest
level-L+1 fish **hungry**: it rises to just inside the line's reach, shows its true colours, circles the
casting lane, and bites almost at once (difficulty ×0.75). Catch it next and the chain grows:

| Link | Bonus |
|---|---|
| ×2 | +16 coins, +20 XP |
| ×3 | +36 coins, +30 XP |
| ×4 | +64 coins, +40 XP |

- **Any other catch, or a lost fish, breaks the chain** and the hungry fish swims off. A tangle doesn't
  break the chain, because the bait never reached the water.
- **The puzzle:** with 5 casts, the order matters. Which small fish do you take first so the right big
  one rises? It is also a way to reach deep fish **without** a line upgrade (Phú Quốc's deep Mackerel:
  anchovy → scad → mackerel). That gives early players a skill-based path besides grinding coins.
- **Ladders:** Phú Quốc anchovy/sardine/crab → scad → mackerel. Reef anchovy → scad/squid →
  snapper/grouper/mackerel → Giant Trevally. Delta prawn/mudskipper/crab → catfish → snakehead. Bay
  anchovy → cuttlefish/lobster → barracuda/mackerel → (Dragon Carp). Abyss angler → giant squid →
  (Oarfish).
- **Honesty:** legendaries never appear on demand; they only join a chain if one is already swimming.
  Which fish rises uses the normal spawn weights, decided when it appears, so nothing is a hidden roll.
- **Teaching:** starts on trip 2, once cast-and-reel is learned. The first hungry fish plays a 3-line
  Bà Năm scene. A tutorial goal, "Chain 2 fish: big eats small", sits before the gear goal. The ladder
  panel (bottom right) shows the sea's chain with the current chain lit.
- Code: `src/core/chain.ts` (pure, tested), `src/scenes/fishing.ts` (hungry behaviour and UI). Measured by
  EXP-005.

## Island business + puzzle sections (build 3.0, founder direction D-012)
**Founder ask:** hire workers who automate fishing and fish-sauce making (salt + fish in), upgrade staff to
catch better fish and make better sauce, so the player only solves puzzles in different sections
(fishing, salt, shop) on a 100-level track (first 5 levels now), plus an island map to manage and expand
like Zoo Tycoon, to grow the fish-sauce business and trading.

**The loop now has two layers:**
1. **Routine → staff.** Staff work in every scene and while the game is closed (capped at 4 h, and by
   storage). Fishers net fish into the bucket (no legendaries, treasure or crates: those stay the player's
   adventure). Salt Makers dry salt. Brewers seal the best 3 fish + 1 salt into a free jar and open their
   own jars when aged. Shopkeepers sell staff-made bottles. **Player jars and bottles the player kept
   are never touched by staff.**
2. **Thinking → the player.** Three puzzle sections, 5 hand-made levels each, on a 100-level track:
   - **Fishing:** the food chain with a fixed school of fish and few casts (e.g. reach the deep Mackerel
     on a Hemp line, 3 links in 3 casts).
   - **Salt field (ruộng muối):** turn channel tiles so sea water reaches every salt pan; ★★★ = par taps.
   - **Shop:** give every customer a bottle that fits their wish (min/max °N, recipe, no shrimp…);
     greedy choices fail; ★★★ = the best total.
   Clearing level N in a section lets that section's staff train to level N+1 (fishing → Fishers;
   salt → Salt Makers and Brewers; shop → Shopkeepers). Rewards are paid on the first clear.

**Island map (7×9 plots of Phú Quốc).** Start with the 3×3 around the village; buy touching plots
(price grows 30% per plot). The map is fixed, so what a plot hides is decided up front and hinted
("locals say…"): a Fishing Cove (+25% dock speed), a Salt Flat (+50% salt), the Old Pier (Trading Post),
Grandpa's Chest (+150 coins), Cousin Út (a free hire). Buildings: Fishing Dock, Salt Field (shore),
Brew House, Sauce Shop, Warehouse (storage), Trading Post (buys overflow fish, +20% bottle price),
Lantern Row and Banyan Shrine (charm → shop prices). Building level = staff slots. Island level rises
with plots and buildings and unlocks bigger buildings.

**Staff:** hire cost grows with each hire of a role; training costs 80/220/500/1100 to Lv 2-5;
Fisher speed +25%/level and better odds of rare fish (same weights as bait); Salt Maker +25%/level;
Brewer +1°N per level and waits for ★★ aging from Lv 3; Shopkeeper +25% speed and +5% price per level.

Code: `src/core/island.ts`, `src/core/puzzles.ts` (pure, tested), `src/scenes/island.ts`,
`src/scenes/puzzles.ts`, fishing puzzle mode in `src/scenes/fishing.ts`. QA: `tools/island-qa.mjs`.

## Living island main screen (build 3.1, founder feedback)
**Problem:** [FOUNDER] buying buildings and hiring staff didn't show on the main screen.
**Change:** the village screen is now one continuous 3D world. The village diorama sits on its home plot
and every island plot, building and staff member is built around it (`src/render3d/estate.ts`).
- **Island view** (button, pinch out, or mouse wheel) eases the camera up to the estate; **Village**
  (button, or pinch all the way in) eases back to the jars. The camera frames what you own plus the
  plots you can buy next, so the view widens as the island grows. Drag to look around; ± and pinch zoom
  between the whole estate and a close look at one building.
- **People at work:** fishers stand at the dock with rods and a fish leaps up when they catch one; salt
  makers rake back and forth across the pans; brewers walk round the barrels and stop to stir;
  shopkeepers wave; customers walk from the village to the shop (more with a bigger shop). Each piece
  of real staff output floats up from the worker who made it (+1 fish, +1 salt, +1 jar, +coins).
- **Plots:** owned land has palms, flowers, salt pans or a pier; plots you can buy show through thin
  cloud with a price chip; the rest of the island is hidden under a sea of cloud.
- Labels show each building and its staff (e.g. "Dock 1/1", orange when a slot is empty) and the
  village's news ("2 jars ready!"). Tapping a plot opens it in Manage; tapping the village zooms in.
- The screen remembers the last view. It opens on the island once something is built.
- **Performance:** static land, buildings and each worker are merged per material and the clouds are
  instanced: the whole overview is ~270 draw calls (it was ~720 unmerged); shadows switch off in the
  overview.
