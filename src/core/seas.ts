// The sea chart: a story route of five seas. Each sea has its own fish, mission chain,
// gadget crates and a relic for finishing its story.
import type { SeaId } from './data';
import type { GadgetId, RelicId } from './items';
import type { GameState } from './state';

export interface Mission {
  id: string;
  text: string;
  /** [current, target] progress, computed from state so it never desyncs. */
  progress: (s: GameState) => [number, number];
  reward: { coins: number; xp: number; gadget?: GadgetId };
}

export interface Sea {
  id: SeaId;
  name: string;
  local: string;
  blurb: string;
  /** Boat level needed to sail here. */
  boat: number;
  /** Sea whose story must be finished first (besides the boat). */
  after?: SeaId;
  gadgets: GadgetId[]; // what Mystery Crates here can hold
  relic: RelicId;
  missions: Mission[];
  look: { water: string; skyTop: string; skyBottom: string; fog: string };
}

const caught = (s: GameState, species: string) => s.dex[species]?.count ?? 0;
const bestSize = (s: GameState, species: string) => s.dex[species]?.best ?? 0;
const seaStat = (s: GameState, sea: SeaId, k: 'catches' | 'perfects' | 'goods' | 'crates') => s.seaStats[sea]?.[k] ?? 0;
const brewed = (s: GameState, recipe: string) => (s.cellar[recipe] !== undefined ? 1 : 0);
const bestDegrees = (s: GameState) => Math.max(0, ...Object.values(s.cellar));
const cap = (v: number, t: number): [number, number] => [Math.min(v, t), t];

