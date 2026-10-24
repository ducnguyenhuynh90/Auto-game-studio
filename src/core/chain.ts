// Food chain (cá lớn nuốt cá bé, "big fish eat small fish"): the puzzle layer of a fishing trip.
// Landing a level-L fish makes a level-L+1 fish hungry: it swims up within reach of the line and bites
// fast. Catching it next extends the chain. The player plans the cast order: which small fish to take
// first so the right big one rises. All rules are visible and deterministic once the fish is shown.
import { SPECIES_BY_ID, type SeaId, type Species } from './data';
import { spawnWeight, speciesForSea } from './fishing';
import { addXp } from './progression';
import { pickWeighted, type Rng } from './rng';
import type { GameState } from './state';

export function foodLevel(species: string): number {
  return SPECIES_BY_ID[species]?.food ?? 0;
}

/** The sea's food chain, level 1 upward, for the HUD ladder (empty levels left out). */
export function ladder(sea: SeaId): { level: number; species: Species[] }[] {
  const out: { level: number; species: Species[] }[] = [];
  for (let level = 1; level <= 4; level++) {
    const species = speciesForSea(sea).filter((sp) => sp.food === level);
    if (species.length) out.push({ level, species });
  }
  return out;
}

/** Highest food level in this sea: landing it ends the chain at the top. */
export function topLevel(sea: SeaId): number {
  return Math.max(0, ...speciesForSea(sea).map((sp) => sp.food ?? 0));
}

/** Species that can be called up after landing a level-L fish. Legendaries never appear on demand. */
export function hungryCandidates(sea: SeaId, landedLevel: number): Species[] {
  if (landedLevel < 1) return [];
  return speciesForSea(sea).filter((sp) => sp.food === landedLevel + 1 && sp.rarity < 5);
}

/** Rolls which fish rises when no suitable shadow is already swimming. Same weights as normal spawns. */
export function rollHungry(rng: Rng, sea: SeaId, landedLevel: number, baitLevel: number): string | null {
  const pool = hungryCandidates(sea, landedLevel);
  if (!pool.length) return null;
  return pickWeighted(rng, pool, (sp) => spawnWeight(sp, baitLevel)).id;
}

/** Hungry fish bite eagerly and fight less: difficulty is scaled by this. */
export const HUNGRY_DIFFICULTY = 0.75;

/** Reward for reaching link n of a chain (n ≥ 2). Grows with length so long chains are worth planning. */
export function chainBonus(links: number): { coins: number; xp: number } {
  if (links < 2) return { coins: 0, xp: 0 };
  return { coins: 4 * links * links, xp: 10 * links };
}

/** Applies a chain link's bonus to the save and returns it (plus any level-ups). */
export function addChainLink(s: GameState, links: number): { coins: number; xp: number; levelUps: number } {
  const b = chainBonus(links);
  s.coins += b.coins;
  s.stats.earned += b.coins;
  s.stats.chains = (s.stats.chains ?? 0) + 1;
  s.stats.bestChain = Math.max(s.stats.bestChain ?? 0, links);
  const levelUps = addXp(s, b.xp);
  return { ...b, levelUps };
}
