import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/core/data';
import { VILLAGE_STAGES, currentStage, stages, villageStage } from '../src/core/evolution';
import { SEAS_BY_ID } from '../src/core/seas';
import { buyUpgrade, newState } from '../src/core/state';

describe('evolution roadmaps', () => {
  it('every upgrade line has one stage per level, with a stat line', () => {
    for (const u of UPGRADES) {
      const st = stages(u.id);
      expect(st).toHaveLength(u.levels.length);
      for (const s of st) expect(s.stat.length).toBeGreaterThan(0);
    }
  });

  it('buying an upgrade moves its roadmap forward', () => {
    const s = newState();
    s.coins = 1000;
    expect(currentStage(s, 'rod')).toBe(0);
    buyUpgrade(s, 'rod');
    expect(currentStage(s, 'rod')).toBe(1);
    expect(stages('rod')[1].stat).toMatch(/Green zone/);
  });

  it('the village evolves through its four stages as buildings are upgraded', () => {
    const s = newState();
    expect(villageStage(s)).toBe(0);
    s.upgrades = { ...s.upgrades, jars: 3, salt: 2, stall: 2, boat: 3 };
    expect(villageStage(s)).toBe(VILLAGE_STAGES.length - 1);
  });

  it('Phú Quốc is the first island', () => {
    expect(SEAS_BY_ID.lagoon.name).toBe('Phú Quốc');
    expect(stages('boat')[0].desc).toMatch(/Phú Quốc/);
  });
});
