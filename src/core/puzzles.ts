// Puzzle sections: the thinking part of the business. Staff do the routine work; the player solves
// hand-made puzzles, and each cleared level lets one more staff level be trained in that section.
// Each section has a 100-level track; levels ship in batches (the first 5 are built).
// Pure rules + level data, all checked for solvability in tests.
import { saucePrice, tierFor, type SeaId } from './data';
import type { GameState } from './state';
import { makeRng } from './rng';

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
  {
    title: 'The Reef Ladder',
    hint: 'Four steps on the reef: small, squid, snapper, then the Giant Trevally.',
    sea: 'reef',
    casts: 5,
    line: 1,
    fish: [
      { species: 'anchovy', x: 140, depth: 0.25, dir: 1 },
      { species: 'squid', x: 280, depth: 0.5, dir: -1 },
      { species: 'snapper', x: 60, depth: 0.68, dir: 1 },
      { species: 'trevally', x: 320, depth: 0.95, dir: -1 },
    ],
    goal: { kind: 'chain', n: 4 },
  },
  {
    title: 'Muddy Roots',
    hint: "Chú Tư's delta: a prawn calls a catfish, a catfish calls the snakehead.",
    sea: 'delta',
    casts: 3,
    line: 0,
    fish: [
      { species: 'mudskipper', x: 250, depth: 0.1, dir: -1 },
      { species: 'prawn', x: 120, depth: 0.3, dir: 1 },
      { species: 'catfish', x: 300, depth: 0.35, dir: -1 },
      { species: 'snakehead', x: 80, depth: 0.65, dir: 1 },
    ],
    goal: { kind: 'chain', n: 3 },
  },
  {
    title: 'Barracuda Bait',
    hint: 'The barracuda hunts too deep for a Hemp line. Feed the bay from the bottom up.',
    sea: 'bay',
    casts: 4,
    line: 0,
    fish: [
      { species: 'anchovy', x: 200, depth: 0.25, dir: 1 },
      { species: 'cuttlefish', x: 90, depth: 0.5, dir: 1 },
      { species: 'lobster', x: 310, depth: 0.85, dir: -1 },
      { species: 'barracuda', x: 160, depth: 0.72, dir: -1 },
    ],
    goal: { kind: 'catch', species: 'barracuda' },
  },
  {
    title: 'Links Galore',
    hint: 'Earn 4 chain links. Plan two chains, or one very long one.',
    sea: 'reef',
    casts: 6,
    line: 1,
    fish: [
      { species: 'anchovy', x: 90, depth: 0.25, dir: 1 },
      { species: 'anchovy', x: 300, depth: 0.28, dir: -1 },
      { species: 'scad', x: 200, depth: 0.55, dir: 1 },
      { species: 'squid', x: 40, depth: 0.5, dir: 1 },
      { species: 'mackerel', x: 340, depth: 0.8, dir: -1 },
    ],
    goal: { kind: 'links', n: 4 },
  },
  {
    title: 'Master of the Chain',
    hint: 'Four casts, four links, all the way to the Giant Trevally. No mistakes.',
    sea: 'reef',
    casts: 4,
    line: 1,
    fish: [
      { species: 'anchovy', x: 260, depth: 0.25, dir: -1 },
      { species: 'squid', x: 100, depth: 0.5, dir: 1 },
      { species: 'grouper', x: 330, depth: 0.85, dir: -1 },
      { species: 'trevally', x: 60, depth: 0.95, dir: 1 },
    ],
    goal: { kind: 'chain', n: 4 },
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
  rows?: string[];
  /** Or a generated field: a channel network from the sea gate to `pans` salt pans (solvable by construction). */
  gen?: { seed: number; w: number; h: number; pans: number; decoys: number };
}

