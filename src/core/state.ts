// Persistent game state and all rule-level actions. No rendering here, so it is unit-testable.
import { BALANCE, RECIPES_BY_ID, SPECIES_BY_ID, UPGRADES_BY_ID, saucePrice, tierFor, type UpgradeId, type ZoneId } from './data';
import { range, type Rng } from './rng';

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
}

export interface Product {
  uid: number;
  recipe: string;
  degrees: number;
  agingLevel: number;
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
  stats: { trips: number; fullTrips: number; casts: number; catches: number; perfects: number; jarsOpened: number; sold: number; earned: number };
  zone: ZoneId;
  goalsDone: string[];
}

export function newState(): GameState {
  return {
    version: 1,
    coins: 0,
    nextUid: 1,
    bucket: [],
    jars: [emptyJar()],
    shelf: [],
    upgrades: { jars: 0, rod: 0, salt: 0, boat: 0, stall: 0 },
    dex: {},
    cellar: {},
    stats: { trips: 0, fullTrips: 0, casts: 0, catches: 0, perfects: 0, jarsOpened: 0, sold: 0, earned: 0 },
    zone: 'lagoon',
    goalsDone: [],
  };
}

export function emptyJar(): Jar {
  return { fish: [], sealed: false, recipe: '', variance: 0, sealedTrip: 0, sealedAt: 0 };
}

// ---------- Catching ----------

export function addCatch(s: GameState, species: string, size: number, freshness: number): { fish: CaughtFish; isNew: boolean; isRecord: boolean } {
  const sp = SPECIES_BY_ID[species];
  const fish: CaughtFish = { uid: s.nextUid++, species, size, freshness, perfect: freshness >= 0.8 };
  s.stats.catches++;
  if (fish.perfect) s.stats.perfects++;
  const entry = s.dex[species];
  const isNew = !entry;
  const isRecord = !!entry && size > entry.best;
  s.dex[species] = { count: (entry?.count ?? 0) + 1, best: Math.max(entry?.best ?? 0, size) };
  if (sp.treasure) {
    // Treasure converts to coins on the spot; it is never a fermentation ingredient.
    s.coins += sp.raw;
    s.stats.earned += sp.raw;
  } else {
    s.bucket.push(fish);
  }
  return { fish, isNew, isRecord };
}

// ---------- Crafting ----------

export function recipeFor(fish: CaughtFish[]): string {
  const ids = fish.map((f) => f.species);
  if (ids.includes('golden')) return 'golden';
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

export function sealJar(s: GameState, jarIndex: number, fishUids: number[], rng: Rng, now: number): boolean {
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
  return true;
}

/** 0 = still fermenting, 1 = ready, up to maxAging = well aged. */
export function agingLevel(s: GameState, jar: Jar, now: number): number {
  if (!jar.sealed) return 0;
  const byTrips = s.stats.fullTrips - jar.sealedTrip;
  const byTime = Math.floor((now - jar.sealedAt) / 1000 / BALANCE.agingSecondsPerLevel);
  return Math.min(BALANCE.maxAging, Math.max(byTrips, byTime));
}

export function jarDegrees(s: GameState, jar: Jar, now: number): number {
  const lvl = agingLevel(s, jar, now);
  const d = baseDegrees(jar.fish, s.upgrades.salt) + BALANCE.agingBonus[lvl] + jar.variance;
  return Math.max(5, Math.round(d * 10) / 10);
}

export function openJar(s: GameState, jarIndex: number, now: number): { product: Product; newRecipe: boolean; newBest: boolean } | null {
  const jar = s.jars[jarIndex];
  if (!jar || !jar.sealed) return null;
  const lvl = agingLevel(s, jar, now);
  if (lvl < 1) return null;
  const degrees = jarDegrees(s, jar, now);
  const product: Product = { uid: s.nextUid++, recipe: jar.recipe, degrees, agingLevel: lvl };
  const prevBest = s.cellar[jar.recipe];
  const newRecipe = prevBest === undefined;
  const newBest = !newRecipe && degrees > prevBest;
  s.cellar[jar.recipe] = Math.max(prevBest ?? 0, degrees);
  s.jars[jarIndex] = emptyJar();
  s.shelf.push(product);
  s.stats.jarsOpened++;
  return { product, newRecipe, newBest };
}

// ---------- Market ----------

export function productPrice(s: GameState, p: Product): number {
  return saucePrice(p.degrees, s.upgrades.stall);
}

export function sellProduct(s: GameState, uid: number): number {
  const i = s.shelf.findIndex((p) => p.uid === uid);
  if (i < 0) return 0;
  const price = productPrice(s, s.shelf[i]);
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
  return 1 + Object.values(s.upgrades).reduce((a, b) => a + b, 0);
}

// ---------- Trips ----------

/** Every trip counts for stats; only a full trip (all casts used) ages jars, so docking early is no shortcut. */
export function finishTrip(s: GameState, full: boolean): void {
  s.stats.trips++;
  if (full) s.stats.fullTrips++;
}

/** Pick the 3 best fermentable fish for the casual "auto fill" button. */
export function bestJarFill(s: GameState): number[] {
  const usable = s.bucket.filter(canFerment);
  // Prefer a pure anchovy batch when possible (Classic), otherwise highest sauce value × freshness.
  const anch = usable.filter((f) => f.species === 'anchovy').sort((a, b) => b.freshness - a.freshness);
  const score = (f: CaughtFish) => SPECIES_BY_ID[f.species].sauce + f.freshness * BALANCE.freshnessBonus;
  const sorted = [...usable].sort((a, b) => score(b) - score(a));
  const top = sorted.slice(0, BALANCE.jarSlots);
  if (top.length < BALANCE.jarSlots) return top.map((f) => f.uid);
  if (anch.length >= BALANCE.jarSlots) {
    const classic = anch.slice(0, BALANCE.jarSlots);
    if (baseDegrees(classic, s.upgrades.salt) >= baseDegrees(top, s.upgrades.salt)) return classic.map((f) => f.uid);
  }
  return top.map((f) => f.uid);
}

export { tierFor };
