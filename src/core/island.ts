// The island business (tycoon layer): a tile map of Phú Quốc you expand plot by plot, buildings you
// place on it, and staff who fish, make salt, brew and sell on their own. Puzzles (src/core/puzzles.ts)
// train the staff: a role's level cap comes from the puzzle section it belongs to.
// Pure rules + a deterministic production tick (also used for offline catch-up). No rendering here.
import { BALANCE, SPECIES_BY_ID, saucePrice, type SeaId } from './data';
import { rollShadow, speciesForSea } from './fishing';
import type { Rng } from './rng';
import { agingLevel, bestJarFill, canFerment, openJar, sealJar, type GameState } from './state';

// ---------- Map ----------

export const COLS = 7;
export const ROWS = 9;

/**
 * Terrain per tile. ~ sea · b beach · g grass · f palm grove · H the village (home) · c fishing cove ·
 * s salt flat · p old pier · t buried treasure · w a villager looking for work.
 * The layout is fixed, so what a plot hides is decided up front (no hidden rolls when you buy it).
 * The village sits on the north coast (its dock faces the open sea); the island spreads south of it.
 */
const LAYOUT = [
  '~bbHbc~',
  'bggggfb',
  'sgfgwgc',
  'bggfggb',
  'bgtgggb',
  '~bggfgb',
  '~bgfggp',
  '~~bggb~',
  '~~~bc~~',
];
/** Bumped when LAYOUT changes; older saves are migrated by migrateIsland(). */
export const LAYOUT_VERSION = 2;

export type Terrain = '~' | 'b' | 'g' | 'f' | 'H' | 'c' | 's' | 'p' | 't' | 'w';

export function terrain(tile: number): Terrain {
  return LAYOUT[Math.floor(tile / COLS)][tile % COLS] as Terrain;
}

export const tileOf = (col: number, row: number) => row * COLS + col;
export const HOME = LAYOUT.findIndex((r) => r.includes('H')) * COLS + LAYOUT.find((r) => r.includes('H'))!.indexOf('H');

/** Shore tiles: docks and salt fields need the sea. */
export const isShore = (t: Terrain) => t === 'b' || t === 'c' || t === 's' || t === 'p';
export const isLand = (t: Terrain) => t !== '~';

/** What buying a plot reveals. Shown in the plot card before buying ("rumours") and celebrated after. */
export const DISCOVERY: Partial<Record<Terrain, { name: string; desc: string }>> = {
  c: { name: 'Fishing Cove', desc: 'Calm, fishy water: a dock here fishes 25% faster.' },
  s: { name: 'Salt Flat', desc: 'Flat, sunny shore: a salt field here makes 50% more salt.' },
  p: { name: 'Old Pier', desc: 'Deep water for big boats: build a Trading Post here.' },
  t: { name: "Grandpa's Chest", desc: 'Grandpa buried coins here years ago: +150 coins.' },
  w: { name: 'Cousin Út', desc: 'A cousin wants a job: one free hire.' },
};

const START_OWNED = (() => {
  const out: number[] = [];
  const hc = HOME % COLS;
  const hr = Math.floor(HOME / COLS);
  for (let r = hr - 1; r <= hr + 1; r++)
    for (let c = hc - 1; c <= hc + 1; c++) if (r >= 0 && c >= 0 && r < ROWS && c < COLS && LAYOUT[r][c] !== '~') out.push(tileOf(c, r));
  return out;
})();

// ---------- Buildings ----------

