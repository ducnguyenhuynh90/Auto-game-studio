import { describe, expect, it } from 'vitest';
import { SEAS } from '../src/core/seas';
import { CAST, MISSION_STORY, SCENES, markSeen, pendingScene } from '../src/core/story';
import { newState } from '../src/core/state';

describe('story', () => {
  it('opens with the intro, once', () => {
    const s = newState();
    expect(pendingScene(s, 'village')!.id).toBe('intro');
    markSeen(s, 'intro');
    expect(pendingScene(s, 'village')).toBeNull();
  });

  it('chapters follow progress: relic → village scene, new sea → fishing scene', () => {
    const s = newState();
    s.stats.casts = 5;
    s.relics.push('turtle');
    expect(pendingScene(s, 'village')!.id).toBe('done_lagoon');
    s.sea = 'reef';
    expect(pendingScene(s, 'fishing')!.id).toBe('arrive_reef');
  });

  it('every mission has a giver and a reason; every speaker exists', () => {
    for (const sea of SEAS) for (const m of sea.missions) expect(MISSION_STORY[m.id], m.id).toBeDefined();
    for (const sc of SCENES) for (const l of sc.lines) expect(CAST[l.who]).toBeDefined();
  });

  it('scenes stay mobile-short (≤ 6 lines, ≤ 90 chars)', () => {
    for (const sc of SCENES) {
      expect(sc.lines.length, sc.id).toBeLessThanOrEqual(6);
      for (const l of sc.lines) expect(l.text.length, `${sc.id}: ${l.text}`).toBeLessThanOrEqual(90);
    }
  });
});
