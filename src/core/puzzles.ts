// Puzzle sections: the thinking part of the business. Staff do the routine work; the player solves
// hand-made puzzles, and each cleared level lets one more staff level be trained in that section.
// Each section has a 100-level track; levels ship in batches (the first 5 are built).
// Pure rules + level data, all checked for solvability in tests.
import { saucePrice, tierFor, type SeaId } from './data';
import type { GameState } from './state';

export type Section = 'fishing' | 'salt' | 'shop';
export const LEVELS_PER_SECTION = 100;

export const SECTION_INFO: Record<Section, { title: string; local: string; blurb: string; trains: string; color: string; dark: string }> = {
  fishing: { title: 'Fishing Puzzles', local: 'Câu cá', blurb: 'Plan the food chain with only a few casts.', trains: 'Fishers', color: '#2a9db5', dark: '#16677a' },
  salt: { title: 'Salt Field Puzzles', local: 'Ruộng muối', blurb: 'Turn the channels so sea water reaches every salt pan.', trains: 'Salt Makers & Brewers', color: '#8fa9b8', dark: '#5d7686' },
  shop: { title: 'Shop Puzzles', local: 'Bán mắm', blurb: 'Give every customer a bottle they will love.', trains: 'Shopkeepers', color: '#e67e22', dark: '#a85a14' },
};

/** Stars per level (0 = not cleared yet). */
export type PuzzleProgress = Record<Section, number[]>;

export function newPuzzles(): PuzzleProgress {
  return { fishing: [], salt: [], shop: [] };
}

export function levelCount(section: Section): number {
  return section === 'fishing' ? FISHING_LEVELS.length : section === 'salt' ? SALT_LEVELS.length : SHOP_LEVELS.length;
}

export function stars(s: GameState, section: Section, index: number): number {
  return s.puzzles[section][index] ?? 0;
}

/** Level i is open when it is built and every earlier level is cleared. */
export function levelOpen(s: GameState, section: Section, index: number): boolean {
  if (index >= levelCount(section)) return false;
  for (let i = 0; i < index; i++) if (stars(s, section, i) === 0) return false;
  return true;
}

export function levelReward(section: Section, index: number): { coins: number; salt: number } {
  return { coins: 30 + 25 * index, salt: section === 'salt' ? 3 + 2 * index : 0 };
}

/** Records a result. Rewards are paid on the first clear only; replays can raise the stars. */
export function completeLevel(s: GameState, section: Section, index: number, starCount: number): { first: boolean; coins: number; salt: number } {
  const prev = stars(s, section, index);
  s.puzzles[section][index] = Math.max(prev, starCount);
  for (let i = 0; i < index; i++) s.puzzles[section][i] ??= 0;
  if (prev > 0 || starCount <= 0) return { first: false, coins: 0, salt: 0 };
  const r = levelReward(section, index);
  s.coins += r.coins;
  s.stats.earned += r.coins;
  s.island.salt += r.salt;
  return { first: true, ...r };
}

// ---------- Fishing puzzles (the food chain with a fixed school of fish) ----------

export interface FishingLevel {
  title: string;
  hint: string;
  sea: SeaId;
  casts: number;
  /** Line level used for reach (puzzles don't depend on bought gear). */
  line: number;
  /** The fish in the water at the start; x in 0..390 screen space, depth 0 near … 1 far. */
  fish: { species: string; x: number; depth: number; dir: 1 | -1 }[];
  goal: { kind: 'chain'; n: number } | { kind: 'catch'; species: string } | { kind: 'links'; n: number };
}

