import { describe, expect, it } from 'vitest';
import { BRAND_STAGES, brandMult, brandProblem, upgradeBrand } from '../src/core/brand';
import { buildDogHouse, dogHouseProblem, feedDog } from '../src/core/dog';
import { GOALS, checkGoals } from '../src/core/goals';
import { build, hire, ledger, terrain, tickIsland, upkeepPerHour, wagesPerHour } from '../src/core/island';
import { makeRng } from '../src/core/rng';
import { SCENES } from '../src/core/story';
import { addCatch, newState, productPrice, sellProduct } from '../src/core/state';

const shore = (s: ReturnType<typeof newState>) => s.island.owned.find((i) => terrain(i) === 'b')!;

describe('brand', () => {
  it('selling earns reputation; a brand stage raises every price', () => {
    const s = newState();
    const bottle = { uid: 1, recipe: 'classic', degrees: 25, agingLevel: 1 };
    const base = productPrice(s, bottle);
    s.shelf.push({ ...bottle });
    sellProduct(s, 1);
    expect(s.brand.rep).toBe(5);
    expect(brandProblem(s)).toMatch(/reputation/);
    s.brand.rep = 20;
    s.coins = 1000;
    expect(upgradeBrand(s)).toBe(true);
    expect(brandMult(s)).toBe(BRAND_STAGES[1].mult);
    expect(productPrice(s, bottle)).toBe(Math.round(base * 1.1));
  });

  it('the ladder only goes up in price and reputation', () => {
    for (let i = 1; i < BRAND_STAGES.length; i++) {
      expect(BRAND_STAGES[i].mult).toBeGreaterThan(BRAND_STAGES[i - 1].mult);
      expect(BRAND_STAGES[i].rep).toBeGreaterThan(BRAND_STAGES[i - 1].rep);
    }
  });
});

describe('running costs', () => {
  it('staff and buildings cost money every hour; unpaid staff stop working', () => {
    const s = newState();
    s.coins = 1000;
    const t = shore(s);
    build(s, t, 'dock');
    hire(s, t);
    expect(wagesPerHour(s)).toBe(30);
    expect(upkeepPerHour(s)).toBe(10);
    const before = s.coins;
    tickIsland(s, 3600, makeRng(1), 1_000_000);
    expect(before - s.coins).toBe(40);
    expect(s.island.made.fish).toBeGreaterThan(0);
    expect(Math.round(ledger(s).wages)).toBe(30);
    // broke: staff stop, coins never go negative
    s.coins = 0;
    const fish = s.island.made.fish;
    tickIsland(s, 3600, makeRng(2), 2_000_000);
    expect(s.island.unpaid).toBe(true);
    expect(s.coins).toBe(0);
    expect(s.island.made.fish).toBe(fish);
    // paid again → back to work
    s.coins = 500;
    tickIsland(s, 600, makeRng(3), 3_000_000);
    expect(s.island.unpaid).toBe(false);
  });
});

describe('Mực the Phú Quốc dog', () => {
  it('feed 3 fish → build a house → he rides the boat and counts catches', () => {
    const s = newState();
    s.stats.sold = 1;
    for (let i = 0; i < 4; i++) addCatch(s, i === 0 ? 'golden' : 'anchovy', 10, 0.9);
    expect(feedDog(s)).toBe('anchovy'); // the cheapest fish, never the golden one
    feedDog(s);
    expect(dogHouseProblem(s)).toMatch(/1 more/);
    feedDog(s);
    s.coins = 100;
    expect(buildDogHouse(s)).toBe(true);
    addCatch(s, 'sardine', 15, 0.6);
    expect(s.dog.catches).toBe(1);
  });

  it('the dog story fits the tutorial and its scenes play in order', () => {
    const ids = GOALS.map((g) => g.id);
    expect(ids.indexOf('dog_feed')).toBe(ids.indexOf('sell1') + 1);
    expect(ids.indexOf('dog_home')).toBeLessThan(ids.indexOf('dog_boat'));
    const order = SCENES.map((x) => x.id);
    expect(order.indexOf('first_sale')).toBeLessThan(order.indexOf('dog_arrive'));
    const s = newState();
    s.goalsDone = ids.slice(0, ids.indexOf('dog_feed'));
    s.dog.fed = 3;
    expect(checkGoals(s).map((g) => g.id)).toContain('dog_feed');
  });
});
