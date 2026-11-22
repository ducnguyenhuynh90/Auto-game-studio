// WILDROOT MVP: pure, deterministic pond simulation. No DOM.
// One step = one season. A level runs YEARS years. Every number here is a gameplay
// value, not a verified ecological parameter (GDD 6.4).

export const SIZE = 16;
export const SEASONS = ['Xuân', 'Hạ', 'Thu', 'Đông'] as const;

export enum Cell { Land, Shallow, Deep, Reeds, Tree, Log }

export type ActionId = 'reeds' | 'removeFish' | 'addFrogs' | 'feedFish' | 'shade' | 'logs';

export interface ActionDef { id: ActionId; name: string; cost: number; hint: string }

export const ACTIONS: ActionDef[] = [
  { id: 'reeds', name: 'Vùng nông có cây', cost: 2, hint: 'Đắp bờ thoải, trồng cỏ nước ven ao' },
  { id: 'removeFish', name: 'Bắt bớt cá mỗi năm', cost: 1, hint: 'Mỗi mùa xuân lấy đi 45% số cá' },
  { id: 'addFrogs', name: 'Thả thêm ếch', cost: 1, hint: 'Thả 25 con ếch trưởng thành' },
  { id: 'feedFish', name: 'Cho cá ăn', cost: 1, hint: 'Rải thức ăn cho cá mỗi mùa' },
  { id: 'shade', name: 'Trồng cây ven bờ', cost: 1, hint: 'Cây che bóng một nửa bờ ao' },
  { id: 'logs', name: 'Để gỗ mục trên bờ', cost: 1, hint: 'Chỗ trú đông cho ếch' },
];

export const actionDef = (id: ActionId): ActionDef => ACTIONS.find((a) => a.id === id)!;

export interface Level {
  id: string;
  title: string;
  problem: string;
  budget: number;
  years: number;
  /** Rain multiplier range half-width (0.25 → 0.75..1.25). Bigger = harsher years. */
  rainSwing: number;
  /** Dry level: shallow water dries out in summer when rain is low. */
  dry: boolean;
  goal: { frogsMin: number; clarityMin: number; mosquitoMax: number; fishMin: number };
}

export const LEVELS: Level[] = [
  {
    id: 'missing-frogs',
    title: 'Ếch đi đâu mất?',
    problem: 'Ao có nhiều cá, ếch giảm dần mỗi năm. Hãy đưa ếch trở lại mà ao vẫn khỏe.',
    budget: 3,
    years: 5,
    rainSwing: 0.2,
    dry: false,
    goal: { frogsMin: 60, clarityMin: 0.5, mosquitoMax: 55, fishMin: 10 },
  },
  {
    id: 'dry-pond',
    title: 'Mùa khô kéo dài',
    problem: 'Vẫn ao đó, nhưng hè nào cũng khô: vùng nước nông cạn trơ. Cách nào còn hiệu quả?',
    budget: 4,
    years: 5,
    rainSwing: 0.2,
    dry: true,
    goal: { frogsMin: 40, clarityMin: 0.5, mosquitoMax: 55, fishMin: 10 },
  },
];

// ---------- deterministic RNG ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- map ----------
const dist = (x: number, y: number) => Math.hypot(x + 0.5 - SIZE / 2, (y + 0.5 - SIZE / 2) * 1.15);

export function baseMap(): Cell[] {
  const m: Cell[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y);
      m.push(d < 4.3 ? Cell.Deep : d < 5.1 ? Cell.Shallow : Cell.Land);
    }
  return m;
}

export function buildMap(actions: readonly ActionId[]): Cell[] {
  const m = baseMap();
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const d = dist(x, y);
      if (actions.includes('reeds') && d >= 3.3 && d < 5.1) m[i] = Cell.Reeds;
      if (actions.includes('shade') && m[i] === Cell.Land && d < 6.3 && y < SIZE / 2) m[i] = Cell.Tree;
      if (actions.includes('logs') && m[i] === Cell.Land && d >= 5.6 && d < 6.6 && y >= SIZE / 2 && (x + y) % 3 === 0)
        m[i] = Cell.Log;
    }
  return m;
}

export interface Habitat { deep: number; shallow: number; reeds: number; water: number; shade: number; shelter: number }

export function habitat(m: readonly Cell[]): Habitat {
  const count = (c: Cell) => m.filter((v) => v === c).length;
  const deep = count(Cell.Deep);
  const shallow = count(Cell.Shallow);
  const reeds = count(Cell.Reeds);
  return {
    deep,
    shallow,
    reeds,
    water: deep + shallow + reeds,
    shade: Math.min(1, count(Cell.Tree) / 22),
    shelter: Math.min(1, count(Cell.Log) / 6),
  };
}

