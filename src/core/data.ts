// Static game content: species, recipes, quality tiers, upgrades.
// Balance numbers live here so they can be tuned (and simulated) in one place.

export type ZoneId = 'lagoon' | 'reef';

export interface Species {
  id: string;
  name: string;
  local: string; // Vietnamese name, shown as flavour
  rarity: 1 | 2 | 3 | 4 | 5; // 1 common … 5 legendary
  zones: ZoneId[];
  weight: number; // relative spawn weight inside its zones
  size: [number, number]; // cm
  sauce: number; // base °N contribution when fermented; 0 = cannot be fermented
  raw: number; // coins when sold fresh
  difficulty: number; // 0..1, drives thrash strength / zone drift in the reel
  color: string;
  belly: string;
  fin: string;
  treasure?: boolean;
  /** Preferred distance band, 0 = near shore, 1 = far out. */
  depth: number;
}

export const SPECIES: Species[] = [
  { id: 'anchovy', name: 'Anchovy', local: 'Cá cơm', rarity: 1, zones: ['lagoon', 'reef'], weight: 40, size: [7, 12], sauce: 16, raw: 3, difficulty: 0.1, color: '#8fb8c9', belly: '#e6f2f5', fin: '#5f8ea3', depth: 0.25 },
  { id: 'sardine', name: 'Sardine', local: 'Cá trích', rarity: 1, zones: ['lagoon'], weight: 26, size: [12, 20], sauce: 13, raw: 4, difficulty: 0.18, color: '#6f9bc4', belly: '#dfe9f3', fin: '#4a7499', depth: 0.45 },
  { id: 'scad', name: 'Scad', local: 'Cá nục', rarity: 2, zones: ['lagoon', 'reef'], weight: 14, size: [18, 28], sauce: 12, raw: 8, difficulty: 0.3, color: '#7d8fa8', belly: '#e8e2cf', fin: '#d9b44a', depth: 0.6 },
  { id: 'mackerel', name: 'Mackerel', local: 'Cá thu', rarity: 2, zones: ['lagoon', 'reef'], weight: 9, size: [30, 55], sauce: 11, raw: 14, difficulty: 0.45, color: '#3f7f8c', belly: '#d8e6e3', fin: '#2b5a63', depth: 0.8 },
  { id: 'crab', name: 'Mud Crab', local: 'Cua', rarity: 2, zones: ['lagoon'], weight: 5, size: [12, 20], sauce: 0, raw: 22, difficulty: 0.35, color: '#c0603e', belly: '#e9a37f', fin: '#8f3f25', depth: 0.15 },
  { id: 'bottle', name: 'Message in a Bottle', local: 'Chai thư', rarity: 3, zones: ['lagoon', 'reef'], weight: 2.5, size: [20, 25], sauce: 0, raw: 40, difficulty: 0.2, color: '#7cc7a0', belly: '#d7f5e4', fin: '#4e9a74', depth: 0.7, treasure: true },
  { id: 'snapper', name: 'Red Snapper', local: 'Cá hồng', rarity: 3, zones: ['reef'], weight: 10, size: [35, 70], sauce: 22, raw: 30, difficulty: 0.55, color: '#d9574a', belly: '#f6c9b8', fin: '#a83a30', depth: 0.75 },
  { id: 'grouper', name: 'Grouper', local: 'Cá mú', rarity: 3, zones: ['reef'], weight: 8, size: [40, 90], sauce: 20, raw: 38, difficulty: 0.65, color: '#8a6a4a', belly: '#d9c2a0', fin: '#5f4630', depth: 0.9 },
  { id: 'squid', name: 'Squid', local: 'Mực', rarity: 2, zones: ['reef'], weight: 14, size: [20, 40], sauce: 18, raw: 16, difficulty: 0.4, color: '#e8b7c8', belly: '#fbe6ee', fin: '#c98aa2', depth: 0.5 },
  { id: 'chest', name: 'Sunken Chest', local: 'Rương báu', rarity: 4, zones: ['reef'], weight: 1.6, size: [40, 50], sauce: 0, raw: 150, difficulty: 0.5, color: '#b07a3a', belly: '#f2c650', fin: '#7a5224', depth: 0.95, treasure: true },
  { id: 'trevally', name: 'Giant Trevally', local: 'Cá khế', rarity: 4, zones: ['reef'], weight: 2.5, size: [80, 140], sauce: 24, raw: 120, difficulty: 0.85, color: '#9fb0b8', belly: '#eef2f2', fin: '#3d4f57', depth: 1 },
  { id: 'golden', name: 'Golden Anchovy', local: 'Cá cơm vàng', rarity: 5, zones: ['lagoon', 'reef'], weight: 0.7, size: [10, 14], sauce: 34, raw: 90, difficulty: 0.6, color: '#f2c14e', belly: '#fff3c4', fin: '#d49a1f', depth: 0.35 },
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const RARITY_LABEL = ['', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLOR = ['', '#9aa7ad', '#5cb85c', '#3a8fd9', '#a35bd6', '#f0a81c'];

export interface Recipe {
  id: string;
  name: string;
  blurb: string;
  mult: number; // multiplier on averaged base °N
  color: string; // sauce colour in the bottle
}

export const RECIPES: Recipe[] = [
  { id: 'golden', name: 'Golden Reserve', blurb: 'A legend of the coast.', mult: 1.2, color: '#e0a21a' },
  { id: 'reef', name: 'Reef Reserve', blurb: 'Deep, rich, oceanic.', mult: 1.12, color: '#9c3b22' },
  { id: 'squid', name: 'Squid Mắm', blurb: 'Sweet and briny.', mult: 1.05, color: '#8a4a3a' },
  { id: 'classic', name: 'Classic Anchovy', blurb: 'The village way: pure cá cơm and salt.', mult: 1.15, color: '#b5651d' },
  { id: 'blend', name: 'Village Blend', blurb: 'Whatever the sea gave today.', mult: 1.0, color: '#8b5a2b' },
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export interface Tier {
  id: string;
  name: string;
  min: number; // minimum °N
  color: string;
}

// °N (độ đạm, grams of nitrogen per litre) is the real quality measure of Vietnamese fish sauce.
export const TIERS: Tier[] = [
  { id: 'basic', name: 'Basic', min: 0, color: '#a0a6a8' },
  { id: 'good', name: 'Good', min: 15, color: '#5cb85c' },
  { id: 'fine', name: 'Fine', min: 22, color: '#3a8fd9' },
  { id: 'premium', name: 'Premium', min: 30, color: '#a35bd6' },
  { id: 'legendary', name: 'Legendary', min: 40, color: '#f0a81c' },
];

export function tierFor(degrees: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (degrees >= tier.min) t = tier;
  return t;
}

export type UpgradeId = 'jars' | 'rod' | 'salt' | 'boat' | 'stall';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  levels: { name: string; cost: number; desc: string }[]; // levels[0] is the starting state (cost unused)
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'jars',
    name: 'Fermenting Jars',
    levels: [
      { name: '1 Jar', cost: 0, desc: 'One clay jar.' },
      { name: '2 Jars', cost: 40, desc: 'Ferment two batches at once.' },
      { name: '3 Jars', cost: 140, desc: 'Ferment three batches at once.' },
      { name: '4 Jars', cost: 320, desc: 'A proper jar yard.' },
    ],
  },
  {
    id: 'rod',
    name: 'Fishing Rod',
    levels: [
      { name: 'Bamboo Rod', cost: 0, desc: 'Humble but honest.' },
      { name: 'Lacquered Rod', cost: 70, desc: 'Wider sweet spot, longer bite window.' },
      { name: 'Master Rod', cost: 260, desc: 'Even wider sweet spot. Stronger line.' },
    ],
  },
  {
    id: 'salt',
    name: 'Salt House',
    levels: [
      { name: 'Market Salt', cost: 0, desc: 'Plain salt.' },
      { name: 'Salt House', cost: 110, desc: 'Sun-dried sea salt: +3°N on every batch.' },
      { name: 'Aged Salt Store', cost: 300, desc: 'Salt aged a year: +6°N on every batch.' },
    ],
  },
  {
    id: 'boat',
    name: 'Boat',
    levels: [
      { name: 'Basket Boat', cost: 0, desc: 'A round thúng chai. Lagoon only.' },
      { name: 'Wooden Boat', cost: 180, desc: 'Sail out to the Reef: snapper, squid, treasure.' },
    ],
  },
  {
    id: 'stall',
    name: 'Market Stall',
    levels: [
      { name: 'Roadside Mat', cost: 0, desc: 'Sell to passers-by.' },
      { name: 'Market Stall', cost: 90, desc: 'Fish sauce sells for 25% more.' },
      { name: 'Famous Shop', cost: 280, desc: 'Fish sauce sells for 50% more.' },
    ],
  },
];

export const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export const BALANCE = {
  castsPerTrip: 5,
  jarSlots: 3,
  /** Rod sweet-zone width and bite window (s) per level. */
  rodZone: [0.26, 0.33, 0.4],
  rodBite: [1.1, 1.3, 1.5],
  rodSnap: [0.7, 0.85, 1.0], // seconds at max tension before the line snaps
  saltBonus: [0, 3, 6],
  stallMult: [1, 1.25, 1.5],
  freshnessBonus: 8, // max °N from perfectly-landed fish
  agingBonus: [0, 2, 5, 8], // by aging level; level 1 = ready
  maxAging: 3,
  /** Real seconds that also count as one aging step, so jars progress while away. */
  agingSecondsPerLevel: 90,
  variance: 2, // ± °N, rolled (and fixed) when the jar is sealed
};

export function saucePrice(degrees: number, stallLevel: number): number {
  return Math.round(((degrees * degrees) / 8) * BALANCE.stallMult[stallLevel]);
}
