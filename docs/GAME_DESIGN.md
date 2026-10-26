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
   **Build 3.6: 10 levels per section.** Fishing 6-10 use the Reef and the Delta (longer chains, links ×4,
   a Barracuda target). Salt 6-10 are generated from a seed (5×5 up to 6×7 fields, 3-5 pans, decoy
   channels): a growing-tree maze from the sea gate, pans on its deepest spread-out leaves, then every
   pipe turned 1-3 times. Same seed, same field on every device; tests check pan count and solvability.
   Shop 6-10 add 5-6 customers with conflicting wishes (Tết market: 6 customers, 7 bottles).
   Clearing level N in a section lets that section's staff train to level N+1 (fishing → Fishers;
   salt → Salt Makers and Brewers; shop → Shopkeepers). Rewards are paid on the first clear.

**Island map (7×9 plots of Phú Quốc).** Start with the 3×3 around the village; buy touching plots
(price grows 30% per plot). The map is fixed, so what a plot hides is decided up front and hinted
("locals say…"): a Fishing Cove (+25% dock speed), a Salt Flat (+50% salt), the Old Pier (Trading Post),
Grandpa's Chest (+150 coins), Cousin Út (a free hire). Buildings: Fishing Dock, Salt Field (shore),
Brew House, Sauce Shop, Warehouse (storage), Trading Post (buys overflow fish, +20% bottle price),
Lantern Row and Banyan Shrine (charm → shop prices). Building level = staff slots. Island level rises
with plots and buildings and unlocks bigger buildings.

**Staff:** hire cost grows with each hire of a role; training costs 80/220/500/1100 to Lv 2-5 (build 3.6: up to Lv 10, 2000/3400/5500/8500/12500);
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

## One big island (build 3.2, founder feedback with reference images)
**Feedback:** the estate looked like separate plots with water between them; the founder wants one big
low-poly island (like a diorama) that you open up by buying land.
**Change:**
- The main screen is now **one continuous island** (`src/render3d/landmass.ts`): the coastline is traced
  around every land plot of the map, roughened and rounded (Chaikin smoothing), then built as a painted
  grass top, a grass cliff edge, a wide sand beach, lagoon shallows and shore rocks. The sea sits lower,
  so the island reads as a thick diorama.
- **Expansion without walls of fog:** land you own is bright; land for sale is a little wild (darker
  grass, palms, rocks) with a small "for sale" sign; far land is wilder still. Colours blend softly
  between plots. A low wooden fence marks the edge of your property. Special finds (cove, salt flat,
  pier, treasure, cousin) stay disguised as ordinary land until bought.
- The village moved to the **north coast** (map v2): its dock and boat face the open sea and the island
  spreads south of it. Shore buildings (dock, salt field, trading post) sit at the water's edge and face it.
- **Save migration:** v1 islands are moved onto the new map: every plot bought is refunded, buildings
  and their staff move to fitting plots (given free), nothing built or hired is lost (tested).

## Build 3.3: selling anywhere, running costs, brand, and Mực the Phú Quốc dog (founder feedback)
**"Why can't I click the shop and sell?"** In the island view the village MARKET label was hidden, and
tapping the Sauce Shop opened its staff page with no way to sell. Now: an orange **Market** button in
the island view, **Sell / Market** on the Manage overview and in the Sauce Shop panel. (Shopkeepers
still only sell bottles the staff brewed; bottles you keep stay yours until you sell them.)

**Running costs.** Staff earn wages (Fisher 30/h, Salt Maker 20/h, Brewer 40/h, Shopkeeper 30/h, +25%
per level) and buildings cost upkeep per level (Dock 10, Salt Field 6, Brew House 12, Shop 15,
Warehouse 8, Trading Post 20, décor 1–3). Costs are paid continuously (also offline). If coins run out,
staff **stop working** until you earn again: coins never go negative and debt is capped at one hour of
costs. The Manage screen shows a ledger: income/h (smoothed), wages/h, upkeep/h, net/h, lifetime totals.
Staff can be let go (×) to cut costs. A lone dock with no brewer and shop only costs money, which is the
lesson: build the whole chain.

