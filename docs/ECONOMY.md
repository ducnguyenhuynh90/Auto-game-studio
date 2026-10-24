# Economy (single soft currency: coins)

All numbers are in `src/core/data.ts` (`BALANCE`, `SPECIES`, `UPGRADES`).

- **Sauce °N** = avg(species base) × recipe mult + avg freshness × 8 + salt bonus (0/3/6) + aging (0/2/5/8 by level) + variance (±2, rolled at seal).
- **Price** = °N² / 8 × stall mult (1 / 1.25 / 1.5). This is convex, so quality matters more than volume.
  20°N ≈ 50, 30°N ≈ 112, 40°N ≈ 200.
- **Raw fish** sell for 3-38 (crafting 3 anchovies worth 9 raw gives ~60-100 as sauce: transformation feels meaningful).
- **Treasure** converts to coins on catch (40 / 150).
- **Upgrades:** jars 40/140/320 · rod 70/260 · salt 110/300 · boat 180 (unlocks the Reef) · stall 90/280.
- **Goal rewards:** small (5-200) to keep momentum. The first upgrade is affordable right after the first sale.
- Pacing target: first sale within about 3 minutes and first upgrade within the first session.
  The boat (Reef) arrives around session 2. Unvalidated.

## v2 gear and costs (src/core/data.ts)
| Gear | Lv1 | Lv2 | Lv3 | effect per level |
|---|---|---|---|---|
| Rod | 70 | 420 | 5000 | green zone 0.26/0.32/0.38/0.44 |
| Line | 90 | 600 | 8000 | reach 0.68/0.82/0.93/1.0 (the Abyss needs 1.0) |
| Hook | 80 | 500 | 7000 | bite window 1.1→1.6 s, snap 0.7→1.25 s |
| Bait | 160 | 900 | 9000 | rare ×1/1.4/1.9/2.5 (legendary gets √) |
| Boat | 220 | 1500 | 12000 | Reef / Delta+Bay / Abyss |
Village: jars 40/140/700, salt 110/800, stall 90/900. Mission rewards 15-800 coins and 40-800 XP.
Simulated pacing in studio/EXPERIMENTS.md (EXP-003). Known gap: no coin sink after about 3 h.