export type Role = 'fisher' | 'salter' | 'brewer' | 'seller';
export type BuildingId = 'dock' | 'saltfield' | 'brewhouse' | 'shop' | 'warehouse' | 'tradepost' | 'lantern' | 'shrine';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  local: string;
  desc: string;
  cost: number;
  /** Upgrade prices to level 2 and 3. */
  upgrade: number[];
  role?: Role;
  /** Where it can stand. */
  needs: 'shore' | 'land' | 'pier';
  /** Village charm (décor): raises shop prices. */
  charm?: number;
  /** Island level needed to build it. */
  minLevel: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'dock', name: 'Fishing Dock', local: 'Bến cá', desc: 'Fishers catch fish for the bucket.', cost: 80, upgrade: [300, 900], role: 'fisher', needs: 'shore', minLevel: 1 },
  { id: 'saltfield', name: 'Salt Field', local: 'Ruộng muối', desc: 'Salt makers dry sea salt. Brewers need 1 salt per jar.', cost: 60, upgrade: [250, 800], role: 'salter', needs: 'shore', minLevel: 1 },
  { id: 'brewhouse', name: 'Brew House', local: 'Nhà ủ mắm', desc: 'Brewers fill, seal and open jars with bucket fish and salt.', cost: 150, upgrade: [350, 1000], role: 'brewer', needs: 'land', minLevel: 1 },
  { id: 'shop', name: 'Sauce Shop', local: 'Tiệm mắm', desc: 'Shopkeepers sell the bottles your staff brewed.', cost: 180, upgrade: [400, 1200], role: 'seller', needs: 'land', minLevel: 2 },
  { id: 'warehouse', name: 'Warehouse', local: 'Nhà kho', desc: 'Bigger fish and salt storage for your staff.', cost: 200, upgrade: [450, 1300], needs: 'land', minLevel: 2 },
  { id: 'tradepost', name: 'Trading Post', local: 'Trạm buôn', desc: 'Traders buy fish your bucket has no room for, and pay 20% more for bottles.', cost: 400, upgrade: [900, 2500], needs: 'pier', minLevel: 3 },
  { id: 'lantern', name: 'Lantern Row', local: 'Đèn lồng', desc: 'Pretty lights. +1 charm (shop prices +2%).', cost: 40, upgrade: [], needs: 'land', charm: 1, minLevel: 1 },
  { id: 'shrine', name: 'Banyan Shrine', local: 'Miếu đa', desc: 'Visitors stop to pray, then shop. +3 charm.', cost: 160, upgrade: [], needs: 'land', charm: 3, minLevel: 3 },
];

export const BUILDINGS_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export interface Building {
  tile: number;
  id: BuildingId;
  level: number;
}

// ---------- Staff ----------

export interface Staff {
  uid: number;
  role: Role;
  name: string;
  level: number;
  /** The building tile they work at. */
  tile: number;
}

export const ROLE: Record<Role, { title: string; verb: string; section: 'fishing' | 'salt' | 'shop'; hire: number; perk: (lvl: number) => string }> = {
  fisher: { title: 'Fisher', verb: 'fishing', section: 'fishing', hire: 60, perk: (l) => `1 fish / ${Math.round(fishSeconds(l))}s · rarer fish ×${BALANCE.baitRare[Math.min(3, l - 1)]}` },
  salter: { title: 'Salt Maker', verb: 'raking salt', section: 'salt', hire: 50, perk: (l) => `1 salt / ${Math.round(saltSeconds(l))}s` },
  brewer: { title: 'Brewer', verb: 'brewing', section: 'salt', hire: 80, perk: (l) => `+${l - 1}°N per jar · waits for ${l >= 3 ? '★★' : '★'} aging` },
  seller: { title: 'Shopkeeper', verb: 'selling', section: 'shop', hire: 70, perk: (l) => `1 bottle / ${Math.round(sellSeconds(l))}s · price +${(l - 1) * 5}%` },
};

const NAMES = ['Anh Ba', 'Chị Tư', 'Cô Sáu', 'Chú Bảy', 'Anh Tám', 'Bé Na', 'Chị Hai', 'Ông Chín', 'Cậu Mười', 'Cô Mai', 'Anh Lộc', 'Chị Thu'];

/** Staff levels built so far (the level track has room for 100; content ships 5 at a time). */
export const STAFF_MAX_LEVEL = 5;
const STAFF_UPGRADE = [0, 80, 220, 500, 1100];

