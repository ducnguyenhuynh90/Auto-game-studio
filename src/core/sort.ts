// Market Sort: a goods-sorting mini game at Bà Năm's market stall (inspired by "Goods Sort").
// Shelves hold 3 goods in front, with more rows waiting behind. Move goods between front slots; three of
// a kind on one shelf are sold (cleared). When a shelf's front row is empty, the row behind slides
// forward. Some shelves are tied shut until enough sales are made. Clear the stall before the timer ends.
// 50 levels from super easy to hard. Every level is generated from its number and proven solvable by
// the solver below before it is shown (honest: no impossible boards, no hidden tricks).
import type { GameState } from './state';
import { makeRng, type Rng } from './rng';

export const SORT_LEVELS = 50;
export const SLOTS = 3;

/** The goods on the stall: Phú Quốc market things. */
export const GOODS: { id: string; name: string; emoji: string; color: string }[] = [
  { id: 'sauce', name: 'Fish sauce', emoji: '🍶', color: '#e8c58a' },
  { id: 'anchovy', name: 'Anchovies', emoji: '🐟', color: '#9fd3e6' },
  { id: 'prawn', name: 'Prawns', emoji: '🦐', color: '#f7b39a' },
  { id: 'squid', name: 'Squid', emoji: '🦑', color: '#e7a6c9' },
  { id: 'crab', name: 'Crab', emoji: '🦀', color: '#f28b6b' },
  { id: 'lime', name: 'Lime', emoji: '🍋', color: '#d9ef8b' },
  { id: 'chili', name: 'Chili', emoji: '🌶️', color: '#f59a8e' },
  { id: 'coconut', name: 'Coconut', emoji: '🥥', color: '#d8c3a5' },
  { id: 'rice', name: 'Rice', emoji: '🍚', color: '#f3efe3' },
  { id: 'salt', name: 'Sea salt', emoji: '🧂', color: '#dfe8ee' },
  { id: 'garlic', name: 'Garlic', emoji: '🧄', color: '#efe6d2' },
  { id: 'pineapple', name: 'Pineapple', emoji: '🍍', color: '#f6d76b' },
  { id: 'mango', name: 'Mango', emoji: '🥭', color: '#f8c36a' },
  { id: 'shell', name: 'Shells', emoji: '🐚', color: '#f4d9cf' },
  { id: 'tea', name: 'Tea', emoji: '🍵', color: '#b7dca0' },
  { id: 'melon', name: 'Watermelon', emoji: '🍉', color: '#f5a3a3' },
];

export type Good = number; // index into GOODS
export interface Shelf {
  /** rows[0] is the front row (3 slots); later rows wait behind it. */
  rows: (Good | null)[][];
  /** Sales still needed before this shelf opens (0 = open). */
  lock: number;
}
export interface SortBoard {
  level: number;
  shelves: Shelf[];
  sold: number;
  moves: number;
  /** Seconds allowed for the level. */
  time: number;
  /** Solver seed that clears this layout (the proof it is winnable; tests replay it). */
  proof?: number;
}

export interface SortLevelSpec {
  shelves: number;
  depth: number;
  kinds: number;
  triples: number;
  locked: number;
  lockAfter: number;
  time: number;
  tier: 'super easy' | 'easy' | 'medium' | 'hard';
}

/** The difficulty curve: more shelves, deeper rows, more kinds, fewer spare slots, less time. */
export function sortLevelSpec(i: number): SortLevelSpec {
  const tier = i < 5 ? 'super easy' : i < 15 ? 'easy' : i < 30 ? 'medium' : 'hard';
  const shelves = Math.min(12, 3 + Math.floor(i / 4.5));
  const depth = i < 3 ? 1 : i < 12 ? 2 : i < 30 ? 3 : 4;
  const capacity = shelves * SLOTS * depth;
  // spare room: generous at first, tight later (always at least 4 free front slots)
  const spareFrac = 0.42 - 0.27 * (i / (SORT_LEVELS - 1));
  const spare = Math.max(4, Math.round(capacity * spareFrac));
  const triples = Math.max(2, Math.floor((capacity - spare) / SLOTS));
  const kinds = Math.min(GOODS.length, triples, 2 + Math.floor(i / 3.2));
  const locked = i < 18 ? 0 : i < 34 ? 1 : 2;
  const lockAfter = 3 + Math.floor(i / 12);
  const perTriple = 14 - 6 * (i / (SORT_LEVELS - 1));
  const time = Math.max(60, Math.round((30 + triples * perTriple) / 10) * 10);
  return { shelves, depth, kinds, triples, locked, lockAfter, time, tier };
}

