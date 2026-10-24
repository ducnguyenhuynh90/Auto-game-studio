import { describe, expect, it } from 'vitest';
import { BALANCE, SPECIES } from '../src/core/data';
import { castDistance, rollShadow, spawnWeight } from '../src/core/fishing';
import { GOALS, checkGoals, goalPair } from '../src/core/goals';
import { levelForXp, xpForLevel } from '../src/core/progression';
import { makeRng } from '../src/core/rng';
import { SEAS, SEAS_BY_ID, seaLock } from '../src/core/seas';
import { addCatch, agingLevel, bestJarFill, castsPerTrip, checkMissions, finishTrip, jarDegrees, newState, sealJar, useGadget } from '../src/core/state';

describe('casting', () => {
  it('releasing in the red band tangles the line', () => {
    expect(castDistance(0.95, 1).tangled).toBe(true);
    expect(castDistance(BALANCE.overcast, 1)).toEqual({ distance: 1, tangled: false });
  });
  it('line reach limits how far a full cast goes', () => {
    expect(castDistance(BALANCE.overcast, BALANCE.lineReach[0]).distance).toBeCloseTo(BALANCE.lineReach[0]);
  });
  it('the deepest fish need the best line', () => {
    const deepest = Math.max(...SPECIES.map((s) => s.depth));
    expect(deepest).toBeGreaterThan(BALANCE.lineReach[2]);
    expect(deepest).toBeLessThanOrEqual(BALANCE.lineReach[3]);
  });
});

describe('bait', () => {
  it('better bait makes rare fish more common and leaves commons alone', () => {
    const snapper = SPECIES.find((s) => s.id === 'snapper')!;
    const anchovy = SPECIES.find((s) => s.id === 'anchovy')!;
    expect(spawnWeight(snapper, 3)).toBeGreaterThan(spawnWeight(snapper, 0));
    expect(spawnWeight(anchovy, 3)).toBe(spawnWeight(anchovy, 0));
    const count = (bait: number) => {
      const r = makeRng(3);
      let rare = 0;
      for (let i = 0; i < 4000; i++) {
        const id = rollShadow(r, 'reef', bait).species;
        if (SPECIES.find((s) => s.id === id)!.rarity >= 3) rare++;
      }
      return rare;
    };
    expect(count(3)).toBeGreaterThan(count(0) * 1.4);
  });
});

