// Persistent game state and all rule-level actions. No rendering here, so it is unit-testable.
import type { CareerState } from './career';
import { BALANCE, RECIPES_BY_ID, SPECIES_BY_ID, UPGRADES_BY_ID, saucePrice, tierFor, type SeaId, type UpgradeId } from './data';
import { GADGETS, hasRelic, type GadgetId, type RelicId } from './items';
import { addXp } from './progression';
import { range, type Rng } from './rng';
import { SEAS, SEAS_BY_ID, missionDone, seaLock, type Mission, type Sea } from './seas';
import { newIsland, type IslandState } from './island';
import { newPuzzles, type PuzzleProgress } from './puzzles';
import { addReputation, brandMult, newBrand, type BrandState } from './brand';
import { newDog, type DogState } from './dog';

export interface CaughtFish {
  uid: number;
  species: string;
  size: number; // cm
  freshness: number; // 0..1, from reel skill
  perfect: boolean;
}

export interface Jar {
  fish: CaughtFish[]; // empty = jar free
  sealed: boolean;
  recipe: string;
  variance: number;
  /** fullTrips count when sealed; aging counts full trips completed since. */
  sealedTrip: number;
  sealedAt: number; // epoch ms
  /** Extra °N locked in at sealing (Magic Salt, relics). */
  bonus?: number;
  /** Sealed by a brewer on the island: the brewer opens it too; the player's own jars are left alone. */
  auto?: boolean;
}

export interface Product {
  uid: number;
  recipe: string;
  degrees: number;
  agingLevel: number;
  /** Made by island staff: the shop staff may sell it (player-kept bottles are never auto-sold). */
  auto?: boolean;
}

export interface GameState {
  version: 1;
  coins: number;
  nextUid: number;
  bucket: CaughtFish[];
  jars: Jar[];
  shelf: Product[];
  upgrades: Record<UpgradeId, number>;
  dex: Record<string, { count: number; best: number }>;
  cellar: Record<string, number>; // recipe id -> best °N ever made
  stats: { trips: number; fullTrips: number; casts: number; catches: number; perfects: number; jarsOpened: number; sold: number; earned: number; tangles: number; chains: number; bestChain: number; exports?: number; bestAging?: number };
  /** The sea the boat is set to sail to. */
  sea: SeaId;
  goalsDone: string[];
  xp: number;
  missionsDone: string[];
  seaStats: Partial<Record<SeaId, { catches: number; perfects: number; goods: number; crates: number }>>;
  gadgets: Partial<Record<GadgetId, number>>;
  relics: RelicId[];
  /** °N waiting for the next sealed jar (Magic Salt). */
  pendingJarBonus: number;
  /** Identifies one journey across devices; rev increases on every save (cloud merge). */
  saveId?: string;
  /** Story scenes already shown (src/core/story.ts). */
  storySeen: string[];
  rev?: number;
  savedAt?: number;
  /** The island business: plots, buildings, staff (src/core/island.ts). */
  island: IslandState;
  /** Puzzle stars per section (src/core/puzzles.ts). */
  puzzles: PuzzleProgress;
  /** Brand stage and reputation (src/core/brand.ts). */
  brand: BrandState;
  /** The Road to the World's Best Fish Sauce (src/core/career.ts). Missing on old saves until first read. */
  career?: CareerState;
  /** Mực the Phú Quốc dog (src/core/dog.ts). */
  dog: DogState;
}

export function newState(): GameState {
  return {
    version: 1,
    coins: 0,
    nextUid: 1,
    bucket: [],
    jars: [emptyJar()],
    shelf: [],
    upgrades: { rod: 0, line: 0, hook: 0, bait: 0, boat: 0, jars: 0, salt: 0, stall: 0 },
    dex: {},
    cellar: {},
    stats: { trips: 0, fullTrips: 0, casts: 0, catches: 0, perfects: 0, jarsOpened: 0, sold: 0, earned: 0, tangles: 0, chains: 0, bestChain: 0 },
    sea: 'lagoon',
    goalsDone: [],
    xp: 0,
    missionsDone: [],
    seaStats: {},
    gadgets: {},
    relics: [],
    pendingJarBonus: 0,
    storySeen: [],
    island: newIsland(),
    puzzles: newPuzzles(),
    brand: newBrand(),
    dog: newDog(),
  };
}