const front = (b: SortBoard, s: number) => b.shelves[s].rows[0];
const open = (b: SortBoard, s: number) => b.shelves[s].lock <= 0;

/** Lays out a level from its spec with a given seed (not yet checked for solvability). */
function layout(i: number, seed: number): SortBoard {
  const sp = sortLevelSpec(i);
  const rng = makeRng(seed);
  // goods: every kind gets at least one triple, the rest spread at random
  const bag: Good[] = [];
  const kinds = shuffled(rng, GOODS.map((_, k) => k)).slice(0, sp.kinds);
  for (let t = 0; t < sp.triples; t++) {
    const k = t < kinds.length ? kinds[t] : kinds[Math.floor(rng() * kinds.length)];
    bag.push(k, k, k);
  }
  const goods = shuffled(rng, bag);
  // slots: free room is kept in the front row (where the player works); the rest fill the rows behind
  const shelves: Shelf[] = Array.from({ length: sp.shelves }, () => ({ rows: Array.from({ length: sp.depth }, () => [null, null, null] as (Good | null)[]), lock: 0 }));
  const frontSlots: [number, number, number][] = [];
  const backSlots: [number, number, number][] = [];
  for (let s = 0; s < sp.shelves; s++)
    for (let r = 0; r < sp.depth; r++) for (let c = 0; c < SLOTS; c++) (r === 0 ? frontSlots : backSlots).push([s, r, c]);
  const F = frontSlots.length;
  const frontFree = Math.max(3, Math.round(F * (0.5 - 0.3 * (i / (SORT_LEVELS - 1)))));
  const frontGoods = Math.max(goods.length - backSlots.length, Math.min(goods.length, F - frontFree));
  const places = [...shuffled(rng, frontSlots).slice(0, frontGoods), ...shuffled(rng, backSlots).slice(0, goods.length - frontGoods)];
  goods.forEach((g, n) => {
    const [s, r, c] = places[n];
    shelves[s].rows[r][c] = g;
  });
  // rows behind keep their goods packed towards the front, and a shelf whose front starts empty shows its next row
  for (const sh of shelves) {
    const behind = sh.rows.slice(1).filter((row) => row.some((x) => x !== null));
    sh.rows = [sh.rows[0], ...behind];
    settle(sh);
  }
  // locked shelves: the fullest ones, so opening them matters
  const byFill = shelves.map((sh, s) => [s, sh.rows.flat().filter((x) => x !== null).length] as const).sort((a, b) => b[1] - a[1]);
  for (let n = 0; n < sp.locked; n++) shelves[byFill[n][0]].lock = sp.lockAfter + n * 2;
  return { level: i, shelves, sold: 0, moves: 0, time: sp.time };
}

function shuffled<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let n = a.length - 1; n > 0; n--) {
    const m = Math.floor(rng() * (n + 1));
    [a[n], a[m]] = [a[m], a[n]];
  }
  return a;
}

/** Empty front rows make way for the row behind; leftover empty rows disappear. */
function settle(sh: Shelf): void {
  while (sh.rows.length > 1 && sh.rows[0].every((x) => x === null)) sh.rows.shift();
}

export function cloneBoard(b: SortBoard): SortBoard {
  return { ...b, shelves: b.shelves.map((sh) => ({ lock: sh.lock, rows: sh.rows.map((r) => [...r]) })) };
}

