import { describe, expect, it } from 'vitest';
import { GOALS, goalPair, goalTarget } from '../src/core/goals';
import { addCatch, newState } from '../src/core/state';

const at = (id: string) => {
  const s = newState();
  // every tutorial goal before `id` is done, so `id` is the banner's goal
  s.goalsDone = GOALS.slice(0, GOALS.findIndex((g) => g.id === id)).map((g) => g.id);
  return s;
};

describe('tapping the goal goes where it can be done', () => {
  it('"Upgrade your fishing gear" opens the shop on that upgrade when you can afford it', () => {
    const s = at('gear1');
    s.coins = 1000;
    const t = goalTarget(s, goalPair(s).current!);
    expect(t.to).toBe('shop');
    expect(['rod', 'line', 'hook', 'bait']).toContain(t.upgrade);
  });

  it('without the coins it says how many are missing and sends you to earn them', () => {
    const s = at('gear1');
    s.coins = 5;
    const t = goalTarget(s, goalPair(s).current!);
    expect(t.to).toBe('fish');
    expect(t.why).toMatch(/more coins/);
    s.shelf.push({ uid: 1, recipe: 'classic', degrees: 20, tier: 'good', auto: false } as never);
    expect(goalTarget(s, goalPair(s).current!).to).toBe('sell');
  });

  it('a second jar opens the village tab of the shop', () => {
    const s = at('jar2');
    s.coins = 1000;
    expect(goalTarget(s, goalPair(s).current!)).toEqual({ to: 'shop', upgrade: 'jars' });
  });

  it('fill a jar: the jar when 3 fish are in the bucket, otherwise fishing', () => {
    const s = at('seal1');
    expect(goalTarget(s, goalPair(s).current!).to).toBe('fish');
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 0.9);
    expect(goalTarget(s, goalPair(s).current!).to).toBe('fill');
  });

  it('catching goals go fishing; Mực goals open the dog', () => {
    expect(goalTarget(newState(), goalPair(newState()).current!).to).toBe('fish');
    const s = at('dog_feed');
    expect(goalTarget(s, goalPair(s).current!).to).toBe('dog');
  });

  it('Road goals keep their own place (island, brand, …)', () => {
    const s = newState();
    s.goalsDone = GOALS.map((g) => g.id);
    const cur = goalPair(s).current!;
    expect(cur.career).toBeDefined();
    expect(goalTarget(s, cur).to).toBe('career');
  });
});
