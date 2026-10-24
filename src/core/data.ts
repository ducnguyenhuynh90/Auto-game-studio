// Static game content: species, recipes, quality tiers, upgrades.
// Balance numbers live here so they can be tuned (and simulated) in one place.

export type SeaId = 'lagoon' | 'reef' | 'delta' | 'bay' | 'trench';

export interface Species {
  id: string;
  name: string;
  local: string; // Vietnamese name, shown as flavour
  rarity: 1 | 2 | 3 | 4 | 5; // 1 common … 5 legendary
  seas: SeaId[];
  weight: number; // relative spawn weight inside its seas
  size: [number, number]; // cm
  sauce: number; // base °N contribution when fermented; 0 = cannot be fermented
  raw: number; // coins when sold fresh
  difficulty: number; // 0..1, drives thrash strength / zone drift in the reel
  color: string;
  belly: string;
  fin: string;
  /** Converts to coins on catch. */
  treasure?: boolean;
  /** A mystery crate: gives a gadget from the sea's gadget list. */
  crate?: boolean;
  /** Model hint for non-fish shapes. */
  shape?: 'prawn' | 'lobster' | 'eel' | 'angler';
  /** Preferred distance band, 0 = near the boat, 1 = farthest water. Needs line reach to cast that far. */
  depth: number;
}

const ALL: SeaId[] = ['lagoon', 'reef', 'delta', 'bay', 'trench'];