export const FISHING_LEVELS: FishingLevel[] = [
  {
    title: 'First Link',
    hint: 'Catch a small fish, then the hungry one that comes up.',
    sea: 'lagoon',
    casts: 3,
    line: 0,
    fish: [
      { species: 'anchovy', x: 120, depth: 0.25, dir: 1 },
      { species: 'sardine', x: 280, depth: 0.42, dir: -1 },
      { species: 'scad', x: 60, depth: 0.55, dir: 1 },
    ],
    goal: { kind: 'chain', n: 2 },
  },
  {
    title: 'Too Deep to Reach',
    hint: 'The Mackerel is beyond your line. Make it hungry.',
    sea: 'lagoon',
    casts: 4,
    line: 0,
    fish: [
      { species: 'anchovy', x: 200, depth: 0.22, dir: -1 },
      { species: 'crab', x: 90, depth: 0.15, dir: 1 },
      { species: 'scad', x: 300, depth: 0.58, dir: -1 },
      { species: 'mackerel', x: 150, depth: 0.85, dir: 1 },
    ],
    goal: { kind: 'catch', species: 'mackerel' },
  },
  {
    title: 'Three in a Row',
    hint: 'Small, bigger, biggest. Any wrong catch breaks the chain.',
    sea: 'lagoon',
    casts: 4,
    line: 0,
    fish: [
      { species: 'sardine', x: 250, depth: 0.4, dir: -1 },
      { species: 'crab', x: 140, depth: 0.15, dir: 1 },
      { species: 'scad', x: 60, depth: 0.5, dir: 1 },
      { species: 'mackerel', x: 330, depth: 0.85, dir: -1 },
    ],
    goal: { kind: 'chain', n: 3 },
  },
  {
    title: 'Two Chains',
    hint: 'Earn 3 chain links. One chain is not enough: start a second.',
    sea: 'lagoon',
    casts: 5,
    line: 0,
    fish: [
      { species: 'anchovy', x: 100, depth: 0.25, dir: 1 },
      { species: 'anchovy', x: 300, depth: 0.3, dir: -1 },
      { species: 'sardine', x: 200, depth: 0.42, dir: 1 },
      { species: 'scad', x: 40, depth: 0.55, dir: 1 },
    ],
    goal: { kind: 'links', n: 3 },
  },
  {
    title: 'Not One Wasted Cast',
    hint: 'Three casts, three links. Every cast must count.',
    sea: 'lagoon',
    casts: 3,
    line: 0,
    fish: [
      { species: 'crab', x: 200, depth: 0.15, dir: 1 },
      { species: 'sardine', x: 90, depth: 0.42, dir: 1 },
      { species: 'scad', x: 300, depth: 0.55, dir: -1 },
      { species: 'mackerel', x: 180, depth: 0.88, dir: -1 },
    ],
    goal: { kind: 'chain', n: 3 },
  },
];

export function fishingGoalText(l: FishingLevel): string {
  if (l.goal.kind === 'chain') return `Make a food chain ×${l.goal.n}`;
  if (l.goal.kind === 'links') return `Earn ${l.goal.n} chain links`;
  return `Catch a ${l.goal.species[0].toUpperCase()}${l.goal.species.slice(1)}`;
}

export function fishingGoalMet(l: FishingLevel, r: { bestChain: number; links: number; caught: string[] }): boolean {
  if (l.goal.kind === 'chain') return r.bestChain >= l.goal.n;
  if (l.goal.kind === 'links') return r.links >= l.goal.n;
  return r.caught.includes(l.goal.species);
}

/** Fishing stars: clear = 1, +1 if every catch was fresh (★★+), +1 if every catch was perfect. */
export function fishingStars(met: boolean, freshness: number[]): number {
  if (!met) return 0;
  return 1 + (freshness.every((f) => f >= 0.5) ? 1 : 0) + (freshness.every((f) => f >= 0.8) ? 1 : 0);
}

// ---------- Salt field puzzles (rotate channels so sea water reaches every pan) ----------

/** Open sides as a bitmask: N 1, E 2, S 4, W 8. */
const N = 1;
const E = 2;
const S = 4;
const Wd = 8;
const PIPES: Record<string, number> = { '─': E | Wd, '│': N | S, '└': N | E, '┌': E | S, '┐': S | Wd, '┘': N | Wd, '├': N | E | S, '┬': E | S | Wd, '┤': N | S | Wd, '┴': N | E | Wd, '┼': 15 };
const GATES: Record<string, number> = { '^': N, '>': E, v: S, '<': Wd };

export type SaltCell = { kind: 'empty' } | { kind: 'gate'; mask: number } | { kind: 'pan' } | { kind: 'pipe'; mask: number; solved: number };

export interface SaltLevel {
  title: string;
  hint: string;
  /** The SOLVED layout: the puzzle starts with the pipes turned away from this. */
  rows: string[];
}

export const SALT_LEVELS: SaltLevel[] = [
  { title: 'Open the Gate', hint: 'Tap a channel to turn it. Lead the sea water to the salt pan.', rows: ['>─┐', '..│', '..P'] },
  { title: 'Two Pans', hint: 'A T-channel splits the water in two.', rows: ['v...', '├─┐.', 'P.│.', '..└P'] },
  { title: 'Decoys', hint: 'Not every channel is needed. Find the right path.', rows: ['>┬─P', '└│┐P', '│├─┘', '.P─┌'] },
  { title: 'The Crossroads', hint: 'A cross carries water in every direction.', rows: ['─┘v└│', '┌─┼─┐', '│┘│└│', 'P─│┬P', '┐│P─┌'] },
  { title: 'The Long Way Round', hint: 'Four pans, one gate. Follow the water from the sea.', rows: ['>─┐P┐', '─┌┘│└', '┌│┼├P', 'P┤┘││', '│└─┴P'] },
];