export const SALT_LEVELS: SaltLevel[] = [
  { title: 'Open the Gate', hint: 'Tap a channel to turn it. Lead the sea water to the salt pan.', rows: ['>─┐', '..│', '..P'] },
  { title: 'Two Pans', hint: 'A T-channel splits the water in two.', rows: ['v...', '├─┐.', 'P.│.', '..└P'] },
  { title: 'Decoys', hint: 'Not every channel is needed. Find the right path.', rows: ['>┬─P', '└│┐P', '│├─┘', '.P─┌'] },
  { title: 'The Crossroads', hint: 'A cross carries water in every direction.', rows: ['─┘v└│', '┌─┼─┐', '│┘│└│', 'P─│┬P', '┐│P─┌'] },
  { title: 'The Long Way Round', hint: 'Four pans, one gate. Follow the water from the sea.', rows: ['>─┐P┐', '─┌┘│└', '┌│┼├P', 'P┤┘││', '│└─┴P'] },
  { title: 'Morning Tide', hint: 'Bigger fields: trace each pan back to the sea.', gen: { seed: 61, w: 5, h: 5, pans: 3, decoys: 0.5 } },
  { title: 'Canal Maze', hint: 'Dead ends waste water. Find the one true path.', gen: { seed: 72, w: 5, h: 6, pans: 3, decoys: 0.6 } },
  { title: 'Four Fields', hint: 'Four pans, many decoys. Work outward from the gate.', gen: { seed: 83, w: 6, h: 6, pans: 4, decoys: 0.55 } },
  { title: 'Harvest Rush', hint: 'Five pans. Fill the far ones first.', gen: { seed: 94, w: 6, h: 6, pans: 5, decoys: 0.6 } },
  { title: 'The Great Salt Flat', hint: 'The biggest field on Phú Quốc. Slow but sure.', gen: { seed: 105, w: 6, h: 7, pans: 5, decoys: 0.65 } },
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
/**
 * Builds a solved salt field: a random tree of channels grown from the sea gate (top edge), keeping only
 * the branches that lead to `pans` salt pans at its far tips, then sprinkling decoy channels.
 */
export function generateSaltLayout(g: NonNullable<SaltLevel['gen']>): SaltCell[] {
  // some seeds grow too few tips for the pans asked for: try the next seed (still deterministic)
  for (let k = 0; k < 50; k++) {
    const cells = growSaltField(g, g.seed + k * 1009);
    if (cells.filter((c) => c.kind === 'pan').length === g.pans) return cells;
  }
  return growSaltField(g, g.seed);
}

function growSaltField(g: NonNullable<SaltLevel['gen']>, seed: number): SaltCell[] {
  const rng = makeRng(seed);
  const { w, h } = g;
  const n = w * h;
  const parent = new Array<number>(n).fill(-2); // -2 unvisited, -1 root
  const depth = new Array<number>(n).fill(0);
  const gate = Math.floor(rng() * w); // top row
  parent[gate] = -1;
  const stack = [gate];
  const dirs: [number, number, number][] = [
    [0, -1, N],
    [1, 0, E],
    [0, 1, S],
    [-1, 0, Wd],
  ];
  // "growing tree": mostly extend the newest channel (long winding canals), sometimes branch off an
  // older one (more tips for salt pans)
  while (stack.length) {
    const si = rng() < 0.6 ? stack.length - 1 : Math.floor(rng() * stack.length);
    const cur = stack[si];
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const open = dirs.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && parent[y * w + x] === -2);
    if (!open.length) {
      stack.splice(si, 1);
      continue;
    }
    const [nx, ny] = open[Math.floor(rng() * open.length)];
    const nxt = ny * w + nx;
    parent[nxt] = cur;
    depth[nxt] = depth[cur] + 1;
    stack.push(nxt);
  }
  // pans: the deepest leaves, spread out (not two side by side)
  const isLeaf = (i: number) => !parent.some((p) => p === i);
  const leaves = [...Array(n).keys()].filter((i) => i !== gate && isLeaf(i)).sort((a, b) => depth[b] - depth[a]);
  const pans: number[] = [];
  for (const l of leaves) {
    if (pans.length >= g.pans) break;
    if (pans.some((p) => Math.abs((p % w) - (l % w)) + Math.abs(Math.floor(p / w) - Math.floor(l / w)) < 2)) continue;
    pans.push(l);
  }
  // keep only the channels on the way from the gate to a pan
  const keep = new Set<number>([gate]);
  for (const p of pans) for (let c = p; c >= 0 && !keep.has(c); c = parent[c]) keep.add(c);
  const mask = new Array<number>(n).fill(0);
  for (const c of keep) {
    const p = parent[c];
    if (p < 0) continue;
    const [dx, dy] = [(p % w) - (c % w), Math.floor(p / w) - Math.floor(c / w)];
    const d = dirs.find(([x, y]) => x === dx && y === dy)![2];
    mask[c] |= d;
    mask[p] |= OPP[d];
  }
  const cells: SaltCell[] = [];
  const shapes = [E | Wd, N | S, N | E, E | S, S | Wd, N | Wd, N | E | S, E | S | Wd];
  for (let i = 0; i < n; i++) {
    if (i === gate) cells.push({ kind: 'gate', mask: mask[i] });
    else if (pans.includes(i)) cells.push({ kind: 'pan' });
    else if (keep.has(i)) cells.push({ kind: 'pipe', mask: mask[i], solved: mask[i] });
    else if (rng() < g.decoys) {
      const m = shapes[Math.floor(rng() * shapes.length)];
      cells.push({ kind: 'pipe', mask: m, solved: m });
    } else cells.push({ kind: 'empty' });
  }
  return cells;
}

