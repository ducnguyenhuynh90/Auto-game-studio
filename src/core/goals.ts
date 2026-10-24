// A single always-visible "next goal" chain. It is the tutorial for the first ~10 minutes and the
// long-term direction after that. Each goal is checked against state, so it never desyncs.
import { SPECIES } from './data';
import type { GameState } from './state';

export interface Goal {
  id: string;
  text: string;
  reward: number;
  done: (s: GameState) => boolean;
  progress?: (s: GameState) => [number, number];
}

export const GOALS: Goal[] = [
  { id: 'catch3', text: 'Catch 3 fish', reward: 5, done: (s) => s.stats.catches >= 3, progress: (s) => [Math.min(3, s.stats.catches), 3] },
  { id: 'seal1', text: 'Fill a jar with 3 fish', reward: 0, done: (s) => s.jars.some((j) => j.sealed) || s.stats.jarsOpened > 0 },
  { id: 'trip2', text: 'Go fishing while it ferments', reward: 5, done: (s) => s.stats.jarsOpened > 0 || s.jars.some((j) => j.sealed && s.stats.trips > j.sealedTrip) },
  { id: 'open1', text: 'Open your jar!', reward: 0, done: (s) => s.stats.jarsOpened >= 1 },
  { id: 'sell1', text: 'Sell your fish sauce', reward: 0, done: (s) => s.stats.sold >= 1 },
  { id: 'jar2', text: 'Buy a second jar', reward: 10, done: (s) => s.upgrades.jars >= 1 },
  { id: 'rod1', text: 'Upgrade your rod', reward: 10, done: (s) => s.upgrades.rod >= 1 },
  { id: 'fine', text: 'Make a Fine sauce (22°N+)', reward: 15, done: (s) => Object.values(s.cellar).some((d) => d >= 22) },
  { id: 'salt1', text: 'Build the Salt House', reward: 15, done: (s) => s.upgrades.salt >= 1 },
  { id: 'boat1', text: 'Build a boat to reach the Reef', reward: 20, done: (s) => s.upgrades.boat >= 1 },
  { id: 'snapper', text: 'Catch a Red Snapper', reward: 20, done: (s) => !!s.dex.snapper },
  { id: 'premium', text: 'Make a Premium sauce (30°N+)', reward: 40, done: (s) => Object.values(s.cellar).some((d) => d >= 30) },
  { id: 'golden', text: 'Find the Golden Anchovy', reward: 60, done: (s) => !!s.dex.golden },
  {
    id: 'dex',
    text: 'Complete the Fishdex',
    reward: 100,
    done: (s) => SPECIES.every((sp) => s.dex[sp.id]),
    progress: (s) => [SPECIES.filter((sp) => s.dex[sp.id]).length, SPECIES.length],
  },
  { id: 'legend', text: 'Brew a Legendary sauce (40°N+)', reward: 200, done: (s) => Object.values(s.cellar).some((d) => d >= 40) },
];

export function currentGoal(s: GameState): Goal | null {
  return GOALS.find((g) => !s.goalsDone.includes(g.id)) ?? null;
}

/** Marks every satisfied goal done (in order) and returns the ones newly completed. */
export function checkGoals(s: GameState): Goal[] {
  const completed: Goal[] = [];
  for (const g of GOALS) {
    if (s.goalsDone.includes(g.id)) continue;
    if (!g.done(s)) break; // goals are sequential: only the current one can complete
    s.goalsDone.push(g.id);
    s.coins += g.reward;
    completed.push(g);
  }
  return completed;
}
