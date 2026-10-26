import { describe, expect, it } from 'vitest';
import { AWARD_ENTRIES, CAREER, STARTING_TITLE, careerLock, enterAwards, careerTitle, checkCareer, nextCareerGoal, stageFor, worldChampion } from '../src/core/career';
import { GOALS, goalPair } from '../src/core/goals';
import { BUILDINGS_BY_ID, placeProblem } from '../src/core/island';
import { newState } from '../src/core/state';

/** Satisfies every goal of stage i by editing state the way play would. */
function finishStage1(s: ReturnType<typeof newState>) {
  s.island.buildings.push({ tile: 1, id: 'brewhouse', level: 1 }, { tile: 2, id: 'saltfield', level: 1 });
  s.island.staff.push({ id: 1, role: 'brewer', level: 1, tile: 1 } as never);
  s.island.made.jars = 3;
}

describe('Road to the World’s Best Fish Sauce', () => {
  it('is 7 stages of 4 goals, with unique ids and real buildings to unlock', () => {
    expect(CAREER.length).toBe(7);
    const ids = CAREER.flatMap((st) => st.goals.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const st of CAREER) {
      expect(st.goals.length).toBe(4);
      for (const u of st.unlocks) expect(BUILDINGS_BY_ID[u.building]).toBeTruthy();
    }
  });

  it('a new player is a Little Fisher: the shop and the Tour Office wait for fame', () => {
    const s = newState();
    expect(careerTitle(s)).toBe(STARTING_TITLE);
    expect(careerLock(s, 'brewhouse')).toBeNull();
    expect(careerLock(s, 'shop')).toMatch(/Village Mắm Maker/);
    expect(stageFor('touroffice')).toBe(3);
    expect(careerLock(s, 'touroffice')).toMatch(/Famous on Phú Quốc/);
    s.coins = 99999;
    expect(placeProblem(s, s.island.owned[0], 'touroffice')).toMatch(/Unlocks when/);
  });

  it('finishing a stage pays its reward, grants the title and unlocks its buildings', () => {
    const s = newState();
    finishStage1(s);
    const coins = s.coins;
    const ups = checkCareer(s);
    expect(ups.map((u) => u.stage.title)).toEqual(['Village Mắm Maker']);
    expect(s.coins).toBe(coins + CAREER[0].reward.coins);
    expect(careerTitle(s)).toBe('Village Mắm Maker');
    expect(careerLock(s, 'shop')).toBeNull();
    expect(checkCareer(s)).toEqual([]); // paid once
  });

  it('a goal stays done once reached, even if the number dips later', () => {
    const s = newState();
    s.career = { stage: 2, done: [] };
    s.island.ledger = { income: 0, wages: 0, upkeep: 0, incomeRate: 250 };
    checkCareer(s);
    s.island.ledger.incomeRate = 20;
    expect(nextCareerGoal(s)?.id).not.toBe('c3_income');
  });

  it('the stage that makes you famous on Phú Quốc brings a free hire with the Tour Office', () => {
    expect(CAREER[2].reward.freeHire).toBe(true);
    expect(CAREER[2].unlocks.map((u) => u.building)).toContain('touroffice');
  });

  it('after the tutorial the banner follows the road; during it, the tutorial leads', () => {
    const s = newState();
    expect(goalPair(s).current?.chapter).toBe('Tutorial');
    s.goalsDone = GOALS.map((g) => g.id);
    const cur = goalPair(s).current!;
    expect(cur.chapter).toBe('Stage 1/7 · Village Mắm Maker');
    expect(cur.id).toBe('c1_brew');
  });

  it('an old save that already did it all collects every stage up to where it stands', () => {
    const s = newState();
    finishStage1(s);
    s.island.staff.push({ id: 2, role: 'seller', level: 1, tile: 3 } as never);
    s.brand = { level: 1, rep: 60 };
    s.cellar = { classic: 23 };
    const ups = checkCareer(s);
    expect(ups.map((u) => u.index)).toEqual([0, 1]);
    expect(careerTitle(s)).toBe('A Name on the Bottle');
    expect(worldChampion(s)).toBe(false);
  });

  it('the finale: three of your own Legendary bottles, entered one by one, win the title', () => {
    const s = newState();
    s.career = { stage: 6, done: CAREER[6].goals.filter((g) => g.id !== 'c7_awards').map((g) => g.id) };
    expect(enterAwards(s)).toBeNull(); // nothing good enough on the shelf
    s.shelf.push({ uid: 900, recipe: 'reef', degrees: 39.9, agingLevel: 3 }, { uid: 901, recipe: 'reef', degrees: 44, agingLevel: 3, auto: true });
    expect(enterAwards(s)).toBeNull(); // 39.9 is not Legendary; staff bottles are not yours to enter
    for (let i = 0; i < AWARD_ENTRIES; i++) s.shelf.push({ uid: 910 + i, recipe: 'abyss', degrees: 41 + i, agingLevel: 3 });
    expect(enterAwards(s)).toBe(43); // the best goes first
    enterAwards(s);
    enterAwards(s);
    expect(enterAwards(s)).toBeNull();
    expect(checkCareer(s).map((u) => u.stage.title)).toEqual(['World’s Best Fish Sauce']);
    expect(worldChampion(s)).toBe(true);
    expect(careerTitle(s)).toBe('World’s Best Fish Sauce');
  });
});