const speed = (lvl: number) => 1 + 0.25 * (lvl - 1);
export const fishSeconds = (lvl: number) => 75 / speed(lvl);
export const saltSeconds = (lvl: number) => 60 / speed(lvl);
export const brewSeconds = 30;
export const sellSeconds = (lvl: number) => 45 / speed(lvl);

// ---------- State ----------

export interface IslandState {
  owned: number[];
  buildings: Building[];
  staff: Staff[];
  salt: number;
  /** Seconds accumulated toward each staff member's next action. */
  timers: Record<number, number>;
  lastTick: number;
  freeHires: number;
  /** Lifetime staff output, for the island panel and analytics. */
  made: { fish: number; salt: number; jars: number; bottles: number; coins: number };
  /** LAYOUT_VERSION the tile numbers refer to. */
  layout?: number;
}

export function newIsland(): IslandState {
  return { owned: [...START_OWNED], buildings: [], staff: [], salt: 0, timers: {}, lastTick: 0, freeHires: 0, made: { fish: 0, salt: 0, jars: 0, bottles: 0, coins: 0 }, layout: LAYOUT_VERSION };
}

/** Old map (v1): plot purchases started from 9 owned plots. */
const V1_START = 9;

/**
 * Moves a save made on an older map onto the current one: every plot bought is refunded, the start
 * plots are owned again, and each building (with its staff) moves to a fitting plot, which the
 * player gets for free. Nothing built or hired is lost.
 */
export function migrateIsland(isl: IslandState): void {
  if (isl.layout === LAYOUT_VERSION) return;
  const bought = Math.max(0, isl.owned.length - V1_START);
  let refund = 0;
  for (let k = 0; k < bought; k++) refund += Math.round((40 * Math.pow(1.3, k)) / 5) * 5;
  isl.owned = [...START_OWNED];
  const moved = new Map<number, number>();
  const taken = new Set<number>();
  const fits = (tile: number, id: BuildingId) => {
    const t = terrain(tile);
    const def = BUILDINGS_BY_ID[id];
    if (t === '~' || t === 'H' || taken.has(tile)) return false;
    if (def.needs === 'pier') return t === 'p';
    if (def.needs === 'shore') return isShore(t);
    return !isShore(t) || t === 'b';
  };
  for (const b of isl.buildings) {
    const all = [...Array(COLS * ROWS).keys()];
    // prefer land already owned, then the nearest fitting plot to the village
    const dist = (t: number) => Math.abs((t % COLS) - (HOME % COLS)) + Math.abs(Math.floor(t / COLS) - Math.floor(HOME / COLS));
    const tile = all.filter((t) => fits(t, b.id)).sort((a, c) => Number(!isl.owned.includes(a)) - Number(!isl.owned.includes(c)) || dist(a) - dist(c))[0];
    if (tile === undefined) continue;
    moved.set(b.tile, tile);
    taken.add(tile);
    b.tile = tile;
    if (!isl.owned.includes(tile)) isl.owned.push(tile);
  }
  isl.buildings = isl.buildings.filter((b) => taken.has(b.tile));
  for (const st of isl.staff) st.tile = moved.get(st.tile) ?? st.tile;
  isl.staff = isl.staff.filter((st) => taken.has(st.tile));
  isl.layout = LAYOUT_VERSION;
  (isl as IslandState & { refund?: number }).refund = refund;
}

/** The island opens after the first sale (the player has seen the whole catch → brew → sell loop). */
export function islandUnlocked(s: GameState): boolean {
  return s.stats.sold >= 1;
}

/** Island level: grows with plots and buildings; gates bigger buildings. */
export function islandLevel(s: GameState): number {
  const isl = s.island;
  const lv = 1 + Math.floor((isl.owned.length - START_OWNED.length) / 3) + Math.floor(isl.buildings.reduce((a, b) => a + b.level, 0) / 3);
  return Math.min(100, lv);
}

export function buildingAt(s: GameState, tile: number): Building | undefined {
  return s.island.buildings.find((b) => b.tile === tile);
}