export const SEAS: Sea[] = [
  {
    id: 'lagoon',
    name: 'Phú Quốc',
    local: 'Đảo Ngọc · the Pearl Island',
    blurb: 'Home. Cá cơm here make the famous Phú Quốc mắm.',
    boat: 0,
    gadgets: ['sonar', 'salt'],
    relic: 'turtle',
    look: { water: '#2aa3b9', skyTop: '#ffc98f', skyBottom: '#ffeccc', fog: '#ffe3bb' },
    missions: [
      { id: 'l_good', text: 'Land 3 fresh catches (★★+)', progress: (s) => cap(seaStat(s, 'lagoon', 'goods'), 3), reward: { coins: 15, xp: 40 } },
      { id: 'l_sardine', text: 'Catch 5 Sardines', progress: (s) => cap(caught(s, 'sardine'), 5), reward: { coins: 20, xp: 40, gadget: 'sonar' } },
      { id: 'l_fine', text: 'Brew a Fine Phú Quốc sauce (22°N+)', progress: (s) => cap(bestDegrees(s) >= 22 ? 1 : 0, 1), reward: { coins: 30, xp: 60 } },
      { id: 'l_mackerel', text: 'Catch a deep-water Mackerel', progress: (s) => cap(caught(s, 'mackerel'), 1), reward: { coins: 40, xp: 80, gadget: 'salt' } },
    ],
  },
  {
    id: 'reef',
    name: 'Coral Reef',
    local: 'Rạn san hô',
    blurb: 'Bright coral, big fish, sunken chests.',
    boat: 1,
    after: 'lagoon',
    gadgets: ['pearl', 'sonar', 'octo'],
    relic: 'compass',
    look: { water: '#167f9e', skyTop: '#f7a77a', skyBottom: '#ffd7a8', fog: '#ffcf9e' },
    missions: [
      { id: 'r_snapper', text: 'Catch a Red Snapper', progress: (s) => cap(caught(s, 'snapper'), 1), reward: { coins: 40, xp: 80 } },
      { id: 'r_squid', text: 'Catch 6 Squid', progress: (s) => cap(caught(s, 'squid'), 6), reward: { coins: 50, xp: 80, gadget: 'pearl' } },
      { id: 'r_reserve', text: 'Brew a Reef Reserve', progress: (s) => cap(brewed(s, 'reef'), 1), reward: { coins: 80, xp: 120 } },
      { id: 'r_crate', text: 'Haul up 2 Mystery Crates', progress: (s) => cap(seaStat(s, 'reef', 'crates'), 2), reward: { coins: 60, xp: 100 } },
    ],
  },
  {
    id: 'delta',
    name: 'Mangrove Delta',
    local: 'Rừng ngập mặn',
    blurb: 'Mangrove roots and prawns for mắm tôm.',
    boat: 2,
    after: 'reef',
    gadgets: ['octo', 'salt', 'pearl'],
    relic: 'dragonjar',
    look: { water: '#5f9a6a', skyTop: '#f5c98a', skyBottom: '#fbe7c0', fog: '#e9e0b0' },
    missions: [
      { id: 'd_prawn', text: 'Catch 10 Giant River Prawns', progress: (s) => cap(caught(s, 'prawn'), 10), reward: { coins: 80, xp: 120 } },
      { id: 'd_shrimp', text: 'Brew Mắm Tôm (2+ prawns)', progress: (s) => cap(brewed(s, 'shrimp'), 1), reward: { coins: 120, xp: 160, gadget: 'octo' } },
      { id: 'd_snakehead', text: 'Catch a Snakehead over 60 cm', progress: (s) => cap(bestSize(s, 'snakehead') >= 60 ? 1 : 0, 1), reward: { coins: 120, xp: 160 } },
      { id: 'd_mudskipper', text: 'Catch 6 Mudskippers', progress: (s) => cap(caught(s, 'mudskipper'), 6), reward: { coins: 100, xp: 140 } },
    ],
  },
  {
    id: 'bay',
    name: 'Dragon Bay',
    local: 'Vịnh Rồng',
    blurb: 'Limestone towers. Legends swim here.',
    boat: 2,
    after: 'delta',
    gadgets: ['rocket', 'octo', 'pearl'],
    relic: 'kite',
    look: { water: '#2f9a8a', skyTop: '#c9d8e0', skyBottom: '#f2efe0', fog: '#dfe8e0' },
    missions: [
      { id: 'b_cuttle', text: 'Catch 8 Cuttlefish', progress: (s) => cap(caught(s, 'cuttlefish'), 8), reward: { coins: 150, xp: 180 } },
      { id: 'b_good', text: 'Land 10 ★★ catches in the Bay', progress: (s) => cap(seaStat(s, 'bay', 'goods'), 10), reward: { coins: 150, xp: 180, gadget: 'rocket' } },
      { id: 'b_lobster', text: 'Catch a Spiny Lobster', progress: (s) => cap(caught(s, 'lobster'), 1), reward: { coins: 200, xp: 220 } },
      { id: 'b_carp', text: 'Catch the Dragon Carp', progress: (s) => cap(caught(s, 'carp'), 1), reward: { coins: 400, xp: 400 } },
    ],
  },
  {
    id: 'trench',
    name: 'The Abyss',
    local: 'Vực thẳm',
    blurb: 'Black water and the longest fish alive.',
    boat: 3,
    after: 'bay',
    gadgets: ['rocket', 'pearl', 'sonar'],
    relic: 'pearlheart',
    look: { water: '#1d3a5a', skyTop: '#5a4a7a', skyBottom: '#c98a8a', fog: '#7a6a8a' },
    missions: [
      { id: 't_angler', text: 'Catch 5 Anglerfish', progress: (s) => cap(caught(s, 'angler'), 5), reward: { coins: 250, xp: 300 } },
      { id: 't_squid', text: 'Catch 2 Giant Squid', progress: (s) => cap(caught(s, 'giantsquid'), 2), reward: { coins: 400, xp: 400 } },
      { id: 't_legend', text: 'Brew a Legendary sauce (40°N+)', progress: (s) => cap(bestDegrees(s) >= 40 ? 1 : 0, 1), reward: { coins: 500, xp: 500 } },
      { id: 't_oarfish', text: 'Catch the Oarfish', progress: (s) => cap(caught(s, 'oarfish'), 1), reward: { coins: 800, xp: 800 } },
    ],
  },
];

export const SEAS_BY_ID = Object.fromEntries(SEAS.map((s) => [s.id, s])) as Record<SeaId, Sea>;

export function missionDone(s: GameState, m: Mission): boolean {
  const [c, t] = m.progress(s);
  return c >= t;
}

export function seaComplete(s: GameState, sea: Sea): boolean {
  return sea.missions.every((m) => s.missionsDone.includes(m.id));
}

/** Why a sea is locked, or null if the player may sail there. */
export function seaLock(s: GameState, sea: Sea): string | null {
  if (s.upgrades.boat < sea.boat) return `Needs a better boat (${['Basket Boat', 'Wooden Boat', 'Junk Sailboat', 'Iron Trawler'][sea.boat]})`;
  if (sea.after && !seaComplete(s, SEAS_BY_ID[sea.after])) return `Finish the ${SEAS_BY_ID[sea.after].name} story first`;
  return null;
}

/** First unfinished mission of a sea, in order. */
export function nextMission(s: GameState, sea: Sea): Mission | null {
  return sea.missions.find((m) => !s.missionsDone.includes(m.id)) ?? null;
}
