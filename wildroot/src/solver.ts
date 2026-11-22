// Level solver: tries every action set within budget across many seeds.
// A level is only good if several different strategies win and none dominates (GDD 5.2).
import { ACTIONS, cost, simulate, won, type ActionId, type Level } from './sim';

export interface StrategyResult { actions: ActionId[]; cost: number; winRate: number }

export function allActionSets(budget: number): ActionId[][] {
  const out: ActionId[][] = [];
  const n = ACTIONS.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = ACTIONS.filter((_, i) => mask & (1 << i)).map((a) => a.id);
    if (cost(set) <= budget) out.push(set);
  }
  return out;
}

export function solve(level: Level, seeds = 40): StrategyResult[] {
  return allActionSets(level.budget)
    .map((actions) => {
      let wins = 0;
      for (let s = 1; s <= seeds; s++) if (won(simulate(level, s, actions))) wins++;
      return { actions, cost: cost(actions), winRate: wins / seeds };
    })
    .sort((a, b) => b.winRate - a.winRate || a.cost - b.cost);
}

/** Strategies that win reliably (≥ threshold of seeds). */
export const winners = (results: StrategyResult[], threshold = 0.8) => results.filter((r) => r.winRate >= threshold);

/** Minimal winners: drop a winning set if a strict subset of it already wins (keeps "real" strategies). */
export function minimalWinners(results: StrategyResult[], threshold = 0.8): StrategyResult[] {
  const w = winners(results, threshold);
  return w.filter((r) => !w.some((o) => o !== r && o.actions.length < r.actions.length && o.actions.every((a) => r.actions.includes(a))));
}

/** An action every minimal winner needs = a dominant action (bad design). */
export function dominantActions(results: StrategyResult[], threshold = 0.8): ActionId[] {
  const w = minimalWinners(results, threshold);
  if (w.length === 0) return [];
  return ACTIONS.map((a) => a.id).filter((id) => w.every((r) => r.actions.includes(id)));
}
