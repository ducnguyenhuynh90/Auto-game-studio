// Mực, a stray Phú Quốc Ridgeback (chó Phú Quốc): one of only a few dog breeds in the world with a
// ridge of fur growing backwards along the spine. He turns up after the first sale; feed him, give him
// a home, and he rides the boat, barking at rare fish (an honest hint: it points at a real shadow).
import { SPECIES_BY_ID } from './data';
import type { GameState } from './state';

export interface DogState {
  fed: number;
  house: boolean;
  /** Fish caught with Mực on board. */
  catches: number;
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