/** Sells a full front row of one kind (and counts it towards the tied shelves). Returns the good sold. */
function resolve(b: SortBoard, s: number): Good | null {
  const row = front(b, s);
  if (row[0] === null || !row.every((x) => x === row[0])) {
    settle(b.shelves[s]);
    return null;
  }
  const g = row[0];
  b.shelves[s].rows[0] = [null, null, null];
  settle(b.shelves[s]);
  b.sold++;
  for (const sh of b.shelves) if (sh.lock > 0) sh.lock--;
  return g;
}

export interface MoveResult {
  ok: boolean;
  /** The good sold by this move, if it completed a row. */
  sold: Good | null;
}

/** Moves the good in front slot (fs, fc) to the empty front slot (ts, tc). */
export function sortMove(b: SortBoard, fs: number, fc: number, ts: number, tc: number): MoveResult {
  const g = front(b, fs)[fc];
  if (g === null || g === undefined || !open(b, fs) || !open(b, ts) || front(b, ts)[tc] !== null || (fs === ts && fc === tc)) return { ok: false, sold: null };
  front(b, fs)[fc] = null;
  front(b, ts)[tc] = g;
  b.moves++;
  const sold = resolve(b, ts);
  if (fs !== ts) resolve(b, fs);
  return { ok: true, sold };
}

/** The first empty front slot of a shelf (moving to a shelf, not to an exact slot), or -1. */
export function freeSlot(b: SortBoard, s: number): number {
  return open(b, s) ? front(b, s).indexOf(null) : -1;
}

export function sortWon(b: SortBoard): boolean {
  return b.shelves.every((sh) => sh.rows.every((r) => r.every((x) => x === null)));
}

/** No free front slot on any open shelf: nothing can move. */
export function sortStuck(b: SortBoard): boolean {
  return !sortWon(b) && b.shelves.every((_, s) => freeSlot(b, s) < 0);
}

export function goodsLeft(b: SortBoard): number {
  return b.shelves.reduce((n, sh) => n + sh.rows.flat().filter((x) => x !== null).length, 0);
}

// ---------- Solver (proves levels solvable; also gives the Hint) ----------

type Move = [number, number, number, number];

/**
 * One good next move, or null when the solver sees none. In order: finish a row of one kind; start one
 * on an empty shelf; move an odd good out of a nearly-pure row; otherwise make room (or reveal the row
 * behind) by moving a good off the shelf with the fewest goods in front.
 */
