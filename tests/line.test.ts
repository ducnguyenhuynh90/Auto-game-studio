import { describe, expect, it } from 'vitest';
import { lineEstimate, staffJars } from '../src/core/business';
import { build, hire, isAuto, rakeSalt, saltCap, setAuto, terrain, tickIsland, wagesPerHour, buyPlot, canExpand, COLS, ROWS } from '../src/core/island';
import { makeRng } from '../src/core/rng';
import { newState } from '../src/core/state';

function setup(withShop: boolean) {
  const s = newState();
  s.career = { stage: 7, done: [] }; // a famous player: every building unlocked
  s.coins = 5000;
  s.stats.sold = 1;
  const shore = s.island.owned.filter((i) => terrain(i) === 'b');
  build(s, shore[0], 'dock');
  hire(s, shore[0]);
  build(s, shore[1], 'saltfield');
  hire(s, shore[1]);
  const grass = s.island.owned.filter((i) => terrain(i) === 'g');
  build(s, grass[0], 'brewhouse');
  hire(s, grass[0]);
  if (withShop) {
    while (s.island.owned.length < 9) buyPlot(s, [...Array(COLS * ROWS).keys()].find((i) => canExpand(s, i))!);
    const g2 = s.island.owned.find((i) => terrain(i) === 'g' && !s.island.buildings.some((b) => b.tile === i))!;
    build(s, g2, 'shop');
    hire(s, g2);
  }
  return s;
}

const runHour = (s: ReturnType<typeof newState>) => {
  const rng = makeRng(1);
  const c0 = s.island.made.coins;
  let t = 1_000_000;
  for (let i = 0; i < 360; i++) {
    t += 10_000;
    tickIsland(s, 10, rng, t);
  }
  return s.island.made.coins - c0;
};

describe('production line', () => {
  it('without a shop the line makes bottles but earns nothing (they wait on your shelf)', () => {
    const s = setup(false);
    const e = lineEstimate(s);
    expect(e.bottlesPerHour).toBeGreaterThan(0);
    expect(e.soldPerHour).toBe(0);
    expect(runHour(s)).toBe(0);
    expect(s.shelf.filter((p) => p.auto).length).toBeGreaterThan(5);
  });

  it('with a shop the estimate is close to what an hour really earns, and fishing is the bottleneck', () => {
    const s = setup(true);
    const e = lineEstimate(s);
    expect(e.bottleneck).toBe('fish');
    const real = runHour(s);
    expect(real).toBeGreaterThan(0);
    expect(Math.abs(e.coinsPerHour - real) / real).toBeLessThan(0.45);
  });

  it('a step done by hand stops its staff and their wages', () => {
    const s = setup(true);
    const w = wagesPerHour(s);
    setAuto(s, 'sell', false);
    expect(isAuto(s, 'sell')).toBe(false);
    expect(wagesPerHour(s)).toBe(w - 30);
    expect(runHour(s)).toBe(0); // nobody sells: bottles stay for you
    expect(lineEstimate(s).soldPerHour).toBe(0);
  });

  it("your own sealed jar is never counted as a staff jar", () => {
    const s = setup(true);
    expect(staffJars(s)).toBe(1);
    s.jars[0] = { fish: [], sealed: true, recipe: 'classic', variance: 0, sealedTrip: 0, sealedAt: 0 };
    expect(staffJars(s)).toBe(0);
    expect(lineEstimate(s).bottlesPerHour).toBe(0);
  });
});

describe('making salt by hand', () => {
  it('rakes one salt at a time into the store, never past its cap', () => {
    const s = newState();
    s.island.salt = 0;
    expect(rakeSalt(s)).toBe(true);
    expect(s.island.salt).toBe(1);
    s.island.salt = saltCap(s) - 1;
    expect(rakeSalt(s)).toBe(true);
    expect(rakeSalt(s)).toBe(false);
    expect(s.island.salt).toBe(saltCap(s));
  });
});
