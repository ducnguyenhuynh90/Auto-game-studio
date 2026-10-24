import { describe, expect, it } from 'vitest';
import { addChainLink, chainBonus, foodLevel, hungryCandidates, ladder, rollHungry, topLevel } from '../src/core/chain';
import { SPECIES } from '../src/core/data';
import { SEAS } from '../src/core/seas';
import { makeRng } from '../src/core/rng';
import { newState } from '../src/core/state';
import { checkGoals, GOALS } from '../src/core/goals';

describe('food chain', () => {
  it('every sea has a chain of at least 2 levels', () => {
    for (const sea of SEAS) expect(ladder(sea.id).length, sea.id).toBeGreaterThanOrEqual(2);
  });

  it('treasure and crates are never in the chain', () => {
    for (const sp of SPECIES) if (sp.treasure || sp.crate) expect(foodLevel(sp.id)).toBe(0);
  });

  it('Phú Quốc: anchovy calls a scad, a scad calls the deep mackerel', () => {
    expect(hungryCandidates('lagoon', 1).map((s) => s.id)).toEqual(['scad']);
    expect(hungryCandidates('lagoon', 2).map((s) => s.id)).toEqual(['mackerel']);
    expect(topLevel('lagoon')).toBe(3);
  });

  it('legendaries never rise on demand', () => {
    for (const sea of SEAS) for (let l = 1; l <= 3; l++) for (const sp of hungryCandidates(sea.id, l)) expect(sp.rarity).toBeLessThan(5);
    expect(rollHungry(makeRng(1), 'bay', 3, 3)).toBeNull(); // only the Dragon Carp is above level 3 there
  });

  it('every non-top level can call a fish (no dead ends below the top)', () => {
    for (const sea of SEAS) {
      const top = topLevel(sea.id);
      for (const r of ladder(sea.id)) if (r.level < top && r.level + 1 < 4) expect(hungryCandidates(sea.id, r.level).length, `${sea.id} L${r.level}`).toBeGreaterThan(0);
    }
  });

  it('longer chains pay more, and links are recorded', () => {
    expect(chainBonus(1).coins).toBe(0);
    expect(chainBonus(3).coins).toBeGreaterThan(chainBonus(2).coins);
    const s = newState();
    addChainLink(s, 2);
    addChainLink(s, 3);
    expect(s.stats.chains).toBe(2);
    expect(s.stats.bestChain).toBe(3);
    expect(s.coins).toBeGreaterThanOrEqual(chainBonus(2).coins + chainBonus(3).coins);
  });

  it('the tutorial teaches the chain before the gear goal', () => {
    const ids = GOALS.map((g) => g.id);
    expect(ids.indexOf('chain2')).toBeLessThan(ids.indexOf('gear1'));
    const s = newState();
    s.goalsDone = ids.slice(0, ids.indexOf('chain2'));
    s.stats.bestChain = 2;
    expect(checkGoals(s).map((g) => g.id)).toContain('chain2');
  });
});
