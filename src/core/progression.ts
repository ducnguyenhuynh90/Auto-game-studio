// Captain level: XP from catching, brewing and missions. Each level-up pays a little coin.
import type { GameState } from './state';

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return Math.round(60 * Math.pow(level - 1, 1.5));
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

/** Progress inside the current level, 0..1. */
export function levelProgress(xp: number): number {
  const l = levelForXp(xp);
  const a = xpForLevel(l);
  const b = xpForLevel(l + 1);
  return (xp - a) / (b - a);
}

export function levelUpCoins(level: number): number {
  return 10 + level * 5;
}

/** Adds XP and pays level-up coins. Returns how many levels were gained. */
export function addXp(s: GameState, xp: number): number {
  const before = levelForXp(s.xp);
  s.xp += xp;
  const after = levelForXp(s.xp);
  for (let l = before + 1; l <= after; l++) s.coins += levelUpCoins(l);
  return after - before;
}
