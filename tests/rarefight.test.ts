import { describe, expect, it } from 'vitest';
import { BALANCE, SPECIES, SPECIES_BY_ID } from '../src/core/data';
import { Reel } from '../src/core/fishing';
import { makeRng } from '../src/core/rng';

/** Players: each try reacts 70-230 ms late (a mix of quick and slow hands) and aims a little off-centre. */
function catchRate(species: string, rod: number, tries = 300): number {
  const sp = SPECIES_BY_ID[species];
  let caught = 0;
  for (let i = 0; i < tries; i++) {
    const rng = makeRng(1000 + i);
    const r = new Reel({ difficulty: sp.difficulty, rodLevel: rod, hookLevel: 1, rarity: sp.rarity }, rng);
    const delay = 4 + Math.floor(rng() * 11);
    const seen: number[] = [];
    let holding = false;
    for (let t = 0; t < 60 && !r.result; t += 1 / 60) {
      seen.push(r.tension - r.zoneCenter);
      const late = seen[Math.max(0, seen.length - delay)];
      holding = late < (rng() - 0.5) * 0.08;
      r.step(1 / 60, holding);
    }
    if (r.result === 'caught') caught++;
  }
  return caught / tries;
}

describe('special fish fight harder', () => {
  it('the sweet zone shrinks with rarity and the rod still widens it', () => {
    const z = (rarity: number, rod = 0) => new Reel({ difficulty: 0.5, rodLevel: rod, hookLevel: 0, rarity }, makeRng(1)).zoneWidth;
    expect(z(1)).toBe(z(2));
    expect(z(3)).toBeLessThan(z(2));
    expect(z(4)).toBeLessThan(z(3));
    expect(z(5)).toBeLessThan(z(4));
    expect(z(5, 3)).toBeGreaterThan(z(5, 0));
    expect(z(5, 0)).toBeCloseTo(BALANCE.rodZone[0] * BALANCE.rareZone[5]);
  });

  it('commons stay easy; specials get harder by rarity, and a better rod makes every one catchable', () => {
    expect(catchRate('sardine', 0)).toBeGreaterThan(0.97);
    expect(catchRate('mackerel', 0)).toBeGreaterThan(0.97);
    const rare = catchRate('snapper', 0);
    const legend = catchRate('golden', 0);
    expect(rare).toBeGreaterThan(0.6);
    expect(rare).toBeLessThan(0.95);
    expect(legend).toBeGreaterThan(0.15); // hard, never hopeless
    expect(legend).toBeLessThan(rare - 0.25);
    expect(catchRate('golden', 3)).toBeGreaterThan(legend + 0.3);
    for (const sp of SPECIES.filter((x) => x.rarity >= 3)) expect(catchRate(sp.id, 3, 150), sp.id).toBeGreaterThan(0.4);
  });
});
