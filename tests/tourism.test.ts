import { describe, expect, it } from 'vitest';
import { deliverContract, idleReason, incomeSources, qualifying, refreshContracts, savingTips, suggestPlot } from '../src/core/business';
import { attraction, build, buyPlot, canExpand, hire, hostFestival, ledger, terrain, tickIsland, tourGroup, wage, COLS, ROWS, FESTIVAL } from '../src/core/island';
import { makeRng } from '../src/core/rng';
import { newState } from '../src/core/state';

const rich = () => {
  const s = newState();
  s.career = { stage: 7, done: [] }; // a famous player: every building unlocked
  s.coins = 100000;
  s.stats.sold = 1;
  return s;
};
const land = (s: ReturnType<typeof newState>) => {
  const t = s.island.owned.find((i) => terrain(i) === 'g' && !s.island.buildings.some((b) => b.tile === i));
  if (t !== undefined) return t;
  for (let i = 0; i < COLS * ROWS; i++) if (canExpand(s, i) && terrain(i) === 'g') {
    buyPlot(s, i);
    return i;
  }
  throw new Error('no land');
};
const grow = (s: ReturnType<typeof newState>, lv: number) => {
  for (let k = 0; k < 12 && s.island.owned.length < 6 + lv * 3; k++) {
    const t = [...Array(COLS * ROWS).keys()].find((i) => canExpand(s, i));
    if (t !== undefined) buyPlot(s, t);
  }
};

describe('tourism', () => {
  it('a Tour Office with a guide brings paying tourists; building more attracts bigger groups', () => {
    const s = rich();
    grow(s, 2);
    const office = land(s);
    expect(build(s, office, 'touroffice')).toBe(true);
    hire(s, office);
    const small = tourGroup(s);
    build(s, land(s), 'brewhouse');
    build(s, land(s), 'lantern');
    expect(attraction(s)).toBeGreaterThan(0);
    expect(tourGroup(s)).toBeGreaterThanOrEqual(small);
    const before = s.coins;
    const rep = tickIsland(s, 3600, makeRng(1), 1_000_000);
    expect(rep.tourists).toBeGreaterThan(0);
    expect(rep.src.tours).toBeGreaterThan(0);
    expect(s.coins).toBeGreaterThan(before - 100); // tickets beat an hour of wages + upkeep
    expect(ledger(s).src!.tours.total).toBeGreaterThan(0);
  });

  it('a festival costs coins up front and doubles tour groups for 15 minutes', () => {
    const s = rich();
    const now = 5_000_000;
    const base = tourGroup(s, now);
    expect(hostFestival(s, now)).toBe(true);
    expect(s.coins).toBe(100000 - FESTIVAL.cost);
    expect(tourGroup(s, now + 1000)).toBeGreaterThanOrEqual(base * 2);
    expect(tourGroup(s, now + FESTIVAL.minutes * 60_000 + 1)).toBe(base);
    expect(hostFestival(s, now + 1000)).toBe(false); // one at a time
  });
});

describe('business report', () => {
  it('lists every income source with what it needs; off lines lead to a build action', () => {
    const s = rich();
    const src = incomeSources(s);
    expect(src.map((x) => x.id)).toEqual(expect.arrayContaining(['shop', 'tours', 'fishing', 'salt', 'brew', 'contracts', 'you']));
    const shop = src.find((x) => x.id === 'shop')!;
    expect(shop.status).toBe('off');
    expect(shop.fix?.action.kind).toBe('build');
  });

  it('spots idle staff, says why, and offers the fix', () => {
    const s = rich();
    const dock = s.island.owned.find((i) => terrain(i) === 'b')!;
    build(s, dock, 'dock');
    hire(s, dock);
    for (let i = 0; i < 15; i++) s.bucket.push({ uid: 1000 + i, species: 'anchovy', size: 10, freshness: 0.5, perfect: false });
    const r = idleReason(s, s.island.staff[0]);
    expect(r?.why).toMatch(/bucket full/);
    expect(r?.fix.action).toMatchObject({ kind: 'build', building: 'brewhouse' });
    expect(savingTips(s).some((t) => /idle/.test(t.text))).toBe(true);
    expect(suggestPlot(s, 'brewhouse')).not.toBeNull();
  });

  it('training is cheaper per unit of work: +25% speed for +15% wage', () => {
    const st = { uid: 1, role: 'fisher' as const, name: 'x', level: 1, tile: 0 };
    const w1 = wage(st);
    const w2 = wage({ ...st, level: 2 });
    expect(w2 / w1).toBeLessThan(1.25);
  });
});

describe('export orders', () => {
  it('orders appear with a Trading Post, change every 2 hours, and pay above the market', () => {
    const s = rich();
    expect(refreshContracts(s, 0)).toEqual([]);
    s.island.owned.push(...[...Array(COLS * ROWS).keys()].filter((i) => terrain(i) === 'p'));
    while (s.island.owned.length < 30) {
      const t = [...Array(COLS * ROWS).keys()].find((i) => canExpand(s, i));
      if (t === undefined) break;
      buyPlot(s, t);
    }
    const pier = s.island.owned.find((i) => terrain(i) === 'p')!;
    expect(build(s, pier, 'tradepost')).toBe(true);
    const a = refreshContracts(s, 1_000);
    expect(a.length).toBe(3);
    expect(refreshContracts(s, 2_000)).toBe(a); // same slot, same orders
    const c = a[0];
    expect(deliverContract(s, c.id)).toBe(0); // no bottles yet
    for (let i = 0; i < c.count; i++) s.shelf.push({ uid: 2000 + i, recipe: c.recipe ?? 'classic', degrees: c.minDeg + 1, agingLevel: 1 });
    expect(qualifying(s, c).length).toBe(c.count);
    const coins = s.coins;
    expect(deliverContract(s, c.id)).toBe(c.pay);
    expect(s.coins).toBe(coins + c.pay);
    expect(deliverContract(s, c.id)).toBe(0); // only once
    const next = refreshContracts(s, 3 * 3600 * 1000);
    expect(next[0].id).not.toBe(c.id);
  });
});
