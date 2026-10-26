// Mực, a stray Phú Quốc Ridgeback (chó Phú Quốc): one of only a few dog breeds in the world with a
// ridge of fur growing backwards along the spine. He turns up after the first sale; feed him, give him
// a home, and he rides the boat, barking at rare fish (an honest hint: it points at a real shadow).
import { SPECIES, SPECIES_BY_ID, type SeaId } from './data';
import { addXp } from './progression';
import type { Rng } from './rng';
import { addCatch, type CaughtFish, type GameState } from './state';

export interface DogState {
  fed: number;
  house: boolean;
  /** Fish caught with Mực on board. */
  catches: number;
  /** The player has tapped Mực once: the tutorial hand stops pointing at him. */
  met?: boolean;
}

export function newDog(): DogState {
  return { fed: 0, house: false, catches: 0 };
}

export const DOG_HOUSE_COST = 60;
export const DOG_NAME = 'Mực';

/** Mực shows up once the first bottle is sold. */
export function dogPresent(s: GameState): boolean {
  return s.stats.sold >= 1;
}

export function dogAboard(s: GameState): boolean {
  return s.dog.house;
}

/** Gives Mực the least valuable fish in the bucket. Returns its species, or null if there is none. */
export function feedDog(s: GameState): string | null {
  if (!s.bucket.length) return null;
  const value = (sp: string) => SPECIES_BY_ID[sp].raw + SPECIES_BY_ID[sp].sauce;
  const f = [...s.bucket].sort((a, b) => value(a.species) - value(b.species))[0];
  s.bucket = s.bucket.filter((x) => x.uid !== f.uid);
  s.dog.fed++;
  return f.species;
}

/** The dog house needs Mực to trust you first (3 meals). */
export function dogHouseProblem(s: GameState): string | null {
  if (s.dog.house) return 'built';
  if (s.dog.fed < 3) return `Feed Mực ${3 - s.dog.fed} more fish first`;
  if (s.coins < DOG_HOUSE_COST) return `Needs ${DOG_HOUSE_COST} coins`;
  return null;
}

export function buildDogHouse(s: GameState): boolean {
  if (dogHouseProblem(s)) return false;
  s.coins -= DOG_HOUSE_COST;
  s.dog.house = true;
  return true;
}

// ---------- Mực on the boat: little surprises (free, honest randomness; nothing is ever paid) ----------
/** After one of your catches, the chance Mực dives in and brings back a little fish too. */
export const FETCH_CHANCE = 0.2;
export const MAX_FETCH_PER_TRIP = 2;
/** The chance a trip has one "Mực found something!" moment. */
export const FIND_CHANCE = 0.4;

/** Mực grabs a small, common fish of this sea and drops it in the bucket. */
export function dogFetch(s: GameState, sea: SeaId, rng: Rng): CaughtFish | null {
  const pool = SPECIES.filter((sp) => sp.rarity === 1 && sp.seas.includes(sea) && !sp.treasure && !sp.crate && sp.sauce > 0);
  if (!pool.length) return null;
  const sp = pool[Math.floor(rng() * pool.length)];
  const [lo, hi] = sp.size;
  const size = Math.round(lo + (hi - lo) * 0.5 * rng()); // a little one: he is a dog, not a net
  const res = addCatch(s, sp.id, size, 0.7, sea, rng);
  s.dog.catches++;
  return res.fish;
}

export interface DogFind {
  kind: 'coins' | 'shell' | 'bottle' | 'salt' | 'sonar';
  title: string;
  detail: string;
}

const NOTES = [
  '“Whoever finds this: the best mắm on Phú Quốc is Bà Năm’s. — a happy tourist”',
  '“Meet me at Sao Beach at sunset. — T.”',
  'A child’s drawing of a fish, a jar and a black dog.',
  '“The sea gives to those who wait.” — an old fisher',
  '“Dear finder: please feed the dog.”',
];

/** Something Mực spots floating by. The reward is applied here, before it is shown. */
export function dogFind(s: GameState, rng: Rng): DogFind {
  const r = rng();
  if (r < 0.45) {
    const coins = 8 + Math.floor(rng() * 23);
    s.coins += coins;
    s.stats.earned += coins;
    return { kind: 'coins', title: 'Mực found a coin purse!', detail: `+${coins} coins, a little soggy` };
  }
  if (r < 0.65) {
    addXp(s, 20);
    return { kind: 'shell', title: 'Mực brought you a cowrie shell', detail: '+20 XP · he looks very proud' };
  }
  if (r < 0.8) {
    s.coins += 15;
    s.stats.earned += 15;
    return { kind: 'bottle', title: 'A message in a bottle!', detail: `${NOTES[Math.floor(rng() * NOTES.length)]} (+15 coins)` };
  }
  if (r < 0.9) {
    s.gadgets.salt = (s.gadgets.salt ?? 0) + 1;
    return { kind: 'salt', title: 'Mực sniffed out Magic Salt!', detail: '+1 Magic Salt (+6°N to your next jar)' };
  }
  s.gadgets.sonar = (s.gadgets.sonar ?? 0) + 1;
  return { kind: 'sonar', title: 'Mực fetched a lost Sonar!', detail: '+1 Sonar gadget' };
}
