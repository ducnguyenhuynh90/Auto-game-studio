import { describe, expect, it } from 'vitest';
import { explain } from '../src/core/help';
import { build, hire, terrain } from '../src/core/island';
import { hireProblem, jobRate, teamCap } from '../src/core/team';
import { newState } from '../src/core/state';

describe('your team grows with fame', () => {
  it('starts with room for 2, +2 per Road stage, +1 per brand stage', () => {
    const s = newState();
    expect(teamCap(s)).toBe(2);
    s.career = { stage: 2, done: [] };
    s.brand = { level: 1, rep: 0 };
    expect(teamCap(s)).toBe(7);
  });

  it('a full team blocks hiring, and says how to grow it', () => {
    const s = newState();
    s.coins = 99999;
    const land = s.island.owned.filter((t) => terrain(t) === 'g');
    build(s, land[0], 'brewhouse');
    s.island.buildings[0].level = 3; // room for 3 at the building
    expect(hire(s, land[0])).toBeTruthy();
    expect(hire(s, land[0])).toBeTruthy();
    expect(hireProblem(s, 'brewer')).toBe('Team full (2/2)');
    expect(hire(s, land[0])).toBeNull();
    const h = explain(s, hireProblem(s, 'brewer')!);
    expect(h.title).toBe('Your team is full');
    expect(h.lines.join(' ')).toMatch(/Village Mắm Maker/);
  });

  it('no building yet: says which one to build', () => {
    const s = newState();
    expect(hireProblem(s, 'fisher')).toBe('Build a Fishing Dock first');
    expect(explain(s, 'Build a Fishing Dock first').title).toMatch(/Fishing Dock/);
  });

  it('job rates read in plain numbers and rise with training', () => {
    expect(jobRate('fisher', 1)).toBe('48 fish/h');
    expect(parseInt(jobRate('fisher', 3))).toBeGreaterThan(48);
  });
});
