import { describe, expect, it } from 'vitest';
import { LEVELS, simulate, won, type ActionId } from '../src/sim';
import { DISCOVERIES, SUBJECTS, events, why } from '../src/explain';
import { dominantActions, minimalWinners, solve } from '../src/solver';

const [frogs, dry] = LEVELS;
const end = (lv = frogs, a: ActionId[] = [], seed = 1) => simulate(lv, seed, a).snaps.at(-1)!;

describe('determinism (GDD 15.4 #2)', () => {
  it('same seed + same actions → same outcome, regardless of action order', () => {
    const a = simulate(frogs, 7, ['reeds', 'logs']);
    const b = simulate(frogs, 7, ['logs', 'reeds']);
    expect(JSON.stringify(a.snaps)).toBe(JSON.stringify(b.snaps));
  });
  it('different weather seeds give different, bounded outcomes', () => {
    const x = end(frogs, ['reeds', 'logs'], 1), y = end(frogs, ['reeds', 'logs'], 2);
    expect(x.frogs).not.toBe(y.frogs);
  });
  it('runs 10 years on 200 seeds without NaN or runaway values (GDD 15.4 #1)', () => {
    const long = { ...frogs, years: 10 };
    for (let s = 1; s <= 200; s++)
      for (const a of [[], ['reeds', 'logs'], ['feedFish', 'removeFish', 'shade']] as ActionId[][])
        for (const snap of simulate(long, s, a).snaps)
          for (const v of Object.values(snap)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('level design gates (solver)', () => {
  for (const lv of LEVELS) {
    it(`${lv.id}: at least 2 different winning strategies and no dominant action`, () => {
      const res = solve(lv, 30);
      expect(minimalWinners(res).length).toBeGreaterThanOrEqual(2);
      expect(dominantActions(res)).toEqual([]);
    });
    it(`${lv.id}: doing nothing loses`, () => {
      expect(won(simulate(lv, 1, []))).toBe(false);
    });
  }
  it('context matters: shade is in no level-1 winner but in a level-2 winner', () => {
    const w1 = minimalWinners(solve(frogs, 30)).flatMap((r) => r.actions);
    const w2 = minimalWinners(solve(dry, 30)).flatMap((r) => r.actions);
    expect(w1).not.toContain('shade');
    expect(w2).toContain('shade');
  });
});

describe('causal chains (GDD 15.4 #3: at least 3 observable)', () => {
  it('fish → tadpoles: reeds give tadpoles refuge and more froglets', () => {
    const base = simulate(frogs, 1, []), reeds = simulate(frogs, 1, ['reeds']);
    expect(Math.max(...reeds.snaps.map((s) => s.refuge))).toBeGreaterThan(Math.max(...base.snaps.map((s) => s.refuge)));
    expect(end(frogs, ['reeds']).frogs).toBeGreaterThan(end(frogs, []).frogs);
  });
  it('fewer fish → more mosquitoes (side effect)', () => {
    const peak = (a: ActionId[]) => Math.max(...simulate(frogs, 1, a).snaps.map((s) => s.mosquito));
    expect(peak(['removeFish'])).toBeGreaterThan(peak([]));
  });
  it('feeding fish → nutrients → algae → murkier water', () => {
    expect(end(frogs, ['feedFish']).clarity).toBeLessThan(end(frogs, []).clarity);
  });
  it('releasing frogs alone does not fix the cause', () => {
    expect(end(frogs, ['addFrogs']).frogs).toBeLessThan(30);
  });
  it('shade slows drying in the dry level', () => {
    const dryMax = (a: ActionId[]) => Math.max(...simulate(dry, 1, a).snaps.map((s) => s.shallowDry));
    expect(dryMax(['shade'])).toBeLessThan(dryMax([]));
  });
});

describe('explanations', () => {
  it('every subject explains every step, and the top frog cause with no action is fish', () => {
    const run = simulate(frogs, 1, []);
    for (let i = 0; i < run.snaps.length; i++)
      for (const s of SUBJECTS) {
        const w = why(run, i, s.id);
        expect(w.headline.length).toBeGreaterThan(0);
        for (const c of w.causes) expect(Number.isFinite(c.share)).toBe(true);
      }
    expect(why(run, 8, 'frogs').causes[0].label).toMatch(/cá/);
  });
  it('event log always ends with the outcome', () => {
    const ev = events(simulate(frogs, 1, ['reeds', 'logs']));
    expect(ev.at(-1)!.text).toMatch(/Đạt mọi mục tiêu/);
  });
  it('every discovery can be unlocked by some action set', () => {
    const sets: ActionId[][] = [[], ['addFrogs'], ['removeFish'], ['feedFish'], ['reeds', 'logs'], ['reeds', 'removeFish']];
    for (const d of DISCOVERIES) {
      const ok = LEVELS.some((lv) => [...sets, ['shade', 'reeds', 'logs'] as ActionId[]].some((a) => d.test(simulate(lv, 1, a))));
      expect(ok, d.id).toBe(true);
    }
  });
});
