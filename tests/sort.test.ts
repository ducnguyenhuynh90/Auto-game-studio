import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import {
  SORT_BOOSTERS,
  SORT_LEVELS,
  buySortBooster,
  cloneBoard,
  freeSlot,
  goodsLeft,
  hintMove,
  smartHint,
  solves,
  sortBoard,
  sortComplete,
  sortLevelSpec,
  sortMove,
  sortOpen,
  sortShuffle,
  sortStars,
  sortStuck,
  sortWon,
  type HintPlan,
  type SortBoard,
} from '../src/core/sort';
import { newState } from '../src/core/state';

const counts = (b: SortBoard) => {
  const m = new Map<number, number>();
  for (const sh of b.shelves) for (const row of sh.rows) for (const g of row) if (g !== null) m.set(g, (m.get(g) ?? 0) + 1);
  return m;
};

describe('Market Sort', () => {
  it('all 50 levels exist, are the same every time, and the solver clears every one', () => {
    for (let i = 0; i < SORT_LEVELS; i++) {
      const b = sortBoard(i);
      expect(JSON.stringify(sortBoard(i)), `level ${i + 1} is deterministic`).toBe(JSON.stringify(b));
      for (const [, n] of counts(b)) expect(n % 3, `level ${i + 1}: goods come in threes`).toBe(0);
      expect(solves(b, b.proof!), `level ${i + 1} solvable`).toBe(true);
    }
  });

  it('gets harder: more goods, rows and kinds, tied shelves later, less time per good', () => {
    const specs = Array.from({ length: SORT_LEVELS }, (_, i) => sortLevelSpec(i));
    for (let i = 1; i < SORT_LEVELS; i++) {
      expect(specs[i].triples).toBeGreaterThanOrEqual(specs[i - 1].triples);
      expect(specs[i].depth).toBeGreaterThanOrEqual(specs[i - 1].depth);
      expect(specs[i].kinds).toBeGreaterThanOrEqual(specs[i - 1].kinds);
    }
    expect(specs.slice(0, 5).every((s) => s.tier === 'super easy' && s.locked === 0)).toBe(true);
    expect(specs[0].time / (specs[0].triples * 3)).toBeGreaterThan(specs[49].time / (specs[49].triples * 3) * 2);
    expect(specs[49].locked).toBe(2);
    expect(goodsLeft(sortBoard(0))).toBeLessThan(goodsLeft(sortBoard(49)) / 10);
  });

  it('three of a kind on a shelf are sold, the row behind slides forward, ties loosen', () => {
    const b: SortBoard = {
      level: 0,
      sold: 0,
      moves: 0,
      time: 60,
      shelves: [
        { lock: 0, rows: [[0, 0, null], [1, 1, 1]] },
        { lock: 0, rows: [[0, 2, null]] },
        { lock: 2, rows: [[2, 2, null]] },
      ],
    };
    expect(sortMove(b, 2, 0, 1, 2).ok).toBe(false); // tied shelf can't be touched
    const r = sortMove(b, 1, 0, 0, 2);
    expect(r).toEqual({ ok: true, sold: 0 });
    expect(b.shelves[0].rows).toEqual([[1, 1, 1]]); // next row came forward
    expect(b.shelves[2].lock).toBe(1);
    expect(sortMove(b, 1, 1, 1, 1).ok).toBe(false); // same slot
    expect(freeSlot(b, 2)).toBe(-1); // still tied
  });

  it('knows when the stall is cleared or stuck', () => {
    const won: SortBoard = { level: 0, sold: 2, moves: 4, time: 60, shelves: [{ lock: 0, rows: [[null, null, null]] }] };
    expect(sortWon(won)).toBe(true);
    const stuck: SortBoard = { level: 0, sold: 0, moves: 0, time: 60, shelves: [{ lock: 0, rows: [[0, 1, 2]] }, { lock: 0, rows: [[1, 2, 0]] }] };
    expect(sortStuck(stuck)).toBe(true);
    expect(hintMove(stuck)).toBeNull();
  });

  it('the hint always gives a legal move on a fresh level', () => {
    for (const i of [0, 10, 25, 49]) {
      const b = sortBoard(i);
      const m = hintMove(b, makeRng(5))!;
      expect(sortMove(cloneBoard(b), ...m).ok).toBe(true);
    }
  });

  it('following the Hint from the start clears every one of the 50 levels', () => {
    for (let i = 0; i < SORT_LEVELS; i++) {
      const b = sortBoard(i);
      const plan: HintPlan = { states: [], moves: [] };
      for (let n = 0; n < 2000 && !sortWon(b); n++) {
        const m = smartHint(b, plan);
        expect(m, `level ${i + 1} move ${n}`).not.toBeNull();
        expect(sortMove(b, ...m!).ok).toBe(true);
      }
      expect(sortWon(b), `level ${i + 1}`).toBe(true);
    }
  });

  it('shuffle keeps the same goods', () => {
    const b = sortBoard(30);
    const before = counts(b);
    sortShuffle(b, makeRng(9));
    const after = counts(b);
    for (const [g, n] of after) expect(n).toBeLessThanOrEqual(before.get(g)!); // equal, or a sale happened
    expect(goodsLeft(b) % 3).toBe(0);
  });

  it('stars, first-clear coins, level order and booster prices', () => {
    expect(sortStars(40, 60)).toBe(3);
    expect(sortStars(20, 60)).toBe(2);
    expect(sortStars(5, 60)).toBe(1);
    expect(sortStars(0, 60)).toBe(0);
    const s = newState();
    expect(sortOpen(s, 0)).toBe(true);
    expect(sortOpen(s, 1)).toBe(false);
    const coins = s.coins;
    const r = sortComplete(s, 0, 2);
    expect(r.first).toBe(true);
    expect(s.coins).toBe(coins + r.coins);
    expect(sortComplete(s, 0, 3)).toEqual({ first: false, coins: 0 }); // replays raise stars, no second pay
    expect(s.sort[0]).toBe(3);
    expect(sortOpen(s, 1)).toBe(true);
    s.coins = SORT_BOOSTERS.hint.cost - 1;
    expect(buySortBooster(s, 'hint')).toBe(false);
    s.coins = SORT_BOOSTERS.hint.cost;
    expect(buySortBooster(s, 'hint')).toBe(true);
    expect(s.coins).toBe(0);
  });
});