export const SPECIES: Species[] = [
  // Phú Quốc (sea id 'lagoon' kept for save compatibility)
  { id: 'anchovy', name: 'Anchovy', local: 'Cá cơm', rarity: 1, seas: ['lagoon', 'reef', 'bay'], weight: 40, size: [7, 12], sauce: 16, raw: 3, difficulty: 0.1, color: '#8fb8c9', belly: '#e6f2f5', fin: '#5f8ea3', depth: 0.25 },
  { id: 'sardine', name: 'Sardine', local: 'Cá trích', rarity: 1, seas: ['lagoon'], weight: 26, size: [12, 20], sauce: 13, raw: 4, difficulty: 0.18, color: '#6f9bc4', belly: '#dfe9f3', fin: '#4a7499', depth: 0.42 },
  { id: 'scad', name: 'Scad', local: 'Cá nục', rarity: 2, seas: ['lagoon', 'reef'], weight: 14, size: [18, 28], sauce: 12, raw: 8, difficulty: 0.3, color: '#7d8fa8', belly: '#e8e2cf', fin: '#d9b44a', depth: 0.55 },
  { id: 'mackerel', name: 'Mackerel', local: 'Cá thu', rarity: 2, seas: ['lagoon', 'reef', 'bay'], weight: 9, size: [30, 55], sauce: 11, raw: 14, difficulty: 0.45, color: '#3f7f8c', belly: '#d8e6e3', fin: '#2b5a63', depth: 0.8 },
  { id: 'crab', name: 'Mud Crab', local: 'Cua', rarity: 2, seas: ['lagoon', 'delta'], weight: 5, size: [12, 20], sauce: 0, raw: 22, difficulty: 0.35, color: '#c0603e', belly: '#e9a37f', fin: '#8f3f25', depth: 0.15 },
  { id: 'bottle', name: 'Message in a Bottle', local: 'Chai thư', rarity: 3, seas: ['lagoon', 'reef'], weight: 2.5, size: [20, 25], sauce: 0, raw: 40, difficulty: 0.2, color: '#7cc7a0', belly: '#d7f5e4', fin: '#4e9a74', depth: 0.6, treasure: true },
  { id: 'golden', name: 'Golden Anchovy', local: 'Cá cơm vàng', rarity: 5, seas: ['lagoon', 'reef'], weight: 0.45, size: [10, 14], sauce: 34, raw: 90, difficulty: 0.6, color: '#f2c14e', belly: '#fff3c4', fin: '#d49a1f', depth: 0.35 },
  // Coral Reef
  { id: 'squid', name: 'Squid', local: 'Mực', rarity: 2, seas: ['reef'], weight: 14, size: [20, 40], sauce: 18, raw: 16, difficulty: 0.4, color: '#e8b7c8', belly: '#fbe6ee', fin: '#c98aa2', depth: 0.5 },
  { id: 'snapper', name: 'Red Snapper', local: 'Cá hồng', rarity: 3, seas: ['reef'], weight: 10, size: [35, 70], sauce: 22, raw: 30, difficulty: 0.55, color: '#d9574a', belly: '#f6c9b8', fin: '#a83a30', depth: 0.68 },
  { id: 'grouper', name: 'Grouper', local: 'Cá mú', rarity: 3, seas: ['reef'], weight: 8, size: [40, 90], sauce: 20, raw: 38, difficulty: 0.65, color: '#8a6a4a', belly: '#d9c2a0', fin: '#5f4630', depth: 0.85 },
  { id: 'chest', name: 'Sunken Chest', local: 'Rương báu', rarity: 4, seas: ['reef', 'bay'], weight: 1.6, size: [40, 50], sauce: 0, raw: 150, difficulty: 0.5, color: '#b07a3a', belly: '#f2c650', fin: '#7a5224', depth: 0.9, treasure: true },
  { id: 'trevally', name: 'Giant Trevally', local: 'Cá khế', rarity: 4, seas: ['reef'], weight: 2.5, size: [80, 140], sauce: 24, raw: 120, difficulty: 0.85, color: '#9fb0b8', belly: '#eef2f2', fin: '#3d4f57', depth: 0.95 },
  // Mangrove Delta
  { id: 'catfish', name: 'River Catfish', local: 'Cá tra', rarity: 1, seas: ['delta'], weight: 30, size: [30, 60], sauce: 12, raw: 10, difficulty: 0.3, color: '#8d939a', belly: '#dfe2e4', fin: '#5d6268', depth: 0.35 },
  { id: 'prawn', name: 'Giant River Prawn', local: 'Tôm càng xanh', rarity: 2, seas: ['delta'], weight: 20, size: [15, 30], sauce: 17, raw: 18, difficulty: 0.35, color: '#5f8fc9', belly: '#d8e6f5', fin: '#f08a3a', depth: 0.3, shape: 'prawn' },
  { id: 'mudskipper', name: 'Mudskipper', local: 'Cá thòi lòi', rarity: 2, seas: ['delta'], weight: 12, size: [10, 20], sauce: 0, raw: 25, difficulty: 0.25, color: '#9a8a5a', belly: '#e6dcb8', fin: '#5aa0d8', depth: 0.1 },
  { id: 'snakehead', name: 'Snakehead', local: 'Cá lóc', rarity: 3, seas: ['delta'], weight: 9, size: [35, 80], sauce: 19, raw: 45, difficulty: 0.6, color: '#4b5a3a', belly: '#c9c2a0', fin: '#2f3a22', depth: 0.65 },
  // Dragon Bay
  { id: 'cuttlefish', name: 'Cuttlefish', local: 'Mực nang', rarity: 2, seas: ['bay'], weight: 16, size: [20, 35], sauce: 19, raw: 24, difficulty: 0.4, color: '#c9a07a', belly: '#f2e2cc', fin: '#a07850', depth: 0.5 },
  { id: 'barracuda', name: 'Barracuda', local: 'Cá nhồng', rarity: 3, seas: ['bay'], weight: 10, size: [50, 120], sauce: 18, raw: 50, difficulty: 0.7, color: '#7f97a8', belly: '#e8eef2', fin: '#4d6170', depth: 0.7, shape: 'eel' },
  { id: 'lobster', name: 'Spiny Lobster', local: 'Tôm hùm', rarity: 3, seas: ['bay'], weight: 7, size: [25, 45], sauce: 0, raw: 90, difficulty: 0.55, color: '#3f8f8a', belly: '#e8a060', fin: '#c46a3a', depth: 0.85, shape: 'lobster' },
  { id: 'carp', name: 'Dragon Carp', local: 'Cá chép hóa rồng', rarity: 5, seas: ['bay'], weight: 0.35, size: [60, 100], sauce: 36, raw: 260, difficulty: 0.8, color: '#e8553a', belly: '#ffd27a', fin: '#f2b233', depth: 0.75 },
  // The Abyss
  { id: 'angler', name: 'Anglerfish', local: 'Cá vây chân', rarity: 3, seas: ['trench'], weight: 14, size: [30, 70], sauce: 23, raw: 70, difficulty: 0.6, color: '#3b3550', belly: '#6a5f86', fin: '#2a2440', depth: 0.82, shape: 'angler' },
  { id: 'giantsquid', name: 'Giant Squid', local: 'Mực khổng lồ', rarity: 4, seas: ['trench'], weight: 5, size: [200, 500], sauce: 26, raw: 220, difficulty: 0.9, color: '#c25a5a', belly: '#f0b0a0', fin: '#8a3030', depth: 0.92 },
  { id: 'oarfish', name: 'Oarfish', local: 'Cá mái chèo', rarity: 5, seas: ['trench'], weight: 0.4, size: [300, 800], sauce: 38, raw: 400, difficulty: 0.95, color: '#c8d6e0', belly: '#f4f8fb', fin: '#e8453a', depth: 0.98, shape: 'eel' },
  // Everywhere
  { id: 'crate', name: 'Mystery Crate', local: 'Thùng bí ẩn', rarity: 3, seas: ALL, weight: 2.2, size: [40, 50], sauce: 0, raw: 0, difficulty: 0.3, color: '#7a5aa8', belly: '#f2c650', fin: '#4a3470', depth: 0.6, crate: true },
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
  { id: 'abyss', name: 'Abyss Reserve', blurb: 'Brewed from things that never saw the sun.', mult: 1.22, color: '#3a2a4a' },
  { id: 'dragon', name: 'Dragon Gate Reserve', blurb: 'The carp leapt the gate and became a dragon.', mult: 1.25, color: '#c0392b' },
  { id: 'golden', name: 'Golden Reserve', blurb: 'A legend of the coast.', mult: 1.2, color: '#e0a21a' },
  { id: 'shrimp', name: 'Mắm Tôm', blurb: 'Pungent purple shrimp paste. Loved by brave eaters.', mult: 1.1, color: '#8a5a8a' },
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

export type UpgradeId = 'rod' | 'line' | 'hook' | 'bait' | 'boat' | 'jars' | 'salt' | 'stall';

export interface UpgradeDef {
  id: UpgradeId;
  kind: 'gear' | 'village';
  name: string;
  levels: { name: string; cost: number; desc: string }[]; // levels[0] is the starting state (cost unused)
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'rod',
    kind: 'gear',
    name: 'Rod',
    levels: [
      { name: 'Bamboo Rod', cost: 0, desc: 'Humble but honest.' },
      { name: 'Lacquered Rod', cost: 70, desc: 'Wider green zone when reeling.' },
      { name: 'Carbon Rod', cost: 420, desc: 'Even wider green zone.' },
      { name: 'Master Rod', cost: 5000, desc: 'The widest green zone money can buy.' },
    ],
  },
  {
    id: 'line',
    kind: 'gear',
    name: 'Line',
    levels: [
      { name: 'Hemp Line', cost: 0, desc: 'Reaches the shallows.' },
      { name: 'Silk Line', cost: 90, desc: 'Cast farther: reach deeper water and bigger fish.' },
      { name: 'Nylon Line', cost: 600, desc: 'Reach deep water.' },
      { name: 'Dragon-Silk Line', cost: 8000, desc: 'Reach the deepest water. Needed for the Abyss.' },
    ],
  },
  {
    id: 'hook',
    kind: 'gear',
    name: 'Hook',
    levels: [
      { name: 'Bent Nail', cost: 0, desc: 'It works. Mostly.' },
      { name: 'Iron Hook', cost: 80, desc: 'Longer bite window, line holds strain longer.' },
      { name: 'Steel Hook', cost: 500, desc: 'Holds big fish much longer before snapping.' },
      { name: 'Dragon Hook', cost: 7000, desc: 'Barely ever snaps.' },
    ],
  },
  {
    id: 'bait',
    kind: 'gear',
    name: 'Bait',
    levels: [
      { name: 'Bread Crumbs', cost: 0, desc: 'Plain bait.' },
      { name: 'Shrimp Bait', cost: 160, desc: 'Rare fish appear 1.4× as often.' },
      { name: 'Squid Strips', cost: 900, desc: 'Rare fish appear 1.9× as often.' },
      { name: 'Glow Worms', cost: 9000, desc: 'Rare fish appear 2.5× as often.' },
    ],
  },
  {
    id: 'boat',
    kind: 'gear',
    name: 'Boat',
    levels: [
      { name: 'Basket Boat', cost: 0, desc: 'A round thúng chai. Phú Quốc waters only.' },
      { name: 'Wooden Boat', cost: 220, desc: 'Sail to the Coral Reef.' },
      { name: 'Junk Sailboat', cost: 1500, desc: 'Sail to the Mangrove Delta and Dragon Bay.' },
      { name: 'Iron Trawler', cost: 12000, desc: 'Brave the Abyss.' },
    ],
  },
  {
    id: 'jars',
    kind: 'village',
    name: 'Fermenting Jars',
    levels: [
      { name: '1 Jar', cost: 0, desc: 'One clay jar.' },
      { name: '2 Jars', cost: 40, desc: 'Ferment two batches at once.' },
      { name: '3 Jars', cost: 140, desc: 'Ferment three batches at once.' },
      { name: '4 Jars', cost: 700, desc: 'A proper jar yard.' },
    ],
  },
  {
    id: 'salt',
    kind: 'village',
    name: 'Salt House',
    levels: [
      { name: 'Market Salt', cost: 0, desc: 'Plain salt.' },
      { name: 'Salt House', cost: 110, desc: 'Sun-dried sea salt: +3°N on every batch.' },
      { name: 'Aged Salt Store', cost: 800, desc: 'Salt aged a year: +6°N on every batch.' },
    ],
  },
  {
    id: 'stall',
    kind: 'village',
    name: 'Market Stall',
    levels: [
      { name: 'Roadside Mat', cost: 0, desc: 'Sell to passers-by.' },
      { name: 'Market Stall', cost: 90, desc: 'Fish sauce sells for 25% more.' },
      { name: 'Famous Shop', cost: 900, desc: 'Fish sauce sells for 50% more.' },
    ],
  },
];

export const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export const BALANCE = {
  castsPerTrip: 5,
  jarSlots: 3,
  /** Rod: reel sweet-zone width per level. */
  rodZone: [0.26, 0.32, 0.38, 0.44],
  /** Line: farthest cast (0..1 of the water) per level. */
  lineReach: [0.68, 0.82, 0.93, 1.0],
  /** Hook: bite window (s) and seconds at max tension before snapping, per level. */
  hookBite: [1.1, 1.3, 1.45, 1.6],
  hookSnap: [0.7, 0.85, 1.0, 1.25],
  /** Bait: spawn-weight multiplier for rare+ (rarity ≥ 3) fish, per level. */
  baitRare: [1, 1.4, 1.9, 2.5],
  /** Releasing the cast meter above this power tangles the line (the cast is lost). */
  overcast: 0.9,
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