export function hintMove(b: SortBoard, rng: Rng = Math.random): Move | null {
  const shelves = shuffled(rng, b.shelves.map((_, s) => s).filter((s) => open(b, s)));
  const goods = (s: number) => front(b, s).filter((x) => x !== null) as Good[];
  const where = (g: Good, not: number) => shelves.flatMap((s) => (s === not ? [] : front(b, s).flatMap((x, c) => (x === g ? [[s, c] as const] : []))));
  const spots = (not: number) => shelves.flatMap((s) => (s === not ? [] : front(b, s).flatMap((x, c) => (x === null ? [[s, c] as const] : []))));
  // A: rows holding only one kind and a gap, fullest first, when enough of that kind is in view
  const pure = shelves
    .map((s) => ({ s, g: goods(s)[0], have: goods(s).length }))
    .filter(({ s, g, have }) => have > 0 && have < SLOTS && goods(s).every((x) => x === g))
    .sort((x, y) => y.have - x.have);
  for (const p of pure) {
    const src = where(p.g, p.s);
    if (src.length >= SLOTS - p.have) return [src[0][0], src[0][1], p.s, front(b, p.s).indexOf(null)];
  }
  // B: an empty shelf starts a row for a kind with three in view
  const empty = shelves.find((s) => goods(s).length === 0);
  if (empty !== undefined) {
    const counts = new Map<Good, number>();
    for (const s of shelves) for (const g of goods(s)) counts.set(g, (counts.get(g) ?? 0) + 1);
    for (const [g, n] of counts) {
      if (n < SLOTS) continue;
      // take it from a mixed row, so the move also helps that shelf
      const src = where(g, empty).sort((x, y) => Number(goods(x[0]).every((k) => k === g)) - Number(goods(y[0]).every((k) => k === g)));
      return [src[0][0], src[0][1], empty, 0];
    }
  }
  // C: a row of two of a kind plus one odd good: move the odd one next to its own kind, or anywhere free
  for (const s of shelves) {
    const row = front(b, s);
    if (row.includes(null)) continue;
    const g = row.find((x) => row.filter((y) => y === x).length === 2);
    if (g === undefined || g === null || where(g, s).length === 0) continue;
    const c = row.findIndex((x) => x !== g);
    const odd = row[c];
    const free = spots(s);
    const best = free.find(([o]) => goods(o).length > 0 && goods(o).every((x) => x === odd)) ?? free.find(([o]) => goods(o).length > 0) ?? free[0];
    if (best) return [s, c, best[0], best[1]];
  }
  // D: make room / reveal the row behind. Shelves with rows waiting come first (emptying them shows new
  // goods); a lone good on a shelf with nothing behind is never just carried to another empty shelf.
  const candidates = shelves
    .map((s) => [s, goods(s).length, b.shelves[s].rows.length > 1 ? 0 : 1] as const)
    .filter(([, n]) => n > 0)
    .sort((x, y) => x[2] - y[2] || x[1] - y[1]);
  for (const [s, n, flat] of candidates) {
    const c = front(b, s).findIndex((x) => x !== null);
    const g = front(b, s)[c];
    const free = spots(s);
    const best =
      free.find(([o]) => goods(o).length > 0 && goods(o).every((x) => x === g)) ??
      free.find(([o]) => goods(o).length > 0) ??
      (flat && n === 1 ? undefined : free[0]);
    if (best) return [s, c, best[0], best[1]];
  }
  return null;
}

/** Plays a board to the end with the hint strategy; the winning moves, or null if it gets stuck. */
export function solvePath(b0: SortBoard, seed: number, maxMoves = 4000): Move[] | null {
  const b = cloneBoard(b0);
  const rng = makeRng(seed);
  const path: Move[] = [];
  let since = 0;
  for (let n = 0; n < maxMoves; n++) {
    if (sortWon(b)) return path;
    const m = hintMove(b, rng);
    if (!m) return null;
    const before = b.sold;
    sortMove(b, ...m);
    path.push(m);
    since = b.sold > before ? 0 : since + 1;
    if (since > 60) return null; // going round in circles
  }
  return null;
}

/** True if the hint strategy clears the board with this seed. */
export function solves(b: SortBoard, seed: number, maxMoves = 4000): boolean {
  return solvePath(b, seed, maxMoves) !== null;
}

/** A board's layout as text, independent of how the objects were built (key order). */
const sig = (b: SortBoard) => b.shelves.map((sh) => `${sh.lock}:${sh.rows.map((r) => r.join(',')).join('|')}`).join('/');

/** A winning plan the Hint keeps to while the player follows it (each board along the way, and its move). */
export interface HintPlan {
  states: string[];
  moves: Move[];
}

/**
 * The in-game Hint: the next move of a whole winning plan, so following hints always clears the stall.
 * While the player follows it, the same plan continues; after their own moves it plans again.
 * Falls back to the plain hint when no plan is found.
 */
export function smartHint(b: SortBoard, plan: HintPlan = { states: [], moves: [] }, tries = 30): Move | null {
  const now = sig(b);
  const at = plan.states.indexOf(now);
  if (at >= 0) return plan.moves[at];
  // the level's own proof works from the start; after the player's own moves, search again
  const seeds = [...(b.proof !== undefined ? [b.proof] : []), ...Array.from({ length: tries }, (_, k) => k + 1)];
  for (const k of seeds) {
    const path = solvePath(b, k);
    if (!path) continue;
    if (!path.length) return null;
    // cut out detours: if the run comes back to a board it has seen, drop the moves in between
    const sim = cloneBoard(b);
    plan.states = [];
    plan.moves = [];
    for (const m of path) {
      const here = sig(sim);
      const seen = plan.states.indexOf(here);
      if (seen >= 0) {
        plan.states.length = seen;
        plan.moves.length = seen;
      }
      plan.states.push(here);
      plan.moves.push(m);
      sortMove(sim, ...m);
    }
    return plan.moves[0];
  }
  return hintMove(b);
}