const neighbours = (tile: number) => {
  const c = tile % COLS;
  const r = Math.floor(tile / COLS);
  return [
    [c, r - 1],
    [c + 1, r],
    [c, r + 1],
    [c - 1, r],
  ]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS)
    .map(([x, y]) => tileOf(x, y));
};

/** A plot can be bought when it is land and touches land you own. */
export function canExpand(s: GameState, tile: number): boolean {
  if (!isLand(terrain(tile)) || s.island.owned.includes(tile)) return false;
  return neighbours(tile).some((n) => s.island.owned.includes(n));
}

export function plotCost(s: GameState): number {
  const bought = s.island.owned.length - START_OWNED.length;
  return Math.round((40 * Math.pow(1.3, bought)) / 5) * 5;
}

export function buyPlot(s: GameState, tile: number): { ok: boolean; found?: { name: string; desc: string } } {
  const cost = plotCost(s);
  if (!canExpand(s, tile) || s.coins < cost) return { ok: false };
  s.coins -= cost;
  s.island.owned.push(tile);
  const t = terrain(tile);
  if (t === 't') {
    s.coins += 150;
    s.stats.earned += 150;
  }
  if (t === 'w') s.island.freeHires++;
  return { ok: true, found: DISCOVERY[t] };
}

/** Why a building can't go on a tile (null = it can). */
export function placeProblem(s: GameState, tile: number, id: BuildingId): string | null {
  const def = BUILDINGS_BY_ID[id];
  const t = terrain(tile);
  if (!s.island.owned.includes(tile)) return 'Buy this plot first';
  if (t === 'H') return 'The village is here';
  if (buildingAt(s, tile)) return 'Something is already here';
  if (islandLevel(s) < def.minLevel) return `Needs island level ${def.minLevel}`;
  if (def.needs === 'pier' && t !== 'p') return 'Needs the Old Pier';
  if (def.needs === 'shore' && !isShore(t)) return 'Needs a shore plot';
  if (def.needs === 'land' && isShore(t) && t !== 'b') return 'Keep this special shore for a dock or salt field';
  if (s.coins < def.cost) return `Needs ${def.cost} coins`;
  return null;
}

export function build(s: GameState, tile: number, id: BuildingId): boolean {
  if (placeProblem(s, tile, id)) return false;
  s.coins -= BUILDINGS_BY_ID[id].cost;
  s.island.buildings.push({ tile, id, level: 1 });
  return true;
}

export function buildingUpgradeCost(b: Building): number | null {
  return BUILDINGS_BY_ID[b.id].upgrade[b.level - 1] ?? null;
}

export function upgradeBuilding(s: GameState, tile: number): boolean {
  const b = buildingAt(s, tile);
  const cost = b ? buildingUpgradeCost(b) : null;
  if (!b || cost === null || s.coins < cost) return false;
  s.coins -= cost;
  b.level++;
  return true;
}

/** Staff slots: one per building level. */
export function slots(b: Building): number {
  return BUILDINGS_BY_ID[b.id].role ? b.level : 0;
}

export function staffAt(s: GameState, tile: number): Staff[] {
  return s.island.staff.filter((x) => x.tile === tile);
}

export function hireCost(s: GameState, role: Role): number {
  if (s.island.freeHires > 0) return 0;
  const n = s.island.staff.filter((x) => x.role === role).length;
  return Math.round(ROLE[role].hire * (1 + 0.6 * n));
}

export function hire(s: GameState, tile: number): Staff | null {
  const b = buildingAt(s, tile);
  const role = b && BUILDINGS_BY_ID[b.id].role;
  if (!b || !role || staffAt(s, tile).length >= slots(b)) return null;
  const cost = hireCost(s, role);
  if (s.coins < cost) return null;
  if (cost === 0) s.island.freeHires--;
  else s.coins -= cost;
  const uid = s.nextUid++;
  const staff: Staff = { uid, role, name: NAMES[s.island.staff.length % NAMES.length], level: 1, tile };
  s.island.staff.push(staff);
  return staff;
}