export function rotate(mask: number, turns = 1): number {
  let m = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

export interface SaltBoard {
  w: number;
  h: number;
  cells: SaltCell[];
}

/** Builds the starting board: every pipe turned 1-3 steps away from the solution (fixed per level). */
export function saltBoard(levelIndex: number): SaltBoard {
  const rows = SALT_LEVELS[levelIndex].rows;
  const w = rows[0].length;
  const cells: SaltCell[] = [];
  [...rows.join('')].forEach((ch, i) => {
    if (ch in GATES) cells.push({ kind: 'gate', mask: GATES[ch] });
    else if (ch === 'P') cells.push({ kind: 'pan' });
    else if (ch in PIPES) {
      const solved = PIPES[ch];
      const turns = 1 + ((i * 7 + levelIndex * 3) % 3);
      cells.push({ kind: 'pipe', mask: rotate(solved, turns), solved });
    } else cells.push({ kind: 'empty' });
  });
  return { w, h: rows.length, cells };
}

export function turnCell(b: SaltBoard, i: number): boolean {
  const c = b.cells[i];
  if (c?.kind !== 'pipe') return false;
  c.mask = rotate(c.mask);
  return true;
}

const OPP: Record<number, number> = { [N]: S, [E]: Wd, [S]: N, [Wd]: E };
const STEP: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [Wd]: [-1, 0] };

function openSides(c: SaltCell): number {
  return c.kind === 'pipe' || c.kind === 'gate' ? c.mask : c.kind === 'pan' ? 15 : 0;
}

/** Cells reached by sea water. Pans fill but don't pass water on. */
export function watered(b: SaltBoard): Set<number> {
  const out = new Set<number>();
  const start = b.cells.findIndex((c) => c.kind === 'gate');
  if (start < 0) return out;
  const queue = [start];
  out.add(start);
  while (queue.length) {
    const i = queue.shift()!;
    const c = b.cells[i];
    if (c.kind === 'pan') continue;
    for (const d of [N, E, S, Wd]) {
      if (!(openSides(c) & d)) continue;
      const x = (i % b.w) + STEP[d][0];
      const y = Math.floor(i / b.w) + STEP[d][1];
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) continue;
      const j = y * b.w + x;
      if (out.has(j) || !(openSides(b.cells[j]) & OPP[d])) continue;
      out.add(j);
      queue.push(j);
    }
  }
  return out;
}

export function saltSolved(b: SaltBoard): boolean {
  const w = watered(b);
  return b.cells.every((c, i) => c.kind !== 'pan' || w.has(i));
}

/** Fewest taps to turn every pipe back to the authored solution (the star target). */
export function saltPar(b: SaltBoard): number {
  let par = 0;
  for (const c of b.cells) {
    if (c.kind !== 'pipe') continue;
    let k = 0;
    while (rotate(c.mask, k) !== c.solved && k < 4) k++;
    par += k;
  }
  return par;
}

export function saltStars(taps: number, par: number): number {
  return taps <= par ? 3 : taps <= par + 4 ? 2 : 1;
}

// ---------- Shop puzzles (match bottles to customers) ----------

export interface Bottle {
  recipe: string;
  degrees: number;
}

export interface Customer {
  name: string;
  /** Short line shown on the card. */
  says: string;
  minDeg?: number;
  maxDeg?: number;
  recipe?: string;
  notRecipe?: string;
  /** Extra coins if they get their favourite recipe. */
  fav?: string;
  tip?: number;
  look: { shirt: string; hat?: string };
}

export interface ShopLevel {
  title: string;
  hint: string;
  bottles: Bottle[];
  customers: Customer[];
}

