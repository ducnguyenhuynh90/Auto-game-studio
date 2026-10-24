import { describe, expect, it } from 'vitest';
import { applyEvent, emptySummary } from '../src/core/playsummary';

const ev = (e: string, t: number, p?: Record<string, string | number | boolean>) => ({ e, t, sid: 's', iid: 'i', p });

describe('play summary', () => {
  it('folds events into funnel, counts, sessions and losses', () => {
    const s = emptySummary('i', 0);
    applyEvent(s, ev('session_start', 1000));
    applyEvent(s, ev('funnel', 2000, { step: 'first_cast', sec: 2 }));
    applyEvent(s, ev('funnel', 3000, { step: 'first_cast', sec: 99 })); // first value wins
    applyEvent(s, ev('fish_lost', 4000, { reason: 'snapped' }));
    applyEvent(s, ev('catch', 5000, { species: 'anchovy', perfect: true }));
    applyEvent(s, ev('jar_open', 6000, { degrees: 27.5 }));
    applyEvent(s, ev('session_start', 90_000_000));
    expect(s.sessions).toEqual([1000, 90_000_000]);
    expect(s.funnel).toEqual({ first_cast: 2 });
    expect(s.lost).toEqual({ snapped: 1 });
    expect(s.species).toEqual({ anchovy: 1 });
    expect(s.perfect).toBe(1);
    expect(s.bestDegrees).toBe(27.5);
    expect(s.counts.session_start).toBe(2);
    // active time only counts short gaps (5 s of play here; the day-long gap is excluded)
    expect(s.activeSec).toBe(6);
  });
});
