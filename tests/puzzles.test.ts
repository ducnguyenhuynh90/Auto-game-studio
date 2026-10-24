import { describe, expect, it } from 'vitest';
import { SPECIES_BY_ID } from '../src/core/data';
import { FISHING_LEVELS, SALT_LEVELS, SHOP_LEVELS, accepts, completeLevel, levelOpen, rotate, saltBoard, saltPar, saltSolved, shopBest, shopStars, turnCell } from '../src/core/puzzles';
import { foodLevel } from '../src/core/chain';
import { newState } from '../src/core/state';

describe('puzzles', () => {
  it('ships 5 levels per section', () => {
    expect(FISHING_LEVELS.length).toBe(5);
    expect(SALT_LEVELS.length).toBe(5);
    expect(SHOP_LEVELS.length).toBe(5);
  });

  it('every salt level starts unsolved and is solved by its authored layout', () => {
    SALT_LEVELS.forEach((_, li) => {
      const b = saltBoard(li);
      expect(saltSolved(b), `level ${li + 1} starts solved`).toBe(false);
      const par = saltPar(b);
      expect(par).toBeGreaterThan(0);
      // play the par solution
      b.cells.forEach((c, i) => {
        if (c.kind !== 'pipe') return;
        while (c.mask !== c.solved) turnCell(b, i);
      });
      expect(saltSolved(b), `level ${li + 1} solution`).toBe(true);
    });
    expect(rotate(0b0011)).toBe(0b0110);
  });

  it('every shop level can serve everyone, and greedy first-fit is not always best', () => {
    let greedyMissed = 0;
    for (const l of SHOP_LEVELS) {
      const best = shopBest(l);
      expect(best, l.title).not.toBeNull();
      // greedy: each customer takes the first acceptable bottle
      const used = new Set<number>();
      let ok = true;
      for (const c of l.customers) {
        const i = l.bottles.findIndex((b, bi) => !used.has(bi) && accepts(c, b));
        if (i < 0) ok = false;
        else used.add(i);
      }
      if (!ok) greedyMissed++;
    }
    expect(greedyMissed).toBeGreaterThan(0);
    expect(shopStars(100, 100, true)).toBe(3);
    expect(shopStars(100, 100, false)).toBe(0);
  });

  it('fishing levels have a path: the goal fish is reachable through the chain', () => {
    for (const l of FISHING_LEVELS) {
      const levels = l.fish.map((f) => foodLevel(f.species));
      expect(levels).toContain(1);
      if (l.goal.kind === 'catch') expect(foodLevel(l.goal.species)).toBeGreaterThan(1);
      if (l.goal.kind === 'chain') expect(l.casts).toBeGreaterThanOrEqual(l.goal.n);
      for (const f of l.fish) expect(SPECIES_BY_ID[f.species]).toBeDefined();
    }
  });

  it('levels open in order and pay once', () => {
    const s = newState();
    expect(levelOpen(s, 'shop', 0)).toBe(true);
    expect(levelOpen(s, 'shop', 1)).toBe(false);
    const r1 = completeLevel(s, 'shop', 0, 2);
    expect(r1.first).toBe(true);
    expect(levelOpen(s, 'shop', 1)).toBe(true);
    expect(completeLevel(s, 'shop', 0, 3).first).toBe(false);
    expect(s.puzzles.shop[0]).toBe(3);
    expect(levelOpen(s, 'shop', 5)).toBe(false); // level 6+ not built yet
  });
});
