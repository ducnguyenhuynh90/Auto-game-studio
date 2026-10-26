import { describe, expect, it } from 'vitest';
import { gaName, gaParams, toGa } from '../src/analytics/gamap';
import { FUNNEL_STEPS } from '../src/core/analytics';

const ev = (e: string, p?: Record<string, string | number | boolean>) => ({ e, t: 0, sid: 's', iid: 'i', p });

describe('Google Analytics mapping', () => {
  it('keeps names GA-safe (≤40 chars, no reserved prefixes) and params within limits', () => {
    expect(gaName('first_catch')).toBe('first_catch');
    expect(gaName('Some Event!')).toBe('some_event_');
    expect(gaName('ga_thing')).toBe('mam_ga_thing');
    expect(gaName('x'.repeat(60))).toHaveLength(40);
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'v'.repeat(300)]));
    const p = gaParams(many);
    expect(Object.keys(p).length).toBeLessThanOrEqual(25);
    expect(String(Object.values(p)[0]).length).toBe(100);
  });

  it('every funnel step becomes its own event (for GA funnel explorations)', () => {
    for (const step of FUNNEL_STEPS) {
      const hits = toGa(ev('funnel', { step, sec: 12 }));
      expect(hits.map((h) => h.name)).toEqual(['funnel', step]);
      expect(hits[1].params.sec).toBe(12);
    }
  });

  it('maps game moments onto GA’s recommended game events', () => {
    expect(toGa(ev('level_up', { level: 5 }))[1]).toEqual({ name: 'level_up', params: { level: 5, character: 'captain' } });
    expect(toGa(ev('screen', { name: 'market' }))[1].name).toBe('page_view');
    expect(toGa(ev('career_stage', { stage: 3, title: 'Famous on Phú Quốc' }))[1].name).toBe('unlock_achievement');
    expect(toGa(ev('puzzle_end', { section: 'salt', level: 4, stars: 2 }))[1]).toEqual({ name: 'level_end', params: { level_name: 'salt_4', success: true } });
    expect(toGa(ev('sell_product', { price: 97 }))[1].params.value).toBe(97);
    expect(toGa(ev('staff_hire', { role: 'brewer', cost: 128 }))[1]).toMatchObject({ name: 'spend_virtual_currency', params: { value: 128, item_name: 'brewer' } });
    expect(toGa(ev('goal_complete', { goal: 'gear1' }))[1].name).toBe('tutorial_complete');
    // anything else is forwarded as itself
    expect(toGa(ev('dog_find', { kind: 'shell' }))).toEqual([{ name: 'dog_find', params: { kind: 'shell' } }]);
  });
});
