import { describe, expect, it } from 'vitest';
import { BALANCE, saucePrice, tierFor } from '../src/core/data';
import { Reel, castPower, rollShadow } from '../src/core/fishing';
import { checkGoals, currentGoal } from '../src/core/goals';
import { makeRng } from '../src/core/rng';
import { addCatch, agingLevel, finishTrip, baseDegrees, bestJarFill, buyUpgrade, jarDegrees, newState, openJar, recipeFor, sealJar, sellProduct } from '../src/core/state';

const rng = () => makeRng(42);

describe('reel', () => {
  it('a skilled player who keeps tension in the zone lands the fish with high freshness', () => {
    const r = new Reel({ difficulty: 0.3, rodLevel: 0 }, rng());
    let t = 0;
    while (!r.result && t < 30) {
      r.step(1 / 60, r.tension < r.zoneCenter);
      t += 1 / 60;
    }
    expect(r.result).toBe('caught');
    expect(r.freshness).toBeGreaterThan(0.6);
  });

  it('holding forever snaps the line', () => {
    const r = new Reel({ difficulty: 0.3, rodLevel: 0 }, rng());
    let t = 0;
    while (!r.result && t < 30) {
      r.step(1 / 60, true);
      t += 1 / 60;
    }
    expect(r.result).toBe('snapped');
  });

  it('never reeling lets the fish escape', () => {
    const r = new Reel({ difficulty: 0.3, rodLevel: 0 }, rng());
    let t = 0;
    while (!r.result && t < 30) {
      r.step(1 / 60, false);
      t += 1 / 60;
    }
    expect(r.result).toBe('escaped');
  });

  it('cast power is a 0..1 triangle wave', () => {
    expect(castPower(0)).toBe(0);
    expect(castPower(1 / 1.5)).toBeCloseTo(1);
    for (let i = 0; i < 100; i++) {
      const p = castPower(i * 0.037);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('reef shadows can be reef-only species, lagoon never', () => {
    const r = rng();
    for (let i = 0; i < 500; i++) expect(['snapper', 'grouper', 'squid', 'chest', 'trevally']).not.toContain(rollShadow(r, 'lagoon').species);
  });
});

describe('crafting', () => {
  it('recipes follow ingredients', () => {
    const f = (species: string) => ({ uid: 0, species, size: 10, freshness: 1, perfect: true });
    expect(recipeFor([f('anchovy'), f('anchovy'), f('anchovy')])).toBe('classic');
    expect(recipeFor([f('anchovy'), f('sardine'), f('anchovy')])).toBe('blend');
    expect(recipeFor([f('anchovy'), f('snapper'), f('anchovy')])).toBe('reef');
    expect(recipeFor([f('golden'), f('snapper'), f('anchovy')])).toBe('golden');
  });

  it('freshness raises quality: skill matters', () => {
    const fresh = [1, 2, 3].map((uid) => ({ uid, species: 'anchovy', size: 10, freshness: 1, perfect: true }));
    const bruised = fresh.map((f) => ({ ...f, freshness: 0.2 }));
    expect(baseDegrees(fresh, 0) - baseDegrees(bruised, 0)).toBeCloseTo(0.8 * BALANCE.freshnessBonus);
  });

  it('full loop: catch → seal → trip → open → sell → upgrade', () => {
    const s = newState();
    const r = rng();
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 0.9);
    expect(s.bucket).toHaveLength(3);
    expect(sealJar(s, 0, bestJarFill(s), r, 0)).toBe(true);
    expect(s.bucket).toHaveLength(0);
    expect(agingLevel(s, s.jars[0], 0)).toBe(0);
    expect(openJar(s, 0, 0)).toBeNull(); // not ready yet
    finishTrip(s, false); // docking early does not age the jar
    expect(agingLevel(s, s.jars[0], 0)).toBe(0);
    finishTrip(s, true);
    expect(agingLevel(s, s.jars[0], 0)).toBe(1);
    const predicted = jarDegrees(s, s.jars[0], 0);
    const res = openJar(s, 0, 0)!;
    expect(res.product.degrees).toBe(predicted); // reveal shows a pre-determined value
    expect(res.newRecipe).toBe(true);
    const price = sellProduct(s, res.product.uid);
    expect(price).toBe(saucePrice(predicted, 0));
    expect(s.coins).toBe(price);
    // first sale should afford the first upgrade (the second jar)
    expect(buyUpgrade(s, 'jars')).toBe(true);
    expect(s.jars).toHaveLength(2);
  });

  it('aging caps and also progresses with real time', () => {
    const s = newState();
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 0.9);
    sealJar(s, 0, s.bucket.map((f) => f.uid), rng(), 0);
    expect(agingLevel(s, s.jars[0], BALANCE.agingSecondsPerLevel * 1000)).toBe(1);
    s.stats.fullTrips += 10;
    expect(agingLevel(s, s.jars[0], 0)).toBe(BALANCE.maxAging);
  });

  it('treasure becomes coins, never a jar ingredient', () => {
    const s = newState();
    addCatch(s, 'bottle', 20, 1);
    expect(s.bucket).toHaveLength(0);
    expect(s.coins).toBeGreaterThan(0);
  });

  it('cannot seal non-fermentable fish', () => {
    const s = newState();
    addCatch(s, 'crab', 15, 1);
    addCatch(s, 'anchovy', 10, 1);
    addCatch(s, 'anchovy', 10, 1);
    expect(sealJar(s, 0, s.bucket.map((f) => f.uid), rng(), 0)).toBe(false);
  });
});

describe('goals', () => {
  it('complete in order and pay rewards once', () => {
    const s = newState();
    expect(currentGoal(s)!.id).toBe('catch3');
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 0.9);
    const done = checkGoals(s);
    expect(done.map((g) => g.id)).toEqual(['catch3']);
    expect(s.coins).toBe(5);
    expect(checkGoals(s)).toEqual([]);
    expect(currentGoal(s)!.id).toBe('seal1');
  });
});

describe('tiers', () => {
  it('maps degrees to tiers', () => {
    expect(tierFor(10).id).toBe('basic');
    expect(tierFor(22).id).toBe('fine');
    expect(tierFor(41).id).toBe('legendary');
  });
});