/** Puzzle levels cleared in a section set how far its staff can be trained. */
export function staffLevelCap(s: GameState, role: Role): number {
  const cleared = (s.puzzles[ROLE[role].section] ?? []).filter((x) => x > 0).length;
  return Math.min(STAFF_MAX_LEVEL, 1 + cleared);
}

export function staffUpgradeCost(st: Staff): number | null {
  return st.level < STAFF_MAX_LEVEL ? STAFF_UPGRADE[st.level] : null;
}

/** Why a staff member can't be trained right now (null = they can). */
export function trainProblem(s: GameState, st: Staff): string | null {
  const cost = staffUpgradeCost(st);
  if (cost === null) return 'Top level (more levels coming)';
  if (st.level >= staffLevelCap(s, st.role)) return `Clear ${ROLE[st.role].section === 'fishing' ? 'Fishing' : ROLE[st.role].section === 'salt' ? 'Salt' : 'Shop'} puzzle ${st.level} to train`;
  if (s.coins < cost) return `Needs ${cost} coins`;
  return null;
}

export function trainStaff(s: GameState, uid: number): boolean {
  const st = s.island.staff.find((x) => x.uid === uid);
  if (!st || trainProblem(s, st)) return false;
  s.coins -= staffUpgradeCost(st)!;
  st.level++;
  return true;
}

// ---------- Production ----------

const level = (s: GameState, id: BuildingId) => Math.max(0, ...s.island.buildings.filter((b) => b.id === id).map((b) => b.level));

export function bucketCap(s: GameState): number {
  return 15 + 10 * level(s, 'warehouse');
}
export function saltCap(s: GameState): number {
  return 10 + 10 * level(s, 'warehouse');
}
export function charm(s: GameState): number {
  return s.island.buildings.reduce((a, b) => a + (BUILDINGS_BY_ID[b.id].charm ?? 0), 0);
}
/** Price multiplier for staff-sold bottles: shopkeeper level, charm (max +30%), trading post. */
export function shopMult(s: GameState, sellerLevel: number): number {
  return (1 + 0.05 * (sellerLevel - 1)) * (1 + Math.min(0.3, 0.02 * charm(s))) * (level(s, 'tradepost') > 0 ? 1.2 : 1);
}

/** Workers fish with nets: no legends, treasure or crates (those stay the player's adventure). */
function rollStaffFish(rng: Rng, sea: SeaId, lvl: number): string {
  for (let i = 0; i < 12; i++) {
    const sp = SPECIES_BY_ID[rollShadow(rng, sea, Math.min(3, lvl - 1)).species];
    if (sp.rarity < 5 && !sp.treasure && !sp.crate) return sp.id;
  }
  return speciesForSea(sea).find((sp) => sp.rarity === 1 || sp.rarity === 2)!.id;
}

export interface TickReport {
  fish: number;
  salt: number;
  jars: number;
  bottles: number;
  coins: number;
}

/**
 * Advances the island by `seconds` of staff work. Deterministic for a given rng. Used every frame and,
 * on load, for offline time (capped by the caller). Stops at storage limits instead of wasting work.
 */