/** Level i (0-based): the first layout the solver can clear, so every level is winnable. */
export function sortBoard(i: number): SortBoard {
  for (let seed = 1; seed < 400; seed++) {
    const b = layout(i, i * 1000 + seed);
    if (b.shelves.some((sh) => { const r = sh.rows[0]; return r[0] !== null && r.every((x) => x === r[0]); })) continue; // no free sale at the start
    if (b.shelves.reduce((n, sh) => n + (sh.lock > 0 ? 0 : sh.rows[0].filter((x) => x === null).length), 0) < 3) continue; // room to move
    for (let a = 0; a < 6; a++) if (solves(b, seed * 7 + a)) return { ...b, proof: seed * 7 + a };
  }
  throw new Error(`Market Sort level ${i + 1}: no solvable layout`);
}

/** Shuffle booster: deals the goods in the open front rows again (same goods, new places). */
export function sortShuffle(b: SortBoard, rng: Rng): void {
  const spots: [number, number][] = [];
  const goods: Good[] = [];
  b.shelves.forEach((sh, s) => {
    if (sh.lock > 0) return;
    sh.rows[0].forEach((x, c) => {
      if (x !== null) {
        spots.push([s, c]);
        goods.push(x);
      }
    });
  });
  const deal = shuffled(rng, goods);
  spots.forEach(([s, c], n) => (b.shelves[s].rows[0][c] = deal[n]));
  for (let s = 0; s < b.shelves.length; s++) resolve(b, s);
}

// ---------- Progress & rewards ----------

/** Stars from the time left: 3 with half the clock left, 2 with a quarter, 1 for finishing. */
export function sortStars(timeLeft: number, time: number): number {
  if (timeLeft <= 0) return 0;
  return timeLeft >= time * 0.5 ? 3 : timeLeft >= time * 0.25 ? 2 : 1;
}

export function sortReward(i: number): number {
  return 20 + 6 * i;
}

/** Booster prices in game coins (earned by playing; nothing here costs real money). */
export const SORT_BOOSTERS = {
  hint: { name: 'Hint', icon: '💡', cost: 10, desc: 'Shows a good move.' },
  shuffle: { name: 'Shuffle', icon: '🔀', cost: 25, desc: 'Deals the front goods again.' },
  time: { name: '+60 s', icon: '⏱️', cost: 30, desc: 'Sixty more seconds.' },
} as const;
export type SortBooster = keyof typeof SORT_BOOSTERS;

export function sortStarsOf(s: GameState, i: number): number {
  return s.sort?.[i] ?? 0;
}

export function sortOpen(s: GameState, i: number): boolean {
  return i === 0 || sortStarsOf(s, i - 1) > 0;
}

/** Records a result; coins are paid on the first clear only, replays can raise the stars. */
export function sortComplete(s: GameState, i: number, starCount: number): { first: boolean; coins: number } {
  s.sort ??= [];
  const prev = sortStarsOf(s, i);
  s.sort[i] = Math.max(prev, starCount);
  for (let n = 0; n < i; n++) s.sort[n] ??= 0;
  if (prev > 0 || starCount <= 0) return { first: false, coins: 0 };
  const coins = sortReward(i);
  s.coins += coins;
  s.stats.earned += coins;
  return { first: true, coins };
}

/** Pays for a booster from the player's coins; false if they can't afford it. */
export function buySortBooster(s: GameState, k: SortBooster): boolean {
  const cost = SORT_BOOSTERS[k].cost;
  if (s.coins < cost) return false;
  s.coins -= cost;
  return true;
}