export const SHOP_LEVELS: ShopLevel[] = [
  {
    title: 'Opening Day',
    hint: 'Tap a bottle, then the customer who should get it.',
    bottles: [
      { recipe: 'classic', degrees: 18 },
      { recipe: 'reef', degrees: 24 },
    ],
    customers: [
      { name: 'Anh Long', says: 'Anything tasty!', look: { shirt: '#5aa0d8' } },
      { name: 'Bà Hai', says: 'Fine quality (22°N+) only.', minDeg: 22, look: { shirt: '#a35bd6', hat: '#f2d98a' } },
    ],
  },
  {
    title: 'The Squid Fan',
    hint: 'Some customers want one recipe. Favourites pay a tip.',
    bottles: [
      { recipe: 'classic', degrees: 16 },
      { recipe: 'squid', degrees: 23 },
      { recipe: 'reef', degrees: 31 },
    ],
    customers: [
      { name: 'Cô Lụa', says: 'Squid Mắm, please!', recipe: 'squid', fav: 'squid', tip: 10, look: { shirt: '#e8b7c8' } },
      { name: 'Chef Minh', says: 'Premium (30°N+) for my restaurant.', minDeg: 30, look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Bé Bin', says: 'The cheap one is fine.', look: { shirt: '#7fd18b' } },
    ],
  },
  {
    title: 'One Too Many',
    hint: 'More bottles than customers. Keep the right one back.',
    bottles: [
      { recipe: 'blend', degrees: 14 },
      { recipe: 'classic', degrees: 22 },
      { recipe: 'golden', degrees: 27 },
      { recipe: 'reef', degrees: 30 },
    ],
    customers: [
      { name: 'Ông Sáu', says: 'Fine (22°N+). I love Golden!', minDeg: 22, fav: 'golden', tip: 15, look: { shirt: '#c9a36a' } },
      { name: 'Chị Ngọc', says: 'At least 25°N.', minDeg: 25, look: { shirt: '#3a8fd9' } },
      { name: 'Tourist Sam', says: 'Real Phú Quốc classic!', recipe: 'classic', look: { shirt: '#f2c14e', hat: '#e8553a' } },
    ],
  },
  {
    title: 'Busy Morning',
    hint: 'Serve the picky customers first, in your head.',
    bottles: [
      { recipe: 'classic', degrees: 15 },
      { recipe: 'classic', degrees: 23 },
      { recipe: 'squid', degrees: 20 },
      { recipe: 'reef', degrees: 28 },
      { recipe: 'shrimp', degrees: 26 },
    ],
    customers: [
      { name: 'Chú Tư', says: 'Mắm tôm or nothing!', recipe: 'shrimp', look: { shirt: '#8a6238', hat: '#d9b35b' } },
      { name: 'Chef Minh', says: '25°N+, but no shrimp paste.', minDeg: 25, notRecipe: 'shrimp', look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Tourist Sam', says: 'Classic, at least 20°N.', recipe: 'classic', minDeg: 20, look: { shirt: '#f2c14e', hat: '#e8553a' } },
      { name: 'Bé Bin', says: 'Anything! Squid is my favourite.', fav: 'squid', tip: 8, look: { shirt: '#7fd18b' } },
    ],
  },
  {
    title: 'Festival Rush',
    hint: 'Six bottles, five customers, one best answer.',
    bottles: [
      { recipe: 'blend', degrees: 12 },
      { recipe: 'classic', degrees: 21 },
      { recipe: 'classic', degrees: 25 },
      { recipe: 'reef', degrees: 29 },
      { recipe: 'dragon', degrees: 34 },
      { recipe: 'squid', degrees: 22 },
    ],
    customers: [
      { name: 'Thầy Tâm', says: '20°N+. Classic makes me smile.', minDeg: 20, fav: 'classic', tip: 10, look: { shirt: '#e8a040' } },
      { name: 'Bà Lan', says: 'Premium (30°N+) for the wedding!', minDeg: 30, look: { shirt: '#c0392b', hat: '#f2d98a' } },
      { name: 'Chef Minh', says: 'Reef Reserve, please.', recipe: 'reef', look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Bà Hai', says: 'Fine (22°N+) only.', minDeg: 22, look: { shirt: '#a35bd6', hat: '#f2d98a' } },
      { name: 'Student Huy', says: 'I only have a little money (≤15°N).', maxDeg: 15, look: { shirt: '#5aa0d8' } },
    ],
  },
];

export function accepts(c: Customer, b: Bottle): boolean {
  if (c.minDeg !== undefined && b.degrees < c.minDeg) return false;
  if (c.maxDeg !== undefined && b.degrees > c.maxDeg) return false;
  if (c.recipe && b.recipe !== c.recipe) return false;
  if (c.notRecipe && b.recipe === c.notRecipe) return false;
  return true;
}

/** Coins for giving bottle b to customer c (the sauce price, plus a tip for a favourite). */
export function saleValue(c: Customer, b: Bottle): number {
  return saucePrice(b.degrees, 0) + (c.fav && c.fav === b.recipe ? (c.tip ?? 0) : 0);
}

/** Best possible total when every customer is served (brute force; levels are tiny). null = impossible. */
export function shopBest(l: ShopLevel): number | null {
  let best: number | null = null;
  const used = new Set<number>();
  const go = (ci: number, sum: number) => {
    if (ci === l.customers.length) {
      best = Math.max(best ?? 0, sum);
      return;
    }
    l.bottles.forEach((b, bi) => {
      if (used.has(bi) || !accepts(l.customers[ci], b)) return;
      used.add(bi);
      go(ci + 1, sum + saleValue(l.customers[ci], b));
      used.delete(bi);
    });
  };
  go(0, 0);
  return best;
}

/** Shop stars: everyone served = 1, ≥ 90% of the best total = 2, the best total = 3. */
export function shopStars(total: number, best: number, allServed: boolean): number {
  if (!allServed) return 0;
  return total >= best ? 3 : total >= best * 0.9 ? 2 : 1;
}

export function wantText(c: Customer): string {
  return c.says;
}

export { tierFor };