export function saltBoard(levelIndex: number): SaltBoard {
  const lvl = SALT_LEVELS[levelIndex];
  if (lvl.gen) {
    const cells = generateSaltLayout(lvl.gen).map((c, i) => (c.kind === 'pipe' ? { ...c, mask: rotate(c.solved, 1 + ((i * 7 + levelIndex * 3) % 3)) } : c));
    return { w: lvl.gen.w, h: lvl.gen.h, cells };
  }
  const rows = lvl.rows!;
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
  {
    title: 'Rainy Day',
    hint: 'Fewer customers, pickier tastes.',
    bottles: [
      { recipe: 'classic', degrees: 17 },
      { recipe: 'squid', degrees: 24 },
      { recipe: 'reef', degrees: 27 },
      { recipe: 'blend', degrees: 13 },
      { recipe: 'golden', degrees: 31 },
    ],
    customers: [
      { name: 'Cô Lụa', says: 'Squid Mắm, please!', recipe: 'squid', look: { shirt: '#e8b7c8' } },
      { name: 'Fisherman Út', says: 'Cheap one (≤18°N). Classic if you have it.', maxDeg: 18, fav: 'classic', tip: 6, look: { shirt: '#5f8fc9', hat: '#d9b35b' } },
      { name: 'Chef Minh', says: '26°N+, but no Golden: too sweet.', minDeg: 26, notRecipe: 'golden', look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Rich Tourist', says: 'The famous Golden Reserve!', recipe: 'golden', look: { shirt: '#f2c14e', hat: '#e8553a' } },
    ],
  },
  {
    title: 'The Tour Bus',
    hint: 'Tourists want cheap souvenirs with their favourite taste.',
    bottles: [
      { recipe: 'classic', degrees: 20 },
      { recipe: 'classic', degrees: 24 },
      { recipe: 'shrimp', degrees: 22 },
      { recipe: 'reef', degrees: 29 },
      { recipe: 'squid', degrees: 18 },
      { recipe: 'golden', degrees: 33 },
    ],
    customers: [
      { name: 'Tourist Anna', says: 'A souvenir (≤25°N). Classic, please!', maxDeg: 25, fav: 'classic', tip: 8, look: { shirt: '#7fd18b', hat: '#ffffff' } },
      { name: 'Tourist Ken', says: 'Souvenir (≤25°N). I like squid.', maxDeg: 25, fav: 'squid', tip: 8, look: { shirt: '#5aa0d8', hat: '#e8443a' } },
      { name: 'Chú Tư', says: 'Mắm tôm or nothing!', recipe: 'shrimp', look: { shirt: '#8a6238', hat: '#d9b35b' } },
      { name: 'Hotel Chef', says: '28°N+, no Golden.', minDeg: 28, notRecipe: 'golden', look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Collector', says: 'Golden Reserve for my shelf.', recipe: 'golden', look: { shirt: '#3a3330' } },
    ],
  },
  {
    title: 'The Food Critic',
    hint: 'One customer only accepts the very best.',
    bottles: [
      { recipe: 'blend', degrees: 14 },
      { recipe: 'classic', degrees: 21 },
      { recipe: 'reef', degrees: 26 },
      { recipe: 'abyss', degrees: 35 },
      { recipe: 'squid', degrees: 23 },
      { recipe: 'golden', degrees: 30 },
    ],
    customers: [
      { name: 'Critic Vy', says: 'Only 34°N or more is worth writing about.', minDeg: 34, look: { shirt: '#2b2118', hat: '#2b2118' } },
      { name: 'Noodle Shop', says: '20°N+, no Reef. Classic is best!', minDeg: 20, notRecipe: 'reef', fav: 'classic', tip: 10, look: { shirt: '#e8a040' } },
      { name: 'Grandma Bảy', says: 'Mild, please (≤15°N).', maxDeg: 15, look: { shirt: '#a35bd6', hat: '#f2d98a' } },
      { name: 'Seafood Place', says: 'Reef Reserve.', recipe: 'reef', look: { shirt: '#3a8fd9' } },
      { name: 'Market Stall', says: 'At least 22°N to resell.', minDeg: 22, look: { shirt: '#c9a36a' } },
    ],
  },
  {
    title: 'Wedding Feast',
    hint: 'Six guests, seven bottles: the dragon goes to the bride.',
    bottles: [
      { recipe: 'classic', degrees: 19 },
      { recipe: 'classic', degrees: 23 },
      { recipe: 'classic', degrees: 26 },
      { recipe: 'reef', degrees: 30 },
      { recipe: 'dragon', degrees: 36 },
      { recipe: 'squid', degrees: 24 },
      { recipe: 'shrimp', degrees: 21 },
    ],
    customers: [
      { name: "Bride's Mother", says: 'Dragon Gate Reserve, for luck!', recipe: 'dragon', look: { shirt: '#c0392b', hat: '#f2d98a' } },
      { name: 'Uncle Lộc', says: 'Something strong (28°N+).', minDeg: 28, look: { shirt: '#3a3330' } },
      { name: 'Cook Hoa', says: 'Classic, 22°N or more.', recipe: 'classic', minDeg: 22, fav: 'classic', tip: 6, look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Cook Nam', says: 'Any Classic will do.', recipe: 'classic', look: { shirt: '#ffffff' } },
      { name: 'Chú Tư', says: 'Mắm tôm for the dipping bowl.', recipe: 'shrimp', look: { shirt: '#8a6238', hat: '#d9b35b' } },
      { name: 'Neighbour Mai', says: '≤24°N please. Squid if you can.', maxDeg: 24, fav: 'squid', tip: 8, look: { shirt: '#e8b7c8' } },
    ],
  },
  {
    title: 'Grand Tết Market',
    hint: 'New Year rush. Every bottle has the right owner.',
    bottles: [
      { recipe: 'blend', degrees: 12 },
      { recipe: 'classic', degrees: 20 },
      { recipe: 'classic', degrees: 27 },
      { recipe: 'squid', degrees: 25 },
      { recipe: 'reef', degrees: 31 },
      { recipe: 'golden', degrees: 34 },
      { recipe: 'abyss', degrees: 38 },
    ],
    customers: [
      { name: 'Tết Gift Buyer', says: '33°N+ as a gift. Golden would be perfect!', minDeg: 33, fav: 'golden', tip: 20, look: { shirt: '#e8443a', hat: '#f2c14e' } },
      { name: 'Abyss Fan', says: 'Abyss Reserve. Nothing else.', recipe: 'abyss', look: { shirt: '#3b3550' } },
      { name: 'Chef Minh', says: '28°N+, but no Golden.', minDeg: 28, notRecipe: 'golden', look: { shirt: '#ffffff', hat: '#ffffff' } },
      { name: 'Classic Lover', says: 'Classic, 25°N or more.', recipe: 'classic', minDeg: 25, look: { shirt: '#b5651d' } },
      { name: 'Student Huy', says: 'Only a little money (≤15°N).', maxDeg: 15, look: { shirt: '#5aa0d8' } },
      { name: 'Aunt Sáu', says: '20°N+. Squid makes me happy!', minDeg: 20, fav: 'squid', tip: 10, look: { shirt: '#7fd18b', hat: '#f2d98a' } },
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