export function emptyJar(): Jar {
  return { fish: [], sealed: false, recipe: '', variance: 0, sealedTrip: 0, sealedAt: 0 };
}

// ---------- Catching ----------

export interface CatchResult {
  fish: CaughtFish;
  isNew: boolean;
  isRecord: boolean;
  /** Gadget found inside a Mystery Crate. */
  gadget?: GadgetId;
  xp: number;
  levelUps: number;
}

/** XP for a catch: rarer and cleaner catches teach you more. */
export function catchXp(species: string, perfect: boolean): number {
  return SPECIES_BY_ID[species].rarity * 5 + (perfect ? 5 : 0);
}

export function addCatch(s: GameState, species: string, size: number, freshness: number, sea: SeaId = s.sea, rng?: Rng): CatchResult {
  const sp = SPECIES_BY_ID[species];
  const fish: CaughtFish = { uid: s.nextUid++, species, size, freshness, perfect: freshness >= 0.8 };
  s.stats.catches++;
  if (fish.perfect) s.stats.perfects++;
  const st = (s.seaStats[sea] ??= { catches: 0, perfects: 0, goods: 0, crates: 0 });
  st.catches++;
  if (fish.perfect) st.perfects++;
  // ★★ or better (matches the 2-star line on the catch card)
  if (freshness >= 0.5) st.goods = (st.goods ?? 0) + 1;
  const entry = s.dex[species];
  const isNew = !entry;
  const isRecord = !!entry && size > entry.best;
  s.dex[species] = { count: (entry?.count ?? 0) + 1, best: Math.max(entry?.best ?? 0, size) };
  let gadget: GadgetId | undefined;
  if (sp.crate) {
    // The crate's content is rolled here, before the card shows it.
    const pool = SEAS_BY_ID[sea].gadgets;
    gadget = pool[Math.floor((rng ? rng() : Math.random()) * pool.length)];
    s.gadgets[gadget] = (s.gadgets[gadget] ?? 0) + 1;
    st.crates++;
  } else if (sp.treasure) {
    // Treasure converts to coins on the spot; it is never a fermentation ingredient.
    s.coins += sp.raw;
    s.stats.earned += sp.raw;
  } else {
    s.bucket.push(fish);
  }
  if (s.dog?.house) s.dog.catches++;
  const xp = catchXp(species, fish.perfect);
  const levelUps = addXp(s, xp);
  return { fish, isNew, isRecord, gadget, xp, levelUps };
}

/** Octo Net: a duplicate of the fish just landed goes into the bucket. */
export function duplicateCatch(s: GameState, f: CaughtFish): CaughtFish {
  const copy = { ...f, uid: s.nextUid++ };
  s.bucket.push(copy);
  s.dex[f.species].count++;
  s.stats.catches++;
  return copy;
}

// ---------- Crafting ----------

export function recipeFor(fish: CaughtFish[]): string {
  const ids = fish.map((f) => f.species);
  if (ids.some((id) => id === 'angler' || id === 'giantsquid' || id === 'oarfish')) return 'abyss';
  if (ids.includes('carp')) return 'dragon';
  if (ids.includes('golden')) return 'golden';
  if (ids.filter((id) => id === 'prawn').length >= 2) return 'shrimp';
  if (ids.some((id) => id === 'snapper' || id === 'grouper' || id === 'trevally')) return 'reef';
  if (ids.filter((id) => id === 'squid').length >= 2) return 'squid';
  if (ids.length > 0 && ids.every((id) => id === 'anchovy')) return 'classic';
  return 'blend';
}

export function canFerment(f: CaughtFish): boolean {
  return SPECIES_BY_ID[f.species].sauce > 0;
}

/** Quality before aging and variance: what the ingredients and skill earned. */
export function baseDegrees(fish: CaughtFish[], saltLevel: number): number {
  if (fish.length === 0) return 0;
  const recipe = RECIPES_BY_ID[recipeFor(fish)];
  const avgBase = fish.reduce((sum, f) => sum + SPECIES_BY_ID[f.species].sauce, 0) / fish.length;
  const avgFresh = fish.reduce((sum, f) => sum + f.freshness, 0) / fish.length;
  return avgBase * recipe.mult + avgFresh * BALANCE.freshnessBonus + BALANCE.saltBonus[saltLevel];
}

