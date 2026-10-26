import { describe, expect, it } from 'vitest';
import { brandProblem } from '../src/core/brand';
import { careerLock } from '../src/core/career';
import { FETCH_CHANCE, FIND_CHANCE, dogFetch, dogFind, dogHouseProblem } from '../src/core/dog';
import { explain, explainBrand } from '../src/core/help';
import { placeProblem, terrain, trainProblem } from '../src/core/island';
import { makeRng } from '../src/core/rng';
import { SEAS_BY_ID, seaLock } from '../src/core/seas';
import { newState } from '../src/core/state';

describe('every requirement explains itself', () => {
  it('turns each rule message into a real how-to (never the generic fallback)', () => {
    const s = newState();
    s.coins = 0;
    const problems = [
      brandProblem(s), // reputation
      'Needs 120 coins',
      careerLock(s, 'touroffice'),
      dogHouseProblem(s),
      seaLock(s, SEAS_BY_ID.reef),
      'Needs island level 2',
      'Needs a shore plot',
      'Needs the Old Pier',
      'Keep this special shore for a dock or salt field',
      'Buy this plot first',
      trainProblem(s, { uid: 1, role: 'brewer', level: 1, tile: 0, name: 'Hoa' } as never),
    ];
    for (const p of problems) {
      expect(p).toBeTruthy();
      const h = explain(s, p!);
      expect(h.title, p!).not.toBe('What’s needed');
      expect(h.lines.length).toBeGreaterThan(0);
    }
  });

  it('a building card that is locked always has an explanation', () => {
    const s = newState();
    const tile = s.island.owned.find((t) => terrain(t) === 'g')!;
    for (const id of ['dock', 'shop', 'touroffice', 'tradepost'] as const) {
      const p = placeProblem(s, tile, id);
      if (p) expect(explain(s, p).title).not.toBe('What’s needed');
    }
  });

  it('the brand card says what is missing, with your numbers and how to get it', () => {
    const s = newState();
    s.brand = { level: 1, rep: 34 };
    s.coins = 49;
    const h = explainBrand(s);
    expect(h.lines.join(' ')).toMatch(/34 of 80 reputation/);
    expect(h.lines.join(' ')).toMatch(/49 of 500/);
    expect(h.actions.map((a) => a.action)).toContain('market');
  });
});

describe('Mực on the boat', () => {
  it('fetches a little common fish of this sea into the bucket', () => {
    const s = newState();
    const f = dogFetch(s, 'lagoon', makeRng(3))!;
    expect(f).toBeTruthy();
    expect(s.bucket.some((x) => x.uid === f.uid)).toBe(true);
    expect(s.dog.catches).toBe(1);
  });

  it('finds things with honest, free rewards that are applied before the message shows', () => {
    const kinds = new Set<string>();
    const rng = makeRng(11);
    for (let i = 0; i < 300; i++) {
      const s = newState();
      const before = { coins: s.coins, xp: s.xp, salt: s.gadgets.salt ?? 0, sonar: s.gadgets.sonar ?? 0 };
      const f = dogFind(s, rng);
      kinds.add(f.kind);
      const changed = s.coins > before.coins || s.xp > before.xp || (s.gadgets.salt ?? 0) > before.salt || (s.gadgets.sonar ?? 0) > before.sonar;
      expect(changed, f.kind).toBe(true);
    }
    expect([...kinds].sort()).toEqual(['bottle', 'coins', 'salt', 'shell', 'sonar']);
    expect(FETCH_CHANCE).toBeLessThan(0.5);
    expect(FIND_CHANCE).toBeLessThan(1);
  });
});