export function tickIsland(s: GameState, seconds: number, rng: Rng, now: number): TickReport {
  const rep: TickReport = { fish: 0, salt: 0, jars: 0, bottles: 0, coins: 0 };
  const isl = s.island;
  if (!isl.staff.length || seconds <= 0) return rep;
  // order matters: salt and fish first, so brewers can use them in the same tick
  const order: Role[] = ['salter', 'fisher', 'brewer', 'seller'];
  for (const role of order) {
    for (const st of isl.staff.filter((x) => x.role === role)) {
      const b = buildingAt(s, st.tile);
      if (!b) continue;
      const t = terrain(st.tile);
      const every = role === 'fisher' ? fishSeconds(st.level) / (t === 'c' ? 1.25 : 1) : role === 'salter' ? saltSeconds(st.level) / (t === 's' ? 1.5 : 1) : role === 'brewer' ? brewSeconds : sellSeconds(st.level);
      let acc = (isl.timers[st.uid] ?? 0) + seconds;
      let guard = 0;
      while (acc >= every && guard++ < 2000) {
        acc -= every;
        if (role === 'salter') {
          if (isl.salt >= saltCap(s)) {
            acc = Math.min(acc, every);
            break;
          }
          isl.salt++;
          rep.salt++;
        } else if (role === 'fisher') {
          const id = rollStaffFish(rng, s.sea, st.level);
          if (s.bucket.length >= bucketCap(s)) {
            if (level(s, 'tradepost') > 0) {
              // traders buy what the bucket can't hold
              const raw = SPECIES_BY_ID[id].raw;
              s.coins += raw;
              s.stats.earned += raw;
              rep.coins += raw;
              continue;
            }
            acc = Math.min(acc, every);
            break;
          }
          const sp = SPECIES_BY_ID[id];
          const size = Math.round(((sp.size[0] + sp.size[1]) / 2) * 10) / 10;
          s.bucket.push({ uid: s.nextUid++, species: id, size, freshness: Math.min(0.85, 0.35 + 0.09 * st.level), perfect: false });
          const e = s.dex[id];
          s.dex[id] = { count: (e?.count ?? 0) + 1, best: Math.max(e?.best ?? 0, size) };
          rep.fish++;
        } else if (role === 'brewer') {
          brewStep(s, st.level, rng, now, rep);
        } else {
          const i = s.shelf.findIndex((p) => p.auto);
          if (i < 0) {
            acc = Math.min(acc, every);
            break;
          }
          const price = Math.round(saucePrice(s.shelf[i].degrees, s.upgrades.stall) * shopMult(s, st.level));
          s.shelf.splice(i, 1);
          s.coins += price;
          s.stats.earned += price;
          s.stats.sold++;
          rep.bottles++;
          rep.coins += price;
        }
      }
      isl.timers[st.uid] = acc;
    }
  }
  isl.made.fish += rep.fish;
  isl.made.salt += rep.salt;
  isl.made.jars += rep.jars;
  isl.made.bottles += rep.bottles;
  isl.made.coins += rep.coins;
  return rep;
}

/** One brewer action: open a ready staff jar, else seal an empty jar with the best 3 fish and 1 salt. */
function brewStep(s: GameState, lvl: number, rng: Rng, now: number, rep: TickReport): void {
  const wait = lvl >= 3 ? 2 : 1;
  const ready = s.jars.findIndex((j) => j.sealed && j.auto && agingLevel(s, j, now) >= wait);
  if (ready >= 0) {
    openJar(s, ready, now);
    return;
  }
  const free = s.jars.findIndex((j) => !j.sealed);
  if (free < 0 || s.island.salt < 1 || s.bucket.filter(canFerment).length < BALANCE.jarSlots) return;
  if (sealJar(s, free, bestJarFill(s), rng, now, { auto: true, bonus: lvl - 1 })) {
    s.island.salt--;
    rep.jars++;
  }
}

/** Offline catch-up is capped so a week away doesn't flood the bucket (storage caps also apply). */
export const OFFLINE_CAP_SECONDS = 4 * 3600;

/** Catches the island up to `now` in 10 s steps (jar aging uses real time, so brewing stays correct). */
export function catchUp(s: GameState, rng: Rng, now: number): TickReport {
  const total: TickReport = { fish: 0, salt: 0, jars: 0, bottles: 0, coins: 0 };
  const last = s.island.lastTick || now;
  let left = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (now - last) / 1000));
  let t = now - left * 1000;
  while (left > 0) {
    const step = Math.min(10, left);
    t += step * 1000;
    const r = tickIsland(s, step, rng, t);
    for (const k of Object.keys(total) as (keyof TickReport)[]) total[k] += r[k];
    left -= step;
  }
  s.island.lastTick = now;
  return total;
}