export function sealJar(s: GameState, jarIndex: number, fishUids: number[], rng: Rng, now: number, opts: { auto?: boolean; bonus?: number } = {}): boolean {
  const jar = s.jars[jarIndex];
  if (!jar || jar.sealed || fishUids.length !== BALANCE.jarSlots) return false;
  const fish = fishUids.map((uid) => s.bucket.find((f) => f.uid === uid));
  if (fish.some((f) => !f || !canFerment(f))) return false;
  s.bucket = s.bucket.filter((f) => !fishUids.includes(f.uid));
  jar.fish = fish as CaughtFish[];
  jar.sealed = true;
  jar.recipe = recipeFor(jar.fish);
  jar.variance = range(rng, -BALANCE.variance, BALANCE.variance);
  jar.sealedTrip = s.stats.fullTrips;
  jar.sealedAt = now;
  const relicBonus = hasRelic(s.relics, 'pearlheart') ? 3 : 0;
  if (opts.auto) {
    // staff jars don't spend the player's Magic Salt
    jar.bonus = (opts.bonus ?? 0) + relicBonus;
    jar.auto = true;
  } else {
    jar.bonus = s.pendingJarBonus + relicBonus;
    s.pendingJarBonus = 0;
  }
  return true;
}

/** 0 = still fermenting, 1 = ready, up to maxAging = well aged. */
export function agingLevel(s: GameState, jar: Jar, now: number): number {
  if (!jar.sealed) return 0;
  const byTrips = (s.stats.fullTrips - jar.sealedTrip) * (hasRelic(s.relics, 'dragonjar') ? 2 : 1);
  const byTime = Math.floor((now - jar.sealedAt) / 1000 / BALANCE.agingSecondsPerLevel);
  return Math.min(BALANCE.maxAging, Math.max(byTrips, byTime));
}

export function jarDegrees(s: GameState, jar: Jar, now: number): number {
  const lvl = agingLevel(s, jar, now);
  const d = baseDegrees(jar.fish, s.upgrades.salt) + BALANCE.agingBonus[lvl] + jar.variance + (jar.bonus ?? 0);
  return Math.max(5, Math.round(d * 10) / 10);
}

export function openJar(s: GameState, jarIndex: number, now: number): { product: Product; newRecipe: boolean; newBest: boolean } | null {
  const jar = s.jars[jarIndex];
  if (!jar || !jar.sealed) return null;
  const lvl = agingLevel(s, jar, now);
  if (lvl < 1) return null;
  const degrees = jarDegrees(s, jar, now);
  const product: Product = { uid: s.nextUid++, recipe: jar.recipe, degrees, agingLevel: lvl, ...(jar.auto ? { auto: true } : {}) };
  addXp(s, Math.round(degrees));
  const prevBest = s.cellar[jar.recipe];
  const newRecipe = prevBest === undefined;
  const newBest = !newRecipe && degrees > prevBest;
  s.cellar[jar.recipe] = Math.max(prevBest ?? 0, degrees);
  s.jars[jarIndex] = emptyJar();
  s.shelf.push(product);
  s.stats.jarsOpened++;
  // the patience record counts the player's own jars (staff open theirs as soon as they can)
  if (!jar.auto) s.stats.bestAging = Math.max(s.stats.bestAging ?? 0, lvl);
  return { product, newRecipe, newBest };
}

// ---------- Market ----------

/** What a bottle sells for at your stall: quality, stall level and brand. */
export function productPrice(s: GameState, p: Product): number {
  return Math.round(saucePrice(p.degrees, s.upgrades.stall) * brandMult(s));
}

export function sellProduct(s: GameState, uid: number): number {
  const i = s.shelf.findIndex((p) => p.uid === uid);
  if (i < 0) return 0;
  const price = productPrice(s, s.shelf[i]);
  addReputation(s, s.shelf[i].degrees);
  s.shelf.splice(i, 1);
  s.coins += price;
  s.stats.sold++;
  s.stats.earned += price;
  return price;
}