describe('progression', () => {
  it('xp levels are monotonic', () => {
    expect(levelForXp(0)).toBe(1);
    for (let l = 2; l < 30; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    expect(levelForXp(xpForLevel(5))).toBe(5);
  });

  it('catches give xp and level-ups pay coins', () => {
    const s = newState();
    for (let i = 0; i < 20; i++) addCatch(s, 'anchovy', 10, 0.9);
    expect(s.xp).toBeGreaterThan(0);
    expect(levelForXp(s.xp)).toBeGreaterThan(1);
    expect(s.coins).toBeGreaterThan(0);
  });

  it('crates hold a gadget from that sea', () => {
    const s = newState();
    const res = addCatch(s, 'crate', 45, 1, 'lagoon', makeRng(1));
    expect(SEAS_BY_ID.lagoon.gadgets).toContain(res.gadget);
    expect(s.gadgets[res.gadget!]).toBe(1);
    expect(s.bucket).toHaveLength(0);
  });

  it('magic salt adds °N to the next sealed jar only', () => {
    const s = newState();
    s.gadgets.salt = 1;
    for (let i = 0; i < 6; i++) addCatch(s, 'anchovy', 10, 0.9);
    const ids = s.bucket.map((f) => f.uid);
    s.jars.push({ fish: [], sealed: false, recipe: '', variance: 0, sealedTrip: 0, sealedAt: 0 });
    expect(useGadget(s, 'salt')).toBe(true);
    expect(useGadget(s, 'salt')).toBe(false);
    sealJar(s, 0, ids.slice(0, 3), makeRng(1), 0);
    sealJar(s, 1, ids.slice(3), makeRng(1), 0);
    s.jars[1].variance = s.jars[0].variance;
    expect(jarDegrees(s, s.jars[0], 0) - jarDegrees(s, s.jars[1], 0)).toBeCloseTo(6);
  });

  it('finishing a sea grants its relic, and relics change the rules', () => {
    const s = newState();
    s.goalsDone = GOALS.map((g) => g.id);
    expect(castsPerTrip(s)).toBe(BALANCE.castsPerTrip);
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 1);
    for (let i = 0; i < 5; i++) addCatch(s, 'sardine', 15, 0.5);
    s.cellar.classic = 25;
    addCatch(s, 'mackerel', 40, 0.5);
    const done = checkMissions(s);
    expect(done.map((d) => d.mission.id)).toEqual(SEAS_BY_ID.lagoon.missions.map((m) => m.id));
    expect(done.at(-1)!.relic).toBe('turtle');
    expect(castsPerTrip(s)).toBe(BALANCE.castsPerTrip + 1);
    expect(checkMissions(s)).toEqual([]);
  });

  it('seas unlock by boat AND by finishing the previous story', () => {
    const s = newState();
    expect(seaLock(s, SEAS_BY_ID.lagoon)).toBeNull();
    expect(seaLock(s, SEAS_BY_ID.reef)).toMatch(/boat/i);
    s.upgrades.boat = 1;
    expect(seaLock(s, SEAS_BY_ID.reef)).toMatch(/Home Lagoon/);
    s.missionsDone = SEAS_BY_ID.lagoon.missions.map((m) => m.id);
    expect(seaLock(s, SEAS_BY_ID.reef)).toBeNull();
  });

  it('missions in locked seas never complete early', () => {
    const s = newState();
    s.cellar.x = 45; // would satisfy the Abyss "legendary sauce" mission
    expect(checkMissions(s).map((d) => d.sea.id)).not.toContain('trench');
  });

  it('dragon jar glaze ages jars twice as fast', () => {
    const s = newState();
    for (let i = 0; i < 3; i++) addCatch(s, 'anchovy', 10, 0.9);
    sealJar(s, 0, s.bucket.map((f) => f.uid), makeRng(1), 0);
    s.relics.push('dragonjar');
    finishTrip(s, true);
    expect(agingLevel(s, s.jars[0], 0)).toBe(2);
  });

  it('best 3 picks the strongest recipe (e.g. Mắm Tôm with prawns)', () => {
    const s = newState();
    addCatch(s, 'catfish', 40, 0.5);
    addCatch(s, 'prawn', 20, 0.9);
    addCatch(s, 'prawn', 20, 0.9);
    addCatch(s, 'catfish', 40, 0.5);
    addCatch(s, 'prawn', 20, 0.9);
    const picked = bestJarFill(s).map((uid) => s.bucket.find((f) => f.uid === uid)!.species);
    expect(picked.filter((x) => x === 'prawn').length).toBeGreaterThanOrEqual(2);
  });
});

describe('goal banner', () => {
  it('always shows the current goal and the next one', () => {
    const s = newState();
    let pair = goalPair(s);
    expect(pair.current!.chapter).toBe('Tutorial');
    expect(pair.next).not.toBeNull();
    s.goalsDone = GOALS.map((g) => g.id);
    pair = goalPair(s);
    expect(pair.current!.chapter).toBe('Home Lagoon');
    expect(pair.next!.text).toBe(SEAS_BY_ID.lagoon.missions[1].text);
    s.missionsDone = SEAS_BY_ID.lagoon.missions.map((m) => m.id);
    pair = goalPair(s);
    expect(pair.current!.text).toMatch(/Coral Reef/);
    expect(checkGoals(s)).toEqual([]);
  });

  it('every sea has 4 missions and a relic', () => {
    for (const sea of SEAS) {
      expect(sea.missions).toHaveLength(4);
      expect(sea.relic).toBeTruthy();
    }
  });
});

describe('progress labels', () => {
  it('reads like what the player did', async () => {
    const { progressLabel } = await import('../src/core/goals');
    expect(progressLabel({ text: 'Catch 3 fish', progress: [2, 3] })).toBe('Caught 2/3');
    expect(progressLabel({ text: 'Land 3 fresh catches (★★+)', progress: [1, 3] })).toBe('Landed 1/3');
    expect(progressLabel({ text: 'Brew a Fine sauce (22°N+)', progress: [0, 1] })).toBe('Brewed 0/1');
    expect(progressLabel({ text: 'Sail somewhere new', progress: [0, 1] })).toBe('Done 0/1');
  });
});