// ---------- state & simulation ----------
export interface Snapshot {
  t: number;
  year: number; // 0-based year of the season that just ended
  season: number; // season that just ended (0 = Xuân)
  rain: number;
  fish: number;
  frogs: number;
  mosquito: number;
  dragonflies: number;
  plants: number; // 0..1 cover of the pond
  algae: number; // 0..1
  nutrients: number; // 0..1
  clarity: number;
  // causes, recorded for "Why?" (fractions 0..1)
  fishPred: number; // share of tadpoles eaten by fish
  oxygenLoss: number; // share of tadpoles lost to low oxygen
  refuge: number; // how well plants hide tadpoles
  winterLoss: number;
  hunger: number; // adult frog loss from too few insects
  recruits: number;
  shallowDry: number; // share of shallow water dried out this season
  mosqByFish: number;
  mosqByDragon: number;
  mosqByFrog: number;
  fishCap: number;
  plantCap: number;
}

export interface Run {
  level: Level;
  seed: number;
  actions: ActionId[];
  map: Cell[];
  snaps: Snapshot[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 1000) / 1000;

export function simulate(level: Level, seed: number, actionsIn: readonly ActionId[]): Run {
  const actions = [...new Set(actionsIn)].sort() as ActionId[];
  const map = buildMap(actions);
  const h = habitat(map);
  const rng = mulberry32(seed * 7919 + 13);
  const feed = actions.includes('feedFish');

  let fish = 50;
  const fishing = actions.includes('removeFish');
  let frogs = actions.includes('addFrogs') ? 55 : 30;
  let mosquito = 25;
  let dragonflies = 4;
  const plantCap0 = (h.reeds + 0.3 * h.shallow) / h.water;
  let plants = actions.includes('reeds') ? plantCap0 * 0.35 : plantCap0 * 0.6;
  let algae = 0.35;
  let nutrients = 0.3;
  let pendingTadpoles = 0;

  const snaps: Snapshot[] = [];
  const blank = {
    fishPred: 0, oxygenLoss: 0, refuge: 0, winterLoss: 0, hunger: 0, recruits: 0, shallowDry: 0,
    mosqByFish: 0, mosqByDragon: 0, mosqByFrog: 0,
  };
  const push = (t: number, rain: number, causes: typeof blank, fishCap: number, plantCap: number) =>
    snaps.push({
      t, year: t === 0 ? 0 : Math.floor((t - 1) / 4), season: t === 0 ? 0 : (t - 1) % 4, rain: r1(rain),
      fish: r1(fish), frogs: r1(frogs), mosquito: r1(mosquito), dragonflies: r1(dragonflies),
      plants: r1(plants), algae: r1(algae), nutrients: r1(nutrients), clarity: r1(1 - algae),
      ...Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, r1(v)])) as typeof blank,
      fishCap: r1(fishCap), plantCap: r1(plantCap),
    });

  push(0, 1, blank, 60 * (h.deep / 55), plantCap0);

  const steps = level.years * 4;
  for (let t = 1; t <= steps; t++) {
    const s = (t - 1) % 4; // season being simulated
    const rain = 1 + (rng() * 2 - 1) * level.rainSwing;
    const c = { ...blank };

    // Dry level: in summer and autumn the shallow ring dries when rain is low.
    // Shade from bank trees slows evaporation.
    c.shallowDry = level.dry && (s === 1 || s === 2) ? clamp(1.15 - rain * 0.6, 0, 1) * 0.8 * (1 - 0.6 * h.shade) : 0;
    const wetShallow = 1 - c.shallowDry;
    const plantCap = ((h.reeds + 0.3 * h.shallow) / h.water) * (0.25 + 0.75 * wetShallow);

    // Nutrients: runoff + fish waste + feed, taken up by plants.
    nutrients = clamp(nutrients * 0.7 + 0.03 * rain + 0.0012 * fish + (feed ? 0.1 : 0) - 0.12 * plants, 0, 1);

    // Algae: needs nutrients and light; shade and plants hold it back.
    const light = [1, 1.2, 0.8, 0.3][s];
    const g = 0.9 * nutrients * (1 - 0.6 * h.shade) * light;
    algae = clamp(algae + g * (1 - algae) - 0.35 * algae - 0.2 * plants * algae, 0.02, 1);
    const clarity = 1 - algae;

    // Water plants: grow toward the space the pond offers, shaded by algae and trees.
    const pRate = [0.6, 0.7, 0.2, 0][s];
    const pLight = (1 - 0.5 * algae) * (1 - 0.3 * h.shade);
    plants = plantCap <= 0 ? 0 : plants + pRate * pLight * plants * (1 - plants / plantCap);
    if (s === 3) plants *= 0.85;
    plants = clamp(Math.min(plants, plantCap), 0, 1);

    // Fish: limited by deep water and food; low oxygen in winter kills some.
    const fishCap = 60 * (h.deep / 55) * (feed ? 1.6 : 1);
    const fRate = [0.35, 0.35, 0.1, 0][s];
    if (fishing && s === 0) fish *= 0.55;
    fish = fish + fRate * fish * (1 - fish / fishCap);
    if (s === 3 && algae > 0.65) fish *= 0.85;
    fish = clamp(fish, 0, 200);

    // Refuge: plants in shallow water hide tadpoles and insect larvae from fish.
    c.refuge = clamp(plants * 2.2 * wetShallow, 0, 1);

    // Mosquito larvae: warm seasons breed; fish, dragonfly nymphs and frogs eat them.
    const mosqCap = 100 * (h.water / 80);
    const mRate = [1.2, 1.5, 0.4, -0.4][s];
    // Flying adults also arrive from outside the pond in warm seasons.
    const grown = mosquito + mRate * mosquito * (1 - mosquito / mosqCap) + (s < 2 ? 3 : 0);
    c.mosqByFish = clamp(0.007 * fish * (1 - 0.5 * c.refuge), 0, 0.9);
    c.mosqByDragon = clamp(0.015 * dragonflies, 0, 0.6);
    c.mosqByFrog = s === 3 ? 0 : clamp(0.003 * frogs, 0, 0.5);
    mosquito = clamp(grown * (1 - c.mosqByFish) * (1 - c.mosqByDragon) * (1 - c.mosqByFrog), 1, mosqCap);

    // Dragonflies: need plants to lay eggs and perch, insects to eat; fish eat nymphs.
    const food = mosquito / (mosquito + 20);
    const perch = clamp(plants * 4, 0, 1);
    const nymphSurv = clamp(1 - 0.012 * fish * (1 - c.refuge), 0.05, 1);
    if (s === 1) dragonflies += 1.2 * dragonflies * food * perch * nymphSurv + (perch > 0.4 ? 3 : 0);
    dragonflies *= s === 3 ? 0.45 : 0.92;
    dragonflies = clamp(dragonflies, 0, 60);

    // Frogs: spring eggs become tadpoles; fish and low oxygen decide how many survive.
    c.fishPred = clamp((fish / 40) * (1 - 0.85 * c.refuge), 0, 0.95);
    c.oxygenLoss = clamp((0.7 * Math.max(0, algae - 0.4)) / 0.6, 0, 0.7);
    if (s === 0) pendingTadpoles = frogs * 3 * 0.5 * (1 - c.fishPred) * (1 - c.oxygenLoss);
    if (s === 1) {
      // A dried-out nursery strands part of the brood.
      c.recruits = pendingTadpoles * (1 - 0.7 * c.shallowDry);
      frogs += c.recruits;
      pendingTadpoles = 0;
    }
    // Adults eat flying insects: mosquitoes plus a steady supply from the land.
    c.hunger = 0.12 * (1 - (mosquito + 15) / (mosquito + 30));
    c.winterLoss = s === 3 ? 0.3 - 0.22 * h.shelter : 0;
    frogs *= 0.95 * (1 - c.hunger) * (1 - c.winterLoss);
    frogs = clamp(frogs, 0, 150);

    push(t, rain, c, fishCap, plantCap);
    void clarity;
  }
  return { level, seed, actions, map, snaps };
}

// ---------- goals ----------
export interface GoalCheck { key: keyof Level['goal']; label: string; ok: boolean; value: string }

export function checkGoals(level: Level, s: Snapshot): GoalCheck[] {
  const g = level.goal;
  return [
    { key: 'frogsMin', label: `Ếch ≥ ${g.frogsMin}`, ok: s.frogs >= g.frogsMin, value: `${Math.round(s.frogs)}` },
    { key: 'clarityMin', label: `Nước trong ≥ ${Math.round(g.clarityMin * 100)}%`, ok: s.clarity >= g.clarityMin, value: `${Math.round(s.clarity * 100)}%` },
    { key: 'mosquitoMax', label: `Muỗi ≤ ${g.mosquitoMax}`, ok: s.mosquito <= g.mosquitoMax, value: `${Math.round(s.mosquito)}` },
    { key: 'fishMin', label: `Vẫn còn cá ≥ ${g.fishMin}`, ok: s.fish >= g.fishMin, value: `${Math.round(s.fish)}` },
  ];
}

export const won = (run: Run) => checkGoals(run.level, run.snaps[run.snaps.length - 1]).every((g) => g.ok);

export const cost = (actions: readonly ActionId[]) => actions.reduce((n, a) => n + actionDef(a).cost, 0);