**Brand.** Every bottle sold (by you or the shop) earns reputation (°N ÷ 5). Brand stages need
reputation plus coins and multiply every sauce price: Homemade ×1.0 → Hand-drawn Label ×1.1 (rep 20,
120) → Mắm Bà Năm ×1.25 (80, 500) → Market Favourite ×1.4 (250, 1800) → Phú Quốc Origin Seal ×1.6
(700, 6000; Phú Quốc fish sauce really has a protected geographical indication) → Famous Across
Vietnam ×1.85 (2000, 15000). This is also the late-game coin sink the economy lacked.

**Mực, the Phú Quốc dog.** After the first sale a stray black Phú Quốc Ridgeback (chó Phú Quốc, one
of the few breeds with a ridge of fur growing backwards along the spine) turns up. Three tutorial
goals woven between the existing ones: **Feed Mực 3 fish** (he takes the cheapest fish, never your
best), **Build Mực a dog house** (60), **Take Mực fishing: catch 3 fish**. Four short scenes
(arrive, trust, boat, done) with Bà Năm, Lan and a jealous Mr. Tốc ("How much for the dog?" "Not for
sale."). Once he has a home, Mực rides the boat and barks (twice a trip at most) at a **real** rare
shadow: an honest hint, never a fake one. He trots around the village; tap him to feed and pet him.

## Build 3.4: business report, tourism, and more ways to earn and spend (founder request)
**Business Report** (tap the money line in the island view, or *Report* in Manage). Three tabs:
- **Earn:** every income line with status (Earning / Idle / Not set up), its rate, one line on what it
  needs or what blocks it, and a button that does it: *Build · cost* (opens Manage on a suitable plot),
  *Hire ›* (opens that building), *More jars*, *Go fishing*. Lines: shop sales, tourists, traders &
  export orders, auto fishing (fish/h), salt making (salt/h), auto fish sauce, and you.
- **Costs:** wages by job (with how many are idle) and upkeep by building, the total, and **How to spend
  less**: idle workers with the reason and the fix (a full bucket usually means *more jars* or a second
  brewer, not storage), train staff (+25% work for +15% wage: wage growth was cut from 25% to 15%),
  Salt Flat / Fishing Cove bonuses, and "nothing turns staff work into coins yet → Sauce Shop".
- **Boost:** festival, radio ad, brand, export orders.
**Tourism:** Tour Office (open land, island Lv 2, 300) + Tour Guides (wage 35/h). Every 3 minutes
(faster when trained) a guide brings a group: tickets for everyone, a souvenir bottle (staff-made, ×1.2
price) for every third tourist, and reputation by word of mouth. **Attraction** decides group size and
ticket price, and is a list of what the player built: Brew House tasting +4, salt fields +2, docks +1
each, Sauce Shop +2, old pier +2, décor charm, Mực +3, village level, brand level ×2. Tourists walk
from the office to the sights in 3D.
**New spends:** Festival (400: 15 min of double groups, +20% shop prices, +10 attraction); radio ad on
Phú Quốc FM (150: 1 h of +50% groups, +5 attraction).
**Export orders** at the Trading Post: 3 orders every 2 hours (same on every device: seeded by the time
slot), e.g. "Hội An café: 3 bottles ≥ 22°N", paying ~1.6× market (1.9× for a recipe you have brewed),
+3 reputation per bottle. Weakest qualifying bottles are used, so the best stay for the market.

## Build 3.5: the production line, auto/manual steps, honest income (founder feedback)
**"I saw brewing but no income."** Root cause (traced an hour of staff work in several setups):
1. **No Sauce Shop:** brewers made ~15 jars/h, the bottles piled up on the shelf, and nothing sold
   them; hand-selling them didn't even count as business income. → The estimate now says so ("Nobody
   sells: bottles wait on your shelf") with a button, and hand-sold staff bottles count as income.
2. **One jar, holding your own sauce:** the brewer could never start; fish piled up; wages ran.
   → `staffJars()` excludes your sealed jars; the line shows "every jar holds your own sauce → More jars".
With a Shopkeeper the same line earns ≈ +725/h (+608 after wages) in the trace.

**How it's made** (village button, Brew House / Dock / Salt Field panels, report): the six steps
(catch → salt → fill jars → ferment → open & bottle → sell), live: bucket and salt stock, every jar with
its owner (You / Staff), fermentation bars with aging stars and seconds left, the shelf. Each step with
staff has an **AUTO / YOU** switch: YOU means you do it by hand and that step's staff rest **unpaid**.
Manual buttons where you act: Go fishing, Fill a jar, Open, Sell now.
**Estimate:** bottles/h, expected °N and price, sold/h, ≈ coins/h (sauce + tours), and a capacity bar per
step (fish ÷ 3, salt, jars, selling) with the **bottleneck** in orange and its fix button. A unit test
keeps the estimate within ±45% of an hour of real staff work.

## Road to the World's Best Fish Sauce (build 3.9, founder direction D-019)
**Founder feedback:** the Tour Office was available before there was income or reputation to make it
worth it; goals should feel like stages (build the village, the brand, the quality) aiming at a
"World's Best Fish Sauce" title, with fame unlocking things.

After the tutorial, the goal banner follows **seven fame stages** (`src/core/career.ts`). Each has a theme,
four goals (any order, read from state, kept once reached), a reward and a new **title** shown in the
top bar (tap it, or the banner, for the Road screen with a "Go ›" button per goal):

| # | Title | Theme | Goals | Unlocks / reward |
|---|---|---|---|---|
| 1 | Village Mắm Maker | Build your village | Brew House, first Brewer, Salt Field, Brewers seal 3 jars | Sauce Shop, Warehouse · 150 |
| 2 | A Name on the Bottle | Build your brand | Shopkeeper, Hand-drawn Label, 50 reputation, Fine 22°N | 300 |
| 3 | Famous on Phú Quốc | Become famous | Mắm Bà Năm label, staff 200/h, 3 more plots, Phú Quốc story | **Tour Office**, Banyan Shrine · 500 + a free hire |
| 4 | Master Brewer | Perfect your quality | Premium 30°N, own jar aged ★★★, Brewer Lv 5, Salt puzzle 8 | Trading Post · 1,000 |
| 5 | Phú Quốc Origin | Trade beyond the island | Origin Seal, 2 export orders, staff 600/h, sail to Hạ Long Bay | 2,500 |
| 6 | Famous Across Vietnam | The whole country | top brand, Legendary 40°N, island Lv 8, Dragon Carp | 6,000 |
| 7 | World's Best Fish Sauce | The world stage | 3 Legendary bottles entered in the Awards, Oarfish, staff 1,200/h, 4,000 reputation | the title · 15,000 |

- Fame gates buildings (`careerLock`): locked cards say "🔒 Stage 3"; the business report links to the Road.
- The finale is an action, not a stockpile: enter your own Legendary bottles one by one (best first).
  No randomness: three entries win.
- Sea missions still drive the fishing story (Captain's Log) and appear as "Next" on the banner.
- [SIM] pacing (tools/sim.ts --island): stage 1 at 20-60 min, Tour Office (stage 3) at 40-70 min,
  the title at ~3.3-4 h of play. Stage 4 often lands with stage 3 in the sim because the sim trains
  staff and clears puzzles faster than people do; watch it in real play.

## Your Team, help everywhere, Mực's surprises (build 3.10, founder feedback)
- **Team screen** (village "Team 3/4", island overview, "+ Hire" on every hand-done production step):
  one card per job with what it does, its rate in plain numbers (Fisher Lv 1: 48 fish/h), what training
  adds, who you have, and Hire / Train buttons.
- **Team size grows with progress** (`core/team.ts`): room for 2 at the start, +2 per Road stage, +1 per
  brand stage. Building level still sets places per building. Old saves over the limit keep everyone.
- **ⓘ on every requirement** (`core/help.ts`, `scenes/info.ts`): disabled buttons stay tappable and
  explain what is missing with the player's numbers and a button to the fix (coins, reputation, island
  level, shore/pier plots, fame stage, puzzle-gated training, team full, sea locks, export orders).
  The Brand "Upgrade" button says "How? ⓘ" until it can be bought.
- **Mực on the boat**: 20% after a catch he fetches a small common fish (≤2 per trip); 40% of trips he
  finds something once (coins 45%, cowrie shell +20 XP 20%, message in a bottle +15 15%, Magic Salt 10%,
  Sonar 10%). Free and honest: rolled when it happens, never paid for.
- Close buttons ("x") have a 14 px larger tap area and a soft glow.
