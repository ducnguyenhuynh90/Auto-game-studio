import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/data';
import { HOME, OFFLINE_CAP_SECONDS, build, buyPlot, canExpand, catchUp, hire, hireCost, islandLevel, placeProblem, plotCost, staffLevelCap, terrain, tickIsland, trainProblem, trainStaff, COLS, ROWS } from '../src/core/island';
import { completeLevel } from '../src/core/puzzles';
import { makeRng } from '../src/core/rng';
import { newState } from '../src/core/state';
import { loadFromBlob } from '../src/core/save';

const rich = () => {
  const s = newState();
  s.coins = 100000;
  return s;
};
const findTile = (pred: (t: string, i: number) => boolean) => {
  for (let i = 0; i < COLS * ROWS; i++) if (pred(terrain(i), i)) return i;
  return -1;
};
const isShoreT = (t: string) => t === 'b' || t === 'c' || t === 's';
/** Buys plots until a shore plot is owned and free; returns it. */
const getShore = (s: ReturnType<typeof newState>, taken: number[] = []) => {
  for (let k = 0; k < 40; k++) {
    const own = s.island.owned.find((i) => isShoreT(terrain(i)) && !taken.includes(i));
    if (own !== undefined) return own;
    const shore = findTile((t, i) => isShoreT(t) && canExpand(s, i));
    buyPlot(s, shore >= 0 ? shore : findTile((_, i) => canExpand(s, i)));
  }
  throw new Error('no shore');
};

describe('island', () => {
  it('starts with the plots around the village and expands only to touching land', () => {
    const s = rich();
    expect(s.island.owned).toContain(HOME);
    expect(s.island.owned.length).toBe(6);
    expect(s.island.owned.some((i) => terrain(i) === 'b')).toBe(true); // a dock fits on day one
    const far = findTile((t, i) => t !== '~' && !canExpand(s, i) && !s.island.owned.includes(i));
    expect(far).toBeGreaterThanOrEqual(0);
    const next = findTile((_, i) => canExpand(s, i));
    const cost = plotCost(s);
    expect(buyPlot(s, next).ok).toBe(true);
    expect(s.coins).toBe(100000 - cost);
    expect(plotCost(s)).toBeGreaterThan(cost);
  });

  it('docks need the shore; the village tile is never buildable', () => {
    const s = rich();
    const grass = s.island.owned.find((i) => terrain(i) === 'g')!;
    expect(placeProblem(s, grass, 'dock')).toMatch(/shore/);
    expect(placeProblem(s, HOME, 'brewhouse')).toMatch(/village/);
    expect(build(s, grass, 'brewhouse')).toBe(true);
    expect(placeProblem(s, grass, 'lantern')).toMatch(/already/);
  });

  it('staff work: fish → bucket, salt, brewing staff jars, selling only staff bottles', () => {
    const s = rich();
    s.upgrades.jars = 1;
    s.jars.push({ fish: [], sealed: false, recipe: '', variance: 0, sealedTrip: 0, sealedAt: 0 });
    // give ourselves a shore plot for the dock and salt field
    const a = getShore(s);
    const b = getShore(s, [a]);
    const grass = s.island.owned.filter((i) => terrain(i) === 'g');
    expect(build(s, a, 'dock')).toBe(true);
    expect(build(s, b, 'saltfield')).toBe(true);
    expect(build(s, grass[0], 'brewhouse')).toBe(true);
    // the shop needs island level 2
    while (islandLevel(s) < 2) buyPlot(s, findTile((_, i) => canExpand(s, i)));
    expect(build(s, grass[1], 'shop')).toBe(true);
    for (const t of [a, b, grass[0], grass[1]]) expect(hire(s, t)).not.toBeNull();
    expect(hire(s, a)).toBeNull(); // one slot at building level 1
    s.shelf.push({ uid: 999, recipe: 'classic', degrees: 25, agingLevel: 2 }); // the player's own bottle
    const rng = makeRng(4);
    const now = 1_000_000;
    let t = now;
    for (let i = 0; i < 400; i++) {
      t += 10_000;
      tickIsland(s, 10, rng, t);
    }
    expect(s.island.made.fish).toBeGreaterThan(10);
    expect(s.island.made.salt).toBeGreaterThan(3);
    expect(s.island.made.jars).toBeGreaterThan(0);
    expect(s.island.made.bottles).toBeGreaterThan(0);
    expect(s.shelf.some((p) => p.uid === 999)).toBe(true); // never auto-sold
    expect(s.bucket.every((f) => f.species !== 'golden')).toBe(true);
  });

  it('respects storage caps and the offline cap', () => {
    const s = rich();
    const shore = getShore(s);
    build(s, shore, 'dock');
    hire(s, shore);
    s.island.lastTick = 1;
    const rep = catchUp(s, makeRng(1), 1 + 7 * 24 * 3600 * 1000);
    expect(rep.fish).toBeLessThanOrEqual(15);
    expect(s.bucket.length).toBeLessThanOrEqual(15);
    expect(OFFLINE_CAP_SECONDS).toBe(14400);
  });

  it('puzzles gate staff training, and the first hire can be free (cousin Út)', () => {
    const s = rich();
    const grass = s.island.owned.find((i) => terrain(i) === 'g')!;
    build(s, grass, 'brewhouse');
    s.island.freeHires = 1;
    expect(hireCost(s, 'brewer')).toBe(0);
    const st = hire(s, grass)!;
    expect(s.island.freeHires).toBe(0);
    expect(staffLevelCap(s, 'brewer')).toBe(1);
    expect(trainProblem(s, st)).toMatch(/Salt puzzle 1/);
    completeLevel(s, 'salt', 0, 2);
    expect(trainStaff(s, st.uid)).toBe(true);
    expect(st.level).toBe(2);
  });

  it('old saves gain an island and puzzle progress', () => {
    const old = newState() as unknown as Record<string, unknown>;
    delete old.island;
    delete old.puzzles;
    const s = loadFromBlob(old as never);
    expect(s.island.owned.length).toBe(6);
    expect(s.puzzles.salt).toEqual([]);
  });

  it('moves a v1 island onto the new map: land refunded, buildings and staff kept', () => {
    const old = newState();
    const isl = old.island as unknown as Record<string, unknown>;
    delete isl.layout;
    // v1: 9 start plots + 3 bought, a dock (with a fisher) and a brew house on old tile numbers
    old.island.owned = [7, 8, 9, 14, 15, 16, 21, 22, 23, 0, 1, 2];
    old.island.buildings = [
      { tile: 14, id: 'dock', level: 1 },
      { tile: 16, id: 'brewhouse', level: 2 },
    ];
    old.island.staff = [{ uid: 5, role: 'fisher', name: 'Anh Ba', level: 2, tile: 14 }];
    old.coins = 10;
    const s = loadFromBlob(JSON.parse(JSON.stringify(old)));
    expect(s.island.layout).toBe(2);
    expect(s.coins).toBe(10 + 40 + 50 + 70);
    expect(s.island.buildings.length).toBe(2);
    const dock = s.island.buildings.find((b) => b.id === 'dock')!;
    expect(['b', 'c', 's', 'p']).toContain(terrain(dock.tile));
    expect(s.island.staff[0].tile).toBe(dock.tile);
    expect(s.island.staff[0].level).toBe(2);
    for (const b of s.island.buildings) expect(s.island.owned).toContain(b.tile);
    expect(BALANCE.jarSlots).toBe(3);
  });
});