export function sellFish(s: GameState, uid: number): number {
  const i = s.bucket.findIndex((f) => f.uid === uid);
  if (i < 0) return 0;
  const price = SPECIES_BY_ID[s.bucket[i].species].raw;
  s.bucket.splice(i, 1);
  s.coins += price;
  s.stats.earned += price;
  return price;
}

export function upgradeCost(s: GameState, id: UpgradeId): number | null {
  const def = UPGRADES_BY_ID[id];
  const next = def.levels[s.upgrades[id] + 1];
  return next ? next.cost : null;
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  const cost = upgradeCost(s, id);
  if (cost === null || s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id]++;
  if (id === 'jars') s.jars.push(emptyJar());
  return true;
}

export function villageLevel(s: GameState): number {
  return 1 + s.upgrades.jars + s.upgrades.salt + s.upgrades.stall + s.upgrades.boat;
}

// ---------- Gadgets ----------

/** Spends one gadget. Trip/catch effects are applied by the fishing scene; jar effects live in state. */
export function useGadget(s: GameState, id: GadgetId): boolean {
  if (!s.gadgets[id]) return false;
  s.gadgets[id]!--;
  if (GADGETS[id].scope === 'jar') s.pendingJarBonus += 6;
  return true;
}

/** 3 casts at first (the first goal is 3 fish: one trip), +1 per better boat (up to +2), +1 with Rùa. */
export function castsPerTrip(s: GameState): number {
  return BALANCE.castsPerTrip + Math.min(s.upgrades.boat, BALANCE.boatCasts) + (hasRelic(s.relics, 'turtle') ? 1 : 0);
}

// ---------- Missions ----------

export interface MissionReward {
  mission: Mission;
  sea: Sea;
  relic?: RelicId;
  levelUps: number;
}

/** Completes every satisfied mission in seas the player can reach; grants rewards and relics. */
export function checkMissions(s: GameState): MissionReward[] {
  const out: MissionReward[] = [];
  for (const sea of SEAS) {
    if (seaLock(s, sea)) continue;
    for (const m of sea.missions) {
      if (s.missionsDone.includes(m.id) || !missionDone(s, m)) continue;
      s.missionsDone.push(m.id);
      s.coins += m.reward.coins;
      if (m.reward.gadget) s.gadgets[m.reward.gadget] = (s.gadgets[m.reward.gadget] ?? 0) + 1;
      const levelUps = addXp(s, m.reward.xp);
      let relic: RelicId | undefined;
      if (sea.missions.every((x) => s.missionsDone.includes(x.id)) && !s.relics.includes(sea.relic)) {
        relic = sea.relic;
        s.relics.push(relic);
      }
      out.push({ mission: m, sea, relic, levelUps });
    }
  }
  return out;
}

// ---------- Trips ----------

/** Every trip counts for stats; only a full trip (all casts used) ages jars, so docking early is no shortcut. */
export function finishTrip(s: GameState, full: boolean): void {
  s.stats.trips++;
  if (full) s.stats.fullTrips++;
}

/** Pick the 3 fermentable fish that make the strongest sauce (for the casual "Best 3" button). */
export function bestJarFill(s: GameState): number[] {
  const score = (f: CaughtFish) => SPECIES_BY_ID[f.species].sauce + f.freshness * BALANCE.freshnessBonus;
  const usable = s.bucket.filter(canFerment).sort((a, b) => score(b) - score(a)).slice(0, 10);
  if (usable.length <= BALANCE.jarSlots) return usable.map((f) => f.uid);
  let best: CaughtFish[] = usable.slice(0, BALANCE.jarSlots);
  let bestD = baseDegrees(best, s.upgrades.salt);
  for (let i = 0; i < usable.length; i++)
    for (let j = i + 1; j < usable.length; j++)
      for (let k = j + 1; k < usable.length; k++) {
        const combo = [usable[i], usable[j], usable[k]];
        const d = baseDegrees(combo, s.upgrades.salt);
        if (d > bestD) {
          bestD = d;
          best = combo;
        }
      }
  return best.map((f) => f.uid);
}

export { tierFor };
