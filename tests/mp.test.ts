import { describe, expect, it } from 'vitest';
import { MP_MAX_EVENTS, mpBodies, mpUrl } from '../src/analytics/mp';

describe('GA Measurement Protocol bodies (React Native app)', () => {
  const hit = (i: number) => ({ name: `e${i}`, params: { n: i }, at: 1_700_000_000_000 + i });

  it('splits into requests of at most 25 events and keeps their order', () => {
    const bodies = mpBodies('iid1', 42, Array.from({ length: 60 }, (_, i) => hit(i)), {});
    expect(bodies.map((b) => b.events.length)).toEqual([MP_MAX_EVENTS, MP_MAX_EVENTS, 10]);
    expect(bodies[2].events[9].name).toBe('e59');
  });

  it('gives every event a session and engagement time, and the time it happened', () => {
    const [b] = mpBodies('iid1', 42, [hit(1)], { captain_level: 3, sea: 'reef' });
    expect(b.client_id).toBe('iid1');
    expect(b.events[0].params).toEqual({ n: 1, session_id: 42, engagement_time_msec: 100 });
    expect(b.events[0].timestamp_micros).toBe((1_700_000_000_000 + 1) * 1000);
    expect(b.user_properties).toEqual({ captain_level: { value: 3 }, sea: { value: 'reef' } });
  });

  it('sends nothing for no hits', () => {
    expect(mpBodies('x', 1, [], {})).toEqual([]);
  });

  it('builds the collect and debug URLs', () => {
    expect(mpUrl('G-AB C', 's/1')).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-AB%20C&api_secret=s%2F1');
    expect(mpUrl('G-1', 'k', true)).toContain('/debug/mp/collect');
  });
});
